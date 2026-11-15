import type {Report} from '../report.ts';

export const STATE_ORDER = ["broken", "not_checked", "argued", "proven"] as const;
export const STATE_TEXT = { proven: "Observed in a discriminating test", argued: "argued", not_checked: "not checked", broken: "broken" };
export const short = (sha: string) => sha.slice(0, 8);
export const pct = (x: number) => `${Math.round(x * 100)}%`;

export const VERDICT = { blocked: "Blocked", full: "Full read", targeted: "Targeted read", light: "Light review" };

/** What a blocked report's evidence supports once its blockers are resolved, in one sentence. */
export function unblockedLine(route: Report["route"], fmt: (s: unknown) => string) {
  const u = route.ifUnblocked;
  if (!u) return "";
  const why = u.reasons.slice(0, 3).map((x) => fmt(x.detail)).join("; ") + (u.reasons.length > 3 ? `; and ${u.reasons.length - 3} more` : "");
  return `<p class="muted">Once these are resolved, the evidence supports a ${VERDICT[u.route].toLowerCase()}${u.route === "targeted" ? ` of ${pct(u.readRatio!)} of the changed lines` : ""}: ${why}.${u.effectiveRoute !== u.route ? ` The areas' trust floors would still require a ${VERDICT[u.effectiveRoute].toLowerCase()}.` : ""}</p>`;
}
