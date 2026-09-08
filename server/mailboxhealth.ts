import {getAuth,setAuth} from './authstore';
import {ProviderRequestError} from './providerrequest';
import type {ProviderErrorClass} from './providererrors';

export type MailboxProviderHealth={
 class:ProviderErrorClass;
 code:string;
 status:number|null;
 retryAfterMs:number|null;
 at:string;
};

const key=(accountId:string,email:string)=>`mailbox-health:${accountId}:${email.toLowerCase()}`;

/** Runtime provider health is account/mailbox scoped and contains no credentials or message data. */
export async function mailboxProviderHealth(accountId:string,email:string){
 return getAuth<MailboxProviderHealth|null>(key(accountId,email));
}

export async function clearMailboxProviderHealth(accountId:string,email:string){
 await setAuth(key(accountId,email),null);
}

export async function recordMailboxProviderError(accountId:string,email:string,error:unknown){
 if(!(error instanceof ProviderRequestError))return false;
 const p=error.provider;
 const health:MailboxProviderHealth={class:p.class,code:p.code,status:p.status,
  retryAfterMs:p.retryAfterMs,at:new Date().toISOString()};
 await setAuth(key(accountId,email),health);
 return true;
}
