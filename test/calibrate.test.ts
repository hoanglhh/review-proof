// Synthetic reports only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPlant, summarize } from "../src/calibrate.ts";

const h = (id: string, file: string, added: string[], newStart = 10) => ({ id, file, oldStart: newStart, oldLines: 0, newStart, newLines: added.length, removed: [], added });
const ev = (id: string, check: string, status: string) => ({ id, check, status, summary: `${id} ${status}` });
const report = (o: any) => ({
  case: { head: "p".repeat(40) }, reviewer: { status: o.reviewer ?? "ok" }, route: { effectiveRoute: "full" },
  hunks: o.hunks, evidence: o.evidence ?? [], claims: o.claims ?? [], findings: o.findings ?? [], decisions: o.decisions ?? [],
}) as any;
const original = report({ hunks: [h("H1", "a.cs", ["fix"])], evidence: [ev("tests-at-head:p", "tests-at-head", "passed"), ev("security-surface", "security-surface", "passed")] });

test("a check that passed on the original and fails with the plant is a catch by a run", () => {
  const planted = report({ hunks: [h("H1", "a.cs", ["fix"]), h("H2", "a.cs", ["File.Write(x)"], 20)], evidence: [ev("tests-at-head:p", "tests-at-head", "passed"), ev("security-surface", "security-surface", "failed")] });
  const v = classifyPlant(original, planted);
  assert.equal(v.outcome, "caught_by_run");
  assert.deepEqual(v.plantedHunks, ["H2"]);
});

test("a finding that cites the planted lines is a catch by the model only; nothing pointing there is a miss", () => {
  const hunks = [h("H1", "a.cs", ["fix"]), h("H2", "a.cs", ["subtle"], 20)];
  const cite = (startLine: number) => ({ path: "a.cs", commit: "p".repeat(40), startLine, endLine: startLine, quote: "q" });
  assert.equal(classifyPlant(original, report({ hunks, findings: [{ id: "F1", statement: "s", hunkIds: [], citations: [cite(20)] }] })).outcome, "caught_by_model_only");
  assert.equal(classifyPlant(original, report({ hunks, findings: [{ id: "F1", statement: "s", hunkIds: ["H1"], citations: [cite(10)] }] })).outcome, "missed");
  assert.equal(classifyPlant(original, report({ hunks, reviewer: "unavailable" })).outcome, "model_not_run");
});

test("a plant that undoes part of the change is found by citations at the lines where the agent's hunk was", () => {
  const orig = report({ hunks: [h("H1", "a.cs", ["fix"]), h("H2", "t.tt", ["attr"], 30)] });
  const plantedHunks = [h("H1", "a.cs", ["fix"])]; // H2 undone: no new hunk at all
  const v = classifyPlant(orig, report({ hunks: plantedHunks, findings: [{ id: "F1", statement: "t.tt lacks attr", hunkIds: [], citations: [{ path: "t.tt", commit: "p".repeat(40), startLine: 31, endLine: 31, quote: "q" }] }] }));
  assert.equal(v.outcome, "caught_by_model_only");
  assert.deepEqual(v.undoneOriginalHunks, ["H2 t.tt:30"]);
  assert.equal(classifyPlant(orig, report({ hunks: plantedHunks })).outcome, "missed");
});

test("summary counts every outcome against the same total", () => {
  assert.deepEqual(summarize([{ outcome: "caught_by_run" }, { outcome: "missed" }, { outcome: "model_not_run" }]),
    { total: 3, caughtByRun: 1, caughtByModelOnly: 0, missed: 1, modelNotRun: 1 });
});
