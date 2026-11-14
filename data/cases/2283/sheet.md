## ReviewProof sign-off sheet: \#2283 Generator and analyzer crash with IndexOutOfRangeException on a closed generic struct from a referenced assembly

**Route: BLOCKED** (cannot be signed yet). Evidence supports: blocked. 

- `interpretation-unconfirmed` R4 is an interpretation no human has confirmed

Read ratio: not applicable until unblocked (228 changed lines). Generated 2026-11-14T06:42:14.181Z, base `32258fdb` → head `9df83c38`, policy 2026-11-14.1 (illustrative thresholds). Full sheet: sheet.html

### Requirement
- **R1** (explicit) The generator and analyzer must not crash with IndexOutOfRangeException for the reported referenced-assembly generic struct scenario.
- **R2** (explicit) The consuming app must build cleanly and contain a generated resolver.
- **R3** (explicit) The scenario requiring coverage is the combination of a generic value type and a definition originating in a referenced assembly.
- **R4** (interpretation, **unconfirmed**) Collection and diagnostic handling should tolerate metadata symbols that have no source declaration syntax.

### What it touches
4 files, +225/−3: 2 docs (10 lines), 1 source (29 lines), 1 test (189 lines). Unexplained hunks: none.

### Claims (states computed from evidence)
- **proven** C1: With MyGenericStruct\<T\> emitted into a metadata-only defining assembly and MyGenericStruct\<int\> used by a consuming object, analyzer and generator execution completes without diagnostics and the consuming compilation produces the TempProject.MyResolver.g.cs hint. — test GenericsFormatterTests.ClosedGenericStruct\_FromMetadataReference passes at head and fails without the change
- **proven** C2: With the issue's Lib.Item\<T\> record struct emitted to metadata and App.Cmd.Member typed as Item\<int\>, analyzer and generator execution completes without diagnostics and the App.AppResolver.g.cs hint is generated. — test GenericsFormatterTests.ClosedGenericRecordStruct\_FromMetadataReference passes at head and fails without the change
- **proven** C3: A metadata-defined generic struct with an additional public unkeyed property produces no diagnostics in the consuming test compilation, does not trigger AD0001 or CS8785, and still yields the requested resolver hint. — test GenericsFormatterTests.ClosedGenericStruct\_FromMetadataReference\_UnkeyedMember passes at head and fails without the change
- **proven** C4: The modified MemberNeedsKey and BothStringAndIntKeyAreNull paths obtain locations through FirstOrDefault and safe casts rather than DeclaringSyntaxReferences\[0\], so an empty declaration collection yields a null location at those sites instead of an index failure. — test GenericsFormatterTests.ClosedGenericRecordStruct\_FromMetadataReference passes at head and fails without the change
- **proven** C5: TypeCollector now forwards an analyzer diagnostic only when its primary location is in source and its syntax tree belongs to the current compilation; location-less diagnostics and diagnostics rooted in other trees are dropped. — test GenericsFormatterTests.ClosedGenericStruct\_FromMetadataReference\_UnkeyedMember passes at head and fails without the change

### Checks
| Check | Status | Result |
| --- | --- | --- |
| `inventory` | passed | 4 files, +225/-3: 2 docs (10 lines), 1 source (29 lines), 1 test (189 lines). |
| `pattern-groups` | not_run | No repetitive files changed. (no changed files of class test-snapshot or template-output) |
| `public-surface` | passed | No public declaration, API file entry or diagnostic ID changed. |
| `tests-at-head:MessagePack.SourceGenerator.Tests` | passed | 3 of 3 changed tests pass at head. |
| `tests-without-change:MessagePack.SourceGenerator.Tests` | passed | 3 of 3 changed tests that pass at head fail without the change (discriminating). |
| `existing-tests:MessagePack.SourceGenerator.Tests` | passed | 167 pre-existing tests: 167 pass at both, 0 regressed, 0 newly pass, 0 fail at both; 0 removed at head. |
| `issue-reproduction` | passed | 2 of 6 code blocks in the requirement appear (ignoring whitespace) in added test lines: block 1 in tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs; block 2 in tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs. |
| `security-surface` | passed | Pattern scan found nothing; this is not proof that no vulnerability exists. |
| `citation-validation` | passed | 32 of 32 citations resolved; 0 dropped as unresolvable; 0 reference(s) to unknown requirements, evidence, tests or hunks dropped. |

### Not checked
- **pattern-groups**: no changed files of class test-snapshot or template-output
- **Whether the exact attached two-project repro now completes dotnet build and places GeneratedMessagePackResolver in app.dll.**: the AI reviewer could not decide: The supplied evidence runs Roslyn-based tests on in-memory metadata references and checks generated hint names. It contains no command-line two-project build or inspection of a produced application assembly.
- **Whether trimmed and NativeAOT applications now succeed at runtime in the affected deployments.**: the AI reviewer could not decide: No trimmed or NativeAOT build, deployment, serialization run, or runtime resolver lookup is included in the evidence.
- **Which individual declaration-syntax access caused each reproduced base failure.**: the AI reviewer could not decide: The requirement explicitly says the firing site was not narrowed down, and the trimmed without-change outputs retain the exception type and message but not a source line mapping to H4, H5, or another access. The added tests exercise combined scenarios rather than isolating each modified diagnostic branch.
- **absence of new vulnerabilities**: cannot be proven by any check here; the security surface scan only finds patterns. Always a human judgement.

### Refused to decide (owner must answer)
- **D1** The change assigns problems in metadata-defined members to their defining project and centrally suppresses the corresponding consuming-compilation diagnostics, including all diagnostics without an in-compilation primary location. Options: Drop diagnostics whose primary location is absent or outside the current compilation and rely on the defining project, as implemented and documented / Report a consuming-project diagnostic at the source member that references the metadata type when such a location exists / Preserve location-less or external-location diagnostics and handle analyzer host restrictions separately / Restrict suppression to the known metadata-member diagnostic sites instead of applying it to every diagnostic passed through TypeCollector.reportDiagnostic. _Raised by the AI reviewer._
- **D2** Regression verification uses in-memory compilations and metadata images, adds an explicit attributed resolver to each usage source, and checks generator hint names instead of running the original two-project command-line build. Options: Use the in-memory metadata-reference harness with explicit resolver declarations, as implemented / Reproduce the two project files with dotnet build and inspect the consuming assembly for its resolver / Keep the focused in-memory tests and add a separate two-project build integration test / Use an in-memory harness but also cover the scenario without an explicit GeneratedMessagePackResolver declaration. _Raised by the AI reviewer._

### Suspected findings
- **F1** BothStringAndIntKeyAreNull can be silently dropped for a current-compilation property whose declaration syntax is ParameterSyntax, such as a positional record property. The nearby member-key path explicitly handles ParameterSyntax, but GetPropertyIdentifierLocation recognizes only PropertyDeclarationSyntax; it therefore returns null for that case, and the new central wrapper does not forward a diagnostic with Location.None. (`src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs:985`, `src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs:926`, `src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs:1434`, `src/MessagePack.SourceGenerator/CodeAnalysis/TypeCollector.cs:1446`)
- **F2** None of the three new metadata regression scenarios covers generation without an explicit resolver declaration. Every usage source adds \[GeneratedMessagePackResolver\] to a custom partial resolver, and the common assertion looks for that resolver's hint name, leaving the issue's no-explicit-resolver shape unrepresented in the added tests. (`tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs:535`, `tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs:575`, `tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs:620`, `tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs:658`)
- **F3** The added helper does not exercise a two-project dotnet build or inspect a built consuming assembly. It emits the defining source to an in-memory image, invokes CSharpGeneratorDriver on another in-memory compilation, and checks generated hint names, so command-line project-reference integration and physical app.dll contents remain outside this regression coverage. (`tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs:667`, `tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs:673`, `tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs:654`, `tests/MessagePack.SourceGenerator.Tests/GenericsFormatterTests.cs:657`)

### Residual risk accepted by signing
- That the change adds no vulnerability (cannot be proven here).

**Owner:** not signed. Owner identity is self-declared in this prototype.
