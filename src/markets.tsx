import React,{useEffect,useState} from 'react';
import {Globe,Search,Star,Info,Target} from 'lucide-react';
import {LocationPicker,emptyLocation} from './location';
import {ResearchCard,Favourites} from './research';
import type {Location} from '../server/geo';
import type {Research} from '../server/seed';
import {useLocalize} from './i18n';

/** "Рынки": one screen, two explicit directions, and a manual verdict.

    A country asks which niches; a niche asks which countries; naming both asks Sendina only to
    score that pairing. The third mode is what keeps the model an assistant rather than the
    decision — the operator can always state the answer and ask for an opinion on it. */

const modes=[
 {id:'country',title:'У меня есть страна',lead:'Выберите территорию — Sendina предложит шесть самых перспективных ниш для неё на сегодня.'},
 {id:'niche',title:'У меня есть ниша',lead:'Опишите нишу, продукт или направление — Sendina предложит шесть самых перспективных стран или регионов.'},
 {id:'manual',title:'Оценить моё сочетание',lead:'Задайте и локацию, и нишу — Sendina только оценит это сочетание и не предложит других.'}
] as const;

export function Markets({api,run,busy,go}:{
 api:(path:string,body?:unknown)=>Promise<any>;
 run:(fn:()=>Promise<unknown>,message?:string)=>Promise<void>;
 busy:boolean;go:(page:string)=>void}){
 const L=useLocalize();
 const [mode,setMode]=useState<'country'|'niche'|'manual'>('country');
 const [location,setLocation]=useState<Location>(emptyLocation());
 const [niche,setNiche]=useState('');
 const [results,setResults]=useState<Research[]>([]);
 const [favourites,setFavourites]=useState<Research[]>([]);
 const [notes,setNotes]=useState<string[]>([]);
 const [at,setAt]=useState<string|null>(null);
 const [searching,setSearching]=useState(false);

 const apply=(data:any)=>{setResults(data.results??[]);setFavourites(data.favourites??[]);
  setAt(data.at??null);setNotes(data.notes??[]);
  if(data.input){setMode(data.input.mode??'country');setLocation(data.input.location??emptyLocation());setNiche(data.input.niche??'');}};
 useEffect(()=>{api('/markets').then(apply).catch(()=>{});},[]);

 const research=()=>run(async()=>{
  setSearching(true);
  try{apply(await api('/markets/research',{mode,location,niche}));}
  finally{setSearching(false);}
 },'Исследование выполнено');

 const save=(item:Research)=>run(async()=>{await api('/favourites',{id:item.id});apply(await api('/markets'));},'Сохранено в избранное');
 const remove=(item:Research)=>run(async()=>{await api('/favourites/remove',{id:item.id});apply(await api('/markets'));},'Удалено из избранного');
 const test=(item:Research)=>run(async()=>{await api('/research/campaign',{id:item.id});go('Рассылки');},'Кампания создана из рынка');
 const current=modes.find(m=>m.id===mode)!;

 return L(<>
  <section className="card full-card search-panel">
   <div className="card-heading"><h3><Globe size={18}/>Исследование рынка</h3>
    {at&&<span className="subtle-tag">Исследовано: {new Date(at).toLocaleString('ru-RU')}</span>}</div>
   <div className="padded">
    <div className="tabs">{modes.map(m=>
     <button key={m.id} className={mode===m.id?'tab active-tab':'tab'} onClick={()=>setMode(m.id)}>{m.title}</button>)}</div>
    <p className="muted">{current.lead}</p>
    {mode!=='niche'&&<LocationPicker value={location} onChange={setLocation} allowAuto={false}
      label="Страна, регион или город"/>}
    {mode!=='country'&&<label>Ниша, продукт или направление
      <input value={niche} onChange={e=>setNiche(e.target.value)}
       placeholder="Например, автоматизация записи для клиник"/></label>}
    <button disabled={busy||searching} onClick={research}>
     {mode==='manual'?<Target size={16}/>:<Search size={16}/>}
     {searching?'Идёт исследование…':mode==='manual'?'Оценить сочетание':'Исследовать рынок'}</button>
   </div>
  </section>

  {notes.length>0&&<div className="info-banner"><Info size={20}/><div>
   {notes.map((n,i)=><p key={i} className="tiny" data-user-content>{n}</p>)}</div></div>}

  {results.length>0
   ?<div className="ideas-grid results">{results.map(item=>
     <ResearchCard key={item.id} item={item} busy={busy} lead="market"
      onTest={()=>test(item)} onSave={()=>save(item)}/>)}</div>
   :<div className="empty card">Результатов пока нет. Выберите режим и запустите исследование.</div>}

  <section className="card full-card">
   <div className="card-heading"><h3><Star size={18}/>Избранное</h3>
    <span className="subtle-tag">{favourites.length}</span></div>
   <div className="padded">
    <Favourites items={favourites} busy={busy} lead="market" onTest={test} onRemove={remove}/></div>
  </section>
 </>);
}
