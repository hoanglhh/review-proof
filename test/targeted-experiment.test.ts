import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Report } from "../src/report.ts";
import { validateTargetedReview, targetedReviewRecord, validateTargetedComparison, targetedComparisonRecord, renderTargetedReview, renderTargetedComparison, renderTargetedSummary } from "../src/targeted-experiment.ts";

const hash = "a".repeat(64);
const report: Report = JSON.parse(readFileSync(new URL("../data/cases/2283/report.json", import.meta.url), "utf8"));
const fixture = (): Report => ({ ...report, hunks: [{ id: "selected", file: "selected.ts", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, removed: ["old selected"], added: ["new selected"] }, { id: "omitted", file: "omitted.ts", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, removed: ["old omitted"], added: ["new omitted"] }], route: { ...report.route, effectiveRoute: "blocked", readingList: [{ hunkId: "selected", file: "selected.ts", lines: 2, why: ["stands for 3 identical hunks"] }] } });
const form = (overrides: Record<string, string> = {}) => new URLSearchParams({ reportHash: hash, name: "A person", priorExposure: "no", notes: "Looks consistent", unresolvedQuestions: "None", fullReadNeeded: "yes", human: "yes", ...overrides });
const review = () => targetedReviewRecord(fixture(), hash, form(), "record-1", "2026-11-15T00:00:00Z");
const comparison = (overrides: Record<string, string> = {}) => new URLSearchParams({ reportHash: hash, reviewId: "record-1", addedFindings: "None", remainingQuestions: "None", fullReadNeeded: "no", human: "yes", fullRead: "yes", ...overrides });

test("targeted records reject stale, duplicate, unexpected, oversized and malformed input", () => {
  assert.deepEqual(validateTargetedReview(fixture(), hash, form()), []);
  for (const [key, values] of Object.entries({ reportHash: ["old"], name: ["", "x".repeat(121)], notes: [" ", "x".repeat(4001)], unresolvedQuestions: ["", "x".repeat(4001)], priorExposure: ["true"], fullReadNeeded: [""], human: ["no"] })) {
    for (const value of values) assert.ok(validateTargetedReview(fixture(), hash, form({ [key]: value })).length, `${key}=${value}`);
  }
  for (const key of ["name", "notes"]) { const f = form(); f.append(key, ""); assert.ok(validateTargetedReview(fixture(), hash, f).length); }
  assert.ok(validateTargetedReview(fixture(), hash, form({ arbitrary: "value" })).length);
  assert.throws(() => targetedReviewRecord(fixture(), hash, form({ human: "no" }), "record-1"));
  assert.throws(() => targetedReviewRecord(fixture(), hash, form(), "../unsafe"));
});

test("records preserve selected hunks and self declaration without collecting review time", () => {
  const record = review();
  assert.deepEqual(record.selectedHunkIds, ["selected"]);
  assert.equal(record.caseId, report.case.id);
  assert.equal("activeSeconds" in record, false);
  assert.equal("externalSeconds" in record, false);
  assert.equal(record.identity, "self-declared");
  assert.ok(validateTargetedReview(fixture(), hash, form({ activeSeconds: "12" })).length);
});

test("comparison is tied to the locked initial record and current report", () => {
  assert.deepEqual(validateTargetedComparison(review(), hash, comparison()), []);
  for (const [key, value] of Object.entries({ reviewId: "other", reportHash: "b".repeat(64), fullRead: "no", addedFindings: "", remainingQuestions: "x".repeat(4001), human: "no" })) assert.ok(validateTargetedComparison(review(), hash, comparison({ [key]: value })).length, key);
  assert.ok(validateTargetedComparison(review(), "b".repeat(64), comparison()).length);
  const duplicate = comparison(); duplicate.append("fullRead", "yes"); assert.ok(validateTargetedComparison(review(), hash, duplicate).length);
  const record = targetedComparisonRecord(review(), hash, comparison());
  assert.equal(record.reviewId, "record-1");
  assert.equal("activeSeconds" in record, false);
  assert.equal("externalSeconds" in record, false);
  assert.equal(record.fullReadAttested, true);
  assert.equal(review().notes, "Looks consistent");
});

test("initial page includes only selected changed lines and preserves the real route", () => {
  const html = renderTargetedReview(fixture(), { title: "<title>", body: "<requirement>" }, hash, "nonce");
  assert.match(html, /&lt;requirement&gt;/);
  assert.match(html, /new selected/);
  assert.doesNotMatch(html, /new omitted|old omitted/);
  assert.match(html, /stands for 3 identical hunks/);
  assert.match(html, /blocked/);
  assert.doesNotMatch(html, /id="material" hidden|timer-status|performance.now/);
  assert.match(html, /never authorizes skipping code/);
  assert.doesNotMatch(html, /action="[^"]*\/(signoff|spotcheck|confirm)/);
  const full = renderTargetedComparison(fixture(), review(), "nonce");
  assert.match(full, /new omitted/);
  assert.match(full, /Locked initial notes/);
  assert.match(full, /Looks consistent/);
  assert.match(full, /not complete source files or repository inspection/);
  assert.doesNotMatch(full, /name="notes"/);
});

test("targeted material includes linked evidence and selected citations without exposing omitted code", () => {
  const r = fixture();
  const citation = { path: "selected.ts", commit: r.case.head, startLine: 1, endLine: 1, quote: "<selected citation>" };
  r.claims = [{ id: "linked", statement: "<linked claim>", requirementIds: [], evidenceIds: ["check-linked"], testNames: ["<test name>"], hunkIds: ["selected"], citations: [citation, { ...citation, path: "omitted.ts", quote: "SECRET OMITTED SOURCE" }], state: "argued", stateReason: "<reason>" }, { id: "unlinked", statement: "SECRET OMITTED CLAIM", requirementIds: [], evidenceIds: [], testNames: [], hunkIds: ["omitted"], citations: [], state: "not_checked", stateReason: "" }];
  r.decisions = [{ id: "decision-linked", statement: "<decision>", whyHuman: "Needs judgment", options: ["<option>"], hunkIds: ["selected"], citations: [citation], raisedBy: { kind: "rule", name: "rule" } }];
  r.findings = [{ id: "finding-linked", statement: "<finding>", status: "suspected", citations: [citation], hunkIds: ["selected"] }];
  r.evidence = [{ id: "check-linked", check: "fixture", domain: "general", asserts: "<assertion>", performedBy: "<runner>", commands: [], commits: [], status: "passed", summary: "<summary>", durationMs: 1, logs: ["data/cases/2283/check <log>.txt", "javascript:alert(1)"], tests: [{ name: "<evidence test>" }] }];
  const html = renderTargetedReview(r, { title: "Requirement", body: "Body" }, hash, "nonce");
  for (const escaped of ["&lt;linked claim&gt;", "&lt;test name&gt;", "&lt;selected citation&gt;", "&lt;decision&gt;", "&lt;finding&gt;", "&lt;summary&gt;", "&lt;evidence test&gt;"]) assert.ok(html.includes(escaped), escaped);
  assert.match(html, /href="\/data\/cases\/2283\/check%20%3Clog%3E.txt" target="_blank" rel="noopener"/);
  assert.doesNotMatch(html, /SECRET OMITTED|href="javascript:/);
});

test("summary isolates unique first reads and retains exposure, repeated and incomplete records", () => {
  const first = review();
  const repeat = targetedReviewRecord(fixture(), hash, form({ name: " a PERSON " }), "repeat", "2026-11-15T00:01:00Z");
  const exposed = targetedReviewRecord(fixture(), hash, form({ name: "Someone else", priorExposure: "yes" }), "exposed", "2026-11-15T00:02:00Z");
  const second = targetedReviewRecord(fixture(), hash, form({ name: "Another person" }), "second", "2026-11-15T00:03:00Z");
  const html = renderTargetedSummary([repeat, exposed, second, first], [targetedComparisonRecord(first, hash, comparison())]);
  assert.match(html, /4 initial records/);
  assert.match(html, /2 unique reviewer and case first-read records/);
  assert.match(html, /1\/2/);
  assert.doesNotMatch(html, /Initial effort|Separate effort|focused page time/);
  assert.match(html, /Incomplete/);
  assert.match(html, /Prior exposure/);
  assert.match(html, /Repeated/);
  assert.match(html, /No time-savings or safety conclusion/);
  assert.match(html, new RegExp(hash));
});
