/**
 * tools/classify/repair.mjs — repair the extraction's artefacts before building.
 *
 * The source extraction is a faithful but mechanical reading of a solved book:
 * it escaped the book's line breaks inside Markdown table cells (`\n` as two
 * characters), it copied book-specific notes into `metadata`, it stamped every
 * record with the source file and page, and it labelled each printed answer with
 * where that answer came from. None of that belongs in the bank the app ships.
 *
 * This step runs on the *intake* object, before classification, so everything
 * downstream (rule-engine evidence, reports, the built bank) sees the repaired
 * text and the cleaned fields. It never guesses: it converts an escape artefact
 * back into the newline it represents, moves provenance out of the data into the
 * returned report, and leaves the wording of every question, option, answer and
 * explanation exactly as the extraction captured it.
 *
 * Build-time tool only — the browser app never imports this file.
 */

export const REPAIR_VERSION = '1.0.0';

/** Two-character `\n` sequences that the extraction left in text fields. */
const ESCAPED_NEWLINE = /\\n/g;

/** Parser bookkeeping in `metadata` — audit detail, not app data. */
const PARSER_METADATA_KEYS = [
  'book_additional_information',
  'parser_version',
  'question_type_basis',
  'source_answer_text_preserved_as_options',
  'source_file',
  'source_pages',
  'source_page',
];

/** Repair an escaped string; returns the new text and how many sequences went. */
export function repairEscapedNewlines(value) {
  if (typeof value !== 'string' || !value.includes('\\n')) return { text: value, count: 0 };
  return { text: value.replace(ESCAPED_NEWLINE, '\n'), count: value.split('\\n').length - 1 };
}

/** Fields whose escaped line breaks are artefacts of the extraction. */
function repairQuestionText(question, tally) {
  const apply = (value, bucket) => {
    const { text, count } = repairEscapedNewlines(value);
    if (count) {
      tally.strings += 1;
      tally.occurrences += count;
      tally.by_field[bucket] = (tally.by_field[bucket] || 0) + count;
    }
    return text;
  };

  for (const variant of Object.values(question.language_variants || {})) {
    if (!variant || typeof variant !== 'object') continue;
    variant.question_text = apply(variant.question_text, 'question_text');
    if (Array.isArray(variant.options)) {
      for (const option of variant.options) {
        if (option && typeof option === 'object') option.text = apply(option.text, 'option_text');
      }
    }
    for (const key of ['instructions', 'context', 'passage']) {
      if (typeof variant[key] === 'string') variant[key] = apply(variant[key], key);
    }
  }

  const explanation = question.explanation;
  if (explanation && typeof explanation === 'object') {
    if (typeof explanation.correct_reasoning === 'string') {
      explanation.correct_reasoning = apply(explanation.correct_reasoning, 'explanation');
    }
    if (Array.isArray(explanation.option_explanations)) {
      for (const row of explanation.option_explanations) {
        if (row && typeof row.text === 'string') row.text = apply(row.text, 'explanation_option');
      }
    }
    for (const key of ['key_concepts', 'revision_takeaways']) {
      if (Array.isArray(explanation[key])) explanation[key] = explanation[key].map((v) => apply(v, key));
    }
  }
}

/**
 * Repair one intake object in place.
 * @param {object} intake adapted intake ({ provenance, papers, questions })
 * @returns {object} the repair report (printed by the review report)
 */
export function repairIntake(intake) {
  const report = {
    version: REPAIR_VERSION,
    statement:
      'Repairs applied to the extraction before the bank was built. No wording was invented: escape artefacts were converted back to the characters they represent, and source provenance was moved out of the app-facing data into this report.',
    text_repairs: { strings: 0, occurrences: 0, by_field: {} },
    metadata_removed: {},
    provenance_moved: { bank_provenance: intake?.provenance ?? null, question_source_references: 0, samples: [] },
    answer_sources_blanked: 0,
    paper_fixes: { renamed: [], answer_key_sources_blanked: 0, source_file_lists_blanked: 0 },
    untouched: 'Question text, option text, printed answers and explanation wording are otherwise reproduced exactly as the extraction captured them.',
  };

  /* ------------------------------------------------- text repairs ------- */
  for (const question of intake?.questions || []) {
    repairQuestionText(question, report.text_repairs);
  }

  /* --------------------------------------- provenance out of the data --- */
  delete intake.provenance;

  for (const question of intake?.questions || []) {
    if (question.source_reference) {
      report.provenance_moved.question_source_references += 1;
      if (report.provenance_moved.samples.length < 3) {
        report.provenance_moved.samples.push({ id: question.id ?? null, source_reference: question.source_reference });
      }
      delete question.source_reference;
    }
    if (question.supplied_answer && question.supplied_answer.source) {
      question.supplied_answer.source = null;
      report.answer_sources_blanked += 1;
    }
    if (question.metadata && typeof question.metadata === 'object') {
      for (const key of PARSER_METADATA_KEYS) {
        if (key in question.metadata) {
          delete question.metadata[key];
          report.metadata_removed[key] = (report.metadata_removed[key] || 0) + 1;
        }
      }
    }
  }

  /* ------------------------------------------------- paper records ------ */
  for (const paper of intake?.papers || []) {
    const code = String(paper.paper_code ?? '').toUpperCase();
    const isMppscPrelims = /mppsc|madhya pradesh public service commission/i.test(String(paper.exam ?? ''));
    if (isMppscPrelims && paper.year && ['GS-I', 'GS-II'].includes(code)) {
      const label = code === 'GS-II' ? 'Paper II (General Aptitude)' : 'Paper I (General Studies)';
      const next = `MPPSC ${paper.year} Prelims ${label}`;
      if (paper.paper_name !== next) {
        report.paper_fixes.renamed.push({ paper_id: paper.paper_id, from: paper.paper_name ?? null, to: next });
        paper.paper_name = next;
      }
    }
    if (paper.answer_key) {
      if (paper.answer_key.source) report.paper_fixes.answer_key_sources_blanked += 1;
      delete paper.answer_key;
    }
    if (paper.source_files?.length) {
      report.paper_fixes.source_file_lists_blanked += 1;
      delete paper.source_files;
    }
    for (const key of ['source_kind', 'parser_version', 'source_file', 'source_files']) {
      if (paper.metadata && key in paper.metadata) delete paper.metadata[key];
    }
  }

  return report;
}
