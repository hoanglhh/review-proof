// Claim states, trust floors and routing. Pure functions: identical input gives identical output.
// No numbers are summed or weighted anywhere; every outcome carries the rule that produced it.
import { createHash } from "node:crypto";
import type { Hunk } from "./diff.ts";
import type { Evidence } from "./report.ts";

export type State = "proven" | "argued" | "not_checked" | "broken";
export type RouteName = "light" | "targeted" | "full" | "blocked";
const ORDER: RouteName[] = ["light", "targeted", "full", "blocked"];
export const stricter = (a: RouteName, b: RouteName): RouteName => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

type TestFact = { head?: string; base?: string; discriminating?: boolean; preExisting: boolean };
const completed = (e: Evidence) => e.status === "passed" || e.status === "failed"; // not_run/inconclusive never count

/** Per-test outcomes from completed test checks only. */
export function testFacts(evidence: Evidence[]) {
  const facts = new Map<string, TestFact>();
  const at = (n: string) => facts.get(n) ?? (facts.set(n, { preExisting: false }), facts.get(n)!);
  for (const e of evidence.filter(completed)) for (const t of e.tests ?? []) {
    const f = at(t.name);
    if (e.check === "tests-at-head") { f.head = t.outcome as string; f.preExisting ||= t.new === false; }
    if (e.check === "tests-without-change") f.discriminating = t.discriminating === true;
    if (e.check === "existing-tests") { f.base = t.base as string; f.head = t.head as string; f.preExisting = true; }
  }
  return facts;
}

export function claimState(claim: { evidenceIds: string[]; testNames: string[]; citations: number }, evidence: Evidence[]): { state: State; reason: string } {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const facts = testFacts(evidence);
  const linked = claim.evidenceIds.map((id) => byId.get(id)).filter((e): e is Evidence => !!e);
  // only tests the claim names count: a whole test record says nothing about which test supports which claim
  const tests = [...new Set(claim.testNames)].sort().flatMap((n) => (facts.has(n) ? [[n, facts.get(n)!] as const] : []));

  const failing = tests.find(([, f]) => f.head !== undefined && f.head !== "passed");
  if (failing) return { state: "broken", reason: `test ${failing[0]} does not pass at head (${failing[1].head})` };
  const regressed = linked.find((e) => e.check === "existing-tests" && e.status === "failed");
  if (regressed) return { state: "broken", reason: `${regressed.id}: a pre-existing test that passed at base fails at head` };

  const disc = tests.find(([, f]) => f.head === "passed" && f.discriminating === true);
  if (disc) return { state: "proven", reason: `test ${disc[0]} passes at head and fails without the change` };
  // whole records (the existing-test suite, the issue-reproduction check) can contradict a claim but never prove it:
  // which claim they bear on is the model's word

  // an old test passing before and after was never shown able to fail for this claim, and the model chose the link
  const pre = tests.find(([, f]) => f.preExisting && f.base === "passed" && f.head === "passed");
  if (pre) return { state: "argued", reason: `pre-existing test ${pre[0]} passes at base and at head; it was not shown able to fail for this claim` };
  const passing = tests.find(([, f]) => f.head === "passed");
  if (passing) return { state: "argued", reason: `test ${passing[0]} passes at head but was not shown to fail without the change` };
  if (claim.citations > 0) return { state: "argued", reason: `${claim.citations} resolved citation(s) and no run that supports it` };
  const unfinished = linked.filter((e) => !completed(e)).map((e) => `${e.id} (${e.status})`);
  if (unfinished.length) return { state: "not_checked", reason: `linked checks did not complete: ${unfinished.join(", ")}` };
  const unnamed = linked.filter((e) => e.check.startsWith("tests-")).map((e) => e.id);
  return { state: "not_checked", reason: unnamed.length ? `links ${unnamed.join(", ")} but names no test in it` : "no supporting evidence or citation" };
}

export type TrustEvent = { area: string; type: "spot_check_clean" | "spot_check_miss" | "escape" | "planted_caught" | "planted_missed"; at: string };

/** An area starts at full read, relaxes one step per N clean spot-checks, and resets to full on any miss or escape. */
export function trustFloor(events: TrustEvent[], cleanPerStep: number): { floor: RouteName; reason: string } {
  let step = 0, clean = 0, history = false;
  for (const e of events) {
    history = true;
    if (e.type === "spot_check_miss" || e.type === "escape" || e.type === "planted_missed") { step = 0; clean = 0; }
    else if (e.type === "spot_check_clean" && ++clean >= cleanPerStep && step < 2) { step++; clean = 0; }
  }
  const floor = (["full", "targeted", "light"] as const)[step];
  const reason = !history ? "has no track record: full read required"
    : step === 0 ? `has not earned lighter review (${clean} of ${cleanPerStep} clean spot-checks since the last reset): full read required`
    : `earned ${floor} after clean spot-checks`;
  return { floor, reason };
}

export type RouteInput = {
  reportId: string;
  reviewerOk: boolean;
  requirements: { id: string; kind: string; confirmedBy: string | null }[];
  claims: { id: string; requirementIds: string[]; hunkIds: string[]; state: State }[];
  decisions: { id: string; hunkIds: string[] }[];
  findings: { id: string; hunkIds: string[] }[];
  unexplained: string[];
  evidence: Evidence[];
  hunks: Hunk[];
  areas: { area: string; floor: RouteName; reason: string }[];
  spotCheckShare: number;
};

export function computeRoute(r: RouteInput) {
  const reasons: { code: string; detail: string }[] = [];
  const statusOf = (check: string) => r.evidence.find((e) => e.check === check)?.status;
  const blockers = [
    ...(!r.reviewerOk ? [{ code: "reviewer-missing", detail: "the AI reviewer output is missing or invalid" }] : []),
    ...(r.reviewerOk && r.requirements.length === 0 ? [{ code: "no-requirement", detail: "no requirement item survived validation" }] : []),
    ...r.claims.filter((c) => c.state === "broken" && c.requirementIds.length).map((c) => ({ code: "claim-broken", detail: `${c.id} is broken and serves ${c.requirementIds.join(", ")}` })),
    ...r.requirements.filter((q) => !r.claims.some((c) => c.requirementIds.includes(q.id))).map((q) => ({ code: "requirement-without-claim", detail: `${q.id} has no claim` })),
    ...r.requirements.filter((q) => q.kind === "interpretation" && !q.confirmedBy).map((q) => ({ code: "interpretation-unconfirmed", detail: `${q.id} is an interpretation no human has confirmed` })),
  ];
  const fullers = [
    ...(statusOf("public-surface") === "failed" ? [{ code: "public-surface", detail: "public API or diagnostic IDs changed" }] : []),
    ...(statusOf("security-surface") === "failed" ? [{ code: "security-surface", detail: "the security surface scan hit" }] : []),
  ];
  const notProven = r.claims.filter((c) => c.state !== "proven");
  const lightBlockers = [
    ...(r.claims.length === 0 ? [{ code: "no-claims", detail: "there are no claims" }] : []),
    ...notProven.map((c) => ({ code: `claim-${c.state.replace("_", "-")}`, detail: `${c.id} is ${c.state}` })),
    ...r.decisions.map((d) => ({ code: "decision-open", detail: `${d.id} needs the owner` })),
    ...(r.unexplained.length ? [{ code: "unexplained-hunks", detail: `${r.unexplained.length} hunk(s) map to no claim or decision` }] : []),
    ...r.findings.map((f) => ({ code: "finding", detail: `${f.id} is a suspected problem` })),
  ];
  // the route the evidence supports apart from blockers; it becomes the evidence route once they are resolved
  const unblocked: { route: RouteName; reasons: typeof reasons } = fullers.length ? { route: "full", reasons: fullers }
    : !lightBlockers.length ? { route: "light", reasons: [{ code: "all-proven", detail: "every claim is proven; no decisions, unexplained hunks or findings" }] }
    : { route: "targeted", reasons: lightBlockers };
  const evidenceRoute: RouteName = blockers.length ? "blocked" : unblocked.route;
  reasons.push(...(blockers.length ? blockers : unblocked.reasons));

  const floor = r.areas.reduce<RouteName>((acc, a) => stricter(acc, a.floor), "light");
  const effectiveRoute = stricter(evidenceRoute, floor);

  // reading list: what a targeted read covers
  const why = new Map<string, Set<string>>();
  const add = (ids: string[], reason: string) => ids.forEach((id) => (why.get(id) ?? why.set(id, new Set()).get(id)!).add(reason));
  for (const d of r.decisions) add(d.hunkIds, `decision ${d.id}`);
  for (const c of notProven) add(c.hunkIds, `claim ${c.id} is ${c.state}`);
  add(r.unexplained, "unexplained");
  const deviating = (r.evidence.find((e) => e.check === "pattern-groups")?.details as { deviating?: { file: string; hunkIds: string[] }[] } | undefined)?.deviating ?? [];
  for (const d of deviating) add(d.hunkIds, `deviates from a repeated pattern in ${d.file}`);
  for (const f of r.findings) add(f.hunkIds, `finding ${f.id}`);
  const lines = (h: Hunk) => h.added.length + h.removed.length;
  // identical hunks of a repeated-pattern group are read once, through the group's first hunk
  const groups = (r.evidence.find((e) => e.check === "pattern-groups")?.details as { groups?: { id: string; hunkIds: string[]; files: number }[] } | undefined)?.groups ?? [];
  const exemplarOf = new Map(groups.flatMap((g) => g.hunkIds.map((id) => [id, g] as const)));
  const readingList = r.hunks.filter((h) => why.has(h.id)).flatMap((h) => {
    const g = exemplarOf.get(h.id);
    if (g && g.hunkIds[0] !== h.id) return [];
    const reasons = g ? [...new Set(g.hunkIds.flatMap((id) => [...(why.get(id) ?? [])]))] : [...why.get(h.id)!];
    return [{ hunkId: h.id, file: h.file, lines: lines(h), why: g ? [...reasons, `stands for ${g.hunkIds.length} identical hunks in ${g.files} files (${g.id})`] : reasons }];
  });
  const totalLines = r.hunks.reduce((n, h) => n + lines(h), 0);
  const readingListLines = readingList.reduce((n, x) => n + x.lines, 0);
  const ratioFor = (route: RouteName) => (route === "full" ? 1 : route === "light" ? 0 : route === "targeted" ? (totalLines ? readingListLines / totalLines : 0) : null);
  const readRatio = ratioFor(effectiveRoute);
  const ifUnblocked = blockers.length ? { route: unblocked.route, reasons: unblocked.reasons, readRatio: ratioFor(unblocked.route), effectiveRoute: stricter(unblocked.route, floor) } : null;

  // a fixed share of non-full reports is drawn for a blind spot-check, seeded by the report ID
  const draw = parseInt(createHash("sha256").update(r.reportId).digest("hex").slice(0, 8), 16) / 2 ** 32;
  const spotCheck = { eligible: effectiveRoute === "light" || effectiveRoute === "targeted", selected: (effectiveRoute === "light" || effectiveRoute === "targeted") && draw < r.spotCheckShare, draw: Number(draw.toFixed(4)), share: r.spotCheckShare };

  return { evidenceRoute, trustFloor: floor, effectiveRoute, reasons, ifUnblocked, areas: r.areas, readingList, readingListLines, totalLines, readRatio, spotCheck };
}
