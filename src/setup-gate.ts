// Submission test failures and setup evidence gate signing independently of model-chosen claim links.
import {existsSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {assembleCase as originalAssemble} from './assemble.ts';
import {caseDir,ROOT,readJson,writeJson,loadCase,type Case,type Profile} from './config.ts';
import type {Report} from './report.ts';
import {renderHtml,renderMarkdown} from './render.ts';
export function gateTestFailures(r:Report):Report {
 const failed=r.evidence.filter(e=>e.status==='failed'&&['tests-at-head','existing-tests'].includes(e.check));
 if(!failed.length)return r;
 const reasons=r.route.reasons.filter(reason=>reason.code!=='test-verification');
 reasons.push({code:'test-verification',detail:`Test verification failed: ${failed.map(e=>`${e.id}: ${e.summary}`).join('; ')}. These failures block signing independently of AI claim links.`});
 return {...r,route:{...r.route,evidenceRoute:'blocked',effectiveRoute:'blocked',readRatio:null,ifUnblocked:null,reasons}};
}
export function gateSetupReport(r:Report):Report {
 const bad=r.evidence.filter(e=>e.check==='repository-setup'&&e.status!=='passed').map(e=>`${e.id} (${e.status})`);
 let c:Case|undefined;try{if(r.case?.id)c=loadCase(r.case.id);}catch{}
 // Follow-up policy applies to submissions; benchmark routes retain their frozen rules.
 if(c?.submission)r=gateTestFailures(r);
 if(c?.verificationSetup){
  const file=join(caseDir(c.id),'setup-checks','run.json');
  if(!existsSync(file))bad.push('required repository verification result is missing');
  else {const run=readJson(file);if(run.status!=='passed')bad.push(`saved repository verification (${run.status})`);}
  if(!r.evidence.some(e=>e.id==='repository-setup-overall'&&e.check==='repository-setup'))bad.push('required repository verification evidence was removed; start a new assessment to rerun verification');
 }
 if(!bad.length)return r;
 const reasons=r.route.reasons.filter(x=>x.code!=='repository-verification');
 reasons.push({code:'repository-verification',detail:`Configured repository verification did not pass: ${bad.join(', ')}. Inspect the saved command outcomes before signing.`});
 return {...r,route:{...r.route,evidenceRoute:'blocked',effectiveRoute:'blocked',readRatio:null,ifUnblocked:null,reasons}};
}
export function persistSetupGate(id:string){
 const dir=caseDir(id),limit=readJson(join(ROOT,'policy.json')).sheet.maxFindingsShown;
 for(const suffix of ['','-earned']){
  const file=join(dir,`report${suffix}.json`);if(!existsSync(file))continue;
  const original:Report=readJson(file),report=gateSetupReport(original);if(report===original)continue;
  writeJson(file,report);writeFileSync(join(dir,`sheet${suffix}.html`),renderHtml(report,path=>relative(dir,join(ROOT,path)),limit));
  if(!suffix)writeFileSync(join(dir,'sheet.md'),renderMarkdown(report,'sheet.html',limit));
 }
}
export function assembleWithSetupGate(c:Case,p:Profile){const r=originalAssemble(c,p);if(!c.submission&&!c.verificationSetup&&!r.evidence.some(e=>e.check==='repository-setup'))return r;persistSetupGate(c.id);return gateSetupReport(r);}
