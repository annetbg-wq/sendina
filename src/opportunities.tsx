import React,{useEffect,useState} from 'react';
import {Lightbulb,Search,Star,Info} from 'lucide-react';
import {LocationPicker,emptyLocation} from './location';
import {ResearchCard,Favourites} from './research';
import type {Location} from '../server/geo';
import type {Research} from '../server/seed';
import {useLocalize} from './i18n';

/** "Возможности": one question, six answers, two buttons.

    The screen used to show five fixed demonstration cards. It now runs the Opportunity Research
    mechanism — the same one MCP and the platform model reach — and shows what it returns. A new
    search replaces the six results and never touches the favourites, so nothing accumulates that
    the operator did not choose to keep. */

export function Opportunities({api,run,busy,go}:{
 api:(path:string,body?:unknown)=>Promise<any>;
 run:(fn:()=>Promise<unknown>,message?:string)=>Promise<void>;
 busy:boolean;go:(page:string)=>void}){
 const L=useLocalize();
 const [location,setLocation]=useState<Location>(emptyLocation());
 const [industry,setIndustry]=useState('');
 const [note,setNote]=useState('');
 const [results,setResults]=useState<Research[]>([]);
 const [favourites,setFavourites]=useState<Research[]>([]);
 const [notes,setNotes]=useState<string[]>([]);
 const [at,setAt]=useState<string|null>(null);
 const [searching,setSearching]=useState(false);

 const apply=(data:any)=>{setResults(data.results??[]);setFavourites(data.favourites??[]);
  setAt(data.at??null);setNotes(data.notes??[]);
  if(data.input){setLocation(data.input.location??emptyLocation());setIndustry(data.input.industry??'');setNote(data.input.note??'');}};
 useEffect(()=>{api('/opportunities').then(apply).catch(()=>{});},[]);

 const find=()=>run(async()=>{
  setSearching(true);
  try{apply(await api('/opportunities/research',{location,industry,note}));}
  finally{setSearching(false);}
 },'Исследование выполнено');

 const save=(item:Research)=>run(async()=>{await api('/favourites',{id:item.id});apply(await api('/opportunities'));},'Сохранено в избранное');
 const remove=(item:Research)=>run(async()=>{await api('/favourites/remove',{id:item.id});apply(await api('/opportunities'));},'Удалено из избранного');
 const test=(item:Research)=>run(async()=>{await api('/research/campaign',{id:item.id});go('Рассылки');},'Кампания создана из возможности');

 return L(<>
  <section className="card full-card search-panel">
   <div className="card-heading"><h3><Search size={18}/>Поиск возможностей</h3>
    {at&&<span className="subtle-tag">Исследовано: {new Date(at).toLocaleString('ru-RU')}</span>}</div>
   <div className="padded">
    <p className="muted">Все поля необязательны. Чем точнее условие, тем конкретнее шесть предложений.</p>
    <LocationPicker value={location} onChange={setLocation} label="Страна, регион или город"/>
    <div className="form-row">
     <label>Направление или отрасль<input value={industry} onChange={e=>setIndustry(e.target.value)}
      placeholder="Например, стоматологии или логистика"/></label>
     <label>Дополнительное условие<input value={note} onChange={e=>setNote(e.target.value)}
      placeholder="Например, чек от 2000 $"/></label>
    </div>
    <button disabled={busy||searching} onClick={find}>
     <Lightbulb size={16}/>{searching?'Идёт исследование…':'Найти возможности'}</button>
   </div>
  </section>

  {notes.length>0&&<div className="info-banner"><Info size={20}/><div>
   {notes.map((n,i)=><p key={i} className="tiny" data-user-content>{n}</p>)}</div></div>}

  {results.length>0
   ?<div className="ideas-grid results">{results.map(item=>
     <ResearchCard key={item.id} item={item} busy={busy} lead="opportunity"
      onTest={()=>test(item)} onSave={()=>save(item)}/>)}</div>
   :<div className="empty card">Возможностей пока нет. Задайте условия и нажмите «Найти возможности».</div>}

  <section className="card full-card">
   <div className="card-heading"><h3><Star size={18}/>Избранное</h3>
    <span className="subtle-tag">{favourites.length}</span></div>
   <div className="padded">
    <Favourites items={favourites} busy={busy} lead="opportunity"
     onTest={test} onRemove={remove}/></div>
  </section>
 </>);
}
