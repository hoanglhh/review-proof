// ReviewProof command line. Every stage reads and writes files under data/cases/<id>/, so any stage can be rerun alone.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { caseDir, DATA, loadCase, loadProfile, PIPELINE_VERSION, readJson, ROOT, writeJson, type Case, type Profile } from "./config.ts";
import { classify, diffArgs, parseDiff, type FileChange, type Hunk } from "./diff.ts";
import { ensureClone, ensureWorktree, git, listFiles, overlayWorktree, readAt } from "./git.ts";
import { runTests, type Run } from "./runner.ts";
import { inventory, issueReproduction, patternGroups, publicSurface, REGISTRY, securitySurface, testEvidence, testProjects } from "./checks.ts";
import type { Evidence } from "./report.ts";
import { buildPrompt, runReview } from "./review.ts";
import { assembleCase } from "./assemble.ts";
import { startServer, writeSimulation } from "./server.ts";
import { trustFloor } from "./states.ts";

const USAGE = `usage: node src/cli.ts <command> <case-id> [options]
  ingest <id>                      clone, worktrees, save the requirement, classify the diff
  check <id> [--fresh]             deterministic checks; test runs are reused unless --fresh
  review <id> [--fresh]            the bounded AI step; a saved response with the same prompt hash is reused unless --fresh
  assemble <id>                    validate citations, compute states and route, write report.json, sheet.html, sheet.md
  all <id>                         ingest, check, review, assemble
  serve [--port 4400]              local sign-off server: view sheets, confirm, sign, blind spot-checks
  simulate                         write a synthetic trust history to its own file (shown under a SIMULATED banner)
  test-run <id> --at head|base|without-change [--filter EXPR]   one container test run, printed`;

// ---- ingest ----

async function fetchRequirement(c: Case) {
  if (c.requirement.text) return { id: c.requirement.id, url: null, retrievedAt: null, title: "", body: c.requirement.text };
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/.exec(c.requirement.url!);
  if (!m) throw new Error(`unsupported requirement URL ${c.requirement.url}; give the requirement as text in cases.json`);
  const api = `https://api.github.com/repos/${m[1]}/${m[2]}/issues/${m[3]}`;
  const res = await fetch(api, { headers: { accept: "application/vnd.github+json", "user-agent": "reviewproof" } });
  if (!res.ok) throw new Error(`GET ${api}: HTTP ${res.status}`);
  const issue = await res.json();
  return { id: c.requirement.id, url: c.requirement.url, api, retrievedAt: new Date().toISOString(), title: issue.title, body: issue.body ?? "", issue };
}

async function ingest(c: Case, p: Profile) {
  const dir = caseDir(c.id);
  const repo = ensureClone(c.repository, [c.base, c.head]);
  ensureWorktree(repo, c.head, c.head);
  ensureWorktree(repo, c.base, c.base);
  const reqPath = join(dir, "requirement.json");
  if (!existsSync(reqPath)) writeJson(reqPath, await fetchRequirement(c)); // fetched once; the pipeline works from the saved copy
  const headFiles = new Set(listFiles(repo, c.head));
  const a = diffArgs(c.base, c.head);
  const { files, hunks } = parseDiff(git(repo, a.names), git(repo, a.patch), (path) => classify(path, p.classify, (q) => headFiles.has(q)));
  writeJson(join(dir, "ingest.json"), { case: c, ingestedAt: new Date().toISOString(), files, hunks });
  const inv = inventory(files);
  console.log(`case ${c.id}: ${inv.totals.files} files, +${inv.totals.added}/-${inv.totals.removed}, ${hunks.length} hunks`);
  for (const [k, v] of Object.entries(inv.totals.byClass)) console.log(`  ${k.padEnd(16)} ${String(v.files).padStart(4)} files ${String(v.lines).padStart(6)} lines`);
}

const loadIngest = (c: Case): { files: FileChange[]; hunks: Hunk[] } => readJson(join(caseDir(c.id), "ingest.json"));

// ---- check ----

async function check(c: Case, p: Profile, fresh: boolean) {
  const dir = caseDir(c.id);
  const { files, hunks } = loadIngest(c);
  const req = readJson(join(dir, "requirement.json"));
  const repo = ensureClone(c.repository, [c.base, c.head]);
  const headFiles = listFiles(repo, c.head);
  const baseFiles = new Set(listFiles(repo, c.base));
  const evidence: Evidence[] = [];
  const notChecked: { what: string; reason: string }[] = [];

  const stat = (check: string, status: Evidence["status"], summary: string, details: unknown, reason?: string): Evidence => {
    const s = REGISTRY.find((r) => r.check === check)!;
    return {
      id: check, check, domain: s.domain, asserts: s.asserts, performedBy: `reviewproof ${PIPELINE_VERSION} (static check, in-process)`,
      commands: [`node src/cli.ts check ${c.id}`], commits: [c.base, c.head], status, ...(reason ? { reason } : {}),
      summary, durationMs: 0, logs: [], details,
    };
  };

  const inv = inventory(files);
  evidence.push(stat("inventory", inv.unclassified.length ? "failed" : "passed",
    `${inv.totals.files} files, +${inv.totals.added}/-${inv.totals.removed}: ` +
    Object.entries(inv.totals.byClass).map(([k, v]) => `${v.files} ${k} (${v.lines} lines)`).join(", ") + ".", inv));

  const pg = patternGroups(files, hunks, p.repetitiveClasses);
  evidence.push(pg.eligibleFiles === 0
    ? stat("pattern-groups", "not_run", "No repetitive files changed.", pg, `no changed files of class ${p.repetitiveClasses.join(" or ")}`)
    : stat("pattern-groups", pg.deviating.length ? "failed" : "passed",
      pg.groups.length === 0 ? `No change recurs in 3 or more of the ${pg.eligibleFiles} repetitive files; nothing to group.`
        : `${pg.groups.map((g) => `${g.id}: ${g.hunks} identical hunks in ${g.files} files`).join("; ")}. ${pg.deviating.length} file(s) deviate.`, pg));

  const ps = publicSurface(files, hunks, p.publicSurface);
  evidence.push(stat("public-surface", ps.hits.length ? "failed" : "passed",
    ps.hits.length ? `${ps.hits.length} public-surface line(s) changed in ${new Set(ps.hits.map((h) => h.file)).size} file(s).` : "No public declaration, API file entry or diagnostic ID changed.", ps));

  // checks 4-6: three runs per affected test project
  const tp = testProjects(files, headFiles, p.tests);
  if (tp.orphans.length) notChecked.push({ what: `tests in ${tp.orphans.join(", ")}`, reason: "no test project file encloses these changed test files" });
  if (!tp.projects.size) notChecked.push({ what: "tests-at-head, tests-without-change, existing-tests", reason: "no changed file lies in a test project, so the runner does not know which tests to run" });
  let overlay: string | undefined;
  for (const [project] of tp.projects) {
    const name = basename(project).replace(/\.[^.]+$/, "");
    const get = async (at: string, where: () => { worktree: string; sourceCommit: string; testsCommit: string }): Promise<Run> => {
      const f = join(dir, "runs", `${at}.${name}.json`);
      if (!fresh && existsSync(f)) return readJson(f);
      console.log(`running ${at}.${name} ...`);
      const r = await runTests({ profile: p, project, name: `${at}.${name}`, outDir: join(dir, "runs"), ...where() });
      writeJson(f, r);
      console.log(`  ${r.status}${r.reason ? ` (${r.reason})` : ""}, ${r.tests.length} tests, ${Math.round(r.durationMs / 1000)}s`);
      return r;
    };
    const baseAbsent = !baseFiles.has(project);
    const head = await get("head", () => ({ worktree: ensureWorktree(repo, c.head, c.head), sourceCommit: c.head, testsCommit: c.head }));
    const base: Run = baseAbsent
      ? { ...head, name: `base.${name}`, sourceCommit: c.base, testsCommit: c.base, command: "", status: "not_run", reason: "project does not exist at base", tests: [], durationMs: 0, log: undefined, results: undefined }
      : await get("base", () => ({ worktree: ensureWorktree(repo, c.base, c.base), sourceCommit: c.base, testsCommit: c.base }));
    const without = await get("without-change", () => ({
      worktree: (overlay ??= overlayWorktree(repo, `overlay-${c.id}`, c.base, c.head, tp.testFiles)), sourceCommit: c.base, testsCommit: c.head,
    }));
    evidence.push(...testEvidence(name, head, base, without, baseAbsent));
  }

  const repro = issueReproduction(req.body, files, hunks, p.tests.paths);
  const found = repro.filter((b) => b.foundIn.length);
  evidence.push(repro.length === 0
    ? stat("issue-reproduction", "not_run", "The requirement contains no code blocks.", { blocks: repro }, "the requirement contains no code blocks")
    : stat("issue-reproduction", found.length ? "passed" : "failed",
      `${found.length} of ${repro.length} code blocks in the requirement appear (ignoring whitespace) in added test lines` +
      (found.length ? `: ${found.map((b) => `block ${b.block} in ${b.foundIn.join(", ")}`).join("; ")}.` : "."), { blocks: repro }));

  const sec = securitySurface(files, hunks, p.securitySurface);
  const secHit = sec.hits.length > 0 || sec.buildConfigFiles.length > 0;
  evidence.push(stat("security-surface", secHit ? "failed" : "passed", secHit
    ? `${sec.buildConfigFiles.length} build/dependency file(s) changed; ${sec.hits.length} added line(s) match security-sensitive patterns.`
    : "Pattern scan found nothing; this is not proof that no vulnerability exists.", sec));

  writeJson(join(dir, "check.json"), { checkedAt: new Date().toISOString(), evidence, notChecked });
  for (const e of evidence) console.log(`${e.status.padEnd(12)} ${e.id}: ${e.summary}${e.reason ? ` [${e.reason}]` : ""}`);
}

// ---- review ----

async function review(c: Case, p: Profile, fresh: boolean) {
  const dir = caseDir(c.id);
  const { files, hunks } = loadIngest(c);
  const req = readJson(join(dir, "requirement.json"));
  const chk = readJson(join(dir, "check.json"));
  const repo = ensureClone(c.repository, [c.base, c.head]);
  const prompt = buildPrompt({
    requirement: { id: c.requirement.id, title: req.title, body: req.body }, base: c.base, head: c.head,
    files, hunks, evidence: chk.evidence, readHead: (path) => readAt(repo, c.head, path),
  });
  console.log(`reviewer prompt: ${prompt.system.length + prompt.user.length} chars; files in full: ${prompt.fullFiles.join(", ") || "none"}`);
  const rec = await runReview(c.id, prompt, fresh);
  writeJson(join(dir, "review.json"), rec);
  console.log(`reviewer ${rec.status}${rec.reason ? `: ${rec.reason}` : ""}${rec.rawResponse ? ` (raw response ${rec.rawResponse})` : ""}`);
  if (rec.output) console.log(`  ${rec.output.requirements.length} requirements, ${rec.output.claims.length} claims, ${rec.output.decisions.length} decisions, ${rec.output.findings.length} findings, ${rec.output.cannotDecide.length} cannot-decide`);
}

// ---- assemble: citations, states, route, sheet ----

function assemble(c: Case, p: Profile) {
  const report = assembleCase(c, p);
  const states = Map.groupBy(report.claims, (x) => x.state);
  console.log(`wrote ${relative(ROOT, caseDir(c.id))}/report.json, sheet.html, sheet.md`);
  console.log(`  route: ${report.route.effectiveRoute} (evidence ${report.route.evidenceRoute}, trust floor ${report.route.trustFloor}); claims: ${[...states].map(([k, v]) => `${v.length} ${k}`).join(", ") || "none"}; ${report.decisions.length} decisions; ${report.unexplained.length} unexplained hunks`);
  for (const x of report.route.reasons) console.log(`  - ${x.code}: ${x.detail}`);
}

// ---- test-run (environment proof and debugging) ----

async function testRun(c: Case, p: Profile, at: string, filter?: string) {
  const { files } = loadIngest(c);
  const repo = ensureClone(c.repository, [c.base, c.head]);
  const tp = testProjects(files, listFiles(repo, c.head), p.tests);
  const [project] = [...tp.projects.keys()];
  if (!project) throw new Error("no test project contains changed files");
  const where = at === "head" ? { worktree: ensureWorktree(repo, c.head, c.head), sourceCommit: c.head, testsCommit: c.head }
    : at === "base" ? { worktree: ensureWorktree(repo, c.base, c.base), sourceCommit: c.base, testsCommit: c.base }
    : at === "without-change" ? { worktree: overlayWorktree(repo, `overlay-${c.id}`, c.base, c.head, tp.testFiles), sourceCommit: c.base, testsCommit: c.head }
    : undefined;
  if (!where) throw new Error("--at must be head, base or without-change");
  const name = `${at}.${basename(project).replace(/\.[^.]+$/, "")}${filter ? ".filtered" : ""}`;
  const r = await runTests({ profile: p, project, filter, name, outDir: join(caseDir(c.id), "runs"), ...where });
  writeJson(join(caseDir(c.id), "runs", `${name}.json`), r);
  console.log(`${r.status}${r.reason ? ` (${r.reason})` : ""}: exit ${r.exitCode}, ${Math.round(r.durationMs / 1000)}s, log ${r.log}${r.results ? `, results ${r.results}` : ""}`);
  const count = Map.groupBy(r.tests, (t) => t.outcome);
  console.log([...count].map(([k, v]) => `${v.length} ${k}`).join(", ") || "no test results");
  if (r.tests.length <= 20) for (const t of r.tests) console.log(`  ${t.outcome.padEnd(7)} ${t.name}${t.message ? `\n          ${t.message.split("\n")[0].slice(0, 300)}` : ""}`);
}

// ---- main ----

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { fresh: { type: "boolean", default: false }, at: { type: "string" }, filter: { type: "string" }, port: { type: "string", default: "4400" } },
});
const [cmd, id] = positionals;
if (cmd === "serve") { startServer(Number(values.port)); }
else if (cmd === "simulate") {
  const per = readJson(join(ROOT, "policy.json")).trust.cleanSpotChecksPerStep;
  const events = writeSimulation(per);
  console.log(`wrote ${events.length} SYNTHETIC events to data/trust/simulated-events.jsonl (not the real record):`);
  events.forEach((e, i) => console.log(`  ${String(i + 1).padStart(2)} ${e.type.padEnd(17)} floor after: ${trustFloor(events.slice(0, i + 1), per).floor}`));
} else {
if (!cmd || !id) { console.error(USAGE); process.exit(2); }
const c = loadCase(id);
const p = loadProfile(c.profile);
if (cmd === "ingest") await ingest(c, p);
else if (cmd === "check") await check(c, p, values.fresh!);
else if (cmd === "review") await review(c, p, values.fresh!);
else if (cmd === "assemble") assemble(c, p);
else if (cmd === "all") { await ingest(c, p); await check(c, p, values.fresh!); await review(c, p, values.fresh!); assemble(c, p); }
else if (cmd === "test-run") await testRun(c, p, values.at ?? "", values.filter);
else { console.error(USAGE); process.exit(2); }
}
