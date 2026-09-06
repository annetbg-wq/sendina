import {demoApi} from './demo-api';

/** Where the interface sends its calls.

    Three deployments have to work from one build. On GitHub Pages the API lives on another
    origin and is named at build time. On Railway the same server serves this page and the API,
    so the right address is simply "here". With neither, there is nothing to talk to and the
    browser demonstration is the honest answer.

    The old rule made a production build with no build-time URL a demonstration, which meant a
    deployment that served its own interface showed sample data instead of the account behind it.
    The address is now resolved once, by asking: an explicit choice wins, then a build-time URL,
    then this origin if it answers /api/health, and only then the demonstration. */

const savedKey='sendina-api-url';
const saved=()=>localStorage.getItem(savedKey);
export const backendUrl=()=>{const value=saved();return value!==null?value:(import.meta.env.VITE_API_URL||'');};

let mode:'server'|'demo'|null=null;
async function resolveMode(){
 if(mode)return mode;
 const chosen=saved();
 // An explicitly saved empty address selects the demonstration, in development too.
 if(chosen==='')return mode='demo';
 if(chosen||import.meta.env.VITE_API_URL)return mode='server';
 if(import.meta.env.DEV)return mode='server';
 try{const r=await fetch('/api/health');return mode=r.ok?'server':'demo';}
 catch{return mode='demo';}
}
/** What the banner shows. Before the first call it reports "not a demo", which is what the
    sign-in screen needs, and it settles as soon as anything is fetched. */
export const browserDemo=()=>mode==='demo';

const sessionKey='sendina-session';
export const session=()=>localStorage.getItem(sessionKey)??'';
export const setSession=(token:string)=>{token?localStorage.setItem(sessionKey,token):localStorage.removeItem(sessionKey);};

/** The login link returns through the API, which hands the session back in the URL fragment. */
export function captureSession():''|'signed-in'|'expired'{
 const hash=decodeURIComponent(location.hash.replace(/^#/,''));
 if(!hash)return '';
 const clean=()=>history.replaceState(null,'',location.pathname+location.search);
 if(hash.startsWith('session=')){setSession(hash.slice('session='.length));clean();return 'signed-in';}
 if(hash==='login-expired'){clean();return 'expired';}
 return '';
}

export async function api(path:string,body?:unknown){
 if(await resolveMode()==='demo')return demoApi(path,body);
 const base=backendUrl();
 const token=session();
 const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',
  headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
  body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.headers.get('content-type')?.includes('application/json'))throw Error('Сервер недоступен. Проверьте адрес подключения.');
 const data=await r.json();
 if(!r.ok){const error=Object.assign(Error(data.error??'Ошибка запроса'),{status:r.status});throw error;}
 return data;
}
