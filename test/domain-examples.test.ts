import { test } from "node:test";
import assert from "node:assert/strict";
import { readDocument as readBase } from "../fixtures/domain-examples/security-base.ts";
import { readDocument as readHead } from "../fixtures/domain-examples/security-head.ts";
import { renderDomainExamples, renderFrontendExample } from "../src/domain-examples.ts";

const document = { id: "synthetic-note", ownerId: "synthetic-alex", body: "Synthetic planning note; no customer data." };

test("SEC-1 returns the document only to its authenticated owner", () => {
  assert.deepEqual(readHead({ userId: "synthetic-alex" }, document), {
    ok: true, body: "Synthetic planning note; no customer data.",
  });
  assert.deepEqual(readHead(null, document), { ok: false, error: "Document unavailable" });
  assert.deepEqual(readHead({ userId: "synthetic-sam" }, document), { ok: false, error: "Document unavailable" });
});

test("SEC-2 invalid boundary inputs return the same generic unavailable result", () => {
  for (const session of [undefined, null, false, [], "synthetic-alex", {}, { userId: 1 }, { userId: " " }]) {
    assert.deepEqual(readHead(session, document), { ok: false, error: "Document unavailable" });
  }
  for (const invalidDocument of [undefined, null, false, [], "note", {},
    { ...document, id: 3 }, { ...document, id: " " }, { ...document, ownerId: false },
    { ...document, ownerId: " " }, { ...document, body: null }]) {
    assert.deepEqual(readHead({ userId: "synthetic-alex" }, invalidDocument), { ok: false, error: "Document unavailable" });
  }
  assert.deepEqual(readHead({ userId: "synthetic-alex" }, { ...document, body: "" }), { ok: true, body: "" });
});

test("the same other-owner denial assertion fails on base and passes on head", () => {
  const deniesOtherOwner = (read: typeof readHead) => assert.deepEqual(
    read({ userId: "synthetic-sam" }, document), { ok: false, error: "Document unavailable" },
  );
  assert.throws(() => deniesOtherOwner(readBase), assert.AssertionError);
  assert.doesNotThrow(() => deniesOtherOwner(readHead));
});

test("worked examples are synthetic, non-signable, and show exact fixture code", () => {
  const html = renderDomainExamples();
  assert.match(html, /SYNTHETIC/);
  assert.match(html, /FE-1/);
  assert.match(html, /SEC-1/);
  assert.match(html, /id="frontend-head-code"/);
  assert.match(html, /id="security-head-code"/);
  assert.doesNotMatch(html, /<form|action="[^"]*signoff/);
  assert.match(html, /Human decision/);
  assert.match(html, /Full read/);
});

test("frontend fixture renderer selects semantic head controls and escapes the CSP nonce", () => {
  const head = renderFrontendExample("head", 'test"nonce');
  const base = renderFrontendExample("base", "base-nonce");
  assert.match(head, /<label for="search-query">/);
  assert.match(head, /<button type="submit">/);
  assert.match(head, /aria-describedby="search-error"/);
  assert.match(head, /<script nonce="test&quot;nonce">/);
  assert.match(base, /<div class="button" id="search-submit">/);
  assert.doesNotMatch(base, /<label for="search-query">|<button type="submit">/);
});
