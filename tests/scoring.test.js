/**
 * scoring.test.js — Deterministic scoring, answer-key integrity and rules.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, readText, approx } from './helpers.mjs';

const m = await bootApp();

const bankText = await readText('demo/demo-bank.json');
const report = m.validate.validateBank(JSON.parse(bankText));
const questionMap = new Map(report.questions.map((q) => [q.id, q]));
const paperP1 = report.papers.find((p) => p.paper_id === 'DEMO-P1');
const paperP2 = report.papers.find((p) => p.paper_id === 'DEMO-P2');

function makeTest(ids, { scoring, paper = null, policy = 'verified_preferred', unresolvedPolicy = 'supplied', confidence = 'off' } = {}) {
  return {
    id: 'unit-test',
    kind: 'custom',
    question_ids: ids,
    responses: {},
    language: 'en',
    config: { scoring: { rules: scoring }, answer_policy: policy, unresolved_policy: unresolvedPolicy, confidence, warnings: [], feedback_mode: 'exam' },
    paper_snapshot: paper,
  };
}

function answerCorrect(test, q) {
  test.responses[q.id] = { selected: (q.verified?.answer?.length ? q.verified.answer : q.supplied.answer).slice(), flagged: false, confidence: null, time_spent_ms: 1000 };
}
function answerWrong(test, q) {
  const keys = Object.values(q.language_variants)[0].options.map((o) => o.key);
  const correct = q.verified?.answer?.length ? q.verified.answer : q.supplied.answer;
  test.responses[q.id] = { selected: [keys.find((k) => !correct.includes(k))], flagged: false, confidence: null, time_spent_ms: 1000 };
}

test('marks follow the source paper rules, including negative marking', () => {
  const ids = paperP1.question_order.slice(0, 8);
  const test = makeTest(ids, { scoring: { marks_per_correct: 2, negative_marks_per_incorrect: 2 / 3, negative_marking_enabled: true, marks_for_unanswered: 0 } });
  ids.slice(0, 5).forEach((id) => answerCorrect(test, questionMap.get(id)));
  ids.slice(5, 8).forEach((id) => answerWrong(test, questionMap.get(id)));
  const result = m.scoring.scoreTest({ test, questions: questionMap, rules: test.config.scoring.rules });
  assert.equal(result.counts.correct, 5);
  assert.equal(result.counts.incorrect, 3);
  assert.equal(result.counts.unanswered, 0);
  assert.ok(approx(result.score, 10 - 2, 1e-6), `expected 8 marks, got ${result.score}`);
  assert.equal(result.max_marks, 16);
});

test('without negative marking marks never go below zero from wrong answers', () => {
  const ids = paperP3Ids();
  const test = makeTest(ids, { scoring: { marks_per_correct: 2, negative_marks_per_incorrect: 0, negative_marking_enabled: false, marks_for_unanswered: 0 } });
  ids.forEach((id) => answerWrong(test, questionMap.get(id)));
  const result = m.scoring.scoreTest({ test, questions: questionMap, rules: test.config.scoring.rules });
  assert.equal(result.score, 0);
  assert.equal(result.counts.incorrect, ids.length);
});

function paperP3Ids() {
  return report.papers.find((p) => p.paper_id === 'DEMO-P3').question_order.slice();
}

test('questions with no answer key are excluded, not marked wrong', () => {
  const missing = questionMap.get('DEMO-P2-002');
  assert.equal(missing.supplied.answer, null, 'fixture must have a question with no key');
  const test = makeTest([missing.id], { scoring: { marks_per_correct: 2, negative_marks_per_incorrect: 0.5, negative_marking_enabled: true, marks_for_unanswered: 0 } });
  test.responses[missing.id] = { selected: ['A'], flagged: false, confidence: null, time_spent_ms: 1000 };
  const result = m.scoring.scoreTest({ test, questions: questionMap, rules: test.config.scoring.rules });
  assert.equal(result.counts.unscored, 1);
  assert.equal(result.counts.incorrect, 0, 'a missing key must not be treated as an incorrect answer');
  assert.equal(result.score, 0);
  assert.equal(result.accuracy, null, 'accuracy must be unavailable rather than fabricated');
  assert.equal(result.unscored.length, 1);
});

test('a disputed key keeps the supplied answer but can be scored against the verified one', () => {
  const q = questionMap.get('DEMO-P2-003');
  assert.equal(q.dispute.is_disputed, true);
  assert.deepEqual(q.supplied.answer, ['B'], 'supplied answer is preserved as imported');
  assert.deepEqual(q.verified.answer, ['A']);

  const base = { scoring: { marks_per_correct: 2, negative_marks_per_incorrect: 0, negative_marking_enabled: false, marks_for_unanswered: 0 } };
  const testVerified = makeTest([q.id], base);
  testVerified.responses[q.id] = { selected: ['A'], flagged: false, confidence: null, time_spent_ms: 1000 };
  const r1 = m.scoring.scoreTest({ test: testVerified, questions: questionMap, rules: base.scoring, policy: 'verified_preferred' });
  assert.equal(r1.counts.correct, 1, 'verified answer should score the question correct');
  assert.equal(r1.per_question[0].answer_basis, 'verified');
  assert.equal(r1.unresolved_answers.length, 1, 'the disputed question is still reported as unresolved');
  assert.deepEqual(r1.per_question[0].supplied_answer, ['B'], 'the supplied key is still visible in the report');

  const testSupplied = makeTest([q.id], base);
  testSupplied.responses[q.id] = { selected: ['A'], flagged: false, confidence: null, time_spent_ms: 1000 };
  const r2 = m.scoring.scoreTest({ test: testSupplied, questions: questionMap, rules: base.scoring, policy: 'supplied' });
  assert.equal(r2.counts.incorrect, 1, 'policy "supplied" scores against the source key, which said B');

  const testExclude = makeTest([q.id], base);
  testExclude.responses[q.id] = { selected: ['A'], flagged: false, confidence: null, time_spent_ms: 1000 };
  const r3 = m.scoring.scoreTest({ test: testExclude, questions: questionMap, rules: base.scoring, policy: 'supplied', unresolvedPolicy: 'exclude' });
  assert.equal(r3.counts.unscored, 1, 'the exclude policy removes unresolved items from the score');
  assert.equal(r3.score, 0);
});

test('multiple-correct questions require an exact set match', () => {
  const q = questionMap.get('DEMO-P2-001');
  assert.deepEqual(q.supplied.answer.sort(), ['A', 'B']);
  const rules = { marks_per_correct: 2, negative_marks_per_incorrect: 0, negative_marking_enabled: false, marks_for_unanswered: 0 };
  const partial = makeTest([q.id], { scoring: rules });
  partial.responses[q.id] = { selected: ['A'], flagged: false, confidence: null, time_spent_ms: 1000 };
  assert.equal(m.scoring.scoreTest({ test: partial, questions: questionMap, rules }).counts.incorrect, 1);

  const exact = makeTest([q.id], { scoring: rules });
  exact.responses[q.id] = { selected: ['B', 'A'], flagged: false, confidence: null, time_spent_ms: 1000 };
  assert.equal(m.scoring.scoreTest({ test: exact, questions: questionMap, rules }).counts.correct, 1, 'option order must not matter');
});

test('score is identical when the same answers are scored twice (deterministic)', () => {
  const ids = paperP1.question_order.slice(0, 10);
  const rules = { marks_per_correct: 2, negative_marks_per_incorrect: 0.66, negative_marking_enabled: true, marks_for_unanswered: 0 };
  const test = makeTest(ids, { scoring: rules, confidence: 'optional' });
  ids.forEach((id, i) => {
    const q = questionMap.get(id);
    if (i % 3 === 0) answerWrong(test, q);
    else if (i % 3 === 1) answerCorrect(test, q);
    else test.responses[id] = { selected: [], flagged: false, confidence: null, time_spent_ms: 1000 };
    test.responses[id].confidence = i % 2 ? 'confident' : 'guessed';
  });
  const a = m.scoring.scoreTest({ test, questions: questionMap, rules });
  const b = m.scoring.scoreTest({ test, questions: questionMap, rules });
  assert.equal(a.score, b.score);
  assert.deepEqual(a.counts, b.counts);
  assert.deepEqual(a.per_question.map((r) => [r.question_id, r.outcome]), b.per_question.map((r) => [r.question_id, r.outcome]));
});

test('Hindi and English variants of one question are scored once, from the same keys', () => {
  const q = questionMap.get('DEMO-P1-001');
  const rules = { marks_per_correct: 2, negative_marks_per_incorrect: 0, negative_marking_enabled: false, marks_for_unanswered: 0 };
  const hindiTest = makeTest([q.id], { scoring: rules });
  hindiTest.language = 'hi';
  hindiTest.responses[q.id] = { selected: ['B'], flagged: false, confidence: null, time_spent_ms: 1000 };
  const result = m.scoring.scoreTest({ test: hindiTest, questions: questionMap, rules });
  assert.equal(result.counts.total, 1, 'a bilingual question is one question, not two');
  assert.equal(result.counts.correct, 1);
});

test('the latest MPPSC scoring pattern applies uniformly to all bundled years', () => {
  for (const year of [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2026]) {
    const resolved = m.scoring.resolveScoringRules({
      paper: { paper_id: `MPPSC-${year}-P1`, exam: 'MPPSC State Service Preliminary Examination', year, paper_code: 'GS-I', scoring: { rules_known: false } },
    });
    assert.equal(resolved.needsConfiguration, false, `${year}: current practice rules are automatic`);
    assert.equal(resolved.rules.marks_per_correct, 3, `${year}: +3 per correct answer`);
    assert.equal(resolved.rules.negative_marks_per_incorrect, 1, `${year}: −1 per wrong answer`);
    assert.equal(resolved.rules.negative_marking_enabled, true);
    assert.equal(resolved.rules.marks_for_unanswered, 0);
    assert.equal(resolved.schemeId, 'mppsc-sse-prelims-latest-practice');
  }
});

test('a stale historical scheme is upgraded to the latest pattern unless the user set an override', () => {
  const oldPaper = {
    paper_id: 'MPPSC-2019-P1',
    exam: 'MPPSC State Service Preliminary Examination',
    year: 2019,
    paper_code: 'GS-I',
    scoring: { rules_known: true, marks_per_correct: 2, negative_marks_per_incorrect: 0, negative_marking_enabled: false, marks_for_unanswered: 0, scheme_id: 'mppsc-sse-prelims-2019-2025' },
  };
  const upgraded = m.scoring.resolveScoringRules({ paper: oldPaper });
  assert.equal(upgraded.source, 'mppsc_builtin');
  assert.equal(upgraded.rules.marks_per_correct, 3);
  assert.equal(upgraded.rules.negative_marks_per_incorrect, 1);
  assert.match(upgraded.warnings.join(' '), /older or differing stored scheme/i);

  const userOverride = m.scoring.resolveScoringRules({ paper: { ...oldPaper, user_scoring_override: true } });
  assert.equal(userOverride.source, 'paper_original');
  assert.equal(userOverride.rules.marks_per_correct, 2, 'an explicit user override is still preserved');
});

test('years outside the bundled coverage and other commissions still require configuration', async () => {
  const old = m.scoring.resolveScoringRules({
    paper: { paper_id: 'MPPSC-2009-GS1', exam: 'MPPSC State Service Preliminary Examination', year: 2009, paper_code: 'GS-I', scoring: { rules_known: false } },
  });
  assert.equal(old.needsConfiguration, true, 'the uniform current pattern is defined from 2013 onward');
  assert.equal(old.rules, null);

  const other = m.scoring.resolveScoringRules({ paper: { paper_id: 'UPSC-2023', exam: 'Union Public Service Commission Preliminary Examination', year: 2023, paper_code: 'GS', scoring: { rules_known: false } } });
  assert.equal(other.needsConfiguration, true, 'a different commission is not scored with MPPSC rules');

  await assert.rejects(
    () => m.tests.submitTest({ id: 'x', question_ids: [], responses: {}, config: { scoring: { rules: null } } }),
    /no scoring rules/i,
  );
});

test('custom scoring rules override the paper rules and are labelled as user-configured', () => {
  const override = { source: 'custom', marksPerCorrect: 1, negativeMarksPerIncorrect: 0.25, negativeMarkingEnabled: true, marksForUnanswered: 0 };
  const resolved = m.scoring.resolveScoringRules({ paper: paperP1, override });
  assert.equal(resolved.source, 'user_configured');
  assert.equal(resolved.rules.marks_per_correct, 1);
  assert.equal(resolved.rules.negative_marks_per_incorrect, 0.25);
});

test('confidence is stored separately from correctness', () => {
  const ids = paperP1.question_order.slice(0, 4);
  const rules = { marks_per_correct: 2, negative_marks_per_incorrect: 0, negative_marking_enabled: false, marks_for_unanswered: 0 };
  const test = makeTest(ids, { scoring: rules, confidence: 'optional' });
  answerCorrect(test, questionMap.get(ids[0]));
  test.responses[ids[0]].confidence = 'guessed';
  answerCorrect(test, questionMap.get(ids[1]));
  test.responses[ids[1]].confidence = 'confident';
  answerWrong(test, questionMap.get(ids[2]));
  test.responses[ids[2]].confidence = 'confident';
  const result = m.scoring.scoreTest({ test, questions: questionMap, rules });
  assert.equal(result.counts.lowConfidenceCorrect, 1, 'a correct guess is counted as low-confidence, not as strong recall');
  assert.equal(result.counts.confidentIncorrect, 1);
  assert.equal(result.confidence_matrix.guessed.correct, 1);
  assert.equal(result.confidence_matrix.confident.incorrect, 1);
  assert.equal(result.counts.correct, 2, 'correctness is tracked independently of confidence');
});

test('unanswered questions stay distinct from incorrect answers', () => {
  const ids = paperP1.question_order.slice(0, 3);
  const rules = { marks_per_correct: 2, negative_marks_per_incorrect: 0.66, negative_marking_enabled: true, marks_for_unanswered: 0 };
  const test = makeTest(ids, { scoring: rules });
  // leave ids[0] unanswered by not creating a response at all
  answerCorrect(test, questionMap.get(ids[1]));
  answerWrong(test, questionMap.get(ids[2]));
  const result = m.scoring.scoreTest({ test, questions: questionMap, rules });
  assert.equal(result.counts.unanswered, 1);
  assert.equal(result.counts.incorrect, 1);
  assert.ok(approx(result.score, 2 - 0.66, 1e-6));
  assert.equal(result.counts.attempted, 2);
});

test('scoring rules are described in plain language for the report', () => {
  const resolved = m.scoring.resolveScoringRules({ paper: paperP1 });
  const text = m.scoring.describeRules(resolved.rules, resolved.source);
  assert.match(text, /\+2 for correct/);
  assert.match(text, /negative marking/);
  assert.match(text, /−0\.67 for incorrect/);
  assert.match(text, /source paper rules/);
});

test('every quiz type falls back to the MPPSC +3/−1/0 default scoring', () => {
  assert.deepEqual(
    { ...m.constants.DEFAULT_SETTINGS.defaultScoring },
    { marksPerCorrect: 3, negativeMarksPerIncorrect: 1, negativeMarkingEnabled: true, marksForUnanswered: 0 },
    'the shipped default scoring is the MPPSC +3/−1/0 pattern',
  );
  const resolved = m.scoring.resolveScoringRules({});
  assert.equal(resolved.rules.marks_per_correct, 3);
  assert.equal(resolved.rules.negative_marks_per_incorrect, 1);
  assert.equal(resolved.rules.negative_marking_enabled, true);
  assert.equal(resolved.rules.marks_for_unanswered, 0);
});
