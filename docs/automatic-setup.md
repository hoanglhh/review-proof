# Automatic repository setup

## Approved design

Detect committed manifests and CI configuration, propose fixed trusted .NET/npm verification templates, display exact scripts/commands and limitations, and require a named person's explicit setup trust before running repository code. Setup trust is permission to run checks, never a PR acceptance. Run a baseline in an isolated container, save real outcomes and reuse only successful plans whose relevant configuration fingerprints still match. Unsupported configurations remain explicit and can still use inspection-only assessment.

## Implementation plan

- [x] Implement pure language/runtime/lockfile/test detection and configuration fingerprints; test malformed, unsupported and changed configurations.
- [x] Implement isolated command execution with trusted image validation, immutable image resolution, bounded logs/timeouts and truthful outcomes; test execution boundaries.
- [x] Add setup registry, pinned repository/revision snapshots, human plan confirmation, baseline progress and reusable successful plans.
- [x] Integrate automatic-profile selection into assessments, check submitted head configuration, run full configured head verification and attach evidence with explicit coverage limits.
- [x] Add setup/review/progress pages and navigation using existing styles; test the complete flow in temporary fixtures without real human records.
- [x] Run focused/full tests, inspect desktop/mobile pages, preserve existing data/frozen modules, independent review, local commit only.

## Scope and limits

No dependency upgrades, model-authored executable commands, or silent fallback to another runtime. Restore may access the network inside the container; checks run without network. No host credentials or Docker socket are mounted. New repository checks establish command outcomes; named regression-test proof and base-source/head-test overlays remain available only in the existing manually configured pipeline. Unsupported ecosystems and ambiguous setups do not claim executable verification. A failed baseline cannot become reusable automatically. Configuration changes invalidate reuse. Original benchmarks, holdout and human PR decisions remain untouched.

## Using the workflow

Start an assessment in Automatic mode. A matching setup is reused; otherwise a plan is detected from the pinned head and the assessment waits for confirmation. Standalone detection remains available at `/setups`. Review all proposed commands, script bodies, image and unsupported coverage. A named person then selects **Trust plan and run baseline**. After successful baseline checks, choose **Assess a change with this setup** and use **Automatic** verification. The submitted head must match the approved relevant configuration; configuration changes trigger a new plan review. Automatic verification does not execute base commands or claim regression discrimination.

The saved setup permission is not a PR sign-off. It never changes trust history or accepts findings. Verification failure, missing results or erased setup evidence blocks signing regardless of what the model links. Re-running the old CLI cannot remove the persisted setup requirement.

Image trust covers the named official publisher and proposed tag; baseline execution resolves and records the immutable digest, and later assessments reuse that digest. Restore uses network access; check commands use none. Writable mounts have no disk quota, and containers do not establish absence of vulnerabilities. npm install lifecycle scripts stay disabled. Exact npm-version constraints, mixed repositories, workspaces, ambiguous runtime pins and unsupported stacks require a manually reviewed setup. The supplied mixed-stack challenge repository can continue using its installed C# profile.
