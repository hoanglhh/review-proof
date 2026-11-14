## ReviewProof sign-off sheet: \#2283 Generator and analyzer crash with IndexOutOfRangeException on a closed generic struct from a referenced assembly

> **SYNTHETIC:** Planted bug for calibration: security-file-write. This change contains a deliberately planted bug.

**Route: BLOCKED** (cannot be signed yet). Evidence supports: blocked. 

- `reviewer-missing` the AI reviewer output is missing or invalid

Read ratio: not applicable until unblocked (229 changed lines). Generated 2026-11-14T06:53:02.771Z, base `32258fdb` → head `43daf6ec`, policy 2026-11-14.1 (illustrative thresholds). Full sheet: sheet.html

### Requirement
- none

### What it touches
4 files, +226/−3: 2 docs (10 lines), 1 source (30 lines), 1 test (189 lines). Unexplained hunks: H1, H2, H3, H4, H5, H6, H7, H8, H9.

### Claims (states computed from evidence)
- none

### Checks
| Check | Status | Result |
| --- | --- | --- |
| `inventory` | passed | 4 files, +226/-3: 2 docs (10 lines), 1 source (30 lines), 1 test (189 lines). |
| `pattern-groups` | not_run | No repetitive files changed. (no changed files of class test-snapshot or template-output) |
| `public-surface` | passed | No public declaration, API file entry or diagnostic ID changed. |
| `tests-at-head:MessagePack.SourceGenerator.Tests` | inconclusive | The head run did not complete. (no trx result file was produced (exit code 1); first build errors: /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,9): error RS1035: The symbol 'File' is banned for use by analyzers: Do not do file IO in analyzers \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\] \| /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,61): error RS1035: The symbol 'Path.GetTempPath()' is banned for use by analyzers: Do not do file IO in analyzers \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\] \| /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,132): error RS1035: The symbol 'Environment' is banned for use by analyzers: Analyzers should not read their settings directly from environment variables \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\]) |
| `tests-without-change:MessagePack.SourceGenerator.Tests` | not_run | Nothing to compare. (the head run did not complete) |
| `existing-tests:MessagePack.SourceGenerator.Tests` | inconclusive | Pre-existing tests could not be compared. (head run: no trx result file was produced (exit code 1); first build errors: /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,9): error RS1035: The symbol 'File' is banned for use by analyzers: Do not do file IO in analyzers \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\] \| /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,61): error RS1035: The symbol 'Path.GetTempPath()' is banned for use by analyzers: Do not do file IO in analyzers \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\] \| /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,132): error RS1035: The symbol 'Environment' is banned for use by analyzers: Analyzers should not read their settings directly from environment variables \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\]) |
| `issue-reproduction` | passed | 2 of 6 code blocks in the requirement appear (ignoring whitespace) in added test lines: block 1 in tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs; block 2 in tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs. |
| `security-surface` | failed | 0 build/dependency file(s) changed; 1 added line(s) match security-sensitive patterns. |
| `citation-validation` | not_run | Nothing to validate. (no valid reviewer output) |

### Not checked
- **pattern-groups**: no changed files of class test-snapshot or template-output
- **tests-at-head:MessagePack.SourceGenerator.Tests**: no trx result file was produced (exit code 1); first build errors: /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,9): error RS1035: The symbol 'File' is banned for use by analyzers: Do not do file IO in analyzers \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\] \| /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,61): error RS1035: The symbol 'Path.GetTempPath()' is banned for use by analyzers: Do not do file IO in analyzers \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\] \| /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,132): error RS1035: The symbol 'Environment' is banned for use by analyzers: Analyzers should not read their settings directly from environment variables \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\]
- **tests-without-change:MessagePack.SourceGenerator.Tests**: the head run did not complete
- **existing-tests:MessagePack.SourceGenerator.Tests**: head run: no trx result file was produced (exit code 1); first build errors: /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,9): error RS1035: The symbol 'File' is banned for use by analyzers: Do not do file IO in analyzers \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\] \| /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,61): error RS1035: The symbol 'Path.GetTempPath()' is banned for use by analyzers: Do not do file IO in analyzers \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\] \| /home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs(1446,132): error RS1035: The symbol 'Environment' is banned for use by analyzers: Analyzers should not read their settings directly from environment variables \[/home/huyhoangle/junction/review-proof/.work/wt/43daf6ec1374b7d79687b895a5db5cfb08a88caf/src/MessagePack.SourceGenerator/MessagePack.SourceGenerator.csproj\]
- **citation-validation**: no valid reviewer output
- **requirements, claims, model-raised decisions and findings**: AI reviewer did not run
- **absence of new vulnerabilities**: cannot be proven by any check here; the security surface scan only finds patterns. Always a human judgement.

### Refused to decide (owner must answer)
- none

### Suspected findings
- none with a resolvable citation

### Residual risk accepted by signing
- That the change adds no vulnerability (cannot be proven here).

**Owner:** not signed. Owner identity is self-declared in this prototype.
