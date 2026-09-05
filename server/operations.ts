import {randomUUID} from 'node:crypto';
import {resolveTxt} from 'node:dns/promises';
import {z} from 'zod';
import {read,change,pool} from './store';
import {policy,isBulk} from './policy';
import {findRecipients,resolveMode} from './recipients';
import {aiReady,aiModel} from './ai';
import {searchReady,searchProvider} from './search';
import {noDns,box,type State} from './seed';
import {domainReadiness,mailboxReadiness} from './readiness';

const audit=(s:State,action:string)=>s.audit.unshift({id:randomUUID(),at:new Date().toISOString(),action});
const campaignOf=(s:State,id:string)=>{const c=s.campaigns.find(c=>c.id===id);if(!c)throw Error('Кампания не найдена');return c;};

/** Addresses of this campaign that also sit in another campaign of the workspace. */
export function duplicateEmails(s:State,campaignId:string){
 const mine=s.contacts.filter(c=>c.campaignId===campaignId);
 const elsewhere=new Set(s.contacts.filter(c=>c.campaignId!==campaignId).map(c=>c.email));
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
 verified:Boolean(sender),used:sender?.used??0,limit:sender?.limit??0
});

/** A recipient with no specific reason gets bulk wording and is named as such. */
const compose=(c:any,p:any)=>isBulk(p.reason??'')
 ?{bulk:true,subject:c.name,text:`Здравствуйте!\n\n${c.context}\n\nЕсли тема интересна, ответьте на это письмо.\n\nЧтобы больше не получать писем, ответьте «отписаться».`}
 :{bulk:false,subject:c.name,text:`Здравствуйте, ${p.name}!\n\n${p.reason}\n\n${c.context}\n\nГотовы обсудить следующий шаг: ${c.event.toLowerCase()}?\n\nЕсли предложение неактуально, сообщите об этом — мы прекратим обращения.`};

const contactInput=z.object({email:z.email(),name:z.string().min(1),company:z.string().min(1),source:z.url(),basis:z.string().min(3),reason:z.string().min(10)});

export const schemas={
 createCampaign:z.object({name:z.string().min(3).max(150),market:z.string().min(1),goal:z.string().min(1),context:z.string().min(10).max(5000),event:z.string().min(1)}),
 campaignId:z.object({id:z.string().min(1)}),
 setStatus:z.object({id:z.string().min(1),status:z.enum(['active','paused','draft'])}),
 stop:z.object({stopped:z.boolean()}),
 mailbox:z.object({email:z.email()}),
 domainCheck:z.object({id:z.string().min(1),selector:z.string().regex(/^[a-zA-Z0-9_-]{1,63}$/).default('default')}),
 importContacts:z.object({id:z.string().min(1),contacts:z.array(contactInput).min(1).max(1000)}),
 findRecipients:z.object({id:z.string().min(1),count:z.number().int().min(1).max(50).default(20),mode:z.enum(['auto','search','proposal']).optional()}),
 confirmRecipient:z.object({contactId:z.string().min(1),email:z.email(),source:z.url(),evidence:z.string().min(10)}),
 prepare:z.object({id:z.string().min(1),limit:z.number().int().min(1).max(50).default(5)}),
 reply:z.object({campaignId:z.string().min(1),email:z.email(),text:z.string().min(1),eventId:z.string().min(1),
  category:z.enum(['positive','neutral','objection','referral','later','unsubscribe','negative','automatic','bounce'])}),
 suppress:z.object({email:z.email()}),
 recipientMode:z.object({mode:z.enum(['auto','search','proposal'])})
};

export const operations={
 state:()=>read(),

 capabilities:async()=>{const s=await read();const setting=s.settings?.recipientMode??'auto';return {
  ai:{ready:aiReady(),model:aiReady()?aiModel():''},
  search:{ready:searchReady(),provider:searchProvider()},
  recipients:{setting,effective:resolveMode(setting)},
  storage:{postgres:Boolean(pool),durable:Boolean(pool)},
  sendingEnabled:false};},

 dashboard:async()=>{const s=await read();return {demo:s.demo,stopped:s.stopped,campaigns:s.campaigns.length,
  contacts:s.contacts.length,messages:s.messages.length,replies:s.replies.length,
  sent:s.campaigns.reduce((n,c)=>n+c.sent,0),positive:s.campaigns.reduce((n,c)=>n+c.positive,0),
  suppressed:s.suppressed.length,sendingEnabled:false};},

 getCampaign:async(input:unknown)=>{const {id}=schemas.campaignId.parse(input);const s=await read();
  return {campaign:campaignOf(s,id),contacts:s.contacts.filter(c=>c.campaignId===id),
   messages:s.messages.filter(m=>m.campaignId===id),replies:s.replies.filter(r=>r.campaignId===id),
   duplicates:duplicateEmails(s,id)};},

 listCampaigns:async()=>(await read()).campaigns,
 listOpportunities:async()=>({demo:true,opportunities:(await read()).opportunities}),

 createCampaign:(input:unknown)=>{const body=schemas.createCampaign.parse(input);
  return change(s=>{const c={...body,id:randomUUID(),status:'draft',sent:0,positive:0,value:0};
   s.campaigns.unshift(c);audit(s,`Создана кампания «${c.name}»`);return c;});},

 setCampaignStatus:(input:unknown)=>{const {id,status}=schemas.setStatus.parse(input);
  return change(s=>{const c=campaignOf(s,id);
   if(s.stopped&&status==='active')throw Error('Сначала отключите аварийную остановку');
   const duplicates=status==='active'?duplicateEmails(s,id):[];
   c.status=status;audit(s,`Кампания «${c.name}»: ${status}`);
   if(duplicates.length)audit(s,`Проверка повторов при продолжении «${c.name}»: ${duplicates.length}. Эти адресаты заблокированы правилами.`);
   return {campaign:c,duplicates};});},

 emergencyStop:(input:unknown)=>{const {stopped}=schemas.stop.parse(input);
  return change(s=>{s.stopped=stopped;if(stopped)s.campaigns.forEach(c=>{if(c.status==='active')c.status='paused';});
   audit(s,stopped?'Аварийная остановка всех кампаний':'Аварийная остановка снята. Кампании остаются на паузе.');return {ok:true,stopped};});},

 addMailbox:(input:unknown)=>{const email=schemas.mailbox.parse(input).email.toLowerCase();
  return change(s=>{const name=email.split('@')[1];let d=s.domains.find(d=>d.name===name);
   if(!d)s.domains.push(d={id:randomUUID(),name,limit:0,used:0,dns:noDns(),mailboxes:[]});
   if(!d.mailboxes.some(m=>m.email===email))d.mailboxes.push(box(email));
   audit(s,`Добавлен ящик ${email}. Ящик не подключён: нужны подключение провайдера и тестовая отправка.`);
   return {...d,readiness:domainReadiness(d,s.stopped)};});},

 checkDomain:async(input:unknown)=>{const {id,selector}=schemas.domainCheck.parse(input);
  const d=(await read()).domains.find(d=>d.id===id);if(!d)throw Error('Домен не найден');
  const lookup=async(n:string)=>{try{return (await resolveTxt(n)).map(r=>r.join(''));}catch{return [];}};
  const [spf,dkim,dmarc]=await Promise.all([lookup(d.name),lookup(`${selector}._domainkey.${d.name}`),lookup(`_dmarc.${d.name}`)]);
  const checks={spf:spf.some(v=>v.startsWith('v=spf1')),dkim:dkim.some(v=>v.includes('p=')&&!v.endsWith('p=')),dmarc:dmarc.some(v=>v.startsWith('v=DMARC1'))};
  // A DNS record is evidence about the domain. It is never a connection and never grants readiness.
  return change(s=>{const target=s.domains.find(x=>x.id===id)!;
   target.dns={...checks,checkedAt:new Date().toISOString()};
   audit(s,`DNS ${d.name}: SPF ${checks.spf}, DKIM ${checks.dkim}, DMARC ${checks.dmarc}. Это не подключение ящика.`);
   return {...checks,readiness:domainReadiness(target,s.stopped)};});},

 /** Manual JSON import stays available as a secondary route to the same store. */
 importContacts:(input:unknown)=>{const {id,contacts}=schemas.importContacts.parse(input);
  return change(s=>{campaignOf(s,id);let added=0;
   for(const contact of contacts){const email=contact.email.toLowerCase();
    if(s.contacts.some(c=>c.campaignId===id&&c.email===email))continue;
    s.contacts.push({...contact,email,id:randomUUID(),campaignId:id,role:'',country:'',evidence:'Импортировано вручную',
     confidence:100,verification:'verified',origin:'manual'});added++;}
   audit(s,`Импортировано адресатов вручную: ${added}`);return {added,skipped:contacts.length-added};});},

 /** Research runs outside the write lock, then the result is committed once. */
 findRecipients:async(input:unknown)=>{const {id,count,mode}=schemas.findRecipients.parse(input);
  const before=await read();const campaign=campaignOf(before,id);
  const setting=mode??before.settings?.recipientMode??'auto';
  const result=await findRecipients(campaign,setting,count);
  return change(s=>{campaignOf(s,id);let added=0,skipped=0;
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
 confirmRecipient:(input:unknown)=>{const body=schemas.confirmRecipient.parse(input);
  return change(s=>{const p=s.contacts.find(c=>c.id===body.contactId);if(!p)throw Error('Адресат не найден');
   const email=body.email.toLowerCase();
   if(s.contacts.some(c=>c.campaignId===p.campaignId&&c.email===email&&c.id!==p.id))throw Error('Такой адрес уже есть в кампании');
   Object.assign(p,{email,source:body.source,evidence:body.evidence,verification:'verified'});
   audit(s,`Адресат подтверждён: ${email}`);return p;});},

 /** Prepares drafts and a policy decision per recipient. Repeating it never duplicates a draft. */
 prepareMessages:(input:unknown)=>{const {id,limit}=schemas.prepare.parse(input);
  return change(s=>{const c=campaignOf(s,id);const duplicates=duplicateEmails(s,id);
   const sender=senderDomain(s);
   const contacts=s.contacts.filter(p=>p.campaignId===id).slice(0,limit);
   return contacts.map(p=>{const draft=compose(c,p);
    let m=s.messages.find(m=>m.contactId===p.id);
    if(!m){m={id:randomUUID(),campaignId:c.id,contactId:p.id,email:p.email,subject:draft.subject,text:draft.text,status:'draft',bulk:draft.bulk};s.messages.push(m);}
    else Object.assign(m,{subject:draft.subject,text:draft.text,bulk:draft.bulk});
    return {...m,name:p.name,company:p.company,source:p.source,reason:p.reason,evidence:p.evidence,
     verification:p.verification,confidence:p.confidence,origin:p.origin,
     sender:sender?.name??'',policy:decide(s,c,p,duplicates,sender)};});});},

 recordReply:(input:unknown)=>{const body=schemas.reply.parse(input);
  return change(s=>{const existing=s.replies.find(r=>r.id===body.eventId);if(existing)return existing;
   const c=campaignOf(s,body.campaignId);const email=body.email.toLowerCase();
   if(!s.contacts.some(p=>p.campaignId===c.id&&p.email===email)&&!s.messages.some(m=>m.campaignId===c.id&&m.email===email))throw Error('Адресат не принадлежит кампании');
   const r={...body,email,id:body.eventId,name:email,company:'',at:new Date().toISOString()};
   s.replies.unshift(r);
   if(['unsubscribe','negative'].includes(body.category)&&!s.suppressed.includes(email))s.suppressed.push(email);
   if(body.category==='positive')c.positive++;
   audit(s,`Получен ответ ${email}: ${body.category}`);return r;});},

 suppress:(input:unknown)=>{const email=schemas.suppress.parse(input).email.toLowerCase();
  return change(s=>{if(!s.suppressed.includes(email))s.suppressed.push(email);
   audit(s,`Глобальное исключение: ${email}`);return {ok:true,email};});},

 setRecipientMode:(input:unknown)=>{const {mode}=schemas.recipientMode.parse(input);
  return change(s=>{s.settings={...s.settings,recipientMode:mode};
   audit(s,`Режим поиска адресатов: ${mode}`);return {mode,effective:resolveMode(mode)};});}
};
export type Operations=typeof operations;
