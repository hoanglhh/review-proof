// Clone, worktrees and reads at pinned commits. The agent's branches are never checked out or modified:
// every worktree is detached at a commit hash, and overlays happen only in throwaway worktrees.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { WORK } from "./config.ts";

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "core.quotePath=false", "--literal-pathspecs", ...args], {
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

/** A detached worktree at `commit`, reused only if it is still clean and at that commit. */
export function ensureWorktree(repo: string, name: string, commit: string, fresh = false): string {
  const dir = join(WORK, "wt", name);
  if (existsSync(dir) && !fresh) {
    try {
      // ignored build output (bin/obj) is not listed by status, so a clean status means sources are untouched
      if (git(dir, ["rev-parse", "HEAD"]).trim() === commit && git(dir, ["status", "--porcelain"]).trim() === "") return dir;
    } catch { /* broken worktree: recreate below */ }
  }
  rmSync(dir, { recursive: true, force: true });
  git(repo, ["worktree", "prune"]);
  git(repo, ["worktree", "add", "--quiet", "--detach", dir, commit]);
  return dir;
}

/** Base source plus the head versions of the given files, in a throwaway worktree. */
export function overlayWorktree(repo: string, name: string, base: string, head: string, files: { path: string; status: string }[]): string {
  const dir = ensureWorktree(repo, name, base, true);
  const keep = files.filter((f) => f.status !== "deleted").map((f) => f.path);
  const del = files.filter((f) => f.status === "deleted").map((f) => f.path);
  if (keep.length) git(dir, ["checkout", head, "--", ...keep]);
  if (del.length) git(dir, ["rm", "-q", "--", ...del]);
  return dir;
}

export const listFiles = (repo: string, commit: string) =>
  git(repo, ["ls-tree", "-r", "--name-only", "-z", commit]).split("\0").filter(Boolean);

export const showFile = (repo: string, commit: string, path: string) => git(repo, ["show", `${commit}:${path}`]);
