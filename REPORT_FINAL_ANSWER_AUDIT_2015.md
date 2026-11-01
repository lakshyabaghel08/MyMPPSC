# MyMPPSC — Final Answer Accuracy Audit, 2015

**Scope:** every question of the 2015 Preliminary Paper‑I (`MPPSC-2015-P1`) in the bundled bank (`data/pyq/mymppsc-pyq-bank.json`).
**Question asked of every item:** would a learner be taught something false if they trusted this answer?
**Standing rule:** the printed key is evidence, not authority. An answer was kept because it survives independent subject reasoning, not because it appears in a key sheet — and it was not changed merely because a website disagreed with it.
**Machine‑readable record:** `data/pyq/quality-audit/final-answer-audit-2015.json` (one row per question, with its status and the basis for it).
**Not in scope:** 2013, 2014, 2016–2024. None of them was touched: the rebuild that produced this bank changed 100 records, all of them 2015, and the `papers` block is byte‑identical.

---

## 1. Headline counts (computed from the bank, not copied from earlier reports)

| Year | Reviewed | Confirmed (A) | Corrected (B) | Ambiguous / unresolved (C) |
|---|---|---|---|---|
| 2015 | 100 | 96 | 4 | 0 |
| **Total** | **100** | **96** | **4** | **0** |

96 + 4 + 0 = 100. The counts in `reviewed-corrections.json → final_audit_2015` and in the audit record are derived from the same rows, and `tests/answer-accuracy-2015.test.js` recomputes them and fails if they ever drift.

Printed keys were compared for all 100 questions (`printed_keys_compared = 100`); four of them disagree with the answer the evidence supports, and those four are listed in §2. The paper contains no app‑authored model question.

**Baseline before this pass:** not one of the 100 questions had per‑option reasoning; 7 had no explanation at all (004, 028, 054, 067, 068, 073, 099); the rest were single‑line restatements of the key (median 145 characters) such as "The Madhya Pradesh government has appointed actress Madhuri Dixit as the brand ambassador for its Mamta Abhiyaan" for question 005. Two were long scraped blocks (041 at 508 characters, 082 at 708). None of them tied its reasoning to the individual option texts.

---

## 2. Corrected answers (4)

Each correction is a case where the stored key contradicts a settled fact and another option, read as printed, is demonstrably right.

| Question | Stored → now | Basis |
|---|---|---|
| **MPPSC-2015-045** — *Who is the Chairman of Central Pollution Control Board?* | `A` President → **`D` None of the above** | The CPCB is a statutory body under the Water Act, 1974; its chairman is appointed by the **Central Government**, and no constitutional office‑holder (President, Vice‑President, Prime Minister) chairs it. The paper's own answer set offers "None of the above" as `D`, which the scan had corrupted to "Environment Minister"; that text was repaired back to "None of the above" before the key was changed. |
| **MPPSC-2015-054** — *The base of sustainable development is* | `A` → **`D` All of the above** | Sustainable development is defined by the Brundtland/UNCED consensus as resting on the **social, economic and environmental** pillars together, which is exactly what the inclusive option says. The scan had printed `D` as "None of the above", contradicting the option list; it was repaired to "All of the above" and the key moved with it. |
| **MPPSC-2015-080** — *Which was the first state to implement the 73rd Constitutional Amendment?* | `D` → **`A` Madhya Pradesh** | Madhya Pradesh enacted its Panchayati Raj Act in 1993 and received assent on 24 January 1994, making it the first state to bring the 73rd Amendment into force. The `D` answer depends on Rajasthan's 1959 Nagaur experiment, which belongs to the **pre‑amendment** panchayati raj scheme and cannot answer a question about implementing the 1993 amendment. |
| **MPPSC-2015-097** — *Who discovered penicillin?* | `B` → **`A` Alexander Fleming** | Fleming observed the penicillin mould in 1928. X‑rays, the `B` option, belong to Wilhelm Roentgen (1895) and are a different discovery altogether. |

Two of these (`045`, `080`) also carry a dispute block with `is_disputed: true, status: "resolved"`, so the record keeps the printed‑key conflict visible instead of silently overwriting it.

---

## 3. Ambiguous / unresolved answers (0)

Nothing in the 2015 paper had to be left hanging. Where the paper's wording was loose (053 on constitutional safeguards, which the paper reads with Article 17 in view) the prose states the narrower and broader reading and names the article that settles the item, rather than inventing a second defensible key. No question was forced to a letter it does not support, and no question was left unresolved for want of evidence.

---

## 4. Scan damage repaired (9 option texts across 7 questions)

Option text was changed **only** where the printed paper or the paper's own answer set makes the intended wording certain, and every repair is declared in `reviewed-corrections.json` so the rebuild can prove it did not drift from the source:

- **004** — `A` "P.J. Abdul Kalam" → "Vikram Seth" and `C` (empty) → "A.P.J. Abdul Kalam": the item asks who authored *Ignited Minds*, and the scan had put Kalam in `A` while leaving the correct slot `C` blank.
- **013** — `A` (empty) → "1825", `D` (empty) → "1830": the scan had lost the outer years of the 1825/1827/1829/1830 set for the Sati abolition question, whose answer is 1829.
- **036** — `A` (empty) → "B.R. Ambedkar".
- **044** — `A` (empty) → "D.D. Basu".
- **045** — `D` "Environment Minister" → "None of the above" (see §2).
- **054** — `D` "None of the above" → "All of the above" (see §2).
- **056** — `B` "J." → "J.C. Bose".

Stems, numbering and the remaining option texts were left exactly as printed, including the scan's "Ignitis Minds" in 004 and "Junko Taibei" in 090; those are noted in the prose rather than silently rewritten.

---

## 5. Items investigated specifically and left alone (no change justified)

- **004** — the authorship question keys `C`, which after the repair reads "A.P.J. Abdul Kalam"; the key stands.
- **005** — Madhuri Dixit as the Mamta Abhiyaan brand ambassador (`B`) is confirmed by contemporary reporting of the 2014 campaign launch.
- **013 / 018 / 096** — Sati was abolished in **1829** (`C`); Earth Day falls on **22 April** (`A`); earthquake intensity is read on a **seismograph** (`D`).
- **015 / 016 / 017** — Guru Angad Dev was the second Sikh Guru and Nanak's successor (`D`); Khusrau was Jahangir's son (`B`); the Wood's Despatch of 1854 is the "Magna Carta of English education" (`A`).
- **028** — Sikkim is the state bordering China, Nepal and Bhutan (`D`); Arunachal Pradesh touches China, Myanmar and Bhutan only in the wider reading of its frontiers, which the printed option set does not support.
- **032** — the Human Development Index rests on **health, education and standard of living** (`C`), not on employment; `A` is the trap that adds jobs.
- **053** — Article **17** (`D`) abolishes untouchability and is the paper's intended reading of the "rights of SC/ST" stem; other options are Article 18–20, which deal with titles, association and freedom of speech.
- **073 / 068** — Aishbagh Stadium is in **Bhopal** (`C`); the MPCA headquarters is in **Indore** (`B`).
- **086** — Madhya Pradesh as the first state to implement the 73rd Amendment (`A`) is the same fact that moved 080, and both records now agree.
- **089 / 090 / 093 / 094 / 095 / 099** — G.L. Yadav is the Arjuna awardee in **yachting** (`A`); **Junko Tabei** (`A`) was the first woman on Everest, with Tereshkova in `C` as the space‑flight trap; a microscope serves for "micro and nearby objects" (`D`); **O** is the universal donor group (`A`); milk density is read with a **lactometer** (`A`); and the 2013 Gandhi Peace Prize went to an **environmentalist**, Chandi Prasad Bhatt (`D`), presented in July 2014.
- **041 / 082** — the two long scraped explanations were replaced with question‑specific prose rather than trimmed, because the scraped text listed sections that had nothing to do with the option texts.

---

## 6. Explanation rebuild

All 100 explanations were rebuilt to the four‑part standard:

1. a short concept statement that answers the stem, written for that question only;
2. **four per‑option reasons**, each written against that option's own text — why it is right, or what specifically makes it wrong;
3. the revision facts a learner should carry away (dates, article numbers, office‑holders, units);
4. a one‑line takeaway.

No prose is shared between questions, no template sentence is reused, and the seven previously empty entries (004, 028, 054, 067, 068, 073, 099) are now indistinguishable in depth from the rest. Items whose explanation was already adequate in substance were rewritten only where the wording failed to engage the options; nothing was rewritten for style alone.

Quality gates run on the rebuilt data: `explanation-quality.test.js` (audited years 2015–2024, so 2015 cannot regress), and `answer-accuracy-2015.test.js`, which pins the four corrections, the two resolved disputes, seven confirmed anchors (004 `C`, 032 `C`, 036 `A`, 044 `C`, 075 `D`, 093 `D`, 099 `D`) and every option repair.

---

## 7. Verification performed

- **Clean rebuild** with the standard command (`--include-2013-2018 --apply-corrections --include-model-questions`, reports to a scratch directory): **1,200 questions / 12 papers**, `32 key(s), 47 option(s), 971 explanation(s), 34 dispute(s) applied — 0 rejected, reconciled: true`; validator `ok` with 48 warnings, none new.
- **Year isolation:** diffing the rebuilt bank against its pre‑audit snapshot gives **100 changed questions, all `MPPSC-2015-*`, 0 non‑2015**, and the `papers` block is byte‑identical. No 2016 or earlier‑audited year moved.
- **`npm test`** — 391 tests, all passing.
- **`npm run check`** — 1,075 checks, passing.

Nothing above is claimed from inspection alone: every count in §1 is recomputed from `data/pyq/mymppsc-pyq-bank.json` by the test suite, and the rebuild was re‑run after the last data edit.
