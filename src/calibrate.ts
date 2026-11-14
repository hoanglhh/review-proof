// Calibration with planted bugs: did the pipeline notice a bug we put there on purpose?
// Pure: compares the report of the original change with the report of the change plus the plant.
import type { Report } from "./report.ts";

const RUN_CHECKS = ["tests-at-head", "tests-without-change", "existing-tests", "public-surface", "security-surface"];
export type PlantOutcome = "caught_by_run" | "caught_by_model_only" | "missed" | "model_not_run";

export function classifyPlant(original: Report, planted: Report) {
  const key = (h: Report["hunks"][number]) => `${h.file}\n${h.removed.join("\n")}\n=>\n${h.added.join("\n")}`;
  const before = new Set(original.hunks.map(key));
  const after = new Set(planted.hunks.map(key));
  const plantedHunks = planted.hunks.filter((h) => !before.has(key(h)));
  // a plant that undoes part of the change leaves no new hunk: the agent's hunk just disappears from the diff,
  // so the model can only point at the lines where it used to be
  const undoneHunks = original.hunks.filter((h) => !after.has(key(h)));
  const ids = new Set(plantedHunks.map((h) => h.id));
  const NEAR = 3;
  const places = [
    ...plantedHunks.map((h) => ({ file: h.file, start: h.newStart, end: h.newStart + Math.max(h.newLines, 1) - 1 })),
    ...undoneHunks.map((h) => ({ file: h.file, start: h.newStart - NEAR, end: h.newStart + Math.max(h.newLines, 1) - 1 + NEAR })),
  ];
  const statusBefore = new Map(original.evidence.map((e) => [e.id, e.status]));

  // a run catches the plant if a check that passed on the original no longer passes, or a claim became broken
  const runSignals = [
    ...planted.evidence.filter((e) => RUN_CHECKS.includes(e.check) && statusBefore.get(e.id) === "passed" && (e.status === "failed" || e.status === "inconclusive"))
      .map((e) => `${e.id} ${e.status}: ${e.summary}`),
    ...planted.claims.filter((c) => c.state === "broken").map((c) => `claim ${c.id} broken: ${c.stateReason}`),
  ];

  // the model catches it if a finding or a model-raised decision points at a planted hunk
  const touches = (x: { hunkIds: string[]; citations: { path: string; startLine: number; endLine: number; commit: string }[] }) =>
    x.hunkIds.some((id) => ids.has(id)) || x.citations.some((c) => c.commit === planted.case.head && places.some((p) =>
      p.file === c.path && c.startLine <= p.end && c.endLine >= p.start));
  const modelSignals = planted.reviewer.status !== "ok" ? null
    : [...planted.findings, ...planted.decisions.filter((d) => d.raisedBy.kind === "model")].filter(touches).map((x) => `${x.id}: ${x.statement}`);

  const outcome: PlantOutcome = runSignals.length ? "caught_by_run" : modelSignals === null ? "model_not_run" : modelSignals.length ? "caught_by_model_only" : "missed";
  return { outcome, files: [...new Set(places.map((p) => p.file))], plantedHunks: plantedHunks.map((h) => h.id), undoneOriginalHunks: undoneHunks.map((h) => `${h.id} ${h.file}:${h.newStart}`), runSignals, modelSignals: modelSignals ?? [], route: planted.route.effectiveRoute };
}

export function summarize(results: { outcome: PlantOutcome }[]) {
  const n = (o: PlantOutcome) => results.filter((r) => r.outcome === o).length;
  return { total: results.length, caughtByRun: n("caught_by_run"), caughtByModelOnly: n("caught_by_model_only"), missed: n("missed"), modelNotRun: n("model_not_run") };
}
