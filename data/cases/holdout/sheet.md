Evaluation cohort: Holdout

## ReviewProof sign-off sheet: \#2318 dynamic type fails sourcegenerator CS8785 'MessagePackGenerator' failed to generate source.

**Route: BLOCKED** (cannot be signed yet). Evidence supports: blocked. 

- `requirement-without-claim` R3 has no claim
- `requirement-without-claim` R4 has no claim

Once these are resolved, the evidence supports a targeted read of 100% of the changed lines: C5 is argued; D1 needs the owner; D2 needs the owner; and 3 more. The areas' trust floors would still require a full read.

Read ratio: not applicable until unblocked (336 changed lines). Generated 2026-11-14T23:39:15.145Z, base `32258fdb` → head `5dd36d19`, policy 2026-11-14.1 (illustrative thresholds). Full sheet: sheet.html

### Requirement
- **R1** (explicit) A MessagePackObject containing a dynamic member must not cause MessagePackGenerator to fail source generation with CS8785/NotSupportedException.
- **R2** (explicit) The reported reproduction should produce no messages, encompassing the shown generator CS8785 and analyzer AD0001 failures.
- **R3** (explicit) Nice-to-have: if such a failure still occurs, its error should identify which method is unsupported.
- **R4** (explicit) Optional suggestion: provide an IgnoreSourceGenerationIfUnknownAndIfAlreadyReportedUpstream attribute.

### What it touches
7 files, +336/−0: 2 source (11 lines), 1 test (29 lines), 4 test-snapshot (296 lines). Unexplained hunks: none.

### Claims (states computed from evidence)
- **argued** C5: The source changes leave all 167 pre-existing MessagePack.SourceGenerator.Tests cases that passed at base passing at head. — 2 resolved citation(s) and no run that supports it
- **proven** C1: QualifiedTypeName.Create now maps an IDynamicTypeSymbol to a QualifiedNamedTypeName representing System.Object instead of allowing that symbol to reach the default NotSupportedException arm. — test GenerationTests.DynamicMembers(keyAsPropertyName: False) passes at head and fails without the change
- **proven** C2: When a member's recorded type is exactly dynamic or dynamic?, serialization wraps the member access in an object cast before emitting the custom or resolved formatter call, preventing the member value from making that invocation dynamically dispatched. — test GenerationTests.DynamicMembers(keyAsPropertyName: False) passes at head and fails without the change
- **proven** C3: The new DynamicMembers theory runs source-generation verification for both keyAsPropertyName values over a dynamic field, dynamic property, dynamic array, and List\<dynamic\>. — test GenerationTests.DynamicMembers(keyAsPropertyName: False) passes at head and fails without the change
- **proven** C4: The committed outputs require object-cast arguments for direct dynamic member serialization in both array- and map-keyed formatters, while the generated resolver registrations erase dynamic within object\[\] and List\<object\>. — test GenerationTests.DynamicMembers(keyAsPropertyName: False) passes at head and fails without the change

### Checks
| Check | Status | Result |
| --- | --- | --- |
| `inventory` | passed | 7 files, +336/-0: 2 source (11 lines), 1 test (29 lines), 4 test-snapshot (296 lines). |
| `pattern-groups` | passed | No change recurs in 3 or more of the 4 repetitive files; nothing to group. |
| `public-surface` | passed | No public declaration, API file entry or diagnostic ID changed. |
| `tests-at-head:MessagePack.SourceGenerator.Tests` | passed | 2 of 2 changed tests pass at head. |
| `tests-without-change:MessagePack.SourceGenerator.Tests` | passed | 2 of 2 changed tests that pass at head fail without the change (discriminating). |
| `existing-tests:MessagePack.SourceGenerator.Tests` | passed | 167 pre-existing tests: 167 pass at both, 0 regressed, 0 newly pass, 0 fail at both; 0 removed at head. |
| `issue-reproduction` | failed | 0 of 2 code blocks in the requirement appear (ignoring whitespace) in added test lines. |
| `security-surface` | passed | Pattern scan found nothing; this is not proof that no vulnerability exists. |
| `citation-validation` | passed | 42 of 42 citations resolved; 0 dropped as unresolvable; 0 reference(s) to unknown requirements, evidence, tests or hunks dropped. |

### Not checked
- **Whether the exact reported program, using keyAsPropertyName: true without additional Key attributes or members, now produces neither CS8785 nor AD0001 under WarningsAsErrors.**: the AI reviewer could not decide: The added test is an expanded, modified reproduction and the issue-reproduction check found none of the requirement's code blocks. The trimmed without-change output reports only a source-file-list mismatch, not the original generator and analyzer exceptions, and the RunDefaultAsync implementation is not included to establish its analyzer and warning-as-error configuration.
- **Whether the fix has been demonstrated in the reporter's stated environment and release context.**: the AI reviewer could not decide: The requirement names version 3.1.12 and a netstandard2.0 target, but the evidence does not identify a test run using that package version, target framework, or the reporter's build configuration.
- **Whether generated dynamic-member formatters correctly round-trip arbitrary runtime values, including null, primitives, and custom MessagePack objects.**: the AI reviewer could not decide: The evidence runs generation tests and compares generated source, but supplies no runtime serialization or deserialization invocation or assertion.
- **absence of new vulnerabilities**: cannot be proven by any check here; the security surface scan only finds patterns. Always a human judgement.

### Refused to decide (owner must answer)
- **D1** The change represents dynamic as System.Object in the qualified-type model and generated resolver registrations, while retaining dynamic in emitted formatter type arguments and adding an object cast only at direct dynamic member access. Options: Map dynamic to System.Object in the model and resolver registrations, retain dynamic in formatter source, and cast direct member values to object (the approach in this change) / Introduce or retain a dynamic-specific QualifiedTypeName representation and defer erasure to object until particular emission or registration operations / Normalize dynamic to object consistently in both the model and emitted formatter source, rather than retaining dynamic type arguments. _Raised by the AI reviewer._
- **D2** The change is scoped to dynamic support: the generic unsupported-symbol exception remains without method context, and no IgnoreSourceGenerationIfUnknownAndIfAlreadyReportedUpstream attribute is added. Options: Implement only the dynamic crash fix and leave both optional suggestions for separate work, as this change does / Also add contextual information identifying the unsupported method or symbol to residual generation failures / Also design and add the suggested opt-out attribute for unknown types already reported upstream / Implement both optional suggestions together with the dynamic fix. _Raised by the AI reviewer._

### Suspected findings
- **F1** The added regression theory is not the requirement's minimal reproduction: it parameterizes keyAsPropertyName, adds Key attributes, and adds three members beyond the reported field. The issue-reproduction check consequently reports 0 of 2 requirement code blocks in added test lines, so the supplied evidence does not include an execution of the reporter's exact source. (`tests/MessagePack.SourceGenerator.Tests/GenerationTests.cs:32`, `tests/MessagePack.SourceGenerator.Tests/GenerationTests.cs:35`, `tests/MessagePack.SourceGenerator.Tests/GenerationTests.cs:42`, `tests/MessagePack.SourceGenerator.Tests/GenerationTests.cs:45`)
- **F2** The added coverage shown performs source-generation verification and snapshot comparison, but no added test invokes the generated formatter's Serialize or Deserialize methods. Runtime behavior for actual values stored in dynamic members is therefore not exercised by this change's tests. (`tests/MessagePack.SourceGenerator.Tests/GenerationTests.cs:49`, `tests/MessagePack.SourceGenerator.Tests/Resources/DynamicMembers(False)/Formatters.MessagePack.GeneratedMessagePackResolver.AnObjectFormatter.g.cs:15`, `tests/MessagePack.SourceGenerator.Tests/Resources/DynamicMembers(True)/Formatters.MessagePack.GeneratedMessagePackResolver.AnObjectFormatter.g.cs:40`)
- **F3** The implementation explicitly adds a dynamic? serialization branch, but every dynamic declaration in the new test source is unannotated. The supplied test evidence does not independently exercise that additional nullable spelling. (`src/MessagePack.SourceGenerator/CodeAnalysis/MemberSerializationInfo.cs:35`, `tests/MessagePack.SourceGenerator.Tests/GenerationTests.cs:36`, `tests/MessagePack.SourceGenerator.Tests/GenerationTests.cs:39`, `tests/MessagePack.SourceGenerator.Tests/GenerationTests.cs:42`, `tests/MessagePack.SourceGenerator.Tests/GenerationTests.cs:45`)

### Residual risk accepted by signing
- C5 (argued): The source changes leave all 167 pre-existing MessagePack.SourceGenerator.Tests cases that passed at base passing at head.
- That the change adds no vulnerability (cannot be proven here).

**Owner:** not signed. Owner identity is self-declared in this prototype.
