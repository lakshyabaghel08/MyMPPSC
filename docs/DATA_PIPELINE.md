# The data pipeline (outside the app)

MyMPPSC has **no question-generating code inside it**: no model, no scraper, no
heuristics that invent content. Questions, options, answer keys, classifications
and explanations are produced by whatever process you trust — your own notes, a
scraped-and-checked paper, an OCR pass, a classification model, a group of
reviewers — and arrive as a bank file.

That separation is deliberate and enforced:

* the app's `js/` tree contains no question text (checked by `npm run check`);
* the bundled demonstration bank is flagged synthetic and badged in the UI;
* a paper whose rules or keys are unknown stays labelled as such rather than being filled in.

This document describes the workflow between your pipeline and the app.

## 1. Shape your pipeline's output as a bank file

See [`docs/SCHEMA.md`](SCHEMA.md) for every field. The important habits:

1. **One id per question**, shared by all language variants of that question.
2. **Report what you know, and say what you do not.** `original_question_count`, `duration_minutes`, `scoring.rules_known`, `answer_key_status` — a `null` or `false` is far more useful than a plausible guess, because the app surfaces exactly those gaps to the reader.
3. **Keep provenance.** `source_files`, `source_reference` and `provenance` end up in the import record and help you check a question later.
4. **Never overwrite a key you are unsure about.** Put the published key in `supplied_answer`; put your own checked answer in `verified_answer` with `evidence`. Disagreement between the two is displayed, not hidden.
5. **Set `is_demonstration: true`** for anything synthetic, including fixtures.

## 2. Validate before importing

```bash
node tools/build-bank.mjs --validate my-bank.json
```

Exit codes: `0` valid, `2` blocked (fatal errors or rejected records), `1` usage
error. The validator is the **same code the app runs** (`js/core/validate.js`),
so a file that passes here imports cleanly.

The app validates again at import time regardless — a file that changes between
the two runs, or arrives from someone else, is still checked.

## 3. Or build the bank from a simpler intake file

Most pipelines do not want to emit the full schema by hand. Write an *intake*
file instead and let the tool do the mechanical part:

```bash
node tools/build-bank.mjs --in demo/intake-sample.json --out /tmp/bank.json
node tools/build-bank.mjs --in intake.json --out bank.json --strict
```

Intake files use the same structure as a bank, with convenient shorthand:

| Shorthand | Becomes |
| --- | --- |
| `"en": {…}, "hi": {…}` on a question | `language_variants` |
| `"answer": ["B"], "answer_status": "final", "answer_source": "…"` | `supplied_answer` |
| `"subject"/"topic"/"subtopic"/"classification_confidence"` | `classification` |
| `"explanation": "prose…"` | `explanation.correct_reasoning` with `status: "unreviewed"` |
| omitting `question_order` on a paper | derived from `question_number` |
| omitting `exam`, `year`, `set_code` on a question | inherited from its paper |
| omitting `scoring` for a paper | `rules_known: false` — the app will refuse to score it until you configure rules |

The tool **adds nothing else**. It never invents an option, a key, an
explanation or a classification; a missing answer stays missing. With `--strict`
it exits non-zero when the build has any warning or duplicate, which is what you
want in a pipeline that should fail loudly.

`intake_version` is recorded in the built bank's `generator.notes`. When the
intake format changes, the version is bumped and the tool keeps reading older
files on a best-effort basis with a warning.

## 4. Import through the app

**Question Bank & Imports → Import → choose file.** You get, before anything is
written:

* paper list with declared vs present question counts;
* new / already-stored / conflicting question counts;
* every rejected record with a reason, every warning, and any near-duplicate pairs;
* a demonstration banner if the file is flagged synthetic;
* a conflict policy choice: keep existing (default), update from file (your
  corrections are preserved), or keep both as a marked duplicate copy.

Afterwards the import is recorded with the file's SHA-256, the counts, the
policies applied, the rejected records and the skipped records — and it can be
undone from the History tab (attempts stay in your history).

## 5. Worked example

`demo/intake-sample.json` is a small, deliberately obvious fixture: two papers
(one with rules, one without), five questions (bilingual, multiple-correct, a
question with a missing key, a question with an unreviewed explanation). Build
and inspect it:

```bash
node tools/build-bank.mjs --in demo/intake-sample.json --out /tmp/demo-built.json
node tools/build-bank.mjs --validate /tmp/demo-built.json
```

`tests/tools.test.js` asserts that this file builds, validates and imports
successfully, including that the missing answer key stays missing and that the
paper without rules keeps `rules_known: false`.

### 5a. Or classify an extracted previous-year paper

When the intake is an extraction of a real paper rather than something you wrote
by hand, `tools/classify-bank.mjs` sits in front of the same builder: it adapts
the extraction, assigns subject/topic/subtopic with a deterministic rule engine,
keeps printed and verified answers apart, flags suspected duplicates and missing
keys, and writes a classification report and a review report next to the bank.

```bash
node tools/classify-bank.mjs --in data/pyq/source/MPPSC_PYQ_intake.json \
    --out data/pyq/mymppsc-pyq-bank.json --reports data/pyq
```

See [`docs/PYQ_PIPELINE.md`](PYQ_PIPELINE.md) for the full workflow, the
taxonomy, the optional resumable AI step, and what the reports contain.

## 6. Versioning

* **Schema** (`schema_version`): the app accepts its own major version, warns on other minors, refuses other majors.
* **Intake** (`intake_version`): used only by the build tool.
* **Backups** (`format: mymppsc-backup`): separate from banks; major version mismatch is refused, minor differences are read on a best effort with a warning.
