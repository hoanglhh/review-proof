# New assessment flow

Users start an assessment from `/assess`, using repository path or HTTPS GitHub URL, base/head revisions, requirement text and a named owner. Supplied samples can prefill the form into a distinct run. Repository profiles are trusted application configuration; commands cannot come from form text or model output. Code-inspection-only mode is the default, with no test execution.

Resolve and pin revisions, register each immutable submission under `data/submissions/<id>/`, and run existing CLI stages sequentially in a child process. Persist stage status and a bounded log; a progress page polls status and links the validated report on completion. Missing model configuration and failed/inconclusive checks remain truthful outcomes. Existing benchmark manifest, reports and frozen pipeline modules remain unchanged.

## Implementation plan

- [x] Test input validation, pinned revision registration and catalog isolation in temporary repositories.
- [x] Add submission catalog loading and trusted profile snapshots, reusing existing pipeline stages.
- [x] Add background stage runner and progress display with restart interruption handling.
- [x] Add accessible submission form and sample-prefill links using existing styles.
- [x] Test successful submission, progress, errors, same-origin protections and real diff extraction in an isolated fixture; verify no human records or benchmark changes.
- [x] Run unit tests, inspect desktop/mobile pages, and commit locally without pushing.

Limits: local-only server, local Git paths and HTTPS GitHub repositories; one active job at a time; no arbitrary verification commands; requirements are required by the existing evidence model. Timing and model stages show actual status, never estimated completion percentages. Progress logs are capped; complete check logs remain in report evidence. A server stop interrupts its child process and marks the job interrupted.
