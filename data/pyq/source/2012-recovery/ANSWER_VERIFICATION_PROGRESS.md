# 2012 independent answer review — historical staging record (superseded)

`answer-verification-2012.json` is a **staging record, not an official key**.
It inventories the 100 live-bank question IDs and records source-supported
options, evidence and uncertainty. “Verified” here means independently
source-supported, not verified against an official MPPSC key. No official
key has been inspected. Brief evidence statements are audit records, not
learner explanations. The earlier `ANSWER_AUDIT_BATCH_1.md` remains preserved.

This is **not a completed review**: unresolved records include work not yet
started. `research_state` distinguishes those from partially researched items.
The live bank remains keyless, with wording, options, IDs, taxonomy and
explanations unchanged; there is no publication or integration of the staged
answers. Subsequent work should research the remaining questions and resolve
or substantiate each flag before considering the year's review complete.

Run `node --test tests/answer-verification-2012.test.js`, `npm test`, and
`npm run check` to validate the staging structure and existing application.
These checks cannot establish that the external sources are correct, available,
or sufficient; those require source review.

## Final audit (completed 3 Nov 2026 — this staging file is superseded)

The 2012 review is now complete. `answer-reassessment-2012.json` is the final
reassessment (89 verified, 3 disputed, 8 unresolved); its pre-audit state is
preserved in `answer-reassessment-2012-pre-final-audit.json`. All 100 questions
received four-part English explanations in
`../../reviewed-explanations-2012.json`, declared by
`../../reviewed-corrections-2012.json`, and are integrated into the shipped
bank by `tools/classify/append-2012.mjs`. The per-question record is
`../../quality-audit/final-answer-audit-2012.json`; the narrative is
`../../../REPORT_FINAL_ANSWER_AUDIT_2012.md`.

This staging file remains committed as historical evidence of the earlier
in-progress review. It is **not** the live answer source and must not be used
to rebuild the bank. No authenticated MPPSC 2012 answer key was located; all
89 integrated answers remain independently source-supported, not official.
