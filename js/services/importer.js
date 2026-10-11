/**
 * importer.js — Question-bank import workflow.
 *
 * The workflow is deliberately two-phase:
 *   1. analyse  — parse + validate + compare with what is already stored, and
 *                 produce a summary the user can read before anything is written.
 *   2. execute  — write only after the user confirms; never touch unrelated data.
 *
 * Nothing is silently discarded: rejected records, duplicate ids, missing
 * questions, invalid answer references and unmatched paper metadata are all
 * reported with a reason.
 */

import { STORES } from '../core/constants.js';
import * as db from '../core/db.js';
import { state, emit, refreshQuestionIndex } from '../core/state.js';
import { parseJsonText, validateBank, compareWithExisting, summariseReport } from '../core/validate.js';
import { uid, nowIso, logEvent } from '../core/util.js';

export async function sha256Hex(text) {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

/** Existing local state, reduced to what duplicate detection needs. */
export async function buildExistingIndex() {
  const [ids, questions, papers] = await Promise.all([db.getAllKeys(STORES.QUESTIONS), db.getAll(STORES.QUESTIONS), db.getAll(STORES.PAPERS)]);
  const fingerprints = new Map();
  for (const q of questions) {
    const list = fingerprints.get(q.fingerprint) || [];
    list.push(q.id);
    fingerprints.set(q.fingerprint, list);
  }
  return { ids: new Set(ids), fingerprints, paperIds: papers.map((p) => p.paper_id), paperById: new Map(papers.map((p) => [p.paper_id, p])) };
}

/**
 * Phase 1 — analyse a bank file.
 * @param {string} text raw file text
 * @param {{filename?: string, nearDuplicateThreshold?: number}} opts
 */
export async function analyseBankFile(text, opts = {}) {
  const parsed = parseJsonText(text);
  const fileSha256 = await sha256Hex(text);
  if (!parsed.ok) {
    return {
      stage: 'error',
      filename: opts.filename || null,
      fileSha256,
      fatalMessage: `The file is not valid JSON and was not imported. Parser said: ${parsed.error}`,
      report: null,
    };
  }
  return analyseBankObject(parsed.value, { ...opts, fileSha256 });
}

export async function analyseBankObject(raw, opts = {}) {
  const threshold = opts.nearDuplicateThreshold ?? state.settings?.repeatPolicy?.nearDuplicateThreshold ?? 0.62;
  const report = validateBank(raw, { nearDuplicateThreshold: threshold });
  const existing = await buildExistingIndex();
  const comparison = compareWithExisting(report, existing);
  const previouslyImported = report.meta.bankId
    ? (await db.getAll(STORES.IMPORTS)).filter((r) => r.bank_id === report.meta.bankId)
    : [];
  const sameFile = opts.fileSha256 ? previouslyImported.find((r) => r.file_sha256 === opts.fileSha256) : null;

  return {
    stage: report.fatal.length ? 'blocked' : 'ready',
    filename: opts.filename || null,
    fileSha256: opts.fileSha256 || null,
    fatalMessage: report.fatal.length ? report.fatal.map((f) => f.message).join(' ') : null,
    report,
    comparison,
    previouslyImported: previouslyImported.slice(0, 5),
    sameFilePreviouslyImportedAt: sameFile ? sameFile.imported_at : null,
    summaryText: summariseReport(report),
  };
}

/**
 * Phase 2 — write the analysed bank.
 * @param {object} analysis result of analyseBankFile/Object
 * @param {object} options {mode: 'merge'|'skip-existing'|'update-existing', conflictPolicy, userConfirmed}
 */
export async function executeImport(analysis, options = {}) {
  if (!analysis || analysis.stage === 'error' || analysis.stage === 'blocked') {
    throw new Error('This bank did not pass validation, so nothing was imported.');
  }
  const { report } = analysis;
  if (!report) throw new Error('Nothing to import.');
  const conflictPolicy = options.conflictPolicy || 'skip'; // skip | update | keep_both
  const existing = await buildExistingIndex();

  const stats = { papersAdded: 0, papersUpdated: 0, questionsAdded: 0, questionsUpdated: 0, questionsSkipped: 0, questionsKeptBoth: 0 };
  const keptBothIds = [];

  /* -------------------------------------------------------------- papers -- */
  const papersToWrite = [];
  for (const paper of report.papers) {
    const prior = existing.paperById.get(paper.paper_id);
    if (!prior) {
      papersToWrite.push({ ...paper, import_history: [{ at: nowIso(), bank_id: report.meta.bankId, filename: analysis.filename || null, action: 'created' }] });
      stats.papersAdded += 1;
    } else {
      const merged = {
        ...prior,
        ...paper,
        // keep any user-configured override of the original scoring rules
        scoring: prior.user_scoring_override ? prior.scoring : paper.scoring,
        user_scoring_override: prior.user_scoring_override || null,
        imported_at: prior.imported_at,
        updated_at: nowIso(),
        import_history: [...(prior.import_history || []).slice(-19), { at: nowIso(), bank_id: report.meta.bankId, filename: analysis.filename || null, action: 'updated' }],
      };
      papersToWrite.push(merged);
      stats.papersUpdated += 1;
    }
  }

  /* ----------------------------------------------------------- questions -- */
  const questionsToWrite = [];
  const skipped = [];
  for (const question of report.questions) {
    const prior = existing.ids.has(question.id) ? await db.get(STORES.QUESTIONS, question.id) : null;
    if (!prior) {
      questionsToWrite.push({ ...question, import_history: [{ at: nowIso(), bank_id: report.meta.bankId, action: 'created' }] });
      stats.questionsAdded += 1;
      continue;
    }
    const identical = prior.fingerprint === question.fingerprint;
    if (identical) {
      stats.questionsSkipped += 1;
      skipped.push({ id: question.id, reason: 'Already stored with identical text and options.' });
      continue;
    }
    if (conflictPolicy === 'skip') {
      stats.questionsSkipped += 1;
      skipped.push({ id: question.id, reason: 'Already stored with different content; kept the stored version (conflict policy: keep existing).' });
      continue;
    }
    if (conflictPolicy === 'keep_both') {
      const newId = `${question.id}~imp-${Date.now().toString(36)}`;
      questionsToWrite.push({ ...question, id: newId, duplicate_of: question.id, import_history: [{ at: nowIso(), bank_id: report.meta.bankId, action: 'created_as_duplicate', original_id: question.id }] });
      stats.questionsKeptBoth += 1;
      keptBothIds.push({ original: question.id, imported_as: newId });
      continue;
    }
    questionsToWrite.push(mergeImportedQuestion(prior, question, report.meta.bankId));
    stats.questionsUpdated += 1;
  }

  /* ---------------------------------------------------------------- write -- */
  if (papersToWrite.length) await db.putMany(STORES.PAPERS, papersToWrite);
  if (questionsToWrite.length) {
    await db.putMany(STORES.QUESTIONS, questionsToWrite, {
      onProgress: (done, total) => emit('import:progress', { done, total }),
    });
  }

  const importRecord = {
    id: uid('import'),
    bank_id: report.meta.bankId,
    bank_name: report.meta.bankName,
    schema_version: report.meta.schemaVersion,
    filename: analysis.filename || null,
    file_sha256: analysis.fileSha256 || null,
    imported_at: nowIso(),
    mode: options.mode || 'merge',
    conflict_policy: conflictPolicy,
    is_demonstration: Boolean(report.meta.demoFlag),
    provenance: report.meta.provenance || null,
    generator: report.meta.generator || null,
    counts: {
      ...stats,
      rejectedRecords: report.rejected.length,
      warnings: report.warnings.length,
      errors: report.errors.length,
      papersInBank: report.papers.length,
      questionsInBank: report.questions.length,
    },
    validation_status: report.fatal.length ? 'invalid' : report.errors.length || report.rejected.length || report.warnings.length ? 'valid_with_warnings' : 'valid',
    issues: [...report.fatal, ...report.errors, ...report.warnings].slice(0, 200),
    info: report.infos.slice(0, 100),
    skipped: skipped.slice(0, 200),
    kept_both: keptBothIds,
    placeholder_papers: report.placeholderPapers,
    duplicate_ids: report.duplicateIds,
    near_duplicates: report.nearDuplicates.slice(0, 50),
    stats: report.stats,
  };
  await db.put(STORES.IMPORTS, importRecord);

  const rejected = report.rejected.slice(0, 200).map((r) => ({
    id: r.id,
    index: r.index,
    reason: r.reason,
    issues: [...report.errors, ...report.fatal].filter((e) => e.questionId === r.id || e.ids?.includes(r.id)).map((e) => e.message).slice(0, 4),
  }));
  await db.setMeta('last_import', { at: importRecord.imported_at, bank_id: importRecord.bank_id, counts: importRecord.counts });

  await refreshQuestionIndex({ silent: true });
  emit('bank:changed', { questions: state.questionIndex.size, papers: state.papers.size });
  logEvent('import', `Imported bank ${importRecord.bank_id}: +${stats.questionsAdded} questions, ${stats.papersAdded} papers`);

  return { importRecord, stats, rejected, skipped };
}

/**
 * Merge a re-imported question over a stored one without destroying user work.
 * Imported source fields are refreshed; user corrections, user-set verified
 * answers and locally authored explanations are preserved.
 */
export function mergeImportedQuestion(prior, incoming, bankId) {
  const userEditedClassification = prior.classification?.source === 'user_correction';
  const userVerified = prior.verified?.source === 'user_correction';
  return {
    ...incoming,
    // preserve user work
    classification: userEditedClassification
      ? {
          ...prior.classification,
          pipeline_latest: { subject: incoming.classification.subject, topic: incoming.classification.topic, subtopic: incoming.classification.subtopic, confidence: incoming.classification.confidence, source: incoming.classification.source, at: nowIso() },
        }
      : incoming.classification,
    verified: userVerified ? prior.verified : incoming.verified || prior.verified || null,
    dispute: prior.dispute?.raised_by === 'user' ? prior.dispute : incoming.dispute || prior.dispute || null,
    explanation: incoming.explanation || prior.explanation || null,
    explanation_status: incoming.explanation ? incoming.explanation_status : prior.explanation_status || 'missing',
    user_corrections: [
      ...(prior.user_corrections || []),
      { at: nowIso(), kind: 'reimported', note: `Source record refreshed from bank ${bankId || 'unknown'}; your classification/verification edits were preserved.`, before: null, by: 'system' },
    ],
    import_history: [...(prior.import_history || []).slice(-19), { at: nowIso(), bank_id: bankId || null, action: 'updated' }],
    imported_at: prior.imported_at || incoming.imported_at,
    created_at: prior.created_at || incoming.created_at,
    updated_at: nowIso(),
  };
}

export async function importHistory({ limit = 50 } = {}) {
  const rows = await db.getAll(STORES.IMPORTS);
  return rows.sort((a, b) => (a.imported_at < b.imported_at ? 1 : -1)).slice(0, limit);
}

export async function latestImport() {
  const rows = await importHistory({ limit: 1 });
  return rows[0] || null;
}

export async function deleteImportRecord(id) {
  await db.remove(STORES.IMPORTS, id);
  return true;
}

/**
 * Remove every question and paper that came from one import — used when a bad
 * import must be undone. Attempts and mistakes for those questions are deleted
 * too, with the caller warning the user first.
 */
export async function undoImport(importId, { removeAttempts = true } = {}) {
  const record = await db.get(STORES.IMPORTS, importId);
  if (!record) throw new Error('That import record no longer exists.');
  const bankId = record.bank_id;
  const questions = await db.getAll(STORES.QUESTIONS);
  const mine = questions.filter((q) => (q.import_history || []).some((h) => h.bank_id === bankId) || q.bank_id === bankId);
  const ids = mine.map((q) => q.id);
  await db.removeMany(STORES.QUESTIONS, ids);
  const papers = await db.getAll(STORES.PAPERS);
  const myPapers = papers.filter((p) => (p.import_history || []).some((h) => h.bank_id === bankId) || p.bank_id === bankId);
  await db.removeMany(
    STORES.PAPERS,
    myPapers.map((p) => p.paper_id),
  );
  if (removeAttempts && ids.length) {
    const attempts = await db.getAll(STORES.ATTEMPTS);
    const toRemove = attempts.filter((a) => ids.includes(a.question_id)).map((a) => a.id);
    await db.removeMany(STORES.ATTEMPTS, toRemove);
    const revision = await db.getAll(STORES.REVISION);
    await db.removeMany(
      STORES.REVISION,
      revision.filter((r) => ids.includes(r.question_id)).map((r) => r.question_id),
    );
    const mistakes = await db.getAll(STORES.MISTAKES);
    await db.removeMany(
      STORES.MISTAKES,
      mistakes.filter((m) => ids.includes(m.question_id)).map((m) => m.key),
    );
  }
  record.undone_at = nowIso();
  record.undone_counts = { questions: ids.length, papers: myPapers.length };
  await db.put(STORES.IMPORTS, record);
  await refreshQuestionIndex({ silent: true });
  emit('bank:changed', { questions: state.questionIndex.size, papers: state.papers.size });
  return { removedQuestions: ids.length, removedPapers: myPapers.length };
}
