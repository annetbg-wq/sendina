import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {getAuth,setAuth} from './authstore';

/** Accounts, passwordless login links and superadmin approval. */
export type Role='user'|'superadmin';
export type Status='pending'|'approved'|'blocked';
export type Account={id:string;email:string;role:Role;status:Status;
 createdAt:string;approvedAt:string|null;approvedBy:string|null;lastLoginAt:string|null};

const defaultSuperadmins=['vkdevproai@gmail.com','oopsifymovie@gmail.com','pavekornilov@gmail.com','annetdenr@gmail.com'];
export const superadmins=()=>(process.env.SUPERADMINS??'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean)
 .concat(defaultSuperadmins).filter((e,i,all)=>all.indexOf(e)===i);
export const isSuperadmin=(email:string)=>superadmins().includes(email.toLowerCase());

export const accountSchemas={
 login:z.object({email:z.email()}),
 decide:z.object({id:z.string().min(1),status:z.enum(['approved','blocked','pending'])})
};

const all=async()=>(await getAuth<Record<string,Account>>('accounts'))??{};
const save=(accounts:Record<string,Account>)=>setAuth('accounts',accounts);
/** A stable id derived from the address, so a workspace survives any record rewrite. */
const idFor=(email:string)=>createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0,32);

export const listAccounts=async()=>Object.values(await all()).sort((a,b)=>a.createdAt<b.createdAt?1:-1);
export const findAccount=async(id:string)=>(await all())[id]??null;
export const findByEmail=async(email:string)=>(await all())[idFor(email)]??null;

/** Registers an address on first sight. A superadmin is approved at once; everyone else waits. */
export async function ensureAccount(email:string):Promise<Account>{
 const lower=email.toLowerCase();
 const accounts=await all();
 const id=idFor(lower);
 if(accounts[id]){
  // Promote an address that was added to the superadmin list after it first signed up.
  if(isSuperadmin(lower)&&accounts[id].role!=='superadmin'){
   accounts[id]={...accounts[id],role:'superadmin',status:'approved',
    approvedAt:accounts[id].approvedAt??new Date().toISOString(),approvedBy:'superadmin list'};
   await save(accounts);
  }
  return accounts[id];
 }
 const now=new Date().toISOString();
 const superadmin=isSuperadmin(lower);
 const account:Account={id,email:lower,role:superadmin?'superadmin':'user',
  status:superadmin?'approved':'pending',createdAt:now,
  approvedAt:superadmin?now:null,approvedBy:superadmin?'superadmin list':null,lastLoginAt:null};
 accounts[id]=account;await save(accounts);
 return account;
}

export async function decideAccount(actor:Account,input:unknown){
 const {id,status}=accountSchemas.decide.parse(input);
 if(actor.role!=='superadmin')throw Error('Только суперадмин может менять доступ аккаунтов.');
 const accounts=await all();
 const account=accounts[id];
 if(!account)throw Error('Аккаунт не найден');
 if(account.role==='superadmin'&&status!=='approved')throw Error('Суперадмина нельзя заблокировать.');
 accounts[id]={...account,status,
  approvedAt:status==='approved'?new Date().toISOString():account.approvedAt,
  approvedBy:status==='approved'?actor.email:account.approvedBy};
 await save(accounts);
 return accounts[id];
}

// --- Login links -----------------------------------------------------------
type LinkRecord={accountId:string;expires:number};
const links=new Map<string,LinkRecord>();
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');

/** The raw token goes to the mailbox; only its hash is kept here. */
export function issueLoginToken(accountId:string,minutes=20){
 const token=randomBytes(32).toString('base64url');
 links.set(hash(token),{accountId,expires:Date.now()+minutes*60000});
 return token;
}
export function consumeLoginToken(token:string){
 const key=hash(token);
 const record=links.get(key);
 links.delete(key);
 if(!record||record.expires<Date.now())return null;
 return record.accountId;
}

// --- Sessions --------------------------------------------------------------
type SessionRecord={accountId:string;expires:number};
const sessionKey='sessions';
const sessionDays=Number(process.env.SESSION_DAYS??30);

export async function createSession(accountId:string){
 const token=randomBytes(32).toString('base64url');
 const sessions=(await getAuth<Record<string,SessionRecord>>(sessionKey))??{};
 const now=Date.now();
 for(const [k,v] of Object.entries(sessions))if(v.expires<now)delete sessions[k];
 sessions[hash(token)]={accountId,expires:now+sessionDays*86400000};
 await setAuth(sessionKey,sessions);
 const accounts=await all();
 if(accounts[accountId]){accounts[accountId]={...accounts[accountId],lastLoginAt:new Date().toISOString()};await save(accounts);}
 return token;
}
export async function accountForSession(token:string):Promise<Account|null>{
 if(!token)return null;
 const sessions=(await getAuth<Record<string,SessionRecord>>(sessionKey))??{};
 const record=sessions[hash(token)];
 if(!record||record.expires<Date.now())return null;
 const account=(await all())[record.accountId];
 if(!account||account.status!=='approved')return null;
 return account;
}
export async function endSession(token:string){
 const sessions=(await getAuth<Record<string,SessionRecord>>(sessionKey))??{};
 delete sessions[hash(token)];
 await setAuth(sessionKey,sessions);
}

// --- Connector codes -------------------------------------------------------
/** Pasted on the MCP consent screen so a connector binds to one account. */
export async function connectorCode(accountId:string,regenerate=false){
 const codes=(await getAuth<Record<string,string>>('connector-codes'))??{};
 if(!codes[accountId]||regenerate){
  codes[accountId]=randomBytes(18).toString('base64url');
  await setAuth('connector-codes',codes);
 }
 return codes[accountId];
}
export async function accountForConnectorCode(code:string):Promise<Account|null>{
 if(!code)return null;
 const codes=(await getAuth<Record<string,string>>('connector-codes'))??{};
 const given=Buffer.from(code);
 for(const [accountId,value] of Object.entries(codes)){
  const known=Buffer.from(value);
  if(known.length===given.length&&timingSafeEqual(known,given)){
   const account=(await all())[accountId];
   if(account&&account.status==='approved')return account;
  }
 }
 return null;
}
