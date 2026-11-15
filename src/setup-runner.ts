// Untrusted repository commands run only in a disposable, restricted container.
import {spawn, type ChildProcess} from 'node:child_process';
import {cpSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, openSync, writeSync, closeSync, opendirSync, lstatSync} from 'node:fs';
import {join, relative, isAbsolute, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {WORK} from './config.ts';

type Status = 'passed'|'failed'|'inconclusive'|'not_run';
export type SetupCommand = {id:string;phase:'restore'|'check';argv:string[];description:string};
export type SetupRun = {
  status:Status; startedAt:string; durationMs:number; imageDigest:string|null;
  checks:{id:string;status:Status;exitCode:number|null;durationMs:number;log:string;summary:string}[];
  reason?:string;
};
type Options={plan:{image:string;commands:SetupCommand[]};sourceDir:string;outDir:string;onProgress?:(text:string)=>void};
const nodeImage=/^(?:(?:docker\.io\/)?library\/)?node:(\d+(?:\.\d+){0,2})(?:-(?:(?:bookworm|bullseye)(?:-slim)?|alpine(?:\d+(?:\.\d+)*)?))?$/;
const sdkImage=/^mcr\.microsoft\.com\/dotnet\/sdk:\d+(?:\.\d+){0,2}(?:-(?:jammy|noble|bookworm-slim|alpine)(?:\d+(?:\.\d+)*)?)?$/;
const pinnedImage=/^(?:(?:(?:docker\.io\/)?library\/)?node|mcr\.microsoft\.com\/dotnet\/sdk)@sha256:[a-f0-9]{64}$/;
const repo=(image:string)=>image.split('@')[0].replace(/:\d.*$/,'').replace(/^(?:docker\.io\/)?library\//,'');
const safeProject=(p:string)=>p.length>0&&!/[\x00-\x1f\x7f\\]/.test(p)&&!isAbsolute(p)&&p.split('/').every(part=>part!==''&&part!=='.'&&part!=='..'&&!part.startsWith('-')&&!part.startsWith('@'))&&/\.(?:slnx?|csproj|fsproj|vbproj)$/.test(p);

function validatePlan(plan:Options['plan']):void {
  if(!plan||typeof plan.image!=='string'||!(nodeImage.test(plan.image)||sdkImage.test(plan.image)||pinnedImage.test(plan.image)))throw new Error('Image is not a trusted Node or Microsoft SDK image');
  if(!Array.isArray(plan.commands)||plan.commands.length>100)throw new Error('Invalid command list');
  const ids=new Set<string>();let checking=false;
  for(const c of plan.commands){
    if(!c||typeof c.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(c.id)||ids.has(c.id)||typeof c.description!=='string'||c.description.length>20000||!Array.isArray(c.argv)||!c.argv.every(x=>typeof x==='string'))throw new Error('Invalid command identity or argv');
    ids.add(c.id);const a=c.argv;let allowed=false;
    if(c.phase==='restore'){
      if(checking)throw new Error('Restore commands must precede checks');
      allowed=(repo(plan.image)==='node'&&JSON.stringify(a)===JSON.stringify(['npm','ci','--ignore-scripts']))||(repo(plan.image)==='mcr.microsoft.com/dotnet/sdk'&&a.length===3&&a[0]==='dotnet'&&a[1]==='restore'&&safeProject(a[2]));
    }else if(c.phase==='check'){
      checking=true;
      allowed=(repo(plan.image)==='node'&&a.length===3&&a[0]==='npm'&&a[1]==='run'&&['build','lint','test'].includes(a[2]))||(repo(plan.image)==='mcr.microsoft.com/dotnet/sdk'&&a[0]==='dotnet'&&safeProject(a[2]??'')&&((a.length===4&&a[1]==='build'&&a[3]==='--no-restore')||(a.length===8&&a[1]==='test'&&a[3]==='--no-restore'&&a[4]==='--logger'&&a[5]==='trx'&&a[6]==='--results-directory'&&/^\/results\/project-\d+$/.test(a[7]))));
    }
    if(!allowed)throw new Error(`Command ${c.id} is not an allowed detector template`);
  }
}

export function buildContainerArgs(o:{name:string;imageDigest:string;sourceDir:string;resultsDir:string;command:SetupCommand}):string[]{
  if(!pinnedImage.test(o.imageDigest))throw new Error('An immutable trusted image digest is required');
  if([o.sourceDir,o.resultsDir].some(p=>!isAbsolute(p)||/[\r\n,]/.test(p)))throw new Error('Unsafe container mount path');
  const uid=process.getuid?.()||65534,gid=process.getgid?.()||65534;
  return ['run','--rm','--pull','never','--name',o.name,'--user',`${uid}:${gid}`,
    '--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','256','--memory','2g','--cpus','2',
    '--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--network',o.command.phase==='restore'?'bridge':'none',
    '--mount',`type=bind,src=${o.sourceDir},dst=/source`,'--mount',`type=bind,src=${o.resultsDir},dst=/results`,
    '--workdir','/source',...Object.entries({HOME:'/source/.reviewproof-cache/home',NUGET_PACKAGES:'/source/.reviewproof-cache/nuget',npm_config_cache:'/source/.reviewproof-cache/npm',DOTNET_CLI_HOME:'/source/.reviewproof-cache/dotnet',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',CI:'true'}).flatMap(([k,v])=>['--env',`${k}=${v}`]),
    o.imageDigest,...o.command.argv];
}

type Active={name:string;env:NodeJS.ProcessEnv;child?:ChildProcess;cancelled:boolean};
const active=new Set<Active>();
async function removeContainer(run:Active):Promise<void>{
  await new Promise<void>(done=>{const child=spawn('docker',['rm','-f',run.name],{env:run.env,stdio:'ignore'});const timer=setTimeout(()=>child.kill('SIGKILL'),10000);child.once('error',()=>{clearTimeout(timer);done();});child.once('close',()=>{clearTimeout(timer);done();});});
}
export async function cancelSetupRuns():Promise<void>{
  await Promise.all([...active].map(async run=>{run.cancelled=true;run.child?.kill('SIGKILL');await removeContainer(run);}));
}

function preserveTrx(results:string,outDir:string):void {
  // shortcut: retain at most 100 regular TRX files / 20 MiB; use artifact storage for larger suites.
  const pending=[{path:results,depth:0}];let visited=0,saved=0,bytes=0;
  while(pending.length&&visited<1000&&saved<100){
    const current=pending.pop()!,directory=opendirSync(current.path);
    try{
      for(let item=directory.readSync();item&&visited<1000&&saved<100;item=directory.readSync()){
        visited++;const path=join(current.path,item.name),stat=lstatSync(path);
        if(stat.isDirectory()&&current.depth<8)pending.push({path,depth:current.depth+1});
        else if(stat.isFile()&&item.name.endsWith('.trx')&&stat.size<=5*1024*1024&&bytes+stat.size<=20*1024*1024){
          const destination=join(outDir,'results',relative(results,path));mkdirSync(join(destination,'..'),{recursive:true});copyFileSync(path,destination);saved++;bytes+=stat.size;
        }
      }
    }finally{directory.closeSync();}
  }
}

async function docker(args:string[],o:{run:Active;logPath:string;timeoutMs:number;progress?:(text:string)=>void}):Promise<{code:number|null;output:string;error?:string;timedOut:boolean}>{
  const log=openSync(o.logPath,'w');let bytes=0,output='',events=0;
  return await new Promise(resolveResult=>{
    let settled=false,timedOut=false;
    const child=spawn('docker',args,{env:o.run.env,stdio:['ignore','pipe','pipe']});o.run.child=child;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');void removeContainer(o.run);},o.timeoutMs);
    const finish=(code:number|null,error?:string)=>{if(settled)return;settled=true;clearTimeout(timer);closeSync(log);o.run.child=undefined;resolveResult({code,output,error,timedOut});};
    const chunk=(data:Buffer)=>{
      if(bytes<4*1024*1024){const keep=data.subarray(0,4*1024*1024-bytes);writeSync(log,keep);bytes+=keep.length;}
      if(output.length<65536)output+=data.toString('utf8').slice(0,65536-output.length);
      if(events<16){events++;try{o.progress?.(data.toString('utf8').slice(0,500));}catch{/* Progress cannot interrupt owned-container cleanup. */}}
    };
    child.stdout?.on('data',chunk);child.stderr?.on('data',chunk);child.once('error',e=>finish(null,e.message));child.once('close',code=>finish(code));
  });
}

export async function runSetupChecks(o:Options):Promise<SetupRun>{
  const start=Date.now(),result:SetupRun={status:'not_run',startedAt:new Date(start).toISOString(),durationMs:0,imageDigest:null,checks:[]};
  let execution:string|undefined,results:string|undefined,run:Active|undefined;
  const progress=(text:string)=>{try{o.onProgress?.(text);}catch{/* UI listeners cannot abort verification. */}};
  try{
    validatePlan(o.plan);
    result.checks=o.plan.commands.map(c=>({id:c.id,status:'not_run',exitCode:null,durationMs:0,log:resolve(o.outDir,`${c.id}.log`),summary:'Not run.'}));
    const source=realpathSync(o.sourceDir),managed=realpathSync(WORK),path=relative(managed,source);
    if(!path||path==='..'||path.startsWith('../')||isAbsolute(path)||path.split(/[\\/]/).includes('.git'))throw new Error('Source must be inside managed WORK, outside clone Git metadata');
    mkdirSync(o.outDir,{recursive:true});mkdirSync(join(WORK,'setup-execution'),{recursive:true});
    execution=mkdtempSync(join(WORK,'setup-execution','run-'));
    const copied=join(execution,'source'),home=join(execution,'docker-home');results=join(execution,'results');
    cpSync(source,copied,{recursive:true,dereference:false,verbatimSymlinks:true,filter:p=>!relative(source,p).split(/[\\/]/).includes('.git')});
    mkdirSync(results);mkdirSync(home);mkdirSync(join(copied,'.reviewproof-cache'),{recursive:true});
    run={name:`reviewproof-setup-${randomUUID()}`,env:{PATH:process.env.PATH,HOME:home,DOCKER_CONFIG:home},cancelled:false};active.add(run);
    if(!o.plan.image.includes('@')){
      progress(`Pulling trusted image ${o.plan.image}`);
      const pull=await docker(['pull',o.plan.image],{run,logPath:join(o.outDir,'image-pull.log'),timeoutMs:180000});
      if(run.cancelled||pull.error||pull.code!==0||pull.timedOut){result.reason=run.cancelled?'Setup cancelled.':`Trusted image unavailable: ${pull.error??(pull.timedOut?'pull timed out':`docker pull exited ${pull.code}`)}`;return result;}
    }
    if(run.cancelled){result.reason='Setup cancelled.';return result;}
    const inspect=await docker(['image','inspect','--format','{{json .RepoDigests}}',o.plan.image],{run,logPath:join(o.outDir,'image-inspect.log'),timeoutMs:30000});
    let digests:unknown;try{digests=JSON.parse(inspect.output.trim());}catch{}
    const digest=Array.isArray(digests)?digests.find(x=>typeof x==='string'&&pinnedImage.test(x)&&repo(x)===repo(o.plan.image)&&(!o.plan.image.includes('@')||x.split('@')[1]===o.plan.image.split('@')[1])):undefined;
    if(inspect.code!==0||inspect.error||inspect.timedOut||!digest){result.reason='Could not resolve and verify the trusted image digest.';return result;}
    result.imageDigest=digest;
    for(let i=0;i<o.plan.commands.length;i++){
      if(run.cancelled){result.reason='Setup cancelled.';result.status='inconclusive';break;}
      const command=o.plan.commands[i],check=result.checks[i],stepStart=Date.now();progress(`Starting ${command.description}`);
      const executed=await docker(buildContainerArgs({name:run.name,imageDigest:digest,sourceDir:copied,resultsDir:results,command}),{run,logPath:check.log,timeoutMs:600000,progress:text=>progress(`${command.id}: ${text}`)});
      check.durationMs=Date.now()-stepStart;check.exitCode=executed.code;
      check.status=run.cancelled||executed.timedOut||executed.error||executed.code===null||executed.code===125||executed.code===126||executed.code===127?'inconclusive':executed.code===0?'passed':'failed';
      check.summary=run.cancelled?'Cancelled.':executed.timedOut?'Timed out after 600 seconds.':executed.error?`Container unavailable: ${executed.error}`:check.status==='passed'?'Command exited 0. Test counts unavailable.':`Command exited ${executed.code}. See log; test counts unavailable.`;
      progress(`${command.description}: ${check.status}`);
      if(check.status!=='passed'){
        result.status=check.status;result.reason=check.summary;
        for(const skipped of result.checks.slice(i+1))skipped.summary=`Skipped because ${check.id} did not pass.`;
        break;
      }
    }
    if(result.checks.length&&result.checks.every(c=>c.status==='passed')){
      result.status=o.plan.commands.some(c=>c.phase==='check')?'passed':'not_run';
      if(result.status==='not_run')result.reason='Dependencies restored; no verification check was configured.';
    }else if(!result.checks.length)result.reason='No verification checks were configured.';
    return result;
  }catch(error){
    const ran=result.checks.some(c=>c.status!=='not_run');
    if(ran)result.status='inconclusive';
    result.reason=`${ran?'Setup interrupted':'Setup not run'}: ${(error as Error).message}`;return result;
  }
  finally{
    if(run){await removeContainer(run);active.delete(run);}
    if(results)try{preserveTrx(results,o.outDir);}catch{progress('Could not retain all TRX artifacts; command logs remain available.');}
    if(execution)try{rmSync(execution,{recursive:true,force:true});}catch{progress(`Could not remove isolated working files: ${execution}`);}
    result.durationMs=Date.now()-start;
  }
}
