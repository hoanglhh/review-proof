// The report: what a sign-off sheet is rendered from. Validated on every write.
import { z } from "zod";

const sha = z.string().regex(/^[0-9a-f]{40}$/);
const Status = z.enum(["passed", "failed", "not_run", "inconclusive"]);
const Route = z.enum(["light", "targeted", "full", "blocked"]);

export const Evidence = z.object({
  id: z.string(), check: z.string(), domain: z.enum(["general", "backend", "frontend", "security"]),
  asserts: z.string(), performedBy: z.string(), commands: z.array(z.string()), commits: z.array(sha),
  status: Status, reason: z.string().optional(), summary: z.string(),
  tests: z.array(z.looseObject({ name: z.string() })).optional(),
  durationMs: z.number(), logs: z.array(z.string()), details: z.unknown().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

/** A citation that was checked: the quote was found at this path, commit and line range. */
const Citation = z.object({ path: z.string(), commit: sha, startLine: z.number().int(), endLine: z.number().int(), quote: z.string() });
const ids = z.array(z.string());

export const Report = z.object({
  schemaVersion: z.literal(1),
  case: z.object({
    id: z.string(), requirementId: z.string(), requirementUrl: z.string().nullable(), requirementRetrievedAt: z.string().nullable(),
    title: z.string(), repository: z.string(), profile: z.string(), base: sha, head: sha,
    generatedAt: z.string(), pipelineVersion: z.string(), policyVersion: z.string(),
    model: z.string().nullable(), promptHash: z.string().nullable(),
    synthetic: z.string().nullable(),
  }),
  reviewer: z.object({
    status: z.enum(["ok", "unavailable", "invalid"]), reason: z.string().optional(),
    rawResponse: z.string().nullable(), fullFilesShown: ids,
    represented: z.array(z.object({ group: z.string(), exemplar: z.string(), hunks: z.number().int(), files: ids })), // not shown to the model; stood in for by the exemplar
  }),
  requirements: z.array(z.object({
    id: z.string(), text: z.string(), quote: z.string(), kind: z.enum(["explicit", "interpretation"]), confirmedBy: z.string().nullable(),
  })),
  inventory: z.object({
    files: z.array(z.object({
      path: z.string(), status: z.enum(["added", "modified", "deleted"]), class: z.string(), binary: z.boolean(),
      added: z.number().int(), removed: z.number().int(), hunkIds: ids,
    })),
    totals: z.object({
      files: z.number().int(), added: z.number().int(), removed: z.number().int(),
      byClass: z.record(z.string(), z.object({ files: z.number().int(), lines: z.number().int() })),
    }),
  }),
  hunks: z.array(z.object({
    id: z.string(), file: z.string(), oldStart: z.number().int(), oldLines: z.number().int(),
    newStart: z.number().int(), newLines: z.number().int(), removed: ids, added: ids,
  })),
  evidence: z.array(Evidence),
  claims: z.array(z.object({
    id: z.string(), statement: z.string(), requirementIds: ids, evidenceIds: ids, testNames: ids, hunkIds: ids,
    citations: z.array(Citation), state: z.enum(["proven", "argued", "not_checked", "broken"]), stateReason: z.string(),
  })),
  decisions: z.array(z.object({
    id: z.string(), statement: z.string(), whyHuman: z.string(), options: ids, hunkIds: ids, citations: z.array(Citation),
    raisedBy: z.object({ kind: z.enum(["rule", "model"]), name: z.string() }),
  })),
  unexplained: ids,
  findings: z.array(z.object({
    id: z.string(), statement: z.string(), status: z.enum(["reproduced", "suspected"]), citations: z.array(Citation), hunkIds: ids,
  })),
  notChecked: z.array(z.object({ what: z.string(), reason: z.string() })),
  route: z.object({
    evidenceRoute: Route, trustFloor: Route, effectiveRoute: Route,
    reasons: z.array(z.object({ code: z.string(), detail: z.string() })),
    areas: z.array(z.object({ area: z.string(), owner: z.string(), floor: Route, reason: z.string() })),
    readingList: z.array(z.object({ hunkId: z.string(), file: z.string(), lines: z.number().int(), why: ids })),
    readingListLines: z.number().int(), totalLines: z.number().int(), readRatio: z.number().nullable(),
    spotCheck: z.object({ eligible: z.boolean(), selected: z.boolean(), draw: z.number(), share: z.number() }),
  }),
});
export type Report = z.infer<typeof Report>;
