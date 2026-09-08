import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailboxUi,isHttpsApiMailbox,mailboxTransportLabel} from '../src/mailbox-ui';

test('mailbox UI presents product states instead of four transport checks',()=>{
 assert.deepEqual(mailboxUi({state:'READY',connection:'oauth'}),{
  label:'Готов',badge:'active',lead:'Отправка и приём через почтового провайдера доступны.',primaryAction:null});
 assert.equal(mailboxUi({state:'REAUTH_REQUIRED',connection:'oauth'}).label,'Нужно войти снова');
 assert.equal(mailboxUi({state:'REAUTH_REQUIRED',connection:'oauth'}).primaryAction,'REAUTHENTICATE');
 assert.equal(mailboxUi({state:'DEGRADED',connection:'oauth'}).primaryAction,'RETRY');
 assert.equal(mailboxUi({state:'ERROR',connection:'oauth'}).primaryAction,'FIX_CONFIGURATION');
});

test('Google and Microsoft OAuth are presented as HTTPS API mailboxes',()=>{
 for(const provider of ['google','microsoft']){
  const mailbox={provider,connection:'oauth'};
  assert.equal(isHttpsApiMailbox(mailbox),true);
  assert.equal(mailboxTransportLabel(mailbox),'HTTPS API · SMTP/IMAP не требуются');
 }
 assert.equal(isHttpsApiMailbox({provider:'smtp',connection:'smtp'}),false);
 assert.equal(mailboxTransportLabel({provider:'smtp',connection:'smtp'}),'Custom SMTP/IMAP');
});
