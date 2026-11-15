Evaluation cohort: Unclassified

## ReviewProof sign-off sheet: 2180 Unexpected warning CS8669: The annotation for nullable reference types should only be used in code within a '\#nullable' annotations context. Auto-generated code requires an explicit '\#nullable' directive in source.

**Route: BLOCKED** (cannot be signed yet). Evidence supports: blocked. 

- `claim-broken` C6 is broken and serves R1, R2, R4

Once these are resolved, the evidence supports a targeted read of 16% of the changed lines: C3 is argued; C5 is argued; C6 is broken; and 9 more. The areas' trust floors would still require a full read.

Read ratio: not applicable until unblocked (994 changed lines). Generated 2026-11-15T00:17:17.944Z, base `781513b1` → head `3df413b3`, policy 2026-11-14.1 (illustrative thresholds). Full sheet: sheet.html

### Requirement
- **R1** (explicit) CS8669 in MessagePack.GeneratedMessagePackResolver.g.cs is unexpected and should be eliminated.
- **R2** (explicit) Building the reported reproduction should produce no warning.
- **R3** (explicit) The reproduction uses a message-pack object with a key-zero required List\<SomeClass?\> property.
- **R4** (explicit) The issue suggests, but does not mandate, disabling CS8669 with a pragma in the generated resolver.

### What it touches
231 files, +478/−516: 1 source (2 lines), 6 template-output (41 lines), 1 template (4 lines), 2 test (23 lines), 221 test-snapshot (924 lines). Unexplained hunks: H185.

### Claims (states computed from evidence)
Observed in a discriminating test means a named test passes with the change and fails without it; this does not establish the full wording of the claim. Inspect the assertion and its scope.
- **broken** C6: The InterfaceUnion and InterfaceUnionUsedWithNullableRefAnnotation resolver snapshots are updated differently from G1: each receives a separate commented CS8669 pragma at line 5, with no common-header replacement in its listed hunks. — test GenerationTests.InterfaceUnionUsedWithNullableRefAnnotation does not pass at head (skipped)
- **argued** C3: The 125 existing resolver snapshots represented by G1 now expect CS8669 to be appended to the common warning-disable pragma rather than leaving the generated resolver unprotected. — pre-existing test GenerationTests.AdditionalAllowTypes passes at base and at head; it was not shown able to fail for this claim
- **argued** C5: The snapshot refresh also makes unrelated expectation changes: G3 changes GeneratedAssemblyMessagePackResolverAttribute version components from 3,0 to 1,0 in 87 files, and one referenced-project formatter snapshot changes MyResolver from an implicit-access declaration to an explicitly internal declaration. — pre-existing test GenerationTests.AdditionalAllowTypes passes at base and at head; it was not shown able to fail for this claim
- **Observed in a discriminating test** C1: Every source added through MessagePackGenerator.Generate and GenerateResolver is prefixed with FileHeader, and that header now disables CS8669 before the transform output. — test GenericsFormatterTests.NullableReferenceTypeInListFormatter passes at head and fails without the change
- **Observed in a discriminating test** C2: The added C\#11 regression test enables nullable annotations and uses the issue's required List\<SomeClass?\> property; its head run accepts the generated output without diagnostics, while using base source produces two CS8669 warnings at nullable annotations in the generated resolver. — test GenericsFormatterTests.NullableReferenceTypeInListFormatter passes at head and fails without the change
- **Observed in a discriminating test** C4: The int-key formatter template's standalone CS8669 directive is removed, and the 92 G2 snapshots plus the new formatter snapshot consolidate that suppression into the shared FileHeader pragma. — test GenericsFormatterTests.NullableReferenceTypeInListFormatter passes at head and fails without the change

### Checks
| Check | Status | Result |
| --- | --- | --- |
| `inventory` | passed | 231 files, +478/-516: 1 source (2 lines), 6 template-output (41 lines), 1 template (4 lines), 2 test (23 lines), 221 test-snapshot (924 lines). |
| `pattern-groups` | failed | G1: 125 identical hunks in 125 files; G2: 92 identical hunks in 92 files; G3: 87 identical hunks in 87 files; G4: 12 identical hunks in 6 files; G5: 6 identical hunks in 6 files. 7 file(s) deviate. |
| `public-surface` | passed | No public declaration, API file entry or diagnostic ID changed. |
| `tests-at-head:MessagePack.SourceGenerator.Tests` | passed | 1 of 1 changed tests pass at head. |
| `tests-without-change:MessagePack.SourceGenerator.Tests` | passed | 1 of 1 changed tests that pass at head fail without the change (discriminating). |
| `existing-tests:MessagePack.SourceGenerator.Tests` | passed | 168 pre-existing tests: 159 pass at both, 0 regressed, 0 newly pass, 9 fail at both; 0 removed at head. |
| `issue-reproduction` | passed | 1 of 1 code blocks in the requirement appear (ignoring whitespace) in added test lines: block 1 in tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs. |
| `security-surface` | passed | Pattern scan found nothing; this is not proof that no vulnerability exists. |
| `citation-validation` | passed | 39 of 39 citations resolved; 0 dropped as unresolvable; 0 reference(s) to unknown requirements, evidence, tests or hunks dropped. |

### Not checked
- **What exact behavior does WRITE\_EXPECTED activate, and can it rewrite or auto-accept expected output during the supplied test runs?**: the AI reviewer could not decide: Only the preprocessor directive is shown. The verifier body that consumes the symbol and any outer build configuration controlling it are not supplied.
- **Is 1,0 the intended GeneratedAssemblyMessagePackResolverAttribute version for the build these snapshots are meant to represent?**: the AI reviewer could not decide: ResolverTemplate uses ThisAssembly.AssemblyFileVersion, but the assembly-version inputs and package-build settings are not provided; the security-surface record only says that no build or dependency file changed.
- **Are the InterfaceUnion resources consumed through a different snapshot mechanism that makes their standalone pragma correct?**: the AI reviewer could not decide: Their complete base files and the resource-loading/comparison implementation are absent, and the named InterfaceUnionUsedWithNullableRefAnnotation test is skipped in the evidence.
- **What are all seven pattern-group deviations, and do the 217 additional files contain any further unrelated edits?**: the AI reviewer could not decide: The diff lists those files only as members of repeated patterns, and the pattern-groups details are truncated. The visible exemplars cannot establish the content of every omitted hunk.
- **Does the exact MessagePack 3.1.3 package reproduction on .NET 9 produce no warnings end to end after this change?**: the AI reviewer could not decide: The evidence covers an in-process C\#11 source-generator regression test and existing managed tests, but supplies no packed-generator or .NET 9 project build output for the reported environment.
- **What generator change or environmental difference accounts for the newly explicit internal MyResolver declaration?**: the AI reviewer could not decide: The snapshot changes, but no implementation producing that modifier is included among the listed source changes, so its origin cannot be traced from the supplied material.
- **absence of new vulnerabilities**: cannot be proven by any check here; the security surface scan only finds patterns. Always a human judgement.

### Refused to decide (owner must answer)
- **D1** The fix centralizes blanket CS8669 suppression in the shared generated-file header and removes the formatter-specific directive, rather than emitting a nullable context or changing only the resolver. Options: Chosen: append CS8669 to the shared FileHeader used by the shown generation paths and remove the int-key formatter's standalone directive / Add the issue-suggested standalone directive only to the generated resolver and retain per-formatter suppression / Emit \#nullable enable or \#nullable enable annotations in generated sources instead of suppressing CS8669 / Use a shared header but restore CS8669 around regions where annotations should remain diagnosed, or apply it only to files that can contain nullable-reference annotations. _Raised by the AI reviewer._
- **D2** The checked-in T4-generated C\# files are regenerated with 18.0.0.0 tool stamps, and the change also accepts control-line trailing-whitespace synchronization. Options: Chosen: check in the regenerated 18.0.0.0 stamps and associated whitespace changes / Preserve the prior 17.0.0.0 metadata and change only generated output necessary for the fix / Establish or use a pinned templating-tool version and regenerate the affected templates consistently with that version. _Raised by the AI reviewer._
- **D3** The warning-fix change also accepts collateral snapshot drift in assembly-version attributes, a class-access modifier, and specially formatted InterfaceUnion headers. Options: Chosen: include the collateral version, modifier, and special-header snapshot updates in this change / Limit this change to CS8669-related snapshot differences and the new regression resources, retaining unrelated prior expectations / Confirm the intended generator and assembly-version environment, then handle general snapshot regeneration separately from this warning fix. _Raised by the AI reviewer._
- **D4** The shared test verifier is left with WRITE\_EXPECTED enabled rather than restoring the base's commented-out opt-in directive. Options: Chosen: leave \#define WRITE\_EXPECTED active in the checked-in verifier source / Restore the base's commented directive and enable snapshot writing only temporarily when updating resources / Keep the directive disabled in source and control snapshot updates through a separate explicit build or test configuration. _Raised by the AI reviewer._

### Suspected findings
- **F1** WRITE\_EXPECTED is enabled in the shared source-generator test verifier, whereas it was commented out at base. Unless the unseen verifier code separately guards this mode, normal tests can overwrite expected resources instead of treating generated-text mismatches as failures; consequently the updated snapshots and their passing runs are not necessarily independent text verification. The new test's base-source diagnostic failure still discriminates the CS8669 behavior, but it does not remove this snapshot-validation concern. (`tests/MessagePack.SourceGenerator.Tests/Verifiers/CSharpSourceGeneratorVerifier`1+Test.cs:5`, `tests/MessagePack.SourceGenerator.Tests/Verifiers/CSharpSourceGeneratorVerifier`1+Test.cs:5`)
- **F2** Eighty-seven snapshots now expect resolver registration metadata version 1,0 instead of 3,0, even though ResolverTemplate still reads the major and minor components from ThisAssembly.AssemblyFileVersion. The warning-header edit does not explain this semantic expectation change; it may be recording a local build's version into tests and would disagree with generation under the previous 3.x package version. (`src/MessagePack.SourceGenerator/Transforms/ResolverTemplate.cs:32`, `tests/MessagePack.SourceGenerator.Tests/Resources/AdditionalAllowTypes/MessagePack.GeneratedMessagePackResolver.g.cs:7`, `tests/MessagePack.SourceGenerator.Tests/Resources/AdditionalAllowTypes/MessagePack.GeneratedMessagePackResolver.g.cs:7`)
- **F3** The two InterfaceUnion resolver snapshots do not have the header shape produced by the new shared FileHeader: their only listed additions are a legacy standalone pragma at line 5, while normal new resolver output has CS8669 in the collective line 3 and no standalone directive. These expected resources therefore appear stale or manually inconsistent with H1. The evidence specifically lists GenerationTests.InterfaceUnionUsedWithNullableRefAnnotation as skipped at both revisions, so it does not resolve the discrepancy. (`tests/MessagePack.SourceGenerator.Tests/Resources/InterfaceUnionUsedWithNullableRefAnnotation/MessagePack.GeneratedMessagePackResolver.g.cs:5`, `tests/MessagePack.SourceGenerator.Tests/Resources/NullableReferenceTypeInListFormatter/MessagePack.GeneratedMessagePackResolver.g.cs:3`, `src/MessagePack.SourceGenerator/MessagePackGenerator.Emit.cs:80`)
- **F4** The referenced-project snapshot now expects an explicit internal modifier on MyResolver even though the only non-template production source hunk is the CS8669 FileHeader edit. This is unrelated generated-text drift, not an effect explained by the warning fix, and is consistent with collateral output being absorbed during snapshot regeneration. (`tests/MessagePack.SourceGenerator.Tests/Resources/Generics_Defined_In_ReferencedProject/DefiningProject.Formatters.TempProject.MyResolver.TempProject.MyGenericObjectFormatter`1.g.cs:10`, `tests/MessagePack.SourceGenerator.Tests/Resources/Generics_Defined_In_ReferencedProject/DefiningProject.Formatters.TempProject.MyResolver.TempProject.MyGenericObjectFormatter`1.g.cs:8`, `src/MessagePack.SourceGenerator/MessagePackGenerator.Emit.cs:16`)

### Residual risk accepted by signing
- C3 (argued): The 125 existing resolver snapshots represented by G1 now expect CS8669 to be appended to the common warning-disable pragma rather than leaving the generated resolver unprotected.
- C5 (argued): The snapshot refresh also makes unrelated expectation changes: G3 changes GeneratedAssemblyMessagePackResolverAttribute version components from 3,0 to 1,0 in 87 files, and one referenced-project formatter snapshot changes MyResolver from an implicit-access declaration to an explicitly internal declaration.
- C6 (broken): The InterfaceUnion and InterfaceUnionUsedWithNullableRefAnnotation resolver snapshots are updated differently from G1: each receives a separate commented CS8669 pragma at line 5, with no common-header replacement in its listed hunks.
- That the change adds no vulnerability (cannot be proven here).

**Owner:** not signed. Owner identity is self-declared in this prototype.
