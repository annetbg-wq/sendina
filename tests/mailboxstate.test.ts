import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailboxState} from '../server/mailboxstate';

const dns={spf:true,dkim:true,dmarc:true,checkedAt:'2026-09-08T00:00:00Z'};
const ok={status:'ok',code:'OK'};
const none={status:'none'};
const domain=(mailbox:any)=>({dns,mailboxes:[mailbox]});
const connected=(extra:any={})=>({connection:'oauth',auth:{...ok},testSend:{...ok},imap:{...ok},incoming:{...ok},...extra});

test('mailbox state exposes the six product states without replacing readiness blockers',()=>{
 let box:any={connection:'none',auth:none,testSend:none,imap:none,incoming:none};
 assert.deepEqual(mailboxState(domain(box),box),{state:'DISCONNECTED',ready:false,blockers:['NOT_CONNECTED'],action:'CONNECT'});

 box={connection:'oauth',auth:none,testSend:none,imap:none,incoming:none};
 assert.equal(mailboxState(domain(box),box).state,'CONNECTING');
 assert.equal(mailboxState(domain(box),box).action,'VERIFY');

 box=connected();
 assert.equal(mailboxState(domain(box),box).state,'READY');
 assert.equal(mailboxState(domain(box),box).ready,true);

 box=connected({incoming:{status:'failed',code:'TIMEOUT'}});
 assert.equal(mailboxState(domain(box),box).state,'DEGRADED');
 assert.equal(mailboxState(domain(box),box).action,'RETRY');

 box=connected({auth:{status:'failed',code:'AUTH_REJECTED'}});
 assert.equal(mailboxState(domain(box),box).state,'REAUTH_REQUIRED');
 assert.equal(mailboxState(domain(box),box).action,'REAUTHENTICATE');

 box=connected({lastProviderError:{class:'PERMANENT',code:'MAILBOX_NOT_FOUND'}});
 assert.equal(mailboxState(domain(box),box).state,'ERROR');
 assert.equal(mailboxState(domain(box),box).action,'FIX_CONFIGURATION');
});

test('provider failure classes take precedence over generic failed checks',()=>{
 const retry=connected({lastProviderError:{class:'RATE_LIMITED',code:'429'}});
 assert.equal(mailboxState(domain(retry),retry).state,'DEGRADED');

 const reauth=connected({lastProviderError:{class:'REAUTH_REQUIRED',code:'invalid_grant'}});
 assert.equal(mailboxState(domain(reauth),reauth).state,'REAUTH_REQUIRED');
});

test('DNS and emergency blockers still prevent READY',()=>{
 const box=connected();
 const badDomain={dns:{spf:false,dkim:false,dmarc:true,checkedAt:'2026-09-08T00:00:00Z'},mailboxes:[box]};
 const bad=mailboxState(badDomain,box);
 assert.equal(bad.state,'DEGRADED');
 assert.deepEqual(bad.blockers,['SPF_MISSING','DKIM_MISSING']);
 assert.equal(mailboxState(domain(box),box,true).state,'DEGRADED');
});
