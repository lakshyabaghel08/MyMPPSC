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
 *  3. Repairs extraction escapes: literal two-character `\n` sequences inside
 *     explanation text become real newlines.
 *  4. Writes the automatic MPPSC marking scheme into each paper's `scoring`
 *     block (and the paper's duration, total marks and official question count),
 *     using js/core/marking.js — the single source of truth the app also reads.
 *     A paper whose examination year has no verified scheme keeps
 *     `rules_known: false` so the app asks for configuration instead of guessing;
 *     a paper that already carries usable rules of its own keeps them, and the
 *     report says so (a pipeline must never overwrite rules it did not verify).
 *  5. Replaces source-flavoured identifiers: `bank_id`, `bank_name`, paper ids
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
export const APP_BANK_ID = 'mppsc-prelims-paper1-2019-2024';
export const APP_BANK_NAME = 'MPPSC Prelims Paper I (General Studies) 2019–2024';

/** Metadata written by the source parser. Audit detail, not app data. */
const PARSER_METADATA_KEYS = [
  'book_additional_information',
  'parser_version',
  'question_type_basis',
  'source_answer_text_preserved_as_options',
  'source_file',
  'source_page',
];

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
      'The app-facing bank carries no source provenance. Everything listed here was removed from the file the app loads and is kept in this review report instead.',
    identifiers: { bank_id_before: bank.bank_id ?? null, bank_id_after: APP_BANK_ID, bank_name_after: APP_BANK_NAME, paper_ids: [] },
    removed: {
      bank_provenance: bank.provenance ?? null,
      question_source_references: 0,
      supplied_answer_sources: 0,
      paper_answer_keys: 0,
      paper_source_files: [],
      parser_metadata_fields: {},
      review_metadata_fields: 0,
      sample_source_references: [],
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
    for (const key of PARSER_METADATA_KEYS) {
      if (question.metadata && key in question.metadata) {
        delete question.metadata[key];
        bump(key);
      }
    }
    // The review pass records which review file a decision came from and when.
    // That is build-time bookkeeping: the decision itself (and its reason) is in
    // the review report, and the app needs neither.
    if (question.metadata && 'reviewed_classification' in question.metadata) {
      delete question.metadata.reviewed_classification;
      report.removed.review_metadata_fields += 1;
    }
    if (question.metadata && Object.keys(question.metadata).length === 0) delete question.metadata;
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
    if (paper.metadata && 'source_kind' in paper.metadata) delete paper.metadata.source_kind;
    if (paper.metadata && 'parser_version' in paper.metadata) delete paper.metadata.parser_version;
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
    // A paper that already states usable rules keeps them: the pipeline writes
    // the automatic MPPSC scheme only where the source had none. Overwriting a
    // verified rule set with a table lookup would be an invention.
    const declared = paper.scoring && typeof paper.scoring === 'object' ? paper.scoring : null;
    if (declared?.rules_known === true && Number.isFinite(Number(declared.marks_per_correct))) {
      report.marking_scheme_preserved.push({
        paper_id: paper.paper_id,
        year: paper.year ?? null,
        marks_per_correct: Number(declared.marks_per_correct),
        rules_source: declared.rules_source ?? null,
      });
      continue;
    }
    const scheme = resolveMppscMarkingScheme(paper);
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
  if (bank.generator) {
    bank.generator.notes =
      'Classified by the deterministic rule engine and a maintainer review pass (tools/classify-bank.mjs). Question text, options, answers and explanations are reproduced as provided; only classification, review metadata and the automatic marking scheme were added.';
  }

  return { bank, report };
}
