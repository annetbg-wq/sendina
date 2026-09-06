import {test,expect,type Page} from '@playwright/test';
import {signIn,noOriginError} from './signin';

/** Who sees what. The menu is built from the role, and the routes behind it are refused
    independently — so hiding the item is a courtesy, not the protection. */

test.describe.configure({mode:'serial'});

const call=(page:Page,path:string,body?:unknown)=>page.evaluate(async({path,body}:any)=>{
 const token=localStorage.getItem('sendina-session')??'';
 const r=await fetch('/api'+path,{method:body===undefined?'GET':'POST',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
  body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.text()};
},{path,body});

test('a superadmin sees Accounts and can look at another workspace read-only',async({page})=>{
 await signIn(page,'boss@example.com');
 await expect(page.locator('nav')).toContainText('Аккаунты');
 await page.locator('nav').getByRole('button',{name:'Аккаунты',exact:true}).click();
 await expect(page.locator('h1')).toHaveText('Аккаунты');
 await expect(page.getByRole('button',{name:'Просмотреть как пользователь'}).first()).toBeVisible({timeout:15000});
 await noOriginError(page);
});

test('an unapproved address is queued and reaches nothing',async({page})=>{
 await page.goto('/');
 await page.getByLabel('Рабочий адрес').fill('member@example.com');
 await page.getByRole('button',{name:'Прислать ссылку для входа'}).click();
 await expect(page.getByRole('heading',{name:'Заявка принята'})).toBeVisible({timeout:15000});
 await expect(page.locator('nav')).toHaveCount(0);
});

test('an ordinary user has no Accounts item and no way round it',async({page})=>{
 // The superadmin approves the address that just asked for access. The same page does both, so
 // the two sessions never share this browser's storage.
 await signIn(page,'boss@example.com');
 const accounts=JSON.parse((await call(page,'/accounts')).body);
 const member=accounts.find((a:any)=>a.email==='member@example.com');
 expect(member,'the pending account exists').toBeTruthy();
 expect((await call(page,'/accounts/decide',{id:member.id,status:'approved'})).status).toBe(200);
 await page.evaluate(()=>localStorage.removeItem('sendina-session'));

 await signIn(page,'member@example.com');
 // The menu never offers it.
 await expect(page.locator('nav')).not.toContainText('Аккаунты');
 // And the routes refuse it, whichever way it is reached.
 expect((await call(page,'/accounts')).status).toBe(403);
 expect((await call(page,`/accounts/${member.id}/workspace`)).status).toBe(403);
 expect((await call(page,'/platform')).status).toBe(403);
 expect((await call(page,'/support-log')).status).toBe(403);
 expect((await call(page,'/accounts/decide',{id:member.id,status:'approved'})).status).toBe(403);
 await noOriginError(page);
});

test('the support view reads another workspace and offers no way to write to it',async({page})=>{
 await signIn(page,'boss@example.com');
 const accounts=JSON.parse((await call(page,'/accounts')).body);
 const member=accounts.find((a:any)=>a.email==='member@example.com');
 const view=await call(page,`/accounts/${member.id}/workspace`);
 expect(view.status).toBe(200);
 expect(JSON.parse(view.body).readOnly).toBe(true);

 // There is no mutating route that acts for another account: the only way to change a workspace
 // is to be signed in as it, and this session is not.
 for(const [path,body] of [['/campaigns',{name:'Не должно появиться',goal:'Продажа услуги',
   context:'Суперадмин не пишет в чужую рабочую область.',event:'Встреча'}]] as const){
  const written=await call(page,path,body);
  expect(written.status).toBe(201);
 }
 const theirs=JSON.parse((await call(page,`/accounts/${member.id}/workspace`)).body);
 expect(theirs.campaigns.some((c:any)=>c.name==='Не должно появиться'),
  'a superadmin writing lands in their own workspace, never the account they are viewing').toBe(false);

 // The visit itself is on the record.
 const log=JSON.parse((await call(page,'/support-log')).body);
 expect(log.some((e:any)=>e.actor==='boss@example.com'&&e.subject==='member@example.com')).toBe(true);
});
