/**
 * state.js — Central in-memory application state.
 *
 * Loaded once at boot:
 *   - settings (IndexedDB is the source of truth, localStorage is a fast mirror)
 *   - the full paper list
 *   - a lightweight question index (no full question bodies) so screens such as
 *     Analytics and the Dashboard never need to read the whole bank from disk.
 */

import { STORES, DEFAULT_SETTINGS, LS_KEYS } from './constants.js';
import * as db from './db.js';
import { deepClone, logEvent } from './util.js';

/* --------------------------------------------------------------- events --- */

const listeners = new Map();

export function on(eventName, handler) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(handler);
  return () => listeners.get(eventName)?.delete(handler);
}

export function emit(eventName, payload) {
  const set = listeners.get(eventName);
  if (!set) return;
  for (const handler of Array.from(set)) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`Listener for "${eventName}" failed`, err);
    }
  }
}

/* ------------------------------------------------------------- settings --- */

function mergeSettings(base, patch) {
  const out = deepClone(base);
  if (!patch || typeof patch !== 'object') return out;
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = mergeSettings(out[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export const state = {
  ready: false,
  dbError: null,
  settings: deepClone(DEFAULT_SETTINGS),
  ui: {
    route: 'dashboard',
    sidebarCollapsed: false,
    lastTestId: null,
  },
  papers: new Map(), // paper_id → paper
  questionIndex: new Map(), // id → meta
  subjects: [], // [{ subject, count, topics: [{topic, count, subtopics}] }]
  counts: { questions: 0, papers: 0, attempts: 0, tests: 0 },
  isLoading: false,
};

export function loadUiPrefs() {
  try {
    const raw = localStorage.getItem(LS_KEYS.UI);
    if (raw) Object.assign(state.ui, JSON.parse(raw));
  } catch (err) {
    console.warn('Could not read UI preferences', err);
  }
}

export function saveUiPrefs() {
  try {
    localStorage.setItem(LS_KEYS.UI, JSON.stringify(state.ui));
  } catch (err) {
    console.warn('Could not save UI preferences', err);
  }
}

function mirrorSettingsToLocalStorage() {
  try {
    localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(state.settings));
  } catch (err) {
    console.warn('Could not mirror settings to localStorage', err);
  }
}

export function resolveEffectiveTheme(themePref = state.settings?.theme) {
  if (themePref === 'dark' || themePref === 'light') return themePref;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      /* ignore matchMedia errors */
    }
  }
  return 'light';
}

export function applyTheme(settings = state.settings) {
  if (typeof document === 'undefined' || !document.documentElement) return 'light';
  const pref = settings?.theme || 'system';
  const effective = resolveEffectiveTheme(pref);
  const density = settings?.density || 'comfortable';
  const root = document.documentElement;
  root.setAttribute('data-theme', effective);
  root.setAttribute('data-theme-pref', pref);
  root.setAttribute('data-density', density);
  const meta = document.getElementById('themeColorMeta');
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#0f141c' : '#f6f3ec');
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.setAttribute('aria-pressed', String(effective === 'dark'));
  return effective;
}

export async function loadSettings() {
  let stored = null;
  try {
    const row = await db.get(STORES.SETTINGS, 'app');
    stored = row ? row.value : null;
  } catch (err) {
    console.warn('Could not read settings from IndexedDB', err);
  }
  if (!stored) {
    // migrate any pre-existing localStorage-only settings once
    try {
      const raw = localStorage.getItem(LS_KEYS.SETTINGS);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = null;
    }
  }
  state.settings = mergeSettings(DEFAULT_SETTINGS, stored || {});
  // One-time upgrade for installs created before the MPPSC +3/−1/0 pattern
  // became the default: a stored default that is exactly the old shipped
  // default (+2, no negative marking) was never a deliberate choice, so it
  // follows the new default. Anything the user actually changed is kept.
  const ds = state.settings.defaultScoring || {};
  if (ds.marksPerCorrect === 2 && ds.negativeMarksPerIncorrect === 0 && ds.negativeMarkingEnabled === false && (ds.marksForUnanswered ?? 0) === 0) {
    state.settings = mergeSettings(state.settings, { defaultScoring: deepClone(DEFAULT_SETTINGS.defaultScoring) });
  }
  mirrorSettingsToLocalStorage();
  applyTheme(state.settings);
  return state.settings;
}

export async function saveSettings(patch = null, { persist = true } = {}) {
  if (patch) state.settings = mergeSettings(state.settings, patch);
  mirrorSettingsToLocalStorage();
  applyTheme(state.settings);
  if (persist) {
    try {
      await db.put(STORES.SETTINGS, { key: 'app', value: state.settings, updated_at: new Date().toISOString() });
    } catch (err) {
      console.error('Could not persist settings', err);
      throw err;
    }
  }
  emit('settings:changed', state.settings);
  return state.settings;
}

export async function resetSettings() {
  state.settings = deepClone(DEFAULT_SETTINGS);
  return saveSettings();
}

/** Deep merge helper reused by the restore flow. */
export function mergeSettingsObjects(base, patch) {
  return mergeSettings(base, patch);
}

/* ------------------------------------------------------ question index --- */

/** Build the reduced in-memory view of the bank. Called at boot and after imports. */
export async function refreshQuestionIndex({ silent = false } = {}) {
  if (!silent) state.isLoading = true;
  const [paperRows, questionRows] = await Promise.all([db.getAll(STORES.PAPERS), db.getAll(STORES.QUESTIONS)]);
  const papers = new Map();
  for (const p of paperRows) papers.set(p.paper_id, p);
  const index = new Map();
  for (const q of questionRows) {
    index.set(q.id, {
      id: q.id,
      paper_id: q.paper_id,
      year: q.year,
      set_code: q.set_code,
      question_number: q.question_number,
      question_type: q.question_type,
      subject: q.classification?.subject || null,
      topic: q.classification?.topic || null,
      subtopic: q.classification?.subtopic || null,
      unclassified: Boolean(q.classification?.isUnclassified),
      langs: Object.keys(q.language_variants || {}),
      answerStatus: q.supplied?.status || 'missing',
      hasSuppliedAnswer: Boolean(q.supplied?.answer?.length),
      hasVerifiedAnswer: Boolean(q.verified?.answer?.length),
      disputed: Boolean(q.dispute?.is_disputed) || q.supplied?.status === 'disputed',
      needsAttention: Boolean(!(q.supplied?.answer?.length || q.verified?.answer?.length) || q.dispute?.is_disputed),
      hasExplanation: Boolean(q.explanation),
      validationStatus: q.validation_status || 'unknown',
      demonstration: Boolean(q.is_demonstration),
      fingerprint: q.fingerprint,
      text_key: q.text_key,
      updated_at: q.updated_at,
    });
  }
  state.papers = papers;
  state.questionIndex = index;
  state.subjects = deriveClassificationTree(index);
  state.counts.questions = index.size;
  state.counts.papers = papers.size;
  state.counts.attempts = await db.count(STORES.ATTEMPTS);
  state.counts.tests = await db.count(STORES.TESTS);
  state.isLoading = false;
  if (!silent) emit('bank:changed', { questions: index.size, papers: papers.size });
  logEvent('state', `Question index rebuilt: ${index.size} questions, ${papers.size} papers`);
  return { questions: index.size, papers: papers.size };
}

export function deriveClassificationTree(index) {
  const tree = new Map();
  for (const meta of index.values()) {
    const subject = meta.subject || 'Unclassified';
    if (!tree.has(subject)) tree.set(subject, new Map());
    const topics = tree.get(subject);
    const topic = meta.topic || 'Unclassified';
    if (!topics.has(topic)) topics.set(topic, new Map());
    const subtopics = topics.get(topic);
    const sub = meta.subtopic || '';
    subtopics.set(sub, (subtopics.get(sub) || 0) + 1);
  }
  return Array.from(tree.entries())
    .map(([subject, topics]) => ({
      subject,
      count: Array.from(topics.values()).reduce((acc, subs) => acc + Array.from(subs.values()).reduce((a, b) => a + b, 0), 0),
      topics: Array.from(topics.entries())
        .map(([topic, subs]) => ({
          topic,
          count: Array.from(subs.values()).reduce((a, b) => a + b, 0),
          subtopics: Array.from(subs.entries())
            .filter(([name]) => Boolean(name))
            .map(([name, count]) => ({ subtopic: name, count }))
            .sort((a, b) => b.count - a.count),
        }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);
}

export function subjectsList() {
  return state.subjects.map((s) => s.subject);
}

export function topicsFor(subject) {
  const node = state.subjects.find((s) => s.subject === subject);
  return node ? node.topics.map((t) => t.topic) : [];
}

export function paperList() {
  return Array.from(state.papers.values()).sort((a, b) => {
    if (a.year !== b.year) return Number(b.year || 0) - Number(a.year || 0);
    return String(a.paper_id).localeCompare(String(b.paper_id));
  });
}

export function questionMeta(id) {
  return state.questionIndex.get(id) || null;
}

export async function setRoute(route) {
  state.ui.route = route;
  saveUiPrefs();
  emit('route:changed', route);
}
