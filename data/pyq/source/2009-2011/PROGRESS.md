# 2009–2011 Step 1: partial source-derived staging

**Historical Markdown-only status:** newer PDFs restore missing pages. See
[PDF_REVIEW.md](PDF_REVIEW.md) for current counts and remaining issues.

## Status: staged and provisionally classified; not integrated

The three Markdown files in this directory are byte-for-byte copies of the
supplied uploads. They are third-party solved English transcriptions, not
original scanned papers; none contains Hindi. Their headings alone do not
establish the identity or completeness of the original examination papers.
The 2011 transcription is geography-focused and the 2010 transcription is
history-focused despite both being labelled General Studies. Source identity
and fidelity cannot be confirmed from the files available.

The user has confirmed these are all the source files available. Rather than
invent missing material, the staging files now contain recoverable English
question candidates in source order with existing-style provisional IDs.
Subject-level classifications are provisional and need review; topics and
subtopics are intentionally null, not invented. Neither staging nor labels are
part of the built-in bank. No answer keys or explanations were imported.

- **2009:** 131 candidates staged and subject-labelled. Pages 11, 20 and 33
  are absent. Q46 is incomplete, Q47–50 and Q82–85 are missing, and Q145's
  options are absent; the following options belong to unrelated material. Q75
  has missing diagrams, and Q76–78 depend on an incomplete shared table; these
  questions, Q46 and Q145 are excluded. The source appears to stop its numbered
  sequence at Q145; any later original questions are unknown. Q101–110 use
  assertion/reason directions and options printed once in the source, so
  those shared directions and options are attached to each staged question.
- **2010:** 96 candidates staged and subject-labelled. Pages 4, 5, 9 and 11
  are absent. Q17 has only option A before a page gap; the following B–D belong
  to a different, unseen question, so Q17 is excluded. Q18–28, Q45–50 and
  Q56–61 are missing. Q69 is present but lacks a period after its number.
- **2011:** 120 candidates staged and subject-labelled. Pages 1–31 appear,
  and all 120 question candidates have A–D option labels. Q7 reads “In which
  region of the world are nights the winters ?”; Q38 option B ends at “the
  peninsular” at a page break and appears truncated. Both are retained in
  staging exactly as supplied, but need review and should not be presented as
  reliable complete questions.

All candidates require source comparison and individual review; structural
checks are not proof of faithful transcription, completeness, paper identity,
or correct subject assignment. No translated text, missing options or missing
questions have been invented. The answer sections remain only within the
preserved originals. No answers were verified and no explanations generated.

## Reproducibility

Run `python3 tools/transcribe-2009-2010.py --check`,
`python3 tools/transcribe-2011-paper.py --check`, and
`python3 tools/classify-2009-2011-staging.py --check`. Removing Markdown
emphasis and page furniture is the only text normalization, aside from
trimming whitespace. Source hashes are recorded in the staging files. The
classification script validates subject labels against the existing taxonomy.
