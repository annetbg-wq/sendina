export type Decision={decision:'allow'|'block';reason:string;version:string;at:string};
export type PolicyInput={
 stopped:boolean;status:string;suppressed:boolean;replied:boolean;
 /** Legal ground for contacting this recipient. */basis:string;
 /** The concrete, recipient-specific reason for writing. Without it a message is bulk mail. */contactReason:string;
 /** Set once the address and its source have been checked against real evidence. */sourceVerified:boolean;
 /** The address already appears in another campaign of this workspace. */duplicate:boolean;
 verified:boolean;used:number;limit:number;
};
/** A message without a recipient-specific reason is bulk mail, whatever else passes. */
export const isBulk=(contactReason:string)=>!contactReason.trim();
/** One ordered decision per recipient. The first failing check wins and names itself. */
export function policy(input:PolicyInput):Decision{
 const reason=
  input.stopped?'EMERGENCY_STOP':
  input.status!=='active'?'CAMPAIGN_PAUSED':
  input.suppressed?'GLOBAL_SUPPRESSION':
  input.replied?'REPLY_RECEIVED':
  input.duplicate?'DUPLICATE_RECIPIENT':
  !input.basis.trim()?'LEGAL_BASIS_REQUIRED':
  isBulk(input.contactReason)?'CONTACT_REASON_REQUIRED':
  !input.sourceVerified?'SOURCE_UNVERIFIED':
  !input.verified?'DOMAIN_UNVERIFIED':
  input.used>=input.limit?'DOMAIN_LIMIT':null;
 return {decision:reason?'block':'allow',reason:reason??'CHECKS_PASSED',version:'1.1',at:new Date().toISOString()};
}
