// Trust measurement, computed only from files under data/. Every figure carries its denominator.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DATA, readJson } from "./config.ts";
import { caseCohorts, type Cohort } from "./cohorts.ts";
import type { Report } from "./report.ts";

type Signoff = { caseId: string; findings?: Record<string, string | null> };
type Calibration = { total: number; caughtByRun: number; caughtByModelOnly: number; missed: number; modelNotRun: number; reviewer: string; results?: { plant: string; case: string }[] } | null;
const frac = (n: number, of: number) => ({ n, of });

export function computeMetrics(reports: Report[], signoffs: Signoff[], calibration: Calibration, cohorts: Record<string, Cohort> = {}) {
  const caseIds = reports.map((r) => r.case.id);
  signoffs = signoffs.filter((s) => caseIds.includes(s.caseId));
  const claims = reports.flatMap((r) => r.claims);
  const testRows = reports.flatMap((r) => r.evidence.filter((e) => e.check === "tests-without-change" && (e.status === "passed" || e.status === "failed")).flatMap((e) => e.tests ?? []))
    .filter((t) => t.head === "passed");
  const cites = reports.map((r) => r.evidence.find((e) => e.check === "citation-validation")).filter((e) => e?.status === "passed" || e?.status === "failed")
    .map((e) => e!.details as { citations: number; resolved: number });
  const marks = signoffs.flatMap((s) => Object.values(s.findings ?? {})).filter((v): v is string => !!v);
  const routes = ["light", "targeted", "full", "blocked"] as const;
  return {
    scope: { caseIds, cohorts: Object.fromEntries(caseIds.map((id) => [id, cohorts[id] ?? "unclassified"])), note: "All non-calibration aggregates include only these cases; owner measures include only their recorded sign-offs." },
    calibrationScope: { plants: calibration?.results?.map((r) => r.plant) ?? [], sourceCases: [...new Set(calibration?.results?.map((r) => r.case) ?? [])], note: "Separate planted-bug corpus; excluded from case aggregates." },
    cases: reports.map((r) => ({
      id: r.case.id, cohort: cohorts[r.case.id] ?? "unclassified",
      rawCounts: { findings: r.findings.length, modelDecisions: r.decisions.filter((d) => d.raisedBy.kind === "model").length, unexplainedHunks: r.unexplained.length, brokenClaims: r.claims.filter((c) => c.state === "broken").length },
      title: r.case.title, files: r.inventory.totals.files, lines: r.route.totalLines, readingListLines: r.route.readingListLines,
      readRatio: r.route.readRatio, evidenceRoute: r.route.evidenceRoute, effectiveRoute: r.route.effectiveRoute, reviewer: r.reviewer.status,
      ifUnblocked: r.route.ifUnblocked ? { route: r.route.ifUnblocked.route, readRatio: r.route.ifUnblocked.readRatio } : null,
    })),
    routeShare: Object.fromEntries(routes.map((x) => [x, frac(reports.filter((r) => r.route.effectiveRoute === x).length, reports.length)])),
    claimsByState: Object.fromEntries((["proven", "argued", "not_checked", "broken"] as const).map((s) => [s, frac(claims.filter((c) => c.state === s).length, claims.length)])),
    discriminatingTests: frac(testRows.filter((t) => t.discriminating === true).length, testRows.length),
    citationValidity: frac(cites.reduce((n, c) => n + c.resolved, 0), cites.reduce((n, c) => n + c.citations, 0)),
    citationCasesWithReviewer: frac(cites.length, reports.length),
    calibration,
    signoffs: signoffs.length,
    findingsMarked: { real: frac(marks.filter((m) => m === "real").length, marks.length), notReal: frac(marks.filter((m) => m === "not_real").length, marks.length) },
    noDataYet: [
      { metric: "Decision recall against the scoring key", definition: "Share of key items the sheet raised as a decision or finding. Needs the user to confirm the AI-drafted key and to match key items to sheet items." },
      { metric: "Reverts and incidents per area and route", definition: "Changes reverted or tied to an incident after merge, per area and per route." },
      { metric: "Time to merge", definition: "Time from the agent's change to a signed, merged change, per route." },
    ],
    guardRule: "An area keeps a lighter route only while its spot-checks and escape history support it.",
  };
}

export function loadMetrics(cohort?: Cohort) {
  const cohorts = caseCohorts();
  const casesDir = join(DATA, "cases");
  const ids = existsSync(casesDir) ? readdirSync(casesDir).filter((id) => existsSync(join(casesDir, id, "report.json"))).sort() : [];
  const reports: Report[] = ids.filter((id) => !cohort || (cohorts[id] ?? "unclassified") === cohort).map((id) => readJson(join(casesDir, id, "report.json")));
  const signoffs: Signoff[] = ids.flatMap((id) => {
    const d = join(casesDir, id, "signoffs");
    return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => readJson(join(d, f))) : [];
  });
  const cal = join(DATA, "calibration", "summary.json");
  return computeMetrics(reports, signoffs, existsSync(cal) ? readJson(cal) : null, cohorts);
}
export type Metrics = ReturnType<typeof computeMetrics>;
