// Pages of the sign-off server other than the sheet itself. Same design system as the sheet.
import { cohortLabel, COHORT_LABELS } from "./cohorts.ts";
import type { Report } from "./report.ts";
import { ACTIVE_TIME_SCRIPT, CSS, esc, VERDICT } from "./render.ts";
import { trustFloor, type TrustEvent } from "./states.ts";

const PAGE_CSS = `
.desk h1{font-size:34px}
.route-word{font:800 19px var(--head);font-stretch:condensed;color:var(--route)}
.blind-banner{background:var(--ink);color:#fff;padding:18px 24px;margin:20px 0}
.blind-banner b{display:block;font:800 30px/1.1 var(--head);font-stretch:condensed}
.req-body{background:var(--wash);padding:12px 14px;max-height:420px;overflow:auto}
.req-body pre{font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap}
.sim{margin-top:40px;border:3px solid var(--argued)}
.sim-band{background:repeating-linear-gradient(-45deg,#F7E7B4 0 14px,#FFFFFF 14px 28px);padding:12px 20px;border-bottom:3px solid var(--argued)}
.sim-band b{font:800 30px var(--head);font-stretch:condensed;color:var(--argued);letter-spacing:.06em}
.sim-body{padding:4px 20px 16px}
.note-row td:first-child{width:45%}
.nowrap,td code{white-space:nowrap}
`;

/** "2026-11-14T06:28:19.841Z" as "2026-11-14 06:28 UTC". */
const when = (iso: string | null) => (iso ? iso.replace(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d).*$/, "$1 $2 UTC") : "");

const page = (title: string, body: string, nonce?: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${CSS}${PAGE_CSS}</style></head><body><main class="sheet">${body}</main>
${nonce ? `<script nonce="${esc(nonce)}">${ACTIVE_TIME_SCRIPT}</script>` : ""}</body></html>`;

export function renderIndex(rows: { id: string; requirementId: string; title: string; route: string | null; generatedAt: string | null; signoffs: number }[]) {
  return page("ReviewProof: changes waiting for an owner", `<div class="desk">
<h1>Changes waiting for an owner</h1>
<p>Each change has a sign-off sheet; supplied samples, the holdout and the merged control are labelled separately. The AI reviewer never approves; a named person signs.</p>
<div class="scroll"><table><thead><tr><th>Requirement</th><th>Route</th><th>Sheet generated</th><th>Signatures</th><th></th></tr></thead><tbody>
${rows.map((r) => `<tr><td><span class="muted">${esc(cohortLabel(r.id))}</span><br><b>${esc(r.requirementId)}</b> ${esc(r.title)}</td>
<td>${r.route ? `<span class="route-word r-${esc(r.route)}">${esc(VERDICT[r.route as keyof typeof VERDICT])}</span>` : `<span class="muted">No report yet</span>`}</td>
<td class="muted nowrap">${esc(when(r.generatedAt))}</td><td>${r.signoffs}</td>
<td class="nowrap">${r.route ? `<a href="/case/${encodeURIComponent(r.id)}">Open sheet</a><br><a href="/case/${encodeURIComponent(r.id)}/blind">Blind spot-check</a>` : `<span class="muted">Generate with</span><br><code>node src/cli.ts all ${esc(r.id)}</code>`}</td></tr>`).join("")}
</tbody></table></div>
<p><a href="/trust">Trust record by area</a><br><a href="/metrics">How trust is measured</a><br><a href="/evaluation/control">Merged control: availability and build attempts</a></p></div>`);
}

export function renderBlind(r: Report, requirement: { title: string; body: string }, nonce: string) {
  const base = `/case/${encodeURIComponent(r.case.id)}`;
  return page(`Blind spot-check ${r.case.requirementId}`, `
<h1>Blind spot-check for ${esc(r.case.requirementId)}</h1><p>${esc(cohortLabel(r.case.id))}</p>
<div class="blind-banner" role="note"><b>The reviewer's sheet is hidden.</b>Read the change as if no reviewer had looked at it. Write down every problem or open question you find. Afterwards the sheet is shown and you mark which of your notes it already had.</div>
<section><h2>What the change is for</h2><p><a href="${esc(r.case.requirementUrl ?? "#")}">${esc(r.case.requirementId)}</a>: ${esc(requirement.title)}</p>
<div class="req-body"><pre>${esc(requirement.body)}</pre></div></section>
<section><h2>The change</h2><p class="muted">${r.inventory.totals.files} files, +${r.inventory.totals.added} / −${r.inventory.totals.removed}. Changed lines only, numbered as in the base (−) and head (+) files.</p>
${r.hunks.map((h) => `<div class="hunk" id="${esc(h.id)}"><h3>${esc(h.id)}  ${esc(h.file)}  base ${h.oldStart}, head ${h.newStart}</h3><pre>${[
    ...h.removed.map((l, k) => `<span class="del">−${String(h.oldStart + k).padStart(5)}  ${esc(l)}</span>`),
    ...h.added.map((l, k) => `<span class="add">+${String(h.newStart + k).padStart(5)}  ${esc(l)}</span>`)].join("")}</pre></div>`).join("")}</section>
<section><h2>Your notes</h2>
<form method="post" action="${base}/spotcheck"><input type="hidden" name="activeSeconds" value="0">
<div class="field"><label for="notes">Findings</label><textarea id="notes" name="notes" rows="8" required placeholder="One problem or question per line"></textarea></div>
<div class="field"><label for="name">Name</label><input type="text" id="name" name="name" required autocomplete="name"></div>
<div class="field"><span></span><label><input type="checkbox" name="blind" value="yes"> I had not seen this change, its sheet, or anyone's notes about it before this read</label></div>
<p class="muted">Only blind reads count toward an area's trust record. An informed read is saved but kept out of it.</p>
<button type="submit">Show the sheet and compare</button></form></section>`, nonce);
}

/** The sheet with the marking form placed above it. */
export function renderReveal(sheetHtml: string, caseId: string, sid: string, spot: { notes: string[]; blind: boolean }, areas: string[]) {
  const form = `<h1>Compare your notes with the sheet</h1>
<p>${spot.blind ? "Blind read." : "<b>Informed read:</b> it will be saved but kept out of the trust record."} For each note, say whether the sheet below already has it.</p>
<form method="post" action="/case/${encodeURIComponent(caseId)}/spotcheck/${encodeURIComponent(sid)}">
<div class="scroll"><table><thead><tr><th>Your note</th><th>Is it on the sheet?</th><th>Area, if missed</th></tr></thead><tbody>
${spot.notes.map((n, i) => `<tr class="note-row"><td>${esc(n)}</td><td><fieldset><legend class="muted">Note ${i + 1}</legend><div class="choices">
<label><input type="radio" name="mark.${i}" value="on_sheet" required> On the sheet</label><label><input type="radio" name="mark.${i}" value="missed"> Missed by the reviewer</label></div></fieldset></td>
<td><select name="area.${i}" aria-label="Area for note ${i + 1}">${areas.map((a) => `<option>${esc(a)}</option>`).join("")}</select></td></tr>`).join("")}
</tbody></table></div><button type="submit">Record the spot-check</button></form><hr style="margin:32px 0;border:0;border-top:2px solid var(--rule)">`;
  return sheetHtml.replace('<main class="sheet">', `<main class="sheet">${form}`);
}

function floorsTable(events: TrustEvent[], areas: { name: string; owner: string }[], perStep: number) {
  return `<div class="scroll"><table><thead><tr><th>Area</th><th>Owner</th><th>Trust floor</th><th>Events</th></tr></thead><tbody>
${areas.map((a) => { const ev = events.filter((e) => e.area === a.name); const t = trustFloor(ev, perStep);
    return `<tr><td><code>${esc(a.name)}</code></td><td>${esc(a.owner)}</td><td>${esc(VERDICT[t.floor])}<div class="detail">Area ${esc(t.reason)}.</div></td><td>${ev.length}</td></tr>`; }).join("")}</tbody></table></div>`;
}

export function renderTrust(real: (TrustEvent & { caseId?: string; description?: string })[], simulated: TrustEvent[], areas: { name: string; owner: string }[], perStep: number, policyVersion: string, notice?: string, cases: { id: string; requirementId: string }[] = []) {
  const simAreas = [...new Set(simulated.map((e) => e.area))].map((name) => ({ name, owner: "synthetic" }));
  return page("Trust record", `
<h1>Trust record by area</h1>
${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ""}
<p>Every area starts at full read. It earns one step lighter after ${perStep} clean blind spot-checks in a row, and drops back to full read on any miss or escape. These thresholds come from policy ${esc(policyVersion)} and are illustrative and unvalidated.</p>
<section><h2>Real record</h2>
${real.length ? "" : "<p>No spot-checks recorded yet, so every area stays at full read. A blind spot-check from any sheet adds the first entry.</p>"}
<p>Event counts include all recorded cases and planted-bug events listed below; simulated history is separate. Recorded case IDs: ${esc([...new Set(real.map((e) => e.caseId).filter(Boolean))].join(", ") || "none")}.</p>
${floorsTable(real, areas, perStep)}
${real.length ? `<div class="scroll"><table><thead><tr><th>When</th><th>Area</th><th>Event</th><th>Case</th></tr></thead><tbody>${real.map((e) => `<tr><td class="muted nowrap">${esc(when(e.at))}</td><td><code>${esc(e.area)}</code></td><td>${esc(e.type.replaceAll("_", " "))}${(e as any).synthetic ? ` <span class="muted">(from a synthetic planted bug)</span>` : ""}${e.description ? `<div class="detail">${esc(e.description)}</div>` : ""}</td><td>${esc(e.caseId ?? "")} ${e.caseId ? `(${esc(cohortLabel(e.caseId))})` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
</section>
${cases.length ? `<section><h2>Record an escape</h2>
<p>An escape is a problem found after a change was accepted: a revert, an incident, a bug report. Recording one sends the area back to full read, whatever its record.</p>
<form method="post" action="/trust/escape">
<div class="field"><label for="area">Area</label><select id="area" name="area" required>${areas.map((a) => `<option>${esc(a.name)}</option>`).join("")}</select></div>
<div class="field"><label for="caseId">Change</label><select id="caseId" name="caseId" required>${cases.map((c) => `<option value="${esc(c.id)}">${esc(cohortLabel(c.id))}: ${esc(c.requirementId)}</option>`).join("")}</select></div>
<div class="field"><label for="description">What escaped</label><textarea id="description" name="description" rows="3" required></textarea></div>
<div class="field"><label for="name">Your name</label><input type="text" id="name" name="name" required autocomplete="name"></div>
<button type="submit">Record the escape</button></form></section>` : ""}
${simulated.length ? `<section class="sim" aria-labelledby="sim"><div class="sim-band"><b id="sim">SIMULATED</b><div>Synthetic events made up to show how the rule behaves. They are not part of the real record and change no route.</div></div><div class="sim-body">
${floorsTable(simulated, simAreas, perStep)}
<div class="scroll"><table><thead><tr><th>Step</th><th>Area</th><th>Synthetic event</th><th>Floor after this event</th></tr></thead><tbody>
${simulated.map((e, i) => `<tr><td>${i + 1}</td><td><code>${esc(e.area)}</code></td><td>${esc(e.type.replaceAll("_", " "))}</td><td>${esc(VERDICT[trustFloor(simulated.slice(0, i + 1).filter((x) => x.area === e.area), perStep).floor])}</td></tr>`).join("")}
</tbody></table></div></div></section>` : `<p class="muted">No simulated history. Run <code>node src/cli.ts simulate</code> to see how the rule behaves on synthetic events.</p>`}
<p><a href="/">All changes</a></p>`);
}

export const renderMessage = (title: string, message: string, back: string) =>
  page(title, `<h1>${esc(title)}</h1><div class="errors" role="alert"><p>${esc(message)}</p></div><p><a href="${esc(back)}">Go back</a></p>`);

const of = (f: { n: number; of: number }) => (f.of ? `${f.n} of ${f.of} (${Math.round((f.n / f.of) * 100)}%)` : "no data yet");

export function renderMetrics(m: import("./metrics.ts").Metrics) {
  const row = (label: string, value: string, note = "") => `<tr><td>${esc(label)}</td><td class="nowrap"><b>${esc(value)}</b></td><td class="muted">${esc(note)}</td></tr>`;
  const table = (rows: string) => `<div class="scroll"><table><thead><tr><th>Measure</th><th>Value</th><th>What it counts</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const cal = m.calibration;
  return page("How trust is measured", `
<h1>How trust is measured</h1>
<p><a href="/evaluation/control">Control availability and build attempts</a>. An unavailable control contributes no reviewed case or false-alarm count.</p>
<p>Every figure is computed from files under <code>data/</code> and shows its denominator. These small evaluation cohorts are not statistical evidence of safety.</p>
<p>Scope of every non-calibration aggregate below: ${esc(m.scope.caseIds.map((id) => `${id} (${COHORT_LABELS[m.scope.cohorts[id]]})`).join(", ") || "no cases")}. Owner measures include only recorded sign-offs for these cases.</p>
<p>Filter: <a href="/metrics">All cases</a> · <a href="/metrics?cohort=sample">Supplied samples</a> · <a href="/metrics?cohort=holdout">Holdout</a> · <a href="/metrics?cohort=control">Merged control</a></p>
<section><h2>Per change</h2><div class="scroll"><table><thead><tr><th>Requirement</th><th>Files</th><th>Changed lines</th><th>Targeted reading list</th><th>Read ratio</th><th>Evidence route</th><th>Once unblocked</th><th>Effective route</th></tr></thead><tbody>
${m.cases.map((c) => `<tr><td><a href="/case/${encodeURIComponent(c.id)}">${esc(c.id)}</a><div class="detail">${esc(COHORT_LABELS[c.cohort])}</div>${c.reviewer !== "ok" ? `<div class="detail">AI reviewer ${esc(c.reviewer)}</div>` : ""}</td><td>${c.files}</td><td>${c.lines}</td><td>${c.readingListLines} lines</td>
<td>${c.readRatio === null ? `<span class="muted">n/a, blocked</span>` : `${Math.round(c.readRatio * 100)}%`}</td><td>${esc(VERDICT[c.evidenceRoute])}</td>
<td>${c.ifUnblocked ? `${esc(VERDICT[c.ifUnblocked.route])}${c.ifUnblocked.route === "targeted" && c.ifUnblocked.readRatio !== null ? `<div class="detail">${Math.round(c.ifUnblocked.readRatio * 100)}% of lines</div>` : ""}` : `<span class="muted">not blocked</span>`}</td><td><span class="route-word r-${esc(c.effectiveRoute)}">${esc(VERDICT[c.effectiveRoute])}</span></td></tr>`).join("")}
</tbody></table></div>
${table(Object.entries(m.routeShare).map(([k, v], i) => row(`Changes routed ${VERDICT[k as keyof typeof VERDICT].toLowerCase()}`, of(v), i === 0 ? "The effective route on each change's current sheet." : "")).join(""))}</section>
<section><h2>Raw review counts</h2><p>Counts are not false-alarm judgments. A merged, not-reverted control is assumed clean, not proven clean; the human marks findings when signing.</p>
<div class="scroll"><table><thead><tr><th>Case / cohort</th><th>Findings</th><th>Model decisions</th><th>Unexplained hunks</th><th>Broken claims</th><th>Route</th></tr></thead><tbody>
${m.cases.map((c) => `<tr><td>${esc(c.id)} (${esc(COHORT_LABELS[c.cohort])})</td><td>${c.rawCounts.findings}</td><td>${c.rawCounts.modelDecisions}</td><td>${c.rawCounts.unexplainedHunks}</td><td>${c.rawCounts.brokenClaims}</td><td>${esc(VERDICT[c.effectiveRoute])}</td></tr>`).join("")}
</tbody></table></div></section>
<section><h2>What the evidence supports</h2>${table(
  Object.entries(m.claimsByState).map(([k, v], i) => row(`Claims ${k.replace("_", " ")}`, of(v), i === 0 ? `Claims on the ${m.citationCasesWithReviewer.n} of ${m.citationCasesWithReviewer.of} sheets the AI reviewer has seen. States are computed by code from evidence, never by the model.` : "")).join("") +
  row("Changed tests that discriminate", of(m.discriminatingTests), "Pass at head and fail with the base source. The rest pass either way and prove nothing about the change.") +
  row("Citations that resolved", of(m.citationValidity), `Quote found at the stated file, lines and commit. Over the ${m.citationCasesWithReviewer.n} of ${m.citationCasesWithReviewer.of} changes the AI reviewer has seen.`))}</section>
<section class="sim" aria-labelledby="cal"><div class="sim-band"><b id="cal">SYNTHETIC</b><div>Calibration with hand-written planted bugs. Planted bugs are not real bugs.</div></div><div class="sim-body">
<p>Calibration scope only: ${esc(m.calibrationScope.plants.join(", ") || "no plant IDs recorded")}; source cases: ${esc(m.calibrationScope.sourceCases.join(", ") || "none")}.</p>
${cal ? table(row("Caught by a run", of({ n: cal.caughtByRun, of: cal.total }), "A check that passed on the original change fails with the plant.") +
  row("Caught by the AI reviewer only", of({ n: cal.caughtByModelOnly, of: cal.total }), "A finding or decision points at the planted lines and no run caught it.") +
  row("Missed", of({ n: cal.missed, of: cal.total }), "Nothing on the sheet points at the plant.") +
  row("AI reviewer not run yet", of({ n: cal.modelNotRun, of: cal.total }), "No run caught these; whether the reviewer would is still open.")) : `<p>No calibration run yet. Run <code>node src/cli.ts calibrate</code>.</p>`}
</div></section>
<section><h2>What the owners did</h2>${table(row("Sign-offs recorded", String(m.signoffs), "Each signed by a named person; identity is self-declared in this prototype.") +
  row("Findings marked a real problem", of(m.findingsMarked.real), "Owner feedback given when signing.") +
  row("Findings marked not a problem", of(m.findingsMarked.notReal), "Owner feedback given when signing.") +
  (m.activeSeconds.length ? m.activeSeconds.map((a) => row(`Active review time, #${a.caseId}`, `${a.seconds} s`, "Seconds the sheet was visible and focused.")).join("") : row("Active review time per sign-off", "no data yet", "Seconds the sheet was visible and focused while the owner signed.")))}</section>
<section><h2>No data yet</h2><div class="scroll"><table><thead><tr><th>Measure</th><th>Definition</th></tr></thead><tbody>
${m.noDataYet.map((x) => `<tr><td>${esc(x.metric)}</td><td>${esc(x.definition)}</td></tr>`).join("")}</tbody></table></div>
<p><b>Guard rule:</b> ${esc(m.guardRule)}</p></section>
<p><a href="/">All changes</a></p>`);
}

export function renderControlEvaluation(record: {
  status: string; reason: string; countMeaning: string; cleanAssumption: string;
  rawCounts: Record<string, number | null>; route: string | null;
  attempts: { pr: number; requiredSdks: string[]; installedSdk: string; record?: string; runs?: { record: string }[] }[];
}) {
  return page("Merged control evaluation", `<h1>Merged control evaluation</h1>
<p><b>Status: ${esc(record.status.replaceAll("_", " "))}</b>. ${esc(record.reason)}</p>
<p>${esc(record.countMeaning)}</p><p>${esc(record.cleanAssumption)}</p>
<h2>Raw counts — control cohort only</h2>
<table><thead><tr><th>Measure</th><th>Value</th></tr></thead><tbody>
${Object.entries(record.rawCounts).map(([name, count]) => `<tr><td>${esc(name)}</td><td>${count === null ? "Unavailable, not zero" : count}</td></tr>`).join("")}
<tr><td>Route</td><td>${record.route === null ? "Unavailable, not zero" : esc(record.route)}</td></tr></tbody></table>
<h2>Build attempts (${record.attempts.length}; not reviewed cases)</h2>
<table><thead><tr><th>Upstream PR</th><th>Required SDK</th><th>Container SDK</th><th>Run records</th></tr></thead><tbody>
${record.attempts.map((a) => `<tr><td>${a.pr}</td><td>${esc(a.requiredSdks.join(", "))}</td><td>${esc(a.installedSdk)}</td><td>${(a.runs?.map((r) => r.record) ?? (a.record ? [a.record] : [])).map((path) => `<a href="/${esc(path)}">Run JSON</a> <a href="/${esc(path.replace(/\.json$/, ".log"))}">Log</a>`).join("<br>")}</td></tr>`).join("")}
</tbody></table><p>No agent finding judgments or human review actions were recorded.</p>
<p><a href="/metrics?cohort=control">Control metric scope</a> · <a href="/">All changes</a></p>`);
}
