import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readiness,mailboxReadiness,domainReadiness} from '../server/readiness';
import {providerOfMx,detectProvider} from '../server/mailproviders';
import {encrypt,decrypt} from '../server/secrets';

const dnsOk={spf:true,dkim:true,dmarc:true,dnsCheckedAt:'2026-09-06T00:00:00Z'};
const working={stopped:false,connection:'oauth' as const,
 auth:'ok' as const,testSend:'ok' as const,imap:'ok' as const,incoming:'ok' as const,...dnsOk};

test('a DNS check alone never makes a mailbox ready',()=>{
 const dnsOnly=readiness({...working,connection:'none',auth:'none',testSend:'none',imap:'none',incoming:'none'});
 assert.equal(dnsOnly.ready,false);
 assert.deepEqual(dnsOnly.blockers,['NOT_CONNECTED']);
 // Perfect DNS with no connection stays unready, which is the whole point of the distinction.
 assert.ok(!dnsOnly.blockers.some(b=>b.endsWith('_MISSING')));
});

test('a mailbox is ready only after all four proofs',()=>{
 assert.deepEqual(readiness(working),{ready:true,blockers:[]});
 assert.deepEqual(readiness({...working,auth:'none'}).blockers,['AUTH_REQUIRED']);
 assert.deepEqual(readiness({...working,auth:'failed'}).blockers,['AUTH_FAILED']);
 assert.deepEqual(readiness({...working,testSend:'failed'}).blockers,['TEST_SEND_FAILED']);
 assert.deepEqual(readiness({...working,imap:'failed'}).blockers,['INCOMING_CHANNEL_FAILED']);
 assert.deepEqual(readiness({...working,incoming:'none'}).blockers,['INCOMING_MESSAGE_REQUIRED']);
 assert.deepEqual(readiness({...working,incoming:'failed'}).blockers,['INCOMING_MESSAGE_FAILED']);
});

test('sending works but nothing comes back: still not ready',()=>{
 const oneWay=readiness({...working,imap:'failed',incoming:'failed'});
 assert.equal(oneWay.ready,false);
 assert.deepEqual(oneWay.blockers,['INCOMING_CHANNEL_FAILED','INCOMING_MESSAGE_FAILED']);
});

test('every unmet condition is reported at once',()=>{
 const nothing=readiness({stopped:true,connection:'none',auth:'none',testSend:'none',imap:'none',incoming:'none',
  spf:false,dkim:false,dmarc:false,dnsCheckedAt:null});
 assert.deepEqual(nothing.blockers,['EMERGENCY_STOP','NOT_CONNECTED','DNS_NOT_CHECKED']);
 const connectedNoDns=readiness({...working,dnsCheckedAt:null});
 assert.deepEqual(connectedNoDns.blockers,['DNS_NOT_CHECKED']);
 assert.deepEqual(readiness({...working,spf:false,dkim:false}).blockers,['SPF_MISSING','DKIM_MISSING']);
});

test('a domain is ready when one of its mailboxes is',()=>{
 const ok={status:'ok'};
 const domain={dns:{spf:true,dkim:true,dmarc:true,checkedAt:'2026-09-06T00:00:00Z'},mailboxes:[
  {email:'a@x.example',connection:'none'},
  {email:'b@x.example',connection:'smtp',auth:ok,testSend:ok,imap:ok,incoming:ok}]};
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

test('a stored secret is unreadable without the key and survives a round trip',async()=>{
 const secret='app-password-1234';
 const sealed=await encrypt(secret);
 assert.notEqual(sealed,secret);
 assert.ok(!sealed.includes(secret),'the plain value must not appear in the stored form');
 assert.ok(sealed.startsWith('enc.v1.'));
 assert.equal(await decrypt(sealed),secret);
 assert.notEqual(sealed,await encrypt(secret),'each encryption uses its own nonce');
 assert.equal(await decrypt(''),'');
 // Anything written before encryption existed still reads back.
 assert.equal(await decrypt('legacy-plain-value'),'legacy-plain-value');
});

test('settings are worked out from the domain, and Google or Microsoft are left to OAuth',async()=>{
 const {guessMailSettings}=await import('../server/autoconfig');
 // A provider recognised by its MX records brings its own documented settings.
 const yandex=await guessMailSettings('company.example',['mx.yandex.net']);
 assert.equal(yandex?.source,'provider');
 assert.equal(yandex?.smtp.host,'smtp.yandex.ru');
 assert.equal(yandex?.imap.port,993);
 assert.equal(yandex?.imap.secure,true);

 // An unrecognised provider still gets a starting point rather than an empty form.
 const unknown=await guessMailSettings('company.example',['mail.company.example']);
 assert.equal(unknown?.source,'convention');
 // A single mail host serving both is the usual hosting-panel arrangement.
 assert.equal(unknown?.smtp.host,'mail.company.example');
 assert.equal(unknown?.imap.host,'mail.company.example');
 // Where the MX names the sending host, the receiving one is named to match.
 const split=await guessMailSettings('company.example',['smtp.company.example']);
 assert.equal(split?.smtp.host,'smtp.company.example');
 assert.equal(split?.imap.host,'imap.company.example');

 // Google and Microsoft connect over OAuth, so no password settings are offered.
 assert.equal(await guessMailSettings('company.example',['aspmx.l.google.com']),null);
 assert.equal(await guessMailSettings('company.example',['company-com.mail.protection.outlook.com']),null);

 // A domain with no MX at all cannot be guessed, and says so instead of inventing a host.
 assert.equal(await guessMailSettings('company.example',[]),null);
});

test('the reply heuristic is stated, not guessed at silently',async()=>{
 const {classify}=await import('../server/mailboxes');
 assert.equal(classify('Интересно, давайте обсудим на встрече'),'positive');
 assert.equal(classify('Пожалуйста, отпишите меня от рассылки'),'unsubscribe');
 assert.equal(classify('Спасибо, не интересно'),'negative');
 assert.equal(classify('Out of office until Monday'),'automatic');
 assert.equal(classify('Обратитесь к моему коллеге'),'referral');
 assert.equal(classify('Что-то совсем нейтральное'),'neutral');
});
