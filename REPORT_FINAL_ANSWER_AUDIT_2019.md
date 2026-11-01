# MyMPPSC — Final Answer Accuracy Audit, 2019

**Scope:** every question of the 2019 Preliminary Paper‑I (`MPPSC-2019-P1`) in the bundled bank (`data/pyq/mymppsc-pyq-bank.json`).
**Question asked of every item:** would a learner be taught something false if they trusted this answer?
**Standing rule:** the printed key is evidence, not authority. An answer was kept because it survives independent subject reasoning, not because it appears in a key sheet.
**Machine‑readable record:** `data/pyq/quality-audit/final-answer-audit-2019.json` (one row per question, with its status and the basis for it).
**Not in scope:** 2020 (`REPORT_FINAL_ANSWER_AUDIT_2020.md`) and 2021–2024 (`REPORT_FINAL_ANSWER_AUDIT_2021_2024.md`). Neither was touched: the rebuild that produced this bank changed 109 records, all of them 2019.

---

## 1. Headline counts (computed from the bank, not copied from earlier reports)

| Year | Reviewed | Confirmed (A) | Corrected (B) | Ambiguous / unresolved (C) |
|---|---|---|---|---|
| 2019 | 100 | 93 | 5 | 2 |
| **Total** | **100** | **93** | **5** | **2** |

93 + 5 + 2 = 100. The counts in `reviewed-corrections.json → final_audit_2019` and in the audit record are derived from the same rows, and `tests/answer-accuracy-2019.test.js` recomputes them and fails if they ever drift.

Printed keys were available for 95 of the 100 questions. The other five (044, 047, 061, 075, 098) are the app‑authored model questions that fill gaps in the extraction; their audit rows state plainly that no printed key exists and that the answer was verified from first principles, rather than inventing a key to compare against.

---

## 2. Corrected answers (5)

| Question | Printed key | Stored answer now | Why the printed key is wrong |
|---|---|---|---|
| **MPPSC-2019-027** — *Which statement is not correct in relation to the Protection of Human Rights Act?* | `A, B, C` | `C` | Section 6(2) gives the Chairperson **and** a Member a five‑year term and expressly makes a Member *eligible for re‑appointment for another term of five years*. Statements A (five‑year term), B (five‑year term for a Member) and D (ineligibility for further government employment after ceasing to hold office) each reproduce the Act, so only C — "Member is not eligible for re‑appointment" — is false. The key marked two true statements as incorrect. |
| **MPPSC-2019-046** — *In which part of the Himalayas is the 'Karewa' landform found?* | `C` — Himachal‑Uttarakhand Himalaya | `D` — Kashmir Himalaya | Karewas are the lacustrine and glacial‑clay terraces of the Kashmir valley floor, on which saffron, almonds and apples are grown. The paper's own explanation names the Kashmir Himalaya while the key named the Himachal‑Uttarakhand Himalaya — the key contradicted its own explanation. |
| **MPPSC-2019-060** — *Kaathi is a* | `C` — Wooden Art | `D` — Folk Dance | Kathi is a documented folk dance of the Nimar region (Khargone, Khandwa), performed by the Balai community in worship of Parvati from Dev Prabodhini Ekadashi to Mahashivratri. The decorated bamboo *kathi* is the prop the dancers carry, which is presumably how "wooden art" got into the slot; the dance, not the prop, is what the word names. |
| **MPPSC-2019-074** — *Which group consists of only output devices?* | `B` — Keyboard, Printer, Monitor | `D` — Plotter, Printer, Monitor | A keyboard is an input device, so B cannot be a group of *only* outputs. Plotter, printer and monitor all produce output. The stored explanation already listed a keyboard among input devices while the key chose it. |
| **MPPSC-2019-097** — *Which National Highway does not pass through Madhya Pradesh?* | `A` — NH‑3 | `D` — NH‑8 | Under the old numbering, NH‑3 was the Agra–Gwalior–Shivpuri–Guna–Dewas–Indore–Mumbai road and carried about 712 km inside Madhya Pradesh; old NH‑12 and old NH‑7 also entered the state. NH‑8 ran Delhi–Jaipur–Udaipur–Ahmedabad–Vadodara–Mumbai without entering Madhya Pradesh at all. |

Each correction is declared in `data/pyq/reviewed-corrections.json → answer_corrections` with `from` (the printed key), `to`, and a stated basis. The explanation, its four option‑level reasons and its key concepts were synchronised to the corrected letter — the bank contains no explanation that still ticks the printed answer for these five.

---

## 3. Ambiguous / unresolved answers (2) — preserved as uncertain, not forced

| Question | Stored answer | Why it cannot be settled |
|---|---|---|
| **MPPSC-2019-002** — *Who had proposed "PartyLess Democracy" in India?* | `C, D` | Standard references credit **Jayaprakash Narayan** with the phrase; **Mahatma Gandhi** asked the Congress to become a non‑partisan Lok Sevak Sangh after independence, which is the same idea in different words. The paper keyed both, and both are defensible, so the double key is kept rather than reduced to one name. |
| **MPPSC-2019-067** — *Under which Article does the State Election Commission operate the election of urban bodies?* | `A` — 243 K | The article that actually governs municipal elections is **243ZA**, which applies Part IXA's election provisions and refers back to the Commission constituted by 243K. 243ZA is not among the four options, so 243K — the article that creates the Commission — is the only defensible choice offered. The item is defective in its options, not wrongly answered, and the dispute block says so. |

---

## 4. Two further items flagged but **resolved** (reading recorded, answer kept)

| Question | Stored answer | What was flagged, and why the answer stands |
|---|---|---|
| **MPPSC-2019-066** — *How many Panchayat General Elections after the formation of the MP State Election Commission?* | `C` — Five | The count depends on the date. Elections were held in 1994, 1999, 2004, 2009 and 2014 — five when the paper was set — and the sixth came only in 2022. Five is correct for this paper; the dispute block (status `resolved`) records the date dependency so a future reader does not "fix" it to six. |
| **MPPSC-2019-100** — *Extension of India's international boundaries in ascending order* | `B` — Nepal, Pakistan, China, Bangladesh | Among the four countries listed the order is right (≈1,751 < 3,323 < 3,488 < 4,096 km). The wording is incomplete, because Bhutan (699 km) and Myanmar (1,643 km) are shorter than Nepal and would lead a complete list; the options restrict the field to four, so B stands. Flagged `resolved`, not corrected. |

---

## 5. Items investigated specifically and left alone (no change justified)

- **MPPSC-2019-018** — "who has *not* been Governor of MP": **Bhai Mahaveer (1998–2003)**, **Balram Jakhar (2004–2009)** and **Rameshwar Thakur (2009–2011)** all held the office; **Justice Anshuman Singh** governed Rajasthan and Gujarat. Answer `D` confirmed against published Governor lists.
- **MPPSC-2019-057** — "which tribe–sub‑caste pair is not matched": the MP Scheduled Tribes list contains *Bharia, Bhumiya, Bhuihar, Paliha, Pando* in one entry and *Bhil, Bhilala, Barela, Patelia* in another, so **Patelia sits with the Bhil, not the Bharia**; and **Mahar is a Scheduled Caste, not a Korku sub‑group**. Both C and D are genuinely mismatched — the double key is right.
- **MPPSC-2019-079** — "which statement is incorrect" on the Atrocities Act: section 2(**)bd**) defines "Exclusive Special Court", while 2(d) defines the "Special Court"; 2(bb) is "dependent" and 2(ec) "victim". Answer `B` confirmed against the statutory definitions.
- **MPPSC-2019-043** — both **Barani** and **Shams‑i‑Siraj Afif** wrote a *Tarikh‑i‑Firozshahi*; the double key `A, B` is right.
- **MPPSC-2019-030** — PCR Act offences are cognizable, summarily triable and non‑compoundable, so `A, B` is right.
- **MPPSC-2019-049, 050, 063, 064, 065, 086, 090** — the date‑sensitive current‑affairs items were checked against the year the paper belongs to (2019), not against today's holders: five panchayat elections, Ramaphosa as chief guest, *Period. End of Sentence* as the Oscar short, India third at Gold Coast 2018.

---

## 6. Explanations rebuilt (100 of 100)

Every explanation was rewritten to the four‑part standard — (1) concept and justification, (2) option‑specific reasoning tied to the option's own text, (3) revision facts, (4) a takeaway where one is genuinely useful — and every one now carries four option rows whose `text` matches the option verbatim.

The rebuild removed defects that the scraped prose carried:

- **Factual errors in the old text**: Avanti described as a *republic* (it was a monarchy under the Pradyota line, with Vajji as the republic among the Mahajanapadas); Mandu placed "on the banks of the Narmada" (it is in Dhar district on the Malwa plateau); *Satyarth Prakash* credited to Swami Shraddhanand (the author is Dayanand Saraswati; Shraddhanand wrote a biography of him); a "Rajpal BD Sharma" confused with Haryana's first Chief Minister.
- **Answer↔explanation contradictions**: an explanation that argued for the folk dance while the key said "wooden art" (060), one that listed a keyboard among input devices while the key chose it as an output (074), one that said NH‑8 avoids Madhya Pradesh while the key said NH‑3 (097), one that said karewas are Kashmiri while the key said Himachal‑Uttarakhand (046).
- **Scan debris**: stray trailing digits, half‑sentences and abrupt truncations from the extraction were replaced with complete prose. No question wording and no option text was altered (there were no option repairs to make in this paper).
- **Vivekananda-style padding**: none added. Depth varies with the question — a one‑fact item such as JSP gets three short paragraphs of reasoning, a multi‑statement polity item gets a fuller treatment.

---

## 7. Option‑text repairs

**None.** Every 2019 option is a clean string; there is no equivalent of the 2020 "Lucknow 1" or the "🔾🔾" debris, so `option_corrections` contains no 2019 entry.

---

## 8. Dispute‑flag bookkeeping

| Status | Questions |
|---|---|
| `unresolved` | 002, 067 — the two ambiguous items above |
| `resolved` | 066, 100 — flagged, explained and left with the printed key |

A question marked ambiguous in the audit record must carry an unresolved dispute block in the bank, and an unresolved dispute in the bank may not be labelled confirmed. `tests/answer-accuracy-2019.test.js` enforces both directions.

---

## 9. Remaining answer/explanation contradictions

None known. The suite checks three separate invariants: every stored answer equals its own set of `is_correct` flags; no explanation contains a "Hence option X" pointing outside the stored answer; and no corrected key still has its old letter ticked in prose.

---

## 10. Validation

| Check | Result |
|---|---|
| `npm test` | **357 tests, 357 pass, 0 fail** (was 348 before this pass) |
| `npm run check` | **1075 checks passed** |
| Clean rebuild with the documented command | 1,200 questions, validator `fatal 0, errors 0, rejected 0, warnings 41` |
| Corrections applied during that rebuild | **27 keys, 23 option texts, 571 explanations, 22 dispute blocks** — 0 rejected, `reconciled: true`; 5 model‑question dispute blocks deferred and confirmed by the model pass |
| Rebuild vs committed bank | identical except `generated_at` and `app_compatibility` |
| 2019 completeness | 100 questions, question numbers 1–100 with no gaps, four options each, no blank or duplicated option text |
| 2019 answer coverage | 100 answers, 100 explanations, 4 option reasons in each |
| Counts | 93 confirmed + 5 corrected + 2 ambiguous = 100 |
| Corrections consistent across bank / manifest / audit record | yes — the same five ids appear in all three, with matching `from`/`to` |
| Unrelated years | untouched: the rebuild diff contains 109 changed 2019 records and nothing from 2013–2018 or 2020–2024 |
| UI, routing, storage, scoring, progress | untouched |

---

## 11. Files changed

| File | Change |
|---|---|
| `data/pyq/mymppsc-pyq-bank.json` | regenerated by the pipeline: 100 rebuilt 2019 explanations, five corrected keys, four dispute blocks |
| `data/pyq/reviewed-corrections.json` | version 5 — five 2019 `answer_corrections`, 100 ids added to `narrative_rewritten` and `option_reasoning_complete`, new `final_audit_2019` summary |
| `data/pyq/reviewed-explanations.json` | 95 new reviewed 2019 explanations (the five model questions keep their prose in `model-questions.json`, which is where a rebuild reads them from) |
| `data/pyq/reviewed-disputes.json` | four 2019 dispute blocks |
| `data/pyq/model-questions.json` | the five 2019 model questions now carry the rebuilt explanation |
| `data/pyq/quality-audit/final-answer-audit-2019.json` | **new** — 100 rows with printed key, answer, status, note |
| `tests/answer-accuracy-2019.test.js` | **new** — 9 tests pinning the decisions above |
| `tests/explanation-quality.test.js` | 2019 added to the audited years, with a coverage assertion for all 100 |
| `tests/rebuild-corrections.test.js` | counts updated for the enlarged manifest, plus 2019 spot checks proving the corrections survive a clean rebuild |

No other file was touched.

---

## 12. Known limitations (stated, not hidden)

1. **Verification depth is uneven, by necessity.** Sixteen items were settled against a source fetched during this pass or a statutory text quoted in the evidence list (Governor tenures, the Panchayat election cycle, section 6 and section 2 of the two rights statutes, old NH‑3's route, the Kathi dance, the Bharia/Bhil tribe list, NH‑8). The remainder were verified by re-deriving the answer from standard reference knowledge and by checking the item's internal consistency — option texts, statements, dates and the paper's own explanation — not by fetching a citation for every fact. The audit rows say which is which.
2. **No MPPSC‑published 2019 key sheet is in the repository.** The "printed key" compared against here is the key captured in the source extraction (`question-audit-baseline.jsonl`), for 95 questions. A discrepancy between that capture and the Commission's own booklet would not be visible from inside this repository.
3. **Subject/topic mis-tags were left alone.** Several 2019 questions carry a wrong taxonomy path — the Ekalavya Award question (008) sits under "Maratha rule in Madhya Pradesh", the UN Secretary‑General question (036) under "Union Executive", the oxygen‑in‑the‑body question (084) under "Quantitative aptitude", the 243T question (080) under the same, and the Manav Sangrahalaya question (038) under "Gandhian movements". Reclassifying them would move the reviewed‑label manifest, which is a separate, audited artefact; this pass did not touch it. They are listed here so the defect is visible rather than silently inherited.
4. **2022–2024 still owe per‑option reasoning**, as their own report records; that is unchanged by this pass.

---

## 13. Stop point

2019 is complete: 100 questions audited, five answers corrected, two recorded as ambiguous, two flagged but resolved, all 100 explanations rebuilt, and the whole thing reproducible from the source intake by the documented rebuild command. No further year was started. Nothing was merged.
