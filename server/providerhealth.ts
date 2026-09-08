export type ProviderFailureClass='REAUTH_REQUIRED'|'RATE_LIMITED'|'RETRYABLE'|'PERMANENT'|'UNKNOWN';
export type StoredProviderFailure={class?:ProviderFailureClass;code?:string;at?:string};

const timestamp=(value:any)=>{const n=Date.parse(String(value?.at??''));return Number.isFinite(n)?n:0;};

/** A provider failure normally stays active until every mailbox proof has succeeded after it.
 * REAUTH_REQUIRED is different: a successful OAuth reconnect creates a newer credential generation,
 * so the old revoked-token error no longer describes the credential now stored. Fresh proof gating
 * still keeps that new connection in CONNECTING until it proves send/read health. */
export function currentProviderFailure(mailbox:any):StoredProviderFailure|undefined{
 const failure=mailbox?.lastProviderError as StoredProviderFailure|undefined;
 if(!failure)return undefined;
 const failureAt=timestamp(failure);
 if(!failureAt)return failure;
 const connectedAt=timestamp(mailbox?.connectedAt);
 if(failure.class==='REAUTH_REQUIRED'&&connectedAt>failureAt)return undefined;
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
