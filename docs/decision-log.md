# Decision log

Short, dated entries. Newest last.

## Seeded from the design brief (2026-11-14)

- **No numeric risk score.** Tieto rejects scores nobody can explain, and a weighted sum lets one critical factor be averaged away. Review depth comes from fixed rules that name their reasons.
- **The reviewer cannot approve.** No command, flag or default creates a sign-off; only a named human submitting the form does.
- **Tieto's four branches instead of invented pull requests.** Real agent-written changes to a real library, each pinned to a commit.
- **Command line plus static page instead of a web application.** One person must build and explain it; JSON files are the interface between stages.
- **.NET runs only in the repository's pinned container** (`mcr.microsoft.com/dotnet/sdk:8.0.402-jammy`), never installed on the host. The agent's code is untrusted.
- **Four claim states, no percentages:** `proven`, `argued`, `not_checked`, `broken`, computed by code from evidence records.
- **The scoring key is kept from the reviewer.** It lives in `labels/`, which the reviewer module never reads.

## Build decisions

- **2026-11-14: TypeScript run directly by Node 26 (type stripping), no build step.** One runtime dependency (`zod`, for validating reports and model output). Fewer moving parts to explain.
- **2026-11-14: Run the whole affected test project three times** (head; base; base source with the head's test files) instead of filtering by test name. New tests are found from the results (present at head, absent at base), so the pipeline does not need to parse test code. Known limit: a test whose code was edited but whose outcome did not move is not identified as changed.
- **2026-11-14: Every check states its assertion, and `passed`/`failed` refer to that assertion.** Example: `public-surface` asserts "no public declaration, API entry or diagnostic ID changed", so `failed` means "public surface changed, a human must own it", not "the change is wrong". This keeps four statuses without inventing new ones.
- **2026-11-14: Zero-context hunks (`git diff -U0`) are the unit** for claims, unexplained code, the reading list and the read ratio, because they count exactly the changed lines.
- **2026-11-14: Repository-specific facts live only in `profiles/<name>.json`**, including the test-result format (`trx`), which selects a parser. A unit test fails if corpus names appear in `src/`.
