/**
 * scoring.js — Deterministic, auditable scoring.
 *
 * Design rules:
 *  - Pure functions: same inputs always produce the same marks. No AI, no clock
 *    reads except the caller-supplied timestamp.
 *  - The supplied answer key is never overwritten. A disputed or missing answer
 *    is visible in the result and can be excluded from scoring by policy.
 *  - Negative marking is applied ONLY when the rules in force say it applies.
 *  - Questions with no usable answer at all are reported as "unscored" and kept
 *    out of the accuracy denominator instead of being counted as wrong.
 */

import { effectiveAnswer, answerIntegrity } from '../core/schema.js';
import { round } from '../core/util.js';
import { resolveMppscMarkingScheme, schemeRules, describeScheme, SCHEME_SOURCE_BUILTIN } from '../core/marking.js';

export const OUTCOMES = { CORRECT: 'correct', INCORRECT: 'incorrect', UNANSWERED: 'unanswered', UNSCORED: 'unscored' };

export function sameAnswerSet(a, b) {
  if (!a || !b) return false;
  const sa = Array.from(new Set(a.map((x) => String(x).toUpperCase()))).sort();
  const sb = Array.from(new Set(b.map((x) => String(x).toUpperCase()))).sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/**
 * Evaluate a single response.
 * @returns {{outcome:string, answer:Array|null, basis:string|null, note:string|null, integrity:object}}
 */
export function evaluateResponse(question, response, policy = 'verified_preferred') {
  const integrity = answerIntegrity(question);
  const { answer, basis } = effectiveAnswer(question, policy);
  const selected = response?.selected && response.selected.length ? response.selected.slice().sort() : null;

  if (!selected) {
    return { outcome: OUTCOMES.UNANSWERED, answer, basis, note: null, integrity };
  }
  if (!answer || !answer.length) {
    return {
      outcome: OUTCOMES.UNSCORED,
      answer: null,
      basis: null,
      note: 'No usable answer key entry for this question; it is excluded from scoring and accuracy.',
      integrity,
    };
  }
  const outcome = sameAnswerSet(selected, answer) ? OUTCOMES.CORRECT : OUTCOMES.INCORRECT;
  let note = null;
  if (integrity.disputed) note = `Answer key disputed${integrity.verified ? '; scored against your verified answer' : '; scored against the stored key'}.`;
  else if (basis === 'verified') note = 'Scored against the verified answer.';
  return { outcome, answer, basis, note, integrity };
}

/**
 * Resolve the scoring rules to use for a test.
 * Returns {rules, source, needsConfiguration, warnings[]}
 */
export function resolveScoringRules({ paper = null, override = null, defaults = null } = {}) {
  const warnings = [];
  if (override && override.source === 'custom') {
    return {
      rules: {
        marks_per_correct: num(override.marksPerCorrect, 1),
        negative_marks_per_incorrect: override.negativeMarkingEnabled ? Math.abs(num(override.negativeMarksPerIncorrect, 0)) : 0,
        negative_marking_enabled: Boolean(override.negativeMarkingEnabled),
        marks_for_unanswered: num(override.marksForUnanswered, 0),
      },
      source: 'user_configured',
      rulesSourceNote: override.note || 'Custom rules configured by the user for this test.',
      needsConfiguration: false,
      warnings,
    };
  }
  if (paper) {
    const s = paper.scoring || {};
    if (s.rules_known && Number.isFinite(Number(s.marks_per_correct))) {
      const scheme = resolveMppscMarkingScheme(paper);
      return {
        rules: {
          marks_per_correct: Number(s.marks_per_correct),
          negative_marks_per_incorrect: Number(s.negative_marks_per_incorrect) || 0,
          negative_marking_enabled: Boolean(s.negative_marking_enabled) || Number(s.negative_marks_per_incorrect) > 0,
          marks_for_unanswered: Number(s.marks_for_unanswered) || 0,
        },
        source: 'paper_original',
        rulesSourceNote: s.rules_source || 'Scoring rules supplied with the paper metadata.',
        schemeId: s.scheme_id || scheme?.id || null,
        schemeLabel: scheme?.label || null,
        schemeEvidence: scheme?.evidence || [],
        qualifying: scheme?.qualifying || null,
        needsConfiguration: false,
        warnings,
      };
    }
    warnings.push(
      `Scoring rules for paper "${paper.paper_id}" are not known from the source. Configure the rules for this test before you can rely on the score.`,
    );
    // Automatic MPPSC rules: the applicable examination-year scheme is applied
    // without any manual configuration. Only MPPSC preliminary papers whose
    // year is covered by a verified scheme qualify; anything else keeps
    // `needsConfiguration: true` rather than being guessed.
    const scheme = resolveMppscMarkingScheme(paper);
    if (scheme) {
      const rules = schemeRules(scheme);
      const note = `${describeScheme(scheme)} (${scheme.id}). Paper rules were not stated in the bank, so the MPPSC scheme for the examination year was used automatically.`;
      warnings.length = 0;
      warnings.push(
        `Paper "${paper.paper_id}" did not state its scoring rules; the MPPSC scheme for ${paper.year} was applied automatically — ${describeScheme(scheme)}.`,
      );
      return {
        rules,
        source: SCHEME_SOURCE_BUILTIN,
        rulesSourceNote: note,
        schemeId: scheme.id,
        schemeLabel: scheme.label,
        schemeEvidence: scheme.evidence || [],
        qualifying: scheme.qualifying || null,
        needsConfiguration: false,
        warnings,
        paperId: paper.paper_id,
      };
    }
    return { rules: null, source: 'unknown', rulesSourceNote: s.notes || null, needsConfiguration: true, warnings, paperId: paper.paper_id };
  }
  const d = defaults || { marksPerCorrect: 1, negativeMarksPerIncorrect: 0, negativeMarkingEnabled: false, marksForUnanswered: 0 };
  warnings.push('No source paper rules apply to this test; the configured default rules are used.');
  return {
    rules: {
      marks_per_correct: num(d.marksPerCorrect, 1),
      negative_marks_per_incorrect: d.negativeMarkingEnabled ? Math.abs(num(d.negativeMarksPerIncorrect, 0)) : 0,
      negative_marking_enabled: Boolean(d.negativeMarkingEnabled),
      marks_for_unanswered: num(d.marksForUnanswered, 0),
    },
    source: 'app_default',
    rulesSourceNote: 'Default rules from Settings (no source paper rules apply).',
    needsConfiguration: false,
    warnings,
  };
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Score a whole test.
 * @param {object} args
 * @param {object} args.test test session (with responses)
 * @param {Map<string, object>} args.questions question id → full question record
 * @param {object} args.rules resolved rules {marks_per_correct, ...}
 * @param {string} args.policy answer policy
 * @param {string} args.unresolvedPolicy 'supplied' | 'verified' | 'exclude'
 */
export function scoreTest({ test, questions, rules, policy = 'verified_preferred', unresolvedPolicy = 'supplied', answeredAt = null }) {
  if (!rules) throw new Error('scoreTest requires resolved scoring rules');
  const perQuestion = [];
  const counts = { total: 0, attempted: 0, correct: 0, incorrect: 0, unanswered: 0, unscored: 0, flagged: 0, lowConfidenceCorrect: 0, confidentIncorrect: 0 };
  const unscoredReasons = [];
  const unresolved = [];
  let score = 0;
  let negativeApplied = 0;

  const responses = test.responses || {};
  for (const questionId of test.question_ids || []) {
    const question = questions.get(questionId);
    const response = responses[questionId] || { selected: [], flagged: false, confidence: null, time_spent_ms: 0 };
    counts.total += 1;
    if (response.flagged) counts.flagged += 1;

    if (!question) {
      counts.unscored += 1;
      unscoredReasons.push({ question_id: questionId, reason: 'Question record is missing from the local database.' });
      perQuestion.push({ question_id: questionId, outcome: OUTCOMES.UNSCORED, missing_question: true, selected: response.selected || [], answered: false });
      continue;
    }

    let evaluation = evaluateResponse(question, response, policy);
    const integrity = evaluation.integrity;
    const answered = Boolean(response.selected && response.selected.length);
    if (answered) counts.attempted += 1;

    // Unresolved-answer policy: never silently rewrite the key, but let the user
    // decide whether an unresolved item contributes to the score.
    let excludedForUnresolved = false;
    if (integrity.unresolved && answered) {
      const flag = {
        question_id: questionId,
        supplied: integrity.supplied || null,
        verified: integrity.verified || null,
        reason: integrity.missing ? 'answer key missing' : integrity.disputed ? 'answer key disputed' : 'your verified answer differs from the stored key',
        resolved_by: evaluation.basis || null,
      };
      unresolved.push(flag);
      if (unresolvedPolicy === 'exclude') {
        excludedForUnresolved = true;
        evaluation = { ...evaluation, outcome: OUTCOMES.UNSCORED, note: 'Excluded from scoring: the answer for this question is unresolved and the policy is "exclude unresolved items".' };
      } else if (unresolvedPolicy === 'verified' && evaluation.basis !== 'verified') {
        excludedForUnresolved = true;
        evaluation = { ...evaluation, outcome: OUTCOMES.UNSCORED, note: 'Excluded from scoring: no independently verified answer is available for this disputed question.' };
      }
    }

    const marks = marksFor(evaluation.outcome, rules);
    if (evaluation.outcome !== OUTCOMES.UNSCORED) {
      score += marks;
      if (marks < 0) negativeApplied += marks;
    } else {
      counts.unscored += 1;
      unscoredReasons.push({ question_id: questionId, reason: evaluation.note || 'Excluded from scoring.' });
    }

    if (evaluation.outcome === OUTCOMES.CORRECT) counts.correct += 1;
    else if (evaluation.outcome === OUTCOMES.INCORRECT) counts.incorrect += 1;
    else if (evaluation.outcome === OUTCOMES.UNANSWERED) counts.unanswered += 1;

    if (evaluation.outcome === OUTCOMES.CORRECT && (response.confidence === 'unsure' || response.confidence === 'guessed')) counts.lowConfidenceCorrect += 1;
    if (evaluation.outcome === OUTCOMES.INCORRECT && response.confidence === 'confident') counts.confidentIncorrect += 1;

    perQuestion.push({
      question_id: questionId,
      question_number: question.question_number ?? null,
      subject: question.classification?.subject || 'Unclassified',
      topic: question.classification?.topic || null,
      subtopic: question.classification?.subtopic || null,
      paper_id: question.paper_id,
      selected: response.selected || [],
      answer: evaluation.answer,
      answer_basis: evaluation.basis,
      supplied_answer: integrity.supplied,
      verified_answer: integrity.verified,
      disputed: integrity.disputed,
      outcome: evaluation.outcome,
      marks,
      answered,
      flagged: Boolean(response.flagged),
      confidence: response.confidence || null,
      time_spent_ms: Number(response.time_spent_ms) || 0,
      note: evaluation.note,
      has_explanation: Boolean(question.explanation),
      excluded_for_unresolved: excludedForUnresolved,
      demonstration: Boolean(question.is_demonstration),
    });
  }

  const scored = counts.correct + counts.incorrect; // answered questions with a usable key
  const maxMarks = round((test.question_ids || []).length * rules.marks_per_correct, 4);
  const accuracy = scored ? counts.correct / scored : NaN;

  const byTopic = new Map();
  for (const row of perQuestion) {
    if (row.outcome === OUTCOMES.UNSCORED || row.missing_question) continue;
    const key = `${row.subject}||${row.topic || ''}`;
    if (!byTopic.has(key)) byTopic.set(key, { subject: row.subject, topic: row.topic || null, total: 0, correct: 0, incorrect: 0, unanswered: 0, marks: 0, time_spent_ms: 0 });
    const bucket = byTopic.get(key);
    bucket.total += 1;
    bucket[row.outcome] = (bucket[row.outcome] || 0) + 1;
    bucket.marks += row.marks;
    bucket.time_spent_ms += row.time_spent_ms;
  }
  const topicRows = Array.from(byTopic.values())
    .map((b) => ({ ...b, accuracy: b.correct + b.incorrect ? b.correct / (b.correct + b.incorrect) : NaN }))
    .sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0));

  const confidenceMatrix = null || (() => {
    const levels = ['confident', 'unsure', 'guessed'];
    const matrix = {};
    for (const l of levels) matrix[l] = { correct: 0, incorrect: 0, unanswered: 0, unscored: 0, total: 0 };
    matrix.none = { correct: 0, incorrect: 0, unanswered: 0, unscored: 0, total: 0 };
    for (const row of perQuestion) {
      const key = row.confidence || 'none';
      if (!matrix[key]) continue;
      matrix[key][row.outcome] = (matrix[key][row.outcome] || 0) + 1;
      matrix[key].total += 1;
    }
    return matrix;
  })();

  return {
    computed_at: answeredAt || new Date().toISOString(),
    scoring: { ...rules, source: test.config?.scoring?.source || null, rules_source_note: test.config?.scoring?.rulesSourceNote || null },
    counts,
    score: round(score, 4),
    max_marks: maxMarks,
    negative_marks_applied: round(negativeApplied, 4),
    accuracy: Number.isFinite(accuracy) ? round(accuracy, 4) : null,
    accuracy_note: counts.unscored ? `${counts.unscored} question(s) were excluded from scoring and accuracy because no usable answer key was available.` : null,
    per_topic: topicRows,
    per_question: perQuestion,
    confidence_matrix: confidenceMatrix,
    unscored: unscoredReasons,
    unresolved_answers: unresolved,
    warnings: [
      ...(unresolved.length ? [`${unresolved.length} question(s) in this test have an unresolved answer key. Review them before treating the score as final.`] : []),
      ...(counts.unscored ? [`${counts.unscored} question(s) could not be scored.`] : []),
      ...((test.config?.warnings || [])),
    ],
  };
}

export function marksFor(outcome, rules) {
  switch (outcome) {
    case OUTCOMES.CORRECT:
      return rules.marks_per_correct;
    case OUTCOMES.INCORRECT:
      return rules.negative_marking_enabled ? -Math.abs(rules.negative_marks_per_incorrect) : 0;
    case OUTCOMES.UNANSWERED:
      return rules.marks_for_unanswered || 0;
    case OUTCOMES.UNSCORED:
    default:
      return 0;
  }
}

/** Human-readable summary of the rules actually used for a test. */
export function describeRules(rules, source) {
  if (!rules) return 'Rules not configured — this test cannot be scored until the rules are set.';
  const n = (v) => String(round(Number(v) || 0, 2));
  const bits = [`+${n(rules.marks_per_correct)} for correct`];
  if (rules.negative_marking_enabled && rules.negative_marks_per_incorrect) bits.push(`−${n(rules.negative_marks_per_incorrect)} for incorrect (negative marking)`);
  else bits.push('no negative marking');
  bits.push(`${n(rules.marks_for_unanswered)} for unanswered`);
  const sourceLabel = { paper_original: 'source paper rules', user_configured: 'rules you configured', app_default: 'app default rules', unknown: 'unknown rules', mppsc_builtin: 'MPPSC scheme for the examination year' }[source] || source;
  return `${bits.join(', ')} (${sourceLabel})`;
}
