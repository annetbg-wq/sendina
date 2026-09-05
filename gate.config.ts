/** The sign-in screen and the demo fallback only exist in a production build, so this
    config builds the app against a real API and serves both from Express. */
import {defineConfig} from '@playwright/test';
const port=process.env.GATE_PORT??'3104';
const origin=`http://127.0.0.1:${port}`;
export default defineConfig({testDir:'tests/gate',workers:1,
 use:{baseURL:origin,headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined},
 webServer:{command:'npm run build && npm start',url:`${origin}/api/health`,reuseExistingServer:false,timeout:180000,
  env:{PORT:port,APP_TOKEN:'test-token-123',DATA_DIR:'data/gate',ALLOWED_ORIGINS:origin,
   VITE_API_URL:origin,VITE_BASE:'/',PUBLIC_URL:origin,APP_URL:origin,
   SUPERADMINS:'boss@example.com',SYSTEM_SMTP_HOST:'',SYSTEM_SMTP_USER:'',SYSTEM_SMTP_PASS:''}}});
