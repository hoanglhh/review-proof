// Clone, worktrees and reads at pinned commits. The agent's branches are never checked out or modified:
// every worktree is detached at a commit hash, and overlays happen only in throwaway worktrees.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { WORK } from "./config.ts";

export function git(cwd: string, args: string[]): string {
  // settings that would make git run a program; the container can write to worktrees, so never honour them
  return execFileSync("git", ["-c", "core.quotePath=false", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "--literal-pathspecs", ...args], {
    cwd, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Full clone (not shallow): the build reads git history for versioning, and that is the tested arrangement. */
export function ensureClone(repository: string, commits: string[]): string {
  const slug = repository.replace(/^[a-z+]+:\/\/[^/]+\//i, "").replace(/\.git$/, "").replace(/[^A-Za-z0-9._-]+/g, "__");
  const dir = join(WORK, "repos", slug);
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(join(WORK, "repos"), { recursive: true });
    execFileSync("git", ["clone", "--quiet", repository, dir], { stdio: "inherit" });
  }
  const missing = commits.filter((c) => { try { git(dir, ["cat-file", "-e", `${c}^{commit}`]); return false; } catch { return true; } });
  if (missing.length) git(dir, ["fetch", "--quiet", "origin"]);
  for (const c of missing) git(dir, ["cat-file", "-e", `${c}^{commit}`]); // throws if still absent
  return dir;
}

/**
 * A fresh detached worktree at `commit`. Never reused: the container ran untrusted code in it, and running git
 * inside a directory the container could write to would let that code choose git's settings.
 */
export function ensureWorktree(repo: string, name: string, commit: string): string {
  const dir = join(WORK, "wt", name);
  rmSync(dir, { recursive: true, force: true });
  git(repo, ["worktree", "prune"]);
  git(repo, ["worktree", "add", "--quiet", "--detach", dir, commit]);
  return dir;
}

/** Base source plus the head versions of the given files, in a throwaway worktree. */
export function overlayWorktree(repo: string, name: string, base: string, head: string, files: { path: string; status: string }[]): string {
  const dir = ensureWorktree(repo, name, base);
  const keep = files.filter((f) => f.status !== "deleted").map((f) => f.path);
  const del = files.filter((f) => f.status === "deleted").map((f) => f.path);
  if (keep.length) git(dir, ["checkout", head, "--", ...keep]);
  if (del.length) git(dir, ["rm", "-q", "--", ...del]);
  return dir;
}

/** Head plus a patch, committed with a fixed identity and date so the hash is reproducible. Local only, on no branch. */
export function plantedCommit(repo: string, head: string, name: string, patchFile: string): string {
  const dir = ensureWorktree(repo, `planted-${name}`, head);
  git(dir, ["apply", "--whitespace=nowarn", patchFile]);
  git(dir, ["add", "-A"]);
  const who = { GIT_AUTHOR_NAME: "reviewproof calibration", GIT_AUTHOR_EMAIL: "calibration@invalid", GIT_AUTHOR_DATE: "2026-11-14T00:00:00Z" };
  execFileSync("git", ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "commit", "-q", "--no-verify", "-m", `calibration: ${name}`], {
    cwd: dir, env: { ...process.env, ...who, GIT_COMMITTER_NAME: who.GIT_AUTHOR_NAME, GIT_COMMITTER_EMAIL: who.GIT_AUTHOR_EMAIL, GIT_COMMITTER_DATE: who.GIT_AUTHOR_DATE },
  });
  return git(dir, ["rev-parse", "HEAD"]).trim();
}

export const listFiles = (repo: string, commit: string) =>
  git(repo, ["ls-tree", "-r", "--name-only", "-z", commit]).split("\0").filter(Boolean);

export const showFile = (repo: string, commit: string, path: string) => git(repo, ["show", `${commit}:${path}`]);
export const readAt = (repo: string, commit: string, path: string) => { try { return showFile(repo, commit, path); } catch { return null; } };
