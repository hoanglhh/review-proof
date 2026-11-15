# Demo script

About 8 minutes. Everything shown is generated from real runs saved in `data/`; nothing needs the network.

**Before you start:** `node src/cli.ts serve`, then open http://127.0.0.1:4400. Keep a terminal open next to it.

## 0. The one line (20 s)

"Machines verify claims. Humans own decisions. Nobody reviews lines by default." The index distinguishes the four supplied samples, the independent holdout and the merged control. Use `/metrics?cohort=sample` for the original four; each metric view names its population. #2283 has already been confirmed and signed by its owner; the other original sheets retain their recorded state.

## 1. #2283 in depth (3 min)

Open **#2283**.

- **Verdict:** full read after the owner confirmed R4. Point at section 1: R1 to R3 quote the issue; R4 records the owner who accepted the interpretation. The original unconfirmed sheet was blocked.
- **The crash, proven (section 3):** five claims, all proven. Hover the reason: "test … passes at head and fails without the change." Explain the trick: we take the agent's tests, run them on the code *before* the fix, and they fail with the issue's own `IndexOutOfRangeException` (AD0001, CS8785). A test the agent wrote is only evidence if it can fail. Section 4 shows the runs: 3 of 3 new tests discriminate; 167 old tests pass at both commits.
- **What the AI refused to decide (section 6):** D1. The fix drops every analyzer diagnostic that is not located in the current compilation, so a consuming project is no longer warned about an unkeyed member of a type from another assembly, and the agent wrote that policy into the README. The issue did not ask for this. The AI lists the options and is not allowed to pick.
- **Ownership:** show the existing human confirmation and sign-off. Evidence supports targeted review, while the trust floor still requires full reading. Do not manufacture another confirmation or signature for the demonstration; any new human action belongs to the owner.

## 2. #2297: what grouping buys (1 min)

Open **#2297**. 237 files, 1392 changed lines. Section 2: 222 are test snapshots. Section 4, `pattern-groups`: 402 identical three-line insertions in 222 files (G1), and two snapshot files that deviate: one with a moved brace, one with an extra blank line. The verdict says that once unblocked, the evidence supports a **targeted read of 13%** of the changed lines: one exemplar per group plus everything that deviates. The trust floor still says full read, because no area has earned less. Only the owner may confirm R3; for a read-only demonstration, follow section 9's link to the simulated view where the areas have earned trust: the verdict becomes **Targeted read**, with a reading list of 183 of 1392 lines. That is the payoff of earned trust, and the band says it is simulated. The reviewer itself saw 20 of 423 hunks.

## 3. #2234: a one-sentence requirement (1 min)

Open **#2234**. The whole requirement is one sentence with no reproduction. The sheet is blocked three ways: two interpretations nobody has confirmed, and one requirement item no claim serves. Section 4: only 4 of the 8 new tests fail without the change; the sheet names the other 4 as proving nothing. Section 3: claim C7 is only **argued**: the model linked an old test about a different attribute, and the sheet shows why that is not proof (failure mode 6).

## 4. #2129: new public API forces a full read (1 min)

Open **#2129**. Five decisions were raised by the deterministic `public-surface` rule before the AI ran, one for each file whose public surface changed. Among them: the new public attribute `GeneratedMessagePackFormatterAttribute` and four new diagnostic IDs, MsgPack019 to MsgPack022. Both are permanent once shipped. Once unblocked, the evidence supports only a **full read** (public surface and build files changed). The AI adds D1: the design implemented is not one of the alternatives the issue proposed. The execution tests could not be built in the container even at base; the sheet says `not_run` and why, rather than pretending.

## 5. Calibration (1 min)

Open **How trust is measured** (`/metrics?cohort=sample`). In the SYNTHETIC panel: eight hand-written planted bugs. Seven of eight are caught by a run: undone fix, inverted filter, broken enum template, new public member, file-writing analyzer, a weakened test (named as no longer discriminating), and one meant to be untested that 4 old tests caught anyway. The eighth is the interesting one: a template source changed without its generated output. No test can catch it, and the scorer counts it **missed**. Open its sheet (`data/calibration/template-source-drift/sheet.html`, SYNTHETIC band): finding F1 says the `.cs` has the attribute but the `.tt` has no matching change. The reviewer saw it but could not cite the `.tt`, because it was not in the diff. We kept the number at missed, because the rule was set before the run (failure mode 7). Then open `/trust`: `generator-templates` has a `planted missed` entry and stays at full read. That is how a miss costs trust. Below it, the form to record an escape (a problem found after acceptance) sends any area straight back to full read.

## 6. The judges' three questions, answered from the screen (1 min)

1. **What would make you not trust your own output?** `docs/failure-modes.md`: a claim marked proven by an unrelated old test (#2234 C7, now argued); claims credited with tests they did not name; test output cut short before it reached the reviewer. Every one was found in our own runs and is fixed or shown.
2. **Who owns the decision?** Section 10: a named person, with an action and a reason. The reviewer has no approve button anywhere, and the server rejects a sign-off on a blocked or changed report.
3. **How would this scale?** Per-area trust (`/trust`): areas start at full read and earn lighter review through blind spot-checks; one miss resets them. The `SIMULATED` panel shows the rule on synthetic history. And everything repository-specific is one profile file; the pipeline code has no MessagePack in it.

## Separate evaluation — preserve the blind read

Before showing the holdout sheet, metrics, notes or results, send the owner directly to `/case/holdout/blind`. Let the owner read and record their own notes; no assistant fills the form. Reveal and compare only after that human submission. Selection and freeze records are under `data/evaluation/`; the author received no reviewer instructions, scoring key or feedback.

Open `/evaluation/control`: all three permitted candidates failed SDK resolution in the pinned image. Raw findings, model-raised decisions, unexplained hunks, broken claims and route are unavailable, not zero. Show the candidate logs and the empty control metric scope; do not present this as a completed noise measurement. A future merged control would be one assumed-clean case, not ground truth, and only the owner may judge findings.

Never combine the four samples, holdout, control and eight planted defects into an unlabeled success rate. The concept card explains the cost to shared code knowledge, the current human-signature boundary, the absence of real escape data and the missing undo assessment.

## Optional v2 follow-up (separate evaluation)

1. Use a supplied sample, not the holdout. Open its live sheet and explain “Observed in a discriminating test”; show the named test and the warning about claim breadth.
2. Open Explanation coverage. Trace one hunk to its claim or decision and the reason it requires attention. State that this is not correctness coverage.
3. Open `/case/2283/experiment`. The human chooses method and prior exposure, starts the timer, switches phases, and records what remains unresolved. Do not populate the exercise on the human's behalf.
4. Open `/evaluation/experiments`. Report observations and denominators; do not claim causal speedup or stable incident rates.
5. Show `/evaluation/context-v2/2283` and its retrieval manifest if available. Explain the bounded lexical search and omitted context.
6. Show `/evaluation/control-v2`, separate from the frozen control result. Only the human judges false alarms.
