import type {Incoming} from './imap';
import {type MailApps,type Provider} from './mailproviders';
import {oauthAccessToken} from './oauthaccess';
import {providerRequest,ProviderRequestError} from './providerrequest';

export type InboundCursor={provider:Provider;value:string};
export type IncrementalIncoming={messages:Incoming[];cursor:InboundCursor|null;reset:boolean};

const providerUrl=(url:string)=>{const base=process.env.MAIL_PROVIDER_BASE_URL;
 if(!base)return url;const parsed=new URL(url);return new URL(parsed.pathname+parsed.search,base).toString();};

const gmailText=(payload:any):string=>{
 if(!payload)return '';
 if(payload.mimeType==='text/plain'&&payload.body?.data)
  return Buffer.from(String(payload.body.data),'base64url').toString('utf8');
 for(const part of payload.parts??[]){const found=gmailText(part);if(found)return found;}
 if(payload.body?.data)return Buffer.from(String(payload.body.data),'base64url').toString('utf8');
 return '';
};

async function gmailMessage(id:string,auth:Record<string,string>):Promise<Incoming|null>{
 try{
  const r=await providerRequest(providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`),
   {headers:auth},{mode:'read',operation:'gmail_message'});
  const message=await r.json();
  const headers:Record<string,string>={};
  for(const h of message?.payload?.headers??[])headers[String(h.name).toLowerCase()]=String(h.value);
  return {uid:0,from:(headers.from?.match(/<([^>]+)>/)?.[1]??headers.from??'').toLowerCase(),
   subject:headers.subject??'',text:gmailText(message?.payload),
   messageId:headers['message-id']??'',inReplyTo:headers['in-reply-to']??'',
   references:(headers.references??'').split(/\s+/).filter(Boolean),
   at:new Date(Number(message?.internalDate??Date.now())).toISOString(),
   providerId:String(message?.id??id),threadId:String(message?.threadId??'')};
 }catch(e:any){if(e instanceof ProviderRequestError&&e.provider.status===404)return null;throw e;}
}

async function gmailInitial(auth:Record<string,string>,limit:number):Promise<IncrementalIncoming>{
 const profile=await providerRequest(providerUrl('https://gmail.googleapis.com/gmail/v1/users/me/profile'),
  {headers:auth},{mode:'read',operation:'gmail_profile'});
 const historyId=String((await profile.json())?.historyId??'');
 const list=await providerRequest(providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=${limit}`),
  {headers:auth},{mode:'read',operation:'gmail_inbox_list'});
 const ids=((await list.json())?.messages??[]).map((m:any)=>String(m.id));
 const out:(Incoming|null)[]=[];
 for(const id of ids.slice(0,limit))out.push(await gmailMessage(id,auth));
 return {messages:out.filter(Boolean) as Incoming[],cursor:historyId?{provider:'google',value:historyId}:null,reset:true};
}

async function gmailHistory(auth:Record<string,string>,cursor:string,limit:number):Promise<IncrementalIncoming>{
 let url=providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&labelId=INBOX&maxResults=${limit}`);
 const ids:string[]=[];let latest=cursor;
 for(let page=0;page<20&&url;page++){
  let r:Response;
  try{r=await providerRequest(url,{headers:auth},{mode:'read',operation:'gmail_history'});}
  catch(e:any){if(e instanceof ProviderRequestError&&e.provider.status===404)return gmailInitial(auth,limit);throw e;}
  const data=await r.json();latest=String(data?.historyId??latest);
  for(const h of data?.history??[])for(const added of h?.messagesAdded??[]){const id=String(added?.message?.id??'');if(id&&!ids.includes(id))ids.push(id);}
  const next=String(data?.nextPageToken??'');
  url=next?providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&labelId=INBOX&maxResults=${limit}&pageToken=${encodeURIComponent(next)}`):'';
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
  let r:Response;
  try{r=await providerRequest(url,{headers:auth},{mode:'read',operation:'graph_delta'});}
  catch(e:any){
   if(e instanceof ProviderRequestError&&e.provider.status===410&&cursor){
    url=providerUrl(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$top=${limit}`);reset=true;continue;
   }
   throw e;
  }
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
 const token=await oauthAccessToken(provider,secret.refreshToken,apps);
 const auth={Authorization:`Bearer ${token}`};
 if(provider==='google')return cursor?.provider==='google'&&cursor.value?gmailHistory(auth,cursor.value,limit):gmailInitial(auth,limit);
 return graphDelta(auth,cursor?.provider==='microsoft'?cursor.value:undefined,limit);
}
