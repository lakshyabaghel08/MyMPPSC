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
 *  * Progress, priority, target date and notes now work on *either* kind of
 *    item, through one vocabulary, and roll up into one figure.
 *
 * Progress stays optional: until something is marked, no status chrome appears
 * and the syllabus is fully readable without touching a control.
 */

import {
  esc,
  badge,
  toast,
  confirmDialog,
  openModal,
  notice,
  emptyState,
  progressBar,
  icon,
  langAttr,
} from '../components.js';
import { fmtDate, todayKey, readFileAsText, downloadJson } from '../../core/util.js';
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
  leavesOf,
  EXAM_LABELS,
} from '../../services/syllabus.js';
import {
  STATUSES,
  STATUS_ORDER,
  loadPlan,
  planItemsFor,
  combinedProgress,
  nodeProgress,
  normaliseStatus,
  readEntry,
  setStatus,
  setPlanFields,
  attachPlanItem,
  officialLabel,
} from '../../services/syllabus-hub.js';

/* ------------------------------------------------------------- view state -- */

/** The rail entry that holds plan items with no home in the official tree. */
const MY_PLAN = '__my_plan__';

const viewState = {
  examId: 'prelims',
  paperId: null,
  selectedId: null,
  selectedScope: 'official',
  expanded: new Set(),
  collapsed: new Set(),
  search: '',
  showAbout: false,
  appliedRoute: null,
};

const STATUS_TITLE = STATUSES;

/* ---------------------------------------------------------------- helpers -- */

/**
 * The official title of a node, or a structural name when the source leaves it
 * untitled (several Mains units are bare "इकाई-N"). A structural name is never
 * syllabus text: it only says which numbered unit the row is.
 */
const label = officialLabel;

/** True when the row's text is a structural name rather than official wording. */
const isStructural = (node) => Boolean(node) && !pickText(node.titles);

const dot = (status) =>
  status && status !== 'not_started'
    ? `<span class="syl-dot ${esc(status)}" role="img" aria-label="${esc(STATUS_TITLE[status])}" title="${esc(STATUS_TITLE[status])}"></span>`
    : '';

const statusOf = (progressRows, id) => normaliseStatus(progressRows.get(id)?.status);

/* ------------------------------------------------------------ plan items -- */

/** An item the user wrote is always marked as theirs, never as syllabus text. */
const planChip = () => badge('your item', 'info');

const planTarget = (id) => `plan:${id}`;

/** Decode the `scope:id` pair the markup carries for a selectable row. */
function decodeTarget(raw) {
  const value = String(raw || '');
  if (value.startsWith('plan:')) return { scope: 'plan', id: value.slice(5) };
  return { scope: 'official', id: value };
}

const priorityChip = (priority) => (priority === 'high' ? badge('high priority', 'warn') : '');

/** The one-line summary of a plan: target date and priority, when set. */
function planMeta(entry) {
  if (!entry) return '';
  const bits = [];
  if (entry.target_date) bits.push(`target ${esc(fmtDate(entry.target_date))}`);
  if (entry.priority && entry.priority !== 'medium') bits.push(`${esc(entry.priority)} priority`);
  if (!bits.length) return '';
  return `<span class="syl-plan-meta">${bits.join(' · ')}</span>`;
}

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

/**
 * The progress control. One vocabulary for both kinds of item: `target` is the
 * `scope:id` pair, so the same control drives an official node and a plan item.
 */
function statusControl(target, current, { compact = false } = {}) {
  const active = normaliseStatus(current);
  return `<div class="syl-status${compact ? ' compact' : ''}" role="group" aria-label="Progress for this item">
    ${STATUS_ORDER.map(
      (status) => `<button type="button" class="syl-status-btn${active === status ? ' on' : ''}" data-set-status="${esc(target)}" data-status="${status}" aria-pressed="${active === status}">
        <span class="syl-status-mark ${status}" aria-hidden="true"></span><span class="syl-status-text">${STATUS_TITLE[status]}</span>
      </button>`,
    ).join('')}
  </div>`;
}

/**
 * The planning block: the fields that used to exist only in the planner, now
 * available on any item. Values are the user's own and are labelled as such.
 */
function planBlock(target, entry, { title = 'Your plan' } = {}) {
  const bits = [];
  if (entry?.priority) bits.push(`Priority: ${esc(entry.priority)}`);
  if (entry?.target_date) bits.push(`Target date: ${esc(fmtDate(entry.target_date))}`);
  return `
    <section class="syl-block syl-plan-block">
      <div class="syl-block-head">
        <h4>${esc(title)}</h4>
        <span class="syl-tag" title="Your own planning, stored on this device">yours</span>
      </div>
      ${statusControl(target, entry?.status)}
      <div class="syl-plan-fields">
        ${bits.length ? `<p class="syl-plan-line">${bits.join(' · ')}</p>` : '<p class="syl-plan-line soft">No target date or priority set.</p>'}
        ${entry?.notes ? `<p class="syl-plan-notes">${esc(entry.notes)}</p>` : ''}
        <button type="button" class="btn btn-sm" data-edit-plan="${esc(target)}">${entry?.priority || entry?.target_date || entry?.notes ? 'Edit plan' : 'Add a target date or note'}</button>
      </div>
    </section>`;
}

/* ------------------------------------------------------- detail: derived --- */

const guideFor = (model, headingId) => model.guide.get(headingId) || null;

function studyBreakdown(model, headingId, { highlightTopicId = null } = {}) {
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
                  `<li class="syl-unit${unit.covers.includes(highlightTopicId) ? ' current' : ''}"><span class="syl-unit-title">${esc(unit.title)}</span>${
                    unit.note ? `<span class="syl-unit-note">${esc(unit.note)}</span>` : ''
                  }</li>`,
              )
              .join('')}</ul>`
          : ''
      }
    </section>`;
}

/* ------------------------------------------------------- detail: PYQ links -- */

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

/* --------------------------------------------------------------- detail ---- */

/**
 * Detail for an item the user wrote. It deliberately looks different from an
 * official node: no "Official wording" block exists for it, because none of its
 * text comes from the notification.
 */
function planDetail(model, plan, row, progressRows) {
  const target = planTarget(row.id);
  const entry = readEntry({ scope: 'plan', id: row.id }, { progressRows, plan });
  const parentRow = row.parent_id ? plan.byId.get(row.parent_id) : null;
  const host = plan.attachments.has(row.id) ? null : hostNodeOf(model, plan, row);
  const crumbs = [
    ...(host ? ancestorsOf(model.nodes, host).map((a) => label(a)).filter(Boolean) : []),
    ...(host ? [label(host)] : ['My plan']),
    ...(parentRow ? [parentRow.title] : []),
  ];
  const children = plan.childrenOf(row.id);

  return `<div class="syl-detail">
    <button type="button" class="syl-close" data-close-detail aria-label="Close">${icon('close', { size: 14 })}</button>
    <p class="syl-crumbs">${crumbs.map((crumb) => esc(crumb)).join('<span aria-hidden="true"> › </span>')}</p>
    <h3 class="syl-detail-title">${esc(row.title)} ${planChip()}</h3>
    <p class="syl-tag-note">Your own item. It is stored separately from the commission's syllabus and is never counted as official text.</p>
    ${
      host
        ? `<p class="syl-tag-note">Shown under <strong>${esc(label(host))}</strong>${
            plan.basisById.get(row.id) === 'pinned' ? ', where you placed it' : ', suggested from the curated question-bank mapping'
          }.</p>`
        : ''
    }
    ${planBlock(target, entry, { title: 'Status and plan' })}
    ${
      children.length
        ? `<section class="syl-block">
            <h4>Items under this one</h4>
            <ul class="syl-related">
              ${children
                .map(
                  (child) =>
                    `<li><button type="button" class="syl-other" data-open="${esc(planTarget(child.id))}">${esc(child.title)}</button>${planMeta(
                      readEntry({ scope: 'plan', id: child.id }, { progressRows, plan }),
                    )}</li>`,
                )
                .join('')}
            </ul>
          </section>`
        : ''
    }
    <section class="syl-block">
      <h4>Manage</h4>
      <div class="syl-plan-actions">
        <button type="button" class="btn btn-sm" data-add-plan-child="${esc(row.id)}">Add an item under this</button>
        <button type="button" class="btn btn-sm" data-rename-plan="${esc(row.id)}">Rename</button>
        ${host && !row.parent_id ? `<button type="button" class="btn btn-sm btn-quiet" data-detach-plan="${esc(row.id)}">Move to My plan</button>` : ''}
        <button type="button" class="btn btn-sm btn-quiet" data-delete-plan="${esc(row.id)}">Delete</button>
      </div>
    </section>
  </div>`;
}

/** The official node a plan item is displayed under, if any. */
function hostNodeOf(model, plan, row) {
  let cursor = row;
  while (cursor && cursor.parent_id && plan.byId.has(cursor.parent_id)) cursor = plan.byId.get(cursor.parent_id);
  if (!cursor) return null;
  for (const [nodeId, roots] of plan.attachments) {
    if (roots.some((candidate) => candidate.id === cursor.id)) return model.nodes.get(nodeId) || null;
  }
  return null;
}

/** The plan items attached to one official node, rendered inside its detail. */
function attachedPlanBlock(model, plan, nodeId, progressRows) {
  const items = planItemsFor(plan, nodeId);
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
                  const entry = readEntry({ scope: 'plan', id: row.id }, { progressRows, plan });
                  return `<li><button type="button" class="syl-other" data-open="${esc(planTarget(row.id))}">${esc(row.title)}</button>${dot(
                    entry.status,
                  )}${priorityChip(entry.priority)}${planMeta(entry)}</li>`;
                })
                .join('')}
            </ul>`
          : '<p class="syl-tag-note">Nothing of your own here yet.</p>'
      }
      <button type="button" class="btn btn-sm" data-add-plan-here="${esc(nodeId)}">Add an item here</button>
    </section>`;
}

function detailPanel(model, node, progressRows, plan) {
  const crumbs = ancestorsOf(model.nodes, node).map((ancestor) => label(ancestor)).filter(Boolean);
  const entry = readEntry({ scope: 'official', id: node.id }, { progressRows, plan });
  const current = entry.status;
  const progress = nodeProgress(model, node, progressRows, plan);
  const head = `
    <button type="button" class="syl-close" data-close-detail aria-label="Close">${icon('close', { size: 14 })}</button>
    <p class="syl-crumbs">${crumbs.map((crumb) => esc(crumb)).join('<span aria-hidden="true"> › </span>')}</p>
    <h3 class="syl-detail-title"${langAttr(isStructural(node) ? '' : label(node))}>${esc(label(node))}</h3>
    ${
      isStructural(node)
        ? '<p class="syl-tag-note">The notification lists this unit without a title of its own; its lines are below.</p>'
        : ''
    }`;

  if (node.kind === 'topic') {
    const heading = model.nodes.get(node.parentId);
    const units = heading ? (guideFor(model, heading.id)?.units || []).filter((unit) => unit.covers.includes(node.id)) : [];
    return `<div class="syl-detail">
      ${head}
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
      ${planBlock(node.id, entry)}
      ${attachedPlanBlock(model, plan, node.id, progressRows)}
    </div>`;
  }

  const children = node.childIds.map((id) => model.nodes.get(id)).filter(Boolean);
  const grouped = children.filter((child) => child.kind === 'topic');
  const nested = children.filter((child) => child.kind !== 'topic');
  const pages = sourceRefs(model, node);

  return `<div class="syl-detail">
    ${head}
    ${node.scope ? `<p class="syl-scope"${langAttr(node.scope, 'hi')}>${esc(node.scope)}</p>` : ''}
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
    ${planBlock(node.id, entry)}
    ${
      progress.total && progress.done + progress.inProgress > 0
        ? `<p class="syl-tag-note">${progress.done} of ${progress.total} item${progress.total === 1 ? '' : 's'} completed or revised here${
            progress.inProgress ? `, ${progress.inProgress} in progress` : ''
          }${progress.planItems ? ` (including ${progress.planItems} of your own)` : ''}.</p>`
        : ''
    }
    ${attachedPlanBlock(model, plan, node.id, progressRows)}
    ${
      pages.length
        ? `<p class="syl-source">Official text from page${pages.length > 1 ? 's' : ''} ${pages.join(', ')} of the source notification.</p>`
        : ''
    }
  </div>`;
}

/* ----------------------------------------------------------------- tree ---- */

function isOpen(node, depth) {
  if (viewState.collapsed.has(node.id)) return false;
  if (viewState.expanded.has(node.id)) return true;
  // The first levels start open so the shape of a paper is visible at once.
  return depth < (node.kind === 'paper' ? 1 : 2);
}

/**
 * A row for an item the user wrote, rendered inside the official tree but
 * visibly theirs: a "your item" chip, and never the numbering or language
 * attributes that mark official wording.
 */
function planTreeNode(model, plan, row, progressRows, depth) {
  const children = plan.childrenOf(row.id);
  const open = children.length > 0 && !viewState.collapsed.has(planTarget(row.id));
  const selected = viewState.selectedScope === 'plan' && viewState.selectedId === row.id;
  const entry = readEntry({ scope: 'plan', id: row.id }, { progressRows, plan });

  return `<li class="syl-node syl-node-plan">
    <div class="syl-row${selected ? ' selected' : ''}">
      ${
        children.length
          ? `<button type="button" class="syl-caret${open ? ' open' : ''}" data-toggle="${esc(planTarget(row.id))}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(row.title)}"></button>`
          : '<span class="syl-caret spacer" aria-hidden="true"></span>'
      }
      <button type="button" class="syl-title syl-title-plan${children.length ? '' : ' leaf'}" data-open="${esc(planTarget(row.id))}" aria-current="${selected}">
        <span class="syl-text">${esc(row.title)}</span>
        ${planChip()}
        ${dot(entry.status)}
        ${priorityChip(entry.priority)}
      </button>
    </div>
    ${open ? `<ul class="syl-children">${children.map((child) => planTreeNode(model, plan, child, progressRows, depth + 1)).join('')}</ul>` : ''}
    ${selected ? `<div class="syl-detail-slot">${planDetail(model, plan, row, progressRows)}</div>` : ''}
  </li>`;
}

function treeNode(model, node, progressRows, depth, plan) {
  const children = node.childIds.map((id) => model.nodes.get(id)).filter(Boolean);
  const planItems = planItemsFor(plan, node.id);
  const isLeaf = children.length === 0 && planItems.length === 0;
  const hasChildren = children.length > 0 || planItems.length > 0;
  const open = hasChildren && isOpen(node, depth);
  const status = statusOf(progressRows, node.id);
  const selected = viewState.selectedScope === 'official' && node.id === viewState.selectedId;

  return `<li class="syl-node">
    <div class="syl-row${selected ? ' selected' : ''}">
      ${
        hasChildren
          ? `<button type="button" class="syl-caret${open ? ' open' : ''}" data-toggle="${esc(node.id)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(label(node))}"></button>`
          : '<span class="syl-caret spacer" aria-hidden="true"></span>'
      }
      <button type="button" class="syl-title${isLeaf ? ' leaf' : ''}${node.kind === 'topic' ? ' topic' : ''}" data-open="${esc(node.id)}" aria-current="${selected}">
        ${node.marker ? `<span class="syl-marker">(${esc(node.marker)})</span>` : ''}
        ${
          node.number && !node.marker && !isStructural(node)
            ? `<span class="syl-num">${esc(String(node.number))}.</span>`
            : ''
        }
        <span class="syl-text${isStructural(node) ? ' syl-structural' : ''}"${langAttr(isStructural(node) ? '' : label(node))}>${esc(label(node))}</span>
        ${isLeaf ? dot(status) : ''}
        ${planItems.length ? `<span class="syl-plan-count" title="${planItems.length} item(s) of your own here">+${planItems.length}</span>` : ''}
      </button>
      ${
        hasChildren && !open
          ? `<span class="syl-more" aria-hidden="true">${leavesOf(model.nodes, node).length}</span>`
          : ''
      }
    </div>
    ${
      open
        ? `<ul class="syl-children">${children
            .map((child) => treeNode(model, child, progressRows, depth + 1, plan))
            .join('')}${planItems.map((row) => planTreeNode(model, plan, row, progressRows, depth + 1)).join('')}</ul>`
        : ''
    }
    ${selected ? `<div class="syl-detail-slot">${detailPanel(model, node, progressRows, plan)}</div>` : ''}
  </li>`;
}

/* --------------------------------------------------------------- search ---- */

function searchResults(model, progressRows) {
  const results = searchSyllabus(model, viewState.search, { examId: viewState.examId, limit: 40 });
  if (!results.length) {
    return emptyState({
      title: 'No match',
      message: `Nothing in ${EXAM_LABELS[viewState.examId]} matches “${viewState.search}”.`,
    });
  }
  return `<div class="syl-results">
    <ul class="syl-result-list">
      ${results
        .map(
          (result) => `<li>
        <button type="button" class="syl-result" data-open="${esc(result.id)}">
          <span class="syl-result-text"${langAttr(result.label)}>${esc(result.label)}</span>
          <span class="syl-result-path">${result.path.map((step) => esc(step)).join(' › ')}</span>
          ${dot(statusOf(progressRows, result.id))}
        </button>
      </li>`,
        )
        .join('')}
    </ul>
  </div>`;
}

/* --------------------------------------------------------------- render ---- */

/** The *My plan* branch: the user's items with no home in the official tree. */
function myPlanPanel(model, plan, progressRows) {
  return `<div class="syl-toolbar">
      <h2 class="syl-toolbar-title">My plan</h2>
      <span class="syl-toolbar-actions">
        <button type="button" class="btn btn-sm btn-primary" id="sylAddRoot">Add an item</button>
        <button type="button" class="btn btn-sm" id="sylBootstrap">Suggest from question bank</button>
        <button type="button" class="btn btn-sm" id="sylImport">Import JSON</button>
        <button type="button" class="btn btn-sm btn-quiet" id="sylExport">Export</button>
        <input type="file" id="sylFile" accept="application/json,.json" hidden />
      </span>
    </div>
    <p class="syl-tag-note">Items you wrote that do not sit under a heading of the official syllabus. Anything whose subject and topic the curated question-bank mapping recognises is shown in the paper itself instead, under the heading it belongs to.</p>
    ${
      plan.unattached.length
        ? `<ul class="syl-tree">${plan.unattached.map((row) => planTreeNode(model, plan, row, progressRows, 0)).join('')}</ul>`
        : emptyState({
            title: 'Nothing parked here',
            message: plan.rows.length
              ? 'Every item you have written is shown under a heading of the official syllabus. Open a heading to see it.'
              : 'Add study items of your own, generate a starting point from the subjects and topics already classified in your question bank, or import a structure you made yourself.',
            action: plan.rows.length ? '' : '<button class="btn btn-primary" type="button" id="sylBootstrap2">Suggest from question bank</button>',
          })
    }`;
}

async function screen(ctx) {
  const model = await loadSyllabus();
  if (!model.ok) {
    return `<h1>Syllabus</h1>
      ${notice(
        `The syllabus data could not be read from this device (${esc(model.error || 'unknown error')}). It ships with the app, so a reload should restore it.`,
        'bad',
      )}`;
  }

  const [progressRows, plan] = await Promise.all([loadProgress(), loadPlan({ model })]);

  const routeNodeId = (ctx?.params || []).join('/');
  if (routeNodeId !== viewState.appliedRoute) {
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

    if (isPlanRoute && plan.byId.has(requested)) {
      const row = plan.byId.get(requested);
      viewState.selectedId = requested;
      viewState.selectedScope = 'plan';
      viewState.search = '';
      const host = hostNodeOf(model, plan, row);
      if (host) {
        viewState.examId = host.examId;
        viewState.paperId = host.paperId;
        [...ancestorsOf(model.nodes, host), host].forEach((ancestor) => {
          viewState.expanded.add(ancestor.id);
          viewState.collapsed.delete(ancestor.id);
        });
      } else {
        viewState.paperId = MY_PLAN;
      }
      // Open every plan ancestor so a deep-linked child is actually visible.
      let cursor = row;
      while (cursor?.parent_id && plan.byId.has(cursor.parent_id)) {
        cursor = plan.byId.get(cursor.parent_id);
        viewState.collapsed.delete(planTarget(cursor.id));
      }
    } else if (!isPlanRoute && requested && model.nodes.has(requested)) {
      const node = model.nodes.get(requested);
      viewState.selectedId = requested;
      viewState.selectedScope = 'official';
      viewState.examId = node.examId;
      viewState.paperId = node.paperId;
      viewState.search = '';
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

  const papers = (model.nodes.get(viewState.examId)?.childIds || []).map((id) => model.nodes.get(id)).filter(Boolean);
  const onMyPlan = viewState.paperId === MY_PLAN;
  if (!onMyPlan && !papers.some((paper) => paper.id === viewState.paperId)) viewState.paperId = papers[0]?.id || null;
  const paper = onMyPlan ? null : model.nodes.get(viewState.paperId);

  const overall = combinedProgress(model, progressRows, plan);

  return `<div class="syl">
    <header class="syl-head">
      <div class="syl-head-top">
        <h1>Syllabus</h1>
        <div class="syl-switch" role="tablist" aria-label="What to show">
          ${['prelims', 'mains']
            .map(
              (examId) =>
                `<button type="button" role="tab" aria-selected="${!onMyPlan && viewState.examId === examId}" class="syl-switch-btn${
                  !onMyPlan && viewState.examId === examId ? ' on' : ''
                }" data-exam="${examId}">${esc(EXAM_LABELS[examId])}</button>`,
            )
            .join('')}
          <button type="button" role="tab" aria-selected="${onMyPlan}" class="syl-switch-btn syl-switch-plan${
            onMyPlan ? ' on' : ''
          }" data-paper="${MY_PLAN}">My plan${
            plan.unattached.length ? ` <span class="syl-rail-count">${plan.unattached.length}</span>` : ''
          }</button>
        </div>
      </div>
      <p class="syl-lede">The commission's revised 2026 syllabus, with your own plan kept alongside it. ${
        overall.touched
          ? `${overall.done} of ${overall.total} item${overall.total === 1 ? '' : 's'} marked done — ${overall.official.done} official, ${overall.plan.done} of your own.`
          : 'Mark progress on any line to start tracking it; nothing is marked until you do.'
      }</p>
      <label class="syl-search" for="sylSearch">
        ${icon('search', { size: 15 })}
        <span class="sr-only">Search the ${EXAM_LABELS[viewState.examId]} syllabus</span>
        <input type="search" id="sylSearch" value="${esc(viewState.search)}" placeholder="Search topics, headings and study units" autocomplete="off" />
        ${viewState.search ? `<button type="button" class="syl-clear" data-clear-search aria-label="Clear search">${icon('close', { size: 13 })}</button>` : ''}
      </label>
    </header>

    <div class="syl-layout">
      <nav class="syl-rail" aria-label="Papers">
        <div class="syl-rail-papers">
          ${papers
            .map((candidate) => {
              const summary = nodeProgress(model, candidate, progressRows, plan);
              return `<button type="button" class="syl-rail-item${candidate.id === viewState.paperId ? ' on' : ''}" data-paper="${esc(candidate.id)}">
                <span class="syl-rail-label"${langAttr(label(candidate))}>${esc(label(candidate))}</span>
                ${summary.done + summary.inProgress > 0 ? progressBar(summary.completion) : ''}
              </button>`;
            })
            .join('')}
        </div>
        <details class="syl-about"${viewState.showAbout ? ' open' : ''}>
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
            <p>Items badged <em>your item</em> are your own. They are stored apart from the official tree, shown under the heading the curated question-bank mapping associates them with, and never counted as syllabus text.</p>
            <button type="button" class="btn btn-quiet btn-sm" data-reset-progress${overall.official.touched ? '' : ' disabled'}>Reset official progress</button>
          </div>
        </details>
      </nav>

      <section class="syl-body">
        ${
          viewState.search
            ? searchResults(model, progressRows)
            : onMyPlan
              ? myPlanPanel(model, plan, progressRows)
              : paper
                ? `<div class="syl-toolbar">
                    <h2 class="syl-toolbar-title"${langAttr(label(paper))}>${esc(label(paper))}</h2>
                    <span class="syl-toolbar-actions">
                      <button type="button" class="btn btn-quiet btn-sm" data-expand-all>Expand all</button>
                      <button type="button" class="btn btn-quiet btn-sm" data-collapse-all>Collapse all</button>
                    </span>
                  </div>
                  <ul class="syl-tree">${treeNode(model, paper, progressRows, 0, plan)}</ul>`
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
  `<label class="field"><span class="label-text">Notes (optional)</span><textarea id="sylNotes" rows="2">${esc(value || '')}</textarea></label>`;

const readPlanInputs = () => ({
  priority: document.getElementById('sylPriority')?.value || 'medium',
  target_date: document.getElementById('sylTarget')?.value || null,
  notes: document.getElementById('sylNotes')?.value || null,
});

/** Create or rename an item of the user's own. */
async function askPlanItem({ title, row = null }) {
  const choice = await openModal({
    title,
    body: `
      <label class="field"><span class="label-text">Title</span><input type="text" id="sylTitle" value="${esc(row?.title || '')}" /></label>
      ${priorityField(row?.priority || 'medium')}
      ${dateField(row?.target_date)}
      ${notesField(row?.notes)}`,
    actions: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Save', tone: 'btn-primary', value: 'ok' },
    ],
  });
  if (choice !== 'ok') return null;
  const value = document.getElementById('sylTitle')?.value.trim();
  if (!value) {
    toast('An item needs a title.', 'warn');
    return null;
  }
  return { title: value, ...readPlanInputs() };
}

/**
 * Edit the planning fields of an item. Used for official nodes too, where the
 * title belongs to the commission and is therefore not editable.
 */
async function askPlanFields(entry) {
  const choice = await openModal({
    title: 'Your plan for this item',
    body: `
      <p class="small muted">Your own scheduling. It is stored on this device and never changes the syllabus text.</p>
      ${priorityField(entry?.priority || 'medium')}
      ${dateField(entry?.target_date)}
      ${notesField(entry?.notes)}`,
    actions: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Save', tone: 'btn-primary', value: 'ok' },
    ],
  });
  if (choice !== 'ok') return null;
  return readPlanInputs();
}

/* ---------------------------------------------------------------- mount ---- */

async function mount(ctx, root) {
  const rerender = async () => {
    root.innerHTML = await screen(ctx);
    await mount(ctx, root);
  };

  root.querySelectorAll('[data-exam]').forEach((button) => {
    button.addEventListener('click', async () => {
      // Returning from My plan to the stage you were already on is a real
      // navigation, even though the stage itself has not changed.
      if (viewState.examId === button.dataset.exam && viewState.paperId !== MY_PLAN) return;
      viewState.examId = button.dataset.exam;
      viewState.paperId = null;
      viewState.selectedId = null;
      viewState.appliedRoute = null;
      viewState.expanded.clear();
      viewState.collapsed.clear();
      viewState.search = '';
      await rerender();
    });
  });

  root.querySelectorAll('[data-paper]').forEach((button) => {
    button.addEventListener('click', async () => {
      viewState.paperId = button.dataset.paper;
      viewState.selectedId = null;
      viewState.appliedRoute = null;
      viewState.collapsed.clear();
      viewState.search = '';
      await rerender();
    });
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

  // Opening a node is a hash change, so back and forward move between the tree
  // and the topic that was opened, and the expansion state is not lost.
  root.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = decodeTarget(button.dataset.open);
      ctx.navigate(`syllabus/${target.scope}/${target.id}`);
    });
  });

  root.querySelectorAll('[data-close-detail]').forEach((button) => {
    button.addEventListener('click', () => ctx.navigate('syllabus'));
  });

  root.querySelectorAll('[data-set-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const model = await loadSyllabus();
        await setStatus(decodeTarget(button.dataset.setStatus), button.dataset.status, {
          model: model.ok ? model : null,
        });
        await rerender();
      } catch (error) {
        toast(error.message, 'bad');
      }
    });
  });

  /* ------------------------------------------------- the planning fields -- */

  root.querySelectorAll('[data-edit-plan]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = decodeTarget(button.dataset.editPlan);
      const model = await loadSyllabus();
      const plan = await loadPlan({ model });
      const progressRows = await loadProgress();
      const entry = readEntry(target, { progressRows, plan }) || {};
      const values = await askPlanFields(entry);
      if (!values) return;
      try {
        await setPlanFields(target, values, { model: model.ok ? model : null });
        toast('Plan updated.', 'ok');
        await rerender();
      } catch (error) {
        toast(error.message, 'bad');
      }
    });
  });

  /* ------------------------------------------------------- plan: create --- */

  const addPlanItem = async ({ parentId = null, attachTo = null, title }) => {
    const data = await askPlanItem({ title });
    if (!data) return null;
    const created = await planner.addSyllabusItem({
      parentId,
      title: data.title,
      priority: data.priority,
      target_date: data.target_date,
      notes: data.notes,
      source: 'user',
      attached_node_id: attachTo,
    });
    if (attachTo) await attachPlanItem(created.id, attachTo);
    toast('Item added to your plan.', 'ok');
    await rerender();
    return created;
  };

  root.querySelectorAll('[data-add-plan-here]').forEach((button) => {
    button.addEventListener('click', () => addPlanItem({ attachTo: button.dataset.addPlanHere, title: 'Add an item here' }));
  });

  root.querySelectorAll('[data-add-plan-child]').forEach((button) => {
    button.addEventListener('click', () => addPlanItem({ parentId: button.dataset.addPlanChild, title: 'Add an item under this' }));
  });

  document.getElementById('sylAddRoot')?.addEventListener('click', () => addPlanItem({ title: 'Add an item to your plan' }));

  /* ------------------------------------------------------- plan: modify --- */

  root.querySelectorAll('[data-rename-plan]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.renamePlan;
      const plan = await loadPlan({ model: await loadSyllabus() });
      const row = plan.byId.get(id);
      if (!row) return;
      const data = await askPlanItem({ title: 'Edit this item', row });
      if (!data) return;
      await planner.updateSyllabusItem(id, data);
      toast('Item updated.', 'ok');
      await rerender();
    });
  });

  root.querySelectorAll('[data-detach-plan]').forEach((button) => {
    button.addEventListener('click', async () => {
      await attachPlanItem(button.dataset.detachPlan, null);
      toast('Moved to My plan.', 'info');
      viewState.paperId = MY_PLAN;
      viewState.selectedId = null;
      viewState.appliedRoute = null;
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
      await rerender();
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
  document.getElementById('sylBootstrap')?.addEventListener('click', bootstrap);
  document.getElementById('sylBootstrap2')?.addEventListener('click', bootstrap);

  document.getElementById('sylExport')?.addEventListener('click', async () => {
    const payload = await planner.exportSyllabus();
    downloadJson(payload, `mymppsc-plan-${todayKey()}.json`);
    toast('Your plan was exported.', 'ok');
  });

  document.getElementById('sylImport')?.addEventListener('click', () => document.getElementById('sylFile')?.click());
  document.getElementById('sylFile')?.addEventListener('change', async (event) => {
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

  root.querySelector('[data-expand-all]')?.addEventListener('click', async () => {
    const model = await loadSyllabus();
    if (model.ok && viewState.paperId) {
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
    const model = await loadSyllabus();
    if (model.ok && viewState.paperId) {
      const prefix = `${viewState.paperId}/`;
      viewState.expanded.clear();
      model.nodes.forEach((node) => {
        if (node.id.startsWith(prefix)) viewState.collapsed.add(node.id);
      });
    }
    viewState.selectedId = null;
    viewState.appliedRoute = null;
    await rerender();
  });

  root.querySelector('[data-clear-search]')?.addEventListener('click', async () => {
    viewState.search = '';
    await rerender();
  });

  const about = root.querySelector('.syl-about');
  about?.addEventListener('toggle', () => {
    viewState.showAbout = about.open;
  });

  root.querySelector('[data-reset-progress]')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Reset syllabus progress?',
      message:
        'This clears every status marked in Syllabus Analysis. Your question bank, attempts, mistakes and revision schedule are not touched.',
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!confirmed) return;
    await resetProgress();
    toast('Syllabus progress cleared.', 'info');
    viewState.selectedId = null;
    viewState.appliedRoute = null;
    await rerender();
  });

  const searchInput = root.querySelector('#sylSearch');
  if (searchInput) {
    let timer = null;
    searchInput.addEventListener('input', (event) => {
      viewState.search = event.target.value;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await rerender();
        const refreshed = document.getElementById('sylSearch');
        if (refreshed) {
          refreshed.focus();
          const end = refreshed.value.length;
          try {
            refreshed.setSelectionRange(end, end);
          } catch {
            /* some environments refuse a selection range on search inputs */
          }
        }
      }, 200);
    });
    if (viewState.search) {
      searchInput.focus();
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
};
