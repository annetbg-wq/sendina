/** Structured search for real organisations. This is the first layer of recipient research:
    a list of companies that actually exist, before anything looks for a person or an address.
    Google Places is the default adapter; the shape is deliberately provider-neutral. */
export type Organisation={name:string;website:string;address:string;country:string;source:string;rating:number|null};
export type PlacesConfig={placesProvider:string;placesKey:string};

export const placesReady=(c:PlacesConfig)=>Boolean(c.placesKey&&['google'].includes((c.placesProvider??'').toLowerCase()));
export const placesProvider=(c:PlacesConfig)=>placesReady(c)?c.placesProvider.toLowerCase():'';

const base=()=>process.env.PLACES_BASE_URL??'https://places.googleapis.com/v1';

const hostOf=(url:string)=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '';}};

export async function findOrganisations(query:string,config:PlacesConfig,count=10,signal?:AbortSignal):Promise<Organisation[]>{
 if(!placesReady(config))throw Error('Структурированный поиск организаций не подключён.');
 const r=await fetch(`${base()}/places:searchText`,{method:'POST',signal,
  headers:{'Content-Type':'application/json','X-Goog-Api-Key':config.placesKey,
   'X-Goog-FieldMask':'places.displayName,places.websiteUri,places.formattedAddress,places.rating,places.id'},
  body:JSON.stringify({textQuery:query,maxResultCount:Math.min(Math.max(count,1),20)})});
 if(!r.ok)throw Error(`Поиск организаций вернул ошибку ${r.status}: ${(await r.text()).slice(0,200)}`);
 const data=await r.json();
 return (data?.places??[]).map((p:any)=>({
  name:String(p?.displayName?.text??''),
  website:String(p?.websiteUri??''),
  address:String(p?.formattedAddress??''),
  country:String(p?.formattedAddress??'').split(',').pop()?.trim()??'',
  source:p?.websiteUri?String(p.websiteUri):'',
  rating:typeof p?.rating==='number'?p.rating:null
 })).filter((o:Organisation)=>o.name);
}

/** Organisations with no public website cannot be evidenced, so they are not carried forward. */
export const evidenced=(organisations:Organisation[])=>
 organisations.filter(o=>o.website&&hostOf(o.website))
  .filter((o,i,all)=>all.findIndex(x=>hostOf(x.website)===hostOf(o.website))===i);
export const domainOf=hostOf;
