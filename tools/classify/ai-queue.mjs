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
 * Every valid subject → topic → subtopic combination in the taxonomy, as
 * "Subject > Topic > Subtopic" strings. This is the closed vocabulary a provider
 * may choose from: anything outside it is rejected at merge time.
 */
export function taxonomyCombinations(taxonomy) {
  const out = [];
  for (const [subject, topics] of taxonomy.subjects) {
    for (const [topic, subtopics] of topics) {
      if (!subtopics.length) out.push(`${subject} > ${topic}`);
      for (const subtopic of subtopics) out.push(`${subject} > ${topic} > ${subtopic}`);
    }
  }
  return out;
}

/**
 * The taxonomy sidecar written next to the queue file. It is shared by every
 * queue item so the queue stays small, and it carries no timestamp so re-running
 * the pipeline produces byte-identical output.
 */
export function renderAiTaxonomy(taxonomy) {
  return JSON.stringify(
    {
      taxonomy_version: taxonomy.version || null,
      description: 'Closed vocabulary for the AI classification queue. A response that does not match one of these combinations exactly is rejected at merge time, never stored.',
      combinations: taxonomyCombinations(taxonomy),
      subjects: Array.from(taxonomy.subjects.entries()).map(([subject, topics]) => ({
        subject,
        topics: Array.from(topics.entries()).map(([topic, subtopics]) => ({ topic, subtopics })),
      })),
    },
    null,
    2,
  );
}

/**
 * Build the queue of questions that need semantic classification.
 * @param {object[]} rows classification rows (id, subject, flags, reason, candidates, excerpt)
 * @param {Map<string, object>} questionsById built-bank questions by id
 * @param {object} taxonomy
 * @param {{taxonomyRef?: string, inlineTaxonomy?: boolean}} opts
 */
export function buildAiQueue(rows, questionsById, taxonomy, opts = {}) {
  const allowedSubjects = Array.from(taxonomy.subjects.keys());
  const combinations = opts.inlineTaxonomy ? taxonomyCombinations(taxonomy) : null;
  const taxonomyRef = opts.taxonomyRef || 'ai-queue.taxonomy.json';
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
        taxonomy_version: taxonomy.version || null,
        // The full combination list lives in one shared file; every request is
        // built with it (see labelOne). `inlineTaxonomy` embeds it per item for
        // callers that need a self-contained queue.
        ...(combinations ? { allowed_combinations: combinations } : { taxonomy_ref: taxonomyRef }),
        instructions:
          'Reply with exactly one JSON object: {"subject": …, "topic": …, "subtopic": …, "confidence": 0-1, "rationale": "…"}. ' +
          'subject, topic and subtopic must be copied exactly from the supplied taxonomy combination list; ' +
          'a value that is not in that list is rejected and the question stays unclassified. ' +
          'Use null where the evidence does not support a level, and never guess a label to fill a field. ' +
          'The printed answer and explanation are context only — they are not proof that the key is correct.',
      };
    });
}

/**
 * The queue items that still need a label, i.e. the queue minus the ids that
 * already have one. Used to resume an interrupted run without redoing or
 * duplicating work.
 */
export function pendingQueueItems(queue, existingLabels = []) {
  const done = new Set((existingLabels || []).map((l) => String(l?.id)).filter((id) => id !== 'undefined'));
  return (queue || []).filter((item) => !done.has(String(item.id)));
}

export function renderAiQueueJsonl(items) {
  return items.map((item) => JSON.stringify(item)).join('\n') + (items.length ? '\n' : '');
}

/**
 * Parse a labels file: JSONL or a JSON array.
 * Malformed lines are never dropped silently — each one is returned in
 * `malformed` so the review report can list it.
 */
export function parseLabels(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { labels: [], notes: ['the labels file was empty'], malformed: [] };
  if (trimmed.startsWith('[')) {
    try {
      const value = JSON.parse(trimmed);
      if (!Array.isArray(value)) {
        return {
          labels: [],
          notes: ['the labels file is a JSON object, not an array; nothing was read'],
          malformed: [{ line: 0, reason: 'expected a JSON array or one JSON object per line', excerpt: trimmed.slice(0, 120) }],
        };
      }
      return { labels: value, notes: [], malformed: [] };
    } catch (err) {
      return {
        labels: [],
        notes: [`the labels file is not valid JSON: ${err.message}`],
        malformed: [{ line: 0, reason: err.message, excerpt: trimmed.slice(0, 120) }],
      };
    }
  }
  const labels = [];
  const notes = [];
  const malformed = [];
  trimmed.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return; // blank line, nothing to report
    let value;
    try {
      value = JSON.parse(line);
    } catch (err) {
      notes.push(`labels line ${i + 1} is not valid JSON and was skipped: ${err.message}`);
      malformed.push({ line: i + 1, reason: `not valid JSON: ${err.message}`, excerpt: line.slice(0, 120) });
      return;
    }
    // A line that is not a labelled object is reported with its line number
    // here, where the operator can find it, instead of surfacing later as an
    // anonymous rejection.
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      const reason = 'a provider label line must be a JSON object';
      notes.push(`labels line ${i + 1} ${reason} and was skipped`);
      malformed.push({ line: i + 1, reason, excerpt: line.slice(0, 120) });
      return;
    }
    if (value.id === null || value.id === undefined || String(value.id).trim() === '') {
      const reason = 'a provider label line must carry an "id"';
      notes.push(`labels line ${i + 1} ${reason} and was skipped`);
      malformed.push({ line: i + 1, reason, excerpt: line.slice(0, 120) });
      return;
    }
    labels.push(value);
  });
  return { labels, notes, malformed };
}

/** Trim a label field to a non-empty string, or null. Anything else is refused. */
function labelString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** What the record already carries, reduced to what preservation needs. */
function existingClassification(question) {
  const usable =
    typeof question.subject === 'string' && question.subject.trim() !== ''
      ? { subject: question.subject, topic: question.topic || null, subtopic: question.subtopic || null }
      : null;
  return usable;
}

/**
 * Merge provider labels into an intake object.
 *
 * The merge is deliberately conservative: a response that is empty, malformed or
 * carries a label the taxonomy does not contain changes nothing. An existing
 * subject/topic/subtopic is only replaced by a value that validates, and any
 * level that cannot be validated is either preserved (when it still fits) or
 * dropped with the reason recorded. Every response produces exactly one entry in
 * `decisions`, which the review report prints.
 *
 * @returns {{applied: object[], rejected: object[], flagged: object[], preserved: object[], decisions: object[], malformed: object[], notes: string[]}}
 */
export function applyAiLabels(intake, labels, taxonomy, opts = {}) {
  const minConfidence = opts.minConfidence ?? DEFAULT_MIN_AI_CONFIDENCE;
  const provider = opts.provider || 'unknown-provider';
  const model = opts.model || null;
  const applied = [];
  const rejected = [];
  const flagged = [];
  const preserved = [];
  const decisions = [];
  const notes = [];
  const malformed = (opts.malformed || []).map((m) => ({ line: m.line ?? null, reason: m.reason || 'not valid JSON', excerpt: m.excerpt || null }));
  const byId = new Map((intake.questions || []).map((q) => [q.id, q]));

  for (const label of Array.isArray(labels) ? labels : []) {
    if (label === null || typeof label !== 'object' || Array.isArray(label)) {
      rejected.push({ id: null, reason: 'the response is not a JSON object' });
      decisions.push({ id: null, action: 'rejected', reason: 'the response is not a JSON object', before: null, after: null });
      continue;
    }
    const id = label.id === null || label.id === undefined ? null : String(label.id).trim() || null;
    const question = id ? byId.get(id) : null;
    if (!question) {
      rejected.push({ id: id ?? null, reason: 'no question in the intake has this id' });
      decisions.push({ id: id ?? null, action: 'rejected', reason: 'no question in the intake has this id', before: null, after: null });
      continue;
    }
    const before = existingClassification(question);
    // A classification the source file itself supplied is left alone — unless it
    // is not usable, in which case a provider label is strictly better than the
    // "unclassified" it would otherwise become.
    const sourceLabelUsable = Boolean(before) && reconcile(taxonomy, before.subject, before.topic, before.subtopic).subject !== null;
    const sourceLabelProtected =
      Boolean(question.classification_source) && !String(question.classification_source).startsWith('pipeline-') && sourceLabelUsable;
    if (sourceLabelProtected && !opts.overwriteSource) {
      const reason = `the source already classified this question (${question.classification_source}); it was left alone`;
      rejected.push({ id: question.id, reason });
      decisions.push({ id: question.id, action: 'rejected', reason, before, after: before });
      continue;
    }

    /* ---------------------------------------------------- unusable reply -- */
    // No subject at all (null, empty, missing or a non-string). Nothing is
    // erased: whatever the record already had — including a rule-engine result
    // that has not run yet — is left exactly as it was.
    if (label.subject !== undefined && label.subject !== null && typeof label.subject !== 'string') {
      const kind = Array.isArray(label.subject) ? 'an array' : `a ${typeof label.subject}`;
      const reason = `the response subject must be a string or null but was ${kind}; nothing was changed`;
      rejected.push({ id: question.id, reason });
      decisions.push({ id: question.id, action: 'rejected', reason, before, after: before });
      continue;
    }
    const subject = labelString(label.subject);
    if (!subject) {
      const reason = before
        ? `the provider returned no subject; the existing classification (${before.subject}) was kept`
        : 'the provider returned no subject; the question stays unclassified and remains in the queue';
      flagged.push({ id: question.id, reason });
      // `preserved` means "a classification that was already there is still
      // there". A record with nothing to preserve is only flagged.
      if (before) preserved.push({ id: question.id, subject: before.subject, topic: before.topic, subtopic: before.subtopic, reason });
      decisions.push({ id: question.id, action: before ? 'preserved' : 'no_label', reason, before, after: before });
      continue;
    }

    /* ------------------------------------------------------- validation --- */
    const reconciled = reconcile(taxonomy, subject, labelString(label.topic), labelString(label.subtopic));
    if (!reconciled.subject) {
      const reason = `provider subject "${subject}" is not in the taxonomy; the record was not changed`;
      rejected.push({ id: question.id, reason });
      decisions.push({ id: question.id, action: 'rejected', reason, before, after: before });
      continue;
    }
    if (reconciled.problems.length) notes.push(`${question.id}: ${reconciled.problems.join('; ')}`);

    const mergeNotes = [];
    let topic = reconciled.topic;
    let subtopic = reconciled.subtopic;
    const topicsForSubject = taxonomy.subjects.get(reconciled.subject) || new Map();
    const sameSubject = Boolean(before) && before.subject === reconciled.subject;

    if (!topic) {
      if (labelString(label.topic)) {
        mergeNotes.push(`provider topic "${labelString(label.topic)}" is not valid under "${reconciled.subject}" and was not stored`);
      } else {
        mergeNotes.push('the provider sent no topic');
      }
      // Keep the existing topic only if the subject did not move and the old
      // topic is still a real topic of the (unchanged) subject.
      if (sameSubject && before.topic && topicsForSubject.has(before.topic)) {
        topic = before.topic;
        mergeNotes.push(`the existing topic "${before.topic}" was kept`);
      }
    }
    if (topic) {
      const allowedSubtopics = topicsForSubject.get(topic) || [];
      if (!subtopic) {
        if (labelString(label.subtopic)) {
          mergeNotes.push(`provider subtopic "${labelString(label.subtopic)}" is not valid under "${reconciled.subject} / ${topic}" and was not stored`);
        }
        if (sameSubject && before.topic === topic && before.subtopic && allowedSubtopics.includes(before.subtopic)) {
          subtopic = before.subtopic;
          mergeNotes.push(`the existing subtopic "${before.subtopic}" was kept`);
        }
      }
    } else {
      subtopic = null;
    }
    for (const note of mergeNotes) notes.push(`${question.id}: ${note}`);

    let confidence = Number(label.confidence);
    const confidenceUsable = label.confidence !== null && label.confidence !== undefined && Number.isFinite(confidence);
    if (!confidenceUsable) {
      confidence = null;
      if (label.confidence !== null && label.confidence !== undefined) mergeNotes.push('the provider confidence was not a number and was recorded as null');
    } else {
      confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
    }

    const keptFromExisting = mergeNotes.some((n) => /was kept/.test(n));
    const after = { subject: reconciled.subject, topic, subtopic };
    question.subject = after.subject;
    question.topic = after.topic;
    question.subtopic = after.subtopic;
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
        ...(mergeNotes.length ? { merge_notes: mergeNotes } : {}),
        ...(keptFromExisting ? { preserved_from_existing: true } : {}),
        ...(confidence === null || confidence < minConfidence ? { needs_review: 'provider confidence below the review threshold' } : {}),
      },
    };
    if (confidence === null || confidence < minConfidence) {
      flagged.push({ id: question.id, reason: confidence === null ? 'the provider gave no usable confidence' : 'provider confidence below the review threshold' });
    }
    const action = keptFromExisting ? 'partial' : 'applied';
    applied.push({ id: question.id, subject: after.subject, topic: after.topic, subtopic: after.subtopic, confidence, action });
    if (keptFromExisting) preserved.push({ id: question.id, subject: after.subject, topic: after.topic, subtopic: after.subtopic, reason: mergeNotes.filter((n) => /was kept/.test(n)).join('; ') });
    decisions.push({
      id: question.id,
      action,
      reason: mergeNotes.join('; ') || null,
      before,
      after,
      confidence,
      rejected_levels: mergeNotes.filter((n) => /was not stored/.test(n)).length,
    });
  }
  return { applied, rejected, flagged, preserved, decisions, malformed, notes };
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
 * Returns {ok, label|reason, warning?}. Never throws: the caller records the
 * failure and the item stays in the queue for the next run.
 *
 * The request always carries the closed vocabulary — the full list of valid
 * subject → topic → subtopic combinations — so the provider cannot be asked for
 * a label the taxonomy does not contain. `allowedCombinations` overrides the
 * item's own list; the merge step re-validates whatever comes back regardless.
 */
export async function labelOne(config, item, { fetchImpl = globalThis.fetch, timeoutMs = 30000, allowedCombinations = null } = {}) {
  if (!config?.ok) return { ok: false, reason: config?.reason || 'no provider configured' };
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'this Node build has no fetch implementation' };
  const combinations = Array.isArray(allowedCombinations) && allowedCombinations.length ? allowedCombinations : item.allowed_combinations || null;
  const vocabulary = combinations
    ? `Valid subject > topic > subtopic combinations (taxonomy ${item.taxonomy_version || 'unknown'}; copy one exactly, anything else is rejected):\n${combinations.join('\n')}`
    : `Allowed subjects: ${(item.allowed_subjects || []).join(', ')}`;
  const prompt = [
    'Classify this MPPSC prelims previous-year question using only the taxonomy supplied.',
    `Question: ${item.question_text}`,
    `Options: ${(item.options || []).map((o) => `${o.key}. ${o.text}`).join(' | ')}`,
    item.printed_answer ? `Printed answer (context only, not proof): ${item.printed_answer.join(',')}` : 'Printed answer: not available',
    item.explanation_excerpt ? `Explanation (context only): ${item.explanation_excerpt}` : '',
    vocabulary,
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
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      return { ok: false, reason: `the provider response is not valid JSON: ${err.message}` };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'the provider response is not a JSON object' };
    }
    const label = { id: item.id, ...parsed, provider: config.provider, model: config.model };
    // The authoritative check happens in applyAiLabels against the real
    // taxonomy; this warning only tells the operator immediately.
    let warning = null;
    if (combinations && typeof parsed.subject === 'string' && parsed.subject.trim()) {
      const prefix = `${parsed.subject.trim()} > `;
      if (!combinations.some((c) => c === parsed.subject.trim() || c.startsWith(prefix))) {
        warning = `subject "${parsed.subject}" is not in the taxonomy; the merge step will reject it`;
      }
    }
    return { ok: true, label, ...(warning ? { warning } : {}) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
