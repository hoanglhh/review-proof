// ReviewProof command line. Every stage reads and writes files under data/cases/<id>/, so any stage can be rerun alone.
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { caseDir, loadCase, loadProfile, PIPELINE_VERSION, readJson, writeJson, type Case, type Profile } from "./config.ts";
import { classify, diffArgs, parseDiff, type FileChange, type Hunk } from "./diff.ts";
import { ensureClone, ensureWorktree, git, listFiles, overlayWorktree } from "./git.ts";
import { runTests, type Run } from "./runner.ts";
import { inventory, issueReproduction, patternGroups, publicSurface, REGISTRY, securitySurface, testEvidence, testProjects } from "./checks.ts";
import { Report, type Evidence } from "./report.ts";

const USAGE = `usage: node src/cli.ts <command> <case-id> [options]
  ingest <id>                      clone, worktrees, save the requirement, classify the diff
  check <id> [--fresh]             deterministic checks; test runs are reused unless --fresh
  assemble <id>                    write data/cases/<id>/report.json
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

// ---- assemble (step 2: no model output yet, so no claims) ----

function assemble(c: Case, p: Profile) {
  const dir = caseDir(c.id);
  const { files, hunks } = loadIngest(c);
  const req = readJson(join(dir, "requirement.json"));
  const chk = readJson(join(dir, "check.json"));
  const ps = chk.evidence.find((e: Evidence) => e.check === "public-surface")?.details as ReturnType<typeof publicSurface> | undefined;
  const byFile = Map.groupBy(ps?.hits ?? [], (h) => h.file);
  const decisions: Report["decisions"] = [...byFile].map(([file, hits], i) => ({
    id: `D${i + 1}`,
    statement: `Public surface changed in ${file}: ${hits.map((h) => `${h.change} ${h.text}`).slice(0, 5).join("; ")}${hits.length > 5 ? `; and ${hits.length - 5} more` : ""}.`,
    whyHuman: "Public API and diagnostic IDs are permanent once released. Whether to commit to them is an ownership choice that no test can settle.",
    options: ["Accept as permanent public surface", "Request that it be made non-public or removed", "Escalate to the API owner"],
    hunkIds: [...new Set(hits.map((h) => h.hunkId))], citations: [], raisedBy: { kind: "rule", name: "public-surface" }, response: null,
  }));
  const covered = new Set(decisions.flatMap((d) => d.hunkIds));
  const report: Report = Report.parse({
    schemaVersion: 1,
    case: {
      id: c.id, requirementId: c.requirement.id, requirementUrl: c.requirement.url ?? null, requirementRetrievedAt: req.retrievedAt,
      repository: c.repository, profile: p.name, base: c.base, head: c.head, generatedAt: new Date().toISOString(),
      pipelineVersion: PIPELINE_VERSION, policyVersion: null, model: null, promptHash: null,
    },
    reviewer: { status: "unavailable", reason: "no model output: the AI review stage has not run" },
    requirements: [],
    inventory: { files, totals: inventory(files).totals },
    hunks, evidence: chk.evidence, claims: [], decisions,
    unexplained: hunks.filter((h) => !covered.has(h.id)).map((h) => h.id),
    findings: [],
    notChecked: [...chk.notChecked, { what: "requirements, claims, model-raised decisions and findings", reason: "the AI review stage has not run, so there are no claims to check" }],
  });
  writeJson(join(dir, "report.json"), report);
  console.log(`wrote ${join(dir, "report.json")}: ${report.evidence.length} evidence records, ${report.decisions.length} decisions, ${report.unexplained.length} of ${hunks.length} hunks unexplained`);
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
  options: { fresh: { type: "boolean", default: false }, at: { type: "string" }, filter: { type: "string" } },
});
const [cmd, id] = positionals;
if (!cmd || !id) { console.error(USAGE); process.exit(2); }
const c = loadCase(id);
const p = loadProfile(c.profile);
if (cmd === "ingest") await ingest(c, p);
else if (cmd === "check") await check(c, p, values.fresh!);
else if (cmd === "assemble") assemble(c, p);
else if (cmd === "test-run") await testRun(c, p, values.at ?? "", values.filter);
else { console.error(USAGE); process.exit(2); }
