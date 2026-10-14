/**
 * db.js — IndexedDB persistence layer.
 *
 * Everything that must survive a refresh lives here: question bank, papers,
 * test sessions, attempts, mistake records, revision schedule, syllabus, tasks,
 * study sessions, import history and settings.
 *
 * localStorage is never used for this data — it is too small and too fragile
 * for a question bank.
 */

import { DB_NAME, DB_VERSION, STORES, STORE_LIST } from './constants.js';

let dbPromise = null;
let dbInstance = null;

/** Store definitions are declared once; migrations read from this table. */
export const STORE_DEFS = {
  [STORES.QUESTIONS]: { keyPath: 'id', indexes: [['paper_id', 'paper_id'], ['subject', 'classification.subject'], ['topic', 'classification.topic'], ['fingerprint', 'fingerprint'], ['question_type', 'question_type'], ['year', 'year']] },
  [STORES.PAPERS]: { keyPath: 'paper_id', indexes: [['year', 'year'], ['exam', 'exam']] },
  [STORES.TESTS]: { keyPath: 'id', indexes: [['status', 'status'], ['kind', 'kind'], ['paper_id', 'paper_id'], ['started_at', 'started_at']] },
  [STORES.ATTEMPTS]: { keyPath: 'id', indexes: [['question_id', 'question_id'], ['test_id', 'test_id'], ['created_at', 'created_at'], ['subject', 'subject'], ['topic', 'topic'], ['paper_id', 'paper_id']] },
  [STORES.MISTAKES]: { keyPath: 'key', indexes: [['question_id', 'question_id'], ['type', 'type'], ['status', 'status'], ['subject', 'subject'], ['topic', 'topic']] },
  [STORES.REVISION]: { keyPath: 'question_id', indexes: [['due_date', 'due_date'], ['state', 'state'], ['subject', 'subject'], ['topic', 'topic']] },
  [STORES.SYLLABUS]: { keyPath: 'id', indexes: [['parent_id', 'parent_id'], ['subject', 'subject'], ['status', 'status']] },
  // One row per syllabus node the user has marked. Kept apart from the planner's
  // own syllabus rows so neither module can read or overwrite the other's data.
  [STORES.SYLLABUS_PROGRESS]: { keyPath: 'node_id', indexes: [['status', 'status'], ['section_id', 'section_id'], ['updated_at', 'updated_at']] },
  [STORES.TASKS]: { keyPath: 'id', indexes: [['status', 'status'], ['due_date', 'due_date'], ['syllabus_id', 'syllabus_id']] },
  [STORES.SESSIONS]: { keyPath: 'id', indexes: [['started_at', 'started_at'], ['category', 'category'], ['syllabus_id', 'syllabus_id']] },
  [STORES.IMPORTS]: { keyPath: 'id', indexes: [['imported_at', 'imported_at'], ['bank_id', 'bank_id']] },
  [STORES.META]: { keyPath: 'key' },
  [STORES.SETTINGS]: { keyPath: 'key' },
};

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

function applySchema(db, tx, oldVersion) {
  for (const storeName of STORE_LIST) {
    const def = STORE_DEFS[storeName];
    let store;
    if (!db.objectStoreNames.contains(storeName)) {
      store = db.createObjectStore(storeName, { keyPath: def.keyPath });
    } else if (tx) {
      store = tx.objectStore(storeName);
    }
    if (store && def.indexes) {
      for (const [indexName, keyPath] of def.indexes) {
        if (!store.indexNames.contains(indexName)) {
          try {
            store.createIndex(indexName, keyPath, { unique: false });
          } catch (err) {
            console.warn(`Could not create index ${storeName}.${indexName}`, err);
          }
        }
      }
    }
  }
  // v1 is the baseline. Future migrations: compare oldVersion and transform data
  // inside a versionchange transaction before bumping DB_VERSION.
  if (oldVersion < 1) {
    // no data to migrate in the first release
  }
  if (oldVersion >= 1 && oldVersion < 2) {
    // v2 adds `syllabus_progress` and changes no existing store. applySchema has
    // already created it above; there is nothing to transform.
  }
}

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not expose IndexedDB, so local storage of the question bank is unavailable.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      applySchema(db, request.transaction, event.oldVersion);
    };
    request.onsuccess = () => {
      const db = request.result;
      dbInstance = db;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        dbInstance = null;
        console.warn('A newer version of the database was opened in another tab; this tab must be reloaded.');
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Could not open the local database.'));
    request.onblocked = () => {
      console.warn('Database upgrade is blocked by another open tab. Close other tabs of the app and reload.');
    };
  });
  return dbPromise;
}

export async function getDb() {
  if (dbInstance) return dbInstance;
  return openDatabase();
}

export function isReady() {
  return Boolean(dbInstance);
}

/**
 * Drop the cached connection. Used by the automated tests (which swap in a fresh
 * in-memory IndexedDB between cases) and by the "reload local database" recovery
 * action in Settings.
 */
export function resetConnection() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      /* ignore */
    }
  }
  dbInstance = null;
  dbPromise = null;
}

/* --------------------------------------------------------------- reads --- */

export async function get(storeName, key) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).get(key));
}

export async function getAll(storeName, query = null, count = null) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const request = query === null || query === undefined ? store.getAll() : store.getAll(query, count ?? undefined);
  return requestToPromise(request);
}

export async function getAllKeys(storeName) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).getAllKeys());
}

export async function count(storeName, query = null) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return requestToPromise(query === null || query === undefined ? store.count() : store.count(query));
}

export async function getByIndex(storeName, indexName, value, countLimit = null) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readonly');
  const index = tx.objectStore(storeName).index(indexName);
  const request = countLimit ? index.getAll(value, countLimit) : index.getAll(value);
  return requestToPromise(request);
}

export async function getKeysByIndex(storeName, indexName, value) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).index(indexName).getAllKeys(value));
}

export async function getByIndexRange(storeName, indexName, range, countLimit = null) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readonly');
  const index = tx.objectStore(storeName).index(indexName);
  const request = countLimit ? index.getAll(range, countLimit) : index.getAll(range);
  return requestToPromise(request);
}

export async function countByIndexRange(storeName, indexName, range) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).index(indexName).count(range));
}

/** Count records whose indexed field equals `value` (cheap — index-only). */
export async function countByIndex(storeName, indexName, value) {
  return countByIndexRange(storeName, indexName, IDBKeyRange.only(value));
}

/* -------------------------------------------------------------- writes --- */

export async function put(storeName, value) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  return txDone(tx);
}

/** Batched write: far faster and less likely to trip quota issues than one tx per record. */
export async function putMany(storeName, values, { batchSize = 400, onProgress = null } = {}) {
  const db = await getDb();
  let written = 0;
  for (let i = 0; i < values.length; i += batchSize) {
    const slice = values.slice(i, i + batchSize);
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const value of slice) store.put(value);
    await txDone(tx);
    written += slice.length;
    if (onProgress) onProgress(written, values.length);
  }
  return written;
}

export async function putMultipleStores(writes) {
  // writes: { storeName: [values] } — all in one transaction for atomicity
  const db = await getDb();
  const names = Object.keys(writes);
  if (!names.length) return true;
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const store = tx.objectStore(name);
    for (const value of writes[name]) store.put(value);
  }
  return txDone(tx);
}

export async function remove(storeName, key) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  return txDone(tx);
}

export async function removeMany(storeName, keys) {
  if (!keys.length) return true;
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const key of keys) store.delete(key);
  return txDone(tx);
}

/**
 * Puts and deletes against one store in a single transaction, so a change that
 * touches many rows (marking every line under a syllabus heading) is applied
 * entirely or not at all.
 */
export async function writeBatch(storeName, { put: puts = [], remove: removals = [] } = {}) {
  if (!puts.length && !removals.length) return true;
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const key of removals) store.delete(key);
  for (const value of puts) store.put(value);
  return txDone(tx);
}

export async function clearStore(storeName) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).clear();
  return txDone(tx);
}

export async function clearStores(storeNames) {
  const db = await getDb();
  const tx = db.transaction(storeNames, 'readwrite');
  for (const name of storeNames) tx.objectStore(name).clear();
  return txDone(tx);
}

/* ---------------------------------------------------------------- meta --- */

export async function getMeta(key, fallback = null) {
  const row = await get(STORES.META, key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  return put(STORES.META, { key, value, updated_at: new Date().toISOString() });
}

/* ----------------------------------------------------------- diagnostics -- */

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? null, quota: est.quota ?? null };
  } catch {
    return null;
  }
}

export async function requestPersistence() {
  if (!navigator.storage?.persist) return null;
  try {
    const already = await navigator.storage.persisted?.();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/** Counts for every store — used by the backup screen and diagnostics. */
export async function storeCounts() {
  const out = {};
  for (const name of STORE_LIST) {
    try {
      out[name] = await count(name);
    } catch (err) {
      out[name] = `error: ${err.message}`;
    }
  }
  return out;
}

/** Wipe every store — used only by the "restore over" flow after confirmation. */
export async function wipeAll() {
  const db = await getDb();
  const tx = db.transaction(STORE_LIST, 'readwrite');
  for (const name of STORE_LIST) tx.objectStore(name).clear();
  return txDone(tx);
}
