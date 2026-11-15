import {renderHunk} from './ui/code.ts';
// Assessment queue and supporting evidence workspace pages.
import { cohortLabel, COHORT_LABELS } from "./cohorts.ts";
import type {Job} from "./submissions.ts";
import type { Report } from "./report.ts";
import { VERDICT } from "./render.ts";
import { trustFloor, type TrustEvent } from "./states.ts";
import { renderDocument } from "./ui/document.ts";
import { actionLink, emptyState, pageHeader, statusBadge } from "./ui/components.ts";
import { esc } from "./ui/html.ts";

/** "2026-11-14T06:28:19.841Z" as "2026-11-14 06:28 UTC". */
const when = (iso: string | null) => (iso ? iso.replace(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d).*$/, "$1 $2 UTC") : "");

type AssessmentRow = { id: string; requirementId: string; title: string; route: string | null; generatedAt: string | null; signoffs: number };

function assessmentRow(row: AssessmentRow) {
  const href = `/case/${encodeURIComponent(row.id)}`;
  const cohort = cohortLabel(row.id);
  return `<article class="item-row flex flex-col items-stretch gap-4 rounded-none p-5 sm:p-6">
<div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0 flex-1"><p class="mb-2 text-sm text-subtle">${esc(cohort)}</p><h3 class="text-base font-semibold">${row.route ? `<a class="hover:underline" href="${href}">${esc(row.requirementId)}</a>` : esc(row.requirementId)}</h3><p class="mt-1 max-w-[78ch] text-base leading-relaxed">${row.route ? `<a class="hover:underline" href="${href}">${esc(row.title)}</a>` : esc(row.title)}</p></div>${row.route ? statusBadge(row.route) : statusBadge("not_run", "No report yet")}</div>
<div class="flex flex-wrap items-center justify-between gap-4"><div class="flex flex-wrap gap-x-5 gap-y-1 text-sm text-subtle"><span>${row.generatedAt ? `Sheet generated <time datetime="${esc(row.generatedAt)}">${esc(when(row.generatedAt))}</time>` : "Sheet not generated"}</span><span>${row.signoffs} ${row.signoffs === 1 ? "signature" : "signatures"}</span></div>
${row.route ? `<div class="actions">${actionLink(href, "Open report", { icon: "arrow" })}<details class="text-sm"><summary>More actions</summary><div class="actions">${actionLink(`${href}/blind`, "Blind spot-check")}${cohort === "Supplied sample" ? actionLink(`/assess?example=${encodeURIComponent(row.id)}`, "Assess a copy") : ""}</div></details></div>` : `<div class="text-sm text-subtle">Generate with <code>node src/cli.ts all ${esc(row.id)}</code></div>`}</div></article>`;
}

function submissionRows(jobs: Job[]) {
  return jobs.map(job => `<article class="item-row flex flex-col items-stretch gap-4 rounded-none p-5 sm:p-6"><div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0 flex-1"><h3 class="break-words text-base font-semibold">${esc(job.repository.replace(/^https:\/\/github\.com\//, ""))}</h3><p class="mt-1 text-sm text-subtle">${esc(job.stage)} · Updated <time datetime="${esc(job.updatedAt)}">${esc(when(job.updatedAt))}</time></p></div>${statusBadge(job.status)}</div><div class="actions">${job.status === "completed" ? `${actionLink(`/case/${encodeURIComponent(job.id)}`, "Open report", { icon: "arrow" })}<a href="/assess/${encodeURIComponent(job.id)}">Run details</a>` : actionLink(`/assess/${encodeURIComponent(job.id)}`, "View progress", { icon: "arrow" })}</div></article>`).join("");
}

export function renderIndex(rows: AssessmentRow[], jobs: Job[] = []) {
  return renderDocument("Assessments", `
${pageHeader("Assessments", "Inspect the evidence, resolve open decisions, and record a human sign-off.", actionLink("/assess", "New assessment", { primary: true, icon: "plus" }))}
<section class="mb-8" aria-labelledby="submissions"><div class="mb-4"><h2 class="section-heading" id="submissions">Your submissions <span class="ml-2 text-sm font-normal text-subtle">${jobs.length}</span></h2><p class="section-description">User submissions, separate from reference cases.</p></div><div class="panel grid gap-3 bg-canvas overflow-hidden p-0 sm:p-0">${jobs.length ? submissionRows(jobs) : emptyState("No assessments submitted", "Compare two revisions of your repository to start a review.", actionLink("/assess", "New assessment", { icon: "plus" }))}</div></section>
<section class="mb-8" aria-labelledby="examples"><div class="mb-4"><h2 class="section-heading" id="examples">Examples and evaluation cases <span class="ml-2 text-sm font-normal text-subtle">${rows.length}</span></h2><p class="section-description">Reference cases are labelled by their evaluation cohort.</p></div><div class="panel grid gap-3 bg-canvas overflow-hidden p-0 sm:p-0">${rows.length ? rows.map(assessmentRow).join("") : emptyState("No saved cases", "Saved examples and evaluation cases will appear here.")}</div></section>
<details class="advanced mt-6"><summary>Evaluation tools</summary><p class="muted">Optional studies and reference examples, separate from assessment decisions and trust.</p><nav class="grid gap-3 pt-3 sm:grid-cols-2" aria-label="Evaluation tools"><a href="/evaluation/findings">Finding judgments</a><a href="/evaluation/targeted">Targeted reading observations</a><a href="/evaluation/experiments">Human review observations</a><a href="/examples">Frontend and security examples</a><a href="/trust">Trust record</a><a href="/evaluation/control">Control availability</a><a href="/evaluation/control-v2">Control follow-up</a></nav></details>`, { active: "assessments" });
}

export function renderBlind(r: Report, requirement: { title: string; body: string }, nonce: string) {
  const base = `/case/${encodeURIComponent(r.case.id)}`;
  return renderDocument(`Blind spot-check ${r.case.requirementId}`, `
${pageHeader("Blind spot-check", `${r.case.requirementId} · ${cohortLabel(r.case.id)}`)}
<div class="notice" role="note"><strong class="mb-2 block">The reviewer's sheet is hidden.</strong>Read the change as if no reviewer had looked at it. Write down every problem or open question you find. Afterwards the sheet is shown and you mark which of your notes it already had.</div>
<section><h2>What the change is for</h2><p><a href="${esc(r.case.requirementUrl ?? "#")}">${esc(r.case.requirementId)}</a>: ${esc(requirement.title)}</p>
<div class="panel max-h-96 overflow-auto p-5"><pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed">${esc(requirement.body)}</pre></div></section>
<section><h2>The change</h2><p class="muted">${r.inventory.totals.files} files, +${r.inventory.totals.added} / −${r.inventory.totals.removed}. Changed lines only, numbered as in the base (−) and head (+) files.</p>
${r.hunks.map(h => renderHunk(h,true)).join("")}</section>
<section><h2>Your notes</h2>
<form method="post" action="${base}/spotcheck">
<div class="field"><label for="notes">Findings</label><textarea id="notes" name="notes" rows="8" required placeholder="One problem or question per line"></textarea></div>
<div class="field"><label for="name">Name</label><input type="text" id="name" name="name" required autocomplete="name"></div>
<div class="field"><span></span><label><input type="checkbox" name="blind" value="yes"> I had not seen this change, its sheet, or anyone's notes about it before this read</label></div>
<p class="muted">Only blind reads count toward an area's trust record. An informed read is saved but kept out of it.</p>
<button type="submit">Show the sheet and compare</button></form></section>`, { active: "assessments", nonce });
}

/** The sheet with the marking form placed above it. */
export function renderReveal(sheetHtml: string, caseId: string, sid: string, spot: { notes: string[]; blind: boolean }, areas: string[]) {
  const form = `${pageHeader("Compare your notes", "Mark what the sheet already covered and what the reviewer missed.")}
<p>${spot.blind ? "Blind read." : "<b>Informed read:</b> it will be saved but kept out of the trust record."} For each note, say whether the sheet below already has it.</p>
<form class="mb-10" method="post" action="/case/${encodeURIComponent(caseId)}/spotcheck/${encodeURIComponent(sid)}">
<div class="table-panel overflow-x-auto"><table><thead><tr><th>Your note</th><th>Is it on the sheet?</th><th>Area, if missed</th></tr></thead><tbody>
${spot.notes.map((n, i) => `<tr><td class="min-w-48">${esc(n)}</td><td><fieldset><legend class="muted">Note ${i + 1}</legend><div class="choices">
<label><input type="radio" name="mark.${i}" value="on_sheet" required> On the sheet</label><label><input type="radio" name="mark.${i}" value="missed"> Missed by the reviewer</label></div></fieldset></td>
<td><select name="area.${i}" aria-label="Area for note ${i + 1}">${areas.map((a) => `<option>${esc(a)}</option>`).join("")}</select></td></tr>`).join("")}
</tbody></table></div><button type="submit">Record the spot-check</button></form>`;
  return sheetHtml.replace('<main class="sheet">', `<main class="sheet">${form}`);
}

function floorsTable(events: TrustEvent[], areas: { name: string; owner: string }[], perStep: number) {
  return `<div class="table-panel overflow-x-auto"><table><thead><tr><th>Area</th><th>Owner</th><th>Trust floor</th><th>Events</th></tr></thead><tbody>
${areas.map((a) => { const ev = events.filter((e) => e.area === a.name); const t = trustFloor(ev, perStep);
    return `<tr><td><code>${esc(a.name)}</code></td><td>${esc(a.owner)}</td><td>${statusBadge(t.floor)}<div class="detail">Area ${esc(t.reason)}.</div></td><td>${ev.length}</td></tr>`; }).join("")}</tbody></table></div>`;
}

export function renderTrust(real: (TrustEvent & { caseId?: string; description?: string })[], simulated: TrustEvent[], areas: { name: string; owner: string }[], perStep: number, policyVersion: string, notice?: string, cases: { id: string; requirementId: string }[] = []) {
  const simAreas = [...new Set(simulated.map((e) => e.area))].map((name) => ({ name, owner: "synthetic" }));
  return renderDocument("Trust record", `
${pageHeader("Trust record", "Blind spot-checks and recorded escapes set the reading floor for each area.")}
${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ""}
<p>Every area starts at full read. It earns one step lighter after ${perStep} clean blind spot-checks in a row, and drops back to full read on any miss or escape. These thresholds come from policy ${esc(policyVersion)} and are illustrative and unvalidated.</p>
<section><h2>Real record</h2>
${real.length ? "" : "<p>No spot-checks recorded yet, so every area stays at full read. A blind spot-check from any sheet adds the first entry.</p>"}
<p>Event counts include all recorded cases and planted-bug events listed below; simulated history is separate. Recorded case IDs: ${esc([...new Set(real.map((e) => e.caseId).filter(Boolean))].join(", ") || "none")}.</p>
${floorsTable(real, areas, perStep)}
${real.length ? `<div class="table-panel overflow-x-auto"><table><thead><tr><th>When</th><th>Area</th><th>Event</th><th>Case</th></tr></thead><tbody>${real.map((e) => `<tr><td class="muted whitespace-nowrap">${esc(when(e.at))}</td><td><code>${esc(e.area)}</code></td><td>${esc(e.type.replaceAll("_", " "))}${(e as any).synthetic ? ` <span class="muted">(from a synthetic planted bug)</span>` : ""}${e.description ? `<div class="detail">${esc(e.description)}</div>` : ""}</td><td>${esc(e.caseId ?? "")} ${e.caseId ? `(${esc(cohortLabel(e.caseId))})` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
</section>
${cases.length ? `<section><h2>Record an escape</h2>
<p>An escape is a problem found after a change was accepted: a revert, an incident, a bug report. Recording one sends the area back to full read, whatever its record.</p>
<form method="post" action="/trust/escape">
<div class="field"><label for="area">Area</label><select id="area" name="area" required>${areas.map((a) => `<option>${esc(a.name)}</option>`).join("")}</select></div>
<div class="field"><label for="caseId">Change</label><select id="caseId" name="caseId" required>${cases.map((c) => `<option value="${esc(c.id)}">${esc(cohortLabel(c.id))}: ${esc(c.requirementId)}</option>`).join("")}</select></div>
<div class="field"><label for="description">What escaped</label><textarea id="description" name="description" rows="3" required></textarea></div>
<div class="field"><label for="name">Your name</label><input type="text" id="name" name="name" required autocomplete="name"></div>
<button type="submit">Record the escape</button></form></section>` : ""}
${simulated.length ? `<section class="panel mt-8 p-5 sm:p-6" aria-labelledby="sim"><h2 id="sim">SIMULATED</h2><p class="section-description">Synthetic events made up to show how the rule behaves. They are not part of the real record and change no route.</p><div class="mt-5">
${floorsTable(simulated, simAreas, perStep)}
<div class="table-panel overflow-x-auto"><table><thead><tr><th>Step</th><th>Area</th><th>Synthetic event</th><th>Floor after this event</th></tr></thead><tbody>
${simulated.map((e, i) => `<tr><td>${i + 1}</td><td><code>${esc(e.area)}</code></td><td>${esc(e.type.replaceAll("_", " "))}</td><td>${esc(VERDICT[trustFloor(simulated.slice(0, i + 1).filter((x) => x.area === e.area), perStep).floor])}</td></tr>`).join("")}
</tbody></table></div></div></section>` : `<p class="muted">No simulated history. Run <code>node src/cli.ts simulate</code> to see how the rule behaves on synthetic events.</p>`}
<p>${actionLink("/", "All changes", { icon: "back" })}</p>`, { active: "trust" });
}

export const renderMessage = (title: string, message: string, back: string) =>
  renderDocument(title, `${pageHeader(title)}<div class="errors" role="alert"><p>${esc(message)}</p></div><p>${actionLink(back, "Go back", { icon: "back" })}</p>`);

const of = (f: { n: number; of: number }) => (f.of ? `${f.n} of ${f.of} (${Math.round((f.n / f.of) * 100)}%)` : "no data yet");

export function renderMetrics(m: import("./metrics.ts").Metrics) {
  const row = (label: string, value: string, note = "") => `<tr><td>${esc(label)}</td><td class="whitespace-nowrap"><b>${esc(value)}</b></td><td class="muted">${esc(note)}</td></tr>`;
  const table = (rows: string) => `<div class="table-panel overflow-x-auto"><table><thead><tr><th>Measure</th><th>Value</th><th>What it counts</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const cal = m.calibration;
  return renderDocument("Review metrics", `
${pageHeader("Review metrics", "How trust is measured, with every figure tied to its recorded scope.", actionLink("/evaluation/control", "Control availability"))}
<p><a href="/evaluation/control">Control availability and build attempts</a>. An unavailable control contributes no reviewed case or false-alarm count.</p>
<p>Every figure is computed from files under <code>data/</code> and shows its denominator. These small evaluation cohorts are not statistical evidence of safety.</p>
<p>Scope of every non-calibration aggregate below: ${esc(m.scope.caseIds.map((id) => `${id} (${COHORT_LABELS[m.scope.cohorts[id]]})`).join(", ") || "no cases")}. Owner measures include only recorded sign-offs for these cases.</p>
<nav class="actions my-5" aria-label="Metric scope">${actionLink("/metrics", "All cases")}${actionLink("/metrics?cohort=sample", "Supplied samples")}${actionLink("/metrics?cohort=holdout", "Holdout")}${actionLink("/metrics?cohort=control", "Merged control")}</nav>
<section><h2>Per change</h2><div class="table-panel overflow-x-auto"><table><thead><tr><th>Requirement</th><th>Files</th><th>Changed lines</th><th>Targeted reading list</th><th>Read ratio</th><th>Evidence route</th><th>Once unblocked</th><th>Effective route</th></tr></thead><tbody>
${m.cases.map((c) => `<tr><td><a href="/case/${encodeURIComponent(c.id)}">${esc(c.id)}</a><div class="detail">${esc(COHORT_LABELS[c.cohort])}</div>${c.reviewer !== "ok" ? `<div class="detail">AI reviewer ${esc(c.reviewer)}</div>` : ""}</td><td>${c.files}</td><td>${c.lines}</td><td>${c.readingListLines} lines</td>
<td>${c.readRatio === null ? `<span class="muted">n/a, blocked</span>` : `${Math.round(c.readRatio * 100)}%`}</td><td>${statusBadge(c.evidenceRoute)}</td>
<td>${c.ifUnblocked ? `${statusBadge(c.ifUnblocked.route)}${c.ifUnblocked.route === "targeted" && c.ifUnblocked.readRatio !== null ? `<div class="detail">${Math.round(c.ifUnblocked.readRatio * 100)}% of lines</div>` : ""}` : `<span class="muted">not blocked</span>`}</td><td>${statusBadge(c.effectiveRoute)}</td></tr>`).join("")}
</tbody></table></div>
${table(Object.entries(m.routeShare).map(([k, v], i) => row(`Changes routed ${VERDICT[k as keyof typeof VERDICT].toLowerCase()}`, of(v), i === 0 ? "The effective route on each change's current sheet." : "")).join(""))}</section>
<section><h2>Raw review counts</h2><p>Counts are not false-alarm judgments. A merged, not-reverted control is assumed clean, not proven clean. <a href="/evaluation/findings">Independent human finding judgments</a> are collected separately, including for blocked reports; they do not change these frozen aggregates.</p>
<div class="table-panel overflow-x-auto"><table><thead><tr><th>Case / cohort</th><th>Findings</th><th>Model decisions</th><th>Unexplained hunks</th><th>Broken claims</th><th>Route</th></tr></thead><tbody>
${m.cases.map((c) => `<tr><td>${esc(c.id)} (${esc(COHORT_LABELS[c.cohort])})</td><td>${c.rawCounts.findings}</td><td>${c.rawCounts.modelDecisions}</td><td>${c.rawCounts.unexplainedHunks}</td><td>${c.rawCounts.brokenClaims}</td><td>${esc(VERDICT[c.effectiveRoute])}</td></tr>`).join("")}
</tbody></table></div></section>
<section><h2>What the evidence supports</h2>${table(
  Object.entries(m.claimsByState).map(([k, v], i) => row(`Claims ${k.replace("_", " ")}`, of(v), i === 0 ? `Claims on the ${m.citationCasesWithReviewer.n} of ${m.citationCasesWithReviewer.of} sheets the AI reviewer has seen. States are computed by code from evidence, never by the model.` : "")).join("") +
  row("Changed tests that discriminate", of(m.discriminatingTests), "Pass at head and fail with the base source. The rest pass either way and prove nothing about the change.") +
  row("Citations that resolved", of(m.citationValidity), `Quote found at the stated file, lines and commit. Over the ${m.citationCasesWithReviewer.n} of ${m.citationCasesWithReviewer.of} changes the AI reviewer has seen.`))}</section>
<section class="panel mt-8 p-5 sm:p-6" aria-labelledby="cal"><h2 id="cal">SYNTHETIC calibration</h2><p class="section-description">Calibration with hand-written planted bugs. Planted bugs are not real bugs.</p><div class="mt-5">
<p>Calibration scope only: ${esc(m.calibrationScope.plants.join(", ") || "no plant IDs recorded")}; source cases: ${esc(m.calibrationScope.sourceCases.join(", ") || "none")}.</p>
${cal ? table(row("Caught by a run", of({ n: cal.caughtByRun, of: cal.total }), "A check that passed on the original change fails with the plant.") +
  row("Caught by the AI reviewer only", of({ n: cal.caughtByModelOnly, of: cal.total }), "A finding or decision points at the planted lines and no run caught it.") +
  row("Missed", of({ n: cal.missed, of: cal.total }), "Nothing on the sheet points at the plant.") +
  row("AI reviewer not run yet", of({ n: cal.modelNotRun, of: cal.total }), "No run caught these; whether the reviewer would is still open.")) : `<p>No calibration run yet. Run <code>node src/cli.ts calibrate</code>.</p>`}
</div></section>
<section><h2>What the owners did</h2>${table(row("Sign-offs recorded", String(m.signoffs), "Each signed by a named person; identity is self-declared in this prototype.") +
  row("Findings marked a real problem", of(m.findingsMarked.real), "Owner feedback given when signing.") +
  row("Findings marked not a problem", of(m.findingsMarked.notReal), "Owner feedback given when signing."))}</section>
<section><h2>No data yet</h2><div class="table-panel overflow-x-auto"><table><thead><tr><th>Measure</th><th>Definition</th></tr></thead><tbody>
${m.noDataYet.map((x) => `<tr><td>${esc(x.metric)}</td><td>${esc(x.definition)}</td></tr>`).join("")}</tbody></table></div>
<p><b>Guard rule:</b> ${esc(m.guardRule)}</p></section>
<p>${actionLink("/", "All changes", { icon: "back" })}</p>`, { active: "metrics" });
}

export function renderControlEvaluation(record: {
  status: string; reason: string; countMeaning: string; cleanAssumption: string;
  rawCounts: Record<string, number | null>; route: string | null;
  attempts: { pr: number; requiredSdks: string[]; installedSdk: string; record?: string; runs?: { record: string }[] }[];
}) {
  return renderDocument("Control availability", `${pageHeader("Control availability", "Build attempts and counts for the merged control cohort.")}
<div class="notice"><p>${statusBadge(record.status, `Status: ${record.status.replaceAll("_", " ")}`)}</p><p>${esc(record.reason)}</p></div>
<p>${esc(record.countMeaning)}</p><p>${esc(record.cleanAssumption)}</p>
<h2>Raw counts — control cohort only</h2>
<div class="table-panel overflow-x-auto"><table><thead><tr><th>Measure</th><th>Value</th></tr></thead><tbody>
${Object.entries(record.rawCounts).map(([name, count]) => `<tr><td>${esc(name)}</td><td>${count === null ? "Unavailable, not zero" : count}</td></tr>`).join("")}
<tr><td>Route</td><td>${record.route === null ? "Unavailable, not zero" : esc(record.route)}</td></tr></tbody></table></div>
<h2>Build attempts (${record.attempts.length}; not reviewed cases)</h2>
<div class="table-panel overflow-x-auto"><table><thead><tr><th>Upstream PR</th><th>Required SDK</th><th>Container SDK</th><th>Run records</th></tr></thead><tbody>
${record.attempts.map((a) => `<tr><td>${a.pr}</td><td>${esc(a.requiredSdks.join(", "))}</td><td>${esc(a.installedSdk)}</td><td>${(a.runs?.map((r) => r.record) ?? (a.record ? [a.record] : [])).map((path) => `<a href="/${esc(path)}">Run JSON</a> <a href="/${esc(path.replace(/\.json$/, ".log"))}">Log</a>`).join("<br>")}</td></tr>`).join("")}
</tbody></table></div><p>No agent finding judgments or human review actions were recorded.</p>
<nav class="actions" aria-label="Control navigation">${actionLink("/metrics?cohort=control", "Control metric scope")}${actionLink("/", "All changes", { icon: "back" })}</nav>`, { active: "metrics" });
}
