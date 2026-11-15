# Targeted reading followed by full-diff comparison

This is an observational human reading exercise. It does not change the real review route, sign off a change, accept it, earn trust, or authorize skipping code. A case whose real route is full or blocked keeps that route and its requirements.

1. Open `/case/<case-id>/targeted`. Enter your name and declare prior exposure to the change, source, full diff, sheet, discussion, or other reviewers’ notes.
2. Read the requirement, the current route’s reading-list hunks, and their linked claims, decisions, findings, and evidence summaries. Named tests and log links are included where recorded. The list already selects representatives for grouped identical hunks. Citation quotes outside the selected changed-line ranges are withheld. Omitted changes are not evidence of safety.
3. Record findings and notes, unresolved questions, and whether a full read is needed. Use `None` where appropriate. Confirm that you personally did the reading, then save.
4. The server saves the initial observation before redirecting to `/case/<case-id>/targeted/<record-id>`. The saved initial notes remain locked. The server must require the saved case and report hash to match the current report before showing the comparison.
5. On the comparison page, read all changed-line hunks in the full diff. Record added findings, remaining questions, and whether further full reading is needed. Explicitly attest that you personally read the full changed-line diff and that the assessment is yours.
6. Save the separate comparison. It must not overwrite the initial observation or an existing comparison.

The full diff contains changed lines, not complete source files, unchanged context, or repository inspection. Binary changes require separate inspection. Follow the actual route and inspect source, callers, evidence, and tools as needed.

## Interpretation

Reading material is available immediately, with no Start/Pause controls, page-focus tracking, duration fields or stopwatch requirement. Save initial notes before the server reveals the full-diff comparison. Review time is not collected; existing records remain unchanged on disk, including any historical timing fields, and the current views ignore those fields.

`/evaluation/targeted` retains initial observations, declared exposure, repeat records, unfinished comparisons, and saved comparisons. First-read summaries use only the earliest record for each self-declared reviewer and case when that record declares no prior exposure. Reviewer names are trimmed and compared without case. This is not verified identity. Prior exposure on an earlier record prevents a later repeat from becoming a first-read observation.

The full-diff summary uses exactly one case-and-hash-matching comparison per eligible initial record and displays the completed/eligible denominator. Missing, duplicate, or mismatched comparisons are excluded from that summary and remain visible in the records. Report hashes appear on each initial and comparison row for version traceability.

This is sequential reading: the full-diff stage benefits from the targeted stage. Neither stage is an independent control. These records establish no time savings, defect-detection rate, safety result, acceptance decision, or trust promotion. Additional findings are the human’s own text, including an explicit `None`; they are not an automated judgment of missed defects.

## Module and persistence boundary

`src/targeted-experiment.ts` validates forms, constructs records, and renders pages; it performs no filesystem writes. The server owns origin checks, request-body limits, case eligibility, current report hashing, safe generated IDs, loading records, and append-only persistence. The server must finish saving the initial record before redirecting, reject stale comparison pages, and prevent repeat saves of a comparison. Only real eligible case reports belong in this exercise; holdout, planted, and control material are excluded by the server.

Forms reject duplicate or unexpected fields, stale hashes, missing human declarations, invalid choices, missing notes/questions, names over 120 characters, and text over 4,000 characters. Removed timing fields are rejected as unexpected fields. Submitted hunk selections are never accepted; initial records derive them from the current report’s reading list.

The form validators do not detect previously persisted submissions because they have no storage access. That append-only check belongs to the server. Human reading declarations are self-reported and can be forged; they must never serve as review authorization.

Run the isolated module checks with `node test/targeted-experiment.test.ts`. They use synthetic untimed form records, with no real human, model, Docker, or repository-review calls.
