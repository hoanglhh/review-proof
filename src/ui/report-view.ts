import {renderHunk} from './code.ts';
import {explanationCoverage} from '../attention.ts';
import {cohortLabel} from '../cohorts.ts';
import type {Report} from '../report.ts';
import {esc} from './html.ts';
import {renderDocument} from './document.ts';
import {pageHeader,statusBadge} from './components.ts';
import {STATE_ORDER,STATE_TEXT,short,pct,VERDICT,unblockedLine} from './report-format.ts';

/** Present only when the sheet is served by the sign-off server: real controls instead of printed boxes. */
export type Interactive = { reportHash: string; nonce: string; signoffs: any[]; errors: string[]; form?: URLSearchParams; notice?: string };

const ACTIONS = [["accept", "Accept"], ["request_changes", "Request changes"], ["escalate", "Escalate"]];
const RESPONSES = [["accept", "Accept"], ["reject", "Reject"], ["escalate", "Escalate"]];
const FEEDBACK = [["real", "Real problem"], ["not_real", "Not a problem"], ["unsure", "Not sure"]];

export function renderHtml(r: Report, link: (repoPath: string) => string, maxFindings: number, ui?: Interactive): string {
  const base = `/case/${encodeURIComponent(r.case.id)}`;
  const val = (k: string) => esc(ui?.form?.get(k) ?? "");
  const radios = (name: string, opts: string[][], formAttr = "") => `<div class="choices">${opts.map(([v, label]) =>
    `<label><input type="radio" name="${esc(name)}" value="${v}" required${formAttr}${ui?.form?.get(name) === v ? " checked" : ""}> ${label}</label>`).join("")}</div>`;
  const coverage = explanationCoverage(r);
  const blocked = r.route.effectiveRoute === "blocked";
  const route = r.route;
  const byId = new Map(r.evidence.map((e) => [e.id, e]));
  const hunk = (id: string) => `<a href="#${esc(id)}">${esc(id)}</a>`;
  const hunks = (ids: string[]) => (ids.length ? ids.map(hunk).join(", ") : "none");
  const cites = (cs: Report["claims"][number]["citations"]) => cs.length ? `<details class="my-3"${ui ? "" : " open"}><summary>Source citations (${cs.length})</summary>${cs.map((c) =>
    `<div class="cite"><code>${esc(c.path)} lines ${c.startLine}–${c.endLine} at ${short(c.commit)}</code><pre>${esc(c.quote)}</pre></div>`).join("")}</details>` : "";
  const performer = (ids: string[]) => [...new Set(ids.map((id) => byId.get(id)?.performedBy).filter(Boolean))].map(esc).join("; ") || "nothing ran";
  const state = (s: keyof typeof STATE_TEXT) => statusBadge(s,STATE_TEXT[s]);
  // area floors are named in the verdict only when they made the route stricter than the evidence alone
  const floorReasons = route.trustFloor !== route.evidenceRoute && route.effectiveRoute === route.trustFloor
    ? route.areas.filter((a) => a.floor === route.trustFloor).map((a) => `${esc(a.reason.replaceAll("`", ""))}.`) : [];
  const notProven = r.claims.filter((c) => c.state !== "proven");
  const section = (n: number, title: string, body: string) => `<section aria-labelledby="s${n}"><h2 id="s${n}">${title}</h2>${body}</section>`;

  const content = `
${r.case.synthetic ? `<div class="sim-band" role="note"><b>${esc(r.case.synthetic.split(": ")[0])}</b> ${esc(r.case.synthetic.split(": ").slice(1).join(": "))}.</div>` : ""}
${pageHeader(`Assessment ${r.case.requirementId}`, r.case.title)}
<details class="mb-6 rounded-lg bg-white px-5 py-4"><summary>Assessment details</summary>
<dl class="facts">
<dt>Evaluation cohort</dt><dd>${esc(cohortLabel(r.case.id))}</dd>
<dt>Generated</dt><dd>${esc(r.case.generatedAt)}, from test runs on this machine</dd>
<dt>Change</dt><dd>base <code>${short(r.case.base)}</code> to head <code>${short(r.case.head)}</code> in ${esc(r.case.repository)}</dd>
<dt>Policy</dt><dd>${esc(r.case.policyVersion)}; its thresholds are illustrative and unvalidated</dd>
<dt>AI reviewer</dt><dd>${r.case.model ? `${esc(r.case.model)}, prompt sha256 <code>${esc(r.case.promptHash!.slice(0, 12))}</code>${r.reviewer.rawResponse ? `, <a href="${esc(link(r.reviewer.rawResponse))}">raw response</a>` : ""}` : "did not run"}</dd>
<dt>Pipeline</dt><dd>ReviewProof ${esc(r.case.pipelineVersion)}</dd>
</dl></details>

<div class="verdict r-${route.effectiveRoute}" role="status">
<div><span class="verdict-word">${VERDICT[route.effectiveRoute]}</span>
<span class="verdict-sub">${route.effectiveRoute === "blocked" ? "This change cannot be signed yet." : `Read ${route.readRatio === null ? "" : Math.round(route.readRatio * 100) + "% of "}${route.totalLines} changed lines.`}</span>
${route.spotCheck.selected ? `<span class="verdict-sub"><b>Selected for a blind spot-check.</b></span>` : ""}</div>
<div>Evidence supports: <b>${VERDICT[route.evidenceRoute].toLowerCase()}</b>.${floorReasons.length ? ` ${floorReasons.join(" ")}` : ""}
<ul>${route.reasons.map((x) => `<li>${esc(x.detail)} <span class="muted">(${esc(x.code)})</span></li>`).join("")}</ul>
${unblockedLine(route, esc)}</div>
</div>
<nav class="actions" aria-label="Review guide"><a href="#s3">Evidence</a><a href="#s6">Human decisions</a><a href="#s10">Sign-off</a></nav>
${ui && !r.case.synthetic ? `<details class="my-4"><summary>Feedback and reading exercises</summary><nav class="actions" aria-label="Human evaluation"><a href="${base}/findings">Judge findings</a><a href="${base}/experiment">Record a review observation</a>${["Supplied sample", "User submission"].includes(cohortLabel(r.case.id)) ? `<a href="${base}/targeted">Compare targeted and full reading</a>` : ""}</nav></details>` : ""}
<p class="muted">Reading percentages describe the rule-selected diff, not measured time saved. Evidence links need human scrutiny.</p>
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
<details class="file-inventory"><summary>View all ${r.inventory.totals.files} changed ${r.inventory.totals.files === 1 ? "file" : "files"}</summary>
<div class="scroll max-h-[28rem] overflow-auto" tabindex="0" role="region" aria-label="Changed file inventory"><table><thead><tr><th>File</th><th>Kind</th><th>Lines</th><th>Hunks</th></tr></thead><tbody>
${r.inventory.files.map((f) => `<tr><td><code>${esc(f.path)}</code>${f.status !== "modified" ? ` <span class="muted">(${f.status})</span>` : ""}</td><td>${esc(f.class)}</td><td>+${f.added}/−${f.removed}</td><td>${hunks(f.hunkIds)}</td></tr>`).join("")}</tbody></table></div></details>
<p><b>Unexplained:</b> ${hunks(r.unexplained)}. These are changed hunks that no claim or decision accounts for.</p>`)}

${section(3, "What the evidence establishes", `<p class="muted">States are computed from recorded evidence. They do not establish the full wording of a claim.</p><details class="mb-5"><summary>How evidence states work</summary><p class="muted mt-3">Observed in a discriminating test: a named test passes with the change and fails without it. This does not establish the full wording of the linked claim; check the test assertion and its scope. Argued: resolved citations, or passing tests without a discriminating failure. Not checked: no linked support. Broken: a linked check contradicts it.</p></details>
${r.claims.length ? `<div class="scroll"><table><thead><tr><th>State</th><th>Claim</th></tr></thead><tbody>${STATE_ORDER.flatMap((s) => r.claims.filter((c) => c.state === s)).map((c) => `<tr class="claim"><td>${state(c.state)}</td><td><b>${esc(c.id)}</b> ${esc(c.statement)}
<div class="detail">Why: ${esc(c.stateReason)}</div>
${c.state === "proven" ? `<div class="detail"><b>Not established:</b> that the named test covers every behavior in this claim. Inspect its assertions before relying on this evidence.</div>` : ""}
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

<section aria-labelledby="explanation"><h2 id="explanation">Explanation coverage</h2>
<p>${coverage.explained} of ${coverage.total} changed hunks are linked to a claim or decision. This is explanation coverage, not correctness coverage. Findings alone do not explain a change.</p>
<details><summary>Inspect every hunk and why it needs attention</summary><div class="scroll"><table><thead><tr><th>Hunk / file</th><th>Explanation</th><th>Attention required</th></tr></thead><tbody>
${coverage.rows.map(x => `<tr><td>${hunk(x.id)} <code>${esc(x.file)}</code></td><td>${x.explained ? [...x.claims.map(id => `Claim ${esc(id)}`), ...x.decisions.map(id => `Decision ${esc(id)}`)].join(", ") : "Unexplained"}${x.findings.length ? `<div>Suspected findings: ${x.findings.map(esc).join(", ")}</div>` : ""}</td><td>${x.attention.map(esc).join("; ")}</td></tr>`).join("")}
</tbody></table></div></details></section>

${section(10, "Sign-off", ui ? `<div class="owner">
${ui.signoffs.map((s) => `<div class="signed"><b>Signed by ${esc(s.owner)}</b> on ${esc(s.signedAt)}: ${esc(ACTIONS.find(([v]) => v === s.action)?.[1] ?? s.action)}. ${esc(s.reason)}
<div class="detail">Report ${esc(String(s.reportHash).slice(0, 12))}${s.reportHash === ui.reportHash ? " (this version)" : " (an earlier version)"}.</div></div>`).join("")}
${ui.errors.length ? `<div class="errors" role="alert" tabindex="-1" id="errors"><h3>The sheet was not signed</h3><ul>${ui.errors.map((e) => `<li>${e}</li>`).join("")}</ul></div>` : ""}
${blocked ? `<p><span class="flag">This change cannot be signed yet.</span> ${r.route.reasons.map((x) => esc(x.detail)).join("; ")}.</p>` : `<p>The AI reviewer never approves. You sign: choose an action and write the reason another person could check.</p>`}
<form id="signoff" method="post" action="${base}/signoff"><input type="hidden" name="reportHash" value="${esc(ui.reportHash)}">
<div class="field"><label for="name">Name</label><input type="text" id="name" name="name" required autocomplete="name" value="${val("name")}"></div>
<fieldset class="field" id="action"><legend>Action</legend>${radios("action", ACTIONS)}</fieldset>
<div class="field"><label for="reason">Reason</label><textarea id="reason" name="reason" rows="3" required>${val("reason")}</textarea></div>
<button type="submit"${blocked ? " disabled" : ""}>Sign this sheet</button></form>
<p class="muted">Owner identity is self-declared in this prototype. In a real pull-request flow it would come from the Git host account and the code owners of the areas above. Each signature is stored as a new file; the report is never rewritten.</p>
<p><a class="button secondary" href="${base}/blind">Do a blind spot-check</a>: the sheet is hidden while you read the diff, then you compare your notes with it.</p>
</div>` : `<div class="owner">
<p><b>Not signed.</b> The AI reviewer never approves. A named human signs, choosing an action and writing a reason.</p>
<div class="field"><span>Name</span><span class="line"></span></div>
<div class="field"><span>Action</span><ul class="options m-0"><li>Accept</li><li>Request changes</li><li>Escalate</li></ul></div>
<div class="field"><span>Reason</span><span class="line"></span></div>
<p class="muted">Owner identity is self-declared in this prototype. In a real pull-request flow it would come from the Git host account and the code owners of the areas above.</p>
</div>`)}

<section aria-labelledby="diff"><h2 id="diff">Diff</h2><p class="muted">Changed lines only, numbered as in the base (−) and head (+) files.</p>
${r.hunks.map(h => renderHunk(h,true)).join("")}
</section>
`;
  return renderDocument(`Assessment ${r.case.requirementId}`,content,{active:'assessments',nonce:ui?.nonce,standalone:!ui});
}
