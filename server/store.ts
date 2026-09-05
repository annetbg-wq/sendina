import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {Pool} from 'pg';
import {seed,type State} from './seed';
import {join} from 'node:path';
const dir=process.env.DATA_DIR??'data';
export const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL}):null;
let chain:Promise<unknown>=Promise.resolve();
export async function init(){
 if(pool){await pool.query('CREATE TABLE IF NOT EXISTS workspace_state (id text PRIMARY KEY, data jsonb NOT NULL)');await pool.query('INSERT INTO workspace_state VALUES ($1,$2) ON CONFLICT DO NOTHING',['local',JSON.stringify(seed())]);}
 else {await mkdir(dir,{recursive:true});try{await readFile(join(dir,'state.json'));}catch(e:any){if(e.code!=='ENOENT')throw e;await writeFile(join(dir,'state.json'),JSON.stringify(seed()));}}
}
export async function read():Promise<State>{return pool?(await pool.query('SELECT data FROM workspace_state WHERE id=$1',['local'])).rows[0].data:JSON.parse(await readFile(join(dir,'state.json'),'utf8'));}
export function change<T>(fn:(s:State)=>T|Promise<T>):Promise<T>{
 const job=chain.then(async()=>{
  if(pool){const c=await pool.connect();try{await c.query('BEGIN');const s=(await c.query('SELECT data FROM workspace_state WHERE id=$1 FOR UPDATE',['local'])).rows[0].data;const result=await fn(s);await c.query('UPDATE workspace_state SET data=$1 WHERE id=$2',[JSON.stringify(s),'local']);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
  const s=await read();const result=await fn(s);await writeFile(join(dir,'state.tmp'),JSON.stringify(s,null,2));await rename(join(dir,'state.tmp'),join(dir,'state.json'));return result;
 });chain=job.catch(()=>{});return job;
}
