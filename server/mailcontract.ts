import type {Incoming} from './imap';
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

export type MailSendInput={to:string;subject:string;text:string};
export type MailSendResult={id:string;via:string};

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
  checkConnection():Promise<string>;
  checkIncoming():Promise<string>;
}

const capabilities:Record<Provider,ReadonlySet<MailCapability>>={
  google:new Set<MailCapability>(['SEND','READ','THREADS','REPLY_DETECTION']),
  microsoft:new Set<MailCapability>(['SEND','READ','THREADS','REPLY_DETECTION']),
  smtp:new Set<MailCapability>(['SEND','READ','REPLY_DETECTION'])
};

/**
 * Adapter over the existing production transports. This lets the migration be
 * incremental: callers can move to the contract without rewriting the tested
 * Gmail API / Graph / SMTP-IMAP implementations underneath.
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
    sendMessage:input=>sendMessage(secret,input.to,input.subject,input.text,apps),
    listMessages:limit=>readIncoming(secret,apps,limit),
    checkConnection:()=>verifyAccess(secret,apps),
    checkIncoming:()=>verifyIncomingChannel(secret,apps)
  };
}

export function providerCapabilities(kind:Provider):ReadonlySet<MailCapability>{
  return capabilities[kind];
}
