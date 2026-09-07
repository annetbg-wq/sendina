import {z} from 'zod';
import {complete,aiReady,type AiConfig} from './ai';
import {search,searchReady,emailsIn,type Hit,type SearchConfig} from './search';
import {findOrganisations,evidenced,placesReady,domainOf,type Organisation,type PlacesConfig} from './places';

export type Candidate={
 name:string;company:string;role:string;country:string;
 email:string|null;source:string|null;evidence:string;
 basis:string;reason:string;confidence:number;
 verification:'verified'|'unverified';origin:'search'|'proposal'|'organisations';
};
export type FindResult={mode:'organisations'|'search'|'proposal';profile:string;candidates:Candidate[];queries:string[];notes:string[];organisations?:{name:string;website:string;country:string;fit:number;why:string}[]};

const candidateSchema=z.object({
 name:z.string().min(1).max(120),company:z.string().min(1).max(160),role:z.string().min(1).max(160),
 country:z.string().min(1).max(80),sourceUrl:z.string().max(500).nullable(),email:z.string().max(160).nullable(),
 evidence:z.string().min(1).max(600),reason:z.string().min(10).max(600),basis:z.string().min(3).max(300),
 confidence:z.number().min(0).max(100)
});
const planSchema=z.object({profile:z.string().min(10).max(1200),queries:z.array(z.string().min(3).max(200)).min(1).max(6)});
const extractSchema=z.object({candidates:z.array(candidateSchema).max(40)});

const rules=`Ты подбираешь адресатов для делового письма. Жёсткие правила:
— Никогда не выдумывай адрес электронной почты. Если адреса нет в предоставленном тексте, верни email: null.
— Никогда не выдумывай ссылку. Поле sourceUrl должно быть ровно одной из переданных ссылок или null.
— evidence — дословная цитата из переданного текста, подтверждающая соответствие цели.
— reason — конкретная причина написать именно этому адресату, без общих фраз.
— basis — правовое основание для обращения.
— confidence — насколько ты уверен в соответствии цели, 0–100.
Отвечай только JSON.`;

const brief=(c:{name:string;market:string;goal:string;context:string;event:string})=>
 `Цель: ${c.goal}\nРынок: ${c.market}\nКампания: ${c.name}\nКонтекст продукта: ${c.context}\nЦелевое событие: ${c.event}`;

/** Search mode: every recipient cites a real result, and an address survives only if it occurs in that result. */
async function fromSearch(campaign:any,count:number,config:ResearchConfig,signal?:AbortSignal):Promise<FindResult>{
 const plan=await complete({name:'search_plan',schema:planSchema,signal,config,
  system:'Ты составляешь поисковые запросы для поиска организаций и ролей. Отвечай только JSON.',
  user:`${brief(campaign)}\n\nОпиши профиль целевого клиента и составь до 5 поисковых запросов, которые найдут конкретные организации и контактные страницы.`});
 const hits:Hit[]=[];
 const notes:string[]=[];
 for(const q of plan.queries.slice(0,5)){
  try{for(const h of await search(q,config,8,signal))if(h.url&&!hits.some(x=>x.url===h.url))hits.push(h);}
  catch(e:any){notes.push(`Запрос «${q}»: ${e.message}`);}
 }
 if(!hits.length)throw Error('Поиск не вернул результатов. Проверьте ключ поискового API.');
 const corpus=hits.map((h,i)=>`[${i+1}] ${h.title}\n${h.url}\n${h.snippet}`).join('\n\n');
 const found=await complete({name:'candidates',schema:extractSchema,signal,config,system:rules,
  user:`${brief(campaign)}\n\nНиже результаты веб-поиска. Отбери до ${count} адресатов, подходящих цели.\n\n${corpus}`});
 const {candidates,notes:checks}=keepEvidenced(found.candidates,hits,'search');
 notes.push(...checks);
 return {mode:'search',profile:plan.profile,queries:plan.queries,candidates,notes};
}

/** The one mechanical guard, shared by every research path: a source the search never returned is
    dropped, and an address that does not occur in that source is removed rather than believed. */
function keepEvidenced(found:any[],hits:Hit[],origin:Candidate['origin']){
 const urls=new Set(hits.map(h=>h.url));
 const text=(url:string)=>hits.filter(h=>h.url===url).map(h=>`${h.title} ${h.url} ${h.snippet}`).join(' ');
 const candidates:Candidate[]=[];
 const notes:string[]=[];
 let droppedSource=0,droppedEmail=0;
 for(const c of found){
  if(!c.sourceUrl||!urls.has(c.sourceUrl)){droppedSource++;continue;}
  const email=c.email?.trim().toLowerCase()||null;
  const real=email&&emailsIn(text(c.sourceUrl)).includes(email)?email:null;
  if(email&&!real)droppedEmail++;
  candidates.push({name:c.name,company:c.company,role:c.role,country:c.country,email:real,source:c.sourceUrl,
   evidence:c.evidence,basis:c.basis,reason:c.reason,confidence:c.confidence,
   verification:real?'verified':'unverified',origin});
 }
 if(droppedSource)notes.push(`Отклонено кандидатов с несуществующей ссылкой: ${droppedSource}.`);
 if(droppedEmail)notes.push(`Адресов, не найденных в источнике, снято: ${droppedEmail}.`);
 return {candidates,notes};
}

const organisationPlan=z.object({profile:z.string().min(10).max(1200),
 queries:z.array(z.string().min(3).max(200)).min(1).max(4),
 roles:z.array(z.string().min(2).max(80)).min(1).max(6)});
const fitSchema=z.object({organisations:z.array(z.object({
 name:z.string().min(1).max(200),fit:z.number().min(0).max(100),why:z.string().min(5).max(400)})).max(40)});

/** Organisations first: real companies, then their public pages, then the person and the address.
    Every step narrows a list that started from something that verifiably exists. */
async function fromOrganisations(campaign:any,count:number,config:ResearchConfig,signal?:AbortSignal):Promise<FindResult>{
 const notes:string[]=[];
 const plan=await complete({name:'organisation_plan',schema:organisationPlan,signal,config,
  system:'Ты описываешь профиль целевого клиента и составляешь запросы для поиска организаций. Отвечай только JSON.',
  user:`${brief(campaign)}\n\nОпиши профиль целевого клиента, составь до 4 запросов для поиска подходящих организаций и перечисли роли, с которыми стоит связаться.`});

 // 1. Real organisations.
 const organisations:Organisation[]=[];
 for(const query of plan.queries.slice(0,4)){
  try{for(const o of await findOrganisations(query,config,10,signal))
   if(!organisations.some(x=>x.name===o.name&&x.website===o.website))organisations.push(o);}
  catch(e:any){notes.push(`Поиск организаций «${query}»: ${e.message}`);}
 }
 const usable=evidenced(organisations);
 if(!usable.length)throw Error('Поиск организаций не дал компаний с публичным сайтом.');
 notes.push(`Найдено организаций: ${organisations.length}, с публичным сайтом: ${usable.length}.`);

 // 2. How well each one matches the goal, judged from what the search returned.
 const scored=await complete({name:'organisation_fit',schema:fitSchema,signal,config,
  system:'Ты оцениваешь соответствие организаций цели кампании. Отвечай только JSON.',
  user:`${brief(campaign)}\n\nОцени соответствие каждой организации от 0 до 100 и коротко объясни почему.\n\n`+
   usable.map((o,i)=>`[${i+1}] ${o.name} — ${o.website} — ${o.address}`).join('\n')});
 const fitOf=(name:string)=>scored.organisations.find(x=>x.name.toLowerCase()===name.toLowerCase());
 const ranked=usable.map(o=>({organisation:o,fit:fitOf(o.name)?.fit??0,why:fitOf(o.name)?.why??''}))
  .filter(x=>x.fit>0).sort((a,b)=>b.fit-a.fit).slice(0,Math.max(count,10));
 if(!ranked.length)throw Error('Ни одна найденная организация не соответствует цели кампании.');

 // 3. Public pages of those organisations: the role, the person and any published address.
 const hits:Hit[]=[];
 if(searchReady(config)){
  for(const {organisation} of ranked.slice(0,count)){
   const domain=domainOf(organisation.website);
   const query=`${domain} ${plan.roles.slice(0,2).join(' OR ')} контакты email`;
   try{for(const h of await search(query,config,4,signal))
    if(h.url&&!hits.some(x=>x.url===h.url))hits.push(h);}
   catch(e:any){notes.push(`Поиск контактов ${domain}: ${e.message}`);}
  }
 }else notes.push('Веб-поиск не подключён: адреса на страницах организаций не искались, кандидаты останутся неподтверждёнными.');

 // The organisation website is itself a real source, so it counts alongside the search results.
 for(const {organisation} of ranked)
  if(!hits.some(h=>h.url===organisation.website))
   hits.push({title:organisation.name,url:organisation.website,snippet:`${organisation.name}. ${organisation.address}`});

 const corpus=hits.map((h,i)=>`[${i+1}] ${h.title}\n${h.url}\n${h.snippet}`).join('\n\n');
 const found=await complete({name:'organisation_candidates',schema:extractSchema,signal,config,system:rules,
  user:`${brief(campaign)}\n\nРоли, которые нас интересуют: ${plan.roles.join(', ')}.\n\n`+
   `Ниже страницы найденных организаций. Отбери до ${count} адресатов.\n\n${corpus}`});
 const {candidates,notes:checks}=keepEvidenced(found.candidates,hits,'organisations');
 notes.push(...checks);
 return {mode:'organisations',profile:plan.profile,queries:plan.queries,candidates,notes,
  organisations:ranked.map(r=>({name:r.organisation.name,website:r.organisation.website,
   country:r.organisation.country,fit:r.fit,why:r.why}))};
}

/** Proposal mode: no search key, so nothing may claim an address or a source. */
async function fromProposal(campaign:any,count:number,config:ResearchConfig,signal?:AbortSignal):Promise<FindResult>{
 const found=await complete({name:'proposed_candidates',schema:extractSchema,signal,config,
  system:`${rules}\nПоиск недоступен. Поля sourceUrl и email всегда null.`,
  user:`${brief(campaign)}\n\nПредложи до ${count} организаций и ролей, которым имеет смысл написать. Для каждой — доказуемое обоснование соответствия цели.`});
 return {mode:'proposal',profile:'',queries:[],notes:['Поисковый API не подключён: кандидаты не подтверждены и не могут попасть в отправку до проверки.'],
  candidates:found.candidates.map(c=>({name:c.name,company:c.company,role:c.role,country:c.country,email:null,source:null,
   evidence:c.evidence,basis:c.basis,reason:c.reason,confidence:c.confidence,verification:'unverified' as const,origin:'proposal' as const}))};
}

export type ResearchConfig=AiConfig&SearchConfig&PlacesConfig;
export type Mode='organisations'|'search'|'proposal';
/** Automatic picks the strongest evidence available, never a weaker one silently. */
export const resolveMode=(setting:string,searchAvailable:boolean,organisationsAvailable=false):Mode=>
 setting==='organisations'?'organisations':setting==='search'?'search':setting==='proposal'?'proposal'
 :organisationsAvailable?'organisations':searchAvailable?'search':'proposal';

export async function findRecipients(campaign:any,setting:string,count:number,config:ResearchConfig,signal?:AbortSignal):Promise<FindResult>{
 // This path researches, so it needs a model. A caller that has already done the research does
 // not: `propose_recipients` stores candidates with their source and evidence and asks for none.
 if(!aiReady(config))throw Error('Модель не подключена: этот поиск выполняет сама Sendina. '
  +'Если исследование уже проведено на вашей стороне, сохраните кандидатов через propose_recipients — модель для этого не нужна. '
  +'Иначе обратитесь к администратору Sendina.');
 const mode=resolveMode(setting,searchReady(config),placesReady(config));
 if(mode==='search'&&!searchReady(config))throw Error('Выбран поиск в интернете, но он не подключён.');
 if(mode==='organisations'&&!placesReady(config))throw Error('Выбран поиск организаций, но он не подключён.');
 const result=mode==='organisations'?await fromOrganisations(campaign,count,config,signal)
  :mode==='search'?await fromSearch(campaign,count,config,signal)
  :await fromProposal(campaign,count,config,signal);
 return {...result,candidates:result.candidates.slice(0,count)};
}
