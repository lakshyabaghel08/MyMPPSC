/**
 * tools/classify/ai-queue.mjs — the resumable semantic-classification step.
 *
 * The rule engine handles everything it can prove from the wording. What is
 * left (no rule matched, two subjects too close, or a topic too close to call)
 * goes into an AI queue file. A provider labels that file, and the labels are
 * merged back in with `--apply-ai`. The two halves are deliberately separate so
 * the pipeline can be run, interrupted and resumed without redoing work:
 *
 *   node tools/classify-bank.mjs --in intake.json --out bank.json --ai-queue q.jsonl
 *   node tools/classify/ai-provider.mjs --queue q.jsonl --out labels.jsonl   (needs a key)
 *   node tools/classify-bank.mjs --in intake.json --out bank.json --apply-ai labels.jsonl
 *
 * Provider labels are not trusted blindly: every one is checked against the
 * canonical taxonomy, low-confidence ones are flagged for review, and a label
 * that does not exist in the taxonomy is rejected rather than written.
 *
 * This module is build-time only: nothing in js/ imports it.
 */

import { reconcile } from './taxonomy.mjs';
import { CLASSIFICATION_SOURCE_AI } from './rules.mjs';

export const DEFAULT_MIN_AI_CONFIDENCE = 0.6;

/**
 * Build the queue of questions that need semantic classification.
 * @param {object[]} rows classification rows (id, subject, flags, reason, candidates, excerpt)
 * @param {Map<string, object>} questionsById built-bank questions by id
 * @param {object} taxonomy
 */
export function buildAiQueue(rows, questionsById, taxonomy) {
  const allowedSubjects = Array.from(taxonomy.subjects.keys());
  return rows
    .filter((r) => !r.subject || r.flags?.includes('ambiguous_topic') || (r.confidence !== null && r.confidence < DEFAULT_MIN_AI_CONFIDENCE))
    .map((r) => {
      const q = questionsById.get(r.id) || {};
      const variant = q.language_variants?.en || Object.values(q.language_variants || {})[0] || {};
      return {
        id: r.id,
        paper_id: q.paper_id || null,
        year: q.year ?? null,
        reason: r.reason || (r.subject ? 'low_confidence' : 'unclassified'),
        candidates: r.candidates || [],
        question_text: variant.question_text || r.excerpt || '',
        options: (variant.options || []).map((o) => ({ key: o.key, text: o.text })),
        printed_answer: q.supplied_answer?.answer || null,
        explanation_excerpt: (q.explanation?.correct_reasoning || '').slice(0, 400) || null,
        allowed_subjects: allowedSubjects,
        instructions:
          'Reply with exactly one JSON object: {"subject": …, "topic": …, "subtopic": …, "confidence": 0-1, "rationale": "…"}. ' +
          'Only use subject/topic/subtopic values from the supplied taxonomy. ' +
          'Use null where the evidence does not support a level, and never guess a label to fill a field. ' +
          'The printed answer and explanation are context only — they are not proof that the key is correct.',
      };
    });
}

export function renderAiQueueJsonl(items) {
  return items.map((item) => JSON.stringify(item)).join('\n') + (items.length ? '\n' : '');
}

/** Parse a labels file: JSONL or a JSON array. */
export function parseLabels(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { labels: [], notes: ['the labels file was empty'] };
  if (trimmed.startsWith('[')) {
    try {
      const value = JSON.parse(trimmed);
      return { labels: Array.isArray(value) ? value : [], notes: [] };
    } catch (err) {
      return { labels: [], notes: [`the labels file is not valid JSON: ${err.message}`] };
    }
  }
  const labels = [];
  const notes = [];
  trimmed.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    try {
      labels.push(JSON.parse(line));
    } catch (err) {
      notes.push(`labels line ${i + 1} is not valid JSON and was skipped: ${err.message}`);
    }
  });
  return { labels, notes };
}

/**
 * Merge provider labels into an intake object.
 * Returns {applied, rejected, flagged, notes} and never overwrites a
 * classification the source file itself supplied unless `overwriteSource`.
 */
export function applyAiLabels(intake, labels, taxonomy, opts = {}) {
  const minConfidence = opts.minConfidence ?? DEFAULT_MIN_AI_CONFIDENCE;
  const provider = opts.provider || 'unknown-provider';
  const model = opts.model || null;
  const applied = [];
  const rejected = [];
  const flagged = [];
  const notes = [];
  const byId = new Map((intake.questions || []).map((q) => [q.id, q]));

  for (const label of labels) {
    if (!label || typeof label !== 'object') {
      rejected.push({ id: null, reason: 'label is not an object' });
      continue;
    }
    const question = byId.get(String(label.id));
    if (!question) {
      rejected.push({ id: label.id ?? null, reason: 'no question in the intake has this id' });
      continue;
    }
    // A classification the source file itself supplied is left alone — unless it
    // is not usable, in which case a provider label is strictly better than the
    // "unclassified" it would otherwise become.
    const sourceLabelUsable =
      typeof question.subject === 'string' &&
      question.subject &&
      reconcile(taxonomy, question.subject, question.topic || null, question.subtopic || null).subject !== null;
    const sourceLabelProtected =
      Boolean(question.classification_source) && !String(question.classification_source).startsWith('pipeline-') && Boolean(sourceLabelUsable);
    if (sourceLabelProtected && !opts.overwriteSource) {
      rejected.push({ id: question.id, reason: `the source already classified this question (${question.classification_source}); it was left alone` });
      continue;
    }
    const subject = typeof label.subject === 'string' && label.subject.trim() ? label.subject.trim() : null;
    if (!subject) {
      flagged.push({ id: question.id, reason: 'the provider returned no subject; the question stays unclassified' });
      question.subject = null;
      question.topic = null;
      question.subtopic = null;
      question.classification_confidence = null;
      question.classification_source = CLASSIFICATION_SOURCE_AI;
      continue;
    }
    const reconciled = reconcile(taxonomy, subject, label.topic || null, label.subtopic || null);
    if (!reconciled.subject) {
      rejected.push({ id: question.id, reason: `provider subject "${subject}" is not in the taxonomy` });
      continue;
    }
    if (reconciled.problems.length) {
      notes.push(`${question.id}: ${reconciled.problems.join('; ')}`);
    }
    let confidence = Number(label.confidence);
    if (!Number.isFinite(confidence)) confidence = null;
    else confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

    question.subject = reconciled.subject;
    question.topic = reconciled.topic;
    question.subtopic = reconciled.subtopic;
    question.classification_confidence = confidence;
    question.classification_source = CLASSIFICATION_SOURCE_AI;
    question.metadata = {
      ...(question.metadata || {}),
      ai_classification: {
        provider,
        model,
        raw_confidence: confidence,
        rationale: typeof label.rationale === 'string' ? label.rationale.slice(0, 500) : null,
        applied_at: new Date().toISOString(),
        ...(confidence !== null && confidence < minConfidence ? { needs_review: 'provider confidence below the review threshold' } : {}),
      },
    };
    if (confidence === null || confidence < minConfidence) flagged.push({ id: question.id, reason: 'provider confidence below the review threshold' });
    applied.push({ id: question.id, subject: reconciled.subject, topic: reconciled.topic, subtopic: reconciled.subtopic, confidence });
  }
  return { applied, rejected, flagged, notes };
}

/**
 * Read a provider configuration from the environment.
 *
 * No key is ever read from a file in the repository and no key is written into
 * any output: the key is passed straight into the request header of this
 * process. Without one the client refuses to run and says so, which is what the
 * pipeline does when a provider is not configured.
 */
export function providerConfig(env = process.env) {
  const provider = env.MYMPPSC_AI_PROVIDER || null;
  const apiKey = env.MYMPPSC_AI_API_KEY || null;
  const baseUrl = env.MYMPPSC_AI_BASE_URL || 'https://api.openai.com/v1';
  const model = env.MYMPPSC_AI_MODEL || 'gpt-4o-mini';
  if (!provider) return { ok: false, reason: 'MYMPPSC_AI_PROVIDER is not set, so no provider is configured.' };
  if (!apiKey) return { ok: false, reason: `${provider} is configured but MYMPPSC_AI_API_KEY is not set, so no request can be authenticated.` };
  return { ok: true, provider, apiKey, baseUrl, model };
}

/**
 * Ask a provider to label one queue item.
 * Returns {ok, label|reason}. Never throws: the caller records the failure and
 * the item stays in the queue for the next run.
 */
export async function labelOne(config, item, { fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  if (!config?.ok) return { ok: false, reason: config?.reason || 'no provider configured' };
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'this Node build has no fetch implementation' };
  const prompt = [
    'Classify this MPPSC prelims previous-year question using only the taxonomy supplied.',
    `Question: ${item.question_text}`,
    `Options: ${item.options.map((o) => `${o.key}. ${o.text}`).join(' | ')}`,
    item.printed_answer ? `Printed answer (context only, not proof): ${item.printed_answer.join(',')}` : 'Printed answer: not available',
    item.explanation_excerpt ? `Explanation (context only): ${item.explanation_excerpt}` : '',
    `Allowed subjects: ${item.allowed_subjects.join(', ')}`,
    item.instructions,
  ]
    .filter(Boolean)
    .join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You classify MPPSC prelims questions. You never invent a label; you return null when unsure.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `provider responded ${res.status}` };
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, reason: 'the provider returned an empty completion' };
    const parsed = JSON.parse(content);
    return { ok: true, label: { id: item.id, ...parsed, provider: config.provider, model: config.model } };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
