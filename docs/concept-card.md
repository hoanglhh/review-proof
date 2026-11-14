# Concept card: ReviewProof

## Recommendation

**Machines verify claims. Humans own decisions. Nobody reviews lines by default.**

Line-by-line review is replaced by a one-page sign-off sheet per agent-written change. The sheet splits the change into three piles. **Claims** are statements a run can test ("the crash no longer happens"); the pipeline tries to break each one. **Decisions** are choices the requirement left open that no test can settle; the AI must list them with their options and is forbidden to judge them. **Unexplained** code maps to neither and is scope drift. A named owner reads what the evidence could not settle, answers each decision, and signs. Reading every line is the fallback, not the default.

## Principles and what each one handles

| Principle | Risk | Hallucination | Transparency | Confidence | Quality |
| --- | --- | --- | --- | --- | --- |
| **Risk is what remains unproven or unowned.** No numeric score anywhere. | Fixed rules route a change to light, targeted, full read, or blocked; each rule names its reason. | | The sheet shows every reason code. | | A blocker cannot be averaged away by many passing tests. |
| **Nothing the model says is evidence.** | | A citation must quote text found at the stated file, lines and commit, or it is dropped and counted. | Raw model responses are saved with their prompt. | | |
| **Four states, computed by code.** `proven` (a run supports it and that check was shown able to fail), `argued`, `not_checked`, `broken`. | Not-proven claims become the residual risk the owner accepts by signing. | The model links claims to evidence; it never sets a state. | Each state shows the test or reason behind it. | Replaces "high confidence" and percentages. | |
| **Tests must be shown able to fail.** The head's tests are run again on the base source. | | | A test that passes either way is named as proving nothing. | Separates real evidence from agent-written tests that only pass. | Catches weakened tests. |
| **The AI refuses to decide.** Requirement gaps, design choices and public API go to the owner. | Public API and security-sensitive changes force a full read. | | Each decision lists the options and who raised it (a rule or the model). | | |
| **Trust is earned per area and lost quickly.** Every area starts at full read; blind spot-checks that find nothing the reviewer missed unlock lighter review; one miss resets it. | Lighter review must be earned, never assumed. | Reviewer misses found by people feed the record. | The trust record is append-only and shown per area. | | |

## What a run can prove, and what always goes to a person

| Domain | Can be proven by a run (when tests exist and can be shown able to fail) | Always a human decision |
| --- | --- | --- |
| Backend | Behaviour fixed or added (tests fail without the change, pass with it); no regression in existing tests; checked-in expected output matches what the code emits | Whether the behaviour is the right one; public API and diagnostic IDs (permanent once shipped); design choices the requirement left open |
| Frontend (registry slot, not built: the corpus has no UI) | Changed views render and match approved screenshots; automated accessibility rules pass | Usability, wording, visual judgement, whether the design meets the need |
| Security | A known-vulnerable dependency version is present (planned check); a pattern scan finds process, network, file or reflection-emit use, unsafe code, secret-like strings (forces full read) | That the change adds no vulnerability: absence cannot be proven. A clean scan is shown as "found nothing; not proof" |

## Trade-offs

- Every area starts at full read, so early changes are slower than today's skim. Speed has to be earned.
- A repository without runnable tests gets little benefit: claims stay `argued` and the route stays full.
- A vague requirement blocks the change until a person confirms what it means. That is slower, and it is the point.
- Showing only findings backed by a resolvable citation can hide a true concern the reviewer could not pin to a line.

## Limits

- Absence of a vulnerability cannot be proven by anything here.
- Planted bugs are hand-written and synthetic; catching them is not catching real bugs.
- Four changes show the method, not safety at scale.
- Each repository needs a profile and a test suite that runs in a container. Each new language also needs its own result parser and surface patterns.
- `proven` means the named test discriminates. It does not check that the claim's wording is no broader than the test.
- Owner identity is self-declared in this prototype. In a real pull-request flow it comes from the Git host account and code owners.
