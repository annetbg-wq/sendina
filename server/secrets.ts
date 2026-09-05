import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {getAuth,setAuth} from './authstore';

/** Mail passwords and refresh tokens are encrypted at rest and never leave the server. */
const prefix='enc.v1.';
let keyPromise:Promise<Buffer>|null=null;

async function key(){
 return keyPromise??=(async()=>{
  const configured=process.env.ENCRYPTION_KEY;
  if(configured)return createHash('sha256').update(configured).digest();
  // Without a platform key one is generated so nothing is ever written in the clear. It lives beside
  // the data, so an environment key is stronger; the interface says which of the two is in use.
  let stored=await getAuth<{key:string}>('encryption-key');
  if(!stored){stored={key:randomBytes(32).toString('base64')};await setAuth('encryption-key',stored);}
  return Buffer.from(stored.key,'base64');
 })();
}
export const encryptionFromEnvironment=()=>Boolean(process.env.ENCRYPTION_KEY);

export async function encrypt(value:string){
 if(!value)return '';
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',await key(),iv);
 const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return prefix+[iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.');
}
export async function decrypt(value:string){
 if(!value)return '';
 if(!value.startsWith(prefix))return value; // written before encryption existed
 const [iv,tag,data]=value.slice(prefix.length).split('.').map(part=>Buffer.from(part,'base64'));
 const decipher=createDecipheriv('aes-256-gcm',await key(),iv);
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}

/** Encrypts the named fields of a record, leaving the rest readable for diagnostics. */
export async function sealFields<T extends Record<string,any>>(record:T,fields:string[]):Promise<T>{
 const out:Record<string,any>={...record};
 for(const field of fields)if(typeof out[field]==='string'&&out[field])out[field]=await encrypt(out[field]);
 return out as T;
}
export async function openFields<T extends Record<string,any>>(record:T,fields:string[]):Promise<T>{
 const out:Record<string,any>={...record};
 for(const field of fields)if(typeof out[field]==='string'&&out[field])out[field]=await decrypt(out[field]);
 return out as T;
}
