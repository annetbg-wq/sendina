import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readiness,mailboxReadiness,domainReadiness} from '../server/readiness';
import {providerOfMx,detectProvider} from '../server/mailproviders';

const dnsOk={spf:true,dkim:true,dmarc:true,dnsCheckedAt:'2026-09-06T00:00:00Z'};
const connected={stopped:false,connection:'oauth' as const,testSend:'ok' as const,...dnsOk};

test('a DNS check alone never makes a mailbox ready',()=>{
 const dnsOnly=readiness({...connected,connection:'none',testSend:'none'});
 assert.equal(dnsOnly.ready,false);
 assert.ok(dnsOnly.blockers.includes('NOT_CONNECTED'));
 // Perfect DNS with no connection stays unready, which is the whole point of the distinction.
 assert.ok(!dnsOnly.blockers.some(b=>b.endsWith('_MISSING')));
});

test('a connection without a test send is not ready either',()=>{
 assert.deepEqual(readiness({...connected,testSend:'none'}).blockers,['TEST_SEND_REQUIRED']);
 assert.deepEqual(readiness({...connected,testSend:'failed'}).blockers,['TEST_SEND_FAILED']);
});

test('readiness needs connection, a successful test send and the domain records',()=>{
 assert.deepEqual(readiness(connected),{ready:true,blockers:[]});
 assert.deepEqual(readiness({...connected,dnsCheckedAt:null}).blockers,['DNS_NOT_CHECKED']);
 assert.deepEqual(readiness({...connected,spf:false,dkim:false}).blockers,['SPF_MISSING','DKIM_MISSING']);
 assert.ok(readiness({...connected,stopped:true}).blockers.includes('EMERGENCY_STOP'));
});

test('every unmet condition is reported at once',()=>{
 const nothing=readiness({stopped:true,connection:'none',testSend:'none',spf:false,dkim:false,dmarc:false,dnsCheckedAt:null});
 assert.deepEqual(nothing.blockers,['EMERGENCY_STOP','NOT_CONNECTED','DNS_NOT_CHECKED']);
});

test('a domain is ready when one of its mailboxes is',()=>{
 const domain={dns:{spf:true,dkim:true,dmarc:true,checkedAt:'2026-09-06T00:00:00Z'},mailboxes:[
  {email:'a@x.example',connection:'none',testSend:{status:'none'}},
  {email:'b@x.example',connection:'oauth',testSend:{status:'ok'}}]};
 assert.equal(domainReadiness(domain).ready,true);
 assert.equal(mailboxReadiness(domain,domain.mailboxes[0]).ready,false);
 assert.equal(domainReadiness({...domain,mailboxes:[domain.mailboxes[0]]}).ready,false);
 assert.deepEqual(domainReadiness({dns:domain.dns,mailboxes:[]}).blockers,['NO_MAILBOX']);
});

test('the provider is read from the MX records of the organisation domain',()=>{
 assert.equal(providerOfMx(['aspmx.l.google.com','alt1.aspmx.l.google.com']),'google');
 assert.equal(providerOfMx(['company-com.mail.protection.outlook.com']),'microsoft');
 assert.equal(providerOfMx(['mx1.mailgun.org']),null);
 assert.equal(providerOfMx([]),null);
});

test('personal mail is identified as a secondary case, and an unknown domain falls back to SMTP',async()=>{
 const personal=await detectProvider('someone@gmail.com');
 assert.equal(personal.provider,'google');
 assert.equal(personal.personal,true);
 assert.equal(personal.workspace,false);
 const unknown=await detectProvider('sales@no-such-domain-for-sendina.example');
 assert.equal(unknown.provider,'smtp');
 assert.equal(unknown.personal,false);
});
