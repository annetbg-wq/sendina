export type CursorLike={provider:string;value:string}|null;

export type MailboxSyncSnapshot={
 provider:string;
 connection:string;
 connectedAt:string|null;
 cursor:CursorLike;
};

const normalizedCursor=(value:any,provider:string):CursorLike=>{
 const stored=value?.incomingCursor;
 if(stored?.provider&&stored?.value!=null)return {provider:String(stored.provider),value:String(stored.value)};
 const legacy=Number(value?.incomingUid??0);
 return legacy>0?{provider,value:String(legacy)}:null;
};

export function mailboxSyncSnapshot(mailbox:any,provider:string):MailboxSyncSnapshot{
 return {
  provider:String(mailbox?.provider??provider),
  connection:String(mailbox?.connection??'none'),
  connectedAt:mailbox?.connectedAt?String(mailbox.connectedAt):null,
  cursor:normalizedCursor(mailbox,provider)
 };
}

export function sameCursor(a:CursorLike,b:CursorLike){
 if(!a||!b)return a===b;
 return a.provider===b.provider&&a.value===b.value;
}

/**
 * A batch fetched with an older credential generation must never mutate a mailbox that has since
 * been reconnected. For the same generation, stale parallel readers may still apply deduplicated
 * messages, but only the reader whose expected cursor still matches may advance the cursor.
 */
export function inboundCommitGuard(before:MailboxSyncSnapshot,current:any,provider:string){
 const now=mailboxSyncSnapshot(current,provider);
 const sameGeneration=before.provider===now.provider&&
  before.connection===now.connection&&before.connectedAt===now.connectedAt;
 return {
  applyMessages:sameGeneration,
  advanceCursor:sameGeneration&&sameCursor(before.cursor,now.cursor),
  currentCursor:now.cursor
 };
}
