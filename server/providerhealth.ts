export type ProviderFailureClass='REAUTH_REQUIRED'|'RATE_LIMITED'|'RETRYABLE'|'PERMANENT'|'UNKNOWN';
export type StoredProviderFailure={class?:ProviderFailureClass;code?:string;at?:string};

const timestamp=(value:any)=>{const n=Date.parse(String(value?.at??''));return Number.isFinite(n)?n:0;};

/** A provider failure stays active until every mailbox proof has succeeded after that failure.
 * One fresh token refresh is not enough to erase evidence that sending or inbound sync is broken. */
export function currentProviderFailure(mailbox:any):StoredProviderFailure|undefined{
 const failure=mailbox?.lastProviderError as StoredProviderFailure|undefined;
 if(!failure)return undefined;
 const failureAt=timestamp(failure);
 if(!failureAt)return failure;
 const proofs=[mailbox?.auth,mailbox?.testSend,mailbox?.imap,mailbox?.incoming];
 const recovered=proofs.every(p=>p?.status==='ok'&&timestamp(p)>failureAt);
 return recovered?undefined:failure;
}

export function providerFailureBlocker(failure:StoredProviderFailure):string{
 switch(failure.class){
  case 'REAUTH_REQUIRED':return 'PROVIDER_REAUTH_REQUIRED';
  case 'RATE_LIMITED':return 'PROVIDER_RATE_LIMITED';
  case 'RETRYABLE':return 'PROVIDER_TEMPORARILY_UNAVAILABLE';
  case 'PERMANENT':return 'PROVIDER_ERROR';
  default:return 'PROVIDER_ERROR_UNKNOWN';
 }
}
