import {createHash,randomBytes} from 'node:crypto';

export type MimeMessage={from:string;to:string;subject:string;text:string;html?:string;replyTo?:string;messageId?:string;inReplyTo?:string;references?:string[]};

const encodedWord=(value:string)=>`=?UTF-8?B?${Buffer.from(value,'utf8').toString('base64')}?=`;
const b64=(value:string)=>Buffer.from(value,'utf8').toString('base64').replace(/.{1,76}/g,'$&\r\n').trimEnd();
const cleanHeader=(value:string)=>value.replace(/[\r\n]+/g,' ').trim();

/** Stable enough for retry/reconciliation when the caller supplies the same semantic message. */
export function deterministicMessageId(input:Pick<MimeMessage,'from'|'to'|'subject'|'text'>){
 const domain=input.from.split('@')[1]?.toLowerCase()||'sendina.local';
 const hash=createHash('sha256').update(`${input.from.toLowerCase()}\n${input.to.toLowerCase()}\n${input.subject}\n${input.text}`).digest('hex').slice(0,32);
 return `<sendina-${hash}@${domain}>`;
}

export function buildMime(input:MimeMessage){
 const messageId=cleanHeader(input.messageId||deterministicMessageId(input));
 const headers=[
  `From: ${cleanHeader(input.from)}`,
  `To: ${cleanHeader(input.to)}`,
  `Subject: ${encodedWord(input.subject)}`,
  `Message-ID: ${messageId}`,
  ...(input.replyTo?[`Reply-To: ${cleanHeader(input.replyTo)}`]:[]),
  ...(input.inReplyTo?[`In-Reply-To: ${cleanHeader(input.inReplyTo)}`]:[]),
  ...(input.references?.length?[`References: ${input.references.map(cleanHeader).join(' ')}`]:[]),
  'MIME-Version: 1.0'
 ];
 if(!input.html){
  return [...headers,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',b64(input.text)].join('\r\n');
 }
 const boundary=`sendina-${randomBytes(12).toString('hex')}`;
 return [...headers,`Content-Type: multipart/alternative; boundary="${boundary}"`,'',
  `--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',b64(input.text),'',
  `--${boundary}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',b64(input.html),'',
  `--${boundary}--`,''].join('\r\n');
}

export const toBase64Url=(mime:string)=>Buffer.from(mime,'utf8').toString('base64url');
