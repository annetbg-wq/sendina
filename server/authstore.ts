import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
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
/** Two writes at once used to share one temporary file, so the second rename could arrive after
    the first had already moved it away and fail with ENOENT — losing a session or a connector
    code under nothing heavier than a person clicking twice. Writes are queued, and each one
    lands on a name of its own. */
let queue:Promise<unknown>=Promise.resolve();
export async function setAuth(key:string,data:unknown){
 await prepare();
 if(pool){await pool.query('INSERT INTO auth_store VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET data=$2',[key,JSON.stringify(data)]);return;}
 const job=queue.then(async()=>{
  const map=await readFileMap();map[key]=data;
  const temp=join(dir,`auth.${randomUUID()}.tmp`);
  await writeFile(temp,JSON.stringify(map,null,2));
  await rename(temp,file);
 });
 queue=job.catch(()=>{});
 return job;
}

/** Remove one-time credentials/state instead of leaving tombstones that could be replayed. */
export async function deleteAuth(key:string){
 await prepare();
 if(pool){await pool.query('DELETE FROM auth_store WHERE key=$1',[key]);return;}
 const job=queue.then(async()=>{
  const map=await readFileMap();
  delete map[key];
  const temp=join(dir,`auth.${randomUUID()}.tmp`);
  await writeFile(temp,JSON.stringify(map,null,2));
  await rename(temp,file);
 });
 queue=job.catch(()=>{});
 return job;
}

/**
 * Atomically consume a one-time value. PostgreSQL deletes and returns in one statement; the file
 * fallback performs read/delete/write inside the same serialized queue. Two concurrent callers
 * therefore cannot both receive the same OAuth state or login credential.
 */
export async function takeAuth<T>(key:string):Promise<T|null>{
 await prepare();
 if(pool)return (await pool.query('DELETE FROM auth_store WHERE key=$1 RETURNING data',[key])).rows[0]?.data??null;
 const job=queue.then(async()=>{
  const map=await readFileMap();
  const value=(map[key]??null) as T|null;
  if(value===null)return null;
  delete map[key];
  const temp=join(dir,`auth.${randomUUID()}.tmp`);
  await writeFile(temp,JSON.stringify(map,null,2));
  await rename(temp,file);
  return value;
 });
 queue=job.catch(()=>{});
 return job as Promise<T|null>;
}
