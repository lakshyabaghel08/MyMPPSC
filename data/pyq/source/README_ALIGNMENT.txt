# MyMPPSC solved-PYQ alignment bundle

This package aligns the existing extracted Markdown with the MyMPPSC question-bank intake schema.

## Files
- `align_mppsc_book.py`: deterministic parser; no AI/API calls.
- `MPPSC_PYQ_intake.json`: parser output to feed to the MyMPPSC builder.
- `MPPSC_PYQ_AppBank.json`: sample final bank built with this repository's `tools/build-bank.mjs`.
- `MPPSC_PYQ_Review.json`: all detected records, parsed content, flags, and records excluded from intake pending review.
- `MPPSC_PYQ_BuildReport.json`: counts and source hash.
- `VALIDATION.txt`: output summary from the MyMPPSC builder and validator.

## Run on your extracted Markdown
Place `align_mppsc_book.py` in the MyMPPSC repo (or call it by full path), then run:

```bat
python scripts\align_mppsc_book.py --input "PATH\TO\YOUR_BOOK_columns.md" --out-dir "output\MPPSC_APP_BANK"
node tools\build-bank.mjs --in "output\MPPSC_APP_BANK\MPPSC_PYQ_intake.json" --out "output\MPPSC_APP_BANK\MPPSC_PYQ_AppBank.json"
node tools\build-bank.mjs --validate "output\MPPSC_APP_BANK\MPPSC_PYQ_AppBank.json"
```

The last two commands must be run from the MyMPPSC repository root.

## Important limitations
- Structural extraction only; no answer verification, subject/topic classification, or translation.
- Printed answers are labelled unofficial and preserved separately from any later verification.
- Question numbering gaps and structurally invalid records are listed in the review report.
- The sample bank was generated from the uploaded `YOUR_BOOK_columns(3).md`; review the flagged records before importing.
- App validator result for this generated sample: valid, 571 questions across six year-level paper records. All questions are English-only and currently unclassified.
