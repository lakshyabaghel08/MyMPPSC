/**
 * tests.js — Test session lifecycle: creation, persistence, resume, submission.
 *
 * A test session holds the question list, per-question responses, timer state and
 * the resolved configuration. It is written to IndexedDB as the user answers, so
 * a refresh, an accidental navigation or a browser restart cannot lose work.
 */

import { STORES } from '../core/constants.js';
import * as db from '../core/db.js';
import { state, emit } from '../core/state.js';
import { uid, nowIso, logEvent, shuffle, makeRng, round } from '../core/util.js';
import { NON_SHUFFLEABLE_TYPES } from '../core/constants.js';
import { resolveScoringRules, scoreTest } from './scoring.js';
import { recordAttempts } from './attempts.js';
import { getQuestions } from './questions.js';

export const TEST_KINDS = {
  pyq_full: 'Previous-year paper simulation',
  topic: 'Topic practice',
  custom: 'Custom test',
  smart: 'Smart practice',
  mistake_retry: 'Mistake retry',
  revision: 'Revision retry',
};

export const TEST_STATUS = { IN_PROGRESS: 'in_progress', PAUSED: 'paused', SUBMITTED: 'submitted', ABANDONED: 'abandoned' };

/**
 * Build a test session object (not yet persisted).
 * @param {object} args
 */
export function buildTest({
  kind,
  label,
  paper = null,
  questionIds,
  questionMetas = [],
  config = {},
  orderSource = 'as_selected',
  selectionNotes = [],
  seed = null,
}) {
  const settings = state.settings;
  const scoringConfig = config.scoring || {};
  const resolvedRules = resolveScoringRules({
    paper: config.usePaperRules === false ? null : paper,
    override: scoringConfig.source === 'custom' ? scoringConfig : null,
    defaults: settings.defaultScoring,
  });

  const durationMinutes = config.durationMinutes ?? (paper ? paper.duration_minutes ?? null : null);
  const warnings = [...resolvedRules.warnings];
  if (paper) {
    const meta = state.questionIndex;
    const declared = paper.original_question_count;
    if (declared !== null && declared !== undefined && questionIds.length !== declared) {
      warnings.push(
        `This paper declares ${declared} original question(s) but ${questionIds.length} question(s) are stored locally, so this simulation is incomplete. Missing questions are not invented.`,
      );
    }
    if (!paper.original_order_preserved && paper.question_order?.length) {
      warnings.push('The original question order for this paper was reconstructed at import time; verify it against the source paper before relying on numbering.');
    }
    if (paper.placeholder) warnings.push('Paper metadata was not present in the imported bank (placeholder paper). Duration, marks and rules are unknown.');
    const disputed = questionIds.filter((id) => meta.get(id)?.disputed).length;
    const missingKeys = questionIds.filter((id) => {
      const m = meta.get(id);
      return m && !m.hasSuppliedAnswer && !m.hasVerifiedAnswer;
    }).length;
    if (disputed) warnings.push(`${disputed} question(s) in this paper have a disputed answer key. The supplied key is preserved and the report shows which answer was used.`);
    if (missingKeys) warnings.push(`${missingKeys} question(s) in this paper have no answer key entry. They are excluded from scoring rather than marked wrong.`);
    if (paper.answer_key?.status && paper.answer_key.status !== 'final') warnings.push(`The answer key for this paper is "${paper.answer_key.status}", not final.`);
    if (questionIds.length && questionIds.some((id) => meta.get(id)?.demonstration)) warnings.push('This paper includes demonstration (synthetic) questions, which are clearly marked in the interface.');
  }
  if (!resolvedRules.rules) warnings.push('Scoring rules must be configured before this test can be scored.');

  const language = config.language || settings.language;
  const randomizeOptions = Boolean(config.randomizeOptions);
  const seedValue = seed ?? (Math.floor(Math.random() * 2147483647) + 1);
  const rng = makeRng(seedValue);

  const optionOrder = {};
  if (randomizeOptions) {
    for (const id of questionIds) {
      const meta = questionMetas.find((m) => m.id === id);
      const type = meta?.question_type || 'single_correct';
      if (NON_SHUFFLEABLE_TYPES.has(type)) continue; // pairings are positional — never shuffle
      optionOrder[id] = null; // filled lazily when the question is first displayed
    }
  }

  return {
    id: uid('test'),
    kind,
    label,
    paper_id: paper ? paper.paper_id : null,
    paper_snapshot: paper
      ? {
          paper_id: paper.paper_id,
          exam: paper.exam,
          year: paper.year,
          paper_name: paper.paper_name,
          paper_code: paper.paper_code,
          set_code: paper.set_code,
          original_question_count: paper.original_question_count,
          duration_minutes: paper.duration_minutes,
          total_marks: paper.total_marks,
          answer_key: paper.answer_key,
          scoring: paper.scoring,
          is_demonstration: paper.is_demonstration,
          placeholder: Boolean(paper.placeholder),
          original_order_preserved: Boolean(paper.original_order_preserved),
        }
      : null,
    question_ids: questionIds.slice(),
    order_source: orderSource,
    created_at: nowIso(),
    started_at: null,
    submitted_at: null,
    updated_at: nowIso(),
    status: TEST_STATUS.IN_PROGRESS,
    language,
    responses: {},
    option_order: optionOrder,
    current_index: 0,
    config: {
      duration_minutes: config.durationMinutes ?? (paper?.duration_minutes ?? null),
      feedback_mode: config.feedbackMode || settings.feedbackMode,
      confidence: config.confidence || settings.confidenceTracking,
      randomize_options: randomizeOptions,
      randomize_questions: Boolean(config.randomizeQuestions),
      usePaperRules: config.usePaperRules !== false,
      scoring: {
        source: resolvedRules.source,
        rules: resolvedRules.rules,
        rulesSourceNote: resolvedRules.rulesSourceNote,
        needsConfiguration: resolvedRules.needsConfiguration,
      },
      answer_policy: config.answerPolicy || settings.answerPolicy,
      unresolved_policy: config.unresolvedPolicy || settings.scoringPolicyWhenUnresolved,
      show_timer: config.showTimer ?? settings.showTimer,
      allow_pause: config.allowPause ?? settings.allowPause,
      auto_submit_on_expiry: config.autoSubmitOnExpiry ?? settings.autoSubmitOnExpiry,
      seed: seedValue,
      warnings,
      selection_notes: selectionNotes,
      is_authentic_paper: Boolean(paper && !paper.placeholder && kind === 'pyq_full'),
    },
    timer: {
      running: false,
      remaining_seconds: durationMinutes === null ? null : Math.round(durationMinutes * 60),
      last_tick_at: null,
    },
    elapsed_seconds: 0,
    result: null,
  };
}

export async function saveTest(test) {
  test.updated_at = nowIso();
  await db.put(STORES.TESTS, test);
  emit('test:changed', { id: test.id, status: test.status });
  return test;
}

export async function createTest(args) {
  const test = buildTest(args);
  await saveTest(test);
  logEvent('tests', `Created ${test.kind} test ${test.id} with ${test.question_ids.length} question(s)`);
  return test;
}

export async function loadTest(id) {
  return db.get(STORES.TESTS, id);
}

export async function listTests({ status = null, kind = null, limit = 100 } = {}) {
  let rows = await db.getAll(STORES.TESTS);
  if (status) rows = rows.filter((t) => t.status === status);
  if (kind) rows = rows.filter((t) => t.kind === kind);
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return rows.slice(0, limit);
}

export async function unfinishedTests() {
  const rows = await listTests({ status: TEST_STATUS.IN_PROGRESS });
  const paused = await listTests({ status: TEST_STATUS.PAUSED });
  return [...rows, ...paused];
}

export async function latestUnfinished() {
  const rows = await unfinishedTests();
  return rows[0] || null;
}

/** Persist a response change (called on every answer/flag/confidence change). */
export async function updateResponse(test, questionId, patch) {
  const current = test.responses[questionId] || {
    selected: [],
    flagged: false,
    confidence: null,
    time_spent_ms: 0,
    revealed: false,
    answered_at: null,
    visits: 0,
  };
  test.responses[questionId] = { ...current, ...patch };
  if (patch.selected) test.responses[questionId].answered_at = nowIso();
  await saveTest(test);
  return test.responses[questionId];
}

/** Time bookkeeping: attribute seconds to a question and to the whole test. */
export function addQuestionTime(test, questionId, ms) {
  if (!questionId || !Number.isFinite(ms) || ms <= 0) return;
  const current = test.responses[questionId] || { selected: [], flagged: false, confidence: null, time_spent_ms: 0, revealed: false, visits: 0 };
  current.time_spent_ms = (current.time_spent_ms || 0) + Math.round(ms);
  test.responses[questionId] = current;
}

export function startTimer(test) {
  if (test.config.duration_minutes === null || test.config.duration_minutes === undefined) {
    test.timer.running = true;
    test.timer.last_tick_at = nowIso();
    return test;
  }
  if (test.timer.remaining_seconds === null) test.timer.remaining_seconds = Math.round(test.config.duration_minutes * 60);
  test.timer.running = true;
  test.timer.last_tick_at = nowIso();
  if (!test.started_at) test.started_at = nowIso();
  return test;
}

/**
 * Reconcile the timer with wall-clock time. Called on resume so closing the tab
 * cannot be used to cheat the clock; the gap is charged to the test, capped at
 * the remaining time. Time away is never attributed to a single question.
 */
export function reconcileTimer(test, { autoSubmit = true } = {}) {
  if (!test.timer?.last_tick_at || !test.timer.running) {
    test.timer = test.timer || { running: false, remaining_seconds: null, last_tick_at: null };
    test.timer.running = true;
    test.timer.last_tick_at = nowIso();
    return { gapSeconds: 0, expired: false };
  }
  const gapSeconds = Math.max(0, Math.floor((Date.now() - new Date(test.timer.last_tick_at).getTime()) / 1000));
  test.elapsed_seconds = (test.elapsed_seconds || 0) + gapSeconds;
  let expired = false;
  if (test.timer.remaining_seconds !== null && Number.isFinite(test.timer.remaining_seconds)) {
    test.timer.remaining_seconds = Math.max(0, test.timer.remaining_seconds - gapSeconds);
    if (test.timer.remaining_seconds <= 0) {
      expired = true;
      test.timer.running = false;
    }
  }
  test.timer.last_tick_at = nowIso();
  return { gapSeconds, expired, autoSubmit: autoSubmit && test.config.auto_submit_on_expiry };
}

export function pauseTimer(test) {
  test.timer.running = false;
  test.timer.last_tick_at = nowIso();
  return test;
}

/**
 * Resolve the display order of a question's options for this test.
 * Matching questions and other positional types are never shuffled.
 */
export function optionOrderFor(test, question) {
  const type = question.question_type || 'single_correct';
  if (!test.config.randomize_options || NON_SHUFFLEABLE_TYPES.has(type)) {
    return (Object.values(question.language_variants || {})[0]?.options || []).map((o) => o.key);
  }
  if (Array.isArray(test.option_order[question.id])) return test.option_order[question.id];
  const keys = (Object.values(question.language_variants || {})[0]?.options || []).map((o) => o.key);
  const shuffled = shuffle(keys, makeRng(hashString(`${test.id}:${question.id}`)));
  test.option_order[question.id] = shuffled;
  return shuffled;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Submit a test: score it deterministically, persist the report and record
 * attempts + mistake book + revision schedule updates.
 */
export async function submitTest(test, { submittedAt = null, auto = false } = {}) {
  const rules = test.config.scoring?.rules;
  if (!rules) {
    throw new Error('This test has no scoring rules yet. Configure the marks for correct/incorrect/unanswered answers before submitting.');
  }
  const questions = await getQuestions(test.question_ids);
  const result = scoreTest({
    test,
    questions,
    rules,
    policy: test.config.answer_policy || 'verified_preferred',
    unresolvedPolicy: test.config.unresolved_policy || 'supplied',
    answeredAt: submittedAt || nowIso(),
  });
  result.auto_submitted = Boolean(auto);
  result.rules_description = test.config.scoring?.rulesSourceNote || null;

  test.status = TEST_STATUS.SUBMITTED;
  test.submitted_at = result.computed_at;
  test.result = result;
  test.timer.running = false;
  await saveTest(test);

  const recorded = await recordAttempts({ test, result, questions });
  logEvent('tests', `Submitted test ${test.id}: score ${result.score} (${result.counts.correct}/${result.counts.total})`);
  emit('test:submitted', { id: test.id });
  return { result, recorded };
}

export async function abandonTest(test) {
  test.status = TEST_STATUS.ABANDONED;
  test.timer.running = false;
  await saveTest(test);
  return test;
}

/** Progress counters used by the runner and the resume banner. */
export function testProgress(test) {
  const total = test.question_ids.length;
  let answered = 0;
  let flagged = 0;
  let confident = 0;
  let unsure = 0;
  let guessed = 0;
  for (const id of test.question_ids) {
    const r = test.responses[id];
    if (r?.selected?.length) answered += 1;
    if (r?.flagged) flagged += 1;
    if (r?.confidence === 'confident') confident += 1;
    else if (r?.confidence === 'unsure') unsure += 1;
    else if (r?.confidence === 'guessed') guessed += 1;
  }
  return { total, answered, unanswered: total - answered, flagged, confidence: { confident, unsure, guessed } };
}

/** Cheap sanity check used by tests and the settings diagnostics panel. */
export function validateTestConfig(test) {
  const problems = [];
  if (!test.question_ids?.length) problems.push('The test has no questions.');
  if (!test.config?.scoring?.rules) problems.push('No scoring rules are configured.');
  if (test.config?.duration_minutes !== null && test.config?.duration_minutes !== undefined && !(test.config.duration_minutes > 0)) problems.push('Duration must be greater than zero or left empty.');
  if (!['learning', 'exam'].includes(test.config?.feedback_mode)) problems.push('Feedback mode must be "learning" or "exam".');
  return problems;
}

export function describeTest(test) {
  const bits = [TEST_KINDS[test.kind] || test.kind];
  if (test.paper_snapshot) {
    bits.push(`${test.paper_snapshot.exam || 'Paper'} ${test.paper_snapshot.year ?? ''}`.trim());
    if (test.paper_snapshot.set_code) bits.push(`Set ${test.paper_snapshot.set_code}`);
  }
  bits.push(`${test.question_ids.length} questions`);
  return bits.join(' · ');
}

export { round };
