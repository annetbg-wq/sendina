import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailboxReadiness} from '../server/readiness';
import {mailboxState} from '../server/mailboxstate';

const domain={dns:{spf:true,dkim:true,dmarc:true,checkedAt:'2026-09-08T09:00:00Z'}};
const proof=(status:'ok'|'failed',at:string,code='OK')=>({status,at,detail:'',code});

test('proofs from an older credential generation become pending after reconnect',()=>{
 const mailbox={email:'out@example.com',connection:'oauth',connectedAt:'2026-09-08T12:00:00Z',
  auth:proof('ok','2026-09-08T11:00:00Z'),testSend:proof('ok','2026-09-08T11:01:00Z'),
  imap:proof('ok','2026-09-08T11:02:00Z'),incoming:proof('ok','2026-09-08T11:03:00Z')};
 const readiness=mailboxReadiness(domain,mailbox);
 assert.equal(readiness.ready,false);
 assert.deepEqual(readiness.blockers,['AUTH_REQUIRED','TEST_SEND_REQUIRED','INCOMING_CHANNEL_REQUIRED','INCOMING_MESSAGE_REQUIRED']);
 assert.equal(mailboxState(domain,mailbox).state,'CONNECTING');
 assert.equal(mailboxState(domain,mailbox).action,'VERIFY');
});

test('a stale auth rejection cannot label a newly connected credential REAUTH_REQUIRED',()=>{
 const mailbox={email:'out@example.com',connection:'oauth',connectedAt:'2026-09-08T12:00:00Z',
  auth:proof('failed','2026-09-08T11:59:00Z','AUTH_REJECTED'),
  testSend:proof('ok','2026-09-08T11:00:00Z'),imap:proof('ok','2026-09-08T11:00:00Z'),incoming:proof('ok','2026-09-08T11:00:00Z')};
 assert.equal(mailboxState(domain,mailbox).state,'CONNECTING');
});

test('all proofs from the current connection make the mailbox ready',()=>{
 const mailbox={email:'out@example.com',connection:'oauth',connectedAt:'2026-09-08T12:00:00Z',
  auth:proof('ok','2026-09-08T12:00:01Z'),testSend:proof('ok','2026-09-08T12:00:02Z'),
  imap:proof('ok','2026-09-08T12:00:03Z'),incoming:proof('ok','2026-09-08T12:00:04Z')};
 assert.equal(mailboxReadiness(domain,mailbox).ready,true);
 assert.equal(mailboxState(domain,mailbox).state,'READY');
});

test('legacy records without connectedAt keep their old proof semantics until next reconnect',()=>{
 const mailbox={email:'legacy@example.com',connection:'oauth',connectedAt:null,
  auth:proof('ok','2025-01-01T00:00:00Z'),testSend:proof('ok','2025-01-01T00:00:00Z'),
  imap:proof('ok','2025-01-01T00:00:00Z'),incoming:proof('ok','2025-01-01T00:00:00Z')};
 assert.equal(mailboxReadiness(domain,mailbox).ready,true);
});
