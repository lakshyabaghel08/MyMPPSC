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
| `original_question_count` | number\|null | How many questions the printed paper contains, recorded as source metadata. **Do not fake this to match what you stored** — but note the app no longer tags papers complete or incomplete; a simulation simply runs the questions stored for the paper. |
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

* `rules_known: false` means the source does not state the rules. The app applies the shared MPPSC practice scheme where the paper's year is covered; otherwise it **refuses to score** until you configure the rules (paper card → *Edit rules*, or in the runner when submitting). It never assumes a generic `2 / −0.66` default for an uncovered paper.
* Rules you configure are stored as an override (`user_scoring_override`) with the original object kept under `original_scoring`.
* Negative marking is applied only when `negative_marking_enabled` is true; `negative_marks_per_incorrect` is stored as a positive number.
* **The bundled 2013–2024 bank carries the latest reported MPPSC practice scheme** on every paper (`mppsc-sse-prelims-latest-practice`, +3/−1/0), written at build time from `js/core/marking.js` (`docs/MARKING.md`). Its uniform application to past papers is a practice policy, not evidence that those historical sittings used the same rules. Other papers outside the scheme's coverage may retain `rules_known: false` and require configuration.
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
| `paper_order_index` | The question's position in the paper's stored order. |
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

## The syllabus renderings file

`data/syllabus/translations/en.json` holds the hand-written English renderings of
the syllabus lines the commission published in Hindi only. It is a **reading aid
for the English interface**, not syllabus data: nothing in it is ever written
back into `data/syllabus/mppsc-2026-syllabus.json`, and no official wording is
ever replaced by it.

```json
{
  "format": "mymppsc-syllabus-translations",
  "format_version": "1.0.0",
  "language": "en",
  "notice": "…what this file is and is not…",
  "source": "data/syllabus/mppsc-2026-syllabus.json",
  "entries": {
    "prelims/paper-1/s1":    { "title": { "hi": "भारत का इतिहास", "en": "History of India" } },
    "prelims/paper-1/s1/t1": { "text":  { "hi": "संकल्पना एवं विचार- …", "en": "Concepts and Ideas - …" } }
  }
}
```

* Keys are official node ids; the field is `title` for a heading and `text` for a
  line of the syllabus — the field the notification itself left Hindi-only.
* Each entry stores the **official Hindi verbatim beside the English**, which is
  what makes staleness detectable: `tests/syllabus-analysis.test.js` fails if an
  entry's `hi` no longer equals the notification's own wording, if a node id has
  disappeared, if a line has gained an official English rendition, or if a
  Hindi-only line has no rendering at all.
* The English is written by hand. No machine translation is used, generated or
  implied, and the interface says so wherever a rendering is shown.
* `loadSyllabus()` fetches the file and `buildModel()` attaches each entry to its
  node as `node.translation`; `node.text` and `node.titles` stay exactly what the
  notification says. A missing or unreadable file is not an error — the screen
  falls back to the official Hindi.
* The file is precached by `sw.js`, so the renderings are available offline.

## The two syllabus stores

The Syllabus section now reads and writes one of these stores. They were **not**
merged into one when the screens were, and neither was dropped when the *My
plan* tab was removed — both still exist, both still round-trip through a
backup, and `DB_VERSION` is unchanged:

| Store | Holds | Key | Read by the UI |
| --- | --- | --- | --- |
| `syllabus` | the items you typed or imported, including any nesting of your own | your item id | no — preserved for backups |
| `syllabus_progress` | what you marked on a line of the commission's syllabus | the official node id | yes |

Nothing in the shipped syllabus is writable, so there is no row to store for an
official line until you mark one — a reader who marks nothing has an empty
`syllabus_progress`. Keeping the stores apart keeps the promise that the tree you
built is yours alone: no official node is ever written into it, and removing the
plan UI neither migrates nor deletes a row of it.

Merging the screens added fields to both row shapes and removed none, so
`DB_VERSION` stays **2** and no migration runs. A backup written by an older
build restores unchanged (`js/services/data.js` backs up whole rows), and a
backup written by this build opens in an older one with the new fields ignored.

* `syllabus_progress` rows gained optional `priority`, `target_date` and
  `notes` — the planning fields, now available on an official line. **No screen
  offers them any more**: the *My plan* tab that used them was removed, so they
  are preserved rather than presented. `js/services/syllabus.js` still reads and
  writes them (`PLAN_FIELDS`, `setProgressPlan()`) so a backup taken before the
  removal restores with them intact, and clearing or resetting a status never
  deletes them.
* `syllabus` rows gained an optional `attached_node_id`: the official heading
  you pinned an item under. It is a display relationship, never a copy of
  official text, and like the rest of that store it is now only carried, not
  shown.

Status is one vocabulary across both: `not_started`, `in_progress`,
`completed`, `revised`. Rows written by older builds as `revising` are read as
`in_progress` — in the old planner that status sat *before* `completed`, so
reading it as the official `revised` (which counts as done) would claim a
completion the reader never recorded. The stored string is left alone until the
reader changes it.
