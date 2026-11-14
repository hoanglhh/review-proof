// Pages of the sign-off server other than the sheet itself. Same design system as the sheet.
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
<p>Each agent-written change has a sign-off sheet. The AI reviewer never approves; a named person signs.</p>
<div class="scroll"><table><thead><tr><th>Requirement</th><th>Route</th><th>Sheet generated</th><th>Signatures</th><th></th></tr></thead><tbody>
${rows.map((r) => `<tr><td><b>${esc(r.requirementId)}</b> ${esc(r.title)}</td>
<td>${r.route ? `<span class="route-word r-${esc(r.route)}">${esc(VERDICT[r.route as keyof typeof VERDICT])}</span>` : `<span class="muted">No report yet</span>`}</td>
<td class="muted nowrap">${esc(when(r.generatedAt))}</td><td>${r.signoffs}</td>
<td class="nowrap">${r.route ? `<a href="/case/${encodeURIComponent(r.id)}">Open sheet</a><br><a href="/case/${encodeURIComponent(r.id)}/blind">Blind spot-check</a>` : `<span class="muted">Generate with</span><br><code>node src/cli.ts all ${esc(r.id)}</code>`}</td></tr>`).join("")}
</tbody></table></div>
<p><a href="/trust">Trust record by area</a></p></div>`);
}

export function renderBlind(r: Report, requirement: { title: string; body: string }, nonce: string) {
  const base = `/case/${encodeURIComponent(r.case.id)}`;
  return page(`Blind spot-check ${r.case.requirementId}`, `
<h1>Blind spot-check for ${esc(r.case.requirementId)}</h1>
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

export function renderTrust(real: (TrustEvent & { caseId?: string })[], simulated: TrustEvent[], areas: { name: string; owner: string }[], perStep: number, policyVersion: string, notice?: string) {
  const simAreas = [...new Set(simulated.map((e) => e.area))].map((name) => ({ name, owner: "synthetic" }));
  return page("Trust record", `
<h1>Trust record by area</h1>
${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ""}
<p>Every area starts at full read. It earns one step lighter after ${perStep} clean blind spot-checks in a row, and drops back to full read on any miss or escape. These thresholds come from policy ${esc(policyVersion)} and are illustrative and unvalidated.</p>
<section><h2>Real record</h2>
${real.length ? "" : "<p>No spot-checks recorded yet, so every area stays at full read. A blind spot-check from any sheet adds the first entry.</p>"}
${floorsTable(real, areas, perStep)}
${real.length ? `<div class="scroll"><table><thead><tr><th>When</th><th>Area</th><th>Event</th><th>Case</th></tr></thead><tbody>${real.map((e) => `<tr><td class="muted nowrap">${esc(when(e.at))}</td><td><code>${esc(e.area)}</code></td><td>${esc(e.type.replaceAll("_", " "))}</td><td>${esc(e.caseId ?? "")}</td></tr>`).join("")}</tbody></table></div>` : ""}
</section>
${simulated.length ? `<section class="sim" aria-labelledby="sim"><div class="sim-band"><b id="sim">SIMULATED</b><div>Synthetic events made up to show how the rule behaves. They are not part of the real record and change no route.</div></div><div class="sim-body">
${floorsTable(simulated, simAreas, perStep)}
<div class="scroll"><table><thead><tr><th>Step</th><th>Area</th><th>Synthetic event</th><th>Floor after this event</th></tr></thead><tbody>
${simulated.map((e, i) => `<tr><td>${i + 1}</td><td><code>${esc(e.area)}</code></td><td>${esc(e.type.replaceAll("_", " "))}</td><td>${esc(VERDICT[trustFloor(simulated.slice(0, i + 1).filter((x) => x.area === e.area), perStep).floor])}</td></tr>`).join("")}
</tbody></table></div></div></section>` : `<p class="muted">No simulated history. Run <code>node src/cli.ts simulate</code> to see how the rule behaves on synthetic events.</p>`}
<p><a href="/">All changes</a></p>`);
}

export const renderMessage = (title: string, message: string, back: string) =>
  page(title, `<h1>${esc(title)}</h1><div class="errors" role="alert"><p>${esc(message)}</p></div><p><a href="${esc(back)}">Go back</a></p>`);
