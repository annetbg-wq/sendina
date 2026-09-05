import {seed,noDns,box,type State} from '../server/seed';
import {policy} from '../server/policy';
import {z} from 'zod';
const key='sendina-demo-v1';
export async function demoApi(path:string,body?:any){
 const raw=localStorage.getItem(key);const s:State=raw?JSON.parse(raw):seed();
 const log=(action:string)=>s.audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action});
 let result:any={ok:true};
 if(path==='/state')return s;
 if(path==='/auth/request')return {status:'demo',message:'Это демонстрация в браузере: вход не требуется. Подключите сервер, чтобы работать под своим аккаунтом.'};
 if(path==='/settings/connections')return {openai:{configured:false,model:'',gateway:''},search:{provider:'',configured:false},google:{configured:false},microsoft:{configured:false,tenant:'common'}};
 if(path==='/accounts')return [];
 if(path==='/capabilities')return {ai:{ready:false,model:''},search:{ready:false,provider:''},recipients:{setting:s.settings?.recipientMode??'auto',effective:'proposal'},account:null,connections:{openai:{configured:false,model:'',gateway:''},search:{provider:'',configured:false},google:{configured:false},microsoft:{configured:false,tenant:'common'}},storage:{postgres:false,durable:false},sendingEnabled:false};
if(path==='/integrations')return {mcp:{endpoint:'Not configured',authentication:'Not configured',ready:false,transport:'Streamable HTTP',tools:['get_dashboard','list_campaigns','list_opportunities','get_campaign','create_campaign','import_contacts','preview_campaign','set_campaign_status','emergency_stop','exclude_recipient']}};
 if(path==='/campaigns'){
  const c=z.object({name:z.string().min(3).max(150),market:z.string().min(1),goal:z.string().min(1),context:z.string().min(10).max(5000),event:z.string().min(1)}).parse(body);
  result={...c,id:crypto.randomUUID(),status:'draft',sent:0,positive:0,value:0};s.campaigns.unshift(result);log(`Создана кампания «${c.name}»`);
 }else if(path==='/domains'){
  const email=z.email().parse(body.email).toLowerCase(),name=email.split('@')[1];let d=s.domains.find(d=>d.name===name);
  if(!d)s.domains.push(d={id:crypto.randomUUID(),name,limit:0,used:0,dns:noDns(),mailboxes:[]});
  if(!d.mailboxes.some(m=>m.email===email))d.mailboxes.push(box(email));result=d;log(`Добавлен ящик ${email}`);
 }else if(path==='/stop'){
  s.stopped=z.boolean().parse(body.stopped);if(s.stopped)s.campaigns.forEach(c=>{if(c.status==='active')c.status='paused';});log(s.stopped?'Аварийная остановка всех кампаний':'Аварийная остановка снята. Кампании остаются на паузе.');
 }else if(path==='/suppress'){
  const email=z.email().parse(body.email).toLowerCase();if(!s.suppressed.includes(email))s.suppressed.push(email);log(`Глобальное исключение: ${email}`);
 }else if(path.match(/^\/domains\/[^/]+\/check$/))throw Error('Для проверки DNS подключите сервер в настройках.');
 else if(path.match(/^\/campaigns\/[^/]+\/find$/))throw Error('Для поиска адресатов подключите сервер в настройках.');
 else if(path==='/contacts/confirm')throw Error('Для подтверждения адресата подключите сервер в настройках.');
 else if(path.startsWith('/settings/connections')||path.startsWith('/accounts'))throw Error('Для этого действия подключите сервер в настройках.');
 else if(path.startsWith('/mailboxes/'))throw Error('Для подключения ящика подключите сервер в настройках.');
 else if(path==='/settings/recipients'){const mode=z.enum(['auto','search','proposal']).parse(body.mode);s.settings={...s.settings,recipientMode:mode};result={mode,effective:'proposal'};log(`Режим поиска адресатов: ${mode}`);}
 else {
  const match=path.match(/^\/campaigns\/([^/]+)\/(status|contacts|preview)$/);if(!match)throw Error('Для этого действия подключите сервер в настройках.');
  const c=s.campaigns.find(c=>c.id===match[1]);if(!c)throw Error('Кампания не найдена');
  if(match[2]==='status'){
   const status=z.enum(['active','paused','draft']).parse(body.status);if(s.stopped&&status==='active')throw Error('Сначала отключите аварийную остановку');c.status=status;result=c;log(`Кампания «${c.name}»: ${status}`);
  }else if(match[2]==='contacts'){
   const contacts=z.array(z.object({email:z.email(),name:z.string().min(1),company:z.string().min(1),source:z.url(),basis:z.string().min(3),reason:z.string().min(10)})).min(1).max(1000).parse(body.contacts);let added=0;
   for(const p of contacts){const email=p.email.toLowerCase();if(!s.contacts.some(x=>x.campaignId===c.id&&x.email===email)){s.contacts.push({...p,email,id:crypto.randomUUID(),campaignId:c.id});added++;}}result={added};log(`Импортировано адресатов: ${added}`);
  }else{
   result=s.contacts.filter(p=>p.campaignId===c.id).map(p=>{let m=s.messages.find(m=>m.contactId===p.id);if(!m){m={id:crypto.randomUUID(),campaignId:c.id,contactId:p.id,email:p.email,subject:c.name,text:`Здравствуйте, ${p.name}!\n\n${p.reason}\n\n${c.context}\n\nГотовы обсудить следующий шаг: ${c.event.toLowerCase()}?\n\nЕсли предложение неактуально, сообщите об этом — мы прекратим обращения.`,status:'draft'};s.messages.push(m);}return {...m,source:p.source,reason:p.reason,policy:policy({stopped:s.stopped,status:c.status,suppressed:s.suppressed.includes(p.email),replied:s.replies.some(r=>r.email===p.email&&r.campaignId===c.id),basis:p.basis??'',contactReason:p.reason??'',sourceVerified:p.verification!=='unverified',duplicate:false,verified:false,used:0,limit:0})};});
  }
 }
 localStorage.setItem(key,JSON.stringify(s));return result;
}
