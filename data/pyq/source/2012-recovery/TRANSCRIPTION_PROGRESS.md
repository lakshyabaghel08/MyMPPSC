# 2012 Paper I — transcription staging progress

## Status

**Integrated with source caveats.** `transcription-staging.json` is machine-extracted directly
from the supplied Markdown paper, not from the legacy scripts or bank fragment.
It contains 100 numbered records, each with Hindi and English stems and four
ordered options. The extraction was checked for structural completeness; it is
not a substitute for a line-by-line comparison to an original scan. The staging
file has no answers, explanations or classifications. `taxonomy-2012.json` supplies
100 taxonomy paths; unsupported lower levels remain null. The live bank appends
all 100 keyless records and leaves existing records and metadata unchanged.

Reproduce using `python3 tools/transcribe-2012-paper.py`; use `--check` to
verify the file without modifying it. The SHA-256 of the source bytes is
recorded in the staging file. The extraction removes Markdown emphasis markers
and document furniture, including page headers, printed page numbers after
headers, source download lines and section separators. It does not rewrite
question words, options or punctuation. It retains line breaks within question
stems. The extractor fails on missing, duplicate or malformed question/option
labels or missing languages; the tests check source reproducibility, IDs,
numbering, options, collision with the current bank, and Q31 and Q96.
Automated structural checks are not proof that the original scan has been
faithfully transcribed or that the options align semantically.

A disposable application-validator experiment combining this staging data and
baseline found 1,300 questions and 13 papers, no errors or rejected records,
and 17 similarity pairs involving 2012 records. These are review candidates,
not established duplicates; repeated genuine exam questions across years must
not be discarded. The 100 staged records were unclassified and keyless, and
the experimental paper had unknown scoring. Nothing from this experiment was
written to the live bank.

## Source uncertainties and bilingual differences

The provided source is already a Markdown transcription, not the scanned paper.
Its words are retained as supplied; the following need verification against a
scan where possible, not silent correction:

- **Q4, page 2:** English C says "Force of the wind"; Hindi C says wind velocity.
- **Q26, page 10:** English asks which "state" Alaska is part of, while Hindi
  asks which country.
- **Q71, page 26:** Hindi includes "उच्च क्षमता वाला" (high capacity) in the
  description; English does not.
- **Q82, page 30:** English has "a val domain name extension" and Hindi has
  "वैलिड्स (वैध)". Both are reproduced as supplied; whether these represent
  OCR or printed wording requires a scan.
- **Q91, page 33:** Hindi specifies an Indian musician; English does not.

This list is not a completed bilingual alignment audit. The 100 extracted stems
were reviewed side by side for obvious differences; all option translations and
source formatting still need individual review. Q31 and Q96 now retain the
source's option text and order in the staging file, rather than the altered
recovered-generator versions.

## Disposition and remaining work

The source differences above are retained rather than harmonised or guessed.
Q82 remains potentially truncated in the supplied English transcription;
none can be resolved against a scan because no scan was supplied. A complete
manual comparison of both languages and all options against an original scan
remains pending. 2012 scoring remains unknown. The transcription itself still
contains no answers or explanations; the shipped bank now attaches 89
independently verified answers and 100 four-part explanations from the separate
final reassessment and explanation bundle (see `README.md` and
`../../../REPORT_FINAL_ANSWER_AUDIT_2012.md`). No MPPSC key is called official.
The 2012 labels cover all 100 subjects; four stop at subject and nine more at
topic rather than inventing an unsupported lower level.

A clean rebuild with `--include-2012` appends the paper after the existing bank
pipeline. The structural validator's similarity list identifies three strongest
cross-year matches (2012-094/2013-023, 2012-074/2022-098, and
2012-096/2018-089). The Q94/Q2013-023 and Q96/Q2018-089 pairs have similar subjects but different
options; Q74 asks for the first *woman* chief minister, unlike Q2022-098. Each
has a distinct year and paper ID and is retained. Other lower-similarity matches
are not grounds for removing records. Step 2 (independent answer research and
explanation generation) was subsequently completed: see `answer-reassessment-2012.json`,
`../../reviewed-explanations-2012.json` and
`../../quality-audit/final-answer-audit-2012.json`. This transcription file itself
was not altered by that work. No answer verification or explanation generation
was performed in the transcription step described above.
