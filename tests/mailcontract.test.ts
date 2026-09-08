import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailProvider,providerCapabilities} from '../server/mailcontract';

const apps={
 google:{clientId:'g',clientSecret:'s'},
 microsoft:{clientId:'m',clientSecret:'s',tenant:'common'}
};

test('provider capabilities advertise only operations the contract can actually fulfill',()=>{
 for(const kind of ['google','microsoft','smtp'] as const){
  const caps=providerCapabilities(kind);
  assert.deepEqual([...caps],['SEND','READ','REPLY_DETECTION']);
  assert.equal(caps.has('THREADS'),false);
  assert.equal(caps.has('PUSH_NOTIFICATIONS'),false);
 }
});

test('provider selection is centralized behind one runtime contract',()=>{
 const google=mailProvider({kind:'oauth',provider:'google',email:'a@example.com',refreshToken:'x'},apps);
 const microsoft=mailProvider({kind:'oauth',provider:'microsoft',email:'a@example.com',refreshToken:'x'},apps);
 const custom=mailProvider({kind:'smtp',provider:'smtp',email:'a@example.com'},apps);
 assert.equal(google.kind,'google');
 assert.equal(microsoft.kind,'microsoft');
 assert.equal(custom.kind,'smtp');
 for(const provider of [google,microsoft,custom]){
  assert.equal(typeof provider.sendMessage,'function');
  assert.equal(typeof provider.listMessages,'function');
  assert.equal(typeof provider.syncMessages,'function');
  assert.equal(typeof provider.checkConnection,'function');
  assert.equal(typeof provider.checkIncoming,'function');
  assert.ok(provider.getCapabilities().has('SEND'));
 }
});
