# MyMPPSC

A **local-first MPPSC State Service Preliminary Examination practice app**. Previous-year paper simulations, topic and custom practice, smart practice, a mistake book, adaptive revision scheduling, analytics and a study planner — all running in your browser, with **no account, no server and no network calls after the page loads**.

Everything you import and record is stored in IndexedDB on your device. The question bank is data, not code: adding a new paper means importing a JSON file, never rebuilding the app.

---

## Quick start

```bash
npm install          # only needed to run the tests (fake-indexeddb, jsdom)
npm run serve        # serves the folder on http://localhost:8080
```

Then open <http://localhost:8080/>. On an empty database the app offers to load a **clearly-labelled synthetic demonstration bank** so every screen can be explored immediately. It will never be presented as genuine previous-year content.

Any static file server works — the app is plain HTML/CSS/ES modules. To run it offline as a PWA, serve it over `http(s)` (the service worker cannot register on `file://`).

```bash
npm test             # 99 tests: services, end-to-end journey and UI smoke tests
npm run check        # 520+ static integrity checks (imports, routes, assets, data)
python3 tools/make-icons.py   # regenerate the PWA icons (no dependencies)
node tools/build-bank.mjs --help
```

## What it does

| Area | Behaviour |
| --- | --- |
| **PYQ Test Centre** | Full-paper simulations in the **original question order** with the paper's own duration, plus resume/discard for unfinished sessions. Incomplete papers, unknown scoring rules, disputed keys and missing keys are labelled on the paper card *before* you start. |
| **Topic Practice** | Filter by subject, topic, subtopic, year, paper, question type, attempt history and language availability. Live counts before you start. |
| **Custom Test** | Assemble a set from your own selection. Always labelled as a custom set — never as an authentic paper. |
| **Smart Practice** | Builds a session from due revisions, repeated mistakes, skipped questions, weak topics, unseen coverage and under-practised topics, and **explains every allocation line**. Historical frequency is described as a study aid, never a prediction. |
| **Mistake Book** | Wrong answers, skips, flagged questions, repeated mistakes and correct-but-unsure answers, with the full attempt history per question. Resolving keeps the history. |
| **Revision Centre** | Due / overdue / upcoming queues where each entry shows the numeric basis for its date (outcome, confidence, level, interval, ease, time taken). Manual override at any time. |
| **Syllabus & Study Planner** | The syllabus is whatever you import or type — **nothing is hard-coded**. Status is always manual; question-bank linkage is shown separately. Tasks and study-session logging included. |
| **Analytics** | Available questions ≠ unique questions attempted ≠ total attempts. First-attempt accuracy is reported separately from overall accuracy, small samples are labelled, and every figure comes from stored attempts. |
| **Question Bank & Imports** | Two-phase import (analyse → confirm) with schema/version validation, a pre-import summary, duplicate detection, provenance retention, rejected-record inspection, import history and undo. User corrections (classification, verified answer, dispute flag) are appended, never overwritten. |
| **Settings & Backup** | Preferences, scoring defaults, revision rules, full JSON backup with SHA-256 integrity, validated restore (merge or replace), storage diagnostics and a guarded destructive zone. |
| **Offline / PWA** | Service worker precaches the shell; the app keeps working offline. |

Answer-key integrity is enforced throughout: a **supplied** key is never overwritten, an independently **verified** answer is stored alongside it with evidence, keys can be **flagged as disputed**, the policy for which key judges an answer is a setting, and a paper whose scoring rules are unknown **refuses to be scored** until you configure them.

## What it deliberately does not do

* No login, backend, cloud sync or API calls. No telemetry.
* **No AI or model runs inside the app.** Explanations, answers and classifications are imported data: the app displays them exactly as supplied, labels what is missing or unreviewed, and lets you correct it with the original preserved. Nothing is generated.
* No bundled MPPSC syllabus and no bundled genuine previous-year questions. The demonstration dataset is synthetic and badged as such everywhere it appears.
* No exam-prediction claims, no invented questions to "complete" an incomplete paper, and no guarantee that revision makes anything stick.

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
data/demo/                 synthetic demonstration bank
data/examples/             schema example + invalid-records fixture
demo/                      sample intake file for the separate pipeline
tools/                     serve.mjs, check.mjs, build-bank.mjs, make-icons.py
tests/                     node:test suites (services, e2e, UI, tools)
docs/                      schema, data pipeline, testing, limitations, report
```

Layering is strict: `core → services → ui`. Views are HTML strings plus delegated event listeners — no framework, no build step.

## Adding a new paper

1. Produce a bank file that follows `data/schema/question-bank.schema.json` — see `docs/SCHEMA.md`. Question text, options, keys, classifications and explanations come from **your** pipeline, not from this app.
2. Validate it before importing:
   ```bash
   node tools/build-bank.mjs --validate my-bank.json
   ```
3. In the app: **Question Bank & Imports → Import**, review the pre-import summary (papers, counts, rejected records, warnings, duplicates), choose the conflict policy, then confirm.

`tools/build-bank.mjs` can also convert a simpler *intake* file into a bank file and validate the result with the same validator the app uses — see `docs/DATA_PIPELINE.md` and the runnable example in `demo/`.

## Documentation

| Document | Contents |
| --- | --- |
| `docs/SCHEMA.md` | The question-bank JSON schema: every field, versioning rules, validation behaviour. |
| `docs/DATA_PIPELINE.md` | How to produce banks outside the app, with the intake format and worked example. |
| `docs/TESTING.md` | What the test suite covers, what it does not, and a manual verification checklist. |
| `docs/LIMITATIONS.md` | Honest list of what this build does not do or cannot guarantee. |
| `docs/IMPLEMENTATION_REPORT.md` | Feature-by-feature report against the original specification, the tests actually run and their results, and the remaining gaps. |

## Privacy and durability

Your data never leaves the device, which also means **you are responsible for backups**. Browser storage can be cleared by you, by the browser, or when a device runs out of space. Use **Settings & Backup → Download backup** (or `Backup now` in the sidebar) and keep the JSON file outside the browser. The restore path validates structure and verifies the SHA-256 recorded inside the file before writing anything.

## Licence and content notice

The application code is provided as-is for personal study use. It ships **no real examination content**: the demonstration bank is synthetic, and the sample intake file is filler. Any genuine previous-year paper, answer key or syllabus you use with this app is your own import, and its accuracy is your responsibility — verify keys against official documents.
