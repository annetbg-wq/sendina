import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {read,change} from './store';
import {noDns,box} from './seed';
import {getAuth,setAuth} from './authstore';
import {publicAddress} from './config';
import {accountSettings} from './accountsettings';
import type {Ctx} from './context';
import {detectProvider,oauthConfig,oauthReady,exchangeCode,sendMessage,verifySmtp,type Provider,type MailApps} from './mailproviders';
import {mailboxReadiness,domainReadiness} from './readiness';

/** Credentials live in the auth store, never in the workspace state the UI can read. */
const secretKey=(accountId:string,email:string)=>`mailbox:${accountId}:${email.toLowerCase()}`;
export const redirectUri=()=>`${publicAddress(process.env)}/oauth/mailbox/callback`;

const appsFor=async(accountId:string):Promise<MailApps>=>{
 const s=await accountSettings(accountId);
 return {google:s.google,microsoft:s.microsoft};
};

type Pending={accountId:string;email:string;provider:Provider;expires:number};
const pending=new Map<string,Pending>();

export const mailboxSchemas={
 email:z.object({email:z.email()}),
 start:z.object({email:z.email(),provider:z.enum(['google','microsoft']).optional()}),
 smtp:z.object({email:z.email(),host:z.string().min(1),port:z.number().int().min(1).max(65535),
  user:z.string().min(1),pass:z.string().min(1)}),
 test:z.object({email:z.email(),to:z.email().optional()})
};

const findMailbox=(s:any,email:string)=>{
 const lower=email.toLowerCase();
 for(const d of s.domains)for(const m of d.mailboxes)if(m.email===lower)return {domain:d,mailbox:m};
 throw Error('Ящик не найден. Сначала добавьте его.');
};
const audit=(s:any,action:string)=>s.audit.unshift({id:randomBytes(8).toString('hex'),at:new Date().toISOString(),action});

/** Connecting a mailbox that was never added should still work; the flow starts from an address. */
function ensure(s:any,email:string){
 const lower=email.toLowerCase(),name=lower.split('@')[1];
 let domain=s.domains.find((d:any)=>d.name===name);
 if(!domain)s.domains.push(domain={id:randomBytes(8).toString('hex'),name,limit:0,used:0,dns:noDns(),mailboxes:[]});
 let mailbox=domain.mailboxes.find((m:any)=>m.email===lower);
 if(!mailbox)domain.mailboxes.push(mailbox=box(lower));
 return {domain,mailbox};
}

async function markConnection(accountId:string,email:string,connection:'oauth'|'smtp',provider:Provider){
 return change(accountId,s=>{const {domain,mailbox}=ensure(s,email);
  Object.assign(mailbox,{provider,connection,connectedAt:new Date().toISOString(),
   testSend:{status:'none',at:null,detail:''}});
  audit(s,`Ящик ${email} подключён (${connection==='oauth'?'OAuth':'SMTP'}, ${provider}). Требуется тестовая отправка.`);
  return {mailbox,domain:{id:domain.id,name:domain.name},readiness:mailboxReadiness(domain,mailbox,s.stopped)};});
}

export const mailboxOperations={
 /** Detection only reports who serves the domain. It never marks anything connected. */
 detect:async(ctx:Ctx,input:unknown)=>{const {email}=mailboxSchemas.email.parse(input);
  const detection=await detectProvider(email);
  const apps=await appsFor(ctx.accountId);
  const route=detection.provider==='smtp'?'smtp':oauthReady(detection.provider,apps)?'oauth':'oauth-unconfigured';
  return {...detection,route,
   oauthConfigured:detection.provider!=='smtp'&&oauthReady(detection.provider,apps),
   redirectUri:redirectUri()};},

 /** Builds the provider consent URL. The mailbox stays unconnected until the callback succeeds. */
 startOauth:async(ctx:Ctx,input:unknown)=>{const {email,provider}=mailboxSchemas.start.parse(input);
  const detection=await detectProvider(email);
  // A mail security gateway in front of the domain hides the real provider, so the operator may say which it is.
  const chosen=provider??detection.provider;
  if(chosen==='smtp')throw Error('Для этого домена OAuth недоступен. Используйте SMTP или укажите провайдера вручную.');
  const config=oauthConfig(chosen,await appsFor(ctx.accountId));
  if(!config)throw Error(`OAuth для ${chosen} не настроен в аккаунте: заполните client id и secret в настройках.`);
  const state=randomBytes(24).toString('base64url');
  pending.set(state,{accountId:ctx.accountId,email:email.toLowerCase(),provider:chosen,expires:Date.now()+900000});
  const url=new URL(config.authorize);
  url.searchParams.set('client_id',config.clientId);
  url.searchParams.set('redirect_uri',redirectUri());
  url.searchParams.set('response_type','code');
  url.searchParams.set('scope',config.scope);
  url.searchParams.set('state',state);
  url.searchParams.set('login_hint',email);
  if(chosen==='google'&&detection.workspace)url.searchParams.set('hd',detection.domain);
  for(const [k,v] of Object.entries(config.extra))url.searchParams.set(k,v);
  return {url:url.toString(),provider:chosen,email};},

 /** Reached from the provider redirect, which carries no session; the state links it to an account. */
 completeOauth:async(code:string,state:string)=>{
  const entry=pending.get(state);pending.delete(state);
  if(!entry||entry.expires<Date.now())throw Error('Ссылка подключения устарела. Начните заново.');
  const tokens=await exchangeCode(entry.provider,code,redirectUri(),await appsFor(entry.accountId));
  await setAuth(secretKey(entry.accountId,entry.email),{kind:'oauth',provider:entry.provider,email:entry.email,
   refreshToken:tokens.refreshToken,scope:tokens.scope,at:new Date().toISOString()});
  await markConnection(entry.accountId,entry.email,'oauth',entry.provider);
  return {email:entry.email,provider:entry.provider};},

 connectSmtp:async(ctx:Ctx,input:unknown)=>{const body=mailboxSchemas.smtp.parse(input);
  const secret={kind:'smtp',provider:'smtp' as Provider,email:body.email.toLowerCase(),
   host:body.host,port:body.port,user:body.user,pass:body.pass};
  await verifySmtp(secret);
  await setAuth(secretKey(ctx.accountId,secret.email),{...secret,at:new Date().toISOString()});
  return markConnection(ctx.accountId,secret.email,'smtp','smtp');},

 /** The only proof a mailbox works: one real message through the connected account. */
 testSend:async(ctx:Ctx,input:unknown)=>{const {email,to}=mailboxSchemas.test.parse(input);
  findMailbox(await read(ctx.accountId),email);
  const secret=await getAuth<any>(secretKey(ctx.accountId,email));
  if(!secret)throw Error('Ящик не подключён. Сначала подключите его через OAuth или SMTP.');
  const target=(to??email).toLowerCase();
  const subject='Sendina — тестовая отправка';
  const text=`Это тестовое письмо Sendina.\n\nОно подтверждает, что ящик ${email} действительно может отправлять почту.\nНикаких адресатов кампании оно не затрагивает.`;
  let result:{status:'ok'|'failed';detail:string};
  try{const sent=await sendMessage(secret,target,subject,text,await appsFor(ctx.accountId));
   result={status:'ok',detail:`Доставлено через ${sent.via}`};}
  catch(e:any){result={status:'failed',detail:String(e.message).slice(0,300)};}
  return change(ctx.accountId,s=>{const {domain,mailbox}=findMailbox(s,email);
   mailbox.testSend={status:result.status,at:new Date().toISOString(),detail:result.detail};
   audit(s,`Тестовая отправка ${email}: ${result.status==='ok'?'успешно':'ошибка'}. ${result.detail}`);
   const box=mailboxReadiness(domain,mailbox,s.stopped);
   return {email,testSend:mailbox.testSend,readiness:box,
    domainReadiness:domainReadiness(domain,s.stopped),ready:box.ready};});},

 disconnect:async(ctx:Ctx,input:unknown)=>{const {email}=mailboxSchemas.email.parse(input);
  await setAuth(secretKey(ctx.accountId,email),null);
  return change(ctx.accountId,s=>{const {domain,mailbox}=findMailbox(s,email);
   Object.assign(mailbox,{connection:'none',connectedAt:null,testSend:{status:'none',at:null,detail:''}});
   audit(s,`Ящик ${email} отключён.`);
   return {mailbox,readiness:mailboxReadiness(domain,mailbox,s.stopped)};});},

 /** Readiness of every domain and mailbox, with the full list of what is still missing. */
 status:async(ctx:Ctx)=>{const s=await read(ctx.accountId);
  return {stopped:s.stopped,domains:s.domains.map((d:any)=>({id:d.id,name:d.name,dns:d.dns,
   readiness:domainReadiness(d,s.stopped),
   mailboxes:d.mailboxes.map((m:any)=>({...m,readiness:mailboxReadiness(d,m,s.stopped)}))}))};}
};
