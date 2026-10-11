/**
 * components.js — Small, dependency-free UI building blocks & provenance kit.
 *
 * Views build HTML strings with these helpers and attach behaviour in `mount()`
 * using event delegation. That keeps rendering predictable, keeps the bundle
 * small, and avoids a framework dependency in a local-first app.
 */

import { esc, fmtPct, fmtMarks, fmtDate, fmtClock, fmtDuration, round, clamp } from '../core/util.js';
import { QUESTION_TYPES, ANSWER_KEY_STATUSES, EXPLANATION_STATUSES, CONFIDENCE_LEVELS, LANGUAGE_LABELS } from '../core/constants.js';

export { esc };

/* --------------------------------------------------------------- icons ---- */

const ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  'test-centre': '<path d="M9 3h6l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M8 13h8M8 17h5"/>',
  topic: '<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="15" r="3"/>',
  custom: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  smart: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
  mistakes: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  revision: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  syllabus: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  analytics: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  bank: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5"/><path d="M12 16.5h.01"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  focus: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};

export function icon(name) {
  const path = ICON_PATHS[name] || ICON_PATHS.help;
  return `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${path}</svg></span>`;
}

/* ----------------------------------------------------- language helpers --- */

export function hasDevanagari(text) {
  return /[\u0900-\u097F]/u.test(String(text || ''));
}

export function langAttr(text, explicitLang = null) {
  if (explicitLang === 'hi' || hasDevanagari(text)) return ' lang="hi"';
  return '';
}

/* ------------------------------------------------ provenance vocabulary --- */

const SOURCE_LABELS = {
  measured: 'measured',
  derived: 'derived',
  unavailable: 'unavailable',
  synthetic: 'synthetic',
  supplied: 'supplied key',
  verified: 'verified key',
  disputed: 'disputed',
};

/**
 * Render a consistent provenance source chip:
 * measured | derived | unavailable | synthetic | supplied | verified | disputed
 */
export function sourceChip(kind, customLabel = null) {
  const safeKind = SOURCE_LABELS[kind] ? kind : 'measured';
  const label = customLabel || SOURCE_LABELS[safeKind] || safeKind;
  return `<span class="prov-chip ${esc(safeKind)}">${esc(label)}</span>`;
}

/**
 * Render a 3-step evidence-strength indicator tied to sample size.
 * Samples < 3 are visually distinct (`insufficient`) so small-sample figures
 * are never mistaken for solid conclusions.
 */
export function evidenceMeter(sample, { minHint = 3, minStrong = 5 } = {}) {
  const n = Number.isFinite(sample) ? Math.max(0, Math.floor(sample)) : 0;
  let stateClass = 'insufficient';
  let filled = 0;
  let label = `no evidence (n=0)`;
  if (n >= minStrong) {
    stateClass = 'solid';
    filled = 3;
    label = `solid (n=${n})`;
  } else if (n >= minHint) {
    stateClass = 'developing';
    filled = 2;
    label = `developing (n=${n})`;
  } else if (n > 0) {
    stateClass = 'insufficient';
    filled = 1;
    label = `insufficient evidence (n=${n}, <${minHint})`;
  }
  const pips = [1, 2, 3]
    .map((step) => `<span class="evidence-pip ${step <= filled ? 'on' : ''}"></span>`)
    .join('');
  return `<span class="evidence-meter ${stateClass}" title="Evidence strength based on ${n} scored attempt(s)"><span class="evidence-pips" aria-hidden="true">${pips}</span><span>${esc(label)}</span></span>`;
}

export function provenanceLine(html) {
  return `<div class="prov-line">${html}</div>`;
}

/* --------------------------------------------------------------- basics --- */

export const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;

export const demoBadge = (isDemo) =>
  isDemo
    ? '<span class="demo-flag" title="Synthetic demonstration content — not a genuine previous-year question">demonstration</span>'
    : '';

export function card({ title = null, subtitle = null, actions = '', body = '', footer = null, tone = '', id = null, className = '' } = {}) {
  const head =
    title || subtitle || actions
      ? `<div class="card-head">${title ? `<h2>${esc(title)}</h2>` : ''}${subtitle ? `<span class="muted small">${esc(subtitle)}</span>` : ''}${actions ? `<div class="card-actions">${actions}</div>` : ''}</div>`
      : '';
  return `<section class="card ${tone} ${className}" ${id ? `id="${esc(id)}"` : ''}>
    ${head}
    <div class="card-body">${body}</div>
    ${footer === null ? '' : `<div class="card-foot">${footer}</div>`}
  </section>`;
}

export function tile({ label, value, sub = '', tone = '', source = null, where = '' }) {
  const chip = source ? sourceChip(source) : '';
  return `<div class="tile ${tone}">
    <div class="tile-head"><div class="tile-label">${esc(label)}</div>${chip}</div>
    <div class="tile-value">${value}</div>
    ${sub ? `<div class="tile-sub">${sub}</div>` : ''}
    ${where ? provenanceLine(where) : ''}
  </div>`;
}

export function notice(html, tone = 'info', { title = null } = {}) {
  return `<div class="notice ${tone}">${title ? `<strong>${esc(title)}</strong> ` : ''}${html}</div>`;
}

export const emptyState = ({ title, message = '', action = '' } = {}) =>
  `<div class="empty-block"><strong>${esc(title)}</strong>${message ? `<p class="muted small">${message}</p>` : ''}${action ? `<div class="empty-actions">${action}</div>` : ''}</div>`;

export const loadingState = (message = 'Loading local data…') =>
  `<div class="loading-block" role="status" aria-busy="true">
    <strong>${esc(message)}</strong>
    <div class="skeleton-stack" aria-hidden="true">
      <div class="skeleton-line medium"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>
  </div>`;

export const kv = (pairs) =>
  `<dl class="kv">${pairs
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === null || v === undefined || v === '' ? '<span class="soft">not recorded</span>' : v}</dd>`)
    .join('')}</dl>`;

/* ---------------------------------------------------------------- tables -- */

/**
 * @param {{columns: Array<{label:string,num?:boolean}>, rows: Array<Array<string>>, empty?: string, className?: string}} opts
 */
export function dataTable({ columns, rows, empty = 'Nothing to show.', className = '' }) {
  if (!rows.length) return `<p class="muted small">${esc(empty)}</p>`;
  return `<div class="table-wrap"><table class="data ${className}">
    <thead><tr>${columns.map((c) => `<th scope="col" ${c.num ? 'class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((cell, i) => `<td ${columns[i]?.num ? 'class="num"' : ''}>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

/* --------------------------------------------------------------- visuals -- */

export function barList(items, { max = null } = {}) {
  if (!items.length) return '<p class="muted small">No data yet.</p>';
  const ceiling = max || Math.max(...items.map((i) => Number(i.value) || 0), 1);
  return `<div class="bar-list">${items
    .map((item) => {
      const value = Number(item.value) || 0;
      const pctWidth = clamp((value / ceiling) * 100, 0, 100);
      return `<div class="bar-item">
        <span class="nowrap" title="${esc(item.label)}"${langAttr(item.label)}>${esc(item.label)}</span>
        <span class="bar-track"><svg class="bar-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect class="bar-fill ${esc(item.tone || '')}" x="0" y="0" width="${pctWidth.toFixed(1)}" height="10" /></svg></span>
        <span class="num tiny muted">${item.right ?? esc(String(value))}</span>
      </div>`;
    })
    .join('')}</div>`;
}

export const progressBar = (fraction, tone = '') => {
  const pctValue = clamp(fraction || 0, 0, 1) * 100;
  return `<div class="progress" role="progressbar" aria-valuenow="${Math.round(pctValue)}" aria-valuemin="0" aria-valuemax="100"><svg class="bar-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect class="bar-fill ${esc(tone)}" x="0" y="0" width="${pctValue.toFixed(1)}" height="10" /></svg></div>`;
};

/** Vertical bar chart (SVG) with accessible table equivalent. data: [{label, value, tone}] */
export function barChart({ data, height = 150, valueFormat = (v) => String(v), yLabel = null }) {
  if (!data.length) return '<p class="muted small">No data to chart yet.</p>';
  const w = 660;
  const h = height;
  const padL = 36;
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
      return `<rect class="bar ${esc(d.tone || '')}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}"><title>${esc(d.label)}: ${esc(valueFormat(v))}</title></rect>${label}`;
    })
    .join('');
  const gridLines = [0, 0.5, 1]
    .map((f) => {
      const y = padT + innerH * (1 - f);
      return `<line class="grid-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${w - 8}" y2="${y.toFixed(1)}"></line><text class="axis-label" x="4" y="${(y + 3).toFixed(1)}">${esc(valueFormat(Math.round(max * f * 100) / 100))}</text>`;
    })
    .join('');
  const altRows = data.map((d) => [esc(d.label), esc(valueFormat(Number(d.value) || 0))]);
  return `<div class="chart-figure">
    <svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(yLabel || 'Bar chart')}">${gridLines}${bars}</svg>
    <details class="chart-data"><summary>Values table (${data.length} point(s))</summary>${dataTable({ columns: [{ label: 'Label' }, { label: yLabel || 'Value', num: true }], rows: altRows, className: 'compact' })}</details>
  </div>`;
}

/** Line chart (SVG) with accessible table equivalent. */
export function lineChart({ points, height = 160, yFormat = (v) => `${Math.round(v * 100)}%`, yMax = 1, labelEvery = null, label = 'Trend chart' }) {
  if (points.length < 2) return '<p class="muted small">At least two data points are needed to show a trend.</p>';
  const w = 660;
  const h = height;
  const padL = 38;
  const padB = 24;
  const padT = 10;
  const innerW = w - padL - 8;
  const innerH = h - padB - padT;
  const step = innerW / (points.length - 1);
  const yOf = (v) => padT + innerH - (clamp(Number(v) || 0, 0, yMax) / yMax) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(padL + i * step).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(' ');
  const dots = points
    .map((p, i) => `<circle class="point" cx="${(padL + i * step).toFixed(1)}" cy="${yOf(p.value).toFixed(1)}" r="3"><title>${esc(p.label)}: ${esc(yFormat(p.value))}</title></circle>`)
    .join('');
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
  const altRows = points.map((p) => [esc(p.label), esc(yFormat(p.value))]);
  return `<div class="chart-figure">
    <svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${grid}${path ? `<path class="line" d="${path}"></path>` : ''}${dots}${labels}</svg>
    <details class="chart-data"><summary>Values table (${points.length} point(s))</summary>${dataTable({ columns: [{ label: 'Point' }, { label: 'Value', num: true }], rows: altRows, className: 'compact' })}</details>
  </div>`;
}

export function sparkline(values, { width = 120, height = 26 } = {}) {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`).join(' ');
  return `<svg class="chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path class="line" d="${path}"></path></svg>`;
}

/* ------------------------------------------------------ display helpers --- */

export const pct = (value, digits = 0) => (Number.isFinite(value) ? fmtPct(value, digits) : '<span class="soft">—</span>');

export function accuracyCell(accuracy, scoredOrNull = null, minSample = 3) {
  if (!Number.isFinite(accuracy)) return '<span class="soft">not enough evidence</span>';
  const tone = accuracy >= 0.75 ? 'ok' : accuracy >= 0.5 ? 'warn' : 'bad';
  const suffix = scoredOrNull !== null && scoredOrNull !== undefined && scoredOrNull < minSample ? ' <span class="soft tiny">(small sample)</span>' : '';
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
          `<button type="button" data-lang="${esc(lang)}" aria-pressed="${lang === activeLang}"${lang === 'hi' ? ' lang="hi"' : ''}>${esc(LANGUAGE_LABELS[lang] || lang)}</button>`,
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
    return `<div class="explanation"><h4>Explanation ${sourceChip('unavailable', 'not supplied')}</h4><p class="muted small m-0">No explanation is available for this question. Explanations are produced and reviewed by the separate preparation pipeline — this app does not generate them, and it will not show filler text.</p></div>`;
  }
  const unreviewed = status === 'generated';
  const rows = (explanation.option_explanations || []).filter((o) => o.text);
  return `<div class="explanation">
    <h4>Explanation ${explanationBadge(status)}</h4>
    ${unreviewed ? '<p class="small text-warn mt-0">This explanation has not been reviewed yet. Treat it as a draft.</p>' : ''}
    ${explanation.correct_reasoning ? `<p${langAttr(explanation.correct_reasoning)}>${esc(explanation.correct_reasoning)}</p>` : '<p class="muted small">The pipeline supplied no reasoning text.</p>'}
    ${
      rows.length
        ? `<h4>Option by option</h4><div class="table-wrap"><table class="data compact options-table"><tbody>${rows
            .map(
              (o) =>
                `<tr><td class="mono col-key">${esc(o.key || '—')}</td><td${langAttr(o.text)}>${esc(o.text)}</td><td class="col-status">${o.is_correct === true ? badge('correct', 'ok') : o.is_correct === false ? badge('not correct', 'plain') : '<span class="soft tiny">unstated</span>'}</td></tr>`,
            )
            .join('')}</tbody></table></div>`
        : ''
    }
    ${explanation.key_concepts?.length ? `<h4>Related concepts</h4><div class="chips">${explanation.key_concepts.map((c) => `<span class="chip"${langAttr(c)}>${esc(c)}</span>`).join('')}</div>` : ''}
    ${explanation.revision_takeaways?.length ? `<h4>Revision takeaways</h4><ul class="small">${explanation.revision_takeaways.map((t) => `<li${langAttr(t)}>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${
      explanation.sources?.length
        ? `<h4>Sources cited by the pipeline</h4><ul class="small">${explanation.sources
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
  const bits = [ref.file, ref.page !== null && ref.page !== undefined ? `page ${esc(String(ref.page))}` : null, ref.question_location ? esc(ref.question_location) : null, ref.note ? esc(ref.note) : null].filter(Boolean);
  return bits.length ? bits.join(' · ') : '<span class="soft">No source reference recorded.</span>';
}

/** Warning list shown wherever authenticity or completeness is in question. */
export function warningList(warnings, { title = 'Read before you start' } = {}) {
  if (!warnings?.length) return '';
  return notice(`<ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`, 'warn', { title });
}

/* ------------------------------------------------------------------ tabs -- */

export function tabs({ id, items, activeId }) {
  return `<div class="tabs" role="tablist" id="${esc(id)}">
    ${items
      .map((item) => {
        const isSelected = item.id === activeId;
        return `<button class="tab" role="tab" type="button" data-tab="${esc(item.id)}" aria-selected="${isSelected}" tabindex="${isSelected ? '0' : '-1'}" aria-controls="${esc(item.id)}-panel" id="${esc(item.id)}-tab">${esc(item.label)}</button>`;
      })
      .join('')}
  </div>
  ${items
    .map(
      (item) =>
        `<div class="tabpanel" id="${esc(item.id)}-panel" role="tabpanel" tabindex="0" aria-labelledby="${esc(item.id)}-tab" ${item.id === activeId ? '' : 'hidden'}>${item.body}</div>`,
    )
    .join('')}`;
}

export function mountTabs(root) {
  if (!root) return;
  const activateTab = (bar, targetTab, { focus = false } = {}) => {
    const tabButtons = Array.from(bar.querySelectorAll('.tab'));
    tabButtons.forEach((t) => {
      const selected = t === targetTab;
      t.setAttribute('aria-selected', String(selected));
      t.setAttribute('tabindex', selected ? '0' : '-1');
      const panelId = `${CSS.escape ? CSS.escape(t.dataset.tab) : t.dataset.tab}-panel`;
      const panel = root.querySelector(`#${panelId}`);
      if (panel) panel.hidden = !selected;
    });
    if (focus) targetTab.focus();
  };

  root.querySelectorAll('.tabs').forEach((bar) => {
    bar.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => activateTab(bar, tab, { focus: false }));
    });

    bar.addEventListener('keydown', (ev) => {
      const current = ev.target.closest('.tab');
      if (!current || !bar.contains(current)) return;
      const tabButtons = Array.from(bar.querySelectorAll('.tab'));
      const idx = tabButtons.indexOf(current);
      if (idx < 0) return;

      let nextIdx = null;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
        nextIdx = (idx + 1) % tabButtons.length;
      } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
        nextIdx = (idx - 1 + tabButtons.length) % tabButtons.length;
      } else if (ev.key === 'Home') {
        nextIdx = 0;
      } else if (ev.key === 'End') {
        nextIdx = tabButtons.length - 1;
      }

      if (nextIdx !== null) {
        ev.preventDefault();
        const nextTab = tabButtons[nextIdx];
        activateTab(bar, nextTab, { focus: true });
        nextTab.click();
      }
    });
  });
}

/* ----------------------------------------------------------- modal/toast -- */

const toastTimers = new WeakMap();
const MAX_TOAST_STACK = 4;

export function toast(message, tone = 'info', timeout = 5200) {
  const stack = document.getElementById('toastStack');
  if (!stack) return null;

  while (stack.children.length >= MAX_TOAST_STACK) {
    const oldest = stack.firstElementChild;
    if (!oldest) break;
    clearTimeout(toastTimers.get(oldest));
    toastTimers.delete(oldest);
    oldest.remove();
  }

  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.setAttribute('role', tone === 'bad' ? 'alert' : 'status');
  const bodyHtml = typeof message === 'string' ? esc(message) : message;
  node.innerHTML = `<div class="toast-body">${bodyHtml}</div><button class="toast-close" type="button" aria-label="Dismiss notification">✕</button>`;

  const removeToast = () => {
    clearTimeout(toastTimers.get(node));
    toastTimers.delete(node);
    node.remove();
  };

  const startTimer = () => {
    clearTimeout(toastTimers.get(node));
    if (timeout > 0) {
      const timer = setTimeout(removeToast, timeout);
      toastTimers.set(node, timer);
    }
  };

  node.querySelector('.toast-close')?.addEventListener('click', removeToast);
  node.addEventListener('mouseenter', () => clearTimeout(toastTimers.get(node)));
  node.addEventListener('mouseleave', startTimer);
  node.addEventListener('focusin', () => clearTimeout(toastTimers.get(node)));
  node.addEventListener('focusout', startTimer);

  stack.appendChild(node);
  startTimer();
  return node;
}

let modalCleanup = null;

function setBackgroundInert(isInert) {
  for (const id of ['appHeader', 'appBody']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.inert = isInert;
    if (isInert) {
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    } else {
      el.removeAttribute('inert');
      el.removeAttribute('aria-hidden');
    }
  }
  document.body?.classList.toggle('modal-open', isInert);
}

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.hidden && !el.closest('[hidden]'));
}

/**
 * Open a modal dialog. `actions` is a list of {label, tone, value} buttons whose
 * resolved value is returned by the promise.
 * Returns a Promise that resolves with the button value, or null when dismissed.
 */
export function openModal({ title, body, actions = [], wide = false, onMount = null, dismissible = true }) {
  const root = document.getElementById('modalRoot');
  if (!root) return Promise.resolve(null);
  if (modalCleanup) {
    document.removeEventListener('keydown', modalCleanup, true);
    modalCleanup = null;
  }
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  return new Promise((resolve) => {
    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      root.hidden = true;
      root.innerHTML = '';
      setBackgroundInert(false);
      if (modalCleanup) {
        document.removeEventListener('keydown', modalCleanup, true);
        modalCleanup = null;
      }
      if (previousFocus && document.contains(previousFocus) && typeof previousFocus.focus === 'function') {
        try {
          previousFocus.focus();
        } catch {
          /* ignore focus restore errors */
        }
      }
      resolve(value);
    };

    setBackgroundInert(true);
    root.hidden = false;
    root.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle" aria-label="${esc(title)}" tabindex="-1">
      <div class="modal-head"><h2 id="modalTitle">${esc(title)}</h2><button class="btn btn-quiet btn-icon" type="button" data-modal-close aria-label="Close">✕</button></div>
      <div class="modal-body" id="modalBody">${body}</div>
      ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.tone || ''}" type="button" data-modal-action="${i}" data-value="${esc(a.value ?? a.label)}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;

    const modal = root.firstElementChild;
    modal.querySelectorAll('[data-modal-action]').forEach((btn) => {
      btn.addEventListener('click', () => close(btn.dataset.value));
    });
    modal.querySelectorAll('[data-modal-close]').forEach((btn) => btn.addEventListener('click', () => close(null)));
    root.onclick = (ev) => {
      if (ev.target === root && dismissible) close(null);
    };

    modalCleanup = (ev) => {
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
    document.addEventListener('keydown', modalCleanup, true);

    if (onMount) {
      try {
        onMount(modal, close);
      } catch (err) {
        console.error('Modal mount failed', err);
        toast(`The dialog could not be prepared: ${err.message}`, 'bad');
      }
    }

    if (!modal.contains(document.activeElement)) {
      const focusables = getFocusableElements(modal);
      const preferred =
        modal.querySelector('input:not([type="hidden"]), select, textarea') ||
        modal.querySelector('.modal-foot .btn-primary') ||
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
    body: `<label class="field"><span class="label-text">${esc(label)}</span>${multiline ? `<textarea id="${fieldId}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input type="text" id="${fieldId}" value="${esc(value)}" placeholder="${esc(placeholder)}" />`}</label>`,
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

export { fmtPct, fmtMarks, fmtDate, fmtClock, fmtDuration, round };
