import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../server/seed';
import {applyDeliveryEvidence} from '../server/deliveryrecovery';

function unknown(){
 const s=seed() as any;
 s.domains=[{id:'d1',name:'sender.example',limit:10,used:1,usedOn:'2026-09-08',dns:{},mailboxes:[]}];
 s.campaigns=[{id:'c1',name:'Campaign',sent:0}];
 s.messages=[{id:'m1',campaignId:'c1',status:'unknown',deliveryState:'UNKNOWN',
  rfcMessageId:'<sendina-abc@sender.example>',providerMessageId:'',providerThreadId:'',
  sentThrough:'out@sender.example',sendDetail:'response lost'}];
 return s;
}

const evidence={providerId:'provider-1',threadId:'thread-7',messageId:'<sendina-abc@sender.example>',
 sentAt:'2026-09-08T14:00:00Z'};

test('provider evidence resolves UNKNOWN to SENT without changing the reserved quota',()=>{
 const s=unknown();
 const result=applyDeliveryEvidence(s,'m1',evidence);
 assert.equal(result.outcome,'sent');
 assert.equal(s.messages[0].status,'sent');
 assert.equal(s.messages[0].deliveryState,'SENT');
 assert.equal(s.messages[0].providerMessageId,'provider-1');
 assert.equal(s.messages[0].providerThreadId,'thread-7');
 assert.equal(s.messages[0].sentAt,'2026-09-08T14:00:00Z');
 assert.equal(s.domains[0].used,1,'UNKNOWN already reserved quota; reconciliation keeps it spent');
 assert.equal(s.campaigns[0].sent,1);
 assert.ok(s.audit[0].action.includes('подтверждена у провайдера'));
});

test('applying the same evidence twice is idempotent',()=>{
 const s=unknown();
 assert.equal(applyDeliveryEvidence(s,'m1',evidence).outcome,'sent');
 assert.equal(applyDeliveryEvidence(s,'m1',evidence).outcome,'already_resolved');
 assert.equal(s.campaigns[0].sent,1,'campaign sent count must not increment twice');
 assert.equal(s.domains[0].used,1);
});

test('mismatched provider identity cannot resolve UNKNOWN',()=>{
 const s=unknown();
 assert.throws(()=>applyDeliveryEvidence(s,'m1',{...evidence,messageId:'<different@sender.example>'}),/другое RFC Message-ID/);
 assert.equal(s.messages[0].status,'unknown');
 assert.equal(s.messages[0].deliveryState,'UNKNOWN');
 assert.equal(s.campaigns[0].sent,0);
 assert.equal(s.domains[0].used,1);
});
