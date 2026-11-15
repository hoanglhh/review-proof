import type { Report } from "./report.ts";
import { esc } from "./ui/html.ts";
import { renderDocument } from "./ui/document.ts";
import { actionLink, emptyState, pageHeader, statusBadge } from "./ui/components.ts";

export type FindingFeedback = {
  schemaVersion: 1;
  caseId: string;
  reportHash: string;
  findingId: string;
  statement: string;
  citations: Report["findings"][number]["citations"];
  reviewer: string;
  identity: "self-declared";
  verdict: "real" | "not_real" | "unsure";
  explanation: string;
  evidence: string;
  human: true;
  recordedAt: string;
};
const VERDICTS = { real: "Real problem", not_real: "Not a problem", unsure: "Not sure" };
const LIMITS = { name: 200, verdict: 8, explanation: 10000, evidence: 10000, human: 3, reportHash: 64, findingId: 300 };

/** Plain-text errors; callers must escape them when rendering. A blocked route does not prevent feedback. */
export function validateFindingFeedback(report: Report, currentHash: string, f: URLSearchParams): string[] {
  const errors: string[] = [];
  for (const key of new Set(f.keys())) {
    if (!Object.hasOwn(LIMITS, key)) errors.push("Unexpected form field. Reload the feedback page and submit only its fields.");
    if (f.getAll(key).length !== 1) errors.push(`Submit exactly one value for ${key}.`);
  }
  for (const [key, limit] of Object.entries(LIMITS)) {
    const value = f.get(key) ?? "";
    if (value.length > limit) errors.push(`${key} must be ${limit} characters or fewer.`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || (key === "name" && /[\r\n\t]/u.test(value))) errors.push(`${key} contains unsupported control characters.`);
  }
  if (!/^[0-9a-f]{64}$/.test(currentHash) || f.get("reportHash") !== currentHash) errors.push("The report changed or its hash is invalid. Reload the page and review the current findings.");
  if (report.findings.filter(x => x.id === f.get("findingId")).length !== 1) errors.push("Choose one finding from this report.");
  if (!f.get("name")?.trim()) errors.push("Enter your name.");
  const verdict = f.get("verdict") ?? "";
  if (!Object.hasOwn(VERDICTS, verdict)) errors.push("Choose real problem, not a problem, or not sure.");
  if (!f.get("explanation")?.trim()) errors.push("Write an explanation for your judgment.");
  if ((verdict === "real" || verdict === "not_real") && !f.get("evidence")?.trim()) errors.push("Provide supporting evidence for a decisive judgment, or choose not sure.");
  if (f.get("human") !== "yes") errors.push("Confirm that you are a person submitting your own judgment.");
  return errors;
}

/** Builds an audit record only; the server owns append-only persistence. */
export function findingFeedbackRecord(report: Report, currentHash: string, f: URLSearchParams, at = new Date().toISOString()): FindingFeedback {
  const errors = validateFindingFeedback(report, currentHash, f);
  if (errors.length) throw new Error(`Invalid finding feedback: ${errors.join(" ")}`);
  const finding = report.findings.find(x => x.id === f.get("findingId"))!;
  return {
    schemaVersion: 1, caseId: report.case.id, reportHash: currentHash, findingId: finding.id,
    statement: finding.statement, citations: finding.citations.map(c => ({ ...c })),
    reviewer: f.get("name")!.trim(), identity: "self-declared", verdict: f.get("verdict") as FindingFeedback["verdict"],
    explanation: f.get("explanation")!.trim(), evidence: (f.get("evidence") ?? "").trim(), human: true, recordedAt: at,
  };
}

const citations = (items: FindingFeedback["citations"]) => items.map(c => `<div class="cite"><code>${esc(c.path)} lines ${esc(c.startLine)}–${esc(c.endLine)} at ${esc(c.commit)}</code><pre>${esc(c.quote)}</pre></div>`).join("");

export function renderFindingFeedback(report: Report, hash: string, records: FindingFeedback[], errors: string[] = [], f = new URLSearchParams()): string {
  const base = `/case/${encodeURIComponent(report.case.id)}`;
  const val = (key: string) => esc(f.get(key) ?? "");
  const history = records.filter(r => r.caseId === report.case.id);
  return renderDocument(`Finding feedback: ${report.case.id}`, `${pageHeader("Judge a finding", report.case.title, actionLink(base, "Back to report", { icon: "back" }) + actionLink("/evaluation/findings", "Human judgment summary", { icon: "chart" }))}
<p>Case <code>${esc(report.case.id)}</code>. These are human judgments, not verified truth. Feedback is independent of sign-off and can be recorded while this report is blocked.</p>
<p class="muted">Do not include secrets in explanations or evidence.</p><details><summary>Identity and corrections</summary><p>Names are self-declared and are not authenticated. New submissions are append-only: submit again under the same name to correct a judgment; earlier records remain visible.</p></details>
${errors.length ? `<div class="errors" role="alert"><h2>Feedback was not saved</h2><ul>${errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
<section aria-labelledby="findings"><h2 id="findings">Findings and source citations</h2>
${report.findings.map((finding, i) => `<article id="finding-${i}" class="space-y-4 py-6"><div class="flex flex-wrap items-center gap-3"><h3><code>${esc(finding.id)}</code></h3>${statusBadge(finding.status)}</div><p>${esc(finding.statement)}</p>${citations(finding.citations) || "<p>No source citations in this finding.</p>"}</article>`).join("") || emptyState("No findings to judge", "This report has no findings to judge.")}</section>
${report.findings.length ? `<section class="panel p-5 md:p-8" aria-labelledby="submit-feedback"><h2 id="submit-feedback">Submit one judgment</h2><form class="space-y-6" method="post" action="${base}/findings">
<input type="hidden" name="reportHash" value="${esc(hash)}">
<div class="field"><label for="findingId">Finding</label><select id="findingId" name="findingId" required><option value="">Choose one finding</option>${report.findings.map(x => `<option value="${esc(x.id)}"${f.get("findingId") === x.id ? " selected" : ""}>${esc(x.id)}: ${esc(x.statement)}</option>`).join("")}</select></div>
<div class="field"><label for="name">Your name</label><input id="name" type="text" name="name" maxlength="200" autocomplete="name" value="${val("name")}" required></div>
<fieldset class="decision"><legend>Your judgment</legend><div class="choices">${Object.entries(VERDICTS).map(([value, label]) => `<label><input type="radio" name="verdict" value="${value}" required${f.get("verdict") === value ? " checked" : ""}>${label}</label>`).join("")}</div></fieldset>
<div class="field"><label for="explanation">Explanation</label><textarea id="explanation" name="explanation" rows="4" maxlength="10000" required>${val("explanation")}</textarea></div>
<p id="evidence-help">Supporting evidence is required for real problem or not a problem. Describe a reproduction, test result, or source reference. For not sure, it may be blank.</p>
<div class="field"><label for="evidence">Supporting evidence</label><textarea id="evidence" name="evidence" rows="4" maxlength="10000" aria-describedby="evidence-help">${val("evidence")}</textarea></div>
<div class="choices"><label><input type="checkbox" name="human" value="yes" required${f.get("human") === "yes" ? " checked" : ""}>I am a person submitting my own judgment.</label></div>
<div class="actions"><button type="submit">Record finding judgment</button></div></form></section>` : ""}
<section aria-labelledby="feedback-history"><h2 id="feedback-history">Feedback history (${history.length} records)</h2>
${history.map(r => `<article class="space-y-4 py-6"><div class="flex flex-wrap items-center gap-3"><h3><code>${esc(r.findingId)}</code></h3>${statusBadge(r.verdict, VERDICTS[r.verdict] ?? r.verdict)}</div><dl class="facts"><dt>Reviewer</dt><dd>${esc(r.reviewer)} (${esc(r.identity)})</dd><dt>Recorded</dt><dd>${esc(r.recordedAt)}</dd><dt>Version</dt><dd>${r.reportHash === hash ? "Current report version" : "Previous report version"}: <code>${esc(r.reportHash)}</code></dd></dl><p>${esc(r.statement)}</p><h4>Explanation</h4><p class="whitespace-pre-wrap">${esc(r.explanation)}</p><h4>Supporting evidence</h4><p class="whitespace-pre-wrap">${esc(r.evidence || "None supplied (uncertain judgment).")}</p><details><summary>Source citation snapshot</summary>${citations(r.citations) || "<p>No source citations.</p>"}</details></article>`).join("") || emptyState("No judgments recorded", "No human feedback has been recorded for this case.")}</section>`, { active: "findings" });
}

type CurrentReport = { report: Report; hash: string };
export function renderFindingFeedbackSummary(current: CurrentReport[], records: FindingFeedback[]): string {
  const reports = new Map(current.map(c => [c.report.case.id, c]));
  const matching: FindingFeedback[] = [];
  let stale = 0, excluded = 0;
  for (const record of records) {
    const c = reports.get(record.caseId);
    if (!c) excluded++;
    else if (record.reportHash !== c.hash) stale++;
    else if (!c.report.findings.some(f => f.id === record.findingId)) excluded++;
    else matching.push(record);
  }
  const counts = { real: 0, not_real: 0, uncertain: 0, disputed: 0, unjudged: 0 };
  let latestCount = 0;
  const rows = [...reports.values()].flatMap(({ report, hash }) => [...new Map(report.findings.map(f => [f.id, f])).values()].map(finding => {
    const history = matching.filter(r => r.caseId === report.case.id && r.reportHash === hash && r.findingId === finding.id);
    const latest = new Map<string, FindingFeedback>();
    // Append order, not a client-supplied timestamp, determines corrections within one report version.
    for (const record of history) latest.set(record.reviewer.trim().toLocaleLowerCase("en-US"), record);
    latestCount += latest.size;
    const judgments = new Set([...latest.values()].map(r => r.verdict));
    const verdict = judgments.has("real") && judgments.has("not_real") ? "disputed"
      : judgments.has("unsure") ? "uncertain" : judgments.has("real") ? "real" : judgments.has("not_real") ? "not_real" : "unjudged";
    counts[verdict]++;
    const label = { real: "Real problem", not_real: "Not a problem", uncertain: "Uncertain", disputed: "Disputed", unjudged: "Unjudged" }[verdict];
    return `<tr><td><a href="/case/${encodeURIComponent(report.case.id)}/findings"><code>${esc(report.case.id)}</code></a></td><td><code>${esc(finding.id)}</code><p>${esc(finding.statement)}</p></td><td>${statusBadge(verdict, label)}</td><td>${latest.size}</td><td>${history.length}</td></tr>`;
  }));
  const facts = { "Total current findings": rows.length, "Human judgments: real problem": counts.real, "Human judgments: not a problem": counts.not_real, "Uncertain": counts.uncertain, "Disputed": counts.disputed, "Unjudged": counts.unjudged,
    "Raw history records": records.length, "Current matching records": matching.length, "Superseded current records": matching.length - latestCount, "Stale report records": stale, "Other excluded records": excluded };
  return renderDocument("Human finding judgments", `${pageHeader("Human finding judgments", "Human assessments of current report findings, with history retained.", actionLink("/", "All reports", { icon: "back" }))}
<p>These self-declared human judgments are not verified truth. This summary describes only the current reports and case IDs listed below; calibration and follow-up results are separate.</p>
<details><summary>How judgments are counted</summary><div class="space-y-3"><p>Each finding counts once. For each self-declared reviewer name (trimmed, case-insensitive), only the latest appended judgment on the current report version counts. Opposing decisive judgments are disputed. Otherwise any not-sure judgment makes the finding uncertain; only unanimous decisive judgments count as real problem or not a problem. A finding with no current judgments is unjudged.</p>
<p class="muted">Names are not authenticated, so this policy cannot establish independent reviewers. Raw history remains append-only. Stale report records have a different report hash; other excluded records refer to cases outside this summary or finding IDs absent from a current report.</p></div></details>
<dl class="facts">${Object.entries(facts).map(([label, n]) => `<dt>${label}</dt><dd>${n}</dd>`).join("")}</dl>
<section aria-labelledby="scope"><h2 id="scope">Included cases</h2>${reports.size ? `<ul>${[...reports.values()].map(c => `<li><a href="/case/${encodeURIComponent(c.report.case.id)}/findings"><code>${esc(c.report.case.id)}</code></a> · current hash <code>${esc(c.hash)}</code></li>`).join("")}</ul>` : "<p>No current reports supplied.</p>"}</section>
<section aria-labelledby="judgments"><h2 id="judgments">Finding judgments</h2><div class="scroll"><table><thead><tr><th>Case</th><th>Finding</th><th>Human judgment</th><th>Current reviewers</th><th>Current history records</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>${!rows.length ? emptyState("No current findings", "No current findings to summarize.") : ""}</section>`, { active: "findings" });
}
