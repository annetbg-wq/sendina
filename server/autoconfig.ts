import {resolveSrv} from 'node:dns/promises';
import {providerOfMx} from './mailproviders';

/** Finds sending and receiving settings for a domain, so the person only ever types an address. */
export type ServerSettings={host:string;port:number;secure:boolean};
export type MailSettings={smtp:ServerSettings;imap:ServerSettings;usernameIsEmail:boolean;source:string;label:string};

/** MX host fragments that identify a provider whose settings are documented and stable. */
const knownProviders:{match:RegExp;label:string;smtp:ServerSettings;imap:ServerSettings;usernameIsEmail?:boolean}[]=[
 {match:/\.yandex\./,label:'Яндекс 360',smtp:{host:'smtp.yandex.ru',port:465,secure:true},imap:{host:'imap.yandex.ru',port:993,secure:true}},
 {match:/\.mail\.ru$|\.mxs\.mail\.ru$/,label:'Mail.ru для бизнеса',smtp:{host:'smtp.mail.ru',port:465,secure:true},imap:{host:'imap.mail.ru',port:993,secure:true}},
 {match:/zoho\./,label:'Zoho Mail',smtp:{host:'smtp.zoho.com',port:465,secure:true},imap:{host:'imap.zoho.com',port:993,secure:true}},
 {match:/messagingengine\.com$|fastmail/,label:'Fastmail',smtp:{host:'smtp.fastmail.com',port:465,secure:true},imap:{host:'imap.fastmail.com',port:993,secure:true}},
 {match:/secureserver\.net$/,label:'GoDaddy',smtp:{host:'smtpout.secureserver.net',port:465,secure:true},imap:{host:'imap.secureserver.net',port:993,secure:true}},
 {match:/\.hostinger\./,label:'Hostinger',smtp:{host:'smtp.hostinger.com',port:465,secure:true},imap:{host:'imap.hostinger.com',port:993,secure:true}},
 {match:/\.beget\./,label:'Beget',smtp:{host:'smtp.beget.com',port:465,secure:true},imap:{host:'imap.beget.com',port:993,secure:true}},
 {match:/\.timeweb\./,label:'Timeweb',smtp:{host:'smtp.timeweb.ru',port:465,secure:true},imap:{host:'imap.timeweb.ru',port:993,secure:true}},
 {match:/\.protonmail\.|proton\.me$/,label:'Proton Mail Bridge',smtp:{host:'127.0.0.1',port:1025,secure:false},imap:{host:'127.0.0.1',port:1143,secure:false}},
 {match:/\.improvmx\.com$/,label:'ImprovMX',smtp:{host:'smtp.improvmx.com',port:465,secure:true},imap:{host:'imap.improvmx.com',port:993,secure:true}}
];

const srvLookup=async(name:string)=>{
 try{const records=await resolveSrv(name);
  const usable=records.filter(r=>r.name&&r.name!=='.').sort((a,b)=>a.priority-b.priority);
  return usable[0]??null;}
 catch{return null;}
};

/** RFC 6186 service records, published by the domain itself. The most trustworthy source there is. */
async function fromSrv(domain:string):Promise<MailSettings|null>{
 const [submissions,submission,imaps]=await Promise.all([
  srvLookup(`_submissions._tcp.${domain}`),
  srvLookup(`_submission._tcp.${domain}`),
  srvLookup(`_imaps._tcp.${domain}`)]);
 const send=submissions??submission;
 if(!send||!imaps)return null;
 return {smtp:{host:send.name,port:send.port,secure:send.port===465},
  imap:{host:imaps.name,port:imaps.port,secure:true},
  usernameIsEmail:true,source:'srv',label:'Записи SRV домена'};
}

const base=()=>process.env.AUTOCONFIG_BASE_URL??'https://autoconfig.thunderbird.net/v1.1';
/** The Thunderbird database covers most hosting providers by domain name. */
async function fromDatabase(domain:string,signal?:AbortSignal):Promise<MailSettings|null>{
 try{
  const r=await fetch(`${base()}/${encodeURIComponent(domain)}`,{signal});
  if(!r.ok)return null;
  const xml=await r.text();
  const block=(kind:'smtp'|'imap')=>{
   const pattern=new RegExp(`<(?:outgoingServer|incomingServer)[^>]*type="${kind}"[^>]*>([\\s\\S]*?)</(?:outgoingServer|incomingServer)>`,'i');
   const found=xml.match(pattern)?.[1];
   if(!found)return null;
   const host=found.match(/<hostname>([^<]+)<\/hostname>/i)?.[1];
   const port=Number(found.match(/<port>(\d+)<\/port>/i)?.[1]);
   const socket=(found.match(/<socketType>([^<]+)<\/socketType>/i)?.[1]??'').toUpperCase();
   if(!host||!port)return null;
   return {host:host.trim(),port,secure:socket==='SSL'||port===465||port===993};
  };
  const smtp=block('smtp'),imap=block('imap');
  if(!smtp||!imap)return null;
  const username=xml.match(/<username>([^<]+)<\/username>/i)?.[1]??'%EMAILADDRESS%';
  return {smtp,imap,usernameIsEmail:!username.includes('%EMAILLOCALPART%'),
   source:'database',label:'База настроек Thunderbird'};
 }catch{return null;}
}

/** Providers recognised by their MX records, whose settings are published and stable. */
function fromKnownProvider(mx:string[]):MailSettings|null{
 const all=mx.join(' ').toLowerCase();
 const found=knownProviders.find(p=>p.match.test(all));
 if(!found)return null;
 return {smtp:found.smtp,imap:found.imap,usernameIsEmail:found.usernameIsEmail??true,
  source:'provider',label:found.label};
}

/** Last resort: the names almost every hosting panel uses. Offered, never assumed to work. */
function fromConvention(domain:string,mx:string[]):MailSettings|null{
 const host=mx.find(h=>/^mail\.|^smtp\./.test(h))??`mail.${domain}`;
 return {smtp:{host:host.replace(/^imap\./,'smtp.'),port:465,secure:true},
  imap:{host:host.replace(/^smtp\./,'imap.'),port:993,secure:true},
  usernameIsEmail:true,source:'convention',label:'Обычные имена узлов провайдера'};
}

export async function guessMailSettings(domain:string,mx:string[],signal?:AbortSignal):Promise<MailSettings|null>{
 if(providerOfMx(mx))return null; // Google and Microsoft are offered OAuth first, not a password form.
 return await fromSrv(domain)
  ??fromKnownProvider(mx)
  ??await fromDatabase(domain,signal)
  ??(mx.length?fromConvention(domain,mx):null);
}

/** Google and Microsoft are connected with one consent button, which is why `guessMailSettings`
    refuses to hand back a password form for them. But the button only exists once a superadmin
    has registered the platform application, and until then the advanced route is all there is —
    so the settings still have to be known. They are published and stable, and asking someone to
    type "smtp.gmail.com" into a box that could have filled itself is not a fallback, it is a
    dead end: this is the same answer, offered as the advanced way in rather than the first one. */
export function providerFallback(provider:'google'|'microsoft'|'smtp'):MailSettings|null{
 if(provider==='google')return {
  smtp:{host:'smtp.gmail.com',port:465,secure:true},
  imap:{host:'imap.gmail.com',port:993,secure:true},
  usernameIsEmail:true,source:'provider',
  label:'Gmail и Google Workspace. Нужен пароль приложения: обычный пароль аккаунта Google для SMTP не подходит.'};
 if(provider==='microsoft')return {
  // 587 with STARTTLS, which is why the encryption flag is carried separately from the port.
  smtp:{host:'smtp.office365.com',port:587,secure:false},
  imap:{host:'outlook.office365.com',port:993,secure:true},
  usernameIsEmail:true,source:'provider',
  label:'Microsoft 365. Требуется, чтобы в тенанте был разрешён вход по паролю (SMTP AUTH); иначе подключайтесь через Microsoft.'};
 return null;
}
