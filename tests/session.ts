import assert from 'node:assert/strict';

/** Every test file spawns its own server, so ports are allocated by hand and must not collide.
    APIs: api 3102, core 3103, connect 3105, accounts 3106, scenarios 3108, origin 3109,
    connector 3110, product harness 3210.
    Stubs and SMTP: 3189 connector mail, 3190 connector model, 3191 origin mail, 3192 scenarios
    mail, 3193 scenarios stub, 3194 api mail, 3195 core mail, 3196 connect mail, 3197 accounts
    mail, 3198 connect provider stub, 3199 core stub, 3211/3212 product stub and mail. */
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
