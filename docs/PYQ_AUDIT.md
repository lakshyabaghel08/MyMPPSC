# Internal audit report — the bundled MPPSC PYQ bank (2019–2024)

This is the working audit trail for `data/pyq/mymppsc-pyq-bank.json`, the bank the
app loads automatically. It is deliberately separate from the app-facing bank:
everything the app must not show (where the text came from, which page it was on,
that the printed keys are unverified) lives here and in
`data/pyq/review-report.md`, not in the JSON the app reads.

Every number below is produced by the pipeline
(`node tools/classify-bank.mjs --in data/pyq/source/MPPSC_PYQ_intake.json
--out data/pyq/mymppsc-pyq-bank.json --reports data/pyq
--apply-review data/pyq/reviewed-labels.jsonl
--apply-answers data/pyq/reviewed-answers.jsonl`) and is reproducible from the
committed files. Nothing in this bank was written by an AI provider — no provider
was configured at any point.

**This document is where the working detail lives, and the bank is not.** The
file the app loads carries questions, options, stored answers, explanation prose
and the subject/topic/subtopic labels — and nothing about how any of those were
arrived at. There is no `classification_source`, no `classification_confidence`,
no explanation review status, no near-duplicate pointers and no bank-level
`classification_meta` in it. A learner cannot act on how a build script guessed a
label, and leaving those fields in an imported file invites them to be read as
part of the exam. Everything below is derived from the committed review files and
the build reports in this directory.

## 1. What the bank contains

| | |
| --- | --- |
| Bank id / name | `mppsc-prelims-paper1-2019-2024` · *MPPSC Prelims Paper I (General Studies) 2019–2024* |
| Papers | 6 — `MPPSC-2019-P1` … `MPPSC-2024-P1` |
| Questions | 571 (all with exactly four options, unique option keys, valid answer tokens) |
| Source | a solved-book transcription, 573 question blocks of which the parser exported 571 |
| Answer keys | 571 stored — 563 printed by the source, 8 recorded by the review pass in §3 · 0 absent |
| Explanations | 564 carried from the source (plus the prose written for the §3 resolutions), 7 absent |
| Classification | subject 571/571 (100%), topic 571/571 (100%), subtopic 553/571 (96.8%) · 327 rule-engine labels, 244 reviewed, **0 AI** |

### How every label was produced

Counted from `data/pyq/reviewed-labels.jsonl` and `data/pyq/classification-report.json`,
not from the bank: the bank carries the labels alone.

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
| Classification bookkeeping found in the app-facing file (`classification_confidence`, `classification_source`) | 0 — the builder does not write them; the sanitiser strips any that arrive from a bank re-fed through the pipeline, and the `bank-level classification_meta` block with them |
| Explanation review fields found in the app-facing file (`status`, `generated_by`, `reviewed_by`, dates, `original`, `history`, `explanation_status`) | 0 — same reason |
| Keyless questions resolved by the review pass (see §3) | 8 applied, 0 printed keys overwritten |
| Answer keys re-labelled `supplied` (neutral: "an answer is stored", no claim about who issued it) | 563 |
| Paper names/ids with a source flavour removed | 6 papers (`MPPSC-2019-GS1-BOOK` → `MPPSC-2019-P1`) |

Question text, options, printed answers and explanation wording were **not**
rewritten: the only text change is the escape repair. The pipeline asserts this
(no record is rejected, none is removed, none is merged).

The two zero lines are the point of this section rather than an afterthought: the
app-facing file is built without ever containing those fields, so there is nothing
to remove. `data/pyq/review-report.json` carries the equivalent of each — the
per-record source of every label, the low-confidence list, and the answer
resolutions with their basis and reason — because they describe this build, and a
reader of the bank cannot act on them.

Remaining answer-format notes that were left exactly as printed:

* 11 questions carry more than one key letter (the book's own multi-answer
  answers). They are stored as-is and the app shows each; nothing was reduced or
  "normalised" to one letter.
## 3. Resolved: the eight questions the source left keyless

The extraction printed no answer for eight questions. Four of them carry the note
*"This question has been deleted by MPPSC."*, which is why no key exists — the
commission withdrew the question, so there is no official answer to copy.

Each was resolved once, by hand, in `data/pyq/reviewed-answers.jsonl`, which is
part of the repository. The pipeline pass `--apply-answers` reads that file and
refuses to overwrite a key the source actually printed (0 of these 8 had one; the
pass reports `8 applied, 0 preserved`). The bank stores the answer with
`answer_key_status: "supplied"` — the same status as any other stored key, since
the app should not rank keys by how confident a build script felt about them — and
the *reason* lives only here and in `data/pyq/review-report.md`.

| Id | Paper / question | Answer recorded | Basis |
| --- | --- | --- | --- |
| `MPPSC-2021-057` | 2021 Q57 | **A** — Governor | Article 243K(1) vests the State Election Commission in a Commissioner appointed by the Governor; a constitutional provision answers it directly. |
| `MPPSC-2021-075` | 2021 Q75 | **A** — 18 September 2015 | The printed explanation dates the Defence/Micro-enterprises office to that notification; it is the Attachments Office date recorded by NITI Aayog's DMEO. |
| `MPPSC-2022-046` | 2022 Q46 | **B** — 9th August, 1942 | Of the four dates this paper prints (6, 7, 9, 10 August 1942) only 9 August has any connection with the movement — the Quit India resolution was adopted on 8 August and the arrest followed on 9. |
| `MPPSC-2022-059` | 2022 Q59 | **B** — 1st February, 1994 | The Madhya Pradesh State Election Commission was constituted by a General Administration Department notification of that date (it began functioning on 15 February 1994 under N. B. Lohani). |
| `MPPSC-2023-026` | 2023 Q26 | **B** — Rights relating to education | Question deleted by MPPSC. Section 2(d) of the Protection of Human Rights Act, 1993 lists the rights in question; the education-related rights are the ones outside that definition. |
| `MPPSC-2024-021` | 2024 Q21 | **B** — Mandla and Dindori | Question deleted by MPPSC. The Bhimma are recorded as a section of the Gond tribe, found in the Mandla–Dindori belt. |
| `MPPSC-2024-028` | 2024 Q28 | **B** — Veer Shankar Shah – Raghunath Shah National Award | Question deleted by MPPSC. The award for writings on the cultural tradition of the state carries that name. |
| `MPPSC-2024-079` | 2024 Q79 | **D** — (iv), (ii), (i), (iii) | Question deleted by MPPSC. Standard elevations order the four peaks Dhupgarh 1350 m < Mahendragiri 1501 m < Guru Shikhar 1722 m < Anaimudi 2695 m. |

These are *not* official MPPSC keys. Two of the eight (2021 Q57, 2021 Q75) are
answered by the source's own explanation; the four deleted questions have no
official answer to verify against at all, which is stated in each record's reason.
No candidate should treat a `deleted_by_commission` resolution as an exam answer —
the useful fact is that MPPSC withdrew those questions from that paper.

All 563 other stored keys come from the source's printed answers and have not been
verified against an official MPPSC key either. The bank records every key as
`supplied` — it makes no claim about who issued it — and the app never describes a
key as official. Verifying a key is a user action (Question Bank → *Record
verified answer*), which is stored separately and never overwrites the stored key.

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
| Offline | the bank file is in the service-worker precache list (`sw.js`, cache `v1.1.0-10`) |

## 9. Limitations a reader should know

1. **The answer keys are the source's printed answers, unverified.** No official
   MPPSC key was reachable while building this bank, so no key is described as
   official and none was "corrected".
2. **No AI provider was available.** 244 labels were decided by a human reading
   the question and its options; 327 came from the deterministic rule table. The
   bank stores the labels without saying which of those two produced each one;
   the split above is reproducible from the two committed review files and the
   classification report. Nothing in the bank, the app or the reports claims an AI
   classification.
3. **Two questions of 573 are missing** (§4) and 27 numbering gaps remain (§5).
4. **The 2026-onwards marking pattern is recorded at `confidence: "reported"`**
   and is never applied to the 2019–2024 papers in this bank.
5. **Explanations are the book's prose** (564 of them, plus the reasoning written
   for the §3 resolutions). The app shows them exactly as stored — no status, no
   badge, no claim that anybody checked them — and never writes or "fixes" one.
   Seven questions have no explanation at all; the app says so in plain words.

## 10. How to re-run and re-verify

```bash
# rebuild the bank and both reports (the review decisions are committed)
node tools/classify-bank.mjs \
  --in data/pyq/source/MPPSC_PYQ_intake.json \
  --out data/pyq/mymppsc-pyq-bank.json \
  --reports data/pyq \
  --apply-review data/pyq/reviewed-labels.jsonl \
  --apply-answers data/pyq/reviewed-answers.jsonl

npm test          # 182 tests
npm run check     # 847 static integrity checks
```

The pipeline writes nothing if the app's validator would reject a record. The
audit trail for a single question is: the intake record → its row in
`review-report.md` → the label line (with reason) in
`data/pyq/reviewed-labels.jsonl` → the app-facing record in the bank.
