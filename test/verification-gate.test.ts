// Synthetic completed runs exercise the actual evidence builder and signing boundary.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testEvidence} from '../src/checks.ts';
import {gateTestFailures,gateSetupReport} from '../src/setup-gate.ts';
import {validateSignoff} from '../src/server.ts';
import type {Report,Evidence} from '../src/report.ts';
import type {Run} from '../src/runner.ts';

const run=(tests:[string,'passed'|'failed'][]):Run=>({name:'fixture',performedBy:'synthetic fixture',command:'fixture',worktree:'fixture',sourceCommit:'a'.repeat(40),testsCommit:'b'.repeat(40),project:'fixture',startedAt:'',durationMs:0,exitCode:0,status:'completed',tests:tests.map(([name,outcome])=>({name,outcome,rawOutcome:outcome}))});
// Only the fields consumed by the gate and sign-off validator are needed here.
const report=(evidence:Evidence[])=>({case:{id:'unregistered-benchmark-fixture'},evidence,claims:[],decisions:[],route:{evidenceRoute:'light',effectiveRoute:'light',readRatio:0,ifUnblocked:null,reasons:[{code:'all-proven',detail:'Synthetic pre-gate route'}]}} as unknown as Report);

for(const [name,head,base,without] of [
 ['new test fails at head',run([['New','failed']]),run([]),run([['New','failed']])],
 ['existing test regresses',run([['Old','failed']]),run([['Old','passed']]),run([['Old','passed']])],
 ['passing test is removed',run([['Keep','passed']]),run([['Keep','passed'],['Removed','passed']]),run([['Keep','passed']])],
] as const){
 test(`unlinked verification blocks signing when ${name}`,()=>{
  const original=report(testEvidence('fixture',head,base,without,false)),gated=gateTestFailures(original);
  assert.equal(gated.route.effectiveRoute,'blocked');assert.equal(gated.route.evidenceRoute,'blocked');assert.equal(gated.route.readRatio,null);assert.equal(gated.route.ifUnblocked,null);
  assert.ok(gated.route.reasons.some(reason=>reason.code==='test-verification'));
  assert.deepEqual(gateTestFailures(gated),gated);
  assert.equal(original.route.effectiveRoute,'light');
  const form=new URLSearchParams({reportHash:'fixture',name:'Synthetic fixture only',action:'accept',reason:'Synthetic refusal check'});
  assert.ok(validateSignoff(gated,'fixture',form).some(error=>error.includes('report is blocked')));
 });
}

test('non-discriminating tests and unavailable checks do not become fabricated test failures',()=>{
 const evidence=testEvidence('fixture',run([['New','passed']]),run([]),run([['New','passed']]),false);
 assert.equal(evidence.find(e=>e.check==='tests-without-change')!.status,'failed');
 const original=report(evidence);assert.equal(gateTestFailures(original),original);
 for(const status of ['not_run','inconclusive','passed'] as const){
  const unavailable=report(evidence.map(e=>({...e,status})));assert.equal(gateTestFailures(unavailable),unavailable);
 }
});

test('benchmark reports retain their frozen routing policy',()=>{
 const original=report(testEvidence('fixture',run([['Old','failed']]),run([['Old','passed']]),run([['Old','passed']]),false));
 assert.equal(gateSetupReport(original),original);
});
