import type {Incoming} from './imap';
import {readIncrementalIncoming,type InboundCursor,type IncrementalIncoming} from './inboundcursor';
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

/**
 * Stable transport contract used by Sendina above provider-specific details.
 * Gmail/Graph/SMTP differences stay behind this boundary; campaign and policy
 * code should never branch on a provider name.
 */
export interface MailProvider {
  readonly kind:Provider;
  getCapabilities():ReadonlySet<MailCapability>;
  sendMessage(input:MailSendInput):Promise<MailSendResult>;
  listMessages(limit?:number):Promise<Incoming[]>;
  syncMessages(cursor?:MailSyncCursor|null,limit?:number):Promise<MailSyncBatch>;
  checkConnection():Promise<string>;
  checkIncoming():Promise<string>;
}

/**
 * Advertise only capabilities that the current contract can actually fulfill.
 * THREADS and PUSH_NOTIFICATIONS remain absent until a caller can perform a
 * real thread operation / watch subscription through this interface.
 */
const capabilities:Record<Provider,ReadonlySet<MailCapability>>={
  google:new Set<MailCapability>(['SEND','READ','REPLY_DETECTION']),
  microsoft:new Set<MailCapability>(['SEND','READ','REPLY_DETECTION']),
  smtp:new Set<MailCapability>(['SEND','READ','REPLY_DETECTION'])
};

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

/**
 * Adapter over the existing production transports. The rest of Sendina can now
 * move to one runtime contract without rewriting the tested Gmail API / Graph /
 * SMTP-IMAP implementations underneath.
 */
export function mailProvider(secret:any,apps:MailApps):MailProvider{
  const kind:Provider=secret?.kind==='oauth'&&secret?.provider==='google'
    ?'google'
    :secret?.kind==='oauth'&&secret?.provider==='microsoft'
      ?'microsoft'
      :'smtp';
  return {
    kind,
    getCapabilities:()=>capabilities[kind],
    sendMessage:input=>sendMessage(secret,input.to,input.subject,input.text,apps,{
      html:input.html,replyTo:input.replyTo,messageId:input.messageId,inReplyTo:input.inReplyTo,
      references:input.references,threadId:input.threadId
    }),
    listMessages:limit=>readIncoming(secret,apps,limit),
    syncMessages:(cursor=null,limit=50)=>syncMessages(kind,secret,apps,cursor,limit),
    checkConnection:()=>verifyAccess(secret,apps),
    checkIncoming:()=>verifyIncomingChannel(secret,apps)
  };
}

export function providerCapabilities(kind:Provider):ReadonlySet<MailCapability>{
  return capabilities[kind];
}
