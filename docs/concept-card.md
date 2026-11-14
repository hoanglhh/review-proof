# ReviewProof — concept card

**Machines verify claims. Humans own decisions. Nobody reviews lines by default.**

## Recommendation

Give each agent-written change an evidence-backed sign-off sheet: testable **claims**, **decisions** the requirement leaves to a person, and **unexplained changes**. A named owner reads the unresolved parts, answers the decisions and signs; full reading remains the fallback.

## Principles

- **Explain the route.** Fixed rules choose light, targeted, full or blocked review with visible reasons; a numeric score cannot average away a blocker.
- **Validate evidence.** Resolve citations against the stated commit and save prompts, responses and run logs. The model proposes links; code computes `proven`, `argued`, `not_checked` or `broken` from evidence.
- **Challenge the tests.** Run head tests against both head and base implementation. `proven` means a named test passes with the change and fails without it, not that its assertions cover the whole claim.
- **Keep judgment human.** Surface requirement interpretations, design choices and public API commitments with their options; the reviewer cannot approve them.
- **Use per-area trust as a circuit breaker.** Areas start at full read, earn lighter review through blind spot-checks, and reset on a recorded miss or escape; our thresholds are illustrative and we have no real escape data. Anthropic's [15 October 2026 article](https://claude.dev/blog/solving-code-review-at-anthropic/) says its team does not yet have circuit breakers that automatically tighten approvals when revert or incident rates rise (paraphrase).

## Evidence versus judgment

| Domain | Checks can establish | A person must own |
| --- | --- | --- |
| Backend | Tested behavior, regressions, expected output | Intended behavior, API commitments, design |
| Frontend (not built) | Rendering, screenshot and accessibility checks | Usability, wording, visual judgment |
| Security | Sensitive patterns; dependency checks are planned | Whether remaining security risk is acceptable |

## Practicality and measurement

Profiles supply commands, file classes, sensitive patterns and area owners. On the **four supplied samples**, verification took 1–2.6 minutes and one AI call took 3–4.5 minutes per change; independent jobs can run separately. Track review time, finding feedback, route shares and blind-review misses with denominators; reverts, incidents and time to merge remain without real data. Planted-defect calibration is separate from real outcomes.

## Trade-offs

- Starting at full read costs time; weak tests give little benefit, and ambiguous requirements need human clarification.
- Requiring resolvable citations can discard a valid concern; grouping repeated edits reduces reading but does not verify behavior.
- **Less diff reading means less shared knowledge of the codebase; blind spot-checks only partly replace it.**

## Limits

- **No change merges without a named human signing.** That boundary could move only with one-step undo, real escape data behind the trust record, and approval requirements that tighten automatically when escapes rise; this prototype does not merge changes.
- **Undo difficulty is absent from the sheet**, except that a public API change forces a full read.
- Findings remain suspected; valid citations do not establish truth, and a discriminating test does not validate the breadth of its linked claim.
- Four samples and planted bugs do not establish safety at scale. New languages need result parsers and surface patterns; owner identity is self-declared.
- Containers have network and work-directory access: hostile code could forge results or poison caches. Evidence addresses careless agents, not malicious ones; no check proves the absence of vulnerabilities.
