import {z} from 'zod';
import {complete,aiReady,type AiConfig} from './ai';
import {search,searchReady,emailsIn,type Hit,type SearchConfig} from './search';

export type Candidate={
 name:string;company:string;role:string;country:string;
 email:string|null;source:string|null;evidence:string;
 basis:string;reason:string;confidence:number;
 verification:'verified'|'unverified';origin:'search'|'proposal';
};
export type FindResult={mode:'search'|'proposal';profile:string;candidates:Candidate[];queries:string[];notes:string[]};

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
 const urls=new Set(hits.map(h=>h.url));
 const text=(url:string)=>hits.filter(h=>h.url===url).map(h=>`${h.title} ${h.url} ${h.snippet}`).join(' ');
 const candidates:Candidate[]=[];
 let droppedSource=0,droppedEmail=0;
 for(const c of found.candidates){
  if(!c.sourceUrl||!urls.has(c.sourceUrl)){droppedSource++;continue;}
  const email=c.email?.trim().toLowerCase()||null;
  const real=email&&emailsIn(text(c.sourceUrl)).includes(email)?email:null;
  if(email&&!real)droppedEmail++;
  candidates.push({name:c.name,company:c.company,role:c.role,country:c.country,email:real,source:c.sourceUrl,
   evidence:c.evidence,basis:c.basis,reason:c.reason,confidence:c.confidence,
   verification:real?'verified':'unverified',origin:'search'});
 }
 if(droppedSource)notes.push(`Отклонено кандидатов с несуществующей ссылкой: ${droppedSource}.`);
 if(droppedEmail)notes.push(`Адресов, не найденных в источнике, снято: ${droppedEmail}.`);
 return {mode:'search',profile:plan.profile,queries:plan.queries,candidates,notes};
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

export type ResearchConfig=AiConfig&SearchConfig;
export const resolveMode=(setting:string,searchAvailable:boolean):'search'|'proposal'=>
 setting==='search'?'search':setting==='proposal'?'proposal':searchAvailable?'search':'proposal';

export async function findRecipients(campaign:any,setting:string,count:number,config:ResearchConfig,signal?:AbortSignal):Promise<FindResult>{
 if(!aiReady(config))throw Error('Модель не подключена. Укажите ключ OpenAI в настройках аккаунта.');
 const mode=resolveMode(setting,searchReady(config));
 if(mode==='search'&&!searchReady(config))throw Error('Выбран поиск в интернете, но поисковый API не настроен в аккаунте.');
 const result=mode==='search'?await fromSearch(campaign,count,config,signal):await fromProposal(campaign,count,config,signal);
 return {...result,candidates:result.candidates.slice(0,count)};
}
