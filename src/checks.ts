// Deterministic checks. Each one states what it asserts; `passed`/`failed` always refers to that assertion.
// Everything here is pure: inputs are the parsed diff, the saved requirement, the profile and test runs.
import { dirname } from "node:path";
import type { Profile } from "./config.ts";
import type { FileChange, Hunk } from "./diff.ts";
import type { Run } from "./runner.ts";
import type { Outcome } from "./trx.ts";

import type { Evidence } from "./report.ts";
type Status = Evidence["status"];
type Domain = Evidence["domain"];

/** What each check can and cannot support. Unimplemented entries show where other domains would plug in. */
export const REGISTRY: { check: string; domain: Domain; asserts: string; supports: string; implemented: boolean }[] = [
  { check: "inventory", domain: "general", asserts: "every changed file is classified", supports: "what the change touches (scope)", implemented: true },
  { check: "pattern-groups", domain: "general", asserts: "every repetitive file changed in the same way as its group", supports: "nothing by itself; tells the human which files are identical in what changed", implemented: true },
  { check: "public-surface", domain: "backend", asserts: "no public declaration, public API entry or diagnostic ID was added, removed or changed", supports: "routing: a hit forces a full read and raises a decision", implemented: true },
  { check: "tests-at-head", domain: "backend", asserts: "every test the change added or modified passes at head", supports: "behaviour claims (weak alone: the agent wrote both code and tests)", implemented: true },
  { check: "tests-without-change", domain: "backend", asserts: "every changed test that passes at head fails with the base source", supports: "that a test demonstrates the change (discriminating)", implemented: true },
  { check: "existing-tests", domain: "backend", asserts: "no pre-existing test that passed at base fails at head", supports: "no regression; checked-in expected output matches what the code emits", implemented: true },
  { check: "issue-reproduction", domain: "general", asserts: "a test the change added contains a code block from the requirement", supports: "that a test is tied to the requirement's own reproduction", implemented: true },
  { check: "security-surface", domain: "security", asserts: "no build or dependency file changed and no added line matches a security-sensitive pattern", supports: "routing only: a hit forces a full read; a clean scan proves nothing", implemented: true },
  { check: "citation-validation", domain: "general", asserts: "every model citation's quote is found at the stated file, lines and commit", supports: "whether model reasoning may be shown at all", implemented: false },
  { check: "dependency-audit", domain: "security", asserts: "no added dependency version has a known advisory", supports: "known-vulnerability claims (not absence of vulnerabilities)", implemented: false },
  { check: "ui-render-and-accessibility", domain: "frontend", asserts: "changed views render, match approved screenshots and pass an accessibility scan", supports: "visual and accessibility claims; usability stays a human item", implemented: false },
];
const spec = (check: string) => REGISTRY.find((r) => r.check === check)!;

const index = (hunks: Hunk[]) => new Map(hunks.map((h) => [h.id, h]));
const fileHunks = (f: FileChange, byId: Map<string, Hunk>) => f.hunkIds.map((id) => byId.get(id)!);

export function inventory(files: FileChange[]) {
  const byClass: Record<string, { files: number; lines: number }> = {};
  for (const f of files) {
    const c = (byClass[f.class] ??= { files: 0, lines: 0 });
    c.files++; c.lines += f.added + f.removed;
  }
  const unclassified = files.filter((f) => f.class === "unclassified").map((f) => f.path);
  return {
    totals: { files: files.length, added: files.reduce((n, f) => n + f.added, 0), removed: files.reduce((n, f) => n + f.removed, 0), byClass },
    unclassified, binary: files.filter((f) => f.binary).map((f) => f.path),
  };
}

const MIN_GROUP_FILES = 3; // a "pattern" must recur in at least this many files

/** Groups hunks of repetitive files by their normalised removed and added lines. Never makes anything proven. */
export function patternGroups(files: FileChange[], hunks: Hunk[], classes: string[]) {
  const byId = index(hunks);
  const norm = (ls: string[]) => ls.map((l) => l.trim().replace(/\s+/g, " ")).join("\n");
  const eligible = files.filter((f) => classes.includes(f.class));
  const groups = new Map<string, Hunk[]>();
  for (const f of eligible) for (const h of fileHunks(f, byId)) {
    const key = `${norm(h.removed)}\n=>\n${norm(h.added)}`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  const repeated = [...groups.values()].filter((g) => new Set(g.map((h) => h.file)).size >= MIN_GROUP_FILES)
    .sort((a, b) => b.length - a.length)
    .map((g, i) => ({ id: `G${i + 1}`, hunks: g.length, files: new Set(g.map((h) => h.file)).size, removed: g[0].removed, added: g[0].added, hunkIds: g.map((h) => h.id) }));
  const inGroup = new Set(repeated.flatMap((g) => g.hunkIds));
  const deviating = repeated.length === 0 ? [] : eligible
    .map((f) => ({ file: f.path, hunkIds: f.hunkIds.filter((id) => !inGroup.has(id)) }))
    .filter((d) => d.hunkIds.length > 0);
  return { eligibleFiles: eligible.length, groups: repeated, deviating };
}

export function publicSurface(files: FileChange[], hunks: Hunk[], ps: Profile["publicSurface"]) {
  const byId = index(hunks);
  const [decl, paths, api, diagFiles, diagId] = [ps.declaration, ps.paths, ps.apiFiles, ps.diagnosticFiles, ps.diagnosticId].map((r) => new RegExp(r));
  const hits: { file: string; hunkId: string; kind: string; change: "added" | "removed"; text: string }[] = [];
  const ids = { added: new Map<string, { file: string; hunkId: string; text: string }>(), removed: new Map<string, { file: string; hunkId: string; text: string }>() };
  for (const f of files) for (const h of fileHunks(f, byId)) {
    const lines = [...h.removed.map((t) => ["removed", t] as const), ...h.added.map((t) => ["added", t] as const)];
    for (const [change, t] of lines) {
      if (ps.classes.includes(f.class) && paths.test(f.path) && decl.test(t)) hits.push({ file: f.path, hunkId: h.id, kind: "public-declaration", change, text: t.trim() });
      if (api.test(f.path) && t.trim()) hits.push({ file: f.path, hunkId: h.id, kind: "public-api-file", change, text: t.trim() });
      const id = diagFiles.test(f.path) ? diagId.exec(t)?.[1] : undefined;
      if (id) ids[change].set(id, { file: f.path, hunkId: h.id, text: t.trim() });
    }
  }
  // an ID moved between release files is neither new nor removed
  for (const change of ["added", "removed"] as const) {
    const other = ids[change === "added" ? "removed" : "added"];
    for (const [id, at] of ids[change]) if (!other.has(id)) hits.push({ ...at, kind: "diagnostic-id", change, text: `${id}: ${at.text}` });
  }
  return { hits };
}

export function securitySurface(files: FileChange[], hunks: Hunk[], ss: Profile["securitySurface"]) {
  const byId = index(hunks);
  const patterns = ss.patterns.map((p) => ({ name: p.name, re: new RegExp(p.regex, p.flags) }));
  const hits: { file: string; hunkId: string; line: number; pattern: string; text: string }[] = [];
  for (const f of files.filter((f) => ss.classes.includes(f.class))) for (const h of fileHunks(f, byId)) {
    h.added.forEach((t, i) => {
      for (const p of patterns) if (p.re.test(t)) hits.push({ file: f.path, hunkId: h.id, line: h.newStart + i, pattern: p.name, text: t.trim().slice(0, 200) });
    });
  }
  return { buildConfigFiles: files.filter((f) => f.class === "build-config").map((f) => f.path), hits };
}

const MIN_BLOCK_CHARS = 40; // shorter code blocks (a type name, a version) would match by accident

/** Code blocks of the requirement that appear, ignoring all whitespace, in lines added to test files. */
export function issueReproduction(body: string, files: FileChange[], hunks: Hunk[], testPaths: string[]) {
  const byId = index(hunks);
  const squash = (s: string) => s.replace(/\s+/g, "");
  const blocks = [...body.replace(/\r\n/g, "\n").matchAll(/^ {0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^ {0,3}\1[ \t]*$/gm)].map((m) => m[2]);
  const added = files.filter((f) => testPaths.some((r) => new RegExp(r).test(f.path)))
    .map((f) => ({ path: f.path, text: squash(fileHunks(f, byId).flatMap((h) => h.added).join("\n")) }));
  return blocks.map((b, i) => {
    const s = squash(b);
    return {
      block: i + 1, chars: s.length, firstLine: b.trim().split("\n")[0].slice(0, 100),
      foundIn: s.length >= MIN_BLOCK_CHARS ? added.filter((a) => a.text.includes(s)).map((a) => a.path) : [],
      ...(s.length < MIN_BLOCK_CHARS ? { skipped: `shorter than ${MIN_BLOCK_CHARS} non-whitespace characters` } : {}),
    };
  });
}

/** Test projects that contain changed files under the profile's test paths: nearest enclosing project file at head. */
export function testProjects(files: FileChange[], headFiles: string[], tests: Profile["tests"]) {
  const isTest = (p: string) => tests.paths.some((r) => new RegExp(r).test(p));
  const projRe = new RegExp(tests.projectFile);
  const projectIn = new Map<string, string>();
  for (const f of headFiles) if (projRe.test(f) && !projectIn.has(dirname(f))) projectIn.set(dirname(f), f);
  const projects = new Map<string, string[]>();
  const orphans: string[] = [];
  for (const f of files.filter((f) => isTest(f.path))) {
    for (let d = dirname(f.path); ; d = dirname(d)) {
      const p = projectIn.get(d);
      if (p) { projects.set(p, [...(projects.get(p) ?? []), f.path]); break; }
      if (d === "." || d === "/") { orphans.push(f.path); break; }
    }
  }
  return { testFiles: files.filter((f) => isTest(f.path)), projects, orphans };
}

type RunView = Pick<Run, "status" | "reason" | "tests" | "command" | "log" | "results" | "durationMs" | "performedBy" | "sourceCommit" | "testsCommit">;
const outcomes = (r: RunView) => new Map(r.tests.map((t) => [t.name, t.outcome] as [string, Outcome]));
const logsOf = (...rs: RunView[]) => rs.flatMap((r) => [r.log, r.results].filter((x): x is string => !!x));
const notCompleted = (r: RunView): Status => (r.status === "not_run" ? "not_run" : "inconclusive");

/**
 * Checks 4, 5 and 6 for one test project, from three runs: head; base; base source with head test files ("without").
 * `without` is undefined when the change touches no test files in this project. `baseAbsent` means the project does
 * not exist at base, so every test at head is new.
 */
export function testEvidence(project: string, head: RunView, base: RunView, without: RunView | undefined, baseAbsent: boolean): Evidence[] {
  const H = outcomes(head), B = baseAbsent ? new Map<string, Outcome>() : outcomes(base), W = without ? outcomes(without) : undefined;
  const baseKnown = baseAbsent || base.status === "completed";
  const withoutOk = without?.status === "completed";
  // shortcut: a test counts as changed if it is new or its outcome moved when only test files changed;
  // an edited test whose outcome did not move is missed. Upgrade: map changed lines to test methods.
  const changed = [...H.keys()].filter((n) => !B.has(n) || (withoutOk && B.get(n) !== W!.get(n)));
  const msg = new Map(head.tests.map((t) => [t.name, t.message]));
  const common = (check: string, runs: RunView[]) => ({
    id: `${check}:${project}`, check, domain: spec(check).domain, asserts: spec(check).asserts,
    performedBy: head.performedBy, commands: runs.map((r) => r.command),
    commits: [...new Set(runs.flatMap((r) => [r.sourceCommit, r.testsCommit]))],
    durationMs: runs.reduce((n, r) => n + r.durationMs, 0), logs: logsOf(...runs),
  });

  let atHead: Evidence;
  if (head.status !== "completed") atHead = { ...common("tests-at-head", [head]), status: notCompleted(head), reason: head.reason, summary: "The head run did not complete." };
  else if (!baseKnown) atHead = { ...common("tests-at-head", [head, base]), status: "inconclusive", reason: `base run did not complete (${base.reason}), so new tests cannot be told apart from existing ones`, summary: "Changed tests could not be identified." };
  else if (!changed.length) atHead = { ...common("tests-at-head", [head]), status: "not_run", reason: "the change adds or modifies no test that this project runs (as far as the runner can tell)", summary: "No changed tests." };
  else {
    const failed = changed.filter((n) => H.get(n) !== "passed");
    atHead = {
      ...common("tests-at-head", [head]), status: failed.length ? "failed" : "passed",
      summary: `${changed.length - failed.length} of ${changed.length} changed tests pass at head.`,
      tests: changed.map((n) => ({ name: n, outcome: H.get(n)!, new: !B.has(n), ...(msg.get(n) ? { message: msg.get(n) } : {}) })),
    };
  }

  let withoutChange: Evidence;
  if (!without) withoutChange = { ...common("tests-without-change", []), status: "not_run", reason: "the change touches no test files in this project", summary: "Nothing to overlay." };
  else if (!withoutOk) withoutChange = { ...common("tests-without-change", [without]), status: notCompleted(without), reason: `base source with head test files: ${without.reason}`, summary: "Could not show whether the changed tests fail without the change; claims they support stay argued." };
  else if (head.status !== "completed" || !changed.length) withoutChange = { ...common("tests-without-change", [without]), status: "not_run", reason: head.status !== "completed" ? "the head run did not complete" : "no changed tests", summary: "Nothing to compare." };
  else {
    const rows = changed.map((n) => ({ name: n, head: H.get(n)!, withoutChange: W!.get(n) ?? "absent", discriminating: H.get(n) === "passed" && W!.get(n) === "failed" }));
    const passing = rows.filter((r) => r.head === "passed");
    const nonDisc = passing.filter((r) => !r.discriminating).map((r) => r.name);
    const wmsg = new Map(without.tests.map((t) => [t.name, t.message]));
    withoutChange = {
      ...common("tests-without-change", [without]), status: nonDisc.length ? "failed" : "passed",
      summary: `${passing.length - nonDisc.length} of ${passing.length} changed tests that pass at head fail without the change (discriminating).` +
        (nonDisc.length ? ` Non-discriminating (prove nothing about this change): ${nonDisc.join(", ")}.` : ""),
      tests: rows.map((r) => ({ ...r, ...(wmsg.get(r.name) ? { messageWithoutChange: wmsg.get(r.name) } : {}) })),
    };
  }

  let existing: Evidence;
  if (baseAbsent) existing = { ...common("existing-tests", [head]), status: "not_run", reason: "the test project does not exist at base, so it has no pre-existing tests", summary: "No pre-existing tests." };
  else if (head.status !== "completed" || base.status !== "completed") {
    const bad = head.status !== "completed" ? head : base;
    existing = { ...common("existing-tests", [head, base]), status: notCompleted(bad), reason: `${bad === head ? "head" : "base"} run: ${bad.reason}`, summary: "Pre-existing tests could not be compared." };
  } else {
    const pre = [...B.keys()].filter((n) => H.has(n));
    const rows = pre.map((n) => ({ name: n, base: B.get(n)!, head: H.get(n)! }));
    const regressions = rows.filter((r) => r.base === "passed" && r.head !== "passed");
    const fixed = rows.filter((r) => r.base !== "passed" && r.head === "passed");
    const failingBoth = rows.filter((r) => r.base !== "passed" && r.head !== "passed");
    const removed = [...B.keys()].filter((n) => !H.has(n));
    existing = {
      ...common("existing-tests", [head, base]), status: regressions.length ? "failed" : "passed",
      summary: `${pre.length} pre-existing tests: ${rows.filter((r) => r.base === "passed" && r.head === "passed").length} pass at both, ${regressions.length} regressed, ${fixed.length} newly pass, ${failingBoth.length} fail at both; ${removed.length} removed at head.`,
      tests: rows, // every pre-existing test: claim states need the passing ones too
      details: { preExisting: pre.length, removedAtHead: removed },
    };
  }
  return [atHead, withoutChange, existing];
}
