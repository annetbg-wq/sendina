import {z} from 'zod';
import {getAuth,setAuth} from './authstore';
import {sealFields,openFields,encryptionFromEnvironment} from './secrets';
import type {MailApps} from './mailproviders';

/** The OAuth applications belong to Sendina, not to the people using it. A superadmin registers
    them once; after that anyone connects a mailbox with a single button and no client id in sight. */
export type PlatformSettings={
 google:{clientId:string;clientSecret:string};
 microsoft:{clientId:string;clientSecret:string;tenant:string};
 /** Infrastructure Sendina provides, so an ordinary person never sees an API key. */
 openaiKey:string;openaiModel:string;aiGatewayUrl:string;
 searchProvider:string;searchKey:string;
 placesProvider:string;placesKey:string;
};
const empty=():PlatformSettings=>({google:{clientId:'',clientSecret:''},microsoft:{clientId:'',clientSecret:'',tenant:''},
 openaiKey:'',openaiModel:'',aiGatewayUrl:'',searchProvider:'',searchKey:'',placesProvider:'',placesKey:''});
const key='platform-settings';

export const platformSchema=z.object({
 google:z.object({clientId:z.string().max(300).optional(),clientSecret:z.string().max(300).optional()}).optional(),
 microsoft:z.object({clientId:z.string().max(300).optional(),clientSecret:z.string().max(300).optional(),tenant:z.string().max(120).optional()}).optional(),
 openaiKey:z.string().max(300).optional(),openaiModel:z.string().max(80).optional(),aiGatewayUrl:z.string().max(300).optional(),
 searchProvider:z.enum(['','brave','tavily','serper']).optional(),searchKey:z.string().max(300).optional(),
 placesProvider:z.enum(['','google']).optional(),placesKey:z.string().max(300).optional()
});

export async function platformSettings():Promise<PlatformSettings>{
 const stored=await getAuth<PlatformSettings>(key);
 const base=empty();
 if(!stored)return base;
 const flat=await openFields({...base,...stored,google:base.google,microsoft:base.microsoft},['openaiKey','searchKey','placesKey']);
 return {...flat,
  google:await openFields({...base.google,...stored.google},['clientSecret']),
  microsoft:await openFields({...base.microsoft,...stored.microsoft},['clientSecret'])
 };
}

export async function savePlatformSettings(input:unknown){
 const patch=platformSchema.parse(input);
 const current=await platformSettings();
 const next:PlatformSettings={...current,
  ...Object.fromEntries(Object.entries(patch).filter(([k,v])=>v!==undefined&&k!=='google'&&k!=='microsoft')),
  google:{...current.google,...patch.google},
  microsoft:{...current.microsoft,...patch.microsoft}} as PlatformSettings;
 await setAuth(key,{...await sealFields(next,['openaiKey','searchKey','placesKey']),
  google:await sealFields(next.google,['clientSecret']),
  microsoft:await sealFields(next.microsoft,['clientSecret'])});
 return maskPlatform(next);
}

export function maskPlatform(s:PlatformSettings){
 const filled=(v:string)=>Boolean(v&&v.trim());
 return {
  google:{configured:filled(s.google.clientId)&&filled(s.google.clientSecret)},
  microsoft:{configured:filled(s.microsoft.clientId)&&filled(s.microsoft.clientSecret),tenant:s.microsoft.tenant||'common'},
  openai:{configured:filled(s.openaiKey),model:s.openaiModel||'gpt-4.1-mini'},
  search:{configured:filled(s.searchProvider)&&filled(s.searchKey),provider:s.searchProvider},
  places:{configured:filled(s.placesProvider)&&filled(s.placesKey),provider:s.placesProvider},
  encryption:encryptionFromEnvironment()?'environment':'generated'
 };
}

/** Platform applications win; an account may still bring its own where the platform has none. */
export function resolveMailApps(platform:PlatformSettings,account:MailApps):MailApps{
 const pick=(p:{clientId:string;clientSecret:string},a:{clientId:string;clientSecret:string})=>
  p.clientId&&p.clientSecret?p:a;
 return {
  google:pick(platform.google,account.google),
  microsoft:{...pick(platform.microsoft,account.microsoft),
   tenant:(platform.microsoft.clientId&&platform.microsoft.clientSecret?platform.microsoft.tenant:account.microsoft.tenant)||'common'}
 };
}
/** Which side supplied the application, so the interface can say whose setup is missing. */
export const appOwner=(platform:PlatformSettings,account:MailApps,provider:'google'|'microsoft')=>
 platform[provider].clientId&&platform[provider].clientSecret?'platform'
 :account[provider].clientId&&account[provider].clientSecret?'account':'none';
