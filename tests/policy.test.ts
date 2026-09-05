import {test} from 'node:test';
import assert from 'node:assert/strict';
import {policy} from '../server/policy';
import {bindAddress} from '../server/config';
const valid={stopped:false,status:'active',suppressed:false,replied:false,basis:'documented consent',verified:true,used:10,limit:100};
test('emergency stop overrides all other decisions',()=>assert.equal(policy({...valid,stopped:true}).reason,'EMERGENCY_STOP'));
test('global exclusions block recipients across campaigns',()=>assert.equal(policy({...valid,suppressed:true}).reason,'GLOBAL_SUPPRESSION'));
test('reply stops follow-ups',()=>assert.equal(policy({...valid,replied:true}).reason,'REPLY_RECEIVED'));
test('shared domain quota blocks at exact limit',()=>assert.equal(policy({...valid,used:100}).reason,'DOMAIN_LIMIT'));
test('unverified domain and missing contact grounds block',()=>{assert.equal(policy({...valid,verified:false}).reason,'DOMAIN_UNVERIFIED');assert.equal(policy({...valid,basis:''}).reason,'LEGAL_BASIS_REQUIRED');});
test('allowed decisions retain version and timestamp',()=>{const d=policy(valid);assert.equal(d.decision,'allow');assert.equal(d.version,'1.0');assert.ok(Date.parse(d.at));});

test('a public bind address is refused without an access token', () => {
  assert.deepEqual(bindAddress({}), {host: '127.0.0.1', port: 3001, loopback: true});
  assert.deepEqual(bindAddress({HOST: 'localhost', PORT: '4000'}), {host: 'localhost', port: 4000, loopback: true});
  assert.deepEqual(bindAddress({RAILWAY_ENVIRONMENT_NAME: 'production', APP_TOKEN: 'secret', PORT: '8080'}), {host: '0.0.0.0', port: 8080, loopback: false});
  assert.throws(() => bindAddress({RAILWAY_ENVIRONMENT_NAME: 'production'}), /APP_TOKEN is required/);
  assert.throws(() => bindAddress({HOST: '0.0.0.0'}), /APP_TOKEN is required/);
});
