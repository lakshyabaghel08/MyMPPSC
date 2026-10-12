# The PYQ question-bank pipeline

This document describes the classification pipeline that turns an extracted
MPPSC previous-year-question file into an importable, classified MyMPPSC bank —
and the two reports it produces.

The pipeline lives entirely in `tools/`. **Nothing in `js/` imports it**, the app
stays local-first and offline, and no AI or model runs inside the app. The app's
own validator (`js/core/validate.js`) and bank builder (`tools/build-bank.mjs`)
are reused, so the app-facing file follows the same schema and validator as
normal imports.

`--include-2013-2018` loads six strict year-specific adapters from
`data/pyq/source/2013-18/`. It checks all 18 source JSON/report/README files,
appends 600 questions to the existing 571-question 2019–2024 intake, and writes
a separate `historical-source-audit.json` / `.md`. If rebuilding from the raw
intake, both committed `--apply-review` and `--apply-answers` files are required
to restore the existing 2019–2024 label and answer decisions before combining.
The app-facing bank never receives source flags or preliminary historical labels.

```bash
# the exact command that builds the bank the app loads
node tools/classify-bank.mjs \
    --include-2013-2018 \
    --in data/pyq/source/MPPSC_PYQ_intake.json \
    --out data/pyq/mymppsc-pyq-bank.json \
    --reports data/pyq \
    --source-review data/pyq/source/MPPSC_PYQ_Review.json \
    --apply-review data/pyq/reviewed-labels.jsonl \
    --apply-answers data/pyq/reviewed-answers.jsonl
```

The run is a sequence of named passes, each of which reports what it did:

| Pass | What it does | Flag |
| --- | --- | --- |
| 0. Historical adapters | strictly reads six 2013–2018 schemas, checks README/review summaries, and appends all 600 records to the 571-question base | `--include-2013-2018` |
| 1. Adapt | reads the combined extraction shapes into the schema's own vocabulary | always |
| 2. **Repair** | fixes extraction artefacts and moves source provenance out of the data (`tools/classify/repair.mjs`) | `--no-repair` skips |
| 3. Classify | the deterministic rule engine (`tools/classify/rules.mjs`) | always |
| 4. **Review** | merges the committed human label decisions (`data/pyq/reviewed-labels.jsonl`) over the rule output | `--apply-review <file>` |
| 5. AI (optional) | merges provider labels for whatever is still unplaced | `--apply-ai <file>` |
| 6. **Answer review** | merges the committed human answers/explanations for questions the source left keyless (`data/pyq/reviewed-answers.jsonl`) | `--apply-answers <file>` |
| 7. Build | writes the schema-shaped bank | always |
| 8. **Sanitise** | writes the app-facing file: provenance out, marking scheme in, ids renamed, no build metadata | always |

## 1. What goes in

One JSON file: the extraction, with a `questions` array (or `items`). The
adapter in `tools/classify/intake-adapter.mjs` reads the common shapes an
extraction produces and reports anything it does not understand:

| It accepts | Notes |
| --- | --- |
| `question_text` / `question` / `text` | plus `en` / `hi` sub-objects or `language_variants` |
| `options` as strings, `{key,text}` objects, `{option,text}`, a `{A: "…"}` map or one newline-separated string | keys are preserved when present, otherwise assigned `A`, `B`, `C`… |
| `answer` / `correct_answer` / `answer_key` / `printed_answer` / `supplied_answer.answer` | a key (`"B"`) or the option **text**, which is mapped to its key |
| `verified_answer`, `dispute`, `verification_evidence` | passed through untouched — a verified answer never replaces the printed key |
| `explanation` / `solution` | kept verbatim; a plain string becomes `explanation.correct_reasoning` with its language recorded — no review status is attached, because the pipeline is not in a position to grant one |
| `subject` / `topic` / `subtopic` | kept when they exist **in the taxonomy**, otherwise recorded in `metadata.classification_dropped` |
| `classification_confidence` / `classification_source` | read by the passes above (an AI merge, for instance, refuses to overwrite a `reviewed` label), then dropped: they never reach the app-facing bank |
| `year`, `paper`, `set_code`, `exam`, `page`, `source_file` | carried into provenance |

A file that is already a bank (`MPPSC_PYQ_AppBank.json`-style) can be fed back
through the pipeline: the schema's own field names are recognised, so answer
integrity survives a re-run.

Hard rules, asserted by `tests/classification.test.js`:

* **Nothing is invented.** No option, key, explanation or classification is
  created. An answer that cannot be mapped to an option stays `null` with
  `answer_key_status: "missing"`.
* **Nothing is dropped silently.** Unmapped source keys are listed in the review
  report; per-record reshaping is reported as an adapter note; duplicate ids are
  kept and suffixed, never merged.
* **Question wording and keys are preserved.** Question stems and printed keys are copied as supplied. Only explicitly documented, source-evidenced option/extraction repairs are made; exact generic explanation placeholders are cleared to `null`. Each historical before/after change is recorded in `historical-source-audit.json` and no answer is guessed.

## 2. Classification

`tools/classify/rules.mjs` is a deterministic rule table (396 rules) over the
question stem, the options and — as supporting context — the printed
explanation.

* **Evidence is weighted by where it appears.** A term in the question stem
  counts three times, a term in an option once, a term in the explanation 1.25
  times. A classification whose *only* support is the explanation is capped at
  confidence `0.7` and flagged `explanation_only_evidence`.
* **The printed answer is context, never evidence.** Two records with the same
  wording and different printed keys classify identically. The answer is never
  treated as proof that it is correct.
* **Madhya Pradesh is separated from general India.** MP markers come in two
  tiers: strong markers are unique to the state (Bhopal, Kanha, Khajuraho,
  Malwa, मध्य प्रदेश…), weak markers are shared with neighbouring states (the
  Narmada, the Chambal, the Gond and Bhil). One strong marker in the stem makes a
  question MP-specific; weak markers need company and lose to a named other
  state. A Madhya-Pradesh rule that fires without MP context is redirected to its
  `fallback` node instead of being discarded, so "the Sardar Sarovar dam on the
  Narmada" lands in *Geography / Geography of India / Rivers of India* while "the
  Narmada originates in Madhya Pradesh" lands in *Geography / Rivers of Madhya
  Pradesh / Narmada basin*.
* **Confidence is derived, not asserted.** It comes from the evidence margin
  between the winning subject and the runner-up, and from coverage — never above
  `0.95` for a rule decision.
* **Uncertainty is preserved.** Too little signal or two subjects within 18% of
  each other ⇒ the record keeps `subject`/`topic`/`subtopic` = `null` (the app's
  *Unclassified* state) with a reason and its candidate list. Two subtopics
  within 12% ⇒ the stronger one is used but flagged `ambiguous_subtopic` with
  confidence capped at `0.6`. Two topics within 12% ⇒ the topic is left null and
  flagged `ambiguous_topic`.

Every assignment records the rules that produced it:

```json
"metadata": {
  "classification_flags": ["madhya_pradesh_specific"],
  "classification_evidence": {
    "mp_markers": ["madhya pradesh", "narmada", "amarkantak"],
    "matched_rules": ["geo-mp-narmada"]
  }
}
```

### Taxonomy

The only vocabulary the pipeline may assign is
[`data/taxonomy/mppsc-taxonomy.json`](../data/taxonomy/mppsc-taxonomy.json).
Its subjects are exactly `SUBJECT_ORDER` from `js/core/constants.js`, and its
topic/subtopic names reuse the vocabulary already present in
`data/demo/demo-bank.json` where one exists. At start-up the tool verifies that
every rule (and every rule fallback) points at a node that exists, and refuses to
run otherwise — a typo cannot introduce a subject the app has never seen.
`Unclassified` is reserved and never assigned: a question without a supported subject keeps
`null` so the app's `classification.isUnclassified` flag stays true. After the 2026-10-12 audit, the bundled bank has no such questions; supported subject-only/topic-only labels still leave unsupported lower levels null.

## 2b. The repair pass and reviewed-label pass

**Repair (`tools/classify/repair.mjs`, build-time only).** Extractions damage
text in predictable ways. The repair pass fixes the artefacts it can be certain
about and moves everything the app must not see into the review report:

* literal two-character `\n` sequences (the extraction escaped the book's line
  breaks inside Markdown table cells) become real newlines — 9,263 of them in
  564 explanation strings in the bundled bank;
* every question's `source_reference`, every `supplied_answer.source`, the
  paper-level `answer_key` and `source_files` blocks, and parser bookkeeping in
  `metadata` (`book_additional_information`, `parser_version`,
  `question_type_basis`, `source_answer_text_preserved_as_options`, …) are
  removed from the existing 2019–2024 extraction and recorded in the report;
  historical adapter flags and preliminary labels remain in the separate source audit;
* paper names that carry a source flavour are normalised.

The legacy repair pass changes only recorded extraction artefacts. The separate
2013–2018 adapters apply 126 audited safe/placeholder repairs; all other stems,
options, printed keys and source explanations are preserved. `--no-repair` runs
the legacy pipeline against an already-clean intake.

**Reviewed labels (`tools/classify/reviewed-labels.mjs`).** Some questions carry no
subject signal a rule can see ("Which of the following statements is *not*
correct?") or do not fit a narrow taxonomy node. A reviewer records the supported
classification and reason in one JSONL line; `review_method` is optional for legacy
human-reviewed entries and explicit for other processes:

```json
{"id":"MPPSC-2019-006","subject":"Madhya Pradesh Special",
 "topic":"Personalities and awards of Madhya Pradesh",
 "subtopic":"Sports from Madhya Pradesh","confidence":0.88,
 "review_method":"human_review",
 "reason":"Captain Roop Singh Stadium, Gwalior — a Madhya Pradesh sports venue."}
```

`--apply-review data/pyq/reviewed-labels.jsonl` merges them **after** the rule
pass, so a reviewed label wins over a rule guess. The merge is strict:

* a subject, topic or subtopic that is not a real taxonomy path is **rejected**
  with the reason and changes nothing;
* the record's classification becomes `reviewed` — never `pipeline-ai`; the
  optional `review_method` is copied into internal report metadata (legacy labels
  default to `human_review`, while agent-assisted validation is identified explicitly);
* each decision is written into the review report's **Reviewed classification
  decisions** table with its before/after, method and reason, and the review file
  stays in the repository so the decision can be re-read and re-run;
* the question's `metadata.reviewed_classification` bookkeeping (which file, when)
  is stripped from the app-facing bank by the sanitiser — the decision itself is
  the classification and stays.

In the final combined bank 566 reviewed labels are applied: the 244 legacy
`human_review` records and 322 `agent_assisted_validation` labels added by the
focused audit. There are 0 rejected or malformed reviewed labels; 560 replace a
rule result. Historical preliminary labels are never copied as final
classifications. No provider-generated `pipeline-ai` labels were merged
(`ai_labels_applied` remains 0). Current coverage is 1,171/1,171 subjects,
1,162/1,171 topics and 1,076/1,171 subtopics; 9 questions have no topic and 95
have no subtopic. These missing lower levels are documented rather than guessed.
The production review queue now contains only `MPPSC-2021-065`. The previous
`classification-report.*` and `review-report.*` files are marked as pre-remediation
snapshots; the current totals and queue are in
`data/pyq/quality-audit/quality-audit-final.md` and `.json`.

### The answer review pass

`--apply-answers data/pyq/reviewed-answers.jsonl` resolves the questions the
source printed **no answer for** (`tools/classify/answer-review.mjs`). One JSONL
line per question:

```json
{"id":"MPPSC-2024-079","answer":["D"],
 "basis":"deleted_by_commission",
 "reason":"MPPSC deleted this question, so no official key exists. The standard elevations order …",
 "explanation":"Order by elevation: Dhupgarh 1350 m < Mahendragiri 1501 m < …"}
```

* it runs **after** classification on purpose: an explanation is evidence for the
  rule engine, so resolving a key must not be able to move a label;
* a record that already carries a printed key is **never** overwritten — it is
  reported as `preserved` instead, which is why this pass is safe to run on a
  whole bank;
* the answer is written as `supplied_answer` with `answer_key_status: "supplied"`,
  the same status any other stored key gets, and `basis`/`reason` go to the review
  report's **Answer resolutions** table rather than into the bank;
* `explanation` is the prose a learner sees in the app, so it is written to say
  what the answer rests on — including, for a question MPPSC deleted, that MPPSC
  deleted it;
* an id that is not in the bank, or an answer that is not one of its option keys,
  is rejected and listed; nothing is silently adjusted.

In the combined bank this resolves the eight 2019–2024 source omissions,
preserving 0 printed keys and rejecting 0 lines. All 600 historical questions
already carry a mapped printed key and are not changed by this review file.

## 3. The AI step (optional, resumable)

Questions the rules cannot settle are written to an AI queue instead of being
labelled by guesswork:

```bash
node tools/classify-bank.mjs --in intake.json --out bank.json --reports data/pyq
node tools/classify/ai-provider.mjs --queue data/pyq/ai-queue.jsonl --out data/pyq/ai-labels.jsonl
node tools/classify-bank.mjs --in intake.json --out bank.json --reports data/pyq \
    --apply-ai data/pyq/ai-labels.jsonl
```

Provider configuration comes from the environment only —
`MYMPPSC_AI_PROVIDER`, `MYMPPSC_AI_API_KEY`, `MYMPPSC_AI_BASE_URL`,
`MYMPPSC_AI_MODEL`. **No key is read from or written to the repository.** With no
provider configured, `ai-provider.mjs` exits with a clear message and leaves the
queue untouched; everything the rules could place is already in the bank. The
step is resumable (`--skip`, `--limit`) and safe to re-run.

Every request carries the **closed vocabulary** the provider may choose from:
all 435 valid `Subject > Topic > Subtopic` combinations of taxonomy
`1.0.1`. They live in one shared sidecar, `ai-queue.taxonomy.json`, written next
to the queue (each queue item points at it with `taxonomy_ref`, so the queue file
stays small), and the request states that a value outside the list is rejected.

Provider replies are not trusted blindly. The merge is conservative in one
direction only — it may add a classification, never destroy one:

- a subject the taxonomy does not contain, a non-string subject, a reply that is
  not a JSON object, and a line that is not valid JSON are **rejected**; the
  record is left byte-identical to what it was;
- an empty reply (`null`, `""` or no subject at all) changes **nothing** — the
  rule engine's classification stands and the question stays in the queue;
- a topic or subtopic the taxonomy rejects is dropped, and the level the record
  already had is kept when it still fits the subject; if the subject moved, the
  old level is dropped rather than stored under a subject it does not belong to;
- a label never overwrites a classification the source file supplied unless
  `--overwrite-source` is passed, and labels below the `0.6` threshold are
  flagged for review.

Every response produces exactly one row in the review report's **AI label
merge** table — `applied`, `partial` (some level kept from the record),
`preserved`, `no_label` or `rejected` — with the reason and the resulting
subject/topic/subtopic, and malformed lines are listed with their line numbers.
Nothing is dropped silently. The rule engine runs **before** the merge, so a
partial reply cannot cost a question the topic the rules had already found.

## 4. What comes out

| File | Contents |
| --- | --- |
| `mymppsc-pyq-bank.json` | schema 1.0.0 bank: 1,171 questions across 12 papers, loaded automatically at boot; it remains a normal importable bank |
| `classification-report.md` / `.json` | counts and percentages at subject, topic and subtopic level, breakdown by subject/topic/subtopic, how each label was produced, confidence distribution, the unclassified list with reasons and candidates, the low-confidence list |
| `review-report.md` / `.json` | missing keys, suspected duplicates, ambiguous and low-confidence classifications, AI label merge decisions, source-integrity checks, unmapped keys, adapter notes, the historical source audit, and the preservation statement |
| `historical-source-audit.md` / `.json` | per-year 2013–2018 source schema, counts, README/review checks, source flags, preliminary-label counts, empty fields and before/after repairs |
| `ai-queue.jsonl` | the questions still needing a semantic label |
| `ai-queue.taxonomy.json` | the closed vocabulary those requests must use (shared by every queue item) |

### 4b. The app-facing sanitiser

The last pass (`tools/classify/sanitise-bank.mjs`) is the boundary between the
pipeline's working papers and the file the app ships:

* **provenance out** — the bank-level `provenance` block, any remaining
  `source_reference` / `supplied_answer.source` / paper `answer_key` /
  `source_files`, parser and review bookkeeping in `metadata`,
  `classification_confidence` / `classification_source`, every review field on an
  explanation and the bank-level `classification_meta`; the audit detail is written
  into the review report's *App-facing bank sanitisation* section instead. The
  rule for what may stay is simple: if a learner could not act on it, it is not in
  the file;
* **neutral answer vocabulary** — a stored key becomes `status: "supplied"` ("an
  answer is stored with this question"); the app makes no claim about who issued
  it, and a keyless question stays `missing`;
* **the practice scoring policy is written in** — every bundled 2013–2024 MPPSC
  paper gets the latest reported +3/−1/0 practice scheme from `js/core/marking.js`
  (`docs/MARKING.md`). This user-directed uniform application is not evidence of
  each paper's historical rules. Explicit user scoring overrides remain protected;
  papers outside the covered MPPSC range retain unknown rules rather than guessing;
* **identifiers become app-facing** — `bank_id`, `bank_name` and paper ids
  (`MPPSC-2013-GS1-BOOK` → `MPPSC-2013-P1`, `MPPSC-2019-GS1-BOOK` →
  `MPPSC-2019-P1`). The established bank id remains stable so existing installs
  update in place. Question ids never change: user data hangs off them. This identity is stamped on **real** data only: a
  demonstration/sample build (`is_demonstration: true`) keeps its own id, name
  and paper names, so a synthetic file can never be mistaken for the bundled
  bank (the committed `data/pyq/example/` output is such a build).

The combined build reads the existing 2019–2024 parser review file
(`MPPSC_PYQ_Review.json` next to `--in`, or `--source-review <file>`); its
caveats are folded into **Source extraction findings**: 573 detected blocks,
571 exported records, two unrecoverable blocks, numbering gaps and flagged
records. The 2013–2018 packages are checked separately by six strict adapters;
all 600 structured records must pass. Pass `--no-source-review` to skip only
the legacy source-report lookup.

Exit codes: `0` written, `1` usage error, `2` blocked (the validator rejects
records), `3` `--strict` and something still needs review.

Nothing is written at all if the app's validator would reject any record.

## 5. Integrity guarantees

* **No silent record loss or deduplication.** Every record in the combined
  intake is retained; `records_removed: 0` and `records_merged: 0`. The legacy
  extraction still contains only 571 of 573 detected blocks because two question
  blocks could not be recovered; the audit names both. All 600 historical
  structured records pass the strict adapters or the build fails.
* **Suspected duplicates are flagged, never merged.** Both members of every
  near-duplicate pair stay in the bank with
  `metadata.near_duplicate_candidates` and the flag `near_duplicate_candidate`.
  Reworded questions about the same fact are often legitimately separate, so the
  decision is left to a human.
* **Missing keys stay missing.** `supplied_answer.answer = null`,
  `answer_key_status: "missing"`, and the app excludes the question from scoring.
* **Printed and verified answers stay separate.** `supplied_answer` and
  `verified_answer` are both preserved; a disagreement between them is reported
  in the review report and surfaced by the app, never resolved silently.
* **Internal audit details stay outside the bank.** The sanitizer removes
  `classification_confidence`, `classification_source`, review bookkeeping,
  explanation status, source flags, preliminary labels, near-duplicate pointers
  and build metadata. The app receives question content, supported taxonomy
  labels and the explicit latest-pattern practice scoring policy.
* **Reproducible.** The same input produces byte-identical classifications
  (`generated_at` aside); no randomness, no network, no manual record editing.

## 6. Worked example

[`demo/pyq-intake-sample.json`](../demo/pyq-intake-sample.json) is a small
synthetic file written to exercise the interesting cases: an MP river question,
the same river in Gujarat, a Hindi question about the state's first Chief
Minister, an out-of-taxonomy source classification, a question with no key, a
disputed key with an independent verified answer, and a near-duplicate pair.

```bash
node tools/classify-bank.mjs --in demo/pyq-intake-sample.json \
    --out data/pyq/example/mppsc-pyq-sample-bank.json --reports data/pyq/example
node tools/build-bank.mjs --validate data/pyq/example/mppsc-pyq-sample-bank.json
```

Its output is committed under `data/pyq/example/` so the reports can be read
without running anything. It is demonstration data: `is_demonstration: true`,
and never to be presented as a genuine MPPSC paper.

## 7. Getting the bank into the app

**The bundled bank needs no import.** `js/services/builtin-bank.js` fetches
`data/pyq/mymppsc-pyq-bank.json` during boot, validates it with the same
validator the import screen uses, and imports it through the same two-phase
importer. Idempotence is decided by comparing the file with what is stored (new
records / changed records) plus the recorded SHA-256, so re-opening the app or
reloading the same bank writes nothing and cannot duplicate anything. The
conflict policy is *update, preserving my corrections*, so user corrections,
verified answers, bookmarks, attempts, revision history and locally authored
questions survive a bank update. The service worker precaches the file, so it
also works offline after the first load. **Question Bank & Imports** shows the
loaded state and offers *Check for an updated bundled bank* and *Remove bundled
bank from this device*.

**A bank you built yourself** still imports by hand:

1. `npm run serve` (any static server works) and open the app.
2. **Question Bank & Imports → Import → choose file** → the bank JSON.
3. Review the pre-import summary: papers, declared vs present counts, rejected
   records, warnings, near-duplicate pairs.
4. Choose a conflict policy (keep existing is the default) and confirm.

The app validates the file again on import regardless of what the pipeline said.
