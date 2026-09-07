import {demoSeed,normalize,noDns,box,anywhere,type State} from '../server/seed';
import {policy} from '../server/policy';
import {threads,outcomes} from '../server/threads';
import {analytics} from '../server/analytics';
import {locationLabel,normalizeLocation,countries,regions} from '../server/geo';
import {z} from 'zod';

/** The browser demonstration. It runs the same policy, thread and analytics code the server
    runs, over a workspace kept in this browser — so what it shows is the product, not a mock of
    it. What it cannot do is anything that needs a model, a search key or a mailbox, and it says
    so rather than inventing a result. */

const key='sendina-demo-v2';
const needsServer=(what:string)=>Error(`${what} Подключите сервер в настройках.`);

export async function demoApi(path:string,body?:any){
 const raw=localStorage.getItem(key);
 const s:State=raw?normalize(JSON.parse(raw)):demoSeed();
 const log=(action:string)=>s.audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action});
 let result:any={ok:true};
 if(path==='/state')return s;
 if(path==='/geo')return {countries,regions};
 if(path==='/auth/request')return {status:'demo',message:'Это демонстрация в браузере: вход не требуется. Подключите сервер, чтобы работать под своим аккаунтом.'};
 if(path==='/settings/connections')return {openai:{configured:false,model:'',gateway:''},search:{provider:'',configured:false},google:{configured:false},microsoft:{configured:false,tenant:'common'}};
 if(path==='/accounts')return [];
 if(path==='/support-log')return [];
 if(path==='/platform')return {google:{configured:false},microsoft:{configured:false,tenant:'common'},openai:{configured:false,model:''},search:{configured:false,provider:''},places:{configured:false,provider:''},encryption:'generated'};
 if(path==='/capabilities')return {ai:{ready:false,model:''},search:{ready:false,provider:''},recipients:{setting:s.settings?.recipientMode??'auto',effective:'proposal'},organisations:{ready:false,provider:''},provided:{model:'none',search:'none',organisations:'none'},account:null,connections:{openai:{configured:false,model:'',gateway:''},search:{provider:'',configured:false},google:{configured:false},microsoft:{configured:false,tenant:'common'}},storage:{postgres:false,durable:false},sendingEnabled:false};
 if(path==='/integrations')return {mcp:{endpoint:'Not configured',authentication:'Not configured',ready:false,transport:'Streamable HTTP',tools:['research_opportunities','list_opportunities','research_markets_by_country','research_markets_by_niche','create_test_from_research','list_threads','get_analytics','create_campaign','exclude_recipient']}};
 // Threads and analytics are the same functions the server runs, over this browser's workspace.
 if(path==='/threads')return {threads:threads(s),outcomes};
 // The demonstration has no mailbox and no server to send through, and says so rather than
 // showing a readiness it could not act on.
 if(path==='/sender')return {stopped:s.stopped,sendingEnabled:false,sendingBlocker:'SENDER_NOT_READY',
  deployment:{sendingAllowed:false,maxPerRun:0,allowlist:null},
  sender:null,allowance:null,ready:false,blockers:['NO_MAILBOX'],mailboxes:[],
  domains:s.domains.map(d=>({id:d.id,name:d.name,dns:d.dns,limit:d.limit,used:d.used,
   readiness:{ready:false,blockers:['NO_MAILBOX']}}))};
 if(path==='/opportunities')return {results:s.research.opportunities?.items??[],at:s.research.opportunities?.at??null,input:s.research.opportunities?.input??null,favourites:s.favourites.filter(f=>f.kind==='opportunity')};
 if(path==='/markets')return {results:s.research.markets?.items??[],at:s.research.markets?.at??null,input:s.research.markets?.input??null,favourites:s.favourites.filter(f=>f.kind==='market')};
 if(path==='/analytics')return analytics(s,body??{});

 if(path==='/campaigns'){
  const c=z.object({name:z.string().min(3).max(150),goal:z.string().min(1),context:z.string().min(10).max(5000),event:z.string().min(1)}).parse(body);
  const location=body?.location!==undefined?normalizeLocation(body.location):body?.market?normalizeLocation({countries:[body.market]}):anywhere();
  result={...c,location,market:locationLabel(location),id:crypto.randomUUID(),status:'draft',sent:0,positive:0,value:0,
   control:body?.control??'confirm',firstBatchApprovedAt:null,createdAt:new Date().toISOString()};
  s.campaigns.unshift(result);log(`Создана кампания «${c.name}»`);
 }else if(path==='/domains'){
  const email=z.email().parse(body.email).toLowerCase(),name=email.split('@')[1];let d=s.domains.find(d=>d.name===name);
  if(!d)s.domains.push(d={id:crypto.randomUUID(),name,limit:0,used:0,dns:noDns(),mailboxes:[]});
  if(!d.mailboxes.some((m:any)=>m.email===email))d.mailboxes.push(box(email));result=d;log(`Добавлен ящик ${email}`);
 }else if(path==='/stop'){
  s.stopped=z.boolean().parse(body.stopped);if(s.stopped)s.campaigns.forEach(c=>{if(c.status==='active')c.status='paused';});log(s.stopped?'Аварийная остановка всех кампаний':'Аварийная остановка снята. Кампании остаются на паузе.');
 }else if(path==='/suppress'){
  const email=z.email().parse(body.email).toLowerCase();if(!s.suppressed.includes(email))s.suppressed.push(email);log(`Глобальное исключение: ${email}`);
 }else if(path==='/threads/action'){
  const email=z.email().parse(body.email).toLowerCase();
  const before=s.threads[email]??{done:false,outcome:'',at:new Date().toISOString()};
  s.threads[email]={done:body.done??before.done,outcome:body.outcome??before.outcome,at:new Date().toISOString()};
  result={email,...s.threads[email]};log(`Ветка ${email} обновлена`);
 }else if(path==='/favourites/remove'){
  const item=s.favourites.find(f=>f.id===body?.id);
  if(!item)throw Error('Такой возможности нет в избранном');
  s.favourites=s.favourites.filter(f=>f.id!==body.id);result={ok:true,id:body.id};log(`Удалено из избранного: «${item.name}»`);
 }else if(path==='/favourites'){
  const item=[...(s.research.opportunities?.items??[]),...(s.research.markets?.items??[])].find(x=>x.id===body?.id);
  if(!item)throw Error('Возможность не найдена. Выполните поиск заново.');
  if(!s.favourites.some(f=>f.id===item.id))s.favourites.unshift(item);
  result={saved:true,item};log(`В избранное: «${item.name}»`);
 }else if(path==='/demo'){
  const enabled=z.boolean().parse(body.enabled);
  if(!enabled){localStorage.removeItem(key);return {demo:false};}
  localStorage.setItem(key,JSON.stringify(demoSeed()));return {demo:true};
 }
 else if(path==='/opportunities/research'||path==='/markets/research')throw needsServer('Исследование выполняется моделью на сервере.');
 else if(path==='/research/campaign')throw needsServer('Создание теста из исследования выполняется на сервере.');
 else if(path.match(/^\/domains\/[^/]+\/check$/))throw needsServer('Проверка DNS выполняется на сервере.');
 else if(path.match(/^\/domains\/[^/]+\/limit$/))throw needsServer('Суточный лимит домена задаётся на сервере.');
 else if(path.match(/^\/campaigns\/[^/]+\/send$/))throw needsServer('Отправка выполняется на сервере, через подключённый ящик.');
 else if(path.match(/^\/campaigns\/[^/]+\/find$/))throw needsServer('Поиск адресатов выполняется на сервере.');
 else if(path==='/contacts/confirm')throw needsServer('Подтверждение адресата выполняется на сервере.');
 else if(path==='/recommend-market'||path.endsWith('/launch-preview')||path.endsWith('/control')||path.endsWith('/approve'))throw needsServer('Это действие выполняется на сервере.');
 else if(path.startsWith('/settings/connections')||path.startsWith('/accounts')||path.startsWith('/platform'))throw needsServer('Это действие выполняется на сервере.');
 else if(path==='/mailboxes/detect'){
  // The browser cannot read MX records, so the demo shows the manual route honestly.
  const email=z.email().parse(body.email).toLowerCase();
  result={email,domain:email.split('@')[1],provider:'smtp',workspace:true,personal:false,mx:[],
   note:'Демонстрация в браузере: определить провайдера по MX нельзя. Подключите сервер, чтобы Sendina сделала это сама.',
   route:'manual',appOwner:'none',advancedOnly:false,blocker:null,oauthConfigured:false,settings:null,redirectUri:''};
 }
 else if(path.startsWith('/mailboxes/'))throw needsServer('Подключение ящика выполняется на сервере.');
 else if(path==='/settings/recipients'){const mode=z.enum(['auto','organisations','search','proposal']).parse(body.mode);s.settings={...s.settings,recipientMode:mode};result={mode,effective:'proposal'};log(`Режим поиска адресатов: ${mode}`);}
 else {
  const match=path.match(/^\/campaigns\/([^/]+)\/(status|contacts|preview)$/);if(!match)throw needsServer('Это действие выполняется на сервере.');
  const c=s.campaigns.find(c=>c.id===match[1]);if(!c)throw Error('Кампания не найдена');
  if(match[2]==='status'){
   const status=z.enum(['active','paused','draft']).parse(body.status);if(s.stopped&&status==='active')throw Error('Сначала отключите аварийную остановку');c.status=status;result=c;log(`Кампания «${c.name}»: ${status}`);
  }else if(match[2]==='contacts'){
   const contacts=z.array(z.object({email:z.email(),name:z.string().min(1),company:z.string().min(1),source:z.url(),basis:z.string().min(3),reason:z.string().min(10)})).min(1).max(1000).parse(body.contacts);let added=0;
   for(const p of contacts){const email=p.email.toLowerCase();if(!s.contacts.some(x=>x.campaignId===c.id&&x.email===email)){s.contacts.push({...p,email,id:crypto.randomUUID(),campaignId:c.id,verification:'verified',origin:'manual',evidence:'Импортировано вручную',confidence:100,role:'',country:''});added++;}}result={added};log(`Импортировано адресатов: ${added}`);
  }else{
   result=s.contacts.filter(p=>p.campaignId===c.id).map(p=>{
    let m=s.messages.find(m=>m.contactId===p.id);
    if(!m){m={id:crypto.randomUUID(),campaignId:c.id,contactId:p.id,email:p.email,subject:c.name,
     text:`Здравствуйте, ${p.name}!\n\n${p.reason}\n\n${c.context}\n\nГотовы обсудить следующий шаг: ${c.event.toLowerCase()}?\n\nЕсли предложение неактуально, сообщите об этом — мы прекратим обращения.`,
     status:'draft',bulk:false,at:new Date().toISOString(),sentAt:null};s.messages.push(m);}
    return {...m,name:p.name,company:p.company,source:p.source,reason:p.reason,verification:p.verification,
     policy:policy({stopped:s.stopped,status:c.status,suppressed:s.suppressed.includes(p.email),
      replied:s.replies.some(r=>r.email===p.email&&r.campaignId===c.id),basis:p.basis??'',contactReason:p.reason??'',
      sourceVerified:p.verification!=='unverified',duplicate:false,control:(c.control??'confirm'),
      firstBatchApproved:Boolean(c.firstBatchApprovedAt),verified:false,used:0,limit:0})};});
  }
 }
 localStorage.setItem(key,JSON.stringify(s));return result;
}
