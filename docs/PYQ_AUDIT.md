# Internal audit report — the bundled MPPSC PYQ bank (2019–2024)

This is the working audit trail for `data/pyq/mymppsc-pyq-bank.json`, the bank the
app loads automatically. It is deliberately separate from the app-facing bank:
everything the app must not show (where the text came from, which page it was on,
that the printed keys are unverified) lives here and in
`data/pyq/review-report.md`, not in the JSON the app reads.

Every number below is produced by the pipeline
(`node tools/classify-bank.mjs --in data/pyq/source/MPPSC_PYQ_intake.json
--out data/pyq/mymppsc-pyq-bank.json --reports data/pyq
--apply-review data/pyq/reviewed-labels.jsonl`) and is reproducible from the
committed files. Nothing in this bank was written by an AI provider — no provider
was configured, and every classification says so via `classification_source`.

## 1. What the bank contains

| | |
| --- | --- |
| Bank id / name | `mppsc-prelims-paper1-2019-2024` · *MPPSC Prelims Paper I (General Studies) 2019–2024* |
| Papers | 6 — `MPPSC-2019-P1` … `MPPSC-2024-P1` |
| Questions | 571 (all with exactly four options, unique option keys, valid answer tokens) |
| Source | a solved-book transcription, 573 question blocks of which the parser exported 571 |
| Answer keys | 563 stored, 8 genuinely absent (listed in §3) |
| Explanations | 564 unreviewed prose, 7 absent |
| Classification | subject 571/571 (100%), topic 571/571 (100%), subtopic 553/571 (96.8%) · 327 rule-engine labels, 244 reviewed, **0 AI** |

### How every label was produced

| Source | Questions | What it means |
| --- | --- | --- |
| `pipeline-rules` | 327 (57.3%) | the deterministic rule table in `tools/classify/rules.mjs` |
| `reviewed` | 244 (42.7%) | a person read the question, its options, the printed answer and the explanation and recorded the label in `data/pyq/reviewed-labels.jsonl` (240 of them replaced a rule-engine guess) |
| `pipeline-ai` | 0 | **no AI provider was available or used** |

The review file is part of the repository, so every human decision can be
re-read, challenged and re-run. Each line carries the reason it was chosen. The
pipeline refuses any label that is not a real taxonomy path and reports it
instead of storing it: 244 applied, 0 rejected.

## 2. Repairs made (and what was not touched)

| Repair | Count |
| --- | --- |
| Literal two-character `\n` escapes converted back to real newlines (extraction artefact) | 9,263 sequences in 564 explanation strings |
| Per-question source references removed from the app-facing data | 571 |
| Answer "source" labels removed | 563 |
| Paper-level answer-key blocks and source-file lists removed | 6 + 6 |
| Parser metadata fields removed (`book_additional_information`, `parser_version`, `question_type_basis`, `source_answer_text_preserved_as_options`, …) | 2,284 |
| Review bookkeeping removed from `metadata` (`reviewed_classification`: which file a decision was recorded in, and when) | 244 |
| Answer keys re-labelled `supplied` (neutral: "an answer is stored", no claim about who issued it) | 563 |
| Paper names/ids with a source flavour removed | 6 papers (`MPPSC-2019-GS1-BOOK` → `MPPSC-2019-P1`) |

Question text, options, printed answers and explanation wording were **not**
rewritten: the only text change is the escape repair. The pipeline asserts this
(no record is rejected, none is removed, none is merged).

Remaining answer-format notes that were left exactly as printed:

* 11 questions carry more than one key letter (the book's own multi-answer
  answers). They are stored as-is and the app shows each; nothing was reduced or
  "normalised" to one letter.
* Two questions (`MPPSC-2024-028`, `MPPSC-2024-079`) have no printed key and an
  explanation that says *"This question has been deleted by MPPSC."* — kept,
  keyless, with the note visible.

## 3. Unresolved: answer keys

Eight questions have no key at all. **No answer was invented for any of them.**
They are stored with `supplied_answer.answer = null` and
`answer_key_status = "missing"`; the app labels them *Answer key missing* and
excludes them from scoring.

`MPPSC-2021-057` · `MPPSC-2021-075` · `MPPSC-2022-046` · `MPPSC-2022-059` ·
`MPPSC-2023-026` · `MPPSC-2024-021` · `MPPSC-2024-028` · `MPPSC-2024-079`

All 563 stored keys come from the source's printed answers and have not been
verified against an official MPPSC key. The bank therefore records a key as
`supplied` — it makes no claim about who issued it — and the app never describes
a key as official. Verifying a key is a user action (Question Bank → *Record
verified answer*), which is stored separately and never overwrites the stored
key.

## 4. Unresolved: two question blocks the source parser refused to export

Both are `matching` questions whose List-I/List-II columns were destroyed by the
book's two-column layout. They are **not** in the bank, and no replacement was
written. The audit of what is actually recoverable:

| Id | What the extraction kept | What is missing | Verdict |
| --- | --- | --- | --- |
| `MPPSC-2021-081` (page 83) | a stem asking to match National Highways with places; eight "options" that are really **two** four-option sets (Q81's permutation codes and Q82's `Only 4 / Only 3 / 3 and 4 / 1 and 2`); an explanation that contains Q81's reasoning *and* Q82's stem ("Which of the following Airports is/are not International Airport? 1. Bhopal 2. Indore 3. Khajuraho 4. Gwalior") | the List-I/List-II items for Q81 (the pairings themselves), and Q81's printed answer | **not recoverable from the repository.** Reconstructing Q81 would mean inventing the match list; recovering only Q82 would require guessing its answer from the explanation. Both are left out. |
| `MPPSC-2024-039` (page 166) | the stem and the printed answer `B`; the option codes (`A. (i) (ii) (iii) (iv)` … `D. (ii) (iii) (iv) (i)`); an ODOP explanation listing district–product pairs for every district of Madhya Pradesh | the district↔product pair block itself is interleaved by the two-column extraction ("Ashoknagar B ananas / Khargone Maheshwari Sarees and Bagh Print / Burhanpur Chanderi Sarees / Mandsaur Garlic") and cannot be attributed to items (i)–(iv) with certainty | **not recoverable from the repository.** A human with page 166 of the book can transcribe it. |

To add either question later: transcribe the pair block from the book page, add
the record to `data/pyq/source/MPPSC_PYQ_intake.json` (or a follow-up intake
file), and re-run the pipeline — the review file, the numbering gaps and the
reports all update themselves.

## 5. Unresolved: numbering gaps and near-duplicates

* **27 numbering gaps** in the source book: 2019 `44, 47, 61, 75, 98` · 2020
  `9, 33, 77, 78, 96` · 2021 `64, 76, 80, 82, 85` · 2022 `4, 19, 84` · 2023
  `2, 47, 53, 58, 60` · 2024 `19, 73, 81, 91`. A gap may be a question the book
  itself omits, a deleted question, or an extraction miss. `MPPSC-2021-081` and
  `MPPSC-2024-039` are two of them; the rest are unknown and nothing was invented
  to fill them.
* **36 suspected near-duplicate pairs** (question text similarity ≥ 0.85): all
  kept, none merged. Repeated questions across years are legitimate, so the
  pipeline flags them in `review-report.md` and in `metadata.near_duplicate_candidates`
  instead of deleting anything.
* **18 questions have a subject and topic but no subtopic** — the taxonomy has no
  node for them (for example "Yashodharman's Sondani inscription" has no Aulikara
  entry, "inner limbs of Ashtanga Yoga" has no yoga entry). They are left without
  a subtopic rather than filed under a wrong one.

## 6. Unresolved: confidence

| | |
| --- | --- |
| Ambiguous/unclassified | 0 |
| Below the 0.6 review threshold | 1 — `MPPSC-2021-065` ("The true justified belief is often called", placed under General Aptitude › Logical reasoning at 0.5) |
| Still in the AI queue | 1 (the same question) |

That question is a philosophy definition with no honest home in this taxonomy. It
is classified at low confidence so the app can show it, and it stays in the
review list so a human can move it. No other question is waiting for a label.

## 7. Marking schemes

All six papers carry the MPPSC State Service Prelims 2019–2025 pattern written
into the paper record by the pipeline (`scheme_id:
mppsc-sse-prelims-2019-2025`: +2 per correct, no negative marking, 0 for
unanswered, 200 marks, 120 minutes, 100 questions per paper, Paper II qualifying
at 40%/30%). No paper needs manual configuration, and the app selects the scheme
automatically when a paper or a full-paper test is opened. See
[`MARKING.md`](MARKING.md) for the evidence and for the 2026-onwards pattern,
which is recorded but **never** applied retrospectively.

## 8. Verification runs

| Check | Result |
| --- | --- |
| `npm test` | 182 tests, 182 pass, 0 fail (includes the 10 pipeline tests in `tests/pipeline.test.js` and the 8 loader/scoring tests in `tests/builtin-bank.test.js`) |
| `npm run check` | All 814 static checks passed |
| Validator (inside the pipeline) | ok — 0 fatal, 0 errors, 0 rejected, 16 warnings |
| Fresh install | the app loads the committed bank from the repository on first boot (asserted in `tests/ui.test.js` and `tests/builtin-bank.test.js`): 571 questions, 6 papers, no manual import |
| Re-import / re-init | nothing is duplicated; user data is untouched (asserted in `tests/pyq-bank.test.js` and `tests/builtin-bank.test.js`) |
| Upgrade | a rebuilt bank refreshes the changed record and keeps the user's corrections, verified answer, dispute flag and own questions (asserted in `tests/builtin-bank.test.js`) |
| Offline | the bank file is in the service-worker precache list (`sw.js`, cache `v1.1.0-9`) |

## 9. Limitations a reader should know

1. **The answer keys are the source's printed answers, unverified.** No official
   MPPSC key was reachable while building this bank, so no key is described as
   official and none was "corrected".
2. **No AI provider was available.** The 244 human-reviewed labels are labelled
   `reviewed`; the 327 rule-engine labels are labelled `pipeline-rules`. Nothing
   in the bank, the app or the reports claims an AI classification.
3. **Two questions of 573 are missing** (§4) and 27 numbering gaps remain (§5).
4. **The 2026-onwards marking pattern is recorded at `confidence: "reported"`**
   and is never applied to the 2019–2024 papers in this bank.
5. **Explanations are the book's prose, unreviewed** (564 of them). The app shows
   them exactly as stored and marks their status; it never writes or "fixes" one.

## 10. How to re-run and re-verify

```bash
# rebuild the bank and both reports (the review decisions are committed)
node tools/classify-bank.mjs \
  --in data/pyq/source/MPPSC_PYQ_intake.json \
  --out data/pyq/mymppsc-pyq-bank.json \
  --reports data/pyq \
  --apply-review data/pyq/reviewed-labels.jsonl

npm test          # 182 tests
npm run check     # 814 static integrity checks
```

The pipeline writes nothing if the app's validator would reject a record. The
audit trail for a single question is: the intake record → its row in
`review-report.md` → the label line (with reason) in
`data/pyq/reviewed-labels.jsonl` → the app-facing record in the bank.
