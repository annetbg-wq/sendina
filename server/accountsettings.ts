import {z} from 'zod';
import {getAuth,setAuth} from './authstore';

/** Connection settings each account fills in itself. Secrets never travel back to the interface. */
export type AccountSettings={
 openaiKey:string;openaiModel:string;aiGatewayUrl:string;
 searchProvider:''|'brave'|'tavily'|'serper';searchKey:string;
 google:{clientId:string;clientSecret:string};
 microsoft:{clientId:string;clientSecret:string;tenant:string};
};
const empty=():AccountSettings=>({openaiKey:'',openaiModel:'',aiGatewayUrl:'',
 searchProvider:'',searchKey:'',google:{clientId:'',clientSecret:''},
 microsoft:{clientId:'',clientSecret:'',tenant:''}});

const key=(accountId:string)=>`settings:${accountId}`;

/** An empty string clears a field; an omitted field keeps what is stored. */
export const settingsSchema=z.object({
 openaiKey:z.string().max(300).optional(),
 openaiModel:z.string().max(80).optional(),
 aiGatewayUrl:z.string().max(300).optional(),
 searchProvider:z.enum(['','brave','tavily','serper']).optional(),
 searchKey:z.string().max(300).optional(),
 google:z.object({clientId:z.string().max(300).optional(),clientSecret:z.string().max(300).optional()}).optional(),
 microsoft:z.object({clientId:z.string().max(300).optional(),clientSecret:z.string().max(300).optional(),tenant:z.string().max(120).optional()}).optional()
});

export async function accountSettings(accountId:string):Promise<AccountSettings>{
 const stored=await getAuth<Partial<AccountSettings>>(key(accountId));
 const base=empty();
 return {...base,...stored,google:{...base.google,...stored?.google},microsoft:{...base.microsoft,...stored?.microsoft}};
}

export async function saveAccountSettings(accountId:string,input:unknown){
 const patch=settingsSchema.parse(input);
 const current=await accountSettings(accountId);
 const next:AccountSettings={...current,
  ...Object.fromEntries(Object.entries(patch).filter(([k,v])=>v!==undefined&&k!=='google'&&k!=='microsoft')),
  google:{...current.google,...patch.google},
  microsoft:{...current.microsoft,...patch.microsoft}} as AccountSettings;
 await setAuth(key(accountId),next);
 return maskSettings(next);
}

/** What the interface is allowed to see: whether a field is filled, never its value. */
export function maskSettings(s:AccountSettings){
 const filled=(v:string)=>Boolean(v&&v.trim());
 return {
  openai:{configured:filled(s.openaiKey),model:s.openaiModel||'gpt-4.1-mini',gateway:s.aiGatewayUrl||''},
  search:{provider:s.searchProvider,configured:filled(s.searchProvider)&&filled(s.searchKey)},
  google:{configured:filled(s.google.clientId)&&filled(s.google.clientSecret)},
  microsoft:{configured:filled(s.microsoft.clientId)&&filled(s.microsoft.clientSecret),tenant:s.microsoft.tenant||'common'}
 };
}
