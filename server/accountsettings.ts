import {z} from 'zod';
import {getAuth,setAuth} from './authstore';

/** Connection settings an account may still own itself. Google/Microsoft OAuth applications used
 * to live here; those fields remain in the stored shape only so old records can be read safely
 * during migration. Production mail ignores them and the ordinary settings API no longer exposes
 * or accepts them. */
export type AccountSettings={
 openaiKey:string;openaiModel:string;aiGatewayUrl:string;
 searchProvider:''|'brave'|'tavily'|'serper';searchKey:string;
 /** Legacy, read-only migration data. Never use as production mailbox OAuth configuration. */
 google:{clientId:string;clientSecret:string};
 microsoft:{clientId:string;clientSecret:string;tenant:string};
};
const empty=():AccountSettings=>({openaiKey:'',openaiModel:'',aiGatewayUrl:'',
 searchProvider:'',searchKey:'',google:{clientId:'',clientSecret:''},
 microsoft:{clientId:'',clientSecret:'',tenant:''}});

const key=(accountId:string)=>`settings:${accountId}`;

/** An empty string clears an ordinary account setting; an omitted field keeps what is stored.
 * Mail OAuth application credentials are deliberately absent: Google/Microsoft apps belong to
 * Sendina platform settings and cannot be configured through this account endpoint any more. */
export const settingsSchema=z.object({
 openaiKey:z.string().max(300).optional(),
 openaiModel:z.string().max(80).optional(),
 aiGatewayUrl:z.string().max(300).optional(),
 searchProvider:z.enum(['','brave','tavily','serper']).optional(),
 searchKey:z.string().max(300).optional()
}).strict();

export async function accountSettings(accountId:string):Promise<AccountSettings>{
 const stored=await getAuth<Partial<AccountSettings>>(key(accountId));
 const base=empty();
 return {...base,...stored,google:{...base.google,...stored?.google},microsoft:{...base.microsoft,...stored?.microsoft}};
}

export async function saveAccountSettings(accountId:string,input:unknown){
 const patch=settingsSchema.parse(input);
 const current=await accountSettings(accountId);
 const next:AccountSettings={...current,...Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined))} as AccountSettings;
 await setAuth(key(accountId),next);
 return maskSettings(next);
}

/** What the ordinary interface is allowed to see. Legacy Google/Microsoft application fields are
 * intentionally not represented at all, even as `configured` booleans: their existence in an old
 * record must not imply that an account may keep using a private OAuth application. */
export function maskSettings(s:AccountSettings){
 const filled=(v:string)=>Boolean(v&&v.trim());
 return {
  openai:{configured:filled(s.openaiKey),model:s.openaiModel||'gpt-4.1-mini',gateway:s.aiGatewayUrl||''},
  search:{provider:s.searchProvider,configured:filled(s.searchProvider)&&filled(s.searchKey)}
 };
}
