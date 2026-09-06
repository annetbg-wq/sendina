import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Page} from '@playwright/test';

const inbox=resolve('data/product/inbox.jsonl');

/** Signs a person in the way a person does: ask for a link, open the mail, follow it. The mail
    the harness received is on disk, because a browser cannot read a mailbox. */
export async function signIn(page:Page,email:string){
 const before=lines().length;
 await page.goto('/');
 // The gate re-renders once the first request settles, so wait for it to stop moving.
 await page.getByRole('heading',{name:'Вход в Sendina'}).waitFor({timeout:30000});
 await page.waitForTimeout(300);
 await page.getByLabel('Рабочий адрес').fill(email);
 await page.getByRole('button',{name:'Прислать ссылку для входа'}).click();
 const link=await waitForLink(email,before);
 await page.goto(link);
 await page.waitForSelector('nav');
}

const lines=()=>{
 try{return readFileSync(inbox,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));}
 catch{return [];}
};

async function waitForLink(email:string,from:number){
 for(let attempt=0;attempt<100;attempt++){
  const mail=lines().slice(from).filter(m=>m.to===email.toLowerCase()).pop();
  const link=mail&&String(mail.text).match(/(https?:\/\/\S*auth\/callback\S*)/)?.[1];
  if(link)return link;
  await new Promise(r=>setTimeout(r,100));
 }
 throw Error(`no login link delivered to ${email}`);
}

/** Fails the test if the interface ever shows the origin error again, whatever produced it. */
export async function noOriginError(page:Page){
 const text=await page.locator('body').innerText();
 if(text.includes('Недопустимый источник запроса')||text.includes('Invalid request origin'))
  throw Error('the interface reported "Недопустимый источник запроса"');
}
