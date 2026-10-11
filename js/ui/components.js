/**
 * components.js — Small, dependency-free UI building blocks.
 *
 * Views build HTML strings with these helpers and attach behaviour in `mount()`
 * using event delegation. That keeps rendering predictable, keeps the bundle
 * small, and avoids a framework dependency in a local-first app.
 */

import { esc, fmtPct, fmtMarks, fmtDate, fmtClock, fmtDuration, round, clamp } from '../core/util.js';
import { QUESTION_TYPES, ANSWER_KEY_STATUSES, EXPLANATION_STATUSES, CONFIDENCE_LEVELS, LANGUAGE_LABELS } from '../core/constants.js';

export { esc };

/* --------------------------------------------------------------- basics --- */

export const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;

export const demoBadge = (isDemo) => (isDemo ? '<span class="demo-flag" title="Synthetic demonstration content — not a genuine previous-year question">demonstration</span>' : '');

export function card({ title = null, subtitle = null, actions = '', body = '', footer = null, tone = '', id = null, className = '' } = {}) {
  const head = title || subtitle || actions
    ? `<div class="card-head">${title ? `<h2>${esc(title)}</h2>` : ''}${subtitle ? `<span class="muted small">${esc(subtitle)}</span>` : ''}${actions ? `<div class="card-actions">${actions}</div>` : ''}</div>`
    : '';
  return `<section class="card ${tone} ${className}" ${id ? `id="${esc(id)}"` : ''}>
    ${head}
    <div class="card-body">${body}</div>
    ${footer === null ? '' : `<div class="card-foot">${footer}</div>`}
  </section>`;
}

export function tile({ label, value, sub = '', tone = '' }) {
  return `<div class="tile ${tone}"><div class="tile-label">${esc(label)}</div><div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ''}</div>`;
}

export function notice(html, tone = 'info', { title = null } = {}) {
  return `<div class="notice ${tone}">${title ? `<strong>${esc(title)}</strong> ` : ''}${html}</div>`;
}

export const emptyState = ({ title, message = '', action = '' } = {}) =>
  `<div class="empty-block"><strong>${esc(title)}</strong>${message ? `<p class="muted small" style="margin:6px 0 0">${message}</p>` : ''}${action ? `<div style="margin-top:10px">${action}</div>` : ''}</div>`;

export const loadingState = (message = 'Loading local data…') => `<div class="loading-block">${esc(message)}</div>`;

export const kv = (pairs) =>
  `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === null || v === undefined || v === '' ? '<span class="soft">not recorded</span>' : v}</dd>`).join('')}</dl>`;

/* ---------------------------------------------------------------- tables -- */

/**
 * @param {{columns: Array<{label:string,num?:boolean}>, rows: Array<Array<string>>, empty?: string, className?: string}} opts
 */
export function dataTable({ columns, rows, empty = 'Nothing to show.', className = '' }) {
  if (!rows.length) return `<p class="muted small">${esc(empty)}</p>`;
  return `<div class="table-wrap"><table class="data ${className}">
    <thead><tr>${columns.map((c) => `<th ${c.num ? 'class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
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
        <span class="nowrap" title="${esc(item.label)}">${esc(item.label)}</span>
        <span class="bar-track"><span class="bar-fill ${item.tone || ''}" style="width:${pctWidth.toFixed(1)}%"></span></span>
        <span class="num tiny muted">${item.right ?? esc(String(value))}</span>
      </div>`;
    })
    .join('')}</div>`;
}

export const progressBar = (fraction, tone = '') =>
  `<div class="progress"><span class="${tone}" style="width:${(clamp(fraction || 0, 0, 1) * 100).toFixed(1)}%"></span></div>`;

/** Vertical bar chart (SVG). data: [{label, value, tone}] */
export function barChart({ data, height = 150, valueFormat = (v) => String(v), yLabel = null }) {
  if (!data.length) return '<p class="muted small">No data to chart yet.</p>';
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
      const label = i % labelEvery === 0 ? `<text class="axis-label" x="${x + bw / 2}" y="${h - 8}" text-anchor="middle">${esc(d.label)}</text>` : '';
      return `<rect class="bar ${d.tone || ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}"><title>${esc(d.label)}: ${esc(valueFormat(v))}</title></rect>${label}`;
    })
    .join('');
  const gridLines = [0, 0.5, 1]
    .map((f) => {
      const y = padT + innerH * (1 - f);
      return `<line class="grid-line" x1="${padL}" y1="${y.toFixed(1)}" x2="${w - 8}" y2="${y.toFixed(1)}"></line><text class="axis-label" x="4" y="${(y + 3).toFixed(1)}">${esc(valueFormat(Math.round(max * f * 100) / 100))}</text>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(yLabel || 'Bar chart')}">${gridLines}${bars}</svg>`;
}

/** Line chart (SVG) with optional second series drawn as bars. */
export function lineChart({ points, height = 160, yFormat = (v) => `${Math.round(v * 100)}%`, yMax = 1, labelEvery = null }) {
  if (points.length < 2) return '<p class="muted small">At least two data points are needed to show a trend.</p>';
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
    .map((p, i) => `<circle class="point" cx="${(padL + i * step).toFixed(1)}" cy="${yOf(p.value).toFixed(1)}" r="2.6"><title>${esc(p.label)}: ${esc(yFormat(p.value))}</title></circle>`)
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
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Trend chart">${grid}${path ? `<path class="line" d="${path}"></path>` : ''}${dots}${labels}</svg>`;
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
  return `<span class="seg" data-lang-switch>
    ${available.map((lang) => `<button type="button" data-lang="${esc(lang)}" aria-pressed="${lang === activeLang}">${esc(LANGUAGE_LABELS[lang] || lang)}</button>`).join('')}
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
    return `<div class="explanation"><h4>Explanation</h4><p class="muted small" style="margin:0">No explanation is available for this question. Explanations are produced and reviewed by the separate preparation pipeline — this app does not generate them, and it will not show filler text.</p></div>`;
  }
  const unreviewed = status === 'generated';
  const rows = (explanation.option_explanations || []).filter((o) => o.text);
  return `<div class="explanation">
    <h4>Explanation ${explanationBadge(status)}</h4>
    ${unreviewed ? '<p class="small" style="color:var(--warn);margin-top:0">This explanation has not been reviewed yet. Treat it as a draft.</p>' : ''}
    ${explanation.correct_reasoning ? `<p>${esc(explanation.correct_reasoning)}</p>` : '<p class="muted small">The pipeline supplied no reasoning text.</p>'}
    ${
      rows.length
        ? `<h4>Option by option</h4><div class="table-wrap"><table class="data compact options-table"><tbody>${rows
            .map(
              (o) =>
                `<tr><td style="width:36px" class="mono">${esc(o.key || '—')}</td><td>${esc(o.text)}</td><td style="width:80px">${o.is_correct === true ? badge('correct', 'ok') : o.is_correct === false ? badge('not correct', 'plain') : '<span class="soft tiny">unstated</span>'}</td></tr>`,
            )
            .join('')}</tbody></table></div>`
        : ''
    }
    ${explanation.key_concepts?.length ? `<h4>Related concepts</h4><div class="chips">${explanation.key_concepts.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
    ${explanation.revision_takeaways?.length ? `<h4>Revision takeaways</h4><ul class="small">${explanation.revision_takeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${
      explanation.sources?.length
        ? `<h4>Sources cited by the pipeline</h4><ul class="small">${explanation.sources
            .map((s) => `<li>${esc(s.title || s.citation || 'source')}${s.url ? ` — <a href="${esc(s.url)}" rel="noopener noreferrer">link</a>` : ''}${s.citation && s.title ? `<br><span class="soft">${esc(s.citation)}</span>` : ''}</li>`)
            .join('')}</ul>`
        : '<p class="tiny soft" style="margin-bottom:0">No sources were supplied with this explanation.</p>'
    }
    ${compact ? '' : `<p class="tiny soft" style="margin:8px 0 0">Status: ${esc(status)}${explanation.reviewed_by ? ` · reviewed by ${esc(explanation.reviewed_by)}` : ''}${explanation.generated_by ? ` · generated by ${esc(explanation.generated_by)}` : ''}</p>`}
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
    ${items.map((item) => `<button class="tab" role="tab" type="button" data-tab="${esc(item.id)}" aria-selected="${item.id === activeId}" aria-controls="${esc(item.id)}-panel" id="${esc(item.id)}-tab">${esc(item.label)}</button>`).join('')}
  </div>
  ${items.map((item) => `<div class="tabpanel" id="${esc(item.id)}-panel" role="tabpanel" aria-labelledby="${esc(item.id)}-tab" ${item.id === activeId ? '' : 'hidden'}>${item.body}</div>`).join('')}`;
}

export function mountTabs(root) {
  root.querySelectorAll('.tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const bar = tab.closest('.tabs');
      bar.querySelectorAll('.tab').forEach((t) => {
        const selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        const panel = root.querySelector(`#${CSS.escape ? CSS.escape(t.dataset.tab) : t.dataset.tab}-panel`);
        if (panel) panel.hidden = !selected;
      });
    });
  });
}

/* ----------------------------------------------------------- modal/toast -- */

let toastTimers = new WeakMap();

export function toast(message, tone = 'info', timeout = 5200) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.setAttribute('role', tone === 'bad' ? 'alert' : 'status');
  node.innerHTML = typeof message === 'string' ? esc(message) : message;
  stack.appendChild(node);
  const timer = setTimeout(() => {
    node.remove();
    toastTimers.delete(node);
  }, timeout);
  toastTimers.set(node, timer);
  return node;
}

let modalCleanup = null;

/**
 * Open a modal dialog. `actions` is a list of {label, tone, value} buttons whose
 * resolved value is returned by the promise.
 * Returns a Promise that resolves with the button value, or null when dismissed.
 */
export function openModal({ title, body, actions = [], wide = false, onMount = null, dismissible = true }) {
  const root = document.getElementById('modalRoot');
  if (!root) return Promise.resolve(null);
  return new Promise((resolve) => {
    const close = (value) => {
      root.hidden = true;
      root.innerHTML = '';
      if (modalCleanup) {
        document.removeEventListener('keydown', modalCleanup, true);
        modalCleanup = null;
      }
      resolve(value);
    };
    root.hidden = false;
    root.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="btn btn-quiet btn-icon" type="button" data-modal-close aria-label="Close">✕</button></div>
      <div class="modal-body" id="modalBody">${body}</div>
      ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.tone || ''}" type="button" data-modal-action="${i}" data-value="${esc(a.value ?? a.label)}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
    const modal = root.firstElementChild;
    modal.querySelectorAll('[data-modal-action]').forEach((btn) => {
      btn.addEventListener('click', () => close(btn.dataset.value));
    });
    modal.querySelectorAll('[data-modal-close]').forEach((btn) => btn.addEventListener('click', () => close(null)));
    modal.addEventListener('click', (ev) => {
      if (ev.target === root && dismissible) close(null);
    });
    modalCleanup = (ev) => {
      if (ev.key === 'Escape' && dismissible) close(null);
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
  return `<div class="stack" style="margin-bottom:6px">${options
    .map(
      (opt) => `<label class="check"><input type="radio" name="${esc(name)}" value="${esc(opt.value)}" ${String(opt.value) === String(selected) ? 'checked' : ''} />
      <span><strong>${esc(opt.label)}</strong>${opt.hint ? `<span class="hint" style="display:block">${esc(opt.hint)}</span>` : ''}</span></label>`,
    )
    .join('')}</div>`;
}

export const stat = (label, value, sub = '') => tile({ label, value, sub });

export { fmtPct, fmtMarks, fmtDate, fmtClock, fmtDuration, round };
