import { existsSync, readFileSync } from "node:fs";
import { esc } from "./ui/html.ts";
import { renderDocument } from "./ui/document.ts";
import { actionLink, emptyState, pageHeader, statusBadge } from "./ui/components.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/domain-examples/${name}`, import.meta.url), "utf8");
const code = (id: string, name: string) => `<details id="${id}"><summary>${esc(name)} · exact source</summary><pre class="example-source">${esc(fixture(name))}</pre></details>`;
export function renderDomainExamples(): string {
  const evidence = [
    ["checks.tap", "Saved automated fixture-test output"],
    ["browser-checks.json", "Recorded browser behavior and layout assertions"],
  ].filter(([name]) => existsSync(new URL(`../data/domain-examples/${name}`, import.meta.url)));
  return renderDocument("Synthetic domain examples", `${pageHeader("Synthetic domain examples", "Two small changes make the claim, check, and human decision concrete.", actionLink("/", "ReviewProof cases", { icon: "back" }))}
<p class="example-warning">${statusBadge("argued", "SYNTHETIC · NOT SIGNABLE.")} These are teaching fixtures, separate from the frozen evaluation, benchmark cohorts, and metrics. They are not new evaluated cases or human approvals.</p>
<nav class="example-nav flex flex-wrap gap-3" aria-label="Examples">${actionLink("#frontend", "Frontend search", { icon: "code" })}${actionLink("#security", "Document authorization", { icon: "shield" })}</nav>
<section class="panel space-y-5 p-5 md:p-8" id="frontend" aria-labelledby="frontend-title"><h2 id="frontend-title">Frontend: a search you can operate by keyboard</h2>
<p><b>FE-1:</b> Give the search input a visible, programmatically associated label and support submitting through a native button. <b>FE-2:</b> Empty or whitespace-only input must show an associated inline error, mark the input invalid, and focus it; editing clears stale feedback. A valid submit shows synthetic output without a request.</p>
<div class="actions">${actionLink("/examples/frontend?version=base", "Try base", { icon: "code" })}${actionLink("/examples/frontend?version=head", "Try head", { primary: true, icon: "arrow" })}</div>
<p><b>Claim FE-C1:</b> Head adds the label, a submit button, and focused empty-input recovery. Base uses a clickable div without a keyboard handler and has no input label.</p>
<p><b>Evidence:</b> The exact runnable source appears below. <code>test/domain-examples.test.ts</code> checks rendered semantics; browser checks should exercise actual Enter/Space activation, focus, error association, and a narrow viewport. Test definitions alone are not recorded browser evidence.</p>
<p><b>Human decision FE-D1:</b> Does “Find a synthetic note” match the product vocabulary, and does the error help intended users recover? A product owner and usability review must decide; markup tests cannot.</p>
<details><summary>Unverified limits</summary><p>No screen-reader session, user study, contrast audit, full accessibility conformance claim, or real search backend is implied. The result is fixed synthetic text.</p></details>
<p><b>Illustrative routing: Full read.</b> Review both small fixtures and manually try the interaction. Do not infer a light-review route from a semantic markup assertion. This is a teaching recommendation, not a computed policy result.</p>
${code("frontend-base-code", "frontend-base.html")}
${code("frontend-head-code", "frontend-head.html")}
</section>
<section class="panel space-y-5 p-5 md:p-8" id="security" aria-labelledby="security-title"><h2 id="security-title">Security: authorize the document owner</h2>
<p><b>SEC-1:</b> Only an authenticated owner may read a document. <b>SEC-2:</b> Reject malformed boundary values and return the same generic unavailable result for anonymous, missing, invalid, and other-owner documents, without returning document content.</p>
<p><b>Claim SEC-C1:</b> Base checks authentication and input shapes but omits ownership. Head also compares <code>document.ownerId</code> with the authenticated <code>session.userId</code>.</p>
<p><b>Trust boundary:</b> Session identity must be established by server authentication, never accepted from request JSON. These functions receive an already selected synthetic document; they do not implement authentication, storage lookup, or an HTTP endpoint.</p>
<p><b>Evidence:</b> <code>test/domain-examples.test.ts</code> calls both real fixture functions. The same assertion that another owner receives <code>{ ok: false, error: "Document unavailable" }</code> fails on base and passes on head. Separate cases check owner success, anonymous denial, missing documents, invalid input types, and an empty body. Run it with <code>node --test test/domain-examples.test.ts</code>; a test definition is not itself a run artifact.</p>
<p><b>Human decision SEC-D1:</b> Is owner-only access the intended product policy, or should sharing, organization roles, or delegated access be allowed? A security owner must decide before a real change ships. No authorization policy decision has been accepted here.</p>
<p><b>Unverified limits:</b> The generic return avoids an existence distinction in this function's result, not timing or HTTP side channels. No real session, database permissions, tenant isolation, revocation, concurrent update, deployment, or penetration test is represented. Never use the deliberately vulnerable base in production.</p>
<p><b>Illustrative routing: Full read.</b> Ownership is an authorization boundary. Read the guard, the caller establishing session identity, and storage selection in a real change even when the discriminating test passes. No caller exists in this synthetic fixture.</p>
${code("security-base-code", "security-base.ts")}
${code("security-head-code", "security-head.ts")}
</section>
<section aria-labelledby="checks-title"><h2 id="checks-title">Run and inspect the checks</h2><p>The local test command is <code>node --test test/domain-examples.test.ts</code>. See <code>docs/domain-examples.md</code> for check scope and the browser procedure. These examples have no sign-off form and contribute no evaluation metrics.</p>${evidence.length ? `<ul>${evidence.map(([name, label]) => `<li><a href="/data/domain-examples/${name}">${label}</a></li>`).join("")}</ul><p>Inspect each record for its executed assertions and limits; these observations do not establish complete accessibility or security.</p>` : emptyState("No saved check records", "No saved automated check records are available yet.")}</section>
`, { active: "examples" });
}

export function renderFrontendExample(version: "base" | "head", nonce: string): string {
  const source = fixture(`frontend-${version}.html`).replace("<script>", `<script nonce="${esc(nonce)}">`);
  return renderDocument(`Synthetic frontend · ${version}`, `${pageHeader(`Synthetic search · ${version}`, "Try the fixed local search interaction.", actionLink("/examples#frontend", "Worked example and exact code", { icon: "back" }))}
<p class="example-warning">${statusBadge("argued", "SYNTHETIC · NOT SIGNABLE.")} Local fixed output only. No network requests or real records. ${version === "base" ? "This base deliberately has accessibility defects." : "This head is a small interaction fix, not an accessibility certification."}</p>
<nav class="example-nav flex flex-wrap gap-3" aria-label="Fixture version"><a class="button secondary" href="/examples/frontend?version=base"${version === "base" ? ' aria-current="page"' : ""}>Base</a><a class="button secondary" href="/examples/frontend?version=head"${version === "head" ? ' aria-current="page"' : ""}>Head</a></nav>
<p>Try an empty search, then type any term and submit. Head supports the input's Enter key and the button's Enter and Space keys.</p>
<div class="panel max-w-2xl p-5 md:p-8">${source}</div>`, { active: "examples" });
}
