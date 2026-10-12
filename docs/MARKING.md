# MPPSC marking rules and practice scoring

MyMPPSC has one automatic MPPSC preliminary scoring scheme from 2013 onward. It applies the latest reported pattern uniformly to the bundled 2013–2024 question papers, as explicitly requested for this product. **That is a practice-scoring policy, not a claim that earlier examinations historically used the same rules.**

The scheme lives in [`js/core/marking.js`](../js/core/marking.js). The build-time pipeline writes it into each MPPSC paper, and `js/services/scoring.js` applies the same values to older stored MPPSC papers whose scoring metadata still has the previous scheme. A user-configured per-test override or paper scoring override remains respected.

## Current practice scheme

| Scheme id | Applied to | Correct | Incorrect | Unanswered | Paper | Total | Duration |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| `mppsc-sse-prelims-latest-practice` | MPPSC prelims from 2013 onward, including the historical archive | +3 | −1 | 0 | 100 questions | 300 marks | 120 minutes |

The 2013–2018 source packages and the pre-existing 2019–2024 bank each contain six Paper I papers of 100 questions. Current paper metadata is applied uniformly for practice; it does not reconstruct the duration or marking rules that actually governed each historical sitting. Paper II/CSAT is not included in this bundled bank.

## Evidence and limitation

The +3/−1 pattern is recorded from secondary reports of the 2026 MPPSC preliminary changes (Free Press Journal, 14 April 2026; Dainik Bhaskar English, 26 April 2026). The cited reports describe one-third of the correct-answer marks deducted for a wrong answer and three marks for a correct answer. The 2026 rule text was not independently verified against a primary notification in this build, so the scheme has `confidence: "reported"` and the UI carries that caveat.

The previous 2019–2025 scheme (+2, no negative marking) is superseded for practice in the bundled bank. Applying +3/−1 to 2013–2025 is the user's explicit product direction; **do not present it as historical evidence**. Stored answer keys remain source-supplied and unverified against an official key, so scores are practice feedback only.

## Runtime behaviour

- Bundled 2013–2024 MPPSC papers carry `rules_known: true`, scheme id `mppsc-sse-prelims-latest-practice`, +3 per correct answer, −1 per incorrect answer, and 0 for unanswered.
- A stale stored paper using the old `mppsc-sse-prelims-2019-2025` identifier is upgraded to the current practice scheme when the repository bank updates. User-configured scoring overrides are not overwritten.
- Other MPPSC papers from 2013 onward use the same latest practice scheme automatically unless the user configured an override.
- Years outside the scheme's coverage and other commissions remain unconfigured rather than guessed.
- Exact answer-key status is independent from marking: questions without a usable key remain unscored, and verified/disputed-answer policies still apply.

## Tests and maintenance

`tests/scoring.test.js`, `tests/builtin-bank.test.js`, and `tests/pipeline.test.js` verify the same +3/−1/0 rules across 2013–2026, migration from stale bank metadata, preservation of explicit user overrides, and safe fallback outside coverage. Re-run the integrated build with the committed label/answer review files and `--include-2013-2018`, then run `npm test` and `npm run check` after changing this scheme.
