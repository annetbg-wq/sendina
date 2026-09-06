/** End-to-end tests against the real product: the built interface, the real API, the real
    operations layer and a real store, with only the model, the web search and platform mail
    stubbed. These are the checks that a button does something, not that a screen renders. */
import {defineConfig} from '@playwright/test';
const port=process.env.PRODUCT_PORT??'3210';
const origin=`http://127.0.0.1:${port}`;
export default defineConfig({testDir:'tests/product',workers:1,timeout:60000,
 use:{baseURL:origin,headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined},
 webServer:{command:'npm run build && npx tsx tests/product/harness.ts',
  url:`${origin}/api/health`,reuseExistingServer:false,timeout:180000,
  env:{PRODUCT_PORT:port}}});
