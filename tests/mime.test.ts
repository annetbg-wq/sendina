import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMime,deterministicMessageId,toBase64Url} from '../server/mime';

test('plain MIME contains encoded subject, stable Message-ID and optional reply headers',()=>{
 const input={from:'out@example.com',to:'buyer@example.net',subject:'Привет',text:'Текст',
  replyTo:'reply@example.com',inReplyTo:'<old@example.net>',references:['<a@example.net>','<old@example.net>']};
 const mime=buildMime(input);
 assert.match(mime,/Subject: =\?UTF-8\?B\?/);
 assert.match(mime,/Content-Type: text\/plain; charset=UTF-8/);
 assert.match(mime,/Reply-To: reply@example.com/);
 assert.match(mime,/In-Reply-To: <old@example.net>/);
 assert.match(mime,/References: <a@example.net> <old@example.net>/);
 const id=deterministicMessageId(input);
 assert.ok(mime.includes(`Message-ID: ${id}`));
 assert.equal(deterministicMessageId(input),id,'retrying the same semantic message keeps its RFC Message-ID');
});

test('HTML mail is multipart alternative and preserves both bodies',()=>{
 const mime=buildMime({from:'out@example.com',to:'buyer@example.net',subject:'Hello',text:'Plain body',html:'<p>HTML body</p>'});
 assert.match(mime,/multipart\/alternative/);
 const boundary=mime.match(/boundary="([^"]+)"/)?.[1];
 assert.ok(boundary);
 assert.equal((mime.match(new RegExp(`--${boundary}`,'g'))??[]).length,3);
 assert.ok(mime.includes(Buffer.from('Plain body').toString('base64')));
 assert.ok(mime.includes(Buffer.from('<p>HTML body</p>').toString('base64')));
});

test('header values cannot inject additional RFC headers',()=>{
 const mime=buildMime({from:'out@example.com\r\nBcc: victim@example.com',to:'buyer@example.net',subject:'Hi\r\nBcc: x@example.com',text:'Body'});
 assert.equal((mime.match(/^Bcc:/gm)??[]).length,0);
 assert.ok(!mime.includes('\r\nBcc:'));
});

test('Gmail raw payload is RFC822 encoded as base64url',()=>{
 const mime=buildMime({from:'out@example.com',to:'buyer@example.net',subject:'Hello',text:'Body'});
 const raw=toBase64Url(mime);
 assert.equal(Buffer.from(raw,'base64url').toString('utf8'),mime);
});
