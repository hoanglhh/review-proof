// Synthetic reports only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics } from "../src/metrics.ts";

const report = (id: string, route: string, claims: string[], cites?: [number, number], disc: boolean[] = []) => ({
  case: { id, title: "" }, inventory: { totals: { files: 1 } }, reviewer: { status: cites ? "ok" : "unavailable" },
  route: { totalLines: 10, readingListLines: 4, readRatio: route === "blocked" ? null : 1, evidenceRoute: route, effectiveRoute: route },
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
