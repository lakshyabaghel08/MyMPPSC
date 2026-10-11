# PYQ bank review report

Generated 2026-10-11T21:15:05.001Z.

## Summary

| Check | Count |
| --- | --- |
| Questions in the source file | 571 |
| Questions in the built bank | 571 |
| Records removed | 0 |
| Records merged | 0 |
| Missing answer keys | 8 |
| Near-duplicate pairs | 36 |
| Identical-content groups | 0 |
| Ambiguous classifications | 228 |
| Low-confidence classifications | 25 |
| AI labels applied / preserved / rejected / malformed | 0 / 0 / 0 / 0 |

## Missing answer keys

These questions are in the bank with `supplied_answer.answer = null` and `answer_key_status = "missing"`. The app excludes them from scoring and labels them *Answer key missing*. **No answer was fabricated for any of them.**

| Question | Paper | Year | Question text (excerpt) |
| --- | --- | --- | --- |
| `MPPSC-2021-057` | MPPSC-2021-GS1-BOOK | 2021 | State Chief Election Commissioner is appointed by |
| `MPPSC-2021-075` | MPPSC-2021-GS1-BOOK | 2021 | The Development Monitoring and Evaluation Office (DMEO) was constituted on |
| `MPPSC-2022-046` | MPPSC-2022-GS1-BOOK | 2022 | Quit India Movement was started on |
| `MPPSC-2022-059` | MPPSC-2022-GS1-BOOK | 2022 | When did the Madhya Pradesh State Election Commission come into existence? |
| `MPPSC-2023-026` | MPPSC-2023-GS1-BOOK | 2023 | Which of the following rights is not under the purview of the National Human Rights Commission? |
| `MPPSC-2024-021` | MPPSC-2024-GS1-BOOK | 2024 | Bhimma tribe lives in which of the districts of Madhya Pradesh ? |
| `MPPSC-2024-028` | MPPSC-2024-GS1-BOOK | 2024 | Which award is given for writings on the cultural tradition and specialties of tribal life in Indian literature? |
| `MPPSC-2024-079` | MPPSC-2024-GS1-BOOK | 2024 | Arrange the following mountain peaks, in ascending order, according to their height: (i) Guru Shikhar (ii) Mahendragiri (iii) Anaimudi (iv)  |

## Suspected duplicates

Detected by the same similarity pass the app runs at import time (blended token and 3-word-shingle Jaccard on the question text). **Both records of every pair are kept** — the pipeline never merges or deletes a suspected duplicate, because reworded questions about the same fact are often legitimately separate.

| Question A | Question B | Similarity | Same paper? |
| --- | --- | --- | --- |
| `MPPSC-2022-086` | `MPPSC-2023-076` | 1 | no |
| `MPPSC-2021-002` | `MPPSC-2022-086` | 0.923 | no |
| `MPPSC-2021-002` | `MPPSC-2023-076` | 0.923 | no |
| `MPPSC-2020-028` | `MPPSC-2023-035` | 0.889 | no |
| `MPPSC-2024-012` | `MPPSC-2024-075` | 0.889 | yes |
| `MPPSC-2021-070` | `MPPSC-2023-035` | 0.889 | no |
| `MPPSC-2020-036` | `MPPSC-2021-058` | 0.873 | no |
| `MPPSC-2020-018` | `MPPSC-2021-056` | 0.857 | no |
| `MPPSC-2022-087` | `MPPSC-2023-074` | 0.8 | no |
| `MPPSC-2022-077` | `MPPSC-2022-083` | 0.8 | yes |
| `MPPSC-2020-028` | `MPPSC-2021-070` | 0.8 | no |
| `MPPSC-2019-048` | `MPPSC-2020-028` | 0.75 | no |
| `MPPSC-2022-083` | `MPPSC-2022-086` | 0.733 | yes |
| `MPPSC-2022-083` | `MPPSC-2023-076` | 0.733 | no |
| `MPPSC-2020-061` | `MPPSC-2022-074` | 0.706 | no |
| `MPPSC-2022-074` | `MPPSC-2022-076` | 0.706 | yes |
| `MPPSC-2020-090` | `MPPSC-2023-068` | 0.7 | no |
| `MPPSC-2022-006` | `MPPSC-2023-043` | 0.7 | no |
| `MPPSC-2020-017` | `MPPSC-2022-058` | 0.7 | no |
| `MPPSC-2020-028` | `MPPSC-2020-063` | 0.692 | yes |
| `MPPSC-2021-002` | `MPPSC-2024-012` | 0.692 | no |
| `MPPSC-2021-002` | `MPPSC-2022-083` | 0.688 | no |
| `MPPSC-2022-072` | `MPPSC-2022-077` | 0.688 | yes |
| `MPPSC-2019-024` | `MPPSC-2023-035` | 0.667 | no |
| `MPPSC-2019-024` | `MPPSC-2023-048` | 0.667 | no |
| `MPPSC-2019-048` | `MPPSC-2023-035` | 0.667 | no |
| `MPPSC-2022-086` | `MPPSC-2024-075` | 0.667 | no |
| `MPPSC-2023-076` | `MPPSC-2024-075` | 0.667 | no |
| `MPPSC-2021-084` | `MPPSC-2023-035` | 0.667 | no |
| `MPPSC-2019-018` | `MPPSC-2019-020` | 0.643 | yes |
| `MPPSC-2020-005` | `MPPSC-2020-028` | 0.636 | yes |
| `MPPSC-2022-098` | `MPPSC-2022-100` | 0.636 | yes |
| `MPPSC-2022-006` | `MPPSC-2023-041` | 0.636 | no |
| `MPPSC-2020-005` | `MPPSC-2024-012` | 0.636 | no |
| `MPPSC-2020-028` | `MPPSC-2024-012` | 0.636 | no |
| `MPPSC-2019-094` | `MPPSC-2021-096` | 0.625 | no |

## Ambiguous classifications

Either the evidence was too weak to pick a subject, or two subjects scored too close to separate. These are left `Unclassified` (or without a topic) and are exactly the records the resumable AI queue picks up.

| Question | Assigned | Reason | Candidates |
| --- | --- | --- | --- |
| `MPPSC-2019-004` | Polity | topic ambiguous between Constitution of India and Constitutional bodies | Polity (9.98) |
| `MPPSC-2019-006` | unclassified | no_rule_matched | — |
| `MPPSC-2019-009` | unclassified | no_rule_matched | — |
| `MPPSC-2019-010` | unclassified | no_rule_matched | — |
| `MPPSC-2019-016` | unclassified | ambiguous_subject | Art and Culture (4.01), History (3.56) |
| `MPPSC-2019-017` | unclassified | ambiguous_subject | Geography (2.03), Madhya Pradesh Special (1.8), Polity (1.25) |
| `MPPSC-2019-019` | unclassified | insufficient_signal | Madhya Pradesh Special (1.13) |
| `MPPSC-2019-021` | unclassified | no_rule_matched | — |
| `MPPSC-2019-022` | unclassified | no_rule_matched | — |
| `MPPSC-2019-023` | unclassified | no_rule_matched | — |
| `MPPSC-2019-024` | unclassified | no_rule_matched | — |
| `MPPSC-2019-025` | unclassified | no_rule_matched | — |
| `MPPSC-2019-027` | unclassified | no_rule_matched | — |
| `MPPSC-2019-029` | unclassified | no_rule_matched | — |
| `MPPSC-2019-031` | unclassified | ambiguous_subject | Environment (2.93), Science and Technology (2.42) |
| `MPPSC-2019-033` | unclassified | no_rule_matched | — |
| `MPPSC-2019-035` | unclassified | no_rule_matched | — |
| `MPPSC-2019-039` | unclassified | no_rule_matched | — |
| `MPPSC-2019-045` | unclassified | no_rule_matched | — |
| `MPPSC-2019-049` | unclassified | no_rule_matched | — |
| `MPPSC-2019-053` | unclassified | no_rule_matched | — |
| `MPPSC-2019-054` | unclassified | no_rule_matched | — |
| `MPPSC-2019-055` | unclassified | no_rule_matched | — |
| `MPPSC-2019-058` | Geography | topic ambiguous between Rivers of Madhya Pradesh and Physiography of Madhya Pradesh | Geography (3.94) |
| `MPPSC-2019-062` | unclassified | no_rule_matched | — |
| `MPPSC-2019-063` | unclassified | no_rule_matched | — |
| `MPPSC-2019-065` | unclassified | no_rule_matched | — |
| `MPPSC-2019-066` | unclassified | ambiguous_subject | Madhya Pradesh Special (4.59), Polity (4.22) |
| `MPPSC-2019-070` | unclassified | no_rule_matched | — |
| `MPPSC-2019-071` | unclassified | no_rule_matched | — |
| `MPPSC-2019-072` | unclassified | no_rule_matched | — |
| `MPPSC-2019-073` | unclassified | no_rule_matched | — |
| `MPPSC-2019-074` | unclassified | no_rule_matched | — |
| `MPPSC-2019-078` | unclassified | no_rule_matched | — |
| `MPPSC-2019-079` | unclassified | no_rule_matched | — |
| `MPPSC-2019-082` | unclassified | no_rule_matched | — |
| `MPPSC-2019-085` | unclassified | no_rule_matched | — |
| `MPPSC-2019-086` | unclassified | no_rule_matched | — |
| `MPPSC-2019-089` | unclassified | no_rule_matched | — |
| `MPPSC-2019-092` | unclassified | ambiguous_subject | Polity (5.57), History (5.09) |
| `MPPSC-2019-095` | unclassified | no_rule_matched | — |
| `MPPSC-2019-100` | unclassified | no_rule_matched | — |
| `MPPSC-2020-005` | unclassified | no_rule_matched | — |
| `MPPSC-2020-006` | Polity | topic ambiguous between Union Executive and State Government | Polity (8.18), Economy (1.25) |
| `MPPSC-2020-011` | unclassified | no_rule_matched | — |
| `MPPSC-2020-012` | unclassified | insufficient_signal | Science and Technology (1.08) |
| `MPPSC-2020-014` | unclassified | insufficient_signal | Science and Technology (1.08), Current Affairs (1.05) |
| `MPPSC-2020-015` | unclassified | no_rule_matched | — |
| `MPPSC-2020-017` | unclassified | ambiguous_subject | Polity (3.96), Economy (3.7) |
| `MPPSC-2020-019` | unclassified | ambiguous_subject | Polity (4.49), Environment (3.96) |
| `MPPSC-2020-020` | unclassified | no_rule_matched | — |
| `MPPSC-2020-021` | unclassified | ambiguous_subject | History (1.33), Geography (1.25), Art and Culture (1.17) |
| `MPPSC-2020-035` | unclassified | ambiguous_subject | History (4.42), Polity (4.22) |
| `MPPSC-2020-036` | Polity | topic ambiguous between Constitutional bodies and Judiciary | Polity (12.6) |
| `MPPSC-2020-041` | unclassified | no_rule_matched | — |
| `MPPSC-2020-042` | unclassified | ambiguous_subject | Art and Culture (2.03), Madhya Pradesh Special (1.8), Geography (1) |
| `MPPSC-2020-046` | unclassified | no_rule_matched | — |
| `MPPSC-2020-047` | unclassified | no_rule_matched | — |
| `MPPSC-2020-048` | unclassified | no_rule_matched | — |
| `MPPSC-2020-049` | unclassified | no_rule_matched | — |
| `MPPSC-2020-051` | unclassified | insufficient_signal | History (1) |
| `MPPSC-2020-053` | unclassified | insufficient_signal | History (1.17) |
| `MPPSC-2020-054` | unclassified | ambiguous_subject | Polity (2.93), Madhya Pradesh Special (2.49), Geography (1.08) |
| `MPPSC-2020-057` | unclassified | insufficient_signal | Economy (1.17) |
| `MPPSC-2020-058` | unclassified | no_rule_matched | — |
| `MPPSC-2020-059` | unclassified | insufficient_signal | Science and Technology (1.17) |
| `MPPSC-2020-060` | unclassified | no_rule_matched | — |
| `MPPSC-2020-061` | unclassified | no_rule_matched | — |
| `MPPSC-2020-062` | unclassified | insufficient_signal | Science and Technology (1.08) |
| `MPPSC-2020-064` | unclassified | no_rule_matched | — |
| `MPPSC-2020-065` | unclassified | no_rule_matched | — |
| `MPPSC-2020-085` | unclassified | ambiguous_subject | Economy (6.22), Geography (6.08) |
| `MPPSC-2020-086` | unclassified | no_rule_matched | — |
| `MPPSC-2020-088` | unclassified | no_rule_matched | — |
| `MPPSC-2020-089` | unclassified | no_rule_matched | — |
| `MPPSC-2020-091` | unclassified | no_rule_matched | — |
| `MPPSC-2020-092` | unclassified | no_rule_matched | — |
| `MPPSC-2020-093` | unclassified | no_rule_matched | — |
| `MPPSC-2020-094` | unclassified | no_rule_matched | — |
| `MPPSC-2020-095` | unclassified | no_rule_matched | — |
| `MPPSC-2020-099` | unclassified | no_rule_matched | — |
| `MPPSC-2020-100` | unclassified | no_rule_matched | — |
| `MPPSC-2021-002` | Geography | topic ambiguous between Climate and soils of Madhya Pradesh and Physical Geography | Geography (12.26), Madhya Pradesh Special (1.91), History (1.69) |
| `MPPSC-2021-007` | unclassified | insufficient_signal | Current Affairs (1.17) |
| `MPPSC-2021-010` | unclassified | no_rule_matched | — |
| `MPPSC-2021-015` | unclassified | no_rule_matched | — |
| `MPPSC-2021-016` | unclassified | no_rule_matched | — |
| `MPPSC-2021-017` | unclassified | no_rule_matched | — |
| `MPPSC-2021-026` | unclassified | no_rule_matched | — |
| `MPPSC-2021-027` | unclassified | no_rule_matched | — |
| `MPPSC-2021-028` | unclassified | no_rule_matched | — |
| `MPPSC-2021-029` | unclassified | insufficient_signal | Science and Technology (1.17) |
| `MPPSC-2021-030` | unclassified | insufficient_signal | Science and Technology (1.08) |
| `MPPSC-2021-032` | unclassified | insufficient_signal | History (1.19) |
| `MPPSC-2021-035` | unclassified | no_rule_matched | — |
| `MPPSC-2021-036` | unclassified | ambiguous_subject | History (4.9), Polity (4.68) |
| `MPPSC-2021-043` | unclassified | no_rule_matched | — |
| `MPPSC-2021-046` | unclassified | no_rule_matched | — |
| `MPPSC-2021-048` | unclassified | ambiguous_subject | Geography (2.93), History (2.81) |
| `MPPSC-2021-049` | unclassified | insufficient_signal | Geography (1) |
| `MPPSC-2021-050` | unclassified | ambiguous_subject | Geography (5), General Aptitude (4.25) |
| `MPPSC-2021-051` | unclassified | insufficient_signal | Current Affairs (1) |
| `MPPSC-2021-053` | unclassified | insufficient_signal | History (1.12) |
| `MPPSC-2021-057` | Polity | topic ambiguous between Constitutional bodies and Judiciary | Polity (9.89) |
| `MPPSC-2021-058` | Polity | topic ambiguous between Constitutional bodies and Judiciary | Polity (12.6) |
| `MPPSC-2021-061` | unclassified | no_rule_matched | — |
| `MPPSC-2021-062` | unclassified | no_rule_matched | — |
| `MPPSC-2021-063` | unclassified | no_rule_matched | — |
| `MPPSC-2021-065` | unclassified | no_rule_matched | — |
| `MPPSC-2021-069` | unclassified | no_rule_matched | — |
| `MPPSC-2021-075` | Polity | topic ambiguous between Union and State Relations and Statutory and regulatory bodies | Polity (3.67), Economy (1.17), Madhya Pradesh Special (1.07) |
| `MPPSC-2021-078` | unclassified | ambiguous_subject | Madhya Pradesh Special (4.32), Polity (3.96) |
| `MPPSC-2021-087` | unclassified | insufficient_signal | Science and Technology (1.05) |
| `MPPSC-2021-088` | unclassified | insufficient_signal | History (1.17) |
| `MPPSC-2021-095` | unclassified | no_rule_matched | — |
| `MPPSC-2021-098` | unclassified | insufficient_signal | History (0.91) |
| `MPPSC-2022-001` | unclassified | no_rule_matched | — |
| `MPPSC-2022-002` | unclassified | no_rule_matched | — |
| `MPPSC-2022-005` | unclassified | no_rule_matched | — |
| `MPPSC-2022-006` | unclassified | no_rule_matched | — |
| `MPPSC-2022-007` | unclassified | no_rule_matched | — |
| `MPPSC-2022-010` | unclassified | insufficient_signal | Science and Technology (1.08) |
| `MPPSC-2022-011` | unclassified | ambiguous_subject | Current Affairs (1.25), History (1.25) |
| `MPPSC-2022-012` | unclassified | no_rule_matched | — |
| `MPPSC-2022-013` | unclassified | no_rule_matched | — |
| `MPPSC-2022-015` | unclassified | no_rule_matched | — |
| `MPPSC-2022-016` | unclassified | no_rule_matched | — |
| `MPPSC-2022-017` | unclassified | no_rule_matched | — |
| `MPPSC-2022-020` | unclassified | no_rule_matched | — |
| `MPPSC-2022-024` | unclassified | insufficient_signal | History (1) |
| `MPPSC-2022-025` | unclassified | no_rule_matched | — |
| `MPPSC-2022-028` | unclassified | ambiguous_subject | Polity (1.25), Madhya Pradesh Special (1.2), Geography (1.13) |
| `MPPSC-2022-031` | unclassified | no_rule_matched | — |
| `MPPSC-2022-033` | unclassified | no_rule_matched | — |
| `MPPSC-2022-034` | unclassified | ambiguous_subject | Environment (1.25), Science and Technology (1.25) |
| `MPPSC-2022-035` | unclassified | no_rule_matched | — |
| `MPPSC-2022-037` | unclassified | ambiguous_subject | Environment (2.48), Geography (2.17) |
| `MPPSC-2022-039` | unclassified | insufficient_signal | Science and Technology (0.98) |
| `MPPSC-2022-041` | unclassified | no_rule_matched | — |
| `MPPSC-2022-043` | unclassified | no_rule_matched | — |
| `MPPSC-2022-050` | unclassified | no_rule_matched | — |
| `MPPSC-2022-054` | unclassified | no_rule_matched | — |
| `MPPSC-2022-057` | Polity | topic ambiguous between Constitution of India and Constitutional bodies | Polity (16.41) |
| `MPPSC-2022-063` | unclassified | insufficient_signal | Economy (1.05) |
| `MPPSC-2022-072` | unclassified | insufficient_signal | Geography (1.08) |
| `MPPSC-2022-075` | unclassified | insufficient_signal | Geography (1.08) |
| `MPPSC-2022-076` | unclassified | no_rule_matched | — |
| `MPPSC-2022-078` | unclassified | no_rule_matched | — |
| `MPPSC-2022-083` | Geography | topic ambiguous between Geography of India and Physiography of Madhya Pradesh | Geography (16.49), Madhya Pradesh Special (1.91) |
| `MPPSC-2022-093` | unclassified | no_rule_matched | — |
| `MPPSC-2022-097` | unclassified | no_rule_matched | — |
| `MPPSC-2022-099` | Polity | topic ambiguous between State Government and Union Executive | Polity (8.54) |
| `MPPSC-2023-003` | unclassified | ambiguous_subject | Environment (2.75), Geography (2.48), History (1.17) |
| `MPPSC-2023-005` | unclassified | no_rule_matched | — |
| `MPPSC-2023-009` | unclassified | no_rule_matched | — |
| `MPPSC-2023-011` | unclassified | ambiguous_subject | Polity (3), Economy (2.8), Madhya Pradesh Special (1.91) |
| `MPPSC-2023-014` | unclassified | insufficient_signal | Economy (1.17) |
| `MPPSC-2023-015` | unclassified | no_rule_matched | — |
| `MPPSC-2023-019` | Polity | topic ambiguous between State Government and Union Legislature | Polity (8.37) |
| `MPPSC-2023-024` | unclassified | no_rule_matched | — |
| `MPPSC-2023-031` | unclassified | no_rule_matched | — |
| `MPPSC-2023-032` | unclassified | no_rule_matched | — |
| `MPPSC-2023-035` | unclassified | no_rule_matched | — |
| `MPPSC-2023-036` | unclassified | no_rule_matched | — |
| `MPPSC-2023-037` | unclassified | no_rule_matched | — |
| `MPPSC-2023-038` | unclassified | no_rule_matched | — |
| `MPPSC-2023-039` | unclassified | insufficient_signal | Current Affairs (1) |
| `MPPSC-2023-040` | Economy | topic ambiguous between Banking and finance and Indian Economy | Economy (2.75), Science and Technology (1.25) |
| `MPPSC-2023-041` | unclassified | no_rule_matched | — |
| `MPPSC-2023-042` | unclassified | no_rule_matched | — |
| `MPPSC-2023-043` | unclassified | no_rule_matched | — |
| `MPPSC-2023-044` | unclassified | no_rule_matched | — |
| `MPPSC-2023-045` | unclassified | no_rule_matched | — |
| `MPPSC-2023-046` | unclassified | no_rule_matched | — |
| `MPPSC-2023-048` | unclassified | no_rule_matched | — |
| `MPPSC-2023-049` | unclassified | insufficient_signal | Science and Technology (1.17) |
| `MPPSC-2023-050` | unclassified | no_rule_matched | — |
| `MPPSC-2023-054` | unclassified | no_rule_matched | — |
| `MPPSC-2023-059` | unclassified | ambiguous_subject | Environment (1.42), Geography (1.17) |
| `MPPSC-2023-063` | unclassified | insufficient_signal | History (0.93) |
| `MPPSC-2023-064` | unclassified | insufficient_signal | History (1.05) |
| `MPPSC-2023-073` | Geography | topic ambiguous between Physiography of Madhya Pradesh and Climate and soils of Madhya Pradesh | Geography (22.94), Science and Technology (1.25), Economy (1.17) |
| `MPPSC-2023-077` | unclassified | no_rule_matched | — |
| `MPPSC-2023-079` | unclassified | insufficient_signal | Geography (0.84) |
| `MPPSC-2023-080` | unclassified | insufficient_signal | Geography (1.08) |
| `MPPSC-2023-081` | unclassified | no_rule_matched | — |
| `MPPSC-2023-086` | unclassified | no_rule_matched | — |
| `MPPSC-2023-094` | unclassified | no_rule_matched | — |
| `MPPSC-2023-099` | unclassified | insufficient_signal | Art and Culture (0.9) |
| `MPPSC-2023-100` | History | topic ambiguous between Medieval India and Modern India | History (1.87) |
| `MPPSC-2024-003` | unclassified | no_rule_matched | — |
| `MPPSC-2024-005` | unclassified | ambiguous_subject | Environment (4.68), Geography (4.32) |
| `MPPSC-2024-006` | unclassified | no_rule_matched | — |
| `MPPSC-2024-016` | Polity | topic ambiguous between Union Legislature and Constitution of India | Polity (9.34), Current Affairs (1) |
| `MPPSC-2024-023` | History | topic ambiguous between Modern India and Medieval India | History (2.67), Madhya Pradesh Special (1.13) |
| `MPPSC-2024-028` | unclassified | no_rule_matched | — |
| `MPPSC-2024-029` | Polity | topic ambiguous between Union Executive and State Government | Polity (2.58), Economy (1.17) |
| `MPPSC-2024-030` | unclassified | no_rule_matched | — |
| `MPPSC-2024-035` | unclassified | no_rule_matched | — |
| `MPPSC-2024-037` | Economy | topic ambiguous between Indian Economy and Economy of Madhya Pradesh | Economy (11.91) |
| `MPPSC-2024-041` | unclassified | no_rule_matched | — |
| `MPPSC-2024-042` | unclassified | no_rule_matched | — |
| `MPPSC-2024-043` | unclassified | no_rule_matched | — |
| `MPPSC-2024-044` | unclassified | no_rule_matched | — |
| `MPPSC-2024-045` | unclassified | insufficient_signal | Science and Technology (1.17) |
| `MPPSC-2024-046` | unclassified | no_rule_matched | — |
| `MPPSC-2024-047` | unclassified | no_rule_matched | — |
| `MPPSC-2024-049` | unclassified | no_rule_matched | — |
| `MPPSC-2024-050` | unclassified | no_rule_matched | — |
| `MPPSC-2024-052` | unclassified | ambiguous_subject | Geography (3.6), History (3.33), Economy (1.17) |
| `MPPSC-2024-053` | unclassified | no_rule_matched | — |
| `MPPSC-2024-056` | unclassified | no_rule_matched | — |
| `MPPSC-2024-058` | unclassified | no_rule_matched | — |
| `MPPSC-2024-061` | unclassified | insufficient_signal | Art and Culture (1.17) |
| `MPPSC-2024-070` | unclassified | no_rule_matched | — |
| `MPPSC-2024-078` | unclassified | insufficient_signal | Geography (1.08) |
| `MPPSC-2024-079` | unclassified | no_rule_matched | — |
| `MPPSC-2024-080` | unclassified | no_rule_matched | — |
| `MPPSC-2024-082` | Polity | topic ambiguous between Union Legislature and Union Executive | Polity (8.54) |
| `MPPSC-2024-083` | unclassified | ambiguous_subject | Madhya Pradesh Special (4.99), Current Affairs (4.32), History (1.42) |
| `MPPSC-2024-084` | unclassified | ambiguous_subject | Art and Culture (1.25), Current Affairs (1.25), History (1.08) |
| `MPPSC-2024-086` | unclassified | no_rule_matched | — |
| `MPPSC-2024-088` | Polity | topic ambiguous between Judiciary and Statutory and regulatory bodies | Polity (11.35) |
| `MPPSC-2024-093` | History | topic ambiguous between Ancient India and Prehistory and Art | History (9.45), Geography (1) |
| `MPPSC-2024-094` | Environment | topic ambiguous between Environmental laws and institutions and Protected areas | Environment (8.69), Geography (4.21), History (1.91) |
| `MPPSC-2024-096` | unclassified | no_rule_matched | — |
| `MPPSC-2024-099` | unclassified | insufficient_signal | History (1.08) |
| `MPPSC-2024-100` | unclassified | no_rule_matched | — |

## Low-confidence classifications

Classified, but below the 0.6 review threshold. The app marks them as uncertain.

| Question | Subject | Topic | Confidence |
| --- | --- | --- | --- |
| `MPPSC-2019-004` | Polity | — | 0.5 |
| `MPPSC-2019-058` | Geography | — | 0.5 |
| `MPPSC-2020-006` | Polity | — | 0.5 |
| `MPPSC-2020-036` | Polity | — | 0.5 |
| `MPPSC-2021-002` | Geography | — | 0.5 |
| `MPPSC-2021-019` | Madhya Pradesh Special | Tribes of Madhya Pradesh | 0.57 |
| `MPPSC-2021-057` | Polity | — | 0.5 |
| `MPPSC-2021-058` | Polity | — | 0.5 |
| `MPPSC-2021-068` | Madhya Pradesh Special | Tribes of Madhya Pradesh | 0.59 |
| `MPPSC-2021-075` | Polity | — | 0.5 |
| `MPPSC-2022-057` | Polity | — | 0.5 |
| `MPPSC-2022-083` | Geography | — | 0.5 |
| `MPPSC-2022-099` | Polity | — | 0.5 |
| `MPPSC-2023-019` | Polity | — | 0.5 |
| `MPPSC-2023-040` | Economy | — | 0.5 |
| `MPPSC-2023-073` | Geography | — | 0.5 |
| `MPPSC-2023-100` | History | — | 0.5 |
| `MPPSC-2024-016` | Polity | — | 0.5 |
| `MPPSC-2024-023` | History | — | 0.5 |
| `MPPSC-2024-029` | Polity | — | 0.5 |
| `MPPSC-2024-037` | Economy | — | 0.5 |
| `MPPSC-2024-082` | Polity | — | 0.5 |
| `MPPSC-2024-088` | Polity | — | 0.5 |
| `MPPSC-2024-093` | History | — | 0.5 |
| `MPPSC-2024-094` | Environment | — | 0.5 |

## Source extraction findings

Reported by the source parser itself (data/pyq/source/MPPSC_PYQ_Review.json, parser 0.1.0; input `YOUR_BOOK_columns(3).md`, sha256 `126500ed672a6d16…`).

| Measure | Value |
| --- | --- |
| question blocks detected | 573 |
| records exported to intake | 571 |
| records excluded pending review | 2 |
| records flagged for review | 17 |
| missing stem | 0 |
| missing options | 1 |
| missing or unparsed answer | 9 |
| missing explanation | 7 |
| deleted question records | 0 |

**2 question block(s) the parser refused to export — they are NOT in this bank** and need manual transcription from the book:

| Id | Year / Q# | Page | Why | Preview |
| --- | --- | --- | --- | --- |
| `MPPSC-2021-081` | 2021 / 81 | 83 | printed_answer_not_parseable, duplicate_option_key, missing_or_unparsed_answer, no_usable_options | Match List - I with List - II and select the correct answer from the codes given below: List-I List-II (National Highway) (Passes through) A |
| `MPPSC-2024-039` | 2024 / 39 | 166 | missing_options, no_usable_options | Match the following districts of Madhya Pradesh with their unique product: District Product Ashoknagar B ananas Khargone Maheshwari Sarees a |

**27 numbering gap(s)** across 6 year(s). A gap may be a deleted question, an extraction miss, or a question start the parser could not recognise — the source parser explicitly warns not to assume the question is absent from the book:

- 2019: 44, 47, 61, 75, 98
- 2020: 9, 33, 77, 78, 96
- 2021: 64, 76, 80, 82, 85
- 2022: 4, 19, 84
- 2023: 2, 47, 53, 58, 60
- 2024: 19, 73, 81, 91

15 further record(s) the parser flagged but still exported:

- `MPPSC-2019-076` (2019 Q76): missing_explanation
- `MPPSC-2019-077` (2019 Q77): missing_explanation
- `MPPSC-2019-078` (2019 Q78): missing_explanation
- `MPPSC-2019-079` (2019 Q79): missing_explanation
- `MPPSC-2019-080` (2019 Q80): missing_explanation
- `MPPSC-2021-057` (2021 Q57): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2021-075` (2021 Q75): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2021-094` (2021 Q94): missing_explanation
- `MPPSC-2021-095` (2021 Q95): missing_explanation
- `MPPSC-2022-046` (2022 Q46): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2022-059` (2022 Q59): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2023-026` (2023 Q26): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2024-021` (2024 Q21): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2024-028` (2024 Q28): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2024-079` (2024 Q79): printed_answer_not_parseable, missing_or_unparsed_answer

> This is structural parsing only, not answer verification.
> Question numbering may reset each year; IDs include the detected year.
> Numbering gaps are listed per year. They may indicate deleted questions, extraction gaps, or question starts that need manual review; do not assume they are absent from the source without checking.
> The source book can contain errors; supplied answers are marked unofficial.
> Review all flagged records and run MyMPPSC's own bank builder/validator before import.

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
| Disputed keys | 0 |
| Verified answer differs from printed key | 0 |
| Records rejected by validation | 0 |
| Unreviewed explanations | 564 |
| Questions without an explanation | 7 |
| Duplicate ids in the source | 0 |
| Unmapped source keys | 0 |

### Per-record adapter notes

- MPPSC-2021-057: no usable printed answer; the question stays without a key
- MPPSC-2021-075: no usable printed answer; the question stays without a key
- MPPSC-2022-046: no usable printed answer; the question stays without a key
- MPPSC-2022-059: no usable printed answer; the question stays without a key
- MPPSC-2023-026: no usable printed answer; the question stays without a key
- MPPSC-2024-021: no usable printed answer; the question stays without a key
- MPPSC-2024-028: no usable printed answer; the question stays without a key
- MPPSC-2024-079: no usable printed answer; the question stays without a key

## Preservation statement

No source record was deleted, rewritten or merged to produce this bank. Question text, options, printed answers, explanations, years, papers and source references are carried over verbatim; classification fields and review metadata are the only additions. Where two records look alike both are kept and flagged here instead of being merged.

Review flags attached to records: **500**.

