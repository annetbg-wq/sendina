import {demoApi} from './demo-api';
/** A saved value wins over the build-time URL, and an empty one selects the browser demo. */
export const backendUrl=()=>{const saved=localStorage.getItem('sendina-api-url');return saved!==null?saved:(import.meta.env.VITE_API_URL||'');};
export const browserDemo=()=>import.meta.env.PROD&&!backendUrl();
export async function api(path:string,body?:unknown){
 if(browserDemo())return demoApi(path,body);
 const base=backendUrl();
 const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(sessionStorage.getItem('token')?{Authorization:`Bearer ${sessionStorage.getItem('token')}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.headers.get('content-type')?.includes('application/json'))throw Error('Сервер недоступен. Проверьте адрес подключения.');
 const data=await r.json();if(!r.ok)throw Error(data.error??'Ошибка запроса');return data;
}
