/**
 * util.js — Small, dependency-free helpers shared by every module.
 * DOM helpers here are intentionally minimal: views build HTML strings and use
 * event delegation, which keeps behaviour predictable and avoids framework cost.
 */

/* ------------------------------------------------------------------ DOM ---- */

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  if (html) node.innerHTML = html;
  return node;
}

/** Escape untrusted text for interpolation into HTML templates. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape a value for use inside a single-quoted JS string in an inline handler. */
export function escAttrJson(value) {
  return esc(JSON.stringify(value));
}

export function on(root, eventName, selector, handler) {
  if (!root) return () => {};
  const listener = (ev) => {
    const target = ev.target instanceof Element ? ev.target.closest(selector) : null;
    if (target && root.contains(target)) handler(ev, target);
  };
  root.addEventListener(eventName, listener);
  return () => root.removeEventListener(eventName, listener);
}

/* ------------------------------------------------------------- general ---- */

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through to JSON clone for non-cloneable values */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

export const nowIso = () => new Date().toISOString();

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function round(n, digits = 2) {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function sum(arr, pick = (x) => x) {
  return arr.reduce((acc, item) => acc + (Number(pick(item)) || 0), 0);
}

export function groupBy(arr, keyFn) {
  const out = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

export function uniq(arr) {
  return Array.from(new Set(arr));
}

export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Deterministic, seedable PRNG (mulberry32) so tests can be reproducible. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------- formatting ---- */

export function fmtNumber(n, digits = 0) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(n, digits = 0) {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtMarks(n) {
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function fmtDate(value, opts = {}) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  });
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(d)} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

export function fmtRelative(value) {
  if (!value) return '—';
  const d = new Date(value);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return mins > 0 ? `${mins} min ago` : `in ${-mins} min`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `${hours} h ago` : `in ${-hours} h`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return days > 0 ? `${days} d ago` : `in ${-days} d`;
  return fmtDate(d);
}

/** mm:ss (or h:mm:ss) clock from seconds. */
export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function fmtDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60 ? `${s % 60} s` : ''}`.trim();
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function todayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(a, b) {
  const d1 = startOfDay(a).getTime();
  const d2 = startOfDay(b).getTime();
  return Math.round((d2 - d1) / 86400000);
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function pluralise(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
}

/* --------------------------------------------------------------- files ---- */

/* ------------------------------------------------------------ deep links --- */

/** The separator inside a Topic & Custom Practice route parameter. */
export const TOPIC_PARAM_SEPARATOR = '||';

/**
 * Build a deep link into Topic & Custom Practice — the one way to do it.
 *
 * Three screens used to build these links and they did not agree: the syllabus
 * PYQ chips encoded each half separately (`enc(subject)||enc(topic)`), while the
 * dashboard and the bank panel encoded the joined string
 * (`enc(subject||topic)`). Both happened to parse, so nothing looked broken; but
 * only the first form stays unambiguous when a topic label itself contains the
 * separator, and only one form can be right when a bookmark is shared.
 *
 * Each half is encoded on its own, so the `||` in the address is always the
 * separator and never part of a name.
 */
export function topicPracticeHref(subject, topic = null) {
  const target = topic
    ? `${encodeURIComponent(subject)}${TOPIC_PARAM_SEPARATOR}${encodeURIComponent(topic)}`
    : encodeURIComponent(subject || '');
  return `#/topic/${target}`;
}

/** The inverse of `topicPracticeHref()`: split one route parameter back apart. */
export function parseTopicPracticeParam(raw) {
  const [subject = '', topic = ''] = String(raw ?? '').split(TOPIC_PARAM_SEPARATOR);
  return { subject: subject || null, topic: topic || null };
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsText(file);
  });
}

export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadJson(data, filename) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- logging --- */

const logRing = [];
export function logEvent(area, message, detail = null) {
  const entry = { at: nowIso(), area, message, detail };
  logRing.push(entry);
  if (logRing.length > 500) logRing.shift();
  if (detail !== null) console.info(`[${area}] ${message}`, detail);
  else console.info(`[${area}] ${message}`);
  return entry;
}
export const getLogRing = () => logRing.slice();

/* ------------------------------------------------------------ statistics -- */

export function mean(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!nums.length) return NaN;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * Wilson score interval lower bound — used so that a topic answered 2/3 times
 * is not labelled "strong". Returns 0 for empty samples.
 */
export function wilsonLowerBound(successes, trials, z = 1.96) {
  if (!trials) return 0;
  const phat = successes / trials;
  const denom = 1 + (z * z) / trials;
  const centre = phat + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * trials)) / trials);
  return (centre - spread) / denom;
}

/** Normalise free text for duplicate detection and search. */
export function normaliseText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenSet(text) {
  return new Set(normaliseText(text).split(' ').filter((t) => t.length > 1));
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function shingles(text, n = 3) {
  const tokens = normaliseText(text).split(' ').filter(Boolean);
  const out = new Set();
  for (let i = 0; i + n <= tokens.length; i += 1) out.add(tokens.slice(i, i + n).join(' '));
  if (!out.size && tokens.length) out.add(tokens.join(' '));
  return out;
}

/** Sort helper factory: sortBy(x => x.score, 'desc') */
export function sortBy(pick, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return (a, b) => {
    const va = pick(a);
    const vb = pick(b);
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    return va > vb ? sign : -sign;
  };
}

export function pickFields(source, fields) {
  const out = {};
  for (const f of fields) if (source && f in source) out[f] = source[f];
  return out;
}
