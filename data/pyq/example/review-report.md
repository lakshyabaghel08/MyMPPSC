# PYQ bank review report

Generated 2026-10-11T22:21:36.053Z.

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
| Reviewed classification decisions applied / rejected | 0 / 0 |
| Extraction artefacts repaired (escaped line breaks) | 0 |
| Source-provenance fields removed before the bank was built | 11 |
| Literal \n escapes repaired | 0 |
| Papers given an automatic MPPSC scheme | 0 |
| Papers with no verified scheme (app asks for rules) | 0 |
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

## Extraction repairs

Repairs applied to the extraction before the bank was built. No wording was invented: escape artefacts were converted back to the characters they represent, and source provenance was moved out of the app-facing data into this report.

| Repair | Value |
| --- | --- |
| Escaped line breaks converted to real newlines | 0 in 0 string(s) |
| Question source references moved out of the bank | 1 |
| Parser metadata `question_type_basis` removed | 10 |
| Answer source labels removed | 8 |
| Paper names normalised | 1 |
| Paper answer-key source blocks removed | 1 |
| Paper source-file lists removed | 1 |

The bank-level provenance block that was removed is recorded in the sanitisation section below.

Question text, option text, printed answers and explanation wording are otherwise reproduced exactly as the extraction captured them.

## App-facing bank sanitisation

The app-facing bank carries no source provenance. Everything listed here was removed from the file the app loads and is kept in this review report instead.

| What | Value |
| --- | --- |
| Bank id | `PYQ-PIPELINE-SAMPLE` → `PYQ-PIPELINE-SAMPLE` |
| Bank name | PYQ pipeline sample (synthetic — not a genuine MPPSC paper) |
| Question `source_reference` removed by the repair pass | 1 |
| Question `source_reference` still present when the sanitiser ran | 0 |
| `supplied_answer.source` still present when the sanitiser ran | 0 |
| Paper-level answer-key blocks removed | 1 |
| Paper source-file lists removed | 0 |
| Parser metadata fields removed (none) | 0 |
| Review bookkeeping fields removed from `metadata` | 0 |
| Answer keys re-labelled `supplied` | 8 |
| Reviewed classification decisions kept as classification | 0 |
| Questions kept without a key | 2 |
| Literal \n escapes repaired by the sanitiser (the repair pass does the rest) | 0 in 0 string(s) |

The bank-level provenance block that was removed (kept here as the audit record):

```json
{
  "kind": "unspecified",
  "verified": false,
  "notes": "The intake file did not describe provenance. Describe where these questions came from and whether the key has been checked before relying on them.",
  "sources": []
}
```

### Automatic marking scheme written into each paper

| Paper | Year | Scheme | Correct | Incorrect | Unanswered | Total | Duration | Evidence confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `SAMPLE-2023-GS1` | 2023 | the paper stated its own rules — left untouched | +2 | — | — | — | — | source |

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

No source record was deleted, rewritten or merged to produce this bank. Question text, options, stored answers and explanations are carried over verbatim; only classification fields, the automatic marking scheme and review metadata were added. Source provenance (book names, page references, answer sources, key-issue labels) is deliberately not part of the app-facing bank — it is recorded in the sanitisation section of this report instead. Where two records look alike both are kept and flagged here instead of being merged.

Review flags attached to records: **7**.

