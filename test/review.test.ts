// Synthetic inputs only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "../src/review.ts";
import { assembleReport } from "../src/assemble.ts";

const hunk = (id: string, file: string, added: string[]) => ({ id, file, oldStart: 1, oldLines: 0, newStart: 1, newLines: added.length, removed: [], added });
const hunks = [hunk("H1", "s/a.g.cs", ["[Same]"]), hunk("H2", "s/b.g.cs", ["[Same]"]), hunk("H3", "s/c.g.cs", ["[Same]"]), hunk("H4", "s/c.g.cs", ["odd line"]), hunk("H5", "src/X.cs", ["real change"])];
const files = ["s/a.g.cs", "s/b.g.cs", "s/c.g.cs", "src/X.cs"].map((path) => ({
  path, status: "modified" as const, class: path.startsWith("s/") ? "snap" : "docs", binary: false, added: 1, removed: 0, hunkIds: hunks.filter((h) => h.file === path).map((h) => h.id),
}));
const groupsEvidence = {
  id: "pattern-groups", check: "pattern-groups", domain: "general" as const, asserts: "", performedBy: "", commands: [], commits: [], status: "failed" as const, summary: "", durationMs: 0, logs: [],
  details: { groups: [{ id: "G1", hunks: 3, files: 3, removed: [], added: ["[Same]"], hunkIds: ["H1", "H2", "H3"] }], deviating: [{ file: "s/c.g.cs", hunkIds: ["H4"] }] },
};

test("prompt: a repeated-pattern group is shown once by its exemplar; deviating hunks are all shown", () => {
  const p = buildPrompt({ requirement: { id: "#1", title: "t", body: "b" }, base: "a".repeat(40), head: "b".repeat(40), files, hunks, evidence: [groupsEvidence], readHead: () => null });
  assert.match(p.user, /### H1 /);
  assert.doesNotMatch(p.user, /### H2 |### H3 /);
  assert.match(p.user, /### H4 /);
  assert.match(p.user, /G1: 3 identical hunks in 3 files; exemplar H1/);
  assert.match(p.user, /and 1 more files whose only hunks belong to a repeated-pattern group/);
  assert.deepEqual(p.represented, [{ group: "G1", exemplar: "H1", hunks: 3, files: ["s/a.g.cs", "s/b.g.cs", "s/c.g.cs"] }]);
});

test("assemble: a group ID in the reviewer's hunkIds expands to every hunk of the group", () => {
  const sha = (c: string) => c.repeat(40);
  const r = assembleReport({
    c: { id: "x", profile: "p", repository: "r", base: sha("a"), head: sha("b"), requirement: { id: "#1", text: "Add the attribute everywhere please" } },
    p: { name: "p", areas: [] } as any,
    policy: { version: "v", trust: { cleanSpotChecksPerStep: 3 }, spotCheckShare: 0, sheet: { maxFindingsShown: 5 } },
    requirement: { title: "t", body: "Add the attribute everywhere please", retrievedAt: null }, files, hunks,
    checks: { evidence: [groupsEvidence], notChecked: [] },
    review: { status: "ok", model: "m", promptHash: "h", rawResponse: null, fullFiles: [], output: {
      requirements: [{ id: "R1", text: "add it", quote: "Add the attribute everywhere", kind: "explicit" }],
      claims: [{ id: "C1", statement: "added", requirementIds: ["R1"], evidenceIds: [], testNames: [], hunkIds: ["G1", "H4"], citations: [] }],
      decisions: [], findings: [], cannotDecide: [] } },
    readAt: () => null, confirmedBy: () => null, trustEvents: [], generatedAt: "now", pipelineVersion: "0",
  });
  assert.deepEqual(r.claims[0].hunkIds, ["H1", "H2", "H3", "H4"]);
  assert.deepEqual(r.unexplained, ["H5"]);
});

test("a confirmation covers one reading of one quote, not every reading of the same words", async () => {
  const { confirmationKey } = await import("../src/assemble.ts");
  const quote = "The analyzer does not work if SuppressSourceGeneration = true";
  assert.notEqual(confirmationKey(quote, "reading A"), confirmationKey(quote, "reading B"));
  assert.equal(confirmationKey(quote, "reading A"), confirmationKey(`  ${quote}\n`, "reading  A"));
});
