/**
 * syllabus.js (view) — the Syllabus section.
 *
 * The commission's revised 2026 syllabus, as the notification wrote it, with
 * the reader's own progress marks beside it. Papers are grouped as the
 * notification groups them; the text is rendered with no counts, marks, scores
 * or predictions attached, and the study guidance this app adds stays labelled
 * `derived`.
 *
 * Two rules this screen is careful about:
 *
 *  * **The official wording is the commission's and nothing else.** The
 *    "Official wording" panel and the "Official syllabus" list show the Hindi
 *    the notification printed — with `lang="hi"`, so it is announced as Hindi —
 *    and the five lines that were published in English only say so. Nothing
 *    this app wrote ever appears in those blocks.
 *  * **Everything else follows the interface language.** Tree rows, the detail
 *    title, breadcrumbs, the paper rail and search results all take their label
 *    from one helper (`nodeLabel()` in `services/syllabus.js`): the commission's
 *    own English where it published one, then this app's hand-written English
 *    rendering, then the official Hindi. A rendering is this app's wording, so
 *    the detail panel says so in one short ⓘ note rather than letting it pass
 *    as official text.
 *
 * Progress is read one way everywhere (`officialStatusIndex()`): a topic
 * carries its own status or that of its nearest marked heading, and a heading
 * shows the roll-up of its topics. Every topic has a one-click status mark in
 * the tree; a heading's panel marks all of its topics at once. The syllabus
 * stays fully readable without touching a control, and every figure on it counts
 * official topics only.
 *
 * *My plan* — the second tree of items the reader typed, the target dates, the
 * deadlines and the tab that held them — was removed from this screen. The
 * stores behind it are untouched and still travel in every backup; the
 * interface simply no longer reads them, so they cannot change a count here.
 */

import { esc, toast, confirmDialog, notice, emptyState, icon, langAttr, infoToggle, screenHead } from '../components.js';
import {
  loadSyllabus,
  loadProgress,
  resetProgress,
  searchSyllabus,
  pickText,
  nodeLabel,
  officialWording,
  pyqLinksFor,
  relatedGuidance,
  sourceRefs,
  ancestorsOf,
  EXAM_LABELS,
} from '../../services/syllabus.js';
import { STATUSES, STATUS_ORDER, buildProgressIndex, normaliseStatus, setStatus, officialLabel } from '../../services/syllabus-hub.js';

/* ------------------------------------------------------------- view state -- */

/** Which topics the tree shows. A filter narrows the tree; it never changes a status. */
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'not_started', label: 'Not started', mark: 'not_started' },
  { id: 'in_progress', label: 'In progress', mark: 'in_progress' },
  { id: 'done', label: 'Done', mark: 'completed' },
];

const viewState = {
  examId: 'prelims',
  paperId: null,
  selectedId: null,
  expanded: new Set(),
  collapsed: new Set(),
  search: '',
  filter: 'all',
  showAbout: false,
  appliedRoute: null,
  /**
   * Where the reader was when they opened or closed an item: a selector for
   * the control they used and its distance from the top of the window.
   * Opening an item is a route change, which re-renders the screen; this is
   * how the screen puts that control back where it was instead of jumping to
   * the top of the page.
   */
  pendingPlace: null,
};

/** Set while a status change is being stored, so a double click cannot skip a step. */
let statusBusy = false;

const STATUS_TITLE = STATUSES;

/** One click on a topic's mark moves it to the next status, and round again. */
const NEXT_STATUS = { not_started: 'in_progress', in_progress: 'completed', completed: 'revised', revised: 'not_started' };

const KIND_LABEL = {
  paper: 'Paper',
  part: 'Part',
  section: 'Section',
  unit: 'Unit',
  group: 'Group',
  topic: 'Topic',
};

const SEP = '<span class="syl-sep" aria-hidden="true">›</span>';

/* ---------------------------------------------------------------- helpers -- */

/**
 * The label of a node in the interface language: the commission's own English,
 * then this app's rendering, then the official Hindi, then a structural name
 * when the source leaves a unit untitled (several Mains units are bare
 * "इकाई-N"). A structural name is never syllabus text: it only says which
 * numbered unit the row is.
 */
const label = officialLabel;

/** True when the row's text is a structural name rather than official wording. */
const isStructural = (node) => Boolean(node) && !pickText(node.titles);

/** A node's name in a breadcrumb: a stage by its short name, anything else by its label. */
const crumbLabel = (node) => (node?.kind === 'exam' ? EXAM_LABELS[node.examId] || label(node) : label(node));

/** Escape a value for use inside a double-quoted attribute selector. */
const attr = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** A name short enough for a button's accessible name: some topics run to a paragraph. */
function shortLabel(text, max = 70) {
  const value = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

const percent = (summary) => Math.round((summary?.completion || 0) * 100);

/** The status every line in a summary shares, or null when they differ. */
function uniformStatus(summary) {
  if (!summary?.total) return null;
  return STATUS_ORDER.find((status) => summary.byStatus[status] === summary.total) || null;
}

/* --------------------------------------------------------------- visuals --- */

/**
 * The status mark: an empty ring, a half-filled ring, a tick, and a tick inside
 * a second ring. The shape carries the meaning as well as the colour, so it
 * reads in greyscale and for colour-blind readers. A mark that shows a real
 * status also carries `syl-dot`, the hook for "this item has been marked".
 */
function mark(status, { dot = true } = {}) {
  const value = normaliseStatus(status);
  return `<span class="syl-mark ${value}${dot && value !== 'not_started' ? ' syl-dot' : ''}" aria-hidden="true"></span>`;
}

/** A bar split by status: revised, then completed, then in progress, over the track. */
function statusBar(summary, { size = '', decorative = false, title = null } = {}) {
  const total = summary?.total || 0;
  const segments = [];
  let x = 0;
  for (const status of ['revised', 'completed', 'in_progress']) {
    const count = summary?.byStatus?.[status] || 0;
    if (!count || !total) continue;
    const width = (count / total) * 100;
    segments.push(`<rect class="syl-seg ${status}" x="${x.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="10"></rect>`);
    x += width;
  }
  const said = title || `${percent(summary)}% done`;
  const a11y = decorative ? 'aria-hidden="true" focusable="false"' : `role="img" aria-label="${esc(said)}"`;
  return `<svg class="syl-bar${size ? ` ${size}` : ''}" viewBox="0 0 100 10" preserveAspectRatio="none" ${a11y}><rect class="syl-seg track" x="0" y="0" width="100" height="10"></rect>${segments.join('')}</svg>`;
}

/** A ring with the share done, and the share in progress after it. */
function ring(summary) {
  const done = (summary?.completion || 0) * 100;
  const started = summary?.total ? (summary.inProgress / summary.total) * 100 : 0;
  const arc = (length, cls) =>
    length > 0
      ? `<circle class="syl-ring-seg ${cls}" cx="18" cy="18" r="15.9155" stroke-dasharray="${length.toFixed(2)} ${(100 - length).toFixed(2)}" transform="rotate(-90 18 18)"></circle>`
      : '';
  return `<svg class="syl-ring" viewBox="0 0 36 36" role="img" aria-label="${percent(summary)}% done">
    <circle class="syl-ring-track" cx="18" cy="18" r="15.9155"></circle>
    ${arc(done + started, 'in_progress')}${arc(done, 'done')}
    <text class="syl-ring-text" x="18" y="18" text-anchor="middle" dominant-baseline="central">${percent(summary)}%</text>
  </svg>`;
}

/** The key to the marks, with a count beside each status. */
function legend(summary) {
  return `<ul class="syl-legend">${STATUS_ORDER.map(
    (status) =>
      `<li>${mark(status, { dot: false })}<span>${STATUS_TITLE[status]}</span><strong>${summary.byStatus[status] || 0}</strong></li>`,
  ).join('')}</ul>`;
}

/** A heading's progress at a glance: its size until something is marked, then "done/total" and a bar. */
function countChip(summary) {
  if (!summary?.total) return '';
  if (!summary.touched) return `<span class="syl-count soft">${plural(summary.total, 'topic')}</span>`;
  const said = `${summary.done} of ${plural(summary.total, 'topic')} done${summary.inProgress ? `, ${summary.inProgress} in progress` : ''}`;
  return `<span class="syl-count" title="${esc(said)}">${statusBar(summary, { size: 'mini', decorative: true })}<span class="syl-count-num" aria-hidden="true">${summary.done}/${summary.total}</span><span class="sr-only">${esc(said)}</span></span>`;
}

/** One sentence for a set of lines: "4 of 9 topics done · 2 in progress". */
function summaryWords(summary, unit = 'topic') {
  if (!summary?.total) return '';
  return `${summary.done} of ${plural(summary.total, unit)} done${summary.inProgress ? ` · ${summary.inProgress} in progress` : ''}`;
}

/* -------------------------------------------------------------- controls --- */

/** The one-click status mark beside a topic. */
function tick(target, status, name) {
  const value = normaliseStatus(status);
  const next = NEXT_STATUS[value];
  const said = `${shortLabel(name)}: ${STATUS_TITLE[value]}. Mark as ${STATUS_TITLE[next].toLowerCase()}`;
  return `<button type="button" class="syl-tick" data-cycle="${esc(target)}" data-current="${value}" aria-label="${esc(said)}" title="${esc(`${STATUS_TITLE[value]} · click to mark ${STATUS_TITLE[next].toLowerCase()}`)}">${mark(value)}</button>`;
}

function caretButton(toggleId, open, name) {
  return `<button type="button" class="syl-caret${open ? ' open' : ''}" data-toggle="${esc(toggleId)}" aria-expanded="${open}" aria-label="${esc(`${open ? 'Collapse' : 'Expand'} ${shortLabel(name)}`)}"></button>`;
}

/**
 * The status control in a detail panel. With `bulk`, it marks every topic under
 * a heading at once rather than the heading alone.
 */
function statusControl(target, current, { bulk = false, name = '' } = {}) {
  const active = current ? normaliseStatus(current) : null;
  return `<div class="syl-status" role="group" aria-label="${esc(bulk ? `Mark every topic in ${shortLabel(name, 50)}` : 'Progress for this item')}">
    ${STATUS_ORDER.map(
      (status) => `<button type="button" class="syl-status-btn ${status}${active === status ? ' on' : ''}" data-set-status="${esc(target)}" data-status="${status}"${bulk ? ' data-bulk="1"' : ''} aria-pressed="${active === status}">
        ${mark(status, { dot: false })}<span class="syl-status-text">${STATUS_TITLE[status]}</span>
      </button>`,
    ).join('')}
  </div>`;
}

/* ----------------------------------------------------------- workspace ---- */

/** Everything one render needs, read once. Official syllabus and progress only. */
async function loadWorkspace() {
  const model = await loadSyllabus();
  if (!model.ok) return { model };
  const progressRows = await loadProgress();
  return { model, progressRows, index: buildProgressIndex(model, progressRows) };
}

/* ------------------------------------------------------- official wording -- */

/**
 * The commission's own words for a node, and nothing else.
 *
 * The block used to lead with the interface language and then repeat the other
 * rendition under an inline "हिन्दी" tag. That tag sat *inside* the paragraph, so
 * a screen reader announced "हिन्दीवन…" as one word, and a bilingual topic read
 * its English twice: once as the panel title and once here. The official Hindi
 * is the notification's wording, so it is what this block shows — in Hindi,
 * marked `lang="hi"` — except for the five lines the commission published in
 * English only, which say so.
 */
function officialBlock(node) {
  const official = officialWording(node);
  if (!official) return '';
  return `<p class="syl-said"${langAttr(official.text)}>${esc(official.text)}</p>${
    official.englishOnly ? '<p class="syl-tag-note">Published in English only.</p>' : ''
  }`;
}

/**
 * The short note that says when a title is this app's English rather than the
 * commission's. Only a rendering needs it: official English is official, and
 * official Hindi needs no apology.
 */
function renderingNote(node) {
  if (nodeLabel(node).source !== 'rendering') return '';
  return infoToggle(
    'About this English wording',
    '<p class="small m-0">The commission published this line in Hindi only. The English above is a rendering written for this app so the English interface can be read end to end; it is not official syllabus text and it is never written back into the syllabus data. The commission’s own Hindi is under “Official wording” below.</p>',
  );
}

const guideFor = (model, headingId) => model.guide.get(headingId) || null;

function studyBreakdown(model, headingId) {
  const entry = guideFor(model, headingId);
  if (!entry || (!entry.focus && !entry.units.length)) return '';
  return `
    <section class="syl-block syl-derived">
      <div class="syl-block-head">
        <h4>Study breakdown</h4>
        <span class="syl-tag" title="Guidance added by this app, not part of the commission's syllabus">derived</span>
      </div>
      <p class="syl-tag-note">Built from the official lines above. It groups or subdivides them; it adds no requirement.</p>
      ${entry.focus ? `<p class="syl-focus">${esc(entry.focus)}</p>` : ''}
      ${
        entry.units.length
          ? `<ul class="syl-units">${entry.units
              .map(
                (unit) =>
                  `<li class="syl-unit"><span class="syl-unit-title">${esc(unit.title)}</span>${
                    unit.note ? `<span class="syl-unit-note">${esc(unit.note)}</span>` : ''
                  }</li>`,
              )
              .join('')}</ul>`
          : ''
      }
    </section>`;
}

/**
 * Read-only links into the existing practice and analysis screens, from the
 * curated mapping only. No counts appear here, so an incomplete mapping can
 * never read as "no previous-year questions exist".
 */
function pyqBlock(model, nodeId) {
  const links = pyqLinksFor(model, nodeId);
  if (!links.length) return '';
  return `
    <section class="syl-block syl-links">
      <h4>Previous-year practice</h4>
      <div class="syl-chips">
        ${links
          .map(
            (link) =>
              `<a class="syl-chip" href="${esc(link.practiceHref)}"${langAttr(link.label)}>${esc(link.label)}</a>`,
          )
          .join('')}
      </div>
      <p class="syl-tag-note">Opens questions already classified in your bank. Nothing here changes the bank.</p>
    </section>`;
}

function relatedBlock(model, node) {
  const { connections, revisionGroups } = relatedGuidance(model, node);
  if (!connections.length && !revisionGroups.length) return '';
  return `
    <section class="syl-block syl-derived">
      <div class="syl-block-head"><h4>Related</h4><span class="syl-tag" title="Guidance added by this app, not part of the commission's syllabus">derived</span></div>
      <ul class="syl-related">
        ${connections
          .map((connection) => {
            const other = model.nodes.get(connection.otherId);
            return `<li><button type="button" class="syl-other" data-open="${esc(connection.otherId)}">${esc(label(other))}</button><span class="syl-unit-note">${esc(connection.note)}</span></li>`;
          })
          .join('')}
        ${revisionGroups
          .map(
            (group) =>
              `<li><span class="syl-unit-title">${esc(group.title)}</span><span class="syl-unit-note">${esc(group.note)}</span></li>`,
          )
          .join('')}
      </ul>
    </section>`;
}

/** The progress block on an official node: a topic's status, or a heading's roll-up and "mark all". */
function officialTrackBlock(node, lines) {
  if (!node.childIds.length) {
    const inherited = lines.own === 'not_started' && lines.status !== 'not_started';
    return `<section class="syl-block syl-track">
      <h4>Your progress</h4>
      ${statusControl(node.id, lines.status)}
      ${inherited ? '<p class="syl-tag-note">Marked along with its heading. Choosing a status here sets this topic on its own.</p>' : ''}
    </section>`;
  }
  return `<section class="syl-block syl-track">
    <h4>Your progress</h4>
    <div class="syl-track-summary">${statusBar(lines)}<span>${esc(lines.touched ? summaryWords(lines) : `${plural(lines.total, 'topic')}, none marked yet`)}</span></div>
    <p class="syl-track-hint">Mark all ${esc(plural(lines.total, 'topic'))} at once:</p>
    ${statusControl(node.id, uniformStatus(lines), { bulk: true, name: label(node) })}
  </section>`;
}

function detailPanel(ws, node) {
  const { model, index } = ws;
  const crumbs = ancestorsOf(model.nodes, node)
    .map((ancestor) => crumbLabel(ancestor))
    .filter(Boolean);
  const lines = index.official.get(node.id);
  const isLine = !node.childIds.length;
  const structural = isStructural(node);
  const pages = sourceRefs(model, node);

  const head = `
    <button type="button" class="syl-close" data-close-detail aria-label="Close">${icon('close', { size: 14 })}</button>
    <p class="syl-crumbs">${crumbs.map((crumb) => esc(crumb)).join(SEP)}</p>
    <h3 class="syl-detail-title"${langAttr(structural ? '' : label(node))}>${esc(label(node))}</h3>
    <div class="syl-detail-meta">
      <span class="syl-kind">${esc(KIND_LABEL[node.kind] || 'Item')}</span>
      ${
        isLine
          ? `<span class="syl-state ${lines.status}">${mark(lines.status, { dot: false })}${STATUS_TITLE[lines.status]}</span>`
          : `<span class="syl-state">${esc(lines.touched ? summaryWords(lines) : plural(lines.total, 'topic'))}</span>`
      }
    </div>
    ${renderingNote(node)}
    ${
      structural
        ? '<p class="syl-tag-note">The notification lists this unit without a title of its own; its lines are below.</p>'
        : ''
    }`;

  if (node.kind === 'topic') {
    const heading = model.nodes.get(node.parentId);
    const units = heading ? (guideFor(model, heading.id)?.units || []).filter((unit) => unit.covers.includes(node.id)) : [];
    return `<div class="syl-detail" role="region" aria-label="${esc(`Details: ${shortLabel(label(node), 60)}`)}">
      ${head}
      ${officialTrackBlock(node, lines)}
      <section class="syl-block"><h4>Official wording</h4>${officialBlock(node)}</section>
      ${
        units.length
          ? `<section class="syl-block syl-derived">
              <div class="syl-block-head"><h4>In the study breakdown</h4><span class="syl-tag" title="Guidance added by this app">derived</span></div>
              <ul class="syl-units">${units
                .map(
                  (unit) =>
                    `<li class="syl-unit current"><span class="syl-unit-title">${esc(unit.title)}</span>${
                      unit.note ? `<span class="syl-unit-note">${esc(unit.note)}</span>` : ''
                    }</li>`,
                )
                .join('')}</ul>
            </section>`
          : ''
      }
      ${heading ? pyqBlock(model, heading.id) : ''}
    </div>`;
  }

  const children = node.childIds.map((id) => model.nodes.get(id)).filter(Boolean);
  const grouped = children.filter((child) => child.kind === 'topic');
  const nested = children.filter((child) => child.kind !== 'topic');

  return `<div class="syl-detail" role="region" aria-label="${esc(`Details: ${shortLabel(label(node), 60)}`)}">
    ${head}
    ${node.scope ? `<p class="syl-scope"${langAttr(node.scope, 'hi')}>${esc(node.scope)}</p>` : ''}
    ${officialTrackBlock(node, lines)}
    ${
      grouped.length || nested.length
        ? `<section class="syl-block">
            <h4>Official syllabus</h4>
            <ol class="syl-official">
              ${grouped.map((child) => `<li>${officialBlock(child)}</li>`).join('')}
              ${nested
                .map((child) => {
                  const topics = child.childIds.map((id) => model.nodes.get(id)).filter((kid) => kid && kid.kind === 'topic');
                  if (!topics.length) return `<li><span class="syl-official-head">${esc(label(child))}</span></li>`;
                  return `<li><span class="syl-official-head">${esc(label(child))}</span>${topics.map((topic) => officialBlock(topic)).join('')}</li>`;
                })
                .join('')}
            </ol>
          </section>`
        : ''
    }
    ${studyBreakdown(model, node.id)}
    ${pyqBlock(model, node.id)}
    ${relatedBlock(model, node)}
    ${
      pages.length
        ? `<p class="syl-source">Official text from page${pages.length > 1 ? 's' : ''} ${pages.join(', ')} of the source notification.</p>`
        : ''
    }
  </div>`;
}

/* ----------------------------------------------------------------- tree ---- */

function matchesFilter(summary, filter) {
  if (!summary) return true;
  if (filter === 'not_started') return summary.byStatus.not_started > 0;
  if (filter === 'in_progress') return summary.inProgress > 0;
  if (filter === 'done') return summary.done > 0;
  return true;
}

function isOpen(node, depth, { filter = 'all' } = {}) {
  if (viewState.collapsed.has(node.id)) return false;
  if (viewState.expanded.has(node.id)) return true;
  // While a filter is on, every branch with a match starts open so the matches show.
  if (filter !== 'all') return true;
  // The first levels start open so the shape of a paper is visible at once.
  return depth < (node.kind === 'paper' ? 1 : 2);
}

function treeNode(ws, node, depth, options = {}) {
  const { model, index } = ws;
  const filter = options.filter || 'all';
  const children = node.childIds.map((id) => model.nodes.get(id)).filter(Boolean);
  const isLine = children.length === 0;
  const lines = index.official.get(node.id);
  if (filter !== 'all' && !matchesFilter(lines, filter)) return '';

  const open = !isLine && isOpen(node, depth, { filter });
  const selected = node.id === viewState.selectedId;
  const status = lines?.status || 'not_started';
  const structural = isStructural(node);
  const childMarkup = open ? children.map((child) => treeNode(ws, child, depth + 1, options)).join('') : '';

  return `<li class="syl-node ${isLine ? 'syl-node-line' : 'syl-node-head'}">
    <div class="syl-row${selected ? ' selected' : ''}${isLine ? ` st-${status}` : ''}">
      ${!isLine ? caretButton(node.id, open, label(node)) : '<span class="syl-caret spacer" aria-hidden="true"></span>'}
      ${isLine ? tick(node.id, status, label(node)) : ''}
      <button type="button" class="syl-title${isLine ? ' leaf' : ''}${node.kind === 'topic' ? ' topic' : ''}" data-open="${esc(node.id)}" aria-current="${selected}">
        ${node.kind === 'part' && node.side && !structural ? `<span class="syl-kind-tag">Part ${esc(node.side.toUpperCase())}</span>` : ''}
        ${node.marker ? `<span class="syl-marker">(${esc(node.marker)})</span>` : ''}
        ${node.number && !node.marker && !structural ? `<span class="syl-num">${esc(String(node.number))}.</span>` : ''}
        <span class="syl-text${structural ? ' syl-structural' : ''}"${langAttr(structural ? '' : label(node))}>${esc(label(node))}</span>
      </button>
      <span class="syl-row-end">${isLine ? '' : countChip(lines)}</span>
    </div>
    ${selected ? `<div class="syl-detail-slot">${detailPanel(ws, node)}</div>` : ''}
    ${childMarkup ? `<ul class="syl-children">${childMarkup}</ul>` : ''}
  </li>`;
}

/* --------------------------------------------------------------- search ---- */

function searchResults(ws) {
  const { model, index } = ws;
  const query = viewState.search;
  const examId = viewState.examId;
  const official = searchSyllabus(model, query, { examId, limit: 40 });
  if (!official.length) {
    return emptyState({ title: 'No match', message: `Nothing in ${esc(EXAM_LABELS[examId])} matches “${esc(query)}”.` });
  }
  const said = (status) => (status && status !== 'not_started' ? `<span class="sr-only">, ${STATUS_TITLE[status]}</span>` : '');
  return `<div class="syl-results">
    <p class="syl-results-head">In the ${esc(EXAM_LABELS[examId])} syllabus <span class="syl-group-count">${official.length}</span></p>
    <ul class="syl-result-list">
      ${official
        .map((result) => {
          const status = index.official.get(result.id)?.status || 'not_started';
          return `<li>
            <button type="button" class="syl-result" data-open="${esc(result.id)}">
              ${mark(status)}
              <span class="syl-result-body">
                <span class="syl-result-text"${langAttr(result.label)}>${esc(result.label)}</span>
                <span class="syl-result-path">${(result.pathIds || [])
                  .filter((id) => id !== result.id)
                  .map((id) => esc(shortLabel(crumbLabel(model.nodes.get(id)), 60)))
                  .filter(Boolean)
                  .join(' › ')}</span>
              </span>${said(status)}
            </button>
          </li>`;
        })
        .join('')}
    </ul>
  </div>`;
}

/* --------------------------------------------------------------- header ---- */

/**
 * The introduction of the screen: one strip that says which stage you are
 * in, how far through it you are, and how marking works until the first
 * mark — plus, as a quiet second ring, the other stage, so the
 * Prelims/Mains separation stays visible while working in either. The other
 * stage's ring is a button: one click switches.
 */
function overviewStrip(ws, { examId }) {
  const summary = ws.index.official.get(examId) || { done: 0, total: 0, inProgress: 0, touched: false, completion: 0, byStatus: {} };
  const paperCount = ws.model.nodes.get(examId)?.childIds?.length || 0;
  const otherId = examId === 'prelims' ? 'mains' : 'prelims';
  const other = ws.index.official.get(otherId);
  const otherSwitch = `<button type="button" class="syl-ov-other" data-exam="${otherId}"
      aria-label="Switch to ${esc(EXAM_LABELS[otherId])}: ${other?.done || 0} of ${other?.total || 0} topics done">
    ${ring(other)}
    <span class="syl-ov-other-text"><b>${esc(EXAM_LABELS[otherId])}</b><span>${other?.done || 0}/${other?.total || 0} done</span></span>
  </button>`;
  const hint = summary.touched
    ? ''
    : `<p class="syl-ov-hint">${icon('help', { size: 14 })}<span>Nothing marked yet — tap a topic's circle to start, or open a heading to mark everything under it at once.</span></p>`;
  return `<section class="syl-overview syl-progress-head" aria-label="${esc(`${EXAM_LABELS[examId]} progress`)}">
    ${ring(summary)}
    <div class="syl-ov-main">
      <p class="syl-ov-kicker">${esc(EXAM_LABELS[examId])} · ${plural(paperCount, 'paper')}</p>
      <p class="syl-ov-title"><strong>${summary.done} of ${plural(summary.total, 'topic')}</strong> done${summary.inProgress ? ` · ${summary.inProgress} in progress` : ''}</p>
      ${statusBar(summary)}
      ${legend(summary)}
      ${hint}
    </div>
    ${otherSwitch}
  </section>`;
}

function paperToolbar(ws, paper) {
  const summary = ws.index.official.get(paper.id);
  const children = paper.childIds.map((id) => ws.model.nodes.get(id)).filter(Boolean);
  const childKind = (KIND_LABEL[children[0]?.kind] || 'section').toLowerCase();
  const allLines = children.every((child) => !child.childIds.length);
  const size = allLines
    ? plural(children.length, childKind)
    : `${plural(children.length, childKind)} · ${plural(summary?.total || 0, 'topic')}`;
  const paperBar = summary?.touched
    ? `<div class="syl-toolbar-bar">
        ${statusBar(summary)}
        <span>${esc(summary.done)} of ${plural(summary.total, 'topic')} done${summary.inProgress ? ` · ${summary.inProgress} in progress` : ''}</span>
      </div>`
    : '';
  return `<div class="syl-toolbar">
      <div class="syl-toolbar-head">
        <h2 class="syl-toolbar-title"${langAttr(label(paper))}>${esc(label(paper))}</h2>
        <p class="syl-toolbar-sub">${esc(size)}</p>
        ${paperBar}
      </div>
      <span class="syl-toolbar-actions">
        <button type="button" class="btn btn-quiet btn-sm" data-expand-all>Expand all</button>
        <button type="button" class="btn btn-quiet btn-sm" data-collapse-all>Collapse all</button>
      </span>
    </div>
    <div class="syl-filter" role="group" aria-label="Show topics">
      <span class="syl-filter-label" aria-hidden="true">Show</span>
      ${FILTERS.map(
        (filter) =>
          `<button type="button" class="syl-filter-btn${viewState.filter === filter.id ? ' on' : ''}" data-filter="${filter.id}" aria-pressed="${viewState.filter === filter.id}">${
            filter.mark ? mark(filter.mark, { dot: false }) : ''
          }${esc(filter.label)}</button>`,
      ).join('')}
    </div>`;
}

function paperBody(ws, paper) {
  const children = paper.childIds.map((id) => ws.model.nodes.get(id)).filter(Boolean);
  const filter = viewState.filter;
  const rows = children.map((child) => treeNode(ws, child, 1, { filter })).join('');
  const filterName = FILTERS.find((entry) => entry.id === filter)?.label.toLowerCase() || '';
  return `${paperToolbar(ws, paper)}
    ${
      rows
        ? `<ul class="syl-tree">${rows}</ul>`
        : emptyState({
            title: `Nothing ${esc(filterName)} here`,
            message: 'No topic in this paper matches the filter.',
            action: '<button class="btn btn-sm" type="button" data-filter="all">Show all topics</button>',
          })
    }`;
}

/* --------------------------------------------------------------- render ---- */

/**
 * Apply the route: `#/syllabus/official/<id>` or a legacy bare `<id>`, which is
 * what the PYQ chips, bookmarks and older notes have always used.
 *
 * `#/syllabus/plan/<id>` was an item in *My plan*. That screen is gone, so the
 * address falls back to the Syllabus home with nothing selected rather than
 * throwing: an old bookmark still lands somewhere sensible.
 */
function applyRoute(ws, routeNodeId) {
  const { model } = ws;
  viewState.appliedRoute = routeNodeId;
  const requested = routeNodeId.startsWith('official/') ? routeNodeId.slice('official/'.length) : routeNodeId;
  const reveal = (node) => {
    [...ancestorsOf(model.nodes, node), node].forEach((ancestor) => {
      viewState.expanded.add(ancestor.id);
      viewState.collapsed.delete(ancestor.id);
    });
  };

  if (requested && !requested.startsWith('plan/') && model.nodes.has(requested)) {
    const node = model.nodes.get(requested);
    viewState.selectedId = requested;
    viewState.search = '';
    viewState.examId = node.examId;
    viewState.paperId = node.paperId;
    reveal(node);
  } else {
    // No node in the route (the detail was closed), a route for the removed
    // plan screen, or one this build does not know: nothing is selected.
    viewState.selectedId = null;
  }
}

function aboutBlock(ws) {
  const { model, progressRows } = ws;
  const anyMarked = [...progressRows.values()].some((row) => row.status && row.status !== 'not_started');
  return `<details class="syl-about"${viewState.showAbout ? ' open' : ''}>
    <summary>About this syllabus</summary>
    <div class="syl-about-body">
      <p>The commission's revised 2026 syllabus, shown with its own hierarchy and wording. Papers are grouped as the notification groups them.</p>
      ${
        model.source.pages_missing?.length
          ? `<p>Page${model.source.pages_missing.length > 1 ? 's' : ''} ${model.source.pages_missing.join(', ')} of the source file ${
              model.source.pages_missing.length > 1 ? 'are' : 'is'
            } missing, so a few lines are incomplete. Nothing was invented to fill them.</p>`
          : ''
      }
      <p>Study breakdowns are added guidance, marked wherever they appear. Marks and examination rules are not part of this section.</p>
      <p>The commission published most of this syllabus in Hindi. Where the interface language is English, a line that has no official English is shown as a rendering written for this app, and its panel says so; the “Official wording” block always shows the commission's own text.</p>
      <p>Marking a heading marks every topic under it; a topic you mark on its own keeps its own status. Every figure on this screen counts the commission's own topics.</p>
      <button type="button" class="btn btn-quiet btn-sm" data-reset-progress${anyMarked ? '' : ' disabled'}>Reset official progress</button>
    </div>
  </details>`;
}

async function screen(ctx) {
  const ws = await loadWorkspace();
  const { model } = ws;
  if (!model.ok) {
    return `${screenHead({ title: 'Syllabus',
        eyebrow: 'MPPSC 2026 · the official study map', purpose: 'The commission\'s revised 2026 syllabus, as published.' })}
      ${notice(
        `The syllabus data could not be read from this device (${esc(model.error || 'unknown error')}). It ships with the app, so a reload should restore it.`,
        'bad',
      )}`;
  }

  const routeNodeId = (ctx?.params || []).join('/');
  if (routeNodeId !== viewState.appliedRoute) applyRoute(ws, routeNodeId);

  const papers = (model.nodes.get(viewState.examId)?.childIds || []).map((id) => model.nodes.get(id)).filter(Boolean);
  if (!papers.some((paper) => paper.id === viewState.paperId)) viewState.paperId = papers[0]?.id || null;
  const paper = model.nodes.get(viewState.paperId);

  return `<div class="syl">
    ${screenHead({
      title: 'Syllabus',
      eyebrow: 'MPPSC 2026 · the official study map',
      purpose:
        "The commission's revised 2026 syllabus, line by line as published. Mark your progress right on the official topics — every count on this screen includes only those.",
      secondary: '<a class="btn btn-sm btn-quiet" href="#/topic">Practise a topic</a>',
    })}
    <div class="syl-controls">
      <div class="syl-switch" role="tablist" aria-label="What to show">
        ${['prelims', 'mains']
          .map(
            (examId) =>
              `<button type="button" role="tab" aria-selected="${viewState.examId === examId}" tabindex="${viewState.examId === examId ? 0 : -1}" class="syl-switch-btn${
                viewState.examId === examId ? ' on' : ''
              }" data-exam="${examId}">${esc(EXAM_LABELS[examId])}</button>`,
          )
          .join('')}
      </div>
      <label class="syl-search" for="sylSearch">
        ${icon('search', { size: 15 })}
        <span class="sr-only">Search ${EXAM_LABELS[viewState.examId]}</span>
        <input type="search" id="sylSearch" value="${esc(viewState.search)}" placeholder="Search ${EXAM_LABELS[viewState.examId]} topics and headings" autocomplete="off" />
        ${viewState.search ? `<button type="button" class="syl-clear" data-clear-search aria-label="Clear search">${icon('close', { size: 13 })}</button>` : ''}
      </label>
    </div>
    ${overviewStrip(ws, { examId: viewState.examId })}

    <div class="syl-layout">
      <nav class="syl-rail" aria-label="${esc(`${EXAM_LABELS[viewState.examId]} papers`)}">
        <p class="syl-rail-head">${esc(EXAM_LABELS[viewState.examId])} papers</p>
        <div class="syl-rail-papers">
          ${papers
            .map((candidate) => {
              const summary = ws.index.official.get(candidate.id);
              const on = candidate.id === viewState.paperId;
              return `<button type="button" class="syl-rail-item${on ? ' on' : ''}" data-paper="${esc(candidate.id)}"${on ? ' aria-current="true"' : ''}>
                <span class="syl-rail-label"${langAttr(label(candidate))}>${esc(label(candidate))}</span>
                <span class="syl-rail-meta">${
                  summary?.touched
                    ? `${statusBar(summary, { size: 'mini', decorative: true })}<span class="syl-rail-done">${summary.done}/${summary.total}</span><span class="syl-rail-pct">${percent(summary)}%</span><span class="sr-only"> done</span>`
                    : `<span class="syl-rail-size">${esc(plural(summary?.total || 0, 'topic'))}</span>`
                }</span>
              </button>`;
            })
            .join('')}
        </div>
        ${aboutBlock(ws)}
      </nav>

      <section class="syl-body" aria-label="${esc(label(paper) || 'Syllabus')}">
        ${
          viewState.search
            ? searchResults(ws)
            : paper
              ? paperBody(ws, paper)
              : emptyState({ title: 'No papers', message: 'This stage has no papers in the source document.' })
        }
      </section>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- mount ---- */

/** A selector that finds the same control again after a re-render. */
function focusKeyOf(element, root) {
  if (!element || element === document.body || !root.contains(element)) return null;
  const data = element.dataset || {};
  if (data.setStatus) return `[data-set-status="${attr(data.setStatus)}"][data-status="${attr(data.status)}"]`;
  const prefix = element.classList?.[0] ? `.${element.classList[0]}` : '';
  for (const name of ['data-cycle', 'data-toggle', 'data-filter', 'data-exam', 'data-paper', 'data-open']) {
    if (element.hasAttribute(name)) return `${prefix}[${name}="${attr(element.getAttribute(name))}"]`;
  }
  return element.id ? `#${element.id}` : null;
}

/** Where an element is in the viewport, or null when that cannot be known. */
function topOnScreen(element) {
  if (!element) return null;
  try {
    return element.getBoundingClientRect().top;
  } catch {
    return null;
  }
}

/**
 * Scroll so that `element` is back at `top`, where it was in the viewport
 * before a render. What is above it can change height in between — the
 * untouched hint line in the progress strip disappears on the first mark and
 * comes back after the last one is cleared, a detail panel closes — and the
 * control that was used must not slide out from under the pointer, or a quick
 * second click lands on another topic.
 */
function keepOnScreen(element, top) {
  if (!element || typeof top !== 'number') return;
  const now = topOnScreen(element);
  if (typeof now !== 'number') return;
  const delta = now - top;
  if (Math.abs(delta) < 1) return;
  try {
    window.scrollTo(0, (window.scrollY || 0) + delta);
  } catch {
    /* scrolling is unavailable */
  }
}

/** Remember where a control is on screen, so the next route render can put it back. */
function rememberPlace(element, key) {
  viewState.pendingPlace = { key, top: topOnScreen(element) };
}

function focusQuietly(element) {
  if (!element) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    /* focus is best effort */
  }
}

/**
 * Called by the router after a route render. Puts the control the reader used
 * back where it was on screen and gives it focus; a deep link to an item from
 * elsewhere scrolls that item into view. Returns false to let the router start
 * the page at the top.
 */
function positionScroll(ctx, root) {
  const place = viewState.pendingPlace;
  viewState.pendingPlace = null;
  const anchor = place?.key ? root.querySelector(place.key) : null;
  if (anchor) {
    keepOnScreen(anchor, place.top);
    focusQuietly(anchor);
    return true;
  }
  const selected = root.querySelector('.syl-row.selected');
  if (selected && typeof selected.scrollIntoView === 'function') {
    selected.scrollIntoView({ block: 'start' });
    return true;
  }
  return false;
}

async function mount(ctx, root) {
  /**
   * Re-render in place, keeping the control that was used (or `focusKey`,
   * when the action replaces that control with another) where it was on
   * screen, and focused.
   */
  const rerender = async (focusKey = undefined) => {
    const used = root.contains(document.activeElement) ? document.activeElement : null;
    const key = focusKey === undefined ? focusKeyOf(used, root) : focusKey;
    const top = topOnScreen((key && root.querySelector(key)) || used);
    root.innerHTML = await screen(ctx);
    await mount(ctx, root);
    const anchor = key ? root.querySelector(key) : null;
    keepOnScreen(anchor, top);
    focusQuietly(anchor);
  };

  /**
   * Show another stage or paper. An item open in the address is left behind
   * with it — the address should say what is on screen — so the screen goes
   * through the router; otherwise it re-renders in place.
   */
  const showView = async (focusKey) => {
    if ((ctx?.params || []).length) {
      viewState.appliedRoute = null;
      rememberPlace(focusKey ? root.querySelector(focusKey) : null, focusKey);
      ctx.navigate('syllabus');
      return;
    }
    await rerender(focusKey);
  };

  const withModel = async () => {
    const model = await loadSyllabus();
    return model.ok ? model : null;
  };

  root.querySelector('[data-syl-search-focus]')?.addEventListener('click', () => {
    document.getElementById('sylSearch')?.focus();
  });

  root.querySelectorAll('[data-exam]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (viewState.examId === button.dataset.exam) return;
      viewState.examId = button.dataset.exam;
      viewState.paperId = null;
      viewState.selectedId = null;
      viewState.expanded.clear();
      viewState.collapsed.clear();
      viewState.search = '';
      await showView(`.syl-switch-btn[data-exam="${attr(button.dataset.exam)}"]`);
    });
  });

  root.querySelectorAll('[data-paper]').forEach((button) => {
    button.addEventListener('click', async () => {
      viewState.paperId = button.dataset.paper;
      viewState.selectedId = null;
      viewState.collapsed.clear();
      viewState.search = '';
      await showView(focusKeyOf(button, root));
    });
  });

  // The stage switch is a tab list: arrow keys, Home and End move between tabs.
  const switcher = root.querySelector('.syl-switch');
  switcher?.addEventListener('keydown', (event) => {
    const tabs = [...switcher.querySelectorAll('[role="tab"]')];
    const at = tabs.indexOf(document.activeElement);
    if (at === -1) return;
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    tab.focus();
    tab.click();
  });

  root.querySelectorAll('[data-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.toggle;
      if (button.getAttribute('aria-expanded') === 'true') {
        viewState.expanded.delete(id);
        viewState.collapsed.add(id);
      } else {
        viewState.collapsed.delete(id);
        viewState.expanded.add(id);
      }
      await rerender();
    });
  });

  root.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', async () => {
      viewState.filter = button.dataset.filter;
      await rerender(`.syl-filter-btn[data-filter="${attr(button.dataset.filter)}"]`);
    });
  });

  // Opening a node is a hash change, so back and forward move between the tree
  // and the topic that was opened, and the expansion state is not lost.
  root.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const nodeId = button.dataset.open;
      rememberPlace(button, `.syl-title[data-open="${attr(nodeId)}"]`);
      ctx.navigate(`syllabus/official/${nodeId}`);
    });
  });

  root.querySelectorAll('[data-close-detail]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = `.syl-title[data-open="${attr(viewState.selectedId)}"]`;
      rememberPlace(root.querySelector(key), key);
      ctx.navigate('syllabus');
    });
  });

  /* ---------------------------------------------------------- statuses -- */

  /**
   * Marking every topic under a heading replaces marks made one by one; ask
   * first when that would change any of them.
   */
  const confirmBulk = async (ws, nodeId, status) => {
    const summary = ws.index.official.get(nodeId);
    if (!summary || summary.total < 2) return true;
    const differing = summary.touched - (status === 'not_started' ? 0 : summary.byStatus[status] || 0);
    if (differing <= 0) return true;
    const clearing = status === 'not_started';
    return confirmDialog({
      title: clearing ? `Clear all ${plural(summary.total, 'topic')}?` : `Mark all ${plural(summary.total, 'topic')} as ${STATUS_TITLE[status].toLowerCase()}?`,
      message: clearing
        ? `${differing} of them ${differing === 1 ? 'is' : 'are'} marked now, and ${differing === 1 ? 'its mark' : 'their marks'} will be cleared. You can still mark any topic on its own afterwards.`
        : `${differing} of them ${differing === 1 ? 'is' : 'are'} marked differently now and will change to ${STATUS_TITLE[status].toLowerCase()}. You can still mark any topic on its own afterwards.`,
      confirmLabel: clearing ? 'Clear all' : 'Mark all',
    });
  };

  const changeStatus = async (nodeId, status, { bulk = false, focusKey } = {}) => {
    if (statusBusy) return;
    statusBusy = true;
    try {
      const ws = await loadWorkspace();
      if (bulk && !(await confirmBulk(ws, nodeId, status))) return;
      await setStatus(nodeId, status, { model: ws.model.ok ? ws.model : null });
      await rerender(focusKey);
    } catch (error) {
      toast(error.message, 'bad');
    } finally {
      statusBusy = false;
    }
  };

  root.querySelectorAll('[data-set-status]').forEach((button) => {
    button.addEventListener('click', () =>
      changeStatus(button.dataset.setStatus, button.dataset.status, {
        bulk: Boolean(button.dataset.bulk),
        focusKey: focusKeyOf(button, root),
      }),
    );
  });

  root.querySelectorAll('[data-cycle]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = NEXT_STATUS[normaliseStatus(button.dataset.current)];
      changeStatus(button.dataset.cycle, next, { focusKey: `[data-cycle="${attr(button.dataset.cycle)}"]` });
    });
  });

  /* -------------------------------------------------------- tree tools --- */

  root.querySelector('[data-expand-all]')?.addEventListener('click', async () => {
    const model = await withModel();
    if (model && viewState.paperId) {
      const prefix = `${viewState.paperId}/`;
      model.nodes.forEach((node) => {
        if (node.kind === 'exam' || node.id === viewState.paperId || node.id.startsWith(prefix)) {
          viewState.collapsed.delete(node.id);
          if (node.childIds.length) viewState.expanded.add(node.id);
        }
      });
    }
    await rerender();
  });

  root.querySelector('[data-collapse-all]')?.addEventListener('click', async () => {
    const model = await withModel();
    if (model && viewState.paperId) {
      const prefix = `${viewState.paperId}/`;
      viewState.expanded.clear();
      model.nodes.forEach((node) => {
        if (node.id.startsWith(prefix)) viewState.collapsed.add(node.id);
      });
    }
    // The open item is folded away with everything else, so close it too.
    viewState.selectedId = null;
    await showView('[data-collapse-all]');
  });

  root.querySelector('[data-clear-search]')?.addEventListener('click', async () => {
    viewState.search = '';
    await rerender('#sylSearch');
  });

  const about = root.querySelector('.syl-about');
  about?.addEventListener('toggle', () => {
    viewState.showAbout = about.open;
  });

  root.querySelector('[data-reset-progress]')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Reset syllabus progress?',
      message:
        "This clears every status you marked on the official Prelims and Mains syllabus. Your question bank, attempts, mistakes and revision schedule are not touched, and nothing is deleted from your backups.",
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!confirmed) return;
    await resetProgress();
    toast('Syllabus progress cleared.', 'info');
    await rerender();
  });

  const searchInput = root.querySelector('#sylSearch');
  if (searchInput) {
    let timer = null;
    searchInput.addEventListener('input', (event) => {
      viewState.search = event.target.value;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await rerender('#sylSearch');
        const refreshed = root.querySelector('#sylSearch');
        if (refreshed) {
          const end = refreshed.value.length;
          try {
            refreshed.setSelectionRange(end, end);
          } catch {
            /* some environments refuse a selection range on search inputs */
          }
        }
      }, 200);
    });
    if (viewState.search && document.activeElement !== searchInput && !root.querySelector('.syl-row.selected')) {
      focusQuietly(searchInput);
      try {
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      } catch {
        /* ignore */
      }
    }
  }
}

export default {
  title: 'Syllabus',
  eyebrow: 'MPPSC 2026 · the official study map',

  render(ctx) {
    return screen(ctx);
  },

  mount,

  positionScroll,
};
