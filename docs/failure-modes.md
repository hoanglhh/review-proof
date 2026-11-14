# Failure modes observed

Only failures actually observed while building and running ReviewProof, each with a pointer to its evidence.

## 1. The test tool reports a build failure when only tests failed (2026-11-14)

- **What happened:** the run of #2283's tests on the base source with the head's test file built successfully and ran all 170 tests (3 failed, 167 passed). The tool still printed `Build FAILED.` and exited with code 1.
- **Why it matters:** a runner that read the exit code or the log text would have recorded "build broken, nothing ran", and the three discriminating tests (the evidence that the fix works) would have been lost as `inconclusive`.
- **What we do:** pass/fail is decided per test from the TRX file only; no result file means `inconclusive`.
- **Evidence:** `data/cases/2283/runs/without-change.MessagePack.SourceGenerator.Tests.log` lines 305 and 307; `exitCode: 1` with 170 parsed results in `data/cases/2283/runs/without-change.MessagePack.SourceGenerator.Tests.json`.
