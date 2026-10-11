# Marking schemes (automatic, no per-paper configuration)

MyMPPSC scores MPPSC papers from a scheme that is chosen for you. There is no
"enter the marks" step anywhere in the normal flow: the scheme is written into
each paper when the bank is built, and the app selects it again when a paper is
opened, a full-paper test is started, or a bank is imported.

The single source of truth is [`js/core/marking.js`](../js/core/marking.js). It
is imported by the app **and** by the build-time pipeline
(`tools/classify/sanitise-bank.mjs`), so the rules in the file the app loads and
the rules the app applies cannot drift apart.

## 1. How a scheme is selected

```
paper.scoring (stored on the paper at build time)
        │  rules_known && marks_per_correct is a number
        ├── yes → use the paper's own rules                 source: paper_original
        │         (the bundled bank's papers are written with the
        │          applicable MPPSC scheme, so this is the normal path)
        │
        └── no  → resolveMppscMarkingScheme({exam, year, paper_code})
                    │  a verified/reported MPPSC pattern covers that year & paper
                    ├── yes → apply it, mark the paper needsConfiguration:false
                    │         source: mppsc_builtin
                    └── no  → refuse to score, ask the user to configure
                              source: unknown, needsConfiguration: true
```

`js/services/scoring.js` reports where the rules came from
(`paper_original`, `user_configured`, `app_default`, `mppsc_builtin`, `unknown`),
and the paper card, the pre-test summary and the post-test report all show that
source. A user override, if the user ever sets one, always wins and is stored
separately with the original preserved.

## 2. The schemes

| Scheme id | Applies to | Correct | Wrong | Unanswered | Paper | Total marks | Duration | Qualifying |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mppsc-sse-prelims-2019-2025` | MPPSC State Service Preliminary Examination, 2019–2025 cycles | +2 | 0 (no negative marking) | 0 | 100 questions | 200 | 120 min | Paper II (CSAT) qualifying: 40% (30% for reserved categories — see §4) |
| `mppsc-sse-prelims-2026-plus` | MPPSC State Service Preliminary Examination, 2026 onwards | +3 | −1 (one third of the mark per correct answer) | 0 | 100 questions | 300 | 120 min | Paper II qualifying: 33% |

Both cover Paper I (*General Studies*) and Paper II (*General Aptitude*, CSAT).
Preliminary marks decide only who qualifies for the main examination; they are
not carried into the final merit list, which is why the app scores a paper out of
200 but never presents that total as a final result.

**Selection is by the paper's examination year, never by the year the app was
built.** A 2019 paper is scored with the 2019 pattern even after the 2026 pattern
exists, and the app labels which scheme it used.

## 3. Evidence

| Scheme | Evidence | Confidence |
| --- | --- | --- |
| 2019–2025 | Examination pattern consistently described across the 2019, 2020, 2021, 2022, 2023, 2024 and 2025 cycles: two papers a day, 100 objective questions per paper, 2 marks per correct answer, 200 marks per paper, 2 hours per paper, **no negative marking and no deduction for unanswered questions**; Paper II is qualifying. Sources: examination-pattern summaries for the individual cycles and MPPSC notification commentary. | `verified` |
| 2026-onwards | Secondary reporting (April 2026) of the MPPSC decision to introduce **negative marking for the first time**: one-third of a mark deducted per wrong answer, with a higher mark per correct answer (reported as 3 marks). The official notification PDF was not reachable while this scheme was written, and secondary sources disagree on the totals. | `reported` |

`confidence: "reported"` is not a decorative label. It means: the scheme is
recorded so the app has something honest to apply for a 2026+ paper, but it has
**not** been confirmed against the commission's own document, and it may be
wrong. The app shows the scheme's evidence string on the paper card, and a
`reported` scheme is never applied retrospectively.

## 4. Known uncertainty, recorded rather than hidden

* **The Paper II qualifying percentage varies by source.** The stored rule is
  40% for general candidates and 30% for reserved categories, which is what the
  2019-and-later notification summaries state; other summaries say 33%. It is
  stored as *information attached to the scheme*, at `confidence: "reported"`,
  and the app does **not** auto-fail a practice session on it — a practice paper
  is not the real exam.
* **2026 mark totals are inconsistent in the reporting** (3 marks × 100
  questions = 300, which does not reconcile with every secondary summary). The
  scheme records its own arithmetic and flags its confidence accordingly.
* **Uncovered years refuse to score.** A paper whose year no scheme covers gets
  `rules_known: false`, the app says *"Scoring rules for this paper are not
  known"* and asks for the rules before a full-paper test can be scored. It never
  assumes `+2 / −0.66` (the values a generic exam app would default to) and never
  guesses.

## 5. Adding a year or correcting a scheme

1. Edit the scheme table in `js/core/marking.js` (add an `applies_to` range or a
   new scheme object with `evidence`, `confidence` and the paper rules).
2. Add or update the matching cases in `tests/scoring.test.js` (year → scheme,
   marks, negative marking, and the "a year no scheme covers still needs
   configuration" check).
3. Re-run `node tools/classify-bank.mjs --in data/pyq/source/MPPSC_PYQ_intake.json
   --out data/pyq/mymppsc-pyq-bank.json --reports data/pyq --apply-review
   data/pyq/reviewed-labels.jsonl` so each paper's stored `scoring` block matches,
   then `npm test`.

Papers for examinations the app does not know (other states, other exams) always
fall back to the "configure it yourself" path; nothing in this file pretends to
know another commission's pattern.

## 6. What the user sees

* **Paper card** — marks per question, negative marking, total marks, duration and
  the scheme's evidence, before the test starts. An unknown-rules paper says so.
* **Pre-test summary** — the same line, plus the qualifying note for Paper II.
* **Post-test report** — the scheme used, the marks arithmetic for every answer,
  and any answer the scheme excluded (no key, disputed key, policy exclusion).
* **Settings → Scoring defaults** — only a fallback for sessions the user builds
  from their own questions; it never overrides a paper's own scheme.
