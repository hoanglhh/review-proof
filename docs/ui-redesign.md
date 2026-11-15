# ReviewProof UI architecture and redesign

## Scope and visual direction

This redesign treats ReviewProof as an engineer's working review desk. The live queue, verification plan, evidence, human judgments and sign-off controls are the content; no marketing page or invented product statistics were added.

The requested `design-taste-frontend` draw selected **The product performs**, seed **1826055594**. The idea is: **ReviewProof's head/base/without-change evidence becomes a working dossier with a visible human decision path.** Bricolage Grotesque headings, Geist body text, white/neutral surfaces and an ink-black primary action carry that direction into the application. Red remains reserved for actual failures and blocked routes; green and amber retain their functional status meanings.

The subject inventory was the actual product: pinned comparisons; three verification runs; four claim states; four review routes; named interpretations and sign-offs; repeated hunk exemplars; area trust floors; blind notes; separate evaluation cohorts; append-only human records. Page hierarchy follows those tasks, rather than a generic landing-page sequence. The primary live action starts a real assessment; other controls inspect existing evidence or collect an explicit human decision.

The marketing skill's photography, oversized hero, decorative animation and repeated entrance requirements do not fit a code-review application. Those were not added. Motion is limited to control feedback, with reduced-motion support. Smooth page scrolling was removed after browser testing found it could race button activation.

## Rendering layers

| Location | Responsibility |
| --- | --- |
| `src/ui/document.ts` | The shared document, desktop sidebar, native mobile navigation, focus/skip link, and standalone report shell |
| `src/ui/components.ts` | Page headers, actions, status badges, empty states, and consistent SVG interface icons |
| `src/ui/html.ts` | Escaping for untrusted requirements, repository content, model output and form values |
| `src/ui/code.ts` | Escaped, line-numbered code hunks shared by reports and reading exercises |
| `src/ui/styles.css` | Tailwind imports, source scanning, design tokens and shared component styles |
| `src/ui/generated-styles.ts` | Generated CSS and locally embedded fonts, including their license notices |
| `src/ui/report-view.ts` | Assessment HTML and interactive/offline report controls |
| `src/ui/report-format.ts` | Shared report presentation labels and formatting |
| `src/render.ts` | Public compatibility exports and Markdown export |
| Existing feature page modules | Readable view helpers for assessments, verification, metrics, feedback and reading studies |

There is one document shell and one style source. Repeated inline stylesheets and per-page HTML document wrappers were removed. The existing Node-rendered architecture keeps forms functional without a client application bootstrap and keeps archived report exports portable. Application behavior remains in the existing server and feature modules; no second API or duplicated validation layer was introduced.

## Build and development

```sh
npm install
npm run build:css
node src/cli.ts serve
```

`npm run build` also builds the stylesheet. `npm test` rebuilds it before the tests. After changing classes or the stylesheet, rebuild and restart an existing server. The CLI compiles Tailwind locally and generates a TypeScript string export; the running app does not depend on a Tailwind CDN, external fonts, a frontend development server or additional runtime UI libraries.

The generated module is included in the source tree so direct Node execution and temporary test fixtures can use the UI. Edit the source CSS and view modules, not the generated module. Geist and Bricolage Grotesque are distributed under the SIL Open Font License; their notices are embedded alongside the font data for standalone HTML exports.

## Preservation and checks

Original saved benchmark HTML remains an historical artifact; this refactor does not overwrite evaluation reports or manufacture human records. Live views and newly rendered exports use the redesigned UI. Reviewer prompts, claim-state/routing rules, verification runs and saved sign-offs retain their existing behavior.

Checks cover the existing workflow suite, template escaping, active navigation and self-contained offline rendering. The browser script supports a separate output directory so UI inspection does not overwrite earlier domain evidence:

Final validation passed all **118 tests** and **29 browser checks**. A SHA-256 comparison confirmed that all 343 snapshotted evidence and core-pipeline files remained unchanged during the redesign.

```sh
# Start a temporary app and compatible local ChromeDriver separately.
node src/cli.ts serve --port 4411
chromedriver --port=9516 --allowed-ips=127.0.0.1
python scripts/check-evaluation-browser.py --output .work/ui-review
```

Browser checks include 1440px, 768px and 390px layouts; keyboard activation; opened mobile-menu bounds; sample prefilling; owner requirements; immediately available untimed reading material; synthetic comparison controls; and direct-file report rendering. They submit no real human judgments or timings.

## Design inspection and critique

The source linter has no failures or warnings. Source annotations exempt only literal code typography and printable signature fields. The browser inspector is run with explicit app-specific exceptions: `few-pictures`, `no-footage`, `focal-point`, `icon-cards`, `shadow`, and `still-page`. Review data lists and navigation controls are functional UI, not ornamental feature cards; the only shadow belongs to the floating mobile menu. A working application needs neither four stock images nor eight entrance animations.

The refined queue has no remaining inspector failures under those exceptions. Its muted secondary metadata has AA-level contrast but produces a `grey-body` warning; primary assessment content remains in full ink. The desktop, tablet and mobile screenshots were inspected. The first pass led to larger secondary text, shortened repository display names, mobile branding, wrapped long finding text, and right-aligned mobile-menu positioning.

Internal screenshot critique: design **7.5/10**, usability **8/10**, creativity **6.5/10**, content **8/10**; weighted **7.55/10** using the skill's rubric. These are self-assessments, not external user-study scores. The deliberate remaining trade-offs are information density in audit tables and substantial vertical content in complete evidence reports. No photographs, video, customer claims or human performance results were invented.

## Simplification pass

The core navigation now contains Assessments, Verification and Review metrics. More tools reveals the remaining destinations and opens automatically when one is active. The queue removes redundant route counters, leads with report/progress actions and groups research links under Evaluation tools. Completed submissions link directly to their report, with run details as a secondary link.

Verification guidance is shorter, with profile descriptions in an expandable section. Live reports keep routes, blockers, evidence states and human decisions visible; source quotations and state definitions expand when needed. Standalone report citations stay open. No review data or evaluation capability is deleted by these presentation changes.
