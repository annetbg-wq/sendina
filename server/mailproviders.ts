import {resolveMx} from 'node:dns/promises';
import nodemailer from 'nodemailer';
import {fetchIncoming,verifyImap,type Incoming,type ImapAccess} from './imap';
import {limits} from './timeout';
import {buildMime,toBase64Url,deterministicMessageId} from './mime';

export type Provider='google'|'microsoft'|'smtp';
export type Detection={email:string;domain:string;provider:Provider;workspace:boolean;personal:boolean;mx:string[];note:string};
export type SendOptions={html?:string;replyTo?:string;messageId?:string;inReplyTo?:string;references?:string[];threadId?:string};

/** Personal mail is a secondary test case; the product targets mailboxes on an organisation's domain. */
const personalDomains:Record<string,Provider>={'gmail.com':'google','googlemail.com':'google',
 'outlook.com':'microsoft','hotmail.com':'microsoft','live.com':'microsoft','msn.com':'microsoft'};

/** Exported so the mapping can be checked without a DNS lookup. */
export const providerOfMx=(hosts:string[]):Provider|null=>{
 const all=hosts.join(' ').toLowerCase();
 if(/(^|[. ])(aspmx|alt\d)?\.?l?\.?google(mail)?\.com/.test(all)||all.includes('googlemail.com')||all.includes('google.com'))return 'google';
 if(all.includes('protection.outlook.com')||all.includes('mail.protection.outlook.com')||all.includes('outlook.com'))return 'microsoft';
 return null;
};

/** Detection reads MX records. It says which provider serves the domain, not that anything is connected. */
export async function detectProvider(email:string):Promise<Detection>{
 const domain=email.split('@')[1]?.toLowerCase()??'';
 if(!domain)throw Error('Укажите адрес вида name@company.com');
 if(Object.hasOwn(personalDomains,domain))return {email,domain,provider:personalDomains[domain],workspace:false,personal:true,mx:[],
  note:'Личный ящик. Это вторичный тестовый случай: рабочий сценарий — корпоративный домен организации.'};
 let mx:string[]=[];
 try{mx=(await resolveMx(domain)).sort((a,b)=>a.priority-b.priority).map(r=>r.exchange.toLowerCase());}catch{mx=[];}
 const detected=mx.length?providerOfMx(mx):null;
 if(detected)return {email,domain,provider:detected,workspace:true,personal:false,mx,
  note:detected==='google'?'Домен обслуживается Google Workspace. Подключение через OAuth.':'Домен обслуживается Microsoft 365. Подключение через OAuth.'};
 return {email,domain,provider:'smtp',workspace:mx.length>0,personal:false,mx,
  note:mx.length?'Провайдер не распознан по MX. Подключение через SMTP.':'MX-записи не найдены. Подключение через SMTP, если домен принимает почту.'};
}

/** Tests point every provider endpoint at a local stub. */
const providerUrl=(url:string)=>{const base=process.env.MAIL_PROVIDER_BASE_URL;
 if(!base)return url;const parsed=new URL(url);return new URL(parsed.pathname+parsed.search,base).toString();};

export type MailApps={google:{clientId:string;clientSecret:string};microsoft:{clientId:string;clientSecret:string;tenant:string}};
type OauthConfig={authorize:string;token:string;scope:string;clientId:string;clientSecret:string;extra:Record<string,string>};
/** The OAuth applications are Sendina platform infrastructure. */
export function oauthConfig(provider:Provider,apps:MailApps):OauthConfig|null{
 if(provider==='google'){
  const {clientId,clientSecret}=apps.google;
  if(!clientId||!clientSecret)return null;
  return {authorize:providerUrl('https://accounts.google.com/o/oauth2/v2/auth'),token:providerUrl('https://oauth2.googleapis.com/token'),
   scope:'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly email',clientId,clientSecret,
   extra:{access_type:'offline',prompt:'consent'}};
 }
 if(provider==='microsoft'){
  const {clientId,clientSecret}=apps.microsoft;
  if(!clientId||!clientSecret)return null;
  const tenant=apps.microsoft.tenant||'common';
  return {authorize:providerUrl(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`),
   token:providerUrl(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`),
   scope:'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read offline_access openid email',clientId,clientSecret,
   extra:{prompt:'consent'}};
 }
 return null;
}
export const oauthReady=(provider:Provider,apps:MailApps)=>Boolean(oauthConfig(provider,apps));

export async function exchangeCode(provider:Provider,code:string,redirectUri:string,apps:MailApps){
 const config=oauthConfig(provider,apps);
 if(!config)throw Error('OAuth для этого провайдера не настроен платформой Sendina.');
 const r=await fetch(config.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirectUri,
   client_id:config.clientId,client_secret:config.clientSecret})});
 const data=await r.json();
 if(!r.ok)throw Error(`Провайдер отклонил обмен кода: ${data.error_description??data.error??r.status}`);
 if(!data.refresh_token)throw Error('Провайдер не выдал refresh token. Повторите подключение с запросом постоянного доступа.');
 return {refreshToken:String(data.refresh_token),accessToken:String(data.access_token??''),scope:String(data.scope??'')};
}

async function accessToken(provider:Provider,refreshToken:string,apps:MailApps){
 const config=oauthConfig(provider,apps);
 if(!config)throw Error('OAuth для этого провайдера не настроен платформой Sendina.');
 const r=await fetch(config.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken,
   client_id:config.clientId,client_secret:config.clientSecret})});
 const data=await r.json();
 if(!r.ok)throw Error(`Не удалось обновить токен: ${data.error_description??data.error??r.status}`);
 return String(data.access_token);
}

/** Sends one real message through the connected account. Nothing else proves a mailbox works. */
export async function sendMessage(secret:any,to:string,subject:string,text:string,apps:MailApps,options:SendOptions={}){
 const from=secret.email as string;
 const messageId=options.messageId||deterministicMessageId({from,to,subject,text});
 if(secret.kind==='oauth'){
  const token=await accessToken(secret.provider,secret.refreshToken,apps);
  if(secret.provider==='google'){
   const raw=toBase64Url(buildMime({from,to,subject,text,html:options.html,replyTo:options.replyTo,
    messageId,inReplyTo:options.inReplyTo,references:options.references}));
   const body:any={raw};
   if(options.threadId)body.threadId=options.threadId;
   const r=await fetch(providerUrl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send'),
    {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
   if(!r.ok)throw Error(`Gmail отклонил отправку: ${(await r.text()).slice(0,300)}`);
   const sent=await r.json();
   return {id:String(sent?.id??''),threadId:String(sent?.threadId??options.threadId??''),messageId,via:'Gmail API'};
  }
  /** Graph sendMail returns 202 with no response body. Supplying our own stable RFC Message-ID
      lets the reconciliation layer find the accepted message in Sent Items with Mail.Read. */
  const mime=buildMime({from,to,subject,text,html:options.html,replyTo:options.replyTo,
   messageId,inReplyTo:options.inReplyTo,references:options.references});
  const graphBody=Buffer.from(mime,'utf8').toString('base64');
  const r=await fetch(providerUrl('https://graph.microsoft.com/v1.0/me/sendMail'),
   {method:'POST',headers:{'Content-Type':'text/plain',Authorization:`Bearer ${token}`},body:graphBody});
  if(!r.ok)throw Error(`Microsoft Graph отклонил отправку: ${(await r.text()).slice(0,300)}`);
  return {id:'',threadId:'',messageId,via:'Microsoft Graph'};
 }
 const transport=smtpTransport(secret);
 const info=await transport.sendMail({from,to,subject,text,html:options.html,replyTo:options.replyTo,
  messageId,inReplyTo:options.inReplyTo,references:options.references});
 return {id:String(info.messageId??''),threadId:'',messageId:String(info.messageId??messageId),via:`SMTP ${secret.host}`};
}

/** One place that turns a stored credential into a transport, so the encryption flag the person
    actually chose is honoured. Reading it back off the port alone silently broke every provider
    that uses STARTTLS on 587. The timeouts are the transport's own, so a host that accepts the
    connection and then goes quiet fails here instead of hanging the request that is waiting. */
function smtpTransport(secret:any){
 const port=Number(secret.port);
 const secure=typeof secret.secure==='boolean'?secret.secure:port===465;
 const {phase}=limits();
 return nodemailer.createTransport({host:secret.host,port,secure,
  auth:{user:secret.user,pass:secret.pass},
  connectionTimeout:phase,greetingTimeout:phase,socketTimeout:phase});
}

export async function verifySmtp(secret:any){
 await smtpTransport(secret).verify();
}

/** Proves the credential works before anything is sent: a token refresh, or an SMTP login. */
export async function verifyAccess(secret:any,apps:MailApps){
 if(secret.kind==='oauth'){await accessToken(secret.provider,secret.refreshToken,apps);return 'Токен провайдера принят';}
 await verifySmtp(secret);
 return `SMTP ${secret.host} принял вход`;
}

const imapAccess=(secret:any):ImapAccess=>({host:secret.imapHost,port:Number(secret.imapPort),
 secure:secret.imapSecure!==false,user:secret.imapUser||secret.user,pass:secret.pass});

/** Confirms the incoming channel answers, whichever way this mailbox receives mail. */
export async function verifyIncomingChannel(secret:any,apps:MailApps){
 if(secret.kind==='oauth'){
  const messages=await readIncoming(secret,apps,1);
  return `Входящие ${secret.provider==='google'?'Gmail':'Microsoft Graph'} доступны (${messages.length})`;
 }
 if(!secret.imapHost)throw Error('IMAP не настроен для этого ящика.');
 const box=await verifyImap(imapAccess(secret));
 return `IMAP ${secret.imapHost}: писем во входящих ${box.messages}`;
}

/** One reading interface over IMAP, Gmail and Microsoft Graph. */
export async function readIncoming(secret:any,apps:MailApps,limit=25):Promise<Incoming[]>{
 if(secret.kind!=='oauth'){
  if(!secret.imapHost)throw Error('IMAP не настроен для этого ящика.');
  return fetchIncoming(imapAccess(secret),{limit,sinceUid:secret.sinceUid});
 }
 const token=await accessToken(secret.provider,secret.refreshToken,apps);
 const auth={Authorization:`Bearer ${token}`};
 if(secret.provider==='google'){
  const list=await fetch(providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}`),{headers:auth});
  if(!list.ok)throw Error(`Gmail не отдал входящие: ${(await list.text()).slice(0,200)}`);
  const ids=((await list.json())?.messages??[]).map((m:any)=>String(m.id));
  const out:Incoming[]=[];
  for(const id of ids.slice(0,limit)){
   const r=await fetch(providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`),{headers:auth});
   if(!r.ok)continue;
   const message=await r.json();
   const headers:Record<string,string>={};
   for(const h of message?.payload?.headers??[])headers[String(h.name).toLowerCase()]=String(h.value);
   out.push({uid:0,from:(headers.from?.match(/<([^>]+)>/)?.[1]??headers.from??'').toLowerCase(),
    subject:headers.subject??'',text:gmailText(message?.payload),
    messageId:headers['message-id']??'',inReplyTo:headers['in-reply-to']??'',
    references:(headers.references??'').split(/\s+/).filter(Boolean),
    at:new Date(Number(message?.internalDate??Date.now())).toISOString(),
    providerId:String(message?.id??id),threadId:String(message?.threadId??'')});
  }
  return out;
 }
 const r=await fetch(providerUrl(`https://graph.microsoft.com/v1.0/me/messages?$top=${limit}`),{headers:auth});
 if(!r.ok)throw Error(`Microsoft Graph не отдал входящие: ${(await r.text()).slice(0,200)}`);
 return ((await r.json())?.value??[]).map((m:any)=>({uid:0,
  from:String(m?.from?.emailAddress?.address??'').toLowerCase(),
  subject:String(m?.subject??''),text:String(m?.body?.content??m?.bodyPreview??''),
  messageId:String(m?.internetMessageId??''),inReplyTo:'',references:[],
  at:String(m?.receivedDateTime??new Date().toISOString()),
  providerId:String(m?.id??''),threadId:String(m?.conversationId??'')}));
}

/** Gmail delivers the body inside a MIME tree; the plain part is the one worth reading. */
function gmailText(payload:any):string{
 if(!payload)return '';
 if(payload.mimeType==='text/plain'&&payload.body?.data)
  return Buffer.from(String(payload.body.data),'base64url').toString('utf8');
 for(const part of payload.parts??[]){const found=gmailText(part);if(found)return found;}
 if(payload.body?.data)return Buffer.from(String(payload.body.data),'base64url').toString('utf8');
 return '';
}
