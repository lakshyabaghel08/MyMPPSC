import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

import { validateBank } from '../js/core/validate.js';
import { normaliseQuestion } from '../js/core/schema.js';
import {
  evaluateResponse,
  scoreTest,
  isCancelledQuestion,
  sameAnswerSet,
  OUTCOMES
} from '../js/services/scoring.js';

// Load files
const prodBank = JSON.parse(fs.readFileSync('data/pyq/mymppsc-pyq-bank.json', 'utf8'));
const backupBank = JSON.parse(execSync('git show HEAD:data/pyq/mymppsc-pyq-bank.json', { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' }));
const researchBank = JSON.parse(fs.readFileSync('data/pyq/research/unresolved-research-dataset.json', 'utf8'));

const prodMap = new Map(prodBank.questions.map((q) => [q.id, q]));
const backupMap = new Map(backupBank.questions.map((q) => [q.id, q]));
const researchIds = new Set(researchBank.questions.map((q) => q.id));

/* -------------------------------------------------------------------------- */
/* 1. Schema Validation                                                       */
/* -------------------------------------------------------------------------- */
test('1. Production bank passes schema validation with 0 fatal and 0 errors', () => {
  const report = validateBank(prodBank, {});
  assert.equal(report.ok, true, 'Bank must be valid');
  assert.equal(report.fatal.length, 0, 'No fatal errors');
  assert.equal(report.errors.length, 0, 'No record-level errors');
  assert.equal(report.papers.length, 13, 'Must have 13 papers');
  assert.equal(report.questions.length, 1300, 'Must have 1300 scorable questions');
});

/* -------------------------------------------------------------------------- */
/* 2. Multi-Key Single Choice: Either accepted answer receives full marks    */
/* -------------------------------------------------------------------------- */
test('2a. MPPSC-2012-050: Either B or D receives full marks in single-choice mode', () => {
  const rawQ = prodMap.get('MPPSC-2012-050');
  assert.ok(rawQ, 'MPPSC-2012-050 must exist');
  const { question } = normaliseQuestion(rawQ);

  assert.equal(question.question_type, 'single_correct');
  assert.deepEqual(question.supplied.answer, ['B', 'D']);
  assert.deepEqual(question.verified.answer, ['B', 'D']);

  // Selecting B
  const evalB = evaluateResponse(question, { selected: ['B'] }, 'verified_preferred');
  assert.equal(evalB.outcome, OUTCOMES.CORRECT, 'Selecting B must be CORRECT');

  // Selecting D
  const evalD = evaluateResponse(question, { selected: ['D'] }, 'verified_preferred');
  assert.equal(evalD.outcome, OUTCOMES.CORRECT, 'Selecting D must be CORRECT');

  // Selecting wrong option (e.g. A)
  const evalA = evaluateResponse(question, { selected: ['A'] }, 'verified_preferred');
  assert.equal(evalA.outcome, OUTCOMES.INCORRECT, 'Selecting A must be INCORRECT');

  // Full test scoring with rules (3 marks per correct)
  const testSession = {
    question_ids: ['MPPSC-2012-050'],
    responses: {
      'MPPSC-2012-050': { selected: ['B'], flagged: false, confidence: null, time_spent_ms: 1000 }
    }
  };
  const qMap = new Map([['MPPSC-2012-050', question]]);
  const scored = scoreTest({
    test: testSession,
    questions: qMap,
    rules: { marks_per_correct: 3, negative_marks_per_incorrect: 1, negative_marking_enabled: true }
  });
  assert.equal(scored.counts.correct, 1);
  assert.equal(scored.score, 3);
  assert.equal(scored.max_marks, 3);
});

test('2b. MPPSC-2022-045: Either C or D receives full marks in verified_preferred mode', () => {
  const rawQ = prodMap.get('MPPSC-2022-045');
  assert.ok(rawQ, 'MPPSC-2022-045 must exist');
  const { question } = normaliseQuestion(rawQ);

  assert.equal(question.question_type, 'single_correct');
  assert.deepEqual(question.supplied.answer, ['D']);
  assert.deepEqual(question.verified.answer, ['C', 'D']);

  // Selecting C in verified_preferred mode
  const evalC = evaluateResponse(question, { selected: ['C'] }, 'verified_preferred');
  assert.equal(evalC.outcome, OUTCOMES.CORRECT, 'Selecting C must be CORRECT in verified mode');

  // Selecting D in verified_preferred mode
  const evalD = evaluateResponse(question, { selected: ['D'] }, 'verified_preferred');
  assert.equal(evalD.outcome, OUTCOMES.CORRECT, 'Selecting D must be CORRECT in verified mode');

  // In supplied policy (historical exam mode), official key is D
  const evalC_supplied = evaluateResponse(question, { selected: ['C'] }, 'supplied');
  assert.equal(evalC_supplied.outcome, OUTCOMES.INCORRECT, 'Selecting C in supplied policy is INCORRECT (official key was D)');
  const evalD_supplied = evaluateResponse(question, { selected: ['D'] }, 'supplied');
  assert.equal(evalD_supplied.outcome, OUTCOMES.CORRECT, 'Selecting D in supplied policy is CORRECT');
});

/* -------------------------------------------------------------------------- */
/* 3. Genuine multiple-correct questions still require exact set             */
/* -------------------------------------------------------------------------- */
test('3. Genuine multiple_correct question requires exact set', () => {
  const multiQ = {
    id: 'TEST-MULTI-001',
    question_type: 'multiple_correct',
    language_variants: {
      en: {
        question_text: 'Which of the following are prime numbers?',
        options: [
          { key: 'A', text: '2' },
          { key: 'B', text: '3' },
          { key: 'C', text: '4' },
          { key: 'D', text: '6' }
        ]
      }
    },
    supplied: { answer: ['A', 'B'], status: 'final' },
    verified: { answer: ['A', 'B'], status: 'verified' }
  };

  // Selecting only ['A'] -> INCORRECT for multiple_correct
  const evalSingleA = evaluateResponse(multiQ, { selected: ['A'] }, 'verified_preferred');
  assert.equal(evalSingleA.outcome, OUTCOMES.INCORRECT, 'Single option on multiple_correct must be INCORRECT');

  // Selecting only ['B'] -> INCORRECT for multiple_correct
  const evalSingleB = evaluateResponse(multiQ, { selected: ['B'] }, 'verified_preferred');
  assert.equal(evalSingleB.outcome, OUTCOMES.INCORRECT, 'Single option on multiple_correct must be INCORRECT');

  // Selecting exact set ['A', 'B'] -> CORRECT
  const evalExact = evaluateResponse(multiQ, { selected: ['A', 'B'] }, 'verified_preferred');
  assert.equal(evalExact.outcome, OUTCOMES.CORRECT, 'Exact set on multiple_correct must be CORRECT');

  // Selecting superset ['A', 'B', 'C'] -> INCORRECT
  const evalSuper = evaluateResponse(multiQ, { selected: ['A', 'B', 'C'] }, 'verified_preferred');
  assert.equal(evalSuper.outcome, OUTCOMES.INCORRECT, 'Superset on multiple_correct must be INCORRECT');
});

/* -------------------------------------------------------------------------- */
/* 4. Cancelled questions are excluded from scoring and adjust max marks     */
/* -------------------------------------------------------------------------- */
test('4. Cancelled questions (MPPSC-2017-054, MPPSC-2018-015) reduce max marks and are unscored', () => {
  const q2017 = prodMap.get('MPPSC-2017-054');
  const q2018 = prodMap.get('MPPSC-2018-015');

  assert.ok(isCancelledQuestion(q2017), 'MPPSC-2017-054 must be recognized as cancelled');
  assert.ok(isCancelledQuestion(q2018), 'MPPSC-2018-015 must be recognized as cancelled');

  const { question: norm2017 } = normaliseQuestion(q2017);
  const { question: norm2018 } = normaliseQuestion(q2018);

  // Even if user answers 'A', outcome must be UNSCORED
  const eval2017 = evaluateResponse(norm2017, { selected: ['A'] });
  assert.equal(eval2017.outcome, OUTCOMES.UNSCORED);
  assert.match(eval2017.note, /cancelled/i);

  // Test session with 10 questions total, including 2 cancelled questions
  const regularQ = {
    id: 'REG-001',
    question_type: 'single_correct',
    language_variants: { en: { question_text: 'Q?', options: [{ key: 'A', text: 'OptA' }, { key: 'B', text: 'OptB' }] } },
    supplied_answer: { answer: ['A'], status: 'final' }
  };
  const { question: normReg } = normaliseQuestion(regularQ);

  const testSession = {
    question_ids: ['REG-001', 'MPPSC-2017-054', 'MPPSC-2018-015'],
    responses: {
      'REG-001': { selected: ['A'] },
      'MPPSC-2017-054': { selected: ['B'] },
      'MPPSC-2018-015': { selected: ['C'] }
    }
  };
  const qMap = new Map([
    ['REG-001', normReg],
    ['MPPSC-2017-054', norm2017],
    ['MPPSC-2018-015', norm2018]
  ]);

  const scored = scoreTest({
    test: testSession,
    questions: qMap,
    rules: { marks_per_correct: 3, negative_marks_per_incorrect: 1, negative_marking_enabled: true }
  });

  // Total questions = 3; cancelled = 2.
  // Scorable count = 3 - 2 = 1.
  // Max marks = 1 * 3 = 3 (NOT 3 * 3 = 9!).
  assert.equal(scored.counts.total, 3);
  assert.equal(scored.counts.cancelled, 2, 'Must explicitly count 2 cancelled questions');
  assert.equal(scored.counts.unscored, 2);
  assert.equal(scored.counts.correct, 1);
  assert.equal(scored.score, 3);
  assert.equal(scored.max_marks, 3, 'Max marks must be adjusted for cancelled questions: (3 - 2) * 3 = 3');
});

/* -------------------------------------------------------------------------- */
/* 5. Unresolved questions are NOT mistaken for cancelled questions          */
/* -------------------------------------------------------------------------- */
test('5. Unresolved questions (MPPSC-2012-047) are not classified as cancelled and do not reduce max marks', () => {
  const q2012_047 = prodMap.get('MPPSC-2012-047');
  assert.ok(q2012_047, 'MPPSC-2012-047 must exist');

  assert.equal(isCancelledQuestion(q2012_047), false, 'MPPSC-2012-047 must NOT be marked as cancelled');

  const { question: normQ } = normaliseQuestion(q2012_047);
  assert.equal(normQ.is_cancelled, false);

  const regularQ = {
    id: 'REG-002',
    question_type: 'single_correct',
    language_variants: { en: { question_text: 'Q2?', options: [{ key: 'A', text: 'OptA' }, { key: 'B', text: 'OptB' }] } },
    supplied_answer: { answer: ['A'], status: 'final' }
  };
  const { question: normReg } = normaliseQuestion(regularQ);

  const testSession = {
    question_ids: ['REG-002', 'MPPSC-2012-047'],
    responses: {
      'REG-002': { selected: ['A'] },
      'MPPSC-2012-047': { selected: ['B'] }
    }
  };
  const qMap = new Map([
    ['REG-002', normReg],
    ['MPPSC-2012-047', normQ]
  ]);

  const scored = scoreTest({
    test: testSession,
    questions: qMap,
    rules: { marks_per_correct: 3, negative_marks_per_incorrect: 1, negative_marking_enabled: true }
  });

  // MPPSC-2012-047 is unkeyed/unresolved, so it is unscored, BUT NOT cancelled.
  // Therefore max marks remains 2 * 3 = 6!
  assert.equal(scored.counts.total, 2);
  assert.equal(scored.counts.cancelled, 0, 'Cancelled count must be 0');
  assert.equal(scored.counts.unscored, 1, 'Unscored count is 1 due to missing key');
  assert.equal(scored.counts.correct, 1);
  assert.equal(scored.max_marks, 6, 'Max marks must remain 2 * 3 = 6 for ordinary unresolved questions');
});

/* -------------------------------------------------------------------------- */
/* 6. MPPSC-2018-019: Historical exam follows D; explanation clarifies Shakta B */
/* -------------------------------------------------------------------------- */
test('6. MPPSC-2018-019 respects official key D and Shakta explanation B', () => {
  const q = prodMap.get('MPPSC-2018-019');
  assert.ok(q);
  const { question } = normaliseQuestion(q);

  assert.deepEqual(question.supplied.answer, ['D'], 'Official key must be D');
  assert.deepEqual(question.verified.answer, ['B'], 'Verified answer must be B');

  // In supplied policy (Historical exam mode):
  const evalSuppliedD = evaluateResponse(question, { selected: ['D'] }, 'supplied');
  assert.equal(evalSuppliedD.outcome, OUTCOMES.CORRECT, 'Historical exam mode scores D as correct');

  const evalSuppliedB = evaluateResponse(question, { selected: ['B'] }, 'supplied');
  assert.equal(evalSuppliedB.outcome, OUTCOMES.INCORRECT, 'Historical exam mode scores B as incorrect');

  // Explanation check:
  assert.match(question.explanation.correct_reasoning, /Shaktism/i, 'Explanation must identify Shakta tradition');
  assert.match(question.explanation.correct_reasoning, /Jainism/i, 'Explanation must address MPPSC Jainism key');
});

/* -------------------------------------------------------------------------- */
/* 7. Unrelated questions retain their original data                          */
/* -------------------------------------------------------------------------- */
test('7. Unrelated 1,263 questions retain their exact original data', () => {
  assert.equal(prodBank.questions.length, 1300);
  assert.equal(backupBank.questions.length, 1300);

  let unchangedCount = 0;
  for (const origQ of backupBank.questions) {
    if (!researchIds.has(origQ.id)) {
      const curQ = prodMap.get(origQ.id);
      assert.ok(curQ, `Question ${origQ.id} must exist in production bank`);
      assert.deepEqual(curQ, origQ, `Question ${origQ.id} must be byte-for-byte identical to backup`);
      unchangedCount++;
    }
  }
  assert.equal(unchangedCount, 1300 - 37, 'Exactly 1,263 questions must be unchanged');
});

/* -------------------------------------------------------------------------- */
/* 8. Browser refresh / importer logic for updated records                    */
/* -------------------------------------------------------------------------- */
test('8. Importer refreshes records when refreshIdenticalIds contains them or content changed', async () => {
  const { mergeImportedQuestion } = await import('../js/services/importer.js');

  const priorRecord = {
    id: 'MPPSC-2012-050',
    fingerprint: 'fp-same',
    question_type: 'single_correct',
    supplied: { answer: null, status: 'missing' },
    verified: null,
    metadata: {}
  };

  const incomingRecord = {
    id: 'MPPSC-2012-050',
    fingerprint: 'fp-same',
    question_type: 'single_correct',
    supplied: { answer: ['B', 'D'], status: 'final' },
    verified: { answer: ['B', 'D'], status: 'verified' },
    metadata: { accepted_answers: ['B', 'D'] }
  };

  const merged = mergeImportedQuestion(priorRecord, incomingRecord, 'mppsc-prelims');
  assert.deepEqual(merged.supplied.answer, ['B', 'D'], 'Supplied key must be updated');
  assert.deepEqual(merged.verified.answer, ['B', 'D'], 'Verified key must be updated');
  assert.deepEqual(merged.metadata.accepted_answers, ['B', 'D'], 'Metadata must be updated');
});

