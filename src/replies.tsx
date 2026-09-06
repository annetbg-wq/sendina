import React,{useEffect,useState} from 'react';
import {ChevronDown,ChevronRight,ArrowUpRight,ArrowDownRight,CalendarDays,Check,MessageCircle} from 'lucide-react';
import type {Thread} from '../server/threads';
import {useLocalize} from './i18n';

/** "Ответы": one collapsed card per recipient, the whole conversation behind it.

    Showing a single latest reply hid the thing that actually matters — what we wrote, what came
    back, what we wrote next, and where it ended. Collapsed, a card answers "who, what did they
    say, what do we do next, is it done"; expanded, it is the full chronology with the system's
    decision at each step. */

const filters=[['all','Все'],['replied','С ответом'],['awaiting','Ждут ответа'],
 ['todo','Есть незакрытое действие'],['positive','Положительные'],['negative','Отказы']] as const;

const when=(at:string)=>at?new Date(at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';

function Timeline({thread}:{thread:Thread}){
 const L=useLocalize();
 return L(<ol className="thread">{thread.entries.map((entry,i)=>
  <li key={i} className={entry.direction==='incoming'?'thread-in':'thread-out'}>
   <div className="thread-head">
    <span className="thread-direction">
     {entry.direction==='incoming'?<ArrowDownRight size={14}/>:<ArrowUpRight size={14}/>}
     {entry.direction==='incoming'?'Входящее':'Исходящее'}</span>
    <time dateTime={entry.at}>{when(entry.at)}</time></div>
   <b data-user-content>{entry.subject}</b>
   <p className="letter" data-user-content>{entry.text}</p>
   <p className="tiny muted" data-user-content>Решение системы: {entry.decision}</p>
   {entry.nextAction&&<p className="tiny" data-user-content>Следующее действие: {entry.nextAction}</p>}
  </li>)}
  {!thread.entries.length&&<li className="empty">Переписки ещё нет.</li>}
 </ol>);
}

export function Replies({api,run,busy,query}:{
 api:(path:string,body?:unknown)=>Promise<any>;
 run:(fn:()=>Promise<unknown>,message?:string)=>Promise<void>;
 busy:boolean;query:string}){
 const L=useLocalize();
 const [threads,setThreads]=useState<Thread[]>([]);
 const [outcomes,setOutcomes]=useState<Record<string,string>>({});
 const [filter,setFilter]=useState<string>('all');
 const [open,setOpen]=useState<Record<string,boolean>>({});
 const load=async()=>{const data=await api('/threads');setThreads(data.threads??[]);setOutcomes(data.outcomes??{});};
 useEffect(()=>{load().catch(()=>{});},[]);

 const matches=(t:Thread)=>{
  const q=query.trim().toLowerCase();
  if(q&&!`${t.name} ${t.company} ${t.email} ${t.lastText}`.toLowerCase().includes(q))return false;
  if(filter==='all')return true;
  if(filter==='todo')return Boolean(t.nextAction)&&!t.nextActionDone;
  if(filter==='replied')return t.status==='replied';
  if(filter==='awaiting')return t.status==='awaiting';
  if(filter==='positive')return t.category==='positive';
  if(filter==='negative')return ['negative','unsubscribe'].includes(t.category);
  return true;
 };
 const shown=threads.filter(matches);

 const act=(email:string,patch:{done?:boolean;outcome?:string})=>
  run(async()=>{await api('/threads/action',{email,...patch});await load();},'Ветка обновлена');
 const exclude=(email:string)=>
  run(async()=>{await api('/suppress',{email});await load();},'Адресат исключён из всех кампаний');

 return L(<>
  <div className="tabs">{filters.map(([key,label])=>
   <button key={key} className={filter===key?'tab active-tab':'tab'} onClick={()=>setFilter(key)}>{label}</button>)}</div>
  <div className="reply-list">
   {shown.map(t=><article className={open[t.email]?'card thread-card open':'card thread-card'} key={t.email}>
    <button className="thread-summary" aria-expanded={Boolean(open[t.email])}
     onClick={()=>setOpen({...open,[t.email]:!open[t.email]})}>
     {open[t.email]?<ChevronDown size={16}/>:<ChevronRight size={16}/>}
     <div className="thread-who">
      <b data-user-content>{t.name}</b>
      <small data-user-content>{[t.company,t.role].filter(Boolean).join(' · ')||t.email}</small></div>
     <div className="thread-last">
      <p data-user-content>{t.lastText||'Ответа ещё нет'}</p>
      <small><CalendarDays size={12}/> {when(t.lastAt)}</small></div>
     <div className="thread-marks">
      <span className={'badge '+(t.category==='positive'?'active':t.category?'draft':'')}>{t.categoryLabel}</span>
      <span className="badge draft">{t.statusLabel}</span>
      <span className={'badge '+(t.outcome==='meeting'||t.outcome==='documents'?'active':'draft')}>{t.outcomeLabel}</span>
     </div>
     <div className="thread-next">
      <span data-user-content>{t.nextAction||'Действий не требуется'}</span>
      <span className={t.nextActionDone?'done':'pending'}>
       {t.nextActionDone?<><Check size={12}/>Выполнено</>:'Не выполнено'}</span>
     </div>
    </button>
    {open[t.email]&&<div className="thread-body">
     <p className="tiny muted" data-user-content>{t.email}{t.campaigns.length?` · ${t.campaigns.join(', ')}`:''}</p>
     <Timeline thread={t}/>
     <div className="thread-controls">
      <label>Итог<select value={t.outcome} disabled={busy}
        onChange={e=>act(t.email,{outcome:e.target.value})}>
       {Object.entries(outcomes).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <label className="switch"><input type="checkbox" checked={t.nextActionDone} disabled={busy}
        onChange={e=>act(t.email,{done:e.target.checked})}/>Следующее действие выполнено</label>
      {t.suppressed
       ?<span className="badge paused">Адресат уже исключён</span>
       :<button className="danger small-button" disabled={busy} onClick={()=>exclude(t.email)}>Исключить адресата</button>}
     </div>
    </div>}
   </article>)}
   {!shown.length&&<div className="empty card"><MessageCircle size={18}/>
    Переписок в этой категории пока нет. Они появятся, когда кампания отправит первые письма и придут ответы.</div>}
  </div>
 </>);
}
