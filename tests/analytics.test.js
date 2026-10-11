/**
 * analytics.test.js — Coverage, accuracy definitions, sample-size honesty and
 * question-frequency reporting.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, importDemoBank } from './helpers.mjs';

const m = await bootApp();
await importDemoBank();

const metas = () => Array.from(m.appState.questionIndex.values());

function attempt(overrides) {
  return {
    id: `${overrides.test_id}::${overrides.question_id}`,
    test_id: 'unit',
    test_kind: 'custom',
    question_id: 'DEMO-P1-001',
    paper_id: 'DEMO-P1',
    subject: 'Geography',
    topic: 'Rivers of Madhya Pradesh',
    outcome: 'correct',
    selected: ['A'],
    answer: ['A'],
    confidence: null,
    flagged: false,
    time_spent_ms: 30000,
    marks: 2,
    is_first_attempt: true,
    created_at: '2026-02-01T10:00:00.000Z',
    ...overrides,
  };
}

test('repeated attempts never inflate coverage or mastery', () => {
  const attempts = [
    attempt({ question_id: 'DEMO-P1-001', is_first_attempt: true }),
    attempt({ question_id: 'DEMO-P1-001', is_first_attempt: false, outcome: 'incorrect' }),
    attempt({ question_id: 'DEMO-P1-001', is_first_attempt: false, outcome: 'incorrect' }),
    attempt({ question_id: 'DEMO-P1-002', is_first_attempt: true, outcome: 'incorrect' }),
  ];
  const analytics = m.analytics.buildAnalytics({ metas: metas(), attempts, papers: m.appState.papers });
  assert.equal(analytics.counts.totalAttempts, 4);
  assert.equal(analytics.counts.attemptedUnique, 2, 'two distinct questions were attempted');
  assert.equal(analytics.counts.availableQuestions, 34, 'the imported bank has 34 questions');
  assert.ok(Math.abs(analytics.counts.coverage - 2 / 34) < 1e-9, 'coverage counts unique questions only');
  assert.equal(analytics.counts.correct, 1);
  assert.equal(analytics.counts.incorrect, 3);
  assert.ok(Math.abs(analytics.accuracy.all - 0.25) < 1e-9);
  assert.equal(analytics.accuracy.firstAttemptSample, 2);
  assert.ok(Math.abs(analytics.accuracy.firstAttempt - 0.5) < 1e-9, 'first-attempt accuracy is reported separately');
});

test('small samples are labelled as insufficient evidence instead of weak', () => {
  const attempts = [
    attempt({ question_id: 'DEMO-P1-003', outcome: 'incorrect', is_first_attempt: true }),
    attempt({ question_id: 'DEMO-P1-004', outcome: 'incorrect', is_first_attempt: true }),
  ];
  const analytics = m.analytics.buildAnalytics({ metas: metas(), attempts, papers: m.appState.papers });
  assert.equal(analytics.weakTopics.length, 0, 'two wrong answers must not label a topic as weak');
  const topicRow = analytics.byTopic.find((t) => t.topic === 'Wildlife of Madhya Pradesh');
  assert.equal(topicRow.verdict, 'insufficient evidence');
  assert.ok(analytics.insufficient.length >= 1);
  assert.match(analytics.insufficient[0].reason, /at least 3/);
});

test('a topic with enough evidence can be labelled weak, and the threshold is exposed', () => {
  const ids = ['DEMO-P1-003', 'DEMO-P1-004', 'DEMO-P1-012', 'DEMO-P1-014', 'DEMO-P2-004'];
  const attempts = ids.map((id, i) => attempt({ question_id: id, question_number: i, outcome: i === 4 ? 'correct' : 'incorrect', subject: 'Environment', topic: 'Wildlife of Madhya Pradesh', is_first_attempt: true }));
  const analytics = m.analytics.buildAnalytics({ metas: metas(), attempts, papers: m.appState.papers });
  const row = analytics.byTopic.find((t) => t.topic === 'Wildlife of Madhya Pradesh');
  assert.equal(row.scored, 5);
  assert.equal(row.verdict, 'weak');
  assert.ok(analytics.weakTopics.some((t) => t.topic === 'Wildlife of Madhya Pradesh'));
  assert.equal(analytics.thresholds.minSampleStrong, 5);
});

test('question frequency describes the imported bank only and refuses to predict', () => {
  const analytics = m.analytics.buildAnalytics({ metas: metas(), attempts: [], papers: m.appState.papers });
  assert.equal(analytics.frequency.total, 34);
  const top = analytics.frequency.byTopic[0];
  assert.ok(top.count >= 1);
  assert.ok(top.share > 0 && top.share <= 1);
  assert.ok(analytics.frequency.byYear.length >= 3, 'distribution by year is derived from real records');
  assert.match(analytics.frequency.disclaimer, /does not predict/i);
  assert.ok(analytics.frequency.byTopic.every((row) => row.byYear && typeof row.byYear === 'object'));
});

test('unattempted topics are reported as zero-coverage rather than "strong"', () => {
  const analytics = m.analytics.buildAnalytics({ metas: metas(), attempts: [], papers: m.appState.papers });
  assert.ok(analytics.neverAttemptedTopics.length > 0);
  assert.equal(analytics.weakTopics.length, 0, 'no attempts means no weak/strong labels at all');
  assert.equal(analytics.strongTopics.length, 0);
  const row = analytics.byTopic[0];
  assert.equal(row.attempts, 0);
  assert.equal(row.coverage, 0);
  assert.ok(Number.isNaN(row.accuracy));
});

test('time statistics use only recorded attempt times', () => {
  const attempts = [
    attempt({ question_id: 'DEMO-P1-001', time_spent_ms: 60000 }),
    attempt({ question_id: 'DEMO-P1-002', time_spent_ms: 120000, outcome: 'incorrect' }),
    attempt({ question_id: 'DEMO-P1-003', time_spent_ms: 0 }),
  ];
  const analytics = m.analytics.buildAnalytics({ metas: metas(), attempts, papers: m.appState.papers });
  assert.equal(analytics.time.avgSecPerQuestion, 90);
  assert.equal(analytics.time.slowest.length, 2, 'attempts with no recorded time are not invented');
  assert.equal(analytics.time.slowest[0].question_id, 'DEMO-P1-002');
});

test('study priorities explain their basis and never promise an exam topic', () => {
  const attempts = ['DEMO-P1-001', 'DEMO-P1-011', 'DEMO-P1-016', 'DEMO-P1-017', 'DEMO-P1-018', 'DEMO-P2-001'].map((id) => attempt({ question_id: id, outcome: 'incorrect', is_first_attempt: true }));
  const analytics = m.analytics.buildAnalytics({ metas: metas(), attempts, papers: m.appState.papers });
  const priorities = m.analytics.studyPriorities({ analytics, limit: 40 });
  assert.ok(priorities.length > 0);
  assert.ok(priorities[0].reasons.length > 0, 'every priority carries its reasoning');
  assert.match(priorities[0].caveat, /not a forecast/i);
  const withPerformance = priorities.find((p) => p.scored >= 5);
  assert.ok(withPerformance, 'the practised topic appears in the priority list');
  assert.ok(withPerformance.reasons.some((r) => /accuracy 0% over 6 scored answers/.test(r)), `expected a performance-based reason, got: ${withPerformance.reasons.join(' / ')}`);
  assert.ok(withPerformance.priorityScore > 0);
});

test('the dashboard summary reports only real recorded activity', () => {
  const analytics = m.analytics.buildAnalytics({ metas: metas(), attempts: [attempt({ question_id: 'DEMO-P1-001' })], papers: m.appState.papers });
  const summary = m.analytics.dashboardSummary({ analytics, tests: [], tasks: [], revision: analytics.revision, settings: m.appState.settings });
  assert.equal(summary.activityByDay.length, 7);
  assert.equal(summary.recentTests.length, 0, 'no submitted tests means no recent-test figures');
  assert.ok(summary.activityByDay.every((d) => Number.isFinite(d.attempts)));
  assert.equal(summary.openTasks.length, 0);
});
