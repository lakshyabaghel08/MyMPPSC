# Checkpoint — 2012 final answer audit (3 Nov 2026)

This is an **independently verified backup** of the 2012 deliverable, taken after
`npm test`, `npm run check`, a clean rebuild and the full answer-change,
completeness, source and dispute audit. It is a snapshot, not a second source of
truth: the live files remain authoritative. This snapshot predates the removal
of the 2009–2011 papers, so its whole-bank gzip is historical; the live 2012
paper must still match it exactly. Checksums cover the frozen copies and the
still-live 2012 audit inputs.

## Contents

| File | What it is |
| --- | --- |
| `mymppsc-pyq-bank.json.gz` | gzip (`-n`, timestamp-free) of the shipped bank at the checkpoint, before 2009–2011 were retired. Not a restore target for the current active bank. |
| `answer-reassessment-2012.json` | final reassessment (89 verified / 3 disputed / 8 unresolved). |
| `reviewed-explanations-2012.json` | 100 four-part English explanations. |
| `reviewed-corrections-2012.json` | 100 explanation declarations and the final audit declaration. |
| `final-answer-audit-2012.json` | per-question machine-readable audit. |
| `REPORT_FINAL_ANSWER_AUDIT_2012.md` | narrative report. |
| `SHA256SUMS` | SHA-256 of each frozen backup copy and each still-live 2012 audit input (including the live narrative with its current-scope erratum) (two spaces before the path, `sha256sum -c` compatible). The deliberately changed live whole-bank file is checked by scope and 2012 equality in `verify.mjs`, not by the old whole-bank hash. |
| `verify.mjs` | independent Node verifier. |

## Verify

From the repository root:

```bash
sha256sum -c checkpoints/2012-final-answer-audit/SHA256SUMS
node checkpoints/2012-final-answer-audit/verify.mjs
npm test
npm run check
```

`verify.mjs` additionally decompresses the historical checkpoint bank, asserts
that the active bank has the 1,300-question / 13-paper 2012–2024 scope and that
its 2012 questions and paper metadata equal the checkpoint, then recomputes the
2012 headline counts (100
questions, 89 independently verified, 11 unkeyed, 100 four-part explanations,
11 unkeyed items with `is_correct: null` on every option row, zero supplied
answers, scoring still unknown).

A clean rebuild with the documented active-scope flags reproduces the current
bank exactly after removing the two build stamps. The historical comparison to
`main` at `748706c` concerned the original 2012 audit only.

## Restore

The backup copies are plain JSON/markdown. The gzip is a historical whole-bank
snapshot that still contains the retired 2009–2011 papers: **do not restore it
over the active bank**. To recover 2012 audit inputs, copy the individual frozen
JSON/markdown files after reviewing them; the live 2012 bank records are verified
against the snapshot by `verify.mjs`.
