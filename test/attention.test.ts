import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { explanationCoverage } from "../src/attention.ts";
import { renderHtml, renderMarkdown } from "../src/render.ts";
const sample = () => JSON.parse(readFileSync(new URL('../data/cases/2283/report.json', import.meta.url), 'utf8'));

test('explanation coverage counts unique hunks, not findings or duplicate claim links', () => {
  const r = sample();
  r.hunks = [{ id: 'A', file: '<bad>' }, { id: 'B', file: 'b' }];
  r.claims = [{id:'C1', hunkIds:['A']}, {id:'C2', hunkIds:['A']}];
  r.decisions = [];
  r.findings = [{id:'F1', hunkIds:['B']}];
  const c = explanationCoverage(r);
  assert.equal(c.explained, 1); assert.equal(c.total, 2);
  assert.equal(c.rows[1].explained, false);
  r.route.effectiveRoute = 'full';
  assert.match(explanationCoverage(r).rows[1].attention[0], /Full read required/);
  r.route.effectiveRoute = 'blocked';
  assert.match(explanationCoverage(r).rows[0].attention[0], /no permission to skip/);
});

test('live sheet qualifies test evidence, escapes coverage and preserves report', () => {
  const r = sample(); const before = JSON.stringify(r);
  const html = renderHtml(r, x => '/' + x, 10);
  const md = renderMarkdown(r, '/sheet', 10);
  assert.match(html, /Observed in a discriminating test/);
  assert.match(html, /Explanation coverage/);
  assert.match(html, /not correctness coverage/);
  assert.match(html, /What must I decide/);
  assert.match(md, /does not establish the full wording/);
  assert.equal(JSON.stringify(r), before);
  r.hunks[0].file = '<script>bad</script>';
  assert.doesNotMatch(renderHtml(r, x => '/' + x, 10), /<script>bad/);
});
