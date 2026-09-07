import {randomUUID} from 'node:crypto';
import {resolveTxt} from 'node:dns/promises';
import {z} from 'zod';
import {read,change,pool} from './store';
import type {Ctx} from './context';
import {accountSettings,maskSettings} from './accountsettings';
import {infrastructure} from './resolve';
import {placesReady,placesProvider} from './places';
import {policy,isBulk} from './policy';
import {findRecipients,resolveMode} from './recipients';
import {aiReady,aiModel,complete} from './ai';
import {searchReady,searchProvider} from './search';
import {noDns,box,anywhere,demoSeed,seed as seedState,type State,type Research} from './seed';
import {domainReadiness,mailboxReadiness} from './readiness';
import {stepLabels,type StepName} from './mailboxes';
import {countries,regions,locationLabel,normalizeLocation} from './geo';
import {researchOpportunities,researchMarkets,campaignDraft,researchFromInput,importedItemSchema,RESULTS} from './research';
import {threads as buildThreads,outcomes} from './threads';
import {analytics as buildAnalytics} from './analytics';

/** Every country the selector offers. A campaign is not limited to this list — it may name a
    region, a city, several countries, or leave the choice to Sendina — but a recommendation has
    to pick something nameable, and this is the set it picks from. */
export const markets=countries.map(c=>c.ru);
const audit=(s:State,action:string)=>s.audit.unshift({id:randomUUID(),at:new Date().toISOString(),action});
const campaignOf=(s:State,id:string)=>{const c=s.campaigns.find(c=>c.id===id);if(!c)throw Error('Кампания не найдена');return c;};

/** A researched card, whether it is still in the current search results or already kept.
    One lookup for both, so "создать тест" works the same from a fresh result and a favourite. */
const findResearch=(s:State,id:string):Research=>{
 const item=[...(s.research.opportunities?.items??[]),...(s.research.markets?.items??[]),...s.favourites]
  .find(x=>x.id===id);
 if(!item)throw Error('Возможность не найдена. Выполните поиск заново или откройте избранное.');
 return item;
};

/** Addresses of this campaign that also sit in another campaign of the workspace.

    A proposed recipient has no address yet, and two of those are not the same person written
    twice — they are two organisations nobody has found an address for. Counting them as repeats
    blocked every proposal with DUPLICATE_RECIPIENT, which hid the real reason it could not be
    sent to: that its source is not verified. An absent address is not an address. */
export function duplicateEmails(s:State,campaignId:string){
 const mine=s.contacts.filter(c=>c.campaignId===campaignId&&c.email);
 const elsewhere=new Set(s.contacts.filter(c=>c.campaignId!==campaignId&&c.email).map(c=>c.email));
 const seen=new Set<string>(),repeated=new Set<string>();
 for(const c of mine){if(seen.has(c.email))repeated.add(c.email);seen.add(c.email);}
 return [...new Set([...mine.filter(c=>elsewhere.has(c.email)).map(c=>c.email),...repeated])];
}

/** The first domain that is genuinely ready to send: connected, test sent and DNS in place. */
const senderDomain=(s:State)=>s.domains.find(d=>domainReadiness(d,s.stopped).ready)??null;

const decide=(s:State,c:any,p:any,duplicates:string[],sender:any)=>policy({
 stopped:s.stopped,status:c.status,suppressed:s.suppressed.includes(p.email),
 replied:s.replies.some(r=>r.email===p.email&&r.campaignId===c.id),
 basis:p.basis??'',contactReason:p.reason??'',
 sourceVerified:p.verification==='verified',
 duplicate:duplicates.includes(p.email),
 control:(c.control??'confirm') as 'auto'|'confirm'|'manual',
 firstBatchApproved:Boolean(c.firstBatchApprovedAt),
 verified:Boolean(sender),used:sender?.used??0,limit:sender?.limit??0
});

/** A recipient with no specific reason gets bulk wording and is named as such. */
const compose=(c:any,p:any)=>isBulk(p.reason??'')
 ?{bulk:true,subject:c.name,text:`Здравствуйте!\n\n${c.context}\n\nЕсли тема интересна, ответьте на это письмо.\n\nЧтобы больше не получать писем, ответьте «отписаться».`}
 :{bulk:false,subject:c.name,text:`Здравствуйте, ${p.name}!\n\n${p.reason}\n\n${c.context}\n\nГотовы обсудить следующий шаг: ${c.event.toLowerCase()}?\n\nЕсли предложение неактуально, сообщите об этом — мы прекратим обращения.`};

const contactInput=z.object({email:z.email(),name:z.string().min(1),company:z.string().min(1),source:z.url(),basis:z.string().min(3),reason:z.string().min(10)});

export const schemas={
 /** A campaign may be told where to look either as a structured location or as the readable
     market label older clients and MCP already send. One of the two is enough. */
 createCampaign:z.object({name:z.string().min(3).max(150),market:z.string().min(1).optional(),
  location:z.any().optional(),goal:z.string().min(1),
  context:z.string().min(10).max(5000),event:z.string().min(1),
  control:z.enum(['auto','confirm','manual']).default('confirm')}),
 control:z.object({id:z.string().min(1),control:z.enum(['auto','confirm','manual'])}),
 approve:z.object({id:z.string().min(1)}),
 campaignId:z.object({id:z.string().min(1)}),
 setStatus:z.object({id:z.string().min(1),status:z.enum(['active','paused','draft'])}),
 stop:z.object({stopped:z.boolean()}),
 mailbox:z.object({email:z.email()}),
 domainCheck:z.object({id:z.string().min(1),selector:z.string().regex(/^[a-zA-Z0-9_-]{1,63}$/).default('default')}),
 importContacts:z.object({id:z.string().min(1),contacts:z.array(contactInput).min(1).max(1000)}),
 findRecipients:z.object({id:z.string().min(1),count:z.number().int().min(1).max(50).default(20),mode:z.enum(['auto','organisations','search','proposal']).optional()}),
 confirmRecipient:z.object({contactId:z.string().min(1),email:z.email(),source:z.url(),evidence:z.string().min(10)}),
 prepare:z.object({id:z.string().min(1),limit:z.number().int().min(1).max(50).default(5),
  /** A review happens before launch, so it asks what the rules would say once the campaign runs. */
  asIfRunning:z.boolean().default(false)}),
 reply:z.object({campaignId:z.string().min(1),email:z.email(),text:z.string().min(1),eventId:z.string().min(1),
  category:z.enum(['positive','neutral','objection','referral','later','unsubscribe','negative','automatic','bounce'])}),
 suppress:z.object({email:z.email()}),
 recipientMode:z.object({mode:z.enum(['auto','organisations','search','proposal'])}),
 researchOpportunities:z.object({location:z.any().optional(),industry:z.string().max(200).default(''),
  note:z.string().max(400).default('')}),
 researchMarkets:z.object({mode:z.enum(['country','niche','manual']),location:z.any().optional(),
  niche:z.string().max(200).default('')}),
 favourite:z.object({id:z.string().min(1)}),
 testFromResearch:z.object({id:z.string().min(1),control:z.enum(['auto','confirm','manual']).default('confirm')}),
 threadAction:z.object({email:z.email(),done:z.boolean().optional(),
  outcome:z.enum(['meeting','documents','interest','later','refused','unsubscribed','bounced','none','other']).optional()}),
 analytics:z.object({period:z.string().max(20).default('30d'),from:z.string().max(40).optional(),
  to:z.string().max(40).optional(),campaign:z.string().max(80).default('all')}),
 demo:z.object({enabled:z.boolean()}),
 /** A candidate somebody else researched. Same fields the internal search has to produce, so
     nothing reaches the store through a looser door than the model's own answers do. */
 proposeRecipients:z.object({id:z.string().min(1),
  candidates:z.array(z.object({
   name:z.string().min(1).max(120),company:z.string().min(1).max(160),role:z.string().max(160).default(''),
   country:z.string().max(80).default(''),
   email:z.email().nullable().optional(),
   source:z.url().max(500).nullable().optional(),
   evidence:z.string().min(10).max(600),basis:z.string().min(3).max(300),reason:z.string().min(10).max(600),
   confidence:z.number().min(0).max(100).default(50)})).min(1).max(200)}),
 saveResearch:z.object({kind:z.enum(['opportunity','market']),
  items:z.array(importedItemSchema).min(1).max(20),
  sources:z.array(z.object({title:z.string().max(200),url:z.url().max(500)})).max(6).default([]),
  replace:z.boolean().default(true)})
};

export const operations={
 state:(ctx:Ctx)=>read(ctx.accountId),

 capabilities:async(ctx:Ctx)=>{const s=await read(ctx.accountId);
  const config=await infrastructure(ctx.accountId);
  const own=await accountSettings(ctx.accountId);
  const setting=s.settings?.recipientMode??'auto';return {
  account:{email:ctx.email,role:ctx.role},
  ai:{ready:aiReady(config),model:aiReady(config)?aiModel(config):''},
  search:{ready:searchReady(config),provider:searchProvider(config)},
  organisations:{ready:placesReady(config),provider:placesProvider(config)},
  /** Which side supplies each capability, so nobody is asked for a key the platform already has. */
  provided:config.source,
  recipients:{setting,effective:resolveMode(setting,searchReady(config),placesReady(config))},
  connections:maskSettings(own),
  storage:{postgres:Boolean(pool),durable:Boolean(pool)},
  sendingEnabled:false};},

 /** Everything that decides whether a real message may leave, in one answer.

     Before a controlled live send somebody has to know which mailboxes exist, which one would be
     used, whether it is actually ready, and what is still in the way. That was spread across the
     mailbox status, the readiness rules and the capabilities call, so a connector had to assemble
     it and could assemble it wrongly. This reads the same rows those do and adds nothing. */
 senderStatus:async(ctx:Ctx)=>{const st=await read(ctx.accountId);
  const steps:StepName[]=['auth','testSend','imap','incoming'];
  const mailboxes=st.domains.flatMap((d:any)=>d.mailboxes.map((m:any)=>({
   email:m.email,domain:d.name,provider:m.provider,connection:m.connection,connectedAt:m.connectedAt??null,
   transport:m.transport?{smtp:m.transport.smtp,imap:m.transport.imap,label:m.transport.label}:null,
   readiness:mailboxReadiness(d,m,st.stopped),
   /** The last outcome of each of the four proofs, named as the screen names them. */
   checks:Object.fromEntries(steps.map(name=>[name,{
    step:stepLabels[name],status:m[name]?.status??'none',at:m[name]?.at??null,
    detail:m[name]?.detail??'',code:m[name]?.code??''}]))})));
  const sender=mailboxes.find((m:any)=>m.readiness.ready)??null;
  const domains=st.domains.map((d:any)=>({id:d.id,name:d.name,dns:d.dns,limit:d.limit,used:d.used,
   readiness:domainReadiness(d,st.stopped)}));
  return {
   stopped:st.stopped,
   /** Sending is not built yet, and this says so rather than letting a caller infer readiness. */
   sendingEnabled:false,
   sender:sender?{email:sender.email,domain:sender.domain,provider:sender.provider}:null,
   ready:Boolean(sender)&&!st.stopped,
   blockers:[...(st.stopped?['EMERGENCY_STOP']:[]),
    ...(mailboxes.length?[]:['NO_MAILBOX']),
    ...(sender?[]:mailboxes.flatMap((m:any)=>m.readiness.blockers))]
    .filter((b,i,all)=>all.indexOf(b)===i),
   mailboxes,domains};},

 dashboard:async(ctx:Ctx)=>{const s=await read(ctx.accountId);return {demo:s.demo,stopped:s.stopped,campaigns:s.campaigns.length,
  contacts:s.contacts.length,messages:s.messages.length,replies:s.replies.length,
  sent:s.campaigns.reduce((n,c)=>n+c.sent,0),positive:s.campaigns.reduce((n,c)=>n+c.positive,0),
  suppressed:s.suppressed.length,sendingEnabled:false};},

 getCampaign:async(ctx:Ctx,input:unknown)=>{const {id}=schemas.campaignId.parse(input);const s=await read(ctx.accountId);
  return {campaign:campaignOf(s,id),contacts:s.contacts.filter(c=>c.campaignId===id),
   messages:s.messages.filter(m=>m.campaignId===id),replies:s.replies.filter(r=>r.campaignId===id),
   duplicates:duplicateEmails(s,id)};},

 listCampaigns:async(ctx:Ctx)=>(await read(ctx.accountId)).campaigns,
 /** The current opportunity search and the kept favourites. A new search replaces the first
     and never touches the second, which is what makes the screen and MCP show the same six. */
 listOpportunities:async(ctx:Ctx)=>{const s=await read(ctx.accountId);
  return {results:s.research.opportunities?.items??[],at:s.research.opportunities?.at??null,
   input:s.research.opportunities?.input??null,
   favourites:s.favourites.filter(f=>f.kind==='opportunity')};},
 listMarkets:async(ctx:Ctx)=>{const s=await read(ctx.accountId);
  return {results:s.research.markets?.items??[],at:s.research.markets?.at??null,
   input:s.research.markets?.input??null,
   favourites:s.favourites.filter(f=>f.kind==='market')};},

 /** The one way a campaign is created, whichever screen or connector asked for it. */
 createCampaign:(ctx:Ctx,input:unknown)=>{const body=schemas.createCampaign.parse(input);
  // A structured location wins; a plain market name is read as one country, as before.
  const location=body.location!==undefined?normalizeLocation(body.location)
   :body.market?normalizeLocation({countries:[body.market]}):anywhere();
  const market=locationLabel(location);
  return change(ctx.accountId,s=>{const c={...body,market,location,id:randomUUID(),status:'draft',
    sent:0,positive:0,value:0,createdAt:new Date().toISOString(),
    firstBatchApprovedAt:null as string|null};
   s.campaigns.unshift(c);audit(s,`Создана кампания «${c.name}» (${market}, контроль: ${c.control})`);return c;});},

 setCampaignStatus:(ctx:Ctx,input:unknown)=>{const {id,status}=schemas.setStatus.parse(input);
  return change(ctx.accountId,s=>{const c=campaignOf(s,id);
   if(s.stopped&&status==='active')throw Error('Сначала отключите аварийную остановку');
   const duplicates=status==='active'?duplicateEmails(s,id):[];
   c.status=status;audit(s,`Кампания «${c.name}»: ${status}`);
   if(duplicates.length)audit(s,`Проверка повторов при продолжении «${c.name}»: ${duplicates.length}. Эти адресаты заблокированы правилами.`);
   return {campaign:c,duplicates};});},

 emergencyStop:(ctx:Ctx,input:unknown)=>{const {stopped}=schemas.stop.parse(input);
  return change(ctx.accountId,s=>{s.stopped=stopped;if(stopped)s.campaigns.forEach(c=>{if(c.status==='active')c.status='paused';});
   audit(s,stopped?'Аварийная остановка всех кампаний':'Аварийная остановка снята. Кампании остаются на паузе.');return {ok:true,stopped};});},

 addMailbox:(ctx:Ctx,input:unknown)=>{const email=schemas.mailbox.parse(input).email.toLowerCase();
  return change(ctx.accountId,s=>{const name=email.split('@')[1];let d=s.domains.find(d=>d.name===name);
   if(!d)s.domains.push(d={id:randomUUID(),name,limit:0,used:0,dns:noDns(),mailboxes:[]});
   if(!d.mailboxes.some((m:any)=>m.email===email))d.mailboxes.push(box(email));
   audit(s,`Добавлен ящик ${email}. Ящик не подключён: нужны подключение провайдера и тестовая отправка.`);
   return {...d,readiness:domainReadiness(d,s.stopped)};});},

 checkDomain:async(ctx:Ctx,input:unknown)=>{const {id,selector}=schemas.domainCheck.parse(input);
  const d=(await read(ctx.accountId)).domains.find(d=>d.id===id);if(!d)throw Error('Домен не найден');
  const lookup=async(n:string)=>{try{return (await resolveTxt(n)).map(r=>r.join(''));}catch{return [];}};
  const [spf,dkim,dmarc]=await Promise.all([lookup(d.name),lookup(`${selector}._domainkey.${d.name}`),lookup(`_dmarc.${d.name}`)]);
  const checks={spf:spf.some(v=>v.startsWith('v=spf1')),dkim:dkim.some(v=>v.includes('p=')&&!v.endsWith('p=')),dmarc:dmarc.some(v=>v.startsWith('v=DMARC1'))};
  // A DNS record is evidence about the domain. It is never a connection and never grants readiness.
  return change(ctx.accountId,s=>{const target=s.domains.find(x=>x.id===id)!;
   target.dns={...checks,checkedAt:new Date().toISOString()};
   audit(s,`DNS ${d.name}: SPF ${checks.spf}, DKIM ${checks.dkim}, DMARC ${checks.dmarc}. Это не подключение ящика.`);
   return {...checks,readiness:domainReadiness(target,s.stopped)};});},

 /** Manual JSON import stays available as a secondary route to the same store. */
 importContacts:(ctx:Ctx,input:unknown)=>{const {id,contacts}=schemas.importContacts.parse(input);
  return change(ctx.accountId,s=>{campaignOf(s,id);let added=0;
   for(const contact of contacts){const email=contact.email.toLowerCase();
    if(s.contacts.some(c=>c.campaignId===id&&c.email===email))continue;
    s.contacts.push({...contact,email,id:randomUUID(),campaignId:id,role:'',country:'',evidence:'Импортировано вручную',
     confidence:100,verification:'verified',origin:'manual'});added++;}
   audit(s,`Импортировано адресатов вручную: ${added}`);return {added,skipped:contacts.length-added};});},

 /** Research runs outside the write lock, then the result is committed once. */
 findRecipients:async(ctx:Ctx,input:unknown)=>{const {id,count,mode}=schemas.findRecipients.parse(input);
  const before=await read(ctx.accountId);const campaign=campaignOf(before,id);
  const setting=mode??before.settings?.recipientMode??'auto';
  const result=await findRecipients(campaign,setting,count,await infrastructure(ctx.accountId));
  return change(ctx.accountId,s=>{campaignOf(s,id);let added=0,skipped=0;
   for(const c of result.candidates){
    const email=c.email?.toLowerCase()??null;
    if(email&&s.contacts.some(x=>x.campaignId===id&&x.email===email)){skipped++;continue;}
    if(!email&&s.contacts.some(x=>x.campaignId===id&&!x.email&&x.company===c.company&&x.role===c.role)){skipped++;continue;}
    s.contacts.push({id:randomUUID(),campaignId:id,email:email??'',name:c.name,company:c.company,role:c.role,
     country:c.country,source:c.source??'',basis:c.basis,reason:c.reason,evidence:c.evidence,
     confidence:c.confidence,verification:c.verification,origin:c.origin});added++;}
   audit(s,`Поиск адресатов «${campaign.name}» (${result.mode}): найдено ${added}, повторов пропущено ${skipped}.`);
   return {mode:result.mode,profile:result.profile,queries:result.queries,notes:result.notes,added,skipped,
    verified:result.candidates.filter(c=>c.verification==='verified').length};});},

 /** Confirms a proposed recipient against real evidence supplied by the operator or a connector. */
 confirmRecipient:(ctx:Ctx,input:unknown)=>{const body=schemas.confirmRecipient.parse(input);
  return change(ctx.accountId,s=>{const p=s.contacts.find(c=>c.id===body.contactId);if(!p)throw Error('Адресат не найден');
   const email=body.email.toLowerCase();
   if(s.contacts.some(c=>c.campaignId===p.campaignId&&c.email===email&&c.id!==p.id))throw Error('Такой адрес уже есть в кампании');
   Object.assign(p,{email,source:body.source,evidence:body.evidence,verification:'verified'});
   audit(s,`Адресат подтверждён: ${email}`);return p;});},

 /** Candidates researched outside Sendina, stored as proposals.

     A superadmin driving Sendina from a chat has the intelligence, the browsing and the reading
     on the other side of the connector; what was missing was a way to put a result in without
     Sendina first doing the same work again with a model of its own. So this path does not ask
     for `aiReady`: it does no research, it records research.

     What it does not do is trust the sender. Everything arrives as a proposal, unverified, which
     is the same state the internal proposal mode produces and which the policy engine refuses to
     send to. An address becomes sendable only through `confirmRecipient`, against a real source
     and evidence — the identical door, and the only door. An invented address is therefore still
     mechanically unable to reach anybody. */
 proposeRecipients:(ctx:Ctx,input:unknown)=>{const {id,candidates}=schemas.proposeRecipients.parse(input);
  return change(ctx.accountId,s=>{const campaign=campaignOf(s,id);let added=0,skipped=0;
   for(const c of candidates){
    const email=c.email?.toLowerCase()??'';
    if(email&&s.contacts.some(x=>x.campaignId===id&&x.email===email)){skipped++;continue;}
    if(!email&&s.contacts.some(x=>x.campaignId===id&&!x.email&&x.company===c.company&&x.role===c.role)){skipped++;continue;}
    s.contacts.push({id:randomUUID(),campaignId:id,email,name:c.name,company:c.company,role:c.role,
     country:c.country,source:c.source??'',basis:c.basis,reason:c.reason,evidence:c.evidence,
     confidence:c.confidence,
     // Never 'verified' on the sender's word. Confirmation is a separate, evidenced step.
     verification:'unverified',origin:'proposal'});added++;}
   audit(s,`Предложены адресаты для «${campaign.name}» через коннектор: ${added}, повторов пропущено ${skipped}. Все не подтверждены и к отправке не допускаются.`);
   return {added,skipped,verified:0,
    proposed:s.contacts.filter(c=>c.campaignId===id&&c.verification==='unverified').length,
    note:'Кандидаты сохранены как предложения. Каждый адрес нужно подтвердить через confirm_recipient с реальной ссылкой и цитатой, иначе правила не допустят отправку.'};});},

 /** Prepares drafts and a policy decision per recipient. Repeating it never duplicates a draft. */
 prepareMessages:(ctx:Ctx,input:unknown)=>{const {id,limit,asIfRunning}=schemas.prepare.parse(input);
  return change(ctx.accountId,s=>{const c=campaignOf(s,id);const duplicates=duplicateEmails(s,id);
   const sender=senderDomain(s);
   const contacts=s.contacts.filter(p=>p.campaignId===id).slice(0,limit);
   return contacts.map(p=>{const draft=compose(c,p);
    let m=s.messages.find(m=>m.contactId===p.id);
    if(!m){m={id:randomUUID(),campaignId:c.id,contactId:p.id,email:p.email,subject:draft.subject,text:draft.text,
     status:'draft',bulk:draft.bulk,at:new Date().toISOString(),sentAt:null};s.messages.push(m);}
    else Object.assign(m,{subject:draft.subject,text:draft.text,bulk:draft.bulk});
    return {...m,name:p.name,company:p.company,source:p.source,reason:p.reason,evidence:p.evidence,
     verification:p.verification,confidence:p.confidence,origin:p.origin,
     sender:sender?.name??'',policy:decide(s,asIfRunning?{...c,status:'active'}:c,p,duplicates,sender)};});});},

 /** Recommends a market from the product description, so "let Sendina choose" is a real answer
     and not a silent default. The operator can always override it. */
 recommendMarket:async(ctx:Ctx,input:unknown)=>{
  const body=z.object({context:z.string().min(10).max(5000),goal:z.string().min(1).max(200)}).parse(input);
  const config=await infrastructure(ctx.accountId);
  const answer=await complete({name:'market_recommendation',config,
   schema:z.object({market:z.string().min(2).max(80),why:z.string().min(10).max(400)}),
   system:'Ты выбираешь страну или регион для первой кампании. Отвечай только JSON.',
   user:`Продукт и контекст: ${body.context}

Цель: ${body.goal}

`+
    `Назови одну страну из списка либо один регион (${regions.map(r=>r.id).join(', ')}) и объясни выбор одним предложением.

`+
    `Страны: ${markets.join(', ')}.`});
  return answer;},

 /** How much of the first sending the operator wants to see before it happens. */
 setControlMode:(ctx:Ctx,input:unknown)=>{const {id,control}=schemas.control.parse(input);
  return change(ctx.accountId,s=>{const c=campaignOf(s,id);
   c.control=control;
   if(control!=='confirm')c.firstBatchApprovedAt=null;
   audit(s,`Режим контроля «${c.name}»: ${control}`);
   return {id:c.id,control,firstBatchApprovedAt:c.firstBatchApprovedAt};});},

 /** Approving the first batch is what lifts FIRST_BATCH_APPROVAL_REQUIRED. */
 approveFirstBatch:(ctx:Ctx,input:unknown)=>{const {id}=schemas.approve.parse(input);
  return change(ctx.accountId,s=>{const c=campaignOf(s,id);
   if((c.control??'confirm')!=='confirm')throw Error('Подтверждение первой партии нужно только в режиме «подтвердить первую партию».');
   c.firstBatchApprovedAt=new Date().toISOString();
   audit(s,`Первая партия «${c.name}» подтверждена оператором.`);
   return {id:c.id,firstBatchApprovedAt:c.firstBatchApprovedAt};});},

 /** What the operator must see before anything is sent: real recipients with their organisation,
     role, source, evidence, the reason they were chosen, and the letter each would receive.
     It reads the same rows the campaign already holds; nothing is stored twice. */
 launchPreview:async(ctx:Ctx,input:unknown)=>{const {id,limit}=schemas.prepare.parse(input);
  const messages=await operations.prepareMessages(ctx,{id,limit,asIfRunning:true}) as any[];
  const s=await read(ctx.accountId);
  const campaign=campaignOf(s,id);
  const contacts=s.contacts.filter(p=>p.campaignId===id);
  return {
   campaign:{id:campaign.id,name:campaign.name,market:campaign.market,goal:campaign.goal,
    event:campaign.event,status:campaign.status,control:campaign.control??'confirm',
    firstBatchApprovedAt:campaign.firstBatchApprovedAt??null},
   recipients:contacts.length,
   verified:contacts.filter(p=>p.verification==='verified').length,
   sample:messages.map(m=>{
    const p=contacts.find(c=>c.id===m.contactId);
    return {contactId:m.contactId,name:p?.name??m.name,company:p?.company??'',role:p?.role??'',
     country:p?.country??'',email:m.email,source:m.source,evidence:p?.evidence??'',
     reason:m.reason,confidence:p?.confidence??0,verification:m.verification,origin:p?.origin??'',
     subject:m.subject,text:m.text,bulk:m.bulk,policy:m.policy};})
  };},

 recordReply:(ctx:Ctx,input:unknown)=>{const body=schemas.reply.parse(input);
  return change(ctx.accountId,s=>{const existing=s.replies.find(r=>r.id===body.eventId);if(existing)return existing;
   const c=campaignOf(s,body.campaignId);const email=body.email.toLowerCase();
   if(!s.contacts.some(p=>p.campaignId===c.id&&p.email===email)&&!s.messages.some(m=>m.campaignId===c.id&&m.email===email))throw Error('Адресат не принадлежит кампании');
   const r={...body,email,id:body.eventId,name:email,company:'',at:new Date().toISOString()};
   s.replies.unshift(r);
   if(['unsubscribe','negative'].includes(body.category)&&!s.suppressed.includes(email))s.suppressed.push(email);
   if(body.category==='positive')c.positive++;
   audit(s,`Получен ответ ${email}: ${body.category}`);return r;});},

 suppress:(ctx:Ctx,input:unknown)=>{const email=schemas.suppress.parse(input).email.toLowerCase();
  return change(ctx.accountId,s=>{if(!s.suppressed.includes(email))s.suppressed.push(email);
   audit(s,`Глобальное исключение: ${email}`);return {ok:true,email};});},


 // --- Research ------------------------------------------------------------
 /** Opportunity Research. One mechanism, three entrances: this screen, MCP, and the platform
     model. The result replaces the previous search rather than accumulating, so the six cards
     the operator sees are the six rows a connector reads back. */
 researchOpportunities:async(ctx:Ctx,input:unknown)=>{const body=schemas.researchOpportunities.parse(input);
  const location=normalizeLocation(body.location??{auto:true});
  const config=await infrastructure(ctx.accountId);
  const found=await researchOpportunities({location,industry:body.industry,note:body.note},config);
  const request={location,industry:body.industry,note:body.note};
  return change(ctx.accountId,s=>{
   s.research.opportunities={at:found.at,input:request,items:found.items};
   audit(s,`Поиск возможностей (${locationLabel(location)}${body.industry?`, ${body.industry}`:''}): найдено ${found.items.length}.`);
   return {results:found.items,at:found.at,input:request,notes:found.notes,grounded:found.grounded,
    favourites:s.favourites.filter(f=>f.kind==='opportunity')};});},

 /** Market Research: a country asks for niches, a niche asks for countries, and both together
     ask only for a verdict. The same mechanism answers all three. */
 researchMarkets:async(ctx:Ctx,input:unknown)=>{const body=schemas.researchMarkets.parse(input);
  const location=normalizeLocation(body.location??{auto:true});
  const config=await infrastructure(ctx.accountId);
  const found=await researchMarkets({mode:body.mode,location,niche:body.niche},config);
  const request={mode:body.mode,location,niche:body.niche};
  return change(ctx.accountId,s=>{
   s.research.markets={at:found.at,input:request,items:found.items};
   audit(s,`Исследование рынка (${body.mode==='country'?'по стране':body.mode==='niche'?'по нише':'ручная оценка'}): найдено ${found.items.length}.`);
   return {results:found.items,at:found.at,input:request,notes:found.notes,grounded:found.grounded,
    favourites:s.favourites.filter(f=>f.kind==='market')};});},

 /** Research carried out elsewhere, landing in the rows the screens already read.

     The Opportunities and Markets screens read one place: the current result of that search and
     the favourites. A connector that had no way to write there could only leave its findings in
     a campaign's free-text context, which is why a chat could do the research and the screen
     still showed nothing. This writes the same rows the internal search writes, so a card saved
     from a chat is a card the screen shows, keeps, and can build a test campaign from — by the
     same id. The score is still computed here from the factors, never accepted as a number. */
 saveResearch:(ctx:Ctx,input:unknown)=>{const body=schemas.saveResearch.parse(input);
  const at=new Date().toISOString();
  const items=body.items.map(raw=>researchFromInput(body.kind,raw,body.sources,at));
  const field=body.kind==='opportunity'?'opportunities':'markets';
  return change(ctx.accountId,s=>{
   const previous=body.replace?[]:(s.research[field]?.items??[]);
   const merged=[...items,...previous].slice(0,RESULTS*2);
   s.research[field]={at,input:s.research[field]?.input??{imported:true},items:merged};
   audit(s,`Сохранено из коннектора (${body.kind==='opportunity'?'возможности':'рынки'}): ${items.length}.`);
   return {saved:items.length,results:merged,at,
    favourites:s.favourites.filter(f=>f.kind===body.kind)};});},

 /** Anything a search returned may be kept. Nothing is kept automatically. */
 saveFavourite:(ctx:Ctx,input:unknown)=>{const {id}=schemas.favourite.parse(input);
  return change(ctx.accountId,s=>{
   const item=findResearch(s,id);
   if(s.favourites.some(f=>f.id===item.id))return {saved:false,item};
   s.favourites.unshift(item);
   audit(s,`В избранное: «${item.name}» (${item.kind==='market'?'рынок':'возможность'}).`);
   return {saved:true,item};});},

 removeFavourite:(ctx:Ctx,input:unknown)=>{const {id}=schemas.favourite.parse(input);
  return change(ctx.accountId,s=>{
   const item=s.favourites.find(f=>f.id===id);
   if(!item)throw Error('Такой возможности нет в избранном');
   s.favourites=s.favourites.filter(f=>f.id!==id);
   audit(s,`Удалено из избранного: «${item.name}».`);
   return {ok:true,id};});},

 /** "Создать тест" and "Подготовить тест" are the same button: both make an ordinary Campaign
     through the ordinary path. There is no market campaign and no opportunity campaign. */
 createTestFromResearch:async(ctx:Ctx,input:unknown)=>{const {id,control}=schemas.testFromResearch.parse(input);
  const s=await read(ctx.accountId);
  const item=findResearch(s,id);
  const draft=campaignDraft(item);
  const campaign=await operations.createCampaign(ctx,{...draft,control,
   location:{countries:[item.market],region:'',city:'',auto:false}}) as any;
  return {campaign,from:{id:item.id,kind:item.kind,name:item.name,score:item.score}};},

 // --- Replies -------------------------------------------------------------
 /** One card per recipient with the whole conversation behind it. */
 threads:async(ctx:Ctx)=>{const s=await read(ctx.accountId);
  return {threads:buildThreads(s),outcomes};},

 /** Whether the recommended next action has been carried out, and how the thread ended. */
 setThreadAction:(ctx:Ctx,input:unknown)=>{const body=schemas.threadAction.parse(input);
  const email=body.email.toLowerCase();
  return change(ctx.accountId,s=>{
   const before=s.threads[email]??{done:false,outcome:'',at:new Date().toISOString()};
   s.threads[email]={done:body.done??before.done,outcome:body.outcome??before.outcome,
    at:new Date().toISOString()};
   audit(s,`Ветка ${email}: ${body.outcome?`итог «${outcomes[body.outcome]}»`:''}${body.outcome&&body.done!==undefined?', ':''}${body.done!==undefined?(body.done?'следующее действие выполнено':'следующее действие не выполнено'):''}`);
   return {email,...s.threads[email]};});},

 // --- Analytics -----------------------------------------------------------
 /** Every number the screen shows, for one period and one campaign selection. */
 analytics:async(ctx:Ctx,input:unknown)=>{const body=schemas.analytics.parse(input??{});
  return buildAnalytics(await read(ctx.accountId),body);},

 // --- Demonstration -------------------------------------------------------
 /** A demonstration is something the operator asks for, in their own workspace, and can undo.
     It is never what a new account is given. */
 setDemo:(ctx:Ctx,input:unknown)=>{const {enabled}=schemas.demo.parse(input);
  return change(ctx.accountId,s=>{
   if(enabled){
    const demo=demoSeed();
    Object.assign(s,demo,{settings:s.settings});
    audit(s,'Включён демонстрационный режим: кампании, ответы и показатели — примеры.');
   }else{
    const fresh=seedState();
    Object.assign(s,fresh,{settings:s.settings,audit:s.audit});
    audit(s,'Демонстрационные данные удалены. Рабочая область пуста.');
   }
   return {demo:s.demo};});},

 setRecipientMode:async(ctx:Ctx,input:unknown)=>{const {mode}=schemas.recipientMode.parse(input);
  const config=await infrastructure(ctx.accountId);
  return change(ctx.accountId,s=>{s.settings={...s.settings,recipientMode:mode};
   audit(s,`Режим поиска адресатов: ${mode}`);return {mode,effective:resolveMode(mode,searchReady(config),placesReady(config))};});}
};
export type Operations=typeof operations;
