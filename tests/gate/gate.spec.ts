import {test,expect} from '@playwright/test';

test('the sign-in screen asks for an address in both languages',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Вход в Sendina'})).toBeVisible({timeout:15000});
 await page.getByRole('button',{name:'Язык интерфейса'}).click();
 await expect(page.getByRole('heading',{name:'Sign in to Sendina'})).toBeVisible();
 expect((await page.locator('body').innerText()).match(/[А-Яа-яЁё]+/g),'Untranslated text on the sign-in screen').toBeNull();
 await expect(page.getByLabel('Work address')).toBeVisible();
});

test('an unlisted address is queued for approval rather than signed in',async({page})=>{
 await page.goto('/');
 await page.getByLabel('Рабочий адрес').fill('newcomer@example.com');
 await page.getByRole('button',{name:'Прислать ссылку для входа'}).click();
 await expect(page.getByRole('heading',{name:'Заявка принята'})).toBeVisible({timeout:15000});
 // Nothing about the workspace is reachable while approval is pending.
 await expect(page.locator('nav')).toHaveCount(0);
});

test('a superadmin address is accepted and the link never reaches the browser',async({page})=>{
 const responses:string[]=[];
 page.on('response',async r=>{if(r.url().includes('/auth/request'))responses.push(await r.text().catch(()=>''));});
 await page.goto('/');
 await page.getByLabel('Рабочий адрес').fill('boss@example.com');
 await page.getByRole('button',{name:'Прислать ссылку для входа'}).click();
 await expect(page.getByRole('heading',{name:'Ссылка в журнале сервера'})).toBeVisible({timeout:15000});
 expect(responses.join(' ')).not.toContain('auth/callback');
});

test('the demo stays reachable without an account',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Вход в Sendina'})).toBeVisible({timeout:15000});
 await page.getByRole('button',{name:'Посмотреть демонстрацию'}).click();
 await expect(page.locator('h1')).toHaveText('Что вы хотите получить сегодня?',{timeout:15000});
});
