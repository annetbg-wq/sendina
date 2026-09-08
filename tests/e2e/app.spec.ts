import {test,expect} from '@playwright/test';

// These check the interface itself, so they run against the browser demo rather than an account.
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('sendina-api-url',''));});


/** Interface text only. Anything a person or a research run authored is marked as user content
    and is deliberately never translated, so it must not count as an untranslated string. */
const chromeText=(scope:'body'|'dialog')=>async(page:import('@playwright/test').Page)=>
 page.evaluate(sel=>{
  const root=document.querySelector(sel==='dialog'?'[role="dialog"]':'body');
  if(!root)return '';
  const clone=root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-user-content]').forEach(n=>n.remove());
  return clone.innerText??clone.textContent??'';
 },scope);
const bodyChrome=chromeText('body');
const dialogChrome=chromeText('dialog');

const screens=['Campaigns','Opportunities','Markets','Replies','Analytics','Settings'];

test('RU/EN switch covers every screen, survives reload and preserves form values',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Что вы хотите получить сегодня?'})).toBeVisible();
 await page.getByRole('button',{name:'Язык интерфейса'}).click();
 await expect(page.getByRole('heading',{name:'What would you like to achieve today?'})).toBeVisible();
 for(const label of screens){
  await page.locator('nav').getByRole('button',{name:label,exact:true}).click();
  await expect(page.locator('h1')).toHaveText(label);
  expect((await bodyChrome(page)).match(/[А-Яа-яЁё]+/g),`Untranslated text on ${label}`).toBeNull();
 }
 await page.reload();await expect(page.getByRole('button',{name:'Interface language'})).toHaveText('EN');
 await page.locator('nav').getByRole('button',{name:'Campaigns',exact:true}).click();
 await page.getByRole('button',{name:'Create campaign',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByLabel('Campaign name').fill('E2E test campaign');
 await page.getByLabel('Product and context').fill('A verified product description for a local browser test.');
 await page.getByRole('dialog').getByRole('button',{name:'Create campaign'}).click();
 await expect(page.getByRole('dialog')).not.toBeVisible();
 await expect(page.getByRole('button',{name:'E2E test campaign'}).first()).toBeVisible();
});

test('mobile layout stays within viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.locator('h1')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.getByRole('button',{name:'Открыть меню'}).click();
 await page.locator('nav').getByRole('button',{name:'Настройки'}).click();
 await expect(page.locator('h1')).toHaveText('Настройки');
});

test('Mail settings use product mailbox state; transport checks are diagnostics, not the main status',async({page})=>{
 await page.goto('/');await page.waitForSelector('nav');
 await expect(page.locator('nav')).not.toContainText('Домены');
 await page.locator('nav').getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Почта и домены'}).click();

 await expect(page.getByRole('button',{name:'Подключить ящик'})).toBeVisible();
 await expect(page.getByText('Google и Microsoft работают через HTTPS API')).toBeVisible();
 await expect(page.locator('.mailbox').first()).toBeVisible();
 // Demo mailboxes are disconnected, so their product state is the primary visible status.
 await expect(page.locator('.mailbox').first()).toContainText('Не подключён');
 // Old transport proof badges must not be permanently painted across a disconnected mailbox card.
 await expect(page.locator('.mailbox').first().locator('.check-row')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Проверить DNS'}).first()).toBeVisible();
});

test('every dialog is fully translated in English',async({page})=>{
 await page.goto('/');await page.waitForSelector('h1');
 await page.getByRole('button',{name:'Язык интерфейса'}).click();
 const nav=(name:string)=>page.locator('nav').getByRole('button',{name,exact:true}).click();
 const dialog=page.getByRole('dialog');
 const check=async(name:string)=>{
  await expect(dialog).toBeVisible();
  expect((await dialogChrome(page)).match(/[А-Яа-яЁё]+/g),`Untranslated text in the ${name} dialog`).toBeNull();
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 };
 await nav('Settings');
 await page.getByRole('button',{name:'Integrations'}).click();
 await page.getByRole('button',{name:'Connection details'}).click();await check('connector');
 await page.getByRole('button',{name:'Workspace',exact:true}).click();
 await page.getByRole('button',{name:'Open activity log'}).click();await check('activity log');
 await page.getByRole('button',{name:'Mail & domains'}).click();
 await page.getByRole('button',{name:'Connect a mailbox'}).first().click();await check('mailbox connection');
 await page.getByRole('button',{name:'Check DNS'}).first().click();await check('DNS check');
 await nav('Campaigns');
 await page.getByRole('button',{name:'Create campaign',exact:true}).click();await check('new campaign');
 await page.locator('table .row-link').first().click();
 await expect(dialog).toBeVisible();
 expect((await dialogChrome(page)).match(/[А-Яа-яЁё]+/g),'Untranslated text in the campaign dialog').toBeNull();
 await dialog.getByRole('button',{name:/^Recipients/}).click();await check('recipients');
});
