/**
 * attempts.js — Attempt recording, mistake book and attempt history.
 *
 * One attempt row is written per question per submitted test. Mistake records
 * are derived bookkeeping on top of attempts; resolving a mistake never deletes
 * the underlying attempts, so the history stays intact.
 */

import { STORES, MISTAKE_TYPES } from '../core/constants.js';

/** Mistake record types. MISTAKE_TYPES holds the human-readable labels. */
const MISTAKE = { INCORRECT: 'incorrect', SKIPPED: 'skipped', FLAGGED: 'flagged', LOW_CONFIDENCE: 'low_confidence_correct' };
import * as db from '../core/db.js';
import { state, emit } from '../core/state.js';
import { nowIso, logEvent } from '../core/util.js';
import { applyAttemptToSchedule } from './revision.js';

export function attemptId(testId, questionId) {
  return `${testId}::${questionId}`;
}

export function mistakeKey(questionId, type) {
  return `${questionId}::${type}`;
}

/**
 * Persist attempts for a submitted test and update derived records.
 * @returns {{attempts: Array, mistakesOpened: number, mistakesResolved: number}}
 */
export async function recordAttempts({ test, result, questions }) {
  const attempts = [];
  const createdAt = result.computed_at || nowIso();
  const firstAttemptCounts = await firstAttemptFlags(result.per_question.map((r) => r.question_id));

  for (const row of result.per_question) {
    const question = questions.get(row.question_id);
    const attempt = {
      id: attemptId(test.id, row.question_id),
      test_id: test.id,
      test_kind: test.kind,
      question_id: row.question_id,
      paper_id: row.paper_id || question?.paper_id || null,
      year: question?.year ?? null,
      subject: row.subject || null,
      topic: row.topic || null,
      subtopic: row.subtopic || null,
      outcome: row.outcome,
      selected: row.selected || [],
      answer: row.answer || null,
      answer_basis: row.answer_basis || null,
      supplied_answer: row.supplied_answer || null,
      verified_answer: row.verified_answer || null,
      disputed: Boolean(row.disputed),
      key_status: question?.supplied?.status || 'unknown',
      scoring_basis: row.answer_basis || 'unknown',
      confidence: row.confidence || null,
      flagged: Boolean(row.flagged),
      time_spent_ms: row.time_spent_ms || 0,
      marks: row.marks || 0,
      mode: test.config?.feedback_mode || null,
      language: test.language || 'en',
      is_first_attempt: firstAttemptCounts.get(row.question_id) ?? true,
      created_at: createdAt,
      source: test.kind,
    };
    attempts.push(attempt);
  }

  await db.putMany(STORES.ATTEMPTS, attempts);

  const mistakeOutcome = await updateMistakes({ test, result, questions, createdAt });
  const scheduleUpdates = [];
  for (const attempt of attempts) {
    try {
      scheduleUpdates.push(await applyAttemptToSchedule(attempt));
    } catch (err) {
      console.error('Revision scheduling failed for', attempt.question_id, err);
    }
  }

  state.counts.attempts += attempts.length;
  emit('attempts:changed', { testId: test.id, count: attempts.length });
  logEvent('attempts', `Recorded ${attempts.length} attempt(s) for test ${test.id}`);

  return { attempts, scheduleUpdates, ...mistakeOutcome };
}

async function firstAttemptFlags(questionIds) {
  const flags = new Map();
  for (const questionId of questionIds) {
    const existing = await db.countByIndex(STORES.ATTEMPTS, 'question_id', questionId);
    flags.set(questionId, existing === 0);
  }
  return flags;
}

/** Derive mistake book entries from a scored result. */
export async function updateMistakes({ test, result, questions, createdAt = nowIso() }) {
  let opened = 0;
  let resolved = 0;
  const confidenceEnabled = Boolean(test.config?.confidence && test.config.confidence !== 'off');

  for (const row of result.per_question) {
    const questionId = row.question_id;
    const meta = state.questionIndex.get(questionId) || {};
    const question = questions?.get(questionId);
    const attempted = row.selected && row.selected.length > 0;

    const openFor = async (type, detail = {}) => {
      const key = mistakeKey(questionId, type);
      const existing = await db.get(STORES.MISTAKES, key);
      const record = existing || {
        key,
        question_id: questionId,
        type,
        subject: row.subject || meta.subject || null,
        topic: row.topic || meta.topic || null,
        subtopic: row.subtopic || meta.subtopic || null,
        paper_id: row.paper_id || meta.paper_id || null,
        first_seen_at: createdAt,
        occurrences: 0,
        attempts: [],
        test_ids: [],
        status: 'open',
        history: [],
        created_at: createdAt,
      };
      const wasResolved = record.status === 'resolved';
      record.occurrences += 1;
      record.last_seen_at = createdAt;
      record.status = 'open';
      record.latest_test_id = test.id;
      record.subject = record.subject || row.subject || meta.subject || null;
      record.topic = record.topic || row.topic || meta.topic || null;
      record.detail = { ...(record.detail || {}), ...detail };
      record.repeated = record.occurrences >= 2;
      record.attempts = [
        ...(record.attempts || []).slice(-9),
        { test_id: test.id, at: createdAt, outcome: row.outcome, selected: row.selected || [], confidence: row.confidence || null, time_spent_ms: row.time_spent_ms || 0 },
      ];
      record.test_ids = Array.from(new Set([...(record.test_ids || []), test.id])).slice(-20);
      record.history = [...(record.history || []).slice(-29), { at: createdAt, action: wasResolved ? 'reopened' : existing ? 'repeated' : 'created', test_id: test.id, outcome: row.outcome }];
      if (wasResolved || !existing) opened += 1;
      record.updated_at = nowIso();
      await db.put(STORES.MISTAKES, record);
      return record;
    };

    const resolveType = async (type, note) => {
      const key = mistakeKey(questionId, type);
      const existing = await db.get(STORES.MISTAKES, key);
      if (!existing || existing.status === 'resolved') return null;
      const updated = {
        ...existing,
        status: 'resolved',
        resolved_at: createdAt,
        resolution_note: note,
        history: [...(existing.history || []).slice(-29), { at: createdAt, action: 'auto_resolved', note, test_id: test.id }],
        updated_at: nowIso(),
      };
      await db.put(STORES.MISTAKES, updated);
      resolved += 1;
      return updated;
    };

    if (row.outcome === 'incorrect') {
      await openFor(MISTAKE.INCORRECT, { selected: row.selected, answer: row.answer });
    } else if (!attempted) {
      await openFor(MISTAKE.SKIPPED, { note: 'Question was left unanswered.' });
    } else if (row.outcome === 'correct') {
      // A correct answer for confidence-tracked questions can still be weak recall.
      if (confidenceEnabled && (row.confidence === 'unsure' || row.confidence === 'guessed')) {
        await openFor(MISTAKE.LOW_CONFIDENCE, { confidence: row.confidence });
      } else {
        await resolveType(MISTAKE.INCORRECT, 'Answered correctly on a later attempt.');
        await resolveType(MISTAKE.SKIPPED, 'Attempted and answered correctly later.');
        if (confidenceEnabled) await resolveType(MISTAKE.LOW_CONFIDENCE, 'Answered correctly with confident recall.');
      }
    }

    if (row.flagged) {
      await openFor(MISTAKE.FLAGGED, { note: 'Marked for review during the test.' });
    } else {
      await resolveType(MISTAKE.FLAGGED, 'Flag cleared.');
    }

  }

  emit('mistakes:changed', { opened, resolved });
  return { mistakesOpened: opened, mistakesResolved: resolved };
}

export async function listMistakes({ status = 'open', type = null, subject = null, topic = null, year = null, paperId = null } = {}) {
  let rows = await db.getAll(STORES.MISTAKES);
  rows = rows.filter((m) => (status === 'all' ? true : m.status === status));
  if (type && type !== 'all') {
    if (type === 'repeated') rows = rows.filter((m) => m.occurrences >= 2);
    else rows = rows.filter((m) => m.type === type);
  }
  if (subject) rows = rows.filter((m) => m.subject === subject);
  if (topic) rows = rows.filter((m) => m.topic === topic);
  if (paperId) rows = rows.filter((m) => m.paper_id === paperId);
  if (year) rows = rows.filter((m) => String(state.questionIndex.get(m.question_id)?.year ?? '') === String(year));
  rows.sort((a, b) => (b.last_seen_at || '') < (a.last_seen_at || '') ? -1 : 1);
  return rows;
}

export async function mistakeCounts() {
  const rows = await db.getAll(STORES.MISTAKES);
  const open = rows.filter((m) => m.status === 'open');
  const byType = {};
  for (const m of open) byType[m.type] = (byType[m.type] || 0) + 1;
  return {
    total: rows.length,
    open: open.length,
    resolved: rows.filter((m) => m.status === 'resolved').length,
    repeated: open.filter((m) => m.occurrences >= 2).length,
    byType,
  };
}

export async function resolveMistake(key, note = 'Marked resolved by you.') {
  const existing = await db.get(STORES.MISTAKES, key);
  if (!existing) return null;
  const updated = {
    ...existing,
    status: 'resolved',
    resolved_at: nowIso(),
    resolution_note: note,
    history: [...(existing.history || []).slice(-29), { at: nowIso(), action: 'resolved_manually', note }],
    updated_at: nowIso(),
  };
  await db.put(STORES.MISTAKES, updated);
  emit('mistakes:changed', { opened: 0, resolved: 1 });
  return updated;
}

export async function reopenMistake(key, note = 'Reopened by you.') {
  const existing = await db.get(STORES.MISTAKES, key);
  if (!existing) return null;
  const updated = {
    ...existing,
    status: 'open',
    resolved_at: null,
    resolution_note: null,
    history: [...(existing.history || []).slice(-29), { at: nowIso(), action: 'reopened_manually', note }],
    updated_at: nowIso(),
  };
  await db.put(STORES.MISTAKES, updated);
  emit('mistakes:changed', { opened: 1, resolved: 0 });
  return updated;
}

/**
 * Remove a mistake entry from the book. Attempts are intentionally preserved:
 * this only stops the item appearing in the open list.
 */
export async function removeMistake(key) {
  await db.remove(STORES.MISTAKES, key);
  emit('mistakes:changed', { opened: 0, resolved: 0 });
  return true;
}

export async function attemptHistoryForQuestion(questionId) {
  const rows = await db.getByIndex(STORES.ATTEMPTS, 'question_id', questionId);
  return rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

export async function allAttempts() {
  return db.getAll(STORES.ATTEMPTS);
}

export async function attemptsForTest(testId) {
  return db.getByIndex(STORES.ATTEMPTS, 'test_id', testId);
}

/** Compact "how has my performance changed" series for one question. */
export function attemptTrend(attempts) {
  return attempts.map((a, i) => ({
    index: i + 1,
    at: a.created_at,
    outcome: a.outcome,
    confidence: a.confidence,
    time_spent_ms: a.time_spent_ms,
    test_id: a.test_id,
    kind: a.test_kind,
  }));
}

export async function recentAttempts(limit = 50) {
  const rows = await db.getAll(STORES.ATTEMPTS);
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
}

/** Attempt rows that produced a given mistake type, newest first. */
export async function mistakesWithMeta(rows) {
  const out = [];
  for (const m of rows) {
    const meta = state.questionIndex.get(m.question_id) || null;
    out.push({ ...m, meta });
  }
  return out;
}
