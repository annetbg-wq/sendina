import type {Incoming} from './imap';
import {readIncrementalIncoming,type InboundCursor,type IncrementalIncoming} from './inboundcursor';
import {oauthAccessToken} from './oauthaccess';
import {providerRequest} from './providerrequest';
import {reconcileGmailSent,reconcileMicrosoftSent,type SentIdentity} from './sentreconcile';
import {
  readIncoming,
  sendMessage,
  verifyAccess,
  verifyIncomingChannel,
  type MailApps,
  type Provider
} from './mailproviders';

export type MailCapability=
  |'SEND'
  |'READ'
  |'THREADS'
  |'REPLY_DETECTION'
  |'PUSH_NOTIFICATIONS';

export type MailProviderErrorClass=
  |'REAUTH_REQUIRED'
  |'RATE_LIMITED'
  |'RETRYABLE'
  |'PERMANENT'
  |'UNKNOWN';

export type MailSendInput={
  to:string;
  subject:string;
  text:string;
  html?:string;
  replyTo?:string;
  messageId?:string;
  inReplyTo?:string;
  references?:string[];
  threadId?:string;
};
export type MailSendResult={id:string;threadId:string;messageId:string;via:string};
export type MailSyncCursor=InboundCursor;
export type MailSyncBatch=IncrementalIncoming;
export type MailReconcileResult={supported:boolean;evidence:SentIdentity|null};
export type MailThreadResult={supported:boolean;threadId:string;messages:Incoming[]};
export type MailAccountIdentity={email:string;provider:Provider};

/**
 * Stable transport contract used by Sendina above provider-specific details.
 * Gmail/Graph/SMTP differences stay behind this boundary; campaign, mailbox and
 * recovery code should never branch on a provider name.
 */
export interface MailProvider {
  readonly kind:Provider;
  getCapabilities():ReadonlySet<MailCapability>;
  getAccountIdentity():Promise<MailAccountIdentity>;
  sendMessage(input:MailSendInput):Promise<MailSendResult>;
  listMessages(limit?:number):Promise<Incoming[]>;
  syncMessages(cursor?:MailSyncCursor|null,limit?:number):Promise<MailSyncBatch>;
  getThread(threadId:string):Promise<MailThreadResult>;
  reconcileSent(rfcMessageId:string):Promise<MailReconcileResult>;
  checkConnection():Promise<string>;
  checkIncoming():Promise<string>;
}

/** THREADS is advertised only where the API can fetch an actual provider conversation. Push is
 * intentionally still absent: periodic History/Delta recovery exists, but no watch/subscription
 * lifecycle is claimed until it is implemented. */
const capabilities:Record<Provider,ReadonlySet<MailCapability>>={
  google:new Set<MailCapability>(['SEND','READ','THREADS','REPLY_DETECTION']),
  microsoft:new Set<MailCapability>(['SEND','READ','THREADS','REPLY_DETECTION']),
  smtp:new Set<MailCapability>(['SEND','READ','REPLY_DETECTION'])
};

const providerUrl=(url:string)=>{const base=process.env.MAIL_PROVIDER_BASE_URL;
  if(!base)return url;const parsed=new URL(url);return new URL(parsed.pathname+parsed.search,base).toString();};
const gmailText=(payload:any):string=>{
  if(!payload)return '';
  if(payload.mimeType==='text/plain'&&payload.body?.data)return Buffer.from(String(payload.body.data),'base64url').toString('utf8');
  for(const part of payload.parts??[]){const found=gmailText(part);if(found)return found;}
  if(payload.body?.data)return Buffer.from(String(payload.body.data),'base64url').toString('utf8');
  return '';
};
const gmailIncoming=(message:any):Incoming=>{
  const headers:Record<string,string>={};
  for(const h of message?.payload?.headers??[])headers[String(h.name).toLowerCase()]=String(h.value);
  return {uid:0,from:(headers.from?.match(/<([^>]+)>/)?.[1]??headers.from??'').toLowerCase(),
    subject:headers.subject??'',text:gmailText(message?.payload),messageId:headers['message-id']??'',
    inReplyTo:headers['in-reply-to']??'',references:(headers.references??'').split(/\s+/).filter(Boolean),
    at:new Date(Number(message?.internalDate??Date.now())).toISOString(),providerId:String(message?.id??''),
    threadId:String(message?.threadId??'')};
};
const graphIncoming=(m:any):Incoming=>({uid:0,from:String(m?.from?.emailAddress?.address??'').toLowerCase(),
  subject:String(m?.subject??''),text:String(m?.body?.content??m?.bodyPreview??''),messageId:String(m?.internetMessageId??''),
  inReplyTo:'',references:[],at:String(m?.receivedDateTime??new Date().toISOString()),providerId:String(m?.id??''),
  threadId:String(m?.conversationId??'')});
const odata=(value:string)=>`'${value.replace(/'/g,"''")}'`;

/** One provider-neutral incremental reader. OAuth providers use their durable History/Delta
 * cursors. Custom SMTP/IMAP keeps its UID semantics, but exposes that UID as the same opaque
 * cursor shape so the orchestration layer no longer has to choose a transport implementation. */
async function syncMessages(kind:Provider,secret:any,apps:MailApps,cursor:MailSyncCursor|null,limit:number):Promise<MailSyncBatch>{
  if(kind==='google'||kind==='microsoft')return readIncrementalIncoming(secret,apps,cursor,limit);
  const since=cursor?.provider==='smtp'?Number(cursor.value)||0:0;
  const messages=await readIncoming({...secret,sinceUid:since},apps,limit);
  const latest=messages.reduce((max,message)=>Math.max(max,Number(message.uid??0)),since);
  const next=latest>0?{provider:'smtp' as const,value:String(latest)}:cursor;
  return {messages,cursor:next??null,reset:!cursor};
}

/** Fetch a real provider conversation. SMTP/IMAP has no reliable provider thread primitive in this
 * product, so capability negotiation returns unsupported rather than fabricating one from subject. */
async function getThread(kind:Provider,secret:any,apps:MailApps,threadId:string):Promise<MailThreadResult>{
  if(kind==='smtp')return {supported:false,threadId,messages:[]};
  if(!threadId)return {supported:true,threadId,messages:[]};
  const token=await oauthAccessToken(kind,secret.refreshToken,apps);const auth={Authorization:`Bearer ${token}`};
  if(kind==='google'){
    const r=await providerRequest(providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`),
      {headers:auth},{mode:'read',operation:'gmail_thread'});
    const data=await r.json();return {supported:true,threadId:String(data?.id??threadId),messages:(data?.messages??[]).map(gmailIncoming)};
  }
  const params=new URLSearchParams({'$filter':`conversationId eq ${odata(threadId)}`,'$top':'100'});
  const r=await providerRequest(providerUrl(`https://graph.microsoft.com/v1.0/me/messages?${params}`),
    {headers:auth},{mode:'read',operation:'graph_thread'});
  const messages=((await r.json())?.value??[]).map(graphIncoming).sort((a:Incoming,b:Incoming)=>Date.parse(a.at)-Date.parse(b.at));
  return {supported:true,threadId,messages};
}

/** Provider evidence is also hidden behind the same boundary. SMTP/IMAP cannot safely prove an
 * ambiguous send with the current credentials, so it reports unsupported rather than guessing. */
async function reconcileSent(kind:Provider,secret:any,apps:MailApps,rfcMessageId:string):Promise<MailReconcileResult>{
  if(kind==='smtp')return {supported:false,evidence:null};
  const token=await oauthAccessToken(kind,secret.refreshToken,apps);
  const evidence=kind==='google'?await reconcileGmailSent(token,rfcMessageId):await reconcileMicrosoftSent(token,rfcMessageId);
  return {supported:true,evidence};
}

/**
 * Adapter over the existing production transports. The rest of Sendina uses one
 * runtime contract without exposing Gmail API / Graph / SMTP-IMAP details.
 */
export function mailProvider(secret:any,apps:MailApps):MailProvider{
  const kind:Provider=secret?.kind==='oauth'&&secret?.provider==='google'?'google':
    secret?.kind==='oauth'&&secret?.provider==='microsoft'?'microsoft':'smtp';
  const identity:MailAccountIdentity={email:String(secret?.email??'').trim().toLowerCase(),provider:kind};
  return {
    kind,
    getCapabilities:()=>capabilities[kind],
    getAccountIdentity:async()=>identity,
    sendMessage:input=>sendMessage(secret,input.to,input.subject,input.text,apps,{
      html:input.html,replyTo:input.replyTo,messageId:input.messageId,inReplyTo:input.inReplyTo,
      references:input.references,threadId:input.threadId
    }),
    listMessages:limit=>readIncoming(secret,apps,limit),
    syncMessages:(cursor=null,limit=50)=>syncMessages(kind,secret,apps,cursor,limit),
    getThread:threadId=>getThread(kind,secret,apps,threadId),
    reconcileSent:rfcMessageId=>reconcileSent(kind,secret,apps,rfcMessageId),
    checkConnection:()=>verifyAccess(secret,apps),
    checkIncoming:()=>verifyIncomingChannel(secret,apps)
  };
}

export function providerCapabilities(kind:Provider):ReadonlySet<MailCapability>{return capabilities[kind];}
