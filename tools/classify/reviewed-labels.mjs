/**
 * tools/classify/reviewed-labels.mjs — reviewed classification decisions.
 *
 * The rule engine classifies from the wording of a question. It cannot place a
 * stem that carries no subject signal ("Which of the following statements is not
 * correct?"), and the taxonomy has no node for a few subjects. Those records are
 * written to a review file; a human reads the question with its options, printed
 * answer and explanation and writes one JSONL line per question:
 *
 *   {"id":"MPPSC-2019-006","subject":"Polity","topic":"Union Legislature",
 *    "subtopic":"Parliamentary committees","confidence":0.9,
 *    "reason":"Public Accounts Committee — a parliamentary committee."}
 *
 * This module merges those decisions into the intake after the rule pass, so a
 * reviewed label always wins over a rule-engine guess (the rules never see the
 * options and the explanation; the reviewer does).
 *
 * Honesty rules:
 *  - A label is stored only when every level it states exists in the taxonomy
 *    under the level above it. Anything else is rejected with the reason and
 *    changes nothing.
 *  - `classification_source` becomes `reviewed` — never `pipeline-ai`. No
 *    provider was involved in a human decision and the bank must not imply one.
 *  - The reviewer's reason is written to the review report's decision table, not
 *    into the app-facing bank.
 *
 * Build-time tool only — the browser app never imports this file.
 */

import { reconcile } from './taxonomy.mjs';

export const CLASSIFICATION_SOURCE_REVIEWED = 'reviewed';

function labelString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function existingClassification(question) {
  return typeof question.subject === 'string' && question.subject.trim() !== ''
    ? { subject: question.subject, topic: question.topic || null, subtopic: question.subtopic || null }
    : null;
}

/**
 * Parse a reviewed-label file: JSONL (one object per line) or a JSON array.
 * @returns {{labels: object[], notes: string[], malformed: object[]}}
 */
export function parseReviewedLabels(text) {
  const notes = [];
  const malformed = [];
  const trimmed = String(text || '').trim();
  if (!trimmed) return { labels: [], notes: ['the review file is empty; nothing was merged'], malformed };

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      return { labels: parsed, notes, malformed };
    } catch (err) {
      return { labels: [], notes: [`the review file is not a JSON array (${err.message}); nothing was merged`], malformed: [{ line: null, reason: err.message }] };
    }
  }

  const labels = [];
  trimmed.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    try {
      const value = JSON.parse(line);
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        malformed.push({ line: index + 1, reason: 'the line is not a JSON object', excerpt: line.slice(0, 80) });
        return;
      }
      labels.push(value);
    } catch (err) {
      malformed.push({ line: index + 1, reason: err.message, excerpt: line.slice(0, 80) });
    }
  });
  if (malformed.length) notes.push(`${malformed.length} line(s) of the review file are not valid JSON and were ignored.`);
  return { labels, notes, malformed };
}

/**
 * Merge reviewed labels into an intake object (after the rule-engine pass).
 *
 * @param {object} intake adapted intake
 * @param {object[]} labels parsed label objects
 * @param {object} taxonomy loaded taxonomy
 * @param {object} [opts]
 * @param {string} [opts.labelFile] path recorded on each applied label
 * @param {boolean} [opts.overwriteProvider] allow a reviewed label to replace an
 *        existing `pipeline-ai` classification (default: false — a provider
 *        label is left alone so a rerun of the AI queue stays stable)
 * @returns {{applied: object[], rejected: object[], decisions: object[], notes: string[], malformed: object[]}}
 */
export function applyReviewedLabels(intake, labels, taxonomy, opts = {}) {
  const labelFile = opts.labelFile ? String(opts.labelFile) : null;
  const applied = [];
  const rejected = [];
  const decisions = [];
  const notes = [];
  const malformed = (opts.malformed || []).map((m) => ({ line: m.line ?? null, reason: m.reason || 'not valid JSON', excerpt: m.excerpt || null }));
  const byId = new Map((intake.questions || []).map((q) => [q.id, q]));

  for (const label of Array.isArray(labels) ? labels : []) {
    if (label === null || typeof label !== 'object' || Array.isArray(label)) {
      rejected.push({ id: null, reason: 'the label is not a JSON object' });
      continue;
    }
    const id = label.id === null || label.id === undefined ? null : String(label.id).trim() || null;
    const question = id ? byId.get(id) : null;
    if (!question) {
      const reason = 'no question in the intake has this id';
      rejected.push({ id: id ?? null, reason });
      decisions.push({ id: id ?? null, action: 'rejected', reason, before: null, after: null });
      continue;
    }
    const before = existingClassification(question);
    const previousSource = question.classification_source || null;
    if (previousSource === 'pipeline-ai' && !opts.overwriteProvider) {
      const reason = 'a provider label already classified this question (pipeline-ai); it was left alone';
      rejected.push({ id: question.id, reason });
      decisions.push({ id: question.id, action: 'rejected', reason, before, after: before });
      continue;
    }

    const subject = labelString(label.subject);
    if (!subject) {
      const reason = 'the label carries no subject; the question keeps the classification the rules gave it';
      rejected.push({ id: question.id, reason });
      decisions.push({ id: question.id, action: 'rejected', reason, before, after: before });
      continue;
    }

    const reconciled = reconcile(taxonomy, subject, labelString(label.topic), labelString(label.subtopic));
    if (!reconciled.subject) {
      const reason = `subject "${subject}" is not in the taxonomy; the record was not changed`;
      rejected.push({ id: question.id, reason });
      decisions.push({ id: question.id, action: 'rejected', reason, before, after: before });
      continue;
    }
    if (labelString(label.topic) && !reconciled.topic) {
      const reason = `topic "${labelString(label.topic)}" is not a topic of "${reconciled.subject}"; the record was not changed`;
      rejected.push({ id: question.id, reason });
      decisions.push({ id: question.id, action: 'rejected', reason, before, after: before });
      continue;
    }
    if (labelString(label.subtopic) && !reconciled.subtopic) {
      const reason = `subtopic "${labelString(label.subtopic)}" is not a subtopic of "${reconciled.subject} / ${reconciled.topic}"; the record was not changed`;
      rejected.push({ id: question.id, reason });
      decisions.push({ id: question.id, action: 'rejected', reason, before, after: before });
      continue;
    }

    let confidence = Number(label.confidence);
    if (label.confidence === null || label.confidence === undefined || !Number.isFinite(confidence)) confidence = null;
    else confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

    const after = { subject: reconciled.subject, topic: reconciled.topic ?? null, subtopic: reconciled.subtopic ?? null };
    const changed = !before || before.subject !== after.subject || before.topic !== after.topic || before.subtopic !== after.subtopic;
    question.subject = after.subject;
    question.topic = after.topic;
    question.subtopic = after.subtopic;
    question.classification_confidence = confidence;
    question.classification_source = CLASSIFICATION_SOURCE_REVIEWED;
    question.metadata = {
      ...(question.metadata || {}),
      reviewed_classification: {
        method: 'human_review',
        label_file: labelFile,
        applied_at: new Date().toISOString(),
        evidence: 'question, options, printed answer and explanation were read together',
        ...(before && changed ? { replaced_classification: before, replaced_source: previousSource } : {}),
      },
    };

    applied.push({ id: question.id, subject: after.subject, topic: after.topic, subtopic: after.subtopic, confidence, changed });
    decisions.push({
      id: question.id,
      action: changed ? (before ? 'changed' : 'applied') : 'confirmed',
      reason: labelString(label.reason) ? String(label.reason).slice(0, 600) : null,
      before,
      after,
      confidence,
    });
  }

  return { applied, rejected, decisions, notes, malformed };
}
