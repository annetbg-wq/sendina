import {test,expect} from '@playwright/test';
test('RU/EN switch covers every screen, survives reload and preserves form values',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Что вы хотите получить сегодня?'})).toBeVisible();
 await page.getByRole('button',{name:'Язык интерфейса'}).click();
 await expect(page.getByRole('heading',{name:'What would you like to achieve today?'})).toBeVisible();
 for(const label of ['Campaigns','Opportunities','Markets','Domains & mailboxes','Replies','Analytics','Settings']){
  await page.locator('nav').getByRole('button',{name:label,exact:true}).click();
  await expect(page.locator('h1')).toHaveText(label);
  expect((await page.locator('body').innerText()).match(/[А-Яа-яЁё]+/g),`Untranslated text on ${label}`).toBeNull();
 }
 await page.reload();await expect(page.getByRole('button',{name:'Interface language'})).toHaveText('EN');
 await page.locator('nav').getByRole('button',{name:'Campaigns',exact:true}).click();await page.getByRole('button',{name:'Create campaign',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('Campaign name').fill('E2E test campaign');await page.getByLabel('Product and context').fill('A verified product description for a local browser test.');
 await page.getByRole('dialog').getByRole('button',{name:'Create campaign'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'E2E test campaign'}).first()).toBeVisible();
});
test('mobile layout stays within viewport',async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.getByRole('button',{name:'Открыть меню'}).click();await page.locator('nav').getByRole('button',{name:'Настройки'}).click();await expect(page.locator('h1')).toHaveText('Настройки');});
test('every dialog is fully translated in English',async({page})=>{
 await page.goto('/');await page.waitForSelector('h1');
 await page.getByRole('button',{name:'Язык интерфейса'}).click();
 const nav=(name:string)=>page.locator('nav').getByRole('button',{name,exact:true}).click();
 const dialog=page.getByRole('dialog');
 const check=async(name:string)=>{
  await expect(dialog).toBeVisible();
  expect((await dialog.innerText()).match(/[А-Яа-яЁё]+/g),`Untranslated text in the ${name} dialog`).toBeNull();
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 };
 await nav('Settings');
 await page.getByRole('button',{name:'Connection details'}).click();await check('connector');
 await page.getByRole('button',{name:'Open activity log'}).click();await check('activity log');
 await nav('Campaigns');
 await page.getByRole('button',{name:'Create campaign',exact:true}).click();await check('new campaign');
 await nav('Domains & mailboxes');
 await page.getByRole('button',{name:'Add mailbox'}).click();await check('new mailbox');
 await page.getByRole('button',{name:'Check DNS'}).first().click();await check('DNS check');
 await nav('Opportunities');
 await page.getByRole('button',{name:'Reasoning'}).first().click();await check('opportunity');
 await nav('Campaigns');
 await page.locator('table .row-link').first().click();await check('campaign');
});
