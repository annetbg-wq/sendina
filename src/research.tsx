import React,{useState} from 'react';
import {ArrowRight,Star,Trash2,ExternalLink,ChevronDown,ChevronRight} from 'lucide-react';
import {Flag} from './flag';
import {factorLabels,level,upside,downside} from '../server/research';
import type {Research} from '../server/seed';
import {useLocalize} from './i18n';

/** One researched card, whichever screen produced it.

    An opportunity leads with what to sell and a market leads with where, but they carry the same
    fields and the same score, so they are drawn by the same component. The two buttons are the
    same two buttons everywhere: make an ordinary campaign, or keep it. */

export type CardAction={label:string;run:()=>void};

/** Difficulty is shown as a word and coloured by a latin class, so the stylesheet stays ASCII. */
const levelClass=(value:number)=>value<=3?'low':value<=6?'mid':'high';
const scoreClass=(score:number)=>score>=70?'score high':score>=45?'score mid':'score low';

export function ResearchCard({item,busy,onTest,onSave,onRemove,lead}:{
 item:Research;busy:boolean;lead:'opportunity'|'market';
 onTest:()=>void;onSave?:()=>void;onRemove?:()=>void}){
 const L=useLocalize();
 const [open,setOpen]=useState(false);
 const title=lead==='market'?item.market:item.name;
 const subtitle=lead==='market'?item.niche:item.market;
 return L(<article className="card research-card">
  <div className="research-top">
   <span className={scoreClass(item.score)}>{item.score}<small>/100</small></span>
   <time className="tiny muted" dateTime={item.researchedAt}>
    {new Date(item.researchedAt).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</time>
  </div>
  <h2 data-user-content>{title}</h2>
  <p className="market-label"><Flag market={item.market}/><span data-user-content>{subtitle}</span>
   <span data-user-content>{item.ticket}</span></p>
  <p data-user-content>{item.summary}</p>
  <dl className="research-facts">
   <dt>Для кого</dt><dd data-user-content>{item.audience}</dd>
   <dt>Боль</dt><dd data-user-content>{item.pain}</dd>
   <dt>Почему сейчас</dt><dd data-user-content>{item.whyNow}</dd>
   <dt>Почему эта локация</dt><dd data-user-content>{item.whyHere}</dd>
   <dt>Платёжеспособность</dt><dd data-user-content>{item.payingPower}</dd>
   <dt>Доступность адресатов</dt><dd data-user-content>{item.reach}</dd>
  </dl>
  <div className="research-levels">
   {[['Реализация',item.implementation],['Продажа',item.salesDifficulty],
     ['Конкуренция',item.competition],['Правовой риск',item.legalRisk]].map(([label,value])=>
    <span key={String(label)} className={'level '+levelClass(Number(value))}>{label}: {level(Number(value))}</span>)}
  </div>
  <button className="text-link" onClick={()=>setOpen(!open)} aria-expanded={open}>
   {open?<ChevronDown size={13}/>:<ChevronRight size={13}/>}Почему такая оценка</button>
  {open&&<div className="research-why">
   <p data-user-content>{item.why}</p>
   <p className="tiny" data-user-content>{item.scoreWhy}</p>
   <div className="factor-bars">{[...upside,...downside].map(key=>
    <div key={key} className={downside.includes(key as any)?'factor negative':'factor'}>
     <span>{factorLabels[key]}</span>
     <div className="bar"><i style={{width:(item.factors?.[key]??0)*10+'%'}}/></div>
     <b>{item.factors?.[key]??0}</b></div>)}</div>
   {item.sources?.length>0&&<><label>Источники исследования</label>
    <ul className="sources">{item.sources.map(src=>
     <li key={src.url}><a href={src.url} target="_blank" rel="noreferrer" data-user-content>{src.title||src.url}
      <ExternalLink size={11}/></a></li>)}</ul></>}
  </div>}
  <div className="research-actions">
   <button disabled={busy} onClick={onTest}>{lead==='market'?'Подготовить тест':'Создать тест'}<ArrowRight size={15}/></button>
   {onSave&&<button className="secondary" disabled={busy} onClick={onSave}><Star size={15}/>В избранное</button>}
   {onRemove&&<button className="text-link" disabled={busy} onClick={onRemove}><Trash2 size={14}/>Удалить из избранного</button>}
  </div>
 </article>);
}

/** The favourites block both screens show under their results. */
export function Favourites({items,busy,lead,onTest,onRemove}:{
 items:Research[];busy:boolean;lead:'opportunity'|'market';
 onTest:(item:Research)=>void;onRemove:(item:Research)=>void}){
 const L=useLocalize();
 if(!items.length)return L(<div className="empty card">
  Избранное пусто. Сохранённое здесь остаётся, когда вы запускаете новый поиск.</div>);
 return L(<div className="ideas-grid">{items.map(item=>
  <ResearchCard key={item.id} item={item} busy={busy} lead={lead}
   onTest={()=>onTest(item)} onRemove={()=>onRemove(item)}/>)}</div>);
}
