/**
 * data.js — Backup, restore and portable exports.
 *
 * A backup contains user progress, not just the question list: attempts, tests,
 * mistake records, revision schedule, syllabus, tasks, study sessions, import
 * history and settings. Restores are validated before anything is replaced, and
 * the destructive path always requires explicit confirmation from the UI.
 */

import { APP_VERSION, DB_VERSION, STORES, STORE_LIST, LS_KEYS } from '../core/constants.js';
import * as db from '../core/db.js';
import { state, emit, refreshQuestionIndex, mergeSettingsObjects } from '../core/state.js';
import { nowIso, deepClone, logEvent, todayKey } from '../core/util.js';
import { sha256Hex } from './importer.js';

export const BACKUP_FORMAT = 'mymppsc-backup';
export const BACKUP_FORMAT_VERSION = '1.0.0';

/** Payload keys are the human-readable names; map them to the IndexedDB stores. */
const STORE_FOR_KEY = {
  papers: STORES.PAPERS,
  questions: STORES.QUESTIONS,
  tests: STORES.TESTS,
  attempts: STORES.ATTEMPTS,
  mistakes: STORES.MISTAKES,
  revision: STORES.REVISION,
  syllabus: STORES.SYLLABUS,
  tasks: STORES.TASKS,
  sessions: STORES.SESSIONS,
  imports: STORES.IMPORTS,
  meta: STORES.META,
};

/** Primary key field of each payload collection. */
const KEY_FIELD_FOR = {
  papers: 'paper_id',
  questions: 'id',
  tests: 'id',
  attempts: 'id',
  mistakes: 'key',
  revision: 'question_id',
  syllabus: 'id',
  tasks: 'id',
  sessions: 'id',
  imports: 'id',
  meta: 'key',
};

/** A stable stringify so the integrity hash does not depend on key order. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export async function buildBackup({ includeTests = true, includeQuestions = true, note = null } = {}) {
  const payload = {
    papers: includeQuestions ? await db.getAll(STORES.PAPERS) : [],
    questions: includeQuestions ? await db.getAll(STORES.QUESTIONS) : [],
    tests: includeTests ? await db.getAll(STORES.TESTS) : [],
    attempts: await db.getAll(STORES.ATTEMPTS),
    mistakes: await db.getAll(STORES.MISTAKES),
    revision: await db.getAll(STORES.REVISION),
    syllabus: await db.getAll(STORES.SYLLABUS),
    tasks: await db.getAll(STORES.TASKS),
    sessions: await db.getAll(STORES.SESSIONS),
    imports: await db.getAll(STORES.IMPORTS),
    settings: state.settings,
    meta: await db.getAll(STORES.META),
  };
  const integrity = await sha256Hex(stableStringify(payload));
  const backup = {
    format: BACKUP_FORMAT,
    format_version: BACKUP_FORMAT_VERSION,
    app_version: APP_VERSION,
    db_version: DB_VERSION,
    created_at: nowIso(),
    note,
    counts: Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])),
    payload,
    integrity: { algorithm: 'SHA-256', payload_sha256: integrity },
  };
  return backup;
}

/** Validate a parsed backup object before restoring. */
export function validateBackup(obj) {
  const errors = [];
  const warnings = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['The file is not a JSON object.'], warnings, summary: null };
  if (obj.format !== BACKUP_FORMAT) errors.push(`This file is not a ${BACKUP_FORMAT} backup (found format: ${JSON.stringify(obj.format ?? null)}).`);
  if (!obj.format_version) errors.push('The backup has no format_version.');
  else if (String(obj.format_version).split('.')[0] !== BACKUP_FORMAT_VERSION.split('.')[0]) {
    errors.push(`Backup format version ${obj.format_version} is not compatible with this app version (expected ${BACKUP_FORMAT_VERSION.split('.')[0]}.x).`);
  } else if (obj.format_version !== BACKUP_FORMAT_VERSION) {
    warnings.push(`Backup was written in format ${obj.format_version}; this build uses ${BACKUP_FORMAT_VERSION}. It will be read on a best-effort basis.`);
  }
  const payload = obj.payload;
  if (!payload || typeof payload !== 'object') {
    errors.push('The backup has no payload object.');
    return { ok: false, errors, warnings, summary: null };
  }
  const expectedStores = STORE_LIST.filter((s) => s !== STORES.SETTINGS && s !== STORES.META);
  const missing = expectedStores.filter((s) => !(s in payload));
  if (missing.length) warnings.push(`The backup does not contain: ${missing.join(', ')}. Those parts will stay as they are.`);
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      for (const [i, row] of value.entries()) {
        if (!row || typeof row !== 'object') {
          errors.push(`payload.${key}[${i}] is not an object.`);
          if (errors.length > 20) break;
        }
      }
    }
  }
  const keyFields = {
    questions: 'id',
    papers: 'paper_id',
    tests: 'id',
    attempts: 'id',
    mistakes: 'key',
    revision: 'question_id',
    syllabus: 'id',
    tasks: 'id',
    sessions: 'id',
    imports: 'id',
  };
  for (const [storeName, field] of Object.entries(keyFields)) {
    const rows = payload[storeName];
    if (!Array.isArray(rows)) continue;
    const bad = rows.findIndex((r) => !r || r[field] === undefined || r[field] === null);
    if (bad >= 0) errors.push(`payload.${storeName}[${bad}] has no "${field}" field, which is required as the storage key.`);
  }
  const counts = obj.counts || {};
  for (const [key, count] of Object.entries(counts)) {
    const value = payload[key];
    if (Array.isArray(value) && count !== value.length) warnings.push(`counts.${key} says ${count} but the file contains ${value.length}. The file contents are used.`);
  }
  const summary = {
    created_at: obj.created_at || null,
    app_version: obj.app_version || null,
    counts: Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])),
    integrity: obj.integrity?.payload_sha256 || null,
  };
  return { ok: errors.length === 0, errors, warnings, summary, payload, object: obj };
}

export async function verifyBackupIntegrity(obj) {
  if (!obj?.integrity?.payload_sha256) return { checked: false, matches: null };
  const hash = await sha256Hex(stableStringify(obj.payload));
  return { checked: true, matches: hash === obj.integrity.payload_sha256, computed: hash, stored: obj.integrity.payload_sha256 };
}

/**
 * Restore a validated backup.
 * @param {object} validation result of validateBackup (+ integrity check)
 * @param {{mode: 'replace'|'merge', includeQuestions?: boolean}} options
 */
export async function restoreBackup(validation, { mode = 'merge', includeQuestions = true } = {}) {
  if (!validation?.ok) throw new Error('Refusing to restore a backup that did not pass validation.');
  const payload = validation.payload;
  const restoreOrder = ['settings', 'meta', 'papers', 'questions', 'tests', 'attempts', 'mistakes', 'revision', 'syllabus', 'tasks', 'sessions', 'imports'];
  const stats = {};

  if (mode === 'replace') {
    const storesToClear = includeQuestions ? STORE_LIST : STORE_LIST.filter((s) => s !== STORES.QUESTIONS && s !== STORES.PAPERS);
    await db.clearStores(storesToClear);
  }

  for (const key of restoreOrder) {
    const rows = payload[key];
    if (!rows) continue;
    if (key === 'settings') {
      if (mode === 'replace') await db.put(STORES.SETTINGS, { key: 'app', value: rows, updated_at: nowIso() });
      continue;
    }
    if (key === 'meta') {
      for (const row of rows) {
        if (mode === 'merge') {
          const existing = await db.get(STORES.META, row.key);
          if (existing && existing.updated_at && row.updated_at && existing.updated_at > row.updated_at) continue;
        }
        await db.put(STORES.META, row);
      }
      stats.meta = rows.length;
      continue;
    }
    if (!includeQuestions && (key === 'questions' || key === 'papers')) continue;
    if (!Array.isArray(rows)) continue;
    let written = 0;
    const storeName = STORE_FOR_KEY[key];
    if (!storeName) continue;
    if (mode === 'merge') {
      const keyField = KEY_FIELD_FOR[key];
      for (const row of rows) {
        const existing = await db.get(storeName, row[keyField]);
        if (existing && key === 'questions') {
          // never let a restore overwrite newer local user work with an older copy
          const preferExisting = (existing.updated_at || '') > (row.updated_at || '');
          if (preferExisting) continue;
          await db.put(STORES.QUESTIONS, { ...row, user_corrections: existing.user_corrections || row.user_corrections || [] });
          written += 1;
          continue;
        }
        await db.put(storeName, row);
        written += 1;
      }
    } else {
      written = await db.putMany(storeName, rows);
    }
    stats[key] = written;
  }

  if (payload.settings) {
    // Replace adopts the backup's settings. Merge keeps the settings currently in
    // place (they are live preferences) and only fills in keys that are missing,
    // so a merge can never silently change how the app behaves.
    const merged = mode === 'replace' ? payload.settings : mergeSettingsObjects(payload.settings, state.settings);
    await import('../core/state.js').then(({ saveSettings }) => saveSettings(merged));
  }

  await refreshQuestionIndex({ silent: true });
  emit('bank:changed', { questions: state.questionIndex.size, papers: state.papers.size });
  await db.setMeta('last_restore', { at: nowIso(), mode, stats });
  logEvent('data', `Restored backup (${mode}): ${JSON.stringify(stats)}`);
  return stats;
}

/* ------------------------------------------------------------ exports ----- */

/**
 * Export the local bank in the same standard format the importer accepts, so an
 * exported bank can be re-imported (including into a fresh browser profile).
 */
export async function exportBankJson({ paperIds = null, includeProgressNotes = true } = {}) {
  let papers = await db.getAll(STORES.PAPERS);
  if (paperIds && paperIds.length) papers = papers.filter((p) => paperIds.includes(p.paper_id));
  const paperIdSet = new Set(papers.map((p) => p.paper_id));
  const questions = (await db.getAll(STORES.QUESTIONS)).filter((q) => paperIdSet.has(q.paper_id));
  const bank = {
    schema_version: '1.0.0',
    bank_id: `local-export-${todayKey()}`,
    bank_name: `MyMPPSC local export (${questions.length} questions, ${papers.length} papers)`,
    generated_at: nowIso(),
    generator: { name: 'MyMPPSC', version: APP_VERSION, notes: 'Exported from the local browser database.' },
    is_demonstration: questions.every((q) => q.is_demonstration === true) && questions.length > 0,
    provenance: {
      kind: 'mixed',
      verified: null,
      notes: 'Exported from the local browser database of this app.',
      sources: [],
    },
    default_language: state.settings.language,
    papers: papers.map((p) => ({
      paper_id: p.paper_id,
      exam: p.exam,
      year: p.year,
      paper_name: p.paper_name,
      paper_code: p.paper_code,
      set_code: p.set_code,
      language: p.language,
      original_question_count: p.original_question_count,
      duration_minutes: p.duration_minutes,
      total_marks: p.total_marks,
      scoring: p.scoring,
      question_order: p.question_order,
      answer_key: p.answer_key,
      source_files: p.source_files,
      import_validation: p.import_validation,
      is_demonstration: p.is_demonstration,
      metadata: { ...p.metadata, exported_from_local: true },
    })),
    questions: questions.map((q) => ({
      id: q.id,
      exam: q.exam,
      year: q.year,
      paper_id: q.paper_id,
      set_code: q.set_code,
      question_number: q.question_number,
      question_type: q.question_type,
      language_variants: q.language_variants,
      subject: q.classification?.subject ?? null,
      topic: q.classification?.topic ?? null,
      subtopic: q.classification?.subtopic ?? null,
      supplied_answer: q.supplied ? { answer: q.supplied.answer, status: q.supplied.status, source: q.supplied.source, notes: q.supplied.notes } : null,
      answer_key_status: q.supplied?.status ?? null,
      verified_answer: q.verified
        ? { answer: q.verified.answer, verified_by: q.verified.verified_by, verified_at: q.verified.verified_at, evidence: q.verified.evidence || [], status: q.verified.status }
        : null,
      verification_evidence: q.verification_evidence || [],
      dispute: q.dispute || null,
      explanation: q.explanation
        ? {
            language: 'en',
            correct_reasoning: q.explanation.correct_reasoning,
            option_explanations: q.explanation.option_explanations,
            key_concepts: q.explanation.key_concepts,
            revision_takeaways: q.explanation.revision_takeaways,
            sources: q.explanation.sources,
          }
        : null,
      source_reference: q.source_reference,
      validation_status: q.validation_status,
      validation_notes: q.validation_notes || [],
      is_demonstration: q.is_demonstration === true,
      user_corrections: includeProgressNotes ? q.user_corrections || [] : undefined,
      metadata: q.metadata || {},
    })),
  };
  return bank;
}

/** Progress-only export (no questions) — small file for routine backups. */
export async function exportProgressJson() {
  const payload = {
    tests: await db.getAll(STORES.TESTS),
    attempts: await db.getAll(STORES.ATTEMPTS),
    mistakes: await db.getAll(STORES.MISTAKES),
    revision: await db.getAll(STORES.REVISION),
    syllabus: await db.getAll(STORES.SYLLABUS),
    tasks: await db.getAll(STORES.TASKS),
    sessions: await db.getAll(STORES.SESSIONS),
    settings: state.settings,
  };
  return {
    format: 'mymppsc-progress',
    format_version: BACKUP_FORMAT_VERSION,
    app_version: APP_VERSION,
    created_at: nowIso(),
    counts: Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])),
    payload,
  };
}

/** Attempt log as a flat array of rows (for CSV consumers in the future). */
export async function exportAttemptsJson() {
  const attempts = await db.getAll(STORES.ATTEMPTS);
  return { format: 'mymppsc-attempts', created_at: nowIso(), count: attempts.length, attempts };
}

/* ------------------------------------------------------------ metadata ---- */

export function lastBackupInfo() {
  try {
    const raw = localStorage.getItem(LS_KEYS.LAST_BACKUP);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function markBackupTaken(details = {}) {
  const info = { at: nowIso(), ...details };
  try {
    localStorage.setItem(LS_KEYS.LAST_BACKUP, JSON.stringify(info));
  } catch (err) {
    console.warn('Could not record the backup time', err);
  }
  return info;
}

export async function storageReport() {
  const [counts, estimate] = await Promise.all([db.storeCounts(), db.storageEstimate()]);
  return {
    counts,
    estimate,
    persisted: navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => null) : null,
    lastBackup: lastBackupInfo(),
    warning:
      'Browser storage can be cleared by you or by the browser (for example when clearing site data, or if the device runs out of space). Keep a JSON backup outside the browser.',
  };
}

/** Round-trip self-test used by the Diagnostics screen and the test harness. */
export async function backupRoundTripCheck() {
  const backup = await buildBackup();
  const validation = validateBackup(deepClone(backup));
  const integrity = await verifyBackupIntegrity(backup);
  return {
    ok: validation.ok && integrity.matches !== false,
    validation_ok: validation.ok,
    errors: validation.errors,
    warnings: validation.warnings,
    integrity,
    counts: backup.counts,
  };
}
