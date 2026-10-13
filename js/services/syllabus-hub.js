/**
 * syllabus-hub.js — one syllabus out of the two that were stored separately.
 *
 * Before the merge the app had two syllabus screens over two stores:
 *
 *   `syllabus`           the planner's tree — whatever the user typed or imported
 *   `syllabus_progress`  progress through the official MPPSC 2026 syllabus
 *
 * Nothing read both. Marking a real notification topic "completed" left the
 * dashboard at 0%, and the two stores even spelled the same study states
 * differently. This module is the single place that reads them together:
 *
 *  * one status vocabulary, with the legacy planner value mapped on read;
 *  * one roll-up, so the dashboard, study priorities and the Syllabus section
 *    quote the same number;
 *  * one write API, which routes a change to whichever store owns the item.
 *
 * The two stores stay separate on disk on purpose. The official tree ships as
 * data and is never written to; the planner tree is the user's own and must not
 * acquire commission content behind their back. Merging the rows would blur
 * exactly the line the rest of the app is careful about — so what is merged is
 * the *reading* of them, not the records.
 */

import * as planner from './planner.js';
import {
  loadSyllabus,
  loadProgress,
  setProgressStatus,
  setProgressPlan,
  progressSummary,
  leavesOf,
  pickText,
} from './syllabus.js';

/* ------------------------------------------------------------- statuses -- */

/**
 * The merged vocabulary. This is the official module's ordering, in which
 * `revised` comes *after* `completed` and counts as done.
 */
export const STATUSES = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  revised: 'Revised',
};

export const STATUS_ORDER = ['not_started', 'in_progress', 'completed', 'revised'];

/** The single source of truth for "this counts as done" across both stores. */
export const DONE_STATUSES = new Set(['completed', 'revised']);

/**
 * The planner's `revising` sat *before* `completed` in its own ordering, so it
 * never asserted that an item was finished. It therefore maps to `in_progress`
 * and not to `revised`: reading it as a done state would mark items complete
 * that the user never marked complete, and this app would rather under-claim.
 */
export const LEGACY_STATUS_ALIASES = { revising: 'in_progress' };

export function normaliseStatus(raw) {
  const value = String(raw || 'not_started');
  const mapped = LEGACY_STATUS_ALIASES[value] || value;
  return mapped in STATUSES ? mapped : 'not_started';
}

/** Weight used for partial completion. Only a done status reaches 1. */
export function statusScore(status) {
  return { not_started: 0, in_progress: 0.4, completed: 1, revised: 1 }[normaliseStatus(status)] ?? 0;
}

export const isDone = (status) => DONE_STATUSES.has(normaliseStatus(status));

/* ----------------------------------------------------------- attachment -- */

/**
 * Where a planner item belongs in the official tree.
 *
 * `attach_mode` is `'auto'` by default, meaning "use the curated mapping if it
 * knows this subject and topic". `'manual'` means the user decided, and
 * `attached_node_id` is then taken literally — `null` included, which parks the
 * item in *My plan*.
 */
export const ATTACH_AUTO = 'auto';
export const ATTACH_MANUAL = 'manual';

/**
 * Reverse the curated `pyq-links.json` mapping into lookups from the question
 * bank's own vocabulary to official syllabus nodes.
 *
 * That file is the only trustworthy bridge between the two vocabularies in this
 * repository: it was curated against the bank's taxonomy, so it cannot invent a
 * correspondence the way fuzzy title matching would. Anything it does not cover
 * simply has no suggestion, which is the honest outcome.
 */
export function buildAttachmentIndex(model) {
  const byTopic = new Map();
  const subjectHits = new Map();
  if (!model?.pyqLinks) return { byTopic, bySubject: new Map() };

  for (const [nodeId, entries] of Object.entries(model.pyqLinks)) {
    if (!model.nodes?.has(nodeId) || !Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry?.subject) continue;
      if (entry.topic) {
        const key = topicKey(entry.subject, entry.topic);
        if (!byTopic.has(key)) byTopic.set(key, nodeId);
      }
      const bucket = subjectHits.get(entry.subject) || new Map();
      bucket.set(nodeId, (bucket.get(nodeId) || 0) + 1);
      subjectHits.set(entry.subject, bucket);
    }
  }

  // A subject-level item goes to whichever heading the mapping associates with
  // that subject most often — the heading that actually is that subject.
  const bySubject = new Map();
  for (const [subject, bucket] of subjectHits) {
    let best = null;
    for (const [nodeId, hits] of bucket) {
      if (!best || hits > best.hits) best = { nodeId, hits };
    }
    if (best) bySubject.set(subject, best.nodeId);
  }
  return { byTopic, bySubject };
}

export const topicKey = (subject, topic) => `${subject || ''}||${topic || ''}`;

/**
 * The official node a planner item should appear under, with the reason.
 * Returns null when it should stay in *My plan*.
 */
export function suggestAttachment(model, row, index) {
  if (!row) return null;
  if (row.attach_mode === ATTACH_MANUAL) {
    if (row.attached_node_id && model?.nodes?.has(row.attached_node_id)) {
      return { nodeId: row.attached_node_id, basis: 'pinned' };
    }
    return null;
  }
  // A pin written before `attach_mode` existed is still a pin.
  if (row.attached_node_id && model?.nodes?.has(row.attached_node_id)) {
    return { nodeId: row.attached_node_id, basis: 'pinned' };
  }
  if (!index) return null;
  if (row.subject && row.topic) {
    const hit = index.byTopic.get(topicKey(row.subject, row.topic));
    if (hit) return { nodeId: hit, basis: 'mapping' };
  }
  if (row.subject && !row.topic) {
    const hit = index.bySubject.get(row.subject);
    if (hit) return { nodeId: hit, basis: 'subject' };
  }
  return null;
}

/* ---------------------------------------------------------------- plan ---- */

/**
 * Load the planner tree and resolve where each root item belongs.
 *
 * Attachment is resolved per *root* item and the whole subtree travels with it,
 * so the user's own hierarchy is never cut up and an item can never appear
 * twice in the tree.
 */
export async function loadPlan({ model = null } = {}) {
  const rows = await planner.listSyllabus();
  const index = model?.ok ? buildAttachmentIndex(model) : null;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const childrenByParent = new Map();
  for (const row of rows) {
    const key = row.parent_id && byId.has(row.parent_id) ? row.parent_id : '__root__';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(row);
  }

  const roots = childrenByParent.get('__root__') || [];
  const attachments = new Map();
  const unattached = [];
  const basisById = new Map();
  for (const root of roots) {
    const hit = model?.ok ? suggestAttachment(model, root, index) : null;
    if (hit) {
      if (!attachments.has(hit.nodeId)) attachments.set(hit.nodeId, []);
      attachments.get(hit.nodeId).push(root);
      basisById.set(root.id, hit.basis);
    } else {
      unattached.push(root);
    }
  }

  const childrenOf = (id) => childrenByParent.get(id) || [];
  const descendantsOf = (id) => {
    const out = [];
    const walk = (parentId) => {
      for (const child of childrenOf(parentId)) {
        out.push(child);
        walk(child.id);
      }
    };
    walk(id);
    return out;
  };

  return { rows, byId, roots, attachments, unattached, basisById, index, childrenOf, descendantsOf };
}

/** Root plan items shown under one official node (never their descendants). */
export const planItemsFor = (plan, nodeId) => plan.attachments.get(nodeId) || [];

/** Every plan item that renders under one official node, including children. */
export function planSubtreeFor(plan, nodeId) {
  const out = [];
  for (const root of planItemsFor(plan, nodeId)) {
    out.push(root, ...plan.descendantsOf(root.id));
  }
  return out;
}

/* ------------------------------------------------------------- roll-up ---- */

/**
 * One completion figure over both trees.
 *
 * Official progress is counted over the leaves of the notification's own
 * hierarchy (as it always was); plan progress is counted over planner items.
 * They are reported separately as well as combined, because they measure
 * different things and the app does not pretend otherwise.
 */
export function combinedProgress(model, progressRows, plan) {
  const official = model?.ok
    ? progressSummary(model, progressRows)
    : { total: 0, done: 0, touched: 0, completion: 0, byStatus: { not_started: 0, in_progress: 0, completed: 0, revised: 0 } };

  const planByStatus = { not_started: 0, in_progress: 0, completed: 0, revised: 0 };
  let planDone = 0;
  let planTouched = 0;
  const planRows = plan?.rows || [];
  for (const row of planRows) {
    const status = normaliseStatus(row.status);
    planByStatus[status] += 1;
    if (status !== 'not_started') planTouched += 1;
    if (DONE_STATUSES.has(status)) planDone += 1;
  }
  const planSummary = {
    total: planRows.length,
    done: planDone,
    touched: planTouched,
    byStatus: planByStatus,
    completion: planRows.length ? planDone / planRows.length : 0,
  };

  const total = official.total + planSummary.total;
  const done = official.done + planSummary.done;
  return {
    official,
    plan: planSummary,
    total,
    done,
    touched: official.touched + planSummary.touched,
    completion: total ? done / total : 0,
  };
}

/** Progress for the leaves under one official node, plus any plan items there. */
export function nodeProgress(model, node, progressRows, plan) {
  const leaves = leavesOf(model.nodes, node);
  const byStatus = { not_started: 0, in_progress: 0, completed: 0, revised: 0 };
  let done = 0;
  let inProgress = 0;
  for (const leaf of leaves) {
    const status = normaliseStatus(progressRows.get(leaf.id)?.status);
    byStatus[status] += 1;
    if (DONE_STATUSES.has(status)) done += 1;
    if (status === 'in_progress') inProgress += 1;
  }
  const planItems = plan ? planSubtreeFor(plan, node.id) : [];
  for (const item of planItems) {
    const status = normaliseStatus(item.status);
    byStatus[status] += 1;
    if (DONE_STATUSES.has(status)) done += 1;
    if (status === 'in_progress') inProgress += 1;
  }
  const total = leaves.length + planItems.length;
  return { total, done, inProgress, byStatus, planItems: planItems.length, completion: total ? done / total : 0 };
}

/* --------------------------------------------------------------- access --- */

/** A uniform `{status, priority, target_date, notes}` for either kind of item. */
export function readEntry(target, { progressRows, plan }) {
  if (!target) return null;
  if (target.scope === 'plan') {
    const row = plan?.byId?.get(target.id);
    if (!row) return null;
    return {
      status: normaliseStatus(row.status),
      priority: row.priority || null,
      target_date: row.target_date || null,
      notes: row.notes || null,
    };
  }
  const row = progressRows?.get(target.id);
  return {
    status: normaliseStatus(row?.status),
    priority: row?.priority || null,
    target_date: row?.target_date || null,
    notes: row?.notes || null,
  };
}

/* --------------------------------------------------------------- writes --- */

/** Set a status on either kind of item, in the merged vocabulary. */
export async function setStatus(target, status, { model = null } = {}) {
  const value = normaliseStatus(status);
  if (!(value in STATUSES)) throw new Error(`Unknown syllabus status "${status}".`);
  if (target?.scope === 'plan') {
    return planner.updateSyllabusItem(target.id, { status: value, status_source: 'manual' });
  }
  return setProgressStatus(target.id, value, { model });
}

/** Set planning fields (priority, target date, notes) on either kind of item. */
export async function setPlanFields(target, patch = {}, { model = null } = {}) {
  if (target?.scope === 'plan') {
    return planner.updateSyllabusItem(target.id, patch);
  }
  return setProgressPlan(target.id, patch, { model });
}

/** Pin a plan item under an official node (or park it in My plan with null). */
export async function attachPlanItem(rowId, nodeId) {
  return planner.updateSyllabusItem(rowId, {
    attach_mode: ATTACH_MANUAL,
    attached_node_id: nodeId || null,
  });
}

/** Forget a manual decision and fall back to the curated mapping. */
export async function resetPlanAttachment(rowId) {
  return planner.updateSyllabusItem(rowId, { attach_mode: ATTACH_AUTO });
}

/* ----------------------------------------------------------- composition - */

/**
 * Everything the Syllabus section and the dashboard need, read once.
 */
export async function loadSyllabusWorkspace() {
  const model = await loadSyllabus();
  const [progressRows, plan] = await Promise.all([loadProgress(), loadPlan({ model })]);
  return { model, progressRows, plan, progress: combinedProgress(model, progressRows, plan) };
}

/** Label for a plan item, used where official and plan items sit side by side. */
export const planLabel = (row) => String(row?.title || '').trim();

/** Display label for an official node, falling back to its structural name. */
export function officialLabel(node) {
  if (!node) return '';
  const official = pickText(node.titles);
  if (official) return official;
  if (node.kind === 'unit') return node.number ? `Unit ${node.number}` : 'Unit';
  if (node.kind === 'part') return node.side ? `Part ${node.side.toUpperCase()}` : 'This paper';
  if (node.kind === 'paper') return node.number ? `Paper ${node.number}` : 'Paper';
  return '';
}
