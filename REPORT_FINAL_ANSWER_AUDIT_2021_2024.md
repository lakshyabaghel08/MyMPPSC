# MyMPPSC — Final Answer Accuracy Audit, 2021–2024

**Scope:** every question in the 2021, 2022, 2023 and 2024 Preliminary Paper‑I of the bundled bank (`data/pyq/mymppsc-pyq-bank.json`).
**Question asked of every item:** would a learner be taught something false if they trusted this answer?
**Standing rule:** the printed key is evidence, not authority. An answer was kept because it survives independent subject reasoning, not because it appears in a key sheet.
**Machine‑readable record:** `data/pyq/quality-audit/final-answer-audit-2021-2024.json` (one row per question, with its classification).
**Not in scope:** the 2020 batch, audited separately in `REPORT_FINAL_ANSWER_AUDIT_2020.md`.

> **Superseded for 2023 and 2024.** The counts and classifications below were correct for this 2021–2024 pass, but the later per-year audits re-derived those two papers question by question. Their findings — the keys they confirmed or corrected, the items they left flagged, and the option repairs they pinned — are recorded in [`REPORT_FINAL_ANSWER_AUDIT_2023.md`](REPORT_FINAL_ANSWER_AUDIT_2023.md) and [`REPORT_FINAL_ANSWER_AUDIT_2024.md`](REPORT_FINAL_ANSWER_AUDIT_2024.md), and both the table below and `final-answer-audit-2021-2024.json` have been brought into line with them. Where the two disagree, the year audit is the record.

---

## 1. Headline counts (computed from the bank, not copied from earlier reports)

| Year | Reviewed | Confirmed (A) | Corrected (B) | Ambiguous / unresolved (C) |
|---|---|---|---|---|
| 2021 | 100 | 94 | 1 | 5 |
| 2022 | 100 | 98 | 0 | 2 |
| 2023 | 100 | 93 | 6 | 1 |
| 2024 | 100 | 94 | 5 | 1 |
| **Total** | **400** | **379** | **12** | **9** |

379 + 12 + 9 = 400. Every year sums to 100. The counts in `reviewed-corrections.json → final_audit_2021_2024` and in the audit record are derived from the same rows, and `tests/answer-accuracy.test.js` recomputes them and fails if they ever drift.

---

## 2. Corrected answers (1)

| Question | Old answer | New answer | Reason |
|---|---|---|---|
| **MPPSC-2021-010** — *Phosphatase test is used for the analysis of* | `D` — All of the above | `A` — Milk | The phosphatase (Scharer) test measures residual alkaline phosphatase in **milk** to verify that pasteurisation actually happened; the enzyme survives heat just above the pasteurisation range, so residual activity means under‑heated or re‑contaminated milk. There is no standard phosphatase test for tea, and phosphatase activity is not how water is analysed, so "All of the above" cannot be defended. The stored explanation already said the test is "specifically for milk" while the key said D — a direct answer/explanation contradiction. The 2021 key sheet prints D; that printed answer is recorded as wrong, not silently overridden. |

The correction is declared in `data/pyq/reviewed-corrections.json → answer_corrections` with `from: ["D"], to: ["A"]` and its basis, and the explanation, the four option‑level reasons and the key concepts were synchronised to it.

---

## 3. Ambiguous / unresolved answers (7) — preserved as uncertain, not forced

| Question | Stored answer | Why it cannot be settled |
|---|---|---|
| **MPPSC-2021-027** — Auctions / dynamic pricing are examples of | `A, C` | B2B procurement auctions and C2C consumer auction sites are both textbook examples; the stem does not exclude either. |
| **MPPSC-2021-028** — "A ____ is used to transfer data packets between two computer networks" | `B` (Router) | A router is the standard answer, but a **brouter** (bridge + router) and a **gateway** also forward packets between networks; the stem isolates none of them. |
| **MPPSC-2021-034** — Turra‑Kalangi folk drama region | `A, B, C` | The form is documented in Nimar and staged in Malwa and Bundelkhand; sources disagree on the single "home" region, and the commission scored three keys. |
| **MPPSC-2021-037** — Which meeting of the Constituent Assembly saw the Objectives Resolution | `D` (Fifth) | The Resolution was moved on 13 December 1946. Whether that sitting is the second, third, fourth or fifth depends on the counting convention (the Assembly sat on 9, 10, 11 and 13 December 1946). The official key is retained and the counting ambiguity stated. |
| **MPPSC-2021-077** — Which CM did not hold the office of *leader of the house* | `B` | The printed stem says *leader of the house*, an office held by every Chief Minister — Govind Narayan Singh was CM 1967‑69, so on the printed wording B is not the answer. The key only makes sense on the *Leader of the Opposition* reading (the 2020 paper asked that form), and on that reading **P. C. Sethi (A) also never held the post** (CM 1972‑75, then Union minister and Rajya Sabha member). Two options qualify; the word "house" should probably read "opposition". The explanation previously asserted that Sethi had led the opposition — a factual error now corrected. |
| **MPPSC-2022-045** — Buddhist caves are *not* situated at | `C, D` | Sanchi is a stupa‑and‑monastery site (the rock‑cut caves are at Udayagiri, ~13 km away) and Bulsar/Valsad has no Buddhist cave group. Two options satisfy the stem; the item is defective. |
| **MPPSC-2022-053** — NHRC statements (i) and (ii) | `D` | Both statements are true (PHRA 1993, s.12) and (i) is not the explanation of (ii), so C is wrong — but A and B are also literally true statements, so the key only works if D is read as "both are true" rather than as a combination of A and B. The defect is now stated in the explanation itself. |

All seven carry a schema‑valid `dispute` block with `status: unresolved` and a reason that explains what is wrong with the item. **Nothing was forced to a single key to make the bank look finished.**

---

## 4. Previously disputed questions rechecked specifically

| Question | Verdict |
|---|---|
| **2021-064** Bhil vs Gond | **Confirmed `B` (Bhil).** Wording and options verified verbatim: "Which is the largest tribal group of Madhya Pradesh?" with Gond / Bhil / Baiga / Sahariya. Census 2011 gives MP 5,993,921 Bhil (≈39 % of the state ST population, including Bhilala, Barela and Patelia) against 5,093,124 Gond (≈33 %). The Bhil are the largest, the Gond second — the Gond are the largest tribe in *India*, which is what makes option A tempting. The published 2021 key (D, Sahariya) is wrong; the earlier internal change to A (Gond) was also wrong and was already reverted. Dispute flag now `resolved`. |
| **2021-063** Network server | **Confirmed `D`, with the wording assessed.** File, print and application servers are recognised dedicated server roles; "network server" is a generic umbrella term for any server on a network, not a fourth role. The stem is loose but the four options do permit a definite answer: D is the only one that is not a server type in the taxonomy the question is built on. No change. |
| **2022-003** McCarthy | **Confirmed `B`.** John McCarthy coined "artificial intelligence" for the 1956 Dartmouth workshop and created LISP; Dartmouth is a place, not a person, so the printed key D is indefensible. |
| **2022-045** Buddhist caves | **Ambiguous `C, D`** — see §3. |
| **2022-053** NHRC functions | **Ambiguous, `D` retained** — see §3. |
| **2022-083** Iron ore ranking | **Confirmed `A`.** MP produces ≈2 % of India's iron ore and stands fifth (Odisha ≈51 %, Chhattisgarh ≈18 %, Karnataka ≈17 %, Jharkhand ≈10 %), so statement A ("MP ranks third") is the false one; statement D (reserves shrank after Chhattisgarh's separation) is true. The printed key D contradicted its own statement set. |

**The other 15 previously changed keys were re‑derived and all stand:** 2021‑068, 2022‑018, 2022‑090, 2023‑001, 2023‑009, 2023‑046, 2023‑052, 2023‑057, 2023‑059, 2024‑018, 2024‑029, 2024‑072, 2024‑080 (and 2022‑003, 2022‑083 above). Two of them were re‑checked against fresh evidence in this pass rather than trusted: 2024‑029 (the tribal self‑employment scheme is the *Bhagwan Birsa Munda Swarozgar Yojana*; the Tantya Mama scheme is the *Arthik Kalyan* small‑loan scheme) and 2022‑018 (Hockey India's own award list: 2020 Lifetime Dronacharya — Romesh Pathania; regular — Jude Felix).

Seventeen questions in scope now differ from the printed source key (16 earlier + 2021‑010). Each difference is declared with a basis, and each is a case where the printed key is demonstrably wrong rather than merely unfashionable.

---

## 5. Items investigated and left alone (no change justified)

Re‑derived from evidence and confirmed, among others: 2021‑037's date (13 Dec 1946), 2021‑053 (Lajpat Rai's "annual national festival of educated Indians"), 2021‑055 (Satara, first Doctrine of Lapse annexation), 2022‑024 (Al‑Biruni on Gangeyadeva's Tripuri), 2022‑021 (Sanchi torana, Ashoka and his queens), 2022‑082 (Sukta project is in Khandwa, not Betul), 2022‑092 (Saharia are addressed as Khutia Patel), 2022‑095 (MP's own Economic Survey ranks the state fourth in *gross* coal production, which is the phrase the question uses — even though the Coal Controller's 2021‑22 tonnage puts MP third), 2022‑100 (Sarla Grewal), 2023‑011 (Alirajpur, 31.05 % — the highest MPI improvement), 2023‑012 (BRAP 2020: MP in the *Achievers* category), 2023‑013 (Anuppur 12.30 < Betul 12.92 < Chhindwara 13.07 < Mandsaur 13.19), 2023‑071, 2023‑091, 2024‑022 (Mandwara — Gond), 2024‑027 (Birha — Gond), 2024‑031 (SLR floor of 25 % removed by the Banking Regulation (Amendment) Act, 2007), 2024‑052 (soybean began in Dewas), 2024‑058 (BHEL Bhopal with AEI of the UK), 2024‑082 (Sudha Murty, the 12th nominated member, March 2024), 2024‑092 (Shatapatha Brahmana / Revottaras), 2024‑100 (Sulakavi/Vasul Kavi, Sondani).

---

## 6. Explanation repairs (answers unchanged, 9)

Explanations were touched only where they were factually wrong, contradicted the stored answer, or could not be understood as printed.

| Question | What was wrong | Repair |
|---|---|---|
| 2021‑020 | The reasoning was self‑contradictory ("…a–d, b–c, c–a, d–b? Reviewing: the keyed correct option is D"), leaving the learner no way to see the matching | States the four pairs (Balaghat–Kodo Kutki, Betul–teak, Khargone–chilli, Narsinghpur–tuar/jaggery → d, c, b, a = D) and notes that the option column prints only the code sequences |
| 2021‑056 | Explained the **State Information Commission under the RTI Act, s.15**, for a question about the **State Human Rights Commission** | Replaced with PHRA 1993, s.21(1): committee = Chief Minister, Speaker, Leader of the Opposition (+ Council Chairman where a Council exists); options A and C |
| 2021‑058 | Reasoning discussed "statutory body vs constitutional body" — statements that are not in the question | Addresses the three printed statements: (i) salary = Supreme Court judge (true), (ii) 6 years/65 (true), (iii) resignation addressed to the CEC (false — the 1991 Act says the President) → B |
| 2021‑070 | "that work belongs to a different writer" — unverifiable from the corrupted option text | Names the writer: *Him Tarangini* is Makhanlal Chaturvedi's, not Bhavani Prasad Mishra's |
| 2021‑077 | Claimed Sethi, Gaur and Joshi all led the opposition — **Sethi never did** | Rewritten to state the two readings, the printed‑wording problem, and that A also qualifies on the opposition reading; flagged defective |
| 2022‑053 | "Both statements true" without acknowledging that A and B are also literally true | Adds that the item is poorly constructed and why D is only the keyed reading |
| 2023‑033 | Contained a drafting artefact: "…was conferred on G. Sathiyan? No —" | Clean statement: Achanta Sharath Kamal, 2022 |
| 2024‑088 | Contained "Arun Mishra? No —" | Clean statement: Justice A. M. Khanwilkar, 2024 |
| 2024‑095 | Contained "…a disciple of the legendary maestro Pandit Bhimsen Joshi? (actually of the Gwalior tradition)" | Clean statement: Gwalior gharana vocalist, khayal singing |

No explanation was lengthened for its own sake, and no new bibliography was added.

---

## 7. Option‑text repairs (7, all scan artefacts)

Trailing page digits that had survived extraction were removed, each declared in `option_corrections` with the printed text quoted: 2023‑045 D ("None of the above 8"), 2024‑006 D ("33 2"), 2024‑020 D ("State list 8"), 2024‑036 D ("…Sukanya Samriddhi Yojana 3"), 2024‑061 D ("Hemchandra Bandopadhyay 5"), 2024‑075 D ("La Nina strengthens the Indian Monsoon. 0"), 2024‑097 D ("Khargone 9"). Question wording and all substantive option text are untouched; nothing was fabricated.

---

## 8. Dispute‑flag bookkeeping

19 questions in 2021–2024 carry a schema‑valid `dispute` block; **no answer is flagged without a reason, and no unresolved flag sits on an answer the audit considers settled.**

- **Unresolved (7):** 2021‑027, 2021‑028, 2021‑034, 2021‑037 (new flag), 2021‑077 (new flag), 2022‑045, 2022‑053.
- **Resolved by this audit (12):** 2021‑010 (new — official key wrong), 2021‑056 (statutory basis established), 2021‑057, 2021‑076, 2021‑082 (cancelled by the commission; underlying fact certain), 2021‑064 (Census 2011), 2021‑068 (Sehore, not Indore), 2021‑080 (Ghori, not Timur), 2021‑085 (Amarkantak, not Aravalli), 2021‑092 (Third Amendment, grace marks recorded), 2022‑003 (McCarthy), 2022‑083 (MP fifth).

---

## 9. Remaining answer/explanation contradictions

**None detected.** Both are now mechanically enforced over all 400 questions by `tests/answer-accuracy.test.js`:

- every `option_explanations` flag set equals the stored answer exactly;
- no reasoning that says "Hence option X is correct" names an option outside the stored answer.

Two honest caveats:

1. **Cancelled questions** (2021‑057, 2021‑076, 2021‑082) have no official answer at all; their stored answers rest on the law/fact stated in the explanation, not on a key. They remain flagged so a learner is not told the commission endorsed them.
2. **Printed keys known to be wrong** (2021‑010, 2021‑064, 2021‑080, 2021‑085, 2022‑003, 2022‑083) are recorded as such inside the explanation or the dispute note, so the app never implies the printed answer was right.

---

## 10. Validation

| Check | Result |
|---|---|
| `npm test` | **332 / 332 passed** (325 before + 7 in the new `answer-accuracy` suite) |
| `npm run check` (structural/UI) | **1075 / 1075 passed** |
| All 400 questions classified | yes — 100 per year, ids reconcile with the bank |
| Coverage per year, computed from the bank | 400 reviewed, 392 confirmed, 1 corrected, 7 ambiguous |
| Answer ↔ option flags | consistent for all 400 |
| Corrected answers synchronised | bank, `reviewed-corrections.json`, audit record and this report agree |
| Unresolved questions identified | 7, each with a dispute block and a stated reason |
| Existing tests weakened | none — the new suite adds rules, and the earlier suites that pin the bank to its source (with declared corrections) were left intact and still pass |
| Unrelated app behaviour | untouched; no UI, storage or user‑data structure changed |

The new suite also guards the exact defect this audit was asked to prevent: a stored answer drifting from its own explanations, or an "ambiguous" label being quietly dropped.

---

## 11. Files changed

| File | Change |
|---|---|
| `data/pyq/mymppsc-pyq-bank.json` | 1 answer corrected (2021‑010); 9 explanations repaired; 7 option texts repaired; 19 dispute blocks normalised (3 new, 12 resolved, 7 unresolved) |
| `data/pyq/reviewed-corrections.json` | version 3; new answer correction; 7 new option corrections; `final_audit_2021_2024` summary block |
| `data/pyq/quality-audit/final-answer-audit-2021-2024.json` | **new** — per‑question classification and reconciled counts |
| `tests/answer-accuracy.test.js` | **new** — 7 tests protecting the above |
| `REPORT_FINAL_ANSWER_AUDIT_2021_2024.md` | **new** — this report |
| `REPORT_QUALITY_AUDIT_2021_2024.md`, `docs/PYQ_AUDIT.md` | pointer to the final audit record |

Branch: `arena/54799d16-mymppsc`, branched from `539a2c5` (PR #26 merge). No commit or PR was created in this task.

---

## 12. Known limitation (stated, not hidden)

`tools/classify-bank.mjs` rebuilds the bank from the source intake and does **not** apply `reviewed-corrections.json`. The committed bank is the artefact of record and is verified by the test suite against `source + declared corrections`, but a full rebuild would reproduce the printed keys and fail those tests until the corrections are re‑applied. This predates this audit and was left untouched rather than silently half‑fixed; wiring the manifest into the build is the obvious follow‑up whenever the bank is next regenerated.

---

## 13. Stop point

Every 2021–2024 question now has either a defensible answer or an explicit statement of why it is unresolved. The 2020 batch was audited afterwards in `REPORT_FINAL_ANSWER_AUDIT_2020.md`; nothing in this report was reopened for it.
