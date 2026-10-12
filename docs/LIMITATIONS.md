# Limitations

This is the honest list, written to be read before trusting any screen.

## Scope and content

* **What ships is transcribed, not official.** The repository bundles a classified MPPSC Prelims Paper I bank for 2013–2024 (1,171 questions, 12 papers), and it is loaded automatically — see the section below for exactly what it does and does not claim. The demonstration bank and the `demo/` sample intake file are synthetic filler, badged `demonstration` everywhere they appear. Anything else meaningful comes from a bank you import, and its accuracy is your responsibility.
* **The planner has no syllabus of its own.** The planner mirrors whatever structure you import or create. "Suggest from question bank" copies the subjects and topics your own data already has — it is not an official syllabus and does not claim to be. The separate **Syllabus Analysis** screen ships the commission's revised 2026 syllabus read-only (see the section below); it never writes into the planner.
* **No AI or model runs inside the app.** Explanations, keys and classifications are imported data. The app displays an explanation exactly as it is stored, says so when a question has none, and never generates or "improves" one.
* **No examination predictions.** Topic frequency, priorities and smart-practice allocation describe *your stored bank and your recorded answers*. They are study aids. Nothing here estimates a future paper's content or your result.
* **No guarantee of retention.** The revision schedule is a transparent heuristic (outcome + confidence + answer time → interval). It cannot promise that anything is remembered.

## The bundled MPPSC bank (2013–2024)

* **1,171 questions across twelve papers** (`MPPSC-2013-P1` … `MPPSC-2024-P1`). The 571 existing 2019–2024 records are preserved; six strict adapters append 600 historical questions from 2013–2018. It is loaded from the repository on first boot; no import step is needed.
* **All 1,171 questions carry a supplied key, but none is verified against an official MPPSC key.** The 2013–2018 packages supply 600 printed keys; eight missing keys in the 2019–2024 source were resolved by the committed human review file. The app never calls a stored key official; a key *you* verify is stored separately.
* **Two legacy question blocks of the 573 the 2019–2024 source parser detected are missing** and could not be recovered: `MPPSC-2021-081` (a two-column match-list whose item block was destroyed by the extraction) and `MPPSC-2024-039` (a district–product match whose option block was interleaved). 27 numbering gaps remain in that legacy source. No question was invented to fill any of them — `docs/PYQ_AUDIT.md` describes the limitations.
* **Classification is honest and taxonomy-bound.** After the focused 2026-10-12 audit, all 1,171 questions have taxonomy-supported subjects; 1,162 have topics and 1,076 have subtopics. Nine stop at subject, 86 stop at topic, and one low-confidence current label (`MPPSC-2021-065`) remains in the internal review queue. The 244 legacy `human_review` labels and 322 new `agent_assisted_validation` labels are documented in `data/pyq/reviewed-labels.jsonl`; the labels are taxonomy-validated, and no unsupported lower-level node is forced. No provider-generated `pipeline-ai` labels were merged. The full before/after record, remaining gaps and rationale are in `data/pyq/quality-audit/quality-audit-final.md`; review metadata is not in student practice records.
* **Explanations are source prose** — displayed as stored and never generated. 1,017 questions have explanation content; 154 do not (7 existing omissions, 28 historical source omissions and 119 exact generic placeholders cleared to null). The app attaches no review status to them.
* **Latest-pattern practice scoring is applied automatically across every bundled year:** +3 correct, −1 incorrect, 0 unanswered. This user-directed application to 2013–2024 is not evidence that historical papers used those rules. The underlying 2026 pattern remains `reported`, not primary-source verified; see `docs/MARKING.md`.
* **Removing it is safe.** Question Bank & Imports → *Remove bundled bank from this device* removes those questions and papers only; your own data is untouched and it can be reloaded at any time.

## The Syllabus Analysis section (MPPSC 2026)

* **What it shows is transcribed, never retyped.** `tools/build-syllabus.mjs` lifts every line out of the committed notification (`data/MPPSC 2026 Syllabus.md`, SHA-256 recorded in `data/syllabus/mppsc-2026-syllabus.json`) at a source line and page, and the build fails if a bullet inside a syllabus region would be dropped.
* **Source gaps are declared, not filled.** Pages 8, 18 and 45 are absent from the source file; several Prelims sections and Mains units have no English rendition, and 13 Mains units are listed without a title of their own — those rows read "Unit N" and the detail panel says so. No text was invented to cover any gap.
* **Examination-administration content is excluded by design** — the notice, both exam plans, durations, marks, qualifying rules and negative marking. Where a Paper V or Paper VI table row mixed curriculum with a marks plan, the marks annotation was deleted from the curriculum.
* **Both official renditions are kept.** The tree shows the app's chosen language where the source provides it, with the other rendition beside it in the detail panel; a line the source gives in one language only stays in that language.
* **The study breakdown is guidance, not the syllabus.** Every breakdown and unit is labelled `derived` where it appears, and `node tools/build-syllabus.mjs --check-guide` fails if any unit cannot be traced back to official lines.
* **Progress is its own store** (`syllabus_progress`), never mixed with question practice, planner rows or revision records; it is optional (the module is fully readable with nothing marked) and reset only after a confirmation.
* **Previous-year links are read-only and deliberately partial.** They exist only where the bank's own taxonomy already carries the matching subject or topic, and never carry a count, so a missing link can never be read as "no questions exist". Mains headings carry none, because the bundled bank holds no Mains questions.

## Data and durability

* **Storage is per browser profile.** IndexedDB in the browser you are using. Clearing site data, using a different browser/profile, or a device running out of space removes it. Backups are the user's job; the app can only make that easy.
* **No sync.** There is no cloud copy, no multi-device support and no automatic backup to disk.
* **Backups are JSON files only.** Restore validates structure and the recorded SHA-256 before writing, but a backup whose major format version differs is refused, and restoring *replace* mode clears local data first — export a fresh backup before doing that.
* **Merge restore keeps current settings**, on purpose, so a merge can never silently change how the app behaves; only *replace* adopts the backup's settings.
* **Evidence export is JSON.** There is no CSV export yet for attempts or analytics.
* **No multi-user separation.** Anyone with access to the browser profile can read and modify everything in it.

## Correctness boundaries

* **Unscored ≠ wrong.** A question with no usable answer key is excluded from scoring and labelled `unscored`. It therefore cannot contribute to accuracy — including in numbers like "answer rate".
* **Accuracy figures count only scored attempts**, and overall accuracy includes repeats. This is why first-attempt accuracy is reported alongside it; both are affected by small samples, which the app labels (`insufficient evidence` under 3 scored answers, no strong/weak verdict under 5).
* **Duplicate detection is a prompt, not a verdict.** Exact duplicates use a fingerprint over normalised text and options; near-duplicates use a blended similarity score above a configurable threshold. Rephrased questions about the same fact are often legitimately separate, so nothing is merged or deleted automatically.
* **Multiple-correct questions use exact set matching** — no partial credit (unless/until a rule adds it). Multi-answer keys on `single_correct` questions are warned about, not silently corrected.
* **Auto-resolve rules are heuristics.** A mistake entry resolves when a later attempt is correct (and, for confidence-tracked questions, confidently correct). Reopening is always possible. "Resolved" means "not currently flagged", not "proven learned".
* **Confidence is self-reported.** It is stored separately from correctness and used for scheduling and for the confidence matrix, but it is only as honest as the person marking it.
* **Timers depend on the device clock.** Remaining time is derived from a stored deadline and reconciled on resume; a device whose clock changes between sessions can move the timer. Autosave caps how much wall-clock time one save can claim, to avoid absurd per-question times after a laptop sleeps.
* **Import is all-or-nothing per file for fatal problems**, but individual invalid records are rejected while the rest import — by design. The rejected records are always listed and exportable, never dropped silently.
* **Undo removes what an import *created*** — papers and questions — and leaves updates and attempts alone.
* **Question deletion is real deletion.** Deleting a question from the bank keeps its attempts in your history, but those attempts no longer resolve to a question, so they drop out of question-level analytics.

## Interface

* **English interface text only.** Hindi question text is preserved verbatim, but the surrounding UI is not translated.
* **UI behaviour is verified by a jsdom smoke/journey suite and a manual checklist**, not by a real-browser automated suite (no Playwright/Puppeteer in this build). See `docs/TESTING.md`.
* **Accessibility** is implemented deliberately (landmarks, labelled controls, focus-visible styles, keyboard shortcuts, `aria-live` regions, print styles, `prefers-reduced-motion`) but has not been audited with a screen reader.
* **Print/PDF output** is a simplified stylesheet, not a paginated design.
* **Very large banks** (tens of thousands of questions) have not been benchmarked; writes are batched with progress events, and screens read a lightweight index rather than the full bank.
* **Single-language display at a time.** Bilingual questions show one language variant (switchable), and both share one id so they are counted once — but there is no side-by-side bilingual view.

## Out of scope by design

Accounts, logins, sharing, leaderboards, social features, cloud sync, push
notifications, payment, question authoring inside the app, in-app AI, and any
claim to be an official MPPSC product.
