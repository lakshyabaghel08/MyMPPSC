# demo/

Sample input for the **separate** data pipeline described in
[`docs/DATA_PIPELINE.md`](../docs/DATA_PIPELINE.md). Nothing in this folder is
used by the running app.

* `intake-sample.json` — a small, obviously-filler intake file for `tools/build-bank.mjs`. It carries `is_demonstration: true` and a provenance note saying the content is synthetic. It is written to exercise interesting cases on purpose:
  * a paper with rules and a paper without any (`rules_known` stays `false`);
  * a bilingual question, a multiple-correct question and an assertion–reason question;
  * a question whose answer key is genuinely missing, and one whose explanation is unreviewed.

Build it and inspect the result:

```bash
node tools/build-bank.mjs --in demo/intake-sample.json --out /tmp/demo-built.json
node tools/build-bank.mjs --validate /tmp/demo-built.json
```

Then import `/tmp/demo-built.json` through **Question Bank & Imports** to see the
pre-import summary, the warnings for the missing key and the paper without
rules, and how the app labels both afterwards.

The **app's own** demonstration dataset lives in
[`data/demo/demo-bank.json`](../data/demo/demo-bank.json) and is loaded from the
Import screen or the first-run prompt.
