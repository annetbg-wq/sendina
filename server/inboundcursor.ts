import type {Incoming} from './imap';
import {oauthConfig,type MailApps,type Provider} from './mailproviders';

export type InboundCursor={provider:Provider;value:string};
export type IncrementalIncoming={messages:Incoming[];cursor:InboundCursor|null;reset:boolean};

const providerUrl=(url:string)=>{const base=process.env.MAIL_PROVIDER_BASE_URL;
 if(!base)return url;const parsed=new URL(url);return new URL(parsed.pathname+parsed.search,base).toString();};

async function accessToken(provider:Exclude<Provider,'smtp'>,refreshToken:string,apps:MailApps){
 const config=oauthConfig(provider,apps);
 if(!config)throw Error('OAuth для этого провайдера не настроен платформой Sendina.');
 const r=await fetch(config.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken,
   client_id:config.clientId,client_secret:config.clientSecret})});
 const data=await r.json();
 if(!r.ok)throw Error(`Не удалось обновить токен: ${data.error_description??data.error??r.status}`);
 return String(data.access_token);
}

const gmailText=(payload:any):string=>{
 if(!payload)return '';
 if(payload.mimeType==='text/plain'&&payload.body?.data)
  return Buffer.from(String(payload.body.data),'base64url').toString('utf8');
 for(const part of payload.parts??[]){const found=gmailText(part);if(found)return found;}
 if(payload.body?.data)return Buffer.from(String(payload.body.data),'base64url').toString('utf8');
 return '';
};

async function gmailMessage(id:string,auth:Record<string,string>):Promise<Incoming|null>{
 const r=await fetch(providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`),{headers:auth});
 if(!r.ok)return null;
 const message=await r.json();
 const headers:Record<string,string>={};
 for(const h of message?.payload?.headers??[])headers[String(h.name).toLowerCase()]=String(h.value);
 return {uid:0,from:(headers.from?.match(/<([^>]+)>/)?.[1]??headers.from??'').toLowerCase(),
  subject:headers.subject??'',text:gmailText(message?.payload),
  messageId:headers['message-id']??'',inReplyTo:headers['in-reply-to']??'',
  references:(headers.references??'').split(/\s+/).filter(Boolean),
  at:new Date(Number(message?.internalDate??Date.now())).toISOString(),
  providerId:String(message?.id??id),threadId:String(message?.threadId??'')};
}

async function gmailInitial(auth:Record<string,string>,limit:number):Promise<IncrementalIncoming>{
 const profile=await fetch(providerUrl('https://gmail.googleapis.com/gmail/v1/users/me/profile'),{headers:auth});
 if(!profile.ok)throw Error(`Gmail не отдал профиль: ${(await profile.text()).slice(0,200)}`);
 const historyId=String((await profile.json())?.historyId??'');
 const list=await fetch(providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}`),{headers:auth});
 if(!list.ok)throw Error(`Gmail не отдал входящие: ${(await list.text()).slice(0,200)}`);
 const ids=((await list.json())?.messages??[]).map((m:any)=>String(m.id));
 const out:(Incoming|null)[]=[];
 for(const id of ids.slice(0,limit))out.push(await gmailMessage(id,auth));
 return {messages:out.filter(Boolean) as Incoming[],cursor:historyId?{provider:'google',value:historyId}:null,reset:true};
}

async function gmailHistory(auth:Record<string,string>,cursor:string,limit:number):Promise<IncrementalIncoming>{
 let url=providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&maxResults=${limit}`);
 const ids:string[]=[];let latest=cursor;
 for(let page=0;page<20&&url;page++){
  const r=await fetch(url,{headers:auth});
  if(r.status===404)return gmailInitial(auth,limit);
  if(!r.ok)throw Error(`Gmail History API отказал: ${(await r.text()).slice(0,200)}`);
  const data=await r.json();latest=String(data?.historyId??latest);
  for(const h of data?.history??[])for(const added of h?.messagesAdded??[]){const id=String(added?.message?.id??'');if(id&&!ids.includes(id))ids.push(id);}
  const next=String(data?.nextPageToken??'');
  url=next?providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&maxResults=${limit}&pageToken=${encodeURIComponent(next)}`):'';
 }
 const out:(Incoming|null)[]=[];
 for(const id of ids.slice(-limit))out.push(await gmailMessage(id,auth));
 return {messages:out.filter(Boolean) as Incoming[],cursor:{provider:'google',value:latest},reset:false};
}

function graphMessage(m:any):Incoming{return {uid:0,
 from:String(m?.from?.emailAddress?.address??'').toLowerCase(),subject:String(m?.subject??''),
 text:String(m?.body?.content??m?.bodyPreview??''),messageId:String(m?.internetMessageId??''),inReplyTo:'',references:[],
 at:String(m?.receivedDateTime??new Date().toISOString()),providerId:String(m?.id??''),threadId:String(m?.conversationId??'')};}

async function graphDelta(auth:Record<string,string>,cursor:string|undefined,limit:number):Promise<IncrementalIncoming>{
 let url=cursor||providerUrl(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$top=${limit}`);
 const out:Incoming[]=[];let delta='';let reset=!cursor;
 for(let page=0;page<20&&url;page++){
  const r=await fetch(url,{headers:auth});
  if(r.status===410&&cursor){url=providerUrl(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$top=${limit}`);reset=true;continue;}
  if(!r.ok)throw Error(`Microsoft Graph delta отказал: ${(await r.text()).slice(0,200)}`);
  const data=await r.json();
  for(const m of data?.value??[])if(!m?.['@removed'])out.push(graphMessage(m));
  const next=String(data?.['@odata.nextLink']??'');
  delta=String(data?.['@odata.deltaLink']??delta);
  url=next?providerUrl(next):'';
 }
 return {messages:out.slice(-limit),cursor:delta?{provider:'microsoft',value:delta}:null,reset};
}

/** Incremental HTTPS-only mailbox reader. SMTP/IMAP deliberately stays on its legacy UID path. */
export async function readIncrementalIncoming(secret:any,apps:MailApps,cursor:InboundCursor|null,limit=50):Promise<IncrementalIncoming>{
 if(secret?.kind!=='oauth'||!['google','microsoft'].includes(secret.provider))throw Error('Incremental provider cursor доступен только для Google и Microsoft OAuth.');
 const provider=secret.provider as 'google'|'microsoft';
 const token=await accessToken(provider,secret.refreshToken,apps);
 const auth={Authorization:`Bearer ${token}`};
 if(provider==='google')return cursor?.provider==='google'&&cursor.value?gmailHistory(auth,cursor.value,limit):gmailInitial(auth,limit);
 return graphDelta(auth,cursor?.provider==='microsoft'?cursor.value:undefined,limit);
}
