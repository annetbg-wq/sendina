/** Where campaigns and research may look.

    The interface used to offer six countries. That was a demonstration list, not a limit of the
    system: nothing downstream cares which country a campaign names. This module is the one
    shared source for the selector, so the interface and the operations layer agree on what a
    valid location is without either of them hard-coding a market. */

export type Country={code:string;ru:string;en:string;region:string};

/** Regions are the coarse choice ("вся Европа"); they are also how the selector groups countries. */
export const regions=[
 {id:'Европа',en:'Europe'},
 {id:'Северная Америка',en:'North America'},
 {id:'Латинская Америка',en:'Latin America'},
 {id:'Ближний Восток',en:'Middle East'},
 {id:'Африка',en:'Africa'},
 {id:'Азия',en:'Asia'},
 {id:'Океания',en:'Oceania'}
] as const;

const list:[string,string,string,string][]=[
 ['AT','Австрия','Austria','Европа'],['AL','Албания','Albania','Европа'],['AD','Андорра','Andorra','Европа'],
 ['BE','Бельгия','Belgium','Европа'],['BG','Болгария','Bulgaria','Европа'],['BA','Босния и Герцеговина','Bosnia and Herzegovina','Европа'],
 ['GB','Великобритания','United Kingdom','Европа'],['HU','Венгрия','Hungary','Европа'],['DE','Германия','Germany','Европа'],
 ['GR','Греция','Greece','Европа'],['DK','Дания','Denmark','Европа'],['IE','Ирландия','Ireland','Европа'],
 ['IS','Исландия','Iceland','Европа'],['ES','Испания','Spain','Европа'],['IT','Италия','Italy','Европа'],
 ['CY','Кипр','Cyprus','Европа'],['LV','Латвия','Latvia','Европа'],['LT','Литва','Lithuania','Европа'],
 ['LI','Лихтенштейн','Liechtenstein','Европа'],['LU','Люксембург','Luxembourg','Европа'],['MT','Мальта','Malta','Европа'],
 ['MD','Молдова','Moldova','Европа'],['MC','Монако','Monaco','Европа'],['NL','Нидерланды','Netherlands','Европа'],
 ['NO','Норвегия','Norway','Европа'],['PL','Польша','Poland','Европа'],['PT','Португалия','Portugal','Европа'],
 ['RO','Румыния','Romania','Европа'],['RS','Сербия','Serbia','Европа'],['SK','Словакия','Slovakia','Европа'],
 ['SI','Словения','Slovenia','Европа'],['FI','Финляндия','Finland','Европа'],['FR','Франция','France','Европа'],
 ['HR','Хорватия','Croatia','Европа'],['ME','Черногория','Montenegro','Европа'],['CZ','Чехия','Czechia','Европа'],
 ['CH','Швейцария','Switzerland','Европа'],['SE','Швеция','Sweden','Европа'],['EE','Эстония','Estonia','Европа'],
 ['UA','Украина','Ukraine','Европа'],['MK','Северная Македония','North Macedonia','Европа'],

 ['US','США','United States','Северная Америка'],['CA','Канада','Canada','Северная Америка'],
 ['MX','Мексика','Mexico','Северная Америка'],

 ['AR','Аргентина','Argentina','Латинская Америка'],['BR','Бразилия','Brazil','Латинская Америка'],
 ['CL','Чили','Chile','Латинская Америка'],['CO','Колумбия','Colombia','Латинская Америка'],
 ['CR','Коста-Рика','Costa Rica','Латинская Америка'],['DO','Доминиканская Республика','Dominican Republic','Латинская Америка'],
 ['EC','Эквадор','Ecuador','Латинская Америка'],['GT','Гватемала','Guatemala','Латинская Америка'],
 ['PA','Панама','Panama','Латинская Америка'],['PE','Перу','Peru','Латинская Америка'],
 ['PY','Парагвай','Paraguay','Латинская Америка'],['UY','Уругвай','Uruguay','Латинская Америка'],

 ['AE','ОАЭ','United Arab Emirates','Ближний Восток'],['BH','Бахрейн','Bahrain','Ближний Восток'],
 ['IL','Израиль','Israel','Ближний Восток'],['JO','Иордания','Jordan','Ближний Восток'],
 ['KW','Кувейт','Kuwait','Ближний Восток'],['OM','Оман','Oman','Ближний Восток'],
 ['QA','Катар','Qatar','Ближний Восток'],['SA','Саудовская Аравия','Saudi Arabia','Ближний Восток'],
 ['TR','Турция','Türkiye','Ближний Восток'],

 ['DZ','Алжир','Algeria','Африка'],['EG','Египет','Egypt','Африка'],['GH','Гана','Ghana','Африка'],
 ['KE','Кения','Kenya','Африка'],['MA','Марокко','Morocco','Африка'],['NG','Нигерия','Nigeria','Африка'],
 ['RW','Руанда','Rwanda','Африка'],['SN','Сенегал','Senegal','Африка'],['TN','Тунис','Tunisia','Африка'],
 ['ZA','ЮАР','South Africa','Африка'],

 ['AM','Армения','Armenia','Азия'],['AZ','Азербайджан','Azerbaijan','Азия'],['BD','Бангладеш','Bangladesh','Азия'],
 ['CN','Китай','China','Азия'],['GE','Грузия','Georgia','Азия'],['HK','Гонконг','Hong Kong','Азия'],
 ['ID','Индонезия','Indonesia','Азия'],['IN','Индия','India','Азия'],['JP','Япония','Japan','Азия'],
 ['KZ','Казахстан','Kazakhstan','Азия'],['KR','Южная Корея','South Korea','Азия'],['LK','Шри-Ланка','Sri Lanka','Азия'],
 ['MY','Малайзия','Malaysia','Азия'],['PH','Филиппины','Philippines','Азия'],['PK','Пакистан','Pakistan','Азия'],
 ['SG','Сингапур','Singapore','Азия'],['TH','Таиланд','Thailand','Азия'],['TW','Тайвань','Taiwan','Азия'],
 ['UZ','Узбекистан','Uzbekistan','Азия'],['VN','Вьетнам','Vietnam','Азия'],

 ['AU','Австралия','Australia','Океания'],['NZ','Новая Зеландия','New Zealand','Океания'],['FJ','Фиджи','Fiji','Океания']
];

export const countries:Country[]=list.map(([code,ru,en,region])=>({code,ru,en,region}))
 .sort((a,b)=>a.ru.localeCompare(b.ru,'ru'));

const byName=new Map<string,Country>();
for(const c of countries){byName.set(c.ru.toLowerCase(),c);byName.set(c.en.toLowerCase(),c);byName.set(c.code.toLowerCase(),c);}
/** Accepts the Russian name, the English name or the ISO code, so a value typed in the
    interface, sent through MCP or stored by an older build all resolve to the same country. */
export const findCountry=(name:string)=>byName.get(String(name??'').trim().toLowerCase())??null;
export const countryCode=(name:string)=>findCountry(name)?.code.toLowerCase()??'';
export const isRegion=(name:string)=>regions.some(r=>r.id===name);

export type Location={countries:string[];region:string;city:string;auto:boolean};

/** The readable label the rest of the system prints as `campaign.market`. */
export function locationLabel(location:Location|undefined|null):string{
 if(!location||location.auto)return 'Выбирает Sendina';
 const parts:string[]=[];
 if(location.countries?.length)parts.push(location.countries.join(', '));
 else if(location.region)parts.push(location.region);
 if(location.region&&location.countries?.length)parts.push(location.region);
 if(location.city)parts.push(location.city);
 return parts.join(' · ')||'Выбирает Sendina';
}

/** What the research and recipient prompts are told to look at. */
export function locationBrief(location:Location|undefined|null):string{
 if(!location||location.auto)return 'Локация не задана: выбери сам наиболее перспективную и назови её явно.';
 const parts:string[]=[];
 if(location.countries?.length)parts.push(`Страны: ${location.countries.join(', ')}`);
 if(location.region)parts.push(`Регион: ${location.region}`);
 if(location.city)parts.push(`Город: ${location.city}`);
 return parts.join('. ');
}

/** A location is valid when it names something real or explicitly leaves the choice open.
    Unknown country names are kept rather than refused: the selector offers this list, but an
    operator who types a territory it does not carry is not blocked by it. */
export function normalizeLocation(input:any):Location{
 const names=Array.isArray(input?.countries)?input.countries.map((c:any)=>String(c).trim()).filter(Boolean):[];
 const resolved=names.map((n:string)=>findCountry(n)?.ru??n).filter((n:string,i:number,all:string[])=>all.indexOf(n)===i).slice(0,20);
 const region=isRegion(String(input?.region??'').trim())?String(input.region).trim():'';
 const city=String(input?.city??'').trim().slice(0,120);
 const auto=Boolean(input?.auto)||(!resolved.length&&!region&&!city);
 return {countries:auto?[]:resolved,region:auto?'':region,city:auto?'':city,auto};
}
