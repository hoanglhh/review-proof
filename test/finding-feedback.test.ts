import test from "node:test";
import assert from "node:assert/strict";
import type { Report } from "../src/report.ts";
import { findingFeedbackRecord, renderFindingFeedback, renderFindingFeedbackSummary, validateFindingFeedback } from "../src/finding-feedback.ts";

const hash = "a".repeat(64);
const oldHash = "b".repeat(64);
const at = "2026-11-15T10:00:00.000Z";
function report(id = "synthetic-feedback"): Report {
  return { case: { id, title: "Synthetic feedback fixture" }, route: { effectiveRoute: "blocked" }, findings: [
    { id: "F1", statement: "<script>untrusted finding</script>", status: "suspected", hunkIds: [], citations: [
      { path: "src/<code>.ts", commit: "c".repeat(40), startLine: 2, endLine: 3, quote: "if (a < b) return false;" },
    ] },
    { id: "F2", statement: "Second synthetic finding", status: "reproduced", citations: [], hunkIds: [] },
  ] } as Report;
}
function form(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({ reportHash: hash, findingId: "F1", name: "Casey", verdict: "real", explanation: "The return skips the required branch.", evidence: "Synthetic check example: input 1 produces false.", human: "yes", ...overrides });
}
const record = (overrides: Record<string, string> = {}, r = report()) => findingFeedbackRecord(r, hash, form(overrides), at);
function count(html: string, label: string, expected: number) {
  assert.ok(html.includes(`<dt>${label}</dt><dd>${expected}</dd>`), `${label} should be ${expected}`);
}

test("a person can judge one finding on a blocked report without a sign-off", () => {
  assert.deepEqual(validateFindingFeedback(report(), hash, form()), []);
  assert.deepEqual(validateFindingFeedback(report(), hash, form({ verdict: "not_real" })), []);
  assert.deepEqual(validateFindingFeedback(report(), hash, form({ verdict: "unsure", evidence: "" })), []);
});

test("decisive judgments need supporting evidence and all judgments need an explanation", () => {
  for (const verdict of ["real", "not_real"]) assert.ok(validateFindingFeedback(report(), hash, form({ verdict, evidence: " \n " })).some(e => /evidence/i.test(e)));
  assert.ok(validateFindingFeedback(report(), hash, form({ verdict: "unsure", explanation: " " })).some(e => /explanation/i.test(e)));
});

test("rejects stale hashes, unknown findings, missing declaration and malformed fields", () => {
  for (const overrides of [
    { reportHash: oldHash }, { reportHash: "" }, { findingId: "missing" }, { findingId: "" },
    { name: " " }, { name: "Casey\u0000" }, { verdict: "verified" }, { human: "true" }, { human: "" },
    { explanation: "contains\u0001control" }, { evidence: "bad\u0000text" },
    { name: "n".repeat(201) }, { explanation: "x".repeat(10001) }, { evidence: "x".repeat(10001) },
    { findingId: "F".repeat(301) }, { reportHash: hash + "a" },
  ]) {
    const f = form(overrides);
    assert.ok(validateFindingFeedback(report(), hash, f).length, JSON.stringify(overrides).slice(0, 100));
    assert.throws(() => findingFeedbackRecord(report(), hash, f), /feedback/i);
  }
  assert.ok(validateFindingFeedback(report(), "malformed", form({ reportHash: "malformed" })).length);
});

test("rejects duplicate and unexpected fields, including multiple finding IDs", () => {
  for (const [key, value] of [["name", "Other"], ["findingId", "F2"], ["human", "yes"], ["unexpected", "anything"]]) {
    const f = form(); f.append(key, value);
    assert.ok(validateFindingFeedback(report(), hash, f).length, key);
  }
});

test("records a trimmed self-declared judgment and independent finding snapshot", () => {
  const r = report();
  const result = findingFeedbackRecord(r, hash, form({ name: " Casey ", explanation: " Checked branch ", evidence: " Synthetic trace " }), at);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.caseId, r.case.id);
  assert.equal(result.reportHash, hash);
  assert.equal(result.findingId, "F1");
  assert.equal(result.reviewer, "Casey");
  assert.equal(result.identity, "self-declared");
  assert.equal(result.human, true);
  assert.equal(result.recordedAt, at);
  assert.equal(result.explanation, "Checked branch");
  assert.equal(result.evidence, "Synthetic trace");
  assert.equal(result.statement, r.findings[0].statement);
  assert.deepEqual(result.citations, r.findings[0].citations);
  r.findings[0].citations[0].quote = "changed";
  assert.notEqual(result.citations[0].quote, "changed");
});

test("form shows every finding, citations, history, self declaration and retained invalid input safely", () => {
  const history = [record({ name: "<img src=x onerror=alert(1)>" }), { ...record(), reportHash: oldHash }];
  const html = renderFindingFeedback(report(), hash, history, ["<bad error>"], form({ findingId: "F2", name: "<bad name>", verdict: "unsure", explanation: "<bad explanation>" }));
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes('action="/case/synthetic-feedback/findings"'));
  assert.ok(html.includes('name="reportHash"'));
  assert.ok(html.includes('name="findingId"'));
  assert.ok(html.includes('name="human" value="yes"'));
  assert.ok(html.includes('name="evidence"'));
  assert.ok(html.includes("F1")); assert.ok(html.includes("F2"));
  assert.ok(html.includes("src/&lt;code&gt;.ts"));
  assert.ok(html.includes("if (a &lt; b) return false;"));
  assert.ok(html.includes("&lt;bad error&gt;"));
  assert.ok(html.includes("&lt;bad name&gt;"));
  assert.ok(html.includes("&lt;bad explanation&gt;"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes("Previous report version"));
  assert.ok(html.includes("self-declared"));
  assert.ok(html.includes("append-only"));
  assert.ok(!html.includes("<script>untrusted"));
  assert.ok(!/<button[^>]*\sdisabled(?:\s|>)/.test(html));
});

test("summary counts current findings once and preserves uncertainty alongside decisive judgments", () => {
  const html = renderFindingFeedbackSummary([{ report: report(), hash }], [
    record(), record({ name: "Jordan", verdict: "unsure", evidence: "" }), record({ findingId: "F2", verdict: "not_real" }),
  ]);
  count(html, "Total current findings", 2);
  count(html, "Human judgments: real problem", 0);
  count(html, "Human judgments: not a problem", 1);
  count(html, "Uncertain", 1);
  count(html, "Disputed", 0);
  count(html, "Unjudged", 0);
  count(html, "Raw history records", 3);
  assert.ok(html.includes("synthetic-feedback"));
  assert.ok(html.includes("not verified truth"));
  assert.ok(!/accuracy|precision|false.positive rate/i.test(html));
});

test("opposing decisive judgments are disputed even if an uncertain judgment also exists", () => {
  const html = renderFindingFeedbackSummary([{ report: report(), hash }], [record(), record({ name: "Jordan", verdict: "not_real" }), record({ name: "Pat", verdict: "unsure", evidence: "" })]);
  count(html, "Disputed", 1); count(html, "Uncertain", 0); count(html, "Unjudged", 1);
});

test("latest appended feedback per normalized self-declared reviewer supersedes earlier judgments", () => {
  const html = renderFindingFeedbackSummary([{ report: report(), hash }], [record(), record({ name: " casey ", verdict: "unsure", evidence: "" })]);
  count(html, "Uncertain", 1); count(html, "Disputed", 0);
  count(html, "Current matching records", 2); count(html, "Superseded current records", 1);
  assert.ok(html.includes("latest appended"));
});

test("summary excludes stale hashes, unknown findings and reports outside the supplied current set", () => {
  const records = [record(), { ...record(), reportHash: oldHash }, { ...record(), findingId: "removed" }, record({}, report("other-case"))];
  const html = renderFindingFeedbackSummary([{ report: report(), hash }], records);
  count(html, "Raw history records", 4); count(html, "Current matching records", 1);
  count(html, "Stale report records", 1); count(html, "Other excluded records", 2);
  count(html, "Human judgments: real problem", 1); count(html, "Unjudged", 1);
  const empty = renderFindingFeedbackSummary([], records);
  count(empty, "Total current findings", 0); count(empty, "Other excluded records", 4);
});

test("summary escapes case IDs, reviewer names and statements", () => {
  const r = report('<img src=x>');
  const html = renderFindingFeedbackSummary([{ report: r, hash }], [record({ name: "<script>bad</script>" }, r)]);
  assert.ok(html.includes("&lt;img src=x&gt;"));
  assert.ok(!html.includes("<img src=x>"));
  assert.ok(!html.includes("<script>bad</script>"));
  assert.ok(!html.includes("<script>untrusted"));
});
