// The report: what a sign-off sheet is rendered from. Validated on every write.
import { z } from "zod";

const sha = z.string().regex(/^[0-9a-f]{40}$/);
const Status = z.enum(["passed", "failed", "not_run", "inconclusive"]);

export const Evidence = z.object({
  id: z.string(), check: z.string(), domain: z.enum(["general", "backend", "frontend", "security"]),
  asserts: z.string(), performedBy: z.string(), commands: z.array(z.string()), commits: z.array(sha),
  status: Status, reason: z.string().optional(), summary: z.string(),
  tests: z.array(z.looseObject({ name: z.string() })).optional(),
  durationMs: z.number(), logs: z.array(z.string()), details: z.unknown().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

const Citation = z.object({ path: z.string(), commit: sha, startLine: z.number().int(), endLine: z.number().int(), quote: z.string() });

export const Report = z.object({
  schemaVersion: z.literal(1),
  case: z.object({
    id: z.string(), requirementId: z.string(), requirementUrl: z.string().nullable(), requirementRetrievedAt: z.string().nullable(),
    repository: z.string(), profile: z.string(), base: sha, head: sha,
    generatedAt: z.string(), pipelineVersion: z.string(), policyVersion: z.string().nullable(),
    model: z.string().nullable(), promptHash: z.string().nullable(),
  }),
  reviewer: z.object({ status: z.enum(["ok", "unavailable", "invalid"]), reason: z.string().optional() }),
  requirements: z.array(z.object({
    id: z.string(), text: z.string(), quote: z.string(), kind: z.enum(["explicit", "interpretation"]), confirmedBy: z.string().nullable(),
  })),
  inventory: z.object({
    files: z.array(z.object({
      path: z.string(), status: z.enum(["added", "modified", "deleted"]), class: z.string(), binary: z.boolean(),
      added: z.number().int(), removed: z.number().int(), hunkIds: z.array(z.string()),
    })),
    totals: z.object({
      files: z.number().int(), added: z.number().int(), removed: z.number().int(),
      byClass: z.record(z.string(), z.object({ files: z.number().int(), lines: z.number().int() })),
    }),
  }),
  hunks: z.array(z.object({
    id: z.string(), file: z.string(), oldStart: z.number().int(), oldLines: z.number().int(),
    newStart: z.number().int(), newLines: z.number().int(), removed: z.array(z.string()), added: z.array(z.string()),
  })),
  evidence: z.array(Evidence),
  claims: z.array(z.object({
    id: z.string(), statement: z.string(), requirementIds: z.array(z.string()), evidenceIds: z.array(z.string()),
    hunkIds: z.array(z.string()), state: z.enum(["proven", "argued", "not_checked", "broken"]), stateReason: z.string(),
  })),
  decisions: z.array(z.object({
    id: z.string(), statement: z.string(), whyHuman: z.string(), options: z.array(z.string()).min(2),
    hunkIds: z.array(z.string()), citations: z.array(Citation),
    raisedBy: z.object({ kind: z.enum(["rule", "model"]), name: z.string() }),
    response: z.null(), // owner responses are stored with sign-offs, never in the report
  })),
  unexplained: z.array(z.string()),
  findings: z.array(z.object({
    id: z.string(), statement: z.string(), status: z.enum(["reproduced", "suspected"]), citations: z.array(Citation), hunkIds: z.array(z.string()),
  })),
  notChecked: z.array(z.object({ what: z.string(), reason: z.string() })),
});
export type Report = z.infer<typeof Report>;
