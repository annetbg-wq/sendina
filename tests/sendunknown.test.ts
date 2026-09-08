import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../server/seed';
import {reserve,settle,classifySendFailure,today} from '../server/send';
import {ProviderRequestError} from '../server/providerrequest';

const ok={status:'ok',at:'2026-09-08T00:00:00Z',detail:''};

function workspace(){
 const s=seed() as any;
 s.domains=[{id:'d1',name:'sender.example',limit:5,used:0,usedOn:today(),
  dns:{spf:true,dkim:true,dmarc:true,checkedAt:'2026-09-08T00:00:00Z'},mailboxes:[{
   email:'out@sender.example',provider:'google',connection:'oauth',auth:{...ok},testSend:{...ok},imap:{...ok},incoming:{...ok}
  }]}];
 s.campaigns=[{id:'c1',name:'Test',status:'active',control:'auto',sent:0,firstBatchApprovedAt:null}];
 s.contacts=[{id:'p1',campaignId:'c1',email:'buyer@example.com',basis:'published',reason:'specific reason',verification:'verified'}];
 s.messages=[{id:'m1',campaignId:'c1',contactId:'p1',email:'buyer@example.com',subject:'Subject',text:'Body',status:'draft'}];
 return s;
}

test('RFC Message-ID exists before network ambiguity and survives UNKNOWN',()=>{
 const s=workspace();
 const reserved=reserve(s,'c1','m1',[]);
 assert.equal(reserved.ok,true);
 const identity=s.messages[0].rfcMessageId;
 assert.match(identity,/^<sendina-[a-f0-9]{32}@sender\.example>$/);
 assert.equal(s.messages[0].deliveryState,'SENDING');

 const failure=classifySendFailure(new ProviderRequestError({class:'RETRYABLE',code:'503',status:503,retryAfterMs:null,detail:'response lost'}));
 settle(s,'c1','m1','d1',failure);
 assert.equal(s.messages[0].status,'unknown');
 assert.equal(s.messages[0].deliveryState,'UNKNOWN');
 assert.equal(s.messages[0].rfcMessageId,identity,'reconciliation key must survive an ambiguous response');
 assert.equal(s.domains[0].used,1,'quota stays reserved until reconciliation proves failure');
});
