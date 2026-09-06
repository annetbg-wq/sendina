import {mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {infrastructure,mailbox} from './stubs';

/** Boots the real application against stubbed model, search and platform mail, so the browser
    tests drive the product itself: the same operations layer, the same policy, the same store. */

const port=process.env.PRODUCT_PORT??'3210';
const stubPort=Number(process.env.PRODUCT_STUB_PORT??3211);
const smtpPort=Number(process.env.PRODUCT_SMTP_PORT??3212);
const dir=resolve('data/product');
const base=`http://127.0.0.1:${port}`;

rmSync(dir,{recursive:true,force:true});
mkdirSync(dir,{recursive:true});

await new Promise<void>(r=>infrastructure(stubPort).listen(stubPort,'127.0.0.1',()=>r()));
await mailbox(smtpPort,resolve(dir,'inbox.jsonl')).listen();

Object.assign(process.env,{
 PORT:port,HOST:'127.0.0.1',DATA_DIR:dir,DATABASE_URL:'',
 APP_TOKEN:'product-e2e-secret',PUBLIC_URL:base,APP_URL:base,
 // Deliberately empty: the deployment must accept the origin it serves the interface from.
 ALLOWED_ORIGINS:'',
 OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',MCP_TOKEN:'product-mcp-token',
 MCP_ACCOUNT_EMAIL:'boss@example.com',
 SUPERADMINS:'boss@example.com',
 SYSTEM_SMTP_HOST:'127.0.0.1',SYSTEM_SMTP_PORT:String(smtpPort),
 SYSTEM_SMTP_USER:'platform@example.com',SYSTEM_SMTP_PASS:'stub',SYSTEM_MAIL_FROM:'platform@example.com',
 SEARCH_BASE_URL:`http://127.0.0.1:${stubPort}/search`
});

await import('../../server/index');

// The platform provides the model and the search, exactly as it does in production, so no test
// user is ever asked for a key.
const {savePlatformSettings}=await import('../../server/platform');
await savePlatformSettings({openaiKey:'product-test-key',openaiModel:'stub-model',
 aiGatewayUrl:`http://127.0.0.1:${stubPort}`,searchProvider:'serper',searchKey:'product-search-key'});
console.log('[product] harness ready');
