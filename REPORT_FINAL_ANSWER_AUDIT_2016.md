# MyMPPSC — Final Answer Accuracy Audit, 2016

**Scope:** every question of the 2016 Preliminary Paper‑I (`MPPSC-2016-P1`) in the bundled bank (`data/pyq/mymppsc-pyq-bank.json`).
**Question asked of every item:** would a learner be taught something false if they trusted this answer?
**Standing rule:** the printed key is evidence, not authority. An answer was kept because it survives independent subject reasoning, not because it appears in a key sheet — and it was not changed merely because a website disagreed with it.
**Machine‑readable record:** `data/pyq/quality-audit/final-answer-audit-2016.json` (one row per question, with its status and the basis for it).
**Not in scope:** 2013–2015, 2017, 2018, 2019, 2020 and 2021–2024. None of them was touched: the rebuild that produced this bank changed 100 records, all of them 2016, and the `papers` block is byte‑identical.

---

## 1. Headline counts (computed from the bank, not copied from earlier reports)

| Year | Reviewed | Confirmed (A) | Corrected (B) | Ambiguous / unresolved (C) |
|---|---|---|---|---|
| 2016 | 100 | 97 | 0 | 3 |
| **Total** | **100** | **97** | **0** | **3** |

97 + 0 + 3 = 100. The counts in `reviewed-corrections.json → final_audit_2016` and in the audit record are derived from the same rows, and `tests/answer-accuracy-2016.test.js` recomputes them and fails if they ever drift.

Printed keys were available for all 100 questions (`printed_keys_compared = 100`), and all 100 stored answers agree with the printed paper; the paper contains no app‑authored model question.

**Baseline before this pass:** 0 of the 100 questions had per‑option reasoning; 9 had no explanation worth the name (004, 013, 044, 056, 057, 059, 066, 068, 079) and the rest were single‑line statements of the key (median 117 characters) such as "Barren Island … is the only confirmed active volcano in India" for question 005. Several were scraped blocks carried over from the source site (065 ran to 1,065 characters of section lists, 084 to 841). None of them tied its reasoning to the individual option texts, and none discussed why the wrong options are wrong.

---

## 2. Corrected answers (0)

No printed key was contradicted by the evidence. The printed paper and the stored bank agree on all 100 items, and every key survived independent subject reasoning:

- **001** — Bangladesh (about 4,097 km) is India's longest land frontier, ahead of China, Pakistan and Nepal.
- **012** — the Chambal badlands of Madhya Pradesh are cut by **gully erosion** in soft alluvium, which is why `A` beats sheet, wind and overgrazing explanations.
- **051** — Indore district (32,76,697 in 2011) is the most populous district, ahead of Bhopal and Jabalpur.
- **069 / 071 / 073** — Dhupgarh and Pachmarhi both sit in the **Mahadeo Hills**, and the Dhuandhar Falls at Bhedaghat is on the **Narmada**, all as keyed.
- **086** — Sher Shah Suri's mausoleum is at **Sasaram**, while **Kalinjar** is the fort where he died in 1545; the distinction is stated in the option reasons.
- **095** — football entered the Olympics at **Paris 1900**; the 1908 London tournament was the first with national teams, which is why `B` is the near‑miss distractor.
- **098** — the untrue statement about the 1894 Act is `B`, since it was a colonial acquisition law and not a land‑reform instrument.

---

## 3. Ambiguous / unresolved answers (3) — preserved as uncertain, not forced

| Question | Stored answer | Why it cannot be settled |
|---|---|---|
| **MPPSC-2016-026** — *The formal and real beginning of Five‑Year Plans is said to have started in Madhya Pradesh from* | `D` — 11th November, 1956 | The paper dates the real beginning of state planning to the day the reorganised state came into being, and `D` is that date. Standard MP economy texts instead treat the **Third Five‑Year Plan (1961‑66)** as the first plan period of the reorganised state, since the First and Second Plans ran before or across the 1956 reorganisation. `A` is therefore equally defensible, and the conflict is stated in the prose rather than hidden. |
| **MPPSC-2016-032** — *Who was the protagonist of Chipko Movement?* | `C` — Sunderlal Bahuguna | Bahuguna is the movement's public voice and the figure most sources name, so `C` is retained. **Chandi Prasad Bhatt** led the Dasholi Gram Swarajya Mandal that organised the first Chipko protests in 1973, and **Gaura Devi** led the Reni action of 1974, so `D` is defensible too. The leadership is genuinely shared. |
| **MPPSC-2016-054** — *The objective/objectives of Pradhan Mantri Gram Sadak Yojana is/are* | `C` — Both (A) and (B) | PMGSY's stated objective is **all‑weather road connectivity**, which is option `A` in substance; option `B` says "concrete road", which no PMGSY guideline requires. The paper reads the objective as covering both, and `C` is retained as keyed, but `A` matches most official formulations and the loose wording is flagged. |

Each carries an `unresolved` dispute block in `data/pyq/reviewed-disputes.json` and in the bank, and each explanation states the conflict in the prose a learner actually reads.

---

## 4. Items investigated specifically and left alone (no change justified)

Every one of these was checked during this pass, most of them against a fetched source:

- **005 / 069 / 070** — Barren Island is India's only active volcano (`A`); Dhupgarh (about 1,350 m) is the state's highest point in the Mahadeo Hills (`A`); the **Kaimur** range is the Yamuna–Son divide, while the Bhander range separates the Ganga from the Narmada (`B`).
- **026** — the MP date, discussed in §3.
- **031** — *Jal Purush* is **Rajendra Singh** of Tarun Bharat Sangh. The option prints the surname as "Rajendra Choudhary", which is a misprint in the paper; `B` is still the Rajendra option and the answer is unaffected. The option text was **not** altered, because the printed paper reads the same way and the truth of the item does not depend on it.
- **039** — Spain has never been a member of the G‑8 (`C`); Russia was a member from 1998 until its 2014 suspension, which is why `A` is a trap rather than the answer.
- **044** — the 2017 ISSF World Cup in rifle and pistol events was allotted to **New Delhi** (`C`).
- **046 / 048** — the Supreme Court called the **CBI** a caged parrot in 2013 (`C`); MGNREGA was passed in **2005** and came into force in 2006 (`B`).
- **049** — the Gold Export Promotion Park is at **Indore** (`A`).
- **053** — Madhya Pradesh's first **Mineral Policy** was declared in **1995** (`A`); the revision came in 2010.
- **065 / 066 / 067 / 068** — Rule **17** of the SC/ST (PoA) Rules 1995 provides the District‑level Vigilance and Monitoring Committee (`C`); **Section 6** applies selected IPC provisions (`C`); **Section 23** gives the rule‑making power to the Central Government (`B`); **Section 18** bars anticipatory bail (`C`).
- **074** — the Chambal valley is placed in the **Central India Plateau** division of the state's physiography (`C`).
- **078 / 083** — the Kanha Baba fair is held at **Sodalpur**, a village of Harda district that stands in the Hoshangabad–Harda region (`B`); Jhabua records the highest tribal proportion at **86.8 per cent** (`A`).
- **079** — the Udayagiri caves are in **Vidisha** district (`B`).
- **087 / 092 / 093** — **Samarth Ramdas** was Shivaji's guru (`A`); **Andhra Pradesh** (1 October 1953) was the first linguistic state (`B`); **Nicolo Conti** was the Venetian traveller to Vijayanagar (`B`).
- **090** — Balwant Rai Mehta (1957) recommended the **three‑tier** structure; the two‑tier proposal is Ashok Mehta's of 1978.
- **099 / 100** — NITI Aayog is chaired by the **Prime Minister** (`A`); **Section 2(m)** of the Protection of Human Rights Act 1993 defines "public servant" (`D`).

---

## 5. Explanations rebuilt (100 of 100)

All 100 explanations were **rewritten to the four‑part standard** used in the 2017–2021 audits:

1. a short concept paragraph that justifies the keyed option on the facts, not by repeating the key;
2. one reasoned row per option, quoting that option's own text and explaining why it is or is not the answer;
3. two to four `key_concepts` a learner should carry away;
4. a one‑line `revision_takeaways` note.

No template or shared boilerplate was used: every paragraph is written for its own question, and `tests/explanation-quality.test.js` now includes 2016 in the audited set, so a question whose reasoning does not discuss its own subject matter, or whose four option rows repeat one another, fails the suite.

Prose that survived in the intake was not retained where it was thin or wrong. The 9 questions with no usable explanation were written from scratch, and the long scraped blocks (065, 084, 088, 091, 097) were replaced by concept‑level reasoning tied to the options — for example 065 now explains why Rule 17 is the district committee and Rule 19 the state committee, instead of pasting the rule list.

---

## 6. Option‑text repairs (6 repairs across 4 questions)

Repairs were made only where the printed paper makes the intended wording certain, and each is declared in `reviewed-corrections.json → option_corrections` with the exact before/after text:

| Question | Option | Printed (as captured) | Repaired | Why |
|---|---|---|---|---|
| **004** | B | `III, 1, IV, II` | `III, I, IV, II` | The Roman numeral I was captured as the digit 1; the stem uses `I, II, III, IV` |
| **004** | C | `1, III, IV, II` | `I, III, IV, II` | Same digit/numeral confusion, in the keyed option |
| **004** | D | `III, IV, I, II Rank State Area (km2) 1 Rajasthan 342,239 … 10 Tamil Nadu 130,058` | `III, IV, I, II` | The answer table from the source page was captured into the option text |
| **006** | B | `Sericulture.` | `Sericulture` | Stray full stop from the line end |
| **022** | B | `kilocaloric` | `kilocalorie` | Scan error for the unit of heat |
| **079** | A | `Raisen'` | `Raisen` | Stray apostrophe from the stem's closing quote |

No option was added, removed, reordered or reworded beyond these repairs, and no question stem was rewritten.

**Scan debris deliberately left as printed.** Fourteen 2016 stems carry an unbalanced quotation mark where the opening `'` was lost in the scan — 013 (`Central Ganga Authority'`), 017 (`'noble gas?`), 036, 045, 046, 061, 065, 069, 071, 078, 081 (`Lohasur'`), 087, 094 (`'Mecca of Cricket?`) and 100 (`Public Servant'`). The words themselves are intact and unambiguous, no answer or explanation depends on them, and the source file reproduces the same defect, so the stems were left alone rather than rewritten on inference. They are recorded here so the next pass does not have to rediscover them.

The source file also renders the population options of **050** with a hyphen where the decimal point belongs (`7-2 crores`); the digits are unambiguous and the option text was left as printed.

---

## 7. Dispute‑flag bookkeeping

`data/pyq/reviewed-disputes.json` gained **3** blocks (026, 032, 054), all `unresolved`, each with a reason of more than 40 characters naming the conflict. Total disputes in the file: **37** (34 before this pass). 32 blocks apply to shipped questions and 5 remain deferred to the app‑authored model questions, which is why the pipeline reports "32 dispute block(s) applied" against 37 declared — the same behaviour as before this pass, and the reconciliation reports `true` for every correction kind.

---

## 8. Remaining answer/explanation contradictions

None known in 2016. Every stored answer agrees with its own option correctness flags, and no explanation names a letter that the stored answer excludes (`tests/answer-accuracy-2016.test.js` enforces both). For the ambiguous items the conflict is carried in the prose and in a dispute block, so the runner‑up option is described as defensible rather than as wrong.

---

## 9. Validation

| Check | Result |
|---|---|
| Verified rebuild (`node tools/classify-bank.mjs … --apply-corrections --include-model-questions`) | 1,200 questions / 12 papers; **28 keys / 38 option repairs / 871 explanations / 32 disputes applied**, 0 rejected, `reconciled: true` |
| Bank validator | `ok` — fatal 0, errors 0, rejected 0, warnings 51 (48 before; the three new warnings are the three new disputed keys, one warning each) |
| Bank diff against the previous commit | **100 records changed, all `MPPSC-2016-*`**; `papers` and `app_compatibility` byte‑identical; question count 1,200 → 1,200 |
| `npm test` | **383 / 383 pass** (375 before this pass; the 8 new tests are `answer-accuracy-2016.test.js`) |
| `npm run check` | **All 1,075 checks passed** |

One test‑side fix was needed and is included: `tests/pyq-bank.test.js` reconstructed the printed option text of the 2013–2018 papers assuming every historical source file labels its options `label`, while the 2016 file uses `key`. The repair‑provenance assertion therefore read `undefined` for 2016 and would have accepted any declaration. It now normalises `key ?? label`, so the assertion actually checks the printed text for 2016 as it already did for 2017 and 2018. No data or decision changed because of it.

---

## 10. Files changed

- `data/pyq/reviewed-explanations.json` — 100 new 2016 entries, `final-answer-audit-2016.json` added to `source_audits`
- `data/pyq/reviewed-corrections.json` — 4 new `option_corrections` blocks (6 repairs), 100 ids added to `narrative_rewritten` and `option_reasoning_complete`, new `final_audit_2016` summary block, no new answer correction
- `data/pyq/reviewed-disputes.json` — 3 new unresolved blocks
- `data/pyq/quality-audit/final-answer-audit-2016.json` — new: 100 rows with status, printed key, answer and note
- `data/pyq/mymppsc-pyq-bank.json` — regenerated (100 changed 2016 records)
- `tests/answer-accuracy-2016.test.js` — new suite (8 tests)
- `tests/explanation-quality.test.js` — 2016 added to the audited set, with a 100‑question coverage assertion
- `tests/rebuild-corrections.test.js` — restored‑explanation count raised to 871
- `tests/pyq-bank.test.js` — printed‑option normalisation fixed for the 2016 source's `key`/`label` difference
- `docs/PYQ_AUDIT.md` — 2016 entry added

---

## 11. Known limitations (stated, not hidden)

- **Taxonomy mis‑tags were left untouched.** This pass audited answers and explanations only. Re‑tagging is a separate task with its own review burden and was deliberately not mixed into this audit.
- **The corpus has no independent key file for 2016.** Verification rests on subject reasoning plus published sources for the specific facts cited; where sources genuinely conflict (026, 032) or the paper's own wording undercuts the key (054), the item is flagged rather than "fixed".
- **The printed surname in 031 is wrong.** *Jal Purush* is Rajendra Singh, and the paper prints "Rajendra Choudhary". The answer is still `B`; the option text is left as printed because the misprint is in the paper and rewriting it would invent a person the paper never offered.
- **Stem quotation marks remain unbalanced in fourteen questions** (§6). They are cosmetic, the source reproduces them, and repairing them would be inference rather than evidence.
- **2013–2015 still owe per‑option reasoning.** They remain outside `option_reasoning_complete` and are the remaining work in the 2013–2018 block.

---

## 12. Stop point

2016 is complete: 100 of 100 questions reviewed, no key corrected, 3 recorded as ambiguous, all 100 explanations rebuilt, 6 option‑text repairs declared, disputes and audit records written, the rebuild deterministic, the bank diff confined to 2016, and both the test suite and the static checks green.

No other year was modified, and no pull request was merged. The work is on `arena/54799d16-mymppsc` with PR #27 updated and left open, pending review.
