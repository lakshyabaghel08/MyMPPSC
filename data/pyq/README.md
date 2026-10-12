# data/pyq/

Output of the PYQ classification pipeline
([`docs/PYQ_PIPELINE.md`](../../docs/PYQ_PIPELINE.md)).

**One file here is read by the app at runtime**: `mymppsc-pyq-bank.json` is the
bundled bank, fetched and imported by `js/services/builtin-bank.js` on first boot
and precached by the service worker. Everything else in this folder — the source
extraction, the review labels and the reports — is a build-time artefact. The
whole set is produced with:

```bash
node tools/classify-bank.mjs \
  --in data/pyq/source/MPPSC_PYQ_intake.json \
  --out data/pyq/mymppsc-pyq-bank.json \
  --reports data/pyq \
  --apply-review data/pyq/reviewed-labels.jsonl \
  --apply-answers data/pyq/reviewed-answers.jsonl
```

`mymppsc-pyq-bank.json` is the file the app loads, so it holds study content and
nothing else: questions, options, stored answers, explanation prose and the
subject/topic/subtopic labels. How each label was chosen, who reviewed what and
whether an explanation was checked are **not** written into it — those are facts
about this build, and they live in the two reports beside it. If you re-run the
pipeline without `--apply-review`/`--apply-answers` you get a bank that is
missing 244 reviewed labels and 8 answer resolutions, which the tests here will
tell you about immediately.

## Layout

| Path | What belongs here |
| --- | --- |
| `source/` | The **input**: the extraction the pipeline is run against, plus the alignment bundle it came with (`MPPSC_PYQ_intake.json`, `MPPSC_PYQ_AppBank.json`, `MPPSC_PYQ_Review.json`, `MPPSC_PYQ_BuildReport.json`, `README_ALIGNMENT.txt`, `VALIDATION.txt`, `align_mppsc_book.py`). Committed so a build is reproducible and a question can be traced back to where it came from. Nothing in here is modified by the pipeline. |
| `mymppsc-pyq-bank.json` | The **output**: the classified bank you import into the app. Currently the real 2019–2024 bank — 571 questions across 6 papers, built from `source/MPPSC_PYQ_intake.json`. |
| `classification-report.md` / `.json` | Coverage by subject, topic and subtopic, with counts and percentages. |
| `review-report.md` / `.json` | Everything still needing a human: missing keys, suspected duplicates, ambiguous and low-confidence classifications, integrity checks. |
| `reviewed-labels.jsonl` | The **human review decisions**: one JSONL line per question the rule engine could not settle, with the label, the confidence and the reason. Committed, so every human decision is reproducible; merged with `--apply-review`. |
| `reviewed-answers.jsonl` | The **human answer/explanation resolutions**: one JSONL line per question the source printed no key for, with the answer, its basis and the reasoning to show the learner. Committed for the same reason; merged with `--apply-answers`, which never overwrites a key the source printed. |
| `ai-queue.jsonl` | Questions the rule engine could not settle and no reviewer has classified — the input for the optional, resumable AI step. |
| `ai-queue.taxonomy.json` | The closed vocabulary (every valid subject → topic → subtopic combination) those AI requests must choose from. Written next to the queue; shared by every queue item. |
| `ai-labels.jsonl` | Provider labels for that queue, merged back with `--apply-ai`. Never contains an API key. |
| `example/` | A committed worked example built from `demo/pyq-intake-sample.json` (synthetic, `is_demonstration: true`) so the report format can be read without running the pipeline. |

`source/`, the bank and the reports are deliberately **not** in `.gitignore`:
a bank that is not version-controlled cannot be re-validated or audited later.
Do not commit anything that holds a credential — the pipeline reads provider
configuration from the environment only.

The audit of what the bundled bank still cannot resolve (the two lost question
blocks, the numbering gaps, and why no key here is called official) is
[`docs/PYQ_AUDIT.md`](../../docs/PYQ_AUDIT.md); the marking schemes are
[`docs/MARKING.md`](../../docs/MARKING.md).
