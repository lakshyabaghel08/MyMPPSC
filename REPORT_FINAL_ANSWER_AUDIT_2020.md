# MyMPPSC — Final Answer Accuracy Audit, 2020

**Scope:** all 100 questions of the 2020 Preliminary Paper‑I (`MPPSC-2020-P1`) in the bundled bank, `data/pyq/mymppsc-pyq-bank.json`.
**Question asked of every item:** would a learner be taught something false if they trusted this answer?
**Standing rule:** the printed key is evidence, not authority. An answer was kept because it survives independent subject reasoning, not because it appears in a key sheet.
**Machine‑readable record:** `data/pyq/quality-audit/final-answer-audit-2020.json` (one row per question, with its status and note).
**Not in scope:** every other year. 2021–2024 were settled separately (`REPORT_FINAL_ANSWER_AUDIT_2021_2024.md`, PR #27) and were not reopened.

---

## 1. Headline counts (computed from the bank, not copied from earlier reports)

| Year | Reviewed | Confirmed (A) | Corrected (B) | Ambiguous / unresolved (C) |
|---|---|---|---|---|
| 2020 | 100 | 91 | 5 | 4 |
| **Total** | **100** | **91** | **5** | **4** |

91 + 5 + 4 = 100. The counts in `reviewed-corrections.json → final_audit_2020` and in the audit record are derived from the same rows, and `tests/answer-accuracy-2020.test.js` recomputes them and fails if they drift.

Five of the 100 rows are app‑written model questions with no printed source key (2020‑009, 033, 077, 078, 096). Each was answered on its merits and confirmed; none carries a printed‑key comparison.

---

## 2. Corrected answers (5)

| Question | Printed key | Bank answer | Reason |
|---|---|---|---|
| **MPPSC-2020-008** — *Which CPSE does **not** fall under the Maharatna category listed in January 2020?* | `B` — Coal India Limited | `D` — Oil India Limited | Coal India has been a Maharatna since **11 April 2011**, so it cannot be the exception. Oil India was a **Navratna** (2010) throughout 2020 and was elevated to Maharatna only on **4 August 2023** — after the list the question cites. The printed key contradicts the question's own premise. |
| **MPPSC-2020-032** — *Kailash Satyarthi was born in which district of MP?* | `B` — Sehore | `D` — Vidisha | Satyarthi was born on **11 January 1954 at Vidisha**, where he studied at the Samrat Ashok Technological Institute. The bank's own scraped explanation already said "Vidisha city of Madhya Pradesh" while the key said Sehore — an answer/explanation contradiction, not a matter of taste. |
| **MPPSC-2020-054** — *How many States and UTs were established by the 1956 State Reorganisation Act?* | `A` — 18 States, 9 UTs | `B` — 14 States, 6 UTs | The Act, with the Seventh Amendment, abolished the Part A/B/C categories and created **14 states and 6 union territories** on 1 November 1956 (Delhi, Himachal Pradesh, Manipur, Tripura, A&N Islands, Laccadive‑Minicoy‑Amindivi). Eighteen states and nine UTs belong to a later political map. The stored explanation already stated 14 and 6. |
| **MPPSC-2020-076** — *Which Governor of MP had been Chief Minister of Haryana?* | `B` — Ram Naresh Yadav | `D` — Dr. Bhagwat Dayal Sharma | Ram Naresh Yadav was Chief Minister of **Uttar Pradesh**. Bhagwat Dayal Sharma was the **first Chief Minister of Haryana** (Nov 1966 – Mar 1967) and Governor of Odisha (1977–80) before serving as **Governor of MP, 30 April 1980 – 14 May 1984**. The scraped explanation was garbled beyond use ("Rajpal BD Sharma… Governor of Orissa"). |
| **MPPSC-2020-095** — *"PUMA" in robotics stands for* | `B` — Programmed Utility Machine for Assembly | `C` — Programmable Universal Machine for Assembly | PUMA is the Unimation/Scheinman **Programmable Universal Machine for Assembly**, the assembly robot of the late 1970s. Option B is a reordered decoy; the bank's own explanation gave the correct expansion while the key marked the decoy. |

Each correction is declared in `data/pyq/reviewed-corrections.json → answer_corrections` with `from`, `to` and a `basis`, and the explanation, its four option rows, key concepts and takeaway were synchronised to the corrected key. The printed key remains visible in the audit record (`printed_key`), so the disagreement is documented rather than erased.

---

## 3. Ambiguous / unresolved answers (4) — preserved as uncertain, not forced

| Question | Stored answer | Why it cannot be settled |
|---|---|---|
| **MPPSC-2020-037** — *Which List and Entry relates to election of the State legislature?* | `A, C` | Elections to a State legislature appear in **Union List entry 72** ("elections to Parliament, to the Legislatures of States…; the Election Commission") **and State List entry 37** ("elections to the Legislature of the State subject to the provisions of any law made by Parliament"). The stem asks for one entry; both are correct. The printed double key is kept rather than forcing a single letter. |
| **MPPSC-2020-045** — *What was the actual name of Tantya Bhil?* | `A` — Tantia | The key treats Tantia as his personal name with *Tantya Mama* the popular form. Multiple popular Hindi accounts and Hindi Wikipedia record his birth name as **Tandra** — which is option D in the same paper. Two options are defensible from published sources, so the key is retained and the conflict is flagged. |
| **MPPSC-2020-093** — *Microwaves are electromagnetic waves in the range…* | `C` — 1 GHz–300 GHz | The conventional band is **300 MHz – 300 GHz**. Option C is the only defensible range in the set and is kept, but its lower bound is a textbook simplification: the paper offers no option that states the full band. |
| **MPPSC-2020-098** — *Which mineral is **only** found in Madhya Pradesh?* | `C` — Diamond | India's working diamond mines are indeed confined to the Panna belt, which makes C the only workable option against iron, mica and copper. The wording nevertheless overstates the geology: kimberlite occurrences are known in Andhra Pradesh and Chhattisgarh without producing mines. The answer stands; the question's phrasing does not. |

---

## 4. Candidate corrections that were investigated and **rejected** — the printed key was right

These are recorded because "the key looks wrong" is not the same as "the key is wrong".

| Question | Suspicion | Outcome |
|---|---|---|
| **MPPSC-2020-075** — Article 368 amended by (i) the 24th Amendment, (ii) the 101st Amendment? | Looked like a correction to A, on the reasoning that the 101st (GST) amendment "only changed tax articles". | **Confirmed C.** Section 15 of the 101st Amendment Act, 2016 substituted in the **proviso to Article 368(2)(a)** the words "article 162, article 241 or **article 279A**", so any change touching the GST Council needs ratification by half the states. Article 368 was amended twice; both statements are true. |
| **MPPSC-2020-046** — features of the genetic code, statement (i) "it is always universal" | Every option includes (i), so a purist reading ("nearly universal", mitochondrial exceptions) would make the item unanswerable. | **Confirmed D.** All four statements are the standard textbook description, and D is the only option containing (ii), (iii) and (iv). The "universal, with rare mitochondrial exceptions" nuance is stated in the explanation instead of breaking the key. |
| **MPPSC-2020-067** — capital of the Indus country in the 6th–7th century per the Chachnama | The scraped explanation said **Brahmanabad**, and Debal (option A) is the famous port. | **Confirmed B (Arod/Aror).** Aror was the seat of the Rai dynasty and then of the Chach Brahmin dynasty; Brahmanabad is a later Abbasid‑period centre of Mansura. The explanation's Brahmanabad sentence was simply wrong and was replaced. |
| **MPPSC-2020-022** — capital of Raja Vir Singh Dev | Orchha is the obvious name. | **Confirmed B (Gahora).** Vir Singh Dev (1605–27) is described across MP-history sources as ruling from Gahora; Orchha is the kingdom's name. |
| **MPPSC-2020-079** — Chief Justice of MP HC who did not reach the Supreme Court | Plausible‑sounding candidate list. | **Confirmed C (S. K. Jha, CJ 27.10.1989 – 15.12.1993).** Corroboration rests on the paper's own dated explanation; flagged below as limited‑corroboration, not as ambiguous. |

Two further items are retained with **limited external corroboration** and are named here rather than presented as fully sourced: **2020-097** (crop‑sector growth 34.14 % for 2016‑17 — an official figure of that year that could not be re‑derived from an accessible source) and **2020-041** (Balkavi Bairagi's birth name Nandram Das, and Kailash Nath Katju as the person who gave him the pen name).

---

## 5. Explanations rebuilt (100 of 100)

The 2020 batch had **no** `option_explanations`, **no** `key_concepts` and **no** `revision_takeaways` at all — only one block of scraped prose (`correct_reasoning`), often with page numbers, broken hyphenation and, in several cases, **text belonging to the next question**. Every one of the 100 now carries the four‑part standard:

- **A. Concept and answer justification** — the concept behind the item, why the answer is right, and enough context to be self‑contained (not a restatement of the option).
- **B. Why the other options are wrong** — one reason per option, each tied to that option's own text and each unique within the question.
- **C. Facts for revision** — two to three specific, examinable associations (dates, districts, article numbers), not filler.
- **D. Takeaway** — one line, only where a memory hook is natural.

Cross‑question contamination was removed from, among others, **2020-032** (a Rewa solar‑plant explanation was pasted onto the Satyarthi question), **2020-076** (a leader‑of‑opposition question was pasted onto the Governor question) and **2020-095** (a sex‑ratio question was pasted onto PUMA).

Two explanations had the right answer but the wrong science and were rewritten outright: **2020-087** described the *pyramid of numbers* while asking about the *pyramid of energy*, and **2020-072** named "Frank Santoni" and "Frank Sanghoni" for Frank Anthony.

---

## 6. Option‑text repairs (2, both scan artefacts)

| Question | Option | Printed | Stored |
|---|---|---|---|
| MPPSC-2020-047 | D | `Lucknow 1` | `Lucknow` |
| MPPSC-2020-100 | B | `Coaching for Scheduled Tribe Students for sports 🔾🔾` | `Coaching for Scheduled Tribe Students for sports` |

Both are declared in `option_corrections` with `from`/`to`, and the tests verify that the declaration quotes the printed text and that the repair is in place. The numeric code strings in 2020‑026 and 2020‑064 (`3 1 2 4` and similar) were **not** touched: those are the matching codes, not scan noise.

---

## 7. Dispute‑flag bookkeeping

| | Count | Questions |
|---|---|---|
| New disputes raised | 4 | 2020‑037, 2020‑045, 2020‑093, 2020‑098 |
| Resolved | 0 | — |
| Pre‑existing 2020 disputes | 0 | — |

Every ambiguous row in the audit record has an unresolved dispute block in the bank, and the test suite asserts the two sets are identical in both directions.

---

## 8. Remaining answer/explanation contradictions

None. The specific contradictions the scraped 2020 text carried — key versus its own explanation in 2020‑008, 032, 054, 076, 095 — are precisely the five corrections above. A regex sweep over all 100 new explanations finds no sentence naming an option as correct that the stored answer does not contain, and every `is_correct` flag matches the stored key.

---

## 9. Data‑quality notes that were **not** changed (and why)

- **Misclassified topics, left as they are:** 2020‑004 (a wheat/crop question filed under *History / History of MP*), 2020‑083 (a temperature‑variation question filed under *History / History of MP*) and 2020‑080 (Article 243T filed under *General Aptitude / Quantitative aptitude*). Reclassifying them would silently rewrite the frozen 2019–2024 classification baseline that `tests/quality-audit.test.js` pins; that is a separate, declared piece of work, not something to slip into an answer audit.
- **Currency window:** the paper contains February 2021 current affairs (2020‑011 Myanmar coup, 1 Feb 2021; 2020‑035 Chauri Chaura centenary, 4 Feb 2021), so "as of the paper" means early 2021 for date‑sensitive items. One scraped explanation referenced a 2022 appointment (NITI Aayog's Vice‑Chairperson) — a later edit, now removed.
- **Printed spelling variants preserved verbatim:** "Arvind Pangariya" (2020‑017), "Dr. Balram Jhakhar" (2020‑076), "Karnam Malleshwari" (2020‑013), "Adamya" style transliterations, and the mangled stem of 2020‑044. Wording is only changed for demonstrable transcription errors, not for style.

---

## 10. Validation

| Check | Result |
|---|---|
| `npm test` | **341 / 341 passed** (332 before + 9 in the new `answer-accuracy-2020` suite) |
| `npm run check` (structural/UI) | **1075 / 1075 passed** |
| Question count vs the paper | 100 in the bank, 100 rows in the audit record, numbering 001–100 with no gaps |
| Coverage computed from the bank | 100 reviewed, 91 confirmed, 5 corrected, 4 ambiguous |
| Answer ↔ option‑flag consistency | 100 / 100 |
| Explanation standard | 100 / 100 questions carry four option rows, key concepts and a takeaway; all 100 are declared in `option_reasoning_complete` |
| Corrected answers synchronised | bank, `reviewed-corrections.json`, audit record and this report agree; `from` equals the printed key |
| Unresolved items identified | 4, each with an unresolved dispute block and a written reason |
| Existing tests weakened | none — the new suite adds rules; `explanation-quality.test.js` was **extended** to include 2020 in its audited years, not relaxed |
| Unrelated years | untouched — no 2021–2024 question, answer, option or explanation was modified |
| Unrelated app behaviour | untouched; no UI, storage or user‑data structure changed |

---

## 11. Files changed

| File | Change |
|---|---|
| `data/pyq/mymppsc-pyq-bank.json` | 100 explanations rebuilt (four‑part standard); 5 answers corrected; 2 option texts repaired; 4 new dispute blocks |
| `data/pyq/reviewed-corrections.json` | **version 4** — 5 answer corrections, 2 option corrections, 100 explanation rewrites, 100 explanations declared complete, `final_audit_2020` summary block |
| `data/pyq/quality-audit/final-answer-audit-2020.json` | **new** — one row per question with `printed_key`, final answer, status and note; reconciled counts |
| `tests/answer-accuracy-2020.test.js` | **new** — 9 tests protecting the corrections, the ambiguity flags and the count reconciliation |
| `tests/explanation-quality.test.js` | extended: 2020 added to the audited years, with a "all 100 complete" assertion |
| `REPORT_FINAL_ANSWER_AUDIT_2020.md` | **new** — this report |
| `REPORT_FINAL_ANSWER_AUDIT_2021_2024.md` | one‑line pointer: the 2020 batch is now settled in this report |

Branch: `arena/54799d16-mymppsc`. 2021–2024 remain as shipped in PR #27; that PR was neither merged nor altered.

---

## 12. Known limitation (stated, not hidden)

`tools/classify-bank.mjs` rebuilds the bank from the source intake and does **not** apply `reviewed-corrections.json`. The committed bank is the artefact of record and the suite verifies it against *source + declared corrections*, but a full rebuild would reproduce the printed keys — including the five 2020 keys corrected here — and fail those tests until the corrections are re‑applied. This predates this audit and was left untouched rather than half‑fixed.

---

## 13. Stop point

Every 2020 question now has either a defensible answer with a written justification, or an explicit statement of why it is unresolved. No other year was reopened, and no other year was started.
