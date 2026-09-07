import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {safePath,safeBranch,sourceReady,listSource,readSource,writeSource,
 checksFor,mergePullRequest,pullRequestStatus} from '../server/source';

/** Editing Sendina from a chat.

    The tools themselves are thin wrappers over the GitHub API; what is worth testing is the
    barrier around them, because that barrier is the only reason handing a chat write access to
    the product is a reasonable thing to do. Three properties:

    the base branch cannot be written to, so every change arrives as a pull request;
    the workflow files cannot be edited, so the checks cannot be edited away;
    a pull request cannot be merged while its checks are unfinished or failing, so a red suite
    stops a deploy rather than being something to argue with. */

test('the branch the deploy comes from can never be written to directly',()=>{
 // A change reaches main by passing the tests, and by no other route.
 assert.throws(()=>safeBranch('main'),/pull request/i);
 assert.throws(()=>safeBranch('refs/heads/main'),/pull request/i);
 // Working branches are ordinary.
 assert.equal(safeBranch('fix/connect-screen'),'fix/connect-screen');
 assert.equal(safeBranch('refs/heads/fix/connect-screen'),'fix/connect-screen');
 // Nothing that could be read as something other than a branch name.
 for(const bad of ['','a b','../../etc','feature;rm -rf','x'.repeat(200)])
  assert.throws(()=>safeBranch(bad),`"${bad}" must be refused`);
});

test('the checks cannot be edited away by the thing they are checking',()=>{
 // Being able to rewrite the workflow would make every other guarantee here decorative.
 assert.throws(()=>safePath('.github/workflows/ci.yml'),/CI/);
 assert.throws(()=>safePath('./.github/workflows/pages.yml'),/CI/);
 assert.throws(()=>safePath('.git/config'),/git/i);
 // And nothing outside the repository at all.
 for(const bad of ['../secrets','/etc/passwd','server/../../x',''])
  assert.throws(()=>safePath(bad),`"${bad}" must be refused`);
 // Ordinary source files are fine, with or without a leading ./
 assert.equal(safePath('src/main.tsx'),'src/main.tsx');
 assert.equal(safePath('./server/send.ts'),'server/send.ts');
 // A workflow file that is not in the workflow directory is just a file.
 assert.equal(safePath('.github/dependabot.yml'),'.github/dependabot.yml');
});

test('without a token the tools say so instead of half working',async()=>{
 const before=process.env.GITHUB_TOKEN;
 delete process.env.GITHUB_TOKEN;
 try{
  assert.equal(sourceReady(),false);
  await assert.rejects(()=>listSource(''),/GITHUB_TOKEN/);
  await assert.rejects(()=>readSource('src/main.tsx'),/GITHUB_TOKEN/);
 }finally{if(before!==undefined)process.env.GITHUB_TOKEN=before;}
});

/** A stand-in for GitHub: enough of the API for the guards to be exercised for real. */
function github(port:number){
 const state={merged:false,conclusion:'success' as string|null,status:'completed'};
 const server=createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);
  req.on('end',()=>{
   const url=req.url??'';
   res.setHeader('Content-Type','application/json');
   const send=(data:any,code=200)=>{res.statusCode=code;res.end(JSON.stringify(data));};
   if(url.includes('/actions/runs'))
    return send({workflow_runs:[{name:'CI',status:state.status,conclusion:state.conclusion,
     html_url:'https://example/run',created_at:'2026-09-07T00:00:00Z'}]});
   if(/\/pulls\/\d+\/merge$/.test(url)){state.merged=true;return send({merged:true,sha:'merged-sha'});}
   if(/\/pulls\/\d+$/.test(url))
    return send({number:7,title:'Fix',state:'open',merged:state.merged,mergeable:true,
     head:{ref:'fix/x',sha:'head-sha'},html_url:'https://example/pr/7'});
   if(url.includes('/contents/'))
    return send({encoding:'base64',sha:'file-sha',size:3,
     content:Buffer.from('hi\n').toString('base64')});
   if(url.includes('/git/refs/heads/'))return send({object:{sha:'new-commit'}});
   if(url.includes('/git/ref/heads/'))return send({object:{sha:'base-sha'}});
   if(url.includes('/git/commits/'))return send({tree:{sha:'tree-sha'}});
   if(url.endsWith('/git/blobs'))return send({sha:'blob-sha'});
   if(url.endsWith('/git/trees'))return send({sha:'new-tree'});
   if(url.endsWith('/git/commits'))return send({sha:'new-commit'});
   if(url.endsWith('/git/refs'))return send({ref:'refs/heads/fix/x'});
   send({message:'not found'},404);
  });
 });
 return {server,state};
}

test('a change becomes a commit on a branch, and a red suite stops the deploy',async()=>{
 const stub=github(3222);
 await new Promise<void>(r=>stub.server.listen(3222,'127.0.0.1',r));
 const before={api:process.env.GITHUB_API_URL,token:process.env.GITHUB_TOKEN,repo:process.env.SOURCE_REPO};
 process.env.GITHUB_API_URL='http://127.0.0.1:3222';
 process.env.GITHUB_TOKEN='stub-token';
 process.env.SOURCE_REPO='annetbg-wq/sendina';
 try{
  assert.equal(sourceReady(),true);

  // Reading is ordinary.
  const file=await readSource('src/main.tsx');
  assert.equal(file.content,'hi\n');
  assert.equal(file.path,'src/main.tsx');

  // Writing lands on a branch, as one commit for the whole set of files.
  const written=await writeSource({branch:'fix/x',message:'Fix the connect screen',
   files:[{path:'src/main.tsx',content:'a'},{path:'src/i18n.tsx',content:'b'}]});
  assert.equal(written.branch,'fix/x');
  assert.equal(written.commit,'new-commit');
  assert.deepEqual(written.files,['src/main.tsx','src/i18n.tsx']);
  assert.match(written.note,/pull request/i,'and it says the change is not finished until CI has run');

  // The guards hold against the live API too, not only as string checks.
  await assert.rejects(()=>writeSource({branch:'main',message:'straight to production',
   files:[{path:'src/main.tsx',content:'x'}]}),/pull request/i);
  await assert.rejects(()=>writeSource({branch:'fix/x',message:'disable the tests',
   files:[{path:'.github/workflows/ci.yml',content:'jobs: {}'}]}),/CI/);

  // A run that has not finished is not a green light.
  stub.state.status='in_progress';stub.state.conclusion=null;
  const running=await checksFor('head-sha');
  assert.equal(running.complete,false);
  assert.equal(running.passing,false);
  await assert.rejects(()=>mergePullRequest(7),/Дождитесь/);

  // Neither is a run that failed. This is the case that matters: a chat cannot merge past it.
  stub.state.status='completed';stub.state.conclusion='failure';
  const failed=await pullRequestStatus(7);
  assert.equal(failed.checks.complete,true);
  assert.equal(failed.checks.passing,false);
  await assert.rejects(()=>mergePullRequest(7),/не прошли/);
  assert.equal(stub.state.merged,false,'nothing was merged while the suite was red');

  // Green, and only then, it merges — which is what deploys.
  stub.state.conclusion='success';
  const merged=await mergePullRequest(7);
  assert.equal(merged.merged,true);
  assert.equal(stub.state.merged,true);
  assert.match(merged.note,/Развёртывание/);
 }finally{
  stub.server.close();
  process.env.GITHUB_API_URL=before.api??'';
  if(before.token===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=before.token;
  if(before.repo===undefined)delete process.env.SOURCE_REPO;else process.env.SOURCE_REPO=before.repo;
  if(!before.api)delete process.env.GITHUB_API_URL;
 }
});
