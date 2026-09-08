import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailboxReadiness,domainReadiness} from '../server/readiness';
import {senderMailbox} from '../server/send';
import {seed} from '../server/seed';

const proof=(at:string)=>({status:'ok',at,detail:''});
const dns={spf:true,dkim:true,dmarc:true,checkedAt:'2026-09-08T10:00:00Z'};

function workspace(proofAt:string,failure:any){
 const s=seed() as any;
 s.domains=[{id:'d1',name:'sender.example',limit:10,used:0,usedOn:'2026-09-08',dns,
  mailboxes:[{email:'out@sender.example',provider:'google',connection:'oauth',
   auth:proof(proofAt),testSend:proof(proofAt),imap:proof(proofAt),incoming:proof(proofAt),
   lastProviderError:failure}]}];
 return s;
}

test('a current provider failure blocks mailbox, domain and the real sender selector',()=>{
 const failure={class:'RATE_LIMITED',code:'429',at:'2026-09-08T12:00:00Z'};
 const s=workspace('2026-09-08T11:00:00Z',failure);
 const mailbox=s.domains[0].mailboxes[0];
 const ready=mailboxReadiness(s.domains[0],mailbox);
 assert.equal(ready.ready,false);
 assert.ok(ready.blockers.includes('PROVIDER_RATE_LIMITED'));
 assert.equal(domainReadiness(s.domains[0]).ready,false);
 assert.equal(senderMailbox(s),null,'a degraded mailbox cannot be selected for a real send');
});

test('a complete verification newer than the provider failure restores the same sender',()=>{
 const failure={class:'RETRYABLE',code:'503',at:'2026-09-08T12:00:00Z'};
 const partial=workspace('2026-09-08T13:00:00Z',failure);
 partial.domains[0].mailboxes[0].incoming=proof('2026-09-08T11:30:00Z');
 assert.equal(mailboxReadiness(partial.domains[0],partial.domains[0].mailboxes[0]).ready,false,
  'all four proofs, not only some of them, must be newer than the failure');

 const recovered=workspace('2026-09-08T13:00:00Z',failure);
 assert.equal(mailboxReadiness(recovered.domains[0],recovered.domains[0].mailboxes[0]).ready,true);
 assert.equal(domainReadiness(recovered.domains[0]).ready,true);
 assert.equal(senderMailbox(recovered)?.mailbox.email,'out@sender.example');
});
