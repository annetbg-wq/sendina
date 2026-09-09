import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailProvider,providerCapabilities} from '../server/mailcontract';

const apps={
 google:{clientId:'g',clientSecret:'s'},
 microsoft:{clientId:'m',clientSecret:'s',tenant:'common'}
};

test('provider capabilities advertise only operations the contract can actually fulfill',()=>{
 assert.deepEqual([...providerCapabilities('google')],['SEND','READ','THREADS','REPLY_DETECTION']);
 assert.deepEqual([...providerCapabilities('microsoft')],['SEND','READ','THREADS','REPLY_DETECTION']);
 assert.deepEqual([...providerCapabilities('smtp')],['SEND','READ','REPLY_DETECTION']);
 for(const kind of ['google','microsoft','smtp'] as const)
  assert.equal(providerCapabilities(kind).has('PUSH_NOTIFICATIONS'),false,'periodic recovery is not a push subscription');
});

test('provider selection is centralized behind one runtime contract',async()=>{
 const google=mailProvider({kind:'oauth',provider:'google',email:'A@Example.com',refreshToken:'x'},apps);
 const microsoft=mailProvider({kind:'oauth',provider:'microsoft',email:'a@example.com',refreshToken:'x'},apps);
 const custom=mailProvider({kind:'smtp',provider:'smtp',email:'a@example.com'},apps);
 assert.equal(google.kind,'google');assert.equal(microsoft.kind,'microsoft');assert.equal(custom.kind,'smtp');
 for(const provider of [google,microsoft,custom]){
  assert.equal(typeof provider.getAccountIdentity,'function');
  assert.equal(typeof provider.sendMessage,'function');assert.equal(typeof provider.listMessages,'function');
  assert.equal(typeof provider.syncMessages,'function');assert.equal(typeof provider.getThread,'function');
  assert.equal(typeof provider.reconcileSent,'function');assert.equal(typeof provider.checkConnection,'function');
  assert.equal(typeof provider.checkIncoming,'function');assert.ok(provider.getCapabilities().has('SEND'));
 }
 assert.deepEqual(await google.getAccountIdentity(),{email:'a@example.com',provider:'google'});
});

test('custom SMTP reports provider-only operations unsupported instead of guessing',async()=>{
 const custom=mailProvider({kind:'smtp',provider:'smtp',email:'a@example.com'},apps);
 assert.deepEqual(await custom.reconcileSent('<message@example.com>'),{supported:false,evidence:null});
 assert.deepEqual(await custom.getThread('subject-is-not-a-thread'),{supported:false,threadId:'subject-is-not-a-thread',messages:[]});
});
