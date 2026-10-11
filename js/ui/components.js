/**
 * components.js — Dependency-free UI & provenance building blocks.
 *
 * Views build HTML strings with these helpers and attach behaviour in `mount()`
 * using event delegation. Zero inline style attributes are emitted here so
 * all visual rules remain governed by css/app.css tokens.
 */

import { esc, fmtPct, fmtMarks, fmtDate, fmtClock, fmtDuration, round, clamp } from '../core/util.js';
import { QUESTION_TYPES, ANSWER_KEY_STATUSES, EXPLANATION_STATUSES, CONFIDENCE_LEVELS, LANGUAGE_LABELS } from '../core/constants.js';

export { esc, fmtPct, fmtMarks, fmtDate, fmtClock, fmtDuration, round };

/* --------------------------------------------------------------- icons ---- */

const ICONS = {
  dashboard: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  'test-centre': '<path d="M9 3h6a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2V5a2 2 0 0 1 2-2zm0 3h6V5H9v1zm-1 5h8m-8 4h5"/>',
  topic: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2"/>',
  custom: '<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"/>',
  smart: '<path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/>',
  mistakes: '<path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
  revision: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2"/>',
  syllabus: '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  analytics: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  bank: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3m.08 4h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  alert: '<path d="M12 8v5m0 4h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  shield: '<path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6l7-3z"/><path d="m9 12 2 2 4-4"/>',
  flame: '<path d="M12 3c1.6 3.4.4 5.2-1.2 6.8C9.1 11.5 8 13 8 15a4 4 0 0 0 8 0c0-1.4-.6-2.6-1.5-3.6-.3 1-1 1.6-1.7 1.9.6-2.6-.3-5.6-2.8-8.3.6-1.2 1.2-1.7 2-2z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  arrowRight: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  arrowUp: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14m6-6-6 6-6-6"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9m-5 5 5-5 5 5"/><path d="M5 3h14"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 11h18"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="m14 6 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6m4-6v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  play: '<path d="M7 4l13 8-13 8V4z"/>',
  pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>',
  sparkle: '<path d="M12 3v4m0 10v4M5 12H1m22 0h-4M6.3 6.3 3.5 3.5m17 17-2.8-2.8M6.3 17.7l-2.8 2.8m17-17-2.8 2.8"/><circle cx="12" cy="12" r="3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2z"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
};

function iconFn(name, opts) {
  return icon(name, opts);
}

export function icon(name, { size = 16, label = null } = {}) {
  const inner = ICONS[name] || ICONS.help;
  const aria = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${aria}>${inner}</svg>`;
}

/** Detect Devanagari characters so Hindi strings can be marked with lang="hi". */
export function hasDevanagari(text) {
  return typeof text === 'string' && /[\u0900-\u097F]/.test(text);
}

export function langAttr(text, explicitLang = null) {
  if (explicitLang === 'hi' || hasDevanagari(text)) return ' lang="hi"';
  if (explicitLang === 'en') return ' lang="en"';
  return '';
}

/* ----------------------------------------------------- provenance vocabulary */

const SOURCE_META = {
  measured: { cls: 'measured', label: 'measured', title: 'Directly measured from your recorded attempts in this browser' },
  derived: { cls: 'derived', label: 'derived', title: 'Calculated deterministically from your recorded attempts and rules' },
  unavailable: { cls: 'unavailable', label: 'unavailable', title: 'Not supplied in the source data — never guessed or invented' },
  synthetic: { cls: 'synthetic', label: 'synthetic demo', title: 'Synthetic demonstration content — not a genuine MPPSC question' },
  supplied: { cls: 'supplied', label: 'supplied key', title: 'From the answer key or metadata supplied with the imported bank' },
  verified: { cls: 'verified', label: 'verified key', title: 'Independently verified and recorded in the question bank' },
  disputed: { cls: 'disputed', label: 'disputed', title: 'Answer key is disputed or unresolved' },
};

/**
 * Render a consistent provenance source chip:
 * `measured` | `derived` | `unavailable` | `synthetic` | `supplied` | `verified` | `disputed`
 */
export function sourceChip(kind, customLabel = null) {
  const meta = SOURCE_META[kind] || SOURCE_META.measured;
  const text = customLabel || meta.label;
  return `<span class="prov-chip ${meta.cls}" data-source="${esc(kind || 'measured')}" title="${esc(meta.title)}">${esc(text)}</span>`;
}

/**
 * Render a 3-step evidence-strength meter (`n=0..3+`).
 * Samples with `< minSample` judged questions are visually distinct so the user
 * never mistakes a 1-question sample for a reliable topic assessment.
 */
export function evidenceMeter(judgedCount, minSample = 3, { showLabel = true } = {}) {
  const n = Math.max(0, Number(judgedCount) || 0);
  const steps = Math.min(3, n);
  const insufficient = n < minSample;
  const cls = insufficient ? 'insufficient' : 'sufficient';
  const label = insufficient ? `n=${n} (<${minSample})` : `n=${n}`;
  const title = insufficient
    ? `Insufficient evidence: ${n} of ${minSample} required judged attempts recorded`
    : `Evidence threshold met: ${n} judged attempts recorded (min ${minSample})`;
  return `<span class="evidence-meter ${cls}" title="${esc(title)}" role="img" aria-label="${esc(title)}">
    <span class="evidence-dots" aria-hidden="true">
      <i class="evidence-dot ${steps >= 1 ? 'on' : ''}"></i>
      <i class="evidence-dot ${steps >= 2 ? 'on' : ''}"></i>
      <i class="evidence-dot ${steps >= 3 ? 'on' : ''}"></i>
    </span>
    ${showLabel ? `<span>${esc(label)}</span>` : ''}
  </span>`;
}

export function provenanceLine({ source = 'measured', text = '' } = {}) {
  return `<div class="prov-line">${sourceChip(source)}<span>${esc(text)}</span></div>`;
}

/* --------------------------------------------------------------- basics --- */

export const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;

export const demoBadge = (isDemo) =>
  isDemo
    ? '<span class="demo-flag" title="Synthetic demonstration content — not a genuine previous-year question">demonstration</span>'
    : '';

export function card({ title = null, subtitle = null, actions = '', right = '', body = '', footer = null, tone = '', id = null, className = '' } = {}) {
  const rightContent = actions || right;
  const head =
    title || subtitle || rightContent
      ? `<div class="card-head"><div>${title ? `<h2>${esc(title)}</h2>` : ''}${subtitle ? `<div class="muted small">${esc(subtitle)}</div>` : ''}</div>${rightContent ? `<div class="card-actions">${rightContent}</div>` : ''}</div>`
      : '';
  return `<section class="card ${tone} ${className}" ${id ? `id="${esc(id)}"` : ''}>
    ${head}
    <div class="card-body">${body}</div>
    ${footer === null || footer === '' ? '' : `<div class="card-foot">${footer}</div>`}
  </section>`;
}

export function tile({ label, value, sub = '', tone = '', source = null, where = null, icon = null, iconName = null, trend = null, id = null }) {
  const chipHtml = source ? sourceChip(source) : '';
  const whereHtml = where ? `<div class="tile-prov">${esc(where)}</div>` : '';
  const trendHtml = trend ? `<span class="kpi-trend ${esc(trend.tone || 'flat')}">${esc(trend.label)}</span>` : '';
  const glyph = iconName || icon;
  return `<div class="tile ${tone}" ${id ? `id="${esc(id)}"` : ''}>
    <div class="tile-label"><span>${glyph ? `<span class="tile-icon" aria-hidden="true">${iconFn(glyph, { size: 15 })}</span> ` : ''}${esc(label)}</span>${trendHtml || chipHtml}</div>
    <div class="tile-value">${value}</div>
    ${sub ? `<div class="tile-sub">${sub}</div>` : ''}
    ${whereHtml}
  </div>`;
}

/**
 * KPI card used by the dashboard and other overview screens: an icon, a large
 * value, an optional trend chip, a sparkline and secondary figures.
 */
export function kpi({ label, value, context = '', tone = '', iconName = null, trend = null, spark = null, foot = null }) {
  const trendHtml = trend ? `<span class="kpi-trend ${esc(trend.tone || 'flat')}">${esc(trend.label)}</span>` : '';
  return `<article class="kpi ${esc(tone)}">
    <div class="kpi-top">
      <span class="kpi-label">${esc(label)}</span>
      ${iconName ? `<span class="kpi-icon" aria-hidden="true">${icon(iconName, { size: 18 })}</span>` : ''}
    </div>
    <div class="kpi-value">${value}${trendHtml ? ` ${trendHtml}` : ''}</div>
    ${context ? `<div class="kpi-context">${context}</div>` : ''}
    ${spark ? `<div class="kpi-spark">${sparkline(spark)}</div>` : ''}
    ${foot ? `<div class="kpi-foot">${foot}</div>` : ''}
  </article>`;
}

export function notice(html, tone = 'info', { title = null } = {}) {
  return `<div class="notice ${tone}">${title ? `<strong>${esc(title)}</strong> ` : ''}${html}</div>`;
}

export const emptyState = ({ title, message = '', body = '', action = '', actionHref = null, actionLabel = '', iconName = null } = {}) => {
  const text = message || body;
  const actionHtml = action || (actionHref && actionLabel ? `<a class="btn btn-primary" href="${esc(actionHref)}">${esc(actionLabel)}</a>` : '');
  const iconHtml = iconName ? `<span class="empty-icon" aria-hidden="true">${icon(iconName, { size: 24 })}</span>` : '';
  return `<div class="empty-block">${iconHtml}<strong>${esc(title)}</strong>${text ? `<p class="muted small">${text}</p>` : ''}${actionHtml ? `<div class="empty-actions">${actionHtml}</div>` : ''}</div>`;
};

export const loadingState = (message = 'Loading local data…') =>
  `<div class="loading-shell" aria-busy="true" role="status">
    <span class="sr-only">${esc(message)}</span>
    <span class="skeleton-line" aria-hidden="true"></span>
    <div class="skeleton-grid" aria-hidden="true">
      <span class="skeleton-card"></span><span class="skeleton-card"></span><span class="skeleton-card"></span>
    </div>
    <div class="skeleton-stack" aria-hidden="true">
      <span class="skeleton-line medium"></span>
      <span class="skeleton-line"></span>
      <span class="skeleton-line short"></span>
    </div>
  </div>`;

/** Inline skeleton for a card body that is computing something. */
export const skeletonStack = (lines = 3) =>
  `<div class="skeleton-stack" aria-hidden="true">${Array.from({ length: lines }, (_, i) => `<span class="skeleton-line ${i === 0 ? 'short' : i === 1 ? 'medium' : ''}"></span>`).join('')}</div>`;

/* ---------------------------------------------------- layout primitives -- */

/** Screen title block with an optional description and action buttons. */
export function pageHead({ title, description = '', actions = '', meta = '' } = {}) {
  return `<header class="page-head">
    <div class="grow">
      <h1>${title}</h1>
      ${description ? `<p class="page-sub">${description}</p>` : ''}
      ${meta}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

/** In-page section heading (h2) with optional right-hand meta/actions. */
export function sectionHead({ title, meta = '', actions = '', id = null, kicker = '' } = {}) {
  return `<div class="section-head" ${id ? `id="${esc(id)}"` : ''}>
    <div>${kicker ? `<span class="section-kicker">${esc(kicker)}</span>` : ''}<h2>${esc(title)}</h2></div>
    ${meta ? `<span class="muted small">${meta}</span>` : ''}
    ${actions ? `<div class="toolbar">${actions}</div>` : ''}
  </div>`;
}

/** Compact inline stat strip. */
export const statStrip = (items = []) =>
  `<div class="stat-strip">${items
    .map(([label, value, extra = '']) => `<div><span class="stat-label">${esc(label)}</span><span class="stat-value">${value}</span>${extra ? `<span class="tiny muted">${extra}</span>` : ''}</div>`)
    .join('')}</div>`;

/** Circular progress ring driven by a real 0–1 value. */
export function ring(value, { label = '', sub = '', size = 108, width = 10, tone = '' } = {}) {
  const safe = Math.max(0, Math.min(1, Number(value) || 0));
  const pctText = `${Math.round(safe * 100)}%`;
  return `<div class="ring ${esc(tone)}" data-ring="${safe.toFixed(3)}" role="img" aria-label="${esc(`${label || sub || 'Progress'}: ${pctText}`)}">
    <svg viewBox="0 0 108 108" aria-hidden="true">
      <circle class="ring-track" cx="54" cy="54" r="48"></circle>
      <circle class="ring-value" cx="54" cy="54" r="48" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${(100 - 100 * safe).toFixed(2)}"></circle>
    </svg>
    <span class="ring-label"><strong>${pctText}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
  </div>`;
}

/** Vertical activity timeline. Items: { tone, glyph, title, meta, body } */
export const timeline = (items = []) =>
  `<ul class="timeline">${items
    .map(
      (item) => `<li class="timeline-item">
        <span class="timeline-dot ${esc(item.tone || '')}" aria-hidden="true">${item.glyph || '•'}</span>
        <div class="timeline-body">
          <span class="timeline-title">${item.title}</span>
          ${item.meta ? `<span class="timeline-meta">${item.meta}</span>` : ''}
          ${item.body ? `<span class="small">${item.body}</span>` : ''}
        </div>
      </li>`,
    )
    .join('')}</ul>`;

/** Filter chip that behaves like a real toggle (views wire the click). */
export const filterChip = ({ id, label, count = null, pressed = false, action = 'filter', data = {} } = {}) => {
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${esc(k)}="${esc(String(v))}"`)
    .join('');
  return `<button class="filter-chip" type="button" data-action="${esc(action)}" data-value="${esc(id)}" aria-pressed="${pressed ? 'true' : 'false'}"${attrs}>${esc(label)}${count === null ? '' : ` <span class="chip-count">${esc(String(count))}</span>`}</button>`;
};

/* --------------------------------------- global interaction enhancers ----- */

/**
 * Chart tooltips for every `.chart-wrap` on the page, including charts rendered
 * later by any view (delegated events, installed once).
 */
export function installChartEnhancers() {
  if (typeof document === 'undefined' || document.__mymppscChartEnhancers) return;
  document.__mymppscChartEnhancers = true;

  const show = (target) => {
    const tip = target?.getAttribute?.('data-tip');
    if (!tip) return;
    const wrap = target.closest('.chart-wrap');
    const box = wrap?.querySelector('.chart-tooltip');
    if (!box) return;
    const view = (wrap.dataset.chartView || '660x150').split('x').map(Number);
    const x = Number(target.getAttribute('data-tip-x'));
    const y = Number(target.getAttribute('data-tip-y'));
    box.innerHTML = `<strong>${esc(tip.split(':')[0] || '')}</strong><div class="tip-row"><span><i class="tip-swatch"></i>${esc(tip.split(':').slice(1).join(':').trim() || tip)}</span></div>`;
    box.style.setProperty('--tip-x', ((x / view[0]) * 100).toFixed(2));
    box.style.setProperty('--tip-y', ((y / view[1]) * 100).toFixed(2));
    box.hidden = false;
    box.classList.add('on');
  };
  const hide = (target) => {
    const wrap = target?.closest?.('.chart-wrap');
    const box = wrap?.querySelector('.chart-tooltip');
    if (!box) return;
    box.classList.remove('on');
    box.hidden = true;
  };

  document.addEventListener('pointerover', (ev) => {
    const target = ev.target?.closest?.('[data-tip]');
    if (target) show(target);
  });
  document.addEventListener('pointerout', (ev) => {
    const target = ev.target?.closest?.('[data-tip]');
    if (target) hide(target);
  });
  document.addEventListener('focusin', (ev) => {
    const target = ev.target?.closest?.('[data-tip]');
    if (target) show(target);
  });
  document.addEventListener('focusout', (ev) => {
    const target = ev.target?.closest?.('[data-tip]');
    if (target) hide(target);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    document.querySelectorAll('.chart-tooltip.on').forEach((box) => {
      box.classList.remove('on');
      box.hidden = true;
    });
  });
}

/**
 * Client-side sorting for every `table[data-sortable]` in the document.
 * Values are compared numerically when both cells parse as numbers, otherwise
 * as locale strings; `data-sort-value` on a cell overrides the visible text.
 */
export function installTableSorting() {
  if (typeof document === 'undefined' || document.__mymppscTableSorting) return;
  document.__mymppscTableSorting = true;

  const cellValue = (row, index) => {
    const cell = row.children[index];
    if (!cell) return '';
    const raw = cell.getAttribute('data-sort-value');
    if (raw !== null) return raw;
    const sized = cell.querySelector('[data-sort-value]')?.getAttribute('data-sort-value');
    if (sized != null) return sized;
    return (cell.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const compare = (a, b) => {
    const na = Number(String(a).replace(/[^0-9.+-]/g, ''));
    const nb = Number(String(b).replace(/[^0-9.+-]/g, ''));
    const numeric = String(a).trim() !== '' && String(b).trim() !== '' && Number.isFinite(na) && Number.isFinite(nb);
    if (numeric) return na - nb;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  };

  document.addEventListener('click', (ev) => {
    const button = ev.target?.closest?.('.th-sort');
    if (!button) return;
    const table = button.closest('table');
    const tbody = table?.querySelector('tbody');
    if (!table || !tbody) return;
    ev.preventDefault();
    const index = Number(button.dataset.sortIndex);
    const current = button.getAttribute('aria-sort');
    const direction = current === 'ascending' ? 'descending' : 'ascending';
    table.querySelectorAll('.th-sort').forEach((other) => other.removeAttribute('aria-sort'));
    button.setAttribute('aria-sort', direction);
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const result = compare(cellValue(a, index), cellValue(b, index));
      return direction === 'ascending' ? result : -result;
    });
    for (const row of rows) tbody.appendChild(row);
  });
}


export const kv = (pairs = []) =>
  `<dl class="kv">${pairs
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === null || v === undefined || v === '' ? '<span class="soft">not recorded</span>' : v}</dd>`)
    .join('')}</dl>`;

/* ---------------------------------------------------------------- tables -- */

/**
 * Supports both `{ columns: [{ label, num }], rows }` and `{ headers: ['...'], rows }`.
 */
export function dataTable({ columns = null, headers = [], rows = [], empty = 'Nothing to show.', className = '', sortable = false, id = '' } = {}) {
  if (!rows.length) return `<p class="muted small m-0">${esc(empty)}</p>`;
  const cols = columns || headers.map((h) => (typeof h === 'string' ? { label: h, num: false } : h));
  const headCell = (c, index) => {
    if (!sortable || c.sortable === false) return `<th ${c.num ? 'class="num"' : ''}>${esc(c.label)}</th>`;
    return `<th ${c.num ? 'class="num"' : ''} data-sort-col="${index}"><button class="th-sort" type="button" data-sort-index="${index}" aria-label="Sort by ${esc(c.label)}">${esc(c.label)}</button></th>`;
  };
  return `<div class="table-wrap"><table class="data ${className}"${sortable ? ' data-sortable="true"' : ''}${id ? ` id="${esc(id)}"` : ''}>
    <thead><tr>${cols.map(headCell).join('')}</tr></thead>
    <tbody>${rows
      .map(
        (r) =>
          `<tr>${r
            .map((cell, i) => {
              const col = cols[i];
              const labelAttr = col?.label ? ` data-label="${esc(col.label)}"` : '';
              return `<td ${col?.num ? 'class="num"' : ''}${labelAttr}>${cell ?? ''}</td>`;
            })
            .join('')}</tr>`,
      )
      .join('')}</tbody>
  </table></div>`;
}

/* --------------------------------------------------------------- visuals -- */

export function barList(items = [], optsOrMax = {}) {
  if (!items.length) return '<p class="muted small m-0">No data yet.</p>';
  const maxOpt = typeof optsOrMax === 'number' ? optsOrMax : optsOrMax?.max ?? null;
  const maxVal = Math.max(...items.map((i) => Number(i.value) || 0), 0);
  const ceiling = maxOpt || (maxVal <= 1 && maxVal > 0 ? 1 : Math.max(maxVal, 1));
  return `<div class="bar-list">${items
    .map((item) => {
      const value = Number(item.value) || 0;
      const pctWidth = clamp((value / ceiling) * 100, 0, 100);
      return `<div class="bar-item">
        <span class="nowrap" title="${esc(item.label)}">${esc(item.label)}</span>
        <svg class="bar-svg" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
          <rect class="bar-bg" x="0" y="0" width="100" height="8" rx="4" ry="4"></rect>
          <rect class="bar-fg ${esc(item.tone || '')}" x="0" y="0" width="${pctWidth.toFixed(1)}" height="8" rx="4" ry="4"></rect>
        </svg>
        <span class="num tiny muted">${item.right ?? esc(String(value))}</span>
      </div>`;
    })
    .join('')}</div>`;
}

export function progressBar(valueOrFraction, maxOrTone = '', maybeTone = '') {
  let pctWidth;
  let tone = '';
  if (typeof maxOrTone === 'number') {
    const safeMax = Math.max(1, maxOrTone);
    pctWidth = clamp(((Number(valueOrFraction) || 0) / safeMax) * 100, 0, 100);
    tone = maybeTone || '';
  } else {
    pctWidth = clamp((Number(valueOrFraction) || 0) * 100, 0, 100);
    tone = maxOrTone || '';
  }
  return `<svg class="progress-svg" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="${Math.round(pctWidth)}% complete">
    <rect class="progress-bg" x="0" y="0" width="100" height="8" rx="4" ry="4"></rect>
    <rect class="progress-fg ${esc(tone)}" x="0" y="0" width="${pctWidth.toFixed(1)}" height="8" rx="4" ry="4"></rect>
  </svg>`;
}

/** Vertical bar chart (SVG) with accessible table fallback. */
export function barChart(arg1 = {}, arg2 = {}) {
  const isArrayArg = Array.isArray(arg1);
  const data = isArrayArg ? arg1 : arg1.data || [];
  const height = (isArrayArg ? arg2.height : arg1.height) || 150;
  const valueFormat = (isArrayArg ? arg2.valueFormat : arg1.valueFormat) || ((v) => String(v));
  const yLabel = (isArrayArg ? arg2.yLabel || arg2.title : arg1.yLabel || arg1.title) || 'Bar chart';
  const interactive = (isArrayArg ? arg2.interactive : arg1.interactive) !== false;
  const unitLabel = (isArrayArg ? arg2.unitLabel : arg1.unitLabel) || '';

  if (!data.length) return '<p class="muted small m-0">No data to chart yet.</p>';
  const w = 660;
  const h = height;
  const padL = 34;
  const padB = 26;
  const padT = 10;
  const max = Math.max(...data.map((d) => Number(d.value) || 0), 1);
  const innerW = w - padL - 8;
  const innerH = h - padB - padT;
  const bw = Math.max(6, innerW / data.length - 6);
  const bars = data
    .map((d, i) => {
      const v = Number(d.value) || 0;
      const bh = (v / max) * innerH;
      const x = padL + i * (innerW / data.length) + 2;
      const y = padT + innerH - bh;
      const labelEvery = Math.ceil(data.length / 12);
      const label = i % labelEvery === 0 ? `<text class="axis-label" x="${(x + bw / 2).toFixed(1)}" y="${h - 8}" text-anchor="middle">${esc(d.label)}</text>` : '';
      const tip = `${esc(d.label)}: ${esc(valueFormat(v))}${unitLabel ? ` ${esc(unitLabel)}` : ''}`;
      const hit = interactive
        ? `<rect class="bar hit" x="${x.toFixed(1)}" y="${padT}" width="${bw.toFixed(1)}" height="${innerH}" tabindex="0" role="img" aria-label="${tip}" data-tip="${tip}" data-tip-x="${(x + bw / 2).toFixed(1)}" data-tip-y="${y.toFixed(1)}"><title>${tip}</title></rect>`
        : '';
      return `<g class="bar-group"><rect class="bar ${esc(d.tone || '')}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}"><title>${tip}</title></rect>${hit}${label}</g>`;
    })
    .join('');
  const gridLines = [0, 0.5, 1]
    .map((f) => {
      const y = padT + innerH * (1 - f);
      return `<line class="grid-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${w - 8}" y2="${y.toFixed(1)}"></line><text class="axis-label" x="4" y="${(y + 3).toFixed(1)}">${esc(valueFormat(Math.round(max * f * 100) / 100))}</text>`;
    })
    .join('');
  const tableRows = data.map((d) => `<tr><td>${esc(d.label)}</td><td class="num">${esc(valueFormat(Number(d.value) || 0))}</td></tr>`).join('');
  return `<div class="chart-wrap" data-chart-view="${w}x${h}">
    <svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(yLabel)}">${gridLines}${bars}</svg>
    <div class="chart-tooltip" role="status" aria-live="polite" hidden></div>
    <details class="chart-data"><summary>Data table (${data.length} rows)</summary>
      <div class="table-wrap mt-2"><table class="data compact"><thead><tr><th>Item</th><th class="num">Value</th></tr></thead><tbody>${tableRows}</tbody></table></div>
    </details>
  </div>`;
}

/** Line chart (SVG) with accessible table fallback. */
export function lineChart(arg1 = {}, arg2 = {}) {
  const isArrayArg = Array.isArray(arg1);
  const points = isArrayArg ? arg1 : arg1.points || [];
  const height = (isArrayArg ? arg2.height : arg1.height) || 160;
  const yMax = (isArrayArg ? arg2.maxY ?? arg2.yMax : arg1.yMax ?? arg1.maxY) ?? 1;
  const yFormat =
    (isArrayArg ? arg2.yFormat : arg1.yFormat) ||
    ((v) => (yMax === 1 ? `${Math.round(v * 100)}%` : `${Math.round(v)}${arg2.unit || ''}`));
  const labelEvery = isArrayArg ? arg2.labelEvery : arg1.labelEvery;
  const title = (isArrayArg ? arg2.title : arg1.title) || 'Trend chart';
  const interactive = (isArrayArg ? arg2.interactive : arg1.interactive) !== false;
  const area = (isArrayArg ? arg2.area : arg1.area) !== false;

  if (points.length < 2) return '<p class="muted small m-0">At least two data points are needed to show a trend.</p>';
  const w = 660;
  const h = height;
  const padL = 36;
  const padB = 24;
  const padT = 10;
  const innerW = w - padL - 8;
  const innerH = h - padB - padT;
  const step = innerW / (points.length - 1);
  const yOf = (v) => padT + innerH - (clamp(Number(v) || 0, 0, yMax) / yMax) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(padL + i * step).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(' ');
  const dots = points
    .map((p, i) => {
      const cx = (padL + i * step).toFixed(1);
      const cy = yOf(p.value).toFixed(1);
      const tip = `${esc(p.label)}: ${esc(yFormat(p.value))}`;
      return `<circle class="point" cx="${cx}" cy="${cy}" r="4"${interactive ? ` tabindex="0" role="img" aria-label="${tip}" data-tip="${tip}" data-tip-x="${cx}" data-tip-y="${cy}"` : ''}><title>${tip}</title></circle>`;
    })
    .join('');
  const areaPath = area && points.length > 1
    ? `<path class="area" d="${path} L${(padL + (points.length - 1) * step).toFixed(1)},${(padT + innerH).toFixed(1)} L${padL},${(padT + innerH).toFixed(1)} Z"></path>`
    : '';
  const every = labelEvery || Math.ceil(points.length / 10);
  const labels = points
    .map((p, i) => (i % every === 0 ? `<text class="axis-label" x="${(padL + i * step).toFixed(1)}" y="${h - 8}" text-anchor="middle">${esc(p.label)}</text>` : ''))
    .join('');
  const grid = [0, 0.5, 1]
    .map((f) => {
      const y = padT + innerH * (1 - f);
      return `<line class="grid-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${w - 8}" y2="${y.toFixed(1)}"></line><text class="axis-label" x="4" y="${(y + 3).toFixed(1)}">${esc(yFormat(yMax * f))}</text>`;
    })
    .join('');
  const tableRows = points.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${esc(yFormat(p.value))}</td></tr>`).join('');
  return `<div class="chart-wrap" data-chart-view="${w}x${h}">
    <svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">${grid}${areaPath}${path ? `<path class="line" d="${path}"></path>` : ''}${dots}${labels}</svg>
    <div class="chart-tooltip" role="status" aria-live="polite" hidden></div>
    <details class="chart-data"><summary>Data table (${points.length} points)</summary>
      <div class="table-wrap mt-2"><table class="data compact"><thead><tr><th>Point</th><th class="num">Value</th></tr></thead><tbody>${tableRows}</tbody></table></div>
    </details>
  </div>`;
}

export function sparkline(values = [], { width = 120, height = 26 } = {}) {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`).join(' ');
  return `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path class="line" d="${path}"></path></svg>`;
}

/* ------------------------------------------------------ display helpers --- */

export const pct = (value, digits = 0) => (Number.isFinite(value) ? fmtPct(value, digits) : '<span class="soft">—</span>');

export function accuracyCell(accuracyOrObj, scoredOrNull = null, minSample = 3) {
  let accuracy = accuracyOrObj;
  let judged = scoredOrNull;
  if (accuracyOrObj && typeof accuracyOrObj === 'object') {
    accuracy = accuracyOrObj.accuracy;
    judged = accuracyOrObj.judged;
    minSample = accuracyOrObj.minSample ?? minSample;
  }
  if (!Number.isFinite(accuracy)) return '<span class="soft">not enough evidence</span>';
  const tone = accuracy >= 0.75 ? 'ok' : accuracy >= 0.5 ? 'warn' : 'bad';
  const suffix = judged !== null && judged !== undefined && judged < minSample ? ' <span class="soft tiny">(small sample)</span>' : '';
  return `${badge(fmtPct(accuracy, 0), tone)}${suffix}`;
}

export const confidenceLabel = (value) => (value ? CONFIDENCE_LEVELS[value] || value : '—');

export const questionTypeLabel = (type) => QUESTION_TYPES[type] || type || 'unknown';

export function answerKeyBadge(status) {
  const map = { final: 'ok', provisional: 'info', unofficial: 'warn', disputed: 'bad', missing: 'bad', unknown: '' };
  return badge(ANSWER_KEY_STATUSES[status] || status || 'unknown', map[status] || '');
}

export function explanationBadge(status) {
  const map = { approved: 'ok', reviewed: 'ok', generated: 'warn', missing: 'bad' };
  return badge(EXPLANATION_STATUSES[status] || status || 'missing', map[status] ?? '');
}

export function languageSwitcher(question, activeLang, { languages = null } = {}) {
  const available = languages || Object.keys(question.language_variants || {});
  if (available.length < 2) return '';
  return `<span class="seg" role="group" aria-label="Question language" data-lang-switch>
    ${available
      .map(
        (lang) =>
          `<button type="button" data-lang="${esc(lang)}" aria-pressed="${lang === activeLang}">${esc(LANGUAGE_LABELS[lang] || lang)}</button>`,
      )
      .join('')}
  </span>`;
}

/**
 * Render the explanation block, clearly marking missing/unreviewed content.
 * The app never generates explanations: it displays what the pipeline supplied.
 */
export function renderExplanation(question, { compact = false } = {}) {
  const explanation = question.explanation;
  const status = explanation?.status || question.explanation_status || 'missing';
  if (!explanation) {
    return `<div class="explanation"><h3>Explanation ${sourceChip('unavailable', 'not supplied')}</h3><p class="muted small m-0">No explanation is available for this question. Explanations are produced and reviewed by the separate preparation pipeline — this app does not generate them, and it will not show filler text.</p></div>`;
  }
  const unreviewed = status === 'generated';
  const rows = (explanation.option_explanations || []).filter((o) => o.text);
  return `<div class="explanation">
    <h3>Explanation ${explanationBadge(status)}</h3>
    ${unreviewed ? '<p class="small text-warn mt-0">This explanation has not been reviewed yet. Treat it as a draft.</p>' : ''}
    ${explanation.correct_reasoning ? `<p${langAttr(explanation.correct_reasoning)}>${esc(explanation.correct_reasoning)}</p>` : '<p class="muted small">The pipeline supplied no reasoning text.</p>'}
    ${
      rows.length
        ? `<h3>Option by option</h3><div class="table-wrap"><table class="data compact options-table"><tbody>${rows
            .map(
              (o) =>
                `<tr><td class="mono col-key">${esc(o.key || '—')}</td><td${langAttr(o.text)}>${esc(o.text)}</td><td class="col-status">${o.is_correct === true ? badge('correct', 'ok') : o.is_correct === false ? badge('not correct', 'plain') : '<span class="soft tiny">unstated</span>'}</td></tr>`,
            )
            .join('')}</tbody></table></div>`
        : ''
    }
    ${explanation.key_concepts?.length ? `<h3>Related concepts</h3><div class="chips">${explanation.key_concepts.map((c) => `<span class="chip"${langAttr(c)}>${esc(c)}</span>`).join('')}</div>` : ''}
    ${explanation.revision_takeaways?.length ? `<h3>Revision takeaways</h3><ul class="small">${explanation.revision_takeaways.map((t) => `<li${langAttr(t)}>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${
      explanation.sources?.length
        ? `<h3>Sources cited by the pipeline</h3><ul class="small">${explanation.sources
            .map(
              (s) =>
                `<li>${esc(s.title || s.citation || 'source')}${s.url ? ` — <a href="${esc(s.url)}" rel="noopener noreferrer">link</a>` : ''}${s.citation && s.title ? `<br><span class="soft">${esc(s.citation)}</span>` : ''}</li>`,
            )
            .join('')}</ul>`
        : '<p class="tiny soft mb-0">No sources were supplied with this explanation.</p>'
    }
    ${compact ? '' : `<p class="tiny soft mt-2 mb-0">Status: ${esc(status)}${explanation.reviewed_by ? ` · reviewed by ${esc(explanation.reviewed_by)}` : ''}${explanation.generated_by ? ` · generated by ${esc(explanation.generated_by)}` : ''}</p>`}
  </div>`;
}

export function sourceLine(question) {
  const ref = question.source_reference;
  if (!ref) return '<span class="soft">No source reference recorded.</span>';
  const bits = [
    ref.file,
    ref.page !== null && ref.page !== undefined ? `page ${esc(String(ref.page))}` : null,
    ref.question_location ? esc(ref.question_location) : null,
    ref.note ? esc(ref.note) : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : '<span class="soft">No source reference recorded.</span>';
}

/** Warning list shown wherever authenticity or completeness is in question. */
export function warningList(warnings, { title = 'Read before you start' } = {}) {
  if (!warnings?.length) return '';
  return notice(`<ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`, 'warn', { title });
}

/* ------------------------------------------------------------------ tabs -- */

/**
 * Accessible tablist implementing the WAI-ARIA Authoring Practices Guide (APG)
 * roving tabindex pattern (Left/Right/Home/End keys).
 * Supports both `{ id, items: [{ id, label, body }], activeId }` and `{ items: [{ id, label, content }], active }`.
 */
export function tabs({ id = '', items = [], activeId = null, active = null } = {}) {
  if (!items.length) return '';
  const selectedId = activeId || active || items[0].id;
  return `<div class="tabs" role="tablist" ${id ? `id="${esc(id)}"` : ''}>
    ${items
      .map((item) => {
        const isSelected = item.id === selectedId;
        return `<button class="tab" role="tab" type="button" data-tab="${esc(item.id)}" aria-selected="${isSelected}" tabindex="${isSelected ? '0' : '-1'}" aria-controls="${esc(item.id)}-panel" id="${esc(item.id)}-tab">${esc(item.label)}</button>`;
      })
      .join('')}
  </div>
  ${items
    .map((item) => {
      const isSelected = item.id === selectedId;
      const panelHtml = item.body ?? item.content ?? '';
      return `<div class="tabpanel" id="${esc(item.id)}-panel" role="tabpanel" tabindex="0" aria-labelledby="${esc(item.id)}-tab" ${isSelected ? '' : 'hidden'}>${panelHtml}</div>`;
    })
    .join('')}`;
}

export function mountTabs(root, onChange = null) {
  if (!root) return;
  const activateTab = (tab, { focus = false } = {}) => {
    const bar = tab.closest('.tabs');
    if (!bar) return;
    const allTabs = Array.from(bar.querySelectorAll('.tab'));
    allTabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.setAttribute('tabindex', selected ? '0' : '-1');
      const panelId = `${t.dataset.tab}-panel`;
      const panel = root.querySelector(`#${CSS.escape ? CSS.escape(panelId) : panelId}`);
      if (panel) panel.hidden = !selected;
    });
    if (focus) tab.focus();
    if (typeof onChange === 'function') onChange(tab.dataset.tab);
  };

  root.querySelectorAll('.tabs').forEach((bar) => {
    const allTabs = Array.from(bar.querySelectorAll('.tab'));
    allTabs.forEach((tab) => {
      tab.addEventListener('click', () => activateTab(tab, { focus: false }));
      tab.addEventListener('keydown', (ev) => {
        const idx = allTabs.indexOf(tab);
        if (idx === -1) return;
        let nextIdx = -1;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
          nextIdx = (idx + 1) % allTabs.length;
        } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
          nextIdx = (idx - 1 + allTabs.length) % allTabs.length;
        } else if (ev.key === 'Home') {
          nextIdx = 0;
        } else if (ev.key === 'End') {
          nextIdx = allTabs.length - 1;
        }
        if (nextIdx !== -1) {
          ev.preventDefault();
          activateTab(allTabs[nextIdx], { focus: true });
        }
      });
    });
  });
}

/* ----------------------------------------------------------- modal/toast -- */

const MAX_TOASTS = 4;

export function toast(message, tone = 'info', timeout = 5200) {
  const stack = document.getElementById('toastStack');
  if (!stack) return null;

  while (stack.children.length >= MAX_TOASTS) {
    stack.firstElementChild?.remove();
  }

  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.setAttribute('role', tone === 'bad' ? 'alert' : 'status');
  const bodyHtml = typeof message === 'string' ? esc(message) : String(message);
  const glyph = { ok: '✓', bad: '!', warn: '!', info: 'i' }[tone] || 'i';
  node.innerHTML = `<span class="toast-icon" aria-hidden="true">${glyph}</span><div class="toast-body">${bodyHtml}</div><button class="toast-close" type="button" aria-label="Dismiss notification">✕</button>`;
  stack.appendChild(node);

  let timer = null;
  const startTimer = () => {
    if (timeout <= 0) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      node.remove();
    }, timeout);
    timer?.unref?.();
  };
  const pauseTimer = () => {
    clearTimeout(timer);
  };

  node.querySelector('.toast-close')?.addEventListener('click', () => {
    clearTimeout(timer);
    node.remove();
  });
  node.addEventListener('mouseenter', pauseTimer);
  node.addEventListener('mouseleave', startTimer);
  node.addEventListener('focusin', pauseTimer);
  node.addEventListener('focusout', startTimer);

  startTimer();
  return node;
}

let modalCleanup = null;
let modalTitleCounter = 0;

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.closest('[hidden]'));
}

function setBackgroundInert(isInert) {
  for (const id of ['appHeader', 'appBody', 'main']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.inert = isInert;
    if (isInert) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }
  document.body?.classList.toggle('modal-open', isInert);
}

/**
 * Open an accessible modal dialog with focus move, Tab/Shift+Tab focus trap,
 * Escape and backdrop click dismissal, background inert + scroll lock, and
 * focus restoration to the opener.
 */
export function openModal({ title, body, actions = [], wide = false, onMount = null, dismissible = true }) {
  const root = document.getElementById('modalRoot');
  if (!root) return Promise.resolve(null);
  if (modalCleanup) {
    document.removeEventListener('keydown', modalCleanup, true);
    modalCleanup = null;
  }
  const opener = document.activeElement && typeof document.activeElement.focus === 'function' ? document.activeElement : null;
  const titleId = `modalTitle-${++modalTitleCounter}`;

  return new Promise((resolve) => {
    let onKeyDown = null;
    const close = (value) => {
      root.hidden = true;
      root.innerHTML = '';
      setBackgroundInert(false);
      if (onKeyDown) {
        document.removeEventListener('keydown', onKeyDown, true);
        if (modalCleanup === onKeyDown) modalCleanup = null;
        onKeyDown = null;
      }
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        try {
          opener.focus();
        } catch {
          /* ignore focus restoration failure in detached nodes */
        }
      }
      resolve(value);
    };

    root.hidden = false;
    setBackgroundInert(true);

    root.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" aria-label="${esc(title)}" tabindex="-1">
      <div class="modal-head"><h2 id="${titleId}">${esc(title)}</h2><button class="btn btn-quiet btn-icon" type="button" data-modal-close aria-label="Close">✕</button></div>
      <div class="modal-body" id="modalBody">${body}</div>
      ${
        actions.length
          ? `<div class="modal-foot">${actions
              .map(
                (a, i) =>
                  `<button class="btn ${a.tone || ''}" type="button" data-modal-action="${i}" data-value="${esc(a.value ?? a.label)}">${esc(a.label)}</button>`,
              )
              .join('')}</div>`
          : ''
      }
    </div>`;

    const modal = root.firstElementChild;
    modal.querySelectorAll('[data-modal-action]').forEach((btn) => {
      btn.addEventListener('click', () => close(btn.dataset.value));
    });
    modal.querySelectorAll('[data-modal-close]').forEach((btn) => btn.addEventListener('click', () => close(null)));
    root.onclick = (ev) => {
      if (ev.target === root && dismissible) close(null);
    };

    onKeyDown = (ev) => {
      if (ev.key === 'Escape' && dismissible) {
        ev.preventDefault();
        close(null);
        return;
      }
      if (ev.key === 'Tab') {
        const focusables = getFocusableElements(modal);
        if (!focusables.length) {
          ev.preventDefault();
          modal.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (ev.shiftKey) {
          if (active === first || !modal.contains(active)) {
            ev.preventDefault();
            last.focus();
          }
        } else if (active === last || !modal.contains(active)) {
          ev.preventDefault();
          first.focus();
        }
      }
    };
    modalCleanup = onKeyDown;
    document.addEventListener('keydown', onKeyDown, true);

    if (onMount) {
      try {
        onMount(modal, close);
      } catch (err) {
        console.error('Modal mount failed', err);
        toast(`The dialog could not be prepared: ${err.message}`, 'bad');
      }
    }

    // Move initial focus inside the dialog if onMount did not already focus an element inside it.
    if (!modal.contains(document.activeElement)) {
      const focusables = getFocusableElements(modal);
      const preferred =
        modal.querySelector('[data-modal-action][ class*="btn-primary" ]') ||
        modal.querySelector('input:not([type="hidden"]), select, textarea') ||
        focusables[0] ||
        modal;
      preferred?.focus?.();
    }
  });
}

export function confirmDialog({ title = 'Please confirm', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return openModal({
    title,
    body: `<p>${message}</p>`,
    actions: [
      { label: cancelLabel, value: 'cancel' },
      { label: confirmLabel, tone: danger ? 'btn-danger' : 'btn-primary', value: 'confirm' },
    ],
  }).then((value) => value === 'confirm');
}

export function promptDialog({ title, label, value = '', multiline = false, confirmLabel = 'Save', placeholder = '' }) {
  const fieldId = 'promptField';
  return openModal({
    title,
    body: `<label class="field"><span class="label-text">${esc(label)}</span>${
      multiline
        ? `<textarea id="${fieldId}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
        : `<input type="text" id="${fieldId}" value="${esc(value)}" placeholder="${esc(placeholder)}" />`
    }</label>`,
    actions: [
      { label: 'Cancel', value: '__cancel' },
      { label: confirmLabel, tone: 'btn-primary', value: '__confirm' },
    ],
    onMount: (modal) => {
      const input = modal.querySelector(`#${fieldId}`);
      if (input) {
        input.focus();
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' && !multiline) modal.querySelector('[data-value="__confirm"]')?.click();
        });
      }
    },
  }).then((result) => {
    if (result === '__confirm') {
      const input = document.getElementById(fieldId);
      return input ? input.value : value;
    }
    return null;
  });
}

/** Simple radio/checkbox list builder used by setup screens and settings. */
export function optionList(name, options, selected) {
  return `<div class="stack mb-2">${options
    .map(
      (opt) => `<label class="check"><input type="radio" name="${esc(name)}" value="${esc(opt.value)}" ${String(opt.value) === String(selected) ? 'checked' : ''} />
      <span><strong>${esc(opt.label)}</strong>${opt.hint ? `<span class="hint block">${esc(opt.hint)}</span>` : ''}</span></label>`,
    )
    .join('')}</div>`;
}

export const stat = (label, value, sub = '') => tile({ label, value, sub });
