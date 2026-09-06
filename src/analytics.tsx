import React,{useEffect,useState} from 'react';
import {ChartNoAxesColumnIncreasing,ChartNoAxesCombined,ArrowUpRight,ArrowDownRight,Info} from 'lucide-react';
import {Flag} from './flag';
import {categories} from '../server/threads';
import {useLocalize} from './i18n';

/** "Аналитика": two filters, and every number behind them.

    The period and the campaign selection are sent to the server, which recomputes from the
    workspace's own events. Nothing on this screen is filtered in the browser, so a change of
    period really is a different query — and the comparison line is the same query over the
    previous stretch of the same length. */

const periods=[['today','Сегодня'],['yesterday','Вчера'],['7d','7 дней'],['30d','30 дней'],
 ['90d','90 дней'],['all','Всё время'],['custom','Произвольный период']] as const;

const day=(at:string)=>new Date(at).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});

/** A nested component renders its own tree, so it localizes its own tree. */
function Delta({value}:{value:number}){
 const L=useLocalize();
 if(!value)return L(<small className="muted">без изменений</small>);
 return L(<small className={value>0?'trend up':'trend down'}>
  {value>0?<ArrowUpRight size={12}/>:<ArrowDownRight size={12}/>}
  {value>0?'+':''}{value}% к предыдущему периоду</small>);
}

export function Analytics({api,campaigns}:{
 api:(path:string,body?:unknown)=>Promise<any>;campaigns:{id:string;name:string}[]}){
 const L=useLocalize();
 const [period,setPeriod]=useState('30d');
 const [from,setFrom]=useState('');
 const [to,setTo]=useState('');
 const [campaign,setCampaign]=useState('all');
 const [data,setData]=useState<any>(null);
 const [error,setError]=useState('');

 useEffect(()=>{
  if(period==='custom'&&!(from&&to))return;
  let live=true;
  api('/analytics',{period,from,to,campaign})
   .then(d=>{if(live)setData(d);})
   .catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;};
 },[period,from,to,campaign]);

 const totals=data?.totals;
 const comparison=data?.comparison??{};
 const peak=Math.max(1,...(data?.series??[]).map((p:any)=>p.replies));
 const one=campaign!=='all'&&campaign!=='active'&&campaign!=='finished'
  ?data?.campaigns?.find((c:any)=>c.id===campaign):null;

 return L(<>
  <section className="card full-card filters">
   <div className="padded filter-row">
    <label>Период<select value={period} onChange={e=>setPeriod(e.target.value)}>
     {periods.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    {period==='custom'&&<>
     <label>С<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
     <label>По<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></>}
    <label>Кампании<select value={campaign} onChange={e=>setCampaign(e.target.value)}>
     <option value="all">Все кампании</option>
     <option value="active">Активные</option>
     <option value="finished">Завершённые и на паузе</option>
     {campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   </div>
   {data&&<p className="tiny muted padded">
    Расчёт за {new Date(data.period.from).toLocaleDateString('ru-RU')} — {new Date(data.period.to).toLocaleDateString('ru-RU')}.
    Сравнение с {new Date(data.previous.from).toLocaleDateString('ru-RU')} — {new Date(data.previous.to).toLocaleDateString('ru-RU')}.</p>}
  </section>

  {error&&<div className="alert error" role="alert">{error}</div>}
  {data?.demo&&<div className="info-banner"><Info size={20}/><div>
   <b>Демонстрационная рабочая область</b>
   <p>Показатели считаются по примерам. В обычном аккаунте здесь только собственные события.</p></div></div>}

  {!data?<div className="empty card">Выберите период, чтобы посчитать показатели.</div>:<>
   <div className="stats analytics-stats">
    {[['Писем подготовлено',totals.prepared,'prepared'],['Отправлено',totals.sent,'sent'],
      ['Ответов',totals.replies,'replies'],['Положительных ответов',totals.positive,'positive'],
      ['Конверсия',totals.conversion+'%','conversion'],['Встреч назначено',totals.meetings,'meetings']]
     .map(([label,value,key])=><article className="card metric" key={String(key)}>
      <span>{label}</span><h2>{String(value)}</h2>
      <Delta value={comparison[String(key)]??0}/></article>)}
   </div>

   {one&&<section className="card full-card">
    <div className="card-heading"><h3><ChartNoAxesCombined size={18}/>Кампания целиком</h3>
     <span className="subtle-tag" data-user-content>{one.name}</span></div>
    <div className="padded">
     <p className="muted"><Flag market={one.market}/><span data-user-content>{one.market}</span> · создана {new Date(one.createdAt).toLocaleDateString('ru-RU')} · состояние: {one.status}</p>
     <div className="table-scroll"><table><thead><tr><th>Подготовлено</th><th>Отправлено</th><th>Ответов</th><th>Положительных</th><th>Конверсия</th></tr></thead>
      <tbody><tr><td>{one.prepared}</td><td>{one.sent}</td><td>{one.replies}</td><td>{one.positive}</td><td>{one.conversion}%</td></tr></tbody></table></div>
    </div></section>}

   <section className="card full-card">
    <div className="card-heading"><h3><ChartNoAxesColumnIncreasing size={18}/>Ответы по дням</h3></div>
    <div className="padded">
     {data.series.some((p:any)=>p.replies)
      ?<div className="daily-chart">{data.series.map((point:any)=>
        <div key={point.day} className="daily-bar" title={`${point.day}: ${point.replies}`}>
         <i style={{height:Math.round(point.replies/peak*100)+'%'}}/>
         <em style={{height:Math.round(point.positive/peak*100)+'%'}}/>
         <span>{day(point.day)}</span></div>)}</div>
      :<div className="empty">За выбранный период ответов не было.</div>}
    </div></section>

   <section className="card full-card">
    <div className="card-heading"><h3><ChartNoAxesCombined size={18}/>Результаты по кампаниям</h3>
     <span className="subtle-tag">{data.campaigns.length}</span></div>
    <div className="table-scroll"><table>
     <thead><tr><th>Кампания</th><th>Рынок</th><th>Подготовлено</th><th>Отправлено</th><th>Ответов</th><th>Положительных</th><th>Конверсия</th></tr></thead>
     <tbody>{data.campaigns.map((c:any)=><tr key={c.id}>
      <td data-user-content>{c.name}</td>
      <td><Flag market={c.market}/><span data-user-content>{c.market}</span></td>
      <td>{c.prepared}</td><td>{c.sent}</td><td>{c.replies}</td><td>{c.positive}</td><td>{c.conversion}%</td></tr>)}</tbody></table>
     {!data.campaigns.length&&<div className="empty">В выбранном периоде кампаний нет.</div>}</div>
   </section>

   {data.reasons.length>0&&<section className="card full-card">
    <div className="card-heading"><h3><ChartNoAxesCombined size={18}/>Причины ответов</h3></div>
    <div className="reasons padded">{data.reasons.map((r:any,i:number)=>
     <div key={r.category}><span className="muted">{i+1}</span><span>{categories[r.category]??r.category}</span>
      <div className="bar"><i style={{width:Math.round(r.count/Math.max(1,data.reasons[0].count)*100)+'%'}}/></div>
      <b>{r.count}</b></div>)}</div>
   </section>}
  </>}
 </>);
}
