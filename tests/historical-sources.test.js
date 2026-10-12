/**
 * historical-sources.test.js — adapters and integrity checks for the six
 * independently-shaped 2013–2018 source packages.
 *
 * The source labels/flags are audit-only. These tests prove the adapters do not
 * guess, silently discard, or merge records, and that the same combined intake
 * can flow through the production classifier/sanitiser without changing the
 * existing 2019–2024 content.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';
import {
  HISTORICAL_YEARS,
  adaptHistoricalSources,
  combineHistoricalIntake,
  loadCombinedHistoricalIntake,
  loadHistoricalSourcePackages,
} from '../tools/classify/historical-sources.mjs';
import { runPipeline } from '../tools/classify-bank.mjs';
import { renderHistoricalSourceAuditMarkdown } from '../tools/classify/reports.mjs';

const sourceDir = dataPath('pyq', 'source', '2013-18');
const baseIntakePath = dataPath('pyq', 'source', 'MPPSC_PYQ_intake.json');
const readBaseIntake = async () => JSON.parse(await readFile(baseIntakePath, 'utf8'));
const textAt = (year, number) => `MPPSC-${year}-${String(number).padStart(3, '0')}`;
const sourceFields = (year, record) => {
  if (year <= 2015) return { question: record.question_text, explanation: record.explanation };
  if (year === 2016) return { question: record.question_text, explanation: record.source_explanation };
  return { question: record.question, explanation: record.explanation };
};
const sourceAnswer = (record) => String(record.printed_answer ?? record.answer ?? '').trim().toUpperCase();
const sourceOptions = (record) => (record.options || []).map((option, index) => ({
  key: String(option.key ?? option.label ?? String.fromCharCode(65 + index)).trim().toUpperCase(),
  text: String(option.text ?? ''),
}));

let packages;
let adapted;

test('all six historical packages use their own strict source-schema adapter', async () => {
  packages = await loadHistoricalSourcePackages(sourceDir);
  adapted = adaptHistoricalSources(packages);
  assert.deepEqual([...packages.keys()], [...HISTORICAL_YEARS]);
  assert.deepEqual(adapted.audit.expected_years, [...HISTORICAL_YEARS]);
  assert.equal(adapted.questions.length, 600);
  assert.equal(adapted.papers.length, 6);
  assert.equal(adapted.audit.question_count, 600);
  assert.equal(adapted.audit.records_rejected, 0);
  assert.equal(adapted.audit.records_merged, 0);

  const schemas = new Map(adapted.audit.years.map((entry) => [entry.year, entry.source_schema]));
  assert.equal(schemas.get(2013), 'legacy-normalised-2013');
  assert.equal(schemas.get(2014), 'legacy-normalised-2014');
  assert.equal(schemas.get(2015), 'legacy-normalised-2015');
  assert.equal(schemas.get(2016), 'source-explanation-preliminary-classification-2016');
  assert.equal(schemas.get(2017), 'question-label-options-2017');
  assert.equal(schemas.get(2018), 'question-label-options-2018');
  assert.equal(new Set(adapted.questions.map((question) => question.id)).size, 600);
  assert.deepEqual(adapted.papers.map((paper) => paper.year), [...HISTORICAL_YEARS]);
});

test('each source record is preserved as a numbered question with four options and its printed key', () => {
  assert.ok(packages && adapted, 'the adapter fixture runs first');
  for (const year of HISTORICAL_YEARS) {
    const source = packages.get(year).source.questions;
    const output = adapted.questions.filter((question) => question.year === year);
    const audit = adapted.audit.years.find((entry) => entry.year === year);
    assert.equal(source.length, 100, `${year}: source count`);
    assert.equal(output.length, 100, `${year}: imported count`);
    assert.deepEqual(output.map((question) => question.question_number), Array.from({ length: 100 }, (_v, index) => index + 1));
    assert.equal(new Set(output.map((question) => question.id)).size, 100, `${year}: ids are unique`);
    assert.equal(audit.option_count_distribution['4'], 100, `${year}: four options survive normalization`);
    assert.deepEqual(audit.invalid_option_keys, [], `${year}: every option has a valid key`);
    assert.deepEqual(audit.duplicate_option_keys, [], `${year}: no duplicate option labels remain`);
    assert.deepEqual(audit.invalid_or_missing_printed_answers, [], `${year}: every printed key maps to an option`);

    for (let index = 0; index < 100; index += 1) {
      const record = source[index];
      const question = output.find((item) => item.question_number === index + 1);
      const fields = sourceFields(year, record);
      assert.equal(question.id, textAt(year, index + 1));
      assert.equal(question.paper_id, `MPPSC-${year}-GS1-BOOK`);
      assert.equal(question.language_variants.en.question_text, fields.question, `${question.id}: question wording`);
      assert.equal(question.language_variants.en.options.length, 4, `${question.id}: option count`);
      assert.deepEqual(question.supplied_answer.answer, [sourceAnswer(record)], `${question.id}: printed answer key`);
      assert.equal(question.supplied_answer.status, 'provided_by_source');
      assert.equal(question.verified_answer, undefined, `${question.id}: printed key is not independently verified`);
      assert.equal(question.subject, undefined, `${question.id}: preliminary classification is not copied into final fields`);
      assert.equal(question.topic, undefined);
      assert.equal(question.subtopic, undefined);
      assert.equal(question.review_flags, undefined, `${question.id}: review flags stay out of intake fields`);

      // The listed repairs are intentionally narrow; every other option remains
      // identical to the source extraction, including a truly blank option.
      const expectedOptions = sourceOptions(record);
      const actualOptions = question.language_variants.en.options.map((option) => ({ key: option.key, text: option.text }));
      const patched = new Set(['2016:4', '2017:43', '2017:49', '2018:49', '2018:92']);
      if (!patched.has(`${year}:${index + 1}`)) assert.deepEqual(actualOptions, expectedOptions, `${question.id}: source options`);
      else assert.ok(audit.repairs.some((repair) => repair.question_number === index + 1), `${question.id}: explicit repair is audited`);

      const compactSourceExplanation = typeof fields.explanation === 'string' ? fields.explanation.trim() : '';
      const isExactPlaceholder = /^factual\s+question\.?$/i.test(compactSourceExplanation.replace(/\s+/g, ' '));
      if (isExactPlaceholder) {
        assert.equal(question.explanation, null, `${question.id}: exact generic placeholder is removed, not presented as an explanation`);
      } else if (!compactSourceExplanation) {
        assert.ok(!question.explanation, `${question.id}: missing source explanation stays empty`);
      } else {
        assert.equal(typeof question.explanation, 'string', `${question.id}: supplied explanation is retained`);
        assert.equal(question.explanation.replace(/&#x20;/gi, ' '), compactSourceExplanation.replace(/&#x20;/gi, ' '));
      }
    }
  }
});

test('README and review-report counts, answer/explanation gaps, and flags agree with every source package', () => {
  for (const year of HISTORICAL_YEARS) {
    const report = adapted.audit.years.find((entry) => entry.year === year);
    const checks = report.source_report_checks;
    assert.equal(checks.question_count_matches, true, `${year}: source report question count`);
    assert.equal(checks.missing_answer_numbers_match, true, `${year}: printed-key gaps`);
    assert.equal(checks.missing_explanation_numbers_match, true, `${year}: missing explanations`);
    assert.equal(checks.review_count_matches, true, `${year}: review report count`);
    assert.equal(checks.source_flag_count_matches_review_items, true, `${year}: source review flags`);
    assert.equal(checks.readme_question_count_matches, true, `${year}: README question count`);
    for (const [name, value] of Object.entries(checks)) {
      if (name.endsWith('_matches') && value !== null) assert.equal(value, true, `${year}: ${name}`);
    }
    assert.deepEqual(report.report_mismatches, [], `${year}: review report wording/answers match the source`);
    assert.equal(report.report_flag_differences.length, 0, `${year}: no undocumented report-only flags`);
  }
  assert.equal(adapted.audit.repairs.length, 126);
  assert.equal(adapted.audit.review_report_corrections.length, 3);
  assert.deepEqual(
    adapted.audit.years.map((entry) => entry.empty_option_text.length),
    [1, 6, 4, 0, 0, 0],
    'eleven empty option texts are disclosed and retained',
  );
  assert.equal(adapted.audit.years.reduce((sum, year) => sum + year.placeholder_explanation_numbers.length, 0), 119);
  assert.equal(adapted.audit.years.reduce((sum, year) => sum + year.missing_explanation_numbers.length, 0), 28);
});

test('the markdown audit preserves complete report-correction decisions', () => {
  const markdown = renderHistoricalSourceAuditMarkdown(adapted.audit);
  for (const correction of adapted.audit.review_report_corrections) {
    assert.ok(markdown.includes(correction.before), `Q${correction.question_number}: complete prior note is retained`);
    assert.ok(markdown.includes(correction.reason), `Q${correction.question_number}: complete correction reason is retained`);
    if (correction.after) assert.ok(markdown.includes(correction.after), `Q${correction.question_number}: complete corrected note is retained`);
  }
});

test('a source count, schema, numbering or report mismatch fails loudly instead of dropping a record', async () => {
  const cloned = new Map([...packages.entries()].map(([year, value]) => [year, structuredClone(value)]));

  const countMismatch = new Map([...cloned.entries()].map(([year, value]) => [year, structuredClone(value)]));
  countMismatch.get(2013).readme = countMismatch.get(2013).readme.replace('Questions parsed: 100', 'Questions parsed: 99');
  assert.throws(() => adaptHistoricalSources(countMismatch), /readme_question_count_matches/);

  const schemaMismatch = new Map([...cloned.entries()].map(([year, value]) => [year, structuredClone(value)]));
  delete schemaMismatch.get(2017).source.questions[0].source_text;
  assert.throws(() => adaptHistoricalSources(schemaMismatch), /source_text\/labelled-options schema/);

  const numberMismatch = new Map([...cloned.entries()].map(([year, value]) => [year, structuredClone(value)]));
  numberMismatch.get(2014).source.questions[1].question_number = 1;
  assert.throws(() => adaptHistoricalSources(numberMismatch), /duplicate question number/);

  const answerMismatch = new Map([...cloned.entries()].map(([year, value]) => [year, structuredClone(value)]));
  answerMismatch.get(2015).review.questions_requiring_review[0].printed_answer = 'NOT-A-KEY';
  assert.throws(() => adaptHistoricalSources(answerMismatch), /printed answer differs from the source/);
});

test('combining the six adapters retains the untouched 571 base records and rejects id collisions', async () => {
  const base = await readBaseIntake();
  const baseSnapshot = structuredClone(base);
  const combined = await loadCombinedHistoricalIntake(base, sourceDir);
  assert.equal(base.questions.length, 571);
  assert.equal(combined.intake.questions.length, 1171);
  assert.equal(combined.intake.papers.length, 12);
  assert.deepEqual(combined.intake.questions.slice(0, 571), baseSnapshot.questions, 'the current source records are not rewritten by the combine step');
  assert.deepEqual(combined.intake.papers.slice(0, 6), baseSnapshot.papers, 'the current paper metadata is not rewritten by the combine step');
  assert.deepEqual(combined.intake.questions.slice(571).map((question) => question.year), [...Array(100).fill(2013), ...Array(100).fill(2014), ...Array(100).fill(2015), ...Array(100).fill(2016), ...Array(100).fill(2017), ...Array(100).fill(2018)]);

  const collision = structuredClone(base);
  collision.questions.push({ id: 'MPPSC-2013-001' });
  assert.throws(() => combineHistoricalIntake(collision, adapted), /ids collide/);
});

test('the combined production pipeline applies review decisions, keeps repeats, and sanitises audit-only metadata', async () => {
  const [base, reviewedLabels, reviewedAnswers] = await Promise.all([
    readBaseIntake(),
    readFile(dataPath('pyq', 'reviewed-labels.jsonl'), 'utf8'),
    readFile(dataPath('pyq', 'reviewed-answers.jsonl'), 'utf8'),
  ]);
  const combined = await loadCombinedHistoricalIntake(base, sourceDir);
  const result = await runPipeline(combined.intake, {
    historicalSourceAudit: combined.audit,
    reviewedLabels,
    answerReviews: reviewedAnswers,
    answerReviewFile: 'data/pyq/reviewed-answers.jsonl',
  });
  assert.equal(result.validation.fatal.length, 0);
  assert.equal(result.validation.errors.length, 0);
  assert.equal(result.validation.rejected.length, 0);
  assert.equal(result.bank.questions.length, 1171);
  assert.equal(result.bank.papers.length, 12);
  assert.equal(result.reviewedSummary.applied.length, 244);
  assert.equal(result.answerSummary.applied.length, 8);
  assert.equal(result.reviewReport.totals.records_removed, 0);
  assert.equal(result.reviewReport.totals.records_merged, 0);
  assert.equal(result.reviewReport.historical_sources.question_count, 600);
  assert.equal(result.reviewReport.historical_sources.records_rejected, 0);
  assert.equal(result.aiSummary, null, 'no AI provider response was applied');
  assert.equal(result.reviewReport.totals.ai_labels_applied, 0);

  const byId = new Map(result.bank.questions.map((question) => [question.id, question]));
  for (const year of HISTORICAL_YEARS) {
    for (let number = 1; number <= 100; number += 1) assert.ok(byId.has(textAt(year, number)), `${year} Q${number} is retained`);
  }
  assert.equal(result.validation.nearDuplicates.length, 153, 'similar/repeated PYQs are reported, not merged');

  for (const paper of result.bank.papers) {
    assert.equal(paper.scoring.scheme_id, 'mppsc-sse-prelims-latest-practice');
    assert.equal(paper.scoring.marks_per_correct, 3);
    assert.equal(paper.scoring.negative_marks_per_incorrect, 1);
    assert.equal(paper.scoring.negative_marking_enabled, true);
    assert.equal(paper.scoring.marks_for_unanswered, 0);
  }
  for (const question of result.bank.questions.filter((entry) => entry.year >= 2013 && entry.year <= 2018)) {
    assert.equal(question.supplied_answer.status, 'supplied');
    assert.ok(question.supplied_answer.answer.length);
    assert.equal(question.verified_answer, undefined);
    assert.equal(question.source_reference, undefined);
    assert.equal(question.review_flags, undefined);
    assert.equal(question.preliminary_classification, undefined);
    assert.equal(question.classification_source, undefined);
    assert.equal(question.classification_confidence, undefined);
  }
  const current = result.bank.questions.filter((question) => question.year >= 2019);
  assert.equal(current.length, 571);
  assert.equal(current.filter((question) => question.subject).length, 571, 'the reviewed current classifications are restored');
});
