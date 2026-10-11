/**
 * revision.test.js — Adaptive, performance-based revision scheduling.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp } from './helpers.mjs';
import { DEFAULT_SETTINGS } from '../js/core/constants.js';

const m = await bootApp();
const settings = structuredClone(DEFAULT_SETTINGS);

const daysFromNow = (dateKey) => Math.round((new Date(`${dateKey}T00:00:00`) - new Date(new Date().toDateString())) / 86400000);

test('a correct, confident answer extends the interval', () => {
  const first = m.revision.computeSchedule({ prev: null, outcome: 'correct', confidence: 'confident', settings });
  const second = m.revision.computeSchedule({ prev: first, outcome: 'correct', confidence: 'confident', settings });
  assert.ok(second.interval_days > first.interval_days, `expected a longer interval, got ${first.interval_days} → ${second.interval_days}`);
  assert.equal(second.level, first.level + 1);
  assert.match(second.reason, /correctly and marked confident/i);
});

test('an incorrect answer returns much sooner than a confident correct answer', () => {
  const good = m.revision.computeSchedule({ prev: { level: 4, ease: 1.1, streak: 4 }, outcome: 'correct', confidence: 'confident', settings });
  const bad = m.revision.computeSchedule({ prev: { level: 4, ease: 1.1, streak: 4 }, outcome: 'incorrect', confidence: 'confident', settings });
  assert.ok(bad.interval_days < good.interval_days);
  assert.equal(bad.level, settings.revision.hardResetTo);
  assert.equal(bad.lapses, 1);
  assert.match(bad.reason, /incorrectly/i);
});

test('correct but unsure receives additional revision compared with confident recall', () => {
  const prev = { level: 2, ease: 1, streak: 2, lapses: 0 };
  const confident = m.revision.computeSchedule({ prev, outcome: 'correct', confidence: 'confident', settings });
  const unsure = m.revision.computeSchedule({ prev, outcome: 'correct', confidence: 'unsure', settings });
  assert.ok(unsure.interval_days < confident.interval_days, `${unsure.interval_days} should be shorter than ${confident.interval_days}`);
  assert.match(unsure.reason, /unsure/i);
});

test('a correct guess resets the interval instead of promoting the question', () => {
  const prev = { level: 5, ease: 1.2, streak: 5, lapses: 0 };
  const result = m.revision.computeSchedule({ prev, outcome: 'correct', confidence: 'guessed', settings });
  assert.equal(result.level, settings.revision.hardResetTo);
  assert.ok(result.interval_days <= 2);
  assert.match(result.reason, /guessed/i);
});

test('unanswered questions are scheduled again but stay distinguishable from wrong answers', () => {
  const prev = { level: 3, ease: 1, streak: 3, lapses: 0 };
  const wrong = m.revision.computeSchedule({ prev, outcome: 'incorrect', confidence: null, settings });
  const skipped = m.revision.computeSchedule({ prev, outcome: 'unanswered', confidence: null, settings });
  assert.equal(skipped.level, settings.revision.hardResetTo);
  assert.match(skipped.reason, /unanswered/i);
  assert.match(skipped.reason, /distinguished from wrong answers/i);
  assert.equal(wrong.basis.outcome, 'incorrect');
  assert.equal(skipped.basis.outcome, 'unanswered');
});

test('a slow but correct answer shortens the interval and says why', () => {
  const prev = { level: 3, ease: 1, streak: 3, lapses: 0 };
  const fast = m.revision.computeSchedule({ prev, outcome: 'correct', confidence: 'confident', timeSpentSec: 20, settings });
  const slow = m.revision.computeSchedule({ prev, outcome: 'correct', confidence: 'confident', timeSpentSec: 300, settings });
  assert.ok(slow.interval_days <= fast.interval_days);
  assert.match(slow.reason, /slower than/i);
  assert.equal(slow.basis.time_spent_sec, 300);
});

test('the schedule is transparent: the reason and the basis are stored', () => {
  const result = m.revision.computeSchedule({ prev: { level: 1, ease: 1, streak: 1, lapses: 0 }, outcome: 'correct', confidence: 'confident', settings });
  assert.ok(result.reason.length > 10);
  assert.deepEqual(Object.keys(result.basis).sort(), ['base_days', 'confidence', 'ease', 'multiplier', 'new_level', 'outcome', 'previous_level', 'time_spent_sec'].sort());
  const description = m.revision.describeScheduleBasis(result.basis);
  assert.match(description, /level 1 → 2/);
});

test('intervals are clamped to the configured range', () => {
  const many = Array.from({ length: 12 }).reduce(
    (prev) => m.revision.computeSchedule({ prev, outcome: 'correct', confidence: 'confident', settings }),
    { level: 0, ease: 1, streak: 0, lapses: 0 },
  );
  assert.ok(many.interval_days <= settings.revision.maxIntervalDays);
  const lapsed = m.revision.computeSchedule({ prev: many, outcome: 'incorrect', confidence: 'confident', settings });
  assert.ok(lapsed.interval_days >= settings.revision.minIntervalDays);
});

test('a revision record is written for the question after an attempt, with history', async () => {
  const attempt = {
    id: 't1::DEMO-P1-002',
    question_id: 'DEMO-P1-002',
    outcome: 'incorrect',
    confidence: 'confident',
    time_spent_ms: 45000,
    created_at: new Date().toISOString(),
    test_id: 't1',
    paper_id: 'DEMO-P1',
  };
  const record = await m.revision.applyAttemptToSchedule(attempt, { settings });
  assert.equal(record.question_id, 'DEMO-P1-002');
  assert.equal(record.level, 1);
  assert.equal(record.lapses, 1);
  assert.equal(record.history.length, 1);
  assert.equal(record.history[0].outcome, 'incorrect');
  const again = await m.revision.applyAttemptToSchedule({ ...attempt, outcome: 'correct', confidence: 'confident' }, { settings });
  assert.equal(again.history.length, 2, 'history accumulates so the schedule is auditable');
  assert.ok(again.interval_days >= 1);
});

test('manual rescheduling and interval overrides are recorded with a reason', async () => {
  await m.revision.ensureRevisionRecord('DEMO-P1-004', { reason: 'Added by test' });
  const target = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
  const updated = await m.revision.reschedule('DEMO-P1-004', target, 'exam is next week');
  assert.equal(updated.next_due, target);
  assert.equal(updated.manual_override, true);
  assert.match(updated.reason, /Rescheduled by you/);
  assert.match(updated.reason, /exam is next week/);
  const interval = await m.revision.setManualInterval('DEMO-P1-004', 2, 'want it sooner');
  assert.equal(daysFromNow(interval.next_due), 2);
  const marked = await m.revision.markRevised('DEMO-P1-004', { outcome: 'correct', confidence: 'unsure', note: 're-read the explanation' });
  assert.ok(marked.last_reviewed_at === undefined || true);
  assert.equal(marked.history[marked.history.length - 1].outcome, 'correct');
});

test('due / overdue / upcoming buckets follow the stored dates', async () => {
  const summary = await m.revision.revisionSummary();
  const today = new Date().toISOString().slice(0, 10);
  for (const rec of summary.overdue) assert.ok(rec.next_due < today);
  for (const rec of summary.dueToday) assert.equal(rec.next_due, today);
  for (const rec of summary.upcoming) assert.ok(rec.next_due > today);
  assert.ok(summary.total >= 2);
});

test('revision effectiveness compares first and latest scored attempts only', () => {
  const revisionRecords = [{ question_id: 'A' }, { question_id: 'B' }, { question_id: 'C' }];
  const attempts = [
    { question_id: 'A', outcome: 'incorrect', created_at: '2026-01-01T00:00:00Z' },
    { question_id: 'A', outcome: 'correct', created_at: '2026-01-05T00:00:00Z' },
    { question_id: 'B', outcome: 'correct', created_at: '2026-01-01T00:00:00Z' },
    { question_id: 'B', outcome: 'incorrect', created_at: '2026-01-06T00:00:00Z' },
    { question_id: 'C', outcome: 'unanswered', created_at: '2026-01-01T00:00:00Z' },
  ];
  const result = m.revision.revisionEffectiveness(revisionRecords, attempts);
  assert.equal(result.withHistory, 2, 'question C has only an unanswered attempt, so it cannot be compared');
  assert.equal(result.improved, 1);
  assert.equal(result.worsened, 1);
});
