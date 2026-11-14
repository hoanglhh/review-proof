// Local sign-off server. The only code path that writes a sign-off, a confirmation or a trust event is a
// POST from a person using these pages. Binds to 127.0.0.1 and refuses posts from other origins.
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { caseDir, DATA, loadCase, loadProfile, readJson, ROOT, type Case } from "./config.ts";
import { assembleCase, readJsonl, signoffsOf, TRUST_LOG, type Policy } from "./assemble.ts";
import { esc, renderHtml } from "./render.ts";
import { renderBlind, renderIndex, renderMessage, renderMetrics, renderReveal, renderTrust } from "./pages.ts";
import { loadMetrics } from "./metrics.ts";
import type { Report } from "./report.ts";

export const SIMULATED_LOG = join(DATA, "trust", "simulated-events.jsonl");
const ACTIONS = ["accept", "request_changes", "escalate"];
const RESPONSES = ["accept", "reject", "escalate"];

/** Every reason a sign-off must be refused, as HTML-safe sentences that say how to fix it. Empty means valid. */
export function validateSignoff(r: Report, currentHash: string, f: URLSearchParams): string[] {
  const errors: string[] = [];
  if (f.get("reportHash") !== currentHash) errors.push("The report changed after this page was opened. Reload the page and review the new version.");
  if (r.route.effectiveRoute === "blocked") errors.push(`The report is blocked and cannot be signed: ${esc(r.route.reasons.map((x) => x.detail).join("; "))}.`);
  if (!f.get("name")?.trim()) errors.push(`<a href="#name">Enter your name.</a>`);
  if (!ACTIONS.includes(f.get("action") ?? "")) errors.push(`<a href="#action">Choose an action: accept, request changes or escalate.</a>`);
  if (!f.get("reason")?.trim()) errors.push(`<a href="#reason">Write the reason for your action.</a>`);
  for (const d of r.decisions) if (!RESPONSES.includes(f.get(`decision.${d.id}`) ?? "")) errors.push(`<a href="#decision-${esc(d.id)}">Answer decision ${esc(d.id)}: accept, reject or escalate.</a>`);
  return errors;
}

/** Every reason an escape report must be refused. Empty means valid. */
export function validateEscape(f: URLSearchParams, areas: string[], caseIds: string[]): string[] {
  const errors: string[] = [];
  if (!areas.includes(f.get("area") ?? "")) errors.push("Choose the area the problem escaped from.");
  if (!caseIds.includes(f.get("caseId") ?? "")) errors.push("Choose the change that let it through.");
  if (!f.get("description")?.trim()) errors.push("Describe what went wrong after the change was accepted.");
  if (!f.get("name")?.trim()) errors.push("Enter your name.");
  return errors;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "owner";
/** Hash of the report's content; the generation time is left out so re-running the pipeline does not outdate a signature. */
const hashOf = (id: string) => {
  const r = JSON.parse(readFileSync(join(caseDir(id), "report.json"), "utf8"));
  return createHash("sha256").update(JSON.stringify({ ...r, case: { ...r.case, generatedAt: null } })).digest("hex");
};
const writeNew = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" }); }; // never overwrites
const seconds = (v: string | null) => Math.max(0, Number.parseInt(v ?? "0", 10) || 0);

export function startServer(port: number) {
  const policy: Policy = readJson(join(ROOT, "policy.json"));
  const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];

  const send = (res: ServerResponse, status: number, body: string, nonce = "", type = "text/html; charset=utf-8") => {
    res.writeHead(status, {
      "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "DENY",
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    });
    res.end(body);
  };
  const redirect = (res: ServerResponse, to: string) => { res.writeHead(303, { location: to }); res.end(); };
  const body = (req: IncomingMessage) => new Promise<URLSearchParams>((ok, fail) => {
    let s = "";
    req.on("data", (chunk) => { s += chunk; if (s.length > 1_000_000) { req.destroy(); fail(new Error("request body too large")); } });
    req.on("end", () => ok(new URLSearchParams(s)));
  });
  const report = (id: string): Report | null => (existsSync(join(caseDir(id), "report.json")) ? readJson(join(caseDir(id), "report.json")) : null);

  const sheet = (res: ServerResponse, c: Case, r: Report, extra: { errors?: string[]; form?: URLSearchParams; notice?: string } = {}, status = 200) => {
    const nonce = randomBytes(16).toString("base64");
    send(res, status, renderHtml(r, (x) => `/${x}`, policy.sheet.maxFindingsShown, {
      reportHash: hashOf(c.id), nonce, signoffs: signoffsOf(c.id), errors: extra.errors ?? [], form: extra.form, notice: extra.notice,
    }), nonce);
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${hosts[0]}`);
      if (!hosts.includes(req.headers.host ?? "")) return send(res, 421, "Wrong host", "", "text/plain"); // DNS rebinding guard
      // browsers mark their own same-origin posts with Sec-Fetch-Site, which a web page cannot set
      const sameOrigin = origins.includes(req.headers.origin ?? "") || req.headers["sec-fetch-site"] === "same-origin";
      if (req.method === "POST" && !sameOrigin) return send(res, 403, "Posts are accepted only from this server's own pages.", "", "text/plain");
      const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

      if (req.method === "GET" && parts.length === 0) {
        const cases: Case[] = readJson(join(ROOT, "cases.json")).cases;
        return send(res, 200, renderIndex(cases.map((c) => {
          const r = report(c.id);
          return { id: c.id, requirementId: c.requirement.id, title: r?.case.title ?? "", route: r?.route.effectiveRoute ?? null, generatedAt: r?.case.generatedAt ?? null, signoffs: signoffsOf(c.id).length };
        })));
      }

      if (parts[0] === "trust") {
        const cases: Case[] = readJson(join(ROOT, "cases.json")).cases;
        const areas = [...new Map(cases.flatMap((c) => loadProfile(c.profile).areas).map((a) => [a.name, a])).values()];
        if (req.method === "POST" && parts[1] === "escape") {
          // an escape: a problem found after a change was accepted. It resets the area to full read.
          const f = await body(req);
          const errors = validateEscape(f, areas.map((a) => a.name), cases.map((c) => c.id));
          if (errors.length) return send(res, 400, renderMessage("Escape not recorded", errors.join(" "), "/trust"));
          mkdirSync(dirname(TRUST_LOG), { recursive: true });
          appendFileSync(TRUST_LOG, JSON.stringify({ area: f.get("area"), type: "escape", at: new Date().toISOString(), caseId: f.get("caseId"),
            description: f.get("description")!.trim(), reportedBy: f.get("name")!.trim(), identity: "self-declared" }) + "\n");
          for (const c of cases) if (report(c.id)) assembleCase(c, loadProfile(c.profile)); // routes depend on the record
          return redirect(res, `/trust?notice=${encodeURIComponent(`Escape recorded for ${f.get("area")}; it is back to full read and every sheet was re-assembled.`)}`);
        }
        return send(res, 200, renderTrust(readJsonl(TRUST_LOG), readJsonl(SIMULATED_LOG), areas, policy.trust.cleanSpotChecksPerStep, policy.version,
          url.searchParams.get("notice") ?? undefined, cases.filter((c) => report(c.id)).map((c) => ({ id: c.id, requirementId: c.requirement.id }))));
      }

      if (req.method === "GET" && parts[0] === "metrics") return send(res, 200, renderMetrics(loadMetrics()));

      if (req.method === "GET" && parts[0] === "data") { // evidence files; agent output is served as plain text, never as a page
        const file = resolve(ROOT, ...parts);
        if (!file.startsWith(DATA + sep) || !existsSync(file)) return send(res, 404, "Not found", "", "text/plain");
        return send(res, 200, readFileSync(file, "utf8"), "", extname(file) === ".json" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
      }

      if (parts[0] !== "case" || !parts[1]) return send(res, 404, renderMessage("Not found", "There is no page at this address.", "/"));
      let c: Case;
      try { c = loadCase(parts[1]); } catch { return send(res, 404, renderMessage("Unknown case", `There is no case "${parts[1]}" in cases.json.`, "/")); }
      const r = report(c.id);
      if (!r) return send(res, 404, renderMessage("No report yet", `Run: node src/cli.ts all ${c.id}`, "/"));
      const back = `/case/${encodeURIComponent(c.id)}`;
      const action = parts[2];

      if (req.method === "GET" && !action) return sheet(res, c, r, { notice: url.searchParams.get("notice") ?? undefined });

      if (req.method === "GET" && action === "earned") { // simulated trust: read-only, no form, never signable
        const f = join(caseDir(c.id), "report-earned.json");
        if (!existsSync(f)) return send(res, 404, renderMessage("No simulated view yet", `Run: node src/cli.ts assemble ${c.id}`, back));
        return send(res, 200, renderHtml(readJson(f), (x) => `/${x}`, policy.sheet.maxFindingsShown));
      }

      if (req.method === "POST" && action === "confirm") {
        const f = await body(req);
        const q = r.requirements.find((x) => x.id === f.get("requirementId"));
        if (f.get("reportHash") !== hashOf(c.id)) return sheet(res, c, r, { errors: ["The report changed after this page was opened. Reload the page and review the new version."] }, 409);
        if (!q || q.kind !== "interpretation") return sheet(res, c, r, { errors: ["That requirement item is not an interpretation waiting for confirmation."] }, 400);
        const name = f.get("name")?.trim();
        if (!name) return sheet(res, c, r, { errors: [`Enter your name to confirm ${esc(q.id)}.`] }, 400);
        writeNew(join(caseDir(c.id), "confirmations", `${stamp()}-${q.id}.json`), {
          caseId: c.id, requirementId: q.id, text: q.text, quote: q.quote, confirmedBy: name, identity: "self-declared",
          confirmedAt: new Date().toISOString(), reportHash: f.get("reportHash"),
        });
        assembleCase(c, loadProfile(c.profile)); // a confirmed interpretation changes the route, so the report is rebuilt
        return redirect(res, `${back}?notice=${encodeURIComponent(`${q.id} confirmed by ${name}. The report was re-assembled; review it again before signing.`)}`);
      }

      if (req.method === "POST" && action === "signoff") {
        const f = await body(req);
        const current = hashOf(c.id);
        const errors = validateSignoff(r, current, f);
        if (errors.length) return sheet(res, c, r, { errors, form: f }, 400);
        const name = f.get("name")!.trim();
        writeNew(join(caseDir(c.id), "signoffs", `${stamp()}-${slug(name)}.json`), {
          caseId: c.id, reportHash: current, signedAt: new Date().toISOString(), owner: name, identity: "self-declared",
          action: f.get("action"), reason: f.get("reason")!.trim(),
          decisions: Object.fromEntries(r.decisions.map((d) => [d.id, f.get(`decision.${d.id}`)])),
          findings: Object.fromEntries(r.findings.map((x) => [x.id, ["real", "not_real", "unsure"].includes(f.get(`finding.${x.id}`) ?? "") ? f.get(`finding.${x.id}`) : null])),
          route: { effective: r.route.effectiveRoute, evidence: r.route.evidenceRoute, trustFloor: r.route.trustFloor },
          activeSeconds: seconds(f.get("activeSeconds")), activeSecondsSource: "measured by the page while visible and focused",
        });
        return redirect(res, `${back}?notice=${encodeURIComponent(`Signed by ${name}.`)}#s10`);
      }

      if (req.method === "GET" && action === "blind") {
        const nonce = randomBytes(16).toString("base64");
        return send(res, 200, renderBlind(r, readJson(join(caseDir(c.id), "requirement.json")), nonce), nonce);
      }

      if (req.method === "POST" && action === "spotcheck" && !parts[3]) {
        const f = await body(req);
        const notes = (f.get("notes") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
        const name = f.get("name")?.trim();
        if (!notes.length || !name) return send(res, 400, renderMessage("Spot-check not saved", "Write at least one note and your name.", `${back}/blind`));
        const sid = `${stamp()}-${randomBytes(3).toString("hex")}`;
        writeNew(join(caseDir(c.id), "spotchecks", `${sid}.json`), {
          caseId: c.id, reportHash: hashOf(c.id), startedAt: new Date().toISOString(), reader: name, identity: "self-declared",
          blind: f.get("blind") === "yes", notes, activeSeconds: seconds(f.get("activeSeconds")),
        });
        return redirect(res, `${back}/spotcheck/${sid}`);
      }

      if (action === "spotcheck" && parts[3] && /^[\w-]+$/.test(parts[3])) {
        const file = join(caseDir(c.id), "spotchecks", `${parts[3]}.json`);
        if (!existsSync(file)) return send(res, 404, renderMessage("Unknown spot-check", "This spot-check does not exist.", back));
        const spot = readJson(file);
        const areas = r.route.areas.map((a) => a.area);
        if (req.method === "GET") {
          const html = renderHtml(r, (x) => `/${x}`, policy.sheet.maxFindingsShown);
          return send(res, 200, renderReveal(html, c.id, parts[3], spot, areas));
        }
        if (req.method === "POST") {
          const f = await body(req);
          const marks = spot.notes.map((note: string, i: number) => ({ note, mark: f.get(`mark.${i}`), area: f.get(`area.${i}`) }));
          if (marks.some((m: any) => m.mark !== "on_sheet" && m.mark !== "missed") || marks.some((m: any) => m.mark === "missed" && !areas.includes(m.area)))
            return send(res, 400, renderMessage("Spot-check not recorded", "Mark every note as on the sheet or missed, and pick an area touched by this change for each miss.", `${back}/spotcheck/${parts[3]}`));
          writeNew(join(caseDir(c.id), "spotchecks", `${parts[3]}.marks.json`), { markedAt: new Date().toISOString(), marks });
          const missed = [...new Set(marks.filter((m: any) => m.mark === "missed").map((m: any) => m.area as string))];
          let notice = "Informed read saved. It is kept out of the trust record.";
          if (spot.blind) {
            const at = new Date().toISOString();
            // reading the same change again earns nothing: a clean check counts once per change and area
            const counted = new Set(readJsonl(TRUST_LOG).filter((e) => e.type === "spot_check_clean" && e.caseId === c.id).map((e) => e.area));
            const events = missed.length ? missed.map((area) => ({ area, type: "spot_check_miss", at, caseId: c.id, spotCheck: parts[3] }))
              : areas.filter((area) => !counted.has(area)).map((area) => ({ area, type: "spot_check_clean", at, caseId: c.id, spotCheck: parts[3] }));
            mkdirSync(dirname(TRUST_LOG), { recursive: true });
            for (const e of events) appendFileSync(TRUST_LOG, JSON.stringify(e) + "\n");
            notice = missed.length ? `Recorded ${missed.length} miss(es): ${missed.join(", ")} reset to full read.`
              : events.length ? `Recorded a clean blind spot-check for ${events.map((e) => e.area).join(", ")}.` : "Clean, but this change was already counted for these areas; trust is earned on different changes.";
          }
          return redirect(res, `/trust?notice=${encodeURIComponent(notice)}`);
        }
      }
      return send(res, 404, renderMessage("Not found", "There is no page at this address.", back));
    } catch (e) {
      send(res, 500, renderMessage("Something went wrong", String(e instanceof Error ? e.message : e), "/"));
    }
  });
  server.listen(port, "127.0.0.1", () => console.log(`ReviewProof sign-off server on http://127.0.0.1:${port}/ (local only; Ctrl-C to stop)`));
  return server;
}

/** A clearly synthetic event history, replayed through the same trust rule, into its own file. */
export function writeSimulation(perStep: number) {
  const types: TrustType[] = [...Array(perStep * 2).fill("spot_check_clean"), "spot_check_miss", ...Array(perStep - 1).fill("spot_check_clean")];
  const events = types.map((type, i) => ({ area: "example-area", type, at: `synthetic-step-${i + 1}`, synthetic: true }));
  mkdirSync(dirname(SIMULATED_LOG), { recursive: true });
  writeFileSync(SIMULATED_LOG, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return events;
}
type TrustType = "spot_check_clean" | "spot_check_miss";
