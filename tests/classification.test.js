/**
 * classification.test.js — the PYQ classification pipeline.
 *
 * Covers the pieces that matter if this pipeline is ever run on real papers:
 * the taxonomy cannot drift out of step with the app's own subjects, the rule
 * engine separates Madhya Pradesh from general India, nothing is invented
 * (answers, labels or records), the reports tell the truth about what is still
 * unresolved, and the finished bank still imports through the app.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { bootApp, dataPath, repoRoot } from './helpers.mjs';
import { loadTaxonomy, reconcile, subjectNames, TAXONOMY_PATH } from '../tools/classify/taxonomy.mjs';
import {
  RULES,
  validateRules,
  classifyWithRules,
  foldText,
  mpSignal,
  CLASSIFICATION_SOURCE_RULES,
} from '../tools/classify/rules.mjs';
import { adaptIntake, adaptQuestion, mapAnswer, normaliseOptions, inferQuestionType } from '../tools/classify/intake-adapter.mjs';
import { buildAiQueue, renderAiQueueJsonl, parseLabels, applyAiLabels, providerConfig } from '../tools/classify/ai-queue.mjs';
import { LOW_CONFIDENCE_THRESHOLD } from '../tools/classify/reports.mjs';
import { runPipeline, classifyQuestion } from '../tools/classify-bank.mjs';
import { SUBJECT_ORDER } from '../js/core/constants.js';

async function sampleSource() {
  return JSON.parse(await readFile(path.join(repoRoot, 'demo', 'pyq-intake-sample.json'), 'utf8'));
}

function evidence(question, options = [], explanation = '') {
  return { question_text: question, option_texts: options, explanation_text: explanation };
}

/* ------------------------------------------------------------ taxonomy --- */

test('the taxonomy only contains subjects the app knows about', async () => {
  const taxonomy = await loadTaxonomy();
  assert.ok(taxonomy.subjects.size >= 9, 'expected the full canonical taxonomy');
  for (const subject of subjectNames(taxonomy)) {
    assert.ok(SUBJECT_ORDER.includes(subject), `${subject} is not in SUBJECT_ORDER`);
  }
  assert.ok(taxonomy.subjects.has('Madhya Pradesh Special'), 'MP content needs its own subject');
  assert.equal(validateRules(taxonomy).join(' '), '', 'every rule target must exist in the taxonomy');
  assert.ok(RULES.length > 100, `expected a substantial rule table, found ${RULES.length}`);
});

test('reconcile() drops taxonomy-unknown levels instead of passing them through', async () => {
  const taxonomy = await loadTaxonomy();
  assert.deepEqual(reconcile(taxonomy, 'Geography', 'Rivers of Madhya Pradesh', 'Narmada basin'), {
    subject: 'Geography',
    topic: 'Rivers of Madhya Pradesh',
    subtopic: 'Narmada basin',
    problems: [],
  });
  const unknown = reconcile(taxonomy, 'General Studies', 'Administration', 'Revenue');
  assert.equal(unknown.subject, null, 'an unknown subject must be dropped, not stored');
  assert.ok(unknown.problems.length);
  const badTopic = reconcile(taxonomy, 'Geography', 'Rivers', 'Narmada basin');
  assert.equal(badTopic.topic, null);
  assert.equal(badTopic.subtopic, null, 'a subtopic without a valid topic cannot stand alone');
});

/* -------------------------------------------------------- rule engine --- */

test('an MP river question is classified as Madhya Pradesh geography', async () => {
  await loadTaxonomy();
  const result = classifyWithRules(
    evidence('From which place in Madhya Pradesh does the Narmada river originate?', ['Amarkantak', 'Mahabaleshwar', 'Nashik', 'Brahmagiri']),
  );
  assert.equal(result.assigned, true);
  assert.equal(result.subject, 'Geography');
  assert.equal(result.topic, 'Rivers of Madhya Pradesh');
  assert.equal(result.subtopic, 'Narmada basin');
  assert.equal(result.mpSpecific, true);
  assert.equal(result.source, CLASSIFICATION_SOURCE_RULES);
  assert.ok(result.matched.some((m) => m.ruleId === 'geo-mp-narmada'), 'the decision must be traceable to a rule');
});

test('the same river in another state is not classified as Madhya Pradesh content', async () => {
  await loadTaxonomy();
  const result = classifyWithRules(
    evidence(
      'The Sardar Sarovar dam is built on which river?',
      ['Narmada', 'Tapti', 'Mahi', 'Luni'],
      'Sardar Sarovar is a gravity dam on the Narmada in Gujarat, downstream of Madhya Pradesh.',
    ),
  );
  assert.equal(result.subject, 'Geography');
  assert.equal(result.topic, 'Geography of India', 'a Gujarat dam must not land in the MP rivers topic');
  assert.equal(result.subtopic, 'Rivers of India');
  assert.equal(result.mpSpecific, false, 'one mention of MP in the explanation cannot make a question MP-specific');
});

test('mpSignal weights the question stem above options and the printed explanation', () => {
  const stem = mpSignal({ question_text: 'Which district of Madhya Pradesh has the largest forest area?', option_texts: [], explanation_text: '' });
  assert.equal(stem.mpSpecific, true);
  const explanationOnly = mpSignal({
    question_text: 'The dam is built on which river?',
    option_texts: ['Narmada', 'Tapti'],
    explanation_text: 'The Narmada rises in Madhya Pradesh and flows through Gujarat to the Arabian Sea.',
  });
  assert.equal(explanationOnly.mpSpecific, false);
  assert.ok(explanationOnly.nonMpScore > 0, 'the other state named in the explanation counts against MP attribution');
});

test('a Hindi question about the state is classified as Madhya Pradesh Special', async () => {
  await loadTaxonomy();
  const result = classifyWithRules(
    evidence('मध्य प्रदेश राज्य के गठन के समय राज्य के प्रथम मुख्यमंत्री कौन थे?', [
      'पंडित रविशंकर शुक्ल',
      'कैलाश विजयवर्गीय',
      'श्यामाचरण शुक्ल',
      'प्रकाशचंद सेठी',
    ]),
  );
  assert.equal(result.subject, 'Madhya Pradesh Special');
  assert.equal(result.topic, 'Formation of Madhya Pradesh');
  assert.equal(result.subtopic, 'Chief Ministers');
  assert.ok(foldText('मध्य प्रदेश').includes('मध्य प्रदेश'), 'Devanagari must survive folding');
});

test('a Chief Minister question about another state stays in Polity', async () => {
  await loadTaxonomy();
  const result = classifyWithRules(evidence('Who appoints the Chief Minister of a state under the Constitution of India?', ['President', 'Governor', 'Prime Minister', 'Speaker']));
  assert.equal(result.subject, 'Polity');
  assert.equal(result.topic, 'State Government');
});

test('a question with no usable evidence is left unclassified with a reason', async () => {
  await loadTaxonomy();
  const result = classifyWithRules(evidence('Consider the following statements and identify which one of them is consistent with the passage above.', [
    'Statement 1 only',
    'Statement 2 only',
    'Both 1 and 2',
    'Neither 1 nor 2',
  ]));
  assert.equal(result.assigned, false);
  assert.equal(result.subject, null);
  assert.equal(result.topic, null);
  assert.equal(result.subtopic, null);
  assert.equal(result.confidence, 0);
  assert.ok(result.reason, 'an unclassified question must carry a reason');
});

test('the printed answer is context, never evidence for the classification', async () => {
  await loadTaxonomy();
  const stem = 'Which Article of the Constitution of India guarantees the right to equality before law?';
  const options = ['Article 14', 'Article 19', 'Article 21', 'Article 32'];
  const a = classifyWithRules({ ...evidence(stem, options), printed_answer: ['A'] });
  const b = classifyWithRules({ ...evidence(stem, options), printed_answer: ['D'] });
  assert.deepEqual(
    { subject: a.subject, topic: a.topic, subtopic: a.subtopic, confidence: a.confidence },
    { subject: b.subject, topic: b.topic, subtopic: b.subtopic, confidence: b.confidence },
    'two different printed keys must not change the classification',
  );
  assert.equal(a.subject, 'Polity');
});

test('an explanation can support a classification but never as strongly as the stem', async () => {
  await loadTaxonomy();
  const genericStem = 'Which one of the following statements about the period is correct?';
  const options = ['First', 'Second', 'Third', 'Fourth'];
  const fromStem = classifyWithRules(evidence('Which Mughal emperor introduced the mansabdari system?', options));
  const fromExplanation = classifyWithRules(evidence(genericStem, options, 'Akbar introduced the mansabdari system during the Mughal period.'));
  assert.equal(fromStem.subject, 'History');
  assert.equal(fromStem.subtopic, 'Mughal empire');
  assert.equal(fromExplanation.subject, 'History', 'the explanation is usable as contextual evidence');
  assert.ok(
    fromExplanation.confidence <= fromStem.confidence,
    `explanation-based confidence ${fromExplanation.confidence} must not exceed stem-based ${fromStem.confidence}`,
  );
});

test('the rule engine is deterministic', async () => {
  await loadTaxonomy();
  const input = evidence('Which national park of Madhya Pradesh is famous for the barasingha?', ['Kanha', 'Van Vihar', 'Fossil', 'Madhav'], 'The swamp deer is the state animal.');
  const first = classifyWithRules(input);
  const second = classifyWithRules(input);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

/* ------------------------------------------------------------ adapter --- */

test('the adapter reshapes source records without inventing content', () => {
  const { question, notes } = adaptQuestion(
    {
      question_number: 12,
      question: 'The Narmada rises where?',
      options: ['Amarkantak', 'Mahabaleshwar', 'Nashik'],
      correct_answer: 'Amarkantak',
      explanation: 'It rises at Amarkantak.',
    },
    0,
    { paperId: 'P-2021', year: 2021 },
  );
  assert.equal(question.id, 'P-2021-012', 'a missing id is derived, and the derivation is reported');
  assert.ok(notes.some((n) => /no id/.test(n)));
  assert.deepEqual(question.language_variants.en.options.map((o) => o.key), ['A', 'B', 'C']);
  assert.deepEqual(question.supplied_answer.answer, ['A'], 'an answer given as option text is mapped to its key');
  assert.ok(notes.some((n) => /mapped to key A/.test(n)));
  assert.equal(question.question_type, 'single_correct');
  assert.equal(question.metadata.question_type_basis.includes('inferred'), true);
});

test('the adapter refuses to guess an answer it cannot map', () => {
  const { answer, notes } = mapAnswer('Option five', [{ key: 'A', text: 'Amarkantak' }, { key: 'B', text: 'Nashik' }]);
  assert.equal(answer, null);
  assert.ok(notes.some((n) => /left empty/.test(n)));
});

test('the adapter handles the option shapes extraction tools produce', () => {
  assert.deepEqual(normaliseOptions(['one', 'two']).options, [
    { key: 'A', text: 'one' },
    { key: 'B', text: 'two' },
  ]);
  assert.deepEqual(normaliseOptions({ A: 'one', B: 'two' }).options.map((o) => o.text), ['one', 'two']);
  assert.deepEqual(normaliseOptions([{ option: 'one' }, { option: 'two' }]).options.map((o) => o.text), ['one', 'two']);
  const split = normaliseOptions('A) one\nB) two');
  assert.deepEqual(split.options, [
    { key: 'A', text: 'one' },
    { key: 'B', text: 'two' },
  ]);
});

test('Devanagari text is stored as the Hindi variant, verbatim', () => {
  const { question } = adaptQuestion(
    { question_number: 1, question_text: 'मध्य प्रदेश की राजधानी क्या है?', options: ['भोपाल', 'इंदौर'] },
    0,
    {},
  );
  assert.ok(question.language_variants.hi, 'Devanagari must be detected as Hindi');
  assert.equal(question.language_variants.hi.question_text, 'मध्य प्रदेश की राजधानी क्या है?');
  assert.equal(question.language_variants.en, undefined);
});

test('a source record that already carries a schema-shaped answer keeps it', () => {
  const { question } = adaptQuestion(
    {
      id: 'X-1',
      paper_id: 'P',
      question_number: 1,
      language_variants: { en: { question_text: 'Which river?', options: [{ key: 'A', text: 'Narmada' }, { key: 'B', text: 'Tapti' }] } },
      supplied_answer: { answer: ['B'], status: 'disputed', source: 'official key' },
      verified_answer: { answer: ['A'], status: 'verified' },
      dispute: { is_disputed: true, reason: 'key and evidence disagree' },
    },
    0,
    {},
  );
  assert.deepEqual(question.supplied_answer.answer, ['B']);
  assert.equal(question.supplied_answer.status, 'disputed');
  assert.equal(question.supplied_answer.source, 'official key');
  assert.deepEqual(question.verified_answer.answer, ['A'], 'a verified answer must survive separately from the printed key');
  assert.equal(question.dispute.is_disputed, true);
  assert.equal(question.answer_key_status, 'disputed');
});

test('the adapter reports what it cannot read instead of dropping it quietly', () => {
  const { intake, unmappedKeys, recordIssues, duplicateIds } = adaptIntake({
    questions: [
      { id: 'A-1', paper_id: 'P', question_number: 1, question: 'One?', options: ['a', 'b'], answer: 'A', custom_note: 'keep me' },
      { id: 'A-1', paper_id: 'P', question_number: 2, question: 'Two?', options: ['a', 'b'], answer: 'B' },
    ],
  });
  assert.deepEqual(unmappedKeys, ['custom_note']);
  assert.deepEqual(duplicateIds, ['A-1'], 'a repeated id is reported, and both records survive');
  assert.equal(intake.questions.length, 2);
  assert.notEqual(intake.questions[0].id, intake.questions[1].id);
  assert.equal(intake.questions[1].metadata.duplicate_source_id, 'A-1');
  assert.ok(recordIssues.length, 'adapter notes are returned to the caller');
});

test('question types are only inferred from unambiguous signals', () => {
  assert.equal(inferQuestionType('Which one is correct?', [{ text: 'a' }, { text: 'b' }], ['A', 'B']).type, 'multiple_correct');
  assert.equal(inferQuestionType('Match the following lists.', [{ text: '1 - a' }, { text: '2 - b' }], null).type, 'matching');
  assert.equal(inferQuestionType('Consider the following statements.', [{ text: 'a' }, { text: 'b' }], ['A']).type, 'statement_based');
  assert.equal(inferQuestionType('Which one is correct?', [{ text: 'a' }, { text: 'b' }], ['A']).type, 'single_correct');
});

/* --------------------------------------------------------- end to end --- */

test('the pipeline classifies the sample intake and the app accepts the result', async () => {
  const source = await sampleSource();
  const result = await runPipeline(source, { bankId: 'TEST-PIPELINE' });
  const { bank, validation, rows, classificationReport, reviewReport } = result;

  assert.equal(validation.fatal.length, 0, JSON.stringify(validation.fatal));
  assert.equal(validation.errors.length, 0, JSON.stringify(validation.errors));
  assert.equal(validation.rejected.length, 0, JSON.stringify(validation.rejected));
  assert.equal(bank.questions.length, source.questions.length, 'no record may be lost');
  assert.equal(reviewReport.totals.records_removed, 0);
  assert.equal(reviewReport.totals.records_merged, 0);

  assert.equal(classificationReport.levels.subject.classified, 8);
  assert.equal(classificationReport.levels.subject.percentage, 80);
  assert.equal(classificationReport.levels.subject.unclassified, 2);
  assert.equal(classificationReport.levels.topic.classified, 8);
  assert.equal(classificationReport.levels.subtopic.classified, 8);

  const byId = new Map(bank.questions.map((q) => [q.id, q]));
  assert.equal(byId.get('SAMPLE-2023-GS1-001').topic, 'Rivers of Madhya Pradesh');
  assert.equal(byId.get('SAMPLE-2023-GS1-002').topic, 'Geography of India');
  assert.equal(byId.get('SAMPLE-2023-GS1-003').subject, 'Madhya Pradesh Special');
  assert.equal(byId.get('SAMPLE-2023-GS1-007').subject, null, 'an out-of-taxonomy source label is dropped, not stored');
  assert.deepEqual(byId.get('SAMPLE-2023-GS1-007').metadata.classification_dropped, {
    subject: 'General Studies',
    topic: 'Administration',
    subtopic: 'Revenue',
    source: 'legacy_extractor',
  });

  // Answer integrity is untouched.
  assert.equal(byId.get('SAMPLE-2023-GS1-008').supplied_answer.answer, null);
  assert.equal(byId.get('SAMPLE-2023-GS1-008').answer_key_status, 'missing');
  assert.equal(reviewReport.totals.missing_answer_keys, 2);
  assert.deepEqual(byId.get('SAMPLE-2023-GS1-009').supplied_answer.answer, ['B'], 'the printed key is preserved');
  assert.deepEqual(byId.get('SAMPLE-2023-GS1-009').verified_answer.answer, ['A'], 'the verified answer stays separate');
  assert.equal(byId.get('SAMPLE-2023-GS1-009').dispute.is_disputed, true);
  assert.deepEqual(
    reviewReport.integrity.verified_differs_from_supplied.map((r) => r.id),
    ['SAMPLE-2023-GS1-009'],
  );

  // Suspected duplicates are flagged, never merged.
  assert.equal(reviewReport.totals.near_duplicate_pairs, 1);
  assert.deepEqual(reviewReport.near_duplicates[0].kept, 'both records retained in the bank');
  assert.ok(byId.has('SAMPLE-2023-GS1-009') && byId.has('SAMPLE-2023-GS1-010'));
  assert.deepEqual(byId.get('SAMPLE-2023-GS1-010').metadata.near_duplicate_candidates.map((d) => d.id), ['SAMPLE-2023-GS1-009']);

  // The reports agree with the bank.
  assert.equal(rows.length, bank.questions.length);
  assert.equal(reviewReport.totals.questions_in_bank, bank.questions.length);
  assert.equal(reviewReport.totals.questions_in_source, source.questions.length);
  assert.ok(classificationReport.by_subject.find((r) => r.subject === 'Unclassified').count === 2);

  // And the app itself imports the file.
  const m = await bootApp();
  const analysis = await m.importer.analyseBankObject(bank, {});
  assert.equal(analysis.stage, 'ready', analysis.fatalMessage);
  assert.equal(analysis.report.nearDuplicates.length, 1);
  const imported = await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  assert.equal(imported.stats.questionsAdded, bank.questions.length);
  const { state } = await import('../js/core/state.js');
  assert.equal(state.questionIndex.size, bank.questions.length);
  const stored = await m.questions.getQuestion('SAMPLE-2023-GS1-001');
  assert.equal(stored.classification.subject, 'Geography');
  assert.equal(stored.classification.topic, 'Rivers of Madhya Pradesh');
  assert.equal(stored.classification.source, 'pipeline-rules');
  const unclassified = await m.questions.getQuestion('SAMPLE-2023-GS1-008');
  assert.equal(unclassified.classification.isUnclassified, true, 'unclassified records must stay flagged in the app');
  assert.equal(unclassified.supplied.answer, null);
});

test('the pipeline output validates with the repository validator on its own', async () => {
  const source = await sampleSource();
  const { bank } = await runPipeline(source);
  const m = currentModulesOr(await bootApp());
  const report = m.validate.validateBank(bank, {});
  assert.equal(report.ok, true);
  assert.equal(report.rejected.length, 0);
  assert.equal(report.stats.unclassified, 2, 'the app counts the same unclassified records the pipeline reported');
  assert.equal(report.stats.missingAnswers, 2);
  assert.equal(report.stats.bySubject['Madhya Pradesh Special'], 1);
});

function currentModulesOr(modules) {
  return modules;
}

/* ------------------------------------------------------------- reports --- */

test('the review report lists every unresolved case and proves nothing was dropped', async () => {
  const source = await sampleSource();
  const { reviewReport, classificationReport, rows } = await runPipeline(source);
  assert.deepEqual(
    reviewReport.missing_answers.map((r) => r.id).sort(),
    ['SAMPLE-2023-GS1-007', 'SAMPLE-2023-GS1-008'],
  );
  assert.ok(reviewReport.missing_answers.every((r) => /No key was fabricated/.test(r.note)));
  assert.equal(reviewReport.totals.ambiguous_classifications, 2);
  assert.equal(reviewReport.integrity.invalid_answer_reference.length, 0, 'no printed answer points at a missing option');
  assert.equal(reviewReport.integrity.fewer_than_two_options.length, 0);
  assert.equal(reviewReport.preserved.questions_kept, 10);
  assert.equal(reviewReport.preserved.review_flags_added, rows.filter((r) => r.flags.length).length);
  assert.ok(reviewReport.preserved.review_flags_added >= 5, 'the MP-specific, missing-key and duplicate records must all be flagged');
  const flagged = new Map(rows.map((r) => [r.id, r.flags]));
  assert.ok(flagged.get('SAMPLE-2023-GS1-008').includes('missing_answer_key'));
  assert.ok(flagged.get('SAMPLE-2023-GS1-008').includes('unclassified_no_rule_matched'));
  assert.ok(flagged.get('SAMPLE-2023-GS1-010').includes('near_duplicate_candidate'));
  assert.ok(flagged.get('SAMPLE-2023-GS1-006').includes('ambiguous_subtopic'));
  assert.ok(flagged.get('SAMPLE-2023-GS1-001').includes('madhya_pradesh_specific'));
  assert.deepEqual(flagged.get('SAMPLE-2023-GS1-004'), [], 'a cleanly classified record needs no review flag');
  assert.equal(LOW_CONFIDENCE_THRESHOLD, 0.6);
  // The report is derived, so its totals must match the bank's own stats.
  const m = await bootApp();
  const { bank } = await runPipeline(source);
  const report = m.validate.validateBank(bank, {});
  assert.equal(report.stats.questions, reviewReport.totals.questions_in_bank);
  assert.equal(classificationReport.total_questions, report.stats.questions);
});

/* ------------------------------------------------------------ ai queue --- */

test('the AI queue holds exactly the questions the rules could not settle', async () => {
  const source = await sampleSource();
  const { aiQueue, bank } = await runPipeline(source);
  assert.deepEqual(aiQueue.map((i) => i.id).sort(), ['SAMPLE-2023-GS1-007', 'SAMPLE-2023-GS1-008']);
  for (const item of aiQueue) {
    assert.ok(item.question_text.length > 0);
    assert.ok(item.options.length >= 2);
    assert.ok(item.allowed_subjects.length > 5);
    assert.match(item.instructions, /never guess a label/);
  }
  // The queue file round-trips.
  const { labels } = parseLabels(renderAiQueueJsonl(aiQueue));
  assert.equal(labels.length, aiQueue.length);
  assert.equal(bank.questions.length, source.questions.length);
});

test('provider labels are validated against the taxonomy before they are applied', async () => {
  const taxonomy = await loadTaxonomy();
  const intake = {
    questions: [
      { id: 'Q1', metadata: {} },
      { id: 'Q2', metadata: {} },
      { id: 'Q3', metadata: {}, classification_source: 'human_reviewer', subject: 'History' },
    ],
  };
  const summary = applyAiLabels(
    intake,
    [
      { id: 'Q1', subject: 'Polity', topic: 'Constitution of India', subtopic: 'Fundamental Rights', confidence: 0.91, rationale: 'article question' },
      { id: 'Q2', subject: 'Astrology', topic: 'Zodiac', confidence: 0.9 },
      { id: 'Q3', subject: 'Geography' },
      { id: 'MISSING', subject: 'Polity' },
    ],
    taxonomy,
    { provider: 'test-provider', model: 'test-model' },
  );
  const [q1, q2, q3] = intake.questions;
  assert.equal(q1.subject, 'Polity');
  assert.equal(q1.classification_source, 'pipeline-ai');
  assert.equal(q1.classification_confidence, 0.91);
  assert.equal(q1.metadata.ai_classification.provider, 'test-provider');
  assert.equal(q2.subject, undefined, 'a label outside the taxonomy must not be written');
  assert.equal(summary.rejected.length, 3);
  assert.ok(summary.rejected.some((r) => /not in the taxonomy/.test(r.reason)), 'an out-of-taxonomy label is rejected');
  assert.ok(summary.rejected.some((r) => /already classified/.test(r.reason)), 'a human classification is never overwritten silently');
  assert.ok(summary.rejected.some((r) => /no question in the intake/.test(r.reason)));
  assert.equal(q3.subject, 'History', 'a classification the source supplied is not overwritten without an explicit flag');
  assert.equal(summary.flagged.length, 0);
});

test('a provider that returns no subject leaves the question unclassified and flagged', async () => {
  const taxonomy = await loadTaxonomy();
  const intake = { questions: [{ id: 'Q1', subject: 'Geography', classification_source: 'pipeline-rules', metadata: {} }] };
  const summary = applyAiLabels(intake, [{ id: 'Q1', subject: null, confidence: null }], taxonomy, {});
  assert.equal(intake.questions[0].subject, null);
  assert.equal(summary.flagged.length, 1);
  assert.match(summary.flagged[0].reason, /stays unclassified/);
});

test('a low-confidence provider label is applied but marked for review', async () => {
  const taxonomy = await loadTaxonomy();
  const intake = { questions: [{ id: 'Q1', metadata: {} }] };
  const summary = applyAiLabels(intake, [{ id: 'Q1', subject: 'History', topic: 'Medieval India', confidence: 0.31 }], taxonomy, {});
  assert.equal(intake.questions[0].subject, 'History');
  assert.equal(intake.questions[0].metadata.ai_classification.needs_review, 'provider confidence below the review threshold');
  assert.equal(summary.flagged.length, 1);
});

test('without a configured provider the AI step reports the limitation and changes nothing', () => {
  const config = providerConfig({});
  assert.equal(config.ok, false);
  assert.match(config.reason, /MYMPPSC_AI_PROVIDER is not set/);
  const missingKey = providerConfig({ MYMPPSC_AI_PROVIDER: 'openai' });
  assert.equal(missingKey.ok, false);
  assert.match(missingKey.reason, /MYMPPSC_AI_API_KEY is not set/);
});

test('the pipeline resumes from provider labels without redoing the rule pass', async () => {
  const source = await sampleSource();
  const labels = renderAiQueueJsonl([
    JSON.parse(
      JSON.stringify({
        id: 'SAMPLE-2023-GS1-007',
        subject: 'History',
        topic: 'Medieval India',
        subtopic: 'Medieval administration and revenue',
        confidence: 0.82,
        rationale: 'administrative arrangement',
      }),
    ),
  ]);
  const result = await runPipeline(source, { aiLabels: labels, aiProvider: 'test-provider' });
  const q = result.bank.questions.find((x) => x.id === 'SAMPLE-2023-GS1-007');
  assert.equal(q.subject, 'History');
  assert.equal(q.classification_source, 'pipeline-ai');
  assert.equal(result.classificationReport.levels.subject.unclassified, 1);
  assert.equal(result.aiQueue.length, 1, 'the still-unclassified question stays in the queue');
  assert.equal(result.validation.rejected.length, 0);
});

/* ------------------------------------------------- pipeline invariants --- */

test('classifyQuestion never writes a label the taxonomy does not contain', async () => {
  const taxonomy = await loadTaxonomy();
  const source = await sampleSource();
  for (const raw of source.questions) {
    const { question } = adaptQuestion(raw, 0, { paperId: raw.paper_id, year: raw.year });
    if (!question || question.skipped) continue;
    const row = classifyQuestion(question, taxonomy);
    if (row.subject) {
      assert.ok(taxonomy.subjects.has(row.subject), `${row.subject} is not a taxonomy subject`);
      assert.ok(row.topic === null || taxonomy.subjects.get(row.subject).has(row.topic), `${row.topic} is not a taxonomy topic`);
      if (row.subtopic) {
        assert.ok(taxonomy.subjects.get(row.subject).get(row.topic).includes(row.subtopic), `${row.subtopic} is not a taxonomy subtopic`);
      }
    }
    assert.ok(Array.isArray(question.metadata.classification_flags));
  }
});

test('a built bank can be fed back through the pipeline without losing answer integrity', async () => {
  const source = await sampleSource();
  const first = await runPipeline(source);
  const second = await runPipeline(first.bank); // re-classify the bank itself
  const key = (q) => [q.id, q.subject, q.topic, q.subtopic, q.classification_confidence, q.supplied_answer?.answer ?? null];
  assert.equal(second.bank.questions.length, first.bank.questions.length);
  assert.deepEqual(second.bank.questions.map(key), first.bank.questions.map(key), 'a re-run must be idempotent');
  assert.equal(second.reviewReport.totals.records_removed, 0);
  const verified = second.bank.questions.find((q) => q.id === 'SAMPLE-2023-GS1-009');
  assert.deepEqual(verified.supplied_answer.answer, ['B'], 'the printed key survives the re-run');
  assert.deepEqual(verified.verified_answer.answer, ['A'], 'the verified answer survives the re-run');
  assert.equal(verified.dispute.is_disputed, true);
  assert.equal(second.reviewReport.totals.near_duplicate_pairs, 1);
});

test('the reports can be regenerated deterministically from the same input', async () => {
  const source = await sampleSource();
  const a = await runPipeline(source);
  const b = await runPipeline(source);
  const strip = (r) => JSON.stringify({ ...r, generated_at: null });
  assert.equal(strip(a.classificationReport), strip(b.classificationReport));
  assert.equal(strip(a.reviewReport), strip(b.reviewReport));
  assert.deepEqual(
    a.bank.questions.map((q) => [q.id, q.subject, q.topic, q.subtopic, q.classification_confidence]),
    b.bank.questions.map((q) => [q.id, q.subject, q.topic, q.subtopic, q.classification_confidence]),
  );
});

test('the bank the pipeline writes keeps the app-facing classification fields', async () => {
  const source = await sampleSource();
  const { bank } = await runPipeline(source);
  const q = bank.questions.find((x) => x.id === 'SAMPLE-2023-GS1-001');
  for (const field of ['subject', 'topic', 'subtopic', 'classification_confidence', 'classification_source']) {
    assert.ok(field in q, `the bank must carry ${field} at the top level, as docs/SCHEMA.md specifies`);
  }
  assert.equal(typeof q.classification_confidence, 'number');
  assert.ok(q.classification_confidence >= 0 && q.classification_confidence <= 1);
  assert.equal(bank.schema_version, '1.0.0');
  assert.equal(bank.is_demonstration, true, 'the sample intake is synthetic and must stay flagged');
  assert.ok(dataPath('taxonomy', 'mppsc-taxonomy.json').endsWith('mppsc-taxonomy.json'));
  assert.equal(TAXONOMY_PATH, dataPath('taxonomy', 'mppsc-taxonomy.json'));
});
