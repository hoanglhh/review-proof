// Detection proposes a reviewable template; it never runs repository code.
import { createHash } from "node:crypto";

export type SetupFile = { path: string; content: string; oid: string };
export type SetupCommand = { id: string; phase: "restore" | "check"; argv: string[]; description: string };
export type Detection = {
  templateVersion: "1";
  kind: "npm" | "dotnet" | "unsupported";
  image: string | null;
  commands: SetupCommand[];
  observed: { path: string; oid: string }[];
  fingerprint: string;
  limitations: string[];
  runnable: boolean;
};

export function isSetupFile(path: string): boolean {
  return /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|\.nvmrc|\.node-version|global\.json|Directory\.(Build\.(props|targets)|Packages\.props)|[Nn]u[Gg]et\.[Cc]onfig|packages\.(lock\.json|config)|pyproject\.toml|requirements[^/]*\.txt|Pipfile(\.lock)?|poetry\.lock|uv\.lock|Dockerfile[^/]*|docker-compose[^/]*|\.gitlab-ci\.yml|azure-pipelines\.yml)$/.test(path)
    || /\.(csproj|fsproj|vbproj|sln|slnx|props|targets)$/.test(path)
    || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)
    || /(^|\/)(?:\.config\/dotnet-tools\.json|(?:\.npm-extension\.(?:cjs|mjs)))$/.test(path);
}

const safePath = (path: string) => path.length > 0 && !/[\x00-\x1f\x7f\\]/.test(path)
  && !path.startsWith("/") && path.split("/").every(part => part !== "" && part !== "." && part !== ".." && !part.startsWith("-") && !part.startsWith("@"));
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
function validXml(xml: string): boolean {
  const stack: string[] = [];
  let end = 0;
  for (const token of xml.matchAll(/<(?:"[^"]*"|'[^']*'|[^'">])*?>/g)) {
    if (xml.slice(end, token.index).includes("<")) return false;
    end = token.index! + token[0].length;
    if (/^<\?xml\s[\s\S]*\?>$/.test(token[0])) continue;
    const tag = /^<(\/?)([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)>$/.exec(token[0]);
    if (!tag) return false;
    if (tag[1]) { if (tag[3].trim() || tag[4] || stack.pop() !== tag[2]) return false; }
    else if (!tag[4]) stack.push(tag[2]);
  }
  return stack.length === 0 && !xml.slice(end).includes("<");
}
function json(file: SetupFile): Record<string, any> {
  const value: unknown = JSON.parse(file.content);
  if (!object(value)) throw new Error(`${file.path} must contain a JSON object.`);
  return value;
}

export function detectSetup(files: SetupFile[]): Detection {
  const relevant = files.filter(file => isSetupFile(file.path)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const observed = relevant.map(({ path, oid }) => ({ path, oid }));
  let kind: Detection["kind"] = "unsupported";
  let image: string | null = null;
  let commands: SetupCommand[] = [];
  let runnable = false;
  const limitations: string[] = ["Writable verification workspaces have no disk quota; CPU, memory and process limits do not limit disk usage."];
  const finish = (): Detection => {
    const templateVersion = "1" as const;
    const fingerprint = createHash("sha256").update(JSON.stringify({ templateVersion, kind, image, commands, observed })).digest("hex");
    return { templateVersion, kind, image, commands, observed, fingerprint, limitations, runnable };
  };
  if (relevant.some(file => !safePath(file.path) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(file.oid)) || new Set(observed.map(file => file.path)).size !== observed.length) {
    limitations.push("Setup requires unique, safe repository-relative paths and actual committed blob object IDs.");
    return finish();
  }
  const byPath = new Map(relevant.map(file => [file.path, file]));
  const manifests = relevant.filter(file => /(^|\/)package\.json$/.test(file.path));
  const projects = relevant.filter(file => /\.csproj$/.test(file.path) && !/(^|\/)(bin|obj|node_modules)\//.test(file.path));
  try {
    if (projects.length && manifests.length) {
      limitations.push("Mixed npm and .NET repositories require a manually reviewed setup; no primary project is guessed.");
    } else if (manifests.length) {
      kind = "npm";
      if (manifests.length !== 1 || manifests[0].path !== "package.json") {
        limitations.push("Nested packages and monorepos require a manually reviewed setup; no package is selected automatically.");
        return finish();
      }
      const pkg = json(manifests[0]);
      if (pkg.workspaces !== undefined || (pkg.packageManager !== undefined && (typeof pkg.packageManager !== "string" || !/^npm@\d+\.\d+\.\d+$/.test(pkg.packageManager))) || relevant.some(file => /(^|\/)(yarn\.lock|pnpm-lock\.yaml|pnpm-workspace\.yaml|npm-shrinkwrap\.json)$/.test(file.path))) {
        limitations.push("Workspaces and alternative package managers require a manually reviewed setup.");
        return finish();
      }
      if (pkg.packageManager !== undefined || pkg.engines?.npm !== undefined) {
        limitations.push("An explicit npm version is declared, but this template cannot verify that the container bundles that version. Use a manually reviewed setup; no package-manager upgrade is performed.");
        return finish();
      }
      const lockFile = byPath.get("package-lock.json");
      if (!lockFile) {
        limitations.push("A committed root package-lock.json is required; dependency versions are never guessed.");
        return finish();
      }
      const lock = json(lockFile);
      if (![1, 2, 3].includes(lock.lockfileVersion) || (lock.lockfileVersion === 1 ? !object(lock.dependencies) : !object(lock.packages) || !object(lock.packages[""]))) {
        limitations.push("package-lock.json is not a supported npm lockfile.");
        return finish();
      }
      if (pkg.name !== undefined && lock.name !== pkg.name || pkg.version !== undefined && lock.version !== pkg.version) {
        limitations.push("package.json and package-lock.json disagree on package identity.");
        return finish();
      }
      const pins = [byPath.get(".nvmrc")?.content.trim(), byPath.get(".node-version")?.content.trim(), pkg.engines?.node].filter(value => value !== undefined);
      if (!pins.length || pins.some(value => typeof value !== "string" || !/^v?(?:[1-9]\d*)(?:\.\d+\.\d+)?$/.test(value))) {
        limitations.push("An explicit Node major or exact version in .nvmrc, .node-version, or engines.node is required; ranges and aliases are not guessed.");
        return finish();
      }
      const versions = (pins as string[]).map(pin => pin.replace(/^v/, ""));
      if (new Set(versions.map(pin => pin.split(".")[0])).size !== 1 || new Set(versions.filter(pin => pin.includes("."))).size > 1) {
        limitations.push("Node version declarations conflict; choose one version explicitly.");
        return finish();
      }
      const version = versions.find(pin => pin.includes(".")) ?? versions[0];
      image = `node:${version}-bookworm-slim`;
      if (!version.includes(".")) limitations.push("Node is pinned only to a major; the trusted image tag will be resolved to an immutable digest and recorded before execution.");
      if (!object(pkg.scripts) || Object.values(pkg.scripts).some(script => typeof script !== "string")) {
        limitations.push("package.json must declare string-valued scripts including a test script.");
        return finish();
      }
      const sources = Object.keys(pkg.scripts).sort().map(name => `${JSON.stringify(name)}: ${JSON.stringify(pkg.scripts[name])}`).join("\n");
      commands = [{ id: "npm-restore", phase: "restore", argv: ["npm", "ci", "--ignore-scripts"], description: "Install the committed lockfile; dependency and repository install lifecycle scripts are disabled." }];
      for (const name of ["build", "lint", "test"]) {
        if (typeof pkg.scripts[name] === "string" && pkg.scripts[name].trim()) commands.push({ id: `npm-${name}`, phase: "check", argv: ["npm", "run", name], description: `Run the declared ${name} script. npm can also run pre/post hooks. All repository script sources (untrusted):\n${sources}` });
      }
      limitations.push("Dependency install scripts are skipped; native dependencies may fail. Never automatically relax --ignore-scripts.", "Declared npm scripts and pre/post hooks execute repository code and may invoke other scripts; review the complete script sources and run only in the approved sandbox.", "Lockfile consistency and image availability are verified by restore and image resolution, not by detection.");
      if (!commands.some(command => command.id === "npm-test") || /^(?:echo\s+["']?Error: no test specified|exit\s+0\s*$)/i.test(pkg.scripts.test.trim())) {
        limitations.push("No usable declared test script was detected; setup cannot claim runnable test coverage.");
      } else runnable = true;
    } else if (projects.length) {
      kind = "dotnet";
      if (relevant.some(file => /\.(fsproj|vbproj)$/.test(file.path)) || relevant.some(file => /(^|\/)global\.json$/.test(file.path) && file.path !== "global.json")) {
        limitations.push("Mixed project languages or nested SDK selection require a manually reviewed setup.");
        return finish();
      }
      const tests: SetupFile[] = [];
      const majors: number[] = [];
      for (const project of projects) {
        // shortcut: static SDK-style XML only, use explicit setup for computed/imported project discovery.
        const xml = project.content.replace(/<!--[\s\S]*?-->/g, "");
        if (!validXml(xml) || !/^\s*(?:<\?xml[^?]*\?>\s*)?<Project\b[^>]*\bSdk\s*=\s*["'][^"']+["'][^>]*>[\s\S]*<\/Project>\s*$/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
          limitations.push(`${project.path}: only static SDK-style project XML is supported.`);
          return finish();
        }
        const frameworks = [...xml.matchAll(/<TargetFrameworks?\s*>([^<]+)<\/TargetFrameworks?\s*>/gi)].flatMap(match => match[1].trim().split(";"));
        for (const framework of frameworks) {
          const match = /^net(\d+)\.\d+(?:-[A-Za-z0-9.]+)?$/.exec(framework.trim());
          if (match) majors.push(Number(match[1]));
          else if (!/^netstandard\d+\.\d+$/.test(framework.trim())) {
            limitations.push(`${project.path}: unsupported or computed target framework ${JSON.stringify(framework)}.`);
            return finish();
          }
        }
        if (/<IsTestProject\s*>\s*false\s*<\/IsTestProject\s*>/i.test(xml)) continue;
        if (/<IsTestProject\s*>\s*true\s*<\/IsTestProject\s*>/i.test(xml) || /<PackageReference\b[^>]*\b(?:Include|Update)\s*=\s*["']Microsoft\.NET\.Test\.Sdk["']/i.test(xml) || /tests?\.csproj$/i.test(project.path)) tests.push(project);
      }
      const globalFile = byPath.get("global.json");
      if (globalFile) {
        const sdk = json(globalFile).sdk?.version;
        if (typeof sdk !== "string" || !/^[1-9]\d*\.\d+\.\d+$/.test(sdk)) {
          limitations.push("global.json must pin an exact numeric SDK version; aliases and preview versions are not inferred.");
          return finish();
        }
        image = `mcr.microsoft.com/dotnet/sdk:${sdk}`;
        if (majors.some(major => major > Number(sdk.split(".")[0]))) {
          limitations.push("The pinned SDK is older than a declared target framework.");
          return finish();
        }
      } else {
        if (!majors.length || majors.some(major => ![6, 7, 8, 9, 10].includes(major)) || new Set(majors).size > 1) {
          limitations.push("No unambiguous supported target-framework major was found; choose the SDK and runtime image manually.");
          return finish();
        }
        image = `mcr.microsoft.com/dotnet/sdk:${majors[0]}.0`;
        limitations.push("No exact global.json SDK pin exists; the target-framework major selects a proposed SDK image tag. The trusted image tag is resolved to an immutable digest and recorded before execution.");
      }
      for (const [index, project] of projects.entries()) commands.push({ id: `dotnet-restore-${index + 1}`, phase: "restore", argv: ["dotnet", "restore", project.path], description: `Restore ${project.path}; MSBuild project files and imports can execute code.` });
      for (const [index, project] of projects.entries()) commands.push({ id: `dotnet-build-${index + 1}`, phase: "check", argv: ["dotnet", "build", project.path, "--no-restore"], description: `Build ${project.path} without another restore.` });
      for (const [index, project] of tests.entries()) commands.push({ id: `dotnet-test-${index + 1}`, phase: "check", argv: ["dotnet", "test", project.path, "--no-restore", "--logger", "trx", "--results-directory", `/results/project-${index + 1}`], description: `Run all tests in ${project.path}; save TRX evidence separately for this project.` });
      limitations.push("Project discovery is static: imported/computed test projects, custom SDKs, external services, native dependencies, and additional runtimes may require manual setup.", "Image tags are proposals, not verified images; the trusted image tag is resolved to an immutable digest and recorded before execution. Restore/build/test execute untrusted MSBuild and test code inside the approved sandbox.");
      if (!tests.length) limitations.push("No test project was recognized; setup cannot claim runnable test coverage.");
      else runnable = true;
    } else {
      limitations.push("No supported root npm project or SDK-style .NET project was found. Python, Yarn, pnpm, and other stacks require manual setup.");
    }
  } catch (error) {
    image = null;
    commands = [];
    runnable = false;
    limitations.push(`Malformed setup configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
  return finish();
}
