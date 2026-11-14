// Synthetic inputs only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claimState, computeRoute, trustFloor, type RouteInput } from "../src/states.ts";
import { resolveCitation } from "../src/assemble.ts";
import type { Evidence } from "../src/report.ts";

const ev = (id: string, check: string, status: Evidence["status"], tests?: Evidence["tests"]): Evidence => ({
  id, check, domain: "backend", asserts: "", performedBy: "runner", commands: [], commits: [], status, summary: `${id} ${status}`, durationMs: 0, logs: [], ...(tests ? { tests } : {}),
});
const runs = (o: { head?: [string, string, boolean][]; disc?: [string, boolean][]; existing?: [string, string, string][]; withoutStatus?: Evidence["status"] }) => [
  ev("tests-at-head:p", "tests-at-head", "passed", (o.head ?? []).map(([name, outcome, isNew]) => ({ name, outcome, new: isNew }))),
  ev("tests-without-change:p", "tests-without-change", o.withoutStatus ?? "passed", o.withoutStatus === "inconclusive" ? undefined : (o.disc ?? []).map(([name, discriminating]) => ({ name, discriminating }))),
  ev("existing-tests:p", "existing-tests", (o.existing ?? []).some(([, b, h]) => b === "passed" && h !== "passed") ? "failed" : "passed", (o.existing ?? []).map(([name, base, head]) => ({ name, base, head }))),
];

test("claim states: discriminating test proves; head-only pass argues; failing test breaks; citations argue; nothing is not_checked", () => {
  const e = runs({ head: [["New", "passed", true], ["Weak", "passed", true], ["Bad", "failed", true]], disc: [["New", true], ["Weak", false], ["Bad", false]], existing: [["Old", "passed", "passed"]] });
  const s = (testNames: string[], citations = 0, evidenceIds: string[] = []) => claimState({ evidenceIds, testNames, citations }, e).state;
  assert.equal(s(["New"]), "proven");
  assert.equal(s(["Weak"]), "argued");
  assert.equal(s(["New", "Bad"]), "broken");
  assert.equal(s(["Old"]), "proven"); // pre-existing test passing at base and head
  assert.equal(s([], 2), "argued");
  assert.equal(s([]), "not_checked");
  assert.equal(s(["NoSuchTest"]), "not_checked");
});

test("claim states: inconclusive or not_run evidence never counts as passing", () => {
  const e = runs({ head: [["New", "passed", true]], withoutStatus: "inconclusive" });
  assert.equal(claimState({ evidenceIds: [], testNames: ["New"], citations: 0 }, e).state, "argued");
  const onlyNotRun = [ev("tests-at-head:p", "tests-at-head", "not_run")];
  const r = claimState({ evidenceIds: ["tests-at-head:p"], testNames: [], citations: 0 }, onlyNotRun);
  assert.equal(r.state, "not_checked");
  assert.match(r.reason, /did not complete/);
});

test("claim states: linking a whole test record proves nothing; only named tests count", () => {
  const e = runs({ head: [["Other", "passed", true]], disc: [["Other", true]] });
  const r = claimState({ evidenceIds: ["tests-at-head:p", "tests-without-change:p"], testNames: [], citations: 0 }, e);
  assert.equal(r.state, "not_checked");
  assert.match(r.reason, /names no test/);
  assert.equal(claimState({ evidenceIds: ["tests-without-change:p"], testNames: [], citations: 1 }, e).state, "argued");
});

test("claim states: a regression in pre-existing tests breaks a claim linked to that record", () => {
  const e = runs({ existing: [["Old", "passed", "failed"]] });
  assert.equal(claimState({ evidenceIds: ["existing-tests:p"], testNames: [], citations: 3 }, e).state, "broken");
});

const base = (over: Partial<RouteInput> = {}): RouteInput => ({
  reportId: "case@abc", reviewerOk: true,
  requirements: [{ id: "R1", kind: "explicit", confirmedBy: null }],
  claims: [{ id: "C1", requirementIds: ["R1"], hunkIds: ["H1"], state: "proven" }],
  decisions: [], findings: [], unexplained: [],
  evidence: [ev("public-surface", "public-surface", "passed"), ev("security-surface", "security-surface", "passed")],
  hunks: [{ id: "H1", file: "a", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, removed: ["x"], added: ["y"] }],
  areas: [{ area: "a", floor: "light", reason: "earned" }], spotCheckShare: 0, ...over,
});

test("route: all proven, nothing open, earned area gives light", () => {
  assert.equal(computeRoute(base()).effectiveRoute, "light");
});

test("route: many passing tests cannot cancel a blocker", () => {
  const claims = Array.from({ length: 50 }, (_, i) => ({ id: `C${i}`, requirementIds: ["R1"], hunkIds: ["H1"], state: "proven" as const }));
  const r = computeRoute(base({ claims, requirements: [{ id: "R1", kind: "explicit", confirmedBy: null }, { id: "R2", kind: "interpretation", confirmedBy: null }] }));
  assert.equal(r.evidenceRoute, "blocked");
  assert.deepEqual(r.reasons.map((x) => x.code).sort(), ["interpretation-unconfirmed", "requirement-without-claim"]);
  const broken = computeRoute(base({ claims: [...claims, { id: "Cx", requirementIds: ["R1"], hunkIds: [], state: "broken" }] }));
  assert.equal(broken.effectiveRoute, "blocked");
});

test("route: a small diff does not imply light", () => {
  const r = computeRoute(base({ claims: [{ id: "C1", requirementIds: ["R1"], hunkIds: ["H1"], state: "argued" }] }));
  assert.equal(r.totalLines, 2);
  assert.equal(r.evidenceRoute, "targeted");
});

test("route: pattern grouping alone cannot produce light", () => {
  const groups = ev("pattern-groups", "pattern-groups", "passed");
  groups.details = { groups: [{ id: "G1", hunkIds: ["H1"] }], deviating: [] };
  const r = computeRoute(base({ claims: [{ id: "C1", requirementIds: ["R1"], hunkIds: ["H1"], state: claimState({ evidenceIds: ["pattern-groups"], testNames: [], citations: 0 }, [groups]).state }], evidence: [groups] }));
  assert.notEqual(r.evidenceRoute, "light");
});

test("route: public or security surface forces full; trust floor makes the effective route stricter", () => {
  assert.equal(computeRoute(base({ evidence: [ev("public-surface", "public-surface", "failed")] })).evidenceRoute, "full");
  assert.equal(computeRoute(base({ evidence: [ev("security-surface", "security-surface", "failed")] })).evidenceRoute, "full");
  const r = computeRoute(base({ areas: [{ area: "a", floor: "full", reason: "no track record" }] }));
  assert.deepEqual([r.evidenceRoute, r.effectiveRoute, r.readRatio], ["light", "full", 1]);
});

test("route: reviewer missing means blocked; identical input gives identical output", () => {
  assert.equal(computeRoute(base({ reviewerOk: false })).effectiveRoute, "blocked");
  const input = base({ spotCheckShare: 0.5, claims: [{ id: "C1", requirementIds: ["R1"], hunkIds: ["H1"], state: "argued" }] });
  assert.deepEqual(computeRoute(input), computeRoute(structuredClone(input)));
});

test("trust floor: starts full, relaxes a step per N clean spot-checks, resets on a miss", () => {
  const e = (type: any) => ({ area: "a", type, at: "" });
  assert.equal(trustFloor([], 2).floor, "full");
  assert.equal(trustFloor([e("spot_check_clean"), e("spot_check_clean")], 2).floor, "targeted");
  assert.equal(trustFloor(Array(4).fill(e("spot_check_clean")), 2).floor, "light");
  assert.equal(trustFloor([...Array(4).fill(e("spot_check_clean")), e("spot_check_miss")], 2).floor, "full");
  assert.equal(trustFloor([...Array(4).fill(e("spot_check_clean")), e("escape"), e("spot_check_clean")], 2).floor, "full");
});

test("citations: quote must be found in the stated lines at the stated commit", () => {
  const files: Record<string, string> = { "head:a.cs": "line one\n  int   x = 1;\nline three", "base:a.cs": "old" };
  const readAt = (at: string, p: string) => files[`${at}:${p}`] ?? null;
  const commits = { base: "b".repeat(40), head: "a".repeat(40) };
  const c = (o: object) => resolveCitation({ file: "a.cs", at: "head", startLine: 2, endLine: 2, quote: "int x = 1;", ...o } as any, readAt, commits);
  assert.equal(c({}).ok, true); // whitespace runs are normalised
  assert.equal(c({ startLine: 3, endLine: 3 }).ok, false); // right quote, wrong lines
  assert.equal(c({ at: "base" }).ok, false);
  assert.equal(c({ file: "missing.cs" }).ok, false);
  assert.equal(c({ endLine: 9 }).ok, false);
  assert.equal(c({ quote: "x = 1" }).ok, false); // too short to check
});
