import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {pool} from './store';
/** Signing keys and registered clients live outside the workspace state, which the UI can read. */
const dir=process.env.DATA_DIR??'data';
const file=join(dir,'auth.json');
let ready=false;
async function prepare(){
 if(ready)return;
 if(pool)await pool.query('CREATE TABLE IF NOT EXISTS auth_store (key text PRIMARY KEY, data jsonb NOT NULL)');
 else await mkdir(dir,{recursive:true});
 ready=true;
}
const readFileMap=async():Promise<Record<string,unknown>>=>{
 try{return JSON.parse(await readFile(file,'utf8'));}catch(e:any){if(e.code==='ENOENT')return {};throw e;}
};
export async function getAuth<T>(key:string):Promise<T|null>{
 await prepare();
 if(pool)return (await pool.query('SELECT data FROM auth_store WHERE key=$1',[key])).rows[0]?.data??null;
 return ((await readFileMap())[key]??null) as T|null;
}
export async function setAuth(key:string,data:unknown){
 await prepare();
 if(pool){await pool.query('INSERT INTO auth_store VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET data=$2',[key,JSON.stringify(data)]);return;}
 const map=await readFileMap();map[key]=data;
 await writeFile(join(dir,'auth.tmp'),JSON.stringify(map,null,2));
 await rename(join(dir,'auth.tmp'),file);
}
