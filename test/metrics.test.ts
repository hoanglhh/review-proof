// Synthetic reports only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics } from "../src/metrics.ts";

const report = (id: string, route: string, claims: string[], cites?: [number, number], disc: boolean[] = []) => ({
  case: { id, title: "" }, inventory: { totals: { files: 1 } }, reviewer: { status: cites ? "ok" : "unavailable" },
  route: { totalLines: 10, readingListLines: 4, readRatio: route === "blocked" ? null : 1, evidenceRoute: route, effectiveRoute: route },
  findings: [], decisions: [], unexplained: [],
  claims: claims.map((state, i) => ({ id: `C${i}`, state })),
  evidence: [
    ...(cites ? [{ check: "citation-validation", status: "passed", details: { resolved: cites[0], citations: cites[1] } }] : []),
    { check: "tests-without-change", status: "failed", tests: disc.map((d, i) => ({ name: `T${i}`, head: "passed", discriminating: d })) },
  ],
}) as any;

test("every figure keeps its denominator; missing data stays missing", () => {
  const m = computeMetrics([report("1", "full", ["proven", "argued"], [9, 10], [true, false]), report("2", "blocked", [])], [], null);
  assert.deepEqual(m.claimsByState.proven, { n: 1, of: 2 });
  assert.deepEqual(m.citationValidity, { n: 9, of: 10 });
  assert.deepEqual(m.citationCasesWithReviewer, { n: 1, of: 2 });
  assert.deepEqual(m.discriminatingTests, { n: 1, of: 2 });
  assert.deepEqual(m.routeShare.blocked, { n: 1, of: 2 });
  assert.deepEqual(m.findingsMarked.real, { n: 0, of: 0 });
  assert.equal(m.calibration, null);
  assert.equal(m.cases[1].readRatio, null);
});

test("evaluation scopes identify cohorts and exclude feedback from other cases", () => {
  const rows = [report("sample-a", "full", ["proven"]), report("holdout-a", "blocked", ["broken"]), report("control-a", "targeted", ["argued"])];
  for (const r of rows) Object.assign(r, { findings: [], decisions: [], unexplained: [] });
  rows[2].findings = [{ id: "F1" }];
  rows[2].decisions = [{ raisedBy: { kind: "model" } }, { raisedBy: { kind: "rule" } }];
  rows[2].unexplained = ["H1", "H2"];
  const groups = { "sample-a": "sample", "holdout-a": "holdout", "control-a": "control" } as const;
  const m = computeMetrics(rows, [{ caseId: "outside", activeSeconds: 99, findings: { F1: "real" } }], null, groups);
  assert.deepEqual(m.scope.caseIds, ["sample-a", "holdout-a", "control-a"]);
  assert.deepEqual(m.cases.map((c) => c.cohort), ["sample", "holdout", "control"]);
  assert.equal(m.signoffs, 0);
  assert.deepEqual(m.cases[2].rawCounts, { findings: 1, modelDecisions: 1, unexplainedHunks: 2, brokenClaims: 0 });
  const single = computeMetrics([rows[2]], [], null, groups);
  assert.deepEqual(single.scope.caseIds, ["control-a"]);
  assert.deepEqual(single.routeShare.targeted, { n: 1, of: 1 });
});
