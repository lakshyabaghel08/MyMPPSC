# data/pyq/

Output of the PYQ classification pipeline
([`docs/PYQ_PIPELINE.md`](../../docs/PYQ_PIPELINE.md)). Nothing in this folder is
read by the app at runtime — these are pipeline artefacts, produced with:

```bash
node tools/classify-bank.mjs --in <source.json> --out data/pyq/mymppsc-pyq-bank.json --reports data/pyq
```

## Layout

| Path | What belongs here |
| --- | --- |
| `source/` | The **input**: the extraction the pipeline is run against (for example `MPPSC_PYQ_intake.json`). Commit it so a build is reproducible and a question can be traced back to where it came from. |
| `mymppsc-pyq-bank.json` | The **output**: the classified bank you import into the app. |
| `classification-report.md` / `.json` | Coverage by subject, topic and subtopic, with counts and percentages. |
| `review-report.md` / `.json` | Everything still needing a human: missing keys, suspected duplicates, ambiguous and low-confidence classifications, integrity checks. |
| `ai-queue.jsonl` | Questions the rule engine could not settle — the input for the optional, resumable AI step. |
| `ai-labels.jsonl` | Provider labels for that queue, merged back with `--apply-ai`. Never contains an API key. |
| `example/` | A committed worked example built from `demo/pyq-intake-sample.json` (synthetic, `is_demonstration: true`) so the report format can be read without running the pipeline. |

`source/`, the bank and the reports are deliberately **not** in `.gitignore`:
a bank that is not version-controlled cannot be re-validated or audited later.
Do not commit anything that holds a credential — the pipeline reads provider
configuration from the environment only.
