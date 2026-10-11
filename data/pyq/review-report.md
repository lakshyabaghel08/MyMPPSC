# PYQ bank review report

Generated 2026-10-11T22:21:35.932Z.

## Summary

| Check | Count |
| --- | --- |
| Questions in the source file | 571 |
| Questions in the built bank | 571 |
| Records removed | 0 |
| Records merged | 0 |
| Missing answer keys | 8 |
| Near-duplicate pairs | 36 |
| Identical-content groups | 0 |
| Ambiguous classifications | 0 |
| Low-confidence classifications | 1 |
| Reviewed classification decisions applied / rejected | 244 / 0 |
| Extraction artefacts repaired (escaped line breaks) | 9263 |
| Source-provenance fields removed before the bank was built | 1146 |
| Literal \n escapes repaired | 9263 |
| Papers given an automatic MPPSC scheme | 6 |
| Papers with no verified scheme (app asks for rules) | 0 |
| AI labels applied / preserved / rejected / malformed | 0 / 0 / 0 / 0 |

## Missing answer keys

These questions are in the bank with `supplied_answer.answer = null` and `answer_key_status = "missing"`. The app excludes them from scoring and labels them *Answer key missing*. **No answer was fabricated for any of them.**

| Question | Paper | Year | Question text (excerpt) |
| --- | --- | --- | --- |
| `MPPSC-2021-057` | MPPSC-2021-P1 | 2021 | State Chief Election Commissioner is appointed by |
| `MPPSC-2021-075` | MPPSC-2021-P1 | 2021 | The Development Monitoring and Evaluation Office (DMEO) was constituted on |
| `MPPSC-2022-046` | MPPSC-2022-P1 | 2022 | Quit India Movement was started on |
| `MPPSC-2022-059` | MPPSC-2022-P1 | 2022 | When did the Madhya Pradesh State Election Commission come into existence? |
| `MPPSC-2023-026` | MPPSC-2023-P1 | 2023 | Which of the following rights is not under the purview of the National Human Rights Commission? |
| `MPPSC-2024-021` | MPPSC-2024-P1 | 2024 | Bhimma tribe lives in which of the districts of Madhya Pradesh ? |
| `MPPSC-2024-028` | MPPSC-2024-P1 | 2024 | Which award is given for writings on the cultural tradition and specialties of tribal life in Indian literature? |
| `MPPSC-2024-079` | MPPSC-2024-P1 | 2024 | Arrange the following mountain peaks, in ascending order, according to their height: (i) Guru Shikhar (ii) Mahendragiri (iii) Anaimudi (iv)  |

## Suspected duplicates

Detected by the same similarity pass the app runs at import time (blended token and 3-word-shingle Jaccard on the question text). **Both records of every pair are kept** — the pipeline never merges or deletes a suspected duplicate, because reworded questions about the same fact are often legitimately separate.

| Question A | Question B | Similarity | Same paper? |
| --- | --- | --- | --- |
| `MPPSC-2022-086` | `MPPSC-2023-076` | 1 | no |
| `MPPSC-2021-002` | `MPPSC-2022-086` | 0.923 | no |
| `MPPSC-2021-002` | `MPPSC-2023-076` | 0.923 | no |
| `MPPSC-2020-028` | `MPPSC-2023-035` | 0.889 | no |
| `MPPSC-2024-012` | `MPPSC-2024-075` | 0.889 | yes |
| `MPPSC-2021-070` | `MPPSC-2023-035` | 0.889 | no |
| `MPPSC-2020-036` | `MPPSC-2021-058` | 0.873 | no |
| `MPPSC-2020-018` | `MPPSC-2021-056` | 0.857 | no |
| `MPPSC-2022-087` | `MPPSC-2023-074` | 0.8 | no |
| `MPPSC-2022-077` | `MPPSC-2022-083` | 0.8 | yes |
| `MPPSC-2020-028` | `MPPSC-2021-070` | 0.8 | no |
| `MPPSC-2019-048` | `MPPSC-2020-028` | 0.75 | no |
| `MPPSC-2022-083` | `MPPSC-2022-086` | 0.733 | yes |
| `MPPSC-2022-083` | `MPPSC-2023-076` | 0.733 | no |
| `MPPSC-2020-061` | `MPPSC-2022-074` | 0.706 | no |
| `MPPSC-2022-074` | `MPPSC-2022-076` | 0.706 | yes |
| `MPPSC-2020-090` | `MPPSC-2023-068` | 0.7 | no |
| `MPPSC-2022-006` | `MPPSC-2023-043` | 0.7 | no |
| `MPPSC-2020-017` | `MPPSC-2022-058` | 0.7 | no |
| `MPPSC-2020-028` | `MPPSC-2020-063` | 0.692 | yes |
| `MPPSC-2021-002` | `MPPSC-2024-012` | 0.692 | no |
| `MPPSC-2021-002` | `MPPSC-2022-083` | 0.688 | no |
| `MPPSC-2022-072` | `MPPSC-2022-077` | 0.688 | yes |
| `MPPSC-2019-024` | `MPPSC-2023-035` | 0.667 | no |
| `MPPSC-2019-024` | `MPPSC-2023-048` | 0.667 | no |
| `MPPSC-2019-048` | `MPPSC-2023-035` | 0.667 | no |
| `MPPSC-2022-086` | `MPPSC-2024-075` | 0.667 | no |
| `MPPSC-2023-076` | `MPPSC-2024-075` | 0.667 | no |
| `MPPSC-2021-084` | `MPPSC-2023-035` | 0.667 | no |
| `MPPSC-2019-018` | `MPPSC-2019-020` | 0.643 | yes |
| `MPPSC-2020-005` | `MPPSC-2020-028` | 0.636 | yes |
| `MPPSC-2022-098` | `MPPSC-2022-100` | 0.636 | yes |
| `MPPSC-2022-006` | `MPPSC-2023-041` | 0.636 | no |
| `MPPSC-2020-005` | `MPPSC-2024-012` | 0.636 | no |
| `MPPSC-2020-028` | `MPPSC-2024-012` | 0.636 | no |
| `MPPSC-2019-094` | `MPPSC-2021-096` | 0.625 | no |

## Ambiguous classifications

None.

## Low-confidence classifications

Classified, but below the 0.6 review threshold. The app marks them as uncertain.

| Question | Subject | Topic | Confidence |
| --- | --- | --- | --- |
| `MPPSC-2021-065` | General Aptitude | Logical reasoning | 0.5 |

## Source extraction findings

Reported by the source parser itself (data/pyq/source/MPPSC_PYQ_Review.json, parser 0.1.0; input `YOUR_BOOK_columns(3).md`, sha256 `126500ed672a6d16…`).

| Measure | Value |
| --- | --- |
| question blocks detected | 573 |
| records exported to intake | 571 |
| records excluded pending review | 2 |
| records flagged for review | 17 |
| missing stem | 0 |
| missing options | 1 |
| missing or unparsed answer | 9 |
| missing explanation | 7 |
| deleted question records | 0 |

**2 question block(s) the parser refused to export — they are NOT in this bank** and need manual transcription from the book:

| Id | Year / Q# | Page | Why | Preview |
| --- | --- | --- | --- | --- |
| `MPPSC-2021-081` | 2021 / 81 | 83 | printed_answer_not_parseable, duplicate_option_key, missing_or_unparsed_answer, no_usable_options | Match List - I with List - II and select the correct answer from the codes given below: List-I List-II (National Highway) (Passes through) A |
| `MPPSC-2024-039` | 2024 / 39 | 166 | missing_options, no_usable_options | Match the following districts of Madhya Pradesh with their unique product: District Product Ashoknagar B ananas Khargone Maheshwari Sarees a |

**27 numbering gap(s)** across 6 year(s). A gap may be a deleted question, an extraction miss, or a question start the parser could not recognise — the source parser explicitly warns not to assume the question is absent from the book:

- 2019: 44, 47, 61, 75, 98
- 2020: 9, 33, 77, 78, 96
- 2021: 64, 76, 80, 82, 85
- 2022: 4, 19, 84
- 2023: 2, 47, 53, 58, 60
- 2024: 19, 73, 81, 91

15 further record(s) the parser flagged but still exported:

- `MPPSC-2019-076` (2019 Q76): missing_explanation
- `MPPSC-2019-077` (2019 Q77): missing_explanation
- `MPPSC-2019-078` (2019 Q78): missing_explanation
- `MPPSC-2019-079` (2019 Q79): missing_explanation
- `MPPSC-2019-080` (2019 Q80): missing_explanation
- `MPPSC-2021-057` (2021 Q57): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2021-075` (2021 Q75): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2021-094` (2021 Q94): missing_explanation
- `MPPSC-2021-095` (2021 Q95): missing_explanation
- `MPPSC-2022-046` (2022 Q46): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2022-059` (2022 Q59): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2023-026` (2023 Q26): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2024-021` (2024 Q21): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2024-028` (2024 Q28): printed_answer_not_parseable, missing_or_unparsed_answer
- `MPPSC-2024-079` (2024 Q79): printed_answer_not_parseable, missing_or_unparsed_answer

> This is structural parsing only, not answer verification.
> Question numbering may reset each year; IDs include the detected year.
> Numbering gaps are listed per year. They may indicate deleted questions, extraction gaps, or question starts that need manual review; do not assume they are absent from the source without checking.
> The source book can contain errors; supplied answers are marked unofficial.
> Review all flagged records and run MyMPPSC's own bank builder/validator before import.

## Extraction repairs

Repairs applied to the extraction before the bank was built. No wording was invented: escape artefacts were converted back to the characters they represent, and source provenance was moved out of the app-facing data into this report.

| Repair | Value |
| --- | --- |
| Escaped line breaks converted to real newlines | 9263 in 564 string(s) |
| — in `explanation` | 9263 |
| Question source references moved out of the bank | 571 |
| Parser metadata `book_additional_information` removed | 571 |
| Parser metadata `parser_version` removed | 571 |
| Parser metadata `question_type_basis` removed | 571 |
| Parser metadata `source_answer_text_preserved_as_options` removed | 571 |
| Answer source labels removed | 563 |
| Paper names normalised | 6 |
| Paper answer-key source blocks removed | 6 |
| Paper source-file lists removed | 6 |

The bank-level provenance block that was removed is recorded in the sanitisation section below.

Question text, option text, printed answers and explanation wording are otherwise reproduced exactly as the extraction captured them.

## Reviewed classification decisions

These classification decisions were taken by a person who read each question together with its options, printed answer and explanation, in cases where the rule engine could not place the question or placed it with weak evidence. A label is stored only when every level of it exists in data/taxonomy/mppsc-taxonomy.json; the source is recorded as "reviewed", never as an AI classification.

Applied: **244**, rejected: 0, malformed lines: 0.

| Question | Decision | Subject / topic / subtopic after | Why |
| --- | --- | --- | --- |
| `MPPSC-2019-004` | changed (was `Polity`) | Polity / Constitutional bodies / Comptroller and Auditor General | Asks which Article prescribes the CAG's duties (Articles 148–151); explanation is entirely about the CAG. |
| `MPPSC-2019-006` | applied (was unclassified) | Madhya Pradesh Special / Personalities and awards of Madhya Pradesh / Sports from Madhya Pradesh | Captain Roop Singh Stadium, Gwalior — a Madhya Pradesh sports venue. |
| `MPPSC-2019-009` | applied (was unclassified) | Current Affairs / Awards and honours / Sports awards | Vikram Award 2018 (Madhya Pradesh state sports award) awardees. |
| `MPPSC-2019-010` | applied (was unclassified) | Current Affairs / Sports current affairs / Other sports events | Asks which sport a named Indian sportsperson (Muskan Kirar) belongs to. |
| `MPPSC-2019-016` | applied (was unclassified) | Madhya Pradesh Special / Schemes and institutions of Madhya Pradesh / Tourism of Madhya Pradesh | Operational/non-operational airports of Madhya Pradesh; no dedicated transport node exists in the taxonomy. |
| `MPPSC-2019-017` | applied (was unclassified) | Polity / State Government / State Legislature | Speaker of the previous Madhya Pradesh Legislative Assembly. |
| `MPPSC-2019-019` | applied (was unclassified) | Geography / Maps and location / Boundaries and neighbours | Which state does not share a boundary with Madhya Pradesh. |
| `MPPSC-2019-021` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Expansion of a computer term (VIRUS). |
| `MPPSC-2019-022` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Term for a person who breaks into computer systems (cracker). |
| `MPPSC-2019-023` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Information Technology Act, 2000 as India's first cyber law. |
| `MPPSC-2019-024` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Which listed activity is not a cybercrime. |
| `MPPSC-2019-025` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Reading the domain name out of an email address. |
| `MPPSC-2019-027` | applied (was unclassified) | Polity / Statutory and regulatory bodies / National Human Rights Commission | Tenure provisions of the Protection of Human Rights Act, 1993. |
| `MPPSC-2019-029` | applied (was unclassified) | Polity / Statutory and regulatory bodies / National Human Rights Commission | Special Public Prosecutor under section 31 of the Protection of Human Rights Act. |
| `MPPSC-2019-031` | applied (was unclassified) | Science and Technology / Science and technology developments / Space programme | SathyabamaSat, an academic-institute satellite; the alternatives are ISRO satellites. |
| `MPPSC-2019-033` | applied (was unclassified) | Science and Technology / Biology / Plant physiology | Geitonogamy — pollination between flowers of the same plant. |
| `MPPSC-2019-035` | applied (was unclassified) | Science and Technology / Biology / Human digestive system | Digestion starting in the buccal cavity (carbohydrates). |
| `MPPSC-2019-039` | applied (was unclassified) | Current Affairs / Appointments and personalities / Heads of state and government | Identifying the Croatian president present at the 2018 football World Cup final. |
| `MPPSC-2019-045` | applied (was unclassified) | History / Modern India / Socio-religious reform movements | Year of the Hindu Widow Remarriage Act, a social-reform statute. |
| `MPPSC-2019-049` | applied (was unclassified) | Geography / Geography of India / Population of India | Census decade showing the sharpest decline in India's sex ratio. |
| `MPPSC-2019-053` | applied (was unclassified) | Economy / Economy of Madhya Pradesh / Industry of Madhya Pradesh | Madhya Pradesh towns of export excellence (Dewas and Indore). |
| `MPPSC-2019-054` | applied (was unclassified) | Economy / International economy / Trade agreements | Which ministry handles India's Foreign Trade Policy; the explanation centres on the DGFT and foreign trade. |
| `MPPSC-2019-055` | applied (was unclassified) | Economy / Economy of Madhya Pradesh / State fiscal indicators | Headquarters of the Madhya Pradesh Financial Corporation. |
| `MPPSC-2019-058` | changed (was `Geography`) | Art and Culture / Heritage Sites / Forts and palaces | Mandu (Dhar district) and the Hindola Mahal — a monument complex, not physical geography. |
| `MPPSC-2019-062` | applied (was unclassified) | Current Affairs / Sports current affairs / Olympic and Asian Games | India's flag bearer at the Rio 2016 Olympics. |
| `MPPSC-2019-063` | changed (was `Current Affairs / Sports current affairs`) | Current Affairs / Sports current affairs / Commonwealth Games | India's rank in the 2018 Commonwealth Games medal tally. |
| `MPPSC-2019-065` | changed (was `Current Affairs / Sports current affairs`) | Current Affairs / Sports current affairs / Other sports events | Headquarters of the IAAF (athletics federation). |
| `MPPSC-2019-066` | applied (was unclassified) | Polity / Local self-government / Local bodies in Madhya Pradesh | Panchayat general elections held since the Madhya Pradesh State Election Commission was formed. |
| `MPPSC-2019-070` | applied (was unclassified) | Madhya Pradesh Special / Demography of Madhya Pradesh / Census 2011 | Madhya Pradesh cities and their 2011 census population. |
| `MPPSC-2019-071` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Expansion of the computing acronym JSP. |
| `MPPSC-2019-072` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Owner of the Bing search engine. |
| `MPPSC-2019-073` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Web crawler is also called a web spider. |
| `MPPSC-2019-074` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Identifying output devices of a computer. |
| `MPPSC-2019-078` | applied (was unclassified) | Polity / Citizenship and civil rights / Protection of minorities | Commencement of the SC/ST (Prevention of Atrocities) Act, 1989 — a social-justice statute protecting SC/ST citizens. |
| `MPPSC-2019-079` | applied (was unclassified) | Polity / Citizenship and civil rights / Protection of minorities | Provisions of the SC/ST (Prevention of Atrocities) Act, 1989. |
| `MPPSC-2019-082` | confirmed (was `Science and Technology / Biology`) | Science and Technology / Biology / Hormones and glands | Leydig cells and androgen secretion. |
| `MPPSC-2019-085` | applied (was unclassified) | Science and Technology / Health and diseases | Classification of opium as a depressant drug — health/pharmacology question with no exact taxonomy subtopic. |
| `MPPSC-2019-086` | applied (was unclassified) | Current Affairs / National current affairs / National events | Chief guest at the 2019 Republic Day celebration. |
| `MPPSC-2019-089` | applied (was unclassified) | Economy / Economy of Madhya Pradesh / State welfare schemes | Mukhyamantri Kanyadan Yojana — a Madhya Pradesh welfare scheme amount. |
| `MPPSC-2019-092` | applied (was unclassified) | History / Modern India / Acts and constitutional development | Communal representation introduced by the Indian Councils Act 1909 (Morley–Minto). |
| `MPPSC-2019-095` | applied (was unclassified) | History / Ancient India / Ancient science and literature | Dashpur (Mandsaur) inscription and the silk-weavers guild; an epigraphic source about ancient trade guilds. |
| `MPPSC-2019-100` | applied (was unclassified) | Geography / Maps and location / Boundaries and neighbours | Length of India's international boundaries with its neighbours, in ascending order. |
| `MPPSC-2020-005` | applied (was unclassified) | Economy / Agriculture and rural economy / Cropping patterns | Cash crops versus coarse cereals (bajra). |
| `MPPSC-2020-006` | changed (was `Polity`) | Polity / Union Executive / Prime Minister and Council of Ministers | Matching states to chief ministers who later became Prime Minister of India. |
| `MPPSC-2020-011` | applied (was unclassified) | Current Affairs / International current affairs / Places in news | The February 2021 coup in Myanmar. |
| `MPPSC-2020-012` | applied (was unclassified) | Current Affairs / Sports current affairs / Olympic and Asian Games | Headquarters of the International Olympic Committee. |
| `MPPSC-2020-014` | applied (was unclassified) | Madhya Pradesh Special / Personalities and awards of Madhya Pradesh / State awards | Vishwamitra Award — the highest Madhya Pradesh award for sports coaches. |
| `MPPSC-2020-015` | changed (was `Geography / Physiography of Madhya Pradesh`) | Madhya Pradesh Special / Schemes and institutions of Madhya Pradesh / Educational institutions | Location of the Madhya Pradesh state archery academy, a training institution. |
| `MPPSC-2020-017` | changed (was `Polity / Statutory and regulatory bodies`) | Economy / Indian Economy / NITI Aayog | First vice-chairman of NITI Aayog. |
| `MPPSC-2020-019` | applied (was unclassified) | Environment / Environmental laws and institutions / National Green Tribunal | Appeal window to the Supreme Court against an NGT decision. |
| `MPPSC-2020-020` | applied (was unclassified) | Polity / Citizenship and civil rights / Right to Food | State Food Commission created by the National Food Security Act, 2013. |
| `MPPSC-2020-021` | applied (was unclassified) | History / History of Madhya Pradesh / Princely states and agencies | Founder of the princely state of Bhopal (Dost Mohammad Khan). |
| `MPPSC-2020-035` | applied (was unclassified) | Current Affairs / National current affairs / National events | Chauri Chaura centenary celebrations inaugurated in February 2021. |
| `MPPSC-2020-036` | changed (was `Polity`) | Polity / Constitutional bodies / Election Commission of India | Salary and tenure of the Chief Election Commissioner. |
| `MPPSC-2020-041` | applied (was unclassified) | Art and Culture / Literature and languages / Literature of Madhya Pradesh | Real name of the Madhya Pradesh poet Balkavi Bairagi. |
| `MPPSC-2020-042` | applied (was unclassified) | Art and Culture / Heritage Sites / Temples of Madhya Pradesh | Ujjain's parikrama of seven sagars, nine Narayanas and 84 Mahadevas — a religious-heritage question. |
| `MPPSC-2020-046` | applied (was unclassified) | Science and Technology / Biology / Genetics | Characteristic features of the genetic code. |
| `MPPSC-2020-047` | applied (was unclassified) | Science and Technology / Science and technology developments / Research institutes | Location of the National Institute of Virology (Pune). |
| `MPPSC-2020-048` | applied (was unclassified) | Current Affairs / International current affairs / Bilateral relations | India–Norway task force on the blue economy. |
| `MPPSC-2020-049` | applied (was unclassified) | Economy / Agriculture and rural economy / Cropping patterns | Hybrid mango variety (Ratna) from a Neelum × Alphonso cross — horticultural crop variety. |
| `MPPSC-2020-051` | applied (was unclassified) | History / Modern India / Indian National Congress | Historians' views on the origins of Indian nationalism — historiography of the national movement. |
| `MPPSC-2020-053` | applied (was unclassified) | History / Modern India / British conquest and consolidation | Charles Metcalfe's 'tiny republics' remark on the Indian village system under British rule. |
| `MPPSC-2020-054` | applied (was unclassified) | History / Modern India / Acts and constitutional development | States Reorganisation Act, 1956 — a constitutional reorganisation statute. |
| `MPPSC-2020-057` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Gartner e-governance maturity model — an IT/computer-applications question. |
| `MPPSC-2020-058` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Representing a social network as a graph — computer applications. |
| `MPPSC-2020-059` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | IPv6 address length — networking. |
| `MPPSC-2020-060` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Collaborative filtering definition. |
| `MPPSC-2020-061` | applied (was unclassified) | Geography / Geography of India / Population of India | Lowest decadal population growth among states in the 2011 census. |
| `MPPSC-2020-062` | applied (was unclassified) | Economy / Industry and infrastructure / Core industries | Raw materials of the fertiliser industry — a core industry. |
| `MPPSC-2020-064` | changed (was `Economy / Indian Economy`) | Geography / Economic and human geography | Matching world agricultural regions with countries (commercial dairy in Denmark etc.). |
| `MPPSC-2020-065` | applied (was unclassified) | Geography / Economic and human geography / Energy resources | States with the best wind-power potential. |
| `MPPSC-2020-085` | applied (was unclassified) | Geography / Geography of India / Mineral resources of India | Non-metallic mineral (marble) among metallic minerals. |
| `MPPSC-2020-086` | applied (was unclassified) | Science and Technology / Biology / Human nervous system | Twelve pairs of cranial nerves. |
| `MPPSC-2020-088` | applied (was unclassified) | Science and Technology / Chemistry / Chemistry in everyday life | Monosodium glutamate as a flavour enhancer. |
| `MPPSC-2020-089` | applied (was unclassified) | Polity / Statutory and regulatory bodies | Year of the Disaster Management Act, 2005 — the statute behind the NDMA; the taxonomy has no disaster-management node. |
| `MPPSC-2020-091` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Primary versus secondary computer memory. |
| `MPPSC-2020-092` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Expansion of XML. |
| `MPPSC-2020-093` | applied (was unclassified) | Science and Technology / Physics / Light and optics | Microwave frequency band in the electromagnetic spectrum. |
| `MPPSC-2020-094` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Blowfish symmetric encryption algorithm. |
| `MPPSC-2020-095` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | PUMA acronym in robotics — computer/automation terminology. |
| `MPPSC-2020-099` | applied (was unclassified) | Art and Culture / Culture of Madhya Pradesh / Cultural institutions of Madhya Pradesh | City of the Madhya Pradesh Tribal Museum. |
| `MPPSC-2020-100` | applied (was unclassified) | Madhya Pradesh Special / Schemes and institutions of Madhya Pradesh / State welfare schemes | Akanksha Yojana of the Madhya Pradesh tribal affairs department. |
| `MPPSC-2021-002` | changed (was `Geography`) | Geography / Climate and soils of Madhya Pradesh | Statements about the climate of Madhya Pradesh (Tropic of Cancer, Gwalior's continental climate). |
| `MPPSC-2021-007` | applied (was unclassified) | Current Affairs / International current affairs / International organisations | Founding year of the World Health Organization. |
| `MPPSC-2021-010` | applied (was unclassified) | Science and Technology / Chemistry / Chemistry in everyday life | Phosphatase test used in the analysis of milk — applied chemistry/health testing. |
| `MPPSC-2021-015` | applied (was unclassified) | Economy / Agriculture and rural economy / Cropping patterns | Truck farming — intensive vegetable cultivation. |
| `MPPSC-2021-016` | applied (was unclassified) | Current Affairs / International current affairs | United Nations International Year of Millets, 2023. |
| `MPPSC-2021-017` | applied (was unclassified) | Current Affairs / Current affairs of Madhya Pradesh / State events | Vimukta Jati Day observed in Madhya Pradesh. |
| `MPPSC-2021-026` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Concepts introduced by the Information Technology Act, 2000. |
| `MPPSC-2021-027` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | B2B/C2C commerce models and dynamic pricing. |
| `MPPSC-2021-028` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Router — networking device. |
| `MPPSC-2021-029` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Domain Name System. |
| `MPPSC-2021-030` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | C2B e-commerce price-setting model. |
| `MPPSC-2021-032` | applied (was unclassified) | Art and Culture / Paintings and sculpture / Modern Indian painters | Painters associated with Madhya Pradesh (Bendre, Chinchalkar and others). |
| `MPPSC-2021-035` | applied (was unclassified) | History / Ancient India / Ancient science and literature | Dashpur (Mandsaur) inscription — the 'first advertisement of the world'; an epigraphic source. |
| `MPPSC-2021-036` | confirmed (was `History / Modern India`) | History / Modern India / Acts and constitutional development | Federal system proposed by the Government of India Act, 1935. |
| `MPPSC-2021-043` | applied (was unclassified) | Current Affairs / Sports current affairs / Other sports events | Sport associated with a named Madhya Pradesh player. |
| `MPPSC-2021-046` | applied (was unclassified) | Geography / Physical Geography / Earthquakes and volcanoes | Circum-Pacific belt with the most volcanic eruptions. |
| `MPPSC-2021-048` | applied (was unclassified) | Geography / Geography of India / Agriculture in India | Indira Gandhi Canal and agriculture in western Rajasthan. |
| `MPPSC-2021-049` | applied (was unclassified) | Geography / Geography of India / Population of India | Densely populated world regions and their dependence on agriculture — population distribution. |
| `MPPSC-2021-050` | changed (was `Geography / Economic and human geography`) | Geography / Geography of India / Population of India | Level of urbanisation in the 2011 census. |
| `MPPSC-2021-051` | applied (was unclassified) | History / Modern India / British conquest and consolidation | Ranjit Singh's Sukerchakia misl — consolidation of political power in Punjab before British annexation. |
| `MPPSC-2021-053` | confirmed (was `History / Modern India`) | History / Modern India / Indian National Congress | Lala Lajpat Rai's description of Congress sessions. |
| `MPPSC-2021-057` | changed (was `Polity`) | Polity / Constitutional bodies | Appointment of the State Election Commissioner by the Governor; the taxonomy's constitutional-bodies topic holds the election machinery. |
| `MPPSC-2021-058` | changed (was `Polity`) | Polity / Constitutional bodies / Election Commission of India | Salary and tenure of the Chief Election Commissioner. |
| `MPPSC-2021-061` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Virtual keyboards and malware protection. |
| `MPPSC-2021-062` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Email spoofing definition. |
| `MPPSC-2021-063` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Types of network servers. |
| `MPPSC-2021-069` | applied (was unclassified) | Art and Culture / Festivals and fairs / Fairs of Madhya Pradesh | Gotmar fair of Chhindwara district. |
| `MPPSC-2021-075` | changed (was `Polity`) | Economy / Indian Economy / NITI Aayog | Development Monitoring and Evaluation Office (DMEO) under NITI Aayog. |
| `MPPSC-2021-078` | applied (was unclassified) | Polity / State Government / State Legislature | Protem Speaker/Speaker/Deputy Speaker of the Madhya Pradesh Legislative Assembly. |
| `MPPSC-2021-087` | applied (was unclassified) | Science and Technology / Biology | Organ in which Sertoli cells are found; the taxonomy's subtopics do not cover reproductive histology beyond hormones and glands. |
| `MPPSC-2021-088` | applied (was unclassified) | Current Affairs / International current affairs / International organisations | UNICEF headquarters. |
| `MPPSC-2021-095` | applied (was unclassified) | Economy / Poverty and human development / Inclusive growth | Launch year of the Mid-Day Meal Scheme — a social-welfare programme. |
| `MPPSC-2021-098` | applied (was unclassified) | History / Medieval India / Medieval administration and revenue | Chola village administration (Uttaramerur-style village autonomy). |
| `MPPSC-2022-001` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Definition of e-governance — governance delivered through technology. |
| `MPPSC-2022-002` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Examples of virtual assistants. |
| `MPPSC-2022-005` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Dimensions of e-commerce (global reach). |
| `MPPSC-2022-006` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Advantages and disadvantages of robots — automation/IT. |
| `MPPSC-2022-007` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Social media optimization — internet/marketing technology. |
| `MPPSC-2022-010` | applied (was unclassified) | Science and Technology / Physics / Modern physics | Electron-hole pair generation in semiconductor devices. |
| `MPPSC-2022-011` | applied (was unclassified) | Current Affairs / Science and technology current affairs / Defence exercises | AFINDEX-2023, the Africa-India joint field training exercise. |
| `MPPSC-2022-012` | applied (was unclassified) | Science and Technology / Science and technology developments / Defence technology | Indian Army quantum laboratory established at Mhow, Madhya Pradesh. |
| `MPPSC-2022-013` | applied (was unclassified) | Current Affairs / Current affairs of Madhya Pradesh / State events | Global Investors Summit 2023 held in Indore, Madhya Pradesh. |
| `MPPSC-2022-015` | applied (was unclassified) | Current Affairs / International current affairs / International organisations | Headquarters of the FAO. |
| `MPPSC-2022-016` | applied (was unclassified) | Current Affairs / National current affairs / Government schemes and launches | Saubhagya Scheme and the Ministry of Power. |
| `MPPSC-2022-017` | applied (was unclassified) | Current Affairs / Appointments and personalities | Who held the post of Chief of the Army Staff in April 2023 — an appointment-in-news question. |
| `MPPSC-2022-020` | applied (was unclassified) | Current Affairs / Sports current affairs / Other sports events | Golden Ball award at the 2022 FIFA World Cup. |
| `MPPSC-2022-024` | applied (was unclassified) | History / History of Madhya Pradesh | Arab accounts of Kalachuri ruler Gangeyadeva and his capital Tripuri (Madhya Pradesh); the taxonomy has no Kalachuri subtopic. |
| `MPPSC-2022-025` | applied (was unclassified) | Art and Culture / Literature and languages / Literature of Madhya Pradesh | Nirmal Verma Award of the Madhya Pradesh Culture Department. |
| `MPPSC-2022-028` | applied (was unclassified) | Madhya Pradesh Special / Personalities and awards of Madhya Pradesh / Notable personalities | Pandit Dwarka Prasad Mishra and the newspaper he edited — a Madhya Pradesh personality. |
| `MPPSC-2022-031` | applied (was unclassified) | Science and Technology / Health and diseases / Public health programmes | AYUSH — the Indian systems of medicine under the health ministry. |
| `MPPSC-2022-033` | applied (was unclassified) | Economy / Agriculture and rural economy / Food processing | FPO quality mark mandatory on processed fruit products. |
| `MPPSC-2022-034` | applied (was unclassified) | Science and Technology / Biology / Genetics | Bt brinjal — a genetically modified crop for insect resistance. |
| `MPPSC-2022-035` | applied (was unclassified) | Science and Technology / Biology / Human skeletal system | Pivot joint between the atlas and axis vertebrae. |
| `MPPSC-2022-037` | applied (was unclassified) | Environment / Ecology and biodiversity / Ecosystem | Ecotone — the transition zone between two ecosystems. |
| `MPPSC-2022-039` | applied (was unclassified) | Geography / Physical Geography / Atmosphere and weather | Anemometer measures wind velocity. |
| `MPPSC-2022-041` | applied (was unclassified) | History / Modern India / British conquest and consolidation | Leader of the Santhal rebellion against British rule. |
| `MPPSC-2022-043` | applied (was unclassified) | History / Medieval India / Bhakti and Sufi movements | Alvars and Nayanars — the Bhakti tradition of south India. |
| `MPPSC-2022-050` | applied (was unclassified) | History / Modern India / Socio-religious reform movements | Paramahansa Mandali — a nineteenth-century socio-religious reform society. |
| `MPPSC-2022-054` | applied (was unclassified) | Polity / Statutory and regulatory bodies / Central Vigilance Commission | Central Vigilance Commission and the Santhanam Committee. |
| `MPPSC-2022-057` | changed (was `Polity`) | Polity / Constitutional bodies / Comptroller and Auditor General | CAG salary and service conditions in the Second Schedule. |
| `MPPSC-2022-063` | applied (was unclassified) | Economy / Industry and infrastructure | Benefits of industrial development and trade; the taxonomy's industry topic is the closest node. |
| `MPPSC-2022-072` | applied (was unclassified) | Geography / Economic and human geography / Energy resources | Wind power capacity of Indian states. |
| `MPPSC-2022-075` | changed (was `Geography`) | Geography / World Geography | Countries the trans-boundary Mekong river flows through; no river subtopic exists under world geography. |
| `MPPSC-2022-076` | applied (was unclassified) | Geography / Geography of India / Population of India | Female literacy by state in the 2011 census. |
| `MPPSC-2022-078` | applied (was unclassified) | Geography / Geography of India / Agriculture in India | Largest producer of groundnuts in 2020–21 — crop production by state. |
| `MPPSC-2022-083` | changed (was `Geography`) | Economy / Economy of Madhya Pradesh / Minerals of Madhya Pradesh | Iron ore deposits and production in Madhya Pradesh. |
| `MPPSC-2022-093` | applied (was unclassified) | Economy / Economy of Madhya Pradesh / State welfare schemes | Ladli Bahna Yojana amount — a Madhya Pradesh welfare scheme. |
| `MPPSC-2022-097` | changed (was `Polity / Local self-government`) | Polity / Local self-government / Local bodies in Madhya Pradesh | Minimum population for declaring a Gram Panchayat in Madhya Pradesh. |
| `MPPSC-2022-099` | changed (was `Polity`) | Polity / State Government / Chief Minister and State Council of Ministers | Who presides over the Madhya Pradesh Council of Ministers in the Chief Minister's absence. |
| `MPPSC-2023-003` | applied (was unclassified) | Environment / Ecology and biodiversity / Biodiversity | India's global biodiversity hotspots. |
| `MPPSC-2023-005` | applied (was unclassified) | Science and Technology / Health and diseases / Public health programmes | National nutrition programmes of the Government of India. |
| `MPPSC-2023-009` | applied (was unclassified) | Science and Technology / Biology / Human skeletal system | Osteoclasts and bone remodelling. |
| `MPPSC-2023-011` | applied (was unclassified) | Economy / Poverty and human development / Poverty estimation | Multidimensional poverty improvement reported by the Madhya Pradesh State Policy and Planning Commission. |
| `MPPSC-2023-014` | applied (was unclassified) | Madhya Pradesh Special / Schemes and institutions of Madhya Pradesh / State welfare schemes | Tantya Mama Economic Welfare Scheme. |
| `MPPSC-2023-015` | applied (was unclassified) | Economy / Economy of Madhya Pradesh / Industry of Madhya Pradesh | Transformer manufacturing cluster in Gwalior, Madhya Pradesh. |
| `MPPSC-2023-019` | changed (was `Polity`) | Polity / State Government / State Legislature | Speaker decides whether a bill is a money bill in a state legislature. |
| `MPPSC-2023-024` | applied (was unclassified) | Polity / Citizenship and civil rights / Right to Food | Food commission as a statutory body under the National Food Security Act, 2013. |
| `MPPSC-2023-031` | applied (was unclassified) | Current Affairs / Sports current affairs / Other sports events | Headquarters of the Amateur Kabaddi Federation of India. |
| `MPPSC-2023-032` | applied (was unclassified) | Current Affairs / Sports current affairs / Olympic and Asian Games | Indian women's hockey team at the Tokyo 2020 Olympics. |
| `MPPSC-2023-035` | applied (was unclassified) | Science and Technology / Science and technology developments / Research institutes | Matching national research institutes with their locations. |
| `MPPSC-2023-036` | applied (was unclassified) | Current Affairs / Sports current affairs / Cricket | India's first One Day International cricket match. |
| `MPPSC-2023-037` | applied (was unclassified) | Current Affairs / Days and dates / International days | International Yoga Day, 21 June. |
| `MPPSC-2023-038` | applied (was unclassified) | Current Affairs / National current affairs / National events | First Indian woman soldier skydiver — a national achievement in the news. |
| `MPPSC-2023-039` | changed (was `Current Affairs / Awards and honours`) | Current Affairs / Appointments and personalities | Identifying the industrialist known as the 'Steel Man of India'. |
| `MPPSC-2023-040` | changed (was `Economy`) | Economy / Banking and finance / Reserve Bank of India | Central Banking Awards 2023 and the Governor of the Reserve Bank of India. |
| `MPPSC-2023-041` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | E-procurement portals — an e-governance/IT question. |
| `MPPSC-2023-042` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | DSL internet connection over telephone lines. |
| `MPPSC-2023-043` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Advantages of e-commerce. |
| `MPPSC-2023-044` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Phishing attacks. |
| `MPPSC-2023-045` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Purpose of a firewall. |
| `MPPSC-2023-046` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | B2C e-commerce business models. |
| `MPPSC-2023-048` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Web browsers. |
| `MPPSC-2023-049` | changed (was `Science and Technology`) | Science and Technology / Science and technology developments / Information technology | ChatGPT and OpenAI. |
| `MPPSC-2023-050` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Second-generation computers and transistors. |
| `MPPSC-2023-054` | applied (was unclassified) | Geography / Physical Geography / Landforms and their evolution | Diastrophism — crustal deformation (orogeny, folding, faulting). |
| `MPPSC-2023-059` | applied (was unclassified) | Geography / Economic and human geography / Energy resources | Early use of geothermal heat; no dedicated geothermal subtopic exists. |
| `MPPSC-2023-063` | applied (was unclassified) | History / Modern India / Partition and independence | Integration of 222 princely states into the Saurashtra union in 1948. |
| `MPPSC-2023-064` | applied (was unclassified) | History / Modern India / Partition and independence | Chaudhry Rahmat Ali and the coining of the term 'Pakistan'. |
| `MPPSC-2023-073` | changed (was `Geography`) | Geography / Climate and soils of Madhya Pradesh / Soil types | Characteristics of black (cotton) soil in Madhya Pradesh. |
| `MPPSC-2023-077` | applied (was unclassified) | Environment / Forests of Madhya Pradesh / Forest types | Forest types found and not found in Madhya Pradesh. |
| `MPPSC-2023-079` | applied (was unclassified) | Geography / Geography of India / Transport in India | Basic Road Statistics of Madhya Pradesh; the taxonomy has no Madhya Pradesh transport node. |
| `MPPSC-2023-080` | applied (was unclassified) | Economy / Economy of Madhya Pradesh / Agriculture of Madhya Pradesh | Cotton production by district in Madhya Pradesh. |
| `MPPSC-2023-081` | applied (was unclassified) | Polity / Union Executive / President of India | Composition of the electoral college for the presidential election (Article 54). |
| `MPPSC-2023-086` | changed (was `History / Modern India`) | Economy / Banking and finance / Commercial banks | Bank nationalisation of 1980. |
| `MPPSC-2023-094` | applied (was unclassified) | Art and Culture / Heritage Sites / Temples of Madhya Pradesh | Chitrakoot (also called Brahmapuri), a religious place on the Madhya Pradesh border. |
| `MPPSC-2023-099` | applied (was unclassified) | Art and Culture / Literature and languages / Literature of Madhya Pradesh | Balkrishna Sharma 'Naveen' and his kavyas dedicated to Ganesh Shankar Vidyarthi. |
| `MPPSC-2023-100` | changed (was `History`) | History / History of Madhya Pradesh / Freedom struggle in Madhya Pradesh | Thona-Luhari firing incident (1939) in Niwari district. |
| `MPPSC-2024-003` | applied (was unclassified) | Science and Technology / Health and diseases / Non-communicable diseases | Lathyrism caused by regular consumption of khesari dal. |
| `MPPSC-2024-005` | applied (was unclassified) | Environment / Pollution and climate change / Ozone depletion | Dobson units measure ozone layer thickness. |
| `MPPSC-2024-006` | applied (was unclassified) | Science and Technology / Biology / Human skeletal system | Number of cervical vertebrae. |
| `MPPSC-2024-016` | changed (was `Polity`) | Polity / Constitution of India / Making of the Constitution | K. M. Munshi and the Constitution Drafting Committee. |
| `MPPSC-2024-023` | changed (was `History`) | Madhya Pradesh Special / Tribes of Madhya Pradesh / Bhil | Tantya Mama (Tantya Bhil) and the Bhil tribe. |
| `MPPSC-2024-028` | applied (was unclassified) | Current Affairs / Awards and honours / National awards | National awards for writings on tribal life; the printed answer key is missing and the source notes the item was deleted. |
| `MPPSC-2024-029` | changed (was `Polity`) | Madhya Pradesh Special / Schemes and institutions of Madhya Pradesh / State welfare schemes | Self-employment scheme for tribals in Madhya Pradesh. |
| `MPPSC-2024-030` | applied (was unclassified) | Madhya Pradesh Special / Tribes of Madhya Pradesh / Tribal culture | Vanya, the Tribal Affairs Department's publishing house for tribal literature. |
| `MPPSC-2024-035` | applied (was unclassified) | Economy / Economy of Madhya Pradesh / Agriculture of Madhya Pradesh | UNNATI (Agri-GIS) project of the Madhya Pradesh agriculture department. |
| `MPPSC-2024-037` | changed (was `Economy`) | Economy / Economy of Madhya Pradesh / State fiscal indicators | Per capita income of Madhya Pradesh compared with India. |
| `MPPSC-2024-041` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Kernel of the UNIX operating system. |
| `MPPSC-2024-042` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Phishing attack definition. |
| `MPPSC-2024-043` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Kurrently, a real-time search engine. |
| `MPPSC-2024-044` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | The Imitation Game as the original name of the Turing Test. |
| `MPPSC-2024-045` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Founder of Twitter. |
| `MPPSC-2024-046` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | Four pillars of e-governance. |
| `MPPSC-2024-047` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | LinkedIn — a professional social network. |
| `MPPSC-2024-049` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | MPEG abbreviation. |
| `MPPSC-2024-050` | applied (was unclassified) | Science and Technology / Science and technology developments / Information technology | W3C — World Wide Web Consortium. |
| `MPPSC-2024-052` | changed (was `Geography`) | Economy / Economy of Madhya Pradesh / Agriculture of Madhya Pradesh | Where soybean cultivation began in Madhya Pradesh. |
| `MPPSC-2024-053` | applied (was unclassified) | Economy / Industry and infrastructure / Core industries | Rock phosphate as a raw material of the fertiliser industry. |
| `MPPSC-2024-056` | changed (was `Geography / Climate and soils of Madhya Pradesh`) | Environment / Forests of Madhya Pradesh / Minor forest produce | Nationalisation of bamboo in Madhya Pradesh (1973). |
| `MPPSC-2024-058` | applied (was unclassified) | Economy / Economy of Madhya Pradesh / Industry of Madhya Pradesh | Establishment of BHEL Bhopal with British collaboration. |
| `MPPSC-2024-061` | applied (was unclassified) | Art and Culture / Literature and languages / Books and authors | Author of the Bengali historical novel Durgesh Nandini. |
| `MPPSC-2024-070` | applied (was unclassified) | Art and Culture / Literature and languages | Inner limbs (antaranga) of Ashtanga Yoga, i.e. Patanjali's Yoga Sutras; the taxonomy has no yoga/philosophy node, so it is filed under Sansk |
| `MPPSC-2024-078` | applied (was unclassified) | Current Affairs / National current affairs / National events | Cyclone Tauktae, which struck the west coast in 2021. |
| `MPPSC-2024-079` | applied (was unclassified) | Geography / Geography of India / Physiography of India | Mountain peaks of India arranged by height; the printed key is missing and the source notes the item was deleted. |
| `MPPSC-2024-080` | applied (was unclassified) | Geography / Geography of India / Population of India | Lowest population density among states in the 2011 census. |
| `MPPSC-2024-082` | changed (was `Polity`) | Current Affairs / Appointments and personalities / Constitutional appointments | Nomination to the Rajya Sabha in 2024 (Sudha Murty). |
| `MPPSC-2024-083` | applied (was unclassified) | Current Affairs / Awards and honours / Sports awards | Arjuna Award 2023 to a Madhya Pradesh para-canoe athlete. |
| `MPPSC-2024-084` | applied (was unclassified) | Art and Culture / Culture of Madhya Pradesh / Folk art of Madhya Pradesh | Maach folk theatre of Malwa; the question names a Maach artist. |
| `MPPSC-2024-086` | applied (was unclassified) | Current Affairs / Sports current affairs / Other sports events | D. Gukesh winning the 2024 FIDE Candidates Tournament. |
| `MPPSC-2024-088` | changed (was `Polity`) | Polity / Statutory and regulatory bodies / Lokpal and Lokayukta | Appointment of the Lokpal chairperson in 2024. |
| `MPPSC-2024-093` | changed (was `History`) | History / Prehistory and Art | Kayatha, a Chalcolithic site in Madhya Pradesh; the taxonomy's subtopics do not name Chalcolithic cultures. |
| `MPPSC-2024-094` | changed (was `Environment / Wildlife of Madhya Pradesh`) | Environment / Protected areas / Wildlife sanctuaries | Sanctuary–district pairings, one deliberately false. |
| `MPPSC-2024-096` | applied (was unclassified) | Art and Culture / Culture of Madhya Pradesh / Folk art of Madhya Pradesh | Gammat folk theatre of Malwa and its sutradhar. |
| `MPPSC-2024-099` | applied (was unclassified) | Art and Culture / Paintings and sculpture | Kohbar marriage wall painting; the taxonomy has no folk-painting subtopic under this topic. |
| `MPPSC-2024-100` | applied (was unclassified) | History / History of Madhya Pradesh | Yashodharman's Sondani (Mandsaur) inscription; no Aulikara subtopic exists in the taxonomy. |
| `MPPSC-2021-065` | applied (was unclassified) | General Aptitude / Logical reasoning | Definitional item — knowledge as justified true belief. The taxonomy has no philosophy/epistemology node; kept as a low-confidence placement |
| `MPPSC-2021-019` | changed (was `Madhya Pradesh Special / Tribes of Madhya Pradesh`) | Madhya Pradesh Special / Tribes of Madhya Pradesh / Gond | Smt. Durga Bai Vyam is a Gond painter (printed key: Gond Tradition); the rule engine had guessed the Baiga subtopic from weak signal. |
| `MPPSC-2021-068` | changed (was `Madhya Pradesh Special / Tribes of Madhya Pradesh`) | History / History of Madhya Pradesh / Freedom struggle in Madhya Pradesh | Statement-matching item on freedom fighters of Madhya Pradesh (Bhil leaders, Shankar Shah, Ramgarh, Indore); the rule engine had guessed a t |
| `MPPSC-2019-007` | applied (was unclassified) | Madhya Pradesh Special / Schemes and institutions of Madhya Pradesh / Educational institutions | State Equestrian Academy (Bhopal) — a state-run training institution; the taxonomy has no sports-academy node. |
| `MPPSC-2019-059` | applied (was unclassified) | Art and Culture / Festivals and fairs / Fairs of Madhya Pradesh | Jalbihari fair at Charan Paduka, Chhatarpur district — a fair of Madhya Pradesh. |
| `MPPSC-2021-052` | applied (was unclassified) | History / Modern India / Partition and independence | Princely States portfolio in the interim government — integration of princely states. |
| `MPPSC-2022-032` | applied (was unclassified) | Environment / Pollution and climate change / Water pollution | Itai-itai disease is caused by cadmium pollution of water and food. |
| `MPPSC-2022-082` | applied (was unclassified) | Geography / Rivers of Madhya Pradesh / Dams and reservoirs | Irrigation projects (Barna, Kolar, Sukta, Punasa) matched with their districts in Madhya Pradesh. |
| `MPPSC-2023-022` | applied (was unclassified) | Economy / Indian Economy / NITI Aayog | NITI Aayog constituted on 1 January 2015 in place of the Planning Commission. |
| `MPPSC-2023-095` | applied (was unclassified) | Art and Culture / Literature and languages / Books and authors | 'Mukul' is a poetry collection by Subhadra Kumari Chauhan. |
| `MPPSC-2019-014` | changed (was `History`) | History / History of Madhya Pradesh / Paramara dynasty | Sources (Navsahasank Charit, Prabandha Chintamani, Udaipur Prashasti) on the Parmar dynasty of Malwa. |
| `MPPSC-2020-031` | changed (was `Current Affairs / Awards and honours`) | Art and Culture / Paintings and sculpture / Tribal art | Bhuri Bai, a Bhil artist from Madhya Pradesh, is known for her paintings. |
| `MPPSC-2023-052` | changed (was `Geography`) | Geography / World Geography | Gaza Strip on the eastern Mediterranean coast; no water-body subtopic exists under world geography. |
| `MPPSC-2023-067` | confirmed (was `History / Medieval India`) | History / Medieval India / Mughal empire | Nadir Shah's 1739 invasion and the Battle of Karnal during Mughal rule. |
| `MPPSC-2023-076` | changed (was `Geography`) | Geography / Climate and soils of Madhya Pradesh / Monsoon in Madhya Pradesh | Statements about the climate of Madhya Pradesh. |
| `MPPSC-2024-055` | changed (was `Geography`) | Geography / Climate and soils of Madhya Pradesh / Soil types | Black soil of Madhya Pradesh is formed from basalt. |
| `MPPSC-2024-071` | changed (was `Geography`) | Geography / Geography of India / Rivers of India | Rivers of India matched with their areas of origin. |

## App-facing bank sanitisation

The app-facing bank carries no source provenance. Everything listed here was removed from the file the app loads and is kept in this review report instead.

| What | Value |
| --- | --- |
| Bank id | `mppsc-solved-pyq-book-2019-2024` → `mppsc-prelims-paper1-2019-2024` |
| Bank name | MPPSC Prelims Paper I (General Studies) 2019–2024 |
| Paper ids | `MPPSC-2019-GS1-BOOK` → `MPPSC-2019-P1`<br />`MPPSC-2020-GS1-BOOK` → `MPPSC-2020-P1`<br />`MPPSC-2021-GS1-BOOK` → `MPPSC-2021-P1`<br />`MPPSC-2022-GS1-BOOK` → `MPPSC-2022-P1`<br />`MPPSC-2023-GS1-BOOK` → `MPPSC-2023-P1`<br />`MPPSC-2024-GS1-BOOK` → `MPPSC-2024-P1` |
| Question `source_reference` removed by the repair pass | 571 |
| Question `source_reference` still present when the sanitiser ran | 0 |
| `supplied_answer.source` still present when the sanitiser ran | 0 |
| Paper-level answer-key blocks removed | 6 |
| Paper source-file lists removed | 0 |
| Parser metadata fields removed (none) | 0 |
| Review bookkeeping fields removed from `metadata` | 244 |
| Answer keys re-labelled `supplied` | 563 |
| Reviewed classification decisions kept as classification | 244 |
| Questions kept without a key | 8 |
| Literal \n escapes repaired by the sanitiser (the repair pass does the rest) | 0 in 0 string(s) |

The bank-level provenance block that was removed (kept here as the audit record):

```json
{
  "kind": "unspecified",
  "verified": false,
  "notes": "The intake file did not describe provenance. Describe where these questions came from and whether the key has been checked before relying on them.",
  "sources": []
}
```

### Automatic marking scheme written into each paper

| Paper | Year | Scheme | Correct | Incorrect | Unanswered | Total | Duration | Evidence confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MPPSC-2019-P1` | 2019 | mppsc-sse-prelims-2019-2025 | +2 | 0 | 0 | 200 | 120 | verified |
| `MPPSC-2020-P1` | 2020 | mppsc-sse-prelims-2019-2025 | +2 | 0 | 0 | 200 | 120 | verified |
| `MPPSC-2021-P1` | 2021 | mppsc-sse-prelims-2019-2025 | +2 | 0 | 0 | 200 | 120 | verified |
| `MPPSC-2022-P1` | 2022 | mppsc-sse-prelims-2019-2025 | +2 | 0 | 0 | 200 | 120 | verified |
| `MPPSC-2023-P1` | 2023 | mppsc-sse-prelims-2019-2025 | +2 | 0 | 0 | 200 | 120 | verified |
| `MPPSC-2024-P1` | 2024 | mppsc-sse-prelims-2019-2025 | +2 | 0 | 0 | 200 | 120 | verified |

## Content integrity

| Check | Count |
| --- | --- |
| Variants with no question text | 0 |
| Variants with fewer than two options | 0 |
| Empty option text | 0 |
| Answers that do not match an option key | 0 |
| Duplicated option keys | 0 |
| Multi-answer keys on single-correct questions | 0 |
| Questions with no question number | 0 |
| Disputed keys | 0 |
| Verified answer differs from printed key | 0 |
| Records rejected by validation | 0 |
| Unreviewed explanations | 564 |
| Questions without an explanation | 7 |
| Duplicate ids in the source | 0 |
| Unmapped source keys | 0 |

### Per-record adapter notes

- MPPSC-2021-057: no usable printed answer; the question stays without a key
- MPPSC-2021-075: no usable printed answer; the question stays without a key
- MPPSC-2022-046: no usable printed answer; the question stays without a key
- MPPSC-2022-059: no usable printed answer; the question stays without a key
- MPPSC-2023-026: no usable printed answer; the question stays without a key
- MPPSC-2024-021: no usable printed answer; the question stays without a key
- MPPSC-2024-028: no usable printed answer; the question stays without a key
- MPPSC-2024-079: no usable printed answer; the question stays without a key

## Preservation statement

No source record was deleted, rewritten or merged to produce this bank. Question text, options, stored answers and explanations are carried over verbatim; only classification fields, the automatic marking scheme and review metadata were added. Source provenance (book names, page references, answer sources, key-issue labels) is deliberately not part of the app-facing bank — it is recorded in the sanitisation section of this report instead. Where two records look alike both are kept and flagged here instead of being merged.

Review flags attached to records: **506**.

