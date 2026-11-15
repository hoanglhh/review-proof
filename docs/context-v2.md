# Opt-in expanded context follow-up

This separate reviewer experiment reuses the frozen `buildPrompt`, `runReview`, output schema, citation validator, state rules and `assembleReport`. It does not change the original CLI, case artifacts, routing policy, metrics, sign-offs, confirmations or trust events. It accepts only unplanted cases explicitly marked `sample`; holdout, control, unclassified and planted cases are refused before their saved artifacts are read. It never reads a scoring key.

From the repository root, prepare the supplied sample without calling the model:

```sh
node src/review-v2.ts 2283 --prepare
```

Inspect `data/followup-v2/2283/prompt.json` and `manifest.json`. The prompt includes only the first 20 omitted paths plus the total omitted count; the separate manifest preserves all omissions. To explicitly run the model using the existing local configuration:

```sh
node src/review-v2.ts 2283 --run
```

The model result, validated `report.json`, `sheet.html` and `sheet.md` are written only under `data/followup-v2/2283/`. Existing test evidence is reused; no tests are rerun by this CLI. Existing human confirmations/trust may be read by assembly, but none are written. The separate sheet has no sign-off-server registration.

The frozen model wrapper writes its hash-addressed raw responses under `data/cases/followup-v2-2283/review/`. This reserved directory contains no `report.json` and therefore is excluded by the legacy metrics loader. The CLI refuses a collision with an actual registered case or report at that reserved ID. The original `data/cases/2283/` artifacts remain untouched. Repeating `--run` reuses successful responses with the same prompt/model/schema hash; it can replace this experiment's own report. Once a review or report exists, preparation refuses to replace its saved prompt with different content. Never move the follow-up report into `data/cases/` or include it in the frozen evaluation aggregates.

## Retrieval and limits

The collector enumerates pinned base/head Git trees and reads regular source/template blobs whose object IDs are identical at both commits. It never reads uncommitted worktree source, follows symlinks, executes repository scripts or accepts model-selected commands. Changed files remain the legacy prompt's responsibility.

Filename stems identify possible generated-source/template counterparts (for example `Widget.g.cs` and `Widget.tt`). Bounded PascalCase tokens from up to 40 changed head files identify lexical type/interface references, callers, generators and tests. Same-stem counterparts rank first, then tests, then remaining matching paths in lexical order. Every selection records its reason. These are candidates, not verified call edges: a token in a comment also matches. No AST or call graph is available in this fallback, and naming differences, lowercase symbols, indirect calls and dynamic dispatch may be missed.

Defaults: scan up to 2,000 unchanged eligible files, skip blobs above 256,000 bytes, use up to 80 seed symbols, select up to 12 files, show at most 300 lines per file and 2,000 lines total, and cap encoded source listings at about 100,000 characters including line-number allowance. These limits cover added source listings, not the original prompt or the manifest. The manifest lists omitted eligible paths/reasons and scan counts; non-source extensions, symlinks, submodules and changed blobs are excluded by eligibility. A selected file may be a prefix: its manifest includes shown lines, total lines and truncation. A triggering reference can be beyond that prefix. This does not establish complete context or complete test coverage.

Added listings have real head line numbers and untrusted blocks. XML delimiters in those listings are escaped; the system prompt instructs the reviewer to decode entities for verbatim citations. Validation still resolves citations against the actual pinned source. The system also requests exactly one behavior per claim and the actual assertion scope of linked tests, retaining the existing schema. Retrieved test code is not new execution evidence; passing test names do not prove all behavior in a change.

Synthetic Git fixtures in `test/context-v2.test.ts` verify unchanged template, interface, caller and test retrieval; pinned reads despite a dirty worktree; bounded/truncated output; delimiter escaping; refusal of non-sample inputs; and preservation of original saved artifacts and the legacy prompt. This is an opt-in follow-up, not a rerun or retuning of the holdout evaluation.
