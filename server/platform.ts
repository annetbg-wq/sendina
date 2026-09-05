import {z} from 'zod';
import {getAuth,setAuth} from './authstore';
import {sealFields,openFields,encryptionFromEnvironment} from './secrets';
import type {MailApps} from './mailproviders';

/** The OAuth applications belong to Sendina, not to the people using it. A superadmin registers
    them once; after that anyone connects a mailbox with a single button and no client id in sight. */
export type PlatformSettings={
 google:{clientId:string;clientSecret:string};
 microsoft:{clientId:string;clientSecret:string;tenant:string};
};
const empty=():PlatformSettings=>({google:{clientId:'',clientSecret:''},microsoft:{clientId:'',clientSecret:'',tenant:''}});
const key='platform-settings';

export const platformSchema=z.object({
 google:z.object({clientId:z.string().max(300).optional(),clientSecret:z.string().max(300).optional()}).optional(),
 microsoft:z.object({clientId:z.string().max(300).optional(),clientSecret:z.string().max(300).optional(),tenant:z.string().max(120).optional()}).optional()
});

export async function platformSettings():Promise<PlatformSettings>{
 const stored=await getAuth<PlatformSettings>(key);
 const base=empty();
 if(!stored)return base;
 return {
  google:await openFields({...base.google,...stored.google},['clientSecret']),
  microsoft:await openFields({...base.microsoft,...stored.microsoft},['clientSecret'])
 };
}

export async function savePlatformSettings(input:unknown){
 const patch=platformSchema.parse(input);
 const current=await platformSettings();
 const next:PlatformSettings={
  google:{...current.google,...patch.google},
  microsoft:{...current.microsoft,...patch.microsoft}};
 await setAuth(key,{
  google:await sealFields(next.google,['clientSecret']),
  microsoft:await sealFields(next.microsoft,['clientSecret'])});
 return maskPlatform(next);
}

export function maskPlatform(s:PlatformSettings){
 const filled=(v:string)=>Boolean(v&&v.trim());
 return {
  google:{configured:filled(s.google.clientId)&&filled(s.google.clientSecret)},
  microsoft:{configured:filled(s.microsoft.clientId)&&filled(s.microsoft.clientSecret),tenant:s.microsoft.tenant||'common'},
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
