# MPPSC 2013–2024 question-bank quality audit — final

**Status: applied on 2026-10-12.** This is a focused remediation of the integrated 1,171-question bank, not a rebuild. The existing 571 questions from 2019–2024, the question bank size, answers, options, explanations, and scoring policy were preserved.

## Classification coverage

| Measure | Before | After |
| --- | ---: | ---: |
| Questions | 1,171 | 1,171 |
| Subject set | 858 | 1,171 |
| No subject | 313 | 0 |
| Topic set | 850 | 1,162 |
| No topic | 321 | 9 |
| Subtopic set | 832 | 1,076 |
| No subtopic (including subject-only records) | 339 | 95 |
| Original classification review queue | 323 | 1 |
| Reviewed-label records | 244 | 566 |

All 323 original queue items have a question-level disposition: **313 classified**, **7 existing partial labels corrected/completed**, **2 confirmed**, and **1 retained unresolved**. The 322 proposed/appended labels passed exact taxonomy-path validation. **320 classification paths changed; 2 were confirmed unchanged.** The new labels are explicitly marked `agent_assisted_validation`; no label is represented as an official source or a verified answer.

Final coverage is **1,171/1,171 subjects**, **1,162/1,171 topics**, and **1,076/1,171 subtopics**. Missing narrower labels are intentional, not placeholders: 9 questions have no topic and 86 have a topic but no subtopic. See `classification-taxonomy-gaps.jsonl` for every remaining gap.

The 9 subject-only labels are retained because the content does not support an existing topic node; 68 reviewed queue items stop at topic because no narrower existing subtopic is supported. One more topic-only item is the retained unresolved `MPPSC-2021-065`, and 17 additional topic-only records outside the original review queue were left untouched. Its “true justified belief”/knowledge concept has no clearly fitting existing taxonomy path.

A final question-stem/rationale consistency pass covered all 323 dispositions and 322 labels; options and available explanations were checked where needed to resolve or narrow a classification. It refined five paths: `MPPSC-2016-097` was corrected from Biology to History / Modern India / Acts and constitutional development; `MPPSC-2016-059` was moved from IT to Current Affairs / Appointments and personalities; `MPPSC-2015-021`, `MPPSC-2017-021`, and `MPPSC-2018-005` now stop at Biology because the taxonomy has no precise plant-classification/medicinal-crop subtopic.
A separate targeted spot-check reaffirmed `MPPSC-2015-078` as History / History of Madhya Pradesh / Revolt of 1857 in Madhya Pradesh. Repository explanations for `MPPSC-2021-068` and `MPPSC-2023-091` corroborate Bhima Nayak’s participation in and leadership of the 1857 revolt; this is a content cross-check, not an official-key or independent historical verification. The reaffirmation did not change its path or the five-adjustment count.

## Preservation and answer-source scope

- Questions: **1,171 before and after**; papers: **12 before and after**; deleted/merged records: **0**. No near-duplicates were automatically merged.
- Existing 2019–2024 questions: **571**, with question wording, options, stored answers, explanations and classifications unchanged (yes).
- All 1,171 question texts, option arrays, stored answers and explanation fields match the captured baseline (yes). No answer, explanation or option was edited.
- Repository source-key comparisons: **1163 match; 0 mismatches**. 8 existing answer records have no local printed-key comparison (including 8 prior answer-review records). This is a repository-source consistency check only: **0 answers were officially verified**, and no official key comparison was performed, per instruction.
- Source-review flags remain in internal audit records. Specific conflicts such as `MPPSC-2015-097` (key B vs. explanation naming penicillin) and `MPPSC-2016-060` (virus/worm wording mismatch) were not resolved by changing answers. The 2017–2018 statutory/date/attribution notes remain linked to their question records.
- No internal review/provenance fields were added to the app-facing bank; normal practice views do not receive the audit metadata.

## Explanations and blank options

- Existing source explanation state across the bank: **1017 supplied**, **119 generic placeholders already removed by the original integration**, **35 source-missing**. This audit changed **0 explanations**.
- Historical source-missing explanations (28): MPPSC-2013-016, MPPSC-2013-039, MPPSC-2013-050, MPPSC-2013-051, MPPSC-2013-056, MPPSC-2013-073, MPPSC-2013-088, MPPSC-2014-003, MPPSC-2014-073, MPPSC-2015-004, MPPSC-2015-028, MPPSC-2015-054, MPPSC-2016-004, MPPSC-2016-013, MPPSC-2016-056, MPPSC-2016-057, MPPSC-2016-059, MPPSC-2016-066, MPPSC-2016-068, MPPSC-2017-075, MPPSC-2017-084, MPPSC-2017-085, MPPSC-2017-086, MPPSC-2017-090, MPPSC-2017-095, MPPSC-2018-021, MPPSC-2018-046, MPPSC-2018-053.
- Current-period source-missing explanations (7): MPPSC-2019-076, MPPSC-2019-077, MPPSC-2019-078, MPPSC-2019-079, MPPSC-2019-080, MPPSC-2021-094, MPPSC-2021-095.
- Blank options: **11 questions / 13 option cells**, unchanged; none restored. No original paper/primary-document file was found in the inspected local source tree, so blanks were not guessed.
- Blank question/keys: MPPSC-2013-061 (B); MPPSC-2014-004 (A); MPPSC-2014-027 (A); MPPSC-2014-035 (A); MPPSC-2014-041 (A); MPPSC-2014-055 (C); MPPSC-2014-061 (C/D); MPPSC-2015-004 (C); MPPSC-2015-013 (A/D); MPPSC-2015-036 (A); MPPSC-2015-044 (A).

## Scoring

The current product scoring policy remains **+3 correct / −1 incorrect / 0 unanswered** across all 12 practice papers (yes). It is a uniform current-pattern practice scheme, **not evidence of each year’s historical marking rules**.

## Artifacts and evidence

- `question-audit-baseline.jsonl`: full pre-remediation question-level snapshot; original bank SHA-256 `a20f6dd672dd7bdb97a423fa106a38f6e93a3d3deb5e6d4c2ddc23c44d2cded0`.
- `question-audit-final.jsonl`: all 1,171 questions with before/after classification, source-answer comparison status, explanation state, blank-option status and final issue codes.
- `classification-review-decisions.jsonl`: one rationale and disposition for each of the original 323 queue items.
- `reviewed-labels-quality-remediation.jsonl`: 322 appended labels with confidence, rationale and explicit review method.
- `classification-taxonomy-gaps.jsonl`: all 95 final records without a subtopic, including the 9 subject-only entries and pre-existing gaps left unchanged.
- `ai-queue-baseline.jsonl`: archived original 323-item queue. Production `ai-queue.jsonl` now contains only `MPPSC-2021-065`.
- `quality-audit-final.json`: machine-readable before/after totals and scope notes.

The older `classification-report.*` and `review-report.*` are explicitly marked as pre-remediation integration snapshots; use this final audit for current coverage. No merge or push was performed.
