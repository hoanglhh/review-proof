## ReviewProof sign-off sheet: \#2283 Generator and analyzer crash with IndexOutOfRangeException on a closed generic struct from a referenced assembly

> **SYNTHETIC:** Planted bug for calibration: scope-public-member. This change contains a deliberately planted bug.

**Route: BLOCKED** (cannot be signed yet). Evidence supports: blocked. 

- `reviewer-missing` the AI reviewer output is missing or invalid

Read ratio: not applicable until unblocked (230 changed lines). Generated 2026-11-14T06:53:02.043Z, base `32258fdb` → head `e3113731`, policy 2026-11-14.1 (illustrative thresholds). Full sheet: sheet.html

### Requirement
- none

### What it touches
5 files, +227/−3: 2 docs (10 lines), 2 source (31 lines), 1 test (189 lines). Unexplained hunks: H1, H2, H4, H5, H6, H7, H8, H9, H10.

### Claims (states computed from evidence)
- none

### Checks
| Check | Status | Result |
| --- | --- | --- |
| `inventory` | passed | 5 files, +227/-3: 2 docs (10 lines), 2 source (31 lines), 1 test (189 lines). |
| `pattern-groups` | not_run | No repetitive files changed. (no changed files of class test-snapshot or template-output) |
| `public-surface` | failed | 1 public-surface line(s) changed in 1 file(s). |
| `tests-at-head:MessagePack.SourceGenerator.Tests` | passed | 3 of 3 changed tests pass at head. |
| `tests-without-change:MessagePack.SourceGenerator.Tests` | passed | 3 of 3 changed tests that pass at head fail without the change (discriminating). |
| `existing-tests:MessagePack.SourceGenerator.Tests` | passed | 167 pre-existing tests: 167 pass at both, 0 regressed, 0 newly pass, 0 fail at both; 0 removed at head. |
| `issue-reproduction` | passed | 2 of 6 code blocks in the requirement appear (ignoring whitespace) in added test lines: block 1 in tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs; block 2 in tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs. |
| `security-surface` | passed | Pattern scan found nothing; this is not proof that no vulnerability exists. |
| `citation-validation` | not_run | Nothing to validate. (no valid reviewer output) |

### Not checked
- **pattern-groups**: no changed files of class test-snapshot or template-output
- **citation-validation**: no valid reviewer output
- **requirements, claims, model-raised decisions and findings**: AI reviewer did not run
- **absence of new vulnerabilities**: cannot be proven by any check here; the security surface scan only finds patterns. Always a human judgement.

### Refused to decide (owner must answer)
- **P1** Public surface changed in src/MessagePack.Annotations/Attributes.cs: added \`public bool AllowMetadataMembers \{ get; set; \}\`. Options: Keep as permanent public surface / Make it non-public or remove it. _Raised by rule public-surface._

### Suspected findings
- none with a resolvable citation

### Residual risk accepted by signing
- That the change adds no vulnerability (cannot be proven here).

**Owner:** not signed. Owner identity is self-declared in this prototype.
