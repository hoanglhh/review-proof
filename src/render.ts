// Renders a report as a one-page sign-off sheet: HTML for the browser, Markdown as the pull-request comment.
// Every value from the report is escaped: requirement text, code and model output are untrusted.
import type { Report } from "./report.ts";

export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const STATE_ORDER = ["broken", "not_checked", "argued", "proven"] as const;
const STATE_TEXT = { proven: "proven", argued: "argued", not_checked: "not checked", broken: "broken" };
const short = (sha: string) => sha.slice(0, 8);
const pct = (x: number) => `${Math.round(x * 100)}%`;

const GLYPH = { proven: "●", argued: "◐", not_checked: "○", broken: "✕" };
export const VERDICT = { blocked: "Blocked", full: "Full read", targeted: "Targeted read", light: "Light review" };

export const CSS = `
:root{--paper:#F2F4F6;--sheet:#FFFFFF;--ink:#12304A;--text:#232A31;--muted:#5B6570;--rule:#C9D1D9;--wash:#F6F8FA;
--proven:#1F6E3D;--argued:#8A6100;--not_checked:#5F6670;--broken:#B42318;
--head:"Bahnschrift","DIN Alternate","DIN Condensed","Roboto Condensed","Liberation Sans Narrow","Arial Narrow",system-ui,sans-serif;
--mono:ui-monospace,"SFMono-Regular","JetBrains Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.sheet{max-width:1040px;margin:24px auto 64px;background:var(--sheet);border:1px solid var(--rule);padding:32px 40px 48px 88px}
a{color:var(--ink)} a:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
h1,h2,.verdict-word{font-family:var(--head);font-stretch:condensed;color:var(--ink);letter-spacing:.005em}
h1{font-size:30px;line-height:1.15;margin:0;font-weight:700}
.title{font-size:18px;margin:4px 0 16px;max-width:70ch}
section{position:relative;margin-top:40px}
h2{font-size:22px;font-weight:700;margin:0 0 10px}
h2 .n{position:absolute;left:-56px;width:40px;text-align:right;color:var(--muted);font-weight:400}
p,li{max-width:76ch} .muted{color:var(--muted);font-size:14px}
code{font:13.5px var(--mono)} pre{font:13px/1.5 var(--mono);white-space:pre-wrap;word-break:break-word;margin:0}
code,pre{font-variant-ligatures:none} /* quotes must look exactly like the source */
.facts{display:grid;grid-template-columns:max-content 1fr;gap:2px 16px;font-size:14px;margin:0;color:var(--muted)}
.facts dt{font-weight:600;color:var(--text)} .facts dd{margin:0}
.verdict{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:24px;margin:28px 0 8px;padding:20px 24px;border:3px solid var(--route);background:var(--sheet)}
.verdict-word{display:block;font-size:52px;line-height:1;font-weight:800;color:var(--route)}
.verdict-sub{display:block;margin-top:10px;font-size:15px}
.verdict ul{margin:8px 0 0;padding-left:18px}
.r-blocked{--route:var(--broken)}.r-full{--route:var(--ink)}.r-targeted{--route:var(--argued)}.r-light{--route:var(--proven)}
.req{margin:14px 0;padding-left:14px;border-left:3px solid var(--rule)} .req.interp{border-left-color:var(--argued)}
.quote{margin:6px 0 0;padding:6px 10px;background:var(--wash);font-style:normal}
.quote pre{font-family:inherit;font-size:14px}
.flag{font-weight:600;color:var(--broken)}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14.5px;margin:8px 0}
th{text-align:left;font-weight:600;color:var(--muted);border-bottom:2px solid var(--rule);padding:6px 10px 6px 0}
td{vertical-align:top;border-bottom:1px solid var(--rule);padding:8px 10px 8px 0}
tr.total td{font-weight:600;border-bottom:none}
.state{white-space:nowrap;font-weight:700;color:var(--s)} .state .g{font-size:15px;margin-right:4px}
.s-proven{--s:var(--proven)}.s-argued{--s:var(--argued)}.s-not_checked{--s:var(--not_checked)}.s-broken{--s:var(--broken)}
.st-passed{--s:var(--proven)}.st-failed{--s:var(--broken)}.st-not_run,.st-inconclusive{--s:var(--not_checked)}
.claim td:first-child{width:130px}
.detail{color:var(--muted);font-size:13.5px;margin-top:4px}
.cite{margin:6px 0 0;padding:4px 10px;border-left:2px solid var(--rule);background:var(--wash)}
.cite code{color:var(--muted);font-size:12.5px}
.decision{margin:16px 0;padding:14px 18px;border:1px solid var(--rule)}
.options{list-style:none;padding:0;margin:10px 0}
.options li::before{content:"☐";margin-right:8px;color:var(--ink)}
.owner{border:2px solid var(--ink);padding:18px 22px;margin-top:12px}
.field span:first-child{font-weight:600}
.line{border-bottom:1px solid var(--text);min-height:24px;color:var(--muted)}
.hunk{margin:18px 0;border:1px solid var(--rule)} .hunk h3{margin:0;padding:6px 10px;font:600 13px var(--mono);background:var(--wash);color:var(--text)}
.hunk pre{padding:6px 0} .add,.del{display:block;padding:0 10px} .add{background:#E6F4EA} .del{background:#FBE7E5}
.hunk:target{outline:3px solid var(--argued)}
.sim-band{background:repeating-linear-gradient(-45deg,#F7E7B4 0 14px,#FFFFFF 14px 28px);border:3px solid var(--argued);padding:10px 16px;margin:0 0 18px}
.sim-band b{font:800 22px var(--head);font-stretch:condensed;color:var(--argued);letter-spacing:.06em;margin-right:8px}
input[type=text],textarea,select{font:inherit;color:var(--text);background:var(--sheet);border:0;border-bottom:1.5px solid var(--text);padding:4px 2px;width:100%}
textarea{border:1.5px solid var(--rule);border-bottom-color:var(--text);padding:6px 8px;resize:vertical}
input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
fieldset{border:0;padding:0;margin:0} legend{font-weight:600;padding:0}
.decision fieldset{margin-top:14px;padding-top:10px;border-top:1px dashed var(--rule)}
fieldset.field{display:block} fieldset.field legend{float:left;width:122px;padding-top:4px} fieldset.field .choices{margin-top:0;padding-top:2px}
.choices{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:6px}
.choices label{display:inline-flex;align-items:center;gap:6px;padding:4px 2px;cursor:pointer}
input[type=radio],input[type=checkbox]{accent-color:var(--ink);width:18px;height:18px;margin:0}
button{font:700 17px var(--head);font-stretch:condensed;letter-spacing:.01em;background:var(--ink);color:#fff;border:2px solid var(--ink);padding:9px 22px;border-radius:2px;cursor:pointer}
button.secondary{background:var(--sheet);color:var(--ink);font-size:15px;padding:5px 14px}
button:disabled{background:var(--rule);border-color:var(--rule);color:var(--muted);cursor:not-allowed}
.errors{border:3px solid var(--broken);padding:12px 16px;margin:0 0 16px} .errors h3{margin:0 0 6px;font:700 18px var(--head);color:var(--broken)}
.errors a{color:var(--broken);font-weight:600}
.inline{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-top:8px} .inline label{flex:1 1 220px;font-size:14px;font-weight:600}
.signed{border-left:6px solid var(--proven);background:var(--wash);padding:10px 14px;margin:0 0 14px}
.notice{border-left:6px solid var(--ink);background:var(--wash);padding:10px 14px;margin:16px 0}
.field{display:grid;grid-template-columns:110px 1fr;gap:12px;align-items:start;margin:14px 0} .field>label,.field>legend{font-weight:600;padding-top:4px}
@media (max-width:760px){.sheet{padding:20px 18px;margin:0;border:none}h2 .n{position:static;margin-right:8px}.verdict{grid-template-columns:1fr}.field{grid-template-columns:1fr}}
@media print{body{background:#fff}.sheet{border:none;margin:0;padding:0 0 0 56px}.hunk{break-inside:avoid}}
`;

/** What a blocked report's evidence supports once its blockers are resolved, in one sentence. */
function unblockedLine(route: Report["route"], fmt: (s: unknown) => string) {
  const u = route.ifUnblocked;
  if (!u) return "";
  const why = u.reasons.slice(0, 3).map((x) => fmt(x.detail)).join("; ") + (u.reasons.length > 3 ? `; and ${u.reasons.length - 3} more` : "");
  return `<p class="muted">Once these are resolved, the evidence supports a ${VERDICT[u.route].toLowerCase()}${u.route === "targeted" ? ` of ${pct(u.readRatio!)} of the changed lines` : ""}: ${why}.${u.effectiveRoute !== u.route ? ` The areas' trust floors would still require a ${VERDICT[u.effectiveRoute].toLowerCase()}.` : ""}</p>`;
}

/** Present only when the sheet is served by the sign-off server: real controls instead of printed boxes. */
export type Interactive = { reportHash: string; nonce: string; signoffs: any[]; errors: string[]; form?: URLSearchParams; notice?: string };

/** Counts the seconds the page is visible and focused; the value is submitted with any form on the page. */
export const ACTIVE_TIME_SCRIPT = `(()=>{let a=0,t=null;const k=()=>{const n=performance.now(),on=document.visibilityState==="visible"&&document.hasFocus();if(t!==null)a+=n-t;t=on?n:null};
["visibilitychange","focus","blur"].forEach(e=>addEventListener(e,k));setInterval(k,1000);k();
for(const f of document.forms)f.addEventListener("submit",()=>{k();const i=f.elements.namedItem("activeSeconds");if(i)i.value=String(Math.round(a/1000))})})();`;

const ACTIONS = [["accept", "Accept"], ["request_changes", "Request changes"], ["escalate", "Escalate"]];
const RESPONSES = [["accept", "Accept"], ["reject", "Reject"], ["escalate", "Escalate"]];
const FEEDBACK = [["real", "Real problem"], ["not_real", "Not a problem"], ["unsure", "Not sure"]];

/** `link` turns a repo-relative path (a log, a raw model response) into an href relative to the sheet. */
export function renderHtml(r: Report, link: (repoPath: string) => string, maxFindings: number, ui?: Interactive): string {
  const base = `/case/${encodeURIComponent(r.case.id)}`;
  const val = (k: string) => esc(ui?.form?.get(k) ?? "");
  const radios = (name: string, opts: string[][], formAttr = "") => `<div class="choices">${opts.map(([v, label]) =>
    `<label><input type="radio" name="${esc(name)}" value="${v}" required${formAttr}${ui?.form?.get(name) === v ? " checked" : ""}> ${label}</label>`).join("")}</div>`;
  const blocked = r.route.effectiveRoute === "blocked";
  const route = r.route;
  const byId = new Map(r.evidence.map((e) => [e.id, e]));
  const hunk = (id: string) => `<a href="#${esc(id)}">${esc(id)}</a>`;
  const hunks = (ids: string[]) => (ids.length ? ids.map(hunk).join(", ") : "none");
  const cites = (cs: Report["claims"][number]["citations"]) => cs.map((c) =>
    `<div class="cite"><code>${esc(c.path)} lines ${c.startLine}–${c.endLine} at ${short(c.commit)}</code><pre>${esc(c.quote)}</pre></div>`).join("");
  const performer = (ids: string[]) => [...new Set(ids.map((id) => byId.get(id)?.performedBy).filter(Boolean))].map(esc).join("; ") || "nothing ran";
  const state = (s: keyof typeof GLYPH) => `<span class="state s-${s}"><span class="g" aria-hidden="true">${GLYPH[s]}</span>${STATE_TEXT[s]}</span>`;
  // area floors are named in the verdict only when they made the route stricter than the evidence alone
  const floorReasons = route.trustFloor !== route.evidenceRoute && route.effectiveRoute === route.trustFloor
    ? route.areas.filter((a) => a.floor === route.trustFloor).map((a) => `${esc(a.reason.replaceAll("`", ""))}.`) : [];
  const notProven = r.claims.filter((c) => c.state !== "proven");
  const section = (n: number, title: string, body: string) => `<section aria-labelledby="s${n}"><h2 id="s${n}"><span class="n">${n}</span>${title}</h2>${body}</section>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign-off sheet ${esc(r.case.requirementId)}: ${esc(r.case.title)}</title>
<style>${CSS}</style></head><body><main class="sheet">
${r.case.synthetic ? `<div class="sim-band" role="note"><b>${esc(r.case.synthetic.split(": ")[0])}</b> ${esc(r.case.synthetic.split(": ").slice(1).join(": "))}.</div>` : ""}
<h1>Sign-off sheet for ${esc(r.case.requirementId)}</h1>
<p class="title">${esc(r.case.title)}</p>
<dl class="facts">
<dt>Generated</dt><dd>${esc(r.case.generatedAt)}, from test runs on this machine</dd>
<dt>Change</dt><dd>base <code>${short(r.case.base)}</code> to head <code>${short(r.case.head)}</code> in ${esc(r.case.repository)}</dd>
<dt>Policy</dt><dd>${esc(r.case.policyVersion)}; its thresholds are illustrative and unvalidated</dd>
<dt>AI reviewer</dt><dd>${r.case.model ? `${esc(r.case.model)}, prompt sha256 <code>${esc(r.case.promptHash!.slice(0, 12))}</code>${r.reviewer.rawResponse ? `, <a href="${esc(link(r.reviewer.rawResponse))}">raw response</a>` : ""}` : "did not run"}</dd>
<dt>Pipeline</dt><dd>ReviewProof ${esc(r.case.pipelineVersion)}</dd>
</dl>

<div class="verdict r-${route.effectiveRoute}" role="status">
<div><span class="verdict-word">${VERDICT[route.effectiveRoute]}</span>
<span class="verdict-sub">${route.effectiveRoute === "blocked" ? "This change cannot be signed yet." : `Read ${route.readRatio === null ? "" : Math.round(route.readRatio * 100) + "% of "}${route.totalLines} changed lines.`}</span>
${route.spotCheck.selected ? `<span class="verdict-sub"><b>Selected for a blind spot-check.</b></span>` : ""}</div>
<div>Evidence supports: <b>${VERDICT[route.evidenceRoute].toLowerCase()}</b>.${floorReasons.length ? ` ${floorReasons.join(" ")}` : ""}
<ul>${route.reasons.map((x) => `<li>${esc(x.detail)} <span class="muted">(${esc(x.code)})</span></li>`).join("")}</ul>
${unblockedLine(route, esc)}</div>
</div>
${ui?.notice ? `<p class="notice" role="status">${esc(ui.notice)}</p>` : ""}
${r.reviewer.status !== "ok" ? `<p><span class="flag">AI reviewer ${esc(r.reviewer.status)}.</span> ${esc(r.reviewer.reason ?? "")}</p>` : ""}

${section(1, "What the change is for", `<p>Requirement <a href="${esc(r.case.requirementUrl ?? "#")}">${esc(r.case.requirementId)}</a>, saved ${esc(r.case.requirementRetrievedAt ?? "from the case text")}. Each item quotes it.</p>
${r.requirements.map((q) => `<div class="req${q.kind === "interpretation" ? " interp" : ""}"><b>${esc(q.id)}</b> ${esc(q.text)} <span class="muted">(${q.kind})</span>
<blockquote class="quote"><pre>${esc(q.quote)}</pre></blockquote>
${q.kind === "interpretation" ? `<div class="detail">${q.confirmedBy ? `Confirmed by ${esc(q.confirmedBy)}.` : `<span class="flag">The requirement does not say this.</span> A human must confirm this reading before the change can be signed.`}</div>` : ""}
${ui && q.kind === "interpretation" && !q.confirmedBy ? `<form class="inline" method="post" action="${base}/confirm"><input type="hidden" name="reportHash" value="${esc(ui.reportHash)}"><input type="hidden" name="requirementId" value="${esc(q.id)}">
<label>Your name<input type="text" name="name" required autocomplete="name"></label><button class="secondary" type="submit">Confirm this reading</button></form>` : ""}</div>`).join("") || "<p>No requirement items.</p>"}`)}

${section(2, "What it touches", `<div class="scroll"><table><thead><tr><th>Kind of file</th><th>Files</th><th>Changed lines</th></tr></thead><tbody>
${Object.entries(r.inventory.totals.byClass).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.files}</td><td>${v.lines}</td></tr>`).join("")}
<tr class="total"><td>Total</td><td>${r.inventory.totals.files}</td><td>+${r.inventory.totals.added} / −${r.inventory.totals.removed}</td></tr></tbody></table></div>
<div class="scroll"><table><thead><tr><th>File</th><th>Kind</th><th>Lines</th><th>Hunks</th></tr></thead><tbody>
${r.inventory.files.map((f) => `<tr><td><code>${esc(f.path)}</code>${f.status !== "modified" ? ` <span class="muted">(${f.status})</span>` : ""}</td><td>${esc(f.class)}</td><td>+${f.added}/−${f.removed}</td><td>${hunks(f.hunkIds)}</td></tr>`).join("")}</tbody></table></div>
<p><b>Unexplained:</b> ${hunks(r.unexplained)}. These are changed hunks that no claim or decision accounts for.</p>`)}

${section(3, "How sure we are of each part", `<p class="muted">Code computes each state from evidence records; the model never sets one. Proven: a run supports it and that check was shown able to fail. Argued: resolved citations, or tests that pass but were not shown able to fail. Not checked: nothing was done. Broken: a check contradicts it.</p>
${r.claims.length ? `<div class="scroll"><table><thead><tr><th>State</th><th>Claim</th></tr></thead><tbody>${STATE_ORDER.flatMap((s) => r.claims.filter((c) => c.state === s)).map((c) => `<tr class="claim"><td>${state(c.state)}</td><td><b>${esc(c.id)}</b> ${esc(c.statement)}
<div class="detail">Why: ${esc(c.stateReason)}</div>
<div class="detail">Serves ${c.requirementIds.map(esc).join(", ") || `<span class="flag">no requirement item</span>`}. Hunks ${hunks(c.hunkIds)}. Checked by ${performer(c.evidenceIds)}.</div>
${c.testNames.length ? `<div class="detail">Tests: ${c.testNames.map((t) => `<code>${esc(t)}</code>`).join(", ")}</div>` : ""}${cites(c.citations)}</td></tr>`).join("")}</tbody></table></div>` : "<p>No claims.</p>"}`)}

${section(4, "What was checked, and by what", `<div class="scroll"><table><thead><tr><th>Check</th><th>Result</th><th>What it asserts, and what happened</th></tr></thead><tbody>
${r.evidence.map((e) => `<tr><td><code>${esc(e.id)}</code><div class="detail">${esc(e.domain)}</div></td><td><span class="state st-${e.status}">${esc(e.status.replace("_", " "))}</span></td>
<td><div class="detail">Asserts: ${esc(e.asserts)}</div>${esc(e.summary)}${e.reason ? `<div class="detail">Reason: ${esc(e.reason)}</div>` : ""}
<div class="detail">By ${esc(e.performedBy)}${e.logs.length ? `. Logs: ${e.logs.map((l) => `<a href="${esc(link(l))}">${esc(l.split("/").pop())}</a>`).join(", ")}` : ""}</div>
${e.commands.length ? `<details><summary class="detail">Command</summary><pre>${e.commands.map(esc).join("\n\n")}</pre></details>` : ""}</td></tr>`).join("")}</tbody></table></div>`)}

${section(5, "Not checked, and why", `<ul>${r.notChecked.map((n) => `<li><b>${esc(n.what.replace(/[.:]\s*$/, ""))}</b>: ${esc(n.reason)}</li>`).join("")}</ul>`)}

${section(6, "Decisions the AI refused to make", `<p class="muted">Choices the change made that the requirement left open. No test can settle them, so the AI is not allowed to judge them. The owner accepts, rejects or escalates each one when signing.</p>
${r.decisions.map((d) => `<div class="decision"><b>${esc(d.id)}</b> ${esc(d.statement)}
<div class="detail">Why a human: ${esc(d.whyHuman)}</div>
<div class="detail">Raised by ${d.raisedBy.kind === "rule" ? `the deterministic rule <code>${esc(d.raisedBy.name)}</code>` : `the AI reviewer (${esc(d.raisedBy.name)})`}. Hunks ${hunks(d.hunkIds)}.</div>
<div class="detail">Options:</div><ul>${d.options.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>${cites(d.citations)}
${ui ? `<fieldset id="decision-${esc(d.id)}"><legend>Your response to ${esc(d.id)}</legend>${radios(`decision.${d.id}`, RESPONSES, ' form="signoff"')}</fieldset>`
  : `<ul class="options" aria-label="Owner response, not given yet"><li>Accept</li><li>Reject</li><li>Escalate</li></ul>`}</div>`).join("") || "<p>No open decisions.</p>"}`)}

${section(7, "Suspected problems", `${r.findings.slice(0, maxFindings).map((f) => `<div class="decision"><b>${esc(f.id)}</b> ${esc(f.statement)} <span class="muted">(${f.status})</span><div class="detail">Hunks ${hunks(f.hunkIds)}.</div>${cites(f.citations)}
${ui ? `<fieldset><legend>Is ${esc(f.id)} a real problem? <span class="muted">(optional)</span></legend><div class="choices">${FEEDBACK.map(([v, label]) =>
    `<label><input type="radio" form="signoff" name="finding.${esc(f.id)}" value="${v}"${ui.form?.get(`finding.${f.id}`) === v ? " checked" : ""}> ${label}</label>`).join("")}</div></fieldset>` : ""}</div>`).join("") || "<p>None that the reviewer could back with a citation that resolves.</p>"}
${r.findings.length > maxFindings ? `<p class="muted">${r.findings.length - maxFindings} more are in report.json.</p>` : ""}`)}

${section(8, "Risk you accept by signing", `<ul>${notProven.map((c) => `<li>${state(c.state)} ${esc(c.id)}: ${esc(c.statement)}</li>`).join("")}
${r.unexplained.length ? `<li>${r.unexplained.length} unexplained hunk(s): ${hunks(r.unexplained)}</li>` : ""}
<li>That the change adds no vulnerability. No check here can prove that.</li></ul>`)}

${section(9, "What to read", `<p>The effective route is <b>${VERDICT[route.effectiveRoute].toLowerCase()}</b>: the stricter of what the evidence supports (${VERDICT[route.evidenceRoute].toLowerCase()}) and the trust floor of the areas touched (${VERDICT[route.trustFloor].toLowerCase()}).</p>
<div class="scroll"><table><thead><tr><th>Area</th><th>Owner</th><th>Trust floor</th></tr></thead><tbody>${route.areas.map((a) => `<tr><td><code>${esc(a.area)}</code></td><td>${esc(a.owner)}</td><td>${VERDICT[a.floor]}<div class="detail">${esc(a.reason.replaceAll("`", ""))}.</div></td></tr>`).join("")}</tbody></table></div>
${!r.case.synthetic && route.trustFloor !== "light" ? `<p><a href="${ui ? `${base}/earned` : "sheet-earned.html"}">See this sheet as it would read once these areas have earned trust</a> (simulated trust history, cannot be signed).</p>` : ""}
<p>A targeted read would cover ${route.readingListLines} of ${route.totalLines} changed lines:</p>
<div class="scroll"><table><thead><tr><th>Hunk</th><th>File</th><th>Lines</th><th>Why it is on the list</th></tr></thead><tbody>${route.readingList.map((x) => `<tr><td>${hunk(x.hunkId)}</td><td><code>${esc(x.file)}</code></td><td>${x.lines}</td><td>${x.why.map(esc).join("; ")}</td></tr>`).join("")}</tbody></table></div>`)}

${section(10, "Sign-off", ui ? `<div class="owner">
${ui.signoffs.map((s) => `<div class="signed"><b>Signed by ${esc(s.owner)}</b> on ${esc(s.signedAt)}: ${esc(ACTIONS.find(([v]) => v === s.action)?.[1] ?? s.action)}. ${esc(s.reason)}
<div class="detail">Report ${esc(String(s.reportHash).slice(0, 12))}${s.reportHash === ui.reportHash ? " (this version)" : " (an earlier version)"}; page open and focused for ${esc(s.activeSeconds)} s.</div></div>`).join("")}
${ui.errors.length ? `<div class="errors" role="alert" tabindex="-1" id="errors"><h3>The sheet was not signed</h3><ul>${ui.errors.map((e) => `<li>${e}</li>`).join("")}</ul></div>` : ""}
${blocked ? `<p><span class="flag">This change cannot be signed yet.</span> ${r.route.reasons.map((x) => esc(x.detail)).join("; ")}.</p>` : `<p>The AI reviewer never approves. You sign: choose an action and write the reason another person could check.</p>`}
<form id="signoff" method="post" action="${base}/signoff"><input type="hidden" name="reportHash" value="${esc(ui.reportHash)}"><input type="hidden" name="activeSeconds" value="0">
<div class="field"><label for="name">Name</label><input type="text" id="name" name="name" required autocomplete="name" value="${val("name")}"></div>
<fieldset class="field" id="action"><legend>Action</legend>${radios("action", ACTIONS)}</fieldset>
<div class="field"><label for="reason">Reason</label><textarea id="reason" name="reason" rows="3" required>${val("reason")}</textarea></div>
<button type="submit"${blocked ? " disabled" : ""}>Sign this sheet</button></form>
<p class="muted">Owner identity is self-declared in this prototype. In a real pull-request flow it would come from the Git host account and the code owners of the areas above. Each signature is stored as a new file; the report is never rewritten.</p>
<p><a href="${base}/blind">Do a blind spot-check of this change instead</a>: the sheet is hidden while you read the diff, then you compare your notes with it.</p>
</div>` : `<div class="owner">
<p><b>Not signed.</b> The AI reviewer never approves. A named human signs, choosing an action and writing a reason.</p>
<div class="field"><span>Name</span><span class="line"></span></div>
<div class="field"><span>Action</span><ul class="options" style="margin:0"><li>Accept</li><li>Request changes</li><li>Escalate</li></ul></div>
<div class="field"><span>Reason</span><span class="line"></span></div>
<p class="muted">Owner identity is self-declared in this prototype. In a real pull-request flow it would come from the Git host account and the code owners of the areas above.</p>
</div>`)}

<section aria-labelledby="diff"><h2 id="diff">Diff</h2><p class="muted">Changed lines only, numbered as in the base (−) and head (+) files.</p>
${r.hunks.map((h) => `<div class="hunk" id="${esc(h.id)}"><h3>${esc(h.id)}  ${esc(h.file)}  base ${h.oldStart}, head ${h.newStart}</h3><pre>${[
    ...h.removed.map((l, k) => `<span class="del">−${String(h.oldStart + k).padStart(5)}  ${esc(l)}</span>`),
    ...h.added.map((l, k) => `<span class="add">+${String(h.newStart + k).padStart(5)}  ${esc(l)}</span>`)].join("")}</pre></div>`).join("")}
</section>
</main>${ui ? `<script nonce="${esc(ui.nonce)}">${ACTIVE_TIME_SCRIPT}</script>` : ""}</body></html>
`;
}

/** The same sheet as a pull-request comment: Markdown, no diff (the PR shows it). */
export function renderMarkdown(r: Report, sheetHref: string, maxFindings: number): string {
  const md = (s: unknown) => String(s).replace(/[\\`*_{}[\]<>|#]/g, (c) => `\\${c}`).replace(/\s*\n\s*/g, " ");
  const route = r.route;
  const lines = [
    `## ReviewProof sign-off sheet: ${md(r.case.requirementId)} ${md(r.case.title)}`,
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
