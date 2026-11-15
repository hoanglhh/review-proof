// Separate environment-repair evaluation; never writes the original protocol or human records.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ROOT, PIPELINE_VERSION, readJson, writeJson, type Case, type Profile } from '../src/config.ts';
import { ensureClone, ensureWorktree, git, listFiles, overlayWorktree, readAt } from '../src/git.ts';
import { classify, diffArgs, parseDiff } from '../src/diff.ts';
import { inventory, issueReproduction, patternGroups, publicSurface, REGISTRY, securitySurface, testEvidence, testProjects } from '../src/checks.ts';
import { runTests, type Run } from '../src/runner.ts';
import { buildPrompt, runReview } from '../src/review.ts';
import { assembleReport } from '../src/assemble.ts';
import { renderHtml, renderMarkdown } from '../src/render.ts';
import type { Evidence } from '../src/report.ts';

const dir = join(ROOT, 'data/evaluation-v2/control');
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const protocol = readJson(join(dir, 'protocol.json'));
assert.equal(hash(readFileSync(join(dir, 'protocol.json'))), readFileSync(join(dir, 'protocol.sha256'), 'utf8').split(' ')[0]);
for (const [path, expected] of Object.entries(protocol.inputHashes)) assert.equal(hash(readFileSync(join(ROOT, path))), expected, `Frozen input changed: ${path}`);
assert.equal(protocol.candidate.pr, 2279);
assert.equal(protocol.sdk.sdk.version, '10.0.300');
if (process.argv.includes('--self-check')) {
  assert.equal(protocol.attemptRules.modelCalls, 1);
  assert.equal(protocol.attemptRules.headRunsPerProject, 1);
  assert.ok(!existsSync(join(dir, 'protocol.json.tmp')));
  console.log('Control v2 protocol and frozen input checks passed.');
  process.exit(0);
}
assert.ok(!existsSync(join(dir, 'started.json')), 'Control v2 is one-shot; inspect saved artifacts instead of rerunning.');
writeJson(join(dir, 'started.json'), { startedAt: new Date().toISOString(), scriptHash: hash(readFileSync(import.meta.filename)) });
const c: Case = { id: 'control-v2-2279', profile: 'control-v2-messagepack-csharp', repository: 'https://github.com/MessagePack-CSharp/MessagePack-CSharp.git', base: protocol.candidate.base, head: protocol.candidate.head, requirement: { id: '2180', url: 'https://github.com/MessagePack-CSharp/MessagePack-CSharp/issues/2180' }, cohort: 'control' };
const runs: Run[] = [];
const summary: any = { cohort: 'control', protocol: 'data/evaluation-v2/control/protocol.json', caseId: c.id, status: 'not_run', rawCounts: null, route: null, humanFalsePositiveLabels: 'pending', cleanAssumption: protocol.cleanAssumption };
try {
  const image = JSON.parse(execFileSync('docker', ['image', 'inspect', protocol.imageTag], { encoding: 'utf8' }))[0];
  const digest = image.RepoDigests.find((x: string) => x.startsWith('mcr.microsoft.com/dotnet/sdk@sha256:'));
  assert.ok(digest, 'No immutable Microsoft SDK image digest found');
  const sdk = execFileSync('docker', ['run', '--rm', '--network', 'none', digest, 'dotnet', '--list-sdks'], { encoding: 'utf8', timeout: 60000 });
  writeFileSync(join(dir, 'sdk-inspection.log'), sdk);
  assert.match(sdk, /^10\.0\.300 /m, 'Exact required SDK is unavailable');
  writeJson(join(dir, 'environment.json'), { inspectedAt: new Date().toISOString(), tag: protocol.imageTag, digest, imageId: image.Id, sdk });
  const p: Profile = readJson(join(ROOT, 'profiles/messagepack-csharp.json'));
  p.name = c.profile;
  p.container.image = digest;
  writeJson(join(dir, 'profile.json'), p);
  const repo = ensureClone(c.repository, [c.base, c.head]);
  assert.equal(git(repo, ['rev-parse', `${c.head}^`]).trim(), c.base);
  for (const at of ['base', 'head'] as const) assert.equal(JSON.parse(readAt(repo, c[at], 'global.json')!).sdk.version, '10.0.300');
  const headFiles = listFiles(repo, c.head), baseFiles = new Set(listFiles(repo, c.base));
  const args = diffArgs(c.base, c.head);
  const { files, hunks } = parseDiff(git(repo, args.names), git(repo, args.patch), path => classify(path, p.classify, q => headFiles.includes(q)));
  writeJson(join(dir, 'ingest.json'), { case: c, files, hunks });
  const issue = readJson(join(dir, 'inputs/control-issue.json'));
  const requirement = { id: '2180', title: issue.title, body: issue.body, retrievedAt: null };
  writeJson(join(dir, 'requirement.json'), requirement);
  const evidence: Evidence[] = [];
  const stat = (check: string, status: Evidence['status'], summary: string, details: unknown, reason?: string) => {
    const registry = REGISTRY.find(r => r.check === check)!;
    evidence.push({ id: check, check, domain: registry.domain, asserts: registry.asserts, performedBy: `reviewproof ${PIPELINE_VERSION} (static check, in-process)`, commands: ['node scripts/control-v2.ts'], commits: [c.base, c.head], status, summary, details, ...(reason ? { reason } : {}), durationMs: 0, logs: [] });
  };
  const inv = inventory(files);
  stat('inventory', inv.unclassified.length ? 'failed' : 'passed', `${inv.totals.files} files, +${inv.totals.added}/-${inv.totals.removed}: ` + Object.entries(inv.totals.byClass).map(([k,v]) => `${v.files} ${k} (${v.lines} lines)`).join(', ') + '.', inv);
  const pg = patternGroups(files, hunks, p.repetitiveClasses);
  stat('pattern-groups', !pg.eligibleFiles ? 'not_run' : pg.deviating.length ? 'failed' : 'passed', !pg.eligibleFiles ? 'No repetitive files changed.' : !pg.groups.length ? `No change recurs in 3 or more of the ${pg.eligibleFiles} repetitive files; nothing to group.` : `${pg.groups.map(g => `${g.id}: ${g.hunks} identical hunks in ${g.files} files`).join('; ')}. ${pg.deviating.length} file(s) deviate.`, pg, !pg.eligibleFiles ? `no changed files of class ${p.repetitiveClasses.join(' or ')}` : undefined);
  const ps = publicSurface(files, hunks, p.publicSurface);
  stat('public-surface', ps.hits.length ? 'failed' : 'passed', ps.hits.length ? `${ps.hits.length} public-surface line(s) changed in ${new Set(ps.hits.map(h => h.file)).size} file(s).` : 'No public declaration, API file entry or diagnostic ID changed.', ps);
  const tp = testProjects(files, headFiles, p.tests);
  assert.ok(tp.projects.size, 'No affected test projects');
  assert.equal(tp.orphans.length, 0, 'Orphan changed test files');
  const perform = async (at: string, project: string, worktree: string, sourceCommit: string, testsCommit: string) => {
    const name = `${at}.${basename(project).replace(/\.[^.]+$/, '')}`;
    console.log(`Running ${name}`);
    const run = await runTests({ profile: p, project, name, outDir: join(dir, 'runs'), worktree, sourceCommit, testsCommit });
    writeJson(join(dir, 'runs', `${name}.json`), run);
    runs.push(run);
    console.log(`${name}: ${run.status}, exit ${run.exitCode}, ${run.tests.length} tests`);
    return run;
  };
  for (const [project] of tp.projects) {
    const head = await perform('head', project, ensureWorktree(repo, `${c.id}-head`, c.head), c.head, c.head);
    assert.ok(head.status === 'completed' && head.exitCode === 0 && !head.tests.some(t => t.outcome === 'failed'), `Head qualification blocked: ${head.reason ?? `exit ${head.exitCode}`}`);
    assert.ok(baseFiles.has(project), 'Test project missing at base');
    const base = await perform('base', project, ensureWorktree(repo, `${c.id}-base`, c.base), c.base, c.base);
    const without = await perform('without-change', project, overlayWorktree(repo, `${c.id}-without`, c.base, c.head, tp.testFiles), c.base, c.head);
    evidence.push(...testEvidence(basename(project).replace(/\.[^.]+$/, ''), head, base, without, false));
  }
  const repro = issueReproduction(requirement.body, files, hunks, p.tests.paths), found = repro.filter(b => b.foundIn.length);
  stat('issue-reproduction', !repro.length ? 'not_run' : found.length ? 'passed' : 'failed', !repro.length ? 'The requirement contains no code blocks.' : `${found.length} of ${repro.length} code blocks in the requirement appear (ignoring whitespace) in added test lines` + (found.length ? `: ${found.map(b => `block ${b.block} in ${b.foundIn.join(', ')}`).join('; ')}.` : '.'), { blocks: repro }, !repro.length ? 'the requirement contains no code blocks' : undefined);
  const sec = securitySurface(files, hunks, p.securitySurface), secHit = sec.hits.length > 0 || sec.buildConfigFiles.length > 0;
  stat('security-surface', secHit ? 'failed' : 'passed', secHit ? `${sec.buildConfigFiles.length} build/dependency file(s) changed; ${sec.hits.length} added line(s) match security-sensitive patterns.` : 'Pattern scan found nothing; this is not proof that no vulnerability exists.', sec);
  const checks = { evidence, notChecked: [] };
  writeJson(join(dir, 'check.json'), checks);
  const prompt = buildPrompt({ requirement, base: c.base, head: c.head, files, hunks, evidence, readHead: path => readAt(repo, c.head, path) });
  writeJson(join(dir, 'prompt.json'), prompt);
  writeJson(join(dir, 'review-attempt.json'), { requestedAt: new Date().toISOString(), maximumCalls: 1 });
  const review = await runReview(c.id, prompt, false);
  writeJson(join(dir, 'review.json'), review);
  if (review.rawResponse) copyFileSync(join(ROOT, review.rawResponse), join(dir, 'raw-response.json'));
  const report = assembleReport({ c, p, policy: readJson(join(ROOT, 'policy.json')), requirement, files, hunks, checks, review, readAt: (at,path) => readAt(repo,c[at],path), confirmedBy: () => null, trustEvents: [], generatedAt: new Date().toISOString(), pipelineVersion: PIPELINE_VERSION });
  writeJson(join(dir, 'report.json'), report);
  writeFileSync(join(dir, 'sheet.html'), renderHtml(report));
  writeFileSync(join(dir, 'sheet.md'), renderMarkdown(report));
  Object.assign(summary, { status: review.status === 'ok' ? 'reviewed' : 'review_unavailable', rawCounts: { findings: review.output?.findings.length ?? null, validatedFindings: report.findings.length, modelDecisions: review.output?.decisions.length ?? null, unexplainedHunks: report.unexplained.length, brokenClaims: report.claims.filter(cl => cl.state === 'broken').length }, route: report.route, reviewerStatus: review.status });
} catch (error) {
  summary.status = 'blocked';
  summary.reason = String(error);
  process.exitCode = 1;
} finally {
  writeJson(join(dir, 'summary.json'), { ...summary, completedAt: new Date().toISOString(), runs: runs.map(r => ({ name: r.name, status: r.status, exitCode: r.exitCode, tests: r.tests.length, outcomes: Object.fromEntries([...Map.groupBy(r.tests, t => t.outcome)].map(([k,v]) => [k,v.length])), reason: r.reason, log: r.log, results: r.results })) });
  console.log(JSON.stringify({ status: summary.status, reason: summary.reason, rawCounts: summary.rawCounts }));
}
