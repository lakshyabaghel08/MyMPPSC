import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';
import { loadTaxonomy, reconcile } from '../tools/classify/taxonomy.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));
const readJsonl = async (...parts) => (await readFile(dataPath(...parts), 'utf8'))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const classification = (q) => ({ subject: q.subject ?? null, topic: q.topic ?? null, subtopic: q.subtopic ?? null });

test('the final quality-audit report describes the complete bank and applied scope', async () => {
  const [summary, bank, baseline, finalRows, decisions, labels, allReviewed, originalQueue, currentQueue] = await Promise.all([
    readJson('pyq', 'quality-audit', 'quality-audit-final.json'),
    readJson('pyq', 'mymppsc-pyq-bank.json'),
    readJsonl('pyq', 'quality-audit', 'question-audit-baseline.jsonl'),
    readJsonl('pyq', 'quality-audit', 'question-audit-final.jsonl'),
    readJsonl('pyq', 'quality-audit', 'classification-review-decisions.jsonl'),
    readJsonl('pyq', 'quality-audit', 'reviewed-labels-quality-remediation.jsonl'),
    readJsonl('pyq', 'reviewed-labels.jsonl'),
    readJsonl('pyq', 'quality-audit', 'ai-queue-baseline.jsonl'),
    readJsonl('pyq', 'ai-queue.jsonl'),
  ]);

  assert.equal(summary.status, 'applied');
  assert.equal(bank.questions.length, 1171);
  assert.equal(bank.papers.length, 12);
  assert.equal(baseline.length, 1171);
  assert.equal(finalRows.length, 1171);
  assert.equal(originalQueue.length, 323);
  assert.equal(decisions.length, 323);
  assert.equal(labels.length, 322);
  assert.equal(allReviewed.length, 566);
  assert.equal(currentQueue.length, 1);
  assert.equal(currentQueue[0].id, 'MPPSC-2021-065');
  assert.equal(summary.bank.existing_2019_2024_content_and_classification_unchanged, true);
  assert.equal(summary.bank.all_question_options_answers_explanations_unchanged, true);
  assert.equal(summary.answers.answer_changes_in_this_audit, 0);
  assert.equal(summary.explanations.explanation_text_changes_in_this_audit, 0);
  assert.equal(summary.blank_options.restored, 0);
  assert.deepEqual(summary.classification.targeted_spot_checks, [{
    id: 'MPPSC-2015-078',
    result: 'reaffirmed',
    supporting_question_ids: ['MPPSC-2021-068', 'MPPSC-2023-091'],
  }]);
  assert.equal(summary.bank.removed_or_merged_records, 0);
  assert.equal(summary.bank.automatic_near_duplicate_merges, 0);
  assert.equal(summary.internal_metadata_in_app_bank, false);
});

test('all queue decisions are accounted for and exactly match final labels or unresolved follow-up', async () => {
  const [bank, baseline, decisions, labels, originalQueue, currentQueue] = await Promise.all([
    readJson('pyq', 'mymppsc-pyq-bank.json'),
    readJsonl('pyq', 'quality-audit', 'question-audit-baseline.jsonl'),
    readJsonl('pyq', 'quality-audit', 'classification-review-decisions.jsonl'),
    readJsonl('pyq', 'quality-audit', 'reviewed-labels-quality-remediation.jsonl'),
    readJsonl('pyq', 'quality-audit', 'ai-queue-baseline.jsonl'),
    readJsonl('pyq', 'ai-queue.jsonl'),
  ]);
  const beforeById = new Map(baseline.map((q) => [q.id, q]));
  const bankById = new Map(bank.questions.map((q) => [q.id, q]));
  const decisionsById = new Map(decisions.map((d) => [d.id, d]));
  const labelsById = new Map(labels.map((l) => [l.id, l]));
  assert.equal(decisionsById.size, 323);
  assert.deepEqual([...decisionsById.keys()].sort(), originalQueue.map((q) => q.id).sort());
  assert.deepEqual([...labelsById.keys()].sort(), decisions.filter((d) => d.decision !== 'retained_unresolved').map((d) => d.id).sort());

  const counts = decisions.reduce((result, row) => {
    result[row.decision] = (result[row.decision] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, {
    classified: 313,
    corrected_or_completed: 7,
    confirmed: 2,
    retained_unresolved: 1,
  });
  assert.equal(decisions.filter((d) => d.changed).length, 320);
  assert.equal(decisions.filter((d) => d.review_method === 'agent_assisted_validation').length, 323);
  assert.equal(decisions.filter((d) => d.content_rationale_consistency_review === 'passed').length, 323);
  assert.equal(decisions.filter((d) => d.consistency_review_adjustment).length, 5);
  const spotCheck = decisionsById.get('MPPSC-2015-078');
  assert.deepEqual(spotCheck.targeted_spot_check, {
    reviewed_at: '2026-10-12',
    result: 'reaffirmed',
    supporting_question_ids: ['MPPSC-2021-068', 'MPPSC-2023-091'],
  });
  assert.match(spotCheck.rationale, /MPPSC-2021-068.*MPPSC-2023-091/);
  assert.deepEqual(spotCheck.reviewed_classification, {
    subject: 'History',
    topic: 'History of Madhya Pradesh',
    subtopic: 'Revolt of 1857 in Madhya Pradesh',
  });
  assert.deepEqual(currentQueue.map((q) => q.id), ['MPPSC-2021-065']);

  for (const decision of decisions) {
    const before = beforeById.get(decision.id);
    const after = bankById.get(decision.id);
    assert.ok(before && after, `${decision.id} is present before and after`);
    assert.deepEqual(decision.prior_classification, before.current_classification, `${decision.id}: recorded before state`);
    const proposed = labelsById.get(decision.id);
    const target = proposed ? {
      subject: proposed.subject,
      topic: proposed.topic ?? null,
      subtopic: proposed.subtopic ?? null,
    } : before.current_classification;
    assert.deepEqual(decision.reviewed_classification, target, `${decision.id}: label or retained-path disposition`);
    assert.deepEqual(classification(after), target, `${decision.id}: production state`);
    assert.equal(decision.changed, JSON.stringify(before.current_classification) !== JSON.stringify(target));
    assert.equal(decision.stored_answer_unchanged, true);
    assert.equal(decision.independently_verified, false);
  }
});

test('all 322 appended labels carry explicit agent review provenance and valid taxonomy paths', async () => {
  const taxonomy = await loadTaxonomy();
  const [bank, labels, mainLabels] = await Promise.all([
    readJson('pyq', 'mymppsc-pyq-bank.json'),
    readJsonl('pyq', 'quality-audit', 'reviewed-labels-quality-remediation.jsonl'),
    readJsonl('pyq', 'reviewed-labels.jsonl'),
  ]);
  const byId = new Map(bank.questions.map((q) => [q.id, q]));
  assert.equal(new Set(mainLabels.map((label) => label.id)).size, 566);
  for (const label of labels) {
    assert.equal(label.review_method, 'agent_assisted_validation', `${label.id}: provenance is explicit`);
    const exact = reconcile(taxonomy, label.subject, label.topic ?? null, label.subtopic ?? null);
    assert.deepEqual({
      subject: exact.subject ?? null,
      topic: exact.topic ?? null,
      subtopic: exact.subtopic ?? null,
    }, {
      subject: label.subject,
      topic: label.topic ?? null,
      subtopic: label.subtopic ?? null,
    }, `${label.id}: every stated node is an exact taxonomy path`);
    assert.deepEqual(classification(byId.get(label.id)), {
      subject: label.subject,
      topic: label.topic ?? null,
      subtopic: label.subtopic ?? null,
    }, `${label.id}: production bank matches the reviewed label`);
  }
});

test('all historical question data and all 2019–2024 records are preserved', async () => {
  const [bank, baseline, finalRows] = await Promise.all([
    readJson('pyq', 'mymppsc-pyq-bank.json'),
    readJsonl('pyq', 'quality-audit', 'question-audit-baseline.jsonl'),
    readJsonl('pyq', 'quality-audit', 'question-audit-final.jsonl'),
  ]);
  const beforeById = new Map(baseline.map((q) => [q.id, q]));
  const finalById = new Map(finalRows.map((q) => [q.id, q]));
  for (const q of bank.questions) {
    const before = beforeById.get(q.id);
    const final = finalById.get(q.id);
    assert.ok(before && final, `${q.id}: baseline/final record is present`);
    assert.equal(q.language_variants.en.question_text, before.question_text, `${q.id}: wording`);
    assert.deepEqual(q.language_variants.en.options, before.options, `${q.id}: options`);
    assert.deepEqual(q.supplied_answer.answer.map((x) => String(x).toUpperCase()), before.answer.stored_answer, `${q.id}: stored answer`);
    assert.deepEqual(q.explanation, before.explanation.stored_explanation, `${q.id}: explanation`);
    assert.deepEqual(final.classification_after, classification(q), `${q.id}: final audit classification`);
    assert.equal(final.answer.answer_unchanged, true);
    assert.equal(final.answer.independently_verified, false);
    assert.equal(final.internal_provenance_in_student_bank, false);
    if (q.year >= 2019) {
      assert.deepEqual(classification(q), before.current_classification, `${q.id}: 2019–2024 classification is unchanged`);
    }
    for (const internalKey of ['classification_source', 'classification_confidence', 'review_flags', 'reviewed_classification', 'review_method', 'metadata']) {
      assert.equal(Object.hasOwn(q, internalKey), false, `${q.id}: internal field ${internalKey} is not in the app-facing bank`);
    }
  }
});

test('answer/source limits, explanation gaps, blanks, taxonomy gaps, and practice scoring are represented accurately', async () => {
  const [summary, bank, finalRows, taxonomyGaps, classificationReport, reviewReport] = await Promise.all([
    readJson('pyq', 'quality-audit', 'quality-audit-final.json'),
    readJson('pyq', 'mymppsc-pyq-bank.json'),
    readJsonl('pyq', 'quality-audit', 'question-audit-final.jsonl'),
    readJsonl('pyq', 'quality-audit', 'classification-taxonomy-gaps.jsonl'),
    readJson('pyq', 'classification-report.json'),
    readJson('pyq', 'review-report.json'),
  ]);
  assert.equal(summary.answers.source_printed_key_comparisons_matched, 1163);
  assert.equal(summary.answers.source_printed_key_mismatches, 0);
  assert.equal(summary.answers.questions_without_local_source_key_comparison, 8);
  assert.equal(summary.answers.officially_verified_answers, 0);
  assert.equal(summary.explanations.historical_source_missing_ids.length, 28);
  assert.equal(summary.explanations.current_period_source_missing_ids.length, 7);
  assert.equal(summary.explanations.prior_integration_generic_placeholders_removed, 119);
  assert.equal(summary.blank_options.questions, 11);
  assert.equal(summary.blank_options.blank_option_cells, 13);
  assert.equal(summary.blank_options.restored, 0);
  assert.equal(taxonomyGaps.length, 95);
  assert.equal(summary.classification.after.subject_unclassified, 0);
  assert.equal(summary.classification.after.topic_missing, 9);
  assert.equal(summary.classification.after.subtopic_classified, 1076);
  assert.equal(summary.classification.after.subtopic_missing, 95);
  assert.equal(classificationReport.report_status, 'pre_remediation_integration_snapshot');
  assert.equal(reviewReport.report_status, 'pre_remediation_integration_snapshot');
  assert.equal(classificationReport.superseded_by, 'data/pyq/quality-audit/quality-audit-final.json');
  assert.equal(reviewReport.superseded_by, 'data/pyq/quality-audit/quality-audit-final.json');

  for (const paper of bank.papers) {
    assert.equal(paper.scoring.marks_per_correct, 3);
    assert.equal(paper.scoring.negative_marks_per_incorrect, 1);
    assert.equal(paper.scoring.marks_for_unanswered, 0);
    assert.equal(paper.scoring.negative_marking_enabled, true);
  }
  for (const row of finalRows) {
    if (row.answer.source_answer_match === true) assert.equal(row.answer.independently_verified, false);
    assert.equal(row.answer.answer_unchanged, true);
  }
});
