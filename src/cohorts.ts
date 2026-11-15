// Evaluation cohort names are presentation metadata, never inputs to the reviewer or routing rules.
import { PLANTED, listCases } from "./config.ts";

export const COHORT_LABELS = { submitted: "User submission", sample: "Supplied sample", holdout: "Holdout", control: "Merged control", unclassified: "Unclassified", planted: "Planted bug" };
export type Cohort = keyof typeof COHORT_LABELS;
export function caseCohorts(): Record<string, Cohort> {
  return Object.fromEntries(listCases().map((c) => [c.id, c.submission ? "submitted" : c.cohort ?? "unclassified"]));
}
export function cohortLabel(id: string) {
  return COHORT_LABELS[id.startsWith(PLANTED) ? "planted" : caseCohorts()[id] ?? "unclassified"];
}
