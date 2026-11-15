import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderHtml} from '../src/render.ts';
import {renderBlind,renderMetrics} from '../src/pages.ts';
import {computeMetrics} from '../src/metrics.ts';
import {experimentRecord,renderExperiment,renderExperiments} from '../src/experiment.ts';
import {targetedReviewRecord,targetedComparisonRecord,renderTargetedReview,renderTargetedComparison,renderTargetedSummary} from '../src/targeted-experiment.ts';

const report=JSON.parse(readFileSync(new URL('../data/cases/2283/report.json',import.meta.url),'utf8'));
const hash='a'.repeat(64),requirement={title:'Fixture',body:'Requirement'};
const common={reportHash:hash,name:'Synthetic fixture',priorExposure:'no',human:'yes',fullReadNeeded:'yes',unresolvedQuestions:'None'};
const noTiming=(value:object)=>{
  for(const key of ['activeSeconds','activeSecondsSource','phaseSeconds','timingSource','externalSeconds','externalSecondsSource']) assert.equal(key in value,false,key);
};

test('all review pages work without timers or timing fields, including historical records',()=>{
  const initial=targetedReviewRecord(report,hash,new URLSearchParams({...common,notes:'Initial notes'}),'fixture');
  const comparison=targetedComparisonRecord(initial,hash,new URLSearchParams({reportHash:hash,reviewId:initial.id,human:'yes',fullRead:'yes',fullReadNeeded:'no',addedFindings:'None',remainingQuestions:'None'}));
  const observation=experimentRecord(report.case.id,hash,new URLSearchParams({...common,method:'sheet',evidenceOpenings:'1'}));
  [initial,comparison,observation].forEach(noTiming);
  const historicalInitial={...initial,activeSeconds:12,externalSeconds:3};
  const historicalObservation={...observation,activeSeconds:19,phaseSeconds:{reading:10,evidence:2,code:3,decisions:4},externalSeconds:7};
  const metrics=computeMetrics([report],[{caseId:report.case.id,activeSeconds:99}],null);
  noTiming(metrics);
  const pages=[renderHtml(report,()=> '#',5,{nonce:'nonce',reportHash:hash,signoffs:[{owner:"Historical fixture",signedAt:"2026-11-15",action:"accept",reason:"Historical reason",reportHash:hash,activeSeconds:99}],errors:[],form:new URLSearchParams()}),renderBlind(report,requirement,'nonce'),renderMetrics(metrics),renderExperiment(report,requirement,hash,'nonce'),renderExperiments([historicalObservation]),renderTargetedReview(report,requirement,hash,'nonce'),renderTargetedComparison(report,historicalInitial,'nonce'),renderTargetedSummary([historicalInitial],[comparison])];
  for(const html of pages) assert.doesNotMatch(html,/performance\.now|visibilitychange|name="(?:activeSeconds|externalSeconds|started|readingSeconds|evidenceSeconds|codeSeconds|decisionsSeconds)"|id="(?:start|pause|elapsed|timer-status)"|Focused time:|Focused total|Initial effort|Active review time/);
  assert.doesNotMatch(renderTargetedReview(report,requirement,hash,'nonce'),/id="material" hidden/);
});
