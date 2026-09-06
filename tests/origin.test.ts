import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {smtpStub} from './smtpstub';
import {signIn,platformEnv} from './session';

// Ports are fixed per test file so they can run in parallel. Taken: API 3102, 3103, 3105, 3106,
// 3108; stubs and SMTP 3192-3197, 3199. This file uses 3109 and 3191.

/** Every mutating route the interface can reach, read from the server itself so that a route
    added for a new button is covered without anyone remembering to list it here. */
async function mutationRoutes(){
 const source=await readFile(resolve('server/index.ts'),'utf8');
 return [...source.matchAll(/app\.post\('(\/api\/[^']+)'/g)].map(m=>m[1]);
}

/** The bug this guards against: the deployment refused its own address, so the interface
    could read everything and change nothing. A browser omits Origin on a same-origin GET and
    always sends it on a same-origin POST, which is why only the buttons failed. */
test('no mutating route refuses the origin it was served from',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-origin-'));
 const smtp=smtpStub(3191);
 await smtp.listen();
 const port='3109';
 const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['--import','tsx',resolve('server/index.ts')],{env:{...process.env,
  PORT:port,DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'test-platform-secret',
  // Deliberately empty, as on a real deployment that serves its own interface.
  ALLOWED_ORIGINS:'',PUBLIC_URL:base,APP_URL:base,
  OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',MCP_TOKEN:'',
  ...platformEnv(3191,'operator@example.com')},stdio:'pipe'});
 let logs='';child.stderr.on('data',d=>logs+=d);child.stdout.on('data',d=>logs+=d);
 try{
  let ready=false;
  for(let i=0;i<100;i++){try{await fetch(base+'/api/health');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(ready,logs);
  const token=await signIn(base,smtp,'operator@example.com');
  const call=(path:string,origin:string,body:unknown={})=>fetch(base+path,{method:'POST',
   headers:{'Content-Type':'application/json',Origin:origin,Authorization:`Bearer ${token}`},
   body:JSON.stringify(body)});

  // Real ids, so a route is exercised rather than rejected before the origin check matters.
  const campaign=await (await call('/api/campaigns',base,{name:'Origin regression',market:'Германия',
   goal:'Продажа услуги',context:'Реальная кампания для проверки источника запроса',event:'Встреча'})).json();
  assert.ok(campaign.id,`campaign was not created: ${JSON.stringify(campaign)}`);
  const domain=await (await call('/api/domains',base,{email:'sender@origin.example'})).json();

  // Behind a proxy the browser's address is in x-forwarded-*, and it is in no allowlist.
  // This is the deployment shape that actually broke: the API refused the page it had served.
  const proxied=(path:string)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',
   Origin:'https://sendina-production.up.railway.app','X-Forwarded-Proto':'https',
   'X-Forwarded-Host':'sendina-production.up.railway.app',
   Authorization:`Bearer ${token}`},body:'{}'});
  const behindProxy=await proxied('/api/campaigns');
  assert.notEqual(behindProxy.status,403,'the API refused the very address it served the page from');

  const routes=await mutationRoutes();
  assert.ok(routes.length>15,`expected the interface to have many mutating routes, found ${routes.length}`);
  const failures:string[]=[];
  for(const route of routes){
   const path=route.replace(':id',route.includes('/domains/')?domain.id:campaign.id);
   for(const origin of [base,'http://127.0.0.1:5173']){
    const r=await call(path,origin);
    const text=await r.text();
    if(r.status===403||text.includes('Недопустимый источник запроса'))
     failures.push(`${path} from ${origin}: ${r.status} ${text.slice(0,120)}`);
   }
  }
  assert.deepEqual(failures,[],'mutating routes refused their own origin');

  // A genuinely foreign origin is still refused: the fix widens nothing it should not.
  const foreign=await call('/api/campaigns','https://evil.example');
  assert.equal(foreign.status,403);
  assert.match((await foreign.json()).error,/Недопустимый источник/);

  // A read carries no Origin at all and must keep working.
  assert.equal((await fetch(base+'/api/state',{headers:{Authorization:`Bearer ${token}`}})).status,200);
 }finally{child.kill();smtp.server.close();}
});
