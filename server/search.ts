/** Web search adapters. A real result is the only source a found recipient may cite. */
export type Hit={title:string;url:string;snippet:string};
export type SearchConfig={searchProvider:string;searchKey:string};
const provider=(c:SearchConfig)=>(c.searchProvider??'').toLowerCase();
const key=(c:SearchConfig)=>c.searchKey??'';
export const searchReady=(c:SearchConfig)=>Boolean(key(c)&&['brave','tavily','serper'].includes(provider(c)));
export const searchProvider=(c:SearchConfig)=>searchReady(c)?provider(c):'';
/** Tests point every provider at a local stub. */
const endpoint=(fallback:string)=>process.env.SEARCH_BASE_URL??fallback;

export async function search(query:string,config:SearchConfig,count=8,signal?:AbortSignal):Promise<Hit[]>{
 if(!searchReady(config))throw Error('Поисковый API не подключён. Укажите его в настройках аккаунта.');
 const take=Math.min(Math.max(count,1),20);
 if(provider(config)==='brave'){
  const url=new URL(endpoint('https://api.search.brave.com/res/v1/web/search'));
  url.searchParams.set('q',query);url.searchParams.set('count',String(take));
  const r=await fetch(url,{signal,headers:{Accept:'application/json','X-Subscription-Token':key(config)}});
  if(!r.ok)throw Error(`Поиск вернул ошибку ${r.status}`);
  const d=await r.json();
  return (d?.web?.results??[]).map((x:any)=>({title:String(x.title??''),url:String(x.url??''),snippet:String(x.description??'')}));
 }
 if(provider(config)==='tavily'){
  const r=await fetch(endpoint('https://api.tavily.com/search'),{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${key(config)}`},body:JSON.stringify({query,max_results:take})});
  if(!r.ok)throw Error(`Поиск вернул ошибку ${r.status}`);
  const d=await r.json();
  return (d?.results??[]).map((x:any)=>({title:String(x.title??''),url:String(x.url??''),snippet:String(x.content??'')}));
 }
 const r=await fetch(endpoint('https://google.serper.dev/search'),{method:'POST',signal,headers:{'Content-Type':'application/json','X-API-KEY':key(config)},body:JSON.stringify({q:query,num:take})});
 if(!r.ok)throw Error(`Поиск вернул ошибку ${r.status}`);
 const d=await r.json();
 return (d?.organic??[]).map((x:any)=>({title:String(x.title??''),url:String(x.link??''),snippet:String(x.snippet??'')}));
}

/** Email addresses that literally occur in the fetched text. Nothing else may be claimed as an address. */
const pattern=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export const emailsIn=(text:string)=>[...new Set((text.match(pattern)??[]).map(e=>e.toLowerCase()))];
