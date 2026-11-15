# Follow-up improvements (v2)

> Update (2026-11-15): The user subsequently requested removal of human review timing. The current implementation retains untimed observations and reading comparisons; the original timing design below is historical. See [targeted review](targeted-review.md).

Implement the approved improvements without changing the frozen review experiment.

1. Clarify evidence labels and expose claim/decision/hunk explanation coverage in the live sheet. Preserve machine states, routes, stored reports and original static sheets.
2. Provide an explicit, human-started timed exercise with phase durations, prior exposure, evidence-opening tally, unresolved questions and full-read need. Store observations separately; never imply a sign-off or earned trust.
3. Add an opt-in reviewer with bounded unchanged-source context, retrieval reasons and omissions. Save a distinct prompt, response and validated report; never rerun the holdout.
4. Predeclare an environment-repair control experiment, use a compatible trusted SDK, and preserve the original failed-control evidence. Count output without assigning human false-alarm labels.
5. Test new logic, load new pages, verify frozen hashes and existing human records remain unchanged. Never push.

Use existing modules, styles and dependencies. The alternative of modifying the original reviewer would invalidate the fixed evaluation; duplicated pipelines would make results harder to compare. Keep the follow-up entry points thin and reuse validation and assembly.

Timing measures observed effort, not causal speedup. Explanation coverage is not correctness coverage. Lexical retrieval is not full repository understanding. A merged control is only assumed clean; a human must judge its findings.
