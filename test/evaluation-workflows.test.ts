import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

test('human evaluation workflows save versioned observations separately from acceptance and trust',()=>{
 const root=join(import.meta.dirname,'..'),fixture=mkdtempSync(join(tmpdir(),'review-evaluation-'));
 try{
  cpSync(join(root,'src'),join(fixture,'src'),{recursive:true});cpSync(join(root,'profiles'),join(fixture,'profiles'),{recursive:true});
  if(existsSync(join(root,'fixtures')))cpSync(join(root,'fixtures'),join(fixture,'fixtures'),{recursive:true});
  for(const name of ['package.json','policy.json'])cpSync(join(root,name),join(fixture,name));
  symlinkSync(join(root,'node_modules'),join(fixture,'node_modules'));
  const r=JSON.parse(readFileSync(join(root,'data/cases/2283/report.json'),'utf8'));
  r.case.id='sample-fixture';r.case.title='Synthetic fixture';r.case.requirementId='FIXTURE';
  r.hunks=[{id:'H1',file:'selected.ts',oldStart:1,oldLines:0,newStart:1,newLines:1,removed:[],added:['SELECTED_FIXTURE_LINE']},{id:'H2',file:'withheld.ts',oldStart:1,oldLines:0,newStart:1,newLines:1,removed:[],added:['WITHHELD_FIXTURE_LINE']}];
  r.findings=[{id:'F1',statement:'Synthetic finding',status:'suspected',citations:[],hunkIds:['H1']}];
  r.route={...r.route,evidenceRoute:'blocked',effectiveRoute:'blocked',readingList:[{hunkId:'H1',file:'selected.ts',lines:1,why:['Synthetic selection']}],readingListLines:1,totalLines:2,readRatio:null,reasons:[{code:'fixture',detail:'Synthetic blocker'}]};
  const c={id:r.case.id,repository:'/synthetic/fixture',profile:'inspection-only',base:r.case.base,head:r.case.head,requirement:{id:'FIXTURE',text:'Synthetic requirement.'},cohort:'sample'};
  writeFileSync(join(fixture,'cases.json'),JSON.stringify({cases:[c,{...c,id:'holdout-fixture',cohort:'holdout'}]}));
  for(const id of ['sample-fixture','holdout-fixture']){
   mkdirSync(join(fixture,'data/cases',id),{recursive:true});writeFileSync(join(fixture,'data/cases',id,'report.json'),JSON.stringify({...r,case:{...r.case,id}}));
   writeFileSync(join(fixture,'data/cases',id,'requirement.json'),JSON.stringify({title:'Synthetic requirement',body:'Synthetic requirement.'}));
  }
  writeFileSync(join(fixture,'check.mjs'),String.raw`
import assert from 'node:assert/strict';import {createServer,request} from 'node:http';import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';import {startServer} from './src/server.ts';
const reserved=createServer();await new Promise(r=>reserved.listen(0,'127.0.0.1',r));const port=reserved.address().port;await new Promise(r=>reserved.close(r));
const server=startServer(port);await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+port;
const rawReport=readFileSync('data/cases/sample-fixture/report.json','utf8');
const post=(path,form,origin=url)=>fetch(url+path,{method:'POST',headers:{origin},body:form,redirect:'manual'});
const changedDuringBody=async(path,form)=>{
 const encoded=form.toString();
 const status=await new Promise((resolve,reject)=>{
  const pending=request(url+path,{method:'POST',headers:{origin:url,expect:'100-continue','content-type':'application/x-www-form-urlencoded','content-length':Buffer.byteLength(encoded)}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});
  pending.on('error',reject);pending.on('continue',async()=>{try{
   await fetch(url+'/case/sample-fixture');
   const changed=JSON.parse(rawReport);changed.case.title='Changed while the request body was pending';writeFileSync('data/cases/sample-fixture/report.json',JSON.stringify(changed));pending.end(encoded);
  }catch(error){reject(error);}});pending.flushHeaders();
 });
 writeFileSync('data/cases/sample-fixture/report.json',rawReport);return status;
};
try{
 const feedbackPage=await fetch(url+'/case/sample-fixture/findings');assert.equal(feedbackPage.status,200);assert.match(feedbackPage.headers.get('content-security-policy'),/script-src 'none'/);const feedbackHtml=await feedbackPage.text();
 const hash=feedbackHtml.match(/name="reportHash" value="([a-f0-9]{64})"/)[1];
 const feedback=new URLSearchParams({reportHash:hash,name:'Synthetic fixture only',findingId:'F1',verdict:'real',explanation:'Synthetic observed mismatch.',evidence:'Synthetic fixture source and assertion.',human:'yes'});
 assert.equal(await changedDuringBody('/case/sample-fixture/findings',feedback),400);
 assert.equal((await post('/case/sample-fixture/findings',feedback,'https://foreign.example')).status,403);
 const invalid=new URLSearchParams(feedback);invalid.set('findingId','missing');assert.equal((await post('/case/sample-fixture/findings',invalid)).status,400);
 invalid.set('findingId','F1');invalid.set('reportHash','b'.repeat(64));assert.equal((await post('/case/sample-fixture/findings',invalid)).status,400);
 for(let i=0;i<2;i++)assert.equal((await post('/case/sample-fixture/findings',feedback)).status,303);
 const files=readdirSync('data/finding-feedback');assert.equal(files.length,2);const saved=files.map(f=>JSON.parse(readFileSync('data/finding-feedback/'+f)));assert.ok(saved.every(r=>r.reportHash===hash&&r.verdict==='real'));
 const summary=await fetch(url+'/evaluation/findings');assert.equal(summary.status,200);assert.match(await summary.text(),/sample-fixture/);
 const targetPage=await fetch(url+'/case/sample-fixture/targeted');assert.equal(targetPage.status,200);const targetHtml=await targetPage.text();assert.match(targetHtml,/SELECTED_FIXTURE_LINE/);assert.doesNotMatch(targetHtml,/WITHHELD_FIXTURE_LINE/);
 assert.equal((await fetch(url+'/case/holdout-fixture/targeted')).status,403);
 const initial=new URLSearchParams({reportHash:hash,name:'Synthetic fixture only',priorExposure:'no',notes:'Synthetic initial notes.',unresolvedQuestions:'Synthetic open question.',fullReadNeeded:'yes',human:'yes'});
 assert.equal(await changedDuringBody('/case/sample-fixture/targeted',initial),400);
 const noHuman=new URLSearchParams(initial);noHuman.delete('human');assert.equal((await post('/case/sample-fixture/targeted',noHuman)).status,400);
 const created=await post('/case/sample-fixture/targeted',initial);assert.equal(created.status,303);const comparisonPath=created.headers.get('location');assert.match(comparisonPath,/^\/case\/sample-fixture\/targeted\/[a-f0-9-]+$/);
 const id=comparisonPath.split('/').at(-1);assert.equal(readdirSync('data/targeted-experiments').length,1);
 const full=await fetch(url+comparisonPath);assert.equal(full.status,200);const fullHtml=await full.text();assert.match(fullHtml,/WITHHELD_FIXTURE_LINE/);assert.match(fullHtml,/Synthetic initial notes/);
 const comparison=new URLSearchParams({reportHash:hash,reviewId:id,human:'yes',fullRead:'yes',addedFindings:'Synthetic issue found only in full diff.',remainingQuestions:'None',fullReadNeeded:'yes'});
 assert.equal(await changedDuringBody(comparisonPath,comparison),409);
 assert.equal((await post(comparisonPath,comparison,'https://foreign.example')).status,403);
 const incomplete=new URLSearchParams(comparison);incomplete.delete('fullRead');assert.equal((await post(comparisonPath,incomplete)).status,400);
 assert.equal((await post(comparisonPath,comparison)).status,303);assert.equal((await post(comparisonPath,comparison)).status,409);
 assert.equal(readdirSync('data/targeted-experiments').length,2);assert.equal((await fetch(url+'/evaluation/targeted')).status,200);
 const changed=JSON.parse(rawReport);changed.case.title='Synthetic changed report';writeFileSync('data/cases/sample-fixture/report.json',JSON.stringify(changed));
 assert.equal((await fetch(url+comparisonPath)).status,409);writeFileSync('data/cases/sample-fixture/report.json',rawReport);
 assert.equal((await fetch(url+'/examples')).status,200);assert.equal((await fetch(url+'/examples/frontend?version=head')).status,200);assert.equal((await fetch(url+'/examples/frontend?version=unknown')).status,400);
 assert.equal(readFileSync('data/cases/sample-fixture/report.json','utf8'),rawReport);assert.equal(existsSync('data/cases/sample-fixture/signoffs'),false);assert.equal(existsSync('data/cases/sample-fixture/confirmations'),false);assert.equal(existsSync('data/trust'),false);
 // Exercise persistence only in this isolated synthetic repository.
 const signable=JSON.parse(rawReport);signable.route.effectiveRoute='full';signable.route.reasons=[];
 writeFileSync('data/cases/sample-fixture/report.json',JSON.stringify(signable));
 const sheetHtml=await (await fetch(url+'/case/sample-fixture')).text();
 const signHash=sheetHtml.match(/name="reportHash" value="([a-f0-9]{64})"/)[1];
 const signoff=new URLSearchParams({reportHash:signHash,name:'Synthetic fixture only',action:'accept',reason:'Synthetic sign-off without timing'});
 for(const decision of signable.decisions)signoff.set('decision.'+decision.id,'accept');
 assert.equal((await post('/case/sample-fixture/signoff',signoff)).status,303);
 assert.equal((await post('/case/sample-fixture/spotcheck',new URLSearchParams({name:'Synthetic fixture only',notes:'Synthetic untimed note',blind:'yes'}))).status,303);
 for(const directory of ['signoffs','spotchecks']){
  const file=readdirSync('data/cases/sample-fixture/'+directory)[0];
  const record=JSON.parse(readFileSync('data/cases/sample-fixture/'+directory+'/'+file));
  assert.equal('activeSeconds' in record,false);assert.equal('activeSecondsSource' in record,false);
 }
 writeFileSync('data/cases/sample-fixture/report.json',rawReport);
}finally{server.close();}
`);
  const result=spawnSync(process.execPath,[join(fixture,'check.mjs')],{cwd:fixture,encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
 }finally{rmSync(fixture,{recursive:true,force:true});}
});
