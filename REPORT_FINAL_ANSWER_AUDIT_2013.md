# MyMPPSC — Final Answer Accuracy Audit, 2013

**Scope:** every question of the 2013 Preliminary Paper‑I (`MPPSC-2013-P1`) in the bundled bank (`data/pyq/mymppsc-pyq-bank.json`).
**Question asked of every item:** would a learner be taught something false if they trusted this answer?
**Standing rule:** the printed key is evidence, not authority. An answer was kept because it survives independent subject reasoning, not because it appears in a key sheet — and it was not changed merely because a website disagreed with it.
**Machine‑readable record:** `data/pyq/quality-audit/final-answer-audit-2013.json` (one row per question, with its status and the basis for it).
**Not in scope:** every other year. The rebuild that produced this bank changed 100 records, all of them 2013, and the `papers` block is byte‑identical.

---

## 1. Headline counts (computed from the bank, not copied from earlier reports)

| Year | Reviewed | Confirmed (A) | Corrected (B) | Ambiguous / unresolved (C) |
|---|---|---|---|---|
| 2013 | 100 | 98 | 1 | 1 |
| **Total** | **100** | **98** | **1** | **1** |

98 + 1 + 1 = 100. The counts in `reviewed-corrections.json → final_audit_2013` and in the audit record are derived from the same rows, and `tests/answer-accuracy-2013.test.js` recomputes them and fails if they ever drift.

Printed keys were compared for all 100 questions (`printed_keys_compared = 100`).

**Baseline before this pass:** not one of the 100 questions had per‑option reasoning; 7 had no explanation at all (016, 039, 050, 051, 056, 073, 088) and 6 more carried a fragment under 40 characters (008, 011, 026, 029, 049, 074); the rest were one‑line restatements of the key at a median of 94 characters. One question shipped with an **empty option text** (061) and one with an option reduced to a single letter (087). The extraction also truncates two stems (011 and 100); those are left as printed and explained in the prose rather than rewritten, because the paper's own wording cannot be recovered from the file with certainty.

---

## 2. Corrected answer (1)

| Question | Stored → now | Basis |
|---|---|---|
| **MPPSC-2013-073** — *Which is the longest National Highway of India?* (options: NH 1, NH 2, NH 8, NH 7) | `A` NH 1 → **`D` NH 7** | Before the 2010 renumbering, **NH 7 ran from Varanasi to Kanyakumari for about 2,369 km and was the longest national highway in India**; that stretch is now part of NH 44. NH 1, Delhi to Amritsar, is about 456 km. NH 2 (Delhi–Kolkata, ~1,465 km) and NH 8 (Delhi–Mumbai, ~1,428 km) are also far shorter. The printed key cannot be reconciled with the record, and the correct option is present, so the answer is corrected. |

The item also carries a dispute block with `status: "resolved"`, so the conflict between the printed key and the verification stays visible in the data.

---

## 3. Ambiguous item left flagged (1)

| Question | Stored | Why it is not decided |
|---|---|---|
| **MPPSC-2013-098** — *International Decade for Natural Disaster Reduction (IDNDR) is:* (1991‑2000 / 1981‑1990 / 2001‑2010 / 2011‑2020) | `A` 1991‑2000, **kept** | The UN General Assembly declared the IDNDR for **1990‑1999** (resolution 44/236, December 1989). **No option states that span.** Option A overlaps the real decade by nine years and is the closest available, so it is retained and the defect is recorded as `status: "ambiguous"` plus an `unresolved` dispute. Inventing a 1990‑1999 option, or re‑keying to a clearly wrong decade, would both teach something false. |

---

## 4. Scan damage repaired (3 option texts across 2 questions)

Option text was changed **only** where the printed paper makes the intended wording certain, and every repair is declared in `reviewed-corrections.json → option_corrections`:

| Question | Slot | Printed | Restored | Support |
|---|---|---|---|---|
| 061 — *'National Planning Committee' was set up by:* | A | `Dalal` | `Jawaharlal Nehru` | The paper's option set is Nehru, A. Dalal, Subhash Chandra Bose, Lal Bahadur Shastri; the scan merged the first name into the second slot. |
| 061 | B | *(empty)* | `A. Dalal` | Same option set; the slot is blank in the extraction, not in the paper. |
| 087 — *Who organized the gadar party?* | A | `V.` | `V.D. Savarkar` | The paper reads V.D. Savarkar; only the initial survived the scan. |

Neither repair touches a key: 061 remains `C` (see §5) and 087 remains `D`.

---

## 5. Items investigated specifically and left alone (no change justified)

| Question | Why the printed answer was kept |
|---|---|
| **020** — *which is absolutely barred under the SC/ST (Prevention of Atrocities) Act, 1989?* | Section 18 bars **anticipatory bail** absolutely; section 19 separately bars probation, but only for a person **above eighteen** found guilty. Option A is therefore right, and the prose states the age limit so the bar is not overstated. |
| **031** — *Akashvani Kendra, Indore, was started on* | **22 May 1955** (All India Radio's own record). Some secondary sites print 24 May 1955; the station's recorded date and the paper's key agree, and the prose names the conflict instead of hiding it. |
| **050** — *which country won the men's hockey World Cup for the third time?* | **Australia** (1986, 2002, 2010). Pakistan had four titles and the Netherlands three by 1998, but the reference point of the question — the latest champion, 2010 at Delhi — is Australia's third. |
| **058** — *which instrument is not of Indo‑Islamic origin?* | **Shehnai**, a double‑reed of the temple and wedding tradition, unlike the sitar, tabla and sarangi of the Indo‑Persian courts. One question‑answer site offers "sarangi"; it is wrong. |
| **061** — *'National Planning Committee' was set up by* | **Subhash Chandra Bose**. The Committee was constituted in 1938 by the Congress president, Bose, who then had Nehru chair it; the question asks who *set it up*, so option C stands even after the option repair that restores Nehru to slot A. |
| **064** — *which is included in 'Navratna'?* | **Bharat Electronics Limited**. Coal India, GAIL and BHEL have since been raised to Maharatna, which is exactly why they are the distractors. |
| **088** — *which act abolished the Company's monopoly of trade in tea?* | **Charter Act 1833**. The 1813 Act ended the general Indian trade monopoly but expressly kept tea and the China trade, which 1833 abolished. The question names tea, so the later Act is the answer. |
| **046** — *weight of a cricket ball* | Option A (159.9–163 g) is the paper's statement of the law's 155.9–163 g range and is the only option near it. |
| **062, 063, 092** | India is the third largest fertiliser producer and consumer; China is the largest source of India's imports; the Pradhan Mantri Bharat Jodo Pariyojana belonged to highway development and was never approved as a separate scheme. All three keys hold. |

---

## 6. Explanation rebuild

All 100 explanations were rewritten to the four‑part standard used for the years already audited, and the completeness manifest `option_reasoning_complete` now covers every 2013 question:

1. a `correct_reasoning` paragraph that states the fact and why the key follows from it (the shortest is well over 140 characters, the longest about 700);
2. **four per‑option reasons**, each tied to that option's own text — no reason restates its option, and no template sentence is reused across questions;
3. `key_concepts` — two or three named concepts a learner should be able to recall;
4. `revision_takeaways` — one or two standing facts.

The rewritten prose also removes the errors the scraped text carried. Examples: 2013‑007 now explains Article 24 of the ICCPR as the child‑rights clause rather than merely naming the number; 2013‑042 states the 18 July 1946 founding of the Sagar university; 2013‑073 explains the pre‑2010 numbering instead of asserting NH 1; 2013‑098 states the real 1990‑1999 decade and says why option A is only the nearest; 2013‑010 and 2013‑028 correct spelling debris in the option text inside the reasoning rather than in the data.

---

## 7. Verification performed

| Check | Result |
|---|---|
| `npm test` | **410 tests, 410 pass, 0 fail** |
| `npm run check` | **all 1075 checks pass** |
| Clean rebuild (`tools/classify-bank.mjs --apply-corrections …`) | 1,200 questions / 12 papers; validator **ok**, 0 errors; 36 keys corrected, 60 option texts repaired, 1,171 explanations restored, 39 dispute blocks restored (44 declared) |
| Year isolation | rebuild diff against the committed bank: **100 records changed, all 2013, 0 in any other year**; `papers` byte‑identical |
| Determinism | a second clean rebuild reproduces the same bank (covered by `tests/rebuild-corrections.test.js`) |
| New suite | `tests/answer-accuracy-2013.test.js` — 9 tests recomputing the counts from the rows, checking answer/flag agreement, the declared correction and repairs, the resolved and open disputes, and the 100‑question completeness declaration |

Known limitation: the taxonomy labels attached to the source extraction (for example 2013‑079, a Shiwalik question, carrying the topic "Physiography of Madhya Pradesh") were **not** re‑audited, because this pass is confined to answers and explanations. Every question has exactly one explanation record and one answer; no other year's file was modified.
