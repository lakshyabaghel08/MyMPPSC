/**
 * tools/classify/sanitise-bank.mjs — turn a built bank into the app-facing file.
 *
 * The pipeline's intermediate artefacts (the source extraction, the review file)
 * are working papers: they record where the text came from, which page it was on
 * and that the printed answers are not independently verified. The bank the app
 * ships must not carry any of that. This step is the boundary between the two.
 *
 * What it changes
 * ---------------
 *  1. Removes source provenance: the bank-level `provenance` block, every
 *     question's `source_reference`, `supplied_answer.source`, the source-file
 *     list, parser bookkeeping and review bookkeeping in `metadata`.
 *  2. Neutralises answer-key labels. A stored key becomes `status: 'supplied'`
 *     ("an answer is stored with this question"); the app makes no claim about
 *     who issued it. A question with no key stays `missing`. `disputed` is kept
 *     because it is a state the app acts on.
 *  3. Removes the pipeline's own working notes from the records it ships: the
 *     classification confidence and source, the flags and evidence in `metadata`,
 *     the suspected-duplicate pointers, and every explanation's review
 *     bookkeeping (`status`, `reviewed_by`, and so on). The labels themselves,
 *     the answers and the explanation prose are untouched, and all of this detail
 *     is printed in the review report instead.
 *  4. Repairs extraction escapes: literal two-character `\n` sequences inside
 *     explanation text become real newlines.
 *  5. Writes the automatic MPPSC marking scheme into each paper's `scoring`
 *     block (and the paper's duration, total marks and official question count),
 *     using js/core/marking.js — the single source of truth the app also reads.
 *     A paper whose examination year has no verified scheme keeps
 *     `rules_known: false` so the app asks for configuration instead of guessing;
 *     a paper that already carries usable rules of its own keeps them, and the
 *     report says so (a pipeline must never overwrite rules it did not verify).
 *  6. Replaces source-flavoured identifiers: `bank_id`, `bank_name`, paper ids
 *     (`MPPSC-2019-GS1-BOOK` → `MPPSC-2019-P1`) and paper names. Question ids
 *     (`MPPSC-2019-001`) never change — they are the keys user data hangs off.
 *     The identity of the bundled bank is only stamped on real data: a
 *     demonstration/sample build keeps its own id, name and paper names.
 *
 * Everything it removes is returned in `report`, and the review report prints
 * that: the audit detail moves to the internal report instead of disappearing.
 *
 * Build-time tool only — the browser app never imports this file.
 */

import { resolveMppscMarkingScheme, schemeScoring } from '../../js/core/marking.js';

/** The app-facing identity of the bundled bank. Stable — stored imports use it. */
// Keep the established id so existing installs update in place instead of
// creating a second bundled bank; the display name now reflects all six years.
export const APP_BANK_ID = 'mppsc-prelims-paper1-2019-2024';
export const APP_BANK_NAME = 'MPPSC Prelims Paper I (General Studies) 2013–2024';

/** Metadata written by the source parser. Audit detail, not app data. */
const PARSER_METADATA_KEYS = [
  'book_additional_information',
  'parser_version',
  'source_answer_text_preserved_as_options',
  'source_file',
  'source_page',
];

/**
 * Metadata the pipeline itself writes while it works. Every one of these is a
 * note about *how the file was built* — which rule fired, which flag was raised,
 * which review file a decision came from — and the app has nothing to do with
 * any of it. They all stay in the review and classification reports, which is
 * where a reader who cares about provenance looks.
 */
const PIPELINE_METADATA_KEYS = [
  'classification_flags',
  'classification_evidence',
  'classification_review',
  'classification_dropped',
  'near_duplicate_candidates',
  'answer_review',
  'question_type_basis',
  'section',
];

/** Classification bookkeeping on the record: the labels stay, the meta-data goes. */
const CLASSIFICATION_BOOKKEEPING_KEYS = ['classification_confidence', 'classification_source'];

const PAPER_NAME_BY_CODE = {
  'GS-I': 'Paper I (General Studies)',
  'GS-II': 'Paper II (General Aptitude)',
};

/** `MPPSC-2019-GS1-BOOK` → `MPPSC-2019-P1`; anything else is left alone. */
export function cleanPaperId(paperId) {
  const value = String(paperId ?? '');
  // The extraction used both digits and roman numerals (`GS1`, `GS-I`).
  return value.replace(/-GS-?(II|I|2|1)-BOOK$/i, (_m, code) => {
    const isPaper2 = /^(II|2)$/i.test(String(code));
    return `-P${isPaper2 ? '2' : '1'}`;
  });
}

function cleanPaperName(paper) {
  const code = String(paper.paper_code ?? '').toUpperCase();
  const label = PAPER_NAME_BY_CODE[code] || (code ? `Paper ${code}` : 'Paper');
  const year = paper.year ?? 'unknown year';
  return `MPPSC ${year} Prelims ${label}`;
}

/**
 * Replace literal two-character `\n` sequences with real newlines.
 * The extraction escaped the book's line breaks inside Markdown table cells;
 * the app would otherwise print a visible "\n" in the middle of a sentence.
 */
function repairEscapes(bank, report) {
  let strings = 0;
  let occurrences = 0;
  const walk = (value) => {
    if (typeof value === 'string') {
      if (value.includes('\\n')) {
        strings += 1;
        occurrences += value.split('\\n').length - 1;
        return value.replace(/\\n/g, '\n');
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) value[key] = walk(value[key]);
    }
    return value;
  };
  // Only text the app displays: question text, options and explanations. Ids,
  // dates and provenance-free technical fields are left byte-for-byte alone.
  for (const question of bank.questions || []) {
    for (const variant of Object.values(question.language_variants || {})) {
      if (!variant) continue;
      if (typeof variant.question_text === 'string') variant.question_text = walk(variant.question_text);
      for (const key of ['instructions', 'context', 'passage']) {
        if (typeof variant[key] === 'string') variant[key] = walk(variant[key]);
      }
      if (Array.isArray(variant.options)) {
        for (const option of variant.options) if (option && typeof option.text === 'string') option.text = walk(option.text);
      }
    }
    const explanation = question.explanation;
    if (explanation) {
      if (typeof explanation.correct_reasoning === 'string') explanation.correct_reasoning = walk(explanation.correct_reasoning);
      if (Array.isArray(explanation.option_explanations)) {
        for (const row of explanation.option_explanations) if (row && typeof row.text === 'string') row.text = walk(row.text);
      }
      if (Array.isArray(explanation.key_concepts)) explanation.key_concepts = explanation.key_concepts.map(walk);
      if (Array.isArray(explanation.revision_takeaways)) explanation.revision_takeaways = explanation.revision_takeaways.map(walk);
    }
  }
  report.repaired_escapes = { strings, occurrences };
}

/**
 * @param {object} bank built bank (mutated in place)
 * @param {object} [opts]
 * @param {boolean} [opts.stampAppIdentity] force the bundled bank's id/name on
 *        (default: only for real data — a demonstration build keeps its own)
 * @returns {{bank: object, report: object}}
 */
export function sanitiseBank(bank, opts = {}) {
  const report = {
    statement:
      'The app-facing bank carries no source provenance or internal build/review metadata. Everything listed here was removed from the file the app loads and is kept in this review report instead.',
    identifiers: { bank_id_before: bank.bank_id ?? null, bank_id_after: APP_BANK_ID, bank_name_after: APP_BANK_NAME, paper_ids: [] },
    removed: {
      bank_provenance: bank.provenance ?? null,
      bank_generator: bank.generator ?? null,
      paper_metadata_fields: {},
      question_source_references: 0,
      supplied_answer_sources: 0,
      paper_answer_keys: 0,
      paper_source_files: [],
      parser_metadata_fields: {},
      review_metadata_fields: 0,
      classification_bookkeeping: {},
      explanation_bookkeeping: 0,
      sample_source_references: [],
      bank_classification_meta: null,
    },
    answer_status: { remapped_to_supplied: 0, missing: 0, disputed: 0, other: 0 },
    marking_scheme: [],
    marking_scheme_preserved: [],
    marking_scheme_unresolved: [],
    repaired_escapes: { strings: 0, occurrences: 0 },
  };

  /* ------------------------------------------------ 1. identifiers ------- */
  const stampAppIdentity = opts.stampAppIdentity ?? bank.is_demonstration !== true;
  report.identifiers.stamped_app_identity = stampAppIdentity;
  const paperIdMap = new Map();
  if (stampAppIdentity) {
    bank.bank_id = APP_BANK_ID;
    bank.bank_name = APP_BANK_NAME;
    for (const paper of bank.papers || []) {
      const before = paper.paper_id;
      const after = cleanPaperId(before);
      if (after !== before) paperIdMap.set(before, after);
      paper.paper_id = after;
      if (paper.paper_name) paper.paper_name = cleanPaperName(paper);
    }
    for (const question of bank.questions || []) {
      if (paperIdMap.has(question.paper_id)) question.paper_id = paperIdMap.get(question.paper_id);
    }
    report.identifiers.bank_id_before = report.identifiers.bank_id_before ?? null;
    report.identifiers.bank_id_after = APP_BANK_ID;
    report.identifiers.bank_name_after = APP_BANK_NAME;
  } else {
    report.identifiers.bank_id_after = bank.bank_id ?? null;
    report.identifiers.bank_name_after = bank.bank_name ?? null;
    report.identifiers.kept_reason = 'This build is demonstration/sample data: it keeps its own identity so it can never be mistaken for the real bank.';
  }
  report.identifiers.paper_ids = [...paperIdMap.entries()].map(([from, to]) => ({ from, to }));
  report.paper_id_map = Object.fromEntries(paperIdMap);

  /* ------------------------------------------------ 2. provenance -------- */
  delete bank.provenance;
  delete bank.generator;
  // A bank built by an earlier run of this pipeline carried a description of its
  // own labelling. A bank re-fed through the pipeline must not hand that straight
  // back to the app, so it is lifted out and reported.
  if (bank.classification_meta) {
    report.removed.bank_classification_meta = bank.classification_meta;
    delete bank.classification_meta;
  }

  const bump = (key) => {
    report.removed.parser_metadata_fields[key] = (report.removed.parser_metadata_fields[key] || 0) + 1;
  };

  for (const question of bank.questions || []) {
    if (question.source_reference) {
      report.removed.question_source_references += 1;
      if (report.removed.sample_source_references.length < 3) {
        report.removed.sample_source_references.push({ id: question.id, reference: question.source_reference });
      }
      delete question.source_reference;
    }
    if (question.supplied_answer) {
      if (question.supplied_answer.source) {
        report.removed.supplied_answer_sources += 1;
        delete question.supplied_answer.source;
      }
      if (question.supplied_answer.notes) delete question.supplied_answer.notes;
    }
    for (const key of [...PARSER_METADATA_KEYS, ...PIPELINE_METADATA_KEYS]) {
      if (question.metadata && key in question.metadata) {
        delete question.metadata[key];
        bump(key);
      }
    }
    // The review pass records which review file a decision came from and when.
    // That is build-time bookkeeping: the decision itself (and its reason) is in
    // the review report, and the app needs neither.
    for (const key of ['reviewed_classification', 'ai_label']) {
      if (question.metadata && key in question.metadata) {
        delete question.metadata[key];
        report.removed.review_metadata_fields += 1;
      }
    }
    if (question.metadata && Object.keys(question.metadata).length === 0) delete question.metadata;

    // How much the pipeline trusted a label, and whether a person or a model
    // wrote it, is the audit's business. The learner only needs the label.
    for (const key of CLASSIFICATION_BOOKKEEPING_KEYS) {
      if (key in question) {
        delete question[key];
        report.removed.classification_bookkeeping[key] = (report.removed.classification_bookkeeping[key] || 0) + 1;
      }
    }
    // An explanation is prose. Its review state was never the app's to display,
    // and the review vocabulary no longer exists in the app at all.
    if (question.explanation && typeof question.explanation === 'object') {
      for (const key of ['status', 'generated_by', 'reviewed_by', 'generated_at', 'reviewed_at', 'original', 'history']) {
        if (key in question.explanation) {
          delete question.explanation[key];
          report.removed.explanation_bookkeeping += 1;
        }
      }
    }
    if ('explanation_status' in question) {
      delete question.explanation_status;
      report.removed.explanation_bookkeeping += 1;
    }
  }

  for (const paper of bank.papers || []) {
    if (paper.answer_key) {
      report.removed.paper_answer_keys += 1;
      delete paper.answer_key;
    }
    if (Array.isArray(paper.source_files) && paper.source_files.length) {
      report.removed.paper_source_files.push(...paper.source_files.map((f) => ({ paper_id: paper.paper_id, file: f?.path ?? f?.file ?? null })));
      delete paper.source_files;
    } else if ('source_files' in paper) {
      delete paper.source_files;
    }
    if (paper.metadata && typeof paper.metadata === 'object') {
      for (const key of ['source_kind', 'parser_version', 'built_by']) {
        if (key in paper.metadata) {
          report.removed.paper_metadata_fields[key] = (report.removed.paper_metadata_fields[key] || 0) + 1;
          delete paper.metadata[key];
        }
      }
      if (Object.keys(paper.metadata).length === 0) delete paper.metadata;
    }
  }

  /* ------------------------------------- 3. answer-key status language --- */
  for (const question of bank.questions || []) {
    const hasAnswer = Boolean(question.supplied_answer?.answer?.length);
    const status = question.supplied_answer?.status ?? question.answer_key_status ?? null;
    let next;
    if (!hasAnswer) next = 'missing';
    else if (status === 'disputed') next = 'disputed';
    else next = 'supplied';
    if (hasAnswer && next === 'supplied' && status !== 'supplied') report.answer_status.remapped_to_supplied += 1;
    if (next === 'missing') report.answer_status.missing += 1;
    else if (next === 'disputed') report.answer_status.disputed += 1;
    if (question.supplied_answer) question.supplied_answer.status = next;
    question.answer_key_status = next;
  }

  /* --------------------------------------------- 4. marking schemes ----- */
  for (const paper of bank.papers || []) {
    const declared = paper.scoring && typeof paper.scoring === 'object' ? paper.scoring : null;
    const scheme = resolveMppscMarkingScheme(paper);
    const declaredMatchesScheme = Boolean(
      scheme &&
        declared?.rules_known === true &&
        declared.scheme_id === scheme.id &&
        Number(declared.marks_per_correct) === scheme.marks_per_correct &&
        (Number(declared.negative_marks_per_incorrect) || 0) === (scheme.negative_marking_enabled ? Math.abs(scheme.negative_marks_per_incorrect) : 0) &&
        Boolean(declared.negative_marking_enabled) === Boolean(scheme.negative_marking_enabled) &&
        (Number(declared.marks_for_unanswered) || 0) === (scheme.marks_for_unanswered || 0),
    );
    if (declared?.rules_known === true && Number.isFinite(Number(declared.marks_per_correct)) && (!scheme || declaredMatchesScheme)) {
      report.marking_scheme_preserved.push({
        paper_id: paper.paper_id,
        year: paper.year ?? null,
        scheme_id: declared.scheme_id ?? null,
        marks_per_correct: Number(declared.marks_per_correct),
        negative_marks_per_incorrect: Number(declared.negative_marks_per_incorrect) || 0,
        negative_marking_enabled: Boolean(declared.negative_marking_enabled),
        marks_for_unanswered: Number(declared.marks_for_unanswered) || 0,
        total_marks: paper.total_marks ?? null,
        duration_minutes: paper.duration_minutes ?? null,
        rules_source: declared.rules_source ?? null,
      });
      continue;
    }
    if (scheme) {
      paper.scoring = schemeScoring(scheme);
      paper.original_question_count = scheme.original_question_count ?? paper.original_question_count ?? null;
      paper.duration_minutes = scheme.duration_minutes ?? paper.duration_minutes ?? null;
      paper.total_marks = scheme.total_marks ?? paper.total_marks ?? null;
      report.marking_scheme.push({
        paper_id: paper.paper_id,
        year: paper.year,
        scheme_id: scheme.id,
        scheme_label: scheme.label,
        previous_scheme_id: declared?.scheme_id && declared.scheme_id !== scheme.id ? declared.scheme_id : null,
        previous_rules_source: declared?.scheme_id && declared.scheme_id !== scheme.id ? declared.rules_source ?? null : null,
        confidence: scheme.confidence,
        marks_per_correct: scheme.marks_per_correct,
        negative_marks_per_incorrect: paper.scoring.negative_marks_per_incorrect,
        marks_for_unanswered: scheme.marks_for_unanswered || 0,
        total_marks: paper.total_marks,
        duration_minutes: paper.duration_minutes,
      });
    } else {
      paper.scoring = {
        rules_known: false,
        marks_per_correct: null,
        negative_marks_per_incorrect: null,
        negative_marking_enabled: null,
        marks_for_unanswered: null,
        rules_source: null,
        notes:
          'No verified MPPSC marking scheme covers this paper\'s examination year. The app does not assume one: configure the rules before using full-paper scoring.',
      };
      report.marking_scheme_unresolved.push({ paper_id: paper.paper_id, year: paper.year ?? null, paper_code: paper.paper_code ?? null });
    }
  }

  /* ------------------------------------------------ 5. text repairs ----- */
  repairEscapes(bank, report);

  return { bank, report };
}
