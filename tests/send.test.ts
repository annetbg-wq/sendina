import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reserve,settle,senderMailbox,allowanceOf,today} from '../server/send';
import {seed,type State} from '../server/seed';

/** The rules that decide whether a message may leave, exercised directly against the function the
    send path actually calls. These are unit tests on purpose: the guarantee being asserted is that
    every rule is re-applied per message at the moment of sending, and that is a property of this
    function, not of any particular transport underneath it. */

const dnsOk={spf:true,dkim:true,dmarc:true,checkedAt:'2026-09-06T00:00:00Z'};
const ok={status:'ok',at:'2026-09-06T00:00:00Z',detail:''};

/** A workspace with one proven mailbox, one active campaign and one sendable recipient. */
function ready(){
 const s=seed() as State;
 s.domains=[{id:'d1',name:'sender.example',limit:5,used:0,usedOn:today(),dns:{...dnsOk},
  mailboxes:[{email:'out@sender.example',provider:'smtp',connection:'smtp',connectedAt:'x',
   auth:{...ok},testSend:{...ok},imap:{...ok},incoming:{...ok},transport:null,incomingUid:0}]}] as any;
 s.campaigns=[{id:'c1',name:'Тест',market:'США',goal:'Продажа',context:'Контекст',event:'Встреча',
  status:'active',sent:0,positive:0,value:0,control:'auto',firstBatchApprovedAt:null,
  createdAt:'2026-09-06T00:00:00Z'}] as any;
 s.contacts=[{id:'p1',campaignId:'c1',email:'buyer@customer.example',name:'Покупатель',
  company:'Customer',role:'CEO',country:'США',source:'https://customer.example/contact',
  basis:'Опубликованный рабочий контакт',reason:'Компания ищет ровно то, что мы делаем.',
  evidence:'Страница контактов',confidence:80,verification:'verified',origin:'search'}] as any;
 s.messages=[{id:'m1',campaignId:'c1',contactId:'p1',email:'buyer@customer.example',
  subject:'Тест',text:'Текст письма',status:'draft',bulk:false,
  at:'2026-09-06T00:00:00Z',sentAt:null,sentThrough:'',sendDetail:''}] as any;
 return s;
}
const go=(s:State,list:string[]=[])=>reserve(s,'c1','m1',list);

test('a message leaves only when every rule allows it, and reserves its quota when it does',()=>{
 const s=ready();
 const decision=go(s);
 assert.equal(decision.ok,true,decision.ok?'':decision.reason);
 if(!decision.ok)return;
 // What is sent is what the draft holds. Sending composes nothing of its own.
 assert.equal(decision.to,'buyer@customer.example');
 assert.equal(decision.subject,'Тест');
 assert.equal(decision.text,'Текст письма');
 // The allowance is spent before the network call, not after it.
 assert.equal(s.domains[0].used,1,'the quota is reserved, so a second run cannot spend it again');
 assert.equal(s.messages[0].status,'sending','and the draft is marked in flight');
 assert.equal(s.messages[0].sentThrough,'out@sender.example');
});

test('the emergency stop holds, on its own, before anything else is considered',()=>{
 const s=ready();
 s.stopped=true;
 const decision=go(s);
 assert.equal(decision.ok,false);
 if(decision.ok)return;
 assert.equal(decision.reason,'EMERGENCY_STOP');
 assert.equal(s.domains[0].used,0,'a refused message spends no allowance');
 assert.equal(s.messages[0].status,'draft','and stays a draft');
});

test('every recipient rule is re-applied at the moment of sending',()=>{
 const cases:[string,(s:State)=>void][]=[
  ['CAMPAIGN_PAUSED',s=>{s.campaigns[0].status='paused';}],
  ['GLOBAL_SUPPRESSION',s=>{s.suppressed.push('buyer@customer.example');}],
  ['REPLY_RECEIVED',s=>{s.replies.push({id:'r1',campaignId:'c1',email:'buyer@customer.example',
    text:'Уже ответили',category:'neutral',name:'',company:'',at:'2026-09-06T00:00:00Z'} as any);}],
  ['LEGAL_BASIS_REQUIRED',s=>{s.contacts[0].basis='';}],
  ['CONTACT_REASON_REQUIRED',s=>{s.contacts[0].reason='   ';}],
  ['SOURCE_UNVERIFIED',s=>{s.contacts[0].verification='unverified';}],
  ['MANUAL_APPROVAL_REQUIRED',s=>{s.campaigns[0].control='manual';}],
  ['FIRST_BATCH_APPROVAL_REQUIRED',s=>{s.campaigns[0].control='confirm';}],
  ['DOMAIN_LIMIT',s=>{s.domains[0].used=5;}],
  // A mailbox that has not proved all four checks is not a sender, whatever else is in order.
  ['SENDER_NOT_READY',s=>{s.domains[0].mailboxes[0].incoming={status:'none',at:null,detail:''};}],
  // Neither is one whose domain records were never checked.
  ['SENDER_NOT_READY',s=>{s.domains[0].dns={spf:false,dkim:false,dmarc:false,checkedAt:null};}]
 ];
 for(const [reason,break_] of cases){
  const s=ready();
  break_(s);
  const decision=go(s);
  assert.equal(decision.ok,false,`${reason}: this should not have been allowed`);
  if(decision.ok)continue;
  assert.equal(decision.reason,reason);
  assert.equal(s.messages[0].status,'draft',`${reason}: a refused message stays a draft`);
 }
});

test('a duplicate address is refused here too, not only in the preview',()=>{
 const s=ready();
 s.campaigns.push({...s.campaigns[0],id:'c2',name:'Другая'} as any);
 s.contacts.push({...s.contacts[0],id:'p2',campaignId:'c2'} as any);
 const decision=go(s);
 assert.equal(decision.ok,false);
 if(!decision.ok)assert.equal(decision.reason,'DUPLICATE_RECIPIENT');
});

test('during a controlled test nothing reaches an address that was not named in advance',()=>{
 const s=ready();
 const refused=go(s,['someone-else@ours.example']);
 assert.equal(refused.ok,false,'an address outside the list is refused however good it looks');
 if(!refused.ok)assert.equal(refused.reason,'RECIPIENT_NOT_ALLOWLISTED');
 assert.equal(s.domains[0].used,0,'and it costs no allowance');

 const permitted=go(ready(),['buyer@customer.example','other@ours.example']);
 assert.equal(permitted.ok,true,'a named address goes through as usual');

 // An empty list is not a fence that blocks everything, it is no fence at all.
 assert.equal(go(ready(),[]).ok,true);
});

test('the allow list is applied after the rules, never instead of them',()=>{
 const s=ready();
 s.stopped=true;
 const decision=go(s,['buyer@customer.example']);
 assert.equal(decision.ok,false);
 // Being on the list must never be able to rescue a message the rules refused.
 if(!decision.ok)assert.equal(decision.reason,'EMERGENCY_STOP');
});

test('a send that failed hands its allowance back and leaves a draft to retry',()=>{
 const s=ready();
 const decision=go(s);
 assert.equal(decision.ok,true);
 if(!decision.ok)return;
 assert.equal(s.domains[0].used,1);

 settle(s,'c1','m1','d1',{ok:false,detail:'SMTP отказал'});
 assert.equal(s.domains[0].used,0,'a message that never left cannot have spent a day of quota');
 assert.equal(s.messages[0].status,'draft','and can be sent again once the mailbox is fixed');
 assert.equal(s.messages[0].sendDetail,'SMTP отказал','with the reason kept');
 assert.equal(s.campaigns[0].sent,0,'nothing counts as sent');
});

test('a send that succeeded is recorded once, and the quota stays spent',()=>{
 const s=ready();
 const decision=go(s);
 assert.equal(decision.ok,true);
 settle(s,'c1','m1','d1',{ok:true,detail:'Отправлено через SMTP'});
 assert.equal(s.messages[0].status,'sent');
 assert.ok(s.messages[0].sentAt,'the time it left is kept');
 assert.equal(s.campaigns[0].sent,1);
 assert.equal(s.domains[0].used,1);
 // The same message can never be sent twice, however many times the run is repeated.
 const again=go(s);
 assert.equal(again.ok,false);
 if(!again.ok)assert.equal(again.reason,'ALREADY_SENT');
 assert.equal(s.domains[0].used,1,'and a repeat costs nothing');
});

test('the quota is a day at a time, and a new day starts it over',()=>{
 const spent={id:'d1',name:'x.example',limit:5,used:5,usedOn:today()};
 assert.deepEqual(allowanceOf(spent),{used:5,limit:5});
 // Without the reset, the first day a domain filled its allowance would be its last.
 const yesterday={id:'d1',name:'x.example',limit:5,used:5,usedOn:'2020-01-01'};
 assert.deepEqual(allowanceOf(yesterday),{used:0,limit:5});
 assert.equal(yesterday.usedOn,today());
 // A domain nobody has given an allowance to sends nothing, rather than sending without one.
 const untouched={id:'d1',name:'x.example',limit:0,used:0,usedOn:null};
 assert.deepEqual(allowanceOf(untouched),{used:0,limit:0});
});

test('the sending mailbox is chosen by readiness, not by being first in the list',()=>{
 const s=ready();
 // An unproven mailbox on a ready domain is skipped in favour of the one that proved itself.
 s.domains[0].mailboxes.unshift({email:'half@sender.example',provider:'smtp',connection:'smtp',
  auth:{...ok},testSend:{status:'failed',at:null,detail:''},imap:{...ok},incoming:{...ok}} as any);
 assert.equal(senderMailbox(s)?.mailbox.email,'out@sender.example');
 // With the emergency stop on, there is no sender at all.
 s.stopped=true;
 assert.equal(senderMailbox(s),null);
});
