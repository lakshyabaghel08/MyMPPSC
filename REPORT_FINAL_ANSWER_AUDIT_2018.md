# MyMPPSC — Final Answer Accuracy Audit, 2018

**Scope:** every question of the 2018 Preliminary Paper‑I (`MPPSC-2018-P1`) in the bundled bank (`data/pyq/mymppsc-pyq-bank.json`).
**Question asked of every item:** would a learner be taught something false if they trusted this answer?
**Standing rule:** the printed key is evidence, not authority. An answer was kept because it survives independent subject reasoning, not because it appears in a key sheet — and it was not changed merely because a website disagreed with it.
**Machine‑readable record:** `data/pyq/quality-audit/final-answer-audit-2018.json` (one row per question, with its status and the basis for it).
**Not in scope:** 2019 (`REPORT_FINAL_ANSWER_AUDIT_2019.md`), 2020 (`REPORT_FINAL_ANSWER_AUDIT_2020.md`) and 2021–2024 (`REPORT_FINAL_ANSWER_AUDIT_2021_2024.md`). None of them was touched: the rebuild that produced this bank changed 100 records, all of them 2018.

---

## 1. Headline counts (computed from the bank, not copied from earlier reports)

| Year | Reviewed | Confirmed (A) | Corrected (B) | Ambiguous / unresolved (C) |
|---|---|---|---|---|
| 2018 | 100 | 96 | 0 | 4 |
| **Total** | **100** | **96** | **0** | **4** |

96 + 0 + 4 = 100. The counts in `reviewed-corrections.json → final_audit_2018` and in the audit record are derived from the same rows, and `tests/answer-accuracy-2018.test.js` recomputes them and fails if they ever drift.

**Why zero corrections.** Every one of the 100 printed keys was compared with the independently derived answer, and in this paper none of them is contradicted by an option that is demonstrably right. The pre‑audit baseline showed that the key captured in the extraction equals the stored answer for all 100 questions, so there was no transcription drift to repair either. Where the evidence does not support the key (015, 019, 055, 078) the item is recorded as ambiguous rather than "corrected" to a letter the evidence does not support — a green tick on a wrong key would be worse than an honest flag.

Printed keys were available for all 100 questions; the paper contains no app‑authored model question, so `printed_keys_compared = 100`, not 95 as in 2019.

---

## 2. Corrected answers (0)

None. No printed key in this paper is contradicted by the evidence in a way that points to a different printed option — see §3 for the four items that come closest, and why they are flagged rather than re‑keyed.

---

## 3. Ambiguous / unresolved answers (4) — preserved as uncertain, not forced

| Question | Stored answer | Why it cannot be settled |
|---|---|---|
| **MPPSC-2018-015** — *How many women were elected in Madhya Pradesh Assembly Election, 2013?* | `D` — 28 | Published counts give **29** (assembly‑wise tallies reproduced in exam compilations) or **30** (press and PRS‑style analyses). No source supports 28, and no printed option is higher than 28, so **no option states the verifiable figure**. The key is kept only because a learner is examined against it, and the item is flagged as defective. |
| **MPPSC-2018-019** — *With which religion is Kalika Purana associated?* | `D` — Jainism | The Kalika Purana is a **Shakta Upapurana** centred on Kali and Kamakhya, and no Jain recension or authorship is recorded. The **official MPPSC 2018 key says Jainism**, and secondary keys reproduce that key; the option set also makes Jainism the examined answer. On content the defensible answer is `B`, Shaktism — so the item is recorded as disputed, with the scholarly position stated in the explanation instead of being hidden behind the key. |
| **MPPSC-2018-055** — *Dhoopgarh, the highest peak of Madhya Pradesh, is located at* | `A` — Satpura Range | Dhoopgarh (about 1,350 m) stands at Pachmarhi in the **Mahadeo Hills**, and the Mahadeo Hills are a part of the **Satpura range**. Both `A` (the umbrella) and `B` (the precise block) are geographically defensible; the paper keys the umbrella term. Kept at `A` with the overlap spelled out. |
| **MPPSC-2018-078** — *Which of the following are the two essential features of cyber crime?* | `B` — Offender computer skills and victim ignorance of computer technology | Two rival textbook formulations circulate: *computer technology as modus operandi* with *intangibility of the environment* (`A`), and offender skill with victim ignorance (`B`). `A` is the more common textbook phrasing, `B` is what the paper keys and what other key sheets reproduce. Recorded as ambiguous rather than declared wrong. |

Each of the four carries an `unresolved` dispute block in `data/pyq/reviewed-disputes.json` and in the bank, and the explanation for each states the conflict in the option‑level reasoning, so a learner sees the uncertainty rather than a bare tick.

---

## 4. Items flagged in the source review and closed by this pass

The 2018 intake carried 71 review flags, **59 generic placeholder explanations** ("Factual Question", "As per the provisions…"), and **3 questions with no explanation at all** (021, 046, 053). All 100 explanations were rebuilt (§6), which closes every one of those flags.

Three pre‑existing explanations belonged to a *different* question (023, 026, 043 — a Sur‑dynasty text under the Shunga question, a planning text under the FRBM question, and a Rajya Sabha note under the Lok Sabha seats question). They were not reused; each was replaced with prose written for its own question.

---

## 5. Items investigated specifically and left alone (no change justified)

Checked against a fetched source during this pass:

- **012** — the 27th consecutive exchange of nuclear‑installation lists was announced on **1 January 2018**, with the 1988 agreement in force from 27 January 1991 and the first exchange on 1 January 1992 (press reports of the day). `C` confirmed.
- **021** — Shunga origins are placed at **Ujjain**; Pataliputra is the capital, not the homeland. `C` confirmed.
- **024** — "The British empire is rotten to the core…" appears in **Sister Nivedita's letters** (press feature quoting them); the Annie Besant attribution found on quiz sites is an error. `A` confirmed.
- **038** — the acting Governors of MP include **P. V. Dixit, G. P. Singh and N. D. Ojha**; **G. D. Dixit** does not appear, so `C` is right.
- **040** — MP's constant‑price GSDP growth from 2011‑12 to 2015‑16 is about **7.5 %** (PRS budget analysis for 2017‑18); the 11/15/16 % options are nominal or single‑year figures. `D` confirmed.
- **041** — the office of Parliamentary Secretary was created in **1951**, with Satish Chandra and S. N. Misra appointed on 11 June 1951 (Ministry of Parliamentary Affairs study report). `A` confirmed.
- **044** — Andhra Pradesh has held **11** Rajya Sabha seats since the 2014 bifurcation; 18 was the undivided state's figure, so `A` is the incorrect match. Confirmed.
- **045 / 049** — LNIPE Gwalior was founded in **August 1957**; the first Dronacharya awards of **1985** went jointly to **Bhagwat, Bhardwaj and Nambiar**, so "All of them" is correct.
- **057 / 060 / 064** — Jhabua is the only district touching both **Rajasthan and Gujarat** (Alirajpur touches Gujarat and Maharashtra); **Alirajpur** records the highest Scheduled Tribe share (above 84 % in 2011); **Dindori** is the district whose sex ratio exceeds 1,000 (about 1,002). All three confirmed.
- **065** — **P. K. Noronha** is absent from the list of MP Chief Secretaries, while R. P. Naik (1969–72), B. K. Dubey (1980) and R. S. Khanna (1989–90) all held the post. `D` confirmed.
- **066** — MP Zila Yojana Samiti Adhiniyam is **Act 19 of 1995**, assent 19 May 1995 (PRS act text). `B` confirmed.
- **068 / 069 / 070** — Mukhya Mantri Gram Sadak Yojana from **2010‑11**; the Incubation and Start‑up Policy from **2016**; the Friends of MP Conclave held in **Indore on 3–4 January 2018** (contemporaneous reports). `C`, `D`, `C` confirmed.
- **071** — the Atal Jyoti Abhiyan guarantees **ten hours** of agricultural supply through farm feeders; one secondary summary's "12 hours" describes the non‑farm target, so `A` is kept and the conflict is noted in the explanation.
- **081–099** — the Polity block was verified against the statutory texts in this pass: PoA Act s.2(bc) (economic boycott), s.18 (bar on s.438 CrPC), Rule 18 of the 1995 Rules (annual report), s.3(2)(zb) punishment band, 23 sections; PCR Act s.10A, s.14, s.14A, s.1(2) "whole of India" (India Code text); PHRA s.1(3) deemed commencement 28 September 1993, s.3(3) deemed members, s.8 five years/70, s.13(4) civil court, s.19 armed forces, s.22 proviso, s.25 acting chairperson, s.39 public servant, s.28 annual report, s.2(a) armed forces of the Union only. Every stored key in this block holds.
- **100** — the **Godavari** basin (about 3.1 lakh sq km) is India's second largest after the Ganga. `C` confirmed.
- **014** — the IMF had **189** members when the paper was set (191 today). `B` confirmed *for the question's date*, and the explanation says so rather than silently teaching a stale figure.

Left alone deliberately: the taxonomy tags. Several 2018 items sit under loose topic paths (for example 085–099 under a broad "Citizenship and civil rights" node). Reclassifying them would move the reviewed‑label manifest, which is a separate audited artefact; the defect is recorded here instead of being fixed inside an answer audit.

---

## 6. Explanations rebuilt (100 of 100)

Nothing was polished: 59 explanations were placeholders and three were missing, so all 100 were written afresh to the four‑part standard — (1) concept and justification, (2) option‑specific reasoning tied to that option's own text, (3) revision facts, (4) a takeaway only where one genuinely helps. Depth varies with the item: a one‑fact item such as the state bird gets three sentences; a statutory‑section question or a matched‑pair question gets a fuller treatment.

Specific defects the rewrite removes:

- **Explanations attached to the wrong question** (023, 026, 043) — replaced, not patched.
- **Placeholders masquerading as explanations** — 59 items whose "explanation" was "Factual Question" or a single clause of the Act.
- **Nuance that a bare key hides** — 004 (CO₂ is a greenhouse gas, not a criteria pollutant), 008 (the option's wording is loose even though the Indus plain is the only arid region offered), 022/033/034 (successor, flagship species and industry labels), 062 (the question only works under the pre‑2010 NH‑3 numbering), 078 (two textbook formulations), 081 ("Section 2(b c)" is the scan's spacing of s.2(bc)).
- **No fabricated sources, no URLs, no scan debris** in the prose: `tests/answer-accuracy-2018.test.js` fails on a URL, a bracketed citation marker, filler phrasing, or a paragraph shared with another question.

---

## 7. Option‑text repairs (3)

| Question | Option | Printed (extraction) | Restored | Evidence |
|---|---|---|---|---|
| **MPPSC-2018-010** | `D` | `Island of Lost - Kunal Basu Girls` | `Island of Lost Girls - Kunal Basu` | The title and the author were transposed by the scan; the book is *The Island of Lost Girls* by Manjula Padmanabhan, and the option is the mismatched pair either way, so no answer changed. |
| **MPPSC-2018-078** | `A` | `Computer technology as, modus operandi and intangibility of the environment` | `Computer technology as modus operandi and intangibility of the environment` | Stray comma left by the extraction inside a clause; punctuation only. |
| **MPPSC-2018-096** | `C` | `The Chairperson of- the National Human Rights Commission` | `The Chairperson of the National Human Rights Commission` | Stray hyphen from the scanned line break; punctuation only. |

Each repair quotes the printed text it replaces, is declared in `reviewed-corrections.json → option_corrections`, and fails the build if the printed string no longer matches. No option was invented and no option's substance was altered.

**Not repaired, on purpose:** `MPPSC-2018-081` prints its four options as `Section 2(b)`, `Section 2(b c)`, `Section 2(b f)`, `Section 2(b g)`. The spacing is uniform across all four, so it is a property of the printed page rather than one damaged string; changing only the keyed option would have made the option set internally inconsistent. The text is left as printed and the explanation states that `2(b c)` denotes **Section 2(bc)**.

---

## 8. Dispute‑flag bookkeeping

| Status | Questions |
|---|---|
| `unresolved` | 015, 019, 055, 078 — the four ambiguous items above |
| `resolved` | none in this paper |

A question marked ambiguous in the audit record must carry an unresolved dispute block in the bank, and an unresolved dispute in the bank may not be labelled confirmed. `tests/answer-accuracy-2018.test.js` enforces both directions, and `tests/rebuild-corrections.test.js` proves the four blocks survive a clean rebuild.

---

## 9. Remaining answer/explanation contradictions

None known. Three invariants are checked mechanically: every stored answer equals its own set of `is_correct` flags (all 100 questions); no explanation contains a "Hence option X" pointing outside the stored answer; and no explanation still ticks a letter the answer does not contain. For the four ambiguous items the runner‑up option is marked incorrect but its reason says plainly that it is defensible and why the paper's key prefers the other — the conflict is documented, not disguised.

---

## 10. Validation

| Check | Result |
|---|---|
| `npm test` | **366 tests, 366 pass, 0 fail** (was 357 before this pass) |
| `npm run check` | **1075 checks passed** |
| Clean rebuild with the documented command | 1,200 questions, 12 papers, validator `fatal 0, errors 0, rejected 0, warnings 45` |
| Corrections applied during that rebuild | **27 keys, 26 option texts, 671 explanations, 26 dispute blocks** — 0 rejected, `reconciled: true`; 5 model‑question dispute blocks deferred and confirmed by the model pass |
| Rebuild vs committed bank | identical except `generated_at` and `app_compatibility` (`tests/rebuild-corrections.test.js` compares every record) |
| 2018 completeness | 100 questions, question numbers 1–100 with no gaps, four options each, no blank or duplicated option text |
| 2018 answer coverage | 100 answers, 100 explanations, 4 option reasons in each |
| Counts | 96 confirmed + 0 corrected + 4 ambiguous = 100 |
| 2018 present exactly once | 100 questions, one paper `MPPSC-2018-P1`, `question_order` lists all 100 |
| Unrelated years | untouched: the bank diff contains 100 changed 2018 records and nothing from 2013–2017 or 2019–2024; the `papers` array is byte‑identical |
| UI, routing, storage, scoring, progress, bookmarks, mistakes, revision, imports/exports, offline PWA | untouched — no application file was edited in this pass |

---

## 11. Files changed

| File | Change |
|---|---|
| `data/pyq/mymppsc-pyq-bank.json` | regenerated by the pipeline: 100 rebuilt 2018 explanations, three repaired option texts, four dispute blocks |
| `data/pyq/reviewed-corrections.json` | 100 ids added to `narrative_rewritten` and `option_reasoning_complete` (571 → 671 and 317 → 417), three 2018 `option_corrections`, new `final_audit_2018` summary; no 2018 `answer_corrections` |
| `data/pyq/reviewed-explanations.json` | 100 new reviewed 2018 explanations (571 → 671) and the new audit record added to `source_audits` |
| `data/pyq/reviewed-disputes.json` | four 2018 dispute blocks (26 → 31 declared) |
| `data/pyq/quality-audit/final-answer-audit-2018.json` | **new** — 100 rows with printed key, answer, status, note, plus the three option repairs |
| `tests/answer-accuracy-2018.test.js` | **new** — 9 tests pinning the decisions above |
| `tests/explanation-quality.test.js` | 2018 added to the audited years, with a coverage assertion for all 100 |
| `tests/rebuild-corrections.test.js` | explanation count 571 → 671, plus 2018 spot checks proving the option repairs and the dispute flag survive a clean rebuild |
| `tests/pyq-bank.test.js` | the option‑repair provenance check now reads the 2013–2018 historical source files, so a repair in a historical year can be verified against its printed text instead of being skipped |
| `docs/PYQ_AUDIT.md` | 2018 bullet |

No application or UI file was touched.

---

## 12. Known limitations (stated, not hidden)

1. **Verification depth is uneven, by necessity.** Roughly a third of the paper was settled against a source fetched during this pass or a statutory text quoted above (nuclear‑list exchange, Shunga origins, Nivedita quotation, acting Governors, GSDP growth, Parliamentary Secretary, Rajya Sabha quotas, MP Chief Secretaries, Zila Yojana Samiti, MMGSY, start‑up policy, Friends of MP, Atal Jyoti, the PoA/PCR/PHRA sections, Dronacharya 1985, LNIPE, district tribal and sex ratios, Godavari basin). The remainder were verified by re‑deriving the answer from standard reference knowledge and by checking the item's internal consistency — option texts, dates, matched pairs — not by fetching a citation for every fact. Where a figure is date‑sensitive (014 IMF membership) the explanation states both the 2018 figure and the current one.
2. **No MPPSC‑published 2018 key sheet is in the repository.** The "printed key" compared against here is the key captured in the source extraction and frozen in `question-audit-baseline.jsonl`. A discrepancy between that capture and the Commission's own booklet would not be visible from inside this repository — though the stored answers matched the captured keys for all 100 questions, so no transcription drift was found.
3. **Two items rest on secondary sources that disagree with each other.** 015 (28 versus 29 or 30) and 071 (10 versus 12 hours) are cases where the paper's figure has at least one competing published figure. Both are explained rather than hidden; 071's key is supported by MP's own feeder practice, 015's is not supported by anything found.
4. **Taxonomy tags were not re‑audited** (§5), and **2022–2024 still owe per‑option reasoning**, as their own report records. Neither is changed by this pass.
5. **The four ambiguous items remain ambiguous.** No attempt was made to make the bank look tidier by picking a letter; that would have been the one failure mode this audit exists to prevent.

---

## 13. Stop point

2018 is complete: 100 questions audited, no key changed, four recorded as ambiguous or defective, three scan‑damaged option texts repaired, all 100 explanations rebuilt from scratch, and the whole thing reproducible from the source intake by the documented rebuild command. No other year was modified. Nothing was merged.
