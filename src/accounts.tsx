import React,{useEffect,useState} from 'react';
import {Users,Shield,ShieldCheck,RefreshCw,Eye,ArrowLeft,Info} from 'lucide-react';
import {Flag} from './flag';
import {useLocalize} from './i18n';

/** "Аккаунты": a superadmin screen, and only that.

    An ordinary account never receives this page, because the menu is built from the role rather
    than disabled per item — and never reaches the data either, because every route behind it is
    refused server-side. The support view reads one account's workspace and cannot write to it:
    there is one GET route, it issues no session for that account, and each use is logged. */

const statusLabel=(status:string)=>status==='approved'?'Подтверждён':status==='blocked'?'Заблокирован':'Ожидает подтверждения';

function SupportView({view,onBack}:{view:any;onBack:()=>void}){
 const L=useLocalize();
 return L(<>
  <div className="info-banner"><Eye size={24}/><div>
   <b>Просмотр как пользователь · только чтение</b>
   <p>Вы смотрите рабочую область <span data-user-content>{view.account.email}</span>. Изменить в ней ничего нельзя:
    Sendina не выдаёт сессию этого аккаунта, а сам просмотр записан в журнал поддержки.</p></div>
   <button className="secondary" onClick={onBack}><ArrowLeft size={14}/>К списку аккаунтов</button></div>

  <div className="stats analytics-stats">
   {[['Кампании',view.campaigns.length],['Адресаты',view.recipients.length],
     ['Переписки',view.threads.length],['Исключено адресов',view.suppressed.length]].map(([label,value])=>
    <article className="card metric" key={String(label)}><span>{label}</span><h2>{String(value)}</h2>
     <small className="muted">только чтение</small></article>)}
  </div>

  <section className="card full-card"><div className="card-heading"><h3><Users size={18}/>Кампании</h3></div>
   <div className="table-scroll"><table>
    <thead><tr><th>Кампания</th><th>Рынок</th><th>Состояние</th><th>Адресаты</th><th>Письма</th><th>Ответы</th></tr></thead>
    <tbody>{view.campaigns.map((c:any)=><tr key={c.id}>
     <td data-user-content>{c.name}</td>
     <td><Flag market={c.market}/><span data-user-content>{c.market}</span></td>
     <td><span className={'badge '+(c.status==='active'?'active':'draft')}>{c.status}</span></td>
     <td>{c.contacts}</td><td>{c.messages}</td><td>{c.replies}</td></tr>)}</tbody></table>
    {!view.campaigns.length&&<div className="empty">Кампаний нет.</div>}</div></section>

  <section className="card full-card"><div className="card-heading"><h3><Shield size={18}/>Домены и почта</h3></div>
   <div className="table-scroll"><table>
    <thead><tr><th>Домен</th><th>Ящики</th><th>Готовность</th></tr></thead>
    <tbody>{view.domains.map((d:any)=><tr key={d.id}>
     <td data-user-content>{d.name}</td>
     <td>{d.mailboxes.map((m:any)=><small key={m.email} data-user-content>{m.email} · {m.connection}</small>)}</td>
     <td><span className={'badge '+(d.readiness.ready?'active':'draft')}>
      {d.readiness.ready?'Готов':d.readiness.blockers.join(', ')}</span></td></tr>)}</tbody></table>
    {!view.domains.length&&<div className="empty">Ящики не подключены.</div>}</div></section>

  <section className="card full-card"><div className="card-heading"><h3><Users size={18}/>Переписки</h3></div>
   <div className="table-scroll"><table>
    <thead><tr><th>Адресат</th><th>Последний ответ</th><th>Классификация</th><th>Итог</th></tr></thead>
    <tbody>{view.threads.map((t:any)=><tr key={t.email}>
     <td data-user-content>{t.name}<small data-user-content>{t.email}</small></td>
     <td data-user-content>{t.lastText||'—'}</td><td>{t.categoryLabel}</td><td>{t.outcomeLabel}</td></tr>)}</tbody></table>
    {!view.threads.length&&<div className="empty">Переписок нет.</div>}</div></section>

  <section className="card full-card"><div className="card-heading"><h3><Info size={18}/>Журнал рабочей области</h3></div>
   <div className="audit-list padded">{view.audit.map((a:any)=>
    <div key={a.id}><span className="audit-dot"/><div><p data-user-content>{a.action}</p>
     <small>{new Date(a.at).toLocaleString('ru-RU')}</small></div></div>)}
    {!view.audit.length&&<div className="empty">Записей нет.</div>}</div></section>
 </>);
}

export function Accounts({api,run,busy,platformForm}:{
 api:(path:string,body?:unknown)=>Promise<any>;
 run:(fn:()=>Promise<unknown>,message?:string)=>Promise<void>;
 busy:boolean;platformForm:React.ReactNode}){
 const L=useLocalize();
 const [accounts,setAccounts]=useState<any[]>([]);
 const [log,setLog]=useState<any[]>([]);
 const [view,setView]=useState<any>(null);
 const load=async()=>{setAccounts(await api('/accounts'));setLog(await api('/support-log').catch(()=>[]));};
 useEffect(()=>{load().catch(()=>{});},[]);

 if(view)return <SupportView view={view} onBack={()=>setView(null)}/>;

 return L(<>
  <div className="info-banner"><ShieldCheck size={24}/><div><b>Кто может входить в Sendina</b>
   <p>Новый адрес получает доступ только после подтверждения. Рабочие области разделены: чужие кампании и адресаты
    доступны только в режиме поддержки, и только для чтения.</p></div>
   <button className="secondary" disabled={busy} onClick={()=>run(load)}><RefreshCw size={14}/>Обновить</button></div>

  {platformForm}

  <section className="card full-card"><div className="card-heading"><h3><Users size={18}/>Аккаунты</h3>
    <span className="subtle-tag">{accounts.length}</span></div>
   <div className="table-scroll"><table>
    <thead><tr><th>Адрес</th><th>Роль</th><th>Состояние</th><th>Вход</th><th/></tr></thead>
    <tbody>{accounts.map(a=><tr key={a.id}>
     <td><b data-user-content>{a.email}</b></td>
     <td>{a.role==='superadmin'?'Суперадмин':'Пользователь'}</td>
     <td><span className={'badge '+(a.status==='approved'?'active':a.status==='blocked'?'paused':'draft')}>
      {statusLabel(a.status)}</span></td>
     <td className="tiny muted">{a.lastLoginAt?new Date(a.lastLoginAt).toLocaleDateString('ru-RU'):'ни разу'}</td>
     <td><div className="row-actions">
      <button className="secondary small-button" disabled={busy}
       onClick={()=>run(async()=>setView(await api(`/accounts/${a.id}/workspace`)))}>
       <Eye size={14}/>Просмотреть как пользователь</button>
      {a.status!=='approved'&&<button className="secondary small-button" disabled={busy}
       onClick={()=>run(async()=>{await api('/accounts/decide',{id:a.id,status:'approved'});await load();},'Доступ подтверждён')}>Подтвердить</button>}
      {a.status!=='blocked'&&a.role!=='superadmin'&&<button className="text-link" disabled={busy}
       onClick={()=>run(async()=>{await api('/accounts/decide',{id:a.id,status:'blocked'});await load();},'Доступ закрыт')}>Заблокировать</button>}
     </div></td></tr>)}</tbody></table>
    {!accounts.length&&<div className="empty">Аккаунтов пока нет.</div>}</div></section>

  <section className="card full-card"><div className="card-heading"><h3><Eye size={18}/>Журнал поддержки</h3>
    <span className="subtle-tag">{log.length}</span></div>
   <div className="padded">
    <p className="muted">Кто, когда и чью рабочую область открывал. Любое изменение чужих данных в будущем
     станет отдельным привилегированным действием и попадёт сюда же.</p>
    <div className="audit-list">{log.map((entry:any)=>
     <div key={entry.id}><span className="audit-dot"/><div>
      <p data-user-content>{entry.actor} → {entry.subject}: {entry.action}</p>
      <small>{new Date(entry.at).toLocaleString('ru-RU')}</small></div></div>)}
     {!log.length&&<div className="empty">Записей нет.</div>}</div></div></section>
 </>);
}
