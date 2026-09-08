import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,seed} from '../server/seed';
import {reserve,today} from '../server/send';

const ok={status:'ok',at:'2026-09-08T00:00:00Z',detail:''};

test('an in-flight send becomes UNKNOWN after restart and cannot be automatically resent',()=>{
 const s=seed() as any;
 s.domains=[{id:'d1',name:'sender.example',limit:5,used:1,usedOn:today(),
  dns:{spf:true,dkim:true,dmarc:true,checkedAt:'2026-09-08T00:00:00Z'},
  mailboxes:[{email:'out@sender.example',provider:'google',connection:'oauth',connectedAt:'x',
   auth:{...ok},testSend:{...ok},imap:{...ok},incoming:{...ok},transport:null,incomingUid:0}]}];
 s.campaigns=[{id:'c1',name:'Test',status:'active',control:'auto',sent:0,firstBatchApprovedAt:null}];
 s.contacts=[{id:'p1',campaignId:'c1',email:'buyer@example.com',source:'https://example.com',
  basis:'published work contact',reason:'specific business reason',verification:'verified'}];
 s.messages=[{id:'m1',campaignId:'c1',contactId:'p1',email:'buyer@example.com',subject:'Subject',text:'Body',
  status:'sending',sentThrough:'out@sender.example',sendDetail:''}];

 normalize(s);
 assert.equal(s.messages[0].status,'unknown');
 assert.equal(s.messages[0].deliveryState,'UNKNOWN');
 assert.match(s.messages[0].sendDetail,/Автоматический повтор запрещён/);

 const retry=reserve(s,'c1','m1',[]);
 assert.equal(retry.ok,false,'UNKNOWN must not re-enter the send path');
 if(!retry.ok)assert.equal(retry.reason,'SEND_OUTCOME_UNKNOWN');
 assert.equal(s.domains[0].used,1,'uncertain delivery keeps its reserved quota until reconciled');
});

test('normalization leaves confirmed drafts and sent messages unchanged',()=>{
 const draft={messages:[{id:'d',status:'draft'}],campaigns:[],domains:[],contacts:[],replies:[],suppressed:[],audit:[]};
 normalize(draft);
 assert.equal(draft.messages[0].status,'draft');
 assert.equal(draft.messages[0].deliveryState,'QUEUED');
 const sent={messages:[{id:'s',status:'sent'}],campaigns:[],domains:[],contacts:[],replies:[],suppressed:[],audit:[]};
 normalize(sent);
 assert.equal(sent.messages[0].status,'sent');
 assert.equal(sent.messages[0].deliveryState,'SENT');
});
