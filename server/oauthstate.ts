import {randomBytes} from 'node:crypto';
import {deleteAuth,getAuth,setAuth} from './authstore';
import type {Provider} from './mailproviders';

export type MailOauthState={accountId:string;email:string;provider:Exclude<Provider,'smtp'>;expires:number};
const key=(state:string)=>`mail-oauth-state:${state}`;

/** Create a cryptographically random, durable, short-lived OAuth state token. */
export async function issueMailOauthState(input:Omit<MailOauthState,'expires'>,ttlMs=15*60*1000){
 const state=randomBytes(32).toString('base64url');
 const value:MailOauthState={...input,email:input.email.toLowerCase(),expires:Date.now()+ttlMs};
 await setAuth(key(state),value);
 return state;
}

/**
 * OAuth state is single-use. It is deleted before the caller exchanges the provider code, so
 * callback replay cannot mint a second mailbox credential even if token exchange later fails.
 */
export async function consumeMailOauthState(state:string):Promise<MailOauthState|null>{
 if(!state)return null;
 const value=await getAuth<MailOauthState>(key(state));
 if(!value)return null;
 await deleteAuth(key(state));
 if(!value.accountId||!value.email||!['google','microsoft'].includes(value.provider)||value.expires<Date.now())return null;
 return value;
}
