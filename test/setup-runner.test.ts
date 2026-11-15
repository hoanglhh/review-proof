import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync, symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildContainerArgs, cancelSetupRuns, runSetupChecks} from '../src/setup-runner.ts';
import {WORK} from '../src/config.ts';

const command={id:'build',phase:'check' as const,argv:['npm','run','build'],description:'Build project'};

test('container boundary mounts only isolated source/results, pins image and removes privileges',()=>{
  const args=buildContainerArgs({name:'setup-test',imageDigest:'node@sha256:'+'a'.repeat(64),sourceDir:'/isolated/source',resultsDir:'/isolated/results',command});
  for(const value of ['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','256','--memory','2g','--cpus','2','--network','none'])assert.ok(args.includes(value),value);
  assert.notEqual(args[args.indexOf('--user')+1].split(':')[0],'0');
  assert.deepEqual(args.filter((_,i)=>args[i-1]==='--mount'),['type=bind,src=/isolated/source,dst=/source','type=bind,src=/isolated/results,dst=/results']);
  assert.deepEqual(args.slice(-3),['npm','run','build']);
  assert.ok(args.includes('HOME=/source/.reviewproof-cache/home'));
  const restore=buildContainerArgs({name:'setup-restore',imageDigest:'node@sha256:'+'a'.repeat(64),sourceDir:'/isolated/source',resultsDir:'/isolated/results',command:{id:'restore',phase:'restore',argv:['npm','ci','--ignore-scripts'],description:'Restore'}});
  assert.equal(restore[restore.indexOf('--network')+1],'bridge');
});

test('rejects commands, unsafe images and unmanaged source paths before Docker runs',async()=>{
  const out=mkdtempSync(join(tmpdir(),'setup-reject-'));
  try{
    for(const plan of [
      {image:'evil/sdk:latest',commands:[command]},
      {image:'node:22',commands:[{...command,argv:['sh','-c','echo bad']}]},
      {image:'node:22',commands:[{...command,argv:['npm','run','build','--','--eval=bad']}]},
      {image:'node:22',commands:[{...command,id:'../escape'}]},
      {image:'node:22',commands:[{...command,phase:'restore' as const}]},
      {image:'mcr.microsoft.com/dotnet/sdk:8.0',commands:[{...command,argv:['dotnet','build','test.csproj','-p:Custom=bad']}]},
    ]){const result=await runSetupChecks({plan,sourceDir:out,outDir:out});assert.equal(result.status,'not_run');assert.match(result.reason??'',/invalid|unsafe|trusted|allowed/i);}
    for(const image of ['node:22-bookworm-slim','mcr.microsoft.com/dotnet/sdk:8.0']){
      const selected=image.startsWith('node:')?command:{...command,argv:['dotnet','build','Tests/My Tests.csproj','--no-restore']};
      const result=await runSetupChecks({plan:{image,commands:[selected]},sourceDir:out,outDir:out});assert.equal(result.status,'not_run');assert.match(result.reason??'',/WORK|managed/i);
    }
  }finally{rmSync(out,{recursive:true,force:true});}
});

test('fake Docker exercises pinned isolated runs, actual exits, skipped commands and missing Docker',async()=>{
  mkdirSync(WORK,{recursive:true});const fixture=mkdtempSync(join(WORK,'setup-unit-'));
  const bin=join(fixture,'bin'),source=join(fixture,'source'),out=join(fixture,'out'),calls=join(fixture,'calls.jsonl');
  mkdirSync(bin);mkdirSync(source);mkdirSync(join(source,'.git'));writeFileSync(join(source,'.git','config'),'SECRET');writeFileSync(join(source,'package.json'),'{}');writeFileSync(join(source,'target.js'),'export const x=1');symlinkSync('target.js',join(source,'fixture.js'));
  const docker=join(bin,'docker');
  writeFileSync(docker,`#!${process.execPath}\nimport {appendFileSync,existsSync,writeFileSync,symlinkSync,readlinkSync} from 'node:fs';\nconst a=process.argv.slice(2);appendFileSync(${JSON.stringify(calls)},JSON.stringify(a)+'\\n');\nif(a[0]==='image')console.log(JSON.stringify(['node@sha256:${'a'.repeat(64)}']));\nif(a[0]==='run'){const mount=a.find(x=>x.startsWith('type=bind,src=')&&x.endsWith('dst=/source'));const src=mount.slice('type=bind,src='.length,-',dst=/source'.length);if(existsSync(src+'/.git'))process.exit(88);if(readlinkSync(src+'/fixture.js')!=='target.js')process.exit(89);writeFileSync(src+'/changed','isolated');const results=a.find(x=>x.startsWith('type=bind,src=')&&x.endsWith('dst=/results')).slice('type=bind,src='.length,-',dst=/results'.length);writeFileSync(results+'/tests.trx','<TestRun/>');if(!existsSync(results+'/secret.trx'))symlinkSync('/etc/passwd',results+'/secret.trx');console.log('command output');if(a.includes('lint'))process.exit(2);}\n`);chmodSync(docker,0o755);
  const oldPath=process.env.PATH;process.env.PATH=bin;
  try{
    const progress:string[]=[];
    const result=await runSetupChecks({plan:{image:'node:22',commands:[{id:'restore',phase:'restore',argv:['npm','ci','--ignore-scripts'],description:'Restore'},command,{...command,id:'lint',argv:['npm','run','lint']},{...command,id:'test',argv:['npm','run','test']}]},sourceDir:source,outDir:out,onProgress:x=>progress.push(x)});
    assert.equal(result.status,'failed',JSON.stringify(result));assert.deepEqual(result.checks.map(x=>x.status),['passed','passed','failed','not_run']);assert.equal(result.checks[2].exitCode,2);assert.match(readFileSync(result.checks[0].log,'utf8'),/command output/);assert.equal(result.imageDigest,'node@sha256:'+'a'.repeat(64));assert.ok(progress.length>0);assert.equal(readFileSync(join(out,'results','tests.trx'),'utf8'),'<TestRun/>');assert.equal(existsSync(join(out,'results','secret.trx')),false);
    const invocations=readFileSync(calls,'utf8').trim().split('\n').map(x=>JSON.parse(x) as string[]);
    const runs=invocations.filter(a=>a[0]==='run');assert.equal(runs.length,3);assert.equal(runs[0][runs[0].indexOf('--network')+1],'bridge');assert.equal(runs[1][runs[1].indexOf('--network')+1],'none');assert.ok(runs.every(a=>a.includes(result.imageDigest!)));assert.ok(runs.every(a=>!a.includes(source)));assert.equal(existsSync(join(source,'changed')),false);
    const onlyRestore=await runSetupChecks({plan:{image:'node:22',commands:[{id:'restore',phase:'restore',argv:['npm','ci','--ignore-scripts'],description:'Restore'}]},sourceDir:source,outDir:out});assert.equal(onlyRestore.status,'not_run');
    writeFileSync(calls,'');const pinned=await runSetupChecks({plan:{image:'node@sha256:'+'a'.repeat(64),commands:[command]},sourceDir:source,outDir:out});assert.equal(pinned.status,'passed');assert.ok(!readFileSync(calls,'utf8').includes('"pull"'));
    rmSync(docker);const missing=await runSetupChecks({plan:{image:'node:22',commands:[command]},sourceDir:source,outDir:out});assert.equal(missing.status,'not_run');assert.ok(missing.checks.every(x=>x.status==='not_run'));
  }finally{process.env.PATH=oldPath;rmSync(fixture,{recursive:true,force:true});}
});

test('cancellation kills the owned active container and reports an inconclusive check',async()=>{
  mkdirSync(WORK,{recursive:true});const fixture=mkdtempSync(join(WORK,'setup-cancel-')),bin=join(fixture,'bin'),source=join(fixture,'source'),ready=join(fixture,'ready'),calls=join(fixture,'calls');
  mkdirSync(bin);mkdirSync(source);
  const docker=join(bin,'docker');writeFileSync(docker,`#!${process.execPath}\nimport {appendFileSync,writeFileSync} from 'node:fs';const a=process.argv.slice(2);appendFileSync(${JSON.stringify(calls)},JSON.stringify(a)+'\\n');if(a[0]==='image')console.log(JSON.stringify(['node@sha256:${'a'.repeat(64)}']));if(a[0]==='run'){writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000);}\n`);chmodSync(docker,0o755);
  const oldPath=process.env.PATH;process.env.PATH=bin;
  try{
    const pending=runSetupChecks({plan:{image:'node:22',commands:[command]},sourceDir:source,outDir:join(fixture,'out')});
    for(let i=0;i<200&&!existsSync(ready);i++)await new Promise(r=>setTimeout(r,10));
    assert.ok(existsSync(ready),'container command started');await cancelSetupRuns();
    const result=await pending;assert.equal(result.status,'inconclusive');assert.equal(result.checks[0].status,'inconclusive');assert.match(result.reason??'',/cancelled/i);assert.match(readFileSync(calls,'utf8'),/"rm","-f","reviewproof-setup-/);
  }finally{await cancelSetupRuns();process.env.PATH=oldPath;rmSync(fixture,{recursive:true,force:true});}
});
