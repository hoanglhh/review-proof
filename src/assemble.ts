// Turns ingest + checks + reviewer output into a validated report. Nothing the model says is evidence:
// citations must resolve, references must name things that exist, and states are computed here.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { caseDir, DATA, PIPELINE_VERSION, readJson, ROOT, writeJson, type Case, type Profile } from "./config.ts";
import { ensureClone, readAt } from "./git.ts";
import { renderHtml, renderMarkdown } from "./render.ts";
import { loadReview } from "./review.ts";
import type { FileChange, Hunk } from "./diff.ts";
import { inventory, publicSurface, REGISTRY } from "./checks.ts";
import { Report, type Evidence } from "./report.ts";
import type { ModelCitation, ReviewRecord } from "./review.ts";
import { claimState, computeRoute, testFacts, trustFloor, type TrustEvent } from "./states.ts";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const MIN_QUOTE_CHARS = 8; // a shorter quote would be found almost anywhere

export type Policy = { version: string; trust: { cleanSpotChecksPerStep: number }; spotCheckShare: number; sheet: { maxFindingsShown: number } };
type ReadAt = (at: "head" | "base", path: string) => string | null;

export function resolveCitation(c: ModelCitation, readAt: ReadAt, commits: { base: string; head: string }) {
  const text = readAt(c.at, c.file);
  if (text === null) return { ok: false as const, reason: `${c.file} does not exist at ${c.at}` };
  const lines = text.split("\n");
  if (c.startLine < 1 || c.endLine < c.startLine || c.endLine > lines.length) return { ok: false as const, reason: `lines ${c.startLine}-${c.endLine} are outside ${c.file} (${lines.length} lines) at ${c.at}` };
  const q = norm(c.quote);
  if (q.length < MIN_QUOTE_CHARS) return { ok: false as const, reason: "quote too short to check" };
  if (!norm(lines.slice(c.startLine - 1, c.endLine).join("\n")).includes(q)) return { ok: false as const, reason: `quote not found at ${c.file}:${c.startLine}-${c.endLine} (${c.at})` };
  return { ok: true as const, citation: { path: c.file, commit: c.at === "head" ? commits.head : commits.base, startLine: c.startLine, endLine: c.endLine, quote: c.quote } };
}

export function assembleReport(i: {
  c: Case; p: Profile; policy: Policy; requirement: { title: string; body: string; retrievedAt: string | null };
  files: FileChange[]; hunks: Hunk[]; checks: { evidence: Evidence[]; notChecked: { what: string; reason: string }[] };
  review: ReviewRecord | null; readAt: ReadAt; confirmedBy: (quote: string, text: string) => string | null;
  trustEvents: TrustEvent[]; generatedAt: string; pipelineVersion: string;
}): Report {
  const { c, files, hunks } = i;
  const evidence = [...i.checks.evidence];
  const out = i.review?.status === "ok" ? i.review.output! : null;

  // ---- citation validation (check 9) ----
  const stats = { citations: 0, resolved: 0, dropped: [] as { where: string; reason: string; citation: unknown }[], invalidRefs: [] as { where: string; kind: string; ref: string }[] };
  const cite = (where: string, cs: ModelCitation[]) => cs.flatMap((ci) => {
    stats.citations++;
    const r = resolveCitation(ci, i.readAt, c);
    if (r.ok) { stats.resolved++; return [r.citation]; }
    stats.dropped.push({ where, reason: r.reason, citation: ci });
    return [];
  });
  const known = (where: string, kind: string, refs: string[], valid: Set<string>) =>
    [...new Set(refs)].filter((x) => valid.has(x) || (stats.invalidRefs.push({ where, kind, ref: x }), false));

  const reqText = norm(`${i.requirement.title}\n${i.requirement.body}`);
  const requirements = (out?.requirements ?? []).flatMap((q) => {
    stats.citations++;
    if (norm(q.quote).length >= MIN_QUOTE_CHARS && reqText.includes(norm(q.quote))) {
      stats.resolved++;
      return [{ ...q, confirmedBy: q.kind === "interpretation" ? i.confirmedBy(q.quote, q.text) : null }];
    }
    stats.dropped.push({ where: `requirement ${q.id}`, reason: "quote not found in the saved requirement", citation: q.quote });
    return [];
  });

  const reqIds = new Set(requirements.map((q) => q.id));
  const evIds = new Set(evidence.map((e) => e.id));
  const testNames = new Set(testFacts(evidence).keys());
  const hunkIds = new Set(hunks.map((h) => h.id));
  // the reviewer may name a repeated-pattern group instead of each of its identical hunks
  const groupHunks = new Map((((evidence.find((e) => e.check === "pattern-groups")?.details as any)?.groups ?? []) as { id: string; hunkIds: string[] }[]).map((g) => [g.id, g.hunkIds]));
  const hunkRefs = (where: string, ids: string[]) => known(where, "hunk", ids.flatMap((id) => groupHunks.get(id) ?? [id]), hunkIds);

  const claims = (out?.claims ?? []).map((cl) => {
    const citations = cite(`claim ${cl.id}`, cl.citations);
    const linked = {
      requirementIds: known(`claim ${cl.id}`, "requirement", cl.requirementIds, reqIds),
      evidenceIds: known(`claim ${cl.id}`, "evidence", cl.evidenceIds, evIds),
      testNames: known(`claim ${cl.id}`, "test", cl.testNames, testNames),
      hunkIds: hunkRefs(`claim ${cl.id}`, cl.hunkIds),
    };
    const s = claimState({ ...linked, citations: citations.length }, evidence);
    return { id: cl.id, statement: cl.statement, ...linked, citations, state: s.state, stateReason: s.reason };
  });

  // decisions raised by a named deterministic rule, then by the model
  const ps = evidence.find((e) => e.check === "public-surface")?.details as ReturnType<typeof publicSurface> | undefined;
  const ruleDecisions = [...Map.groupBy(ps?.hits ?? [], (h) => h.file)].map(([file, hits], n) => ({
    id: `P${n + 1}`,
    statement: `Public surface changed in ${file}: ${hits.slice(0, 5).map((h) => `${h.change} \`${h.text}\``).join("; ")}${hits.length > 5 ? `; and ${hits.length - 5} more` : ""}.`,
    whyHuman: "Public API and diagnostic IDs are permanent once released. Committing to them is an ownership choice no test can settle.",
    options: ["Keep as permanent public surface", "Make it non-public or remove it"],
    hunkIds: [...new Set(hits.map((h) => h.hunkId))], citations: [], raisedBy: { kind: "rule" as const, name: "public-surface" },
  }));
  const modelDecisions = (out?.decisions ?? []).map((d) => ({
    id: d.id, statement: d.statement, whyHuman: d.whyHuman, options: d.options,
    hunkIds: hunkRefs(`decision ${d.id}`, d.hunkIds), citations: cite(`decision ${d.id}`, d.citations),
    raisedBy: { kind: "model" as const, name: i.review!.model! },
  }));
  const decisions = [...ruleDecisions, ...modelDecisions];

  // a finding must stand on at least one resolved citation
  const findings = (out?.findings ?? []).flatMap((f) => {
    const citations = cite(`finding ${f.id}`, f.citations);
    return citations.length ? [{ id: f.id, statement: f.statement, status: "suspected" as const, citations, hunkIds: hunkRefs(`finding ${f.id}`, f.hunkIds) }] : [];
  });

  const covered = new Set([...claims, ...decisions].flatMap((x) => x.hunkIds));
  const unexplained = hunks.filter((h) => !covered.has(h.id)).map((h) => h.id);

  const cv = REGISTRY.find((r) => r.check === "citation-validation")!;
  evidence.push({
    id: "citation-validation", check: "citation-validation", domain: cv.domain, asserts: cv.asserts,
    performedBy: `reviewproof ${i.pipelineVersion} (in-process)`, commands: [`node src/cli.ts assemble ${c.id}`], commits: [c.base, c.head],
    ...(out ? {
      status: stats.dropped.length ? "failed" as const : "passed" as const,
      summary: `${stats.resolved} of ${stats.citations} citations resolved; ${stats.dropped.length} dropped as unresolvable; ${stats.invalidRefs.length} reference(s) to unknown requirements, evidence, tests or hunks dropped.`,
    } : { status: "not_run" as const, reason: "no valid reviewer output", summary: "Nothing to validate." }),
    durationMs: 0, logs: i.review?.rawResponse ? [i.review.rawResponse] : [], details: stats,
  });

  // areas touched and their trust floors
  const areaOf = (path: string) => i.p.areas.find((a) => a.paths.some((r) => new RegExp(r).test(path)));
  const areas = [...new Set(files.map((f) => areaOf(f.path)).filter((a) => !!a))].map((a) => {
    const t = trustFloor(i.trustEvents.filter((e) => e.area === a.name), i.policy.trust.cleanSpotChecksPerStep);
    return { area: a.name, owner: a.owner, floor: t.floor, reason: `Area \`${a.name}\` ${t.reason}` };
  });

  const route = computeRoute({
    reportId: `${c.id}@${c.head}`, reviewerOk: !!out, requirements, claims, decisions, findings, unexplained,
    evidence, hunks, areas, spotCheckShare: i.policy.spotCheckShare,
  });

  const notChecked = [
    ...i.checks.notChecked,
    ...evidence.filter((e) => e.status === "not_run" || e.status === "inconclusive").map((e) => ({ what: e.id, reason: e.reason ?? e.summary })),
    ...(out ? [] : [{ what: "requirements, claims, model-raised decisions and findings", reason: `AI reviewer ${i.review?.status ?? "did not run"}${i.review?.reason ? `: ${i.review.reason}` : ""}` }]),
    ...claims.filter((cl) => cl.state === "not_checked").map((cl) => ({ what: `claim ${cl.id}: ${cl.statement}`, reason: cl.stateReason })),
    ...(out?.cannotDecide ?? []).map((x) => ({ what: x.item, reason: `the AI reviewer could not decide: ${x.reason}` })),
    { what: "absence of new vulnerabilities", reason: "cannot be proven by any check here; the security surface scan only finds patterns. Always a human judgement." },
  ];

  return Report.parse({
    schemaVersion: 1,
    case: {
      id: c.id, requirementId: c.requirement.id, requirementUrl: c.requirement.url ?? null, requirementRetrievedAt: i.requirement.retrievedAt,
      title: i.requirement.title, repository: c.repository, profile: i.p.name, base: c.base, head: c.head,
      generatedAt: i.generatedAt, pipelineVersion: i.pipelineVersion, policyVersion: i.policy.version,
      model: i.review?.model ?? null, promptHash: i.review?.promptHash ?? null, synthetic: c.synthetic ?? null,
    },
    reviewer: { status: i.review?.status ?? "unavailable", ...(i.review?.reason ? { reason: i.review.reason } : !i.review ? { reason: "the review stage has not run" } : {}), rawResponse: i.review?.rawResponse ?? null, fullFilesShown: i.review?.fullFiles ?? [], represented: i.review?.represented ?? [] },
    requirements,
    inventory: { files, totals: inventory(files).totals },
    hunks, evidence, claims, decisions, unexplained, findings, notChecked, route,
  });
}

/** What one confirmation covers: this reading of this quote. */
export const confirmationKey = (quote: string, text: string) => `${norm(quote)}\n${norm(text)}`;

export const TRUST_LOG = join(DATA, "trust", "events.jsonl"); // the real record: append-only, never simulated
export const readJsonl = (f: string) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const records = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => readJson(join(dir, f))) : []);
export const signoffsOf = (id: string) => records(join(caseDir(id), "signoffs"));

/** Reads everything a report depends on, assembles it, and writes report.json, sheet.html and sheet.md. */
export function assembleCase(c: Case, p: Profile): Report {
  const dir = caseDir(c.id);
  const { files, hunks } = readJson(join(dir, "ingest.json"));
  const repo = ensureClone(c.repository, [c.base, c.head]);
  const policy: Policy = readJson(join(ROOT, "policy.json"));
  // a confirmation covers one reading of one quote: a reworded reading, or another reading of the same words, needs its own
  const key = confirmationKey;
  const confirmed = new Map(records(join(dir, "confirmations")).map((x) => [key(x.quote, x.text), x.confirmedBy as string]));
  const report = assembleReport({
    c, p, policy, requirement: readJson(join(dir, "requirement.json")), files, hunks,
    checks: readJson(join(dir, "check.json")), review: loadReview(c.id),
    readAt: (at, path) => readAt(repo, at === "head" ? c.head : c.base, path),
    confirmedBy: (quote, text) => confirmed.get(key(quote, text)) ?? null,
    trustEvents: readJsonl(TRUST_LOG), generatedAt: new Date().toISOString(), pipelineVersion: PIPELINE_VERSION,
  });
  writeJson(join(dir, "report.json"), report);
  writeFileSync(join(dir, "sheet.html"), renderHtml(report, (x) => relative(dir, join(ROOT, x)), policy.sheet.maxFindingsShown));
  writeFileSync(join(dir, "sheet.md"), renderMarkdown(report, "sheet.html", policy.sheet.maxFindingsShown));
  return report;
}
