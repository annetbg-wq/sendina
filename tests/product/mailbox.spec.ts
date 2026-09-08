import {test,expect,type Page} from '@playwright/test';
import {signIn,noOriginError} from './signin';

/** Connecting a mailbox, driven through the interface.

    The product now has two deliberately different paths:
    - Google/Microsoft: platform OAuth over HTTPS is the standard path.
    - Other/custom providers: SMTP/IMAP is an explicit advanced compatibility path.

    A failed custom check must still leave the created mailbox visible, while the primary status is
    a product state and the old transport checks live only in technical diagnostics. */

test.describe.configure({mode:'serial'});

const superadmin='boss@example.com';
/** Nothing listens here, so the connection is refused at once — a definite, quick failure. */
const dead={host:'127.0.0.1',port:9};

const openMailSettings=async(page:Page)=>{
 await page.locator('nav').getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Почта и домены'}).click();
};

test('a custom mailbox that fails its check is still shown with a product state and diagnostics',async({page})=>{
 await signIn(page,superadmin);
 await openMailSettings(page);
 await page.getByRole('button',{name:'Подключить ящик'}).click();

 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Рабочий e-mail').fill('outreach@unreachable.example');
 await dialog.getByRole('button',{name:'Определить провайдера'}).click();

 // An unknown provider uses the explicit custom SMTP/IMAP path rather than pretending to be OAuth.
 await dialog.getByRole('button',{name:'Подключить custom SMTP/IMAP'}).waitFor({timeout:30000});
 const edit=dialog.getByRole('button',{name:'Изменить вручную'});
 if(await edit.count())await edit.click();
 await dialog.getByLabel('SMTP host').fill(dead.host);
 await dialog.getByLabel('SMTP порт').fill(String(dead.port));
 await dialog.getByLabel('IMAP host').fill(dead.host);
 await dialog.getByLabel('IMAP порт').fill(String(dead.port));
 await dialog.getByLabel('Пароль или пароль приложения').fill('app-password');
 await dialog.getByRole('button',{name:'Подключить custom SMTP/IMAP'}).click();

 // The modal must close once the server has answered, even when verification itself failed.
 await expect(page.getByRole('dialog'),'the modal must close once the server has answered')
  .toBeHidden({timeout:60000});

 // The mailbox exists on the server, so the product must show it immediately.
 const mailbox=page.locator('.mailbox').filter({hasText:'outreach@unreachable.example'});
 await expect(mailbox).toBeVisible();
 await expect(mailbox).toContainText(/Временно недоступен|Подключается/);
 await expect(mailbox).toContainText('Custom SMTP/IMAP');

 // The result is still available, but as technical diagnostics rather than the primary status.
 const result=page.locator('.check-result');
 await expect(result).toBeVisible();
 await expect(result).toContainText('Техническая диагностика');
 await expect(result).toContainText('Требует внимания');
 for(const step of ['Вход','Отправка','Канал приёма','Чтение теста'])
  await expect(result.locator('.check-steps')).toContainText(step);
 await expect(result.locator('.check-steps li').first()).toHaveClass(/failed/);

 await noOriginError(page);
});

test('re-checking a mailbox that cannot answer ends too, and never spins forever',async({page})=>{
 await signIn(page,superadmin);
 await openMailSettings(page);

 const button=page.getByRole('button',{name:'Проверить состояние'}).first();
 await expect(button,'the mailbox connected by the previous test is listed').toBeVisible();
 await button.click();

 // The button is disabled while the check runs and released when it ends. Being released is the
 // assertion: a dead provider must never leave the product spinning forever.
 await expect(button).toBeEnabled({timeout:60000});

 const result=page.locator('.check-result');
 await expect(result).toBeVisible();
 await expect(result).toContainText('Требует внимания');
 await expect(result).toContainText(/TIMEOUT|CONNECTION_REFUSED|HOST_NOT_FOUND|FAILED/);
 await noOriginError(page);
});

test('a Gmail address is offered HTTPS OAuth first, with custom SMTP/IMAP folded away',async({page})=>{
 await signIn(page,superadmin);
 await openMailSettings(page);
 await page.getByRole('button',{name:'Подключить ящик'}).click();

 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Рабочий e-mail').fill('sales@gmail.com');
 await dialog.getByRole('button',{name:'Определить провайдера'}).click();

 // The harness registers the platform Google application, so consent over HTTPS is the primary path.
 await expect(dialog.getByRole('button',{name:'Подключить через Google'})).toBeVisible({timeout:30000});
 await expect(dialog).toContainText('официальный API провайдера по HTTPS');
 await expect(dialog).toContainText('Пароль, SMTP и IMAP не нужны');

 // SMTP/IMAP is not presented as the normal route.
 await expect(dialog.getByLabel('SMTP host')).toBeHidden();
 await dialog.getByRole('button',{name:'Custom SMTP/IMAP (расширенно)'}).click();
 await expect(dialog).toContainText('Отдельный custom-режим');
 await expect(dialog).toContainText('smtp.gmail.com');
 await expect(dialog).toContainText('imap.gmail.com');
 await dialog.getByRole('button',{name:'Изменить вручную'}).click();
 await expect(dialog.getByLabel('SMTP host')).toHaveValue('smtp.gmail.com');
 await expect(dialog.getByLabel('IMAP host')).toHaveValue('imap.gmail.com');
 await expect(dialog.getByLabel('SMTP порт')).toHaveValue('465');
 await expect(dialog.getByLabel('IMAP порт')).toHaveValue('993');
 await expect(dialog.getByLabel('Пользователь')).toHaveValue('sales@gmail.com');
 await noOriginError(page);
});

test('missing Microsoft platform OAuth is a platform blocker, not a silent password fallback',async({page})=>{
 await signIn(page,superadmin);
 await openMailSettings(page);
 await page.getByRole('button',{name:'Подключить ящик'}).click();

 // The harness registers Google but not Microsoft. The product must say that the Sendina platform
 // application is missing instead of quietly turning app-password SMTP/IMAP into the normal path.
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Рабочий e-mail').fill('sales@outlook.com');
 await dialog.getByRole('button',{name:'Определить провайдера'}).click();

 await expect(dialog.getByRole('button',{name:/Подключить через Microsoft/})).toHaveCount(0);
 await expect(dialog).toContainText('Подключение Microsoft сейчас недоступно на стороне Sendina');
 await expect(dialog).toContainText('Настройте OAuth-приложение платформы');
 await expect(dialog.getByLabel('Пароль или пароль приложения')).toBeHidden();

 // Custom SMTP/IMAP still exists for compatibility, but only after an explicit advanced choice.
 const custom=dialog.getByRole('button',{name:'Custom SMTP/IMAP (расширенно)'});
 await expect(custom).toBeVisible();
 await custom.click();
 await expect(dialog.getByLabel('Пароль или пароль приложения')).toBeVisible();
 await expect(dialog).toContainText('smtp.office365.com');
 await expect(dialog).toContainText('outlook.office365.com');
 await expect(dialog).toContainText('может не работать на хостинге с закрытыми почтовыми портами');

 // Even for a superadmin the connect form never asks for per-mailbox OAuth application secrets.
 const text=await dialog.innerText();
 for(const leak of ['Client Secret','client secret'])
  expect(text,`the connect dialog must not ask for "${leak}"`).not.toContain(leak);
 await noOriginError(page);
});

test('organisation search is named as a platform setting, apart from Google Workspace',async({page})=>{
 await signIn(page,superadmin);
 await page.locator('nav').getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Интеграции'}).click();

 const card=page.locator('section.setting')
  .filter({has:page.getByRole('heading',{name:'Поиск организаций'})});
 await expect(card).toBeVisible();
 await expect(card).toContainText('Google Places');
 await expect(card).toContainText('Не настроено');
 await expect(card).toContainText('платформенная настройка');

 await card.getByRole('button',{name:/Настроить на экране/}).click();
 const platform=page.locator('section').filter({hasText:'Приложения платформы'}).first();
 await expect(platform.getByLabel('Google Places API key')).toBeVisible();
 await expect(platform).toContainText('не Google Workspace');
 await expect(platform).toContainText('отдельное приложение и отдельный ключ');
 await noOriginError(page);
});

test('a superadmin can see whether platform mail works, and prove it',async({page})=>{
 await signIn(page,superadmin);
 await page.locator('nav').getByRole('button',{name:'Аккаунты',exact:true}).click();

 const mail=page.locator('section').filter({hasText:'Системная почта'}).first();
 await expect(mail).toBeVisible();
 await expect(mail).toContainText('Настроена');
 for(const name of ['SYSTEM_SMTP_HOST','SYSTEM_SMTP_USER','SYSTEM_SMTP_PASS'])
  await expect(mail).toContainText(name);

 await mail.getByRole('button',{name:/Отправить проверочное письмо/}).click();
 await expect(mail).toContainText('Проверочное письмо отправлено',{timeout:30000});
 await noOriginError(page);
});
