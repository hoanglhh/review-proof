import type { Report } from "./report.ts";

/** Explanation links are model assertions, not evidence that a hunk is correct. */
export function explanationCoverage(r: Report) {
  const rows = r.hunks.map(h => {
    const claims = r.claims.filter(c => c.hunkIds.includes(h.id)).map(c => c.id);
    const decisions = r.decisions.filter(d => d.hunkIds.includes(h.id)).map(d => d.id);
    const findings = r.findings.filter(f => f.hunkIds.includes(h.id)).map(f => f.id);
    const explained = claims.length + decisions.length > 0;
    const reasons = r.route.readingList.find(x => x.hunkId === h.id)?.why ?? [];
    const attention = r.route.effectiveRoute === "full" ? ["Full read required by the effective route", ...reasons]
      : r.route.effectiveRoute === "blocked" ? ["Review is blocked; no permission to skip this hunk", ...reasons]
      : reasons.length ? reasons
      : !explained ? ["No claim or decision explains this hunk"]
      : ["Not individually selected by the frozen reading rules; inspect its explanation and any representative group. This is not a correctness guarantee."];
    return { id: h.id, file: h.file, claims, decisions, findings, explained, attention };
  });
  return { explained: rows.filter(x => x.explained).length, total: rows.length, rows };
}
