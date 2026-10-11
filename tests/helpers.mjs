/**
 * helpers.mjs — Shared test harness.
 *
 * The services are written to run in the browser without a DOM, so they can be
 * exercised in Node with an in-memory IndexedDB. This harness boots that
 * environment, imports a bank and provides small scenario helpers.
 */

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..');
export const dataPath = (...parts) => path.join(repoRoot, 'data', ...parts);

/* --------------------------------------------------------- browser shims -- */

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  key(i) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  get length() {
    return this.map.size;
  }
}

globalThis.localStorage = new MemoryStorage();
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
}

globalThis.IDBKeyRange = IDBKeyRange;

/* ------------------------------------------------------------- app boot --- */

let modules = null;

export async function bootApp({ resetStorage = true } = {}) {
  if (!modules) {
    modules = {
      db: await import('../js/core/db.js'),
      state: await import('../js/core/state.js'),
      constants: await import('../js/core/constants.js'),
      schema: await import('../js/core/schema.js'),
      validate: await import('../js/core/validate.js'),
      scoring: await import('../js/services/scoring.js'),
      importer: await import('../js/services/importer.js'),
      questions: await import('../js/services/questions.js'),
      tests: await import('../js/services/tests.js'),
      attempts: await import('../js/services/attempts.js'),
      revision: await import('../js/services/revision.js'),
      analytics: await import('../js/services/analytics.js'),
      select: await import('../js/services/select.js'),
      data: await import('../js/services/data.js'),
      planner: await import('../js/services/planner.js'),
    };
  }
  modules.appState = modules.state.state; // convenience: the live state object
  modules.mistakes = modules.attempts; // mistake-book helpers live in attempts.js
  if (resetStorage) {
    globalThis.indexedDB = new IDBFactory();
    globalThis.localStorage.clear();
    modules.db.resetConnection();
    await modules.db.wipeAll().catch(() => {});
  }
  await modules.state.loadSettings();
  await modules.state.refreshQuestionIndex({ silent: true });
  return modules;
}

export function currentModules() {
  return modules;
}

/* ------------------------------------------------------------ fixtures ---- */

export async function readJson(relative) {
  const text = await readFile(dataPath(relative), 'utf8');
  return JSON.parse(text);
}

export async function readText(relative) {
  return readFile(dataPath(relative), 'utf8');
}

/** Import the demonstration bank and return the import result. */
export async function importDemoBank(options = {}) {
  const m = currentModules();
  const text = await readText('demo/demo-bank.json');
  const analysis = await m.importer.analyseBankFile(text, { filename: 'demo-bank.json' });
  if (analysis.stage === 'error' || analysis.stage === 'blocked') {
    throw new Error(`Demo bank did not validate: ${analysis.fatalMessage}`);
  }
  const result = await m.importer.executeImport(analysis, { conflictPolicy: 'skip', ...options });
  return { analysis, result };
}

/* --------------------------------------------------------- scenario util -- */

/** Build a full-paper test for a paper id and return it. */
export async function startPaperTest(paperId) {
  const m = currentModules();
  const paper = await m.db.get(m.constants.STORES.PAPERS, paperId);
  if (!paper) throw new Error(`Paper ${paperId} not found`);
  const metas = paper.question_order.map((id) => m.state.questionIndex.get(id)).filter(Boolean);
  const questionIds = paper.question_order.slice();
  const test = await m.tests.createTest({
    kind: 'pyq_full',
    label: `Paper ${paperId}`,
    paper,
    questionIds,
    questionMetas: metas,
    orderSource: 'original',
    config: { feedbackMode: 'exam', confidence: 'off' },
  });
  return test;
}

/**
 * Answer a test by strategy.
 * @param {object} test
 * @param {{correct?:number[], incorrect?:number[], skip?:number[], confidence?:object}} plan
 *   arrays hold question indices within the test
 */
export async function answerTest(test, plan = {}, questions = null) {
  const m = currentModules();
  const qs = questions || (await m.questions.getQuestions(test.question_ids));
  const { correct = [], incorrect = [], skip = [], confidence = {} } = plan;
  for (const index of correct) {
    const id = test.question_ids[index];
    const q = qs.get(id);
    const answer = q.verified?.answer?.length ? q.verified.answer : q.supplied?.answer || [];
    test.responses[id] = { selected: answer, flagged: false, confidence: confidence[index] || null, time_spent_ms: 30000, revealed: false, answered_at: new Date().toISOString(), visits: 1 };
  }
  for (const index of incorrect) {
    const id = test.question_ids[index];
    const q = qs.get(id);
    const answer = (q.verified?.answer?.length ? q.verified.answer : q.supplied?.answer || []).slice();
    const optionKeys = Object.values(q.language_variants)[0].options.map((o) => o.key);
    const wrong = optionKeys.find((k) => !answer.includes(k));
    test.responses[id] = { selected: wrong ? [wrong] : [], flagged: false, confidence: confidence[index] || null, time_spent_ms: 20000, revealed: false, answered_at: new Date().toISOString(), visits: 1 };
  }
  for (const index of skip) {
    const id = test.question_ids[index];
    test.responses[id] = { selected: [], flagged: false, confidence: null, time_spent_ms: 5000, revealed: false, answered_at: null, visits: 1 };
  }
  return test;
}

export async function allQuestionsMap(ids) {
  const m = currentModules();
  return m.questions.getQuestions(ids);
}

export function approx(actual, expected, tolerance = 1e-6) {
  return Math.abs(actual - expected) <= tolerance;
}
