/** Deadlines for anything that talks to a mail server.

    A wrong SMTP or IMAP host does not refuse a connection: it accepts the TCP handshake and then
    says nothing, so a check with no deadline of its own waits for the operating system to give up
    — minutes, sometimes never. The interface, which is only waiting for that call to return, shows
    a spinner the whole time. Every phase therefore carries its own limit and the whole check
    carries a second one, so a result always arrives and always names the step that failed. */

/** A phase that ran out of time. Carried as its own type so the caller can report the step and a
    reason code rather than a generic failure. */
export class PhaseTimeout extends Error{
 readonly code='TIMEOUT';
 constructor(readonly phase:string,readonly ms:number){
  super(`Шаг не ответил за ${Math.round(ms/1000)} с и был прерван.`);
 }
}

/** Nothing is left running past the deadline that the caller can still observe. The abort signal
    is for work that accepts one; the race is the backstop for libraries that do not. */
export async function withTimeout<T>(phase:string,ms:number,run:(signal:AbortSignal)=>Promise<T>):Promise<T>{
 if(ms<=0)throw new PhaseTimeout(phase,0);
 const controller=new AbortController();
 let timer:NodeJS.Timeout|undefined;
 const expiry=new Promise<never>((_resolve,reject)=>{
  timer=setTimeout(()=>{controller.abort();reject(new PhaseTimeout(phase,ms));},ms);
 });
 try{return await Promise.race([run(controller.signal),expiry]);}
 finally{clearTimeout(timer);}
}

/** The budget for a whole check. Each phase asks for what it wants and receives what is left, so
    four phases that each stay inside their own limit still cannot outlast the check as a whole. */
export type Budget={remaining:()=>number;spend:(want:number)=>number;expired:()=>boolean};
export const budget=(totalMs:number):Budget=>{
 const until=Date.now()+totalMs;
 const remaining=()=>Math.max(0,until-Date.now());
 return {remaining,spend:(want:number)=>Math.min(want,remaining()),expired:()=>remaining()<=0};
};

const number=(value:string|undefined,fallback:number)=>{
 const parsed=Number(value);
 return Number.isFinite(parsed)&&parsed>0?parsed:fallback;
};

/** Limits in one place, so the interface, the tests and the deployment all agree on them.
    They are deliberately short: a mail server that has not answered in this long is not going to. */
export const limits=()=>({
 /** One phase: an SMTP login, one send, an IMAP connect. */
 phase:number(process.env.MAIL_PHASE_TIMEOUT_MS,20000),
 /** Reading the test message back, which legitimately waits for delivery. */
 readback:number(process.env.MAIL_READBACK_TIMEOUT_MS,45000),
 /** All four phases together. The interface never waits longer than this. */
 total:number(process.env.MAIL_VERIFY_TIMEOUT_MS,100000)
});
