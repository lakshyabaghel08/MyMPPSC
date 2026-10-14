/**
 * smart.test.js — Smart practice assembly, repeat management and topic practice
 * availability counting.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, importDemoBank } from './helpers.mjs';

const m = await bootApp();
await importDemoBank();

const metas = () => Array.from(m.appState.questionIndex.values());

function attempt(questionId, overrides = {}) {
  return {
    id: `t::${questionId}`,
    test_id: 't',
    question_id: questionId,
    outcome: 'incorrect',
    is_first_attempt: true,
    created_at: '2026-01-01T00:00:00.000Z',
    time_spent_ms: 10000,
    subject: 'Geography',
    topic: 'Rivers of Madhya Pradesh',
    ...overrides,
  };
}

test('smart practice explains why it was assembled and states that frequency is not a prediction', () => {
  const summary = m.select.buildAttemptSummary([attempt('DEMO-P1-001'), attempt('DEMO-P1-011')]);
  const plan = m.select.smartPracticePlan({ metas: metas(), attemptSummary: summary, revisionRecords: [], count: 10, seed: 42 });
  assert.equal(plan.questionIds.length, 10);
  assert.ok(plan.explain.length >= 2);
  assert.ok(plan.explain.some((line) => /not a prediction/i.test(line)), 'the plan must not imply exam prediction');
  assert.ok(plan.explain.some((line) => /cooldown/i.test(line)), 'the repeat policy is stated');
  assert.ok(Object.values(plan.allocation).some((n) => n > 0));
});

test('due revisions and repeated mistakes are deliberately included', () => {
  const summary = m.select.buildAttemptSummary([
    attempt('DEMO-P1-001', { outcome: 'incorrect', is_first_attempt: true }),
    attempt('DEMO-P1-001', { outcome: 'incorrect', is_first_attempt: false, created_at: '2026-01-08T00:00:00.000Z' }),
  ]);
  const revisionRecords = [{ question_id: 'DEMO-P3-005', next_due: '2020-01-01', state: 'learning' }];
  const plan = m.select.smartPracticePlan({ metas: metas(), attemptSummary: summary, revisionRecords, count: 12, seed: 7 });
  assert.ok(plan.questionIds.includes('DEMO-P1-001'), 'a twice-missed question must be included');
  assert.ok(plan.questionIds.includes('DEMO-P3-005'), 'an overdue revision must be included');
  assert.ok(plan.allocation.revision_due >= 1);
  assert.ok(plan.allocation.repeated_mistakes >= 1);
});

test('when nothing has been attempted, the plan widens coverage instead of repeating a small set', () => {
  const plan = m.select.smartPracticePlan({ metas: metas(), attemptSummary: new Map(), revisionRecords: [], count: 15, seed: 3 });
  assert.equal(plan.questionIds.length, 15);
  assert.equal(new Set(plan.questionIds).size, 15, 'no question is served twice inside one session');
  assert.ok(plan.allocation.unseen >= 12, 'with no history almost everything comes from the unseen pool');
});

test('repeat policy prefers unseen questions but can be overridden by the user', () => {
  const summary = m.select.buildAttemptSummary(
    Array.from({ length: 12 }, (_, i) => attempt(`DEMO-P1-0${String(i + 1).padStart(2, '0')}`, { created_at: '2026-09-01T00:00:00.000Z' })),
  );
  const candidates = metas();
  const preferUnseen = m.select.selectQuestions(candidates, { count: 10, attemptSummary: summary, seed: 11, repeatPolicy: { preferUnseen: true, unseenRatio: 0.8, cooldownDays: 3 } });
  const recentIds = new Set(summary.keys());
  const unseenChosen = preferUnseen.selected.filter((q) => !recentIds.has(q.id)).length;
  assert.ok(unseenChosen >= 8, `expected mostly unseen questions, got ${unseenChosen} of 10`);

  const allowRepeats = m.select.selectQuestions(candidates.filter((c) => recentIds.has(c.id)), { count: 10, attemptSummary: summary, seed: 11, repeatPolicy: { preferUnseen: false, unseenRatio: 0.8, cooldownDays: 3 } });
  assert.equal(allowRepeats.selected.length, 10, 'the user can override repeat rules and practise seen questions again');
});

test('recently attempted questions are cooled down before being served again', () => {
  const recent = 'DEMO-P1-001';
  const summary = m.select.buildAttemptSummary([attempt(recent, { created_at: new Date().toISOString() })]);
  const pick = m.select.selectQuestions(metas(), { count: 5, attemptSummary: summary, seed: 5, repeatPolicy: { preferUnseen: true, unseenRatio: 1, cooldownDays: 3 } });
  assert.ok(!pick.selected.some((q) => q.id === recent), 'a question answered today is not immediately repeated');
  const notes = pick.notes.join(' ');
  assert.match(notes, /unseen/);
});

test('topic availability counts are shown before a session starts', () => {
  const summary = m.select.buildAttemptSummary([attempt('DEMO-P1-001'), attempt('DEMO-P1-002', { outcome: 'unanswered' })]);
  const availability = m.select.availability(metas(), { subject: 'Geography' }, summary);
  assert.ok(availability.total > 0);
  assert.ok(availability.unseen <= availability.total);
  assert.ok(availability.incorrect >= 1);
  assert.ok(availability.skipped >= 1);
  assert.ok(Object.keys(availability.byTopic).length > 0);
  const rivers = m.select.filterMetas(metas(), { subject: 'Geography', topic: 'Rivers of Madhya Pradesh' }, summary);
  assert.ok(rivers.length >= 6);
  const unseenOnly = m.select.filterMetas(metas(), { attemptState: 'unseen' }, summary);
  assert.ok(unseenOnly.every((q) => q.id !== 'DEMO-P1-001' && q.id !== 'DEMO-P1-002'));
});

test('unclassified questions stay visible and filterable', () => {
  const unclassified = m.select.filterMetas(metas(), { subjectIsUnclassified: true }, new Map());
  assert.ok(Array.isArray(unclassified));
  const all = m.select.filterMetas(metas(), {}, new Map());
  assert.equal(all.length, 34, 'every imported question remains selectable');
});

test('paper order and summary describe the source faithfully', () => {
  const p1 = m.appState.papers.get('DEMO-P1');
  const summary = m.select.paperSummary(p1, metas());
  assert.equal(summary.present, 18);
  assert.equal(summary.declared, 18);
  assert.equal('complete' in summary, false, 'papers carry no completeness tag');
  assert.equal('missingCount' in summary, false, 'and no missing-question count');
  assert.equal(summary.disputed, 0);
  assert.equal(summary.bilingual, 12);

  const p3 = m.appState.papers.get('DEMO-P3');
  const partial = m.select.paperSummary(p3, metas());
  assert.equal(partial.present, 6, 'six questions of the paper were imported');
  assert.equal(partial.declared, 15, 'the paper metadata still states the printed count, untagged');
  assert.equal('complete' in partial, false);

  const order = m.select.paperOrder(p1, metas());
  assert.deepEqual(order.ordered.map((q) => q.id), p1.question_order);
  assert.equal(order.reconstructed, false, 'original paper order is preserved');
});

test('near-duplicate detection finds the deliberate paraphrase and not unrelated questions', () => {
  const pairs = m.select.findNearDuplicates(metas(), 0.62);
  const found = pairs.find((p) => [p.a, p.b].includes('DEMO-P1-001') && [p.a, p.b].includes('DEMO-P3-004'));
  assert.ok(found, 'the rewording of the Narmada lifeline question must be flagged');
  assert.ok(found.similarity >= 0.62 && found.similarity <= 1);
  assert.equal(pairs.some((p) => p.a === 'DEMO-P1-001' && p.b === 'DEMO-P2-009'), false, 'unrelated questions are not flagged');
});

test('exact duplicates are grouped by fingerprint', () => {
  const fake = [
    { id: 'X1', fingerprint: 'same', text_key: 'a' },
    { id: 'X2', fingerprint: 'same', text_key: 'a' },
    { id: 'X3', fingerprint: 'other', text_key: 'b' },
  ];
  const groups = m.select.findExactDuplicateGroups(fake);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].ids.sort(), ['X1', 'X2']);
});

test('weakness scoring reflects recorded performance and never invents data', () => {
  const summary = m.select.buildAttemptSummary([attempt('DEMO-P1-001'), attempt('DEMO-P1-001', { outcome: 'incorrect', is_first_attempt: false })]);
  const weak = m.select.weaknessScore(m.appState.questionIndex.get('DEMO-P1-001'), summary);
  const unseen = m.select.weaknessScore(m.appState.questionIndex.get('DEMO-P1-004'), summary);
  assert.ok(weak > unseen, 'a twice-missed question ranks as weaker than an unseen one');
  const strong = m.select.weaknessScore(
    m.appState.questionIndex.get('DEMO-P1-002'),
    m.select.buildAttemptSummary([attempt('DEMO-P1-002', { outcome: 'correct' }), attempt('DEMO-P1-002', { outcome: 'correct', is_first_attempt: false })]),
  );
  assert.ok(weak > strong, 'correct answers reduce the weakness score');
});
