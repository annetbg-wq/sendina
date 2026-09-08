import type {Express} from 'express';
import {randomUUID} from 'node:crypto';
import {change} from './store';
import type {State} from './seed';
import {ProviderRequestError} from './providerrequest';

/** Stores only the normalized machine-safe provider failure, never raw provider bodies/tokens. */
export function applyMailboxProviderFailure(s:State,email:string,error:ProviderRequestError,at=new Date().toISOString()){
 const lower=email.toLowerCase();
 for(const domain of s.domains)for(const mailbox of domain.mailboxes as any[]){
  if(String(mailbox.email).toLowerCase()!==lower)continue;
  mailbox.lastProviderError={class:error.provider.class,code:error.provider.code,status:error.provider.status,
   retryAfterMs:error.provider.retryAfterMs,at};
  s.audit.unshift({id:randomUUID(),at,action:`Почтовый провайдер сообщил ошибку для ${lower}: ${error.provider.class}.`});
  return true;
 }
 return false;
}

/** Mounted after mailbox API routes and before the final error renderer. It records provider health
 * for operations such as syncReplies, then passes the original error on unchanged. */
export function mountMailboxProviderFailureRecorder(app:Express){
 app.use(async(err:any,req:any,_res:any,next:any)=>{
  if(err instanceof ProviderRequestError&&req?.ctx?.accountId&&String(req.path??'').startsWith('/api/mailboxes/')){
   const email=String(req.body?.email??'').toLowerCase();
   if(email)try{await change(req.ctx.accountId,(s:State)=>applyMailboxProviderFailure(s,email,err));}catch{/* keep original provider error authoritative */}
  }
  next(err);
 });
}
