# MyMPPSC — Final Answer Audit & Explanation Generation, 2012

**Scope:** every question of the 2012 Preliminary Paper‑I (`MPPSC-2012-P1`) in the bundled bank (`data/pyq/mymppsc-pyq-bank.json`). No other year was touched by this audit. The 2009–2011 papers were subsequently removed from the active bank.

**Question asked of every item:** what can be taught truthfully from the available evidence, and where is there not enough evidence to teach a single answer at all?

**Authority boundary:** **no authenticated MPPSC 2012 Paper I answer key was located.** Every `verified_answer` in this paper is an **independently source-supported answer**, not an officially authenticated MPPSC answer. The `verified_by` string says so explicitly. Where the evidence is insufficient or the question is defective, the item is **left unkeyed** rather than forced.

**Machine-readable record:** `data/pyq/quality-audit/final-answer-audit-2012.json` (one row per question with status, basis, uncertainty and sources). Guarded by `tests/final-answer-audit-2012.test.js`, `tests/answer-verification-2012.test.js`, `tests/transcription-2012-staging.test.js`, `tests/rebuild-corrections.test.js` and `tools/check.mjs`.

**Explanation source:** `data/pyq/reviewed-explanations-2012.json`, declared by `data/pyq/reviewed-corrections-2012.json` and integrated by `tools/classify/append-2012.mjs`.

---

## 1. Headline counts (computed from the bank, not copied from earlier notes)

| Disposition | Questions | Meaning |
|---|---:|---|
| Existing integrated answers re-verified and **preserved** | 79 | No compelling evidence justified changing any of them. |
| Previously unkeyed items **resolved** with cited evidence | 10 | New single, independently verified answers. |
| Items finally documented as **defective** | 7 | No honest single key; left unkeyed. |
| Items finally documented as **genuinely ambiguous** | 4 | Conflicting reliable sources; left unkeyed. |
| **Total** | **100** | 79 + 10 + 7 + 4. |

- **Independently verified answers in the shipped bank: 89** (79 preserved + 10 resolved).
- **Unkeyed questions: 11** (3 still `disputed`, 8 `unresolved`). Before this audit the figures were 79 verified, 7 disputed and 14 unresolved (21 unkeyed).
- **Answer changes to previously integrated keys: 0.** No `supplied_answer` was created, and no `answer_corrections` entry was added for 2012.
- **Complete four-part explanations: 100 of 100**, including the 11 unkeyed items.
- **Source references:** 147 distinct URLs; 120 `verified_answer.evidence` references and 32 `verification_evidence` references; all 100 questions carry sources in `explanation.sources`.
- **Scoring:** `MPPSC-2012-P1` still has `scoring.rules_known: false`.

---

## 2. Ten previously unkeyed questions resolved

| Question | New key | Independent basis (with the caveat that travels with it) |
|---|---|---|
| **004** — Anemometer | **C** | NWS/NOAA glossaries define an anemometer as the wind-speed instrument. The Hindi option reads पवन वेग (wind velocity); the English “Force of the wind” is an imprecise rendering. The translation defect is preserved in the uncertainty record. |
| **012** — Indus statements | **C** | The identical UPSC 2011 item carries the official answer “Both 1 and 2”; NCERT records Harappan cotton, and standard textbooks describe the civilisation as predominantly secular. Statement 2 is a conventional interpretive characterisation, not a measurable fact. |
| **019** — Amir Khusrau | **A** | Britannica dates Khusrau’s death to 1325 and names Alauddin Khalji among his patrons; `Khazain-ul-Futuh` chronicles that reign. Muhammad bin Tughlaq only acceded in 1325, so the Khalji association is the reliable one. |
| **029** — City of Canals | **C** | “City of Canals” is the conventional nickname of Venice; Amsterdam is the “Venice of the North”. A third-party solved paper also prints Venice. Amsterdam also has canals, so the nickname is a convention rather than an exclusive property. |
| **046** — Players on the ground | **C** | Britannica gives nine kho-kho players on the field; standard rules give kabaddi seven, volleyball six and basketball five → 9, 7, 6, 5. Kho-kho’s 12-player squad sends defenders in batches of three. |
| **053** — District not touching UP | **D** | Official district profiles say Bhind borders Agra/Etawah, Satna borders Banda and Shivpuri borders Jhansi — all in Uttar Pradesh. Sheopur is the exception by elimination. An MPPCB plan says the opposite; the conflict is documented. |
| **075** — Jaldeep Yojana | **A** | A contemporaneous 2007 Gwalior press note says the scheme was “initially” begun at Indira Sagar reservoir; multiple exam references agree. The “initially” wording is date-dependent and recorded. |
| **088** — Computer hacker | **B** | The US EAC/NIST glossary defines a hacker as an “unauthorised user who attempts to or gains access to an information system”. Only B describes malicious, unauthorised intrusion; ethical/white-hat exceptions are noted. |
| **090** — Cyber crime | **D** | UNODC guidance lists illegal access (hacking), ICT-mediated stalking and denial-of-service attacks; all three named categories are covered. Stalking must be cyberstalking and hacking unauthorised for the composite to hold. |
| **094** — PCR Act offences | **B** | Section 15 makes every offence under the Act cognizable and triable summarily. The bank’s option B says “Cognizable and non-compoundable”, while the printed paper says “Cognizable and Try summarily” and the statute says “triable summarily”; the transcription conflict is preserved, not repaired. |

Each of these keeps `verified_answer.status = "verified"` and the explicit `verified_by` disclaimer. None is described as official.

---

## 3. Eleven items deliberately left unkeyed

*Defective or insufficient-evidence items (7):*

| Question | Final disposition |
|---|---|
| **015** — I.N.A. trial advocate | Both Asaf Ali (C) and Bhulabhai Desai (D) were on the nine-member defence committee; Desai was lead counsel. The stem does not say “chief”, so two options are true. An unauthenticated third-party key prints D. |
| **045** — Chairman, M.P. Sports Council | MP gazette notification No. 326 of 8 July 2011 dissolved the Council and created the Sports Authority before the exam; another solved version offers a fifth “None of these” option. The premise “at present” is unstable. |
| **047** — Award to a coach | MP’s coaching honour is the **Vishwamitra Award**; Vikram is for senior players and Eklavya for juniors. None of the four options names it, although a third-party key prints “Parashuram award”. |
| **050** — World Billiard Championship 2012 | IBSF records two 2012 champions: Rupesh Shah (points) and Pankaj Advani (timed). The stem does not name the format. |
| **063** — Pakistan–China exercise river | ISPR’s own release says YOUYI-IV was held **“near Jhelum”** — a place, not a river course. “None of the above” is defensible against the stem’s “along which … rivers”. |
| **067** — Anna Hazare in TIME’s list of 36 | TIME’s 2011 “The Protester” package presented 36 portraits without ordinal ranks; a third-party key prints “Tenth”, conflating it with a separate top-ten news-stories feature. |
| **095** — When an untouchability offence is not made out | PCR Act s.4(vi) and (xi) expressly cover charitable-trust benefits and finery, so A and B are offences; Devarajiah v. Padmanna supports D only for a religious social boycott within a group. A third-party key prints B. Statute, case law and key conflict; option C is garbled. |

*Genuinely ambiguous items (4):*

| Question | Final disposition |
|---|---|
| **022** — Himalayan ranges and the states | Exam convention says Uttar Pradesh, but official material places Shivalik/Dundwa outliers in northern UP and those are Outer Himalaya by geological definition. |
| **041** — Biggest indoor stadium in M.P. | Smart City Indore/Testbook name Abhay Prashal (Indore, B); a third-party key prints Bhopal (C) and TT Nagar Sports Complex reports a 20,000-capacity stadium. No authoritative comparative survey was located. |
| **073** — Railway sleeper factory district | Solved papers name Sehore, but private concrete-sleeper plants at Vidisha and Hoshangabad and the absence of an Indian Railways primary source leave the district unverifiable. |
| **092** — M.P. Accountant General’s Office | CAG documents place AG offices at Gwalior and a branch at Bhopal; both A and B have primary support for different functions. |

All 11 keep `verified_answer` absent, `dispute.status = "unresolved"` (3 still `is_disputed: true`), an uncertainty note in `dispute.reason`, and a full explanation that ticks **no** option as correct.

---

## 4. Explanation rebuild — all 100 questions

Every 2012 question now uses exactly the 2013–2024 structure:

1. a substantive `correct_reasoning` paragraph that states the fact and why the key follows — or, for unkeyed items, why no key is assigned (shortest is 214 characters);
2. **four `option_explanations` rows** in A–D order, quoting the real option text, each with its own meaningful reason and an `is_correct` flag consistent with the stored answer. On the 11 unkeyed items the flag is **`null` on all four rows**: the interface prints “unstated” rather than falsely teaching that every option is “not correct”;
3. `key_concepts` — two or three named facts a learner should recall;
4. `revision_takeaways` — one or two standing facts;
5. preserved `sources[]`, identical to the reassessment’s evidence URLs.

Before this pass, 79 questions carried only a one-line `{correct_reasoning, sources}` record and 21 had `explanation: null`. There was no per-option reasoning anywhere in the paper. `tests/final-answer-audit-2012.test.js` recomputes the four-part standard from the shipped bank, including the rule that an unkeyed item may never tick an option.

The explanation declarations live in `data/pyq/reviewed-corrections-2012.json` and are parsed through the same `parseReviewedCorrections` routine as the 2013–2024 audits, then applied by `tools/classify/append-2012.mjs`. A missing, undeclared, mis-ticked or source-drifted explanation fails the build.

---

## 5. Sources, evidence and preserved caveats

- **No official MPPSC key.** A forum-hosted “ANSWER KEY” PDF (`educationobserver.com/forum/attachment.php?aid=9486`) was inspected as **unauthenticated third-party corroboration only**. It agrees with all 69 of the 79 previously integrated answers whose numbers are legible in its OCR, but it has internal numbering gaps and duplicates and is not treated as an MPPSC publication. Its disagreement with primary sources on several unkeyed items is recorded above, not used to force keys.
- A separate third-party question-paper attachment (`aid=9487`) confirmed the bank’s question rotation, preserved the printed Q74 option B “Cognizable and Try summarily”, and exposed the bank’s conflicting Q94 option B. The transcription was **not** altered.
- Primary and standard sources added during the audit include: NOAA/NWS instrument glossaries, NCERT/Drishti IAS on Harappan cotton, Britannica on Khusrau and kho-kho, official district profiles for Bhind/Satna/Shivpuri, the ISPR press-release archive, the IBSF past-champions list, the MP gazette dissolution notice, the MP government’s Vishwamitra Award reporting, CAG office pages, the US EAC/NIST cybersecurity glossary, UNODC cybercrime modules, the Government of India’s PCR Act extract, Indian Kanoon’s *Devarajiah v. Padmanna*, and IGNOU material on same-community cases.
- **Preserved source caveats:** Q4 English “Force of the wind” vs Hindi पवन वेग; Q34 primary-source answer C vs quarantined generator B; Q100 original s.14 “speedy trial” answer A vs quarantined generator D; Q31/Q96 transcription findings; Q94 option-B wording conflict; Q96 original 1955 J&K exclusion vs the stored all-India key; Q53 MPPCB boundary conflict. Question wording, option order, classification, IDs and all unrelated years are unchanged.

---

## 6. Verification performed

| Check | Result |
|---|---|
| `npm test` | **461 tests, 461 pass, 0 fail** |
| `npm run check` | **1,084 checks pass** |
| Clean rebuild (`tools/classify-bank.mjs`, active 2012–2024 scope) | 1,300 questions / 13 papers; validator **ok**, 0 fatal, 0 errors, 0 rejected; 1,171 reviewed explanations restored for 2013–2024 and **100 four-part explanations integrated for 2012** |
| Rebuild determinism | a second clean rebuild is byte-identical to the committed bank after stripping the two build stamps |
| Year isolation | rebuild diff: **exactly 100 records changed, all 2012**; `papers` block byte-identical; no `supplied_answer` added |
| 2012 verification | 100 questions, **89 independently verified**, **11 unkeyed**, **100 full explanations**, 147 distinct source URLs, 3 disputed + 8 unresolved flags preserved |
| Unkeyed UI representation | all 44 option rows on the 11 unkeyed questions carry `is_correct: null`; `normaliseQuestion` keeps it null and the explanation table renders “unstated”, never four “not correct” badges |
| New/updated suites | `tests/final-answer-audit-2012.test.js` (8 tests), `tests/answer-verification-2012.test.js`, `tests/transcription-2012-staging.test.js`, `tests/rebuild-corrections.test.js`, `tests/pyq-bank.test.js`, `tests/pyq-analysis.test.js`, `tools/check.mjs` |

## 7. Independently verified checkpoint

A snapshot of the bank and all 2012 deliverables was taken after validation at
`checkpoints/2012-final-answer-audit/`:

- `mymppsc-pyq-bank.json.gz` — timestamp-free gzip of the shipped bank;
- copies of the final reassessment, 100 explanations, 100 declarations, the
  per-question audit and this report;
- `SHA256SUMS` — 13 checksums covering the frozen copies and still-live 2012 audit inputs;
- `verify.mjs` — rechecks every checksum, decompresses the historical checkpoint,
  asserts the active 2012–2024 bank preserves the 2012 paper exactly and recomputes the 2012 counts;
- `MANIFEST.md` — verification and restore instructions.

`sha256sum -c checkpoints/2012-final-answer-audit/SHA256SUMS` reports all 13
`OK`, and `node checkpoints/2012-final-answer-audit/verify.mjs` verifies the
historical snapshot and the live 2012 paper. The pre-final reassessment
is additionally preserved byte-for-byte as
`data/pyq/source/2012-recovery/answer-reassessment-2012-pre-final-audit.json`
(it is identical to the `main` version at `748706c`).

---

## 8. Known limitations

- No authenticated MPPSC answer key for 2012 Paper I was located; all 89 keys remain **independently verified**, not official.
- No original scan was supplied, so bilingual transcription defects (Q4, Q31, Q96, Q94) are documented rather than corrected.
- Historical scoring for 2012 remains unconfigured.
- Date-dependent facts (Q21, Q45, Q76, Q96) are explained against the paper’s 2013 setting.
- This audit is confined to 2012. The 2009–2011 papers are no longer part of the active bank.
