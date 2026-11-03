# PDF source update: 2009–2012

The four newly supplied PDFs are preserved without alteration. SHA-256 hashes
for the 2009–2011 PDFs and extracted text are in each `pdf-transcription-*.json`.
The 2012 PDF SHA-256 is
`8433cb1d2dedf62716fc3e4d240b830bab6ead9c708d396087b8ee78862b1ffa`.
The older Markdown files and their earlier staging remain intact.

## 2009–2011

The 2009 and 2010 PDFs contain the pages missing from the Markdown uploads:
2009 pp. 11, 20 and 33; 2010 pp. 4, 5, 9 and 11. The PDF-derived files stage
146 of 150 numbered 2009 candidates, all 120 of 120 2010 candidates, and all
120 of 120 2011 candidates. Each is English-only and has four ordered options;
the PDF transcription itself contains no imported answers or explanations. The separate 2011 answer review now integrates 88 answers from the PDF’s unofficial answer list with explanations and leaves 30 unkeyed. The separate final taxonomy
files contain reviewed, source-supported subject/topic/subtopic paths; unsupported
lower levels remain null. The six incomplete questions are preserved explicitly
in `incomplete-questions.json` and are not included in the bank.

2009 Q46–50, Q82–85, and Q145–150 are now recovered. Q82–85 retain their
shared directions, and Q101–110 retain their shared assertion/reason directions
and options. Q75 has no printed diagrams in this PDF. Q76–78 depend on a
broken table split between PDF pages 17 and 18: the numbers are printed as a
vertical list rather than a legible aligned table. These four are excluded
rather than guessed. The original question count is visibly 150.

2010 Q17 and Q18–28, Q45–50, Q56–61 are recovered. PDF numbering for Q18,
Q24 and Q69 lacks a period; the staging preserves their question numbers.

2011 PDF confirms Q7's “are nights the winters” wording and Q38 option B ends
“the peninsular” without a continuation. They remain flagged as damaged,
not repaired. A comparison also found differences between the prior Markdown
transcription and PDF: 2009 Q100 option C is “Michaelangelo” in the PDF, not
“Michelangelo”; 2011 Q71 option B is “Fujiyoma” in the PDF, not “Fujiyama”.
The PDF-derived staging retains the PDF spellings. Other differences include
punctuation, mathematical formatting and spacing. The two staging versions
are separate, so no prior records were silently overwritten.

All three PDFs are third-party solved, English-only documents, not original
bilingual exam scans. Their headings do not independently establish actual
paper identity; the 2010 and 2011 documents are heavily history- and
geography-focused, respectively. The built-in bank contains 146 complete 2009 candidates, 120 complete 2010
candidates, and 118 complete 2011 candidates. The PDFs do not supply Hindi.
The extraction is checked against the PDF text layer and targeted visual pages;
a full line-by-line comparison against the rendered PDFs remains outstanding.

## 2012 scan: targeted comparison only

The supplied 2012 PDF is a bilingual scan of the paper, not an answer key.
Physical PDF page numbers below are one less than the printed page numbers.
A targeted visual comparison confirms the previously flagged English/Hindi
wording differences for Q4 (PDF p. 3), Q26 (p. 11), Q71 (p. 27), and Q91
(p. 34) are present in the scan. Q82 (p. 31) really prints English “a val”;
it is not an omission unique to the Markdown. In Q82 the Hindi scan appears
to read “वैलिड (वैध)” while the pre-existing Markdown-derived staging and
bank say “वैलिड्स (वैध)”; Q71's Hindi “आल्टरनेटर्स” also appears different
from the staged “आल्टरनेर्ट्स”. These are flagged for careful scan review;
existing records have not been changed. This was not a complete 2012 scan audit.

## Reproduction and checks

Install PyMuPDF 2.1 and run `python3 tools/extract-solved-pdf-text.py --check`
to compare PDF extraction with the retained `pdf-extracted-*.txt` files.
Then run `python3 tools/transcribe-2009-2010-pdf.py --check`,
`python3 tools/transcribe-2011-pdf.py --check`, and
`python3 tools/classify-pdf-staging.py --check`. Source text files include the
solved PDFs' printed answers because they are extraction evidence; the staging
records do not contain keys. These checks cover transcription and staging, not the subsequent answer reviews described below.

## Final integration

| Year | Numbered candidates staged | Subject / topic / subtopic classified | Integrated |
| --- | ---: | ---: | ---: |
| 2009 | 150 (146 complete, 4 incomplete) | 146 / 141 / 68 | 146 |
| 2010 | 120 | 120 / 120 / 69 | 120 |
| 2011 | 120 (118 complete, 2 incomplete) | 118 / 114 / 68 | 118 |

These labels are taxonomy-valid and lower levels are omitted where unsupported.
At the initial integration all new records were keyless and had no explanations;
subsequent answer reviews are described below. Historical scoring remains
unknown. 2009 and 2011 paper names and simulation warnings mark the partial
transcriptions. Original question order is retained among available questions.
The earlier 2012 records and all 2013–2024 records were left unchanged.

The validator flags similar stems as possible duplicates. Targeted inspection of
2010 Q113/Q115 and 2011 Q57/Q116 found different option sets, and 2010 Q15 /
2011 Q78 concern different statements. These are distinct questions and were
retained; similarity warnings are not a reason to remove records.

## 2011 answer review update

The existing 2011-labelled paper has disputed identity: a 2010 publication contains the same sequence and calls it the 2008 geography paper. See `2011-paper-identity-warning.md`. At the user’s direction the existing records are retained, with the warning in the paper name. `answer-review-2011.json` records 88 supported unofficial answers, 12 disputed and 18 unresolved; Q7 and Q38 remain excluded. These answers are not an official key.

## 2010 answer review update

The English source is a third-party paper labelled 2010; paper identity is not independently authenticated. `answer-review-2010.json` reviews its unofficial PDF answer list: 80 answers and explanations are integrated, with 14 disputed and 26 unresolved unkeyed. These are not an official key.

## 2009 answer review update

The third-party source labels this paper 2009; its identity and key are not authenticated. `answer-review-2009.json` integrates 94 supported unofficial PDF answers with explanations and leaves 12 disputed and 40 unresolved unkeyed. The PDF prints an asterisk instead of a letter for Q15; its source mark is preserved. Q75–78 remain excluded because the supplied diagrams or table cannot be reconstructed reliably. Some correct historical facts or legal provisions may change after the paper date.
