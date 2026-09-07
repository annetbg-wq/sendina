import {test,expect,type Page} from '@playwright/test';
import {signIn,noOriginError} from './signin';

/** Connecting a mailbox, driven through the interface.

    Two separate failures were found by hand and both looked identical from the outside — a modal
    that never came back. They are not the same defect and neither fix covers the other:

    1. The mailbox was created on the server and the interface never showed it, because the screen
       only re-read the workspace when a call succeeded. Connecting creates the mailbox first and
       checks it second, so a failed check threw before the refresh and left the interface
       displaying a state from before the mailbox existed.

    2. Nothing bounded the check itself. A host that accepts a connection and then says nothing
       held the request open, so there was no response to react to in the first place.

    These tests drive the real interface against a host that is not listening, which is the
    cheapest thing that reproduces both. */

test.describe.configure({mode:'serial'});

const superadmin='boss@example.com';
/** Nothing listens here, so the connection is refused at once — a definite, quick failure. */
const dead={host:'127.0.0.1',port:9};

const openMailSettings=async(page:Page)=>{
 await page.locator('nav').getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Почта и домены'}).click();
};

test('a mailbox that fails its check is still shown, with the step that stopped it',async({page})=>{
 await signIn(page,superadmin);
 await openMailSettings(page);
 await page.getByRole('button',{name:'Подключить ящик'}).click();

 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Рабочий e-mail').fill('outreach@unreachable.example');
 await dialog.getByRole('button',{name:'Определить провайдера'}).click();

 // An unknown domain offers the ordinary password route, already filled in as far as it can be.
 await dialog.getByRole('button',{name:'Подключить и проверить'}).waitFor({timeout:30000});
 const advanced=dialog.getByRole('button',{name:'Расширенная настройка'});
 if(await advanced.count())await advanced.click();
 await dialog.getByLabel('SMTP host').fill(dead.host);
 await dialog.getByLabel('SMTP порт').fill(String(dead.port));
 await dialog.getByLabel('IMAP host').fill(dead.host);
 await dialog.getByLabel('IMAP порт').fill(String(dead.port));
 await dialog.getByLabel('Пароль или пароль приложения').fill('app-password');
 await dialog.getByRole('button',{name:'Подключить и проверить'}).click();

 // The first defect: the modal must come back, and it must come back on its own.
 await expect(page.getByRole('dialog'),'the modal must close once the server has answered')
  .toBeHidden({timeout:60000});

 // The second: the mailbox exists on the server, so the screen has to show it — the check
 // failing is not a reason to keep displaying a workspace that no longer matches.
 await expect(page.getByText('outreach@unreachable.example').first()).toBeVisible();

 // And the outcome is stated, naming the step, rather than left as a silent failure.
 const result=page.locator('.check-result');
 await expect(result).toBeVisible();
 await expect(result).toContainText('Проверка ящика');
 await expect(result).toContainText('Остановилась');
 // All four steps are accounted for; none is left blank.
 for(const step of ['Вход','Отправка','Приём','Чтение письма'])
  await expect(result.locator('.check-steps')).toContainText(step);
 await expect(result.locator('.check-steps li').first()).toHaveClass(/failed/);

 await noOriginError(page);
});

test('re-checking a mailbox that cannot answer ends too, and never spins forever',async({page})=>{
 await signIn(page,superadmin);
 await openMailSettings(page);

 const button=page.getByRole('button',{name:'Проверить ящик'}).first();
 await expect(button,'the mailbox connected by the previous test is listed').toBeVisible();
 await button.click();

 // The button is disabled while the check runs and released when it ends. Being released is the
 // assertion: before the deadlines existed this stayed disabled until the tab was closed.
 await expect(button).toBeEnabled({timeout:60000});

 const result=page.locator('.check-result');
 await expect(result).toBeVisible();
 await expect(result).toContainText('Остановилась');
 // A reason code, not just a sentence, so the interface can say something useful about it.
 await expect(result).toContainText(/TIMEOUT|CONNECTION_REFUSED|HOST_NOT_FOUND|FAILED/);
 await noOriginError(page);
});

test('a Gmail address is offered Google first, and the advanced route is not an empty form',async({page})=>{
 await signIn(page,superadmin);
 await openMailSettings(page);
 await page.getByRole('button',{name:'Подключить ящик'}).click();

 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Рабочий e-mail').fill('sales@gmail.com');
 await dialog.getByRole('button',{name:'Определить провайдера'}).click();

 // No platform application is registered in the harness, so this is the case the tester hit:
 // the person is told plainly that it is the platform's setup that is missing, and — because
 // they are a superadmin here — exactly where to fix it.
 await expect(dialog).toContainText('OAuth-приложение Google платформы не настроено',{timeout:30000});
 await expect(dialog.getByRole('button',{name:'Настроить приложение платформы'})).toBeVisible();

 // SMTP and IMAP are the advanced route, folded away rather than presented as the way in.
 await expect(dialog.getByLabel('SMTP host')).toBeHidden();
 await dialog.getByRole('button',{name:/Расширенный способ подключения/}).click();

 // And when it is opened it is already filled in. Being asked to type these by hand, one
 // validation error at a time, is the defect this asserts against.
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

test('organisation search is named as a platform setting, apart from Google Workspace',async({page})=>{
 await signIn(page,superadmin);
 await page.locator('nav').getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Интеграции'}).click();

 // It has no per-account form, so it never appeared among the account connections and looked
 // simply absent. It is now stated in its own right, and not beside Google Workspace.
 // Selected by its heading: the account-connections card next to it mentions the same words in
 // a status badge and a mode selector, which is part of why it looked like there was no setting.
 const card=page.locator('section.setting')
  .filter({has:page.getByRole('heading',{name:'Поиск организаций'})});
 await expect(card).toBeVisible();
 await expect(card).toContainText('Google Places');
 await expect(card).toContainText('Не настроено');
 await expect(card).toContainText('платформенная настройка');

 // A superadmin is sent to the one place it is entered.
 await card.getByRole('button',{name:/Настроить на экране/}).click();
 const platform=page.locator('section').filter({hasText:'Приложения платформы'}).first();
 await expect(platform.getByLabel('Google Places API key')).toBeVisible();
 // Deliberately not the same thing as the mail application, and it says so in as many words.
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
 // The exact variables an operator has to set, named rather than described.
 for(const name of ['SYSTEM_SMTP_HOST','SYSTEM_SMTP_USER','SYSTEM_SMTP_PASS'])
  await expect(mail).toContainText(name);

 await mail.getByRole('button',{name:/Отправить проверочное письмо/}).click();
 await expect(mail).toContainText('Проверочное письмо отправлено',{timeout:30000});
 await noOriginError(page);
});
