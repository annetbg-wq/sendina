import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProviderError,retryAfterMs,retryDelayMs,shouldRetry} from '../server/providererrors';

test('OAuth expiry is reauth, rate limits honor Retry-After, and transient HTTP failures retry',()=>{
 assert.equal(normalizeProviderError({status:401,message:'Invalid token'}).class,'REAUTH_REQUIRED');
 assert.equal(normalizeProviderError({message:'invalid_grant'}).class,'REAUTH_REQUIRED');
 const limited=normalizeProviderError({status:429,message:'Too Many Requests',headers:{'Retry-After':'7'}});
 assert.equal(limited.class,'RATE_LIMITED');
 assert.equal(limited.retryAfterMs,7000);
 assert.equal(retryDelayMs(0,limited,()=>0),7000,'provider Retry-After wins over local backoff');
 assert.equal(normalizeProviderError({status:503,message:'Service unavailable'}).class,'RETRYABLE');
 assert.equal(normalizeProviderError({code:'ECONNRESET',message:'socket closed'}).class,'RETRYABLE');
});

test('permanent client failures do not retry',()=>{
 const bad=normalizeProviderError({status:400,message:'Invalid recipient'});
 assert.equal(bad.class,'PERMANENT');
 assert.equal(retryDelayMs(0,bad,()=>0.5),null);
 assert.equal(shouldRetry(bad,0),false);
});

test('backoff grows exponentially, is jittered and capped',()=>{
 const e={class:'RETRYABLE' as const,code:'503',status:503,retryAfterMs:null,detail:''};
 assert.equal(retryDelayMs(0,e,()=>0.5),1000);
 assert.equal(retryDelayMs(1,e,()=>0.5),2000);
 assert.equal(retryDelayMs(10,e,()=>0.5),60000);
 assert.equal(retryDelayMs(0,e,()=>0),750);
 assert.equal(retryDelayMs(0,e,()=>1),1250);
 assert.equal(shouldRetry(e,0,4),true);
 assert.equal(shouldRetry(e,3,4),false);
});

test('Retry-After accepts HTTP dates and rejects garbage',()=>{
 const now=Date.parse('2026-09-08T10:00:00Z');
 assert.equal(retryAfterMs('Tue, 08 Sep 2026 10:00:10 GMT',now),10000);
 assert.equal(retryAfterMs('nonsense',now),null);
 assert.equal(retryAfterMs('',now),null);
});
