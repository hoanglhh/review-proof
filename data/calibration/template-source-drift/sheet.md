## ReviewProof sign-off sheet: \#2297 Add ExcludeFromCodeCoverage attribute to generated code.

> **SYNTHETIC:** planted bug for calibration (template-source-drift). This change contains a deliberately planted bug and is not a real agent change.

**Route: BLOCKED** (cannot be signed yet). Evidence supports: blocked. 

- `interpretation-unconfirmed` R3 is an interpretation no human has confirmed
- `interpretation-unconfirmed` R4 is an interpretation no human has confirmed

Once these are resolved, the evidence supports a targeted read of 12% of the changed lines: C10 is argued; C11 is argued; D1 needs the owner; and 6 more. The areas' trust floors would still require a full read.

Read ratio: not applicable until unblocked (1389 changed lines). Generated 2026-11-14T15:48:12.490Z, base `32258fdb` → head `dc6b9f85`, policy 2026-11-14.1 (illustrative thresholds). Full sheet: sheet.html

### Requirement
- **R1** (explicit) All MessagePack-generated code should be decorated with ExcludeFromCodeCoverage.
- **R2** (explicit) The behavior may be always on; a configuration setting is optional rather than required.
- **R3** (interpretation, **unconfirmed**) Generated output should remain compilable on targets where the framework attribute is unavailable.
- **R4** (interpretation, **unconfirmed**) The requested scope includes generated resolver cache and helper types, not only the outer formatter and resolver declarations.

### What it touches
236 files, +1380/−9: 1 docs (3 lines), 6 template-output (20 lines), 5 template (24 lines), 1 source (2 lines), 1 test (130 lines), 222 test-snapshot (1210 lines). Unexplained hunks: none.

### Claims (states computed from evidence)
- **argued** C10: README documentation describes formatter and resolver decoration and explicitly documents netstandard2.0 and .NET Framework as conditional exceptions. — 1 resolved citation(s) and no run that supports it
- **argued** C11: The exclusion behavior is added without a new public configuration API; the public-surface check reports no changed public declaration, public API entry, or diagnostic ID. — 1 resolved citation(s) and no run that supports it
- **proven** C1: Integer-keyed object formatter generation places the fully qualified exclusion attribute on the formatter class inside the NETSTANDARD2\_0/NETFRAMEWORK preprocessor guard. — test GenerationTests.ArrayTypedProperty passes at head and fails without the change
- **proven** C2: String-keyed formatter generation applies the same guarded exclusion attribute to its formatter class in both the T4 template and checked-in template output. — test CustomStringKeyFormatterTests.RecordWithPrimaryConstructor passes at head and fails without the change
- **proven** C3: Enum formatter generation decorates the generated formatter class with the guarded exclusion attribute. — test GenerationTests.EnumFormatter(container: Namespace, usesMapMode: False) passes at head and fails without the change
- **proven** C4: The checked-in union template output decorates the union formatter class with the guarded exclusion attribute. — test GenerationTests.UnionFormatter(container: Namespace) passes at head and fails without the change
- **proven** C5: GeneratedMessagePackResolver output decorates three declarations: the resolver class, its nested FormatterCache\<T\>, and its nested GetFormatterHelper class. — test CodeCoverageExclusionTests.AllGeneratedTypesAreExcludedFromCodeCoverage passes at head and fails without the change
- **proven** C6: Composite resolver output decorates both the outer resolver class and its nested FormatterCache\<T\> class with guarded exclusion attributes. — test CompositeResolverGeneratorTests.CompositeResolver\_MixedResolverTypes passes at head and fails without the change
- **proven** C7: The new tests run the generator over declared object, string-keyed object, enum, union, and resolver inputs, require at least five generated files, assert at least one exclusion attribute in every returned file, and count only the two supported guarded attribute layouts as guarded occurrences. — test CodeCoverageExclusionTests.AllGeneratedTypesAreExcludedFromCodeCoverage passes at head and fails without the change
- **proven** C8: When a generated nesting type has generic constraints, the nesting utility now emits a newline after its opening brace, separating that brace from subsequent generated declarations. — test GenerationTests.GenericDataTypeWithPrivateMember passes at head and fails without the change
- **proven** C9: The updated expected-output resources contain the new guarded decorations and agree with the head generator for the changed snapshot-based tests, while those tests discriminate against output produced with the base generator source. — test GenerationTests.EmbeddedTypes passes at head and fails without the change

### Checks
| Check | Status | Result |
| --- | --- | --- |
| `inventory` | passed | 236 files, +1380/-9: 1 docs (3 lines), 6 template-output (20 lines), 5 template (24 lines), 1 source (2 lines), 1 test (130 lines), 222 test-snapshot (1210 lines). |
| `pattern-groups` | failed | G1: 402 identical hunks in 222 files; G2: 3 identical hunks in 3 files. 5 file(s) deviate. |
| `public-surface` | passed | No public declaration, API file entry or diagnostic ID changed. |
| `tests-at-head:MessagePack.SourceGenerator.Tests` | passed | 91 of 91 changed tests pass at head. |
| `tests-without-change:MessagePack.SourceGenerator.Tests` | passed | 91 of 91 changed tests that pass at head fail without the change (discriminating). |
| `existing-tests:MessagePack.SourceGenerator.Tests` | passed | 167 pre-existing tests: 167 pass at both, 0 regressed, 0 newly pass, 0 fail at both; 0 removed at head. |
| `issue-reproduction` | not_run | The requirement contains no code blocks. (the requirement contains no code blocks) |
| `security-surface` | passed | Pattern scan found nothing; this is not proof that no vulnerability exists. |
| `citation-validation` | passed | 32 of 32 citations resolved; 0 dropped as unresolvable; 0 reference(s) to unknown requirements, evidence, tests or hunks dropped. |

### Not checked
- **issue-reproduction**: the requirement contains no code blocks
- **Does ExcludeFromCodeCoverageAttribute exist on every .NET Framework and netstandard version targeted by consumers, and are NETSTANDARD2\_0 and NETFRAMEWORK exactly the right availability boundaries?**: the AI reviewer could not decide: The material contains assertions in the README and test comments, but no reference-assembly matrix or target-specific compilation results. The attribute's availability is not established independently by the supplied records.
- **Would regenerating UnionTemplate.cs from UnionTemplate.tt preserve the new union attribute block?**: the AI reviewer could not decide: UnionTemplate.tt is not included at base or head and has no supplied hunk. Its existing contents and regeneration output cannot be compared with the changed UnionTemplate.cs.
- **What are all five deviations reported by the pattern-groups check, and are any of them unintended snapshot differences?**: the AI reviewer could not decide: The check reports five deviating files, but its details are truncated. Only the two GenericDataTypeWithPrivateMember examples are shown; the other deviating files and their complete hunks are unavailable.
- **Exactly which generated files and type declarations were returned by the two new CodeCoverageExclusionTests, including whether an enum formatter was generated?**: the AI reviewer could not decide: Passing test output does not include the generated path list or a declaration inventory. The test asserts only a minimum file count and per-file substrings, and its standalone MyEnum declaration alone does not show the generator's collection behavior.
- **Do consumer projects compile successfully and produce the intended coverage exclusions with each preprocessor branch enabled?**: the AI reviewer could not decide: The supplied tests inspect generated text and exercise the default test configuration, but no netstandard2.0/.NET Framework consumer compilation or end-to-end coverage-tool run is present.
- **absence of new vulnerabilities**: cannot be proven by any check here; the security surface scan only finds patterns. Always a human judgement.

### Refused to decide (owner must answer)
- **D1** The implementation chooses textual preprocessor guards, so the attribute is inactive when NETSTANDARD2\_0 or NETFRAMEWORK is defined, instead of pursuing unconditional decoration on every target. Options: Emit the attribute under \#if !NETSTANDARD2\_0 && !NETFRAMEWORK, as implemented / Emit the attribute unconditionally for every target under a literal reading of the request / Inspect each consumer compilation for the attribute type and generate target-specific output rather than emitting preprocessor branches / Use a compatibility declaration or polyfill for targets lacking the framework attribute, subject to avoiding type conflicts. _Raised by the AI reviewer._
- **D2** The change implements always-on generation without an opt-in or opt-out setting. Options: No setting; always generate the guarded decoration, as implemented / Add an opt-out setting with decoration enabled by default / Add an opt-in setting with decoration disabled by default. _Raised by the AI reviewer._
- **D3** The decoration granularity includes concrete generated formatters, resolvers, caches, and helper classes, but not the partial nesting/container type declarations emitted to host generated code. Options: Decorate concrete generated formatter/resolver/helper types but not generated user-type nesting declarations, as implemented / Also decorate generated partial nesting/container declarations and accept their whole-type coverage semantics / Decorate only outer generated formatter/resolver classes and omit separate nested helper decorations. _Raised by the AI reviewer._

### Suspected findings
- **F1** The union formatter decoration is present in checked-in UnionTemplate.cs, but the supplied diff has no corresponding UnionTemplate.tt change. Unlike the other edited template outputs, the source template is not shown to reproduce this output; if it does not already contain equivalent text, a future T4 regeneration will drop the union decoration. No template-regeneration check is included in the evidence. (`src/MessagePack.SourceGenerator/Transforms/UnionTemplate.cs:30`)
- **F2** AllGeneratedTypesAreExcludedFromCodeCoverage does not test every generated type: it checks only whether each file contains the attribute at least once. The nesting utility emits partial type declarations without an exclusion attribute, so a file can contain such an undecorated declaration and still pass whenever another declaration in that file has the attribute. This leaves the test's stated per-type guarantee unsupported even though decorating user partial containers is itself a separate scope decision. (`tests/MessagePack.SourceGenerator.Tests/CodeCoverageExclusionTests.cs:73`, `src/MessagePack.SourceGenerator/Transforms/TransformUtilities.cs:55`)
- **F3** ExcludeAttributeIsGuardedForTargetsWhereItIsUnavailable does not compile either preprocessor configuration named by the test. It normalizes and counts strings after one generator run using default references; it supplies no NETSTANDARD2\_0 or NETFRAMEWORK parse options and checks no compilation diagnostics. Guard-specific syntax errors or attribute-resolution failures can therefore remain undetected. (`tests/MessagePack.SourceGenerator.Tests/CodeCoverageExclusionTests.cs:86`, `tests/MessagePack.SourceGenerator.Tests/CodeCoverageExclusionTests.cs:116`)
- **F4** The new tests do not enforce the generated category set described by their own comment. The only cardinality assertion is generated.Count \>= 5, followed by assertions over whatever files happen to be returned; no assertion requires an enum formatter, a union formatter, both object formatter variants, and a resolver by path. A category omitted by the generator is not directly detected if at least five other files remain. (`tests/MessagePack.SourceGenerator.Tests/CodeCoverageExclusionTests.cs:69`)

### Residual risk accepted by signing
- C10 (argued): README documentation describes formatter and resolver decoration and explicitly documents netstandard2.0 and .NET Framework as conditional exceptions.
- C11 (argued): The exclusion behavior is added without a new public configuration API; the public-surface check reports no changed public declaration, public API entry, or diagnostic ID.
- That the change adds no vulnerability (cannot be proven here).

**Owner:** not signed. Owner identity is self-declared in this prototype.
