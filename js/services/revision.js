/**
 * revision.js — Performance-based, adaptive revision scheduling.
 *
 * The schedule is driven by what actually happened in the previous attempt:
 * correctness, confidence (when tracking is on), speed, repeated mistakes and
 * time since the last revision. Every scheduled date stores the reason it was
 * chosen, and the UI states plainly that a schedule is a study aid, not a
 * guarantee of retention.
 */

import { STORES } from '../core/constants.js';
import * as db from '../core/db.js';
import { state } from '../core/state.js';
import { addDays, clamp, round, todayKey, daysBetween, startOfDay, logEvent } from '../core/util.js';

export const REVISION_STATES = { NEW: 'new', LEARNING: 'learning', REVIEW: 'review', MASTERED: 'mastered' };

/**
 * How many due questions one revision session takes at most. The queue itself
 * can hold every question in the bank (one small record per attempted
 * question, history capped below); the cap is on a single sitting, so a
 * large backlog is worked through in sittings rather than one endless test.
 */
export const REVISION_SESSION_CAP = 40;

/** Rows the Revision Centre renders at once (the rest load on demand). */
export const REVISION_PAGE_SIZE = 50;

/** Per-question schedule history kept on a record; older entries drop off. */
export const REVISION_HISTORY_CAP = 50;

function levelTable(settings) {
  const intervals = settings?.revision?.intervals || { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30, 6: 60 };
  const levels = Object.keys(intervals).map(Number).sort((a, b) => a - b);
  return { intervals, levels, maxLevel: levels[levels.length - 1], minLevel: levels[0] };
}

function stateForLevel(level) {
  if (level <= 1) return REVISION_STATES.LEARNING;
  if (level <= 3) return REVISION_STATES.REVIEW;
  return REVISION_STATES.MASTERED;
}

/**
 * Core scheduling function — pure and deterministic for a given input.
 * @param {object} args
 * @param {object|null} args.prev previous revision record
 * @param {'correct'|'incorrect'|'unanswered'|'unscored'} args.outcome
 * @param {'confident'|'unsure'|'guessed'|null} [args.confidence]
 * @param {number|null} [args.timeSpentSec]
 * @param {Date} [args.now]
 * @param {object} args.settings
 */
export function computeSchedule({ prev = null, outcome, confidence = null, timeSpentSec = null, now = new Date(), settings = state.settings }) {
  const cfg = settings?.revision || {};
  const { intervals, maxLevel } = levelTable(settings);
  const prevLevel = Number(prev?.level) || 0;
  const prevEase = Number(prev?.ease) || 1;
  const prevStreak = Number(prev?.streak) || 0;
  const prevLapses = Number(prev?.lapses) || 0;

  let level = prevLevel || 1;
  let ease = prevEase;
  let streak = prevStreak;
  let lapses = prevLapses;
  const reasons = [];
  let multiplier = 1;

  if (outcome === 'correct') {
    if (confidence === 'guessed') {
      level = Math.max(1, cfg.hardResetTo || 1);
      ease = clamp(round(ease * 0.9, 3), 0.5, 1.6);
      streak = Math.max(0, prevStreak - 1);
      reasons.push('Answered correctly but marked as guessed');
      reasons.push(`reset to the shortest interval (level ${level})`);
      multiplier = cfg.guessMultiplier ?? 0.5;
    } else if (confidence === 'unsure') {
      level = clamp(Math.max(1, prevLevel || 1), 1, maxLevel);
      multiplier = cfg.uncertainMultiplier ?? 0.6;
      streak = Math.max(1, prevStreak);
      reasons.push('Answered correctly but marked unsure');
      reasons.push(`interval kept at level ${level} and shortened by ${Math.round((1 - multiplier) * 100)}% so it returns sooner`);
    } else {
      streak = prevStreak + 1;
      level = clamp((prevLevel || 0) + 1, 1, maxLevel);
      ease = clamp(round(ease * (confidence === 'confident' ? 1.05 : 1.0), 3), 0.5, 1.6);
      reasons.push(confidence === 'confident' ? 'Answered correctly and marked confident' : 'Answered correctly');
      reasons.push(`interval extended to level ${level} of ${maxLevel}`);
    }
    if (Number.isFinite(timeSpentSec) && timeSpentSec > (cfg.slowAnswerSeconds ?? 120)) {
      multiplier *= 0.75;
      reasons.push(`answer took ${Math.round(timeSpentSec)}s (slower than ${cfg.slowAnswerSeconds}s), so the interval was shortened by 25%`);
    }
  } else if (outcome === 'incorrect' || (outcome === 'unanswered' && cfg.unansweredIsMiss !== false)) {
    lapses = prevLapses + 1;
    streak = 0;
    level = clamp(cfg.hardResetTo || 1, 1, maxLevel);
    ease = clamp(round(ease * 0.85, 3), 0.5, 1.6);
    reasons.push(outcome === 'unanswered' ? 'Left unanswered' : 'Answered incorrectly');
    reasons.push(`scheduled again soon (level ${level})${outcome === 'unanswered' ? '; unanswered questions stay distinguished from wrong answers' : ''}`);
  } else if (outcome === 'unanswered') {
    // The user turned "treat unanswered as a miss" off: hold the position
    // instead of resetting, exactly like an unscored attempt.
    level = Math.max(1, prevLevel || 1);
    reasons.push('Left unanswered');
    reasons.push(`interval kept at level ${level} (unanswered questions are not treated as misses in your settings)`);
  } else {
    // unscored (no usable answer key) — hold position, nothing to learn from
    level = Math.max(1, prevLevel || 1);
    reasons.push('Attempt could not be scored (no usable answer key)');
    reasons.push(`interval kept at level ${level}`);
  }

  const baseDays = intervals[level] ?? intervals[maxLevel] ?? 1;
  let days = Math.round(baseDays * ease * multiplier);
  days = clamp(days, cfg.minIntervalDays ?? 1, cfg.maxIntervalDays ?? 180);

  const basis = {
    outcome,
    confidence: confidence || null,
    previous_level: prevLevel,
    new_level: level,
    base_days: baseDays,
    ease: round(ease, 3),
    multiplier: round(multiplier, 3),
    time_spent_sec: Number.isFinite(timeSpentSec) ? Math.round(timeSpentSec) : null,
  };

  const due = addDays(startOfDay(now), days);
  return {
    level,
    ease: round(ease, 3),
    streak,
    lapses,
    interval_days: days,
    next_due: todayKey(due),
    state: stateForLevel(level),
    reason: reasons.join('; ') + '.',
    basis,
    computed_at: new Date(now).toISOString(),
  };
}

/** Create or update the revision record for a question from an attempt. */
export async function applyAttemptToSchedule(attempt, { settings = state.settings, questionMeta = null } = {}) {
  const existing = await db.get(STORES.REVISION, attempt.question_id);
  const schedule = computeSchedule({
    prev: existing || null,
    outcome: attempt.outcome,
    confidence: attempt.confidence || null,
    timeSpentSec: attempt.time_spent_ms ? attempt.time_spent_ms / 1000 : null,
    settings,
  });
  const meta = questionMeta || state.questionIndex.get(attempt.question_id) || {};
  const historyEntry = {
    at: attempt.created_at,
    outcome: attempt.outcome,
    confidence: attempt.confidence || null,
    interval_days: schedule.interval_days,
    next_due: schedule.next_due,
    reason: schedule.reason,
    test_id: attempt.test_id,
  };
  const record = {
    question_id: attempt.question_id,
    subject: meta.subject || null,
    topic: meta.topic || null,
    subtopic: meta.subtopic || null,
    paper_id: meta.paper_id || attempt.paper_id || null,
    state: schedule.state,
    level: schedule.level,
    ease: schedule.ease,
    streak: schedule.streak,
    lapses: schedule.lapses,
    interval_days: schedule.interval_days,
    next_due: schedule.next_due,
    reason: schedule.reason,
    basis: schedule.basis,
    last_result: {
      outcome: attempt.outcome,
      confidence: attempt.confidence || null,
      time_spent_ms: attempt.time_spent_ms || 0,
      at: attempt.created_at,
      test_id: attempt.test_id,
    },
    history: [...(existing?.history || []).slice(-(REVISION_HISTORY_CAP - 1)), historyEntry],
    manual_override: false,
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    added_by: existing?.added_by || 'attempt',
  };
  await db.put(STORES.REVISION, record);
  logEvent('revision', `Scheduled ${attempt.question_id} for ${record.next_due} (level ${record.level})`);
  return record;
}

/** Add a question to the revision queue without an attempt (manual "revise this"). */
export async function ensureRevisionRecord(questionId, { reason = 'Added manually to the revision queue.', dueDays = 1 } = {}) {
  const existing = await db.get(STORES.REVISION, questionId);
  if (existing) return existing;
  const meta = state.questionIndex.get(questionId) || {};
  const record = {
    question_id: questionId,
    subject: meta.subject || null,
    topic: meta.topic || null,
    subtopic: meta.subtopic || null,
    paper_id: meta.paper_id || null,
    state: REVISION_STATES.NEW,
    level: 1,
    ease: 1,
    streak: 0,
    lapses: 0,
    interval_days: dueDays,
    next_due: todayKey(addDays(new Date(), dueDays)),
    reason,
    basis: { outcome: null, added_manually: true },
    last_result: null,
    history: [],
    manual_override: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    added_by: 'manual',
  };
  await db.put(STORES.REVISION, record);
  return record;
}

/** Manual reschedule with an explicit date and note (auditable). */
export async function reschedule(questionId, dateKey, note = '') {
  const existing = await db.get(STORES.REVISION, questionId);
  if (!existing) return null;
  const days = Math.max(0, daysBetween(new Date(), new Date(`${dateKey}T00:00:00`)));
  const updated = {
    ...existing,
    next_due: dateKey,
    interval_days: days,
    reason: `Rescheduled by you to ${dateKey}${note ? ` — ${note}` : ''}.`,
    manual_override: true,
    last_override: { at: new Date().toISOString(), days, note },
    history: [...(existing.history || []).slice(-(REVISION_HISTORY_CAP - 1)), { at: new Date().toISOString(), outcome: 'manual_reschedule', interval_days: days, next_due: dateKey, reason: note || 'manual reschedule' }],
    updated_at: new Date().toISOString(),
  };
  await db.put(STORES.REVISION, updated);
  return updated;
}

/** Override the interval in days ("revise this again in N days"). */
export async function setManualInterval(questionId, days, note = '') {
  const dateKey = todayKey(addDays(new Date(), days));
  return reschedule(questionId, dateKey, note || `manual interval of ${days} day(s)`);
}

/** Mark a question as revised without a full test (e.g. you read the explanation). */
export async function markRevised(questionId, { outcome = 'correct', confidence = null, note = null, settings = state.settings } = {}) {
  const attempt = {
    question_id: questionId,
    outcome,
    confidence,
    time_spent_ms: 0,
    created_at: new Date().toISOString(),
    test_id: null,
    source: 'revision_queue',
  };
  const record = await applyAttemptToSchedule(attempt, { settings });
  if (note) {
    record.history[record.history.length - 1].reason += ` (${note})`;
    await db.put(STORES.REVISION, record);
  }
  return record;
}

export async function removeFromQueue(questionId) {
  return db.remove(STORES.REVISION, questionId);
}

export async function allRevisionRecords() {
  return db.getAll(STORES.REVISION);
}

/** Due / overdue / upcoming buckets. */
export function bucketise(records, reference = new Date()) {
  const today = todayKey(reference);
  const dueToday = [];
  const overdue = [];
  const upcoming = [];
  for (const rec of records) {
    if (!rec.next_due) continue;
    if (rec.next_due < today) overdue.push(rec);
    else if (rec.next_due === today) dueToday.push(rec);
    else upcoming.push(rec);
  }
  overdue.sort((a, b) => (a.next_due < b.next_due ? -1 : 1));
  upcoming.sort((a, b) => (a.next_due < b.next_due ? -1 : 1));
  return { dueToday, overdue, upcoming };
}

export async function revisionSummary(reference = new Date()) {
  const records = await allRevisionRecords();
  const { dueToday, overdue, upcoming } = bucketise(records, reference);
  const byState = {};
  for (const r of records) byState[r.state] = (byState[r.state] || 0) + 1;
  return { total: records.length, dueToday, overdue, upcoming, byState, records };
}

/**
 * The due queue in sitting order (most overdue first), capped for one
 * session. Returns the ids to practise plus how many were left for later,
 * so the UI can say honestly that a backlog continues next time.
 */
export function dueQueue(records, { cap = REVISION_SESSION_CAP, reference = new Date() } = {}) {
  const { overdue, dueToday } = bucketise(records, reference);
  const due = [...overdue, ...dueToday];
  return { ids: due.slice(0, cap).map((r) => r.question_id), total: due.length, remaining: Math.max(0, due.length - cap) };
}

/** Revision effectiveness: has accuracy on revised questions improved? */
export function revisionEffectiveness(revisionRecords, attempts) {
  const byQuestion = new Map();
  for (const a of attempts) {
    if (!byQuestion.has(a.question_id)) byQuestion.set(a.question_id, []);
    byQuestion.get(a.question_id).push(a);
  }
  let improved = 0;
  let worsened = 0;
  let unchanged = 0;
  let withHistory = 0;
  const rows = [];
  for (const rec of revisionRecords) {
    const list = (byQuestion.get(rec.question_id) || []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const scored = list.filter((a) => a.outcome === 'correct' || a.outcome === 'incorrect');
    if (scored.length < 2) continue;
    withHistory += 1;
    const first = scored[0].outcome === 'correct';
    const last = scored[scored.length - 1].outcome === 'correct';
    if (!first && last) improved += 1;
    else if (first && !last) worsened += 1;
    else unchanged += 1; // correct on both ends, or still incorrect: no clear change
    rows.push({ question_id: rec.question_id, attempts: scored.length, first: scored[0].outcome, last: scored[scored.length - 1].outcome, subject: rec.subject, topic: rec.topic });
  }
  return { withHistory, improved, worsened, unchanged: withHistory - improved - worsened, rows };
}

export function describeScheduleBasis(basis) {
  if (!basis) return 'No basis recorded.';
  if (basis.added_manually) return 'Added to the queue manually.';
  const parts = [`outcome: ${basis.outcome}`];
  if (basis.confidence) parts.push(`confidence: ${basis.confidence}`);
  parts.push(`level ${basis.previous_level} → ${basis.new_level}`);
  parts.push(`base ${basis.base_days} day(s)`);
  if (basis.ease !== 1) parts.push(`ease ${basis.ease}`);
  if (basis.multiplier !== 1) parts.push(`×${basis.multiplier}`);
  if (basis.time_spent_sec !== null && basis.time_spent_sec !== undefined) parts.push(`${basis.time_spent_sec}s`);
  return parts.join(' · ');
}
