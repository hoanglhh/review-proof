import {renderHunk} from './ui/code.ts';
// Observational records only: persistence and reveal-after-save are enforced by the server.
import { esc } from "./ui/html.ts";
import { renderDocument } from "./ui/document.ts";
import { actionLink, emptyState, pageHeader, statusBadge } from "./ui/components.ts";
import type { Report } from "./report.ts";

const common = ["reportHash", "human", "fullReadNeeded"];
const initialFields = [...common, "name", "priorExposure", "notes", "unresolvedQuestions"];
const comparisonFields = [...common, "reviewId", "addedFindings", "remainingQuestions", "fullRead"];
function validateFields(currentHash: string, f: URLSearchParams, required: string[]): string[] {
  const errors: string[] = [];
  if (required.some(key => f.getAll(key).length !== 1) || [...f.keys()].some(key => !required.includes(key))) errors.push("Provide each required field exactly once, with no unexpected fields.");
  if (!/^[a-f0-9]{64}$/.test(currentHash) || f.get("reportHash") !== currentHash) errors.push("The report changed. Reload and start a new observation.");
  if (f.get("human") !== "yes") errors.push("Confirm that you personally performed this reading.");
  if (!["yes", "no"].includes(f.get("fullReadNeeded") ?? "")) errors.push("Answer whether a full read is needed.");
  return errors;
}

function textErrors(f: URLSearchParams, fields: string[]): string[] {
  return fields.filter(key => !f.get(key)?.trim() || f.get(key)!.length > 4000).map(key => `Enter ${key === "addedFindings" ? "added findings" : key === "remainingQuestions" ? "remaining questions" : key === "unresolvedQuestions" ? "unresolved questions" : "notes"}, or None (1–4000 characters).`);
}

export function validateTargetedReview(r: Report, hash: string, f: URLSearchParams): string[] {
  const errors = [...validateFields(hash, f, initialFields), ...textErrors(f, ["notes", "unresolvedQuestions"])];
  if (!f.get("name")?.trim() || f.get("name")!.length > 120) errors.push("Enter your name (1–120 characters).");
  if (!["yes", "no"].includes(f.get("priorExposure") ?? "")) errors.push("Declare prior exposure to this change or its review material.");
  if (r.route.readingList.some(item => !r.hunks.some(h => h.id === item.hunkId))) errors.push("The selected reading list is incomplete. Regenerate the report before starting.");
  return errors;
}

export function targetedReviewRecord(r: Report, hash: string, f: URLSearchParams, id: string, at = new Date().toISOString()) {
  const errors = validateTargetedReview(r, hash, f);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) errors.push("Invalid observation identifier.");
  if (errors.length) throw new Error(errors.join(" "));
  return { schemaVersion: 1 as const, id, caseId: r.case.id, reportHash: hash, submittedAt: at, reviewer: f.get("name")!.trim(), identity: "self-declared" as const, humanAttested: true as const,
    priorExposure: f.get("priorExposure") === "yes", selectedHunkIds: r.route.readingList.map(item => item.hunkId),
    notes: f.get("notes")!.trim(), unresolvedQuestions: f.get("unresolvedQuestions")!.trim(), fullReadNeeded: f.get("fullReadNeeded") === "yes" };
}
export type TargetedReview = ReturnType<typeof targetedReviewRecord>;

export function validateTargetedComparison(review: TargetedReview, currentHash: string, f: URLSearchParams): string[] {
  const errors = [...validateFields(currentHash, f, comparisonFields), ...textErrors(f, ["addedFindings", "remainingQuestions"])];
  if (review.reportHash !== currentHash) errors.push("The report no longer matches the locked initial observation. Start a new observation.");
  if (f.get("reviewId") !== review.id) errors.push("The comparison does not match the initial observation.");
  if (f.get("fullRead") !== "yes") errors.push("Confirm that you personally read all changed lines shown in the full diff.");
  return errors;
}

export function targetedComparisonRecord(review: TargetedReview, currentHash: string, f: URLSearchParams, at = new Date().toISOString()) {
  const errors = validateTargetedComparison(review, currentHash, f);
  if (errors.length) throw new Error(errors.join(" "));
  return { schemaVersion: 1 as const, reviewId: review.id, caseId: review.caseId, reportHash: currentHash, submittedAt: at, reviewer: review.reviewer, identity: "self-declared" as const,
    humanAttested: true as const, fullReadAttested: true as const,
    addedFindings: f.get("addedFindings")!.trim(), remainingQuestions: f.get("remainingQuestions")!.trim(), fullReadNeeded: f.get("fullReadNeeded") === "yes" };
}
export type TargetedComparison = ReturnType<typeof targetedComparisonRecord>;

const warning = (r: Report) => `<div class="panel space-y-3 p-5"><div>${statusBadge(r.route.effectiveRoute)}</div><p><strong>The real route remains ${esc(r.route.effectiveRoute)}.</strong> This experiment never authorizes skipping code, signs off, accepts a change or earns trust. Follow the real route, including full reading and blocked requirements.</p><p>This is a within-person reading exercise. The second reading benefits from the first; it is not an independent control or evidence of time savings or safety.</p></div>`;
const errorList = (errors: string[]) => errors.length ? `<div class="errors" role="alert"><h2>Observation not saved</h2><ul>${errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "";
const value = (f: URLSearchParams, key: string, fallback = "") => esc(f.get(key) ?? fallback);
const hidden = (name: string, contents: string) => `<input type="hidden" name="${name}" value="${esc(contents)}">`;
const select = (f: URLSearchParams, key: string, label: string) => `<div class="field"><label for="${key}">${label}</label><select id="${key}" name="${key}" required><option value="">Choose…</option>${["yes", "no"].map(option => `<option value="${option}"${f.get(key) === option ? " selected" : ""}>${option === "yes" ? "Yes" : "No"}</option>`).join("")}</select></div>`;
const textarea = (f: URLSearchParams, key: string, label: string) => `<div class="field"><label for="${key}">${label} (or None)</label><textarea id="${key}" name="${key}" rows="4" maxlength="4000" required>${value(f, key)}</textarea></div>`;
const hunks = (r: Report, ids?: Set<string>) => r.hunks.filter(h => !ids || ids.has(h.id)).map(h => renderHunk(h)).join("");

function selectedEvidence(r: Report, selected: Set<string>): string {
  const relevant = (item: { hunkIds: string[] }) => item.hunkIds.some(id => selected.has(id));
  const claims = r.claims.filter(relevant), decisions = r.decisions.filter(relevant), findings = r.findings.filter(relevant);
  const evidenceIds = new Set(claims.flatMap(claim => claim.evidenceIds));
  const evidence = r.evidence.filter(item => evidenceIds.has(item.id) || decisions.some(d => d.raisedBy.kind === "rule" && [item.id, item.check].includes(d.raisedBy.name)));
  const citations = (items: Report["claims"][number]["citations"]) => items.map(c => {
    // Keep citation quotes from revealing source outside the selected changed-line ranges.
    const withinSelected = r.hunks.some(h => {
      if (!selected.has(h.id) || h.file !== c.path) return false;
      const start = c.commit === r.case.head ? h.newStart : h.oldStart;
      const lines = c.commit === r.case.head ? h.newLines : h.oldLines;
      return [r.case.base, r.case.head].includes(c.commit) && c.startLine >= start && c.endLine < start + lines;
    });
    return `<div class="quote"><code>${esc(c.path)} lines ${c.startLine}–${c.endLine} at ${esc(c.commit)}</code>${withinSelected ? `<pre>${esc(c.quote)}</pre>` : `<p class="muted">Citation quote outside selected changed lines is withheld in this stage.</p>`}</div>`;
  }).join("");
  const log = (path: string) => path.startsWith("data/") && !path.split("/").some(part => [".", "..", ""].includes(part)) ? `<a href="/${path.split("/").map(encodeURIComponent).join("/")}" target="_blank" rel="noopener">${esc(path)}</a>` : esc(path);
  return `<section class="space-y-5"><h2>Linked claims, decisions and findings</h2><p class="muted">Only records linked to selected hunks are shown. A passing named test does not establish every behavior of its claim; inspect assertions and scope. These are reading aids, not acceptance decisions.</p>
${claims.map(c => `<article class="space-y-3 py-5"><div class="flex flex-wrap items-center gap-3"><h3>${esc(c.id)}</h3>${statusBadge(c.state)}</div><p>${esc(c.statement)}</p><p class="muted">${esc(c.stateReason)}</p><p>Tests: ${c.testNames.map(esc).join(", ") || "None linked"}. Evidence: ${c.evidenceIds.map(esc).join(", ") || "None linked"}.</p>${citations(c.citations)}</article>`).join("")}
${decisions.map(d => `<article class="space-y-3 py-5"><h3>${esc(d.id)}</h3><p>${esc(d.statement)}</p><p>Why a human: ${esc(d.whyHuman)}</p><ul>${d.options.map(option => `<li>${esc(option)}</li>`).join("")}</ul>${citations(d.citations)}</article>`).join("")}
${findings.map(f => `<article class="space-y-3 py-5"><div class="flex flex-wrap items-center gap-3"><h3>${esc(f.id)}</h3>${statusBadge(f.status)}</div><p>${esc(f.statement)}</p>${citations(f.citations)}</article>`).join("")}
${claims.length + decisions.length + findings.length ? "" : "<p>No claims, decisions or findings link to these selected hunks.</p>"}</section>
<section class="space-y-5"><h2>Linked evidence</h2>${evidence.map(e => `<article class="space-y-3 py-5"><div class="flex flex-wrap items-center gap-3"><p class="font-medium"><code>${esc(e.id)}</code></p>${statusBadge(e.status)}</div><p>${esc(e.check)} · ${esc(e.domain)} · performed by ${esc(e.performedBy)}</p><p>Asserts: ${esc(e.asserts)}</p><p>${esc(e.summary)}${e.reason ? ` Reason: ${esc(e.reason)}` : ""}</p><p>Tests: ${e.tests?.map(test => esc(test.name)).join(", ") || "None named"}.</p>${e.logs.length ? `<p>Logs: ${e.logs.map(log).join(", ")}</p>` : "<p>No logs linked.</p>"}</article>`).join("") || "<p>No evidence records are explicitly linked to these selected claims or decision rules.</p>"}</section>`;
}
export function renderTargetedReview(r: Report, requirement: { title: string; body: string }, hash: string, nonce: string, errors: string[] = [], f = new URLSearchParams()): string {
  const selected = new Set(r.route.readingList.map(item => item.hunkId));
  return renderDocument("Targeted reading exercise", `${pageHeader("Targeted reading exercise", r.case.requirementId, actionLink("/evaluation/targeted", "Recorded observations", { icon: "chart" }))}${warning(r)}${errorList(errors)}
<form id="targeted-form" class="space-y-8" method="post" action="/case/${encodeURIComponent(r.case.id)}/targeted">${hidden("reportHash", f.get("reportHash") ?? hash)}
<div class="field"><label for="reviewer-name">Your name</label><input id="reviewer-name" name="name" type="text" maxlength="120" autocomplete="name" required value="${value(f, "name")}"></div>
${select(f, "priorExposure", "Prior exposure")}
<p class="muted">Answer Yes if you have seen this change, its full diff, source, sheet, discussion or anyone’s review notes. Repeat and prior-exposure records remain visible but are excluded from first-read summaries.</p>
<div id="material" class="space-y-6"><section class="space-y-5"><h2>Requirement</h2><p class="text-lg">${esc(requirement.title)}</p><p class="whitespace-pre-wrap">${esc(requirement.body)}</p></section><section class="space-y-5"><h2>Selected changed lines</h2><p>Only the route’s reading-list hunks are shown. Group representatives stand for repeated hunks; this does not establish that omitted changes are safe.</p>${r.route.readingList.length ? `<ul>${r.route.readingList.map(item => `<li>${esc(item.hunkId)} · ${esc(item.file)}: ${item.why.map(esc).join("; ")}</li>`).join("")}</ul>` : "<p>The current reading list contains no hunks.</p>"}${hunks(r, selected)}</section>${selectedEvidence(r, selected)}</div>
<section class="panel space-y-5 p-5 md:p-8"><h2>Your initial observation</h2><p>Save this observation before seeing the full changed-line diff. These notes become locked.</p>${textarea(f, "notes", "Findings and notes")}${textarea(f, "unresolvedQuestions", "Unresolved questions")}${select(f, "fullReadNeeded", "Is a full read needed?")}
<p><label><input type="checkbox" name="human" value="yes" required${f.get("human") === "yes" ? " checked" : ""}> I personally performed this targeted reading and recorded my own assessment.</label></p><button type="submit">Save initial observation and continue</button></section></form>`, { active: "studies", nonce });
}

export function renderTargetedComparison(r: Report, review: TargetedReview, nonce: string, errors: string[] = [], f = new URLSearchParams()): string {
  return renderDocument("Full-diff comparison", `${pageHeader("Full-diff comparison", `${r.case.requirementId} · ${review.reviewer}`, actionLink("/evaluation/targeted", "Recorded observations", { icon: "chart" }))}${warning(r)}${errorList(errors)}
<section class="locked space-y-4"><h2>Locked initial notes</h2><p>Saved ${esc(review.submittedAt)}. Selected hunks: ${review.selectedHunkIds.map(esc).join(", ") || "None"}. Prior exposure: ${review.priorExposure ? "Yes" : "No"}.</p><h3>Findings and notes</h3><p class="whitespace-pre-wrap">${esc(review.notes)}</p><h3>Unresolved questions</h3><p class="whitespace-pre-wrap">${esc(review.unresolvedQuestions)}</p><p>Full read needed: ${review.fullReadNeeded ? "Yes" : "No"}.</p></section>
<form id="targeted-form" class="space-y-8" method="post" action="/case/${encodeURIComponent(r.case.id)}/targeted/${encodeURIComponent(review.id)}">${hidden("reportHash", f.get("reportHash") ?? review.reportHash)}${hidden("reviewId", review.id)}
<div id="material" class="space-y-6"><section class="space-y-5"><h2>Full changed-line diff</h2><p>This contains all changed-line hunks, not complete source files or repository inspection. Binary changes and unchanged context require separate inspection. Use external tools as needed.</p>${hunks(r) || "<p>No text hunks are available.</p>"}${r.inventory.files.filter(file => file.binary).map(file => `<p>Binary change requires external inspection: ${esc(file.path)}</p>`).join("")}</section></div>
<section class="panel space-y-5 p-5 md:p-8"><h2>What changed after reading the full diff?</h2>${textarea(f, "addedFindings", "Added findings")}${textarea(f, "remainingQuestions", "Remaining questions")}${select(f, "fullReadNeeded", "Is a full read still needed?")}
<p><label><input type="checkbox" name="fullRead" value="yes" required${f.get("fullRead") === "yes" ? " checked" : ""}> I personally read all changed lines shown in this full diff.</label></p>
<p><label><input type="checkbox" name="human" value="yes" required${f.get("human") === "yes" ? " checked" : ""}> This comparison records my own human assessment.</label></p><button type="submit">Save full-diff comparison</button></section></form>`, { active: "studies", nonce });
}

export function renderTargetedSummary(reviews: TargetedReview[], comparisons: TargetedComparison[]): string {
  const seen = new Set<string>();
  const statuses = new Map<string, string>();
  const first: TargetedReview[] = [];
  for (const record of [...reviews].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id))) {
    const key = JSON.stringify([record.reviewer.trim().toLowerCase(), record.caseId]);
    const repeated = seen.has(key); seen.add(key);
    statuses.set(record.id, record.priorExposure ? `Prior exposure${repeated ? "; Repeated" : ""}` : repeated ? "Repeated" : "First read");
    if (!repeated && !record.priorExposure) first.push(record);
  }
  const matching = (review: TargetedReview) => comparisons.filter(c => c.reviewId === review.id && c.caseId === review.caseId && c.reportHash === review.reportHash);
  const paired = first.flatMap(review => matching(review).length === 1 ? matching(review) : []);
  return renderDocument("Targeted reading observations", `${pageHeader("Targeted reading observations", "Initial reading and the full-diff comparison, recorded separately.", actionLink("/evaluation/experiments", "Other reading studies", { icon: "study" }))}<p>${reviews.length} initial records; ${comparisons.length} full-diff comparison records. ${first.length} unique reviewer and case first-read records are eligible for first-read summaries.</p>
<p>No time-savings or safety conclusion can be drawn from this sequential, self-declared exercise. Identity and actual reading are not independently verified. The comparison is a second reading, not an independent control. Records never change routes, sign-offs, acceptance or trust.</p>
<section class="space-y-5"><h2>First-read comparisons</h2><p>Denominator: ${first.length} unique reviewer and case first-read records, excluding declared prior exposure and repeats. Reviewer names are trimmed and compared without case; names are self-declared.</p><p>${paired.length}/${first.length} eligible initial records have exactly one matching full-diff comparison. Missing, duplicate or mismatched comparisons are excluded from this summary. Review time is not collected.</p></section>
<section class="space-y-5"><h2>All initial observations</h2>${reviews.length ? `<div class="scroll"><table><thead><tr><th>Reviewer / case</th><th>Exposure</th><th>Initial assessment</th><th>Comparison</th></tr></thead><tbody>${reviews.map(review => `<tr><td>${esc(review.reviewer)} / ${esc(review.caseId)}<br>${esc(review.id)}<br><code>${esc(review.reportHash)}</code></td><td>${esc(statuses.get(review.id))}</td><td>${esc(review.notes)}<br>Questions: ${esc(review.unresolvedQuestions)}<br>Full read needed: ${review.fullReadNeeded ? "Yes" : "No"}</td><td>${matching(review).length ? `${matching(review).length} saved` : `Incomplete · <a href="/case/${encodeURIComponent(review.caseId)}/targeted/${encodeURIComponent(review.id)}">Continue comparison</a>`}</td></tr>`).join("")}</tbody></table></div>` : emptyState("No initial observations", "Start a targeted reading exercise from an eligible assessment.")}</section>
<section class="space-y-5"><h2>All full-diff comparisons</h2>${comparisons.length ? `<div class="scroll"><table><thead><tr><th>Initial record / case</th><th>Added findings</th><th>Remaining questions</th><th>Human assessment</th></tr></thead><tbody>${comparisons.map(c => `<tr><td>${esc(c.reviewId)} / ${esc(c.caseId)}<br><code>${esc(c.reportHash)}</code>${reviews.some(review => review.id === c.reviewId && review.caseId === c.caseId && review.reportHash === c.reportHash) ? "" : "<br>Unmatched record"}</td><td>${esc(c.addedFindings)}</td><td>${esc(c.remainingQuestions)}</td><td>Full read still needed: ${c.fullReadNeeded ? "Yes" : "No"}<br>Full changed-line reading: self-attested</td></tr>`).join("")}</tbody></table></div>` : emptyState("No full-diff comparisons", "Complete the initial reading first; its saved notes stay locked during comparison.")}</section>`, { active: "studies" });
}
