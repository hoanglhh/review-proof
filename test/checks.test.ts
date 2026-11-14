// Synthetic inputs only: file names and test names here are invented for the unit tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { issueReproduction, patternGroups, publicSurface, securitySurface, testEvidence, testProjects } from "../src/checks.ts";
import type { FileChange, Hunk } from "../src/diff.ts";
import type { Run } from "../src/runner.ts";

function change(spec: Record<string, { class: string; hunks: [string[], string[], number?][] }>) {
  const files: FileChange[] = [];
  const hunks: Hunk[] = [];
  for (const [path, s] of Object.entries(spec)) {
    const ids = s.hunks.map(([removed, added, newStart = 10]) => {
      const h = { id: `H${hunks.length + 1}`, file: path, oldStart: newStart, oldLines: removed.length, newStart, newLines: added.length, removed, added };
      hunks.push(h);
      return h.id;
    });
    files.push({ path, status: "modified", class: s.class, binary: false, added: s.hunks.flatMap((h) => h[1]).length, removed: s.hunks.flatMap((h) => h[0]).length, hunkIds: ids });
  }
  return { files, hunks };
}

test("pattern groups: identical hunks in 3+ files form a group; a file with an extra hunk deviates", () => {
  const same: [string[], string[]] = [[], ["  [Attr]", "class X"]];
  const { files, hunks } = change({
    "s/a.g.cs": { class: "snap", hunks: [same] },
    "s/b.g.cs": { class: "snap", hunks: [[[], ["[Attr]", "  class   X"]]] }, // differs only in whitespace
    "s/c.g.cs": { class: "snap", hunks: [same, [["{"], ["", "{"]]] },
    "src/x.cs": { class: "source", hunks: [same] }, // not a repetitive class
  });
  const r = patternGroups(files, hunks, ["snap"]);
  assert.equal(r.groups.length, 1);
  assert.deepEqual([r.groups[0].hunks, r.groups[0].files], [3, 3]);
  assert.deepEqual(r.deviating, [{ file: "s/c.g.cs", hunkIds: ["H4"] }]);
});

test("pattern groups: no group means no deviations are claimed", () => {
  const { files, hunks } = change({ "s/a": { class: "snap", hunks: [[[], ["x"]]] }, "s/b": { class: "snap", hunks: [[[], ["y"]]] } });
  assert.deepEqual(patternGroups(files, hunks, ["snap"]), { eligibleFiles: 2, groups: [], deviating: [] });
});

const ps = {
  classes: ["source"], paths: "^src/", declaration: "^\\s*public\\s",
  apiFiles: "PublicAPI\\.txt$", diagnosticFiles: "Releases\\.(Shipped|Unshipped)\\.md$", diagnosticId: "^\\s*([A-Za-z]+[0-9]+)\\s*\\|",
};

test("public surface: declarations in source count, tests do not; a diagnostic ID moved between release files is not new", () => {
  const { files, hunks } = change({
    "src/A.cs": { class: "source", hunks: [[["    private int x;"], ["    public int X { get; }"]]] },
    "tests/T.cs": { class: "test", hunks: [[[], ["    public void Test() {}"]]] },
    "src/Releases.Unshipped.md": { class: "docs", hunks: [[["AB001 | Usage | Error | moved"], ["AB777 | Usage | Error | brand new"]]] },
    "src/Releases.Shipped.md": { class: "docs", hunks: [[[], ["AB001 | Usage | Error | moved"]]] },
    "src/PublicAPI.txt": { class: "docs", hunks: [[[], ["N.A.X.get -> int"]]] },
  });
  const { hits } = publicSurface(files, hunks, ps);
  assert.deepEqual(hits.map((h) => [h.kind, h.file]).sort(), [
    ["diagnostic-id", "src/Releases.Unshipped.md"],
    ["public-api-file", "src/PublicAPI.txt"],
    ["public-declaration", "src/A.cs"],
  ]);
  assert.match(hits.find((h) => h.kind === "diagnostic-id")!.text, /^AB777/);
});

test("security surface: patterns on added source lines only, with head line numbers; build files listed", () => {
  const ss = { classes: ["source"], patterns: [{ name: "process-execution", regex: "Process\\.Start" }, { name: "secret", regex: "api[_-]?key\\s*=\\s*\"", flags: "i" }] };
  const { files, hunks } = change({
    "src/A.cs": { class: "source", hunks: [[["Process.Start(old)"], ["var a = 1;", "Process.Start(x);", "var API_KEY = \"abcdef\";"], 40]] },
    "tests/T.cs": { class: "test", hunks: [[[], ["Process.Start(y);"]]] },
    "Build.props": { class: "build-config", hunks: [[[], ["<PackageReference Include=\"X\" />"]]] },
  });
  const r = securitySurface(files, hunks, ss);
  assert.deepEqual(r.hits.map((h) => [h.file, h.line, h.pattern]), [["src/A.cs", 41, "process-execution"], ["src/A.cs", 42, "secret"]]);
  assert.deepEqual(r.buildConfigFiles, ["Build.props"]);
});

test("issue reproduction: whitespace-insensitive match in added test lines only; short blocks are skipped", () => {
  const body = "Repro:\r\n\r\n```csharp\r\nusing A; using B;\r\nnamespace App;\r\npublic record Cmd(int Scope) { public Item<int> M { get; init; } }\r\n```\r\n\r\n```\r\ndotnet build\r\n```\r\n";
  const { files, hunks } = change({
    "tests/T.cs": { class: "test", hunks: [[[], ['string s = """', "using A;", "using B;", "namespace App;", "public record Cmd(int Scope)", "{", "    public Item<int> M { get; init; }", "}", '""";']]] },
    "src/A.cs": { class: "source", hunks: [[[], ["using A; using B; namespace App; public record Cmd(int Scope) { public Item<int> M { get; init; } }"]]] },
  });
  const r = issueReproduction(body, files, hunks, ["^tests/"]);
  assert.deepEqual(r.map((b) => b.foundIn), [["tests/T.cs"], []]);
  assert.ok(r[1].skipped);
});

test("test projects: nearest enclosing project file; files outside any project are orphans", () => {
  const { files } = change({
    "tests/P.Tests/Sub/T.cs": { class: "test", hunks: [] },
    "tests/P.Tests/Resources/x.txt": { class: "snap", hunks: [] },
    "tests/Lib/L.cs": { class: "test", hunks: [] },
    "src/A.cs": { class: "source", hunks: [] },
  });
  const r = testProjects(files, ["tests/P.Tests/P.Tests.csproj", "tests/Lib/Lib.csproj"], { paths: ["^tests/"], projectFile: "Tests\\.csproj$", command: [], filterArgs: [], resultFormat: "trx" });
  assert.deepEqual([...r.projects], [["tests/P.Tests/P.Tests.csproj", ["tests/P.Tests/Sub/T.cs", "tests/P.Tests/Resources/x.txt"]]]);
  assert.deepEqual(r.orphans, ["tests/Lib/L.cs"]);
  assert.equal(r.testFiles.length, 3);
});

const run = (status: Run["status"], tests: [string, "passed" | "failed"][], reason?: string): Run => ({
  name: "r", performedBy: "runner", command: "cmd", worktree: "w", sourceCommit: "a".repeat(40), testsCommit: "b".repeat(40), project: "p",
  startedAt: "", durationMs: 1, exitCode: 0, status, ...(reason ? { reason } : {}), log: "x.log", tests: tests.map(([name, outcome]) => ({ name, outcome, rawOutcome: "" })),
});
const byCheck = (ev: ReturnType<typeof testEvidence>) => Object.fromEntries(ev.map((e) => [e.check, e]));

test("tests: a new test that fails without the change is discriminating; one that passes anyway is named as not", () => {
  const head = run("completed", [["Old", "passed"], ["NewFix", "passed"], ["NewWeak", "passed"]]);
  const base = run("completed", [["Old", "passed"]]);
  const without = run("completed", [["Old", "passed"], ["NewFix", "failed"], ["NewWeak", "passed"]]);
  const e = byCheck(testEvidence("p", head, base, without, false));
  assert.equal(e["tests-at-head"].status, "passed");
  assert.deepEqual(e["tests-at-head"].tests!.map((t) => t.name), ["NewFix", "NewWeak"]);
  assert.equal(e["tests-without-change"].status, "failed");
  assert.deepEqual(e["tests-without-change"].tests!.map((t) => [t.name, t.discriminating]), [["NewFix", true], ["NewWeak", false]]);
  assert.match(e["tests-without-change"].summary, /Non-discriminating .*NewWeak/);
  assert.equal(e["existing-tests"].status, "passed");
});

test("tests: an existing test whose expected data changed counts as changed; regressions and removals are reported", () => {
  const head = run("completed", [["Snap", "passed"], ["Reg", "failed"]]);
  const base = run("completed", [["Snap", "passed"], ["Reg", "passed"], ["Gone", "passed"]]);
  const without = run("completed", [["Snap", "failed"], ["Reg", "passed"]]);
  const e = byCheck(testEvidence("p", head, base, without, false));
  assert.deepEqual(e["tests-at-head"].tests!.map((t) => t.name), ["Snap"]);
  assert.equal(e["tests-without-change"].status, "passed");
  assert.equal(e["existing-tests"].status, "failed");
  assert.deepEqual(e["existing-tests"].tests!.filter((t) => t.head !== "passed").map((t) => t.name), ["Reg"]);
  assert.deepEqual((e["existing-tests"].details as any).removedAtHead, ["Gone"]);
});

test("tests: an overlay that does not compile is inconclusive, never passed", () => {
  const head = run("completed", [["New", "passed"]]);
  const without = run("inconclusive", [], "no TRX file was produced (exit code 1); first build errors: CS0246");
  const e = byCheck(testEvidence("p", head, run("completed", []), without, false));
  assert.equal(e["tests-without-change"].status, "inconclusive");
  assert.match(e["tests-without-change"].reason!, /CS0246/);
  assert.equal(e["tests-at-head"].status, "passed");
});

test("tests: an unfinished head run makes every check not passed; a project absent at base has no existing tests", () => {
  const e = byCheck(testEvidence("p", run("inconclusive", [], "timed out"), run("completed", [["A", "passed"]]), run("completed", [["A", "passed"]]), false));
  for (const k of ["tests-at-head", "existing-tests"]) assert.equal(e[k].status, "inconclusive");
  assert.equal(e["tests-without-change"].status, "not_run");
  const n = byCheck(testEvidence("p", run("completed", [["N", "passed"]]), run("not_run", []), run("inconclusive", [], "build failed"), true));
  assert.deepEqual(n["tests-at-head"].tests!.map((t) => t.name), ["N"]);
  assert.equal(n["existing-tests"].status, "not_run");
});
