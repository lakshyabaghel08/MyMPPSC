/**
 * tools/classify/answer-review.mjs — human answer and explanation resolutions.
 *
 * Some questions in a PYQ extraction reach the bank with no answer at all: the
 * book printed nothing, or the commission deleted the question and the book says
 * so. The pipeline's own rule is that it never invents a key. This module is the
 * place where a *person's* resolution of such a question is merged in, so the
 * answer stays auditable instead of being typed straight into the bank file.
 *
 * A resolution is one JSONL line, in `data/pyq/reviewed-answers.jsonl`:
 *
 *   {"id":"MPPSC-2021-057","answer":"A","basis":"constitutional_provision",
 *    "reason":"Article 243K(1): the State Election Commissioner is appointed by
 *    the Governor.",
 *    "explanation":"…prose shown to the learner…"}
 *
 * Merge rules — the honesty of the bank depends on them:
 *  - A record that already carries a printed answer is **never** overwritten.
 *    The resolution is rejected with that reason and the source key stands.
 *  - The answer must map to one of that record's own option keys (option text is
 *    accepted and mapped by the same `mapAnswer` the adapter uses). Anything
 *    else is rejected and changes nothing.
 *  - Only questions with no key are touched, so every other answer in the bank
 *    stays exactly as the source printed it.
 *  - `basis` says how the answer was reached (`source_explanation` = the
 *    source's own explanation states it, `constitutional_provision` /
 *    `standard_reference` = settled textbook or statute position, `deleted_by_
 *    commission` = MPPSC deleted the question so no official key exists). It is
 *    recorded in the review report, never in the app-facing bank.
 *  - The explanation written here replaces the placeholder text the source
 *    carries ("This question has been deleted by MPPSC.") or fills a question
 *    that had none. The text the source did print is quoted in the report.
 *
 * Build-time tool only — the browser app never imports this file.
 */

import { mapAnswer } from './intake-adapter.mjs';

/** How a resolution was reached. Anything else is stored as `manual_review`. */
export const ANSWER_BASES = new Set([
  'source_explanation',
  'constitutional_provision',
  'standard_reference',
  'official_answer_key',
  'deleted_by_commission',
  'manual_review',
]);

/** A source explanation that only says the question was cancelled. */
const PLACEHOLDER_RE = /question has been deleted|deleted by\s*mppsc|question cancelled|no answer/i;

function text(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** The options the answer has to map onto: the English variant, else the first. */
function optionsFor(question) {
  const variants = question.language_variants || {};
  const variant = variants.en || variants.hi || Object.values(variants)[0] || null;
  return variant && Array.isArray(variant.options) ? variant.options : [];
}

function questionTextOf(question) {
  const variants = question.language_variants || {};
  const variant = variants.en || variants.hi || Object.values(variants)[0] || {};
  return String(variant.question_text || '').replace(/\s+/g, ' ').trim();
}

function explanationTextOf(question) {
  const explanation = question.explanation;
  if (!explanation) return null;
  if (typeof explanation === 'string') return text(explanation);
  return text(explanation.correct_reasoning);
}

/**
 * Parse a resolution file: JSONL (one object per line) or a JSON array.
 * @returns {{resolutions: object[], notes: string[], malformed: object[]}}
 */
export function parseAnswerReviews(rawText) {
  const notes = [];
  const malformed = [];
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return { resolutions: [], notes: ['the answer-resolution file is empty; nothing was merged'], malformed };

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      return { resolutions: parsed, notes, malformed };
    } catch (err) {
      return {
        resolutions: [],
        notes: [`the answer-resolution file is not a JSON array (${err.message}); nothing was merged`],
        malformed: [{ line: null, reason: err.message }],
      };
    }
  }

  const resolutions = [];
  trimmed.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    try {
      const value = JSON.parse(line);
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        malformed.push({ line: index + 1, reason: 'the line is not a JSON object', excerpt: line.slice(0, 80) });
        return;
      }
      resolutions.push(value);
    } catch (err) {
      malformed.push({ line: index + 1, reason: err.message, excerpt: line.slice(0, 80) });
    }
  });
  if (malformed.length) notes.push(`${malformed.length} line(s) of the answer-resolution file are not valid JSON and were ignored.`);
  return { resolutions, notes, malformed };
}

/**
 * Merge answer resolutions into an adapted intake.
 *
 * Runs after classification, because the classification of a question must not
 * move just because an explanation was written for it: the rule engine reads the
 * explanation as evidence, so re-running it on resolved prose could shift a
 * label. The answers themselves are not evidence to the classifier at all.
 *
 * @param {object} intake adapted intake (mutated in place)
 * @param {object[]} resolutions parsed resolution objects
 * @param {object} [opts]
 * @param {string} [opts.file] path recorded in the report
 * @param {object[]} [opts.malformed] malformed lines to surface in the report
 * @returns {{applied: object[], rejected: object[], preserved: object[], decisions: object[], notes: string[], malformed: object[], ids: string[]}}
 */
export function applyAnswerReviews(intake, resolutions, opts = {}) {
  const file = opts.file ? String(opts.file) : null;
  const applied = [];
  const rejected = [];
  const preserved = [];
  const decisions = [];
  const notes = [];
  const malformed = (opts.malformed || []).map((m) => ({ line: m.line ?? null, reason: m.reason || 'not valid JSON', excerpt: m.excerpt || null }));
  const byId = new Map((intake.questions || []).map((q) => [q.id, q]));
  const seen = new Set();

  for (const resolution of Array.isArray(resolutions) ? resolutions : []) {
    if (resolution === null || typeof resolution !== 'object' || Array.isArray(resolution)) {
      rejected.push({ id: null, reason: 'the resolution is not a JSON object' });
      continue;
    }
    const id = resolution.id === null || resolution.id === undefined ? null : String(resolution.id).trim() || null;
    const question = id ? byId.get(id) : null;
    if (!question) {
      const reason = 'no question in the intake has this id';
      rejected.push({ id: id ?? null, reason });
      decisions.push({ id: id ?? null, action: 'rejected', reason, answer: null, excerpt: null });
      continue;
    }
    if (seen.has(question.id)) {
      const reason = 'a second resolution for the same question was ignored; the first one stands';
      rejected.push({ id: question.id, reason });
      decisions.push({ id: question.id, action: 'rejected', reason, answer: null, excerpt: questionTextOf(question) });
      continue;
    }
    seen.add(question.id);

    const printed = Array.isArray(question.supplied_answer?.answer) ? question.supplied_answer.answer.filter(Boolean) : [];
    if (printed.length) {
      const reason = `the source already printed a key (${printed.join(', ')}); a resolution never overwrites a supplied answer`;
      preserved.push({ id: question.id, answer: printed, reason });
      decisions.push({ id: question.id, action: 'preserved', reason, answer: printed.join(','), excerpt: questionTextOf(question) });
      continue;
    }

    const options = optionsFor(question);
    const { answer, notes: mapNotes } = mapAnswer(resolution.answer, options);
    if (!answer || !answer.length) {
      const reason = mapNotes[0]
        ? `the answer cannot be mapped to this question's options (${mapNotes[0]})`
        : 'the resolution carries no answer; the question stays keyless';
      rejected.push({ id: question.id, reason });
      decisions.push({ id: question.id, action: 'rejected', reason, answer: null, excerpt: questionTextOf(question) });
      continue;
    }

    const basis = ANSWER_BASES.has(resolution.basis) ? resolution.basis : 'manual_review';
    const reason = text(resolution.reason);
    const explanation = text(resolution.explanation);
    const previousExplanation = explanationTextOf(question);
    const previousWasPlaceholder = Boolean(previousExplanation && PLACEHOLDER_RE.test(previousExplanation));

    question.supplied_answer = {
      ...(question.supplied_answer || {}),
      answer,
      status: 'supplied',
      notes: reason,
    };
    question.answer_key_status = 'supplied';
    if (explanation) {
      question.explanation = {
        language: text(resolution.language) || 'en',
        correct_reasoning: explanation,
        ...(Array.isArray(resolution.key_concepts) && resolution.key_concepts.length ? { key_concepts: resolution.key_concepts.map((c) => String(c).trim()).filter(Boolean) } : {}),
      };
    }
    question.metadata = {
      ...(question.metadata || {}),
      answer_review: {
        method: 'maintainer_review',
        file,
        basis,
        answer: answer.slice().sort().join(','),
        reason: reason || null,
        applied_at: new Date().toISOString(),
        ...(previousExplanation ? { replaced_explanation: previousExplanation.slice(0, 400), replaced_kind: previousWasPlaceholder ? 'deletion_note' : 'source_prose' } : { replaced_explanation: null, replaced_kind: 'absent' }),
      },
    };

    applied.push({ id: question.id, answer, basis, reason, explanation: Boolean(explanation), previous: previousWasPlaceholder ? 'deletion_note' : previousExplanation ? 'source_prose' : 'absent' });
    decisions.push({
      id: question.id,
      action: 'applied',
      answer: answer.join(','),
      basis,
      reason: reason ? reason.slice(0, 600) : null,
      explanation: explanation ? 'written for the bank' : previousExplanation ? 'kept as printed' : 'none',
      excerpt: questionTextOf(question).slice(0, 120),
    });
  }

  if (applied.length) {
    notes.push(`${applied.length} keyless question(s) resolved by a human review pass; each answer is recorded with its basis in the review report.`);
  }
  if (preserved.length) {
    notes.push(`${preserved.length} resolution(s) refused to overwrite a printed key; the source answer stands and the record is listed in the review report.`);
  }
  if (rejected.length) {
    notes.push(`${rejected.length} resolution(s) were rejected and changed nothing.`);
  }

  return { applied, rejected, preserved, decisions, notes, malformed, ids: applied.map((a) => a.id) };
}
