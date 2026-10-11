# Testing

Everything here has actually been run. No test in this document is aspirational.

```bash
npm test          # 99 tests, all passing
npm run check     # 521 static integrity checks, all passing
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
| `tests/ui.test.js` | 8 | The **real UI in jsdom**: `index.html` boots with IndexedDB, the first-run prompt offers the demonstration bank and says it is synthetic, every route renders without an error notice, the Import screen analyses the demo bank and imports it through the actual buttons, a **full paper simulation is started, answered, autosaved, submitted and reported through the DOM**, the mistake book / revision centre / analytics reflect that submission, a setting persists, the backup round-trip self-test passes, the `?` shortcut opens the help dialog, and the offline notice toggles. |
| `tests/tools.test.js` | 3 | The pipeline bridge: `tools/build-bank.mjs` expands intake shorthand correctly, produces a bank that passes the app's own validator with no unexpected warnings, writes a file that imports cleanly into a real database, never invents an answer key or scoring rules, and refuses an intake file with no questions. |

`tests/helpers.mjs` is the shared harness: it installs an in-memory IndexedDB
(`fake-indexeddb`), a memory `localStorage`, and a `fetch` that serves the
repository from disk. The service layer was written to run without a DOM, which
is what makes these suites fast and deterministic.

## Static checks (`npm run check`)

521 cheap checks that catch what unit tests cannot see:

* every relative import and dynamic import resolves to a real file;
* no module imports from a URL (no CDN dependency);
* each file in `js/ui/views/` satisfies the router contract (`title`, `render`);
* every route registered in `js/app.js` has a view file, every navigation entry has a route, and the ten required destinations plus the custom-test builder are present;
* every `getElementById` in `js/app.js` matches an id in `index.html`;
* `sw.js`, the manifest, the stylesheet and the icons exist; the manifest has 192/512 and maskable icons; the service worker precaches the shell and every view module;
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
