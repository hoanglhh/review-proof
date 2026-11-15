import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { detectSetup, isSetupFile } from "../src/setup-detect.ts";
import type { SetupFile } from "../src/setup-detect.ts";

const file = (path: string, content: string): SetupFile => ({ path, content, oid: createHash("sha1").update(content).digest("hex") });
const json = (path: string, value: unknown) => file(path, JSON.stringify(value));
const npm = (scripts: Record<string, string> = { build: "node build.mjs", lint: "node lint.mjs", test: "node --test", pretest: "node prepare.mjs" }) => [
  json("package.json", { name: "sample", version: "1.0.0", engines: { node: "24" }, scripts }),
  json("package-lock.json", { name: "sample", version: "1.0.0", lockfileVersion: 3, packages: { "": { name: "sample", version: "1.0.0" } } }),
];
const project = (path: string, extra = "", framework = "net8.0") => file(path, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>${framework}</TargetFramework>${extra}</PropertyGroup></Project>`);

test("npm proposes literal restore/check argv and exposes complete scripts and lifecycle hooks", () => {
  const result = detectSetup(npm());
  assert.equal(result.kind, "npm");
  assert.equal(result.runnable, true);
  assert.equal(result.image, "node:24-bookworm-slim");
  assert.deepEqual(result.commands.map(command => command.argv), [["npm", "ci", "--ignore-scripts"], ["npm", "run", "build"], ["npm", "run", "lint"], ["npm", "run", "test"]]);
  assert.match(result.commands.at(-1)!.description, /"pretest": "node prepare.mjs"/);
  assert.match(result.limitations.join(" "), /install scripts are skipped/);
});

test("fingerprint is stable across file order and ignores unrelated source blobs", () => {
  const inputs = npm();
  const original = detectSetup(inputs);
  assert.equal(original.fingerprint, detectSetup([...inputs].reverse()).fingerprint);
  assert.equal(original.fingerprint, detectSetup([...inputs, file("src/a.ts", "new source")]).fingerprint);
  assert.deepEqual(original.observed.map(item => item.path), ["package-lock.json", "package.json"]);
  assert.match(original.fingerprint, /^[0-9a-f]{64}$/);
});

test("lockfile, CI, configuration and template-relevant blob changes invalidate fingerprint", () => {
  const inputs = npm();
  const original = detectSetup(inputs).fingerprint;
  assert.notEqual(original, detectSetup([inputs[0], file(inputs[1].path, `${inputs[1].content}\n`)]).fingerprint);
  for (const path of [".npmrc", ".github/workflows/test.yml", ".config/dotnet-tools.json", "NuGet.Config", "Directory.Build.props"]) {
    assert.equal(isSetupFile(path), true, path);
    assert.notEqual(original, detectSetup([...inputs, file(path, "setting")]).fingerprint, path);
  }
});

test("npm never guesses missing locks, ambiguous engines, alternate package managers or monorepos", () => {
  const inputs = npm();
  const variants = [
    [inputs[0]],
    [json("package.json", { scripts: { test: "node --test" }, engines: { node: ">=18" } }), inputs[1]],
    [...inputs, file("yarn.lock", "lock")],
    [...inputs, json("packages/child/package.json", { scripts: { test: "node --test" } })],
    [json("package.json", { workspaces: ["packages/*"], scripts: { test: "node --test" } }), inputs[1]],
    [file("packages/only/package.json", inputs[0].content), inputs[1]],
  ];
  for (const inputs of variants) assert.equal(detectSetup(inputs).runnable, false);
});

test("Node exact versions win over consistent major declarations; unsafe and conflicting pins fail", () => {
  const inputs = npm();
  assert.equal(detectSetup([...inputs, file(".nvmrc", "v24.1.2\n")]).image, "node:24.1.2-bookworm-slim");
  for (const pin of ["22", "24; touch /tmp/pwned", "lts/*", "24.1"]) assert.equal(detectSetup([...inputs, file(".nvmrc", pin)]).runnable, false);
});

test("missing and placeholder test scripts do not claim runnable coverage", () => {
  for (const scripts of [{ build: "node build.mjs" }, { test: "echo \"Error: no test specified\" && exit 1" }, { test: "exit 0" }, { test: "  " }]) {
    assert.equal(detectSetup(npm(scripts)).runnable, false);
  }
});

test("malformed package configuration and lockfiles fail closed", () => {
  const inputs = npm();
  for (const invalid of [file("package.json", "{"), json("package.json", []), json("package-lock.json", { lockfileVersion: 3 }), json("package-lock.json", { lockfileVersion: 99, packages: { "": {} } })]) {
    assert.equal(detectSetup([...inputs.filter(input => input.path !== invalid.path), invalid]).runnable, false);
  }
});

test("pinned .NET template restores and builds all projects and runs every recognized test project", () => {
  const inputs = [json("global.json", { sdk: { version: "8.0.404" } }), project("src/Library.csproj"), project("tests/Alpha.csproj", "<IsTestProject>true</IsTestProject>"), project("tests/Beta.Tests.csproj"), project("tests/Gamma.csproj", '<PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.0.0" />')];
  const result = detectSetup(inputs);
  assert.equal(result.kind, "dotnet");
  assert.equal(result.image, "mcr.microsoft.com/dotnet/sdk:8.0.404");
  assert.equal(result.runnable, true);
  assert.equal(result.commands.filter(command => command.phase === "restore").length, 4);
  assert.equal(result.commands.filter(command => command.argv[1] === "build").length, 4);
  const tests = result.commands.filter(command => command.argv[1] === "test");
  assert.equal(tests.length, 3);
  assert.deepEqual(tests[0].argv, ["dotnet", "test", "tests/Alpha.csproj", "--no-restore", "--logger", "trx", "--results-directory", "/results/project-1"]);
  assert.equal(new Set(tests.map(command => command.argv.at(-1))).size, 3);
});

test("unpinned .NET uses target-major proposal with explicit review limitation", () => {
  const result = detectSetup([project("test/App.Tests.csproj")]);
  assert.equal(result.image, "mcr.microsoft.com/dotnet/sdk:8.0");
  assert.equal(result.runnable, true);
  assert.match(result.limitations.join(" "), /No exact global.json SDK pin/);
});

test("SDK aliases, malformed project XML, unsupported targets and mixed SDK scopes fail closed", () => {
  const inputs = [project("tests/App.Tests.csproj")];
  const invalid = [
    [...inputs, json("global.json", { sdk: { version: "8.0;curl bad" } })],
    [...inputs, json("nested/global.json", { sdk: { version: "8.0.404" } })],
    [project("App.Tests.csproj", "", "$(Target)")],
    [project("App.Tests.csproj", "", "net48")],
    [file("App.Tests.csproj", '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup></Project>')],
    [project("A.Tests.csproj"), project("B.Tests.csproj", "", "net9.0")],
    [...inputs, json("global.json", { sdk: { version: "7.0.400" } })],
  ];
  for (const input of invalid) assert.equal(detectSetup(input).runnable, false);
});

test("explicit non-test projects, absent tests and commented test hints are not test evidence", () => {
  for (const input of [project("App.csproj"), project("App.Tests.csproj", "<IsTestProject>false</IsTestProject>"), project("App.csproj", "<!-- <IsTestProject>true</IsTestProject> -->")]) {
    assert.equal(detectSetup([input]).runnable, false);
  }
});

test("unsafe paths, missing blob IDs and duplicate setup paths cannot produce runnable setup", () => {
  for (const path of ["-App.Tests.csproj", "@App.Tests.csproj", "../App.Tests.csproj", "tests/\nApp.Tests.csproj", "tests/-App.Tests.csproj"]) assert.equal(detectSetup([project(path)]).runnable, false);
  const inputs = npm();
  assert.equal(detectSetup([...inputs, inputs[0]]).runnable, false);
  assert.equal(detectSetup([{ ...inputs[0], oid: "not-a-blob" }, inputs[1]]).runnable, false);
});

test("unsupported and mixed stacks are explicit and do not execute anything", () => {
  for (const inputs of [[], [file("pyproject.toml", "[project]")], [...npm(), project("App.Tests.csproj")]]) {
    const result = detectSetup(inputs);
    assert.equal(result.kind, "unsupported");
    assert.equal(result.runnable, false);
    assert.deepEqual(result.commands, []);
    assert.ok(result.limitations.length);
  }
});

test("explicit npm version requirements never silently use the container's bundled npm", () => {
 for(const patch of [{packageManager:"npm@9.9.4"},{engines:{node:"24",npm:"10"}}]){
  const files=npm();files[0]=json("package.json",{...JSON.parse(files[0].content),...patch});
  const result=detectSetup(files);assert.equal(result.runnable,false);assert.match(result.limitations.join(" "),/cannot verify.*bundles/);
 }
});
