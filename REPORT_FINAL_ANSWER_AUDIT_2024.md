# MyMPPSC — Final Answer Accuracy Audit, 2024

**Scope:** every question of the 2024 Preliminary Paper‑I (`MPPSC-2024-P1`) in the bundled bank (`data/pyq/mymppsc-pyq-bank.json`).
**Question asked of every item:** would a learner be taught something false if they trusted this answer?
**Standing rule:** the printed key is evidence, not authority. An answer was kept because it survives independent subject reasoning, not because it appears in a key sheet — and it was not changed merely because a website disagreed with it.
**Machine‑readable record:** `data/pyq/quality-audit/final-answer-audit-2024.json` (one row per question, with its status and the basis for it).
**Not in scope:** every other year. The rebuild that produced this bank changed 100 records, all of them 2024, and the `papers` block is byte‑identical.

---

## 1. Headline counts (computed from the bank, not copied from earlier reports)

| Year | Reviewed | Confirmed (A) | Corrected (B) | Ambiguous / unresolved (C) |
|---|---|---|---|---|
| 2024 | 100 | 94 | 5 | 1 |
| **Total** | **100** | **94** | **5** | **1** |

94 + 5 + 1 = 100. The counts in `reviewed-corrections.json → final_audit_2024` and in the audit record are derived from the same rows, and `tests/answer-accuracy-2024.test.js` recomputes them and fails if they ever drift.

Four of the five corrections (`018`, `029`, `072`, `080`) are keys the earlier 2021–2024 pass had already changed; they were re‑derived question by question here and are now recorded in this paper's own audit record, with the printed key each one replaced. **One key was corrected by this pass: `090`.** Every other stored answer was confirmed.

Printed keys were compared for all 100 questions (`printed_keys_compared = 100`).

**Baseline before this pass:** all 100 questions already had four option rows and no empty option text, but only **four** explanations met the per‑option standard (`018`, `029`, `072`, `080` — the four questions an earlier pass had touched). The remaining 96 carried at least one one‑clause entry that restated its own option, so the paper could not be taught from.

---

## 2. Corrected answers (5)

| Question | Printed → stored | Basis |
|---|---|---|
| **MPPSC-2024-018** — *the Atal Bihari Vajpayee Institute of Good Governance and Policy Analysis is located in …* | `A` → **`C`** | The institute is in **Bhopal**. Option A names another city, and no reading of the institute's own mandate places it there. |
| **MPPSC-2024-029** — *the Madhya Pradesh tribal self‑employment scheme* | `B`, `C` → **`C`** | The scheme is the **Bhagwan Birsa Munda Self‑Employment Scheme**. Tantya Mama is a separate welfare scheme in the same department, so the second printed letter duplicates a different programme. |
| **MPPSC-2024-072** — *states holding the largest share of India's coal reserves* | `C` → **`B`** | **Jharkhand (≈26 %) and Odisha (≈25 %)** together hold more than half of the country's reserves. Option C pairs two states whose combined share is materially smaller. |
| **MPPSC-2024-080** — *state with the lowest population density in Census 2011* | `D` → **`B`** | **Arunachal Pradesh** recorded 17 persons per sq km, the lowest in the country. The printed option names a state with a far higher density. |
| **MPPSC-2024-090** — *the winner of the five‑Test cricket series between India and England, 2024* | `A` → **`B`** | India won the series **4–1**: England took only Hyderabad, and India won at Visakhapatnam, Rajkot, Ranchi and Dharamsala. The printed key records a 3–2 margin, which the scoreline does not support. |

The bases above are the same ones the manifest carries in `reviewed-corrections.json`; the audit record quotes each printed key (`from`) beside the corrected key (`to`), and `tests/answer-accuracy-2024.test.js` pins all five.

**One declared correction was withdrawn.** An earlier draft of this pass listed `MPPSC-2024-096` (*the Sutradhar of Gammat folk theatre*) as `D → C`. The extraction, the baseline record and the stored bank all already printed **C**, so there was nothing to correct: the declaration was a bookkeeping error, not a finding. It has been deleted, `final_audit_2024` recomputed, and the test now asserts that no correction exists for that question. The answer **C — Kudgarya** is confirmed, and only **C** stands as a correction added by this pass beyond the inherited four.

---

## 3. Dispute left open (1)

| Question | Status | Why it is not closed |
|---|---|---|
| **MPPSC-2024-027** — *Birha is sung by women of which tribe?* | `unresolved` | The paper keys **Gond (A)**, and the Gond tradition of Birha is well documented in Baghelkhand and Bundelkhand. The **Gazetteer of the Jabalpur district**, however, records that Gond *as well as* **Kol** women sing and perform Birha, so a second letter is defensible. The keyed answer stands (the Commission's key rests on a published authority, and a 2024 petition on exactly this point did not displace it) and the item is flagged rather than presented as settled; the explanation says this in the question's own words. |

The item is recorded in `data/pyq/reviewed-disputes.json` and in the bank's `dispute` block, and the multi‑year record `final-answer-audit-2021-2024.json` now marks the row `ambiguous` too, so the two records agree.

---

## 4. Scan damage

**No new damage was found and no new repair was made.** The six repairs the earlier pass had already declared are still in force and are now pinned by the 2024 test:

| Question | Option | Printed | Repaired |
|---|---|---|---|
| MPPSC‑2024‑006 | D | `33 2` | `33` |
| MPPSC‑2024‑020 | D | `State list 8` | `State list` |
| MPPSC‑2024‑036 | D | `Beti Bachao Beti Padhao Abhiyan and Sukanya Samriddhi Yojana 3` | `… Yojana` |
| MPPSC‑2024‑061 | D | `Hemchandra Bandopadhyay 5` | `Hemchandra Bandopadhyay` |
| MPPSC‑2024‑075 | D | `La Nina strengthens the Indian Monsoon. 0` | `La Nina strengthens the Indian Monsoon.` |
| MPPSC‑2024‑097 | D | `Khargone 9` | `Khargone` |

Stray trailing digits (footnote residue from the scan) were the only damage. Nothing was invented, and no option wording was otherwise touched.

---

## 5. Items investigated specifically and left alone (no change justified)

| Question | Why the printed answer was kept |
|---|---|
| **012** — *which statement about the Election Commission is **not** correct* | Option **A** (differences of opinion are settled by the Chief Election Commissioner's majority) — the negative‑statement answer, as keyed; the other three restate the constitutional position correctly, including the six‑year term and the removal procedure. |
| **038** — *GI‑tagged Chinnor rice* | **Balaghat** (option D). Chinnor is a scented rice of the Balaghat tracts; the distractors are rice‑growing districts, which is why the item needed checking. |
| **043** — *"Kurrently" is a/an …* | **Search engine** (option A). It is a real‑time search engine, not a social network, blog or forum — the everyday use of the site as a social feed makes B tempting, but its function is search. |
| **056** — *when was bamboo nationalised in Madhya Pradesh* | **1973** (option C). The nationalisation order for bamboo is a 1973 measure; 1964/1963/1975 are the near‑miss years the item tests. |
| **066** — *in which Veda are Sabha and Samiti separate institutions* | **Atharvaveda** (option C), as keyed. The distinction between the two as named bodies appears in the Atharvaveda; the Rigveda mentions them together but not as separate institutions. |
| **067** — *mantra recited at the Upanayana of Kshatriya castes* | **Trishtubh** (option D). The Gopatha Brahmana assigns Trishtubh to the Kshatriya, Gayatri to the Brahmana; the other named metres do not belong to that scheme. |
| **082** — *the 12th nominated member of the Rajya Sabha in 2024* | **Sudha Murty** (option C), nominated 8 March 2024 to fill the seat left vacant after Satnam Singh Sandhu's January nomination. The distractor B is the earlier nominee, which is precisely the confusion the item tests. |
| **092** — *first literary reference to the Narmada* | **Shatpath Brahman** (option A), the earliest of the named texts; Manusmriti, the Varahamihira Samhita and the Agni Purana are all later. |
| **093** — *Chalcolithic site called the birthplace of Varahamihira* | **Kayatha** (option B), as keyed; Dangwada, Navdatoli and Indragarh are the other Malwa Chalcolithic sites. |
| **096** — *the Sutradhar of Gammat folk theatre* | **Kudgarya** (option C), confirmed against the folk‑theatre literature after the withdrawn declaration described in §2. The competing figure belongs to a different role in the form. |
| **100** — *author of Yashodharman's Sondani inscription* | **Vasul Kavi** (option B), as keyed; Ravikirti is the Aihole inscription's author and Kakka a different court poet. |

Also re‑derived and confirmed without change (selection): 001, 005, 009, 013, 027 (flagged), 039, 045, 051, 057, 059, 061, 068, 073, 075, 081, 089, 091, 095, 097 and 099.

---

## 6. Explanation rebuild

All 100 explanations were rebuilt to the four‑part standard used for the years already audited:

1. a `correct_reasoning` paragraph that states the fact and why the key follows from it, naming the distractor logic where the paper relies on it;
2. **four per‑option reasons**, each tied to that option's own text, with no reason restating its option and no sentence reused between questions;
3. `key_concepts` — two or three named concepts a learner should be able to recall;
4. `revision_takeaways` — one or two standing facts.

The declaration list `option_reasoning_complete` now names all 100 questions of this paper, up from four. Five numbers this paper never printed — **019, 039, 073, 081 and 091** — are app‑authored model questions; their explanations live in `data/pyq/model-questions.json`, were rebuilt to the same standard in this pass, and are therefore not listed in `narrative_rewritten` (which records 95 printed‑paper rewrites for 2024, 1,171 bank‑wide). They are named in the audit record's `model_questions` field instead of being passed off as recovered text.

A separate prose checker re‑read all 100 entries for the known failure modes — reasons shorter than five words, reasons that restate their option, templated openings, missing takeaway, a `correct_reasoning` that never touches the stem's own vocabulary, and a key whose ticked option disagrees with the stored answer — and reported **0 problems** across 100 entries.

---

## 7. Verification performed

| Check | Result |
|---|---|
| `npm test` | **435 tests, 435 pass, 0 fail** |
| `npm run check` | **all 1075 checks pass** |
| Clean rebuild (`tools/classify-bank.mjs --apply-corrections …`) | 1,200 questions / 12 papers; validator **ok**, 0 errors, 47 warnings; 38 keys corrected, 60 option texts repaired, 1,171 explanations restored, 41 dispute blocks restored (38/61/1,171/46 declared; the 5 model‑question blocks are always deferred) |
| Year isolation | rebuild diff against the committed bank: **100 records changed, all 2024, 0 in any other year**; `papers` block byte‑identical |
| Determinism | a second clean rebuild reproduces the bank byte for byte apart from the `generated_at` stamp (covered as well by `tests/rebuild-corrections.test.js`) |
| Prose checker | 100 2024 entries, **0 problems** |
| New suite | `tests/answer-accuracy-2024.test.js` — 9 tests recomputing the counts, checking answer/flag agreement, the five declared corrections, the withdrawn 096 declaration, the two‑letter printed key of 029, the disputed 027 and its open dispute, the six option repairs, and the 100‑question completeness declaration |
| Coverage guard | the `[2024]` "still owes per‑option reasoning" loop in `tests/explanation-quality.test.js` was **retired by editing it**: it now asserts that every audited year is declared complete and that no question can be declared without meeting the standard, instead of reserving one year as outstanding |

Known limitation: the taxonomy labels of this paper were **not** re‑audited — out of scope by instruction. With 2024 closed, all eight audited papers (2013–2017, 2022, 2023, 2024) carry a final answer audit, a machine‑readable record and a guard suite, and the remaining unaudited years are declared unaudited rather than presented as finished.
