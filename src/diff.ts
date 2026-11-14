// Changed files and zero-context hunks between two commits, and file classification by profile rules.
import type { ClassRule } from "./config.ts";

export type Hunk = {
  id: string; file: string;
  oldStart: number; oldLines: number; newStart: number; newLines: number;
  removed: string[]; added: string[];
};
export type FileChange = {
  path: string; status: "added" | "modified" | "deleted"; class: string; binary: boolean;
  added: number; removed: number; hunkIds: string[];
};

/** Arguments for the two git calls whose output parseDiff reads. Pinned so the hunks do not depend on user git config. */
export const diffArgs = (base: string, head: string) => ({
  names: ["diff", "--no-renames", "--no-ext-diff", "--name-status", "-z", base, head],
  patch: ["diff", "--no-renames", "--no-ext-diff", "--no-color", "--diff-algorithm=myers", "-U0", base, head],
});

export function parseDiff(nameStatusZ: string, patch: string, classOf: (path: string) => string): { files: FileChange[]; hunks: Hunk[] } {
  const parts = nameStatusZ.split("\0").filter((s) => s !== "");
  const sections = patch.split(/^(?=diff --git )/m).filter((s) => s.startsWith("diff --git "));
  // both git outputs list files in the same order; paths come from the -z output, so quoting never matters
  if (sections.length * 2 !== parts.length) throw new Error(`diff lists ${sections.length} files but name-status lists ${parts.length / 2}`);
  const files: FileChange[] = [];
  const hunks: Hunk[] = [];
  sections.forEach((section, i) => {
    const path = parts[i * 2 + 1];
    const s = parts[i * 2][0];
    const f: FileChange = {
      path, status: s === "A" ? "added" : s === "D" ? "deleted" : "modified", class: classOf(path),
      binary: false, added: 0, removed: 0, hunkIds: [],
    };
    let h: Hunk | undefined;
    for (const line of section.split("\n")) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (m) {
        h = { id: `H${hunks.length + 1}`, file: path, oldStart: +m[1], oldLines: m[2] === undefined ? 1 : +m[2], newStart: +m[3], newLines: m[4] === undefined ? 1 : +m[4], removed: [], added: [] };
        hunks.push(h);
        f.hunkIds.push(h.id);
      } else if (!h) {
        if (line.startsWith("Binary files ")) f.binary = true;
      } else if (line.startsWith("+")) { h.added.push(line.slice(1)); f.added++; }
      else if (line.startsWith("-")) { h.removed.push(line.slice(1)); f.removed++; }
    }
    files.push(f);
  });
  return { files, hunks };
}

export function classify(path: string, rules: ClassRule[], exists: (p: string) => boolean): string {
  for (const r of rules) {
    if (r.pattern !== undefined && new RegExp(r.pattern).test(path)) return r.class;
    if (r.siblingExtension && /\.[^./]+$/.test(path) && exists(path.replace(/\.[^./]+$/, r.siblingExtension))) return r.class;
  }
  return "unclassified";
}

export const changedLines = (h: Hunk) => h.added.length + h.removed.length;
