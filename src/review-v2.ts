// Separate opt-in experiment; never called by the frozen CLI or metrics pipeline.
import { existsSync, lstatSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { assembleReport, confirmationKey, readJsonl, TRUST_LOG, type Policy } from "./assemble.ts";
import { DATA, ROOT, PIPELINE_VERSION, caseDir, loadCase, loadProfile, readJson, writeJson, type Case } from "./config.ts";
import { collectContext, buildPromptV2 } from "./context-v2.ts";
import { ensureClone, readAt } from "./git.ts";
import { runReview } from "./review.ts";
import { renderHtml, renderMarkdown } from "./render.ts";
import type { FileChange, Hunk } from "./diff.ts";
import type { Evidence } from "./report.ts";
import type { TrustEvent } from "./states.ts";

export function assertV2Case(c: Case) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(c.id) || c.id.startsWith("followup-v2-") || c.id.startsWith("planted-")) throw new Error("v2 requires a safe original case ID");
  if (c.cohort !== "sample" || c.synthetic) throw new Error("v2 accepts only unplanted sample cases; holdout and control cases are refused");
  if (![c.base, c.head].every((sha) => /^[0-9a-f]{40}$/.test(sha))) throw new Error("v2 requires pinned full commit hashes");
}

export function prepareV2(c: Case, repo: string, dataRoot = DATA) {
  assertV2Case(c);
  const source = join(dataRoot, "cases", c.id);
  const dir = join(dataRoot, "followup-v2", c.id);
  for (const path of [dataRoot, join(dataRoot, "followup-v2"), dir]) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("v2 output directories must not be symlinks");
  }
  for (const name of ["prompt.json", "manifest.json", "review.json", "report.json", "sheet.html", "sheet.md"]) {
    if (existsSync(join(dir, name)) && lstatSync(join(dir, name)).isSymbolicLink()) throw new Error("v2 output files must not be symlinks");
  }
  const ingest: { case: Case; files: FileChange[]; hunks: Hunk[] } = readJson(join(source, "ingest.json"));
  if (ingest.case.id !== c.id || ingest.case.base !== c.base || ingest.case.head !== c.head || ingest.case.repository !== c.repository) throw new Error("saved ingest does not match the pinned case");
  const requirement: { id: string; title: string; body: string; retrievedAt: string | null } = readJson(join(source, "requirement.json"));
  const checks: { evidence: Evidence[]; notChecked: { what: string; reason: string }[] } = readJson(join(source, "check.json"));
  const context = collectContext(repo, c.base, c.head, ingest.files.map((file) => file.path));
  const prompt = buildPromptV2({ requirement, base: c.base, head: c.head, files: ingest.files, hunks: ingest.hunks, evidence: checks.evidence, readHead: (path) => readAt(repo, c.head, path) }, context);
  if (existsSync(join(dir, "review.json")) || existsSync(join(dir, "report.json"))) {
    if (!existsSync(join(dir, "prompt.json")) || JSON.stringify(readJson(join(dir, "prompt.json"))) !== JSON.stringify(prompt)) throw new Error("v2 already has results for another prompt; preserve that experiment before preparing a different prompt");
  }
  writeJson(join(dir, "prompt.json"), prompt);
  writeJson(join(dir, "manifest.json"), { ...context.manifest, sourceCase: c.id, experiment: "sample-only follow-up; excluded from legacy evaluation metrics", rawCacheCaseId: `followup-v2-${c.id}` });
  return { dir, source, prompt, context, requirement, checks, files: ingest.files, hunks: ingest.hunks };
}

async function main() {
  const { positionals, values } = parseArgs({ options: { prepare: { type: "boolean" }, run: { type: "boolean" } }, allowPositionals: true });
  if (positionals.length !== 1 || Boolean(values.prepare) === Boolean(values.run)) throw new Error("usage: node src/review-v2.ts <sample-case-id> --prepare|--run");
  const c = loadCase(positionals[0]);
  assertV2Case(c); // Refuse holdout before reading saved requirement, evidence or source.
  const rawId = `followup-v2-${c.id}`;
  if ((readJson(join(ROOT, "cases.json")).cases as Case[]).some((entry) => entry.id === rawId) || existsSync(join(caseDir(rawId), "report.json"))) throw new Error("reserved v2 raw cache namespace collides with a case/report");
  for (const path of [join(DATA, "cases"), caseDir(rawId), join(caseDir(rawId), "review")]) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("v2 raw cache directories must not be symlinks");
  }
  const repo = ensureClone(c.repository, [c.base, c.head]);
  const prepared = prepareV2(c, repo);
  if (values.prepare) { console.log(`Prepared ${relative(ROOT, prepared.dir)}: ${prepared.context.selected.length} unchanged context files; no model call.`); return; }
  const review = await runReview(rawId, prepared.prompt, false);
  writeJson(join(prepared.dir, "review.json"), review);
  const confirmationsDir = join(prepared.source, "confirmations");
  const confirmations = new Map<string, string>(existsSync(confirmationsDir) ? readdirSync(confirmationsDir).filter((file) => file.endsWith(".json")).map((file) => {
    const record = readJson(join(confirmationsDir, file));
    return [confirmationKey(record.quote, record.text), record.confirmedBy];
  }) : []);
  const policy: Policy = readJson(join(ROOT, "policy.json"));
  const report = assembleReport({
    c, p: loadProfile(c.profile), policy, requirement: prepared.requirement, files: prepared.files, hunks: prepared.hunks, checks: prepared.checks, review,
    readAt: (at, path) => readAt(repo, at === "head" ? c.head : c.base, path),
    confirmedBy: (quote, text) => confirmations.get(confirmationKey(quote, text)) ?? null,
    trustEvents: readJsonl(TRUST_LOG) as TrustEvent[], generatedAt: new Date().toISOString(), pipelineVersion: `${PIPELINE_VERSION}+context-v2`,
  });
  writeJson(join(prepared.dir, "report.json"), report);
  writeFileSync(join(prepared.dir, "sheet.html"), renderHtml(report, (path) => relative(prepared.dir, join(ROOT, path)), policy.sheet.maxFindingsShown));
  writeFileSync(join(prepared.dir, "sheet.md"), renderMarkdown(report, "sheet.html", policy.sheet.maxFindingsShown));
  console.log(`V2 reviewer ${review.status}; independent validated report: ${relative(ROOT, join(prepared.dir, "report.json"))}`);
  if (review.status !== "ok") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
