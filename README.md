# ReviewProof

**Machines verify claims. Humans own decisions. Nobody reviews lines by default.**

ReviewProof is a reference implementation for Tieto's Junction 2026 challenge "Earned Trust in AI Code". For each agent-written change it produces a one-page sign-off sheet: what the change is for, what it touches, which of its claims were proven by a run, which choices it made that no test can settle, what was not checked and why, and how much of it a person still has to read. The AI reviewer never approves anything. A named person signs, and only through the sign-off page.

It runs on the four agent-written changes Tieto supplied to [MessagePack-CSharp](https://github.com/te-industry-tech-office/junction26-messagepack-csharp) (requirements: upstream issues #2283, #2234, #2129, #2297).

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
- `cases.json`: the four changes. `policy.json`: thresholds (illustrative, unvalidated).
- `data/`: reports, the evidence they cite, sign-offs, the trust record. `.work/`: clone, worktrees, caches (git-ignored).
- `docs/`: concept card, lessons log, decision log, failure modes, demo script.
