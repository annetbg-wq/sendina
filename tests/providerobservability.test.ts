import {test} from 'node:test';
import assert from 'node:assert/strict';
import {providerRequest} from '../server/providerrequest';
import {providerName,recordProviderEvent,providerMetricsSnapshot,resetProviderMetrics,type ProviderEvent} from '../server/providerobservability';

test('provider request emits one secret-safe event with attempts and correlation id',async()=>{
 let calls=0;const events:ProviderEvent[]=[];
 const response=await providerRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages?access_token=QUERY_SECRET',{
  method:'POST',headers:{Authorization:'Bearer HEADER_SECRET'},body:'BODY_SECRET'
 },{mode:'read',operation:'gmail_history',correlationId:'corr-123',observe:e=>events.push(e),sleep:async()=>{},random:()=>0.5,
  fetchFn:async()=>{calls++;return calls===1?new Response('temporary',{status:503}):new Response('{}',{status:200});}});
 assert.equal(response.status,200);
 assert.equal(events.length,1);
 assert.deepEqual(events[0],{correlationId:'corr-123',provider:'google',operation:'gmail_history',status:200,
  attempts:2,latencyMs:events[0].latencyMs,errorClass:null,retried:true});
 const serialized=JSON.stringify(events[0]);
 for(const secret of ['QUERY_SECRET','HEADER_SECRET','BODY_SECRET','access_token','Authorization'])
  assert.equal(serialized.includes(secret),false,`${secret} must not appear in provider telemetry`);
});

test('provider names are derived only from endpoint host',()=>{
 assert.equal(providerName('https://oauth2.googleapis.com/token'),'google');
 assert.equal(providerName('https://graph.microsoft.com/v1.0/me/messages'),'microsoft');
 assert.equal(providerName('https://mail.example.net/api'),'mail.example.net');
 assert.equal(providerName('not a url'),'unknown');
});

test('provider metrics aggregate requests, attempts, retries, errors and latency',()=>{
 resetProviderMetrics();
 const previous=process.env.PROVIDER_STRUCTURED_LOGS;process.env.PROVIDER_STRUCTURED_LOGS='0';
 try{
  recordProviderEvent({correlationId:'1',provider:'google',operation:'send',status:200,attempts:1,latencyMs:10,errorClass:null,retried:false});
  recordProviderEvent({correlationId:'2',provider:'google',operation:'send',status:503,attempts:3,latencyMs:50,errorClass:'RETRYABLE',retried:true});
  assert.deepEqual(providerMetricsSnapshot(),[{provider:'google',operation:'send',requests:2,attempts:4,retries:2,errors:1,latencyMs:60,avgLatencyMs:30}]);
 }finally{if(previous===undefined)delete process.env.PROVIDER_STRUCTURED_LOGS;else process.env.PROVIDER_STRUCTURED_LOGS=previous;resetProviderMetrics();}
});
