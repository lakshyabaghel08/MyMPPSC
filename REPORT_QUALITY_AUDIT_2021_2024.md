# MyMPPSC — 2021–2024 Quality Audit (final pre-merge report)

**Branch:** `arena/fe11e1bf-mymppsc`
**Scope:** independent re-verification of every answer key changed in the 2021–2024 passes, re-examination of the disputed items, a structural audit of how explanations are stored and rendered, and an exact count of how much of the per-option explanation standard is actually met.
**Standing rule applied:** factual correctness governs. The official key is evidence, not authority — an official key that is wrong is recorded as wrong, and a previous internal correction is re-opened on its merits. Nothing below is carried over from an earlier pass without being re-derived.

---

## 1. Answer keys — 16 changed keys, all re-verified

### 1.1 Wrong — reverted (1)

**MPPSC-2021-064 — "Largest tribal group of Madhya Pradesh"** — reverted from `['A']` (Gond) back to `['B']` (Bhil).

The earlier pass changed this to Gond. That was wrong. Census 2011, Madhya Pradesh:

| Tribe | Population (2011) | Share of state ST population |
|---|---|---|
| **Bhil** (incl. Bhilala, Barela, Patelia) | **5,993,921** | ≈ 38–39 % |
| Gond | 5,093,124 | ≈ 33 % |

The Bhil are the largest tribal group of MP and the Gond second. (The Gond *are* the largest tribe in India as a whole — the likely source of the error.) The published 2021 key (`D`, Sahariya) is also wrong. The bank carries `B`; the dispute note records both the official error and ours.

### 1.2 Defective item — restored to two answers and flagged (1)

**MPPSC-2022-045 — "Buddhist caves are not situated in which of the following places?"** — restored from `['D']` to `['C','D']`.

- **Ajanta (A)**, **Bagh (B)** — rock-cut Buddhist cave complexes.
- **Sanchi (C)** — a stupa, temple and monastery complex (Great Stupa, Stupas 2 and 3, the four toranas, Monasteries 45/47/51, Temple 17, Temple 40). The rock-cut caves near Sanchi are those of **Udayagiri, ~13 km away**. On a strict reading, Sanchi has no Buddhist *caves*.
- **Bulsar/Valsad (D)** — no Buddhist cave group; the Gujarat sites are Junagadh, Khambhalida, Sana, Kadia Dungar, Talaja and Siyot.

Two options satisfy "not situated", so `['C','D']` is stored with a dispute flag. The item is defective and is presented as such rather than being trimmed to one key.

### 1.3 Confirmed correct — no change (14)

Each re-derived from primary facts, not from its earlier justification.

| Question | Key | Verified basis |
|---|---|---|
| MPPSC-2021-068 | `D` | *Sipahi Bahadur Sarkar* was set up at **Sehore** (Saikdakhedi, 14 Jan 1858), not Indore; the other three statements are true (C is a misprint of Jujhar Singh Devnath Singh of Ramgarh, who did resist). |
| MPPSC-2022-003 | `B` | **John McCarthy** coined "artificial intelligence" (Dartmouth workshop, 1956) and is the accepted father of the field. Dartmouth is a place/conference, not a person — the old key `D` was indefensible. |
| MPPSC-2022-018 | `C` | The 2020 Dronacharya **Life-Time** hockey award went to **Romesh Pathania**; Jude Felix Sebastian took the *regular* category. |
| MPPSC-2022-053 | `D` | Both NHRC statements are true (PHRA 1993, s.12) and neither explains the other. **Construct weakness — flagged, see §4.** |
| MPPSC-2022-083 | `A` | IBM 2020-21 iron ore: Odisha 51.17 %, Chhattisgarh 18.09 %, Karnataka 16.89 %, Jharkhand 10.48 %, **MP ≈ 2 % (fifth)**. Statement D (Chhattisgarh second) is true; statement A (MP third) is the false one. The old key `D` contradicted its own statement set. |
| MPPSC-2022-090 | `D` | The **Narmada** cut the deep gorge between the Akhrani and Mathwar hills. |
| MPPSC-2023-001 | `B` | Soil preparation → sowing → irrigation → harvesting; irrigation cannot precede sowing. |
| MPPSC-2023-009 | `C` | Osteoclasts resorb bone and act in remodelling; formation is osteoblast work. |
| MPPSC-2023-046 | `C` | Flipkart, Alibaba, Amazon → B2C. |
| MPPSC-2023-052 | `A` | The Gaza Strip lies on the **Mediterranean** coast. |
| MPPSC-2023-057 | `D` | The **Vaitarna** rises on the Trimbak–Anjaneri hills near Trimbakeshwar (Nashik). |
| MPPSC-2023-059 | `A` | First commercial geothermal district heating: **Boise, Idaho, 1892**. (Chaudes-Aigues, 14th c., predates it but was not a commercial network.) |
| MPPSC-2024-018 | `C` | Atal Bihari Vajpayee Institute of Good Governance and Policy Analysis is in **Bhopal**. |
| MPPSC-2024-029 | `C` | MP tribal self-employment scheme = **Bhagwan Birsa Munda Self-Employment Scheme** (approved 6 Sep 2022); Tantya Mama is a separate welfare scheme. |
| MPPSC-2024-072 | `B` | Jharkhand ≈ 26 % + Odisha ≈ 25 % ≈ 51 % — the only pair above half of India's coal reserves. |
| MPPSC-2024-080 | `B` | Census 2011 lowest density: **Arunachal Pradesh**, 17 per sq km. |

**Net:** of 16 changed keys, **14 stand**, **1 was wrong and is reverted**, **1 was a defective item and is restored to two answers and flagged**. Every one is recorded in `data/pyq/reviewed-corrections.json` with its `from` / `to` / `basis`.

---

## 2. The explanation defect — found, then fixed where it was fixed

The complaint that option explanations "explain nothing" was correct, and the cause was partly structural.

- All **1,600** `option_explanations` rows across 2021–2024 had the shape `{key, text, is_correct}` — they restated the option and labelled it.
- `js/core/schema.js` **discarded any field beyond those three**, so a `reason` could not survive import even if written.
- Where real per-option prose existed, some of it sat in `key_concepts` as "Option A is correct: …" bullets — a disguise, not a reason.

### 2.1 Structural fixes

| File | Change |
|---|---|
| `js/core/schema.js` | Preserves a `reason` string per option instead of dropping it. |
| `js/ui/components.js` | Renders `reason` beneath the option text in the option-by-option table. |
| `css/app.css` | `.option-reason` styling (quiet, under the option). |
| `data/schema/question-bank.schema.json` | Documents `reason` on `option_explanations.items` (one-line, targeted edit — no reformatting). |

### 2.2 A second defect the new tests exposed: explanations describing the wrong options

34 explanations (all 2023–2024) carried option text and keys that did not belong to their question — placeholder option sets such as "District A", "Order A", "Objective A", or the option list of a different question (e.g. 2023-003 explained Indo-Burma/Western Ghats while the question was about the Himalayas and Naro Hills). None of them carried `reason`, so no answer was affected, but the text taught the wrong thing. All 34 were synchronised to the question's real options:

- **2023:** 003, 004, 006, 007, 008, 011, 012, 013, 014, 015, 016, 017, 018, 019, 020, 022, 023, 025, 035, 043, 045, 051, 065, 073
- **2024:** 012, 020, 021, 035, 036, 040, 061, 075, 094, 097

Synchronising them exposed **three contradictions between the stored answer and the option flags**, all now fixed:

| Question | Defect | Fix |
|---|---|---|
| MPPSC-2022-003 | key `D` (Dartmouth) with `B` marked false | key → `B`, four reasons written, dispute flag added |
| MPPSC-2022-083 | key `D` with `D` marked false | key → `A`, four reasons written, dispute flag added |
| MPPSC-2023-048 | spurious `is_correct` on `C` (Chrome) while the key is `D` (Yahoo) | flag cleared; `D` kept; four reasons written |

### 2.3 What the standard now requires, and how it is enforced

`tests/explanation-quality.test.js` (8 tests, new) applies the following to every question listed in `option_reasoning_complete`:

1. the four option keys are exactly the question's keys, in order, and each row quotes that option's real text;
2. every option has a reason of at least five words that is not the option text repeated (§"Article 328" answering "Article 328" fails);
3. the `is_correct` flags equal the stored answer, exactly;
4. reasons are distinct from each other — one paragraph cannot be pasted four times;
5. the narrative reasoning is substantial, contains no placeholder phrasing, discusses a term from its own question (transliteration variants such as McMohan/McMahon and Malaw/Malwa are matched within edit distance 2), and is not reused by another question;
6. **the completeness list is exact** — the test recomputes the standard from the bank and fails if a qualifying question is missing from the manifest *or* a listed question no longer qualifies.

That last test is what makes the coverage numbers below trustworthy rather than asserted. It was mutation-tested: blanking one reason and flipping one flag made four of the eight tests fail, and restoring the data made them pass again.

---

## 3. Exact coverage — measured, not claimed

| Year | Genuine reasoning for all four options | Text + correctness label only | Needing further improvement | Total |
|---|---|---|---|---|
| 2021 | **100** | 0 | 0 | 100 |
| 2022 | **6** | 94 | 0 | 100 |
| 2023 | **7** | 93 | 0 | 100 |
| 2024 | **4** | 96 | 0 | 100 |
| **All** | **117** | **283** | **0** | **400** |

- **117** questions have a real, option-specific reason for all four options and pass all six checks above.
- **283** questions have each option's label and correctness flag but **no** per-option reasoning. They are counted as outstanding. They are *not* counted as complete merely because text and a tick are present.
- **0** questions are in the intermediate state the earlier passes left behind (some options reasoned, others not) and **0** carry a placeholder or repeated option set, now that the 34 mismatches are synchronised.

The 2022–2024 six/seven/four are the re-verified questions in those years, not a sample of a finished year: 2021 is the only paper taken to completion.

`key_concepts` no longer carries disguised "Option X is correct: …" bullets; the reasoning lives in `reason`, where the renderer can show it.

---

## 4. Unresolved and high-risk questions (MRP — manual re-verification pending)

Nothing in this list is settled by assertion. 16 questions carry a schema-valid `dispute` block; the rest of the corrections are documented in the manifest.

| Question | Issue | Disposition |
|---|---|---|
| MPPSC-2022-045 | Two options satisfy "not situated"; item defective | `['C','D']`, flagged defective |
| MPPSC-2022-053 | Statements (i) and (ii) both true; A, B and D all literally true | `D` kept as the best reading, **flagged unresolved / poorly constructed** |
| MPPSC-2022-003 | Official key names a place, not a person | key `B` (McCarthy), flagged |
| MPPSC-2022-083 | Official key contradicts its own true statement | key `A`, flagged |
| MPPSC-2021-037 | Objectives Resolution sitting counted as Fifth / Third / Second by different sources | `D` (Fifth) kept, counting ambiguity stated |
| MPPSC-2021-027 | Auctions: B2B and C2C both defensible | `['A','C']` kept, flagged |
| MPPSC-2021-034 | Turra-Kalangi: Nimar vs Malwa | `['A','B','C']` kept, flagged |
| MPPSC-2021-056 | RTI State Information Commission membership | retained, flagged for grace-mark ambiguity |
| MPPSC-2021-057 / 076 / 082 | Cancelled by the commission; schema has no "cancelled" status | answers kept for revision, flagged |
| MPPSC-2021-064 | Official key (Sahariya) wrong; our earlier Gond correction also wrong | `B` (Bhil), flagged |
| MPPSC-2021-080 / 085 | Official key contradicted by fact (Timur; Aravalli) | factually correct option kept, conflict recorded |
| MPPSC-2021-066 | Printed paper reads "Malaw Samvat" (transliteration of Malwa) | wording preserved as printed; reasoning explains the identification |

Seven questions legitimately carry more than one answer: 2021-027, 2021-034, 2021-056, 2022-045, 2023-005, 2023-010, 2023-068.

---

## 5. Tests and validation

The two suites that used to fail were pinning the bank to frozen snapshots, so every legitimate correction read as a regression. They are now driven by an explicit manifest instead of being loosened.

**`data/pyq/reviewed-corrections.json` (version 2)** — every reviewed divergence, with `from` / `to` / `basis`:

- 14 option repairs (scan artefacts: stray digits, truncation, a stray quote, a stray emoji);
- 16 answer corrections;
- **117** ids in `option_reasoning_complete` — exactly the questions meeting the per-option standard;
- **381** ids in `narrative_rewritten` — the four-section narrative rewrites, kept separate so the two standards cannot be confused.

**`tests/pyq-bank.test.js`** — still enforces source wording verbatim; options and keys are checked against `source + declared corrections`, so a question may depart from the extraction only where a declaration exists (and the declaration must quote the printed text, reference the current value, and actually change something).

**`tests/quality-audit.test.js`** — options and answers compared against the baseline with corrections applied; declared rewrites must be structurally complete *and* really differ, undeclared ones must still match exactly.

**`tests/explanation-quality.test.js`** — the six checks in §2.3 plus an exactness test and a coverage test.

| Check | Result |
|---|---|
| `npm run check` | **1,075 / 1,075 passed** |
| `npm test` | **325 / 325 passed** (317 before; +8 from the explanation-quality suite) |
| Bank integrity | 1,200 questions, 12 papers, 100 per paper, `question_order` intact |
| IDs, mappings, classifications | unchanged |
| Option text vs explanation option text | consistent for all 400 audited questions |
| Explanation flags vs stored answers | consistent for all 400 audited questions |
| Disputed flags | schema-valid (`is_disputed`, `status`, `reason`, `raised_by`), 16 questions |
| Unrelated years/app functionality | untouched; 2020 not started |

---

## 6. Outstanding work (stated, not hidden)

1. **283 questions in 2022–2024 still lack per-option reasoning.** The mechanism, the renderer and the test all exist; the content for those 283 does not. This is the largest remaining gap and the obvious next block of work, one year at a time.
2. **256 of 404 source citations are not individually linkable** — they name a real issuing authority but no URL. Improving them is worthwhile and was deliberately not prioritised over answer accuracy.
3. **Disputed items in §4** are documented, not resolved; several cannot be resolved (cancelled questions, defective items).
4. **No year beyond 2021–2024 has been touched, and 2020 has not been started**, per instruction.
