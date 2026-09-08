import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../server/seed';
import {ProviderRequestError} from '../server/providerrequest';
import {applyMailboxProviderFailure} from '../server/mailboxproviderfailure';
import {mailboxState} from '../server/mailboxstate';

const proof=(at:string)=>({status:'ok',at,detail:''});
function workspace(){
 const s=seed() as any;
 s.domains=[{id:'d1',name:'sender.example',dns:{spf:true,dkim:true,dmarc:true,checkedAt:'2026-09-08T10:00:00Z'},mailboxes:[{
  email:'out@sender.example',provider:'google',connection:'oauth',auth:proof('2026-09-08T10:00:00Z'),
  testSend:proof('2026-09-08T10:00:00Z'),imap:proof('2026-09-08T10:00:00Z'),incoming:proof('2026-09-08T10:00:00Z')
 }]}];
 return s;
}

test('revoked-token provider failure persists machine-safe state and requires reauth',()=>{
 const s=workspace();
 const error=new ProviderRequestError({class:'REAUTH_REQUIRED',code:'invalid_grant',status:400,retryAfterMs:null,
  detail:'Token revoked SECRET_TOKEN'});
 assert.equal(applyMailboxProviderFailure(s,'out@sender.example',error,'2026-09-08T12:00:00Z'),true);
 const mailbox=s.domains[0].mailboxes[0];
 assert.deepEqual(mailbox.lastProviderError,{class:'REAUTH_REQUIRED',code:'invalid_grant',status:400,retryAfterMs:null,at:'2026-09-08T12:00:00Z'});
 assert.equal(JSON.stringify(mailbox.lastProviderError).includes('SECRET_TOKEN'),false,'raw provider detail is never persisted');
 assert.equal(mailboxState(s.domains[0],mailbox).state,'REAUTH_REQUIRED');
 assert.equal(mailboxState(s.domains[0],mailbox).action,'REAUTHENTICATE');
});

test('rate limit persists as DEGRADED without exposing provider body',()=>{
 const s=workspace();
 const error=new ProviderRequestError({class:'RATE_LIMITED',code:'429',status:429,retryAfterMs:30000,detail:'quota body'});
 applyMailboxProviderFailure(s,'out@sender.example',error,'2026-09-08T12:00:00Z');
 const mailbox=s.domains[0].mailboxes[0];
 assert.equal(mailboxState(s.domains[0],mailbox).state,'DEGRADED');
 assert.equal(mailboxState(s.domains[0],mailbox).action,'RETRY');
 assert.equal(mailbox.lastProviderError.retryAfterMs,30000);
 assert.equal('detail' in mailbox.lastProviderError,false);
});
