/**
 * analytics.js — Analytics computed only from real stored attempts.
 *
 * Explicit distinctions kept throughout:
 *   available questions ≠ unique questions attempted ≠ total attempts.
 * Accuracy on first attempts is reported separately from accuracy across all
 * attempts, so repeating a question can never inflate mastery or coverage.
 *
 * Small samples are labelled as insufficient evidence instead of producing a
 * confident "strong/weak" verdict.
 */

import { round, mean, median, todayKey, daysBetween, sortBy } from '../core/util.js';
import { STORES } from '../core/constants.js';
import * as db from '../core/db.js';
import { state } from '../core/state.js';
import { revisionEffectiveness } from './revision.js';

export const MIN_SAMPLE_STRONG = 5; // scored answers needed before a weak/strong verdict
export const MIN_SAMPLE_HINT = 3; // scored answers needed before showing an accuracy figure as a hint

const safeDiv = (a, b) => (b ? a / b : NaN);

/**
 * Load everything analytics needs from local storage and compute the model.
 * Views use this so the distinction between stored evidence and derived numbers
 * stays in one place.
 */
export async function loadAnalytics({ includeMistakes = true } = {}) {
  const metas = Array.from(state.questionIndex.values());
  const [attempts, revisionRecords, mistakes] = await Promise.all([
    db.getAll(STORES.ATTEMPTS),
    db.getAll(STORES.REVISION),
    includeMistakes ? db.getAll(STORES.MISTAKES) : Promise.resolve([]),
  ]);
  return {
    metas,
    attempts,
    revisionRecords,
    mistakes,
    analytics: buildAnalytics({ metas, attempts, revisionRecords, mistakes, papers: state.papers }),
  };
}

export function buildAnalytics({ metas, attempts, revisionRecords = [], mistakes = [], papers = new Map() }) {
  const metaById = new Map(Array.from(metas).map((m) => [m.id, m]));
  const available = metaById.size;
  const attemptedIds = new Set(attempts.map((a) => a.question_id));
  const scoredAttempts = attempts.filter((a) => a.outcome === 'correct' || a.outcome === 'incorrect');
  const firstAttempts = attempts.filter((a) => a.is_first_attempt);

  const counts = {
    availableQuestions: available,
    attemptedUnique: attemptedIds.size,
    totalAttempts: attempts.length,
    repeatAttempts: attempts.length - attemptedIds.size > 0 ? attempts.length - attemptedIds.size : 0,
    attemptedAnswers: attempts.filter((a) => a.outcome !== 'unanswered').length,
    correct: attempts.filter((a) => a.outcome === 'correct').length,
    incorrect: attempts.filter((a) => a.outcome === 'incorrect').length,
    unanswered: attempts.filter((a) => a.outcome === 'unanswered').length,
    unscored: attempts.filter((a) => a.outcome === 'unscored').length,
    flagged: attempts.filter((a) => a.flagged).length,
    distinctPapers: new Set(attempts.map((a) => a.paper_id).filter(Boolean)).size,
  };
  counts.coverage = safeDiv(counts.attemptedUnique, available) || 0;

  const accuracy = {
    all: counts.correct + counts.incorrect ? counts.correct / (counts.correct + counts.incorrect) : NaN,
    firstAttempt: (() => {
      const s = firstAttempts.filter((a) => a.outcome === 'correct' || a.outcome === 'incorrect');
      return s.length ? s.filter((a) => a.outcome === 'correct').length / s.length : NaN;
    })(),
    firstAttemptSample: firstAttempts.filter((a) => a.outcome === 'correct' || a.outcome === 'incorrect').length,
    answerRate: counts.totalAttempts ? counts.attemptedAnswers / counts.totalAttempts : NaN,
    note:
      'Accuracy across all attempts counts repeats; accuracy on first attempts is the better indicator of first-time recall, but it changes more slowly as coverage grows.',
  };

  /* --------------------------------------------------------- dimensions --- */

  const dimension = (keyFn, labelFn, extra = {}) => {
    const rows = new Map();
    const ensure = (key, sample) => {
      if (!rows.has(key)) {
        rows.set(key, {
          key,
          ...labelFn(sample),
          available: 0,
          attemptedUnique: 0,
          attempts: 0,
          correct: 0,
          incorrect: 0,
          unanswered: 0,
          firstAttemptCorrect: 0,
          firstAttemptScored: 0,
          timeMs: 0,
          timedAnswers: 0,
          flagged: 0,
          attemptedIds: new Set(),
          ...extra,
        });
      }
      return rows.get(key);
    };
    for (const meta of metas) {
      const row = ensure(keyFn(meta, true), meta);
      row.available += 1;
    }
    for (const a of attempts) {
      const meta = metaById.get(a.question_id);
      const sample = meta || a;
      const row = ensure(keyFn(sample, false), sample);
      row.attempts += 1;
      row.attemptedIds.add(a.question_id);
      if (a.outcome === 'correct') row.correct += 1;
      else if (a.outcome === 'incorrect') row.incorrect += 1;
      else if (a.outcome === 'unanswered') row.unanswered += 1;
      if (a.is_first_attempt && (a.outcome === 'correct' || a.outcome === 'incorrect')) {
        row.firstAttemptScored += 1;
        if (a.outcome === 'correct') row.firstAttemptCorrect += 1;
      }
      if (a.time_spent_ms) {
        row.timeMs += a.time_spent_ms;
        row.timedAnswers += 1;
      }
      if (a.flagged) row.flagged += 1;
    }
    for (const row of rows.values()) {
      row.attemptedUnique = row.attemptedIds.size;
      delete row.attemptedIds;
      const scored = row.correct + row.incorrect;
      row.scored = scored;
      row.accuracy = scored ? row.correct / scored : NaN;
      row.firstAttemptAccuracy = row.firstAttemptScored ? row.firstAttemptCorrect / row.firstAttemptScored : NaN;
      row.coverage = row.available ? row.attemptedUnique / row.available : 0;
      row.avgTimeSec = row.timedAnswers ? round(row.timeMs / row.timedAnswers / 1000, 1) : null;
      row.insufficientEvidence = scored < MIN_SAMPLE_HINT;
      row.smallSample = scored >= MIN_SAMPLE_HINT && scored < MIN_SAMPLE_STRONG;
      row.verdict =
        scored < MIN_SAMPLE_HINT
          ? 'insufficient evidence'
          : scored < MIN_SAMPLE_STRONG
            ? 'early indication only'
            : row.accuracy >= 0.75
              ? 'strong'
              : row.accuracy < 0.5
                ? 'weak'
                : 'developing';
    }
    return Array.from(rows.values()).sort(sortBy((r) => r.available, 'desc'));
  };

  const bySubject = dimension(
    (m) => m.subject || 'Unclassified',
    (m) => ({ subject: m.subject || 'Unclassified' }),
  );
  const byTopic = dimension(
    (m) => `${m.subject || 'Unclassified'}||${m.topic || 'Unclassified'}`,
    (m) => ({ subject: m.subject || 'Unclassified', topic: m.topic || 'Unclassified' }),
  );
  const bySubtopic = dimension(
    (m) => `${m.subject || 'Unclassified'}||${m.topic || 'Unclassified'}||${m.subtopic || 'Unclassified'}`,
    (m) => ({ subject: m.subject || 'Unclassified', topic: m.topic || 'Unclassified', subtopic: m.subtopic || 'Unclassified' }),
  );
  const byYear = dimension(
    (m) => (m.year === null || m.year === undefined ? 'unknown' : String(m.year)),
    (m) => ({ year: m.year === null || m.year === undefined ? 'unknown' : String(m.year) }),
  );
  const byPaper = dimension(
    (m) => m.paper_id || 'unknown',
    (m) => {
      const paper = papers.get(m.paper_id);
      return { paper_id: m.paper_id, label: paper ? `${paper.paper_name || paper.paper_id} (${paper.year ?? 'year unknown'}${paper.set_code ? `, set ${paper.set_code}` : ''})` : m.paper_id };
    },
  );
  const byType = dimension(
    (m) => m.question_type || 'other',
    (m) => ({ question_type: m.question_type || 'other' }),
  );

  /* ------------------------------------------------------------- trend --- */

  const byDay = new Map();
  for (const a of attempts) {
    const day = (a.created_at || '').slice(0, 10);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, { date: day, attempts: 0, correct: 0, incorrect: 0, unanswered: 0, timeMs: 0 });
    const row = byDay.get(day);
    row.attempts += 1;
    if (a.outcome === 'correct') row.correct += 1;
    else if (a.outcome === 'incorrect') row.incorrect += 1;
    else if (a.outcome === 'unanswered') row.unanswered += 1;
    row.timeMs += a.time_spent_ms || 0;
  }
  const daily = Array.from(byDay.values())
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => ({ ...r, accuracy: r.correct + r.incorrect ? r.correct / (r.correct + r.incorrect) : null, minutes: round(r.timeMs / 60000, 1) }));

  /* -------------------------------------------------------------- time --- */

  const timed = attempts.filter((a) => a.time_spent_ms > 0);
  const time = {
    avgSecPerQuestion: timed.length ? round(mean(timed.map((a) => a.time_spent_ms / 1000)), 1) : null,
    medianSecPerQuestion: timed.length ? round(median(timed.map((a) => a.time_spent_ms / 1000)), 1) : null,
    avgSecPerCorrect: (() => {
      const c = timed.filter((a) => a.outcome === 'correct');
      return c.length ? round(mean(c.map((a) => a.time_spent_ms / 1000)), 1) : null;
    })(),
    slowest: timed
      .slice()
      .sort((a, b) => b.time_spent_ms - a.time_spent_ms)
      .slice(0, 10)
      .map((a) => ({ question_id: a.question_id, seconds: round(a.time_spent_ms / 1000, 1), outcome: a.outcome, subject: a.subject, topic: a.topic })),
    bySubject: bySubject
      .filter((r) => r.avgTimeSec !== null)
      .map((r) => ({ subject: r.subject, avgTimeSec: r.avgTimeSec, attempts: r.attempts }))
      .sort((a, b) => b.avgTimeSec - a.avgTimeSec),
  };

  /* -------------------------------------------------------- confidence --- */

  const confidenceEnabled = attempts.some((a) => a.confidence);
  const matrix = {
    confident: { correct: 0, incorrect: 0, unanswered: 0, total: 0 },
    unsure: { correct: 0, incorrect: 0, unanswered: 0, total: 0 },
    guessed: { correct: 0, incorrect: 0, unanswered: 0, total: 0 },
    none: { correct: 0, incorrect: 0, unanswered: 0, total: 0 },
  };
  for (const a of attempts) {
    const key = a.confidence || 'none';
    if (!matrix[key]) continue;
    matrix[key][a.outcome] = (matrix[key][a.outcome] || 0) + 1;
    matrix[key].total += 1;
  }
  const confidence = {
    enabled: confidenceEnabled,
    matrix,
    confidentAccuracy: safeDiv(matrix.confident.correct, matrix.confident.correct + matrix.confident.incorrect),
    guessAccuracy: safeDiv(matrix.guessed.correct, matrix.guessed.correct + matrix.guessed.incorrect),
    unsureAccuracy: safeDiv(matrix.unsure.correct, matrix.unsure.correct + matrix.unsure.incorrect),
    overconfidence: matrix.confident.incorrect,
    underconfidence: matrix.unsure.correct + matrix.guessed.correct,
    note: 'Guessing correctly is not treated as recall: correct-but-guessed answers are scheduled for additional revision.',
  };

  /* ---------------------------------------------------------- mistakes --- */

  const openMistakes = mistakes.filter((m) => m.status === 'open');
  const repeated = openMistakes.filter((m) => m.occurrences >= 2);
  const repeatedByType = {};
  for (const m of repeated) repeatedByType[m.type] = (repeatedByType[m.type] || 0) + 1;

  /* ------------------------------------------------- overviews/insights -- */

  const weakTopics = byTopic
    .filter((r) => r.scored >= MIN_SAMPLE_STRONG && r.accuracy < 0.6)
    .sort((a, b) => a.accuracy - b.accuracy);
  const strongTopics = byTopic
    .filter((r) => r.scored >= MIN_SAMPLE_STRONG && r.accuracy >= 0.75)
    .sort((a, b) => b.accuracy - a.accuracy);
  const insufficient = byTopic
    .filter((r) => r.scored > 0 && r.scored < MIN_SAMPLE_HINT)
    .map((r) => ({ subject: r.subject, topic: r.topic, scored: r.scored, reason: `only ${r.scored} scored answer(s); at least ${MIN_SAMPLE_HINT} are needed before an accuracy figure is meaningful` }));
  const neverAttemptedTopics = byTopic.filter((r) => r.attempts === 0 && r.available > 0);
  const underPractised = byTopic
    .filter((r) => r.coverage < 0.3 && r.available >= 3 && r.scored < MIN_SAMPLE_STRONG)
    .sort((a, b) => a.coverage - b.coverage);

  /* --------------------------------------------------------- frequency --- */

  const freqByTopic = new Map();
  for (const m of metas) {
    const key = `${m.subject || 'Unclassified'}||${m.topic || 'Unclassified'}`;
    if (!freqByTopic.has(key)) freqByTopic.set(key, { subject: m.subject || 'Unclassified', topic: m.topic || 'Unclassified', count: 0, byYear: {}, unclassified: Boolean(m.unclassified) });
    const row = freqByTopic.get(key);
    row.count += 1;
    const y = m.year === null || m.year === undefined ? 'unknown' : String(m.year);
    row.byYear[y] = (row.byYear[y] || 0) + 1;
  }
  const frequency = {
    total: available,
    byTopic: Array.from(freqByTopic.values())
      .map((r) => ({ ...r, share: safeDiv(r.count, available) }))
      .sort((a, b) => b.count - a.count),
    bySubject: bySubject.map((r) => ({ subject: r.subject, count: r.available, share: safeDiv(r.available, available) })),
    byYear: Array.from(
      metas.reduce((map, m) => {
        const y = m.year === null || m.year === undefined ? 'unknown' : String(m.year);
        map.set(y, (map.get(y) || 0) + 1);
        return map;
      }, new Map()),
    )
      .map(([year, count]) => ({ year, count, share: safeDiv(count, available) }))
      .sort((a, b) => String(b.year).localeCompare(String(a.year))),
    disclaimer:
      'Counts describe the imported question bank only. Topic frequency is a study-prioritisation aid; it does not predict what a future examination will contain.',
  };

  /* ---------------------------------------------------------- revision --- */

  const today = todayKey();
  const revision = {
    tracked: revisionRecords.length,
    dueToday: revisionRecords.filter((r) => r.next_due === today).length,
    overdue: revisionRecords.filter((r) => r.next_due && r.next_due < today).length,
    upcoming: revisionRecords.filter((r) => r.next_due && r.next_due > today).length,
    effectiveness: revisionEffectiveness(revisionRecords, attempts),
    byState: revisionRecords.reduce((acc, r) => {
      acc[r.state] = (acc[r.state] || 0) + 1;
      return acc;
    }, {}),
  };

  /* ------------------------------------------------------------- tests --- */

  const testRows = new Map();
  for (const a of attempts) {
    if (!a.test_id) continue;
    if (!testRows.has(a.test_id)) {
      testRows.set(a.test_id, { test_id: a.test_id, at: a.created_at, kind: a.test_kind, attempts: 0, correct: 0, incorrect: 0, unanswered: 0, marks: 0, timeMs: 0 });
    }
    const row = testRows.get(a.test_id);
    row.attempts += 1;
    if (a.outcome === 'correct') row.correct += 1;
    else if (a.outcome === 'incorrect') row.incorrect += 1;
    else if (a.outcome === 'unanswered') row.unanswered += 1;
    row.marks += a.marks || 0;
    row.timeMs += a.time_spent_ms || 0;
  }
  const tests = Array.from(testRows.values())
    .map((r) => ({ ...r, accuracy: r.correct + r.incorrect ? r.correct / (r.correct + r.incorrect) : null, minutes: round(r.timeMs / 60000, 1) }))
    .sort((a, b) => (a.at < b.at ? -1 : 1));

  return {
    generated_at: new Date().toISOString(),
    counts,
    accuracy,
    bySubject,
    byTopic,
    bySubtopic,
    byYear,
    byPaper,
    byType,
    daily,
    time,
    confidence,
    mistakes: { open: openMistakes.length, repeated: repeated.length, repeatedByType, top: openMistakes.slice().sort((a, b) => b.occurrences - a.occurrences).slice(0, 20) },
    weakTopics,
    strongTopics,
    insufficient,
    neverAttemptedTopics,
    underPractised,
    frequency,
    revision,
    tests,
    thresholds: { minSampleStrong: MIN_SAMPLE_STRONG, minSampleHint: MIN_SAMPLE_HINT },
  };
}

/**
 * Suggested study priorities combining question frequency, your performance and
 * syllabus status. Every suggestion carries the basis for the recommendation.
 */
export function studyPriorities({ analytics, syllabusProgress = null, limit = 12 }) {
  const rows = [];
  const syllabusTopics = syllabusProgress?.byTopic || new Map();
  for (const topic of analytics.byTopic) {
    const key = topic.key;
    const available = topic.available;
    const syl = syllabusTopics.get(key) || null;
    const reasons = [];
    let score = 0;

    if (topic.attempts === 0) {
      score += 30;
      reasons.push(`${available} question(s) available, never attempted`);
    } else if (topic.scored < MIN_SAMPLE_HINT) {
      score += 15;
      reasons.push(`only ${topic.scored} scored answer(s) so far — evidence is too thin to judge`);
    } else if (topic.accuracy < 0.5) {
      score += 45;
      reasons.push(`accuracy ${Math.round(topic.accuracy * 100)}% over ${topic.scored} scored answers`);
    } else if (topic.accuracy < 0.7) {
      score += 25;
      reasons.push(`accuracy ${Math.round(topic.accuracy * 100)}% — developing`);
    } else {
      reasons.push(`accuracy ${Math.round(topic.accuracy * 100)}% — currently strong`);
    }

    if (topic.coverage < 0.5 && available >= 3) {
      score += 12;
      reasons.push(`coverage ${Math.round(topic.coverage * 100)}% of the imported questions in this topic`);
    }
    if (available >= 5) {
      score += Math.min(10, available / 5);
      reasons.push(`${available} question(s) in the imported bank for this topic`);
    } else if (available > 0) {
      reasons.push(`thin question coverage (${available}) — conclusions here are weak`);
    }
    if (syl) {
      if (syl.status === 'not_started') {
        score += 10;
        reasons.push('syllabus item not started');
      } else if (syl.status === 'in_progress') {
        score += 5;
        reasons.push('syllabus item in progress');
      } else if (syl.status === 'completed') {
        score -= 8;
        reasons.push('syllabus item marked completed');
      }
    }
    rows.push({
      ...topic,
      priorityScore: round(score, 1),
      reasons,
      // Only the status the Syllabus screen shows. A priority or target date
      // stored on a progress row is the reader's own planning data: it is kept
      // on disk and in backups, but *My plan* is no longer part of the
      // interface, so it no longer moves a suggestion up the list.
      syllabus: syl ? { status: syl.status } : null,
      caveat: 'Priorities combine question frequency, your recorded performance and syllabus status. Frequency is not a forecast of future examinations.',
    });
  }
  return rows.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, limit);
}

/** Dashboard-ready summary: today's numbers, streak, weak areas, recent activity. */
export function dashboardSummary({ analytics, tests, tasks, revision, settings }) {
  const today = todayKey(new Date());
  const todayAttempts = analytics.daily.find((d) => d.date === today) || { attempts: 0, correct: 0, incorrect: 0, unanswered: 0, accuracy: null, minutes: 0 };
  const recentTests = tests
    .filter((t) => t.status === 'submitted')
    .sort((a, b) => ((a.submitted_at || a.created_at) < (b.submitted_at || b.created_at) ? 1 : -1))
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      label: t.label,
      kind: t.kind,
      at: t.submitted_at || t.created_at,
      score: t.result?.score ?? null,
      max: t.result?.max_marks ?? null,
      accuracy: t.result?.accuracy ?? null,
      counts: t.result?.counts || null,
    }));
  const lastSevenDays = analytics.daily.slice(-7);
  const activityByDay = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = todayKey(d);
    const row = analytics.daily.find((x) => x.date === key);
    return { date: key, attempts: row?.attempts || 0, accuracy: row?.accuracy ?? null, minutes: row?.minutes || 0 };
  });
  return {
    today,
    todayAttempts,
    activityByDay,
    recentTests,
    streak: (() => {
      let streak = 0;
      for (let i = activityByDay.length - 1; i >= 0; i -= 1) {
        if (activityByDay[i].attempts > 0) streak += 1;
        else break;
      }
      return streak;
    })(),
    dueToday: revision.dueToday,
    overdue: revision.overdue,
    upcoming: revision.upcoming,
    openTasks: (tasks || []).filter((t) => t.status !== 'done'),
    weakTopics: analytics.weakTopics.slice(0, 4),
    repeatedMistakes: analytics.mistakes.top.slice(0, 5),
    settings,
  };
}

/** Compact per-topic statistics for one subject (used by syllabus linking). */
export function subjectBreakdown(analytics, subject) {
  return analytics.byTopic.filter((t) => t.subject === subject);
}
