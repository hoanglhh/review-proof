# ReviewProof

**Evidence guides review. Humans own decisions.**

## Recommendation

Replace line-by-line review as the default starting point with a requirement-linked evidence report. For each AI-written change, show what changed, what checks support it, what remains uncertain and what a named engineer must decide. Reduce reading only when both the evidence and the affected areas’ trust history justify it; otherwise require a full read or block acceptance.

## How it works

**Requirement → pinned change → checks and AI analysis → computed review route → human decision.**

The AI proposes claims, findings and unresolved decisions. ReviewProof checks citations against the exact source revision and derives evidence states from recorded checks. A named test passing with the change and failing without it supports that tested behavior—not every word of the linked claim. Explicit rules select light, targeted, full or blocked review and explain why. The human resolves interpretations, answers decisions and records a reasoned sign-off tied to the report version.

## Principles

- **Evidence over confidence.** Inspect source citations, named tests, logs and unavailable checks; model confidence never grants approval.
- **Visible uncertainty.** Separate observed behavior, arguments, missing support and contradictions. Unexplained changes remain visible.
- **Risk determines depth.** Public API and security-sensitive changes require full reading. Failing checks and unresolved requirements can block acceptance.
- **Trust must be earned and reversible.** Areas begin at full read, can earn lighter review through clean blind spot-checks, and reset after a recorded miss or escape. Thresholds are illustrative.
- **Accountability stays human.** AI provides advice. A named engineer owns the interpretation and acceptance decision.

## Reference implementation

For **MessagePack-CSharp requirement #2283**, the report connects the generator/analyzer crash fix to discriminating tests. It also exposes a policy decision: should diagnostics for types outside the current compilation be suppressed? The human must own that choice. A real confirmation and acceptance are recorded, while the effective route still requires full reading.

Backend samples demonstrate test and regression evidence. Separate synthetic frontend fixtures demonstrate keyboard access and error recovery; security fixtures demonstrate a discriminating ownership-denial check. Usability, access policy and acceptable residual risk remain human judgments.

## Measurement and limits

The prototype reports route shares, citation validation and test discrimination with explicit denominators, and provides separate human finding judgments and blind spot-check records. Synthetic calibration caught **7 of 8 planted defects through checks**; this is not a real-world detection rate.

Under **simulated earned trust**, #2297 selects **183 of 1,392 changed lines (13%)** for reading. The real route remains full read. Reduced reading, safer acceptance without a full read and faster review have not been established. Human review time is not collected; review duration, time to merge, reverts and incidents need a separate study or pull-request telemetry.

## Trade-offs

Strict citation checks can discard valid concerns. Weak tests limit what evidence establishes. Reading less can reduce shared knowledge. Trust thresholds are unvalidated, identity is self-declared, and the execution environment is not a complete defense against malicious code. This reference implementation records decisions; it does not merge changes.
