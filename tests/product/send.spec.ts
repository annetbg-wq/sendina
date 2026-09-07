import {test,expect,type Page} from '@playwright/test';
import {signIn,noOriginError} from './signin';

/** Sending, driven through the interface.

    The product could not send at all until now, so this is the first test of the screen where a
    message actually leaves. What it asserts is mostly the refusals: that the interface will not
    offer the button until a mailbox has proved itself and a domain has been given an allowance,
    that the rehearsal sends nothing, and that a real send reports what it did per message. */

test.describe.configure({mode:'serial'});

const superadmin='boss@example.com';
const mailbox='outreach@ours.example';
/** The fence the harness runs behind: the only address anything may reach. */
const permitted='buyer@ours.example';

const call=(page:Page,path:string,body?:unknown)=>page.evaluate(async({path,body}:any)=>{
 const token=localStorage.getItem('sendina-session')??'';
 const r=await fetch('/api'+path,{method:body===undefined?'GET':'POST',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
  body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
},{path,body});

/** Connects the mailbox and lets it pass its four checks. Consent happens at the provider, which
    a browser test cannot click through, so the callback is followed the way the provider would. */
async function connectMailbox(page:Page){
 const start=await call(page,'/mailboxes/oauth',{email:mailbox,provider:'google'});
 const state=new URL(start.body.url).searchParams.get('state');
 await page.evaluate(s=>fetch(`/oauth/mailbox/callback?code=stub-code&state=${s}`),state);
 const verified=await call(page,'/mailboxes/verify',{email:mailbox});
 expect(verified.body.ready===false||verified.body.ready===true).toBe(true);
 return verified.body;
}

const openMail=async(page:Page)=>{
 await page.locator('nav').getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Почта и домены'}).click();
};

test('the interface says sending is impossible, and why, until it really is possible',async({page})=>{
 await signIn(page,superadmin);
 await openMail(page);

 // Nothing is connected yet, so the screen says so rather than offering a button that would fail.
 const panel=page.locator('.send-state');
 await expect(panel).toBeVisible();
 await expect(panel).toContainText('Нет проверенного ящика');
 // The controlled-test fence is stated up front, so nobody has to guess what it will do.
 await expect(panel).toContainText('Контролируемая отправка');
 await expect(panel).toContainText(permitted);

 const verified=await connectMailbox(page);
 for(const step of ['auth','testSend','imap','incoming'])
  expect(verified.checks[step].status,`${step}: ${verified.checks[step].detail}`).toBe('ok');
 await page.reload();
 await openMail(page);

 // Four checks passed, but the domain records have not been looked at: still not ready.
 await expect(panel).not.toContainText('Отправка возможна');

 const domains=await call(page,'/mailboxes/status');
 const domainId=domains.body.domains[0].id;
 await call(page,`/domains/${domainId}/check`,{});
 await page.reload();
 await openMail(page);

 // Records in order, and still not ready: nobody has said how much this domain may send.
 await expect(panel).toContainText('Не задан суточный лимит домена');
 await noOriginError(page);
});

test('an operator sets the daily allowance by hand, and only then can anything be sent',async({page})=>{
 await signIn(page,superadmin);
 await openMail(page);

 // A limit is a judgement about the reputation of a domain, so it is typed, never assumed.
 const form=page.locator('form.allowance').first();
 await expect(form).toBeVisible();
 await expect(form.getByLabel('Писем в сутки')).toHaveValue('0');
 await form.getByLabel('Писем в сутки').fill('3');
 await form.getByRole('button',{name:'Сохранить лимит'}).click();

 const panel=page.locator('.send-state');
 await expect(panel).toContainText('Отправка возможна',{timeout:15000});
 await expect(panel).toContainText(mailbox);
 await expect(panel).toContainText('Суточный лимит домена: 0 / 3');
 await noOriginError(page);
});

test('the rehearsal answers the same question and sends nothing',async({page})=>{
 await signIn(page,superadmin);

 // A campaign with one recipient who is allowed, and one who is not.
 const campaign=(await call(page,'/campaigns',{name:'Живая проверка отправки',market:'США',
  goal:'Продажа услуги',context:'Проверяем реальную отправку через подключённый ящик.',
  event:'Встреча',control:'auto'})).body;
 await call(page,`/campaigns/${campaign.id}/contacts`,{contacts:[
  {email:permitted,name:'Покупатель',company:'Ours',source:'https://ours.example/contact',
   basis:'Опубликованный рабочий контакт',reason:'Компания ищет ровно то, что мы предлагаем.'},
  {email:'stranger@elsewhere.example',name:'Посторонний',company:'Elsewhere',
   source:'https://elsewhere.example/contact',basis:'Опубликованный рабочий контакт',
   reason:'Внешне подходящая компания, но адрес не согласован для теста.'}]});
 await call(page,`/campaigns/${campaign.id}/preview`,{limit:10});
 await call(page,`/campaigns/${campaign.id}/status`,{status:'active'});

 await page.reload();
 await page.locator('nav').getByRole('button',{name:'Рассылки',exact:true}).click();
 await page.getByRole('button',{name:'Живая проверка отправки'}).click();

 const dialog=page.getByRole('dialog');
 await expect(dialog.getByText('Готово к отправке: 2')).toBeVisible();
 await dialog.getByRole('button',{name:'Репетиция без отправки'}).click();

 // The rehearsal reports per message, and says plainly that nothing left.
 const result=page.getByRole('dialog');
 await expect(result).toContainText('Репетиция: ничего не отправлено',{timeout:30000});
 await expect(result).toContainText(permitted);
 await expect(result).toContainText('Прошло бы');
 // And the address nobody named is refused for exactly that reason, not for a vague one.
 await expect(result).toContainText('Адрес не в списке разрешённых');

 // Nothing changed: both letters are still drafts and no allowance was spent.
 const state=(await call(page,'/state')).body;
 expect(state.messages.filter((m:any)=>m.campaignId===campaign.id&&m.status==='draft')).toHaveLength(2);
 expect((await call(page,'/sender')).body.allowance.used).toBe(0);
 await noOriginError(page);
});

test('a real send goes out, is reported per message, and spends the allowance once',async({page})=>{
 await signIn(page,superadmin);
 await page.locator('nav').getByRole('button',{name:'Рассылки',exact:true}).click();
 await page.getByRole('button',{name:'Живая проверка отправки'}).click();

 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Отправить по-настоящему'}).click();

 const result=page.getByRole('dialog');
 await expect(result).toContainText('Отправлено писем: 1',{timeout:30000});
 await expect(result).toContainText(permitted);
 // The one that was fenced is still named, with its reason, rather than quietly omitted.
 await expect(result).toContainText('Адрес не в списке разрешённых');

 const state=(await call(page,'/state')).body;
 const sent=state.messages.filter((m:any)=>m.status==='sent');
 expect(sent).toHaveLength(1);
 expect(sent[0].email).toBe(permitted);
 expect(sent[0].sentThrough).toBe(mailbox);
 expect(sent[0].sentAt).toBeTruthy();
 // The address that was refused is still a draft, and cost nothing.
 expect(state.messages.some((m:any)=>m.email==='stranger@elsewhere.example'&&m.status==='draft')).toBe(true);
 expect((await call(page,'/sender')).body.allowance).toEqual({used:1,limit:3,remaining:2});
 expect(state.audit.some((a:any)=>a.action.includes('Отправка «Живая проверка отправки»'))).toBe(true);

 // Running it again sends nothing to the same person twice: that letter is no longer a draft.
 const again=await call(page,`/campaigns/${state.campaigns[0].id}/send`,{});
 expect(again.body.sent).toBe(0);
 expect((await call(page,'/sender')).body.allowance.used).toBe(1);
 await noOriginError(page);
});

test('the emergency stop takes the send button away and refuses the route behind it',async({page})=>{
 await signIn(page,superadmin);
 await page.locator('nav').getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Рабочая область'}).click();
 await page.getByRole('button',{name:'Остановить все кампании'}).click();

 await page.locator('nav').getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Почта и домены'}).click();
 await expect(page.locator('.send-state')).toContainText('Аварийная остановка');

 // The interface refuses it, and so does the route, so neither depends on the other.
 const campaign=(await call(page,'/state')).body.campaigns[0];
 const refused=await call(page,`/campaigns/${campaign.id}/send`,{});
 expect(refused.status).toBe(422);
 expect(refused.body.error).toMatch(/Аварийная остановка/);

 await page.locator('nav').getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Рабочая область'}).click();
 await page.getByRole('button',{name:'Снять аварийную остановку'}).click();
 await noOriginError(page);
});
