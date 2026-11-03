# Checkpoint — 2012 final answer audit (3 Nov 2026)

This is an **independently verified backup** of the 2012 deliverable, taken after
`npm test`, `npm run check`, a clean rebuild and the full answer-change,
completeness, source and dispute audit. It is a snapshot, not a second source of
truth: the live files remain authoritative, and every checksum here points at a
live path so drift is visible.

## Contents

| File | What it is |
| --- | --- |
| `mymppsc-pyq-bank.json.gz` | gzip (`-n`, timestamp-free) of the shipped `data/pyq/mymppsc-pyq-bank.json` at the checkpoint. |
| `answer-reassessment-2012.json` | final reassessment (89 verified / 3 disputed / 8 unresolved). |
| `reviewed-explanations-2012.json` | 100 four-part English explanations. |
| `reviewed-corrections-2012.json` | 100 explanation declarations and the final audit declaration. |
| `final-answer-audit-2012.json` | per-question machine-readable audit. |
| `REPORT_FINAL_ANSWER_AUDIT_2012.md` | narrative report. |
| `SHA256SUMS` | SHA-256 of each live source file and each backup copy (two spaces before the path, `sha256sum -c` compatible). |
| `verify.mjs` | independent Node verifier. |

## Verify

From the repository root:

```bash
sha256sum -c checkpoints/2012-final-answer-audit/SHA256SUMS
node checkpoints/2012-final-answer-audit/verify.mjs
npm test
npm run check
```

`verify.mjs` additionally decompresses the checkpoint bank, asserts it is
identical to the live bank and recomputes the 2012 headline counts (100
questions, 89 independently verified, 11 unkeyed, 100 four-part explanations,
11 unkeyed items with `is_correct: null` on every option row, zero supplied
answers, scoring still unknown).

A second clean rebuild with the documented flags also reproduces the bank
exactly after removing the two build stamps; only the 100 2012 question records
differ from `main` at `748706c`.

## Restore

The backup copies are plain JSON/markdown except the bank, which is restored with
`gunzip -c mymppsc-pyq-bank.json.gz > data/pyq/mymppsc-pyq-bank.json`. Do not
restore over a newer bank without first reviewing what changed.
