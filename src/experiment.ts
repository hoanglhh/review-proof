// Observational human timing only: these records never change sign-offs, routes or trust.
import { CSS, esc, renderHtml } from "./render.ts";
import type { Report } from "./report.ts";

export const PHASES = ["reading", "evidence", "code", "decisions"] as const;
const fields = ["reportHash", "name", "method", "priorExposure", "human", "started", "fullReadNeeded", "unresolvedQuestions", "evidenceOpenings", ...PHASES.map((p) => `${p}Seconds`)];
export function validateExperiment(currentHash: string, f: URLSearchParams): string[] {
  const errors: string[] = [];
  if (fields.some((key) => f.getAll(key).length !== 1)) errors.push("Provide each experiment field exactly once.");
  if (!/^[a-f0-9]{64}$/.test(f.get("reportHash") ?? "") || f.get("reportHash") !== currentHash) errors.push("The report changed after this page was opened. Reload and start a new observation.");
  if (!f.get("name")?.trim() || f.get("name")!.trim().length > 120) errors.push("Enter your name (1–120 characters).");
  if (!["sheet", "diff"].includes(f.get("method") ?? "")) errors.push("Choose sheet or diff.");
  for (const key of ["priorExposure", "fullReadNeeded"]) if (!["yes", "no"].includes(f.get(key) ?? "")) errors.push(`Answer ${key === "priorExposure" ? "prior exposure" : "whether a full read is needed"}.`);
  if (f.get("human") !== "yes") errors.push("Confirm that you personally performed this review.");
  if (f.get("started") !== "yes") errors.push("Start the review timer before recording an observation.");
  if (!f.get("unresolvedQuestions")?.trim() || f.get("unresolvedQuestions")!.trim().length > 4000) errors.push("Record unresolved questions, or None (1–4000 characters).");
  for (const key of [...PHASES.map((p) => `${p}Seconds`), "evidenceOpenings"]) {
    const value = f.get(key) ?? "";
    if (!/^\d{1,6}$/.test(value) || Number(value) > (key === "evidenceOpenings" ? 10000 : 86400)) errors.push(`Invalid ${key}: use a bounded nonnegative whole number.`);
  }
  const external = f.get("externalSeconds");
  if (f.getAll("externalSeconds").length > 1 || (external && (!/^\d{1,6}$/.test(external) || Number(external) > 86400))) errors.push("External-tool time must be blank or a whole number between 0 and 86400 seconds.");
  const total = PHASES.reduce((sum, p) => sum + Number(f.get(`${p}Seconds`)), 0);
  if (!Number.isFinite(total) || total < 1 || total > 86400) errors.push("Total focused review time must be between 1 and 86400 seconds.");
  return errors;
}

export function experimentRecord(caseId: string, currentHash: string, f: URLSearchParams, submittedAt = new Date().toISOString()) {
  const errors = validateExperiment(currentHash, f);
  if (errors.length) throw new Error(errors.join(" "));
  const phaseSeconds = Object.fromEntries(PHASES.map((p) => [p, Number(f.get(`${p}Seconds`))]));
  return { schemaVersion: 1, caseId, reportHash: currentHash, submittedAt, reviewer: f.get("name")!.trim(), identity: "self-declared", humanAttested: true,
    method: f.get("method")!, priorExposure: f.get("priorExposure") === "yes", phaseSeconds,
    activeSeconds: Object.values(phaseSeconds).reduce((a, b) => a + b, 0), timingSource: "explicit start; page visible and focused only; external tabs excluded",
    externalSeconds: f.get("externalSeconds") ? Number(f.get("externalSeconds")) : null,
    externalSecondsSource: "optional human-timed external effort; blank means not measured",
    evidenceOpenings: Number(f.get("evidenceOpenings")), evidenceOpeningsSource: "manual human tally",
    unresolvedQuestions: f.get("unresolvedQuestions")!.trim(), fullReadNeeded: f.get("fullReadNeeded") === "yes" };
}
export type Experiment = ReturnType<typeof experimentRecord>;
const page = (title: string, body: string, script = "", nonce = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${CSS}\n.timer{position:sticky;top:0;z-index:2;background:var(--sheet);border:2px solid var(--ink);padding:12px;margin:20px 0}.timer p{margin:4px 0}.timer button{margin:4px 4px 0 0}[hidden]{display:none!important}</style></head><body><main class="sheet">${body}</main>${script ? `<script nonce="${esc(nonce)}">${script}</script>` : ""}</body></html>`;

const TIMER = `(()=>{
const form=document.getElementById('experiment'), material=document.getElementById('material'), method=document.getElementById('method-choice'), start=document.getElementById('start'), pause=document.getElementById('pause'), status=document.getElementById('timer-status');
const phases=['reading','evidence','code','decisions'], totals=Object.fromEntries(phases.map(p=>[p,Number(form.elements.namedItem(p+'Seconds').value)*1000]));
let running=false, phase='reading', previous=null, started=form.elements.namedItem('started').value==='yes';
const settle=()=>{const now=performance.now();if(previous!==null)totals[phase]+=now-previous;previous=running&&document.visibilityState==='visible'&&document.hasFocus()?now:null;for(const p of phases)form.elements.namedItem(p+'Seconds').value=String(Math.floor(totals[p]/1000));document.getElementById('elapsed').textContent=phases.map(p=>p+': '+Math.floor(totals[p]/1000)+' s').join(' · ');};
const show=()=>{status.textContent=(running?'Running: ':'Paused: ')+phase;pause.disabled=!running;start.textContent=started?'Resume review':'Start review';};
const reveal=()=>{material.hidden=false;document.getElementById('sheet-material').hidden=method.value!=='sheet';document.getElementById('diff-material').hidden=method.value!=='diff';method.disabled=true;form.elements.namedItem('method').value=method.value;};
start.addEventListener('click',()=>{if(!form.elements.namedItem('name').reportValidity()||!form.elements.namedItem('priorExposure').reportValidity()||!method.reportValidity())return;settle();started=true;form.elements.namedItem('started').value='yes';reveal();running=true;settle();show();});
pause.addEventListener('click',()=>{settle();running=false;previous=null;show();});
for(const b of document.querySelectorAll('[data-phase]'))b.addEventListener('click',()=>{settle();phase=b.dataset.phase;for(const other of document.querySelectorAll('[data-phase]'))other.setAttribute('aria-pressed',String(other===b));show();});
const loseFocus=()=>{settle();if(document.visibilityState!=='visible'||!document.hasFocus()){running=false;previous=null;show();}};
document.addEventListener('visibilitychange',loseFocus);window.addEventListener('blur',loseFocus);setInterval(()=>{loseFocus();settle();},250);
form.addEventListener('submit',e=>{settle();running=false;previous=null;show();if(!started){e.preventDefault();status.textContent='Start and perform the review before submitting.';}});
if(started)reveal();show();
})();`;

export function renderExperiment(r: Report, requirement: { title: string; body: string }, hash: string, nonce: string, errors: string[] = [], f = new URLSearchParams(), maxFindings = 5) {
  const val = (key: string, fallback = "") => esc(f.get(key) ?? fallback);
  const options = (key: string, choices: [string, string][]) => `<option value="">Choose…</option>${choices.map(([value, label]) => `<option value="${value}"${f.get(key) === value ? " selected" : ""}>${label}</option>`).join("")}`;
  const sheet = renderHtml(r, (path) => `/${path}`, maxFindings).split('<main class="sheet">')[1].split('</main>')[0].replace(/<a href="(?!#)/g, '<a target="_blank" rel="noopener" href="');
  return page(`Timed review: ${r.case.requirementId}`, `<h1>Timed human review</h1><p>${esc(r.case.requirementId)} · <a href="/evaluation/experiments">Recorded observations</a></p>
<p>This is an observational timing record, separate from sign-off and trust. No safety or speedup conclusion can be drawn from these records.</p>
<p>Choose your method before starting. If you have seen this change, its sheet, discussion or others’ review notes, declare prior exposure. Repeat reads cannot provide an uncontaminated comparison.</p>
${errors.length ? `<div class="errors" role="alert"><h2>Observation not saved</h2><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
<form id="experiment" method="post" action="/case/${encodeURIComponent(r.case.id)}/experiment">
<input type="hidden" name="reportHash" value="${val("reportHash", hash)}"><input type="hidden" name="started" value="${val("started", "no")}"><input type="hidden" name="method" value="${val("method")}">
${PHASES.map((p) => `<input type="hidden" name="${p}Seconds" value="${val(`${p}Seconds`, "0")}">`).join("")}
<div class="field"><label for="reviewer-name">Your name</label><input id="reviewer-name" type="text" name="name" maxlength="120" required autocomplete="name" value="${val("name")}"></div>
<div class="field"><label for="prior-exposure">Prior exposure</label><select id="prior-exposure" name="priorExposure" required>${options("priorExposure", [["yes", "Yes — previously exposed"], ["no", "No — first encounter"]])}</select></div>
<div class="field"><label for="method-choice">Method</label><select id="method-choice" required>${options("method", [["sheet", "Sign-off sheet"], ["diff", "Requirement and changed lines"]])}</select></div>
<div class="timer"><p id="timer-status" role="status">Paused: reading</p><p id="elapsed">0 seconds</p><button id="start" type="button">Start review</button><button id="pause" type="button" class="secondary" disabled>Pause</button><fieldset><legend>Current phase</legend>${PHASES.map((p) => `<button type="button" class="secondary" data-phase="${p}" aria-pressed="${p === "reading"}">${p[0].toUpperCase() + p.slice(1)}</button>`).join("")}</fieldset></div>
<p class="muted">Time starts only when you press Start. Switching phase does not start the clock. Losing focus or hiding this page pauses it; press Resume on return. Time spent in external evidence or code tabs is excluded, so totals are partial focused-page time, not total review effort. Record evidence openings manually below. Review material stays hidden until Start.</p>
<noscript><p class="errors">JavaScript is required for the focused review timer.</p></noscript>
<div id="material" hidden><div id="sheet-material" hidden>${sheet}</div><div id="diff-material" hidden><section><h2>Requirement</h2><h3>${esc(requirement.title)}</h3><pre>${esc(requirement.body)}</pre></section><section><h2>Changed lines</h2><p class="muted">This view contains changed lines, not complete source files or unchanged context.</p>${r.hunks.map((h) => `<div class="hunk"><h3>${esc(h.file)} · base ${h.oldStart}, head ${h.newStart}</h3><pre>${h.removed.map((l) => `<span class="del">− ${esc(l)}</span>`).join("")}${h.added.map((l) => `<span class="add">+ ${esc(l)}</span>`).join("")}</pre></div>`).join("")}</section></div></div>
<section><h2>Your observation</h2><div class="field"><label for="evidence-openings">Evidence openings</label><input id="evidence-openings" type="number" name="evidenceOpenings" min="0" max="10000" step="1" required value="${val("evidenceOpenings", "0")}"></div>
<div class="field"><label for="external-seconds">External-tool seconds (optional, timed by you)</label><input id="external-seconds" type="number" name="externalSeconds" min="0" max="86400" step="1" value="${val("externalSeconds")}"></div>
<p class="muted">Use a separate stopwatch for external evidence or code tabs, then enter that duration here. Leave blank if not measured; enter zero only if no external time was spent. This is self-reported separately from the page timer.</p>
<p class="muted">Manual tally: count each evidence item you opened, including repeat openings. Zero means none; this is not automatic link tracking.</p>
<div class="field"><label for="unresolved">Unresolved questions</label><textarea id="unresolved" name="unresolvedQuestions" maxlength="4000" rows="5" required placeholder="Write questions still unresolved, or None.">${val("unresolvedQuestions")}</textarea></div>
<div class="field"><label for="full-read">Full read needed?</label><select id="full-read" name="fullReadNeeded" required>${options("fullReadNeeded", [["yes", "Yes"], ["no", "No"]])}</select></div>
<p><label><input type="checkbox" name="human" value="yes" required${f.get("human") === "yes" ? " checked" : ""}> I personally performed this review and confirm these observations.</label></p><p class="muted">Identity and timing are self-reported, not independently verified. Submission is append-only and does not approve the change.</p><button type="submit">Save human observation</button></section></form>`, TIMER, nonce);
}

export function renderExperiments(records: Experiment[]) {
  const seen = new Set<string>();
  let repeated = 0;
  const fresh = records.filter((r) => {
    const key = `${r.reviewer.trim().toLowerCase()}\0${r.caseId}`;
    const repeat = seen.has(key); seen.add(key);
    if (repeat && !r.priorExposure) repeated++;
    return !r.priorExposure && !repeat;
  });
  const exposed = records.filter((r) => r.priorExposure).length;
  return page("Human review observations", `<h1>Human review observations</h1><p><a href="/">All changes</a></p>
<p>${records.length} submitted human records (denominator). ${fresh.length} declared first-read records; ${exposed} prior-exposure record(s) and ${repeated} additional repeat record(s) excluded from method summaries.</p>
<p>No safety or speedup conclusion can be drawn from this observational data. Identity and prior exposure are self-declared. The groups are not randomized or matched; focused-page seconds exclude external tabs and are not total review effort. Zero records means not measured.</p>
<div class="scroll"><table><thead><tr><th>Method</th><th>First-read records (n)</th>${PHASES.map((p) => `<th>${p} total</th>`).join("")}<th>Focused total</th><th>External seconds (human-timed)</th><th>Evidence openings (manual)</th><th>Full read needed</th></tr></thead><tbody>${["sheet", "diff"].map((method) => {
    const rows = fresh.filter((r) => r.method === method);
    const sum = (fn: (r: Experiment) => number) => rows.reduce((a, r) => a + fn(r), 0);
    return `<tr><td>${method}</td><td>${rows.length}</td>${PHASES.map((p) => `<td>${rows.length ? `${sum((r) => r.phaseSeconds[p])} s` : "Not measured"}</td>`).join("")}<td>${rows.length ? `${sum((r) => r.activeSeconds)} s` : "Not measured"}</td><td>${rows.filter(r => r.externalSeconds != null).length ? `${sum(r => r.externalSeconds ?? 0)} s across ${rows.filter(r => r.externalSeconds != null).length}/${rows.length} records` : "Not measured"}</td><td>${rows.length ? sum((r) => r.evidenceOpenings) : "Not measured"}</td><td>${sum((r) => Number(r.fullReadNeeded))}/${rows.length}</td></tr>`;
  }).join("")}</tbody></table></div>
<p>Prior-exposure and repeat observations remain stored for audit; their times are not used for method comparisons. Records are separate from sign-off and trust.</p>`);
}
