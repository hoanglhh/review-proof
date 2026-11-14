// Paths, the case list and repository profiles. Nothing repository-specific is written here.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "..");
export const WORK = join(ROOT, ".work"); // git-ignored: clones, worktrees, NuGet cache, container home
export const DATA = join(ROOT, "data"); // tracked: issue snapshots, evidence, reports
export const PIPELINE_VERSION: string = readJson(join(ROOT, "package.json")).version;

export type ClassRule = { class: string; pattern?: string; siblingExtension?: string };
export type Profile = {
  name: string;
  container: { image: string; timeoutSeconds: number; env: Record<string, string> };
  tests: { paths: string[]; projectFile: string; command: string[]; filterArgs: string[]; resultFormat: string };
  classify: ClassRule[];
  repetitiveClasses: string[];
  publicSurface: {
    classes: string[]; paths: string; declaration: string;
    apiFiles: string; diagnosticFiles: string; diagnosticId: string;
  };
  securitySurface: { classes: string[]; patterns: { name: string; regex: string; flags?: string }[] };
  areas: { name: string; owner: string; paths: string[] }[];
};
export type Case = {
  id: string; profile: string; repository: string; base: string; head: string;
  requirement: { id: string; url?: string; text?: string };
};

export function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function loadCase(id: string): Case {
  const c = (readJson(join(ROOT, "cases.json")).cases as Case[]).find((x) => x.id === id);
  if (!c) throw new Error(`unknown case "${id}" (see cases.json)`);
  if (!/^[0-9a-f]{40}$/.test(c.base) || !/^[0-9a-f]{40}$/.test(c.head)) throw new Error(`case ${id}: base and head must be full commit hashes`);
  if (!c.requirement.url && !c.requirement.text) throw new Error(`case ${id}: requirement needs a url or text`);
  return c;
}

export function loadProfile(name: string): Profile {
  return readJson(join(ROOT, "profiles", `${name}.json`));
}

export const caseDir = (id: string) => join(DATA, "cases", id);
