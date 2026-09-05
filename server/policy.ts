export function policy(input:{stopped:boolean;status:string;suppressed:boolean;replied:boolean;basis:string;verified:boolean;used:number;limit:number}){
 const reason=input.stopped?'EMERGENCY_STOP':input.status!=='active'?'CAMPAIGN_PAUSED':input.suppressed?'GLOBAL_SUPPRESSION':input.replied?'REPLY_RECEIVED':!input.basis?'LEGAL_BASIS_REQUIRED':!input.verified?'DOMAIN_UNVERIFIED':input.used>=input.limit?'DOMAIN_LIMIT':null;
 return {decision:reason?'block':'allow',reason:reason??'CHECKS_PASSED',version:'1.0',at:new Date().toISOString()};
}
