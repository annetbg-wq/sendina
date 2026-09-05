import {createServer,type Socket} from 'node:net';
/** A minimal SMTP server, so tests exercise the real platform-mail path instead of stubbing it away. */
export function smtpStub(port:number){
 const inbox:{to:string;body:string}[]=[];
 const server=createServer((socket:Socket)=>{
  let mode:'commands'|'data'|'auth-user'|'auth-pass'='commands';
  let to='',body='';
  socket.write('220 stub ESMTP\r\n');
  socket.on('data',chunk=>{
   for(const line of chunk.toString().split(/\r?\n/)){
    if(mode==='data'){
     if(line==='.'){inbox.push({to,body});body='';mode='commands';socket.write('250 queued\r\n');}
     else body+=line+'\n';
     continue;
    }
    if(mode==='auth-user'){mode='auth-pass';socket.write('334 UGFzc3dvcmQ6\r\n');continue;}
    if(mode==='auth-pass'){mode='commands';socket.write('235 accepted\r\n');continue;}
    if(!line)continue;
    const command=line.toUpperCase();
    if(command.startsWith('EHLO')||command.startsWith('HELO'))socket.write('250-stub\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
    else if(command.startsWith('AUTH LOGIN')){mode='auth-user';socket.write('334 VXNlcm5hbWU6\r\n');}
    else if(command.startsWith('AUTH PLAIN'))socket.write('235 accepted\r\n');
    else if(command.startsWith('MAIL FROM'))socket.write('250 OK\r\n');
    else if(command.startsWith('RCPT TO')){to=line.replace(/.*<|>.*/g,'').toLowerCase();socket.write('250 OK\r\n');}
    else if(command.startsWith('DATA')){mode='data';socket.write('354 send it\r\n');}
    else if(command.startsWith('QUIT')){socket.write('221 bye\r\n');socket.end();}
    else socket.write('250 OK\r\n');
   }
  });
  socket.on('error',()=>{});
 });
 return {server,inbox,listen:()=>new Promise<void>(r=>server.listen(port,'127.0.0.1',()=>r()))};
}

/** Nodemailer encodes the body, so tests decode it before looking for a link. */
export function messageText(raw:string){
 const separator='\n\n';
 const split=raw.indexOf(separator);
 const headers=split<0?'':raw.slice(0,split).toLowerCase();
 const body=split<0?raw:raw.slice(split+separator.length);
 if(headers.includes('base64'))return Buffer.from(body.replace(/\s/g,''),'base64').toString('utf8');
 if(headers.includes('quoted-printable'))
  return body.replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/gi,(_m,hex)=>String.fromCharCode(parseInt(hex,16)));
 return body;
}
