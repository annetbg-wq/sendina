import {randomBytes} from 'node:crypto';
import {setAuth,takeAuth} from './authstore';
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
 * OAuth state is consumed atomically before token exchange. A second callback racing the first
 * therefore receives null rather than the same account/mailbox binding.
 */
export async function consumeMailOauthState(state:string):Promise<MailOauthState|null>{
 if(!state)return null;
 const value=await takeAuth<MailOauthState>(key(state));
 if(!value||!value.accountId||!value.email||!['google','microsoft'].includes(value.provider)||value.expires<Date.now())return null;
 return value;
}
