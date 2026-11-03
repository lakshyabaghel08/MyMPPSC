# 2012 independent answer review — in progress

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
