// Repository setup permission is separate from accepting any code change.
import {EventEmitter} from 'node:events';
import {randomUUID,createHash} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {existsSync,mkdirSync,readdirSync,writeFileSync,renameSync,realpathSync} from 'node:fs';
import {join,relative} from 'node:path';
import {DATA,ROOT,WORK,readJson,loadProfile,type Profile} from './config.ts';
import {git,readAt,ensureWorktree} from './git.ts';
import {detectSetup,isSetupFile,type Detection} from './setup-detect.ts';
import {runSetupChecks,cancelSetupRuns,type SetupRun} from './setup-runner.ts';
import type {Evidence} from './report.ts';

export const SETUPS=join(DATA,'repository-setups');
export type RepositorySetup={assessmentId?:string;id:string;repository:string;identity:string;revision:string;commit?:string;clone?:string;status:'detecting'|'review'|'running'|'verified'|'failed'|'interrupted';createdAt:string;updatedAt:string;log:string;error?:string;detection?:Detection;planHash?:string;trustedBy?:string;trustedAt?:string;run?:SetupRun};
const active=new Map<string,ChildProcess|null>();
const changes=new EventEmitter();
const safe=(id:string)=>/^setup-[0-9a-f-]{36}$/.test(id);
export const repositoryIdentity=(repository:string)=>repository.startsWith('/')?realpathSync(repository):repository.replace(/\.git\/?$/,'').replace(/\/$/,'').toLowerCase();
export function validateSetupInput(f:URLSearchParams){
  const errors:string[]=[];
  if([...f.keys()].some(k=>!['repository','revision'].includes(k)))errors.push('Only repository and revision can be supplied; verification commands come from trusted templates.');
  if(['repository','revision'].some(k=>f.getAll(k).length!==1))errors.push('Supply repository and revision once each.');
  const repo=f.get('repository')?.trim()??'';
  if(repo.length>4096||!(repo.startsWith('/')&&!/[\0\r\n]/.test(repo)||/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(repo)))errors.push('Use an absolute local Git path or a public HTTPS GitHub repository URL.');
  if(!/^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]{0,199}$/.test(f.get('revision')??''))errors.push('Enter a valid committed revision.');
  return errors;
}
function save(s:RepositorySetup){s.updatedAt=new Date().toISOString();mkdirSync(join(SETUPS,s.id),{recursive:true});const tmp=join(SETUPS,s.id,'setup.tmp');writeFileSync(tmp,JSON.stringify(s,null,2)+'\n');renameSync(tmp,join(SETUPS,s.id,'setup.json'));changes.emit(s.id,s);}
export function getSetup(id:string):RepositorySetup|null {
  if(!safe(id)||!existsSync(join(SETUPS,id,'setup.json')))return null;
  const s:RepositorySetup=readJson(join(SETUPS,id,'setup.json'));
  if(['running','detecting'].includes(s.status)&&!active.has(id)){s.status='interrupted';s.error='The server stopped before setup completed. Detect a new plan to retry.';save(s);}return s;
}
export const setupBusy=()=>active.size>0;
export function allSetups():RepositorySetup[]{return existsSync(SETUPS)?readdirSync(SETUPS).map(getSetup).filter((x):x is RepositorySetup=>!!x).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)):[];}
function cloneCommand(s:RepositorySetup,args:string[]){return new Promise<void>((resolve,reject)=>{
 const child=spawn('git',args,{cwd:ROOT,detached:true,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,GIT_TERMINAL_PROMPT:'0'}});active.set(s.id,child);
 const timer=setTimeout(()=>{child.kill();reject(new Error('Repository detection timed out.'));},180000);
 for(const stream of [child.stdout,child.stderr])stream!.on('data',chunk=>{s.log=(s.log+chunk.toString()).slice(-16000);save(s);});
 child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`Git clone failed (exit ${code}).`));});
});}
export function detectAt(repo:string,commit:string):Detection {
 const files: {path:string;content:string;oid:string}[]=[];const limits:string[]=[];
 for(const raw of git(repo,['ls-tree','-rlz',commit]).split('\0').filter(Boolean)){
  const m=/^(\d+) blob ([0-9a-f]+)\s+(\d+)\t([\s\S]*)$/.exec(raw);if(!m||!isSetupFile(m[4]))continue;
  if(!m[1].startsWith('100')||Number(m[3])>1000000||files.length>=1000){limits.push(`Configuration ${m[4]} is a symlink, too large or beyond the scan limit.`);files.push({path:m[4],content:'',oid:m[2]});continue;}
  files.push({path:m[4],content:readAt(repo,commit,m[4])??'',oid:m[2]});
 }
 const d=detectSetup(files);if(limits.length){d.runnable=false;d.limitations.push(...limits);}return d;
}
export function startSetup(f:URLSearchParams){
 const errors=validateSetupInput(f);if(errors.length)throw new Error(errors.join(' '));if(setupBusy())throw new Error('Another repository setup is running. Wait for it to finish.');
 const at=new Date().toISOString(),s:RepositorySetup={id:`setup-${randomUUID()}`,repository:f.get('repository')!.trim(),identity:'',revision:f.get('revision')!,status:'detecting',createdAt:at,updatedAt:at,log:'Cloning a committed snapshot and inspecting configuration. No repository commands are executed during detection.\n'};
 active.set(s.id,null);save(s);
 void(async()=>{try{
  const clone=join(WORK,'setup-repos',s.id);mkdirSync(join(WORK,'setup-repos'),{recursive:true});
  await cloneCommand(s,['-c','core.hooksPath=/dev/null','clone','--quiet','--no-checkout','--no-local','--',s.repository,clone]);
  let commit:string|undefined;for(const candidate of /^[0-9a-f]{40}$/.test(s.revision)?[s.revision]:[`refs/remotes/origin/${s.revision}`,s.revision]){try{commit=git(clone,['rev-parse','--verify','--end-of-options',`${candidate}^{commit}`]).trim();break;}catch{}}
  if(!commit)throw new Error('The selected revision was not found.');
  s.clone=clone;s.commit=commit;s.identity=repositoryIdentity(s.repository);s.detection=detectAt(clone,commit);s.planHash=createHash('sha256').update(JSON.stringify({identity:s.identity,commit,detection:s.detection})).digest('hex');s.status='review';s.log+='Detection complete. Review the plan before any source code is executed.\n';
 }catch(e){s.status='failed';s.error=String(e);}finally{if(!active.has(s.id)){s.status='interrupted';s.error='The server stopped during setup.';}active.delete(s.id);save(s);}})();return s;
}
export function trustSetup(id:string,f:URLSearchParams){
 const s=getSetup(id);if(!s||s.status!=='review'||!s.detection?.runnable||!s.commit||!s.clone)throw new Error('This setup cannot run. Detect a supported plan first.');
 if(setupBusy())throw new Error('Another setup is running. Wait for it to finish.');
 if(f.getAll('planHash').length!==1||f.get('planHash')!==s.planHash)throw new Error('The plan changed. Reload and review it again.');
 if(f.getAll('name').length!==1||!f.get('name')?.trim()||f.get('name')!.length>120||f.getAll('trust').length!==1||f.get('trust')!=='yes')throw new Error('Name the person trusting this execution plan and explicitly confirm it.');
 if(detectAt(s.clone,s.commit).fingerprint!==s.detection.fingerprint)throw new Error('The setup snapshot no longer matches its plan. Detect it again.');
 s.trustedBy=f.get('name')!.trim();s.trustedAt=new Date().toISOString();s.status='running';s.error=undefined;active.set(id,null);save(s);
 void(async()=>{try{
  const source=ensureWorktree(s.clone!,s.id,s.commit!);
  s.run=await runSetupChecks({plan:{image:s.detection!.image!,commands:s.detection!.commands},sourceDir:source,outDir:join(SETUPS,id,'baseline'),onProgress:line=>{if(!active.has(s.id))return;s.log=(s.log+line).slice(-16000);save(s);}});
  s.status=s.run.status==='passed'?'verified':'failed';if(s.status==='failed')s.error=s.run.reason??'Baseline checks did not all pass. Inspect the results before trying a new setup.';
 }catch(e){s.status='failed';s.error=String(e);}finally{if(!active.has(id)){s.status='interrupted';s.error='The server stopped during setup.';}active.delete(id);save(s);}})();return s;
}
export function reusableSetup(repository:string,repo:string,_base:string,head:string):RepositorySetup|undefined {
 const identity=repositoryIdentity(repository),headPlan=detectAt(repo,head);
 if(!headPlan.runnable)return undefined;
 return allSetups().find(s=>s.status==='verified'&&s.identity===identity&&s.detection?.fingerprint===headPlan.fingerprint&&s.run?.imageDigest);
}
export function setupForAssessment(repository:string,clone:string,head:string,assessmentId:string):RepositorySetup {
 if(setupBusy())throw new Error('Another repository setup is running. Wait for it to finish.');
 const at=new Date().toISOString(),detection=detectAt(clone,head),identity=repositoryIdentity(repository);
 const s:RepositorySetup={id:`setup-${randomUUID()}`,assessmentId,repository,identity,clone,revision:head,commit:head,status:'review',createdAt:at,updatedAt:at,log:'Detected configuration from the pinned assessment head. No source commands have been executed.\n',detection};
 s.planHash=createHash('sha256').update(JSON.stringify({identity,commit:head,detection})).digest('hex');save(s);return s;
}
export function waitForVerifiedSetup(id:string,signal:AbortSignal,onUpdate?:(setup:RepositorySetup)=>void):Promise<RepositorySetup>{
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{changes.removeListener(id,onChange);signal.removeEventListener('abort',onAbort);};
  const onAbort=()=>{cleanup();reject(new Error('The assessment was interrupted while waiting for verification setup.'));};
  const onChange=(s:RepositorySetup)=>{
   onUpdate?.(s);
   if(s.status==='verified'){cleanup();resolve(s);}
   else if(['failed','interrupted'].includes(s.status)){cleanup();reject(new Error(s.error??'Repository setup did not pass.'));}
  };
  changes.on(id,onChange);signal.addEventListener('abort',onAbort,{once:true});
  if(signal.aborted)onAbort();else{const setup=getSetup(id);if(setup)onChange(setup);else{cleanup();reject(new Error('Verification setup was not found.'));}}
 });
}
export function setupProfile():Profile{return loadProfile('inspection-only');}
export async function verifySubmissionSetup(s:RepositorySetup,repo:string,head:string,id:string,onProgress:(text:string)=>void):Promise<Evidence[]> {
 const source=ensureWorktree(repo,`verify-${id}`,head),outDir=join(DATA,'cases',id,'setup-checks');
 const run=await runSetupChecks({plan:{image:s.run!.imageDigest!,commands:s.detection!.commands},sourceDir:source,outDir,onProgress});
 writeFileSync(join(outDir,'run.json'),JSON.stringify(run,null,2)+'\n');
 const evidence:Evidence[]=run.checks.map((check)=>({id:`repository-setup-${check.id}`,check:'repository-setup',domain:'backend',asserts:'The trusted verification command completes successfully at the submitted head; this alone does not establish individual claim correctness.',performedBy:`isolated container ${run.imageDigest??s.detection!.image}`,commands:[s.detection!.commands.find(c=>c.id===check.id)!.argv.join(' ')],commits:[head],status:check.status,summary:check.summary,reason:check.status==='passed'?undefined:run.reason??check.summary,durationMs:check.durationMs,logs:[relative(ROOT,check.log)],details:{setupId:s.id,baselineCommit:s.commit,exitCode:check.exitCode,testCount:null,scope:'Full configured head checks; no base/head regression comparison or assertion-scope proof is claimed.'}}));
 evidence.unshift({id:'repository-setup-overall',check:'repository-setup',domain:'backend',asserts:'All commands in the trusted repository setup completed at head.',performedBy:`isolated container ${run.imageDigest??s.detection!.image}`,commands:s.detection!.commands.map(c=>c.argv.join(' ')),commits:[head],status:run.status,summary:run.reason??`Repository verification ${run.status}; command outcomes only, test counts unavailable.`,durationMs:run.durationMs,logs:[relative(ROOT,join(outDir,'run.json'))],details:{setupId:s.id,baselineCommit:s.commit,testCount:null}});return evidence;
}
export async function stopSetups(){for(const [id,child] of active){if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}}const s=getSetup(id);if(s){s.status='interrupted';s.error='The server stopped during setup.';save(s);}}active.clear();await cancelSetupRuns();}
