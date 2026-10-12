# MyMPPSC

A **local-first MPPSC State Service Preliminary Examination practice app**. Previous-year paper simulations, topic and custom practice, smart practice, a mistake book, adaptive revision scheduling, analytics and a study planner — all running in your browser, with **no account, no server and no network calls after the page loads**.

Everything you import and record is stored in IndexedDB on your device. The question bank is data, not code: adding a new paper means importing a JSON file, never rebuilding the app. The repository also ships a classified MPPSC Prelims Paper I bank for **2013–2024** (1,171 questions, 12 papers) which the app loads **from the repository itself** — a fresh install has the papers without anyone importing a file by hand.

---

## Quick start

```bash
npm install          # only needed to run the tests (fake-indexeddb, jsdom)
npm run serve        # serves the folder on http://localhost:8080
```

Then open <http://localhost:8080/>. On first load the app fetches the bundled bank from `data/pyq/mymppsc-pyq-bank.json`, validates it with the same validator the import screen uses, and writes it to your local database — no upload, no manual import. A **clearly-labelled synthetic demonstration bank** remains one click away (Question Bank & Imports → *Demonstration data*) for exploring screens; it is never presented as genuine previous-year content.

**The bundled bank is real previous-year material.** All 1,171 stored keys are supplied but none has been verified against an official MPPSC key: the 2013–2018 packages carry their printed keys, while eight 2019–2024 source omissions were resolved in a committed human review file. No key is called official. The latest reported +3/−1/0 marking pattern is used uniformly for practice across every bundled year at the user’s direction; this is not a claim about the historical rules for each sitting. See `docs/PYQ_AUDIT.md` for the source and classification audit.

Any static file server works — the app is plain HTML/CSS/ES modules. To run it offline as a PWA, serve it over `http(s)` (the service worker cannot register on `file://`).

## The bundled MPPSC bank (repository-backed loading)

```
data/pyq/mymppsc-pyq-bank.json   the classified bank the app loads
js/services/builtin-bank.js      the loader (fetch → validate → import)
js/core/marking.js               the marking schemes the loader writes into papers
sw.js                            precaches the bank, so it works offline
```

* **Fresh install** — on boot the app fetches `data/pyq/mymppsc-pyq-bank.json`,
  validates it with the same validator the import screen uses, and imports it
  through the same two-phase importer. Nothing is uploaded, and there is no
  "choose a file" step.
* **Updates** — a rebuilt bank is picked up on the next load. Idempotence is
  decided by comparing the file with what is stored (new records / changed
  records) plus the recorded SHA-256, not by the file's timestamp: re-opening the
  app, or loading the same bank twice, writes nothing and cannot create
  duplicate questions. A record whose question text and options are unchanged is
  left as it is — the same content identity the rest of the app deduplicates
  on — so a rebuild that changes wording, options, answers, explanations of
  *those* records, or metadata refreshes them, while the rest keep your edits.
* **Your data survives** — the loader imports with the *update, preserving my
  corrections* conflict policy. Your corrections, verified answers, bookmarks,
  attempts, revision history, tests and your own imported questions are kept.
* **Offline** — the bank file is in the service-worker precache list, so after
  the first load the app works with no network.
* **Manual import still works** — for the bundled bank it is simply unnecessary.
  **Question Bank & Imports** shows whether the bundled bank is loaded, offers
  *Check for an updated bundled bank*, and can remove it from this device
  without touching your own data.

The bank is built, and can be rebuilt, from the committed source and review
files — see `docs/PYQ_PIPELINE.md` and `docs/PYQ_AUDIT.md`.

```bash
npm test             # service, UI journey, bank loader, historical-source adapter, PYQ pipeline and analysis suites
npm run check        # static integrity checks for imports, routes, assets, contrast, tokens, shell and the production bank
npm run audit:ui     # alias for npm run check (static UI + contrast + token audit)
python3 tools/make-icons.py   # regenerate the PWA icons (no dependencies)
node tools/build-bank.mjs --help
node tools/classify-bank.mjs --help
```

## Deploying to GitHub Pages

The app is a static site with no build step, so Pages can publish the repository
root directly (**Settings → Pages → Deploy from a branch → `main` / `(root)`**).
Pages serves over HTTPS, which the service worker requires. Four things keep that
working, and `npm run check` fails if any of them is undone:

* **Stay relative.** A project site lives at `https://<user>.github.io/<repo>/`, so a leading slash resolves to the domain root and 404s. Every URL in `index.html`, `sw.js`, `manifest.webmanifest` and `css/app.css` is relative (`css/app.css`, `./js/app.js`), the service worker is registered as `'sw.js'` with `scope: './'`, and its precache list uses `./` prefixes. The same files therefore also work on a custom domain or from `npm run serve` with no changes.
* **Keep an empty `.nojekyll` at the repository root.** Without it Pages runs the tree through Jekyll, which ignores paths that start with an underscore and adds a rebuild step that can drop files.
* **Bump the service-worker cache version** (`const VERSION = 'v1.1.0-14';` in `sw.js`) in the same commit as any change to a precached file — HTML, CSS, JS, icons, demo data. The old caches are deleted on `activate`, which is how a browser that cached a broken shell drops it. If the version did not change, that browser would keep serving the broken files.
* **Verify after deploying:** load the site, check the console for a failed request, then reload once (or unregister the old worker in DevTools → Application → Service Workers) to confirm the new build is the one being served.

## What it does

| Area | Behaviour |
| --- | --- |
| **PYQ Test Centre** | Full-paper practice in the **stored question order** with a configured time limit when available, plus resume/discard for unfinished sessions. The bundled 2013–2024 bank uses the latest reported +3/−1/0 scheme as a practice policy, not as evidence of historical rules. Incomplete papers, unknown scoring rules, disputed keys and missing keys are labelled before you start. |
| **Topic Practice** | Filter by subject, topic, subtopic, attempt history (year, paper, question type and language tuck behind "More filters"). Live counts before you start. A deep link (`#/topic/<Subject>` or `#/topic/<Subject>||<Topic>`) preselects the filters, which is what the PYQ Analysis and dashboard tables link to. |
| **PYQ Analysis** | Counts the previous-year questions stored on this device by subject and by topic, with what each paper contributed to each group. It stops at the topic level: subtopic labels come from an import, not from the printed paper, so counting them would describe the bank instead of the exam. Every count links through to practice on that group. |
| **Custom Test** | Assemble a set from your own selection — subjects and topics up front, everything else optional. Always labelled as a custom set — never as an authentic paper. |
| **Smart Practice** | Builds a session from due revisions, repeated mistakes, skipped questions, weak topics, unseen coverage and under-practised topics, and **explains every allocation line**. Historical frequency is described as a study aid, never a prediction. |
| **Mistake Book** | Wrong answers, skips, flagged questions, repeated mistakes and correct-but-unsure answers, with the full attempt history per question. Resolving keeps the history. |
| **Revision Centre** | Due / overdue / upcoming queues where each entry shows the numeric basis for its date (outcome, confidence, level, interval, ease, time taken). Manual override at any time. |
| **Syllabus & Study Planner** | The syllabus is whatever you import or type — **nothing is hard-coded**. Status is always manual; question-bank linkage is shown separately. |
| **Analytics** | Available questions ≠ unique questions attempted ≠ total attempts. First-attempt accuracy is reported separately from overall accuracy, small samples are labelled, and every figure comes from stored attempts. |
| **Question Bank & Imports** | Two-phase import (analyse → confirm) with schema/version validation, a pre-import summary, duplicate detection, provenance retention, rejected-record inspection, import history and undo. User corrections (classification, verified answer, dispute flag) are appended, never overwritten. |
| **Settings & Backup** | Preferences, scoring defaults, revision rules, full JSON backup with SHA-256 integrity, validated restore (merge or replace), storage diagnostics and a guarded destructive zone. |
| **Offline / PWA** | Service worker precaches the shell; the app keeps working offline. |

Answer-key integrity is enforced throughout: a **supplied** key is never overwritten, an independently **verified** answer is stored alongside it with evidence, keys can be **flagged as disputed**, and the policy for which key judges an answer is a setting. The bundled 2013–2024 papers automatically use the latest practice marking pattern (+3/−1/0); the app does not claim that pattern governed every historical sitting.

Starting a practice session is deliberately low-config. On Topic Practice, Custom Test and Smart Practice the only decisions up front are **what to include**, **how many questions** and **feedback timing**; every other session rule (timing, scoring, confidence, option order, repeats) is pre-filled from your Settings defaults, summarised in one plain-language line, and editable under a collapsed **Advanced settings** disclosure.

## What it deliberately does not do

* No login, backend, cloud sync or API calls. No telemetry.
* **No AI or model runs inside the app.** Explanations, answers and classifications are imported data: the app displays them exactly as supplied, says when a question has none, and lets you correct anything with the original preserved. Nothing is generated, and no review status is claimed for prose the app cannot verify.
* No bundled MPPSC syllabus and no claim to official content. The bundled 2013–2024 bank is transcribed previous-year material whose stored keys are **unverified** against official MPPSC keys; its latest-pattern scoring is a practice policy, not historical proof. The demonstration dataset is synthetic filler and badged as such everywhere it appears.
* No exam-prediction claims, no invented questions to "complete" an incomplete paper, and no guarantee that revision makes anything stick.
* No source-book name, coaching provider, page reference or "official/unofficial key" label anywhere in the bundled bank or the interface. That provenance is kept in the build-time reports (`data/pyq/review-report.md`, `docs/PYQ_AUDIT.md`), not in the app.

## Project layout

```
index.html                 app shell
manifest.webmanifest       PWA manifest
sw.js                      service worker (offline shell)
css/app.css                the entire stylesheet
js/app.js                  boot, navigation, routing table
js/core/                   constants, db (IndexedDB), schema, validate, state, util
js/services/               scoring, attempts, questions, tests, select, revision,
                           analytics, importer, planner, data (backup)
js/ui/                     router, components, views/ (one file per screen)
data/schema/               versioned question-bank JSON Schema
data/taxonomy/             canonical subject/topic/subtopic vocabulary for the pipeline
data/demo/                 synthetic demonstration bank
data/examples/             schema example + invalid-records fixture
data/pyq/                  PYQ pipeline output: bank, classification + review reports
demo/                      sample intake files for the separate pipeline
tools/                     serve.mjs, check.mjs, build-bank.mjs, classify-bank.mjs,
                           classify/ (rule engine, taxonomy, reports, AI queue)
tests/                     node:test suites (services, e2e, UI, tools)
docs/                      schema, data pipeline, testing, limitations, report
```

Layering is strict: `core → services → ui`. Views are HTML strings plus delegated event listeners — no framework, no build step.

## Adding a new paper

1. Produce a bank file that follows `data/schema/question-bank.schema.json` — see `docs/SCHEMA.md`. Question text, options, keys, classifications and explanations come from **your** pipeline, not from this app. For an extracted previous-year paper, `tools/classify-bank.mjs` does the subject/topic/subtopic classification and the integrity reports for you — see `docs/PYQ_PIPELINE.md`.
2. Validate it before importing:
   ```bash
   node tools/build-bank.mjs --validate my-bank.json
   ```
3. In the app: **Question Bank & Imports → Import**, review the pre-import summary (papers, counts, rejected records, warnings, duplicates), choose the conflict policy, then confirm.

`tools/build-bank.mjs` can also convert a simpler *intake* file into a bank file and validate the result with the same validator the app uses — see `docs/DATA_PIPELINE.md` and the runnable example in `demo/`.

## Documentation

| Document | Contents |
| --- | --- |
| `docs/UI.md` | The design system: colour tokens (Light/Dark/Forced-colors) and contrast ratios, Devanagari typography, provenance components, accessibility contract, enumerated `!important` rules, and automated UI guards. |
| `docs/SCHEMA.md` | The question-bank JSON schema: every field, versioning rules, validation behaviour. |
| `docs/DATA_PIPELINE.md` | How to produce banks outside the app, with the intake format and worked example. |
| `docs/PYQ_PIPELINE.md` | The PYQ classification pipeline: the rule engine, the taxonomy, MP-versus-India attribution, the extraction repairs, the human review pass, the app-facing sanitiser and the reports it writes. |
| `docs/MARKING.md` | The latest reported +3/−1/0 pattern used uniformly for practice from 2013 onward, the user-directed retroactive application caveat, and the evidence limitations. |
| `docs/PYQ_AUDIT.md` | Internal audit of the bundled 2013–2024 bank: 1,171 questions across 12 papers, six strict historical source adapters, source/report checks, repairs, classification coverage, unresolved content, answer-key caveats, and marking policy. |
| `docs/TESTING.md` | What the test suite covers, what it does not, and a manual verification checklist. |
| `docs/LIMITATIONS.md` | Honest list of what this build does not do or cannot guarantee. |
| `docs/IMPLEMENTATION_REPORT.md` | Feature-by-feature report against the original specification, the UI overhaul before/after measurements, the tests actually run and their results, and the remaining gaps. |

## Privacy and durability

Your data never leaves the device, which also means **you are responsible for backups**. Browser storage can be cleared by you, by the browser, or when a device runs out of space. Use **Settings & Backup → Download backup** (or `Backup now` in the sidebar) and keep the JSON file outside the browser. The restore path validates structure and verifies the SHA-256 recorded inside the file before writing anything.

## Licence and content notice

The application code is provided as-is for personal study use. Content in this repository is study material, not commission material: the bundled 2013–2024 bank is transcribed previous-year material (1,171 questions across twelve papers, every one carrying a supplied key; none verified against an official key; two legacy extraction records unrecovered — see `docs/PYQ_AUDIT.md`), the demonstration bank and the sample intake file are synthetic filler, and the marking schemes say which patterns are verified and which are only reported. Verify any key against the commission's own key before relying on it, and treat scores as practice feedback, not results.
