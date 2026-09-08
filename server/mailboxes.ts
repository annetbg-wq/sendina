import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {read,change} from './store';
import {noDns,box} from './seed';
import {getAuth,setAuth} from './authstore';
import {publicAddress} from './config';
import {accountSettings} from './accountsettings';
import type {Ctx} from './context';
import {detectProvider,oauthConfig,oauthReady,exchangeCode,sendMessage,verifyAccess,verifyIncomingChannel,readIncoming,type Provider,type MailApps} from './mailproviders';
import {guessMailSettings,providerFallback,type MailSettings} from './autoconfig';
import {platformSettings,resolveMailApps,appOwner} from './platform';
import {sealFields,openFields} from './secrets';
import {mailboxReadiness,domainReadiness} from './readiness';
import {withTimeout,budget,limits,PhaseTimeout} from './timeout';
import {issueMailOauthState,consumeMailOauthState} from './oauthstate';
import {readIncrementalIncoming,type InboundCursor} from './inboundcursor';

/** Credentials live in the auth store, never in the workspace state the UI can read. */
const secretKey=(accountId:string,email:string)=>`mailbox:${accountId}:${email.toLowerCase()}`;
export const redirectUri=()=>`${publicAddress(process.env)}/oauth/mailbox/callback`;

/** Platform applications win, so most people never see a client id at all. */
const appsFor=async(accountId:string):Promise<MailApps>=>{
 const s=await accountSettings(accountId);
 return resolveMailApps(await platformSettings(),{google:s.google,microsoft:s.microsoft});
};
const secretFields=['pass','refreshToken'];
const putSecret=async(accountId:string,email:string,secret:any)=>setAuth(secretKey(accountId,email),await sealFields(secret,secretFields));
const getSecret=async(accountId:string,email:string)=>{
 const stored=await getAuth<any>(secretKey(accountId,email));
 return stored?openFields(stored,secretFields):null;
};

/** Waits for one specific message to come back, whichever way this mailbox receives mail.
    Polling stops at the deadline rather than after a fixed number of tries, so a slow mailbox
    gets the time it has and a dead one never holds the request open past the budget. */
async function awaitMarker(secret:any,apps:MailApps,marker:string,allowedMs:number){
 const attempts=Number(process.env.VERIFY_ATTEMPTS??6);
 const delay=Number(process.env.VERIFY_DELAY_MS??2500);
 const window=budget(allowedMs);
 let last:any=null;
 for(let attempt=0;attempt<attempts&&!window.expired();attempt++){
  try{
   const messages=await withTimeout('incoming',window.spend(limits().phase),()=>readIncoming(secret,apps,30));
   const found=messages.find(m=>m.subject.includes(marker)||m.text.includes(marker));
   if(found)return found;
  }catch(e:any){last=e;}
  if(window.remaining()>delay)await new Promise(r=>setTimeout(r,delay));
 }
 if(last)throw last;
 return null;
}

export const mailboxSchemas={
 email:z.object({email:z.email()}),
 start:z.object({email:z.email(),provider:z.enum(['google','microsoft']).optional()}),
 server:z.object({host:z.string().min(1),port:z.number().int().min(1).max(65535),secure:z.boolean().default(true)}),
 test:z.object({email:z.email(),to:z.email().optional()}),
 sync:z.object({email:z.email(),limit:z.number().int().min(1).max(100).default(30)}),
 connect:z.object({email:z.email(),
  smtp:z.object({host:z.string().min(1),port:z.number().int().min(1).max(65535),secure:z.boolean().default(true)}),
  imap:z.object({host:z.string().min(1),port:z.number().int().min(1).max(65535),secure:z.boolean().default(true)}),
  user:z.string().min(1).optional(),pass:z.string().min(1),
  source:z.string().max(40).optional(),label:z.string().max(160).optional()})
};

const findMailbox=(s:any,email:string)=>{
 const lower=email.toLowerCase();
 for(const d of s.domains)for(const m of d.mailboxes)if(m.email===lower)return {domain:d,mailbox:m};
 throw Error('Ящик не найден. Сначала добавьте его.');
};
const audit=(s:any,action:string)=>s.audit.unshift({id:randomBytes(8).toString('hex'),at:new Date().toISOString(),action});

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

const rules:[RegExp,string][]=[
 [/отпиш|отписаться|unsubscribe|remove me/i,'unsubscribe'],
 [/не интерес|не актуал|not interested|no thanks|откажем/i,'negative'],
 [/недостав|undeliverable|delivery failed|mailer-daemon/i,'bounce'],
 [/автоответ|out of office|automatic reply|отпуск/i,'automatic'],
 [/перешл|обратитесь к|forwarding you|my colleague|коллег/i,'referral'],
 [/позже|позднее|next quarter|later|через месяц/i,'later'],
 [/интересно|давайте|готовы обсудить|встреч|meeting|interested|call/i,'positive'],
 [/сколько стоит|цена|как именно|подробн|question|уточн/i,'neutral']
];
export const classify=(text:string)=>rules.find(([pattern])=>pattern.test(text))?.[1]??'neutral';

export type SenderCredentials={secret:any;apps:MailApps;email:string};
export async function senderCredentials(accountId:string,email:string):Promise<SenderCredentials|null>{
 const secret=await getSecret(accountId,email);
 if(!secret)return null;
 return {secret,apps:await appsFor(accountId),email:email.toLowerCase()};
}

export async function sendThrough(credentials:SenderCredentials,to:string,subject:string,text:string){
 return withTimeout('send',limits().phase,
  ()=>sendMessage(credentials.secret,to,subject,text,credentials.apps));
}

export type StepName='auth'|'testSend'|'imap'|'incoming';
export const stepLabels:Record<StepName,string>={auth:'вход',testSend:'отправка',imap:'приём',incoming:'чтение'};
type Check={status:'ok'|'failed';detail:string;code:string;ms:number};
const skipped=(_name:StepName,detail:string,code:string):Check=>({status:'failed',detail,code,ms:0});

const reasonOf=(e:any):string=>{
 const text=String(e?.message??e).toLowerCase();
 const code=String(e?.code??'');
 if(['ETIMEDOUT','ESOCKETTIMEDOUT','ETIMEOUT'].includes(code)||text.includes('timeout'))return 'TIMEOUT';
 if(code==='ECONNREFUSED'||text.includes('econnrefused'))return 'CONNECTION_REFUSED';
 if(['ENOTFOUND','EAI_AGAIN'].includes(code)||text.includes('enotfound'))return 'HOST_NOT_FOUND';
 if(code==='EAUTH'||text.includes('invalid credentials')||text.includes('authenticationfailed')
  ||text.includes('username and password')||text.includes('535'))return 'AUTH_REJECTED';
 if(code==='ESOCKET'||text.includes('certificate')||text.includes('tls'))return 'TLS_FAILED';
 return 'FAILED';
};

export const mailboxOperations={
 detect:async(ctx:Ctx,input:unknown)=>{const {email}=mailboxSchemas.email.parse(input);
  const detection=await detectProvider(email);
  const platform=await platformSettings();
  const account=await accountSettings(ctx.accountId);
  const own={google:account.google,microsoft:account.microsoft};
  const apps=resolveMailApps(platform,own);
  if(detection.provider!=='smtp'){
   const owner=appOwner(platform,own,detection.provider);
   const configured=owner!=='none';
   return {...detection,route:configured?'oauth':'oauth-unconfigured',appOwner:owner,
    oauthConfigured:oauthReady(detection.provider,apps),
    settings:providerFallback(detection.provider),advancedOnly:!configured,
    blocker:configured?null:{
     code:'PLATFORM_OAUTH_APP_MISSING',
     message:`Приложение ${detection.provider==='google'?'Google':'Microsoft'} OAuth платформы не настроено.`,
     forSuperadmin:`OAuth-приложение ${detection.provider==='google'?'Google':'Microsoft'} платформы не настроено.`,
     where:{screen:'Аккаунты',section:'Приложения платформы',
      field:detection.provider==='google'?'Google client ID и client secret':'Microsoft client ID и client secret',
      redirectUri:redirectUri()}},
    redirectUri:redirectUri()};
  }
  let settings:MailSettings|null=null;
  try{settings=await withTimeout('detect',limits().phase,signal=>guessMailSettings(detection.domain,detection.mx,signal));}
  catch{settings=null;}
  return {...detection,route:settings?'auto':'manual',appOwner:'none',advancedOnly:false,blocker:null,
   oauthConfigured:false,settings,redirectUri:redirectUri()};},

 startOauth:async(ctx:Ctx,input:unknown)=>{const {email,provider}=mailboxSchemas.start.parse(input);
  const detection=await detectProvider(email);
  const chosen=provider??detection.provider;
  if(chosen==='smtp')throw Error('Для этого домена OAuth недоступен. Используйте SMTP или укажите провайдера вручную.');
  const config=oauthConfig(chosen,await appsFor(ctx.accountId));
  if(!config)throw Error(`OAuth для ${chosen} не настроен платформой Sendina.`);
  const state=await issueMailOauthState({accountId:ctx.accountId,email,provider:chosen});
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

 completeOauth:async(code:string,state:string)=>{
  const entry=await consumeMailOauthState(state);
  if(!entry)throw Error('Ссылка подключения устарела или уже использована. Начните заново.');
  const tokens=await exchangeCode(entry.provider,code,redirectUri(),await appsFor(entry.accountId));
  await putSecret(entry.accountId,entry.email,{kind:'oauth',provider:entry.provider,email:entry.email,
   refreshToken:tokens.refreshToken,scope:tokens.scope,at:new Date().toISOString()});
  await markConnection(entry.accountId,entry.email,'oauth',entry.provider);
  return {email:entry.email,provider:entry.provider};},

 connectMailbox:async(ctx:Ctx,input:unknown)=>{const body=mailboxSchemas.connect.parse(input);
  const email=body.email.toLowerCase();
  const secret={kind:'smtp',provider:'smtp' as Provider,email,
   host:body.smtp.host,port:body.smtp.port,secure:body.smtp.secure,
   user:body.user||email,pass:body.pass,
   imapHost:body.imap.host,imapPort:body.imap.port,imapSecure:body.imap.secure,imapUser:body.user||email,
   at:new Date().toISOString()};
  await putSecret(ctx.accountId,email,secret);
  await change(ctx.accountId,s=>{const {mailbox}=ensure(s,email);
   Object.assign(mailbox,{provider:'smtp',connection:'smtp',connectedAt:new Date().toISOString(),
    transport:{smtp:body.smtp,imap:body.imap,source:body.source??'manual',label:body.label??'Указано вручную'},
    auth:{status:'none',at:null,detail:''},testSend:{status:'none',at:null,detail:''},
    imap:{status:'none',at:null,detail:''},incoming:{status:'none',at:null,detail:''}});
   audit(s,`Ящик ${email} подключён (SMTP ${body.smtp.host}, IMAP ${body.imap.host}). Идёт проверка.`);});
  return mailboxOperations.verify(ctx,{email});},

 verify:async(ctx:Ctx,input:unknown)=>{const {email}=mailboxSchemas.email.parse(input);
  findMailbox(await read(ctx.accountId),email);
  const secret=await getSecret(ctx.accountId,email);
  if(!secret)throw Error('Ящик не подключён. Сначала подключите его.');
  const apps=await appsFor(ctx.accountId);
  const marker=`SND-${randomBytes(5).toString('hex').toUpperCase()}`;
  const cap=limits();
  const whole=budget(cap.total);
  const results:Record<string,Check>={};
  const step=async(name:StepName,want:number,run:()=>Promise<string>)=>{
   const allowed=whole.spend(want);
   if(allowed<=0){results[name]=skipped(name,'Проверка исчерпала общее время.','BUDGET_EXHAUSTED');return false;}
   const started=Date.now();
   try{
    const detail=await withTimeout(name,allowed,()=>run());
    results[name]={status:'ok',detail:detail.slice(0,300),code:'OK',ms:Date.now()-started};
    return true;
   }catch(e:any){
    results[name]={status:'failed',detail:String(e?.message??e).slice(0,300),
     code:e instanceof PhaseTimeout?'TIMEOUT':reasonOf(e),ms:Date.now()-started};
    return false;
   }
  };

  const authOk=await step('auth',cap.phase,()=>verifyAccess(secret,apps));
  if(!authOk)for(const name of ['testSend','imap','incoming'] as StepName[])
   results[name]??=skipped(name,'Пропущено: вход в ящик не прошёл.','SKIPPED');
  const sendOk=authOk&&await step('testSend',cap.phase,async()=>{
   const sent=await sendMessage(secret,email,`Sendina — проверка ${marker}`,
    `Проверка ящика ${email}. Код ${marker}.

Это письмо подтверждает отправку и приём. Адресатов кампаний оно не затрагивает.`,apps);
   return `Отправлено через ${sent.via}`;});
  const channelOk=authOk&&await step('imap',cap.phase,()=>verifyIncomingChannel(secret,apps));
  if(authOk){
   if(sendOk&&channelOk)await step('incoming',cap.readback,async()=>{
    const found=await awaitMarker(secret,apps,marker,whole.spend(cap.readback));
    if(!found)throw Error(`Тестовое письмо ${marker} не появилось во входящих за отведённое время. Проверьте приём почты.`);
    return `Входящее письмо ${marker} прочитано`;});
   else results.incoming=skipped('incoming','Пропущено: отправка или приём не прошли.','SKIPPED');
  }

  const order:StepName[]=['auth','testSend','imap','incoming'];
  const failed=order.find(name=>results[name]?.status!=='ok')??null;
  return change(ctx.accountId,s=>{const {domain,mailbox}=findMailbox(s,email);
   const at=new Date().toISOString();
   for(const [name,value] of Object.entries(results))mailbox[name]={...value,at};
   const box=mailboxReadiness(domain,mailbox,s.stopped);
   audit(s,`Проверка ящика ${email}: ${order.map(k=>`${stepLabels[k]} ${results[k]?.status==='ok'?'ok':results[k]?.code??'failed'}`).join(', ')}.`);
   return {email,checks:results,readiness:box,ready:box.ready,
    outcome:failed?'failed':'ok',failedStep:failed,
    failedStepLabel:failed?stepLabels[failed]:'',
    reason:failed?results[failed].code:'OK',
    domainReadiness:domainReadiness(domain,s.stopped)};});},

 testSend:async(ctx:Ctx,input:unknown)=>{const {email,to}=mailboxSchemas.test.parse(input);
  findMailbox(await read(ctx.accountId),email);
  const secret=await getSecret(ctx.accountId,email);
  if(!secret)throw Error('Ящик не подключён. Сначала подключите его через OAuth или SMTP.');
  const target=(to??email).toLowerCase();
  const cap=limits();
  let result:{status:'ok'|'failed';detail:string;code:string};
  const started=Date.now();
  try{const apps=await appsFor(ctx.accountId);
   const sent=await withTimeout('testSend',cap.phase,()=>sendMessage(secret,target,'Sendina — тестовая отправка',
    `Это тестовое письмо Sendina.

Оно подтверждает, что ящик ${email} действительно может отправлять почту.
Никаких адресатов кампании оно не затрагивает.`,apps));
   result={status:'ok',detail:`Доставлено через ${sent.via}`,code:'OK'};}
  catch(e:any){result={status:'failed',detail:String(e?.message??e).slice(0,300),
   code:e instanceof PhaseTimeout?'TIMEOUT':reasonOf(e)};}
  const spent=Date.now()-started;
  return change(ctx.accountId,s=>{const {domain,mailbox}=findMailbox(s,email);
   mailbox.testSend={status:result.status,at:new Date().toISOString(),detail:result.detail,code:result.code,ms:spent};
   const box=mailboxReadiness(domain,mailbox,s.stopped);
   audit(s,`Тестовая отправка ${email}: ${result.status==='ok'?'успешно':'ошибка'}. ${result.detail}`);
   return {email,testSend:mailbox.testSend,readiness:box,ready:box.ready,
    outcome:result.status==='ok'?'ok':'failed',reason:result.code,
    failedStep:result.status==='ok'?null:'testSend',
    failedStepLabel:result.status==='ok'?'':stepLabels.testSend,
    domainReadiness:domainReadiness(domain,s.stopped)};});},

 disconnect:async(ctx:Ctx,input:unknown)=>{const {email}=mailboxSchemas.email.parse(input);
  await setAuth(secretKey(ctx.accountId,email),null);
  return change(ctx.accountId,s=>{const {domain,mailbox}=findMailbox(s,email);
   Object.assign(mailbox,{connection:'none',connectedAt:null,testSend:{status:'none',at:null,detail:''},incomingCursor:null});
   audit(s,`Ящик ${email} отключён.`);
   return {mailbox,readiness:mailboxReadiness(domain,mailbox,s.stopped)};});},

 syncReplies:async(ctx:Ctx,input:unknown)=>{const {email,limit}=mailboxSchemas.sync.parse(input);
  const before=await read(ctx.accountId);
  const {mailbox:beforeMailbox}=findMailbox(before,email);
  const secret=await getSecret(ctx.accountId,email);
  if(!secret)throw Error('Ящик не подключён. Сначала подключите его.');
  const apps=await appsFor(ctx.accountId);
  const providerCursor=beforeMailbox.incomingCursor as InboundCursor|null|undefined;
  const oauthIncremental=secret.kind==='oauth'&&['google','microsoft'].includes(secret.provider);
  const batch=oauthIncremental
   ?await readIncrementalIncoming(secret,apps,providerCursor??null,limit)
   :{messages:await readIncoming(secret,apps,limit),cursor:null as InboundCursor|null,reset:false};
  const messages=batch.messages;
  return change(ctx.accountId,s=>{const {mailbox}=findMailbox(s,email);
   let added=0,unmatched=0,highest=Number(mailbox.incomingUid??0),duplicates=0;
   for(const message of messages){
    if(message.uid>highest)highest=message.uid;
    const from=message.from.toLowerCase();
    if(!from||from===email.toLowerCase())continue;
    const providerEventId=message.providerId?`${mailbox.provider}:${message.providerId}`:'';
    const eventId=providerEventId||message.messageId||`${email}:${message.uid}`;
    const duplicate=s.replies.some((r:any)=>r.id===eventId||
      (message.messageId&&(r.id===message.messageId||r.messageId===message.messageId))||
      (message.providerId&&r.providerId===message.providerId&&r.provider===mailbox.provider));
    if(duplicate){duplicates++;continue;}
    const contact=s.contacts.find((c:any)=>c.email===from);
    const campaignId=contact?.campaignId??s.messages.find((m:any)=>m.email===from)?.campaignId;
    if(!campaignId){unmatched++;continue;}
    const campaign=s.campaigns.find((c:any)=>c.id===campaignId);
    if(!campaign){unmatched++;continue;}
    const category=classify(`${message.subject}
${message.text}`);
    s.replies.unshift({id:eventId,campaignId,email:from,text:message.text.slice(0,4000),
     category,name:contact?.name??from,company:contact?.company??'',at:message.at,
     inReplyTo:message.inReplyTo,messageId:message.messageId,providerId:message.providerId,
     provider:mailbox.provider,threadId:message.threadId,source:'inbox',auto:true} as any);
    if(['unsubscribe','negative'].includes(category)&&!s.suppressed.includes(from))s.suppressed.push(from);
    if(category==='positive')campaign.positive++;
    added++;
   }
   mailbox.incomingUid=highest;
   if(oauthIncremental)mailbox.incomingCursor=batch.cursor;
   if(added||unmatched||duplicates||batch.reset)audit(s,`Приём ответов ${email}: добавлено ${added}, дубли ${duplicates}, без совпадения ${unmatched}${batch.reset?', курсор переустановлен':''}.`);
   return {email,added,duplicates,unmatched,scanned:messages.length,cursorAdvanced:oauthIncremental&&Boolean(batch.cursor),reset:batch.reset};});},

 status:async(ctx:Ctx)=>{const s=await read(ctx.accountId);
  return {stopped:s.stopped,domains:s.domains.map((d:any)=>({id:d.id,name:d.name,dns:d.dns,
   readiness:domainReadiness(d,s.stopped),
   mailboxes:d.mailboxes.map((m:any)=>({...m,readiness:mailboxReadiness(d,m,s.stopped)}))}))};}
};