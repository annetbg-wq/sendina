import {test} from 'node:test';
import assert from 'node:assert/strict';
import {policy,isBulk} from '../server/policy';
import {bindAddress,publicAddress} from '../server/config';
const valid={stopped:false,status:'active',suppressed:false,replied:false,basis:'documented consent',contactReason:'They published a request for this integration',sourceVerified:true,duplicate:false,verified:true,used:10,limit:100};
test('emergency stop overrides all other decisions',()=>assert.equal(policy({...valid,stopped:true}).reason,'EMERGENCY_STOP'));
test('global exclusions block recipients across campaigns',()=>assert.equal(policy({...valid,suppressed:true}).reason,'GLOBAL_SUPPRESSION'));
test('reply stops follow-ups',()=>assert.equal(policy({...valid,replied:true}).reason,'REPLY_RECEIVED'));
test('shared domain quota blocks at exact limit',()=>assert.equal(policy({...valid,used:100}).reason,'DOMAIN_LIMIT'));
test('unverified domain and missing contact grounds block',()=>{assert.equal(policy({...valid,verified:false}).reason,'DOMAIN_UNVERIFIED');assert.equal(policy({...valid,basis:''}).reason,'LEGAL_BASIS_REQUIRED');});
test('a recipient without a specific reason is treated as bulk mail',()=>{assert.equal(policy({...valid,contactReason:'   '}).reason,'CONTACT_REASON_REQUIRED');assert.ok(isBulk(''));assert.ok(!isBulk('a concrete reason'));});
test('an unverified source blocks before the domain is even considered',()=>assert.equal(policy({...valid,sourceVerified:false}).reason,'SOURCE_UNVERIFIED'));
test('an address repeated across campaigns is blocked',()=>assert.equal(policy({...valid,duplicate:true}).reason,'DUPLICATE_RECIPIENT'));
test('a paused campaign blocks before any recipient detail matters',()=>assert.equal(policy({...valid,status:'draft',duplicate:true,sourceVerified:false}).reason,'CAMPAIGN_PAUSED'));
test('allowed decisions retain version and timestamp',()=>{const d=policy(valid);assert.equal(d.decision,'allow');assert.equal(d.version,'1.1');assert.ok(Date.parse(d.at));});

test('a public bind address is refused without an access token', () => {
  assert.deepEqual(bindAddress({}), {host: '127.0.0.1', port: 3001, loopback: true});
  assert.deepEqual(bindAddress({HOST: 'localhost', PORT: '4000'}), {host: 'localhost', port: 4000, loopback: true});
  assert.deepEqual(bindAddress({RAILWAY_ENVIRONMENT_NAME: 'production', APP_TOKEN: 'secret', PORT: '8080'}), {host: '0.0.0.0', port: 8080, loopback: false});
  assert.throws(() => bindAddress({RAILWAY_ENVIRONMENT_NAME: 'production'}), /APP_TOKEN is required/);
  assert.throws(() => bindAddress({HOST: '0.0.0.0'}), /APP_TOKEN is required/);
});

test('a deployment finds its own public address', () => {
  assert.equal(publicAddress({PUBLIC_URL: 'https://example.com/'}), 'https://example.com');
  assert.equal(publicAddress({MCP_RESOURCE_URL: 'https://example.com/mcp'}), 'https://example.com');
  assert.equal(publicAddress({RAILWAY_PUBLIC_DOMAIN: 'sendina-production.up.railway.app'}), 'https://sendina-production.up.railway.app');
  assert.equal(publicAddress({PORT: '8080'}), 'http://127.0.0.1:8080');
});
