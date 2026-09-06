import {test,expect,type Page} from '@playwright/test';
import {signIn} from './signin';

/** The regression guard for "Недопустимый источник запроса", at the level the bug was reported.

    The unit test proves the server accepts its own origin. This one proves it from inside a real
    browser, on the real page, for every state-changing call the interface makes — because that is
    where the browser attaches the Origin header that used to be refused. Any call that comes back
    403, or any origin error rendered on the page, fails the test whatever produced it. */

const forbidden:string[]=[];
const shown:string[]=[];

async function watch(page:Page){
 page.on('response',async r=>{
  const request=r.request();
  if(request.method()!=='POST'||!r.url().includes('/api/'))return;
  if(r.status()===403)forbidden.push(`${request.method()} ${new URL(r.url()).pathname} → 403`);
 });
 page.on('console',m=>{if(m.text().includes('Недопустимый источник'))shown.push(m.text());});
}

const check=async(page:Page,where:string)=>{
 const text=await page.locator('body').innerText();
 expect(text,`the origin error appeared on ${where}`).not.toContain('Недопустимый источник запроса');
 expect(forbidden,`a mutating call was refused on ${where}`).toEqual([]);
};

test('every mutating control in the interface works, and none reports an invalid request origin',async({page})=>{
 await watch(page);
 await signIn(page,'boss@example.com');
 const dialog=page.getByRole('dialog');

 // --- Campaigns: create, then pause and resume from the table ---
 await page.locator('nav').getByRole('button',{name:'Рассылки',exact:true}).click();
 await page.getByRole('button',{name:'Создать рассылку'}).click();
 await dialog.getByLabel('Название кампании').fill('Кампания для смоук-теста');
 await dialog.getByLabel('Продукт и контекст').fill('Проверяем, что каждая кнопка действительно работает.');
 await dialog.getByLabel('Поиск страны').fill('Испан');
 await dialog.getByRole('button',{name:/Испания/}).click();
 await dialog.getByRole('button',{name:'Создать кампанию'}).click();
 await expect(dialog).not.toBeVisible();
 await check(page,'создание кампании');

 const row=page.locator('tbody tr',{hasText:'Кампания для смоук-теста'});
 await row.getByRole('button',{name:'Активировать'}).click();
 await expect(row).toContainText('Активна',{timeout:15000});
 await row.getByRole('button',{name:'Приостановить'}).click();
 await expect(row).toContainText('На паузе',{timeout:15000});
 await check(page,'смена статуса кампании');

 // --- Campaign dialog: prepare letters ---
 await page.getByRole('button',{name:'Кампания для смоук-теста'}).click();
 await dialog.getByRole('button',{name:'Подготовить письма'}).click();
 await expect(dialog).toContainText('Предпросмотр писем',{timeout:20000});
 await check(page,'подготовка писем');
 await page.keyboard.press('Escape');

 // --- Opportunities: research, keep, drop, make a campaign ---
 await page.locator('nav').getByRole('button',{name:'Возможности',exact:true}).click();
 await page.getByRole('button',{name:'Найти возможности'}).click();
 await expect(page.locator('.results .research-card')).toHaveCount(6,{timeout:30000});
 await check(page,'поиск возможностей');
 // This workspace is shared with the other specs, so the check is that the count moves, not
 // that it lands on a particular number.
 const counter=page.locator('.card-heading',{hasText:'Избранное'}).locator('.subtle-tag');
 const before=Number(await counter.innerText());
 await page.locator('.results .research-card').first().getByRole('button',{name:'В избранное'}).click();
 await expect(counter).toHaveText(String(before+1),{timeout:15000});
 await check(page,'сохранение в избранное');
 const favourites=page.locator('.card',{has:page.locator('.card-heading',{hasText:'Избранное'})});
 await favourites.locator('.research-card').first().getByRole('button',{name:'Удалить из избранного'}).click();
 await expect(counter).toHaveText(String(before),{timeout:15000});
 await check(page,'удаление из избранного');
 await page.locator('.results .research-card').first().getByRole('button',{name:'Создать тест'}).click();
 await expect(page.locator('h1')).toHaveText('Рассылки',{timeout:20000});
 await check(page,'создание теста из возможности');

 // --- Markets: research and prepare a test ---
 await page.locator('nav').getByRole('button',{name:'Рынки',exact:true}).click();
 await page.getByRole('button',{name:'У меня есть страна'}).click();
 // The screen restores the previous search, so the country may already be chosen.
 const chosen=page.locator('.location-chosen .chip',{hasText:'Германия'});
 if(!await chosen.count()){
  await page.getByLabel('Поиск страны').fill('Герман');
  await page.getByRole('button',{name:/Германия/}).click();
 }
 await page.getByRole('button',{name:/^(Исследовать рынок|Оценить сочетание)$/}).click();
 await expect(page.locator('.results .research-card')).toHaveCount(6,{timeout:30000});
 await check(page,'исследование рынка');
 await page.locator('.results .research-card').first().getByRole('button',{name:'Подготовить тест'}).click();
 await expect(page.locator('h1')).toHaveText('Рассылки',{timeout:20000});
 await check(page,'подготовка теста из рынка');

 // --- Settings: exclusions, emergency stop, demonstration, recipient mode ---
 await page.locator('nav').getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByRole('button',{name:'Запрещённые адресаты'}).click();
 await page.getByLabel('Адрес').fill('blocked@example.com');
 await page.getByRole('button',{name:'Добавить в запрещённые'}).click();
 await expect(page.locator('.suppressed')).toContainText('blocked@example.com',{timeout:15000});
 await check(page,'добавление в запрещённые');

 await page.getByRole('button',{name:'Рабочая область'}).click();
 await page.getByRole('button',{name:'Остановить все кампании'}).click();
 await expect(page.getByRole('button',{name:'Снять аварийную остановку'})).toBeVisible({timeout:15000});
 await page.getByRole('button',{name:'Снять аварийную остановку'}).click();
 await expect(page.getByRole('button',{name:'Остановить все кампании'})).toBeVisible({timeout:15000});
 await check(page,'аварийная остановка');

 await page.getByRole('button',{name:'Интеграции'}).click();
 await page.getByLabel('Режим поиска адресатов').selectOption('search');
 await expect(page.getByLabel('Режим поиска адресатов')).toHaveValue('search');
 await check(page,'режим поиска адресатов');
 await page.getByRole('button',{name:'Параметры подключения'}).click();
 await expect(page.getByRole('dialog')).toContainText('Коннектор ChatGPT',{timeout:15000});
 await page.getByRole('button',{name:'Показать код'}).click();
 await check(page,'код коннектора');
 await page.keyboard.press('Escape');

 // --- Mail: adding and detecting a mailbox ---
 await page.getByRole('button',{name:'Почта и домены'}).click();
 await page.getByRole('button',{name:'Подключить ящик'}).click();
 await dialog.getByLabel('Рабочий e-mail').fill('outreach@no-such-domain-for-sendina.example');
 await dialog.getByRole('button',{name:'Определить провайдера'}).click();
 await expect(dialog).toContainText('SMTP',{timeout:25000});
 await check(page,'определение почтового провайдера');
 await page.keyboard.press('Escape');

 // --- Demonstration on and off, which rewrites the workspace ---
 await page.getByRole('button',{name:'Рабочая область'}).click();
 await page.getByRole('button',{name:'Включить демонстрацию'}).click();
 await expect(page.getByRole('button',{name:'Очистить рабочую область'}).first()).toBeVisible({timeout:15000});
 await check(page,'включение демонстрации');
 await page.getByRole('button',{name:'Очистить рабочую область'}).first().click();
 await expect(page.getByRole('button',{name:'Включить демонстрацию'})).toBeVisible({timeout:15000});
 await check(page,'очистка рабочей области');

 expect(shown,'no origin error was ever reported').toEqual([]);
});
