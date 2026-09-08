import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProviderRequestError} from '../server/providerrequest';
import {recoverMailboxesOnce,startMailboxRecoveryWorker,stopMailboxRecoveryWorker} from '../server/mailboxworker';

const account=(id:string,status:'approved'|'blocked'='approved')=>({
 id,email:`${id}@example.com`,role:'user' as const,status,createdAt:'2026-09-08T00:00:00Z',
 approvedAt:status==='approved'?'2026-09-08T00:00:00Z':null,approvedBy:null,lastLoginAt:null
});

test('periodic recovery syncs connected mailboxes, skips revoked/disconnected ones and records safe provider failures',async()=>{
 const calls:string[]=[];const recorded:string[]=[];
 const result=await recoverMailboxesOnce({
  listAccounts:async()=>[account('a'),account('b'),account('blocked','blocked')],
  status:async ctx=>ctx.accountId==='a'?{domains:[{mailboxes:[
   {email:'ready@example.com',connection:'oauth',provider:'google'},
   {email:'revoked@example.com',connection:'oauth',provider:'microsoft',
    lastProviderError:{class:'REAUTH_REQUIRED',code:'invalid_grant',at:'2026-09-08T12:00:00Z'}},
   {email:'off@example.com',connection:'none',provider:'smtp'}
  ]}]}:{domains:[{mailboxes:[{email:'temporary@example.com',connection:'oauth',provider:'google',
   lastProviderError:{class:'RETRYABLE',code:'503',at:'2026-09-08T12:00:00Z'}}]}]},
  sync:async(ctx,input)=>{
   calls.push(`${ctx.accountId}:${input.email}:${input.limit}`);
   if(input.email==='temporary@example.com')throw new ProviderRequestError({
    class:'RETRYABLE',code:'503',status:503,retryAfterMs:null,detail:'provider body that must not be persisted here'});
   return {added:0};
  },
  recordProviderFailure:async(_ctx,email,error)=>{
   recorded.push(`${email}:${error.provider.class}:${error.provider.status}`);
  }
 });
 assert.deepEqual(calls,['a:ready@example.com:100','b:temporary@example.com:100']);
 assert.deepEqual(recorded,['temporary@example.com:RETRYABLE:503']);
 assert.deepEqual(result,{accounts:2,mailboxes:4,synced:1,skipped:3,errors:1});
});

test('automatic recovery can be explicitly disabled for maintenance/test deployments',()=>{
 stopMailboxRecoveryWorker();
 const previous=process.env.MAIL_SYNC_INTERVAL_MS;
 process.env.MAIL_SYNC_INTERVAL_MS='0';
 try{assert.equal(startMailboxRecoveryWorker(),null);}finally{
  if(previous===undefined)delete process.env.MAIL_SYNC_INTERVAL_MS;else process.env.MAIL_SYNC_INTERVAL_MS=previous;
  stopMailboxRecoveryWorker();
 }
});
