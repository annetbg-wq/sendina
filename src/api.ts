import {demoApi} from './demo-api';
/** A saved value wins over the build-time URL, and an empty one selects the browser demo. */
export const backendUrl=()=>{const saved=localStorage.getItem('sendina-api-url');return saved!==null?saved:(import.meta.env.VITE_API_URL||'');};
/** An explicitly saved empty address selects the demo, in development too. */
export const browserDemo=()=>localStorage.getItem('sendina-api-url')===''||(import.meta.env.PROD&&!backendUrl());

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
 if(browserDemo())return demoApi(path,body);
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
