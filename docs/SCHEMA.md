# Question-bank JSON schema (version 1.0.0)

A *bank* is one UTF-8 JSON file. It is the only way questions enter MyMPPSC. The
authoritative, machine-readable version of this document lives in
[`data/schema/question-bank.schema.json`](../data/schema/question-bank.schema.json);
this file explains it in prose and describes exactly what the importer does with
each field.

```bash
node tools/build-bank.mjs --validate my-bank.json   # validate before importing
```

## Versioning rules

* `schema_version` is a required string. This build supports **1.0.0** (`js/core/constants.js → SUPPORTED_SCHEMA_VERSIONS`).
* A different **major** version is refused with a fatal error — the file is not partially imported.
* A different minor/patch within the same major is accepted with a warning, so a newer pipeline output keeps working with an older app build.
* Records that fail validation are **rejected and listed** with a reason. Nothing is dropped silently, and a file whose records *all* fail is refused outright (`no_importable_questions`).

## Envelope

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schema_version` | string | yes | `"1.0.0"` |
| `bank_id` | string | recommended | Stable id used to group import history. Missing → derived from the bank name. |
| `bank_name` | string | no | Shown in the pre-import summary and history. |
| `generated_at` | ISO string | no | Informational. |
| `generator` | object | no | `{name, version, notes}` — who produced the file. Kept in the import record. |
| `is_demonstration` | boolean | no | `true` marks synthetic content. Every affected question is badged **demonstration** in the UI and can be excluded from filters. |
| `provenance` | object | strongly recommended | `{kind, verified, notes, sources[]}`. Shown in the pre-import summary and stored with the import. |
| `default_language` | string | no | `en` or `hi`. |
| `papers` | array | yes | At least one paper (or papers are auto-created as placeholders — see below). |
| `questions` | array | yes | At least one must validate. |

## Paper records

| Field | Type | Notes |
| --- | --- | --- |
| `paper_id` | string | Key for the paper. Required. |
| `exam` | string | e.g. `"MPPSC State Service Preliminary Examination"`. |
| `year` | number\|null | The exam year. |
| `paper_name` | string | Human label used throughout the UI. |
| `paper_code` | string\|null | e.g. `GS-I`. |
| `set_code` | string\|null | Booklet set (`A`, `B`, …). Sets are separate papers, each with its own key. |
| `language` | string\|null | `en`, `hi` or `bilingual`. |
| `original_question_count` | number\|null | How many questions the paper really contains. **Do not fake this to match what you stored**: a mismatch is reported as an incomplete paper and the simulation says so. |
| `duration_minutes` | number\|null | Drives the countdown for full simulations. `null` = no time limit. |
| `total_marks` | number\|null | Informational. |
| `scoring` | object | See below. **Never guess these values.** |
| `question_order` | string[] | The paper's original order. Entries that do not exist are reported; stored questions missing from the list are appended by question number and flagged. |
| `answer_key` | object | `{source, status, published_at, notes}` where `status` ∈ `provisional`, `final`, `unofficial`, `disputed`, `missing`, `unknown`. |
| `source_files` | array | `{path, pages, sha256}` — where the paper was obtained. Retained as provenance. |
| `import_validation` | object | `{status, checked_at, notes}` from *your* pipeline. |
| `metadata` | object | Free-form; preserved verbatim. |

### Scoring rules

```json
"scoring": {
  "rules_known": true,
  "marks_per_correct": 2,
  "negative_marks_per_incorrect": 0.66,
  "negative_marking_enabled": true,
  "marks_for_unanswered": 0,
  "rules_source": "MPPSC notification, clause 12",
  "notes": null
}
```

* `rules_known: false` means the source does not state the rules. The app then **refuses to score** a test on that paper until you configure the rules (paper card → *Edit rules*, or in the runner when submitting). It never assumes `2 / −0.66`.
* Rules you configure are stored as an override (`user_scoring_override`) with the original object kept under `original_scoring`.
* Negative marking is applied only when `negative_marking_enabled` is true; `negative_marks_per_incorrect` is stored as a positive number.
* **The bundled 2019–2024 bank does not ask you for any of this.** Each of its papers already carries the scheme that applied to its examination year, written at build time from `js/core/marking.js` (`docs/MARKING.md`). A paper whose year no verified scheme covers keeps `rules_known: false` on purpose.
* **Provenance fields are absent from the bundled bank on purpose.** It has no `provenance` block, no per-question `source_reference` and no paper `answer_key`/`source_files`; a stored key is `status: "supplied"` (an answer is stored with the question) or `missing`. That audit detail lives in `data/pyq/review-report.md` and `docs/PYQ_AUDIT.md`. Banks **you** produce may of course fill these fields in; the schema and the importer still accept them.

## Question records

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Stable, unique. Bilingual variants of one question **share one id** and are counted once in every statistic. |
| `paper_id` | string | yes | Must match a paper, or a placeholder paper is created and the file is flagged. |
| `question_number` | number\|null | recommended | Number within the paper; used to rebuild order and shown in the report. |
| `question_type` | enum | recommended | `single_correct`, `multiple_correct`, `statement_based`, `matching`, `assertion_reason`, `other`. Unknown values are stored as `other` with a warning. `matching` is never option-shuffled. |
| `language_variants` | object | yes | `{ "en": {...}, "hi": {...} }` — at least one. |
| `supplied_answer` | object | recommended | `{answer: ["B"], status, source, notes}`. `answer: null` means the key is genuinely missing. |
| `answer_key_status` | enum | no | Convenience mirror of `supplied_answer.status`. |
| `verified_answer` | object\|null | no | `{answer, status, verified_by, verified_at, evidence[]}` — an **additional** record. It never replaces the supplied key. |
| `verification_evidence` | array | no | `{kind, description, url, retrieved_at}`. |
| `dispute` | object | no | `{is_disputed, status, reason, raised_by}`. |
| `explanation` | object\|null | no | `{language, correct_reasoning, option_explanations:[{key,text,is_correct}], key_concepts:[], revision_takeaways:[], sources:[]}`. The app shows this text and nothing about it: a plain string is accepted too and stored as `correct_reasoning`. There is no review status — the app cannot verify prose, so it neither claims nor implies one. |
| `subject`, `topic`, `subtopic` | — | recommended | Classifications from **your** pipeline (AI or human). The app never classifies anything itself; it displays these and lets you correct them. How a label was chosen — which pass wrote it, how confident it was — is not part of the record: it belongs in your build report, where a reader of the bank cannot act on it. |
| `source_reference` | object | no | `{file, page, url, retrieved_at}`. |
| `provenance` | object | no | `{kind, verified, notes}`. |
| `metadata` | object | no | Preserved verbatim (e.g. original order flags). |

### Language variants

```json
"language_variants": {
  "en": { "question_text": "…", "options": [{"key": "A", "text": "…"}], "context": null, "passage": null },
  "hi": { "question_text": "…", "options": [{"key": "A", "text": "…"}] }
}
```

* Option keys are short labels (`A`, `B`, `1`, `i`) and must be unique inside a variant.
* Fewer than two options, an invalid or duplicated key, or a variant without question text is a rejection.
* Empty option text is a warning.
* Differing option counts between variants produce a warning — the app will show each language's own options.
* **Hindi text is preserved verbatim.** The app never transliterates, rewrites or translates it.

## How records become app data

If a question fails validation it is rejected with a machine-readable code and a
message; the import screen lists every rejection and can export them as JSON.
Recoverable problems become warnings — for example a missing answer key, a
multi-answer key on a `single_correct` question, a question on an undescribed
paper, an unknown question type, or a near-duplicate pair.

On import each question is enriched with fields the app owns (never generated
content):

| Added | Meaning |
| --- | --- |
| `fingerprint` | Hash over normalised question text + option texts, used for exact-duplicate detection. |
| `validation_status`, `validation_notes` | Outcome of the checks above. |
| `paper_incomplete`, `paper_order_index` | Whether the paper is missing questions, and the question's position in the stored order. |
| `import_history[]` | Every import/update that touched the record, with the bank id and time. |
| `imported_at`, `created_at`, `updated_at` | Timestamps. |

User edits are appended to `user_corrections[]` (with `before` values) and the
imported values stay available: classifications under `classification.original`,
answers under `supplied`.

## Round-tripping

**Question Bank & Imports → Export bank** writes the stored bank back out in this
same format (schema version 1.0.0), so a bank exported from one browser profile
can be imported into another. The full backup (**Settings & Backup**) is a
separate format (`mymppsc-backup`) that includes tests, attempts, mistakes,
revision records, syllabus, tasks and sessions — see `docs/LIMITATIONS.md`.
