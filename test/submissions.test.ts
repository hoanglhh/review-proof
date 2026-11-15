import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSubmission} from '../src/submissions.ts';
const good=()=>new URLSearchParams({repository:'/tmp/repo',base:'main',head:'feature',requirementId:'REQ-X',requirement:'Return zero for empty input.',owner:'A Person',profile:'inspection-only'});
test('submission rejects command-like revisions, unsafe repositories, missing ownership and untrusted profiles',()=>{
  assert.deepEqual(validateSubmission(good(), ['inspection-only']),[]);
  for(const [key,values] of Object.entries({repository:['-x','ssh://evil/repo','https://user:token@github.com/a/b','https://github.com/a/b?token=x'],base:['--upload-pack=evil','HEAD;touch x',''],head:['$(evil)','bad\nref'],owner:[''],requirement:[''],profile:['../../etc/passwd','untrusted']})) {
    for(const value of values){const f=good();f.set(key,value);assert.ok(validateSubmission(f,['inspection-only']).length,`${key}=${value}`);}
  }
  const f=good();f.append('head','other');assert.ok(validateSubmission(f,['inspection-only']).length);
});

test('form submits a real unseen diff, streams stage logs and registers the report without editing fixtures',async()=>{
  const {cpSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync}=await import('node:fs');
  const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {execFileSync,spawnSync}=await import('node:child_process');
  const root=join(import.meta.dirname,'..'),fixture=mkdtempSync(join(tmpdir(),'review-submit-'));
  try{
    cpSync(join(root,'src'),join(fixture,'src'),{recursive:true});cpSync(join(root,'profiles'),join(fixture,'profiles'),{recursive:true});
    for(const file of ['package.json','policy.json'])cpSync(join(root,file),join(fixture,file));
    writeFileSync(join(fixture,'cases.json'),JSON.stringify({cases:[]}));symlinkSync(join(root,'node_modules'),join(fixture,'node_modules'));
    const repo=join(fixture,'a','b');mkdirSync(repo,{recursive:true});const git=(args:string[],cwd=repo)=>execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@invalid',...args],{cwd,encoding:'utf8'}).trim();
    git(['init','-q','-b','main']);writeFileSync(join(repo,'calc.ts'),'export function emptyCount() { return 0; }\n');git(['add','.']);git(['commit','-qm','base']);git(['checkout','-qb','feature']);writeFileSync(join(repo,'calc.ts'),'export function emptyCount() { return 1; }\n');git(['commit','-qam','change']);
    const repo2=join(fixture,'a__b');mkdirSync(repo2);git(['init','-q','-b','main'],repo2);writeFileSync(join(repo2,'calc.ts'),'export function emptyCount() { return 2; }\n');git(['add','.'],repo2);git(['commit','-qm','other base'],repo2);git(['checkout','-qb','feature'],repo2);writeFileSync(join(repo2,'calc.ts'),'export function emptyCount() { return 3; }\n');git(['commit','-qam','other change'],repo2);
    writeFileSync(join(fixture,'check.mjs'),`
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {startServer} from './src/server.ts';
const fake=createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const request=JSON.parse(text);assert.match(request.messages[1].content,/return 1/);
const output={requirements:[{id:'R1',text:'Return zero for an empty input.',quote:'Return zero for an empty input.',kind:'explicit'}],claims:[{id:'C1',statement:'The implementation returns one.',requirementIds:['R1'],evidenceIds:[],testNames:[],hunkIds:['H1'],citations:[{file:'calc.ts',at:'head',startLine:1,endLine:1,quote:'return 1;'}]}],decisions:[],findings:[{id:'F1',statement:'Returning one conflicts with the supplied requirement.',hunkIds:['H1'],citations:[{file:'calc.ts',at:'head',startLine:1,endLine:1,quote:'return 1;'}]}],cannotDecide:[{item:'Executable verification',reason:'No tests configured.'}]};res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}));});
await new Promise(r=>fake.listen(0,'127.0.0.1',r));const modelPort=fake.address().port;
writeFileSync('.env','OPENAI_BASE_URL=http://127.0.0.1:'+modelPort+'/v1\\nOPENAI_API_KEY=synthetic-fixture\\nREVIEWPROOF_MODEL=mock-fixture\\n');
const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const server=startServer(port);await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+port;
try{
  assert.match(await(await fetch(url+'/assess')).text(),/Start assessment/);
  const form=new URLSearchParams({repository:${JSON.stringify(repo)},base:'main',head:'feature',requirement:'Return zero for an empty input.',owner:'Fixture owner',profile:'inspection-only'});
  assert.equal((await fetch(url+'/assess',{method:'POST',headers:{origin:'https://other.example'},body:form})).status,403);
  const response=await fetch(url+'/assess',{method:'POST',headers:{origin:url},body:form,redirect:'manual'});assert.equal(response.status,303);const path=response.headers.get('location');assert.match(path,/^\\/assess\\/submission-/);
  let job=await(await fetch(url+path+'/status')).json();assert.equal(job.status,'running');
  const concurrent=await fetch(url+'/assess',{method:'POST',headers:{origin:url},body:form,redirect:'manual'});assert.equal(concurrent.status,409);
  for(let attempt=0;attempt<150&&job.status==='running';attempt++){await new Promise(r=>setTimeout(r,100));job=await(await fetch(url+path+'/status')).json();}
  assert.equal(job.status,'completed',JSON.stringify(job));for(const stage of ['ingest','check','review','assemble'])assert.ok(job.log.includes('Starting '+stage));
  const report=JSON.parse(readFileSync('data/cases/'+job.id+'/report.json'));assert.equal(report.inventory.totals.files,1);assert.match(report.hunks[0].added.join(' '),/return 1/);assert.equal(report.findings.length,1);assert.equal(report.reviewer.status,'ok');assert.equal(report.case.base.length,40);assert.equal(report.route.areas[0].owner,'Fixture owner');assert.match(report.route.areas[0].area,/^repository-[a-f0-9]{16}/);assert.match(report.case.repository,/submission-repos/);const registered=JSON.parse(readFileSync('data/submissions/'+job.id+'/case.json'));assert.equal(registered.sourceRepository,${JSON.stringify(repo)});assert.ok(report.notChecked.some(x=>/No trusted executable/.test(x.reason)));
  assert.deepEqual(JSON.parse(readFileSync('cases.json')),{cases:[]});assert.equal(existsSync('data/trust'),false);assert.equal(existsSync('data/cases/'+job.id+'/signoffs'),false);
  assert.equal((await fetch(url+'/case/'+job.id)).status,200);assert.match(await(await fetch(url+'/')).text(),/User submission/);assert.match(await(await fetch(url+path)).text(),/Open assessment report/);
  assert.equal((await fetch(url+'/assess/not-a-job/status')).status,404);
  writeFileSync('.env','');form.set('repository',${JSON.stringify(repo2)});
  const other=await fetch(url+'/assess',{method:'POST',headers:{origin:url},body:form,redirect:'manual'});let otherJob;
  for(let attempt=0;attempt<150;attempt++){otherJob=await(await fetch(url+other.headers.get('location')+'/status')).json();if(otherJob.status!=='running')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(otherJob.status,'completed',JSON.stringify(otherJob));const otherReport=JSON.parse(readFileSync('data/cases/'+otherJob.id+'/report.json'));assert.match(otherReport.hunks[0].added.join(' '),/return 3/);assert.notEqual(otherReport.case.head,report.case.head);assert.notEqual(otherReport.case.repository,report.case.repository);assert.notEqual(otherReport.route.areas[0].area,report.route.areas[0].area);assert.equal(otherReport.reviewer.status,'unavailable');
  form.set('head','missing-ref');const failed=await fetch(url+'/assess',{method:'POST',headers:{origin:url},body:form,redirect:'manual'});let failure;
  for(let attempt=0;attempt<100;attempt++){failure=await(await fetch(url+failed.headers.get('location')+'/status')).json();if(failure.status!=='running')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(failure.status,'failed');assert.match(failure.error,/not found/);assert.equal(existsSync('data/submissions/'+failure.id+'/case.json'),false);
}finally{server.close();fake.close();}
`);
    const result=spawnSync(process.execPath,[join(fixture,'check.mjs')],{cwd:fixture,encoding:'utf8',timeout:25000});assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  }finally{rmSync(fixture,{recursive:true,force:true});}
});
