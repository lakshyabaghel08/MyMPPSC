# PYQ bank review report

Generated 2026-10-11T20:26:28.750Z.

## Summary

| Check | Count |
| --- | --- |
| Questions in the source file | 10 |
| Questions in the built bank | 10 |
| Records removed | 0 |
| Records merged | 0 |
| Missing answer keys | 2 |
| Near-duplicate pairs | 1 |
| Identical-content groups | 0 |
| Ambiguous classifications | 2 |
| Low-confidence classifications | 0 |
| AI labels applied / preserved / rejected / malformed | 0 / 0 / 0 / 0 |

## Missing answer keys

These questions are in the bank with `supplied_answer.answer = null` and `answer_key_status = "missing"`. The app excludes them from scoring and labels them *Answer key missing*. **No answer was fabricated for any of them.**

| Question | Paper | Year | Question text (excerpt) |
| --- | --- | --- | --- |
| `SAMPLE-2023-GS1-007` | SAMPLE-2023-GS1 | 2023 | In the context of administrative history, which one of the following best describes the arrangement shown in the table? |
| `SAMPLE-2023-GS1-008` | SAMPLE-2023-GS1 | 2023 | Consider the following statements and identify which one of them is consistent with the passage above. |

## Suspected duplicates

Detected by the same similarity pass the app runs at import time (blended token and 3-word-shingle Jaccard on the question text). **Both records of every pair are kept** — the pipeline never merges or deletes a suspected duplicate, because reworded questions about the same fact are often legitimately separate.

| Question A | Question B | Similarity | Same paper? |
| --- | --- | --- | --- |
| `SAMPLE-2023-GS1-009` | `SAMPLE-2023-GS1-010` | 0.933 | yes |

## Ambiguous classifications

Either the evidence was too weak to pick a subject, or two subjects scored too close to separate. These are left `Unclassified` (or without a topic) and are exactly the records the resumable AI queue picks up.

| Question | Assigned | Reason | Candidates |
| --- | --- | --- | --- |
| `SAMPLE-2023-GS1-007` | unclassified | no_rule_matched | — |
| `SAMPLE-2023-GS1-008` | unclassified | no_rule_matched | — |

## Low-confidence classifications

None.

## Content integrity

| Check | Count |
| --- | --- |
| Variants with no question text | 0 |
| Variants with fewer than two options | 0 |
| Empty option text | 0 |
| Answers that do not match an option key | 0 |
| Duplicated option keys | 0 |
| Multi-answer keys on single-correct questions | 0 |
| Questions with no question number | 0 |
| Disputed keys | 1 |
| Verified answer differs from printed key | 1 |
| Records rejected by validation | 0 |
| Unreviewed explanations | 6 |
| Questions without an explanation | 4 |
| Duplicate ids in the source | 0 |
| Unmapped source keys | 0 |

### Per-record adapter notes

- SAMPLE-2023-GS1-006: answer "Kanha National Park" was given as option text and mapped to key A
- SAMPLE-2023-GS1-007: no usable printed answer; the question stays without a key
- SAMPLE-2023-GS1-008: no usable printed answer; the question stays without a key

## Preservation statement

No source record was deleted, rewritten or merged to produce this bank. Question text, options, printed answers, explanations, years, papers and source references are carried over verbatim; classification fields and review metadata are the only additions. Where two records look alike both are kept and flagged here instead of being merged.

Review flags attached to records: **7**.

