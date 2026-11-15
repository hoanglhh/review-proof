# Synthetic domain worked examples

Open `/examples` for the frontend and security examples. These teaching fixtures are **SYNTHETIC**, separate from the frozen evaluation and benchmark cohorts, excluded from evaluation metrics, and not signable. They contain no real customer data, model runs, or human approvals.

The examples retain ReviewProof's existing sheet styles. Each shows concrete requirement IDs, exact before/after source, a bounded claim, the evidence to inspect, a human decision, unchecked limits, and an illustrative routing recommendation. Both recommend a full read; this recommendation is not a computed policy route or measured review saving.

## Frontend: accessible search recovery

- **FE-1:** Associate a visible label with the search input and provide a native submit button for keyboard activation.
- **FE-2:** Empty or whitespace-only input shows an associated inline error, sets `aria-invalid`, and focuses the input. Editing clears stale feedback. A nonempty submission produces fixed synthetic output without network access.

Run `/examples/frontend?version=base` and `/examples/frontend?version=head`. The base intentionally has no label and uses a clickable div without a keyboard handler. Head uses a label and submit button, handles form submission, and associates `search-error` using `aria-describedby`.

Exact fixtures: [base](../fixtures/domain-examples/frontend-base.html) and [head](../fixtures/domain-examples/frontend-head.html). The page displays these files verbatim, escaped as text. The runnable page adds the request's CSP nonce to the fixture script.

**Claim FE-C1:** Head adds semantic controls and focused inline empty-input recovery. The rendered-markup assertions cover label association, button semantics, the error description reference, and nonce escaping. They do not establish screen-reader announcements, usability, contrast, or conformance.

**Human decision FE-D1:** A product owner must decide whether the field wording fits the product and a usability review must decide whether people understand the recovery message. No answer is recorded here.

**Illustrative route: Full read.** Read both small fixtures and try the actual interaction. A markup assertion alone does not earn a lighter route.

### Browser procedure and limits

The intended browser checks are:

1. In head, inspect the input's label association and `aria-describedby` target.
2. Focus the button and submit an empty query with Space. Check that the inline error becomes visible, `aria-invalid` is `true`, and focus returns to the input.
3. Type a term. Check that stale error and invalid state clear; submit using Enter from the input and inspect the fixed synthetic success output.
4. Focus the button with a valid term and activate separately with Enter and Space. Confirm output each time.
5. In base, inspect the missing label and nonfocusable clickable div. Keyboard submission is suppressed; pointer activation still displays fixed output.
6. At a narrow viewport, check that the form, navigation, headings, and source excerpts fit without page-level horizontal scrolling.

This procedure describes intended checks, not a claim that every check ran. A saved browser artifact, if supplied by the integrating run, must identify its actual assertions and viewport. No automated screen-reader, contrast, screenshot-comparison, or human usability result is represented by these fixtures or the unit tests.

## Security: owner-only document reads

- **SEC-1:** An authenticated owner may read the synthetic document; anonymous and other-owner reads must be denied.
- **SEC-2:** Validate boundary input types. Return the same generic `Document unavailable` result for absent, malformed, anonymous, and other-owner cases, without document content.

Exact executable fixtures: [base](../fixtures/domain-examples/security-base.ts) and [head](../fixtures/domain-examples/security-head.ts). Both export:

```ts
readDocument(session: unknown, document: unknown):
  { ok: true; body: string } | { ok: false; error: string }
```

The session shape is `{ userId: string }`; it represents identity already established by server authentication. **Never construct this session from untrusted request JSON.** The document shape is `{ id: string, ownerId: string, body: string }`. IDs must be nonblank; an empty document body remains valid. Inputs are validated before access. Base checks shapes and authentication but lacks ownership comparison. Head adds `document.ownerId !== session.userId` to the denial guard.

**Claim SEC-C1:** Head denies the other owner in this fixture. The test applies the same denial assertion to both exports: it catches an `AssertionError` for base and observes no assertion failure for head. Owner success, anonymous denial, malformed inputs, missing documents, and empty document bodies have separate assertions. This is discriminating evidence for the tested authorization behavior, not proof of a complete security policy.

**Human decision SEC-D1:** The product and security owners must decide whether owner-only access is correct, or whether sharing, organization roles, or delegation belongs in the real policy. No decision has been accepted here.

**Illustrative route: Full read.** Authorization remains a trust boundary even with passing tests. A real review must inspect the caller establishing session identity and the storage lookup in addition to this guard. Neither caller nor storage exists in this fixture.

**Limits:** The generic function result avoids a direct existence distinction in returned values. Timing differences and HTTP status behavior are untested. There is no authentication service, session lifecycle, database authorization, tenant isolation, concurrency control, deployed endpoint, penetration test, or production security claim. The vulnerable base must never be used in production.

## Reproduce local checks

```sh
node --test test/domain-examples.test.ts
```

`node test/domain-examples.test.ts` also prints the five named assertions with Node's test reporter. The local implementation run executed both commands successfully. These are local fixture and rendered-output checks; neither command launches a browser or a screen reader. The tests' expected baseline assertion failure is caught deliberately, so the overall suite passes only when the security check distinguishes base from head.

The integration run saves real test output under `data/domain-examples/checks.tap` and actual browser observations under `data/domain-examples/browser-checks.json`. `/examples` links available saved records. The browser record lists the assertions actually executed, browser version, time and limits; it includes no submitted human observation. PNGs record desktop feedback/targeted views and the synthetic frontend's mobile error state. They are inspection captures, not screenshot-baseline comparisons.

To reproduce the browser checks using an installed Chromium and compatible ChromeDriver, start `node src/cli.ts serve --port 4411` and `chromedriver --port=9516 --allowed-ips=127.0.0.1` in separate terminals, then run `python scripts/check-evaluation-browser.py`. The script uses `/usr/bin/chromium` with an isolated temporary browser profile. It performs keyboard interactions only on synthetic fixtures and a GET-only inspection of supplied sample #2297, never submits a human assessment, and saves its actual assertions and screenshots. It also checks the new pages at desktop and 375px widths, including revealed targeted evidence.
