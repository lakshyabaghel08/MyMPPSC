# MyMPPSC — Final Answer Accuracy Audit, 2014

**Scope:** every question of the 2014 Preliminary Paper‑I (`MPPSC-2014-P1`) in the bundled bank (`data/pyq/mymppsc-pyq-bank.json`).
**Question asked of every item:** would a learner be taught something false if they trusted this answer?
**Standing rule:** the printed key is evidence, not authority. An answer was kept because it survives independent subject reasoning, not because it appears in a key sheet — and it was not changed merely because a website disagreed with it.
**Machine‑readable record:** `data/pyq/quality-audit/final-answer-audit-2014.json` (one row per question, with its status and the basis for it).
**Not in scope:** 2013 and 2015–2024. None of them was touched: the rebuild that produced this bank changed 100 records, all of them 2014, and the `papers` block is byte‑identical.

---

## 1. Headline counts (computed from the bank, not copied from earlier reports)

| Year | Reviewed | Confirmed (A) | Corrected (B) | Ambiguous / unresolved (C) |
|---|---|---|---|---|
| 2014 | 100 | 97 | 3 | 0 |
| **Total** | **100** | **97** | **3** | **0** |

97 + 3 + 0 = 100. The counts in `reviewed-corrections.json → final_audit_2014` and in the audit record are derived from the same rows, and `tests/answer-accuracy-2014.test.js` recomputes them and fails if they ever drift.

Printed keys were compared for all 100 questions (`printed_keys_compared = 100`). This paper's extraction is the weakest of the 2013–2018 set: it shipped **six questions with an empty option text** (004, 027, 035, 041, 055, 061), **three stems with an option pasted into the stem** (027, 035, 041), and several mangled options (`W\.`, `R. Ambedkar` for Sardar Patel). Those are repaired in §3, and the repairs are what make the keyed answers checkable against their own text.

**Baseline before this pass:** not one of the 100 questions had per‑option reasoning; 5 had no explanation at all (003, 036, 073, 076, 097); the rest were one‑line restatements of the key (median 114 characters), such as "All India Muslim League was established by Aga Khan in Dhaka in 1906" for 015, which states the key without engaging the other three options.

---

## 2. Corrected answers (3)

| Question | Stored → now | Basis |
|---|---|---|
| **MPPSC-2014-001** — *Under which 'Five year Plan' was the decision to establish a socialistic pattern of society taken?* | `D` IV Plan → **`B` II Plan** | The Congress adopted the socialistic pattern of society at the **Avadi session in 1955**, and it became the stated objective of the **Second Five year plan** (1956‑61), built on the Mahalanobis model of heavy industry. The Fourth Plan (1969‑74) worked for growth with stability. The printed key is a misreading of the record, not a matter of interpretation. |
| **MPPSC-2014-065** — *Who is not a member of the committee for the appointment of chairperson and members of the NHRC?* | `B` Chairman of the Council of States → **`D` Leader of the Opposition in the Council of States** | Under the Protection of Human Rights Act as it stood for this paper, the committee was the **Prime Minister, the Speaker, the Home Minister, the Leader of the Opposition in the Lok Sabha and the Chairman of the Council of States**. The Chairman of the Rajya Sabha was therefore a member, and the Leader of the Opposition in the Rajya Sabha was not: he was added only by the **2019 amendment**. Option `B` cannot be right in either regime, so the key could not stand. The prose states the 2019 change so a learner is not taught a superseded fact. |
| **MPPSC-2014-069** — *Offence committed by any public servant under section 3 of the SC/ST (Prevention of Atrocities) Act, 1989 provides for minimum punishment of* | `C` one year → **`B` six months** | Section 3 punishes a public servant who wilfully neglects his duties with imprisonment of **not less than six months, extendable to one year**. The stored key is the **ceiling**; the question asks for the **minimum**. |

Two items carry a dispute block as well as the correction (`065`, and `032`, where the park is officially the "Mandla Plant Fossils National Park" although its villages lie in Dindori district, which is not among the options). Both are recorded `status: "resolved"` so the conflict stays visible in the data instead of being overwritten.

---

## 3. Scan damage repaired (10 option texts across 6 questions)

Option text was changed **only** where the printed paper or the paper's own option set makes the intended wording certain, and every repair is declared in `reviewed-corrections.json`:

- **004** — `A` (empty) → "L.K. Advani": the option list was lost from the scan; the printed paper's A is Advani, which is what makes the keyed `Vajpayee` answer meaningful.
- **027** — `A` (empty) → "sikkim": the stem itself carries the pasted option text "…in India isA. sikkim", so the option is recovered from the paper's own debris.
- **035** — `A` (empty) → "ponds and swamps", again recovered from the stem's pasted text.
- **041** — `A` (empty) → "55 medals", recovered from the stem's pasted text.
- **055** — `B` `W\.` → "I.U.C.N.", `C` (empty) → "I.B.W.C.", `D` `W\.W.F.` → "W.W.F.": the four options are U.T.E.S., I.U.C.N., I.B.W.C. and W.W.F., and the escaped punctuation is an export artefact.
- **061** — `B` "R. Ambedkar" → "Sardar Patel", `C` (empty) → "B.N. Rao", `D` (empty) → "B. R. Ambedkar": the printed option set is Nehru, Patel, B.N. Rao and Ambedkar. Without the repair the keyed `B` would point at Ambedkar, which is the wrong answer to the question.

Stems were **not** rewritten, even where they still show the pasted option text (027, 035, 041) — the duplication is cosmetic once the option is restored, and it is documented in each explanation rather than edited out of the paper's own wording. Other scan spellings ("Patekar", "Yakohama", "Bonous line", "Ignitis Minds"‑style slips, "maharashtra") are likewise left in the stem and explained in the prose.

---

## 4. Items investigated specifically and left alone (no change justified)

- **002 / 021 / 059** — Balwant Rai Mehta's three‑tier panchayati raj (`A`), the Sumant as Shivaji's foreign minister (`A`), and the Election Commission under Article 324 (`C`).
- **003 / 033 / 034** — industrial growth 2013‑14 at 4.5% (`C`), teak at 17.8% of the state's forest area (`A`), irrigation potential of 44.94 lakh hectares (`B`), each checked against a fetched source.
- **027 / 031** — Sikkim as the least urban of the four options (`A`), and **Balaghat** as the district with the highest sex ratio, 1,021 (`D`).
- **032** — the fossil park, discussed in §2: `Mandla` is retained because that is the park's official name, and the Dindori location is stated in the prose.
- **037 / 042 / 055 / 061 / 086 / 087** — graphite in **Betul** (`D`), the **Australian** Green Army of 2014 (`C`), the Red List run by **IUCN** (`B`), **Patel** as chairman of the advisory committee (`B`), **Malanjkhand** copper (`B`) and the **Birsinghpur** hydel station in Umaria (`A`).
- **056 / 060 / 081 / 092 / 095 / 097** — Sunderlal Bahuguna and Chipko (`C`), India's second place in world silk (`B`), the **Mauriya** Gaur dance (`B`), the Prabhash Joshi award for **mallakhamb** (`B`), the **Holkar Trophy** in bridge (`B`) and the **Black Pearl** as Pele (`C`).
- **067 / 068 / 072** — collective fine under the Atrocities Act imposed by the **State Government** (Section 16, `B`), company offences under the 1955 Act binding every officer (`D`), and summary trial by a **Judicial Magistrate First Class** (`B`).
- **100** — the Dr. Bhim Rao Ambedkar International Sports Stadium at **Faizabad** in Ayodhya district (`A`).
- **019 / 022 / 046** — Akbar's educational reforms (`D`), *Sahitya Ratna* as the work not by Tulsidas (`D`), and the Kyoto Protocol keyed to **greenhouse gases** (`B`), where the prose explains that climate change (`C`) is the parent convention rather than this protocol's operative subject.

---

## 5. Explanation rebuild

All 100 explanations were rebuilt to the four‑part standard: a concept statement that answers the stem, **four per‑option reasons written against each option's own text**, the revision facts worth carrying away, and a one‑line takeaway. No prose is shared between questions and no template sentence is reused.

One structural exception is worth recording. Question **074** ("One byte has … 8‑bits") is complete by every content rule, but `explanation-quality.test.js` also checks that the reasoning reuses a distinctive term from its own stem or options — and this stem ("One byte has") and its options ("8-bits", "16-bits", …) contain **no word of five letters or more**. Rather than fake a term or pad the option text, the test now skips that check only where no qualifying word exists, and a companion test asserts that **`MPPSC-2014-074` is the only audited question in that position**. Nothing else is exempt.

Gates: `explanation-quality.test.js` (audited years 2014–2024), `answer-accuracy-2014.test.js` (counts, the three corrections, both disputes, thirteen confirmed anchors and all ten option repairs), and `rebuild-corrections.test.js` (the declaration, provenance and reconciliation invariants).

---

## 6. Verification performed

- **Clean rebuild** with the standard command: **1,200 questions / 12 papers**, `35 key(s), 57 option(s), 1,071 explanation(s), 36 dispute(s) applied — 0 rejected, reconciled: true`; validator `ok`, **43 warnings** (five fewer than before this pass, because six empty option texts are gone), none new.
- **Year isolation:** diffing the rebuilt bank against the committed one gives **100 changed questions, all `MPPSC-2014-*`, 0 non‑2014**, and the `papers` block is byte‑identical. 2015, 2016 and the other audited years are untouched — during this pass a stray 2016 rewrite and three 2016 dispute blocks were found drifting in the working tree and were restored to the committed text rather than shipped.
- **`npm test`** — 401 tests, all passing.
- **`npm run check`** — clean.

Every count above is recomputed from `data/pyq/mymppsc-pyq-bank.json` by the tests, and the rebuild was re‑run after the last data edit.
