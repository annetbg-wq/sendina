import assert from 'node:assert/strict';
import {messageText} from './smtpstub';

type Stub={inbox:{to:string;body:string}[]};
/** Signs an address in the way a person would: ask for a link, read the mail, follow it. */
export async function signIn(base:string,smtp:Stub,email:string){
 const asked=await fetch(`${base}/api/auth/request`,{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
 const body=await asked.json();
 assert.equal(body.status,'sent',`login for ${email}: ${JSON.stringify(body)}`);
 const delivered=smtp.inbox.filter(m=>m.to===email.toLowerCase()).pop();
 assert.ok(delivered,`no mail delivered to ${email}`);
 const link=messageText(delivered!.body).match(/(https?:\/\/\S*auth\/callback\S*)/)?.[1];
 assert.ok(link,`no login link in the mail to ${email}`);
 const redirected=await fetch(link!,{redirect:'manual'});
 assert.equal(redirected.status,302);
 const session=new URL(redirected.headers.get('location')!).hash.match(/session=([^&]+)/)?.[1];
 assert.ok(session,'the callback must hand back a session');
 return decodeURIComponent(session!);
}

/** Environment that gives a spawned server working platform mail and one known superadmin. */
export const platformEnv=(smtpPort:number,superadmin:string)=>({
 SUPERADMINS:superadmin,
 SYSTEM_SMTP_HOST:'127.0.0.1',SYSTEM_SMTP_PORT:String(smtpPort),
 SYSTEM_SMTP_USER:'platform@example.com',SYSTEM_SMTP_PASS:'stub',SYSTEM_MAIL_FROM:'platform@example.com'
});
