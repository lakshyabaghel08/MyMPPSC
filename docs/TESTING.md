# Testing

Everything here has actually been run. No test in this document is aspirational.

**Latest verified run (2026-10-13, against `data/pyq/mymppsc-pyq-bank.json`):**
`npm test` passed **233/233 tests** (0 failures, 0 skips); `npm run check`
passed **915 checks**. The production bank loaded by these runs contains 1,171
questions across 12 papers (2013–2024); service-worker cache `v1.2.0-2`. All
years use the latest MPPSC marking pattern (+3/−1/0) as a uniform **practice
policy only**; this does not establish the historical rules for any paper.

```bash
npm test          # all 233 tests
npm run check     # all 915 static integrity checks
npm run audit:ui  # alias for npm run check (static UI + contrast + token audit)
```

Requirements: Node 20+ (developed on Node 22). `npm install` fetches
`fake-indexeddb` and `jsdom` — the only two development dependencies.

## What each suite covers

| Suite | Tests | What it actually asserts |
| --- | --- | --- |
| `tests/validation.test.js` | 13 | Bank validation: schema version handling, missing ids, bad option keys, duplicated keys, too few options, missing language variants, unmatched answer references, near-duplicate detection, incomplete-paper detection, the demonstration flag, and that the invalid-records fixture rejects exactly the four bad records with the expected reasons. |
| `tests/scoring.test.js` | 14 | Deterministic scoring: marks per correct/wrong/unanswered, negative marking, supplied vs verified key, disputed keys, the three unresolved-answer policies, multi-correct order-insensitivity, unscored questions when no key exists, refusal to score a paper whose rules are unknown, and the latest-pattern practice scheme resolution. |
| `tests/import.test.js` | 10 | Import: validation summary, added/updated/skipped counts, re-import adds nothing, conflict policies (`skip`, `update`, `keep_both`), user corrections surviving a re-import, placeholder papers, undo, and provenance/hash retention. |
| `tests/revision.test.js` | 12 | Revision scheduling: level promotion on confident correct answers, hard reset and lapse counting on wrong answers, shortened intervals for unsure/guessed/slow answers, unanswered handling, manual reschedule and interval override, and that due/overdue/upcoming buckets partition the records. |
| `tests/analytics.test.js` | 8 | Analytics: available vs unique-attempted vs total attempts, coverage, repeat attempts not inflating unique counts, first-attempt accuracy separate from overall accuracy, insufficient-evidence labelling under three samples, and the frequency disclaimer. |
| `tests/smart.test.js` | 11 | Smart practice: bucket sizes and allocation, unseen-ratio preference, cooldown behaviour, paper order preservation, explainability lines, and the near-duplicate similarity blend. |
| `tests/backup.test.js` | 8 | Backup and restore: payload contents and counts, SHA-256 integrity, validation of a corrupted file, merge without duplicates, preference for newer local classifications, live settings preserved on merge, and a full round-trip. |
| `tests/e2e.test.js` | 14 | A complete journey through the services: import the demo bank → an incomplete paper is labelled → take a full simulation in the original order with the source duration → autosave and resume across an interruption → deterministic scoring → report distinguishes outcomes and weak areas → mistake escalation, auto-resolution and reopening → revision scheduling and queue → analytics from recorded attempts only → custom test with custom scoring and shuffled options (matching never shuffled) → a classification correction being reversible → syllabus import and manual progress separate from bank data → backup and restore → no-network behaviour. |
| `tests/ui.test.js` | 18 | The **real UI in jsdom**: `index.html` boots with IndexedDB and the **bundled 2013–2024 bank is loaded automatically** (1,171 questions, 12 papers, no manual import), every route renders without an error notice, the Import screen analyses the demo bank and imports it through the actual buttons, a **full paper simulation is started, answered, autosaved, submitted and reported through the DOM**, topic and smart sessions start from the shared configuration form, an unfinished session is offered for resume and returns with its answers, and **leaving the test screen stops its background timer** so the clock cannot keep ticking and writing while another screen is open, the mistake book / revision centre / analytics reflect that submission, a setting persists, the backup round-trip self-test passes, the `?` shortcut opens the help dialog, **every route renders with one `<h1>`, no skipped heading levels (`h1 -> h2 -> h3`), and updates `document.title`**, **dialogs move focus inside, mark `#main` `inert`, trap `Tab`/`Shift+Tab` at boundaries, close on `Escape`, and restore focus to the trigger**, **off-canvas navigation is `inert` / non-focusable when closed and closes on scrim click or `Escape`**, **tabs implement WAI-ARIA APG roving `tabindex` (`ArrowRight`, `ArrowLeft`, `Home`, `End`)**, **theme setting and header toggle update `html[data-theme]` and `<meta name="theme-color">`**, **the test runner supports distraction-free focus mode, keyboard hint bar, `aria-keyshortcuts`, Hindi `lang="hi"` tagging, and provenance chips, and no card, badge, dialog or report shows the bank's source or calls a stored key official**, the offline notice toggles, and the **stylesheet regression** suite below holds. |
| `tests/pyq-analysis.test.js` | 13 | The question-bank counts and the Insights panel that shows them: questions per subject and topic with shares and per-paper/year splits; dynamic year span and chart columns from the 2013–2024 bank; one count per question across subject/topic/year totals; the unclassified bucket; answer gaps/coverage; topic ranking and `topicKey` alignment with practice filters; empty-bank zeros; **no subtopic count**; rendered markup agrees with the live index, starts at `<h2>` because the Insights shell owns the page's only `<h1>`, has no skipped headings, scripts, inline styles or external references, and a plain empty state. |
| `tests/syllabus-analysis.test.js` | 12 | The official syllabus: the extracted JSON **is** the committed notification (every line, against the recorded hash); every Prelims and Mains paper, part and section is represented; no examination-administration content is carried across; the derived study guidance resolves against official lines; search locates a match inside its hierarchy; progress lives in its own store, apart from your own items, and clears only itself; PYQ links are curated, read-only and omitted where no mapping exists — and through the real DOM: the route renders and switches stage, expand/collapse and the detail panel work from the tree, a search result opens the topic in its place, marking from the screen persists while reset asks first, and the legacy `#/syllabus-analysis` routes still render. |
| `tests/section-merge.test.js` | 10 | The two merges, asserted as behaviour rather than markup: the single status vocabulary across both kinds of item (and `revising` reading as *in progress*, never as done); your item landing under the official heading the curated mapping names; an unmapped item waiting in **My plan** instead of being guessed into the tree; an explicit pin overriding the mapping; one roll-up that counts both kinds of item and reaches the dashboard card; a target date and note surviving a status change; **the two stores staying separate on disk** (no migration, no `DB_VERSION` bump); the Syllabus section rendering official text and your own items with your own badged as yours; the Insights boundary in both directions — **the bank tab shows no performance figure and the performance tab counts no bank total**; all four legacy routes still resolving to the merged sections; and **one roll-up reaching `studyPriorities()`** — a branch that could not previously run, because nothing built the topic index it reads — with the least advanced of the two stores winning where they disagree. |
| `tests/tools.test.js` | 3 | The pipeline bridge: `tools/build-bank.mjs` expands intake shorthand correctly, produces a bank that passes the app's own validator with no unexpected warnings, writes a file that imports cleanly into a real database, never invents an answer key or scoring rules, and refuses an intake file with no questions. |
| `tests/pyq-bank.test.js` | 8 | The combined 2013–2024 bank through the real importer in an isolated IndexedDB: all 1,171 questions and 12 papers arrive; the original 571 current-bank questions keep their source IDs, years, numbering, verbatim text, options and printed keys; the eight 2019–2024 omissions match the human answer review; printed keys refer to valid option keys, while 11 questions with 13 blank option cells are retained; no key is marked verified; each supplied classification level is a real taxonomy node, while unsupported lower levels remain null; **the app-facing JSON contains no internal source/review metadata or AI claim**; all papers use the uniform latest-pattern practice scheme; importing does not disturb existing user questions (34 + 1,171 = 1,205); re-import is idempotent. Skips cleanly when the bank has not been built. |
| `tests/builtin-bank.test.js` | 9 | The **repository-backed loader** in an isolated database: a fresh install loads 1,171 questions / 12 papers; repeat and forced loads are idempotent; rebuilt data refreshes while local classification corrections, verified answers, disputes, bookmarks, attempts and user questions survive; stale stored scoring metadata upgrades to the latest practice scheme while explicit user scoring overrides survive; explanation-only rebuild behavior remains documented; removing/reloading the bundled bank touches only its own records; invalid JSON/schema is refused; a real 2019 session scores +3/−1/0. |
| `tests/pipeline.test.js` | 11 | Pipeline repair, reviewed-label merging and review-method metadata, taxonomy checks, app-facing id normalization, source/provenance/build-metadata sanitisation, missing-answer handling, latest-pattern scoring across covered MPPSC years, safe fallback outside coverage, stable demonstration identity, and clean committed-bank sanitisation. |
| `tests/historical-sources.test.js` | 7 | Six strict year-specific source adapters; all 600 source records, 100 question numbers and four option slots per paper; printed answer/explanation preservation; exact placeholder cleanup and 11 questions with 13 blank option cells retained; README/review counts and flags; complete correction decisions in the markdown audit; loud failures on schema/count/number/key mismatch; combine preserves the existing 571 intake records and rejects collisions; integrated 1,171-question classifier output keeps repeated PYQs, applies 566 reviewed labels and 8 answer reviews, uses current-pattern practice scoring, and removes audit-only metadata. |
| `tests/quality-audit.test.js` | 5 | The focused 2013–2024 audit report: all 1,171 question-level records and 323 original queue dispositions, 322 taxonomy-valid review labels, the single unresolved queue item, the targeted MPPSC-2015-078 reaffirmation, repository-only answer-key comparison status, missing explanations, blank options, incomplete taxonomy levels, scoring scope, and proof that internal metadata is excluded from the app-facing bank. |
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

Static integrity checks that catch what unit tests cannot see (see [`docs/UI.md`](UI.md) for the full design-system and guard documentation):

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
* **Official-key verification.** Real previous-year material ships in the bundled bank, but its stored keys are not verified against an official MPPSC answer key. Tests validate structure, source mapping, taxonomy and app behaviour; they do not certify the historical answers or explanations as correct.
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
