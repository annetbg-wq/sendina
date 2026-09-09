import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inboundCommitGuard,mailboxSyncSnapshot} from '../server/inboundsyncguard';

const mailbox=(overrides:any={})=>({
 provider:'google',connection:'oauth',connectedAt:'2026-09-09T10:00:00Z',
 incomingUid:0,incomingCursor:{provider:'google',value:'100'},...overrides
});

test('same connection generation and expected cursor may advance',()=>{
 const before=mailboxSyncSnapshot(mailbox(),'google');
 const guard=inboundCommitGuard(before,mailbox(),'google');
 assert.deepEqual(guard,{applyMessages:true,advanceCursor:true,currentCursor:{provider:'google',value:'100'}});
});

test('parallel reader with stale expected cursor may apply deduplicated messages but cannot roll cursor back',()=>{
 const before=mailboxSyncSnapshot(mailbox(),'google');
 const current=mailbox({incomingCursor:{provider:'google',value:'200'}});
 const guard=inboundCommitGuard(before,current,'google');
 assert.equal(guard.applyMessages,true);
 assert.equal(guard.advanceCursor,false);
 assert.deepEqual(guard.currentCursor,{provider:'google',value:'200'});
});

test('batch fetched by an older OAuth generation is discarded after reconnect',()=>{
 const before=mailboxSyncSnapshot(mailbox(),'google');
 const current=mailbox({connectedAt:'2026-09-09T10:05:00Z'});
 const guard=inboundCommitGuard(before,current,'google');
 assert.equal(guard.applyMessages,false);
 assert.equal(guard.advanceCursor,false);
});

test('provider or connection change invalidates an in-flight batch',()=>{
 const before=mailboxSyncSnapshot(mailbox(),'google');
 assert.equal(inboundCommitGuard(before,mailbox({provider:'microsoft'}),'google').applyMessages,false);
 assert.equal(inboundCommitGuard(before,mailbox({connection:'none'}),'google').applyMessages,false);
});

test('legacy UID participates in compare-and-set until an opaque cursor exists',()=>{
 const legacy=mailbox({incomingCursor:null,incomingUid:42});
 const before=mailboxSyncSnapshot(legacy,'smtp');
 assert.deepEqual(before.cursor,{provider:'smtp',value:'42'});
 assert.equal(inboundCommitGuard(before,legacy,'smtp').advanceCursor,true);
 const moved=mailbox({...legacy,incomingUid:43});
 assert.equal(inboundCommitGuard(before,moved,'smtp').advanceCursor,false);
});
