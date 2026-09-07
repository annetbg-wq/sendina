import {mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {infrastructure,mailbox,mailProvider,dnsRecords} from './stubs';

/** Boots the real application against stubbed model, search and platform mail, so the browser
    tests drive the product itself: the same operations layer, the same policy, the same store. */

const port=process.env.PRODUCT_PORT??'3210';
const stubPort=Number(process.env.PRODUCT_STUB_PORT??3211);
const smtpPort=Number(process.env.PRODUCT_SMTP_PORT??3212);
const providerPort=Number(process.env.PRODUCT_PROVIDER_PORT??3220);
const dnsPort=Number(process.env.PRODUCT_DNS_PORT??3221);
const dir=resolve('data/product');
const base=`http://127.0.0.1:${port}`;

rmSync(dir,{recursive:true,force:true});
mkdirSync(dir,{recursive:true});

await new Promise<void>(r=>infrastructure(stubPort).listen(stubPort,'127.0.0.1',()=>r()));
await mailbox(smtpPort,resolve(dir,'inbox.jsonl')).listen();
const provider=mailProvider(providerPort);
await new Promise<void>(r=>provider.server.listen(providerPort,'127.0.0.1',()=>r()));
await new Promise<void>(r=>dnsRecords(dnsPort).listen(dnsPort,'127.0.0.1',()=>r()));

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
 SEARCH_BASE_URL:`http://127.0.0.1:${stubPort}/search`,
 // Short deadlines so a browser test that deliberately connects to a dead host finishes quickly.
 // What is being tested is that the check ends at all, not how long it is willing to wait.
 MAIL_PHASE_TIMEOUT_MS:'2000',MAIL_READBACK_TIMEOUT_MS:'2000',MAIL_VERIFY_TIMEOUT_MS:'9000',
 VERIFY_ATTEMPTS:'2',VERIFY_DELAY_MS:'100',
 // A mailbox that can be connected and can actually send, so the send path is reachable from a
 // browser test. The allow list is the same fence a controlled live test runs behind.
 MAIL_PROVIDER_BASE_URL:`http://127.0.0.1:${providerPort}`,
 DNS_TXT_BASE_URL:`http://127.0.0.1:${dnsPort}`,
 SENDING_ENABLED:'1',SEND_ALLOWLIST:'buyer@ours.example',SEND_MAX_PER_RUN:'10'
});

await import('../../server/index');

// The platform provides the model and the search, exactly as it does in production, so no test
// user is ever asked for a key.
const {savePlatformSettings}=await import('../../server/platform');
await savePlatformSettings({openaiKey:'product-test-key',openaiModel:'stub-model',
 aiGatewayUrl:`http://127.0.0.1:${stubPort}`,searchProvider:'serper',searchKey:'product-search-key',
 google:{clientId:'platform-client',clientSecret:'platform-secret'}});
console.log('[product] harness ready');
