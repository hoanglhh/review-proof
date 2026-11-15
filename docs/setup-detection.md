# Repository setup detection

`detectSetup(files)` is a pure function. Its input is committed, regular Git blobs (`path`, verbatim `content`, `oid`), supplied by the repository registry. It does not read the filesystem, Git, environment, network, labels, or review results. It never executes commands or interprets model-generated command text.

The output is a proposal for human review, not evidence that a repository builds. `runnable` means a supported template contains a recognized test command; execution can still fail. The approval and runner must enforce sandboxing, network policy, resource limits, immutable image resolution, and actual result validation separately.

## Contract

The exported `Detection` contains `templateVersion: '1'`, `kind` (`npm`, `dotnet`, `unsupported`), a proposed `image` or `null`, `commands` (`id`, `phase`, literal `argv`, human-readable `description`), `observed` committed paths/OIDs, `fingerprint`, `limitations`, and `runnable`.

`isSetupFile(path)` is the shared collector/invalidation predicate. It includes nested package manifests and locks, Node version declarations, npm configuration, .NET projects/solutions and MSBuild props/targets, SDK and NuGet configuration, tool manifests, supported CI configuration, Docker setup, and Python manifests that identify unsupported repositories. Callers must collect the full matching tree, not only changed files. Files that are not regular committed blobs, oversized/truncated configuration, missing objects, and symlinks must be rejected by the caller instead of substituted with local files or link targets.

The fingerprint is SHA-256 of a canonical JSON object containing template version, detected kind, image, full command definitions, and path-sorted observed blob IDs. Reordering input does not change it; changed relevant blobs, additions/deletions, image selection, command source text, and template updates invalidate approval. Source-code-only changes do not change this setup fingerprint. Trust approval must additionally bind the exact reviewed repository/commit and security policy; this fingerprint alone does not approve execution of another commit.

Paths must be unique repository-relative paths without traversal, controls, option-like components, response-file components, or backslashes. Blob IDs must be complete SHA-1 or SHA-256 IDs. The collector is responsible for verifying that IDs really identify the supplied committed content. `argv` is passed to a process API without a host shell.

## npm template

Detection supports one root `package.json` plus a valid, committed root `package-lock.json` (lock versions 1–3). Explicit npm-version declarations require manual setup because this template cannot enforce a different bundled npm version. Missing locks, malformed declarations, workspaces, nested manifests, conflicting package managers, and Yarn/pnpm locks stop automatic setup. Lockfile/package dependency consistency is checked by `npm ci`, not reimplemented in the detector.

Node must be declared as a numeric major or exact version in `.nvmrc`, `.node-version`, or `engines.node`. Version ranges and aliases require manual setup. Declarations must agree; a consistent exact version takes precedence over a major. The image proposal is `node:<version>-bookworm-slim`; major-only tags are explicitly unpinned. Availability and image digest resolution are separate steps.

Restore is exactly `npm ci --ignore-scripts`. Declared non-empty `build`, `lint`, and `test` scripts become separate `npm run <name>` checks. A test script is required for `runnable`; the default “no test specified” placeholder and trivial `exit 0` are rejected. This is static declaration detection, not a proof of test discovery. The runner reports command outcomes and unavailable test counts for arbitrary npm scripts; an exit code of zero is not claimed as test coverage.

All declared script bodies are included verbatim (JSON escaped) in each check description. npm can invoke `pre<name>` and `post<name>` hooks, and script bodies can call other scripts or shell commands; the full script sources are untrusted review material. Restore lifecycle scripts stay disabled. Dependencies needing native install scripts may fail; do not automatically rerun with scripts enabled.

See [npm ci](https://docs.npmjs.com/cli/commands/npm-ci/) and [npm run](https://docs.npmjs.com/cli/v11/commands/npm-run/) for lockfile and lifecycle behavior.

## .NET template

Detection recognizes statically readable SDK-style `.csproj` files outside generated `bin`, `obj`, and `node_modules` directories. Test projects have explicit `IsTestProject=true`, a `Microsoft.NET.Test.Sdk` package reference, or a filename ending in `Test.csproj`/`Tests.csproj`. Explicit `IsTestProject=false` overrides these hints. Comments do not count. Malformed/unsupported XML, computed unsupported target frameworks, mixed project languages, or nested `global.json` SDK scopes require manual setup.

A root `global.json` with a numeric exact SDK version proposes `mcr.microsoft.com/dotnet/sdk:<version>`. Without a pin, an unambiguous supported target-framework major (6–10) proposes `sdk:<major>.0`, with an explicit limitation requiring digest resolution. Different target majors without an SDK pin are not guessed. Platform-specific target suffixes, older runtime dependencies, custom SDK availability, imported project properties, and service requirements may still require manual setup.

The template restores every recognized project, builds each with `--no-restore`, and runs every recognized test project with `dotnet test <project> --no-restore --logger trx --results-directory /results/project-N`. Each test project receives a separate results directory. There is no changed-file filter or inferred single “primary” test project. MSBuild imports and tests can execute repository code; all phases need the approved sandbox.

Static XML inspection is intentionally narrower than MSBuild evaluation. Imported/computed test declarations or projects are not comprehensively evaluated. No recognized test project means `runnable=false`. TRX artifacts are retained when produced; command success alone does not establish the breadth of test coverage.

See [dotnet test with VSTest](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-test-vstest) for TRX and results-directory arguments. Microsoft.Testing.Platform-specific command syntax is not inferred by this template.

## Unsupported setup

Python, Yarn, pnpm, mixed npm/.NET stacks, ambiguous monorepos, missing version/lock declarations, and malformed configuration return explicit limitations and `runnable=false`. The detector does not install tools, relax validation, generate repository-specific code, fetch dependencies, consult holdout data, or silently select a project.
