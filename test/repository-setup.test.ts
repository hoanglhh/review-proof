import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateSetupInput} from '../src/repository-setup.ts';
test('setup input allows a pinned source only and never accepts commands',()=>{
  const f=()=>new URLSearchParams({repository:'/tmp/repo',revision:'main'});
  assert.deepEqual(validateSetupInput(f()),[]);
  for(const [key,value] of [['repository','https://user:token@github.com/a/b'],['revision','--evil'],['revision','x;touch y'],['command','npm run malicious']]) {const input=f();input.set(key,value);assert.ok(validateSetupInput(input).length);}
});

test('failed or unavailable setup checks block signing independently of AI links',async()=>{
 const {gateSetupReport}=await import('../src/setup-gate.ts');
 for(const status of ['failed','not_run','inconclusive']){
  const report:any={evidence:[{id:'repository-setup-overall',check:'repository-setup',status}],route:{effectiveRoute:'light',evidenceRoute:'light',reasons:[],readRatio:0,ifUnblocked:null}};
  const gated=gateSetupReport(report);assert.equal(gated.route.effectiveRoute,'blocked');assert.equal(report.route.effectiveRoute,'light');assert.equal(gated.route.reasons[0].code,'repository-verification');
 }
 const report:any={evidence:[{id:'repository-setup-overall',check:'repository-setup',status:'passed'}],route:{effectiveRoute:'full'}};
 assert.equal(gateSetupReport(report),report);
});

test('automatic setup requires human plan trust, reuses verified commands and invalidates changed configuration',async()=>{
 const {cpSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,chmodSync}=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {spawnSync,execFileSync}=await import('node:child_process');
 const root=join(import.meta.dirname,'..'),fixture=mkdtempSync(join(tmpdir(),'review-setup-flow-'));
 try{
  cpSync(join(root,'src'),join(fixture,'src'),{recursive:true});cpSync(join(root,'profiles'),join(fixture,'profiles'),{recursive:true});for(const f of ['package.json','policy.json'])cpSync(join(root,f),join(fixture,f));writeFileSync(join(fixture,'cases.json'),'{"cases":[]}');symlinkSync(join(root,'node_modules'),join(fixture,'node_modules'));
  const repo=join(fixture,'input');mkdirSync(repo);const git=(args:string[])=>execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@invalid',...args],{cwd:repo,encoding:'utf8'}).trim();git(['init','-qb','main']);
  const pkg={name:'fixture',version:'1.0.0',engines:{node:'22'},scripts:{test:'node --test'}};writeFileSync(join(repo,'package.json'),JSON.stringify(pkg));writeFileSync(join(repo,'package-lock.json'),JSON.stringify({name:'fixture',version:'1.0.0',lockfileVersion:3,packages:{'':{name:'fixture',version:'1.0.0'}}}));writeFileSync(join(repo,'calc.js'),'export const count=0;\n');git(['add','.']);git(['commit','-qm','base']);git(['checkout','-qb','feature']);writeFileSync(join(repo,'calc.js'),'export const count=1;\n');git(['commit','-qam','change']);git(['checkout','-qb','config-change']);writeFileSync(join(repo,'package.json'),JSON.stringify({...pkg,scripts:{test:'node --test --test-reporter=spec'}}));git(['commit','-qam','config']);
  mkdirSync(join(fixture,'bin'));const fake=`#!${process.execPath}\nimport fs from 'node:fs';const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(join(fixture,'docker-calls.jsonl'))},JSON.stringify(a)+'\\n');if(a[0]==='image'){console.log(JSON.stringify(['node@sha256:'+'a'.repeat(64)]));}else if(a[0]==='run'){console.log('Synthetic Docker fixture command outcome');if(fs.existsSync(${JSON.stringify(join(fixture,'fail-check'))})&&a.includes('none'))process.exit(1);}else if(!['pull','rm'].includes(a[0]))process.exit(2);`;
  writeFileSync(join(fixture,'bin/docker'),fake);chmodSync(join(fixture,'bin/docker'),0o755);
  writeFileSync(join(fixture,'check.mjs'),`
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {startServer} from './src/server.ts';import {allSetups} from './src/repository-setup.ts';import {execFileSync} from 'node:child_process';import {assembleWithSetupGate} from './src/setup-gate.ts';import {loadCase,loadProfile} from './src/config.ts';
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));const server=startServer(port);await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+port;
const post=(path,form,origin=url)=>fetch(url+path,{method:'POST',headers:{origin},body:form,redirect:'manual'});
const waitSetup=async(id)=>{for(let i=0;i<150;i++){const setup=allSetups().find(s=>s.id===id);if(!['detecting','running'].includes(setup.status))return setup;await new Promise(r=>setTimeout(r,50));}throw Error('Setup timed out');};
try{
 const assessment=new URLSearchParams({repository:${JSON.stringify(repo)},base:'main',head:'feature',owner:'Synthetic fixture only',requirement:'Return zero.',profile:'auto'});
 const waitJob=async(path)=>{for(let i=0;i<200;i++){const job=await(await fetch(url+path+'/status')).json();if(job.status!=='running')return job;await new Promise(r=>setTimeout(r,50));}throw Error('Assessment timeout');};
 const submit=async()=>{const response=await post('/assess',assessment);assert.equal(response.status,303);return waitJob(response.headers.get('location'));};
 assert.equal((await post('/assess',assessment,'https://other.example')).status,403);
 let job=await submit();const originalId=job.id;assert.equal(job.status,'awaiting_setup',JSON.stringify(job));assert.ok(job.setupId);assert.equal(existsSync('docker-calls.jsonl'),false);
 const path='/setups/'+job.setupId,id=job.setupId;let setup=await waitSetup(id);assert.equal(setup.status,'review');assert.equal(setup.assessmentId,job.id);assert.equal(setup.detection.runnable,true);
 const pinnedHead=setup.commit;execFileSync('git',['-C',${JSON.stringify(repo)},'checkout','-q','feature']);writeFileSync(${JSON.stringify(join(repo,'calc.js'))},'export const count=2;\\n');execFileSync('git',['-C',${JSON.stringify(repo)},'-c','user.name=Fixture','-c','user.email=fixture@invalid','commit','-qam','branch advanced while awaiting setup']);
 const pendingPage=await(await fetch(url+'/assess/'+job.id)).text();assert.match(pendingPage,/Review verification plan/);
 const html=await(await fetch(url+path)).text();assert.match(html,/Trust plan and run baseline/);const trust=new URLSearchParams({planHash:'wrong',name:'Synthetic fixture only',trust:'yes'});assert.equal((await post(path+'/trust',trust)).status,400);trust.set('planHash',setup.planHash);trust.delete('trust');assert.equal((await post(path+'/trust',trust)).status,400);trust.set('trust','yes');assert.equal((await post(path+'/trust',trust)).status,303);
 setup=await waitSetup(id);assert.equal(setup.status,'verified',JSON.stringify(setup));assert.match(setup.run.imageDigest,/^node@sha256:/);assert.ok(setup.run.checks.every(c=>c.status==='passed'));
 for(let i=0;i<200;i++){job=await(await fetch(url+'/assess/'+originalId+'/status')).json();if(!['running','awaiting_setup'].includes(job.status))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(job.id,originalId);assert.equal(job.status,'completed',JSON.stringify(job));let report=JSON.parse(readFileSync('data/cases/'+job.id+'/report.json'));assert.equal(report.case.head,pinnedHead);assert.ok(report.hunks.some(h=>h.added.some(line=>line.includes('count=1'))));assert.ok(report.evidence.some(e=>e.id==='repository-setup-overall'&&e.status==='passed'));assert.ok(report.notChecked.some(x=>/Regression discrimination/.test(x.what)));
 const setupCount=allSetups().length;
 writeFileSync('fail-check','yes');job=await submit();assert.equal(allSetups().length,setupCount);assert.equal(job.status,'completed',JSON.stringify(job));report=JSON.parse(readFileSync('data/cases/'+job.id+'/report.json'));assert.equal(report.route.effectiveRoute,'blocked');assert.ok(report.route.reasons.some(r=>r.code==='repository-verification'));
 execFileSync(process.execPath,['src/cli.ts','check',job.id],{stdio:'pipe'});execFileSync(process.execPath,['src/cli.ts','assemble',job.id],{stdio:'pipe'});
 const erased=JSON.parse(readFileSync('data/cases/'+job.id+'/report.json'));assert.equal(erased.evidence.some(e=>e.check==='repository-setup'),false);
 const gatedPage=await(await fetch(url+'/case/'+job.id)).text();assert.match(gatedPage,/required repository verification evidence was removed/);assert.ok(gatedPage.includes('saved repository verification (failed)'));const registered=loadCase(job.id);assembleWithSetupGate(registered,loadProfile(registered.profile));assert.ok(JSON.parse(readFileSync('data/cases/'+job.id+'/report.json')).route.reasons.some(r=>r.code==='repository-verification'));
 const callsBefore=readFileSync('docker-calls.jsonl','utf8');assessment.set('head','config-change');job=await submit();assert.equal(job.status,'awaiting_setup');assert.notEqual(job.setupId,id);assert.equal(allSetups().length,setupCount+1);assert.equal(readFileSync('docker-calls.jsonl','utf8'),callsBefore);
 const cancelledId=job.id;assert.equal((await post('/assess/'+job.id+'/cancel',new URLSearchParams())).status,303);await new Promise(r=>setTimeout(r,50));assert.equal(JSON.parse(readFileSync('data/submissions/'+cancelledId+'/job.json')).status,'interrupted');job=await submit();assert.equal(job.status,'awaiting_setup');
 server.close();await new Promise(r=>setTimeout(r,100));assert.equal(JSON.parse(readFileSync('data/submissions/'+job.id+'/job.json')).status,'interrupted');
 assert.equal(existsSync('data/trust'),false);assert.equal(existsSync('data/experiments'),false);assert.deepEqual(JSON.parse(readFileSync('cases.json')),{cases:[]});
}finally{if(server.listening)server.close();}
`);
  const result=spawnSync(process.execPath,[join(fixture,'check.mjs')],{cwd:fixture,encoding:'utf8',timeout:30000,env:{...process.env,PATH:join(fixture,'bin')+':'+process.env.PATH}});assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
 }finally{rmSync(fixture,{recursive:true,force:true});}
});


test('progress keeps polling while setup waits and switches from confirmation to baseline to completed',async()=>{
 const {renderAssessmentProgress}=await import('../src/assessment-pages.ts');const {STAGES}=await import('../src/submissions.ts');const {runInNewContext}=await import('node:vm');
 const initial:any={id:'submission-11111111-1111-1111-1111-111111111111',status:'running',stage:'prepare',startedAt:'2026-11-15T00:00:00Z',updatedAt:'2026-11-15T00:00:00Z',repository:'/synthetic/fixture',owner:'Synthetic fixture',log:''};
 const setupId='setup-11111111-1111-1111-1111-111111111111';
 const states=[{...initial,status:'awaiting_setup',stage:'setup',setupId,setupStatus:'review'},{...initial,status:'awaiting_setup',stage:'setup',setupId,setupStatus:'running'},{...initial,status:'completed',stage:'assemble',setupId,setupStatus:'verified'}];
 const nodes:any=Object.fromEntries(['job-status','job-log','job-error','job-result','job-cancel','job-setup','job-setup-link','job-setup-title','job-setup-note',...STAGES.map(s=>'stage-'+s)].map(id=>[id,{textContent:'',hidden:true,href:'',classList:{toggle(){}}}]));
 const timers:Function[]=[];const html=renderAssessmentProgress(initial,'nonce');const code=html.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)![1];
 runInNewContext(code,{document:{getElementById:(id:string)=>nodes[id]},location:{pathname:'/assess/'+initial.id},setTimeout:(fn:Function)=>timers.push(fn),fetch:async()=>({ok:true,json:async()=>states.shift()})});
 await timers.shift()!();assert.match(nodes['job-status'].textContent,/Waiting for verification plan/);assert.equal(nodes['job-cancel'].hidden,false);assert.equal(nodes['job-setup-link'].href,'/setups/'+setupId);assert.equal(timers.length,1);
 await timers.shift()!();assert.match(nodes['job-status'].textContent,/Verifying repository baseline/);assert.equal(nodes['job-cancel'].hidden,true);assert.equal(timers.length,1);
 await timers.shift()!();assert.equal(nodes['job-result'].hidden,false);assert.match(nodes['job-setup-link'].textContent,/verified/);assert.equal(timers.length,0);
});
