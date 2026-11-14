import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, validateSignoff } from "../src/server.ts";

const ROOT = join(import.meta.dirname, "..");

// Synthetic report fragment: only the fields validateSignoff reads.
const report = (route: string, decisions: string[] = []) => ({
  route: { effectiveRoute: route, reasons: [{ code: "x", detail: "R9 is an interpretation no human has confirmed" }] },
  decisions: decisions.map((id) => ({ id })),
}) as any;
const form = (o: Record<string, string>) => new URLSearchParams({ reportHash: "h", name: "A Person", action: "accept", reason: "Read it", ...o });

test("sign-off: a complete form on a signable report is valid", () => {
  assert.deepEqual(validateSignoff(report("full", ["D1"]), "h", form({ "decision.D1": "reject" })), []);
});

test("sign-off: blocked, stale, empty name or reason, missing action, unanswered decision are each refused", () => {
  const errs = (r: any, f: URLSearchParams) => validateSignoff(r, "h", f).join(" | ");
  assert.match(errs(report("blocked"), form({})), /blocked/);
  assert.match(errs(report("full"), form({ reportHash: "old" })), /changed after this page was opened/);
  assert.match(errs(report("full"), form({ name: "  " })), /Enter your name/);
  assert.match(errs(report("full"), form({ reason: "" })), /Write the reason/);
  assert.match(errs(report("full"), form({ action: "approve" })), /Choose an action/);
  assert.match(errs(report("full", ["D1", "D2"]), form({ "decision.D1": "accept" })), /Answer decision D2/);
});

test("sign-off: error text escapes IDs that came from model output", () => {
  const e = validateSignoff(report("full", ["<img src=x>"]), "h", form({})).join("");
  assert.doesNotMatch(e, /<img/);
});

test("only the server writes sign-offs, and no command creates one", () => {
  const src = (f: string) => readFileSync(join(ROOT, "src", f), "utf8");
  for (const f of readdirSync(join(ROOT, "src"))) {
    if (f === "server.ts") continue;
    assert.doesNotMatch(src(f), /"signoffs"\)?\s*,\s*`|writeNew|flag: "wx"/, `${f} must not write sign-offs`);
  }
  assert.doesNotMatch(src("cli.ts"), /cmd === "sign/);
});

test("server: refuses posts from other origins and wrong hosts; a blocked sheet cannot be signed", async () => {
  const port = 45000 + Math.floor(Math.random() * 10000);
  const server = startServer(port);
  await new Promise((r) => server.once("listening", r));
  const before = existsSync(join(ROOT, "data/cases/2283/signoffs")) ? readdirSync(join(ROOT, "data/cases/2283/signoffs")).length : 0;
  try {
    const url = `http://127.0.0.1:${port}`;
    const post = (path: string, headers: Record<string, string>) => fetch(url + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: form({}).toString(), redirect: "manual" });
    assert.equal((await post("/case/2283/signoff", { origin: "https://evil.example" })).status, 403);
    assert.equal((await post("/case/2283/signoff", {})).status, 403);
    const blocked = JSON.parse(readFileSync(join(ROOT, "data/cases/2283/report.json"), "utf8")).route.effectiveRoute === "blocked";
    if (blocked) assert.equal((await post("/case/2283/signoff", { origin: url })).status, 400);
    const page = await fetch(`${url}/case/2283`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
    assert.equal((await fetch(`${url}/data/..%2Fpackage.json`)).status, 404); // decodes to data/../package.json
    assert.equal((await fetch(`${url}/data/cases/2283/requirement.json`)).status, 200);
  } finally {
    server.close();
  }
  const after = existsSync(join(ROOT, "data/cases/2283/signoffs")) ? readdirSync(join(ROOT, "data/cases/2283/signoffs")).length : 0;
  assert.equal(after, before, "a test must never create a sign-off");
});

test("escape report: area, change, description and name are all required", async () => {
  const { validateEscape } = await import("../src/server.ts");
  const ok = new URLSearchParams({ area: "a", caseId: "1", description: "reverted after release", name: "P" });
  assert.deepEqual(validateEscape(ok, ["a"], ["1"]), []);
  assert.equal(validateEscape(new URLSearchParams({ ...Object.fromEntries(ok), area: "zz" }), ["a"], ["1"]).length, 1);
  assert.equal(validateEscape(new URLSearchParams({ ...Object.fromEntries(ok), description: " " }), ["a"], ["1"]).length, 1);
});
