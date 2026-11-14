## ReviewProof sign-off sheet: \#2297 Add ExcludeFromCodeCoverage attribute to generated code.

**Route: BLOCKED** (cannot be signed yet). Evidence supports: blocked. 

- `interpretation-unconfirmed` R3 is an interpretation no human has confirmed

Once these are resolved, the evidence supports a targeted read of 13% of the changed lines: C6 is argued; D1 needs the owner; D2 needs the owner; and 4 more. The areas' trust floors would still require a full read.

Read ratio: not applicable until unblocked (1392 changed lines). Generated 2026-11-14T15:48:52.751Z, base `32258fdb` → head `a0aa5ab2`, policy 2026-11-14.1 (illustrative thresholds). Full sheet: sheet.html

### Requirement
- **R1** (explicit) Generated MessagePack code should be decorated with ExcludeFromCodeCoverage so that it does not distort coverage results.
- **R2** (explicit) A configuration setting for the behavior is optional; always-on behavior is acceptable.
- **R3** (interpretation, **unconfirmed**) The requested coverage applies to every emitted generated type, including generated nested resolver helpers, rather than merely requiring one attribute somewhere in each generated file.

### What it touches
237 files, +1383/−9: 1 docs (3 lines), 6 template-output (20 lines), 6 template (27 lines), 1 source (2 lines), 1 test (130 lines), 222 test-snapshot (1210 lines). Unexplained hunks: none.

### Claims (states computed from evidence)
- **argued** C6: The README documents formatter/resolver decoration together with the netstandard2.0 and .NET Framework exception, while the change adds no public generator setting, public declaration, API entry, or diagnostic ID. — 1 resolved citation(s) and no run that supports it
- **proven** C1: The integer-key, enum, string-key, and union formatter templates and their compiled template-output counterparts emit a fully qualified ExcludeFromCodeCoverage attribute on the formatter class, guarded by !NETSTANDARD2\_0 && !NETFRAMEWORK. — test CodeCoverageExclusionTests.AllGeneratedTypesAreExcludedFromCodeCoverage passes at head and fails without the change
- **proven** C2: ResolverTemplate emits the guarded attribute on the outer generated resolver, its nested FormatterCache\<T\>, and its nested GetFormatterHelper class; the corresponding ResolverTemplate.cs output contains the same insertions. — test CodeCoverageExclusionTests.AllGeneratedTypesAreExcludedFromCodeCoverage passes at head and fails without the change
- **proven** C3: CompositeResolverTemplate emits the guarded attribute on both the generated composite resolver and its nested FormatterCache\<T\>, in both the .tt template and the compiled template-output file. — test CompositeResolverGeneratorTests.CompositeResolver\_MixedResolverTypes passes at head and fails without the change
- **proven** C4: The repeated-output portion contains 402 identical guarded insertions across 222 files in G1; separately, constrained nesting-type output now terminates the opening brace with CRLF, and the generic-private-member snapshots show the guard beginning on a fresh line. — test GenerationTests.GenericDataTypeWithPrivateMember passes at head and fails without the change
- **proven** C5: The two new tests inspect every GeneratedTree returned for their fixture: one requires at least one attribute substring per file, and the other requires every attribute occurrence to match one of two exact guarded layouts with either one leading tab or no leading tab. — test CodeCoverageExclusionTests.AllGeneratedTypesAreExcludedFromCodeCoverage passes at head and fails without the change

### Checks
| Check | Status | Result |
| --- | --- | --- |
| `inventory` | passed | 237 files, +1383/-9: 1 docs (3 lines), 6 template-output (20 lines), 6 template (27 lines), 1 source (2 lines), 1 test (130 lines), 222 test-snapshot (1210 lines). |
| `pattern-groups` | failed | G1: 402 identical hunks in 222 files; G2: 3 identical hunks in 3 files. 5 file(s) deviate. |
| `public-surface` | passed | No public declaration, API file entry or diagnostic ID changed. |
| `tests-at-head:MessagePack.SourceGenerator.Tests` | passed | 91 of 91 changed tests pass at head. |
| `tests-without-change:MessagePack.SourceGenerator.Tests` | passed | 91 of 91 changed tests that pass at head fail without the change (discriminating). |
| `existing-tests:MessagePack.SourceGenerator.Tests` | passed | 167 pre-existing tests: 167 pass at both, 0 regressed, 0 newly pass, 0 fail at both; 0 removed at head. |
| `issue-reproduction` | not_run | The requirement contains no code blocks. (the requirement contains no code blocks) |
| `security-surface` | passed | Pattern scan found nothing; this is not proof that no vulnerability exists. |
| `citation-validation` | passed | 34 of 34 citations resolved; 0 dropped as unresolvable; 0 reference(s) to unknown requirements, evidence, tests or hunks dropped. |

### Not checked
- **issue-reproduction**: the requirement contains no code blocks
- **Whether the five files reported as deviating from the repeated-pattern groups contain intentional layout differences or accidental inconsistent updates.**: the AI reviewer could not decide: The pattern-groups check failed and reports five deviating files, but the supplied details are truncated before identifying those files or showing their deviations. H153 and H154 explain special generic-private-member layouts but do not account for all five reported deviations.
- **Whether NETSTANDARD2\_0, every supported .NET Framework version, and all other supported consumer targets actually lack or provide ExcludeFromCodeCoverageAttribute in the reference assemblies used by this repository.**: the AI reviewer could not decide: No supported-target matrix, target-specific reference compilation, or API-availability evidence is supplied. The test comment and README assert availability, while the new tests perform no such reference-assembly check.
- **Whether every generated-code path intended by the requirement is covered by the six modified templates, including any emitters outside the MessagePackGenerator and CompositeResolverGenerator fixture used by the new tests.**: the AI reviewer could not decide: The material provides the changed files and selected tests, not a complete inventory of generator emission sites or an all-fixture semantic declaration check. Passing snapshots establish agreement for the covered fixtures, not the absence of another emitter.
- **absence of new vulnerabilities**: cannot be proven by any check here; the security surface scan only finds patterns. Always a human judgement.

### Refused to decide (owner must answer)
- **D1** Whether controlling coverage decoration should remain always-on template behavior or be configurable; the change provides no opt-in or opt-out setting. Options: Always emit according to the templates, with no setting (chosen) / Enable decoration by default and provide an opt-out setting / Disable decoration by default and provide an opt-in setting. _Raised by the AI reviewer._
- **D2** How generated source should handle framework-dependent availability of the attribute; the change uses a source-level preprocessor condition that suppresses it for NETSTANDARD2\_0 and NETFRAMEWORK. Options: Use the chosen \#if !NETSTANDARD2\_0 && !NETFRAMEWORK guards / Emit the framework attribute unconditionally / Emit a compatibility attribute declaration where necessary and decorate on every target / Use a different target-conditioned strategy based on the supported consumer matrix. _Raised by the AI reviewer._
- **D3** How finely to apply the requirement to generated type declarations; the change decorates generated nested cache and formatter-lookup helpers as well as the outer resolver types. Options: Decorate every concrete generated formatter, resolver, cache, and lookup-helper class (chosen) / Decorate only generated formatter and outer resolver classes, leaving nested helpers uncovered / Use another explicitly maintained inventory of generated declarations that require exclusion. _Raised by the AI reviewer._

### Suspected findings
- **F1** The guard suppresses the feature for every .NET Framework compilation rather than only where the API is unavailable. ExcludeFromCodeCoverageAttribute is available on .NET Framework 4.x, including framework versions that can consume a netstandard2.0 library, so those consumers receive no decoration despite the README's availability-based explanation and the requirement's request for all generated code. Independently, the same condition deliberately leaves every NETSTANDARD2\_0 compilation undecorated, which is an exception not stated in the requirement. (`README.md:1640`, `src/MessagePack.SourceGenerator/Transforms/ResolverTemplate.tt:14`, `tests/MessagePack.SourceGenerator.Tests/CodeCoverageExclusionTests.cs:18`)
- **F2** The new tests do not establish their stated every-type invariant. AllGeneratedTypesAreExcludedFromCodeCoverage requires only one matching substring per file, and the guard test compares total counts of attribute and guarded substrings. For example, an undecorated FormatterCache\<T\> or GetFormatterHelper could remain in a resolver file whose outer resolver still has a guarded attribute, and both new tests would still pass; they never associate an attribute with a generated type declaration. (`tests/MessagePack.SourceGenerator.Tests/CodeCoverageExclusionTests.cs:11`, `tests/MessagePack.SourceGenerator.Tests/CodeCoverageExclusionTests.cs:73`, `tests/MessagePack.SourceGenerator.Tests/CodeCoverageExclusionTests.cs:91`, `src/MessagePack.SourceGenerator/Transforms/ResolverTemplate.tt:48`)
- **F3** The compatibility rationale in the new guard test is not exercised by a consumer compilation. RunGeneratorAsync discards the updated compilation and generator diagnostics, and the tests inspect only generated text; they neither define NETSTANDARD2\_0/NETFRAMEWORK for a compilation nor assert diagnostics for those target configurations. Thus these tests cannot substantiate the comment that the guard lets netstandard2.0 consumers still compile or detect invalid generated syntax in either preprocessor branch. (`tests/MessagePack.SourceGenerator.Tests/CodeCoverageExclusionTests.cs:90`, `tests/MessagePack.SourceGenerator.Tests/CodeCoverageExclusionTests.cs:116`, `tests/MessagePack.SourceGenerator.Tests/CodeCoverageExclusionTests.cs:123`)

### Residual risk accepted by signing
- C6 (argued): The README documents formatter/resolver decoration together with the netstandard2.0 and .NET Framework exception, while the change adds no public generator setting, public declaration, API entry, or diagnostic ID.
- That the change adds no vulnerability (cannot be proven here).

**Owner:** not signed. Owner identity is self-declared in this prototype.
