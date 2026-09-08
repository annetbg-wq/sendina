import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProviderRequestError} from '../server/providerrequest';
import {mailboxProviderHealth,clearMailboxProviderHealth,recordMailboxProviderError} from '../server/mailboxhealth';

test('mailbox provider health stores only normalized safe fields and stays account scoped',async()=>{
 const accountA=`health-a-${Date.now()}`;const accountB=`health-b-${Date.now()}`;const email='box@example.com';
 await clearMailboxProviderHealth(accountA,email);await clearMailboxProviderHealth(accountB,email);
 const error=new ProviderRequestError({class:'REAUTH_REQUIRED',code:'invalid_grant',status:401,retryAfterMs:null,detail:'secret provider body that must not persist'});
 assert.equal(await recordMailboxProviderError(accountA,email,error),true);
 const stored=await mailboxProviderHealth(accountA,email);
 assert.deepEqual({...stored,at:'x'},{class:'REAUTH_REQUIRED',code:'invalid_grant',status:401,retryAfterMs:null,at:'x'});
 assert.ok(stored?.at);
 assert.equal(JSON.stringify(stored).includes('secret provider body'),false);
 assert.equal(await mailboxProviderHealth(accountB,email),null);
 await clearMailboxProviderHealth(accountA,email);
 assert.equal(await mailboxProviderHealth(accountA,email),null);
});

test('ordinary application errors do not become provider health',async()=>{
 const account=`health-app-${Date.now()}`;const email='box@example.com';
 await clearMailboxProviderHealth(account,email);
 assert.equal(await recordMailboxProviderError(account,email,new Error('validation failed')),false);
 assert.equal(await mailboxProviderHealth(account,email),null);
});
