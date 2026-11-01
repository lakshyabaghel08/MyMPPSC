# MyMPPSC — 2021–2024 Quality Audit of the Previous Passes

**Branch:** `arena/fe11e1bf-mymppsc`
**Scope:** independent re-verification of every answer key changed in the 2021–2024 passes, re-examination of the two disputed changes, and an audit of how explanations are implemented and rendered.
**Standing rule applied:** factual correctness governs. The official key is treated as evidence, not as authority — an official key that is wrong is recorded as wrong, and a previous internal correction is re-opened on its merits.

## 1. Answer keys — all 16 changed keys re-verified

Sixteen keys were changed across the four passes. Each was re-checked from source material rather than from the earlier justification.

### 1.1 Wrong — reverted (1)

**MPPSC-2021-064 — "Largest tribal group of Madhya Pradesh"** — reverted from `['A']` (Gond) back to `['B']` (Bhil).

The previous pass changed this to Gond. That was wrong. Census 2011 gives Madhya Pradesh:

| Tribe | Population (2011) | Share of state ST population |
|---|---|---|
| **Bhil** (incl. Bhilala, Barela, Patelia) | **5,993,921** | ≈ 39% |
| Gond | 5,093,124 | ≈ 33% |
| Kol, Korku, Sahariya, Baiga | much smaller | — |

The Bhil are the largest tribal group of MP; the Gond are second. (The Gond *are* the largest tribe in India as a whole, which is the probable source of the confusion, and probably why the pass went wrong.) The published 2021 key (`D`, Sahariya) is also wrong. The bank now carries `B`, and the dispute note records both errors — the official one and our own.

### 1.2 Defective question — reverted and flagged (1)

**MPPSC-2022-045 — "Buddhist caves are not situated in which of the following place?"** — reverted from `['D']` back to `['C','D']`.

The previous pass cut the paper's two-answer key to Bulsar only, on the reasoning that "Sanchi is a Buddhist site, so it has Buddhist caves". That inference is invalid, as flagged. The facts:

- **Ajanta (A)** — rock-cut Buddhist caves. Clearly *has* Buddhist caves.
- **Bagh (B)** — nine rock-cut Buddhist caves in Dhar district. Clearly *has* Buddhist caves.
- **Sanchi (C)** — a **stupa, temple and monastery** complex. Its monuments are the Great Stupa, Stupas 2 and 3, the four toranas, Monasteries 45/47/51, Temple 17 and Temple 40 — all structural. The rock-cut caves associated with the Sanchi neighbourhood are those of **Udayagiri, about 13 km away**. On a strict reading, Buddhist *caves* are not situated at Sanchi.
- **Bulsar/Valsad (D)** — no Buddhist cave complex of any kind.

Two options therefore satisfy "not situated". `['C','D']` is restored and the item is flagged as defective. This is the honest outcome: the question should have had one clearly wrong option, and no amount of key-matching fixes that.

### 1.3 Confirmed correct — no change (14)

Each was re-derived from the underlying facts, not from its earlier justification.

| Question | Key | Verified basis |
|---|---|---|
| MPPSC-2021-068 | `D` | *Sipahi Bahadur Sarkar* was set up at **Sehore** (Saikdakhedi, 14 Jan 1858), not Indore. The other three statements are true; C is a misprint of "Jujhar Singh **Devnath** Singh of Ramgarh", who did resist the British. |
| MPPSC-2022-018 | `C` | The 2020 Dronacharya **Life-Time** hockey award went to **Romesh Pathania**; Jude Felix Sebastian received the *regular* category award. |
| MPPSC-2022-053 | `D` | Both NHRC statements are true (PHRA 1993, s.12) and neither explains the other. **Construct weakness — flagged separately, see §4.** |
| MPPSC-2022-090 | `D` | The **Narmada**, in its rift valley, cut the deep gorge between the Akhrani and Mathwar hills. |
| MPPSC-2023-001 | `B` | Soil preparation → sowing → irrigation → harvesting. Irrigation cannot precede sowing. |
| MPPSC-2023-009 | `C` | Osteoclasts resorb bone and act in fracture remodelling; *bone formation* is osteoblast work. |
| MPPSC-2023-046 | `C` | Flipkart, Alibaba and Amazon are business-to-consumer → B2C. |
| MPPSC-2023-052 | `A` | The Gaza Strip lies on the **Mediterranean** coast. |
| MPPSC-2023-057 | `D` | The **Vaitarna** rises on the Trimbak–Anjaneri hills near Trimbakeshwar, Nashik district. |
| MPPSC-2023-059 | `A` | The first successful commercial tapping of underground heat (district heating) was at **Boise, Idaho, 1892**. |
| MPPSC-2024-018 | `C` | The Atal Bihari Vajpayee Institute of Good Governance and Policy Analysis is in **Bhopal**. |
| MPPSC-2024-029 | `C` | The MP tribal self-employment scheme is the **Bhagwan Birsa Munda Self-Employment Scheme** (approved 6 Sep 2022); Tantya Mama is a separate welfare scheme. |
| MPPSC-2024-072 | `B` | Jharkhand (≈26%) + Odisha (≈25%) ≈ 51% — the only pair above half of India's coal reserves. |
| MPPSC-2024-080 | `B` | Census 2011 lowest density: **Arunachal Pradesh**, 17 per sq km. |

**Net result:** of 16 changed keys, **14 stand**, **1 was wrong and is reverted**, **1 was a defective item and is reverted and flagged**.

## 2. Explanation implementation — the structural defect found

The audit found the complaint was correct, and that the cause was structural rather than editorial.

- All **1,600** `option_explanations` entries across 2021–2024 had the shape `{key, text, is_correct}`. They restated the option and labelled it; they explained nothing.
- `js/core/schema.js` **stripped any field beyond those three**, so reasoning could not be carried even if it had been written.
- The actual per-option reasoning existed for only **80 of 400** questions, and was parked in `key_concepts` as "Option A is correct: …" bullets — exactly the disguise described.

### 2.1 Structural fixes

| File | Change |
|---|---|
| `js/core/schema.js` | Carries a `reason` string per option instead of discarding it. |
| `js/ui/components.js` | Renders `reason` beneath the option text in the option-by-option table. |
| `css/app.css` | Adds `.option-reason` styling (quiet, under the option). |
| `data/schema/question-bank.schema.json` | Documents `reason` on `option_explanations.items`. |

### 2.2 What now meets the standard

| Year | Questions with reasoning on all four options | Total |
|---|---|---|
| 2021 | **100** | 100 |
| 2022 | 4 | 100 |
| 2023 | 6 | 100 |
| 2024 | 4 | 100 |

- **2021 is complete.** 68 questions had their per-option prose migrated out of `key_concepts` into `reason`; 31 had real reasoning written for every option; the leftover "Option X" bullets were then deleted from `key_concepts` (9 removed), so `key_concepts` again carries only genuine extra facts.
- **2022–2024 are not complete.** Only the 14 re-verified questions in those years carry per-option reasoning. **296 questions remain without it.** This is a real gap and is not being papered over — see §6.

### 2.3 Sources

148 of 404 source entries carry a URL. Per instruction, references were not mass-formatted for the sake of a bibliography; the two rewritten questions were given directly checkable references (Ministry of Tribal Affairs / Census of India for Q064, UNESCO World Heritage listings for Q045). The remaining citations name a real issuing authority but are not individually linkable.

## 3. The two failing tests

Both failures came from the suites pinning the bank to frozen snapshots, so any legitimate correction read as a regression. They are now driven by an explicit manifest instead of being loosened.

**New file: `data/pyq/reviewed-corrections.json`** — every reviewed divergence, with `from`/`to`/`basis`:
- 14 option repairs (scan artefacts: stray digits, truncation, a stray quote, stray emoji)
- 14 answer corrections, each with its stated basis
- 381 declared explanation rewrites

**`tests/pyq-bank.test.js`** — still enforces source wording verbatim, but options and keys are checked against `source + declared corrections`. A question may depart from the extraction *only* where a declaration exists. Added: each declaration must quote the printed text, must reference the current bank value, and must actually change something — so the manifest cannot rot.

**`tests/quality-audit.test.js`** — options and answers compared against the baseline with corrections applied. The explanation check is no longer "must equal the frozen snapshot": for declared rewrites it now asserts completeness (reasoning present, all four options covered, revision facts, a takeaway) *and* that it really differs; for undeclared questions it still asserts exact equality. Added: every declared rewrite and re-key must name a real, present question.

This is stricter than before in one respect (rewritten explanations are now structurally validated) and no weaker in another (undocumented drift still fails).

**Result: 317/317 tests pass** (previously 315/317). `npm run check`: 1075/1075.

## 4. Unresolved questions

| Question | Issue | Disposition |
|---|---|---|
| MPPSC-2022-045 | Two options satisfy "not situated"; the item is defective | Reverted to `['C','D']`, flagged |
| MPPSC-2022-053 | Statements (i) and (ii) are both true, so options A, B and D are all literally true | `D` kept as the complete answer, flagged as poorly constructed |
| MPPSC-2021-037 | Objectives Resolution sitting counted as Fifth / Third / Second depending on convention | `D` (Fifth) kept, flagged, counting ambiguity stated |
| MPPSC-2021-027 | Auctions: B2B and C2C both defensible | `['A','C']` kept, flagged |
| MPPSC-2021-034 | Turra-Kalangi: Nimar vs Malwa | `['A','B','C']` kept, flagged |
| MPPSC-2021-057 / 076 / 082 | Cancelled by the commission; schema has no "cancelled" status | Stored answers kept for revision, flagged |
| MPPSC-2021-080 / 085 | Official key contradicted by fact (Timur; Aravalli) | Factually correct option kept, conflict recorded |

## 5. Validation

| Check | Result |
|---|---|
| `npm run check` | 1075 / 1075 passed |
| `npm test` | **317 / 317 passed** (previously 315 / 317) |
| Bank integrity | 1,200 questions, 12 papers, 100 per paper |
| IDs, mappings, classifications | unchanged |
| Disputed flags | schema-valid (`is_disputed`, `status`, `reason`, `raised_by`) |
| Option text vs option explanation text | consistent for all re-authored questions |

## 6. Outstanding work

1. **296 questions in 2022–2024 lack per-option reasoning.** The mechanism now exists; the content does not. This is the single largest gap and should be the next block of work, one year at a time, with the same factual standard applied.
2. **256 of 404 source citations are not individually linkable.** Improving them is worthwhile but was deliberately not prioritised over answer accuracy.
3. **No year beyond 2021–2024 has been touched, and 2020 has not been started**, per instruction.
