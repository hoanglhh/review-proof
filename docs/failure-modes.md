# Failure modes observed

Only failures actually observed while building and running ReviewProof, each with a pointer to its evidence.

## 1. The test tool reports a build failure when only tests failed (2026-11-14)

- **What happened:** the run of #2283's tests on the base source with the head's test file built successfully and ran all 170 tests (3 failed, 167 passed). The tool still printed `Build FAILED.` and exited with code 1.
- **Why it matters:** a runner that read the exit code or the log text would have recorded "build broken, nothing ran", and the three discriminating tests (the evidence that the fix works) would have been lost as `inconclusive`.
- **What we do:** pass/fail is decided per test from the TRX file only; no result file means `inconclusive`.
- **Evidence:** `data/cases/2283/runs/without-change.MessagePack.SourceGenerator.Tests.log` lines 305 and 307; `exitCode: 1` with 170 parsed results in `data/cases/2283/runs/without-change.MessagePack.SourceGenerator.Tests.json`.

## 2. Test output reached the reviewer cut short (2026-11-14)

- **What happened:** in the first prompt for #2283, failure output from the base-source run was trimmed so hard that the diagnostics after the crash were lost. Stored messages were capped at 4,000 characters (CS8785 sat at character 7,821), and the 12-line trim was used up by stack frames. The reviewer could not see from the evidence that base also reported `MsgPack004` for one test.
- **Why it matters:** the reviewer can only raise what the evidence shows; silently trimmed evidence hides exactly the side effects a reviewer should notice.
- **What we do:** cap raised to 20,000 characters, stack frames dropped, up to 30 lines kept (prompt v2). Found by reading the built prompt, not by comparing outputs.
- **Evidence:** prompt v1 and its response in `data/cases/2283/review/5781b687….json`; v2 in `data/cases/2283/review/7e32fa48….json`; decision log entry "Evidence trimming fix".

## 3. Wrong status: claims marked proven by a test they did not name (2026-11-14)

- **What happened:** the first assembly of #2283 from prompt v2 marked all five claims `proven`, each "because" the same test, `ClosedGenericRecordStruct_FromMetadataReference`. The claims linked the whole `tests-without-change` record, and the state code credited any discriminating test in a linked record to the claim.
- **Why it matters:** a claim could be `proven` by a run that never touched it. That is confidence without evidence, the thing the challenge rejects.
- **What we do:** only tests a claim names count toward its state. Linking a whole record proves nothing (unit test "linking a whole test record proves nothing"). After the fix each claim cites its own discriminating test. In this case the five states stayed `proven`, because each claim also named a discriminating test of its own; the reasons were wrong, not the states. With other model output the states would have been wrong too.
- **Evidence:** `data/cases/2283/review/7e32fa48….json` (claims list `evidenceIds` for the whole record); `src/states.ts` `claimState`.

## 4. Limit: "proven" covers the named test, not the claim's wording (2026-11-14)

- **What happened:** #2283 claim C5 says location-less diagnostics and diagnostics rooted in other trees are dropped. It is `proven` by a test that shows one diagnostic with an external location being dropped. No run here shows the location-less case.
- **Why it matters:** the state is computed honestly from the link, but the model chooses the link and words the claim. A broadly worded claim can borrow a narrow test.
- **What we do now:** nothing automatic. The sheet shows the named test next to every proven claim so the owner can see the scope. The behaviour itself is raised as a decision (D1) for the owner.
- **Evidence:** `data/cases/2283/report.json`, claim C5.

## 5. The execution-test projects do not build in the container, even at base (2026-11-14)

- **What happened:** `tests/MessagePack.SourceGenerator.ExecutionTests` and `tests/MessagePack.SourceGenerator.MapModeExecutionTests` fail to build in `mcr.microsoft.com/dotnet/sdk:8.0.402-jammy` at the base commit as well as at the heads of #2234 and #2129: `error CS0117: 'MyGeneratedCompositeResolver' does not contain a definition for 'Instance'`, meaning the source generator's output is missing from the build.
- **Why it matters:** the runner first recorded these as `inconclusive`, which reads as "something about this change is unclear". It is an environment limit that says nothing about the change. The tests that #2234 and #2129 added there are not checked at all.
- **What we do:** a test project that does not build even at base is recorded as `not_run` for all three test checks, with the build error as the reason (unit test "a project that does not build even at base is not_run"). Claims that rely only on those tests stay `argued` or `not_checked`. Why the generator does not run in this build was not investigated.
- **Evidence:** `data/cases/2234/runs/base.MessagePack.SourceGenerator.ExecutionTests.log`, `data/cases/2129/runs/head.MessagePack.SourceGenerator.ExecutionTests.log`.

## 6. Wrong status: a claim proven by an unrelated old test (2026-11-14)

- **What happened:** on #2234 the reviewer linked claim C7 ("SuppressSourceGeneration prevents an ObjectSerializationInfo and generated-resolver formatter for the suppressed type itself") to the pre-existing test `GenerationTests.ExcludeFormatterFromSourceGeneratedResolver`. That test is about a different attribute on a custom formatter. It passes at base and head, and the state rule at the time counted "a passing pre-existing test that covers it" as `proven`.
- **Why it matters:** a claim was marked proven by a run that never touched it. The model chose the link, so "covers it" was the model's word, and nothing the model says is evidence. This was the risk noted in the decision log on day one.
- **What we do:** a linked pre-existing test now makes a claim `argued`, with the reason "it was not shown able to fail for this claim". Only a test that fails without the change and passes with it makes a claim `proven`. Unit test updated. Re-assembling showed C7 still `proven`, now through the linked `existing-tests` record, the same mistake one level up; whole records can no longer prove a claim either (decision log, same day).
- **Evidence:** `data/cases/2234/review/e9ac08bc….json` (claim C7 and its `testNames`); `tests/MessagePack.SourceGenerator.Tests/GenerationTests.cs` at head `9007cee1`.

## 7. Planted bug missed: a template source changed without its generated output (2026-11-14, synthetic)

- **What happened:** the planted bug `template-source-drift` removes the agent's edit to `UnionTemplate.tt` (#2297) and leaves the checked-in `UnionTemplate.cs` as it was. Tests run the `.cs`, so every test still passes: no run can catch it. The calibration scorer marked it **missed**: its rule, written before the run, counts a model catch only when a finding or decision points at the planted location, `UnionTemplate.tt` lines 7 to 13.
- **What the reviewer actually said:** finding F1, "The union formatter decoration is present in checked-in UnionTemplate.cs, but the supplied diff has no corresponding UnionTemplate.tt change", cited at `UnionTemplate.cs` line 30; and, among the questions it could not decide, "Would regenerating UnionTemplate.cs from UnionTemplate.tt preserve the new union attribute block?" A person reading the sheet would see the problem. The reviewer could not cite the `.tt`, because the plant took it out of the diff and only changed files are shown to it.
- **Why it matters:** two lessons. The scorer undercounts catches that point at a missing change rather than a present one. And the reviewer only sees changed files, so a bug made of a change *not* made is visible to it only by inference.
- **What we do:** the official count stays missed (1 of 8); the rule was not changed after seeing the result. The miss is written to the trust record (`planted_missed` for `generator-templates`). A check that compares each changed generated file with its template, which would catch this by a run, is not built.
- **Evidence:** `data/calibration/summary.json`; `data/calibration/template-source-drift/report.json` (F1 and "Not checked"); raw response in `data/calibration/template-source-drift/review/`.
