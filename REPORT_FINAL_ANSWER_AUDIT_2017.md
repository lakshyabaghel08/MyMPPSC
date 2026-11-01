# MyMPPSC — Final Answer Accuracy Audit, 2017

**Scope:** every question of the 2017 Preliminary Paper‑I (`MPPSC-2017-P1`) in the bundled bank (`data/pyq/mymppsc-pyq-bank.json`).
**Question asked of every item:** would a learner be taught something false if they trusted this answer?
**Standing rule:** the printed key is evidence, not authority. An answer was kept because it survives independent subject reasoning, not because it appears in a key sheet — and it was not changed merely because a website disagreed with it.
**Machine‑readable record:** `data/pyq/quality-audit/final-answer-audit-2017.json` (one row per question, with its status and the basis for it).
**Not in scope:** 2013–2016, 2018, 2019, 2020 and 2021–2024. None of them was touched: the rebuild that produced this bank changed 100 records, all of them 2017, and the `papers` block is byte‑identical.

---

## 1. Headline counts (computed from the bank, not copied from earlier reports)

| Year | Reviewed | Confirmed (A) | Corrected (B) | Ambiguous / unresolved (C) |
|---|---|---|---|---|
| 2017 | 100 | 96 | 1 | 3 |
| **Total** | **100** | **96** | **1** | **3** |

96 + 1 + 3 = 100. The counts in `reviewed-corrections.json → final_audit_2017` and in the audit record are derived from the same rows, and `tests/answer-accuracy-2017.test.js` recomputes them and fails if they ever drift.

Printed keys were available for all 100 questions (`printed_keys_compared = 100`); the paper contains no app‑authored model question.

**Baseline before this pass:** 66 of the 100 explanations were empty, and of the 34 that existed several were scraped fragments ending mid‑sentence (031 ends "calculate the Power of the Diode…", 100 stops after a citation) and some contradicted their own stored answer (005 said 1193 while the stem says 1194; 100 said "member countries only" while the stored answer was `B`). No question had per‑option reasoning, no dispute was recorded, and the paper was the last of the 2013–2018 block still carrying placeholder prose.

---

## 2. Corrected answers (1)

| Question | Printed key | Stored after audit | Basis |
|---|---|---|---|
| **MPPSC-2017-100** — *Which of the following statements is correct with regard to 'International Monetary Fund'?* | `B` — "It can grant loans to only developed country" | **`C`** — "It grant loans to member countries only" | Membership is the condition for IMF lending: a member draws on its quota, usually through its central bank or finance ministry. The IMF does **not** restrict lending to developed countries — most of its programmes are for developing and emerging members in balance‑of‑payments difficulty. The stored key was contradicted by the paper's own explanation ("grants loan to the member countries only") and by question **085**, which asks the identical question in the same paper and is keyed `C`. Two identical items cannot carry different keys. |

The change is declared in `reviewed-corrections.json → answer_corrections` with its basis and is re‑applied by the deterministic pipeline, so a clean rebuild cannot restore `B`.

---

## 3. Ambiguous / unresolved answers (3) — preserved as uncertain, not forced

| Question | Stored answer | Why it cannot be settled |
|---|---|---|
| **MPPSC-2017-043** — *Which of the following countries has never been a winner in the T‑20 Cricket World Cup (Men)?* | `B` — Australia | Australia was the only one of the four options without a title **when the paper was set** (India 2007, Pakistan 2009, England 2010), which is why `B` is keyed. Australia won the 2021 edition in Dubai, so on today's facts *no* option is true. This is a time‑dependent item, not a wrong key; the letter is kept and the date problem is stated in the explanation. |
| **MPPSC-2017-054** — *Which of the following rulers got the Jantar Mahal of Mandu constructed?* | `A` — Mahmud Shah Khilji | `A` is the answer reproduced by published MPPSC keys and by the paper itself, and Mahmud Shah Khilji II did build in the Mandu palace quarter. Heritage descriptions, however, record no palace under the name *Jantar Mahal* and credit the Mandu ship palace (**Jahaz Mahal**) to **Ghiyasuddin Khilji**, who is not among the options. On the option set `A` is the only defensible choice, so it is kept, but the attribution is openly flagged rather than presented as settled. |
| **MPPSC-2017-059** — *The tenure of the chairman of the National Human Rights Commission is* | `C` — 5 years | Under the Protection of Human Rights Act 1993 **as it stood in 2017**, the Chairperson and members held office for five years or until 70 years of age. The **2019 amendment** cut the term to three years. `C` is the correct answer for the paper; `A` is the correct answer to the same sentence read today. Recorded as time‑dependent with both positions stated. |

Each carries an `unresolved` dispute block in `data/pyq/reviewed-disputes.json` and in the bank, and each explanation states the conflict in the prose a learner actually reads.

---

## 4. Items investigated specifically and left alone (no change justified)

Every one of these was checked during this pass, most of them against a fetched source:

- **001** — the paper prints "Ghani Malik", a scan variant of **Ghazi Malik**, i.e. Ghiyasuddin Tughlaq, founder of the Tughlaq dynasty in 1320. The dynasty question is unaffected; `A` retained.
- **005** — Muhammad Ghori defeated Jaichand at **Chandawar in 1194** (stem and the corrected explanation now agree; the old scraped text said 1193).
- **008** — Abul Kalam Azad was Congress President in **1923 at the age of 35**, the youngest ever; Nehru was 40 at Lahore in 1929.
- **018** — Rameshwar Thakur (2009–11) and Dr Bhai Mahaveer (1998–2003) were both Governors of Madhya Pradesh, so the odd name is **Justice Anshuman Singh**, a Governor of Rajasthan. `D` confirmed.
- **030** — Vitamins A, B and D are credited to **Elmer McCollum** and vitamin C to **James Lind**; the mismatched pair is vitamin D with "Paul Muller" (the DDT chemist). `D` confirmed, with the printed spellings repaired (§7).
- **051** — the "principle of Constitutional Autocracy" is tied in standard treatments to the **Government of India Act 1935**, which vested executive authority in Governors and the Governor‑General on behalf of the Crown. `C` confirmed.
- **057** — the **Ajanta** hills lie wholly in Maharashtra; Aravali, Satpura and Sahyadri all cross state borders. `C` confirmed.
- **062** — Mohun Bagan was founded in **1889** and won the IFA Shield in 1911. `C` confirmed.
- **066** — Ranjit Sub‑1 and Bahadur Sub‑17 are **submergence‑tolerant paddy varieties**, not aircraft or submarines. `C` confirmed.
- **069** — **Himachal Pradesh** commissioned India's first State Data Centre, built on the green data‑centre concept. `D` confirmed.
- **071** — Bhawani Prasad Mishra was born on 29 March 1913 at **Tigaria village, Hoshangabad district** (now Narmadapuram). `D` confirmed.
- **073** — **Sunil Bharti Mittal** was elected Chairman of the International Chamber of Commerce in June 2016, the first Indian to hold the post. `D` confirmed.
- **077** — Ivan Dodig, Sania Mirza's mixed‑doubles partner, is **Croatian**. `D` confirmed.
- **080** — *Uttararamacharitam* is by **Bhavabhuti**; Meghadutam, Kumarasambhavam and Ritusamharam are Kalidasa's. `C` confirmed.
- **085** — the IMF lends **only to member countries**; this is the twin of question 100 and confirms the correction made there.
- **087** — the IPL 2016 final was played at the **M. Chinnaswamy Stadium, Bengaluru, Karnataka** (29 May 2016). `A` confirmed.
- **090 / 091** — **Gangeyadeva** was a Kalachuri of Tripuri, not a Paramara (`C`); **Dhangadeva** ruled the **Chandelas of Jejakabhukti** (`A`).
- **093 / 094** — the Special Court provision is **Section 14** of the SC/ST (PoA) Act 1989 (`A`), and the investigating officer's report is due within **30 days** under Rule 7 of the 1995 Rules (`D`).
- **095** — the **Aitareya Brahmana** belongs to the Rigveda; Gopatha is Atharvan, Shatapatha Shukla Yajurvedic and Taittiriya Krishna Yajurvedic. `A` confirmed.
- **096** — the GST task force was headed by **Vijay Kelkar**. `A` confirmed.

---

## 5. Explanations rebuilt (100 of 100)

All 100 explanations were **rewritten to the four‑part standard** used in the 2018–2021 audits:

1. a short concept paragraph that justifies the keyed option on the facts, not by repeating the key;
2. one reasoned row per option, quoting that option's own text and explaining why it is or is not the answer;
3. two to four `key_concepts` a learner should carry away;
4. a one‑line `revision_takeaways` note.

No template or shared boilerplate was used: every paragraph is written for its own question, and `tests/explanation-quality.test.js` now includes 2017 in the audited set, so a question whose reasoning does not discuss its own subject matter, or whose four option rows repeat one another, fails the suite.

Pre‑existing prose that survived in the intake was **not** retained where it was wrong: 042 described Avanti as a "republic" (it was a monarchy under the Pradyota line — the republic was Vajji), 058 placed Mandu "on the banks of the Narmada" (it stands on the Malwa plateau, north of the river), 094 credited *Satyarth Prakash* to Swami Shraddhanand (it is Dayanand Saraswati's), and 100 contradicted its own key. All four are now correct.

---

## 6. Option‑text repairs (7 repairs across 5 questions)

Repairs were made only where the printed paper makes the intended wording certain, and each is declared in `reviewed-corrections.json → option_corrections` with the exact before/after text:

| Question | Option | Printed (as captured) | Repaired | Why |
|---|---|---|---|---|
| **030** | A | `Vitamin A- Maculan` | `Vitamin A- McCollum` | Same name as option B; the paper's own explanation names **Elmer McCollum** |
| **030** | B | `Vitemin B- Maculan` | `Vitamin B- McCollum` | "Vitemin" is a scan error for Vitamin; same name |
| **030** | C | `Vitemin C- James Lind` | `Vitamin C- James Lind` | "Vitemin" is a scan error for Vitamin |
| **051** | C | `The Government of India Act of 1935 [` | `The Government of India Act of 1935` | Stray bracket from the column edge |
| **054** | D | `Hoshang Shah [P.T.O.` | `Hoshang Shah` | Page‑footer debris captured into the option |
| **058** | C | `N. M. Lolchande` | `N. M. Lokhande` | **N. M. Lokhande** is the labour organiser the question tests |
| **077** | C | `Russin` | `Russia` | Scan error for Russia |

No option was added, removed, reordered or reworded beyond these repairs, and no question stem was rewritten.

---

## 7. Dispute‑flag bookkeeping

`data/pyq/reviewed-disputes.json` gained **3** blocks (043, 054, 059), all `unresolved`, each with a reason of more than 40 characters naming the conflict. Total disputes in the file: **34** (31 before this pass). 29 blocks apply to shipped questions and 5 remain deferred to the app‑authored model questions, which is why the pipeline reports "29 dispute block(s) applied" against 34 declared — the same behaviour as before this pass, and the reconciliation now reports `true` for every correction kind.

---

## 8. Remaining answer/explanation contradictions

None known in 2017. Every stored answer agrees with its own option correctness flags, and no explanation names a letter that the stored answer excludes (`tests/answer-accuracy-2017.test.js` enforces both). The three ambiguous items carry the conflict in the prose itself, so the uncertainty is visible rather than hidden behind a tick.

---

## 9. Validation

| Check | Result |
|---|---|
| Verified rebuild (`node tools/classify-bank.mjs … --apply-corrections --include-model-questions`) | 1,200 questions / 12 papers; **28 keys / 33 option repairs / 771 explanations / 29 disputes applied**, 0 rejected, `reconciled: true` |
| Bank validator | `ok` — fatal 0, errors 0, rejected 0, warnings 48 (unchanged from the pre‑pass 48) |
| Bank diff against the previous commit | **100 records changed, all `MPPSC-2017-*`**; `papers` and `app_compatibility` byte‑identical; question count 1,200 → 1,200 |
| `npm test` | **375 / 375 pass** (was 366 before this pass; the 9 new tests are `answer-accuracy-2017.test.js` plus the extended explanation‑quality assertions) |
| `npm run check` | **All 1,075 checks passed** |

One small pipeline fix was needed and is included: `tools/classify/reviewed-corrections.mjs` counted a question with several repaired options as **one** declared correction while counting **each repaired option** as applied, so the reconciliation flag read `false` for any such question (2017‑030 repairs three options). Declared and deferred option counts are now computed per repaired option, and the invariant `applied + already applied + deferred = declared` holds exactly. No output or decision changed because of it.

---

## 10. Files changed

- `data/pyq/reviewed-explanations.json` — 100 new 2017 entries, `final-answer-audit-2017.json` added to `source_audits`
- `data/pyq/reviewed-corrections.json` — 1 new `answer_correction`, 5 new `option_corrections` blocks (7 repairs), 100 ids added to `narrative_rewritten` and `option_reasoning_complete`, new `final_audit_2017` summary block
- `data/pyq/reviewed-disputes.json` — 3 new unresolved blocks
- `data/pyq/quality-audit/final-answer-audit-2017.json` — new: 100 rows with status, printed key, answer and note
- `data/pyq/mymppsc-pyq-bank.json` — regenerated (100 changed 2017 records)
- `tests/answer-accuracy-2017.test.js` — new suite (8 tests)
- `tests/explanation-quality.test.js` — 2017 added to the audited set, with a 100‑question coverage assertion
- `tests/rebuild-corrections.test.js` — printed‑key provenance and correction counts extended to the 2017 audit
- `tools/classify/reviewed-corrections.mjs` — option‑correction counting fixed (see §9)
- `docs/PYQ_AUDIT.md` — 2017 entry added

---

## 11. Known limitations (stated, not hidden)

- **Taxonomy mis‑tags were left untouched.** This pass audited answers and explanations only. Several 2017 questions carry a subject/topic that does not match their content — for example **008** (a sports award) is tagged *History of MP / Maratha rule*, **038** (a museum) is tagged *Gandhian movements*, **036** (the UN Secretary‑General) is tagged *Union Executive*, and **084** (body composition) sits under *General Aptitude / Percentage and averages*. Re‑tagging them is a taxonomy task with its own review burden and was deliberately not mixed into this audit.
- **The corpus has no independent key file for 2017.** Verification rests on subject reasoning plus published sources for the specific facts cited; where sources conflict (054) or the fact has moved since 2017 (043, 059), the item is flagged rather than "fixed".
- **Two items remain genuinely date‑bound** (043, 059). They are correct for the paper and would be wrong if re‑used verbatim today; the explanations say so.
- **2022–2024 still owe per‑option reasoning.** 100 questions each remain outside `option_reasoning_complete`, and the coverage test keeps that visible rather than claiming completion.

---

## 12. Stop point

2017 is complete: 100 of 100 questions reviewed, 1 answer corrected against the printed key, 3 recorded as ambiguous, all 100 explanations rebuilt, 7 option‑text repairs declared, disputes and audit records written, the rebuild deterministic, the bank diff confined to 2017, and both the test suite and the static checks green.

No other year was modified, and no pull request was merged. The work is on `arena/54799d16-mymppsc` with PR #27 updated and left open, pending review.
