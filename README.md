# ReviewProof

**Machines verify claims. Humans own decisions. Nobody reviews lines by default.**

ReviewProof is a reference implementation for Tieto's Junction 2026 challenge "Earned Trust in AI Code". For each agent-written change it produces a one-page sign-off sheet: what the change is for, what it touches, which named tests distinguish the changed behavior, which choices it made that no test can settle, what was not checked and why, and how much of it a person still has to read. The AI reviewer never approves anything. A named person signs, and only through the sign-off page.

Its original evaluation corpus is the four agent-written changes Tieto supplied to [MessagePack-CSharp](https://github.com/te-industry-tech-office/junction26-messagepack-csharp) (requirements: upstream issues #2283, #2234, #2129, #2297).

## Look at it without running anything

Open the saved sheets in a browser: `data/cases/<id>/sheet.html`. The Markdown version, `sheet.md`, is what would be posted as the pull-request comment. Each sheet shows when it was generated.

## Prerequisites

- Node 26 or later (TypeScript runs directly; no build step). Run `npm install` once.
- Docker. The agent's code is built and tested only inside the repository's own container image (`mcr.microsoft.com/dotnet/sdk:8.0.402-jammy`), as your user, with only `.work/` mounted. No .NET SDK on the host.
- For the AI step: an OpenAI-compatible endpoint in a git-ignored `.env`:

  ```
  OPENAI_BASE_URL=https://…/v1
  OPENAI_API_KEY=…
  REVIEWPROOF_MODEL=…
  ```

  Without it the pipeline still runs; sheets say the reviewer did not run and stay blocked.

## Commands

```bash
node src/cli.ts all 2283          # ingest, check, review, assemble: report + sheet for one change
node src/cli.ts serve             # http://127.0.0.1:4400: sheets, signing, blind spot-checks, trust record, metrics
node src/cli.ts calibrate         # planted bugs (synthetic): how many does the pipeline catch?
node src/cli.ts metrics           # trust measures from data/, also at /metrics
node src/cli.ts simulate          # synthetic trust history, shown under a SIMULATED banner
npm test                          # unit tests
```

Stages can be run alone: `ingest`, `check [--fresh]`, `review [--fresh]`, `assemble`. Test runs and model responses are saved and reused (the model response by prompt hash), so once the corpus is cloned into `.work/`, `all` re-creates a report in about a second with no model call. A fresh checkout clones the corpus first, which needs the network.

## What is real and what is synthetic

| Real | Synthetic, and labelled wherever shown |
| --- | --- |
| The four agent changes, pinned to commits | Planted bugs in `calibration/` (sheets carry a SYNTHETIC band) |
| Requirements: issue snapshots saved with retrieval time | The simulated trust history (`data/trust/simulated-events.jsonl`, SIMULATED banner) |
| Every test result: container runs on this machine, logs and TRX files in `data/cases/<id>/runs/` | |
| Every model response, saved raw with its prompt in `data/cases/<id>/review/` | |
| Sign-offs, confirmations and spot-checks: only what a person submitted | |

The scoring key in `labels/` was drafted by an AI model from reading the diffs and is not confirmed by a human. The reviewer never sees it; a test checks every prompt that was sent.

## Two things to try in the app

- **What earned trust buys:** every real sheet links to a simulated version (`/case/<id>/earned`, or `sheet-earned.html`) in which the areas have passed their spot-checks. It shows what the owner would have to read once trust is earned, for example 13% of #2297. It is marked SIMULATED and cannot be signed.
- **An escape:** `/trust` has a form to record a problem found after a change was accepted. The area drops back to full read and every sheet is re-assembled.

## Where things are

- `src/`: the pipeline. Nothing repository-specific is in it (a test enforces this).
- `profiles/messagepack-csharp.json`: everything specific to this repository: container, test command, file classes, public- and security-surface patterns, areas and owners.
- `cases.json`: pinned comparisons and their evaluation cohort (`sample`, `holdout`, or `control`). `policy.json`: thresholds (illustrative, unvalidated).
- `data/`: reports, the evidence they cite, sign-offs, the trust record. `.work/`: clone, worktrees, caches (git-ignored).
- `docs/`: concept card, lessons log, decision log, failure modes, demo script.

## Evaluation cohorts

The four Tieto samples are **supplied samples**; the independently authored **holdout** is separate, and the planned upstream merged **control** has its own availability record. Neither is a planted bug. Selection rules and frozen-file hashes are in `data/evaluation/protocol.json`; selection snapshots and run records live alongside it. Cohorts do not enter the model prompt or routing rules.

The index, sheets and blind pages identify each cohort. `/metrics` lists exactly which case IDs every non-calibration aggregate includes; use `?cohort=sample`, `?cohort=holdout`, or `?cohort=control` for separate views. Calibration names its own planted cases and never shares their denominator with these comparisons. Counts of findings, model-raised decisions, unexplained hunks and broken claims do not establish false positives: the owner marks findings when signing.

Do not rerun the holdout review with `--fresh` or tune the prompt/rules after observing it. For a blind read, go straight to its `/case/<id>/blind` address before opening its sheet, metrics or evaluation artifacts. Human sign-offs, confirmations, spot-checks and finding marks remain the owner's actions.

### Reproduce the local holdout input

The holdout head exists only on branch `submission-holdout` in `.work/repos/te-industry-tech-office__junction26-messagepack-csharp`; it was never pushed. `data/evaluation/holdout-author.json` records its base/head and patch hash. On another checkout, create a branch at the recorded base, apply `data/evaluation/holdout.patch` with `git apply --index`, and commit locally. The recreated commit may have a different SHA; update the case head if reproducing inputs. Do not rerun the submitted model review: use its saved report for the fixed evaluation.

The submitted blind-review entry point is `/case/holdout/blind`. Run the local server before opening it; avoid the ordinary sheet and metrics until after the blind read.

### Frozen control availability

The three permitted candidates (#2279, #1818, #1802) failed SDK resolution in the frozen .NET 8.0.402 image: they require 10.0.300, 8.0.201 and 8.0.201 respectively. No fourth candidate, SDK substitution or control AI review was attempted. **All requested control counts and its route are unavailable, not zero.** No control report enters the reviewed-case aggregates; the manifest currently holds four samples and one holdout.

Open `/evaluation/control` for the six head-project run records/logs and the stop reason. `data/evaluation/control-selection.json` records merge ordering, closure evidence and candidates; `control-path-screening.json` records path exclusions. Any completed follow-up control is still only one case assumed clean because it was merged and not known reverted; only the owner may mark findings false. The selected source inputs were not modified to make a build pass.

## Follow-up improvements (v2, separate from the frozen evaluation)

The live sheet now labels the legacy `proven` state **Observed in a discriminating test**: the named test passes with the change and fails without it. This does not establish the full wording of the linked claim. The original JSON states, routing, prompts and saved static sheets remain unchanged. An explanation-coverage table maps every hunk to claims, decisions and reasons for attention; coverage is not correctness or measured time saved.

- `/case/2283/experiment`: start a human review exercise explicitly, choose sheet or diff, declare prior exposure, and track reading, evidence, code and decision time. Record evidence openings and remaining questions. This saves an observation, never a sign-off or trust event.
- `/evaluation/experiments`: observations with explicit denominators. Prior-exposure reads are separated; a single-person repeated read is not a controlled speed comparison. External tools/tabs are outside the page timer; an optional human-timed external duration is stored separately, with blank meaning not measured.
- `node src/review-v2.ts 2283 --prepare`: prepare bounded unchanged-source context and a distinct prompt without calling the model. `--run` executes a separate review; see [context v2](docs/context-v2.md). The holdout is excluded.
- `/evaluation/context-v2/2283`: read-only follow-up report after a successful run. Follow-up outputs never enter the original metrics or trust record.
- `/evaluation/control-v2`: the separate environment-repair control experiment, including an explicit unavailable outcome if it cannot finish. The original three-attempt control result at `/evaluation/control` remains unchanged.

The human must perform the timing exercise and judge findings. No timings, correctness labels, sign-offs or spot-checks are manufactured by setup or tests. See [follow-up design](docs/improvements-v2.md).

The separate v2 control completed: 4 raw findings (4 citation-validated), 4 model-raised decisions, 1 unexplained hunk, 1 broken claim; route blocked. These are not false-positive judgments. Its head tests passed, but upstream snapshot comparison is disabled; see [control evidence and limitations](docs/control-v2.md).

## Assess your own change without editing JSON

Start `node src/cli.ts serve` and open **Start a new assessment** on the home page, or go directly to `/assess`.

Enter an absolute local Git repository path or a public HTTPS GitHub repository URL, base/head branches or commits, the intended requirement, and a human owner. Select **Code inspection only** to assess an unfamiliar repository without running executable checks. To run tests, choose an installed trusted repository profile and confirm that it applies. The owner is recorded for the submitted change; starting a run never signs it.

Click **Start assessment**. The progress page shows repository resolution, diff ingestion, verification, AI review and report assembly, with live logs. Once complete, open the report; its route may still be blocked or require a full human read. Docker is needed only for executable verification; the configured model endpoint is needed for AI findings. Without model configuration, the pipeline produces a truthful unavailable/blocked report.

To try a supplied sample, click **Assess a copy** next to its saved report. This prefills a new submission and leaves the original assessment intact. Enter your name and verify the selected profile before starting. No manual `cases.json` change or terminal pipeline command is needed.

Submissions are registered under `data/submissions/<generated-id>/`, with a snapshot of the chosen profile and pinned commits. Each source comparison is cloned into its own directory under `.work/submission-repos/`; the report names that isolated source snapshot, while the progress page and submission metadata retain the original repository. Their evidence and report use `data/cases/<generated-id>/`. Trust area names are scoped to the source repository, so unrelated repositories cannot inherit each other’s earned trust. They are labelled **User submission**, with their own metrics filter (`/metrics?cohort=submitted`); every aggregate lists its case scope. `cases.json` remains the fixed benchmark manifest. One assessment runs at a time. Keep the server running; an interrupted run is recorded as interrupted and can be retried by submitting again.

The expanded-context v2 CLI remains a separate sample-only experiment; ordinary submissions currently use the original generic reviewer and its changed-file context. Requirements are mandatory in this first form because the existing review model checks evidence against stated intent.

## Automatic verification setup

Start a new assessment and choose **Automatic**. The app checks for a matching verified setup; if none exists, it detects a plan from the pinned head and pauses the assessment with a **Review verification plan** link. You can also prepare plans separately at `/setups`. Detection reads committed configuration without executing repository scripts. Supported .NET and npm templates show runtime/image proposals, literal commands, npm script sources, observed configuration fingerprints and unsupported coverage.

Review the plan, name the person trusting its execution, and click **Trust plan and run baseline**. This is permission to run repository checks, not acceptance of a code change. The baseline runs in a separate non-root container workspace with restricted resources; restore may access the network and check commands may not. Image tags resolve to recorded immutable digests. Only a successful baseline becomes reusable.

After a linked baseline passes, the original assessment continues automatically with its pinned commits and entered requirements. Existing verified plans are reused without another trust prompt. The repository identity and relevant configuration at the submitted head must match. Full configured head commands are executed and their logs/outcomes appear as evidence. Failures, unavailable execution or removed verification evidence prevent signing. These checks do not claim per-test counts, base/head regression discrimination or proof of claim assertion scope.

Mixed stacks, npm workspaces, alternative package managers, explicit npm-version requirements, ambiguous runtime versions and unsupported configurations remain explicit. Existing installed profiles and inspection-only mode remain available. Writable container mounts are not disk-quota limited. See [setup design and limits](docs/automatic-setup.md).

Automatic setup waiting is in-process: keep the server running. Stopping it marks the pending assessment interrupted; no waiting execution plan is run automatically on restart.
