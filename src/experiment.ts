import {renderHunk} from './ui/code.ts';
// Observational human review only: these records never change sign-offs, routes or trust.
import { renderHtml } from "./render.ts";
import { esc } from "./ui/html.ts";
import { renderDocument } from "./ui/document.ts";
import { actionLink, pageHeader } from "./ui/components.ts";
import type { Report } from "./report.ts";

const fields = ["reportHash", "name", "method", "priorExposure", "human", "fullReadNeeded", "unresolvedQuestions", "evidenceOpenings"];
export function validateExperiment(currentHash: string, f: URLSearchParams): string[] {
  const errors: string[] = [];
  if (fields.some((key) => f.getAll(key).length !== 1) || [...f.keys()].some(key => !fields.includes(key))) errors.push("Provide each experiment field exactly once, with no unexpected fields.");
  if (!/^[a-f0-9]{64}$/.test(f.get("reportHash") ?? "") || f.get("reportHash") !== currentHash) errors.push("The report changed after this page was opened. Reload and start a new observation.");
  if (!f.get("name")?.trim() || f.get("name")!.trim().length > 120) errors.push("Enter your name (1–120 characters).");
  if (!["sheet", "diff"].includes(f.get("method") ?? "")) errors.push("Choose sheet or diff.");
  for (const key of ["priorExposure", "fullReadNeeded"]) if (!["yes", "no"].includes(f.get(key) ?? "")) errors.push(`Answer ${key === "priorExposure" ? "prior exposure" : "whether a full read is needed"}.`);
  if (f.get("human") !== "yes") errors.push("Confirm that you personally performed this review.");
  if (!f.get("unresolvedQuestions")?.trim() || f.get("unresolvedQuestions")!.trim().length > 4000) errors.push("Record unresolved questions, or None (1–4000 characters).");
  const openings = f.get("evidenceOpenings") ?? "";
  if (!/^\d{1,5}$/.test(openings) || Number(openings) > 10000) errors.push("Evidence openings must be a whole number between 0 and 10000.");
  return errors;
}

export function experimentRecord(caseId: string, currentHash: string, f: URLSearchParams, submittedAt = new Date().toISOString()) {
  const errors = validateExperiment(currentHash, f);
  if (errors.length) throw new Error(errors.join(" "));
  return { schemaVersion: 1, caseId, reportHash: currentHash, submittedAt, reviewer: f.get("name")!.trim(), identity: "self-declared", humanAttested: true,
    method: f.get("method")!, priorExposure: f.get("priorExposure") === "yes",
    evidenceOpenings: Number(f.get("evidenceOpenings")), evidenceOpeningsSource: "manual human tally",
    unresolvedQuestions: f.get("unresolvedQuestions")!.trim(), fullReadNeeded: f.get("fullReadNeeded") === "yes" };
}
export type Experiment = ReturnType<typeof experimentRecord>;

export function renderExperiment(r: Report, requirement: { title: string; body: string }, hash: string, nonce: string, errors: string[] = [], f = new URLSearchParams(), maxFindings = 5) {
  const val = (key: string, fallback = "") => esc(f.get(key) ?? fallback);
  const options = (key: string, choices: [string, string][]) => `<option value="">Choose…</option>${choices.map(([value, label]) => `<option value="${value}"${f.get(key) === value ? " selected" : ""}>${label}</option>`).join("")}`;
  const sheet = renderHtml(r, (path) => `/${path}`, maxFindings).split('<main class="sheet">')[1].split('</main>')[0].replace(/<a href="(?!#)/g, '<a target="_blank" rel="noopener" href="');
  return renderDocument(`Human review: ${r.case.requirementId}`, `${pageHeader("Human review observation", r.case.requirementId, actionLink("/evaluation/experiments", "Recorded observations", { icon: "chart" }))}
<p>This is an observational review record, separate from sign-off and trust. No safety or speedup conclusion can be drawn from these records.</p>
<p>Choose your review method, then open its material below. If you have seen this change, its sheet, discussion or others’ review notes, declare prior exposure. Repeat reads cannot provide an uncontaminated comparison.</p>
${errors.length ? `<div class="errors" role="alert"><h2>Observation not saved</h2><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
<form id="experiment" class="space-y-8" method="post" action="/case/${encodeURIComponent(r.case.id)}/experiment">
<input type="hidden" name="reportHash" value="${val("reportHash", hash)}">
<div class="field"><label for="reviewer-name">Your name</label><input id="reviewer-name" type="text" name="name" maxlength="120" required autocomplete="name" value="${val("name")}"></div>
<div class="field"><label for="prior-exposure">Prior exposure</label><select id="prior-exposure" name="priorExposure" required>${options("priorExposure", [["yes", "Yes · previously exposed"], ["no", "No · first encounter"]])}</select></div>
<div class="field"><label for="method-choice">Method</label><select id="method-choice" name="method" required>${options("method", [["sheet", "Sign-off sheet"], ["diff", "Requirement and changed lines"]])}</select></div>
<div id="material" class="space-y-6"><details><summary>Sign-off sheet</summary><div class="pt-5">${sheet}</div></details><details><summary>Requirement and changed lines</summary><div class="space-y-5 pt-5"><section class="space-y-4"><h2>Requirement</h2><p class="text-lg">${esc(requirement.title)}</p><p class="whitespace-pre-wrap">${esc(requirement.body)}</p></section><section class="space-y-5"><h2>Changed lines</h2><p class="muted">This view contains changed lines, not complete source files or unchanged context.</p>${r.hunks.map(h => renderHunk(h)).join("")}</section></div></details></div>
<section class="panel space-y-5 p-5 md:p-8"><h2>Your observation</h2><div class="field"><label for="evidence-openings">Evidence openings</label><input id="evidence-openings" type="number" name="evidenceOpenings" min="0" max="10000" step="1" required value="${val("evidenceOpenings", "0")}"></div>
<p class="muted">Manual tally: count each evidence item you opened, including repeat openings. Zero means none; this is not automatic link tracking.</p>
<div class="field"><label for="unresolved">Unresolved questions</label><textarea id="unresolved" name="unresolvedQuestions" maxlength="4000" rows="5" required placeholder="Write questions still unresolved, or None.">${val("unresolvedQuestions")}</textarea></div>
<div class="field"><label for="full-read">Full read needed?</label><select id="full-read" name="fullReadNeeded" required>${options("fullReadNeeded", [["yes", "Yes"], ["no", "No"]])}</select></div>
<p><label><input type="checkbox" name="human" value="yes" required${f.get("human") === "yes" ? " checked" : ""}> I personally performed this review and confirm these observations.</label></p><p class="muted">Identity and observations are self-reported, not independently verified. Submission is append-only and does not approve the change.</p><button type="submit">Save human observation</button></section></form>`, { active: "studies", nonce });
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
  return renderDocument("Human review observations", `${pageHeader("Human review observations", "Reading observations, recorded separately from sign-off.", actionLink("/", "All changes", { icon: "back" }))}
<p>${records.length} submitted human records (denominator). ${fresh.length} declared first-read records; ${exposed} prior-exposure record(s) and ${repeated} additional repeat record(s) excluded from method summaries.</p>
<p>No safety or speedup conclusion can be drawn from this observational data. Identity and prior exposure are self-declared. The groups are not randomized or matched. Review time is not collected.</p>
<div class="scroll"><table><thead><tr><th>Method</th><th>First-read records (n)</th><th>Evidence openings (manual)</th><th>Full read needed</th></tr></thead><tbody>${["sheet", "diff"].map((method) => {
    const rows = fresh.filter((r) => r.method === method);
    const sum = (fn: (r: Experiment) => number) => rows.reduce((a, r) => a + fn(r), 0);
    return `<tr><td>${method}</td><td>${rows.length}</td><td>${rows.length ? sum((r) => r.evidenceOpenings) : "Not measured"}</td><td>${sum((r) => Number(r.fullReadNeeded))}/${rows.length}</td></tr>`;
  }).join("")}</tbody></table></div>
<p>Prior-exposure and repeat observations remain stored for audit; they are excluded from method summaries. Records are separate from sign-off and trust.</p>`, { active: "studies" });
}
