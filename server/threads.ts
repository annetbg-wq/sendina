import type {State} from './seed';

/** The conversation with one recipient, assembled from rows the workspace already holds.

    Nothing here is a new store: outgoing letters are the campaign's messages, incoming letters
    are its replies, and the only thing that had nowhere to live is whether the recommended next
    action has been carried out. A recipient is keyed by address, because that is also what a
    global exclusion is keyed by. */

export const categories:Record<string,string>={
 positive:'Положительный',neutral:'Уточнение',objection:'Возражение',referral:'Переадресация',
 later:'Позже',unsubscribe:'Отписка',negative:'Отказ',automatic:'Автоответ',bounce:'Недоставка'};

/** The outcome the interface reports separately from the classification of the last letter. */
export const outcomes:Record<string,string>={
 meeting:'Встреча назначена',documents:'Документы получены',interest:'Интерес',later:'Позже',
 refused:'Отказ',unsubscribed:'Отписка',bounced:'Недоставка',none:'Ещё нет результата',other:'Другой результат'};

const fromCategory:Record<string,string>={
 positive:'interest',neutral:'interest',objection:'interest',referral:'interest',
 later:'later',negative:'refused',unsubscribe:'unsubscribed',bounce:'bounced',automatic:'none'};

/** What to do next, per classification of the latest incoming letter. */
const nextActions:Record<string,string>={
 positive:'Предложить время встречи',
 neutral:'Ответить на уточнение и назвать следующий шаг',
 objection:'Снять возражение фактами и предложить короткий разговор',
 referral:'Написать названному коллеге, сославшись на переадресацию',
 later:'Поставить напоминание и вернуться позже',
 unsubscribe:'Ничего не отправлять: адресат исключён',
 negative:'Ничего не отправлять: адресат исключён',
 automatic:'Дождаться ответа человека',
 bounce:'Проверить адрес: письмо не доставлено'};

export type ThreadEntry={at:string;direction:'outgoing'|'incoming';subject:string;text:string;
 decision:string;nextAction:string};
export type Thread={
 email:string;name:string;company:string;role:string;country:string;
 campaignIds:string[];campaigns:string[];
 lastAt:string;lastText:string;category:string;categoryLabel:string;
 status:string;statusLabel:string;outcome:string;outcomeLabel:string;
 nextAction:string;nextActionDone:boolean;
 suppressed:boolean;entries:ThreadEntry[];
};

/** Every recipient the workspace has actually written to or heard from. */
export function threads(s:State):Thread[]{
 const keys=new Set<string>();
 for(const m of s.messages)if(m.email)keys.add(String(m.email).toLowerCase());
 for(const r of s.replies)if(r.email)keys.add(String(r.email).toLowerCase());
 const campaignName=(id:string)=>s.campaigns.find(c=>c.id===id)?.name??'';
 const list:Thread[]=[];
 for(const email of keys){
  const messages=s.messages.filter(m=>String(m.email).toLowerCase()===email);
  const replies=s.replies.filter(r=>String(r.email).toLowerCase()===email);
  const contact=s.contacts.find(c=>String(c.email).toLowerCase()===email);
  const campaignIds=[...new Set([...messages.map(m=>m.campaignId),...replies.map(r=>r.campaignId)].filter(Boolean))];
  const entries:ThreadEntry[]=[
   ...messages.map(m=>({at:m.sentAt??m.at??'',direction:'outgoing' as const,subject:m.subject??'',text:m.text??'',
    decision:m.status==='sent'?'Отправлено':'Черновик, отправка не выполнялась',nextAction:''})),
   ...replies.map(r=>({at:r.at??'',direction:'incoming' as const,subject:'Ответ',text:r.text??'',
    decision:`Классифицировано: ${categories[r.category]??r.category}`,nextAction:nextActions[r.category]??''}))
  ].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  const last=replies.slice().sort((a,b)=>String(a.at).localeCompare(String(b.at))).pop();
  const category=last?.category??'';
  const stored=s.threads?.[email];
  const outcome=stored?.outcome||(category?fromCategory[category]??'other':'none');
  const suppressed=s.suppressed.includes(email);
  list.push({
   email,name:contact?.name||last?.name||email,company:contact?.company||last?.company||'',
   role:contact?.role??'',country:contact?.country??'',
   campaignIds,campaigns:campaignIds.map(campaignName).filter(Boolean),
   lastAt:entries[entries.length-1]?.at??'',lastText:last?.text??entries[entries.length-1]?.text??'',
   category,categoryLabel:category?categories[category]??category:'Ответа ещё нет',
   status:last?'replied':messages.length?'awaiting':'draft',
   statusLabel:last?'Есть ответ':messages.length?'Письмо отправлено, ответа нет':'Черновик письма',
   outcome,outcomeLabel:outcomes[outcome]??outcomes.other,
   nextAction:suppressed?'Ничего не отправлять: адресат исключён':category?nextActions[category]??'':'Дождаться ответа',
   nextActionDone:Boolean(stored?.done),
   suppressed,entries});
 }
 return list.sort((a,b)=>String(b.lastAt).localeCompare(String(a.lastAt)));
}
