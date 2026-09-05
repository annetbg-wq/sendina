import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:process.env.VITE_BASE??'/',server:{host:'127.0.0.1',port:Number(process.env.VITE_PORT??5173),strictPort:true,proxy:{'/api':`http://127.0.0.1:${process.env.VITE_API_PORT??3001}`}}});
