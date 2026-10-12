# Internal audit — bundled MPPSC PYQ bank, 2013–2024

The repository-backed file `data/pyq/mymppsc-pyq-bank.json` is the app-facing bank. This document summarizes the build; the detailed per-question and source reports are `data/pyq/review-report.md`, `data/pyq/review-report.json`, and `data/pyq/historical-source-audit.md`. Source review flags, preliminary labels, source citations, repair decisions, and build metadata stay in those audit files, not in the bank loaded by the app.

## Bank contents and integrity

| Measure | Result |
| --- | ---: |
| Questions / papers | 1,171 / 12 |
| App-facing bank SHA-256 | `a20f6dd672dd7bdb97a423fa106a38f6e93a3d3deb5e6d4c2ddc23c44d2cded0` |
| Historical source intake, 2013–2018 | 600 questions across 6 papers; 100 per paper; 0 rejected |
| Existing bank retained, 2019–2024 | 571 questions across 6 papers; all original question IDs and numbering retained |
| Stored answer keys | 1,171; 0 missing; none represented as independently verified |
| Explanation prose | 1,017 questions with content; 154 without content (7 pre-existing omissions, 28 historical source omissions, 119 exact generic placeholders cleared to null) |
| Historical blank option texts | 11, kept empty rather than reconstructed; each question still has four option positions |
| Historical source/review-report mismatches | 0 text/answer mismatches; 0 report-only flag differences; 0 rejected records |
| Duplicate handling | 153 near-duplicate pairs reported; 0 identical-content groups; no questions merged or deleted |
| Rule-engine taxonomy coverage | subject 858/1,171 (73.3%); topic 850/1,171 (72.6%); subtopic 832/1,171 (71.1%) |
| Unplaced / low confidence | 313 unplaced, retained with empty classification; 10 low-confidence labels |
| Human label review / AI queue | 244 reviewed labels applied; 323 questions remain queued for optional review |
| AI | 0 provider labels applied; no AI classification is claimed |
| Validation | 0 fatal errors, 0 errors, 0 rejected records; 301 review warnings |

The 2019–2024 questions were rebuilt from the committed intake plus the existing human label and answer-review files. Their original IDs, years, question numbers, question wording, options, explanations, answers, and taxonomy labels were checked against the prior production bank; those fields match. The eight answers supplied by the existing human review remain documented in `data/pyq/reviewed-answers.jsonl`. User-specific browser corrections, verified answers, disputes, attempts, revision records, and imported questions remain local and are protected by the repository bank's update/merge path.

The adapter uses a separate strict schema branch for each 2013–2018 package. It verifies all six source JSON files against their README summaries and review reports, validates numbering 1–100, preserves all four option positions and the printed answer key, and refuses to silently drop a mismatched record. The 2016 README's “100 normalized questions” count is parsed and checked. Detailed per-year counts, source flags, preliminary-label counts, and before/after repairs are in `historical-source-audit.md`.

## Repairs and unresolved content

- **126 documented historical adapter repairs:** 119 exact “Factual Question” placeholders were changed to `null`; the remainder are narrowly scoped extraction/format repairs evidenced by the source text. No answer key or explanation was invented or rewritten.
- **Three 2018 review-report notes** were corrected after comparing each note with its source question, answer, options, and explanation. These report corrections do not alter the source question wording or printed key.
- **Eleven blank option texts** remain blank. The adapter does not reconstruct missing option wording.
- **2019–2024 source extraction limitations remain:** the parser detected 573 blocks and exported 571. The two unrecovered blocks are `MPPSC-2021-081` and `MPPSC-2024-039`; neither was reconstructed. The existing source book has 27 numbering gaps. See the historical 2019–2024 detail retained in the source review and `data/pyq/review-report.md`.
- Genuine repeated PYQs remain separate records. Similarity is reported for review, never used as a deduplication instruction.

Printed keys are carried as `supplied`; none is marked verified against an official MPPSC answer key. The app does not claim that the source explanations or keys are official.

## Current-pattern scoring policy

Every bundled paper from 2013 onward uses the latest reported MPPSC practice pattern: **+3 per correct answer, −1 per incorrect answer, and 0 for unanswered**. This uniform application to past papers is the user's explicit direction. It is a practice-scoring policy, **not evidence that historical MPPSC examinations used these rules**. The underlying 2026 pattern is reported from secondary sources and is not marked as primary-source verified. See [`MARKING.md`](MARKING.md) and the scheme evidence shown in the paper/test UI.

## App-facing sanitisation

The committed bank does not contain the root generator/provenance block, per-question source references, answer-source labels, paper source files, internal `built_by` metadata, review flags, source preliminary labels, classification confidence/source tags, or explanation-review bookkeeping. The sanitizer removes those fields again on rebuild and records them in the separate review report. The established bank id is retained so existing installations update in place. The service worker precaches the expanded bank for offline use.

## Rebuild and verification

```bash
node tools/classify-bank.mjs \
  --include-2013-2018 \
  --in data/pyq/source/MPPSC_PYQ_intake.json \
  --apply-review data/pyq/reviewed-labels.jsonl \
  --apply-answers data/pyq/reviewed-answers.jsonl \
  --source-review data/pyq/source/MPPSC_PYQ_Review.json \
  --out data/pyq/mymppsc-pyq-bank.json \
  --reports data/pyq

npm test
npm run check
```

Final verification against this unified bank on 2026-10-12 passed: `npm test`
reported 205/205 tests, 0 failures and 0 skips; `npm run check` passed all 860
static checks. The service-worker cache version was `v1.1.0-14`.
