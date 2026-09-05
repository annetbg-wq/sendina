import {test,expect} from '@playwright/test';
test('a protected workspace asks for a token in both languages and signs in',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Вход в рабочую область'})).toBeVisible({timeout:15000});
 await page.getByRole('button',{name:'Язык интерфейса'}).click();
 await expect(page.getByRole('heading',{name:'Sign in to your workspace'})).toBeVisible();
 expect((await page.locator('body').innerText()).match(/[А-Яа-яЁё]+/g),'Untranslated text on the sign-in screen').toBeNull();
 await page.getByLabel('Access token').fill('wrong-token');
 await page.getByRole('button',{name:'Sign in'}).click();
 await expect(page.getByRole('alert')).toContainText('Access token required');
 await page.getByLabel('Access token').fill('test-token-123');
 await page.getByRole('button',{name:'Sign in'}).click();
 await expect(page.locator('h1')).toHaveText('What would you like to achieve today?',{timeout:15000});
});
test('the demo stays reachable without a token',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Вход в рабочую область'})).toBeVisible({timeout:15000});
 await page.getByRole('button',{name:'Посмотреть демонстрацию'}).click();
 await expect(page.locator('h1')).toHaveText('Что вы хотите получить сегодня?',{timeout:15000});
});
