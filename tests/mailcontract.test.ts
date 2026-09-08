import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailProvider,providerCapabilities} from '../server/mailcontract';

const apps={
 google:{clientId:'g',clientSecret:'s'},
 microsoft:{clientId:'m',clientSecret:'s',tenant:'common'}
};

test('provider capabilities are explicit and do not pretend every transport is identical',()=>{
 assert.deepEqual([...providerCapabilities('google')],['SEND','READ','THREADS','REPLY_DETECTION']);
 assert.deepEqual([...providerCapabilities('microsoft')],['SEND','READ','THREADS','REPLY_DETECTION']);
 assert.deepEqual([...providerCapabilities('smtp')],['SEND','READ','REPLY_DETECTION']);
 assert.equal(providerCapabilities('smtp').has('THREADS'),false);
 assert.equal(providerCapabilities('google').has('PUSH_NOTIFICATIONS'),false,
  'push is not advertised until watch/subscription support actually exists');
});

test('provider selection is centralized behind one contract',()=>{
 const google=mailProvider({kind:'oauth',provider:'google',email:'a@example.com',refreshToken:'x'},apps);
 const microsoft=mailProvider({kind:'oauth',provider:'microsoft',email:'a@example.com',refreshToken:'x'},apps);
 const custom=mailProvider({kind:'smtp',provider:'smtp',email:'a@example.com'},apps);
 assert.equal(google.kind,'google');
 assert.equal(microsoft.kind,'microsoft');
 assert.equal(custom.kind,'smtp');
 for(const provider of [google,microsoft,custom]){
  assert.equal(typeof provider.sendMessage,'function');
  assert.equal(typeof provider.listMessages,'function');
  assert.equal(typeof provider.checkConnection,'function');
  assert.equal(typeof provider.checkIncoming,'function');
  assert.ok(provider.getCapabilities().has('SEND'));
 }
});
