# MyMPPSC — 2021 PYQ Quality Improvement Report

**Branch:** `arena/fe11e1bf-mymppsc`
**Scope:** MPPSC State Service Preliminary Examination 2021, Paper I (GS) — all 100 questions (`MPPSC-2021-001` … `MPPSC-2021-100`), paper `MPPSC-2021-P1`.
**Constraint honored:** Only year 2021 was touched. Question IDs, `paper_id`, `question_number`, question wording, option keys, subject/topic/subtopic mappings, paper mapping and all other years are unchanged. Only `data/pyq/mymppsc-pyq-bank.json` was modified.

## 1. Questions & Options

**Questions audited:** 100 (the complete 2021 paper), against a full dump of every question's key, option text and explanation, and against the published MPPSC 2021 prelims answer key plus independent factual sources.

**Options restored:** 8 (no fabrication; corrupted display text restored to the original paper wording):

| Q | Option | Old text | Restored text |
|---|--------|----------|---------------|
| 014 | D | `Pakistan and Afghanistan"` | `Pakistan and Afghanistan` |
| 021 | D | `Chhindwara 4` | `Chhindwara` |
| 024 | D | `Datia 5` | `Datia` |
| 038 | D | `Consent of the President 9` | `Consent of the President` |
| 050 | D | `31.15% 2` | `31.15%` |
| 074 | D | `By Chairman Union Public Service 9` | `By Chairman Union Public Service Commission` |
| 083 | D | `Dongaliya Mundi, Khargone 2` | `Dongaliya Mundi, Khargone` |
| 097 | D | `Sal 6` | `Sal` |

All 100 questions carry 4 intact options with distinct keys; none missing, none invented.

**Answer verification & corrections (2):**

| Q | Question | Old key | New key | Basis |
|---|----------|---------|---------|-------|
| 064 | Largest tribal group of Madhya Pradesh | ['B'] (Bhil) | **['A'] (Gond)** | Census/tribal-research data: the Gond are the largest tribal group of MP (about a third of the tribal population), the Bhil second. The published key (D, Sahariya) is also wrong — Sahariya is one of the state's smallest PVTGs. |
| 068 | Incorrect statement on the freedom movement in MP | ['C','D'] | **['D']** | Only one statement is false: "Sipahi Bahadur Sarkar was established at Indore". The Bhil leaders, Shankar Shah of Garha Mandla and the Ramgarh chiefs are all genuine 1857 figures; the official key is D. |

**Official-key conflicts recorded, answer left factually correct:**
- **Q064** — published key D (Sahariya) vs fact (Gond).
- **Q080** — published key D (Timur) vs fact: the Second Battle of Tarain (1192) was fought between Prithviraj Chauhan and **Muhammad Ghori** (bank key A), who won. Timur invaded in 1398.
- **Q085** — published key D (Aravalli) vs fact: the Narmada rises at the **Amarkantak plateau** (bank key B), Narmada Kund, Anuppur district.

**Flagged as disputed / unresolved (12, via `dispute.open` with reasons):**
- **Cancelled by the commission:** Q057, Q076, Q082 — the schema has no "cancelled" status, so the stored answers (which are factually correct: Governor / 1992 / Ministry of Finance) are retained for revision only and marked disputed so they are not presented as official keys.
- **Grace marks / multi-accept on the official key:** Q027 (auctions = B2B and C2C), Q028 (router, brouter also accepted), Q034 (Turra-Kalangi region), Q056 (RTI state committee), Q092 (Third Amendment).
- **Key contradicted by established fact:** Q064, Q080, Q085 — the bank carries the factually correct option and the conflict is documented.
- **Garbled source wording:** Q068 — option C's printed name is defective, so the option itself is unreliable.

Confirmed correct, no change (all others), with the verification basis: Q001 Betwa→Yamuna, Kshipra→Chambal, Wainganga→Godavari, Tawa→Narmada (B); Q002 MP climate "not correct" statement D; Q003 Indore/Mhow as the district the Tropic of Cancer misses; Q004 fossil fuels in sedimentary rock; Q005 black soils absent in the Baghelkhand region; Q006 Corbett in Uttarakhand; Q007 WHO 7 April 1948; Q008 ISRO = Indian Space Research Organisation; Q009 pangolin radio-tagging state; Q010 phosphatase test for milk/pasteurisation; Q011 Sargasso Sea in the North Atlantic; Q012 Suez Canal's strategic value; Q013 Aravalli not a young folded mountain; Q014 McMahon Line between India and China; Q015 truck farming = vegetables; Q016 International Year of Millets 2023; Q017 Vimukta Jati Day 31 August; Q018 Ram Sahay Pandey = Rai dance (Bundelkhand); Q019 Durga Bai Vyam = Gond art; Q020 district–product matching; Q021 Bhind minimum sex ratio; Q022 11 agro-climatic zones; Q023 BHEL Maharatna 2013; Q024 Indira Gandhi Tribal University Amarkantak; Q025 Hindustan Copper project at Malanjkhand; Q026 IT Act 2000 = all of the above; Q029 DNS; Q030 C2B; Q031 Raisen has no Baiga Development Agency; Q032 Nana Saheb Panse not a painter; Q033 Mandhata = Omkareshwar; Q035 Dashpur inscription = first advertisement; Q036 All India Federation; Q037 Fifth meeting (Objectives Resolution); Q038 intention of the President (Article 108); Q039 Parliament = President + Rajya Sabha + Lok Sabha; Q040 Article 17; Q041 Atal Pragati Path = Gwalior–Chambal; Q042 600 MW floating solar at Omkareshwar; Q043 Chinki Yadav = shooting; Q044 Vivek Sagar = hockey; Q045 Katalin Novák = Hungary; Q046 Circum-Pacific belt; Q047 Marquette Range = iron ore; Q048 Indira Gandhi Canal; Q049 north-eastern USA not agriculture-dependent; Q050 31.15% urban in 2011; Q051 Ranjit Singh = Sukerchakia misl; Q052 princely/States portfolio associated with Patel; Q053 "annual national festival of educated Indians" = Lajpat Rai; Q054 Dandi March from Sabarmati; Q055 Satara first under the Doctrine of Lapse; Q058 ECI statements i and ii; Q059 MPPSC = five members; Q060 CAG's leave vests in the President; Q061 virtual keyboard = all of the above; Q062 spoofing; Q063 "network server" is the odd term; Q065 knowledge = justified true belief; Q066 Malwa Samvat = Krit Samvat; Q067 Sironj = chintz; Q069 Gotmar Mela = Chhindwara; Q070 mis-matched literary column B; Q071 Article 338 = NCSC; Q072 CIC or SIC (Section 20 RTI); Q073 CAG reports to the President (none of the above); Q074 Governor appoints State PSC; Q075 DMEO 18 September 2015; Q077 Govind Narayan Singh never Leader of the Opposition; Q078 Ram Kishore Shukla (Protem/Deputy/Speaker); Q079 elected Panch presides over the Gram Sabha; Q081 newton; Q083 Dongaliya Mundi not a thermal site; Q084 Barna valley project is in Raisen, not Ujjain; Q086 Bhopal gas tragedy 1984; Q087 Sertoli cells in the testis; Q088 UNICEF in New York; Q089 HCl in the stomach; Q090 scurvy = vitamin C; Q091 Article 51A(a) "abide by and respect" the Constitution; Q093 Article 131 original jurisdiction; Q094 Economic Survey 2020-21 = 11.5%; Q095 mid-day meal 1995; Q096 Mudrarakshasa = Vishakhadatta; Q097 pipal on Indus seals; Q098 Chola village autonomy; Q099 Ellora/Elephanta = Rashtrakuta; Q100 Vidyadhara faced Mahmud Ghazni.

No questions deleted; no IDs or mappings changed.

## 2. Explanation Standard (all 100 rewritten)

Every 2021 explanation was rewritten into the four required sections, mapped to the bank's supported schema fields exactly as in the 2022, 2023 and 2024 passes:

1. **Concept & Answer Justification** → `correct_reasoning`
2. **Why Other Options Are Incorrect** → `option_explanations` (every option, with `is_correct` true/false) reinforced by per-option bullets in `key_concepts`
3. **Additional Facts for Revision** → `key_concepts`
4. **Exam Takeaway / Memory Trick** → `revision_takeaways`

Plus `sources[]` naming the verification reference for each question.

Applied in four batches: Q001–Q025 (`/tmp/expl_2021_batch1.json`), Q026–Q050 (`batch2`), Q051–Q075 (`batch3`), Q076–Q100 (`batch4`), then merged into the bank keyed by question ID. Every `option_explanations` entry was machine-checked to match the bank's option text and keys character-for-character, and the `is_correct` flags were machine-checked to equal the stored answer for all 100 questions.

Question-specific treatment:
- Q037: the Objectives Resolution sitting is counted differently by different sources; the explanation follows the official key (Fifth) and states the counting ambiguity.
- Q064/Q068: explanations document the answer change and the verified fact.
- Q070/Q090/Q097: the paper's OCR defects are noted in the explanation while the option text is preserved.
- Q057/Q076/Q082: explanations state that the commission cancelled the question, so the fact is given for revision rather than as an official key.
- Q027/Q028/Q034/Q056/Q092: explanations record the official multi-accept/grace position.

Depth was scaled to complexity: factual recalls are concise; constitutional, statutory and historical items cite the governing Article/Act/date. Reasoning length: min 147, median 277, max 601 characters — in line with the 2023 and 2024 papers.

## 3. Verification

Priority sources: published MPPSC 2021 prelims answer key (UnlockIAS compilation) for key comparison; Constitution of India (Articles 17, 79, 108, 131, 148-151, 316, 317, 324, 338/338A/338B, 368(2), 243K/243ZA, 51A); RTI Act 2005 (§§12, 15, 20); MP Panchayat Raj Adhiniyam 1993; Census of India 2011; Economic Survey 2020-21; NITI Aayog/DMEO; MP Power Generating Company (thermal plants); MP Water Resources (Bargi, Tawa, Barna, Matiyari); MP Legislative Assembly records (Speakers, Chief Ministers, Leaders of Opposition); MP Tribal Welfare Department (PVTGs and development agencies); ASI/art-history references (Khajuraho, Ellora, Elephanta); NCERT (physics units, biology, geography); ISSF/Hockey India for the sportspersons.

The official key itself was found wrong on three facts (Q064, Q080, Q085); in each case the factual position was established independently and the bank keeps the correct option while recording the conflict. Where the paper appears to have mis-set a question or accepted several answers (Q027, Q028, Q034, Q056, Q092) and where it cancelled questions outright (Q057, Q076, Q082), the bank flags rather than guesses.

## 4. Data & Application Safety

- File modified: `data/pyq/mymppsc-pyq-bank.json` only (plus this report).
- 1,200 questions and 12 papers preserved; `MPPSC-2021-P1` still holds exactly 100 questions and a 100-entry `question_order`.
- All 100 explanations written through the schema's own `explanation` object; `dispute` used only for the 12 flagged questions and only with schema-valid fields (`is_disputed`, `status`, `reason`, `raised_by`).
- Question text, option keys, subject/topic/subtopic, `paper_id` and `question_number` unchanged for every question; the six 2021 model questions retain their `metadata.model_question` flag.
- The two long-standing suite failures (`pyq-bank.test.js` "every source record arrives…" and `quality-audit.test.js` "all historical question data… are preserved") remain the same two as before this pass: they pin the bank to the frozen intake file and the pre-remediation audit snapshot, so any legitimate answer correction, option restoration or explanation rewrite makes them diverge. They are unchanged in count and identity — no new failures were introduced.

## 5. Validation Results

```
npm run check   → All 1075 checks passed.
                  bundled bank: 1200 questions, 12 papers
npm test        → 317 tests: 315 pass, 2 fail (both pre-existing, see §4)
```

Structural validation of the 2021 slice after the merge:

| Check | Result |
|-------|--------|
| Questions present | 100 / 100 |
| Questions with a stored answer | 100 |
| Questions with all four explanation sections + sources | 100 |
| Questions with 4 options and distinct keys | 100 |
| Empty option texts | 0 |
| Option text == explanation option text (all 4 per question) | 100 / 100 |
| `is_correct` flags == stored answer | 100 / 100 |
| Disputed questions flagged with a reason | 12 |
| Question numbers aligned to bank IDs (001-100) | 100 / 100 |

## Summary

- **Audited:** 100 of 100 questions in `MPPSC-2021-P1`.
- **Answers corrected:** 2 (Q064 Bhil→Gond, Q068 two keys→one).
- **Options restored:** 8 (trailing scan digits and truncation).
- **Explanations improved:** 100 of 100, four-section, average median 277 characters of reasoning plus per-option reasoning, revision facts and a memory hook.
- **Unresolved / flagged:** 12 (3 cancelled questions, 5 official grace/multi-accept questions, 3 official keys contradicted by fact, 1 garbled option).
- **Validation:** `npm run check` 1075/1075 passed; `npm test` 315/317 with exactly the two pre-existing, intentional divergences and no new failures.
