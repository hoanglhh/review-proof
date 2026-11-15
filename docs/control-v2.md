# Control v2: environment repair of PR2279

This is a separately versioned followup of the originally selected upstream MessagePack-CSharp PR2279. It is not a fresh most-recent selection and does not replace the three failed SDK attempts recorded in `data/evaluation/`. The original selection snapshot identifies the accepted squash merge `3df413b305e38afa4039f357f69cc07275df31c1` and first parent `781513b17086e9ac548428dfc83737793f094d30`.

The protocol was written and SHA-256 recorded before the image pull or new tests. `data/evaluation-v2/control/protocol.json` declares one exact-SDK image pull, one head/base/without-change run per affected project, and at most one original-prompt reviewer call. `started.json` pins the script that actually ran. `inputs/` preserves the original selection, PR, requirement and trusted upstream SDK config. Frozen module/profile/policy hashes are verified before execution.

The upstream `global.json` requires SDK 10.0.300 with patch roll-forward. The pulled Microsoft SDK image was resolved to the immutable digest recorded in `environment.json`, then verified by running `dotnet --list-sdks`. The original profile remains unchanged; `profile.json` is the versioned effective profile. The existing generic `runTests` runner and TRX parser perform and parse each actual run. No source edits, filtered tests, candidate replacement or result-driven retry are allowed by this protocol.

The control uses the original `buildPrompt`, `runReview`, checks and `assembleReport`, isolated from the expanded-context experiment. The only new model cache ID is `control-v2-2279`. Review inputs, raw response, evidence and report are saved under `data/evaluation-v2/control/`; the raw response cache also lives at `data/cases/control-v2-2279/review/`. It is absent from the global case manifest and legacy aggregates. Assembly supplies no human confirmations or trust events. All human false-positive labels remain pending.

`summary.json` is the machine-readable outcome, including parsed test counts, raw and validated finding counts, model decisions, unexplained hunks, broken claims and computed route. `report.json`, when present, is the complete validated report. These counts describe one upstream accepted change; they are not false-positive rates or correctness labels. “Clean” means merged and not known reverted in the original selection snapshot only. No refreshed revert search was performed.

The one original-prompt model review completed successfully. It emitted **4 findings** (all 4 retained after citation validation), **4 model decisions**, **1 unexplained hunk**, and **1 broken claim**. The computed route is **blocked**. These are raw/derived review counts; none has been labeled a human-confirmed false positive. In particular, the reviewer flags enabled `WRITE_EXPECTED` and generated snapshot drift, which require human review.

The actual TRX results are:

| Run | Passed | Failed | Skipped | Total | Exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Head | 160 | 0 | 9 | 169 | 0 |
| Base | 159 | 0 | 9 | 168 | 0 |
| Base source with head tests | 159 | 1 | 9 | 169 | 1 |

An independent Python standard-library XML parse confirms the three saved TRX counts (`trx-independent-check.json`).

The failing without-change test is `GenericsFormatterTests.NullableReferenceTypeInListFormatter`; its captured failure reports unexpected CS8669 diagnostics. It passes at head, providing a discriminating regression check for the requested warning fix.

One material limitation is visible in the upstream head: ``tests/MessagePack.SourceGenerator.Tests/Verifiers/CSharpSourceGeneratorVerifier`1+Test.cs`` defines `WRITE_EXPECTED` and enables `TestBehaviors.SkipGeneratedSourcesCheck`. The actual build warns about it. Passing head tests therefore do not establish that generated-source snapshots were compared. Any finding about this behavior needs human adjudication, not an automatic false-positive label.

To verify immutable inputs without rerunning the experiment:

```sh
node scripts/control-v2.ts --self-check
```

The actual run command was `node scripts/control-v2.ts`. Its `started.json` guard refuses a second evaluation execution. The image pull completed once; a subsequent shell-wrapper assignment failed because `status` is read-only in zsh. `image-acquisition.json` records that wrapper failure, and the independent image and SDK inspection establishes image availability.

The initial wrapper completed the model request and saved `report.json`, then failed while rendering because it omitted mandatory renderer arguments. `initial-summary-render-error.json` and `inputs/executed-script.ts` preserve that attempt; the latter matches `started.json`’s script hash. The rendering call was repaired, and sheets/summary were regenerated only from saved review/report data. `render-repair.json` records this presentation-only repair and its checks: zero new model calls and zero new test runs. `pipeline.log` intentionally retains the original rendering-error line; the final `summary.json` records the successful reviewed result.
