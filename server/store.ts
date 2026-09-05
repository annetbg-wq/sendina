import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {seed,normalize,type State} from './seed';
import {join} from 'node:path';
/** One workspace per account. Nothing here is shared between accounts. */
const dir=process.env.DATA_DIR??'data';
export const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL}):null;
const chains=new Map<string,Promise<unknown>>();
const file=(accountId:string)=>join(dir,`state-${accountId}.json`);
const valid=(accountId:string)=>{
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(accountId))throw Error('Некорректный идентификатор аккаунта');
 return accountId;
};

export async function init(){
 if(pool)await pool.query('CREATE TABLE IF NOT EXISTS workspace_state (id text PRIMARY KEY, data jsonb NOT NULL)');
 else await mkdir(dir,{recursive:true});
}

/** A workspace appears the first time its account touches it. */
async function ensure(accountId:string){
 if(pool){await pool.query('INSERT INTO workspace_state VALUES ($1,$2) ON CONFLICT DO NOTHING',[accountId,JSON.stringify(seed())]);return;}
 await mkdir(dir,{recursive:true});
 try{await readFile(file(accountId));}
 catch(e:any){if(e.code!=='ENOENT')throw e;await writeFile(file(accountId),JSON.stringify(seed(),null,2));}
}

export async function read(accountId:string):Promise<State>{
 valid(accountId);await ensure(accountId);
 return normalize(pool
  ?(await pool.query('SELECT data FROM workspace_state WHERE id=$1',[accountId])).rows[0].data
  :JSON.parse(await readFile(file(accountId),'utf8')));
}

export function change<T>(accountId:string,fn:(s:State)=>T|Promise<T>):Promise<T>{
 valid(accountId);
 const previous=chains.get(accountId)??Promise.resolve();
 const job=previous.then(async()=>{
  await ensure(accountId);
  if(pool){
   const c=await pool.connect();
   try{
    await c.query('BEGIN');
    const s=normalize((await c.query('SELECT data FROM workspace_state WHERE id=$1 FOR UPDATE',[accountId])).rows[0].data);
    const result=await fn(s);
    await c.query('UPDATE workspace_state SET data=$1 WHERE id=$2',[JSON.stringify(s),accountId]);
    await c.query('COMMIT');return result;
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  const s=await read(accountId);const result=await fn(s);
  const temp=join(dir,`state-${accountId}.tmp`);
  await writeFile(temp,JSON.stringify(s,null,2));await rename(temp,file(accountId));
  return result;
 });
 chains.set(accountId,job.catch(()=>{}));
 return job;
}
