import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailboxStatusView} from '../server/mailboxstatusview';

const dns={spf:true,dkim:true,dmarc:true,checkedAt:'2026-09-08T00:00:00Z'};
const ok={status:'ok',code:'OK'};

test('status view exposes product state without removing legacy readiness',()=>{
 const legacyReadiness={ready:true,blockers:[]};
 const status={stopped:false,domains:[{id:'d1',name:'example.com',dns,readiness:legacyReadiness,mailboxes:[{
  email:'sales@example.com',connection:'oauth',auth:ok,testSend:ok,imap:ok,incoming:ok,readiness:legacyReadiness
 }]}]};
 const view=mailboxStatusView(status);
 const mailbox=view.domains[0].mailboxes[0];
 assert.equal(mailbox.state,'READY');
 assert.equal(mailbox.action,null);
 assert.equal(mailbox.ready,true);
 assert.deepEqual(mailbox.blockers,[]);
 assert.deepEqual(mailbox.readiness,legacyReadiness,'legacy readiness remains present');
 assert.deepEqual(view.domains[0].readiness,legacyReadiness,'domain readiness remains present');
});

test('provider failures become stable actions for UI',()=>{
 const status={stopped:false,domains:[{id:'d1',name:'example.com',dns,readiness:{ready:false,blockers:[]},mailboxes:[{
  email:'sales@example.com',connection:'oauth',auth:ok,testSend:ok,imap:ok,incoming:ok,
  lastProviderError:{class:'REAUTH_REQUIRED',code:'invalid_grant'},readiness:{ready:false,blockers:[]}
 }]}]};
 const mailbox=mailboxStatusView(status).domains[0].mailboxes[0];
 assert.equal(mailbox.state,'REAUTH_REQUIRED');
 assert.equal(mailbox.action,'REAUTHENTICATE');
 assert.equal(mailbox.ready,false);
});
