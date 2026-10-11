/**
 * builtin-bank.js — the repository-backed question bank.
 *
 * The MPPSC 2019–2024 bank that ships with this repository
 * (`data/pyq/mymppsc-pyq-bank.json`) is loaded from the repository itself, so a
 * fresh installation has real previous-year questions without anyone having to
 * download and re-import a file by hand. Manual import keeps working for other
 * banks; it is simply not needed for this one.
 *
 * Guarantees:
 *  - **Idempotent.** The bank's SHA-256 is recorded after a successful load. If
 *    the file is unchanged and its questions are still stored, nothing is
 *    written at all. Re-opening the app, or reloading the same version of the
 *    bank, cannot create duplicate questions or duplicate imports.
 *  - **Non-destructive.** The load goes through the normal two-phase importer
 *    with the "update, preserving my corrections" conflict policy, so user
 *    corrections, verified answers, bookmarks, attempts, revision records and
 *    locally authored questions survive a bank update.
 *  - **Offline-safe.** The service worker precaches the bank file, so after the
 *    first load the app works with no network. A failed fetch leaves the app
 *    exactly as it was.
 *  - **Versioned.** `schema_version` is validated by the importer (a newer file
 *    keeps working; a different major version is refused with a message rather
 *    than half-imported), and the bank file's own `bank_version` /
 *    `generated_at` are recorded with the load.
 */

import { STORES } from '../core/constants.js';
import * as db from '../core/db.js';
import { state, emit } from '../core/state.js';
import { logEvent } from '../core/util.js';
import { analyseBankObject, executeImport, sha256Hex } from './importer.js';

/** Where the committed bank lives, relative to the app root (works on Pages sub-paths). */
export const BUILTIN_BANK_PATH = 'data/pyq/mymppsc-pyq-bank.json';
export const BUILTIN_BANK_META = 'builtin_bank';
/** The bank id this loader owns. A different id in the file is still loaded, but recorded as-is. */
export const BUILTIN_BANK_ID = 'mppsc-prelims-paper1-2019-2024';

const state$ = { last: null };

function parseJsonSafe(text) {
  try {
    return { value: JSON.parse(text) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * How many of the bank's questions are stored locally.
 * Counting by id (not by `bank_id`) keeps the check correct for records that
 * were imported before the bank id was stamped on them, and for records a user
 * imported manually from the same file.
 */
async function countStoredForBank(bankId, ids = null) {
  const keys = await db.getAllKeys(STORES.QUESTIONS);
  if (ids) {
    const wanted = new Set(ids);
    return keys.filter((key) => wanted.has(key)).length;
  }
  if (!bankId) return keys.length;
  const questions = await db.getAll(STORES.QUESTIONS);
  return questions.filter((q) => q.bank_id === bankId).length;
}

/** What the last load attempt did, for the UI. */
export function lastBuiltinLoad() {
  return state$.last;
}

/**
 * Load (or refresh) the repository-backed bank.
 *
 * @param {object} [opts]
 * @param {string} [opts.url] relative URL of the bank (default `data/pyq/…`)
 * @param {string} [opts.text] bank JSON as text (test hook — skips the fetch)
 * @param {boolean} [opts.force] import even when the recorded hash matches
 * @param {boolean} [opts.silent] do not emit UI events (used at boot for logging only)
 * @returns {Promise<{status:string, message:string, meta:object|null, stats:object|null}>}
 *   status is one of: `loaded` (first load), `updated` (a new version was applied),
 *   `current` (nothing to do), `unavailable` (fetch failed), `blocked` (the file did not validate), `error`.
 */
export async function ensureBuiltinBank(opts = {}) {
  const url = opts.url || BUILTIN_BANK_PATH;
  const previous = (await db.getMeta(BUILTIN_BANK_META)) || null;
  let text = opts.text ?? null;

  if (text === null) {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'}`);
      text = await response.text();
    } catch (err) {
      const result = {
        status: previous ? 'current' : 'unavailable',
        message: previous
          ? `The built-in bank could not be re-checked (${err.message}); the copy already stored on this device is used.`
          : `The built-in bank could not be loaded (${err.message}). Import a bank file, or open the app once with a network connection.`,
        meta: previous,
        stats: null,
      };
      state$.last = result;
      logEvent('builtin-bank', result.message);
      return result;
    }
  }

  const parsed = parseJsonSafe(text);
  if (parsed.error) {
    const result = { status: 'error', message: `The built-in bank file is not valid JSON: ${parsed.error}`, meta: previous, stats: null };
    state$.last = result;
    return result;
  }

  const raw = parsed.value;
  const sha256 = await sha256Hex(text);
  const analysis = await analyseBankObject(raw, { filename: url, fileSha256: sha256 });

  // A file that does not validate is refused before anything else is decided:
  // "nothing to do" must never be the answer for a bank the app would reject.
  if (analysis.stage === 'blocked' || analysis.stage === 'error') {
    const result = {
      status: 'blocked',
      message: `The built-in bank was not imported: ${analysis.fatalMessage || 'it did not pass validation.'}`,
      meta: previous,
      stats: null,
      analysis,
    };
    state$.last = result;
    logEvent('builtin-bank', result.message);
    return result;
  }

  // Idempotence is decided by comparing the file with what is stored, not by
  // the recorded hash alone: if every record is already present with identical
  // content and none has changed, there is nothing to do regardless of how the
  // app got there (first load, re-open, or a manual import of the same file).
  const nothingToDo =
    analysis.comparison.newQuestions === 0 && analysis.comparison.changedRecords === 0 && analysis.report.questions.length > 0;
  const fileIds = analysis.report.questions.map((q) => q.id);
  const storedCount = await countStoredForBank(analysis.report.meta.bankId, fileIds);

  if (!opts.force && (nothingToDo || (previous && previous.sha256 === sha256 && storedCount))) {
    // Nothing to import. If the file itself changed (a rebuild that touched only
    // text the fingerprint does not cover, such as an explanation), record the
    // new hash so the next boot does not re-download and re-validate the file.
    if (previous && previous.sha256 !== sha256) await db.setMeta(BUILTIN_BANK_META, { ...previous, sha256, checked_at: new Date().toISOString() });
    const result = {
      status: 'current',
      message:
        previous && previous.sha256 !== sha256
          ? `The built-in bank file was rebuilt, but every question it holds is already stored unchanged (${storedCount} stored). Nothing was written.`
          : `The built-in bank is already loaded (${analysis.report.stats.questions} question(s) in the file, ${storedCount} stored, version ${previous?.bank_version || previous?.generated_at || 'unstamped'}).`,
      meta: previous ? { ...previous, sha256 } : previous,
      stats: null,
    };
    state$.last = result;
    return result;
  }
  const result = await executeImport(analysis, {
    mode: 'merge',
    // "update, preserving my corrections": re-imported records refresh the
    // source fields; user edits, verified answers and locally authored
    // questions are kept (see importer.mergeImportedQuestion).
    conflictPolicy: 'update',
  });

  const meta = {
    bank_id: analysis.report.meta.bankId,
    bank_name: analysis.report.meta.bankName,
    bank_version: raw.bank_version || null,
    schema_version: analysis.report.meta.schemaVersion,
    generated_at: analysis.report.meta.generatedAt || null,
    sha256,
    url,
    questions: analysis.report.stats.questions,
    papers: analysis.report.stats.papers,
    stored_questions: await countStoredForBank(analysis.report.meta.bankId, fileIds),
    loaded_at: new Date().toISOString(),
    counts: { ...result.stats },
  };
  await db.setMeta(BUILTIN_BANK_META, meta);
  state$.last = {
    status: previous ? 'updated' : 'loaded',
    message:
      previous && previous.sha256 !== sha256
        ? `Built-in bank updated: ${result.stats.questionsAdded} new, ${result.stats.questionsUpdated} refreshed, ${result.stats.questionsSkipped} unchanged.`
        : `Built-in bank loaded: ${analysis.report.stats.questions} questions across ${analysis.report.stats.papers} papers.`,
    meta,
    stats: result.stats,
  };
  if (!opts.silent) emit('bank:changed', { questions: state.questionIndex.size, papers: state.papers.size });
  logEvent('builtin-bank', state$.last.message);
  return state$.last;
}

/** Details for the UI, without touching the network. */
export async function builtinBankInfo() {
  const meta = (await db.getMeta(BUILTIN_BANK_META)) || null;
  const questions = meta?.bank_id ? await countStoredForBank(meta.bank_id) : 0;
  return { meta, path: BUILTIN_BANK_PATH, storedQuestions: questions, loaded: Boolean(meta) };
}

/**
 * Remove the questions of the built-in bank (used by the destructive zone in
 * Settings). User-authored questions and any other bank are untouched.
 */
export async function removeBuiltinBank() {
  const meta = (await db.getMeta(BUILTIN_BANK_META)) || null;
  const bankId = meta?.bank_id || BUILTIN_BANK_ID;
  const questions = await db.getAll(STORES.QUESTIONS);
  const mine = questions.filter((q) => q.bank_id === bankId);
  await db.removeMany(
    STORES.QUESTIONS,
    mine.map((q) => q.id),
  );
  const papers = await db.getAll(STORES.PAPERS);
  await db.removeMany(
    STORES.PAPERS,
    papers.filter((p) => p.bank_id === bankId).map((p) => p.paper_id),
  );
  await db.remove(STORES.META, BUILTIN_BANK_META);
  return { removedQuestions: mine.length };
}
