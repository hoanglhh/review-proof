// Calibration with planted bugs: did the pipeline notice a bug we put there on purpose?
// Pure: compares the report of the original change with the report of the change plus the plant.
import type { Report } from "./report.ts";

const RUN_CHECKS = ["tests-at-head", "tests-without-change", "existing-tests", "public-surface", "security-surface"];
export type PlantOutcome = "caught_by_run" | "caught_by_model_only" | "missed" | "model_not_run";

export function classifyPlant(original: Report, planted: Report) {
  const key = (h: Report["hunks"][number]) => `${h.file}\n${h.removed.join("\n")}\n=>\n${h.added.join("\n")}`;
  const before = new Set(original.hunks.map(key));
  const plantedHunks = planted.hunks.filter((h) => !before.has(key(h)));
  const ids = new Set(plantedHunks.map((h) => h.id));
  const statusBefore = new Map(original.evidence.map((e) => [e.id, e.status]));

  // a run catches the plant if a check that passed on the original no longer passes, or a claim became broken
  const runSignals = [
    ...planted.evidence.filter((e) => RUN_CHECKS.includes(e.check) && statusBefore.get(e.id) === "passed" && (e.status === "failed" || e.status === "inconclusive"))
      .map((e) => `${e.id} ${e.status}: ${e.summary}`),
    ...planted.claims.filter((c) => c.state === "broken").map((c) => `claim ${c.id} broken: ${c.stateReason}`),
  ];

  // the model catches it if a finding or a model-raised decision points at a planted hunk
  const touches = (x: { hunkIds: string[]; citations: { path: string; startLine: number; endLine: number; commit: string }[] }) =>
    x.hunkIds.some((id) => ids.has(id)) || x.citations.some((c) => c.commit === planted.case.head && plantedHunks.some((h) =>
      h.file === c.path && c.startLine <= h.newStart + Math.max(h.newLines, 1) - 1 && c.endLine >= h.newStart));
  const modelSignals = planted.reviewer.status !== "ok" ? null
    : [...planted.findings, ...planted.decisions.filter((d) => d.raisedBy.kind === "model")].filter(touches).map((x) => `${x.id}: ${x.statement}`);

  const outcome: PlantOutcome = runSignals.length ? "caught_by_run" : modelSignals === null ? "model_not_run" : modelSignals.length ? "caught_by_model_only" : "missed";
  return { outcome, plantedHunks: plantedHunks.map((h) => h.id), runSignals, modelSignals: modelSignals ?? [], route: planted.route.effectiveRoute };
}

export function summarize(results: { outcome: PlantOutcome }[]) {
  const n = (o: PlantOutcome) => results.filter((r) => r.outcome === o).length;
  return { total: results.length, caughtByRun: n("caught_by_run"), caughtByModelOnly: n("caught_by_model_only"), missed: n("missed"), modelNotRun: n("model_not_run") };
}
