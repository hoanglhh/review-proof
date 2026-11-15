# Independent human finding judgments

`/case/<id>/findings` accepts a person's assessment of one finding even when the report is blocked. It does not sign the change, confirm a requirement, reproduce the finding automatically, or earn trust. The live sheet links to this page through **Judge findings**.

Each submission records the report hash, finding ID, statement and citation snapshot, self-declared reviewer, judgment, explanation, supporting evidence and timestamp. Real problem and not a problem require supporting evidence; not sure can leave that field blank. Evidence is the person's account, not an independently verified test result. Forms reject stale hashes, unknown finding IDs, duplicate or unexpected fields, invalid choices, missing declarations and oversized values. The server reloads the report after receiving the full POST body so a report update during submission cannot validate an old version.

Only same-origin POST requests persist records. Each record is a new numbered JSON file under `data/finding-feedback/`; earlier judgments remain available. Corrections use the same reviewer name and append a new record. Names are unauthenticated, so this does not establish reviewer identity or independence. The local server is the single writer; do not run multiple writers against the same data directory.

## Summary policy

`/evaluation/findings` defaults to supplied samples and user submissions. Explicit cohort links separate the holdout and control. Complete a holdout blind read before exposing its findings. Planted defects and separate context/control follow-ups are not included in this summary or mixed into its denominator.

Each current finding counts once. Within that report version, only the latest appended judgment from each trimmed, case-insensitive reviewer name counts. Opposing decisive judgments are **disputed**. Otherwise any not-sure judgment makes the finding **uncertain**; only unanimous decisive judgments are categorized as real problem or not a problem. No current judgments means **unjudged**. Raw, superseded, stale-version and out-of-scope record counts remain visible.

These are human judgments, not verified correctness labels or a statistical false-positive rate. Existing optional feedback recorded during sign-off keeps its original metric and is not silently pooled with the new records. The original frozen reports, raw model output and benchmark aggregates remain separate.

## Validation

`test/finding-feedback.test.ts` checks validation, escaped rendering, immutable citation snapshots and summary denominators. `test/evaluation-workflows.test.ts` exercises same-origin restrictions, blocked-report feedback, stale requests (including report updates during request arrival), append-only corrections, and separation from real sign-offs, confirmations and trust. Successful POST tests operate only in temporary synthetic repositories.
