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

/**
 * Google and Microsoft OAuth applications are platform infrastructure. Account-level OAuth app
 * credentials may remain in legacy account records during migration, but they are deliberately
 * ignored here: an ordinary Sendina user must never need to bring a client id or client secret.
 */
export function resolveMailApps(platform:PlatformSettings,_account:MailApps):MailApps{
 return {
  google:{...platform.google},
  microsoft:{...platform.microsoft,tenant:platform.microsoft.tenant||'common'}
 };
}

/** Only the platform may own a Google/Microsoft OAuth application in the production path. */
export const appOwner=(platform:PlatformSettings,_account:MailApps,provider:'google'|'microsoft')=>
 platform[provider].clientId&&platform[provider].clientSecret?'platform':'none';
