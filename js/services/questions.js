/**
 * questions.js — Question bank access and user corrections.
 *
 * The imported record is never rewritten in place: user classification edits,
 * verified answers, dispute flags and notes are appended as auditable correction
 * entries, and the original pipeline values stay available under
 * `classification.original`, `supplied`, and the correction history.
 */

import { STORES } from '../core/constants.js';
import * as db from '../core/db.js';
import { state, emit, refreshQuestionIndex, deriveClassificationTree } from '../core/state.js';
import { nowIso, logEvent, chunk } from '../core/util.js';
import { questionFingerprint, questionTextKey } from '../core/schema.js';

export async function getQuestion(id) {
  return db.get(STORES.QUESTIONS, id);
}

/** Fetch many questions efficiently in a single transaction. */
export async function getQuestions(ids) {
  const out = new Map();
  const list = Array.from(new Set(ids));
  if (!list.length) return out;
  const db0 = await db.getDb();
  for (const slice of chunk(list, 500)) {
    const tx = db0.transaction(STORES.QUESTIONS, 'readonly');
    const store = tx.objectStore(STORES.QUESTIONS);
    await Promise.all(
      slice.map(
        (id) =>
          new Promise((resolve) => {
            const req = store.get(id);
            req.onsuccess = () => {
              if (req.result) out.set(id, req.result);
              resolve();
            };
            req.onerror = () => resolve();
          }),
      ),
    );
  }
  return out;
}

export async function listQuestionIdsByPaper(paperId) {
  return db.getKeysByIndex(STORES.QUESTIONS, 'paper_id', paperId);
}

/* ------------------------------------------------------- user corrections -- */

async function withCorrection(id, mutator, { kind, note, before = null }) {
  const question = await db.get(STORES.QUESTIONS, id);
  if (!question) throw new Error(`Question ${id} is not in the local database.`);
  const entry = {
    at: nowIso(),
    kind,
    note: note || null,
    before: before ?? null,
    by: 'user',
  };
  mutator(question, entry);
  question.user_corrections = [...(question.user_corrections || []).slice(-49), entry];
  question.updated_at = nowIso();
  question.fingerprint = questionFingerprint(question);
  question.text_key = questionTextKey(question);
  await db.put(STORES.QUESTIONS, question);
  await refreshIndexEntry(question);
  logEvent('questions', `Correction recorded for ${id} (${kind})`);
  return question;
}

async function refreshIndexEntry(question) {
  state.questionIndex.set(question.id, {
    ...(state.questionIndex.get(question.id) || {}),
    id: question.id,
    paper_id: question.paper_id,
    year: question.year,
    set_code: question.set_code,
    question_number: question.question_number,
    question_type: question.question_type,
    subject: question.classification?.subject || null,
    topic: question.classification?.topic || null,
    subtopic: question.classification?.subtopic || null,
    unclassified: Boolean(question.classification?.isUnclassified),
    langs: Object.keys(question.language_variants || {}),
    answerStatus: question.supplied?.status || 'missing',
    hasSuppliedAnswer: Boolean(question.supplied?.answer?.length),
    hasVerifiedAnswer: Boolean(question.verified?.answer?.length),
    disputed: Boolean(question.dispute?.is_disputed) || question.supplied?.status === 'disputed',
    needsAttention: Boolean(!(question.supplied?.answer?.length || question.verified?.answer?.length) || question.dispute?.is_disputed),
    hasExplanation: Boolean(question.explanation),
    validationStatus: question.validation_status || 'unknown',
    demonstration: Boolean(question.is_demonstration),
    fingerprint: question.fingerprint,
    text_key: question.text_key,
    updated_at: question.updated_at,
  });
  // The subject → topic tree is derived from the index; rebuild it so a new
  // or renamed label shows up in the practice filters without a reload.
  state.subjects = deriveClassificationTree(state.questionIndex);
  emit('question:updated', { id: question.id });
  emit('bank:changed', { questions: state.questionIndex.size, papers: state.papers.size });
}

/**
 * Correct a question's classification. The imported labels are preserved.
 */
export async function updateClassification(id, { subject, topic, subtopic, note = null }) {
  const current = await db.get(STORES.QUESTIONS, id);
  if (!current) throw new Error(`Question ${id} is not in the local database.`);
  const before = {
    subject: current.classification?.subject ?? null,
    topic: current.classification?.topic ?? null,
    subtopic: current.classification?.subtopic ?? null,
  };
  return withCorrection(
    id,
    (question) => {
      const classification = question.classification || {};
      classification.original = classification.original || { ...before };
      classification.subject = subject ?? classification.subject ?? null;
      classification.topic = topic ?? classification.topic ?? null;
      classification.subtopic = subtopic ?? classification.subtopic ?? null;
      classification.userEditedAt = nowIso();
      classification.isUnclassified = !classification.subject && !classification.topic;
      question.classification = classification;
    },
    { kind: 'classification', note, before },
  );
}

/** The labels a question carries now, with the marker that says the reader set them. */
function classificationSnapshot(question) {
  const c = question?.classification || {};
  return { subject: c.subject ?? null, topic: c.topic ?? null, subtopic: c.subtopic ?? null, userEditedAt: c.userEditedAt ?? null };
}

const cleanLabel = (value) => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text || null;
};

/**
 * Give many questions the same subject and/or topic (the Question Bank's bulk
 * action). Each question goes through updateClassification() — the same
 * existence check, correction entry and preserved imported labels as editing
 * one question by hand — one at a time. A blank field keeps each question's
 * own value, exactly as in the single-question editor.
 *
 * Questions that already carry the requested labels are left alone: no empty
 * correction is recorded, and they keep following updates of the bank they
 * came from. For every question that did change, the labels it had before are
 * returned, which is what restoreClassifications() needs to undo the batch.
 *
 * @returns {Promise<{changed: Array<{id, before, after}>, unchanged: string[], failed: Array<{id, reason}>}>}
 */
export async function updateClassifications(ids, { subject = null, topic = null, note = null } = {}) {
  const nextSubject = cleanLabel(subject);
  const nextTopic = cleanLabel(topic);
  if (!nextSubject && !nextTopic) throw new Error('Enter a subject, a topic, or both.');
  const list = Array.from(new Set((ids || []).filter(Boolean)));
  const stored = await getQuestions(list);
  const changed = [];
  const unchanged = [];
  const failed = [];
  for (const id of list) {
    const question = stored.get(id);
    if (!question) {
      failed.push({ id, reason: 'This question is no longer stored.' });
      continue;
    }
    const before = classificationSnapshot(question);
    if ((nextSubject ?? before.subject) === before.subject && (nextTopic ?? before.topic) === before.topic) {
      unchanged.push(id);
      continue;
    }
    try {
      const updated = await updateClassification(id, { subject: nextSubject, topic: nextTopic, note });
      changed.push({ id, before, after: classificationSnapshot(updated) });
    } catch (err) {
      failed.push({ id, reason: err.message });
    }
  }
  if (changed.length) logEvent('questions', `Bulk classification change applied to ${changed.length} question(s)`);
  return { changed, unchanged, failed };
}

/**
 * Put a question's classification back exactly as a snapshot recorded it —
 * the undo for updateClassifications(). Unlike updateClassification(), a null
 * restores "no label", and the edit marker comes back too: a question that
 * carried its imported labels before the batch carries them again and keeps
 * following bank updates. Recorded as a correction like any other edit; the
 * imported labels under `classification.original` are never touched.
 */
export async function restoreClassification(id, snapshot, { note = null } = {}) {
  const current = await db.get(STORES.QUESTIONS, id);
  if (!current) throw new Error(`Question ${id} is not in the local database.`);
  const { subject, topic, subtopic } = classificationSnapshot(current);
  return withCorrection(
    id,
    (question) => {
      const classification = question.classification || {};
      classification.original = classification.original || { subject, topic, subtopic };
      classification.subject = snapshot?.subject ?? null;
      classification.topic = snapshot?.topic ?? null;
      classification.subtopic = snapshot?.subtopic ?? null;
      classification.userEditedAt = snapshot?.userEditedAt ?? null;
      classification.isUnclassified = !classification.subject && !classification.topic;
      question.classification = classification;
    },
    { kind: 'classification_restored', note, before: { subject, topic, subtopic } },
  );
}

/**
 * Undo a batch made by updateClassifications(). A question whose labels have
 * changed again since the batch — edited by hand, or refreshed by a bank
 * update — is skipped rather than overwritten, so an undo never discards
 * newer work. Deleted questions are skipped too.
 */
export async function restoreClassifications(changes = [], { note = null } = {}) {
  const restored = [];
  const skipped = [];
  const stored = await getQuestions(changes.map((c) => c.id));
  for (const change of changes) {
    const question = stored.get(change.id);
    if (!question) {
      skipped.push({ id: change.id, reason: 'This question is no longer stored.' });
      continue;
    }
    const now = classificationSnapshot(question);
    const after = change.after;
    if (after && (now.subject !== after.subject || now.topic !== after.topic || now.subtopic !== after.subtopic)) {
      skipped.push({ id: change.id, reason: 'Its labels were changed again after the batch.' });
      continue;
    }
    try {
      await restoreClassification(change.id, change.before, { note });
      restored.push(change.id);
    } catch (err) {
      skipped.push({ id: change.id, reason: err.message });
    }
  }
  return { restored, skipped };
}

/**
 * Delete questions from the local bank. This is the one path behind the
 * question editor's Delete button, the duplicate review and the bulk action.
 * Ids that are already gone are reported rather than treated as an error.
 * Attempts recorded against a deleted question stay in the history (they no
 * longer resolve to a question); nothing else is touched.
 *
 * @returns {Promise<{deleted: string[], missing: string[]}>}
 */
export async function deleteQuestions(ids) {
  const list = Array.from(new Set((ids || []).filter(Boolean)));
  if (!list.length) return { deleted: [], missing: [] };
  const stored = await getQuestions(list);
  const deleted = list.filter((id) => stored.has(id));
  const missing = list.filter((id) => !stored.has(id));
  if (deleted.length) await db.removeMany(STORES.QUESTIONS, deleted);
  await refreshQuestionIndex({ silent: true });
  // The header's bank pill listens for this; a silent rebuild alone left it stale.
  emit('bank:changed', { questions: state.questionIndex.size, papers: state.papers.size });
  logEvent('questions', `Deleted ${deleted.length} question(s)`);
  return { deleted, missing };
}

/** Restore the imported classification for a question. */
export async function revertClassification(id) {
  const current = await db.get(STORES.QUESTIONS, id);
  if (!current?.classification?.original) throw new Error('No original classification recorded for this question.');
  const original = current.classification.original;
  return withCorrection(
    id,
    (question) => {
      question.classification.subject = original.subject ?? null;
      question.classification.topic = original.topic ?? null;
      question.classification.subtopic = original.subtopic ?? null;
      question.classification.isUnclassified = !original.subject && !original.topic;
      question.classification.userEditedAt = null;
    },
    { kind: 'classification_reverted', note: 'Restored the imported classification.', before: { subject: current.classification.subject, topic: current.classification.topic, subtopic: current.classification.subtopic } },
  );
}

/**
 * Record an independently verified answer. The supplied key is untouched.
 */
export async function setVerifiedAnswer(id, { answer, evidence = [], verifiedBy = 'you', status = 'verified', note = null }) {
  const clean = (answer || []).map((a) => String(a).trim()).filter(Boolean);
  if (!clean.length) throw new Error('A verified answer needs at least one option key.');
  const current = await db.get(STORES.QUESTIONS, id);
  if (!current) throw new Error(`Question ${id} is not in the local database.`);
  const optionKeys = new Set(Object.values(current.language_variants || {}).flatMap((v) => (v.options || []).map((o) => o.key)));
  const invalid = clean.filter((a) => !optionKeys.has(a));
  if (invalid.length) throw new Error(`These option keys do not exist on the question: ${invalid.join(', ')}`);
  return withCorrection(
    id,
    (question) => {
      const previous = question.verified ? { answer: question.verified.answer, verified_by: question.verified.verified_by, verified_at: question.verified.verified_at } : null;
      const existingEvidence = question.verified?.evidence || question.verification_evidence || [];
      question.verified = {
        answer: clean,
        status,
        verified_by: verifiedBy,
        verified_at: nowIso(),
        evidence: [...existingEvidence, ...(evidence || [])],
        source: 'user_correction',
        previous,
      };
      question.verification_evidence = question.verified.evidence;
    },
    { kind: 'verified_answer', note, before: current.verified?.answer || null },
  );
}

export async function clearVerifiedAnswer(id, note = null) {
  return withCorrection(
    id,
    (question) => {
      question.verified = null;
    },
    { kind: 'verified_answer_cleared', note, before: null },
  );
}

export async function setDispute(id, { isDisputed, status = null, reason = null }) {
  return withCorrection(
    id,
    (question) => {
      question.dispute = {
        ...(question.dispute || {}),
        is_disputed: Boolean(isDisputed),
        status: isDisputed ? status || 'open' : null,
        reason: reason || question.dispute?.reason || null,
        raised_by: isDisputed ? 'user' : question.dispute?.raised_by || null,
      };
      if (isDisputed && question.supplied) question.supplied.status = 'disputed';
    },
    { kind: 'dispute', note: reason, before: null },
  );
}

/** Free-text note kept with the question for future reference. */
export async function addNote(id, note) {
  return withCorrection(id, () => {}, { kind: 'note', note });
}

export function correctionHistory(question) {
  return (question?.user_corrections || []).slice().reverse();
}

/** Small summary used by the Question Bank screen. */
export function bankSummary() {
  const metas = Array.from(state.questionIndex.values());
  const bySubject = new Map();
  const byYear = new Map();
  const byAnswerStatus = {};
  const byType = {};
  let bilingual = 0;
  let unclassified = 0;
  let needsAttention = 0;
  let demonstration = 0;
  let withExplanation = 0;
  for (const m of metas) {
    const subject = m.subject || 'Unclassified';
    bySubject.set(subject, (bySubject.get(subject) || 0) + 1);
    const year = m.year === null || m.year === undefined ? 'unknown' : String(m.year);
    byYear.set(year, (byYear.get(year) || 0) + 1);
    byAnswerStatus[m.answerStatus || 'unknown'] = (byAnswerStatus[m.answerStatus || 'unknown'] || 0) + 1;
    byType[m.question_type || 'other'] = (byType[m.question_type || 'other'] || 0) + 1;
    if (m.langs.includes('en') && m.langs.includes('hi')) bilingual += 1;
    if (m.unclassified) unclassified += 1;
    if (m.needsAttention) needsAttention += 1;
    if (m.demonstration) demonstration += 1;
    if (m.hasExplanation) withExplanation += 1;
  }
  return {
    total: metas.length,
    bilingual,
    unclassified,
    needsAttention,
    demonstration,
    withExplanation,
    bySubject: Array.from(bySubject.entries()).sort((a, b) => b[1] - a[1]),
    byYear: Array.from(byYear.entries()).sort((a, b) => String(b[0]).localeCompare(String(a[0]))),
    byAnswerStatus,
    byType,
    papers: state.papers.size,
  };
}
