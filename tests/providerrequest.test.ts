import {test} from 'node:test';
import assert from 'node:assert/strict';
import {providerRequest,ProviderRequestError} from '../server/providerrequest';

const response=(status:number,body='',headers:Record<string,string>={})=>new Response(body,{status,headers});

test('safe reads retry transient failures with backoff',async()=>{
 let calls=0;const delays:number[]=[];
 const r=await providerRequest('https://provider.example/read',{}, {mode:'read',random:()=>0.5,sleep:async ms=>{delays.push(ms);},
  fetchFn:(async()=>{calls++;return calls<3?response(503,'temporary'):response(200,'ok');}) as typeof fetch});
 assert.equal(r.status,200);assert.equal(calls,3);assert.deepEqual(delays,[1000,2000]);
});

test('Retry-After is honored for explicit 429',async()=>{
 let calls=0;const delays:number[]=[];
 await providerRequest('https://provider.example/send',{method:'POST'}, {mode:'send',sleep:async ms=>{delays.push(ms);},
  fetchFn:(async()=>{calls++;return calls===1?response(429,'slow',{'Retry-After':'2'}):response(202);}) as typeof fetch});
 assert.equal(calls,2);assert.deepEqual(delays,[2000]);
});

test('ambiguous send 5xx is never automatically repeated',async()=>{
 let calls=0;
 await assert.rejects(()=>providerRequest('https://provider.example/send',{method:'POST'}, {mode:'send',sleep:async()=>{},
  fetchFn:(async()=>{calls++;return response(503,'maybe accepted');}) as typeof fetch}),
  (e:any)=>e instanceof ProviderRequestError&&e.provider.class==='RETRYABLE');
 assert.equal(calls,1,'send ambiguity must leave reconciliation to the idempotency layer');
});

test('network failure on send is UNKNOWN/RETRYABLE but still not automatically repeated',async()=>{
 let calls=0;
 await assert.rejects(()=>providerRequest('https://provider.example/send',{method:'POST'}, {mode:'send',sleep:async()=>{},
  fetchFn:(async()=>{calls++;throw Object.assign(new Error('socket reset'),{code:'ECONNRESET'});}) as typeof fetch}));
 assert.equal(calls,1);
});

test('authorization-code exchange does not retry ambiguous server failures',async()=>{
 let calls=0;
 await assert.rejects(()=>providerRequest('https://provider.example/token',{method:'POST'}, {mode:'exchange',sleep:async()=>{},
  fetchFn:(async()=>{calls++;return response(503,'uncertain exchange');}) as typeof fetch}));
 assert.equal(calls,1);
});
