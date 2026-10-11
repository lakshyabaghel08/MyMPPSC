# Testing

Everything here has actually been run. No test in this document is aspirational.

```bash
npm test          # 163 tests, all passing
npm run check     # 730 static integrity checks, all passing
npm run audit:ui  # alias for npm run check (static UI + contrast + token audit)
```

Requirements: Node 20+ (developed on Node 22). `npm install` fetches
`fake-indexeddb` and `jsdom` — the only two development dependencies.

## What each suite covers

| Suite | Tests | What it actually asserts |
| --- | --- | --- |
| `tests/validation.test.js` | 13 | Bank validation: schema version handling, missing ids, bad option keys, duplicated keys, too few options, missing language variants, unmatched answer references, near-duplicate detection, incomplete-paper detection, the demonstration flag, and that the invalid-records fixture rejects exactly the four bad records with the expected reasons. |
| `tests/scoring.test.js` | 12 | Deterministic scoring: marks per correct/wrong/unanswered, negative marking, supplied vs verified key, disputed keys, the three unresolved-answer policies, multi-correct order-insensitivity, unscored questions when no key exists, and refusal to score a paper whose rules are unknown. |
| `tests/import.test.js` | 10 | Import: validation summary, added/updated/skipped counts, re-import adds nothing, conflict policies (`skip`, `update`, `keep_both`), user corrections surviving a re-import, placeholder papers, undo, and provenance/hash retention. |
| `tests/revision.test.js` | 12 | Revision scheduling: level promotion on confident correct answers, hard reset and lapse counting on wrong answers, shortened intervals for unsure/guessed/slow answers, unanswered handling, manual reschedule and interval override, and that due/overdue/upcoming buckets partition the records. |
| `tests/analytics.test.js` | 8 | Analytics: available vs unique-attempted vs total attempts, coverage, repeat attempts not inflating unique counts, first-attempt accuracy separate from overall accuracy, insufficient-evidence labelling under three samples, and the frequency disclaimer. |
| `tests/smart.test.js` | 11 | Smart practice: bucket sizes and allocation, unseen-ratio preference, cooldown behaviour, paper order preservation, explainability lines, and the near-duplicate similarity blend. |
| `tests/backup.test.js` | 8 | Backup and restore: payload contents and counts, SHA-256 integrity, validation of a corrupted file, merge without duplicates, preference for newer local classifications, live settings preserved on merge, and a full round-trip. |
| `tests/e2e.test.js` | 14 | A complete journey through the services: import the demo bank → an incomplete paper is labelled → take a full simulation in the original order with the source duration → autosave and resume across an interruption → deterministic scoring → report distinguishes outcomes and weak areas → mistake escalation, auto-resolution and reopening → revision scheduling and queue → analytics from recorded attempts only → custom test with custom scoring and shuffled options (matching never shuffled) → a classification correction being reversible → syllabus import and manual progress separate from bank data → backup and restore → no-network behaviour. |
| `tests/ui.test.js` | 16 | The **real UI in jsdom**: `index.html` boots with IndexedDB, the first-run prompt offers the demonstration bank and says it is synthetic, every route renders without an error notice, the Import screen analyses the demo bank and imports it through the actual buttons, a **full paper simulation is started, answered, autosaved, submitted and reported through the DOM**, topic and smart sessions start from the shared configuration form, an unfinished session is offered for resume and returns with its answers, and **leaving the test screen stops its background timer** so the clock cannot keep ticking and writing while another screen is open, the mistake book / revision centre / analytics reflect that submission, a setting persists, the backup round-trip self-test passes, the `?` shortcut opens the help dialog, **every route renders with one `<h1>`, no skipped heading levels (`h1 -> h2 -> h3`), and updates `document.title`**, **dialogs move focus inside, mark `#main` `inert`, trap `Tab`/`Shift+Tab` at boundaries, close on `Escape`, and restore focus to the trigger**, **off-canvas navigation is `inert` / non-focusable when closed and closes on scrim click or `Escape`**, **tabs implement WAI-ARIA APG roving `tabindex` (`ArrowRight`, `ArrowLeft`, `Home`, `End`)**, **theme setting and header toggle update `html[data-theme]` and `<meta name="theme-color">`**, **the test runner supports distraction-free focus mode, keyboard hint bar, `aria-keyshortcuts`, Hindi `lang="hi"` tagging, and provenance chips**, the offline notice toggles, and the **stylesheet regression** suite below holds. |
| `tests/tools.test.js` | 3 | The pipeline bridge: `tools/build-bank.mjs` expands intake shorthand correctly, produces a bank that passes the app's own validator with no unexpected warnings, writes a file that imports cleanly into a real database, never invents an answer key or scoring rules, and refuses an intake file with no questions. |
| `tests/pyq-bank.test.js` | 8 | The real 2019–2024 bank (`data/pyq/mymppsc-pyq-bank.json`) through the real importer in an isolated in-memory IndexedDB: the app accepts it and all 571 questions and 6 papers arrive; every source record keeps its id, year, paper, verbatim question text, options and printed key; the eight questions with no key stay `missing` and nothing is invented for them; printed answers stay `unofficial` with no `verified_answer`; classification survives and unclassified stays flagged unclassified; importing it does not disturb a bank the user already has (34 + 571 = 605); re-importing adds nothing. Skips cleanly when the bank has not been built. |
| `tests/classification.test.js` | 47 | The PYQ classification pipeline: the taxonomy only contains subjects from `SUBJECT_ORDER` and every rule (and rule fallback) points at a node that exists; an MP river question is Madhya-Pradesh geography while the same river in Gujarat is *Geography of India*; `mpSignal` weights the question stem above options and the printed explanation; a Hindi question about the state's first Chief Minister is Madhya Pradesh Special while a Chief Minister question about another state stays in Polity; a question with no usable evidence is left unclassified **with a reason** rather than labelled; the printed answer never changes a classification; explanation-only evidence is capped at confidence 0.7; the rule engine is deterministic; the adapter reshapes option shapes, maps an answer given as option text, **refuses to guess an unmappable key**, preserves `verified_answer` separately from the printed key, detects Devanagari as Hindi, infers question types only from unambiguous signals, and reports unmapped source keys and duplicate ids instead of dropping records; the end-to-end run produces a bank the app's validator accepts with zero rejected records and imports through the real importer with `isUnclassified` intact; the reports agree with the bank's own stats, list every missing key and suspected duplicate, and record `records_removed: 0`; the AI queue holds exactly the unsettled questions and carries the taxonomy's 435 valid combinations by reference to a shared sidecar, every offered combination reconciles against the taxonomy, a stubbed provider request carries that vocabulary and an out-of-taxonomy subject is warned about before the merge, a completion that is empty, non-JSON or not an object is refused rather than guessed at, invented labels are rejected and never stored, a bogus topic or subtopic is dropped while a still-valid existing level is kept, malformed provider lines are reported with their line numbers instead of being dropped silently, an empty provider file changes no record, an empty reply never erases an existing classification, a low-confidence label is flagged, the rule engine's classification survives an unusable reply end to end with every decision recorded in the review report, resume skips the ids that already have a label without duplicating or losing work, and with no provider configured the AI step reports the limitation and changes nothing. |

`tests/helpers.mjs` is the shared harness: it installs an in-memory IndexedDB
(`fake-indexeddb`), a memory `localStorage`, and a `fetch` that serves the
repository from disk. The service layer was written to run without a DOM, which
is what makes these suites fast and deterministic.

## The stylesheet regression test

The last test in `tests/ui.test.js` guards the shipped shell, because the shell
can be broken without any JavaScript changing: the app once shipped
`.modal-root { display: grid }` with no `[hidden]` reset. The browser's built-in
`[hidden] { display: none }` is a *user-agent* declaration, and **any** author
declaration that sets `display` beats it, so the empty
`<div class="modal-root" id="modalRoot" hidden>` was laid out from the first
frame as a full-viewport, z-index 70 overlay that swallowed every click — the
app looked dimmed and nothing worked. The always-present `#toastStack` (fixed,
`z-index: 60`) could intercept clicks the same way.

The test reads the real `index.html` and `css/app.css`, renders them in a fresh
JSDOM (the shared document is already booted and mutated, so it cannot show what
a visitor's first frame looks like) and asserts through `getComputedStyle` that
every element carrying `hidden` computes to `display: none`, that `#modalRoot`
computes to `grid` while a dialog is open and back to `none` when it closes,
that `#toastStack` is click-through with `pointer-events: none` while a toast
inside it is still clickable, and that the stylesheet still contains the
`[hidden] { display: none !important; }` reset as its first rule.

That it fails on the broken stylesheet was checked, not assumed: remove the
reset and the test fails with `'grid' !== 'none'` on the hidden toast stack.

One jsdom caveat, recorded so nobody is misled: jsdom's own default stylesheet
gives `[hidden]` the specificity of
`[hidden]:not([hidden=until-found i]):not(embed)`, which is higher than a plain
class selector, so jsdom keeps the `.modal-root` case hidden even without the
app's reset. `#toastStack` is styled through an *id* selector, which does beat
that rule, so the toast-stack assertion is the one that reproduces the real
failure inside jsdom (in a real browser both were broken).

## Static checks (`npm run check` / `npm run audit:ui`)

729 cheap checks that catch what unit tests cannot see (see [`docs/UI.md`](UI.md) for the full design-system and guard documentation):

* every relative import and dynamic import resolves to a real file;
* no module imports from a URL (no CDN dependency);
* each file in `js/ui/views/` satisfies the router contract (`title`, `render`);
* every route registered in `js/app.js` has a view file, every navigation entry has a route, and the ten required destinations plus the custom-test builder are present;
* every `getElementById` in `js/app.js` matches an id in `index.html`;
* `sw.js`, the manifest, the stylesheet, `docs/UI.md`, and the icons exist; the manifest has 192/512 and maskable icons; the service worker precaches the shell and every view module;
* the shell cannot cover itself: the `[hidden] { display: none !important; }` reset exists **as the first rule** of `css/app.css`, `#modalRoot` ships with `hidden` in `index.html`, the toast layer sets `pointer-events: none` and its toasts get `pointer-events: auto` back;
* **theme & pre-paint bootstrap**: `index.html` applies `data-theme` from saved settings before first paint, declares `<meta name="color-scheme" content="light dark">`, and exposes `#themeColorMeta`; `css/app.css` defines `:root, :root[data-theme="light"]`, `:root[data-theme="dark"]`, `@media (forced-colors: active)`, `@media (prefers-reduced-motion: reduce)`, and `@media print`;
* **WCAG 2.1 contrast audit**: parses Light and Dark hex token maps from `css/app.css` and computes relative luminance contrast ratios across **40 text/surface token pairs** (requiring `≥ 4.5:1`) and **9 non-text border/focus pairs** (requiring `≥ 3.0:1`) in each theme (98 contrast assertions in total);
* **token-only colours & zero inline styles**: strips root token blocks and verifies zero `#hex`, `rgb()`, or `hsl()` colour literals appear elsewhere in `css/app.css`, and verifies zero inline `style="..."` attributes appear in `js/**`;
* GitHub Pages and subpath hosting: an empty `.nojekyll` exists at the root, no absolute path (`="/…"`, `url(/…)`, scheme- or protocol-relative URLs) appears in `index.html`, `sw.js`, `manifest.webmanifest` or `css/app.css`, every entry in the `sw.js` precache list is `./`-relative, `js/app.js` registers `'sw.js'` relatively, and the service-worker cache `VERSION` constant is present;
* the data files parse, the demonstration bank declares `is_demonstration: true` and says in its provenance that it is synthetic and not genuine;
* no question content, localhost URL or external `fetch` appears in the app's JavaScript.

## What the suite does **not** cover

Being explicit, because the difference matters:

* **Real browsers.** `tests/ui.test.js` runs the real DOM code but under jsdom: no layout, no real IndexedDB, no service worker and no visual check. Appearance, responsive breakpoints, print styles and touch behaviour were written carefully but are **not** automatically verified. The manual checklist below is how the UI is verified.
* **Safari/Firefox private-mode storage behaviour**, quota exhaustion and eviction.
* **Screen-reader output** and full keyboard navigation beyond the shortcuts the UI test exercises.
* **Real MPPSC content**, because none ships with the app. Import behaviour is tested with synthetic banks only.
* **Performance at scale** (tens of thousands of questions). The importer batches writes (`putMany` with progress events) and analytics reads a lightweight index, but no large-scale benchmark is included.

## Manual verification checklist

The same list is available inside the app (**Help & How it works**), so you can
verify a build in a few minutes without reading this file:

1. Import a bank and confirm the pre-import summary counts match your file, with any rejected records and their reasons.
2. Start a paper simulation, answer a few questions, refresh the page, confirm the session resumes with answers and remaining time.
3. Open a question with a missing or disputed key and confirm it is labelled and the report shows which key judged each answer.
4. Answer a question incorrectly, submit, and check the Mistake Book and Revision Centre both picked it up.
5. Attempt a question twice with different results; confirm the report separates first-attempt accuracy from overall accuracy.
6. Turn on confidence marking, mark a correct answer as *guessed*, and confirm revision brings it back sooner than a confident correct answer.
7. Export a backup, then run the round-trip self-test in **Settings & Backup**.
8. Go offline (DevTools → Network → Offline) and confirm the app still opens and works.

## Reproducing a failure

Each suite is standalone:

```bash
node --test tests/scoring.test.js
node --test --test-reporter=spec tests/ui.test.js
```

Note: `node --test tests/` does not work with this layout — pass the glob
(`npm test` does).
