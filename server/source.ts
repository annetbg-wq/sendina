import {withTimeout,limits} from './timeout';

/** Changing Sendina's own source from a chat.

    The obvious reading of "let the connector edit the code" is: give it the server's filesystem.
    That reading does not work and is not safe. Railway runs a built image, so a file written into
    the container is gone at the next deploy and never reaches the history; and the process that
    would be writing sits next to the encryption key, the mailbox passwords and the provider
    refresh tokens. An editing tool there is remote code execution beside the secrets, in exchange
    for edits that do not survive.

    So these tools write to the repository instead. Every change becomes a commit on a branch and
    a pull request, which means it is reviewable, revertible, and — the part that actually matters
    — it passes through CI, where the whole suite runs before anything can reach main. The chat
    gets real editing power over the product; what it does not get is a way round the tests or a
    way into production without them.

    Two things are refused outright, and both for the same reason: they would remove the barrier
    that makes the rest of this safe. The workflow files cannot be edited, because they define the
    checks; and main cannot be written to directly, because a pull request is where the checks are
    applied. */

export type SourceConfig={token:string;owner:string;repo:string;base:string};

export function sourceConfig():SourceConfig{
 const repo=process.env.SOURCE_REPO??'annetbg-wq/sendina';
 const [owner,name]=repo.split('/');
 return {token:process.env.GITHUB_TOKEN??'',owner:owner??'',repo:name??'',
  base:process.env.SOURCE_BASE_BRANCH??'main'};
}
export const sourceReady=()=>{
 const c=sourceConfig();
 return Boolean(c.token&&c.owner&&c.repo);
};

const api=()=>process.env.GITHUB_API_URL??'https://api.github.com';

async function call(path:string,init:RequestInit={}){
 const c=sourceConfig();
 if(!c.token)throw Error('Правка исходного кода не настроена: администратор задаёт GITHUB_TOKEN и SOURCE_REPO.');
 const r=await withTimeout('github',limits().phase,signal=>fetch(`${api()}${path}`,{...init,signal,
  headers:{Accept:'application/vnd.github+json','Content-Type':'application/json',
   Authorization:`Bearer ${c.token}`,'X-GitHub-Api-Version':'2022-11-28',...(init.headers??{})}}));
 const text=await r.text();
 const data=text?JSON.parse(text):null;
 if(!r.ok)throw Error(`GitHub ответил ${r.status}: ${String(data?.message??text).slice(0,300)}`);
 return data;
}
const repoPath=(rest:string)=>{const c=sourceConfig();return `/repos/${c.owner}/${c.repo}${rest}`;};

/** A path that stays inside the repository and away from the checks themselves. */
export function safePath(path:string){
 const raw=String(path).trim();
 // An absolute path is refused rather than made relative: stripping the leading slash would turn
 // "/etc/passwd" into a path the rest of these checks happily accept.
 if(raw.startsWith('/'))throw Error('Путь должен быть внутри репозитория.');
 const clean=raw.replace(/^\.\//,'');
 if(!clean)throw Error('Укажите путь к файлу.');
 if(clean.includes('..'))throw Error('Путь должен быть внутри репозитория.');
 if(/^\.github\/workflows\//.test(clean))
  throw Error('Файлы CI менять нельзя: именно они прогоняют тесты, которые защищают main.');
 if(/(^|\/)\.git\//.test(clean))throw Error('Служебные файлы git менять нельзя.');
 return clean;
}
/** A branch name that is never the protected one, so a change always arrives as a pull request. */
export function safeBranch(branch:string){
 const clean=String(branch).trim().replace(/^refs\/heads\//,'');
 const c=sourceConfig();
 if(!/^[A-Za-z0-9._\/-]{1,100}$/.test(clean))throw Error('Недопустимое имя ветки.');
 // A name git would refuse anyway, and one that has no business being interpolated into a path.
 if(clean.includes('..')||clean.startsWith('/')||clean.endsWith('/'))throw Error('Недопустимое имя ветки.');
 if(clean===c.base)throw Error(`Писать напрямую в ${c.base} нельзя: изменения идут веткой и pull request, чтобы их проверил CI.`);
 return clean;
}

export async function listSource(path=''){
 const clean=path?safePath(path):'';
 const data=await call(repoPath(`/contents/${encodeURI(clean)}`));
 const rows=Array.isArray(data)?data:[data];
 return {path:clean,entries:rows.map((e:any)=>({path:e.path,type:e.type,size:e.size??0}))};
}

export async function readSource(path:string,ref?:string){
 const clean=safePath(path);
 const c=sourceConfig();
 const query=ref?`?ref=${encodeURIComponent(ref)}`:'';
 const data=await call(repoPath(`/contents/${encodeURI(clean)}${query}`));
 if(Array.isArray(data))throw Error('Это каталог, а не файл. Используйте list_source.');
 if(data.encoding!=='base64')throw Error('Файл не является текстовым.');
 return {path:clean,sha:data.sha,size:data.size,
  content:Buffer.from(data.content,'base64').toString('utf8'),
  branch:ref??c.base};
}

/** One commit for a set of files, through the git data API, so a change that touches four files
    is one change in the history rather than four unrelated ones. */
export async function writeSource(input:{branch:string;message:string;
 files:{path:string;content:string}[];from?:string}){
 const c=sourceConfig();
 const branch=safeBranch(input.branch);
 if(!input.files.length)throw Error('Не переданы файлы.');
 if(!input.message.trim())throw Error('Опишите изменение в message.');
 const files=input.files.map(f=>({path:safePath(f.path),content:String(f.content)}));

 // The branch grows from wherever it is now, or from the base branch the first time.
 const from=input.from??c.base;
 let parent:string;
 let existing=true;
 try{parent=(await call(repoPath(`/git/ref/heads/${encodeURIComponent(branch)}`))).object.sha;}
 catch{existing=false;parent=(await call(repoPath(`/git/ref/heads/${encodeURIComponent(from)}`))).object.sha;}

 const commit=await call(repoPath(`/git/commits/${parent}`));
 const blobs=await Promise.all(files.map(async f=>({path:f.path,mode:'100644',type:'blob',
  sha:(await call(repoPath('/git/blobs'),{method:'POST',
   body:JSON.stringify({content:Buffer.from(f.content,'utf8').toString('base64'),encoding:'base64'})})).sha})));
 const tree=await call(repoPath('/git/trees'),{method:'POST',
  body:JSON.stringify({base_tree:commit.tree.sha,tree:blobs})});
 const made=await call(repoPath('/git/commits'),{method:'POST',
  body:JSON.stringify({message:input.message,tree:tree.sha,parents:[parent]})});

 if(existing)await call(repoPath(`/git/refs/heads/${encodeURIComponent(branch)}`),
  {method:'PATCH',body:JSON.stringify({sha:made.sha})});
 else await call(repoPath('/git/refs'),{method:'POST',
  body:JSON.stringify({ref:`refs/heads/${branch}`,sha:made.sha})});

 return {branch,commit:made.sha,files:files.map(f=>f.path),
  note:'Изменение лежит в ветке. Откройте pull request, чтобы CI прогнал тесты.'};
}

export async function openPullRequest(input:{branch:string;title:string;body?:string}){
 const c=sourceConfig();
 const head=safeBranch(input.branch);
 const open=await call(repoPath(`/pulls?head=${encodeURIComponent(`${c.owner}:${head}`)}&state=open`));
 if(Array.isArray(open)&&open.length)
  return {number:open[0].number,url:open[0].html_url,branch:head,created:false};
 const pr=await call(repoPath('/pulls'),{method:'POST',
  body:JSON.stringify({title:input.title,head,base:c.base,body:input.body??''})});
 return {number:pr.number,url:pr.html_url,branch:head,created:true};
}

/** What CI said. This is the whole point of routing edits through the repository: a change is not
    "done" because it was written, it is done when the suite that guards the product agrees. */
export async function checksFor(ref:string){
 const runs=await call(repoPath(`/actions/runs?head_sha=${encodeURIComponent(ref)}&per_page=20`));
 const rows=(runs?.workflow_runs??[]).map((r:any)=>({name:r.name,status:r.status,
  conclusion:r.conclusion,url:r.html_url,at:r.created_at}));
 const done=rows.every((r:any)=>r.status==='completed');
 return {ref,runs:rows,
  complete:done&&rows.length>0,
  passing:rows.length>0&&rows.every((r:any)=>r.conclusion==='success'),
  note:rows.length?'':'Проверки ещё не запускались для этого коммита.'};
}

export async function pullRequestStatus(number:number){
 const pr=await call(repoPath(`/pulls/${number}`));
 const checks=await checksFor(pr.head.sha);
 return {number:pr.number,title:pr.title,state:pr.state,merged:Boolean(pr.merged),
  branch:pr.head.ref,sha:pr.head.sha,url:pr.html_url,
  mergeable:pr.mergeable,checks};
}

/** Merging is what deploys, so it happens only behind a green suite. A red or unfinished run is
    not something to be overridden from a chat: it is the answer. */
export async function mergePullRequest(number:number){
 const status=await pullRequestStatus(number);
 if(status.merged)return {...status,merged:true,note:'Этот pull request уже влит.'};
 if(!status.checks.complete)
  throw Error('Проверки ещё идут. Дождитесь их окончания — влить можно только зелёный pull request.');
 if(!status.checks.passing)
  throw Error('Проверки не прошли. Исправьте причину и обновите ветку: влить красный pull request нельзя.');
 const merged=await call(repoPath(`/pulls/${number}/merge`),{method:'PUT',
  body:JSON.stringify({merge_method:'squash'})});
 return {number,merged:Boolean(merged?.merged),sha:merged?.sha,
  note:'Влито в основную ветку. Развёртывание пойдёт само: GitHub Pages и Railway собираются из неё.'};
}
