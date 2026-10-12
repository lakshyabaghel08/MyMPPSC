/**
 * components.js — Dependency-free UI & provenance building blocks.
 *
 * Views build HTML strings with these helpers and attach behaviour in `mount()`
 * using event delegation. Zero inline style attributes are emitted here so
 * all visual rules remain governed by css/app.css tokens.
 */

import { esc, fmtPct, fmtMarks, fmtDate, fmtClock, fmtDuration, round, clamp } from '../core/util.js';
import { QUESTION_TYPES, CONFIDENCE_LEVELS, LANGUAGE_LABELS } from '../core/constants.js';

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
  'pyq-analysis': '<path d="M4 19h16M6 15V8m5 7V5m5 10v-4"/><path d="M3 21h18"/>',
  bank: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3m.08 4h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
};

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
  supplied: { cls: 'supplied', label: 'from your data', title: 'Taken directly from the records stored in this browser (the imported bank or your own edits)' },
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

export function tile({ label, value, sub = '', tone = '', source = null, where = null }) {
  const chipHtml = source ? sourceChip(source) : '';
  const whereHtml = where ? `<div class="tile-prov">${esc(where)}</div>` : '';
  return `<div class="tile ${tone}">
    <div class="tile-label"><span>${esc(label)}</span>${chipHtml}</div>
    <div class="tile-value">${value}</div>
    ${sub ? `<div class="tile-sub">${sub}</div>` : ''}
    ${whereHtml}
  </div>`;
}

export function notice(html, tone = 'info', { title = null } = {}) {
  return `<div class="notice ${tone}">${title ? `<strong>${esc(title)}</strong> ` : ''}${html}</div>`;
}

export const emptyState = ({ title, message = '', body = '', action = '', actionHref = null, actionLabel = '' } = {}) => {
  const text = message || body;
  const actionHtml = action || (actionHref && actionLabel ? `<a class="btn btn-primary" href="${esc(actionHref)}">${esc(actionLabel)}</a>` : '');
  return `<div class="empty-block"><strong>${esc(title)}</strong>${text ? `<p class="muted small">${text}</p>` : ''}${actionHtml ? `<div class="empty-actions">${actionHtml}</div>` : ''}</div>`;
};

export const loadingState = (message = 'Loading local data…') =>
  `<div class="loading-block" aria-busy="true" role="status">${esc(message)}</div>`;

export const kv = (pairs = []) =>
  `<dl class="kv">${pairs
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === null || v === undefined || v === '' ? '<span class="soft">not recorded</span>' : v}</dd>`)
    .join('')}</dl>`;

/* ---------------------------------------------------------------- tables -- */

/**
 * Supports both `{ columns: [{ label, num }], rows, footer }` and `{ headers: ['...'], rows }`.
 */
export function dataTable({ columns = null, headers = [], rows = [], footer = null, empty = 'Nothing to show.', className = '' } = {}) {
  if (!rows.length) return `<p class="muted small m-0">${esc(empty)}</p>`;
  const cols = columns || headers.map((h) => (typeof h === 'string' ? { label: h, num: false } : h));
  const footHtml =
    Array.isArray(footer) && footer.length
      ? `<tfoot><tr>${footer
          .map((cell, i) => {
            const col = cols[i];
            return `<td ${col?.num ? 'class="num"' : ''}>${cell ?? ''}</td>`;
          })
          .join('')}</tr></tfoot>`
      : '';
  return `<div class="table-wrap"><table class="data ${className}">
    <thead><tr>${cols.map((c) => `<th ${c.num ? 'class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
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
      .join('')}</tbody>${footHtml}
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

function computeAxisTicks(maxVal) {
  const safeMax = Number.isFinite(maxVal) && maxVal > 0 ? maxVal : 1;
  if (safeMax <= 5) {
    const ceil = Math.max(1, Math.ceil(safeMax));
    const ticks = [];
    for (let i = 0; i <= ceil; i += 1) ticks.push(i);
    return { domainMax: ceil, ticks };
  }
  const roughStep = safeMax / 5;
  const mag = 10 ** Math.floor(Math.log10(roughStep));
  const norm = roughStep / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const cleanStep = Math.max(1, Math.round(mult * mag));
  const domainMax = Math.max(cleanStep, Math.ceil(safeMax / cleanStep) * cleanStep);
  const ticks = [];
  for (let v = 0; v <= domainMax; v += cleanStep) {
    ticks.push(v);
  }
  return { domainMax, ticks };
}

/**
 * Horizontal bar chart (SVG) with collision-free labels, end-of-bar totals,
 * axis grid lines, hover tooltips, and accessible table fallback.
 */
export function barChart(arg1 = {}, arg2 = {}) {
  const isArrayArg = Array.isArray(arg1);
  const rawData = isArrayArg ? arg1 : arg1.data || [];
  const valueFormat = (isArrayArg ? arg2.valueFormat : arg1.valueFormat) || ((v) => String(Math.round(Number(v) || 0)));
  const yLabel = (isArrayArg ? arg2.yLabel || arg2.title : arg1.yLabel || arg1.title) || 'Bar chart';

  const data = rawData.map((d) => {
    const rawVal = Number(d?.value);
    const value = Number.isFinite(rawVal) ? Math.max(0, rawVal) : 0;
    const rawShare = Number(d?.share);
    const share = Number.isFinite(rawShare) ? clamp(rawShare, 0, 1) : null;
    const fullLabel = String(d?.label ?? '—');
    const displayLabel = fullLabel.length > 34 ? `${fullLabel.slice(0, 33)}…` : fullLabel;
    return {
      ...d,
      label: fullLabel,
      displayLabel,
      value,
      share,
    };
  });

  if (!data.length) return '<p class="muted small m-0">No data to chart yet.</p>';

  const w = 760;
  const padL = 192;
  const padR = 112;
  const padT = 10;
  const padB = 28;
  const rowH = 30;
  const barH = 14;
  const innerW = w - padL - padR;
  const innerH = data.length * rowH;
  const h = padT + innerH + padB;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const { domainMax, ticks } = computeAxisTicks(maxVal);

  const gridLines = ticks
    .map((tick) => {
      const x = padL + (tick / domainMax) * innerW;
      return `<line class="grid-line" x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${(padT + innerH).toFixed(1)}"></line><text class="axis-label" x="${x.toFixed(1)}" y="${(h - 7).toFixed(1)}" text-anchor="middle">${esc(valueFormat(tick))}</text>`;
    })
    .join('');

  const axisBaseline = `<line class="axis-baseline" x1="${padL}" y1="${padT}" x2="${padL}" y2="${(padT + innerH).toFixed(1)}"></line>`;

  const bars = data
    .map((d, i) => {
      const rowY = padT + i * rowH;
      const barY = rowY + (rowH - barH) / 2;
      const textY = rowY + rowH / 2 + 4;
      const rawBw = (d.value / domainMax) * innerW;
      const bw = d.value > 0 ? Math.max(4, Math.min(innerW, rawBw)) : 0;
      const formattedVal = valueFormat(d.value);
      const endText = d.endLabel || (d.share !== null ? `${formattedVal} (${fmtPct(d.share, 1)})` : formattedVal);
      const tooltip = d.tooltip || `${d.label}: ${endText}`;
      const valX = padL + bw + 8;

      return `<g class="chart-row" tabindex="0" data-chart-label="${esc(d.label)}" data-chart-detail="${esc(tooltip)}">
        <title>${esc(tooltip)}</title>
        <rect class="chart-row-hit" x="4" y="${(rowY + 1).toFixed(1)}" width="${w - 8}" height="${rowH - 2}" rx="6" ry="6"></rect>
        <text class="chart-subject-label" x="${padL - 12}" y="${textY.toFixed(1)}" text-anchor="end">${esc(d.displayLabel)}</text>
        <rect class="bar-track-bg" x="${padL}" y="${barY.toFixed(1)}" width="${innerW}" height="${barH}" rx="4" ry="4"></rect>
        <rect class="bar ${esc(d.tone || '')}" x="${padL}" y="${barY.toFixed(1)}" width="${bw.toFixed(1)}" height="${barH}" rx="4" ry="4"></rect>
        <text class="chart-value-label" x="${valX.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="start">${esc(endText)}</text>
      </g>`;
    })
    .join('');

  const tableRows = data
    .map(
      (d) =>
        `<tr><td>${esc(d.label)}</td><td class="num">${esc(valueFormat(d.value))}</td>${
          d.share !== null ? `<td class="num">${esc(fmtPct(d.share, 1))}</td>` : ''
        }</tr>`,
    )
    .join('');
  const hasShareCol = data.some((d) => d.share !== null);

  return `<div class="chart-wrap pyq-hbar-wrap">
    <svg class="chart pyq-hbar-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(yLabel)}">${gridLines}${bars}${axisBaseline}</svg>
    <details class="chart-data"><summary>Data table (${data.length} rows)</summary>
      <div class="table-wrap mt-2"><table class="data compact"><thead><tr><th>Subject</th><th class="num">Questions</th>${hasShareCol ? '<th class="num">Share</th>' : ''}</tr></thead><tbody>${tableRows}</tbody></table></div>
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

/**
 * Answer-key marker for a question.
 *
 * Only the two states that change what the app *does* are surfaced: a key that
 * is missing (the question cannot be judged and is excluded from scoring) and a
 * key that is disputed (the user must decide which answer judges it). Where a
 * key came from — the book, a coach, an official release — is deliberately not
 * shown anywhere in the interface.
 */
export function answerKeyBadge(status) {
  const labels = { missing: ['Answer key missing', 'bad'], disputed: ['Answer key disputed', 'bad'] };
  const entry = labels[status];
  return entry ? badge(entry[0], entry[1]) : '';
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
 * Render the explanation block. Explanations are the prose that came with the
 * bank and are shown exactly as supplied; when a record has none the app says so
 * instead of filling the space in, because it never writes an explanation itself.
 */
export function renderExplanation(question) {
  const explanation = question.explanation;
  if (!explanation) {
    return `<div class="explanation"><h3>Explanation</h3><p class="muted small m-0">No explanation was supplied with this question. Explanations arrive with the question bank; this app does not write them, and it will not show filler text.</p></div>`;
  }
  const rows = (explanation.option_explanations || []).filter((o) => o.text);
  return `<div class="explanation">
    <h3>Explanation</h3>
    ${explanation.correct_reasoning ? `<p${langAttr(explanation.correct_reasoning)}>${esc(explanation.correct_reasoning)}</p>` : ''}
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
        ? `<h3>Sources</h3><ul class="small">${explanation.sources
            .map(
              (s) =>
                `<li>${esc(s.title || s.citation || 'source')}${s.url ? ` — <a href="${esc(s.url)}" rel="noopener noreferrer">link</a>` : ''}${s.citation && s.title ? `<br><span class="soft">${esc(s.citation)}</span>` : ''}</li>`,
            )
            .join('')}</ul>`
        : ''
    }
  </div>`;
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
  node.innerHTML = `<div class="toast-body">${bodyHtml}</div><button class="toast-close" type="button" aria-label="Dismiss notification">✕</button>`;
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
