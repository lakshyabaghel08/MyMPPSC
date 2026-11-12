> **Retired scope (2026-11-12):** this is a historical provenance note, not an
> active build instruction. The 2009–2011 papers were removed from the practice
> bank; the helper scripts and `--include-2009-2011` pipeline step named below no
> longer exist. The preserved records are in
> `data/pyq/archive/mppsc-2009-2011-papers.json`. Do not reintroduce them into the
> active bank from this note.

# 2011 question classification review

**Date:** 2026-11-03  
**Scope:** All 118 complete records integrated as `MPPSC-2011-001` through `MPPSC-2011-120`, excluding source questions 7 and 38.  
**Source:** Preserved PDF-derived English transcription. No question wording, option text, order, answer key, or paper identity was changed.

## Result

The source is genuinely dominated by Geography and economic/human geography. The skew is not, by itself, evidence of a taxonomy defect. The review found two subject-level misclassifications and several inaccurate or missing topic/subtopic assignments. The classification is content-based; it does not authenticate the document as an official 2011 MPPSC paper.

| Subject | Questions |
|---|---:|
| Geography | 108 |
| Economy | 4 |
| Environment | 2 |
| Science and Technology | 1 |
| Art and Culture | 2 |
| Madhya Pradesh Special | 1 |
| **Total integrated records** | **118** |

## Subject-level corrections

| Question | Previous | Corrected | Reason |
|---|---|---|---|
| 6 | Economy | Geography — Economic and human geography | Tertiary activities and occupational sectors are core economic-geography content in this world-geography sequence. |
| 8 | Economy | Geography — World Geography | The question compares the spatial distribution of developed and less-developed world regions. |

Q89 (coral island) is retained under Geography / Physical Geography / Oceanography. The provisional staging taxonomy had placed it under Environment; that was corrected because the question tests oceanic landforms.

## Topic/subtopic corrections and refinements

| Question(s) | Corrected path | Rationale |
|---|---|---|
| 14 | Geography → Physical Geography → Rocks and minerals | Geological rock systems are not physiography. |
| 22 | Geography → Geography of India → Rivers of India | The question is about river-basin water availability. |
| 28–29, 33, 45, 101 | Geography → Geography of India → Agriculture in India | Cash/fibre crops, agricultural classification, productivity and Zaid cropping are agricultural-geography content. |
| 35 | Geography → Economic and human geography → Human settlement | It asks about the population of an MP city. |
| 36 | Economy → Agriculture and rural economy (no subtopic) | Farmer problems are broader rural-economy issues, not cropping patterns. |
| 40 | Geography → Economic and human geography → Industries | Bagasse is an industrial by-product and fuel input. |
| 68 | Geography → Physical Geography → Earthquakes and volcanoes | A caldera lake is a volcanic feature, not a generic erosional landform. |
| 108 | Geography → Physical Geography → Rocks and minerals | It asks for a type of iron ore, not the spatial distribution of Indian mineral resources. |
| 109, 111 | Geography → Economic and human geography → Industries | These test industrial uses of manganese and bauxite. |
| 112, 115 | Geography → Economic and human geography → Energy resources | Coal reserves and hydroelectric projects concern energy resources. |

All remaining complete questions were reviewed and retained where their existing path was appropriate. Unsupported lower-level labels remain null rather than being guessed.

## Exclusions and provenance

- Q7 and Q38 remain outside the 118-record integrated bank because the source transcription is damaged/incomplete. They have not been silently completed.
- The source's paper identity remains disputed. A pre-2011 publication reportedly contains the same early geography-question sequence attributed to a 2008 MPPSC paper. This audit does not resolve that provenance conflict.
- No claim is made that the supplied third-party answer list is an official MPPSC answer key.

## Validation

- Exactly 118 final taxonomy labels, matching the 118 integrated 2011 records.
- Every subject/topic/subtopic path validated against the canonical taxonomy.
- A dedicated regression test checks the reviewed 118-label taxonomy and the corrected decisions.
- The 118 reviewed records are preserved in `data/pyq/archive/mppsc-2009-2011-papers.json`; their corrected subject/topic/subtopic fields are included there.
- The active bank now excludes all 2009, 2010 and 2011 paper metadata and questions. No other year or question wording/options was modified.
