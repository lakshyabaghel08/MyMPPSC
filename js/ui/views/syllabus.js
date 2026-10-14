/**
 * syllabus.js (view) — the Syllabus section.
 *
 * One section for the whole curriculum. It was two screens: an official
 * syllabus viewer and a separate study planner, each with its own tree, its own
 * store and its own progress that the other could not see. They are merged
 * here, through `services/syllabus-hub.js`.
 *
 * What the merge does and does not do:
 *
 *  * The commission's 2026 syllabus is the spine. Its text is rendered as the
 *    notification words it, with no counts, marks, scores or predictions
 *    attached, and derived study guidance stays labelled `derived`.
 *  * The user's own plan items hang underneath the official node they belong
 *    to, badged as the user's own. A plan item is never presented as syllabus
 *    text and never written into the official tree, which ships as read-only
 *    data.
 *  * Progress, priority, target date and notes work on *either* kind of item,
 *    through one vocabulary, and roll up into one figure.
 *  * Any paper, section, unit or topic can be put in *My plan* with one click.
 *    It joins by reference: the status shown in My plan is the one marked in
 *    the tree, and nothing the commission wrote is copied into the user's own
 *    store.
 *
 * Progress is read one way everywhere (`officialStatusIndex()` in
 * `services/syllabus.js`): a topic carries its own status or that of its
 * nearest marked heading, and a heading shows the roll-up of its topics. Every
 * topic has a one-click status mark in the tree; a heading's panel marks all of
 * its topics at once. The syllabus stays fully readable without touching a
 * control.
 */

import { esc, badge, toast, confirmDialog, openModal, notice, emptyState, icon, langAttr } from '../components.js';
import { fmtDate, todayKey, daysBetween, readFileAsText, downloadJson } from '../../core/util.js';
import { state } from '../../core/state.js';
import * as planner from '../../services/planner.js';
import {
  loadSyllabus,
  loadProgress,
  resetProgress,
  searchSyllabus,
  pickText,
  displayLanguage,
  pyqLinksFor,
  relatedGuidance,
  sourceRefs,
  ancestorsOf,
  hasPlanFields,
  EXAM_LABELS,
} from '../../services/syllabus.js';
import {
  STATUSES,
  STATUS_ORDER,
  loadPlan,
  planItemsFor,
  buildProgressIndex,
  planOverview,
  planDeadlines,
  planAnchor,
  isInPlan,
  normaliseStatus,
  readEntry,
  setStatus,
  setPlanFields,
  attachPlanItem,
  addOfficialToPlan,
  removeOfficialFromPlan,
  officialLabel,
} from '../../services/syllabus-hub.js';

/* ------------------------------------------------------------- view state -- */

/** The tab that holds My plan. */
const MY_PLAN = '__my_plan__';

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
  selectedScope: 'official',
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
 * The official title of a node, or a structural name when the source leaves it
 * untitled (several Mains units are bare "इकाई-N"). A structural name is never
 * syllabus text: it only says which numbered unit the row is.
 */
const label = officialLabel;

/** True when the row's text is a structural name rather than official wording. */
const isStructural = (node) => Boolean(node) && !pickText(node.titles);

/** A node's name in a breadcrumb: a stage by its short name, anything else by its label. */
const crumbLabel = (node) => (node?.kind === 'exam' ? EXAM_LABELS[node.examId] || label(node) : label(node));

const planTarget = (id) => `plan:${id}`;

/** Decode the `scope:id` pair the markup carries for a selectable row. */
function decodeTarget(raw) {
  const value = String(raw || '');
  if (value.startsWith('plan:')) return { scope: 'plan', id: value.slice(5) };
  return { scope: 'official', id: value };
}

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

/** A target date as "20 Oct" (with the year when it is not this year). */
function shortDate(key) {
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(key || '');
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return fmtDate(date, sameYear ? { year: undefined } : {});
}

/** "today", "tomorrow", "in 5 days", "3 days late". */
function dueWords(key) {
  const days = daysBetween(new Date(), new Date(`${key}T00:00:00`));
  if (Number.isNaN(days)) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  return `${plural(-days, 'day')} late`;
}

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
  const unit = summary.planItems ? 'item' : 'topic';
  if (!summary.touched) return `<span class="syl-count soft">${plural(summary.total, unit)}</span>`;
  const said = `${summary.done} of ${plural(summary.total, unit)} done${summary.inProgress ? `, ${summary.inProgress} in progress` : ''}`;
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
 * The status control in a detail panel. One vocabulary for both kinds of item:
 * `target` is the `scope:id` pair, so the same control drives an official node
 * and a plan item. With `bulk`, it marks every line under a heading at once.
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

/**
 * The My plan control on an official row: add it, show that it is in, or show
 * that it is in through a heading above it. Inside a My plan card the card
 * itself says all of this, so only nodes planned on their own get a control.
 */
function planToggle(ws, node, { cardRoot = null } = {}) {
  if (node.kind === 'exam' || node.id === cardRoot) return '';
  const name = shortLabel(label(node));
  if (isInPlan(ws.progressRows.get(node.id))) {
    return `<button type="button" class="syl-plan-btn on" data-plan-remove="${esc(node.id)}" aria-label="${esc(`In My plan: ${name}. Remove it from My plan`)}" title="In My plan · click to remove">${icon('check', { size: 14 })}<span class="syl-plan-btn-text">In plan</span></button>`;
  }
  const anchor = ws.anchorOf(node);
  if (anchor) {
    if (cardRoot) return '';
    const via = shortLabel(label(anchor), 50);
    return `<span class="syl-plan-via" title="${esc(`In My plan as part of “${via}”`)}">${icon('check', { size: 13 })}<span class="sr-only">${esc(`In My plan as part of ${via}`)}</span></span>`;
  }
  return `<button type="button" class="syl-plan-btn" data-plan-add="${esc(node.id)}" aria-label="${esc(`Add to My plan: ${name}`)}" title="Add to My plan">${icon('plus', { size: 14 })}<span class="syl-plan-btn-text">Plan</span></button>`;
}

/** Target date and priority as small chips. */
function planChips(row, { finished = false } = {}) {
  const chips = [];
  if (row?.target_date) {
    const today = todayKey();
    const late = !finished && row.target_date < today;
    chips.push(
      `<span class="syl-chip-date${late ? ' late' : ''}" title="Target date">${icon('calendar', { size: 12 })}${esc(shortDate(row.target_date))}${
        finished ? '' : ` · ${esc(dueWords(row.target_date))}`
      }</span>`,
    );
  }
  if (row?.priority === 'high') chips.push(badge('high priority', 'warn'));
  else if (row?.priority === 'low') chips.push(badge('low priority'));
  return chips.join('');
}

/* ----------------------------------------------------------- workspace ---- */

/** Everything one render needs, read once. */
async function loadWorkspace() {
  const model = await loadSyllabus();
  if (!model.ok) return { model };
  const [progressRows, plan] = await Promise.all([loadProgress(), loadPlan({ model })]);
  const index = buildProgressIndex(model, progressRows, plan);
  const hostByRoot = new Map();
  for (const [nodeId, roots] of plan.attachments) for (const root of roots) hostByRoot.set(root.id, nodeId);
  return {
    model,
    progressRows,
    plan,
    index,
    hostByRoot,
    overview: planOverview(model, progressRows, plan, index),
    /** The node itself, or its nearest heading, that is in My plan. */
    anchorOf: (node) => planAnchor(model, progressRows, node),
  };
}

/** The official node a plan item is displayed under, if any. */
function hostNodeOf(ws, row) {
  let cursor = row;
  const seen = new Set();
  while (cursor?.parent_id && ws.plan.byId.has(cursor.parent_id) && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    cursor = ws.plan.byId.get(cursor.parent_id);
  }
  const nodeId = cursor ? ws.hostByRoot.get(cursor.id) : null;
  return nodeId ? ws.model.nodes.get(nodeId) || null : null;
}

/* ------------------------------------------------------- detail: official -- */

/** A language block: the display language first, the other rendition after it. */
function renditions(pair) {
  if (!pair) return '';
  const first = displayLanguage();
  const order = [first, first === 'hi' ? 'en' : 'hi'].filter((lang) => pair[lang]);
  return order
    .map((lang, index) => {
      const secondary = index > 0;
      return `<p class="syl-said${secondary ? ' alt' : ''}"${langAttr(pair[lang], lang)}>${
        secondary ? `<span class="syl-lang">${lang === 'hi' ? 'हिन्दी' : 'English'}</span>` : ''
      }${esc(pair[lang])}</p>`;
    })
    .join('');
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

/** The plan items attached to one official node, rendered inside its detail. */
function attachedPlanBlock(ws, nodeId) {
  const items = planItemsFor(ws.plan, nodeId);
  return `
    <section class="syl-block syl-plan-list">
      <div class="syl-block-head">
        <h4>Your items here</h4>
        <span class="syl-tag" title="Your own planning, stored on this device">yours</span>
      </div>
      ${
        items.length
          ? `<ul class="syl-related">
              ${items
                .map((row) => {
                  const summary = ws.index.plan.get(row.id);
                  return `<li class="syl-related-plan">${mark(summary?.status)}<button type="button" class="syl-other" data-open="${esc(planTarget(row.id))}">${esc(row.title)}</button>${badge('your item', 'info')}${planChips(row)}</li>`;
                })
                .join('')}
            </ul>`
          : '<p class="syl-tag-note">Nothing of your own here yet. Add a book chapter, a set of notes or anything else you want to track under this heading.</p>'
      }
      <button type="button" class="btn btn-sm" data-add-plan-here="${esc(nodeId)}">${icon('plus', { size: 14 })} Add your own item here</button>
    </section>`;
}

/** The "Your plan" block on an official node: add it to My plan, or show and edit its plan. */
function officialPlanBlock(ws, node, entry) {
  const kind = (KIND_LABEL[node.kind] || 'item').toLowerCase();
  const head = `<div class="syl-block-head"><h4>Your plan</h4><span class="syl-tag" title="Your own planning, stored on this device">yours</span></div>`;
  if (entry.inPlan) {
    const row = ws.progressRows.get(node.id);
    const summary = ws.index.official.get(node.id);
    const finished = Boolean(summary?.total) && summary.done === summary.total;
    const chips = planChips(row, { finished });
    return `<section class="syl-block syl-plan-block in-plan">
      ${head}
      <p class="syl-plan-state">${icon('bookmark', { size: 15 })}<span>This ${esc(kind)} is in My plan.</span></p>
      ${chips ? `<p class="syl-plan-chips">${chips}</p>` : '<p class="syl-plan-line soft">No target date or priority set.</p>'}
      ${entry.notes ? `<p class="syl-plan-notes">${esc(entry.notes)}</p>` : ''}
      <div class="syl-plan-actions">
        <button type="button" class="btn btn-sm" data-edit-plan="${esc(node.id)}">${icon('calendar', { size: 14 })} ${chips || entry.notes ? 'Edit plan' : 'Set a target date'}</button>
        <button type="button" class="btn btn-sm btn-quiet" data-plan-remove="${esc(node.id)}">Remove from My plan</button>
      </div>
    </section>`;
  }
  const anchor = ws.anchorOf(node);
  if (anchor) {
    return `<section class="syl-block syl-plan-block in-plan">
      ${head}
      <p class="syl-plan-state">${icon('bookmark', { size: 15 })}<span>In My plan as part of <button type="button" class="syl-other" data-open="${esc(anchor.id)}">${esc(shortLabel(label(anchor), 80))}</button>.</span></p>
      <p class="syl-tag-note">Add it on its own to give this ${esc(kind)} its own target date and notes.</p>
      <div class="syl-plan-actions"><button type="button" class="btn btn-sm" data-plan-add="${esc(node.id)}">${icon('plus', { size: 14 })} Add on its own</button></div>
    </section>`;
  }
  return `<section class="syl-block syl-plan-block">
    ${head}
    <p class="syl-tag-note">Put this ${esc(kind)} in My plan to keep it in one list with a target date, a priority and notes. Its progress stays the one you mark here.</p>
    <div class="syl-plan-actions"><button type="button" class="btn btn-sm btn-primary" data-plan-add="${esc(node.id)}">${icon('plus', { size: 14 })} Add to My plan</button></div>
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
  const { model, progressRows, plan, index } = ws;
  const crumbs = ancestorsOf(model.nodes, node)
    .map((ancestor) => crumbLabel(ancestor))
    .filter(Boolean);
  const entry = readEntry({ scope: 'official', id: node.id }, { progressRows, plan });
  const lines = index.official.get(node.id);
  const isLine = !node.childIds.length;
  const structural = isStructural(node);
  const pages = sourceRefs(model, node);
  const anchor = entry.inPlan ? node : ws.anchorOf(node);

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
      ${anchor ? `<span class="syl-in-plan">${icon('bookmark', { size: 12 })}In My plan</span>` : ''}
    </div>
    ${
      structural
        ? '<p class="syl-tag-note">The notification lists this unit without a title of its own; its lines are below.</p>'
        : ''
    }`;

  const actions = `<div class="syl-detail-grid">${officialTrackBlock(node, lines)}${officialPlanBlock(ws, node, entry)}</div>`;

  if (node.kind === 'topic') {
    const heading = model.nodes.get(node.parentId);
    const units = heading ? (guideFor(model, heading.id)?.units || []).filter((unit) => unit.covers.includes(node.id)) : [];
    return `<div class="syl-detail" role="region" aria-label="${esc(`Details: ${shortLabel(label(node), 60)}`)}">
      ${head}
      ${actions}
      <section class="syl-block"><h4>Official wording</h4>${renditions(node.text)}</section>
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
      ${attachedPlanBlock(ws, node.id)}
    </div>`;
  }

  const children = node.childIds.map((id) => model.nodes.get(id)).filter(Boolean);
  const grouped = children.filter((child) => child.kind === 'topic');
  const nested = children.filter((child) => child.kind !== 'topic');

  return `<div class="syl-detail" role="region" aria-label="${esc(`Details: ${shortLabel(label(node), 60)}`)}">
    ${head}
    ${node.scope ? `<p class="syl-scope"${langAttr(node.scope, 'hi')}>${esc(node.scope)}</p>` : ''}
    ${actions}
    ${
      grouped.length || nested.length
        ? `<section class="syl-block">
            <h4>Official syllabus</h4>
            <ol class="syl-official">
              ${grouped.map((child) => `<li>${renditions(child.text)}</li>`).join('')}
              ${nested
                .map((child) => {
                  const topics = child.childIds.map((id) => model.nodes.get(id)).filter((kid) => kid && kid.kind === 'topic');
                  if (!topics.length) return `<li><span class="syl-official-head">${esc(label(child))}</span></li>`;
                  return `<li><span class="syl-official-head">${esc(label(child))}</span>${topics.map((topic) => renditions(topic.text)).join('')}</li>`;
                })
                .join('')}
            </ol>
          </section>`
        : ''
    }
    ${studyBreakdown(model, node.id)}
    ${pyqBlock(model, node.id)}
    ${relatedBlock(model, node)}
    ${attachedPlanBlock(ws, node.id)}
    ${
      pages.length
        ? `<p class="syl-source">Official text from page${pages.length > 1 ? 's' : ''} ${pages.join(', ')} of the source notification.</p>`
        : ''
    }
  </div>`;
}

/* ----------------------------------------------------------- detail: plan -- */

/**
 * Detail for an item the user wrote. It deliberately looks different from an
 * official node: no "Official wording" block exists for it, because none of its
 * text comes from the notification.
 */
function planDetail(ws, row) {
  const { model, plan, index } = ws;
  const target = planTarget(row.id);
  const summary = index.plan.get(row.id);
  const parentRow = row.parent_id ? plan.byId.get(row.parent_id) : null;
  const host = hostNodeOf(ws, row);
  const crumbs = [
    ...(host ? [...ancestorsOf(model.nodes, host).map((a) => crumbLabel(a)), label(host)] : ['My plan']),
    ...(parentRow ? [parentRow.title] : []),
  ].filter(Boolean);
  const children = plan.childrenOf(row.id);
  const isLine = !children.length;
  const status = summary?.status || normaliseStatus(row.status);
  const finished = Boolean(summary?.total) && summary.done === summary.total;
  const chips = planChips(row, { finished });
  const pinned = plan.basisById.get(host ? rootOf(ws, row).id : row.id) === 'pinned';

  return `<div class="syl-detail syl-detail-plan" role="region" aria-label="${esc(`Details: ${shortLabel(row.title, 60)}`)}">
    <button type="button" class="syl-close" data-close-detail aria-label="Close">${icon('close', { size: 14 })}</button>
    <p class="syl-crumbs">${crumbs.map((crumb) => esc(crumb)).join(SEP)}</p>
    <h3 class="syl-detail-title">${esc(row.title)}</h3>
    <div class="syl-detail-meta">
      ${badge('your item', 'info')}
      ${
        isLine
          ? `<span class="syl-state ${status}">${mark(status, { dot: false })}${STATUS_TITLE[status]}</span>`
          : `<span class="syl-state">${esc(summary?.touched ? summaryWords(summary, 'sub-item') : plural(summary?.total || 0, 'sub-item'))}</span>`
      }
    </div>
    <p class="syl-tag-note">Your own item. It is stored separately from the commission's syllabus and is never counted as official text.</p>
    ${
      host
        ? `<p class="syl-tag-note">Shown under <strong>${esc(label(host))}</strong>${
            pinned ? ', where you placed it' : ', suggested from the curated question-bank mapping'
          }.</p>`
        : ''
    }
    <div class="syl-detail-grid">
      <section class="syl-block syl-track">
        <h4>Your progress</h4>
        ${
          isLine
            ? statusControl(target, status)
            : `<div class="syl-track-summary">${statusBar(summary)}<span>${esc(summary?.touched ? summaryWords(summary, 'sub-item') : `${plural(summary?.total || 0, 'sub-item')}, none marked yet`)}</span></div>
               <p class="syl-track-hint">Mark all ${esc(plural(summary?.total || 0, 'sub-item'))} at once:</p>
               ${statusControl(target, uniformStatus(summary), { bulk: true, name: row.title })}`
        }
      </section>
      <section class="syl-block syl-plan-block in-plan">
        <div class="syl-block-head"><h4>Your plan</h4><span class="syl-tag" title="Your own planning, stored on this device">yours</span></div>
        ${chips ? `<p class="syl-plan-chips">${chips}</p>` : '<p class="syl-plan-line soft">No target date or priority set.</p>'}
        ${row.notes ? `<p class="syl-plan-notes">${esc(row.notes)}</p>` : ''}
        <div class="syl-plan-actions"><button type="button" class="btn btn-sm" data-edit-plan="${esc(target)}">Edit item</button></div>
      </section>
    </div>
    ${
      children.length
        ? `<section class="syl-block">
            <h4>Items under this one</h4>
            <ul class="syl-related">
              ${children
                .map((child) => {
                  const childSummary = index.plan.get(child.id);
                  return `<li class="syl-related-plan">${mark(childSummary?.status)}<button type="button" class="syl-other" data-open="${esc(planTarget(child.id))}">${esc(child.title)}</button>${planChips(child)}</li>`;
                })
                .join('')}
            </ul>
          </section>`
        : ''
    }
    <section class="syl-block">
      <h4>Manage</h4>
      <div class="syl-plan-actions">
        <button type="button" class="btn btn-sm" data-add-plan-child="${esc(row.id)}">${icon('plus', { size: 14 })} Add an item under this</button>
        ${host && !row.parent_id ? `<button type="button" class="btn btn-sm btn-quiet" data-detach-plan="${esc(row.id)}">Keep it in My plan only</button>` : ''}
        <button type="button" class="btn btn-sm btn-quiet" data-delete-plan="${esc(row.id)}">Delete</button>
      </div>
    </section>
  </div>`;
}

function rootOf(ws, row) {
  let cursor = row;
  const seen = new Set();
  while (cursor?.parent_id && ws.plan.byId.has(cursor.parent_id) && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    cursor = ws.plan.byId.get(cursor.parent_id);
  }
  return cursor;
}

/* ----------------------------------------------------------------- tree ---- */

function matchesFilter(summary, filter) {
  if (!summary) return true;
  if (filter === 'not_started') return summary.byStatus.not_started > 0;
  if (filter === 'in_progress') return summary.inProgress > 0;
  if (filter === 'done') return summary.done > 0;
  return true;
}

function isOpen(node, depth, { filter = 'all', inCard = false } = {}) {
  if (viewState.collapsed.has(node.id)) return false;
  if (viewState.expanded.has(node.id)) return true;
  // While a filter is on, every branch with a match starts open so the matches show.
  if (filter !== 'all') return true;
  // A My plan card opens on what was planned and keeps everything below it folded.
  if (inCard) return depth === 0;
  // The first levels start open so the shape of a paper is visible at once.
  return depth < (node.kind === 'paper' ? 1 : 2);
}

/**
 * A row for an item the user wrote, rendered inside the official tree but
 * visibly theirs: a "your item" chip, and never the numbering or language
 * attributes that mark official wording.
 */
function planTreeNode(ws, row, depth, options = {}) {
  const { plan, index } = ws;
  const filter = options.filter || 'all';
  const children = plan.childrenOf(row.id);
  const summary = index.plan.get(row.id);
  if (filter !== 'all' && !matchesFilter(summary, filter)) return '';
  const toggleId = planTarget(row.id);
  const open = children.length > 0 && (filter !== 'all' || !viewState.collapsed.has(toggleId));
  const selected = viewState.selectedScope === 'plan' && viewState.selectedId === row.id;
  const isLine = !children.length;
  const status = summary?.status || normaliseStatus(row.status);
  const host = options.showHost && depth === 0 ? hostNodeOf(ws, row) : null;
  const finished = Boolean(summary?.total) && summary.done === summary.total;
  const childMarkup = open ? children.map((child) => planTreeNode(ws, child, depth + 1, { filter })).join('') : '';

  return `<li class="syl-node syl-node-plan">
    <div class="syl-row${selected ? ' selected' : ''}${isLine ? ` st-${status}` : ''}">
      ${children.length ? caretButton(toggleId, open, row.title) : '<span class="syl-caret spacer" aria-hidden="true"></span>'}
      ${isLine ? tick(toggleId, status, row.title) : ''}
      <button type="button" class="syl-title syl-title-plan${isLine ? ' leaf' : ''}" data-open="${esc(toggleId)}" aria-current="${selected}">
        <span class="syl-text">${esc(row.title)}</span>
        ${host ? `<span class="syl-host">under ${esc(shortLabel(label(host), 48))}</span>` : ''}
      </button>
      <span class="syl-row-end">
        ${badge('your item', 'info')}
        ${planChips(row, { finished })}
        ${isLine ? '' : countChip(summary)}
      </span>
    </div>
    ${selected ? `<div class="syl-detail-slot">${planDetail(ws, row)}</div>` : ''}
    ${childMarkup ? `<ul class="syl-children">${childMarkup}</ul>` : ''}
  </li>`;
}

function treeNode(ws, node, depth, options = {}) {
  const { model, plan, index } = ws;
  const filter = options.filter || 'all';
  const children = node.childIds.map((id) => model.nodes.get(id)).filter(Boolean);
  const planItems = planItemsFor(plan, node.id);
  const isLine = children.length === 0;
  const hasChildren = children.length > 0 || planItems.length > 0;
  const lines = index.official.get(node.id);
  const combined = index.node.get(node.id);
  if (filter !== 'all' && !matchesFilter(isLine && !planItems.length ? lines : combined, filter)) return '';

  const open = hasChildren && isOpen(node, depth, { filter, inCard: Boolean(options.cardRoot) });
  const selected = viewState.selectedScope === 'official' && node.id === viewState.selectedId;
  const status = lines?.status || 'not_started';
  const structural = isStructural(node);
  const childMarkup = open
    ? children.map((child) => treeNode(ws, child, depth + 1, options)).join('') +
      planItems.map((row) => planTreeNode(ws, row, depth + 1, { filter })).join('')
    : '';

  return `<li class="syl-node ${isLine ? 'syl-node-line' : 'syl-node-head'}">
    <div class="syl-row${selected ? ' selected' : ''}${isLine ? ` st-${status}` : ''}">
      ${hasChildren ? caretButton(node.id, open, label(node)) : '<span class="syl-caret spacer" aria-hidden="true"></span>'}
      ${isLine ? tick(node.id, status, label(node)) : ''}
      <button type="button" class="syl-title${isLine ? ' leaf' : ''}${node.kind === 'topic' ? ' topic' : ''}" data-open="${esc(node.id)}" aria-current="${selected}">
        ${node.kind === 'part' && node.side && !structural ? `<span class="syl-kind-tag">Part ${esc(node.side.toUpperCase())}</span>` : ''}
        ${node.marker ? `<span class="syl-marker">(${esc(node.marker)})</span>` : ''}
        ${node.number && !node.marker && !structural ? `<span class="syl-num">${esc(String(node.number))}.</span>` : ''}
        <span class="syl-text${structural ? ' syl-structural' : ''}"${langAttr(structural ? '' : label(node))}>${esc(label(node))}</span>
      </button>
      <span class="syl-row-end">
        ${
          isLine
            ? planItems.length
              ? `<span class="syl-plan-count" title="${esc(`${plural(planItems.length, 'item')} of your own here`)}">+${planItems.length}</span>`
              : ''
            : countChip(combined)
        }
        ${planToggle(ws, node, options)}
      </span>
    </div>
    ${selected ? `<div class="syl-detail-slot">${detailPanel(ws, node)}</div>` : ''}
    ${childMarkup ? `<ul class="syl-children">${childMarkup}</ul>` : ''}
  </li>`;
}

/* --------------------------------------------------------------- search ---- */

function searchResults(ws, onMyPlan) {
  const { model, plan, index } = ws;
  const query = viewState.search;
  const examId = onMyPlan ? null : viewState.examId;
  const official = searchSyllabus(model, query, { examId, limit: 40 });
  const needle = query.trim().toLowerCase();
  const own = needle
    ? plan.rows
        .filter((row) => `${row.title || ''} ${row.notes || ''}`.toLowerCase().includes(needle))
        .filter((row) => {
          if (!examId) return true;
          const host = hostNodeOf(ws, row);
          return !host || host.examId === examId;
        })
        .slice(0, 20)
    : [];
  const scope = examId ? EXAM_LABELS[examId] : 'the syllabus or your items';
  if (!official.length && !own.length) {
    return emptyState({ title: 'No match', message: `Nothing in ${esc(scope)} matches “${esc(query)}”.` });
  }
  const said = (status) => (status && status !== 'not_started' ? `<span class="sr-only">, ${STATUS_TITLE[status]}</span>` : '');
  return `<div class="syl-results">
    ${
      official.length
        ? `<p class="syl-results-head">In the ${esc(examId ? EXAM_LABELS[examId] : 'official')} syllabus <span class="syl-group-count">${official.length}</span></p>
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
          </ul>`
        : ''
    }
    ${
      own.length
        ? `<p class="syl-results-head">Your own items <span class="syl-group-count">${own.length}</span></p>
          <ul class="syl-result-list">
            ${own
              .map((row) => {
                const status = index.plan.get(row.id)?.status || normaliseStatus(row.status);
                const host = hostNodeOf(ws, row);
                return `<li>
                  <button type="button" class="syl-result" data-open="${esc(planTarget(row.id))}">
                    ${mark(status)}
                    <span class="syl-result-body">
                      <span class="syl-result-text">${esc(row.title)}</span>
                      <span class="syl-result-path">Your item · ${host ? esc(shortLabel(label(host), 60)) : 'My plan'}</span>
                    </span>${said(status)}
                  </button>
                </li>`;
              })
              .join('')}
          </ul>`
        : ''
    }
  </div>`;
}

/* -------------------------------------------------------------- my plan ---- */

/** A card for one official node in My plan: where it sits, its plan, and its own tree. */
function planCard(ws, node) {
  const row = ws.progressRows.get(node.id);
  const crumbs = ancestorsOf(ws.model.nodes, node)
    .filter((ancestor) => ancestor.kind !== 'exam')
    .map((ancestor) => label(ancestor))
    .filter(Boolean);
  const summary = ws.index.official.get(node.id);
  const finished = Boolean(summary?.total) && summary.done === summary.total;
  const chips = planChips(row, { finished });
  return `<li class="syl-card${finished ? ' finished' : ''}">
    <div class="syl-card-head">
      <p class="syl-crumbs">${crumbs.length ? crumbs.map((crumb) => esc(crumb)).join(SEP) : esc(EXAM_LABELS[node.examId] || '')}</p>
      <div class="syl-card-actions">
        <button type="button" class="btn btn-quiet btn-sm" data-edit-plan="${esc(node.id)}">${icon('calendar', { size: 14 })} ${chips || row?.notes ? 'Edit plan' : 'Set target'}</button>
        <button type="button" class="btn btn-quiet btn-sm" data-plan-remove="${esc(node.id)}">Remove</button>
      </div>
    </div>
    <ul class="syl-tree syl-card-tree">${treeNode(ws, node, 0, { cardRoot: node.id })}</ul>
    ${
      chips || row?.notes
        ? `<div class="syl-card-foot">${chips ? `<p class="syl-plan-chips">${chips}</p>` : ''}${row?.notes ? `<p class="syl-card-note">${esc(row.notes)}</p>` : ''}</div>`
        : ''
    }
  </li>`;
}

/** Target dates in My plan that need attention. */
function deadlines(ws) {
  const { overdue, upcoming } = planDeadlines(ws.model, ws.progressRows, ws.plan, todayKey(), ws.index);
  if (!overdue.length && !upcoming.length) return '';
  const item = (entry, late) =>
    `<li><button type="button" class="syl-due-item${late ? ' late' : ''}" data-open="${esc(entry.scope === 'plan' ? planTarget(entry.id) : entry.id)}">
      ${icon('calendar', { size: 13 })}<span class="syl-due-date">${esc(shortDate(entry.target_date))} · ${esc(dueWords(entry.target_date))}</span>
      <span class="syl-due-title">${esc(shortLabel(entry.title, 70))}</span>
    </button></li>`;
  return `<div class="syl-due">
    ${overdue.length ? `<div class="syl-due-group"><p class="syl-due-head late">Overdue <span class="syl-group-count">${overdue.length}</span></p><ul>${overdue.slice(0, 4).map((entry) => item(entry, true)).join('')}</ul></div>` : ''}
    ${upcoming.length ? `<div class="syl-due-group"><p class="syl-due-head">Coming up</p><ul>${upcoming.slice(0, 4).map((entry) => item(entry, false)).join('')}</ul></div>` : ''}
  </div>`;
}

/** The My plan tab: official nodes the reader added, grouped by stage, then their own items. */
function myPlanPanel(ws) {
  const { plan, overview } = ws;
  const toolbar = `<div class="syl-toolbar">
      <div class="syl-toolbar-head">
        <h2 class="syl-toolbar-title">My plan</h2>
        <p class="syl-toolbar-sub">The parts of the syllabus you chose to focus on, and items of your own. Progress is shared with the tree: mark a topic in either place.</p>
      </div>
      <span class="syl-toolbar-actions">
        <button type="button" class="btn btn-sm btn-primary" id="sylAddRoot">${icon('plus', { size: 14 })} Add your own item</button>
        <button type="button" class="btn btn-sm" id="sylBootstrap">Suggest from question bank</button>
        <button type="button" class="btn btn-sm" id="sylImport">Import</button>
        <button type="button" class="btn btn-sm btn-quiet" id="sylExport">Export your items</button>
        <input type="file" id="sylFile" accept="application/json,.json" hidden />
      </span>
    </div>`;

  if (!overview.entries.length && !plan.rows.length) {
    return `${toolbar}${emptyState({
      title: 'Your plan is empty',
      message:
        `Build a focused list for your preparation: press ${icon('plus', { size: 13 })} beside any section or topic in Prelims or Mains (or <strong>Add paper to My plan</strong>), write items of your own, or start from the subjects already in your question bank.`,
      action:
        '<button class="btn btn-primary" type="button" data-exam="prelims">Browse Prelims</button> <button class="btn" type="button" data-exam="mains">Browse Mains</button> <button class="btn btn-quiet" type="button" id="sylBootstrap2">Suggest from question bank</button>',
    })}`;
  }

  const groups = ['prelims', 'mains']
    .map((examId) => {
      const cards = overview.entries.filter((node) => node.examId === examId);
      if (!cards.length) return '';
      return `<section class="syl-plan-group" aria-label="${esc(`${EXAM_LABELS[examId]} in My plan`)}">
        <h3 class="syl-group-title">${esc(EXAM_LABELS[examId])} <span class="syl-group-count">${cards.length}</span></h3>
        <ul class="syl-cards">${cards.map((node) => planCard(ws, node)).join('')}</ul>
      </section>`;
    })
    .join('');

  // Items pinned under a heading that is already in a card show inside that card.
  const ownRoots = plan.roots.filter((row) => {
    const host = hostNodeOf(ws, row);
    return !host || !ws.anchorOf(host);
  });
  const own = `<section class="syl-plan-group" aria-label="Your own items">
    <h3 class="syl-group-title">Your own items <span class="syl-group-count">${plan.rows.length}</span></h3>
    ${
      ownRoots.length
        ? `<ul class="syl-tree syl-own-tree">${ownRoots.map((row) => planTreeNode(ws, row, 0, { showHost: true })).join('')}</ul>`
        : `<p class="syl-tag-note">${
            plan.rows.length
              ? 'All of your own items sit inside the cards above.'
              : 'Items you write yourself appear here: a book chapter, a newspaper habit, anything the syllabus does not list. Use “Add your own item” above.'
          }</p>`
    }
  </section>`;

  return `${toolbar}${deadlines(ws)}${groups}${own}`;
}

/* --------------------------------------------------------------- header ---- */

function planShortcut(ws) {
  const { overview } = ws;
  const entries = overview.entries.length + ws.plan.roots.length;
  const words = entries
    ? `${plural(overview.summary.total, 'item')} · ${percent(overview.summary)}% done`
    : 'Nothing added yet';
  return `<button type="button" class="syl-ov-plan" data-paper="${MY_PLAN}">
    ${icon('bookmark', { size: 18 })}
    <span class="syl-ov-plan-text"><strong>My plan</strong><span>${esc(words)}</span></span>
    <span class="syl-ov-plan-go" aria-hidden="true">→</span>
  </button>`;
}

/** The progress strip under the title: for the stage on screen, or for My plan. */
function overviewStrip(ws, { onMyPlan, examId }) {
  if (onMyPlan) {
    const summary = ws.overview.summary;
    if (!summary.total) return '';
    return `<section class="syl-overview" aria-label="My plan progress">
      ${ring(summary)}
      <div class="syl-ov-main">
        <p class="syl-ov-title"><strong>${summary.done} of ${plural(summary.total, 'item')}</strong> done in My plan${summary.inProgress ? ` · ${summary.inProgress} in progress` : ''}</p>
        ${statusBar(summary)}
        ${legend(summary)}
      </div>
    </section>`;
  }
  const summary = ws.index.node.get(examId);
  if (!summary?.touched) {
    return `<section class="syl-overview syl-intro" aria-label="How progress tracking works">
      <div class="syl-ov-main">
        <p class="syl-ov-title"><strong>Track your preparation, topic by topic</strong></p>
        <p class="syl-intro-text">Tap the circle beside a topic to move it along:</p>
        <ol class="syl-steps">
          ${STATUS_ORDER.map((status) => `<li>${mark(status, { dot: false })}<span>${STATUS_TITLE[status]}</span></li>`).join('')}
        </ol>
        <p class="syl-intro-text">A section adds up its topics, and its panel can mark them all at once. Press ${icon('plus', { size: 13 })} beside any section or topic, or <strong>Add paper to My plan</strong>, to keep it in My plan.</p>
      </div>
      ${planShortcut(ws)}
    </section>`;
  }
  const unit = summary.planItems ? 'item' : 'topic';
  return `<section class="syl-overview" aria-label="${esc(`${EXAM_LABELS[examId]} progress`)}">
    ${ring(summary)}
    <div class="syl-ov-main">
      <p class="syl-ov-title"><strong>${summary.done} of ${plural(summary.total, unit)}</strong> done in ${esc(EXAM_LABELS[examId])}${summary.inProgress ? ` · ${summary.inProgress} in progress` : ''}</p>
      ${statusBar(summary)}
      ${legend(summary)}
    </div>
    ${planShortcut(ws)}
  </section>`;
}

function paperToolbar(ws, paper) {
  const summary = ws.index.node.get(paper.id);
  const children = paper.childIds.map((id) => ws.model.nodes.get(id)).filter(Boolean);
  const childKind = (KIND_LABEL[children[0]?.kind] || 'section').toLowerCase();
  const allLines = children.every((child) => !child.childIds.length) && !summary?.planItems;
  const size = allLines
    ? plural(children.length, childKind)
    : `${plural(children.length, childKind)} · ${plural(summary?.total || 0, summary?.planItems ? 'item' : 'topic')}`;
  const progress = summary?.touched ? ` · ${summary.done} done${summary.inProgress ? ` · ${summary.inProgress} in progress` : ''}` : '';
  const inPlan = isInPlan(ws.progressRows.get(paper.id));
  return `<div class="syl-toolbar">
      <div class="syl-toolbar-head">
        <h2 class="syl-toolbar-title"${langAttr(label(paper))}>${esc(label(paper))}</h2>
        <p class="syl-toolbar-sub">${esc(size + progress)}</p>
      </div>
      <span class="syl-toolbar-actions">
        ${
          inPlan
            ? `<button type="button" class="btn btn-sm syl-plan-pill on" data-plan-remove="${esc(paper.id)}" title="In My plan · click to remove">${icon('check', { size: 14 })} In My plan</button>`
            : `<button type="button" class="btn btn-sm syl-plan-pill" data-plan-add="${esc(paper.id)}">${icon('plus', { size: 14 })} Add paper to My plan</button>`
        }
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
  const rows = children.map((child) => treeNode(ws, child, 1, { filter })).join('') +
    planItemsFor(ws.plan, paper.id).map((row) => planTreeNode(ws, row, 1, { filter })).join('');
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

/** Apply the route (`#/syllabus/official/<id>`, `#/syllabus/plan/<id>`, or a legacy bare id). */
function applyRoute(ws, routeNodeId) {
  const { model, plan } = ws;
  viewState.appliedRoute = routeNodeId;
  // `#/syllabus/official/<id>` and `#/syllabus/plan/<id>` are the merged
  // spellings; a bare `<id>` is what `#/syllabus-analysis/<id>` links — the
  // PYQ chips, bookmarks and older notes — have always used.
  const isPlanRoute = routeNodeId.startsWith('plan/');
  const requested = isPlanRoute
    ? routeNodeId.slice('plan/'.length)
    : routeNodeId.startsWith('official/')
      ? routeNodeId.slice('official/'.length)
      : routeNodeId;
  const onMyPlan = viewState.paperId === MY_PLAN;
  const reveal = (node) => {
    [...ancestorsOf(model.nodes, node), node].forEach((ancestor) => {
      viewState.expanded.add(ancestor.id);
      viewState.collapsed.delete(ancestor.id);
    });
  };

  if (isPlanRoute && plan.byId.has(requested)) {
    const row = plan.byId.get(requested);
    viewState.selectedId = requested;
    viewState.selectedScope = 'plan';
    viewState.search = '';
    const host = hostNodeOf(ws, row);
    // Every item of the reader's own is in My plan, so an item opened from
    // there stays there; anywhere else it opens where the tree shows it.
    if (host) {
      if (!onMyPlan) {
        viewState.examId = host.examId;
        viewState.paperId = host.paperId;
      }
      reveal(host);
    } else {
      viewState.paperId = MY_PLAN;
    }
    // Open every plan ancestor so a deep-linked child is actually visible.
    let cursor = row;
    const seen = new Set();
    while (cursor?.parent_id && plan.byId.has(cursor.parent_id) && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      cursor = plan.byId.get(cursor.parent_id);
      viewState.collapsed.delete(planTarget(cursor.id));
    }
  } else if (!isPlanRoute && requested && model.nodes.has(requested)) {
    const node = model.nodes.get(requested);
    viewState.selectedId = requested;
    viewState.selectedScope = 'official';
    viewState.search = '';
    // A node opened from a My plan card stays in My plan.
    if (!(onMyPlan && ws.anchorOf(node))) {
      viewState.examId = node.examId;
      viewState.paperId = node.paperId;
    }
    ancestorsOf(model.nodes, node).forEach((ancestor) => {
      viewState.expanded.add(ancestor.id);
      viewState.collapsed.delete(ancestor.id);
    });
  } else {
    // No node in the route (the detail was closed), or one this build does
    // not know: either way nothing is selected.
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
      <p>Marking a heading marks every topic under it; a topic you mark on its own keeps its own status. Items badged <em>your item</em> are your own: they are stored apart from the official tree and never counted as syllabus text.</p>
      <button type="button" class="btn btn-quiet btn-sm" data-reset-progress${anyMarked ? '' : ' disabled'}>Reset official progress</button>
    </div>
  </details>`;
}

async function screen(ctx) {
  const ws = await loadWorkspace();
  const { model } = ws;
  if (!model.ok) {
    return `<h1>Syllabus</h1>
      ${notice(
        `The syllabus data could not be read from this device (${esc(model.error || 'unknown error')}). It ships with the app, so a reload should restore it.`,
        'bad',
      )}`;
  }

  const routeNodeId = (ctx?.params || []).join('/');
  if (routeNodeId !== viewState.appliedRoute) applyRoute(ws, routeNodeId);

  const papers = (model.nodes.get(viewState.examId)?.childIds || []).map((id) => model.nodes.get(id)).filter(Boolean);
  let onMyPlan = viewState.paperId === MY_PLAN;
  // An official item that left My plan while open there is shown in its paper.
  if (onMyPlan && viewState.selectedId && viewState.selectedScope === 'official') {
    const node = model.nodes.get(viewState.selectedId);
    if (node && !ws.anchorOf(node)) {
      viewState.examId = node.examId;
      viewState.paperId = node.paperId;
      onMyPlan = false;
    }
  }
  if (!onMyPlan && !papers.some((paper) => paper.id === viewState.paperId)) viewState.paperId = papers[0]?.id || null;
  const paper = onMyPlan ? null : model.nodes.get(viewState.paperId);
  const planEntries = ws.overview.entries.length + ws.plan.roots.length;

  return `<div class="syl">
    <header class="syl-head">
      <div class="syl-head-top">
        <div class="syl-head-text">
          <h1>Syllabus</h1>
          <p class="syl-lede">The commission's revised 2026 syllabus for Prelims and Mains, with your progress and your plan kept alongside it.</p>
        </div>
        <div class="syl-switch" role="tablist" aria-label="What to show">
          ${['prelims', 'mains']
            .map(
              (examId) =>
                `<button type="button" role="tab" aria-selected="${!onMyPlan && viewState.examId === examId}" tabindex="${!onMyPlan && viewState.examId === examId ? 0 : -1}" class="syl-switch-btn${
                  !onMyPlan && viewState.examId === examId ? ' on' : ''
                }" data-exam="${examId}">${esc(EXAM_LABELS[examId])}</button>`,
            )
            .join('')}
          <button type="button" role="tab" aria-selected="${onMyPlan}" tabindex="${onMyPlan ? 0 : -1}" class="syl-switch-btn syl-switch-plan${onMyPlan ? ' on' : ''}" data-paper="${MY_PLAN}">My plan${
            planEntries ? ` <span class="syl-rail-count">${planEntries}</span>` : ''
          }</button>
        </div>
      </div>
      ${overviewStrip(ws, { onMyPlan, examId: viewState.examId })}
      <label class="syl-search" for="sylSearch">
        ${icon('search', { size: 15 })}
        <span class="sr-only">${onMyPlan ? 'Search the whole syllabus and your own items' : `Search ${EXAM_LABELS[viewState.examId]} and your own items`}</span>
        <input type="search" id="sylSearch" value="${esc(viewState.search)}" placeholder="${
          onMyPlan ? 'Search the whole syllabus and your own items' : `Search ${EXAM_LABELS[viewState.examId]} topics, headings and your own items`
        }" autocomplete="off" />
        ${viewState.search ? `<button type="button" class="syl-clear" data-clear-search aria-label="Clear search">${icon('close', { size: 13 })}</button>` : ''}
      </label>
    </header>

    <div class="syl-layout">
      <nav class="syl-rail" aria-label="${esc(`${EXAM_LABELS[viewState.examId]} papers`)}">
        <p class="syl-rail-head">${esc(EXAM_LABELS[viewState.examId])} papers</p>
        <div class="syl-rail-papers">
          ${papers
            .map((candidate) => {
              const summary = ws.index.node.get(candidate.id);
              const on = !onMyPlan && candidate.id === viewState.paperId;
              return `<button type="button" class="syl-rail-item${on ? ' on' : ''}" data-paper="${esc(candidate.id)}"${on ? ' aria-current="true"' : ''}>
                <span class="syl-rail-label"${langAttr(label(candidate))}>${esc(label(candidate))}</span>
                <span class="syl-rail-meta">${
                  summary?.touched
                    ? `${statusBar(summary, { size: 'mini', decorative: true })}<span class="syl-rail-pct">${percent(summary)}%</span><span class="sr-only"> done</span>`
                    : `<span class="syl-rail-size">${esc(plural(summary?.total || 0, summary?.planItems ? 'item' : 'topic'))}</span>`
                }</span>
              </button>`;
            })
            .join('')}
        </div>
        ${aboutBlock(ws)}
      </nav>

      <section class="syl-body" aria-label="${esc(onMyPlan ? 'My plan' : label(paper) || 'Syllabus')}">
        ${
          viewState.search
            ? searchResults(ws, onMyPlan)
            : onMyPlan
              ? myPlanPanel(ws)
              : paper
                ? paperBody(ws, paper)
                : emptyState({ title: 'No papers', message: 'This stage has no papers in the source document.' })
        }
      </section>
    </div>
  </div>`;
}

/* -------------------------------------------------------------- dialogs ---- */

const PRIORITIES = ['high', 'medium', 'low'];

function priorityField(value) {
  return `<label class="field"><span class="label-text">Priority</span>
    <select id="sylPriority">${PRIORITIES.map(
      (priority) => `<option value="${priority}" ${value === priority ? 'selected' : ''}>${esc(priority)}</option>`,
    ).join('')}</select>
  </label>`;
}

const dateField = (value) =>
  `<label class="field"><span class="label-text">Target date (optional)</span><input type="date" id="sylTarget" value="${esc(value || '')}" /></label>`;

const notesField = (value) =>
  `<label class="field"><span class="label-text">Notes (optional)</span><textarea id="sylNotes" rows="3">${esc(value || '')}</textarea></label>`;

/**
 * A small form in a dialog. Its values are read from the dialog itself, at the
 * moment Save is pressed — before the dialog closes — so they never depend on
 * the dialog's markup outliving it. Enter in a single-line field saves.
 */
async function formDialog({ title, body, confirmLabel = 'Save', read, focus = null }) {
  let values = null;
  const choice = await openModal({
    title,
    body,
    actions: [
      { label: 'Cancel', value: 'cancel' },
      { label: confirmLabel, tone: 'btn-primary', value: 'ok' },
    ],
    onMount(modal) {
      const capture = () => {
        values = read(modal);
      };
      capture();
      // Capture phase: runs before the button's own handler closes the dialog.
      modal.addEventListener('click', (event) => {
        if (event.target.closest?.('[data-modal-action]')) capture();
      }, true);
      modal.addEventListener('input', capture);
      modal.addEventListener('change', capture);
      modal.querySelectorAll('input[type="text"], input[type="date"]').forEach((input) => {
        input.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          modal.querySelector('[data-value="ok"]')?.click();
        });
      });
      if (focus) modal.querySelector(focus)?.focus();
    },
  });
  return choice === 'ok' ? values : null;
}

const readPlanInputs = (modal) => ({
  priority: modal.querySelector('#sylPriority')?.value || 'medium',
  target_date: modal.querySelector('#sylTarget')?.value || null,
  notes: modal.querySelector('#sylNotes')?.value.trim() || null,
});

/** Create or edit an item of the user's own. */
async function askPlanItem({ title, row = null, confirmLabel = 'Save' }) {
  const values = await formDialog({
    title,
    confirmLabel,
    body: `
      <label class="field"><span class="label-text">Title</span><input type="text" id="sylTitle" value="${esc(row?.title || '')}" placeholder="For example: Polity notes, chapters 1–5" /></label>
      ${priorityField(row?.priority || 'medium')}
      ${dateField(row?.target_date)}
      ${notesField(row?.notes)}`,
    read: (modal) => ({ title: modal.querySelector('#sylTitle')?.value.trim() || '', ...readPlanInputs(modal) }),
    focus: '#sylTitle',
  });
  if (!values) return null;
  if (!values.title) {
    toast('An item needs a title.', 'warn');
    return null;
  }
  return values;
}

/**
 * Edit the planning fields of an official node, whose title belongs to the
 * commission and is therefore not editable.
 */
async function askPlanFields(entry, name) {
  return formDialog({
    title: 'Your plan for this item',
    body: `
      <p class="syl-dialog-name">${esc(shortLabel(name, 120))}</p>
      <p class="small muted">Your own scheduling. It is stored on this device and never changes the syllabus text.</p>
      ${dateField(entry?.target_date)}
      ${priorityField(entry?.priority || 'medium')}
      ${notesField(entry?.notes)}`,
    read: readPlanInputs,
    focus: '#sylTarget',
  });
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
 * before a render. What is above it can change height in between — the intro
 * card gives way to the shorter progress summary on the first mark and comes
 * back after the last one is cleared, a detail panel closes — and the control
 * that was used must not slide out from under the pointer, or a quick second
 * click lands on another topic.
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
   * Show another tab or paper. An item open in the address is left behind with
   * it — the address should say what is on screen — so the screen goes through
   * the router; otherwise it re-renders in place.
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

  root.querySelectorAll('[data-exam]').forEach((button) => {
    button.addEventListener('click', async () => {
      // Returning from My plan to the stage you were already on is a real
      // navigation, even though the stage itself has not changed.
      if (viewState.examId === button.dataset.exam && viewState.paperId !== MY_PLAN) return;
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
      const target = decodeTarget(button.dataset.open);
      rememberPlace(button, `.syl-title[data-open="${attr(button.dataset.open)}"]`);
      ctx.navigate(`syllabus/${target.scope}/${target.id}`);
    });
  });

  root.querySelectorAll('[data-close-detail]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = viewState.selectedScope === 'plan' ? planTarget(viewState.selectedId) : viewState.selectedId;
      const key = `.syl-title[data-open="${attr(selected)}"]`;
      rememberPlace(root.querySelector(key), key);
      ctx.navigate('syllabus');
    });
  });

  /* ---------------------------------------------------------- statuses -- */

  /**
   * Marking every topic under a heading replaces marks made one by one; ask
   * first when that would change any of them.
   */
  const confirmBulk = async (ws, target, status) => {
    const summary = target.scope === 'plan' ? ws.index.plan.get(target.id) : ws.index.official.get(target.id);
    if (!summary || summary.total < 2) return true;
    const differing = summary.touched - (status === 'not_started' ? 0 : summary.byStatus[status] || 0);
    if (differing <= 0) return true;
    const unit = target.scope === 'plan' ? 'sub-item' : 'topic';
    const clearing = status === 'not_started';
    return confirmDialog({
      title: clearing ? `Clear all ${plural(summary.total, unit)}?` : `Mark all ${plural(summary.total, unit)} as ${STATUS_TITLE[status].toLowerCase()}?`,
      message: clearing
        ? `${differing} of them ${differing === 1 ? 'is' : 'are'} marked now, and ${differing === 1 ? 'its mark' : 'their marks'} will be cleared. You can still mark any ${unit} on its own afterwards.`
        : `${differing} of them ${differing === 1 ? 'is' : 'are'} marked differently now and will change to ${STATUS_TITLE[status].toLowerCase()}. You can still mark any ${unit} on its own afterwards.`,
      confirmLabel: clearing ? 'Clear all' : 'Mark all',
    });
  };

  const changeStatus = async (target, status, { bulk = false, focusKey } = {}) => {
    if (statusBusy) return;
    statusBusy = true;
    try {
      const ws = await loadWorkspace();
      if (bulk && !(await confirmBulk(ws, target, status))) return;
      await setStatus(target, status, { model: ws.model.ok ? ws.model : null });
      await rerender(focusKey);
    } catch (error) {
      toast(error.message, 'bad');
    } finally {
      statusBusy = false;
    }
  };

  root.querySelectorAll('[data-set-status]').forEach((button) => {
    button.addEventListener('click', () =>
      changeStatus(decodeTarget(button.dataset.setStatus), button.dataset.status, {
        bulk: Boolean(button.dataset.bulk),
        focusKey: focusKeyOf(button, root),
      }),
    );
  });

  root.querySelectorAll('[data-cycle]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = NEXT_STATUS[normaliseStatus(button.dataset.current)];
      changeStatus(decodeTarget(button.dataset.cycle), next, { focusKey: `[data-cycle="${attr(button.dataset.cycle)}"]` });
    });
  });

  /* ----------------------------------------------------------- My plan -- */

  root.querySelectorAll('[data-plan-add]').forEach((button) => {
    button.addEventListener('click', async () => {
      const nodeId = button.dataset.planAdd;
      try {
        const model = await withModel();
        await addOfficialToPlan(nodeId, {}, { model });
        const node = model?.nodes.get(nodeId);
        toast(`Added to My plan: ${shortLabel(label(node), 60)}`, 'ok');
        await rerender(`[data-plan-remove="${attr(nodeId)}"]`);
      } catch (error) {
        toast(error.message, 'bad');
      }
    });
  });

  root.querySelectorAll('[data-plan-remove]').forEach((button) => {
    button.addEventListener('click', async () => {
      const nodeId = button.dataset.planRemove;
      try {
        const ws = await loadWorkspace();
        const node = ws.model.nodes.get(nodeId);
        if (hasPlanFields(ws.progressRows.get(nodeId))) {
          const confirmed = await confirmDialog({
            title: 'Remove from My plan?',
            message: `“${esc(shortLabel(label(node), 90))}” leaves My plan, with the target date, priority and notes you set for it. Its progress stays as you marked it.`,
            confirmLabel: 'Remove',
            danger: true,
          });
          if (!confirmed) return;
        }
        await removeOfficialFromPlan(nodeId, { model: ws.model });
        toast('Removed from My plan.', 'info');
        await rerender(`[data-plan-add="${attr(nodeId)}"]`);
      } catch (error) {
        toast(error.message, 'bad');
      }
    });
  });

  root.querySelectorAll('[data-edit-plan]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = decodeTarget(button.dataset.editPlan);
      try {
        const ws = await loadWorkspace();
        if (target.scope === 'plan') {
          const row = ws.plan.byId.get(target.id);
          if (!row) return;
          const data = await askPlanItem({ title: 'Edit this item', row });
          if (!data) return;
          await planner.updateSyllabusItem(target.id, data);
          toast('Item updated.', 'ok');
        } else {
          const entry = readEntry(target, { progressRows: ws.progressRows, plan: ws.plan }) || {};
          const values = await askPlanFields(entry, label(ws.model.nodes.get(target.id)));
          if (!values) return;
          await setPlanFields(target, values, { model: ws.model });
          toast('Plan updated.', 'ok');
        }
        await rerender();
      } catch (error) {
        toast(error.message, 'bad');
      }
    });
  });

  /* ------------------------------------------------------- plan: create --- */

  const addPlanItem = async ({ parentId = null, attachTo = null, title }) => {
    const data = await askPlanItem({ title, confirmLabel: 'Add' });
    if (!data) return null;
    try {
      // A sub-item starts where its parent is: under an item marked as done,
      // a new line would otherwise drag the parent back to "in progress".
      const plan = parentId ? await loadPlan({ model: await withModel() }) : null;
      const parentStatus = parentId ? normaliseStatus(plan?.byId.get(parentId)?.status) : 'not_started';
      const created = await planner.addSyllabusItem({
        parentId,
        title: data.title,
        priority: data.priority,
        target_date: data.target_date,
        notes: data.notes,
        source: 'user',
        attached_node_id: attachTo,
        status: parentStatus,
      });
      if (attachTo) {
        await attachPlanItem(created.id, attachTo);
        // A topic that gains its first item of yours starts folded; open it so
        // the item just added is there in the tree, not only counted as "+1".
        viewState.collapsed.delete(attachTo);
        viewState.expanded.add(attachTo);
      }
      if (parentId) viewState.collapsed.delete(planTarget(parentId));
      toast(`Added “${shortLabel(data.title, 50)}”.`, 'ok');
      await rerender();
      return created;
    } catch (error) {
      toast(error.message, 'bad');
      return null;
    }
  };

  root.querySelectorAll('[data-add-plan-here]').forEach((button) => {
    button.addEventListener('click', () => addPlanItem({ attachTo: button.dataset.addPlanHere, title: 'Add your own item here' }));
  });

  root.querySelectorAll('[data-add-plan-child]').forEach((button) => {
    button.addEventListener('click', () => addPlanItem({ parentId: button.dataset.addPlanChild, title: 'Add an item under this' }));
  });

  root.querySelector('#sylAddRoot')?.addEventListener('click', () => addPlanItem({ title: 'Add your own item' }));

  /* ------------------------------------------------------- plan: modify --- */

  root.querySelectorAll('[data-detach-plan]').forEach((button) => {
    button.addEventListener('click', async () => {
      await attachPlanItem(button.dataset.detachPlan, null);
      toast('It is now kept in My plan only.', 'info');
      viewState.paperId = MY_PLAN;
      await rerender();
    });
  });

  root.querySelectorAll('[data-delete-plan]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.deletePlan;
      const rows = await planner.listSyllabus();
      const row = rows.find((candidate) => candidate.id === id);
      const children = planner.descendants(rows, id).length;
      const confirmed = await confirmDialog({
        title: 'Delete this item?',
        message: `“${esc(row?.title || '')}”${children ? ` and its ${children} child item(s)` : ''} will be removed from your plan. The official syllabus, your question bank and your attempts are untouched.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!confirmed) return;
      await planner.deleteSyllabusItem(id, { withChildren: true });
      toast('Item deleted.', 'info');
      viewState.selectedId = null;
      viewState.appliedRoute = null;
      ctx.navigate('syllabus');
    });
  });

  /* ------------------------------------------------- plan: bulk structure - */

  const bootstrap = async () => {
    const confirmed = await confirmDialog({
      title: 'Create plan items from the question bank?',
      message: `This copies the <strong>subjects and topics that exist in your imported question bank</strong> (${state.subjects.length} subject(s)) into your plan as a starting structure. It is a suggestion built from your own data, not an official syllabus — the official tree is already on this screen. Items already present are left untouched.`,
      confirmLabel: 'Create items',
    });
    if (!confirmed) return;
    const result = await planner.bootstrapFromBank({});
    toast(
      result.created ? `${result.created} item(s) added to your plan.` : 'Nothing new to add — the structure already exists.',
      result.created ? 'ok' : 'info',
    );
    await rerender();
  };
  root.querySelector('#sylBootstrap')?.addEventListener('click', bootstrap);
  root.querySelector('#sylBootstrap2')?.addEventListener('click', bootstrap);

  root.querySelector('#sylExport')?.addEventListener('click', async () => {
    const payload = await planner.exportSyllabus();
    downloadJson(payload, `mymppsc-plan-${todayKey()}.json`);
    toast('Your own items were exported.', 'ok');
  });

  root.querySelector('#sylImport')?.addEventListener('click', () => root.querySelector('#sylFile')?.click());
  root.querySelector('#sylFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      const nodes = parsed.subjects || parsed.items || parsed;
      const result = await planner.importSyllabus(nodes, { replace: false, source: 'imported' });
      if (!result.added) {
        toast(`Nothing was imported. ${result.errors.join(' ')}`, 'warn');
      } else {
        toast(
          `${result.added} item(s) imported.${result.errors.length ? ` ${result.errors.length} problem(s): ${result.errors.slice(0, 2).join(' ')}` : ''}`,
          'ok',
        );
      }
      await rerender();
    } catch (error) {
      toast(`The file could not be read: ${error.message}`, 'bad');
    } finally {
      event.target.value = '';
    }
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
        'This clears every status you marked on the official Prelims and Mains syllabus. My plan keeps everything you added to it, with its target dates and notes, and your own items keep their progress. Your question bank, attempts, mistakes and revision schedule are not touched.',
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

  render(ctx) {
    return screen(ctx);
  },

  mount,

  positionScroll,
};
