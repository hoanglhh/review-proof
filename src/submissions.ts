// User submissions are separate from benchmark fixtures. Only trusted installed profiles supply commands.
import {randomUUID, createHash} from 'node:crypto';
import {spawn, type ChildProcess} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, writeFileSync, renameSync, realpathSync} from 'node:fs';
import {join} from 'node:path';
import {DATA, ROOT, WORK, loadProfile, readJson, type Case} from './config.ts';
import {git} from './git.ts';

import {reusableSetup,setupForAssessment,waitForVerifiedSetup,setupProfile,verifySubmissionSetup,type RepositorySetup} from './repository-setup.ts';

import {persistSetupGate} from './setup-gate.ts';

export const SUBMISSIONS = join(DATA,'submissions');
export const STAGES = ['prepare','setup','ingest','check','review','assemble'] as const;
export type Job = {id:string; status:'running'|'awaiting_setup'|'completed'|'failed'|'interrupted';setupId?:string;setupStatus?:RepositorySetup['status'];stage:string;startedAt:string;updatedAt:string;owner:string;repository:string;log:string;error?:string;exitCode?:number|null};
const active = new Map<string,ChildProcess|null>();
const waiting = new Map<string,AbortController>();
const safeId = (id:string) => /^submission-[0-9a-f-]{36}$/.test(id);
export const installedProfiles = () => readdirSync(join(ROOT,'profiles')).filter(f=>/^[a-z0-9_-]+\.json$/.test(f)).map(f=>f.slice(0,-5));
export function validateSubmission(f:URLSearchParams, profiles=['auto',...installedProfiles()]) {
  const errors:string[]=[];
  for(const key of ['repository','base','head','requirement','owner','profile']) if(f.getAll(key).length!==1) errors.push(`Supply ${key} exactly once.`);
  if(f.getAll('requirementId').length>1) errors.push('Supply the requirement ID once.');
  const repo=f.get('repository')?.trim()??'';
  const local=repo.startsWith('/')&&!repo.includes('\0')&&!repo.includes('\n');
  const remote=/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(repo);
  if((!local&&!remote)||repo.length>4096) errors.push('Use an absolute local Git repository path or an HTTPS GitHub repository URL.');
  for(const key of ['base','head']) if(!/^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]{0,199}$/.test(f.get(key)??'')) errors.push(`Enter a valid ${key} branch, tag or commit.`);
  for(const [key,max] of [['owner',120],['requirement',50000]] as const) if(!f.get(key)?.trim()||f.get(key)!.length>max) errors.push(`Supply ${key} (maximum ${max} characters).`);
  if((f.get('requirementId')??'').length>120) errors.push('Requirement ID must be at most 120 characters.');
  if(!profiles.includes(f.get('profile')??'')) errors.push('Choose an installed verification profile.');
  if(!['auto','inspection-only'].includes(f.get('profile')??'')&&f.get('trustProfile')!=='yes') errors.push('Confirm that the selected verification profile is trusted for this repository.');
  return errors;
}
function saveJob(job:Job) {
  job.updatedAt=new Date().toISOString();
  const dir=join(SUBMISSIONS,job.id);mkdirSync(dir,{recursive:true});
  const tmp=join(dir,'job.tmp');writeFileSync(tmp,JSON.stringify(job,null,2)+'\n');renameSync(tmp,join(dir,'job.json'));
}
export function submissionJob(id:string):Job|null {
  if(!safeId(id)||!existsSync(join(SUBMISSIONS,id,'job.json')))return null;
  const job:Job=readJson(join(SUBMISSIONS,id,'job.json'));
  if((job.status==='running'&&!active.has(id))||(job.status==='awaiting_setup'&&!waiting.has(id))){job.status='interrupted';job.error='The server stopped before this assessment completed. Submit a new assessment to retry.';saveJob(job);}
  return job;
}
export function submissionJobs():Job[]{return existsSync(SUBMISSIONS)?readdirSync(SUBMISSIONS).map(submissionJob).filter((j):j is Job=>!!j).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)):[];}
function terminate(child:ChildProcess|null) {
  if(!child?.pid)return;
  try { process.kill(-child.pid,'SIGTERM'); } catch { child.kill('SIGTERM'); }
}
function command(job:Job, executable:string,args:string[],cwd=ROOT) {
  if(!active.has(job.id))return Promise.reject(new Error('The assessment was interrupted.'));
  return new Promise<void>((resolve,reject)=>{
    const child=spawn(executable,args,{cwd,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});active.set(job.id,child);
    const timer=setTimeout(()=>{terminate(child);reject(new Error(`${job.stage} timed out.`));},job.stage==='prepare'?180000:3*3600000);
    const output=(chunk:Buffer)=>{job.log=(job.log+chunk.toString()).slice(-16000);saveJob(job);};child.stdout!.on('data',output);child.stderr!.on('data',output);
    child.on('error',err=>{clearTimeout(timer);reject(err);});child.on('close',code=>{clearTimeout(timer);job.exitCode=code;if(code===0)resolve();else reject(new Error(`${job.stage} stopped with exit code ${code}. See the log below.`));});
  });
}
async function execute(job:Job,f:URLSearchParams) {
  try {
    const repository=f.get('repository')!.trim();
    const clone=join(WORK,'submission-repos',job.id);mkdirSync(join(WORK,'submission-repos'),{recursive:true});
    await command(job,'git',['-c','core.hooksPath=/dev/null','clone','--quiet','--no-checkout','--no-local','--',repository,clone]);
    const revision=(ref:string)=>{
      for(const candidate of /^[0-9a-f]{40}$/.test(ref) ? [ref] : [`refs/remotes/origin/${ref}`,ref]){try{return git(clone,['rev-parse','--verify','--end-of-options',`${candidate}^{commit}`]).trim();}catch{}}
      throw new Error(`Revision "${ref}" was not found in the repository.`);
    };
    const base=revision(f.get('base')!),head=revision(f.get('head')!);
    if(base===head)throw new Error('Base and head resolve to the same commit. Choose a comparison with changes.');
    git(clone,['update-ref','refs/heads/assessment-base',base]);git(clone,['update-ref','refs/heads/assessment-head',head]);
    const c:Case={id:job.id,profile:job.id,repository:clone,sourceRepository:repository,base,head,requirement:{id:f.get('requirementId')?.trim()||'Submitted requirement',text:f.get('requirement')!.trim()},submission:true};
    let verified:RepositorySetup|undefined;
    if(f.get('profile')==='auto'){
      job.stage='setup';job.log+='Checking for a verified setup matching the pinned head configuration.\n';saveJob(job);
      verified=reusableSetup(repository,clone,base,head);
      if(!verified){
        const setup=setupForAssessment(repository,clone,head,job.id);job.setupId=setup.id;job.setupStatus=setup.status;
        if(!setup.detection?.runnable)throw new Error(`Automatic verification is unavailable for this configuration: ${setup.detection?.limitations.join(' ')??'No supported checks detected.'} Review the detected plan or select another verification mode.`);
        const controller=new AbortController();waiting.set(job.id,controller);active.delete(job.id);job.status='awaiting_setup';
        job.log+='No matching verified setup. Review the detected execution plan; this assessment will continue after you trust it and its baseline passes.\n';saveJob(job);
        verified=await waitForVerifiedSetup(setup.id,controller.signal,current=>{
          if(!waiting.has(job.id))return;job.setupStatus=current.status;saveJob(job);
        });
        if(controller.signal.aborted)throw new Error('The assessment was interrupted.');
        waiting.delete(job.id);active.set(job.id,null);job.status='running';job.log+='Repository baseline passed. Continuing this assessment with the original pinned commits.\n';saveJob(job);
      }else{job.setupId=verified.id;job.setupStatus='verified';job.log+='Reusing the verified repository setup.\n';saveJob(job);}
    }
    if(verified)c.verificationSetup={id:verified.id,fingerprint:verified.detection!.fingerprint};
    const profile=verified?setupProfile():loadProfile(f.get('profile')!);const identity=repository.startsWith('/')?realpathSync(repository):repository.replace(/\.git\/?$/,'').replace(/\/$/,'').toLowerCase();
    const scope=createHash('sha256').update(identity).digest('hex').slice(0,16);
    profile.areas=profile.areas.map(a=>({...a,name:`repository-${scope}/${a.name}`,owner:job.owner}));
    writeFileSync(join(SUBMISSIONS,job.id,'profile.json'),JSON.stringify(profile,null,2)+'\n');
    writeFileSync(join(SUBMISSIONS,job.id,'case.json'),JSON.stringify(c,null,2)+'\n');
    job.log+=`Source snapshot ${clone}\nPinned base ${base}\nPinned head ${head}\n`;
    if(f.get('profile')==='inspection-only')job.log+='No executable verification configured: code inspection only.\n';
    for(const stage of ['ingest','check','review','assemble'] as const){job.stage=stage;job.log+=`\nStarting ${stage}…\n`;saveJob(job);await command(job,process.execPath,[join(ROOT,'src/cli.ts'),stage,job.id]);
      if(stage==='check' && (f.get('profile')==='inspection-only'||verified)) {
        const path=join(DATA,'cases',job.id,'check.json');const checks=readJson(path);
        if(verified){
          job.log+='Running the verified repository setup against the full configured head scope.\n';saveJob(job);
          checks.evidence.push(...await verifySubmissionSetup(verified,clone,head,job.id,text=>{if(!active.has(job.id))return;job.log=(job.log+text).slice(-16000);saveJob(job);}));
          checks.notChecked.push({what:'Regression discrimination and test assertion scope',reason:'The automatic setup runs configured commands on head. It does not compare base with head tests or prove claim-specific assertions.'});
        }else checks.notChecked.push({what:'Executable verification and language-specific coverage',reason:'No trusted executable verification is configured for this submission. Only generic pattern scans and AI inspection are available; no tests were executed.'});
        writeFileSync(path,JSON.stringify(checks,null,2)+'\n');
      }
    }
    if(verified)persistSetupGate(job.id);
    job.status='completed';
  }catch(e){job.status=active.has(job.id)||waiting.has(job.id)?'failed':'interrupted';job.error=e instanceof Error?e.message:String(e);}
  finally{saveJob(job);active.delete(job.id);waiting.delete(job.id);}
}
export function startSubmission(f:URLSearchParams):Job {
  const errors=validateSubmission(f);if(errors.length)throw new Error(errors.join(' '));
  if(active.size||waiting.size)throw new Error('Another assessment is running. Wait for it to finish before starting another.');
  const at=new Date().toISOString();const job:Job={id:`submission-${randomUUID()}`,status:'running',stage:'prepare',startedAt:at,updatedAt:at,owner:f.get('owner')!.trim(),repository:f.get('repository')!.trim(),log:'Resolving repository and revisions…\n'};
  active.set(job.id,null);saveJob(job);
  void execute(job,new URLSearchParams(f));return job;
}
export function cancelPendingSubmission(id:string){
 const controller=waiting.get(id),job=submissionJob(id);
 if(!controller||!job||job.status!=='awaiting_setup'||job.setupStatus!=='review')throw new Error('Only an assessment awaiting plan confirmation can be cancelled here.');
 waiting.delete(id);controller.abort();job.status='interrupted';job.error='Assessment cancelled before verification. You can start another assessment with a different verification mode.';saveJob(job);
}
export const submissionsRunning=()=>active.size>0;
export function stopSubmissions(){for(const [id,controller] of waiting){controller.abort();const job:Job=readJson(join(SUBMISSIONS,id,'job.json'));job.status='interrupted';job.error='The server stopped while waiting for setup. Submit a new assessment to retry.';saveJob(job);}waiting.clear();for(const [id,child] of active){terminate(child);const file=join(SUBMISSIONS,id,'job.json');if(existsSync(file)){const job:Job=readJson(file);job.status='interrupted';job.error='The server stopped. Submit a new assessment to retry.';saveJob(job);}}active.clear();}
