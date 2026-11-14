// The scoring key in labels/ must never reach the reviewer. Checks every prompt that was actually sent
// (saved with its raw response) and that no pipeline code reads the labels directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const labelSentences = readdirSync(join(ROOT, "labels")).flatMap((f) =>
  readFileSync(join(ROOT, "labels", f), "utf8").split("\n").filter((l) => l.startsWith("- "))
    .flatMap((l) => l.slice(2).split(/(?<=\.)\s+/)).map((s) => s.trim()).filter((s) => s.length >= 30))
  // planted-bug labels are a scoring key too
  .concat(JSON.parse(readFileSync(join(ROOT, "calibration", "plants.json"), "utf8")).plants.flatMap((p: any) => [p.breaks, p.violates]));

test("labels exist and are non-trivial", () => assert.ok(labelSentences.length >= 15));

test("no label sentence appears in any prompt sent to the model", () => {
  const dirs = ["cases", "calibration"].map((d) => join(ROOT, "data", d)).filter(existsSync);
  const prompts = dirs.flatMap((dir) => readdirSync(dir).map((c) => join(dir, c))).flatMap((c) => {
    const d = join(c, "review");
    return existsSync(d) ? readdirSync(d).map((f) => readFileSync(join(d, f), "utf8")) : [];
  }).map((raw) => { const r = JSON.parse(raw); return `${r.request.system}\n${r.request.user}`; });
  const hits = prompts.flatMap((p) => labelSentences.filter((s) => p.includes(s)));
  assert.deepEqual(hits, []);
});

test("no pipeline code refers to the labels directory", () => {
  for (const f of readdirSync(join(ROOT, "src"))) assert.doesNotMatch(readFileSync(join(ROOT, "src", f), "utf8"), /labels/, f);
  assert.doesNotMatch(readFileSync(join(ROOT, "src", "review.ts"), "utf8"), /plants\.json|calibration/, "the reviewer must not read the planted-bug labels");
});
