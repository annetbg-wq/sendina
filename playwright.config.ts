import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',workers:1,use:{baseURL:'http://127.0.0.1:5174',headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined},webServer:{command:'npm run dev',url:'http://127.0.0.1:5174',env:{PORT:'3101',VITE_PORT:'5174',VITE_API_PORT:'3101',DATA_DIR:'data/e2e'},reuseExistingServer:false,timeout:60000}});
