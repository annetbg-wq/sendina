import {resolveMx} from 'node:dns/promises';
import nodemailer from 'nodemailer';

export type Provider='google'|'microsoft'|'smtp';
export type Detection={email:string;domain:string;provider:Provider;workspace:boolean;personal:boolean;mx:string[];note:string};

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
/** The OAuth application belongs to the account, so each workspace connects under its own client. */
export function oauthConfig(provider:Provider,apps:MailApps):OauthConfig|null{
 if(provider==='google'){
  const {clientId,clientSecret}=apps.google;
  if(!clientId||!clientSecret)return null;
  return {authorize:providerUrl('https://accounts.google.com/o/oauth2/v2/auth'),token:providerUrl('https://oauth2.googleapis.com/token'),
   scope:'https://www.googleapis.com/auth/gmail.send email',clientId,clientSecret,
   extra:{access_type:'offline',prompt:'consent'}};
 }
 if(provider==='microsoft'){
  const {clientId,clientSecret}=apps.microsoft;
  if(!clientId||!clientSecret)return null;
  const tenant=apps.microsoft.tenant||'common';
  return {authorize:providerUrl(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`),
   token:providerUrl(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`),
   scope:'https://graph.microsoft.com/Mail.Send offline_access openid email',clientId,clientSecret,
   extra:{prompt:'consent'}};
 }
 return null;
}
export const oauthReady=(provider:Provider,apps:MailApps)=>Boolean(oauthConfig(provider,apps));

export async function exchangeCode(provider:Provider,code:string,redirectUri:string,apps:MailApps){
 const config=oauthConfig(provider,apps);
 if(!config)throw Error('OAuth для этого провайдера не настроен в аккаунте.');
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
 if(!config)throw Error('OAuth для этого провайдера не настроен в аккаунте.');
 const r=await fetch(config.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken,
   client_id:config.clientId,client_secret:config.clientSecret})});
 const data=await r.json();
 if(!r.ok)throw Error(`Не удалось обновить токен: ${data.error_description??data.error??r.status}`);
 return String(data.access_token);
}

const rfc822=(from:string,to:string,subject:string,text:string)=>
 [`From: ${from}`,`To: ${to}`,`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
  'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',
  Buffer.from(text).toString('base64')].join('\r\n');

/** Sends one real message through the connected account. Nothing else proves a mailbox works. */
export async function sendMessage(secret:any,to:string,subject:string,text:string,apps:MailApps){
 const from=secret.email as string;
 if(secret.kind==='oauth'){
  const token=await accessToken(secret.provider,secret.refreshToken,apps);
  if(secret.provider==='google'){
   const raw=Buffer.from(rfc822(from,to,subject,text)).toString('base64url');
   const r=await fetch(providerUrl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send'),
    {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({raw})});
   if(!r.ok)throw Error(`Gmail отклонил отправку: ${(await r.text()).slice(0,300)}`);
   return {id:String((await r.json()).id??''),via:'Gmail API'};
  }
  const r=await fetch(providerUrl('https://graph.microsoft.com/v1.0/me/sendMail'),
   {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({message:{subject,body:{contentType:'Text',content:text},
     toRecipients:[{emailAddress:{address:to}}]},saveToSentItems:true})});
  if(!r.ok)throw Error(`Microsoft Graph отклонил отправку: ${(await r.text()).slice(0,300)}`);
  return {id:'',via:'Microsoft Graph'};
 }
 const transport=nodemailer.createTransport({host:secret.host,port:secret.port,
  secure:secret.port===465,auth:{user:secret.user,pass:secret.pass}});
 const info=await transport.sendMail({from,to,subject,text});
 return {id:String(info.messageId??''),via:`SMTP ${secret.host}`};
}

export async function verifySmtp(secret:any){
 const transport=nodemailer.createTransport({host:secret.host,port:secret.port,
  secure:secret.port===465,auth:{user:secret.user,pass:secret.pass}});
 await transport.verify();
}
