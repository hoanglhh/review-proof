// Evaluation cohort names are presentation metadata, never inputs to the reviewer or routing rules.
import { join } from "node:path";
import { readJson, ROOT, PLANTED, type Case } from "./config.ts";

export const COHORT_LABELS = { sample: "Supplied sample", holdout: "Holdout", control: "Merged control", unclassified: "Unclassified", planted: "Planted bug" };
export type Cohort = keyof typeof COHORT_LABELS;
export function caseCohorts(): Record<string, Cohort> {
  return Object.fromEntries((readJson(join(ROOT, "cases.json")).cases as Case[]).map((c) => [c.id, c.cohort ?? "unclassified"]));
}
export function cohortLabel(id: string) {
  return COHORT_LABELS[id.startsWith(PLANTED) ? "planted" : caseCohorts()[id] ?? "unclassified"];
}
