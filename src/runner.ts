// Runs a test project inside the repository's container. The agent's code is untrusted: it runs only here,
// as the host user, with only .work/ mounted (at the same absolute path, because git worktrees record
// absolute paths), no credentials in the environment, and a time limit.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, createWriteStream, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, WORK, type Profile } from "./config.ts";
import { parseTrx, type TestResult } from "./trx.ts";

/** Result parsers by the profile's `tests.resultFormat`, which is also the result file extension. */
const PARSERS: Record<string, (text: string) => TestResult[]> = { trx: parseTrx };

export type Run = {
  name: string;
  performedBy: string;
  command: string;
  worktree: string;
  sourceCommit: string;
  testsCommit: string;
  project: string;
  filter?: string;
  startedAt: string;
  durationMs: number;
  exitCode: number | null;
  status: "completed" | "inconclusive" | "not_run";
  reason?: string;
  log?: string;
  results?: string;
  tests: TestResult[];
};

const quote = (a: string) => (/^[\w@%+=:,./~-]+$/.test(a) ? a : `'${a.replaceAll("'", `'\\''`)}'`);

export async function runTests(o: {
  profile: Profile; worktree: string; project: string; filter?: string;
  name: string; outDir: string; sourceCommit: string; testsCommit: string;
}): Promise<Run> {
  const { container, tests } = o.profile;
  const parse = PARSERS[tests.resultFormat];
  if (!parse) throw new Error(`no result parser for format "${tests.resultFormat}"`);
  const resultsDir = join(WORK, "results", relative(ROOT, o.outDir).replaceAll("/", "_"), o.name);
  rmSync(resultsDir, { recursive: true, force: true });
  mkdirSync(resultsDir, { recursive: true });
  mkdirSync(o.outDir, { recursive: true });
  const sub = (s: string) => s.replaceAll("{work}", WORK).replaceAll("{project}", o.project)
    .replaceAll("{name}", o.name).replaceAll("{results}", resultsDir).replaceAll("{filter}", o.filter ?? "");
  const env = Object.entries(container.env).map(([k, v]) => [k, sub(v)]);
  for (const [, v] of env) if (v.startsWith(WORK + "/")) mkdirSync(v, { recursive: true });
  const inner = [...tests.command, ...(o.filter ? tests.filterArgs : [])].map(sub);
  const cname = `reviewproof-${process.pid}-${Date.now()}`;
  const args = [
    "run", "--rm", "--name", cname, "--user", `${process.getuid!()}:${process.getgid!()}`,
    ...env.flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    // the clones (with their .git config) are read-only inside the container
    "-v", `${WORK}:${WORK}`, "-v", `${join(WORK, "repos")}:${join(WORK, "repos")}:ro`, "-w", o.worktree, container.image, ...inner,
  ];
  const logPath = join(o.outDir, `${o.name}.log`);
  const base = {
    name: o.name, performedBy: `${inner.slice(0, 2).join(" ")} in container ${container.image}`,
    command: ["docker", ...args.filter((_, i) => args[i - 1] !== "--name" && args[i] !== "--name")].map(quote).join(" "),
    worktree: relative(ROOT, o.worktree), sourceCommit: o.sourceCommit, testsCommit: o.testsCommit,
    project: o.project, ...(o.filter ? { filter: o.filter } : {}), startedAt: new Date().toISOString(),
    log: relative(ROOT, logPath), tests: [] as TestResult[],
  };

  const t0 = Date.now();
  const log = createWriteStream(logPath);
  let timedOut = false;
  const exit = await new Promise<number | null | Error>((done) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    const timer = setTimeout(() => { timedOut = true; spawnSync("docker", ["kill", cname]); }, container.timeoutSeconds * 1000);
    child.on("error", (e) => { clearTimeout(timer); done(e); });
    child.on("close", (code) => { clearTimeout(timer); done(code); });
  });
  await new Promise((r) => log.end(r));
  const durationMs = Date.now() - t0;
  if (exit instanceof Error) return { ...base, durationMs, exitCode: null, status: "not_run", reason: `container could not start: ${exit.message}` };

  const ext = `.${tests.resultFormat}`;
  const found = readdirSync(resultsDir).filter((f) => f.endsWith(ext));
  const parsed = found.flatMap((f) => parse(readFileSync(join(resultsDir, f), "utf8")));
  let saved: string | undefined;
  if (found.length) {
    saved = join(o.outDir, `${o.name}${ext}`);
    copyFileSync(join(resultsDir, found[0]), saved); // shortcut: saves only the first result file; upgrade if a project multi-targets
    saved = relative(ROOT, saved);
  }
  const run = { ...base, durationMs, exitCode: exit, ...(saved ? { results: saved } : {}), tests: parsed };
  if (timedOut) return { ...run, status: "inconclusive", reason: `timed out after ${container.timeoutSeconds}s` };
  if (!found.length) {
    const errors = readFileSync(logPath, "utf8").split("\n").filter((l) => /: error [A-Z]*\d*:?/.test(l)).map((l) => l.trim());
    const uniq = [...new Set(errors)].slice(0, 3);
    return { ...run, status: "inconclusive", reason: `no ${tests.resultFormat} result file was produced (exit code ${exit})${uniq.length ? `; first build errors: ${uniq.join(" | ")}` : "; see log"}` };
  }
  if (!parsed.length) return { ...run, status: "inconclusive", reason: "the result file contains no test results" };
  return { ...run, status: "completed" };
}
