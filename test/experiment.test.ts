import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateExperiment, experimentRecord, renderExperiment, renderExperiments } from "../src/experiment.ts";
import { startServer } from "../src/server.ts";

const hash = "a".repeat(64);
const form = (overrides: Record<string, string> = {}) => new URLSearchParams({ reportHash: hash, name: "A person", method: "sheet", priorExposure: "no", readingSeconds: "10", evidenceSeconds: "2", codeSeconds: "3", decisionsSeconds: "4", evidenceOpenings: "2", unresolvedQuestions: "None", fullReadNeeded: "no", human: "yes", started: "yes", ...overrides });

test("experiment requires a human declaration, fresh hash, complete choices and bounded strict numbers", () => {
  assert.deepEqual(validateExperiment(hash, form()), []);
  for (const [key, values] of Object.entries({ reportHash: ["old", ""], name: [" ", "x".repeat(121)], method: ["other"], priorExposure: [""], human: [""], started: [""], fullReadNeeded: [""], unresolvedQuestions: ["", "x".repeat(4001)], evidenceOpenings: ["2x", "-1", "10001", "1.5"], readingSeconds: ["NaN", "Infinity", "1e3", "-1", "86401", "1.2", ""] })) {
    for (const value of values) assert.ok(validateExperiment(hash, form({ [key]: value })).length, `${key}=${value} must fail`);
  }
  const duplicate = form(); duplicate.append("method", "diff");
  assert.ok(validateExperiment(hash, duplicate).length);
  assert.ok(validateExperiment(hash, form({ readingSeconds: "0", evidenceSeconds: "0", codeSeconds: "0", decisionsSeconds: "0" })).length);
  assert.ok(validateExperiment(hash, form({ readingSeconds: "86400", codeSeconds: "1" })).length);
});

test("experiment record and aggregate preserve exposure and exclude exposed records from method summaries", () => {
  const first = experimentRecord("test", hash, form(), "2026-11-15T00:00:00.000Z");
  const exposed = experimentRecord("test", hash, form({ priorExposure: "yes", readingSeconds: "999" }), "2026-11-15T00:00:00.000Z");
  assert.equal(first.activeSeconds, 19);
  assert.equal(first.identity, "self-declared");
  const html = renderExperiments([first, exposed]);
  assert.match(html, /2 submitted human records/);
  assert.match(html, /1 prior-exposure record/);
  assert.match(html, /19 s/);
  assert.doesNotMatch(html, /1018 s|999 s/);
  assert.match(html, /No safety or speedup conclusion/);
});

test("experiment page starts paused, escapes values and contains no sign-off or trust form", () => {
  const report = JSON.parse(readFileSync(join(import.meta.dirname, "../data/cases/2283/report.json"), "utf8"));
  const html = renderExperiment(report, { title: "<script>", body: "<img>" }, hash, "nonce");
  assert.match(html, /Start review/);
  assert.match(html, /let running=false/);
  assert.match(html, /document.visibilityState/);
  assert.match(html, /document.hasFocus/);
  assert.match(html, /&lt;img&gt;/);
  assert.match(html, /target="_blank" rel="noopener"/);
  assert.doesNotMatch(html, /action="[^"]*\/(signoff|spotcheck|confirm)/);
});

test("experiment GET and invalid POST use the server origin and stale-report protections without records", async () => {
  const port = 45000 + Math.floor(Math.random() * 10000);
  const server = startServer(port);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${url}/case/2283/experiment`)).status, 200);
    assert.equal((await fetch(`${url}/evaluation/experiments`)).status, 200);
    const post = (origin: string) => fetch(`${url}/case/2283/experiment`, { method: "POST", headers: { origin }, body: form(), redirect: "manual" });
    assert.equal((await post("https://evil.example")).status, 403);
    assert.equal((await post(url)).status, 400);
  } finally { server.close(); }
});

test("experiment timer requires start, attributes phases and pauses on focus loss", async () => {
  const { runInNewContext } = await import("node:vm");
  const report = JSON.parse(readFileSync(join(import.meta.dirname, "../data/cases/2283/report.json"), "utf8"));
  const html = renderExperiment(report, { title: "Fixture", body: "Fixture" }, hash, "nonce");
  const fields = Object.fromEntries([...form({ started: "no", readingSeconds: "0", evidenceSeconds: "0", codeSeconds: "0", decisionsSeconds: "0" })].map(([key, value]) => [key, { value, reportValidity: () => true }]));
  const element = () => ({ hidden: true, disabled: false, value: "sheet", textContent: "", events: {} as Record<string, Function>, addEventListener(name: string, fn: Function) { this.events[name] = fn; }, reportValidity: () => true, setAttribute() {} });
  const nodes = Object.fromEntries(["experiment", "material", "method-choice", "start", "pause", "timer-status", "elapsed", "sheet-material", "diff-material"].map((id) => [id, element()]));
  Object.assign(nodes.experiment, { elements: { namedItem: (name: string) => fields[name] } });
  const phases = ["reading", "evidence", "code", "decisions"].map((phase) => Object.assign(element(), { dataset: { phase } }));
  let now = 0, focused = true, tick: Function = () => {};
  const docEvents: Record<string, Function> = {}, winEvents: Record<string, Function> = {};
  const document = { visibilityState: "visible", hasFocus: () => focused, getElementById: (id: string) => nodes[id], querySelectorAll: () => phases, addEventListener: (name: string, fn: Function) => { docEvents[name] = fn; } };
  runInNewContext(html.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)![1], { document, window: { addEventListener: (name: string, fn: Function) => { winEvents[name] = fn; } }, performance: { now: () => now }, setInterval: (fn: Function) => { tick = fn; } });
  now = 5000; tick(); assert.equal(fields.readingSeconds.value, "0");
  nodes.start.events.click(); now = 8000; tick(); assert.equal(fields.readingSeconds.value, "3");
  phases[1].events.click(); now = 10000; tick(); assert.equal(fields.evidenceSeconds.value, "2");
  focused = false; winEvents.blur(); now = 30000; tick(); assert.equal(fields.evidenceSeconds.value, "2");
  focused = true; tick(); now = 40000; tick(); assert.equal(fields.evidenceSeconds.value, "2");
  nodes.start.events.click(); now = 42000; tick(); assert.equal(fields.evidenceSeconds.value, "4");
  document.visibilityState = "hidden"; docEvents.visibilitychange(); now = 50000; tick(); assert.equal(fields.evidenceSeconds.value, "4");
  assert.equal(nodes["method-choice"].disabled, true);
  assert.equal(nodes.material.hidden, false);
});

test("valid experiment POST writes append-only records only in an isolated temporary repository", async () => {
  const { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync, existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const root = join(import.meta.dirname, "..");
  const fixture = mkdtempSync(join(tmpdir(), "review-experiment-test-"));
  try {
    cpSync(join(root, "src"), join(fixture, "src"), { recursive: true });
    for (const file of ["package.json", "policy.json", "cases.json"]) cpSync(join(root, file), join(fixture, file));
    symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"));
    mkdirSync(join(fixture, "data/cases/2283"), { recursive: true });
    for (const file of ["report.json", "requirement.json"]) cpSync(join(root, "data/cases/2283", file), join(fixture, "data/cases/2283", file));
    mkdirSync(join(fixture, "data/followup-v2/fixture"), { recursive: true });
    cpSync(join(root, "data/cases/2283/report.json"), join(fixture, "data/followup-v2/fixture/report.json"));
    mkdirSync(join(fixture, "data/evaluation-v2/control"), { recursive: true });
    writeFileSync(join(fixture, "data/evaluation-v2/control/summary.json"), JSON.stringify({ status: "blocked", reason: "Synthetic fixture availability" }));
    writeFileSync(join(fixture, "check.mjs"), `
      import assert from 'node:assert/strict';
      import {startServer} from './src/server.ts';
      import {cpSync} from 'node:fs';
      const port=45000+Math.floor(Math.random()*10000), server=startServer(port);
      await new Promise(r=>server.once('listening',r));
      try {
        const base='http://127.0.0.1:'+port, html=await (await fetch(base+'/case/2283/experiment')).text();
        const context=await fetch(base+'/evaluation/context-v2/fixture');assert.equal(context.status,200);
        const contextHtml=await context.text();assert.match(contextHtml,/Expanded-context v2 follow-up/);assert.doesNotMatch(contextHtml,/<form/);
        const control=await fetch(base+'/evaluation/control-v2');assert.equal(control.status,200);assert.match(await control.text(),/unavailable, not zero/);
        cpSync(new URL('./data/followup-v2/fixture/report.json',import.meta.url),new URL('./data/evaluation-v2/control/report.json',import.meta.url));
        const reviewed=await fetch(base+'/evaluation/control-v2');assert.equal(reviewed.status,200);const reviewedHtml=await reviewed.text();assert.match(reviewedHtml,/Control v2 follow-up/);assert.doesNotMatch(reviewedHtml,/<form/);
        assert.equal((await fetch(base+'/evaluation/context-v2/not-present')).status,404);
        const hash=html.match(/name="reportHash" value="([a-f0-9]{64})"/)[1];
        const form=new URLSearchParams(${JSON.stringify(Object.fromEntries(form({ name: "Synthetic fixture only" })))});form.set('reportHash',hash);
        for(let i=0;i<2;i++){const response=await fetch(base+'/case/2283/experiment',{method:'POST',headers:{origin:base},body:form,redirect:'manual'});assert.equal(response.status,303);}
      }finally{server.close();}
    `);
    const result = spawnSync(process.execPath, [join(fixture, "check.mjs")], { encoding: "utf8", timeout: 20000 });
    assert.equal(result.status, 0, result.stderr);
    const records = readdirSync(join(fixture, "data/experiments"));
    assert.equal(records.length, 2);
    assert.notEqual(records[0], records[1]);
    assert.equal(existsSync(join(fixture, "data/cases/2283/signoffs")), false);
    assert.equal(existsSync(join(fixture, "data/trust")), false);
    assert.equal(JSON.parse(readFileSync(join(fixture, "data/experiments", records[0]), "utf8")).reviewer, "Synthetic fixture only");
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

 test("external effort is optional, explicit and bounded, never imputed as zero", () => {
  assert.equal(experimentRecord("test", hash, form()).externalSeconds, null);
  assert.equal(experimentRecord("test", hash, form({externalSeconds:"0"})).externalSeconds, 0);
  assert.equal(experimentRecord("test", hash, form({externalSeconds:"23"})).externalSeconds, 23);
  for(const externalSeconds of ["-1", "NaN", "1.5", "86401"]) assert.ok(validateExperiment(hash, form({externalSeconds})).length);
});
