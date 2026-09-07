import type {State} from './seed';

/** Addresses of this campaign that also sit in another campaign of the workspace.

    A proposed recipient has no address yet, and two of those are not the same person written
    twice — they are two organisations nobody has found an address for. Counting them as repeats
    blocked every proposal with DUPLICATE_RECIPIENT, which hid the real reason it could not be
    sent to: that its source is not verified. An absent address is not an address.

    This lives on its own because both the preview and the send path decide with it, and the send
    path may not import the operations layer that imports the send path. */
export function duplicateEmails(s:State,campaignId:string){
 const mine=s.contacts.filter(c=>c.campaignId===campaignId&&c.email);
 const elsewhere=new Set(s.contacts.filter(c=>c.campaignId!==campaignId&&c.email).map(c=>c.email));
 const seen=new Set<string>(),repeated=new Set<string>();
 for(const c of mine){if(seen.has(c.email))repeated.add(c.email);seen.add(c.email);}
 return [...new Set([...mine.filter(c=>elsewhere.has(c.email)).map(c=>c.email),...repeated])];
}
