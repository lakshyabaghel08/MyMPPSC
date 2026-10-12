/**
 * tools/classify/historical-sources.mjs — strict adapters for the six supplied
 * MPPSC Prelims source packages (2013–2018).
 *
 * The packages do not share one extraction schema. This module deliberately
 * maps each year through its own adapter, checks the README/review-report counts,
 * and keeps source flags, preliminary labels and safe repair notes in an audit
 * object that never enters the app-facing bank.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { adaptQuestion } from './intake-adapter.mjs';

export const HISTORICAL_YEARS = Object.freeze([2013, 2014, 2015, 2016, 2017, 2018]);
export const HISTORICAL_QUESTIONS_PER_PAPER = 100;
export const HISTORICAL_SOURCE_DIR = 'data/pyq/source/2013-18';

export const HISTORICAL_REVIEW_REPORT_CORRECTIONS = Object.freeze([
  {
    year: 2018,
    question_number: 43,
    before: 'Question/key should be checked against the historical tournament timeline; printed answer is Australia.',
    after: 'The supplied explanation cites Andhra Pradesh reserved seats but the question asks for the Lok Sabha total; verify the key and explanation against a reliable parliamentary source.',
    reason: 'The prior review note referred to a cricket tournament, not this Lok Sabha question; the replacement describes the mismatch visible in this record without changing its key.',
  },
  {
    year: 2018,
    question_number: 87,
    before: 'Source explanation is only a placeholder; answer requires verification against IPL 2016 venue.',
    after: null,
    reason: 'The question concerns the Protection of Civil Rights Act; the IPL note was unrelated. The generic-placeholder flag is retained.',
  },
  {
    year: 2018,
    question_number: 100,
    before: 'Potential inconsistency: printed answer B conflicts with the supplied explanation stating IMF loans go to member countries only.',
    after: 'The supplied explanation discusses the Godavari’s length and drainage area but does not clearly establish the second-largest river-basin ranking; verify that statistic independently.',
    reason: 'The IMF note referred to a different question; the printed answer is C and the explanation discusses the Godavari.',
  },
]);

const EXAM_NAME = 'MPPSC State Service Preliminary Examination';
const PLACEHOLDER_EXPLANATION = /^factual\s+question\.?$/i;
const normalizeSpace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const keyOf = (value) => String(value ?? '').trim().toUpperCase().replace(/^\(|\)$/g, '');
const answerOf = (record) => record?.printed_answer ?? record?.answer ?? null;
const optionsOf = (record) => Array.isArray(record?.options) ? record.options : [];

function canonicalQuestion(record) {
  return record?.question_text ?? record?.question ?? record?.text ?? '';
}

function sourceFlags(record) {
  const flags = record?.review_flags ?? record?.flags ?? [];
  return Array.isArray(flags) ? flags.map((flag) => String(flag)) : [];
}

function sourceClassification(year, record) {
  const nested = record?.classification ?? record?.preliminary_classification ?? null;
  const subject = nested?.subject ?? record?.subject ?? null;
  const topic = nested?.topic ?? record?.topic ?? null;
  const subtopic = nested?.subtopic ?? record?.subtopic ?? null;
  return subject || topic || subtopic ? { subject, topic, subtopic } : null;
}

function extractYearRecord(year, record) {
  // Separate explicit branches prevent a future source-schema drift from being
  // mistaken for a successful best-effort import.
  if (year >= 2013 && year <= 2015) {
    return {
      number: record?.question_number,
      id: record?.id,
      text: record?.question_text,
      options: record?.options,
      answer: record?.printed_answer,
      explanation: record?.explanation,
      rawSourceText: record?.source ?? null,
      schema: `legacy-normalised-${year}`,
    };
  }
  if (year === 2016) {
    return {
      number: record?.question_number,
      id: null,
      text: record?.question_text,
      options: record?.options,
      answer: record?.printed_answer,
      explanation: record?.source_explanation,
      rawSourceText: record?.source_text_verbatim ?? null,
      schema: 'source-explanation-preliminary-classification-2016',
    };
  }
  if (year === 2017 || year === 2018) {
    return {
      number: record?.question_number,
      id: null,
      text: record?.question,
      options: record?.options,
      answer: record?.printed_answer,
      explanation: record?.explanation,
      rawSourceText: record?.source_text ?? null,
      schema: `question-label-options-${year}`,
    };
  }
  throw new Error(`No historical source adapter is defined for ${year}.`);
}

function readmeSummary(year, text) {
  const value = String(text || '');
  const countMatch = value.match(/(?:Questions parsed|question(?:s)? parsed|Questions found)\s*:\s*(\d+)/i)
    || value.match(/(?:^|\n)-\s*(\d+) questions parsed\b/i)
    || value.match(/\b(\d+) normalized questions\b/i);
  const fourOptionMatch = value.match(/Questions with four structured options\s*:\s*(\d+)/i);
  const answerMatch = value.match(/Missing printed answers\s*:\s*(\d+)\s*(?:\[([^\]]*)\])?/i);
  const explanationMatch = value.match(/Missing\/?empty explanations\s*:\s*(\d+)\s*(?:\[([^\]]*)\])?/i);
  const flagMatch = value.match(/Questions with review flags\s*:\s*(\d+)/i)
    || value.match(/Questions flagged for review\s*:\s*(\d+)/i);
  const placeholderMatch = value.match(/Generic placeholder explanations[^:\n]*:\s*(\d+)/i);
  const numbers = (raw) => raw
    ? raw.split(',').map((item) => Number(item.trim())).filter((n) => Number.isInteger(n))
    : [];
  return {
    year,
    declared_question_count: countMatch ? Number(countMatch[1]) : null,
    declared_four_option_count: fourOptionMatch ? Number(fourOptionMatch[1]) : null,
    declared_missing_answer_count: answerMatch ? Number(answerMatch[1]) : null,
    declared_missing_answer_numbers: answerMatch ? numbers(answerMatch[2]) : [],
    declared_missing_explanation_count: explanationMatch ? Number(explanationMatch[1]) : null,
    declared_missing_explanation_numbers: explanationMatch ? numbers(explanationMatch[2]) : [],
    declared_review_flagged_count: flagMatch ? Number(flagMatch[1]) : null,
    declared_placeholder_explanation_count: placeholderMatch ? Number(placeholderMatch[1]) : null,
    note: 'README counts are compared with the structured source and review report; its preliminary labels are never used as final classifications.',
  };
}

function reportItems(report) {
  for (const field of ['questions_requiring_review', 'review_items', 'flagged_questions']) {
    if (Array.isArray(report?.[field])) return { field, items: report[field] };
  }
  return { field: null, items: [] };
}

function reportFlags(item) {
  const flags = item?.review_flags ?? item?.flags ?? [];
  return Array.isArray(flags) ? flags.map((flag) => String(flag)) : [];
}

function detectSchema(year, raw, records) {
  if (year >= 2013 && year <= 2015) {
    if (!raw?.questions?.every((q) => 'question_text' in q && 'classification' in q && 'source' in q)) {
      throw new Error(`${year}: source no longer matches the legacy question_text/classification/source schema.`);
    }
    return `legacy-normalised-${year}`;
  }
  if (year === 2016) {
    if (!raw?.questions?.every((q) => 'question_text' in q && 'source_explanation' in q && 'preliminary_classification' in q)) {
      throw new Error('2016: source no longer matches the question_text/source_explanation/preliminary_classification schema.');
    }
    return 'source-explanation-preliminary-classification-2016';
  }
  if (year === 2017 || year === 2018) {
    if (!raw?.questions?.every((q) => 'question' in q && 'source_text' in q && 'subject' in q && q.options?.every((o) => 'label' in o))) {
      throw new Error(`${year}: source no longer matches the question/source_text/labelled-options schema.`);
    }
    return `question-label-options-${year}`;
  }
  throw new Error(`No schema signature is defined for ${year}.`);
}

function repairSourceArtifacts(year, number, sourceText, options, explanation, repairs) {
  let nextOptions = options.map((option) => ({ ...option }));
  let nextExplanation = explanation;

  const note = (field, before, after, reason) => repairs.push({
    question_number: number,
    field,
    before,
    after,
    reason,
  });

  // Q4's source parser appended a rank table to the final option. The exact
  // suffix also appears after the options in source_text_verbatim, proving it
  // is contextual material rather than option D. Keep that raw snippet in the
  // source file and document the reversible repair here.
  if (year === 2016 && number === 4) {
    const index = nextOptions.findIndex((option) => String(option.text ?? '').includes(' Rank State Area (km2)'));
    if (index < 0) throw new Error('2016 Q4 no longer contains the reviewed appended rank-table artifact.');
    const before = String(nextOptions[index].text);
    const after = before.replace(/\s+Rank State Area \(km2\)[\s\S]*$/i, '').trimEnd();
    if (!after || after === before) throw new Error('2016 Q4 rank-table cleanup did not produce a non-empty option.');
    nextOptions[index] = { ...nextOptions[index], text: after };
    note(`options[${index}]`, before, after, 'Removed a rank table appended after option D by the source extraction; its verbatim copy remains in source_text_verbatim.');
  }

  // The raw 2017 booklet text contains “(H) LAN”, but its answer line and the
  // structured option sequence show that this is option B. The extraction also
  // copied its own note into the option text; remove only that editorial note.
  if (year === 2017 && number === 49) {
    const index = nextOptions.findIndex((option) => /source label appears as H/i.test(String(option.text ?? '')));
    if (index < 0 || keyOf(nextOptions[index].label ?? nextOptions[index].key) !== 'B') {
      throw new Error('2017 Q49 no longer matches the reviewed source-label artifact.');
    }
    const before = String(nextOptions[index].text);
    const after = before.replace(/\s*\(source label appears as H\)\s*/i, ' ').trim();
    nextOptions[index] = { ...nextOptions[index], text: after };
    note(`options[${index}].text`, before, after, 'Removed an adapter annotation; the original “(H)” label remains documented in source_text and review flags.');
  }

  // The 2017 booklet identifier was concatenated to “Pakistan” by extraction.
  if (year === 2017 && number === 43) {
    const option = nextOptions.find((item) => /S\/SP\/1\/2017\/1-A\s*$/i.test(String(item.text ?? '')));
    if (!option) throw new Error('2017 Q43 no longer contains the reviewed booklet-code artifact.');
    const index = nextOptions.indexOf(option);
    const before = String(option.text);
    const after = before.replace(/\s+S\/SP\/1\/2017\/1-A\s*$/i, '').trimEnd();
    nextOptions[index] = { ...option, text: after };
    note(`options[${index}].text`, before, after, 'Removed the appended 2017 question-booklet code; the full source_text remains in the internal source package.');
  }

  // A repeated B in the structured 2018 options conflicts with the verbatim
  // question segment “(C) B. B. Bhagwat”. Restore that exact option label/text;
  // no answer key or distractor is invented.
  if (year === 2018 && number === 49) {
    const option = nextOptions[2];
    const label = keyOf(option?.label ?? option?.key);
    const sourceHasExactOption = /\(C\)\s*B\.\s*B\.\s*Bhagwat\b/i.test(String(sourceText || ''));
    if (label !== 'B' || !sourceHasExactOption) throw new Error('2018 Q49 no longer matches its duplicate-label/source-text repair evidence.');
    const before = { label: option.label ?? option.key, text: option.text };
    nextOptions[2] = { ...option, label: 'C', text: 'B. B. Bhagwat' };
    note('options[2]', before, { label: 'C', text: 'B. B. Bhagwat' }, 'Restored the third option from the verbatim source segment “(C) B. B. Bhagwat”; this fixes a duplicate B label and incomplete option text.');
  }

  // The opening parenthesis on option A is a dangling extraction character.
  if (year === 2018 && number === 92) {
    const index = nextOptions.findIndex((option) => String(option.text ?? '').endsWith('('));
    if (index < 0) throw new Error('2018 Q92 no longer contains the reviewed dangling-parenthesis artifact.');
    const before = String(nextOptions[index].text);
    const after = before.replace(/\s*\($/, '').trimEnd();
    nextOptions[index] = { ...nextOptions[index], text: after };
    note(`options[${index}].text`, before, after, 'Removed a dangling opening parenthesis at the end of option A; no wording was changed.');
  }

  if (typeof nextExplanation === 'string') {
    const entityFixed = nextExplanation.replace(/&#x20;/gi, ' ');
    if (entityFixed !== nextExplanation) {
      note('explanation', nextExplanation, entityFixed, 'Decoded the literal HTML space entity &#x20; to its equivalent space.');
      nextExplanation = entityFixed;
    }
  }

  if (typeof nextExplanation === 'string' && PLACEHOLDER_EXPLANATION.test(normalizeSpace(nextExplanation))) {
    note('explanation', nextExplanation, null, 'Removed the exact generic placeholder “Factual Question”; it contains no explanation and is stored as null.');
    nextExplanation = null;
  }

  return { options: nextOptions, explanation: nextExplanation };
}

function makeNormalizedRecord(year, number, rawRecord, fields, paperId, audit) {
  const repaired = fields.repairsApplied
    ? { options: fields.options, explanation: fields.explanation }
    : repairSourceArtifacts(year, number, fields.rawSourceText, fields.options, fields.explanation, audit.repairs);
  const normalized = {
    id: `MPPSC-${year}-${String(number).padStart(3, '0')}`,
    paper_id: paperId,
    exam: EXAM_NAME,
    year,
    question_number: number,
    language: 'en',
    question_text: fields.text,
    options: repaired.options.map((option, index) => ({
      key: option?.key ?? option?.label ?? String.fromCharCode(65 + index),
      text: option?.text ?? '',
    })),
    printed_answer: fields.answer,
    answer_status: 'provided_by_source',
    explanation: repaired.explanation ?? null,
  };
  const { question, notes } = adaptQuestion(normalized, number - 1, { paperId, year, exam: EXAM_NAME });
  if (!question || question.skipped) throw new Error(`${question?.id || `MPPSC-${year}-${number}`}: the shared intake adapter could not create a question.`);

  const variant = question.language_variants?.en;
  const answer = question.supplied_answer?.answer;
  const optionKeys = (variant?.options || []).map((option) => keyOf(option.key));
  const validKeys = new Set(optionKeys);
  const printed = Array.isArray(answer) ? answer.map(keyOf) : [];
  const emptyOptionKeys = (variant?.options || []).filter((option) => !String(option.text ?? '').trim()).map((option) => option.key);
  const auditQuestion = {
    id: question.id,
    question_number: number,
    source_schema: fields.schema,
    source_preliminary_classification: sourceClassification(year, rawRecord),
    source_review_flags: sourceFlags(rawRecord),
    source_needs_review: rawRecord?.needs_review === true || Boolean(rawRecord?.review_required),
    option_count: variant?.options?.length ?? 0,
    option_keys: optionKeys,
    empty_option_keys: emptyOptionKeys,
    printed_answer: fields.answer ?? null,
    mapped_answer: answer ?? null,
    printed_answer_maps_to_option: printed?.length > 0 && printed.every((key) => validKeys.has(key)),
    explanation_state: fields.sourceExplanationState || (repaired.explanation === null || repaired.explanation === '' ? 'missing' : 'supplied'),
    adapter_notes: notes,
  };
  audit.questions.push(auditQuestion);
  return question;
}

function compareReportToQuestions(year, report, sourceByNumber, audit) {
  const { field, items } = reportItems(report);
  const reportIds = new Set();
  const mismatches = [];
  for (const item of items) {
    const n = Number(item.question_number);
    const source = sourceByNumber.get(n);
    if (!Number.isInteger(n) || !source) {
      mismatches.push({ question_number: item.question_number ?? null, issue: 'review item references no source question' });
      continue;
    }
    reportIds.add(n);
    const expectedText = normalizeSpace(canonicalQuestion(source));
    const reportedText = normalizeSpace(item.question_text ?? item.question ?? '');
    if (reportedText && expectedText && reportedText !== expectedText) {
      mismatches.push({ question_number: n, issue: 'review item question text differs from the source question', reported_excerpt: reportedText.slice(0, 140), source_excerpt: expectedText.slice(0, 140) });
    }
    const reportAnswer = item.printed_answer;
    if (reportAnswer !== undefined && reportAnswer !== null && String(reportAnswer) !== String(answerOf(source) ?? '')) {
      mismatches.push({ question_number: n, issue: 'review item printed answer differs from the source question', report_answer: reportAnswer, source_answer: answerOf(source) });
    }
    const flags = reportFlags(item);
    if (flags.length) {
      const sourceFlagSet = new Set(sourceFlags(source));
      for (const flag of flags) {
        if (!sourceFlagSet.has(flag)) {
          audit.report_flag_differences.push({ year, question_number: n, source_flag: false, flag, note: 'The review report carries a flag not present on the corresponding source question; it is kept for human review, not imported into the app bank.' });
        }
      }
    }
  }
  audit.review_report = {
    file: `${HISTORICAL_SOURCE_DIR}/MPPSC_Prelims_${year}_Review_Report.json`,
    flagged_record_field: field,
    flagged_record_count: items.length,
    source_questions_with_flags: audit.questions.filter((q) => q.source_review_flags.length).length,
    item_question_numbers: [...reportIds].sort((a, b) => a - b),
    mismatches,
  };
  if (mismatches.length) audit.report_mismatches.push(...mismatches.map((entry) => ({ year, ...entry })));
}

function buildYearAudit(year, raw, report, readme, sourceFile) {
  const records = raw?.questions;
  if (!Array.isArray(records)) throw new Error(`${year}: source file has no questions array.`);
  const schema = detectSchema(year, raw, records);
  if (Number(raw.year) !== year) throw new Error(`${year}: source JSON declares year ${raw.year ?? 'missing'}.`);
  if (records.length !== HISTORICAL_QUESTIONS_PER_PAPER) {
    throw new Error(`${year}: expected ${HISTORICAL_QUESTIONS_PER_PAPER} records, found ${records.length}; no record was discarded.`);
  }

  const readmeData = readmeSummary(year, readme);
  const sourceByNumber = new Map();
  const numberIssues = [];
  for (const [index, record] of records.entries()) {
    const number = Number(record?.question_number);
    if (!Number.isInteger(number) || number < 1 || number > HISTORICAL_QUESTIONS_PER_PAPER) {
      numberIssues.push({ index, question_number: record?.question_number ?? null, issue: 'question number is outside 1–100' });
      continue;
    }
    if (sourceByNumber.has(number)) numberIssues.push({ index, question_number: number, issue: 'duplicate question number' });
    else sourceByNumber.set(number, record);
  }
  const missingNumbers = Array.from({ length: HISTORICAL_QUESTIONS_PER_PAPER }, (_v, i) => i + 1).filter((number) => !sourceByNumber.has(number));
  if (numberIssues.length || missingNumbers.length) {
    const detail = numberIssues.map((issue) => `index ${issue.index}: Q${issue.question_number ?? 'missing'} ${issue.issue}`).join('; ') || 'none';
    throw new Error(`${year}: numbering/schema mismatch (issues=${numberIssues.length}, gaps=${missingNumbers.join(',') || 'none'}; ${detail}).`);
  }

  const paperId = `MPPSC-${year}-GS1-BOOK`;
  const audit = {
    year,
    source_file: `${HISTORICAL_SOURCE_DIR}/${sourceFile}`,
    source_schema: schema,
    source_record_count: records.length,
    readme: readmeData,
    review_report: null,
    option_count_distribution: {},
    source_invalid_option_keys: [],
    source_duplicate_option_keys: [],
    invalid_option_keys: [],
    duplicate_option_keys: [],
    invalid_or_missing_printed_answers: [],
    missing_explanation_numbers: [],
    placeholder_explanation_numbers: [],
    empty_option_text: [],
    questions: [],
    repairs: [],
    report_flag_differences: [],
    report_mismatches: [],
    preliminary_classification_counts: {},
  };
  const papers = [{
    paper_id: paperId,
    exam: EXAM_NAME,
    year,
    paper_name: `MPPSC ${year} Prelims Paper I (General Studies)`,
    paper_code: 'GS-I',
    language: 'en',
    original_question_count: HISTORICAL_QUESTIONS_PER_PAPER,
    duration_minutes: null,
    total_marks: null,
    scoring: {
      rules_known: false,
      marks_per_correct: null,
      negative_marks_per_incorrect: null,
      negative_marking_enabled: null,
      marks_for_unanswered: null,
      rules_source: null,
      notes: 'Historical scoring rules for this year have not been verified from a reliable primary source; configure this paper before full-paper scoring.',
    },
  }];

  const questions = [];
  for (let number = 1; number <= HISTORICAL_QUESTIONS_PER_PAPER; number += 1) {
    const rawRecord = sourceByNumber.get(number);
    const fields = extractYearRecord(year, rawRecord);
    if (!Number.isInteger(Number(fields.number)) || Number(fields.number) !== number) {
      throw new Error(`${year} Q${number}: adapter read an inconsistent question number.`);
    }
    if (typeof fields.text !== 'string' || !fields.text.trim()) throw new Error(`${year} Q${number}: question text is missing; record retained for inspection but cannot be imported.`);
    const options = optionsOf(rawRecord);
    if (options.length !== 4) throw new Error(`${year} Q${number}: expected four source options, found ${options.length}; record was not discarded.`);

    const classification = sourceClassification(year, rawRecord);
    if (classification?.subject) {
      audit.preliminary_classification_counts[classification.subject] = (audit.preliminary_classification_counts[classification.subject] || 0) + 1;
    } else {
      audit.preliminary_classification_counts['No preliminary subject'] = (audit.preliminary_classification_counts['No preliminary subject'] || 0) + 1;
    }
    const hasExplanation = typeof fields.explanation === 'string' && Boolean(fields.explanation.trim());
    const isPlaceholder = typeof fields.explanation === 'string' && PLACEHOLDER_EXPLANATION.test(normalizeSpace(fields.explanation));
    if (!hasExplanation) audit.missing_explanation_numbers.push(number);
    if (isPlaceholder) audit.placeholder_explanation_numbers.push(number);

    const sourceOptionKeys = options.map((option) => keyOf(option?.key ?? option?.label));
    const expectedKeys = ['A', 'B', 'C', 'D'];
    if (sourceOptionKeys.some((key) => !expectedKeys.includes(key))) audit.source_invalid_option_keys.push({ question_number: number, keys: sourceOptionKeys });
    if (new Set(sourceOptionKeys).size !== sourceOptionKeys.length) audit.source_duplicate_option_keys.push({ question_number: number, keys: sourceOptionKeys });

    const repaired = repairSourceArtifacts(year, number, fields.rawSourceText, options, fields.explanation, audit.repairs);
    const repairedFields = {
      ...fields,
      options: repaired.options,
      explanation: repaired.explanation,
      sourceExplanationState: !hasExplanation ? 'missing' : isPlaceholder ? 'placeholder_removed' : 'supplied',
      repairsApplied: true,
    };
    const optionKeys = repaired.options.map((option, index) => keyOf(option?.key ?? option?.label ?? String.fromCharCode(65 + index)));
    if (optionKeys.some((key) => !expectedKeys.includes(key))) audit.invalid_option_keys.push({ question_number: number, keys: optionKeys });
    if (new Set(optionKeys).size !== optionKeys.length) audit.duplicate_option_keys.push({ question_number: number, keys: optionKeys });
    if (repaired.options.some((option) => !String(option?.text ?? '').trim())) audit.empty_option_text.push(number);

    const originalAnswer = fields.answer;
    const answerKey = keyOf(originalAnswer);
    if (!expectedKeys.includes(answerKey) || !optionKeys.includes(answerKey)) {
      audit.invalid_or_missing_printed_answers.push({ question_number: number, printed_answer: originalAnswer ?? null, option_keys: optionKeys });
    }

    const adapted = makeNormalizedRecord(year, number, rawRecord, repairedFields, paperId, audit);
    const normalizedOptions = adapted.language_variants?.en?.options || [];
    audit.option_count_distribution[normalizedOptions.length] = (audit.option_count_distribution[normalizedOptions.length] || 0) + 1;
    questions.push(adapted);
  }

  const reviewRecordFields = reportItems(report);
  compareReportToQuestions(year, report, sourceByNumber, audit);

  const declaredReportQuestionCount = Number(report?.questions_found ?? report?.questions_parsed ?? report?.question_count ?? report?.summary?.question_count ?? report?.summary?.questions_parsed ?? NaN);
  const declaredMissingAnswers = Array.isArray(report?.missing_printed_answers)
    ? report.missing_printed_answers
    : Array.isArray(report?.summary?.missing_answer_question_numbers)
      ? report.summary.missing_answer_question_numbers
      : [];
  const declaredMissingExplanationCount = Number(report?.missing_explanation_count ?? report?.summary?.questions_missing_explanation ?? NaN);
  const declaredMissingExplanations = Array.isArray(report?.missing_or_empty_explanations)
    ? report.missing_or_empty_explanations
    : Array.isArray(report?.summary?.missing_explanation_question_numbers)
      ? report.summary.missing_explanation_question_numbers
      : [];
  const declaredReviewCount = Number(report?.review_flagged_count ?? report?.questions_flagged_for_review ?? report?.summary?.questions_flagged_for_review ?? report?.questions_requiring_review?.length ?? report?.review_items?.length ?? report?.flagged_questions?.length ?? NaN);
  const actualMissingAnswers = questions.filter((q) => !q.supplied_answer?.answer?.length).map((q) => q.question_number);
  const sourceMissingExplanationNumbers = audit.missing_explanation_numbers.slice();
  const actualFlagged = audit.questions.filter((q) => q.source_review_flags.length).length;

  audit.source_report_checks = {
    declared_question_count: Number.isFinite(declaredReportQuestionCount) ? declaredReportQuestionCount : null,
    question_count_matches: Number.isFinite(declaredReportQuestionCount) ? declaredReportQuestionCount === records.length : null,
    declared_missing_answer_numbers: declaredMissingAnswers.map(Number),
    actual_missing_answer_numbers: actualMissingAnswers,
    missing_answer_numbers_match: declaredMissingAnswers.length ? JSON.stringify(declaredMissingAnswers.map(Number).sort((a, b) => a - b)) === JSON.stringify(actualMissingAnswers.sort((a, b) => a - b)) : actualMissingAnswers.length === 0,
    declared_missing_explanation_count: Number.isFinite(declaredMissingExplanationCount) ? declaredMissingExplanationCount : declaredMissingExplanations.length,
    declared_missing_explanation_numbers: declaredMissingExplanations.map(Number),
    actual_missing_explanation_numbers: sourceMissingExplanationNumbers,
    missing_explanation_numbers_match: declaredMissingExplanations.length
      ? JSON.stringify(declaredMissingExplanations.map(Number).sort((a, b) => a - b)) === JSON.stringify(sourceMissingExplanationNumbers.sort((a, b) => a - b))
      : Number.isFinite(declaredMissingExplanationCount)
        ? declaredMissingExplanationCount === sourceMissingExplanationNumbers.length
        : sourceMissingExplanationNumbers.length === 0,
    declared_review_flagged_count: Number.isFinite(declaredReviewCount) ? declaredReviewCount : null,
    actual_source_questions_with_flags: actualFlagged,
    review_count_matches: Number.isFinite(declaredReviewCount) ? declaredReviewCount === reviewRecordFields.items.length : null,
    source_flag_count_matches_review_items: actualFlagged === reviewRecordFields.items.length,
    readme_question_count_matches: readmeData.declared_question_count === null ? null : readmeData.declared_question_count === records.length,
    readme_four_option_count_matches: readmeData.declared_four_option_count === null ? null : readmeData.declared_four_option_count === records.filter((record) => optionsOf(record).length === 4).length,
    readme_review_flag_count_matches: readmeData.declared_review_flagged_count === null ? null : readmeData.declared_review_flagged_count === actualFlagged,
    readme_missing_answer_count_matches: readmeData.declared_missing_answer_count === null ? null : readmeData.declared_missing_answer_count === actualMissingAnswers.length,
    readme_missing_explanation_count_matches: readmeData.declared_missing_explanation_count === null ? null : readmeData.declared_missing_explanation_count === sourceMissingExplanationNumbers.length,
  };

  const failedChecks = Object.entries(audit.source_report_checks)
    .filter(([_name, value]) => value === false)
    .map(([name]) => `${name} does not match the structured source`);
  const structuralProblems = [
    ...failedChecks,
    ...audit.invalid_option_keys.map((entry) => `Q${entry.question_number}: invalid option key(s) ${entry.keys.join(', ')}`),
    ...audit.duplicate_option_keys.map((entry) => `Q${entry.question_number}: duplicate option key(s) ${entry.keys.join(', ')}`),
    ...audit.invalid_or_missing_printed_answers.map((entry) => `Q${entry.question_number}: printed answer does not map to a source option`),
    ...(audit.report_mismatches.map((entry) => `review report Q${entry.question_number}: ${entry.issue}`)),
  ];
  if (structuralProblems.length) {
    throw new Error(`${year}: source audit found structural/report mismatch(es); no historical records were dropped:\n- ${structuralProblems.join('\n- ')}`);
  }

  return { paper: papers[0], questions, audit };
}

export function adaptHistoricalSources(packages) {
  const papers = [];
  const questions = [];
  const years = [];
  const report_flag_differences = [];
  const report_mismatches = [];
  const repairs = [];
  for (const year of HISTORICAL_YEARS) {
    const pkg = packages.get(year) ?? packages[year];
    if (!pkg?.source || !pkg?.review || typeof pkg?.readme !== 'string') {
      throw new Error(`${year}: source JSON, review report and README are all required.`);
    }
    const result = buildYearAudit(year, pkg.source, pkg.review, pkg.readme, pkg.sourceFile || `MPPSC_Prelims_${year}_QBank_Source.json`);
    years.push(result.audit);
    papers.push(result.paper);
    questions.push(...result.questions);
    report_flag_differences.push(...result.audit.report_flag_differences.map((entry) => ({ ...entry })));
    report_mismatches.push(...result.audit.report_mismatches.map((entry) => ({ ...entry })));
    repairs.push(...result.audit.repairs.map((entry) => ({ year, ...entry })));
  }
  return {
    papers,
    questions,
    audit: {
      statement: 'Internal source audit only. Per-question review flags, preliminary classifications, and source citations are not included in the app-facing bank. No answer was independently verified or generated by this adapter.',
      expected_questions_per_paper: HISTORICAL_QUESTIONS_PER_PAPER,
      expected_years: [...HISTORICAL_YEARS],
      question_count: questions.length,
      paper_count: papers.length,
      records_rejected: 0,
      records_merged: 0,
      years,
      report_flag_differences,
      report_mismatches,
      review_report_corrections: HISTORICAL_REVIEW_REPORT_CORRECTIONS.map((entry) => ({ ...entry })),
      repairs,
      answer_policy: 'Printed source keys are mapped mechanically and retained as supplied; none is promoted to verified. Keys that do not map block the adapter instead of being guessed.',
      explanation_policy: 'Non-empty source explanations are retained. Missing text stays null; exact generic “Factual Question” placeholders are recorded here and stored as null in the app bank.',
      classification_policy: 'The source labels are counted for audit only. Every imported historical classification is produced by the repository rule engine; no AI provider was called.',
      marking_policy: 'At the user’s direction, the latest reported MPPSC scoring pattern (+3 correct, −1 incorrect, 0 unanswered) is applied uniformly to every 2013–2024 practice paper. This is a current-pattern practice policy, not a claim that those rules were historically in force.',
    },
  };
}

export async function loadHistoricalSourcePackages(sourceDir = HISTORICAL_SOURCE_DIR) {
  const packages = new Map();
  for (const year of HISTORICAL_YEARS) {
    const base = `MPPSC_Prelims_${year}`;
    const sourceFile = `${base}_QBank_Source.json`;
    const reviewFile = `${base}_Review_Report.json`;
    const readmeFile = `README_MPPSC_${year}.txt`;
    const [sourceText, reviewText, readme] = await Promise.all([
      readFile(path.join(sourceDir, sourceFile), 'utf8'),
      readFile(path.join(sourceDir, reviewFile), 'utf8'),
      readFile(path.join(sourceDir, readmeFile), 'utf8'),
    ]);
    packages.set(year, {
      source: JSON.parse(sourceText),
      review: JSON.parse(reviewText),
      readme,
      sourceFile,
      reviewFile,
      readmeFile,
    });
  }
  return packages;
}

export function combineHistoricalIntake(baseIntake, adapted) {
  if (!baseIntake || typeof baseIntake !== 'object') throw new Error('A base MPPSC intake object is required.');
  if (!Array.isArray(baseIntake.papers) || !Array.isArray(baseIntake.questions)) throw new Error('The base intake must have paper and question arrays.');
  const existingQuestionIds = new Set(baseIntake.questions.map((question) => String(question.id)));
  const existingPaperIds = new Set(baseIntake.papers.map((paper) => String(paper.paper_id)));
  const duplicateQuestionIds = adapted.questions.filter((question) => existingQuestionIds.has(String(question.id))).map((question) => question.id);
  const duplicatePaperIds = adapted.papers.filter((paper) => existingPaperIds.has(String(paper.paper_id))).map((paper) => paper.paper_id);
  if (duplicateQuestionIds.length || duplicatePaperIds.length) {
    throw new Error(`Historical intake ids collide with the existing bank: questions=${duplicateQuestionIds.join(', ') || 'none'}; papers=${duplicatePaperIds.join(', ') || 'none'}.`);
  }
  return {
    intake: {
      ...structuredClone(baseIntake),
      papers: [...structuredClone(baseIntake.papers), ...structuredClone(adapted.papers)],
      questions: [...structuredClone(baseIntake.questions), ...structuredClone(adapted.questions)],
    },
    audit: adapted.audit,
  };
}

export async function loadCombinedHistoricalIntake(baseIntake, sourceDir = HISTORICAL_SOURCE_DIR) {
  const packages = await loadHistoricalSourcePackages(sourceDir);
  const adapted = adaptHistoricalSources(packages);
  return combineHistoricalIntake(baseIntake, adapted);
}
