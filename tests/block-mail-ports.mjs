import {Socket} from 'node:net';

const blocked=new Set([465,587,993]);
const original=Socket.prototype.connect;

Socket.prototype.connect=function(...args){
 const first=args[0];
 const port=typeof first==='object'&&first!==null?Number(first.port):Number(first);
 if(blocked.has(port)){
  console.error(`[BLOCKED_MAIL_PORT] ${port}`);
  throw Object.assign(new Error(`Acceptance gate blocked outbound mail port ${port}`),{code:'ECONNREFUSED'});
 }
 return original.apply(this,args);
};
