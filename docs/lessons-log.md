# Lessons log

What building and running ReviewProof on Tieto's four agent-written changes taught us. Each lesson points to where it showed up.

1. **An agent's passing tests are weak evidence until they are run without the change.** Running the head's tests on the base source is the cheapest strong check we found. On #2234, 4 of the 8 new tests pass with or without the change and prove nothing about it. On #2283, #2297, and in #2129's generator tests, every changed test that could be run failed without the change (#2129's execution tests could not be built at all). (`tests-without-change` in each sheet.)

2. **The model is good at spotting decisions; it must not be trusted with links.** The reviewer never saw the scoring key, yet it raised as decisions the choices the key lists: #2283 dropping warnings for referenced types, #2234's duplicate-key behaviour applied to all types, #2129's design outside the issue's three options, #2297's preprocessor guard and missing setting. (The key was drafted by another model reading the diffs and is not yet confirmed by a person, so this is an observation, not a recall figure.) But twice the way it linked claims to evidence would have produced `proven` for something no run showed. Only a named test that fails without the change may prove a claim. (Failure modes 3 and 6.)

3. **Exit codes and log text lie about test results.** The test tool reported `Build FAILED` when the build had succeeded and three tests had failed. Pass/fail comes from the result file only. (Failure mode 1.)

4. **What the reviewer is shown decides what it can find.** Trimmed test output hid a side effect from it (failure mode 2). A planted bug that *removed* a change was invisible as a diff, and the reviewer could only infer it from a mismatch (failure mode 7). The reviewer reviews the material; the material has to be complete.

5. **File counts mislead; grouping fixes it.** #2297 changes 237 files, but 402 of its hunks are one identical three-line insertion. Reading one exemplar per group plus every deviating file is 13% of the changed lines. Two snapshot files deviate; the brief's estimate from reading the diff said one.

6. **"Blocked" is the honest default for agent-written changes.** All four sheets are blocked on a requirement reading only a person can confirm. That costs one human confirmation per change, and it is where accountability starts: the owner owns what the change was supposed to do, not only what it does.

7. **Trust cannot start from a random draw.** If every area starts at full read and spot-checks are drawn only from lighter routes, no area ever earns anything. A blind read can be started from any sheet; while an area is at full read, doing that read blind costs nothing extra. (Decision log, "How an area starts a track record".)

8. **Test the calibration, too.** A planted bug meant to be untested was caught by four existing tests. A planted bug no test could catch was described by the reviewer, but our scorer, fixed before the run, did not credit it. We kept the number (1 miss of 8) and wrote down why. (`data/calibration/summary.json`, failure mode 7.)

9. **Some environments cannot run some tests.** Two execution-test projects do not build in the container even at the base commit. Saying `not_run`, with the build error, is more useful than `inconclusive`, which reads as doubt about the change. (Failure mode 5.)
