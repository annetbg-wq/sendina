import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dir=await mkdtemp(join(tmpdir(),'sendina-oauth-state-'));
process.env.DATA_DIR=dir;
process.env.DATABASE_URL='';
const {issueMailOauthState,consumeMailOauthState}=await import('../server/oauthstate');

test('mail OAuth state is durable-shaped, single-use and normalized',async()=>{
 const state=await issueMailOauthState({accountId:'acc-1',email:'User@Example.com',provider:'google'});
 assert.ok(state.length>=40,'state must have enough entropy for an OAuth CSRF token');
 const first=await consumeMailOauthState(state);
 assert.equal(first?.accountId,'acc-1');
 assert.equal(first?.email,'user@example.com');
 assert.equal(first?.provider,'google');
 assert.equal(await consumeMailOauthState(state),null,'the same callback state cannot be replayed');
});

test('expired OAuth state is rejected and consumed',async()=>{
 const state=await issueMailOauthState({accountId:'acc-2',email:'x@example.com',provider:'microsoft'},-1);
 assert.equal(await consumeMailOauthState(state),null);
 assert.equal(await consumeMailOauthState(state),null,'an expired token is removed as well');
});

test('unknown OAuth state never authenticates a callback',async()=>{
 assert.equal(await consumeMailOauthState('not-a-real-state'),null);
});
