# MyMPPSC — Final Answer Accuracy Audit, 2022

**Scope:** every question of the 2022 Preliminary Paper‑I (`MPPSC-2022-P1`) in the bundled bank (`data/pyq/mymppsc-pyq-bank.json`).
**Question asked of every item:** would a learner be taught something false if they trusted this answer?
**Standing rule:** the printed key is evidence, not authority. An answer was kept because it survives independent subject reasoning, not because it appears in a key sheet — and it was not changed merely because a website disagreed with it.
**Machine‑readable record:** `data/pyq/quality-audit/final-answer-audit-2022.json` (one row per question, with its status and the basis for it).
**Not in scope:** every other year. The rebuild that produced this bank changed 100 records, all of them 2022, and the `papers` block is byte‑identical.

---

## 1. Headline counts (computed from the bank, not copied from earlier reports)

| Year | Reviewed | Confirmed (A) | Corrected (B) | Ambiguous / unresolved (C) |
|---|---|---|---|---|
| 2022 | 100 | 94 | 6 | 0 |
| **Total** | **100** | **94** | **6** | **0** |

94 + 6 + 0 = 100. The counts in `reviewed-corrections.json → final_audit_2022` and in the audit record are derived from the same rows, and `tests/answer-accuracy-2022.test.js` recomputes them and fails if they ever drift.

Five of the six corrections are the keys this paper already carried from the earlier 2021–2024 pass; they were re-derived here, kept, and are now listed in this paper's own audit record instead of only in the multi-year summary. The sixth is new: the two-answer key of 045, narrowed to the paper's single printed answer.

Printed keys were compared for all 100 questions (`printed_keys_compared = 100`).

**Baseline before this pass:** every question already had four option rows, but only **six** questions had reasoning that rose above restating the option; the other 94 carried at least one one-clause entry such as "Correct: …". The `correct_reasoning` paragraphs were machine-shaped rather than question-specific (median 174 characters, longest 721) and there was no per-option engagement with the distractor texts that this paper actually uses.

---

## 2. Corrected answers (6)

| Question | Stored → now | Basis |
|---|---|---|
| **MPPSC-2022-045** — *Buddhist caves are not situated in which of the following place?* | `C`, `D` → **`D`** | Ajanta and Bagh are Buddhist cave complexes, so a cave question cannot point at them. The paper keys **Bulsar (Valsad)** alone; the stored record carried Sanchi as well. Sanchi is a stupa and monastery site, but the paper's own answer set names one option, so the single printed key is restored. The residual looseness — Bulsar has no caves either, and Sanchi's hills are not a cave complex — is recorded as an **unresolved dispute**, not smoothed away. |
| **MPPSC-2022-003** — *Who is known as the father of Artificial Intelligence?* | `D` Dartmouth → **`B` John McCarthy** | Dartmouth is a college that hosted the 1956 workshop; McCarthy coined the term "artificial intelligence" and organised that workshop. |
| **MPPSC-2022-018** — *Lifetime Dronacharya Award for Hockey, 2020* | `B` Jude Felix Sebastian → **`C` Romesh Pathania** | The lifetime award for 2020 went to **Romesh Pathania**; Jude Felix received the regular Dronacharya in the same year, which is why the two names are so easily swapped. |
| **MPPSC-2022-053** — *NHRC statements (i) and (ii)* | `C`, `D` → **`D`** | Section 12 of the Protection of Human Rights Act gives the NHRC both the power to encourage organisations working in human rights **and** the function of research, and neither statement explains the other, so the combined option alone is right. |
| **MPPSC-2022-083** — *Which statement about iron ore in Madhya Pradesh is not correct?* | `D` → **`A`** | MP does not rank third in iron ore production; Odisha, Karnataka and Chhattisgarh are far ahead. The other three statements (haematite in north-eastern Jabalpur, high silica and mica, reserves lost to Chhattisgarh in 2000) are all true, so the false statement is A. |
| **MPPSC-2022-090** — *Which river made a deep gorge between the Akhrani and Mathwar hills?* | `A` Chambal → **`D` Narmada** | The gorge between the Akhrani and Mathwar hills belongs to the **Narmada** in its middle course near Jabalpur, the belt that also carries the Bhedaghat marble rocks; the Chambal drains the northern ravines and never reaches these hills. |

The five earlier corrections keep their original bases in `reviewed-corrections.json`; the audit record now quotes the printed key for each of them (`from`) beside the corrected key (`to`).

---

## 3. Dispute left open (1)

| Question | Status | Why it is not closed |
|---|---|---|
| **MPPSC-2022-045** — *Buddhist caves are not situated in which place?* | `unresolved` | The paper's single key is Bulsar, but Sanchi — the third option — is also not a Buddhist cave complex, only a stupa and monastery site, and Bulsar itself has no caves. The key is applied as printed, and the question is recorded as admitting more than one defensible answer rather than being declared settled. |

---

## 4. Scan damage

This pass found **no new damaged option text** in the paper. The five repairs the earlier 2021–2024 pass had already declared (026 "Satpura National Park 3", 055 "Article 328 1", 077 a sentence rotated inside the option, 086 a truncated sentence, 099 a stray glyph pair) are still in force and are now pinned by the 2022 test.

---

## 5. Items investigated specifically and left alone (no change justified)

| Question | Why the printed answer was kept |
|---|---|
| **009** — *diode used in ultra-high-speed switching circuits* | **Tunnel diode.** Tunnelling gives picosecond switching and negative resistance; the Schottky diode is a fast rectifier and is the plausible distractor, not the answer. |
| **022** — *Bhagirath Silawat, Saadat Khan and Vansh Gopal were associated with which place?* | **Indore.** Saadat Khan, a Holkar cavalry officer, led the 1 July 1857 attack on the Indore Residency with Bhagirath Silawat and Vansh Gopal. |
| **068** — *The 91st Amendment provides …* | **Ceiling on the size of the Council of Ministers** (15 per cent, minimum twelve in states). The 2026 freeze on seats belongs to the 84th Amendment and the SC/ST commission split to the 89th. |
| **074** — *highest population growth by state, Census 2011* | **Meghalaya**, about 27.9 per cent, ahead of Bihar and Arunachal Pradesh; Punjab grew slowest of the four. |
| **096** — *How many times has President's Rule been imposed in MP?* | **Three**: 1977, 1980 and 1992. |
| **098** — *first Chief Minister of Madhya Pradesh* | **Ravishankar Shukla**, who took office when the state was reorganised on 1 November 1956. |
| **082, 093, 100** | The Sukta project is not in Betul (which is what makes that pair wrong), Ladli Bahna began at Rs 1,000 a month, and Sarla Grewal was MP's first woman Governor. |

---

## 6. Explanation rebuild

All 100 explanations were rebuilt to the four‑part standard used for the years already audited:

1. a `correct_reasoning` paragraph that states the fact and why the key follows from it, naming the distractor logic where the paper relies on it;
2. **four per‑option reasons**, each tied to that option's own text, with no reason restating its option and no sentence reused between questions;
3. `key_concepts` — two or three named concepts a learner should be able to recall;
4. `revision_takeaways` — one or two standing facts.

Examples of what the rebuild repaired: 2022‑009 now explains why tunnelling decides the diode question instead of naming the device; 2022‑082 states which pair is wrong and what makes the others right; 2022‑093 dates the Rs 1,000 figure and notes the later enhancement, so the learner is not taught a superseded number; 2022‑045 states the paper's key and the residual objection in the same paragraph rather than hiding either.

Three questions of this paper (004, 019, 084) are app‑authored model questions without a printed key; their explanations live in `data/pyq/model-questions.json`, were rebuilt to the same standard in this pass, and are therefore not listed in `narrative_rewritten`, which records only printed‑paper rewrites.

---

## 7. Verification performed

| Check | Result |
|---|---|
| `npm test` | **418 tests, 418 pass, 0 fail** |
| `npm run check` | **all 1075 checks pass** |
| Clean rebuild (`tools/classify-bank.mjs --apply-corrections …`) | 1,200 questions / 12 papers; validator **ok**, 0 errors; 37 keys corrected, 60 option texts repaired, 1,171 explanations restored, 39 dispute blocks restored (44 declared) |
| Year isolation | rebuild diff against the committed bank: **100 records changed, all 2022, 0 in any other year**; `papers` byte‑identical |
| Determinism | a second clean rebuild reproduces the same bank (covered by `tests/rebuild-corrections.test.js`) |
| New suite | `tests/answer-accuracy-2022.test.js` — 8 tests recomputing the counts, checking answer/flag agreement, the six declared corrections, the narrowed 045 key and its open dispute, the five inherited option repairs, and the 100‑question completeness declaration |

Known limitation: the taxonomy labels of this paper were **not** re‑audited, and 2023–2024 still owe per‑option reasoning; those years remain declared incomplete rather than presented as finished.
