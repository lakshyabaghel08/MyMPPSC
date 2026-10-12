# Question-bank quality audit — baseline before remediation

**Snapshot date:** 2026-10-12  |  **Bank:** `data/pyq/mymppsc-pyq-bank.json`  |  **SHA-256:** `a20f6dd672dd7bdb97a423fa106a38f6e93a3d3deb5e6d4c2ddc23c44d2cded0`

This is the question-level inventory captured before any quality-remediation edits. One JSONL record per bank question is in `question-audit-baseline.jsonl`; it records current labels, review-queue reason, available source/preliminary labels (audit-only), source-mapped answer, explanation state, blank option positions, and the in-repository evidence paths. The baseline is immutable evidence of the pre-remediation state.

## Baseline totals

| Check | Count |
| --- | ---: |
| Questions / papers | 1171 / 12 |
| Unplaced (no subject) | 313 |
| Classification review queue | 323 |
| Source-declared missing explanations (all years) | 35 |
| Historical missing explanations (2013–2018) | 28 |
| Historical generic placeholders cleared (2013–2018) | 119 |
| Questions without stored substantive explanation text (missing + cleared placeholders) | 154 |
| Questions with at least one blank option text | 11 |
| Questions with source-review flags | 274 |
| Source-answer mismatches in the local records | 0 |
| Existing human answer reviews | 8 |
| Independently verified against an official key | 0 |

## Per-year inventory

| Year | Questions | Unplaced | Source explanation missing | Placeholder cleared | Blank-option questions | Source-flagged | Local answer mismatches |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2013 | 100 | 50 | 7 | 0 | 1 | 30 | 0 |
| 2014 | 100 | 50 | 2 | 0 | 6 | 37 | 0 |
| 2015 | 100 | 45 | 3 | 0 | 4 | 26 | 0 |
| 2016 | 100 | 50 | 7 | 0 | 0 | 21 | 0 |
| 2017 | 100 | 62 | 6 | 60 | 0 | 74 | 0 |
| 2018 | 100 | 56 | 3 | 59 | 0 | 71 | 0 |
| 2019 | 95 | 0 | 5 | 0 | 0 | 5 | 0 |
| 2020 | 95 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2021 | 94 | 0 | 2 | 0 | 0 | 4 | 0 |
| 2022 | 97 | 0 | 0 | 0 | 0 | 2 | 0 |
| 2023 | 95 | 0 | 0 | 0 | 0 | 1 | 0 |
| 2024 | 95 | 0 | 0 | 0 | 0 | 3 | 0 |

## Evidence limits and answer-key policy

- The repository contains structured JSON source transcriptions, per-year review reports and READMEs; no original question-paper or official answer-key PDFs were found in the repository. The 2013–2018 source review sidecar holds extraction findings, not official keys.
- The 2019–2024 answers come from the extracted solved-book intake; eight previously keyless items have explicit human review entries. The historical 2013–2018 answers are source-printed keys. A local match between stored and printed values is only a source-consistency check; it is **not independent verification**.
- No official-key audit was performed, per the user’s clarification. Keep every answer marked source-supplied/unverified unless evidence in the repository warrants a separate status; do not populate `verified_answer` from a match.
- Near-duplicate records remain separate. This audit is read-only and did not change the production bank.

## Issue codes

- `unplaced_subject`, `missing_topic`, and `missing_subtopic` are separate; no classification field is filled by this snapshot.
- `classification_review_queue` preserves the queue reason/candidates for every queued question.
- `source_explanation_missing` is taken from the structured source audit (2013–2018) or intake content (2019–2024); `generic_placeholder_cleared` is separately reported. `no_stored_explanation_text` is a display-state count, not an additional source-missing count.
- `blank_option_text`, `source_review_flag`, `source_answer_mismatch`, and `existing_human_answer_review` point to items needing review; absence of a flag is not proof of correctness.
