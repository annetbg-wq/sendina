import {test,expect,type Page} from '@playwright/test';
import {signIn,noOriginError} from './signin';

/** The flows the product has to actually perform, driven through the interface and checked in the
    workspace behind it. Every one of them is a mutating action, which is what the origin bug
    used to break — so each test also asserts the error never appears. */

test.describe.configure({mode:'serial'});

const superadmin='boss@example.com';

/** Reads the workspace the way the interface does, through the signed-in session. */
const workspace=(page:Page)=>page.evaluate(async()=>{
 const token=localStorage.getItem('sendina-session')??'';
 const r=await fetch('/api/state',{headers:{Authorization:`Bearer ${token}`}});
 return r.json();
});

const call=(page:Page,path:string,body?:unknown)=>page.evaluate(async({path,body}:any)=>{
 const token=localStorage.getItem('sendina-session')??'';
 const r=await fetch('/api'+path,{method:body===undefined?'GET':'POST',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
  body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
},{path,body});

test('a new account starts empty, with no demonstration campaigns, replies or opportunities',async({page})=>{
 await signIn(page,superadmin);
 const state=await workspace(page);
 expect(state.demo,'a real account is not a demonstration').toBe(false);
 expect(state.campaigns,'no sample campaigns').toEqual([]);
 expect(state.replies,'no sample replies').toEqual([]);
 expect(state.domains,'no sample domains').toEqual([]);
 expect(state.favourites).toEqual([]);
 expect(state.research.opportunities).toBeNull();
 await expect(page.locator('nav')).toContainText('Возможности');
 await noOriginError(page);
});

test('a campaign created from the interface is stored and reopens with its data',async({page})=>{
 await signIn(page,superadmin);
 await page.locator('nav').getByRole('button',{name:'Рассылки',exact:true}).click();
 await page.getByRole('button',{name:'Создать рассылку'}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Название кампании').fill('Первая настоящая кампания');
 await dialog.getByLabel('Продукт и контекст').fill('Автоматизация обработки заявок для небольших клиник.');
 // The country selector is a search over every country, not a fixed list of six.
 await dialog.getByLabel('Поиск страны').fill('Порт');
 await dialog.getByRole('button',{name:/Португалия/}).click();
 await dialog.getByLabel('Поиск страны').fill('Испан');
 await dialog.getByRole('button',{name:/Испания/}).click();
 await dialog.getByRole('button',{name:'Создать кампанию'}).click();
 await expect(dialog).not.toBeVisible();
 await noOriginError(page);

 await expect(page.getByRole('button',{name:'Первая настоящая кампания'})).toBeVisible();
 const state=await workspace(page);
 const created=state.campaigns.find((c:any)=>c.name==='Первая настоящая кампания');
 expect(created,'the campaign reached the workspace').toBeTruthy();
 expect(created.location.countries).toEqual(['Португалия','Испания']);
 expect(created.market).toContain('Португалия');
 expect(created.status).toBe('draft');

 // Reopening shows the stored data rather than a fresh form.
 await page.getByRole('button',{name:'Первая настоящая кампания'}).click();
 await expect(dialog).toContainText('Автоматизация обработки заявок для небольших клиник.');
 await expect(dialog).toContainText('Португалия');
});

test('opportunity research returns six, a favourite survives the next search, and it makes a campaign',async({page})=>{
 await signIn(page,superadmin);
 await page.locator('nav').getByRole('button',{name:'Возможности',exact:true}).click();
 await page.getByLabel('Направление или отрасль').fill('клиники');
 await page.getByRole('button',{name:'Найти возможности'}).click();

 const cards=page.locator('.results .research-card');
 await expect(cards).toHaveCount(6,{timeout:30000});
 await noOriginError(page);
 // Every card carries the fields the brief asks for, and a score the interface did not invent.
 const first=cards.first();
 for(const label of ['Для кого','Боль','Почему сейчас','Почему эта локация','Платёжеспособность','Доступность адресатов'])
  await expect(first).toContainText(label);
 await expect(first.locator('.score')).toHaveText(/\d+\/100/);
 await expect(first).toContainText(/Реализация: (низкая|средняя|высокая)/);

 const favouriteCards=page.locator('.card',{has:page.locator('.card-heading',{hasText:'Избранное'})}).locator('.research-card');
 const kept=(await first.locator('h2').innerText()).trim();
 await first.getByRole('button',{name:'В избранное'}).click();
 await expect(page.locator('.card-heading',{hasText:'Избранное'}).locator('.subtle-tag')).toHaveText('1');

 // A second search replaces the six results and leaves the saved one alone.
 await page.getByLabel('Направление или отрасль').fill('логистика');
 await page.getByRole('button',{name:'Найти возможности'}).click();
 await expect(cards).toHaveCount(6,{timeout:30000});
 // The kept card survived the new search.
 await expect(favouriteCards).toHaveCount(1);
 const state=await workspace(page);
 expect(state.favourites).toHaveLength(1);
 expect(state.favourites[0].name).toBe(kept);
 expect(state.research.opportunities.items).toHaveLength(6);

 // The kept card makes an ordinary campaign through the ordinary path.
 const favourites=page.locator('.card',{has:page.locator('.card-heading',{hasText:'Избранное'})});
 await favourites.locator('.research-card').first().getByRole('button',{name:'Создать тест'}).click();
 await expect(page.locator('h1')).toHaveText('Рассылки');
 await noOriginError(page);
 const after=await workspace(page);
 const made=after.campaigns.find((c:any)=>c.name===kept);
 expect(made,'a researched opportunity became an ordinary campaign').toBeTruthy();
 expect(made.status).toBe('draft');
 expect(made.control).toBe('confirm');
});

test('market research answers from a country, from a niche, and scores a chosen pair',async({page})=>{
 await signIn(page,superadmin);
 await page.locator('nav').getByRole('button',{name:'Рынки',exact:true}).click();
 const cards=page.locator('.results .research-card');

 // A: a country asks which niches.
 await page.getByLabel('Поиск страны').fill('Герман');
 await page.getByRole('button',{name:/Германия/}).click();
 await page.getByRole('button',{name:'Исследовать рынок'}).click();
 await expect(cards).toHaveCount(6,{timeout:30000});
 await expect(cards.first()).toContainText('Германия');

 // B: a niche asks which countries.
 await page.getByRole('button',{name:'У меня есть ниша'}).click();
 await page.getByLabel('Ниша, продукт или направление').fill('автоматизация записи для клиник');
 await page.getByRole('button',{name:'Исследовать рынок'}).click();
 await expect(cards).toHaveCount(6,{timeout:30000});
 await expect(cards.first()).toContainText('Заданная ниша');

 // C: both given, so Sendina only scores the pair.
 await page.getByRole('button',{name:'Оценить моё сочетание'}).click();
 // The country chosen in mode A is still chosen: switching modes changes the question, not the answer.
 await expect(page.locator('.location-chosen .chip')).toContainText('Германия');
 await page.getByLabel('Ниша, продукт или направление').fill('автоматизация записи для клиник');
 await page.getByRole('button',{name:'Оценить сочетание'}).click();
 await expect(cards).toHaveCount(1,{timeout:30000});
 await noOriginError(page);

 // The prepared test is an ordinary campaign, not a market-specific one.
 await cards.first().getByRole('button',{name:'Подготовить тест'}).click();
 await expect(page.locator('h1')).toHaveText('Рассылки');
 const state=await workspace(page);
 expect(state.campaigns.some((c:any)=>c.market.includes('Германия'))).toBe(true);
 await noOriginError(page);
});

test('a reply thread expands to the whole conversation and the recipient can be excluded',async({page})=>{
 await signIn(page,superadmin);
 // Build a real conversation through the API the interface uses: a campaign, a recipient,
 // a prepared letter and an inbound reply.
 const campaign=(await call(page,'/campaigns',{name:'Кампания для ветки',goal:'Продажа услуги',
  context:'Автоматизация обработки заявок для небольших клиник.',event:'Встреча',
  location:{countries:['Испания'],region:'',city:'',auto:false}})).body;
 await call(page,`/campaigns/${campaign.id}/contacts`,{contacts:[{email:'anna@clinic.example',
  name:'Анна Мартин',company:'Clinic Example',source:'https://clinic.example/contact',
  basis:'Опубликованный рабочий контакт',reason:'Клиника ищет способ не терять заявки'}]});
 await call(page,`/campaigns/${campaign.id}/preview`,{limit:5});
 await call(page,'/replies',{campaignId:campaign.id,email:'anna@clinic.example',
  text:'Добрый день! Интересно, давайте встретимся на следующей неделе.',
  category:'positive',eventId:'product-e2e-reply-1'});

 await page.locator('nav').getByRole('button',{name:'Ответы',exact:true}).click();
 const card=page.locator('.thread-card').first();
 await expect(card).toBeVisible();
 // Collapsed: who, what they said, the classification, the status and the next action.
 await expect(card).toContainText('Анна Мартин');
 await expect(card).toContainText('давайте встретимся');
 await expect(card).toContainText('Положительный');
 await expect(card).toContainText('Предложить время встречи');
 await expect(card).toContainText('Не выполнено');
 await expect(card.locator('.thread')).toHaveCount(0);

 await card.getByRole('button').first().click();
 const timeline=card.locator('.thread li');
 await expect(timeline).toHaveCount(2);
 await expect(timeline.nth(0)).toContainText('Исходящее');
 await expect(timeline.nth(1)).toContainText('Входящее');
 await expect(timeline.nth(1)).toContainText('Классифицировано');

 await card.getByRole('button',{name:'Исключить адресата'}).click();
 await expect(card).toContainText('Адресат уже исключён',{timeout:15000});
 await noOriginError(page);
 const state=await workspace(page);
 expect(state.suppressed).toContain('anna@clinic.example');
});

test('changing the analytics period and campaign really changes the query behind the numbers',async({page})=>{
 await signIn(page,superadmin);
 const queries:string[]=[];
 page.on('request',r=>{if(r.url().includes('/api/analytics'))queries.push(r.postData()??'');});
 await page.locator('nav').getByRole('button',{name:'Аналитика',exact:true}).click();
 await expect(page.locator('.analytics-stats .metric').first()).toBeVisible({timeout:15000});

 await page.getByLabel('Период').selectOption('today');
 await expect.poll(()=>queries.some(q=>q.includes('"period":"today"'))).toBe(true);
 await page.getByLabel('Период').selectOption('90d');
 await expect.poll(()=>queries.some(q=>q.includes('"period":"90d"'))).toBe(true);

 // "Все ответы" over 90 days must not equal "сегодня" once a reply exists from an earlier test.
 const ninety=await call(page,'/analytics',{period:'90d',campaign:'all'});
 const today=await call(page,'/analytics',{period:'today',campaign:'all'});
 expect(ninety.body.period.from).not.toBe(today.body.period.from);
 expect(ninety.body.totals.replies).toBeGreaterThanOrEqual(today.body.totals.replies);

 // A named campaign narrows the query to that campaign alone.
 const state=await workspace(page);
 const one=state.campaigns[0];
 await page.getByLabel('Кампании').selectOption(one.id);
 await expect.poll(()=>queries.some(q=>q.includes(one.id))).toBe(true);
 await expect(page.locator('.card-heading',{hasText:'Кампания целиком'})).toBeVisible();
 await noOriginError(page);
});
