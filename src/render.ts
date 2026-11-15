// Public rendering entry points: application UI, offline sheets and Markdown exports.
import type {Report} from './report.ts';
import {cohortLabel} from './cohorts.ts';
import {STATE_ORDER,STATE_TEXT,short,pct,unblockedLine} from './ui/report-format.ts';
export {esc} from './ui/html.ts';
export {CSS} from './ui/styles.ts';
export {VERDICT} from './ui/report-format.ts';
export {renderHtml} from './ui/report-view.ts';
export type {Interactive} from './ui/report-view.ts';

/** The same sheet as a pull-request comment: Markdown, no diff (the PR shows it). */
export function renderMarkdown(r: Report, sheetHref: string, maxFindings: number): string {
  const md = (s: unknown) => String(s).replace(/[\\`*_{}[\]<>|#]/g, (c) => `\\${c}`).replace(/\s*\n\s*/g, " ");
  const route = r.route;
  const lines = [
    `Evaluation cohort: ${cohortLabel(r.case.id)}

## ReviewProof sign-off sheet: ${md(r.case.requirementId)} ${md(r.case.title)}`,
    ``,
    ...(r.case.synthetic ? [`> **${md(r.case.synthetic.split(": ")[0])}:** ${md(r.case.synthetic.split(": ").slice(1).join(": "))}.`, ``] : []),
    `**Route: ${route.effectiveRoute.toUpperCase()}**${route.effectiveRoute === "blocked" ? " (cannot be signed yet)" : ""}. Evidence supports: ${route.evidenceRoute}. ` +
      (route.trustFloor !== route.evidenceRoute && route.effectiveRoute === route.trustFloor ? route.areas.filter((a) => a.floor === route.trustFloor).map((a) => `${md(a.reason.replaceAll("`", ""))}.`).join(" ") : ""),
    ``,
    ...route.reasons.map((x) => `- \`${x.code}\` ${md(x.detail)}`),
    ...(route.ifUnblocked ? [``, unblockedLine(route, md).replace(/<\/?p[^>]*>/g, "")] : []),
    ``,
    `${route.readRatio === null ? `Read ratio: not applicable until unblocked (${route.totalLines} changed lines).` : `Read ratio: ${pct(route.readRatio!)} of ${route.totalLines} changed lines.`} Generated ${r.case.generatedAt}, base \`${short(r.case.base)}\` → head \`${short(r.case.head)}\`, policy ${md(r.case.policyVersion)} (illustrative thresholds). Full sheet: ${sheetHref}`,
    ``,
    `### Requirement`,
    ...(r.requirements.length ? r.requirements.map((q) => `- **${md(q.id)}** (${q.kind}${q.kind === "interpretation" ? q.confirmedBy ? `, confirmed by ${md(q.confirmedBy)}` : ", **unconfirmed**" : ""}) ${md(q.text)}`) : ["- none"]),
    ``,
    `### What it touches`,
    `${r.inventory.totals.files} files, +${r.inventory.totals.added}/−${r.inventory.totals.removed}: ` + Object.entries(r.inventory.totals.byClass).map(([k, v]) => `${v.files} ${k} (${v.lines} lines)`).join(", ") + `. Unexplained hunks: ${r.unexplained.join(", ") || "none"}.`,
    ``,
    `### Claims (states computed from evidence)`,
    `Observed in a discriminating test means a named test passes with the change and fails without it; this does not establish the full wording of the claim. Inspect the assertion and its scope.`,
    ...(r.claims.length ? STATE_ORDER.flatMap((s) => r.claims.filter((c) => c.state === s)).map((c) => `- **${STATE_TEXT[c.state]}** ${md(c.id)}: ${md(c.statement)} — ${md(c.stateReason)}`) : ["- none"]),
    ``,
    `### Checks`,
    `| Check | Status | Result |`, `| --- | --- | --- |`,
    ...r.evidence.map((e) => `| \`${e.id}\` | ${e.status} | ${md(e.summary)}${e.reason ? ` (${md(e.reason)})` : ""} |`),
    ``,
    `### Not checked`,
    ...r.notChecked.map((n) => `- **${md(n.what)}**: ${md(n.reason)}`),
    ``,
    `### Refused to decide (owner must answer)`,
    ...(r.decisions.length ? r.decisions.map((d) => `- **${md(d.id)}** ${md(d.statement)} Options: ${d.options.map((o) => md(o).replace(/\.$/, "")).join(" / ")}. _Raised by ${d.raisedBy.kind === "rule" ? `rule ${md(d.raisedBy.name)}` : "the AI reviewer"}._`) : ["- none"]),
    ``,
    `### Suspected findings`,
    ...(r.findings.length ? r.findings.slice(0, maxFindings).map((f) => `- **${md(f.id)}** ${md(f.statement)} (${f.citations.map((c) => `\`${c.path}:${c.startLine}\``).join(", ")})`) : ["- none with a resolvable citation"]),
    ...(r.findings.length > maxFindings ? [`- and ${r.findings.length - maxFindings} more`] : []),
    ``,
    `### Residual risk accepted by signing`,
    ...r.claims.filter((c) => c.state !== "proven").map((c) => `- ${md(c.id)} (${STATE_TEXT[c.state]}): ${md(c.statement)}`),
    `- That the change adds no vulnerability (cannot be proven here).`,
    ``,
    `**Owner:** not signed. Owner identity is self-declared in this prototype.`,
    ``,
  ];
  return lines.join("\n");
}
