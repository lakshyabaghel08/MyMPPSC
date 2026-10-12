# Limitations

This is the honest list, written to be read before trusting any screen.

## Scope and content

* **What ships is transcribed, not official.** The repository bundles a classified MPPSC Prelims Paper I bank for 2019–2024 (571 questions, 6 papers), and it is loaded automatically — see the section below for exactly what it does and does not claim. The demonstration bank and the `demo/` sample intake file are synthetic filler, badged `demonstration` everywhere they appear. Anything else meaningful comes from a bank you import, and its accuracy is your responsibility.
* **No syllabus is built in.** The planner mirrors whatever structure you import or create. "Suggest from question bank" copies the subjects and topics your own data already has — it is not an official syllabus and does not claim to be.
* **No AI or model runs inside the app.** Explanations, keys and classifications are imported data. The app displays an explanation exactly as it is stored, says so when a question has none, and never generates or "improves" one.
* **No examination predictions.** Topic frequency, priorities and smart-practice allocation describe *your stored bank and your recorded answers*. They are study aids. Nothing here estimates a future paper's content or your result.
* **No guarantee of retention.** The revision schedule is a transparent heuristic (outcome + confidence + answer time → interval). It cannot promise that anything is remembered.

## The bundled MPPSC bank (2019–2024)

* **571 questions across six papers** (`MPPSC-2019-P1` … `MPPSC-2024-P1`), subject and topic on all 571, subtopic on 553. It is loaded from the repository on first boot; no import step is needed.
* **The answer keys are the source's printed keys, unverified.** 563 questions carry one, 8 carry none (stored `missing`, excluded from scoring, never guessed). The app never describes a stored key as official; a key *you* verify is stored separately and the policy for using it is yours to choose.
* **Two question blocks of the 573 the text contained are missing** and could not be recovered from the repository: `MPPSC-2021-081` (a two-column match-list whose item block was destroyed by the extraction) and `MPPSC-2024-039` (a district–product match whose option block was interleaved). 27 numbering gaps remain. No question was invented to fill any of them — `docs/PYQ_AUDIT.md` §4–5 explains each case.
* **Classification is honest about its source.** 327 questions are labelled by the deterministic rule engine, 244 by a person who read the question, options, printed answer and explanation (their reasons are committed in `data/pyq/reviewed-labels.jsonl`). **No AI provider was available or used**, so nothing is labelled `pipeline-ai`. One question stays below the review confidence threshold and is listed for review.
* **Explanations are the source's prose** — displayed exactly as stored and never generated. 564 of the 571 stored questions carry one; 7 do not. The app attaches no review status to them, because it is not in a position to grant one.
* **The marking scheme is applied automatically** (+2, no negative marking, 200 marks, 120 minutes for 2019–2025). The 2026-onwards pattern is recorded but marked `reported`, never applied to these papers — see `docs/MARKING.md`.
* **Removing it is safe.** Question Bank & Imports → *Remove bundled bank from this device* removes those questions and papers only; your own data is untouched and it can be reloaded at any time.

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
