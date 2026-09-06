import React,{useMemo,useState} from 'react';
import {Check,Globe,Search,X} from 'lucide-react';
import {countries,regions,type Location} from '../server/geo';
import {Flag} from './flag';
import {useLocalize} from './i18n';

/** Where to look, chosen properly.

    The old screen offered six countries in a <select>, which was a demonstration list standing
    in for a real choice. This is the real choice: type to find any country, pick as many as
    apply, or step up to a region, or narrow to a city — or hand the decision to Sendina, which
    is a deliberate answer rather than an empty field. */

export const emptyLocation=():Location=>({countries:[],region:'',city:'',auto:true});

export function LocationPicker({value,onChange,allowAuto=true,label='Где ищем'}:{
 value:Location;onChange:(next:Location)=>void;allowAuto?:boolean;label?:string}){
 const L=useLocalize();
 const [query,setQuery]=useState('');
 const chosen=value.countries??[];
 const matches=useMemo(()=>{
  const q=query.trim().toLowerCase();
  if(!q)return [];
  return countries.filter(c=>c.ru.toLowerCase().includes(q)||c.en.toLowerCase().includes(q)||c.code.toLowerCase()===q)
   .filter(c=>!chosen.includes(c.ru)).slice(0,8);
 },[query,chosen]);
 const set=(patch:Partial<Location>)=>{
  const next={...value,...patch};
  next.auto=Boolean(next.auto)&&!next.countries.length&&!next.region&&!next.city;
  onChange(next);
 };
 const add=(name:string)=>{setQuery('');set({countries:[...chosen,name].slice(0,20),auto:false});};
 const remove=(name:string)=>set({countries:chosen.filter(c=>c!==name)});

 return L(<div className="location-picker">
  <label className="location-search">{label}
   <span className="location-input"><Search size={15}/>
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Начните вводить страну"
     aria-label="Поиск страны"
     onKeyDown={e=>{if(e.key==='Enter'&&matches[0]){e.preventDefault();add(matches[0].ru);}}}/>
   </span></label>
  {matches.length>0&&<ul className="location-matches">{matches.map(c=>
   <li key={c.code}><button type="button" onClick={()=>add(c.ru)}>
    <Flag market={c.ru}/><span data-user-content>{c.ru}</span><small>{c.region}</small></button></li>)}</ul>}
  {chosen.length>0&&<div className="location-chosen">{chosen.map(name=>
   <span className="chip" key={name}><Flag market={name}/><span data-user-content>{name}</span>
    <button type="button" aria-label="Убрать страну" onClick={()=>remove(name)}><X size={12}/></button></span>)}</div>}
  <div className="form-row">
   <label>Регион<select value={value.region} onChange={e=>set({region:e.target.value,auto:false})}>
    <option value="">Не задан</option>
    {regions.map(r=><option key={r.id} value={r.id}>{r.id}</option>)}</select></label>
   <label>Город (необязательно)<input value={value.city} placeholder="Например, Нью-Йорк"
    onChange={e=>set({city:e.target.value,auto:false})}/></label>
  </div>
  {allowAuto&&<label className="switch"><input type="checkbox" checked={Boolean(value.auto)}
    onChange={e=>onChange(e.target.checked?emptyLocation():{...value,auto:false})}/>
   <Globe size={14}/>Пусть Sendina выберет территорию сама</label>}
  {value.auto&&<p className="tiny muted"><Check size={12}/> Территорию выберет Sendina и назовёт её в результате.</p>}
 </div>);
}
