import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../src/git.ts";
import { classify, diffArgs, parseDiff } from "../src/diff.ts";

const rules = [
  { class: "snapshot", pattern: "^t/Resources/" },
  { class: "test", pattern: "^t/" },
  { class: "template", pattern: "\\.tt$" },
  { class: "template-output", siblingExtension: ".tt" },
  { class: "source", pattern: "\\.cs$" },
];

test("classify: first matching rule wins; sibling rule needs the sibling to exist", () => {
  const exists = (p: string) => p === "src/A.tt";
  assert.equal(classify("t/Resources/x.cs", rules, exists), "snapshot");
  assert.equal(classify("t/x.tt", rules, exists), "test");
  assert.equal(classify("src/A.tt", rules, exists), "template");
  assert.equal(classify("src/A.cs", rules, exists), "template-output");
  assert.equal(classify("src/B.cs", rules, exists), "source");
  assert.equal(classify("README", rules, exists), "unclassified");
});

test("parseDiff reads real git output: added, modified, deleted, binary, odd file names", () => {
  const dir = mkdtempSync(join(tmpdir(), "rp-diff-"));
  try {
    const g = (...a: string[]) => git(dir, a);
    g("init", "-q"); g("config", "user.email", "t@example.invalid"); g("config", "user.name", "t");
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/A.cs"), "a\nb\nc\nd\ne\n");
    writeFileSync(join(dir, "gone.txt"), "x\ny\n");
    writeFileSync(join(dir, "img.bin"), Buffer.from([0, 1, 2]));
    g("add", "."); g("commit", "-qm", "base");
    const base = g("rev-parse", "HEAD").trim();
    writeFileSync(join(dir, "src/A.cs"), "a\nB\nc\nd\ne\nf\n");
    rmSync(join(dir, "gone.txt"));
    writeFileSync(join(dir, "img.bin"), Buffer.from([0, 9, 9]));
    writeFileSync(join(dir, "Weird name `1 \"q\".cs"), "new\n");
    g("add", "-A"); g("commit", "-qm", "head");
    const head = g("rev-parse", "HEAD").trim();

    const a = diffArgs(base, head);
    const { files, hunks } = parseDiff(g(...a.names), g(...a.patch), () => "x");
    const by = Object.fromEntries(files.map((f) => [f.path, f]));
    assert.deepEqual(Object.keys(by).sort(), ["Weird name `1 \"q\".cs", "gone.txt", "img.bin", "src/A.cs"]);
    assert.equal(by["Weird name `1 \"q\".cs"].status, "added");
    assert.equal(by["gone.txt"].status, "deleted");
    assert.equal(by["gone.txt"].removed, 2);
    assert.equal(by["img.bin"].binary, true);
    assert.deepEqual([by["src/A.cs"].added, by["src/A.cs"].removed, by["src/A.cs"].hunkIds.length], [2, 1, 2]);
    const [h1, h2] = by["src/A.cs"].hunkIds.map((id) => hunks.find((h) => h.id === id)!);
    assert.deepEqual([h1.oldStart, h1.newStart, h1.removed, h1.added], [2, 2, ["b"], ["B"]]);
    assert.deepEqual([h2.newStart, h2.newLines, h2.added], [6, 1, ["f"]]);
    assert.deepEqual(hunks.map((h) => h.id), hunks.map((_, i) => `H${i + 1}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
