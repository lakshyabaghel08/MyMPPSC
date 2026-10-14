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
  applyProgressStatuses,
  officialStatusIndex,
  emptySummary,
  addSummary,
  finaliseSummary,
  lineSummary,
  isInPlan,
  PLAN_FIELDS,
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
 * Progress is read the same way in both trees (see `officialStatusIndex()` in
 * `syllabus.js`): a line carries its own status or, failing that, that of its
 * nearest marked heading; a heading is the roll-up of its lines; and only
 * lines are counted.
 *
 * This replaces two miscounts. A status stored on a heading was counted
 * nowhere, so marking a whole section changed no figure on the screen. And
 * plan items were counted as rows, so a plan heading with both of its
 * sub-items finished read "2 of 3": the heading counted as one more
 * unfinished item.
 */

const asProgressMap = (progressRows) =>
  progressRows instanceof Map ? progressRows : new Map((progressRows || []).map((row) => [row.node_id || row.id, row]));

/** Each plan row's summary under the shared rule: a Map from row id to summary. */
export function planStatusIndex(plan) {
  const out = new Map();
  if (!plan?.roots) return out;
  const visit = (row, inherited) => {
    const own = normaliseStatus(row.status);
    const carried = own !== 'not_started' ? own : inherited;
    const children = plan.childrenOf(row.id);
    let summary;
    if (!children.length) {
      summary = lineSummary(carried);
    } else {
      summary = emptySummary();
      for (const child of children) addSummary(summary, visit(child, carried));
      finaliseSummary(summary);
    }
    summary.own = own;
    out.set(row.id, summary);
    return summary;
  };
  for (const root of plan.roots) visit(root, 'not_started');
  return out;
}

/**
 * Every figure the Syllabus section shows, computed once per render.
 *
 *  * `official` — node id → the node's own lines;
 *  * `plan` — plan row id → the item and its sub-items;
 *  * `node` — node id → the node's lines plus the reader's items shown under it
 *    or anywhere beneath it. This is what a heading's progress shows, so a
 *    paper counts an item pinned to one of its lines as well as one pinned to
 *    the paper itself.
 */
export function buildProgressIndex(model, progressRows, plan) {
  const rows = asProgressMap(progressRows);
  const official = model?.ok ? officialStatusIndex(model, rows) : new Map();
  const planIndex = planStatusIndex(plan);
  const node = new Map();
  if (model?.ok) {
    const extraOf = new Map();
    const visit = (id) => {
      const current = model.nodes.get(id);
      const extra = emptySummary();
      if (!current) return extra;
      for (const root of plan ? planItemsFor(plan, id) : []) addSummary(extra, planIndex.get(root.id));
      for (const childId of current.childIds) addSummary(extra, visit(childId));
      extraOf.set(id, extra);
      return extra;
    };
    for (const id of model.topLevel || []) visit(id);
    for (const [id, lines] of official) {
      const extra = extraOf.get(id) || emptySummary();
      const combined = finaliseSummary(addSummary(addSummary(emptySummary(), lines), extra));
      combined.planItems = extra.total;
      combined.own = lines.own;
      node.set(id, combined);
    }
  }
  return { official, plan: planIndex, node };
}

const publicSummary = (summary) => ({
  total: summary.total,
  done: summary.done,
  inProgress: summary.inProgress,
  touched: summary.touched,
  byStatus: { ...summary.byStatus },
  completion: summary.completion,
  status: summary.status,
});

/**
 * One completion figure over both trees.
 *
 * Official progress is counted over the lines of the notification's own
 * hierarchy; plan progress over the reader's items that have no sub-items.
 * They are reported separately as well as combined, because they measure
 * different things and the app does not pretend otherwise.
 */
export function combinedProgress(model, progressRows, plan, index = null) {
  const rows = asProgressMap(progressRows);
  const idx = index || buildProgressIndex(model, rows, plan);
  const official = emptySummary();
  for (const id of model?.ok ? model.topLevel : []) addSummary(official, idx.official.get(id));
  finaliseSummary(official);
  const mine = emptySummary();
  for (const root of plan?.roots || []) addSummary(mine, idx.plan.get(root.id));
  finaliseSummary(mine);

  const total = official.total + mine.total;
  const done = official.done + mine.done;
  return {
    official: publicSummary(official),
    plan: publicSummary(mine),
    total,
    done,
    inProgress: official.inProgress + mine.inProgress,
    touched: official.touched + mine.touched,
    completion: total ? done / total : 0,
    // Consumed by `studyPriorities()`, which needs the curriculum keyed the way
    // the question bank is keyed rather than the way the syllabus is.
    byTopic: topicStatusIndex(model, rows, plan, idx),
  };
}

/**
 * One status per *question-bank topic*, drawn from both stores.
 *
 * `studyPriorities()` asks a single question of the curriculum — "what has the
 * reader already said about this topic?" — and it expects a `byTopic` map to
 * answer it with. Before the merge nothing built one: the planner's roll-up
 * never carried the field, so the branch that reads it could not run, and
 * anything marked on the official syllabus was invisible to priorities
 * regardless. One roll-up now answers for both stores.
 *
 * Each item answers with the status the screen shows for it — a heading with
 * the roll-up of its lines, a line with its own status or its heading's — so
 * priorities and the Syllabus section never disagree. Where both stores speak
 * about the same topic the *least* advanced status wins, a high priority set
 * in either is kept, and the nearer target date is the operative one. A topic
 * the reader still has open in their own plan does not become "done" because
 * the official line above it was ticked — the merge must not conclude more
 * than either store on its own would.
 */
export function topicStatusIndex(model, progressRows, plan, index = null) {
  const byTopic = new Map();
  // `loadProgress()` hands back a Map keyed by node id; accept a plain list
  // too, so a caller holding raw rows gets the same answer.
  const rows = asProgressMap(progressRows);
  const idx = index || buildProgressIndex(model, rows, plan);

  const record = (key, incoming) => {
    const status = normaliseStatus(incoming.status);
    const existing = byTopic.get(key);
    if (!existing) {
      byTopic.set(key, {
        status,
        priority: incoming.priority || null,
        target_date: incoming.target_date || null,
      });
      return;
    }
    if (statusScore(status) < statusScore(existing.status)) existing.status = status;
    if (incoming.priority === 'high') existing.priority = 'high';
    else if (!existing.priority && incoming.priority) existing.priority = incoming.priority;
    if (incoming.target_date && (!existing.target_date || incoming.target_date < existing.target_date)) {
      existing.target_date = incoming.target_date;
    }
  };

  // The reader's own items carry a subject and topic of their own.
  for (const row of plan?.rows || []) {
    if (!row?.subject || !row?.topic) continue;
    const summary = idx.plan.get(row.id);
    record(topicKey(row.subject, row.topic), { ...row, status: summary ? summary.status : row.status });
  }

  // An official heading reaches a bank topic only through the curated
  // mapping, the same association the attachment logic uses - never a guess
  // at titles. A heading the reader has said nothing about is left out.
  if (model?.ok) {
    const attachments = plan?.index || buildAttachmentIndex(model);
    for (const [key, nodeId] of attachments.byTopic) {
      const entry = rows.get(nodeId);
      const summary = idx.official.get(nodeId);
      if (!entry && !summary?.touched) continue;
      record(key, {
        status: summary ? summary.status : entry?.status,
        priority: entry?.priority,
        target_date: entry?.target_date,
      });
    }
  }

  return byTopic;
}

/** Progress for the lines under one official node, plus any plan items shown there. */
export function nodeProgress(model, node, progressRows, plan) {
  const summary = (node && buildProgressIndex(model, progressRows, plan).node.get(node.id)) || emptySummary();
  return { ...publicSummary(summary), planItems: summary.planItems || 0 };
}

/* --------------------------------------------------------------- access --- */

/** A uniform `{status, priority, target_date, notes, inPlan}` for either kind of item. */
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
      inPlan: true,
    };
  }
  const row = progressRows?.get(target.id);
  return {
    status: normaliseStatus(row?.status),
    priority: row?.priority || null,
    target_date: row?.target_date || null,
    notes: row?.notes || null,
    inPlan: isInPlan(row),
  };
}

/* --------------------------------------------------------------- writes --- */

const KNOWN_STATUSES = new Set([...Object.keys(STATUSES), ...Object.keys(LEGACY_STATUS_ALIASES)]);

/** The official tree, as `cascadeChanges()` walks it. */
function officialTree(model, progressRows) {
  return {
    childrenOf: (id) => model.nodes.get(id)?.childIds || [],
    parentOf: (id) => model.nodes.get(id)?.parentId || null,
    ownOf: (id) => normaliseStatus(progressRows.get(id)?.status),
  };
}

/** The reader's own tree, as `cascadeChanges()` walks it. */
function planTree(plan) {
  return {
    childrenOf: (id) => plan.childrenOf(id).map((row) => row.id),
    parentOf: (id) => {
      const parentId = plan.byId.get(id)?.parent_id;
      return parentId && plan.byId.has(parentId) ? parentId : null;
    },
    ownOf: (id) => normaliseStatus(plan.byId.get(id)?.status),
  };
}

/**
 * What marking one item means for the items around it, as a Map from id to
 * the status each item should now carry itself (`not_started` clears).
 *
 *  * Marking a heading marks all of its lines, so anything marked beneath it
 *    gives way: its lines then read the heading's status.
 *  * Marking a line marks just that line, even under a marked heading.
 *  * "Not started" under a marked heading cannot be expressed by clearing one
 *    line — it would read the heading's status again. The outermost marked
 *    heading's mark is therefore spelled out on each of its lines first, and
 *    then the item is cleared.
 *
 * `tree` supplies `childrenOf(id)`, `parentOf(id)` and `ownOf(id)`. Entries
 * that would not change anything are left out, except the item itself.
 */
export function cascadeChanges(tree, id, status) {
  const changes = new Map();
  const ownOf = (nodeId) => (changes.has(nodeId) ? changes.get(nodeId) : tree.ownOf(nodeId));

  if (status === 'not_started') {
    let outermost = null;
    const seen = new Set([id]);
    for (let parent = tree.parentOf(id); parent && !seen.has(parent); parent = tree.parentOf(parent)) {
      seen.add(parent);
      if (tree.ownOf(parent) !== 'not_started') outermost = parent;
    }
    if (outermost) {
      const visited = new Set();
      const spellOut = (nodeId, inherited) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        const own = tree.ownOf(nodeId);
        const carried = own !== 'not_started' ? own : inherited;
        const children = tree.childrenOf(nodeId);
        if (!children.length) {
          if (carried !== own) changes.set(nodeId, carried);
          return;
        }
        if (own !== 'not_started') changes.set(nodeId, 'not_started');
        for (const child of children) spellOut(child, carried);
      };
      spellOut(outermost, 'not_started');
    }
  }

  const visited = new Set([id]);
  const clearBeneath = (nodeId) => {
    for (const child of tree.childrenOf(nodeId)) {
      if (visited.has(child)) continue;
      visited.add(child);
      if (ownOf(child) !== 'not_started') changes.set(child, 'not_started');
      clearBeneath(child);
    }
  };
  clearBeneath(id);
  changes.set(id, status);

  for (const [nodeId, value] of changes) {
    if (nodeId !== id && tree.ownOf(nodeId) === value) changes.delete(nodeId);
  }
  return changes;
}

/**
 * Set a status on either kind of item, in the merged vocabulary. Marking a
 * heading (or one of the reader's items with sub-items) marks every line under
 * it; see `cascadeChanges()`. Returns the number of stored items that changed.
 */
export async function setStatus(target, status, { model = null } = {}) {
  // Validate what was asked for, not its normalised form: an unknown value
  // must be refused, not quietly read as "not started" and stored.
  if (!KNOWN_STATUSES.has(String(status))) throw new Error(`Unknown syllabus status "${status}".`);
  const value = normaliseStatus(status);
  if (!target?.id) throw new Error('A syllabus item is required.');

  if (target.scope === 'plan') {
    const plan = await loadPlan({ model });
    if (!plan.byId.has(target.id)) throw new Error('That syllabus item no longer exists.');
    const updated = await planner.setSyllabusStatuses(cascadeChanges(planTree(plan), target.id, value));
    return updated.length;
  }

  if (!model?.ok || !model.nodes.has(target.id)) {
    await setProgressStatus(target.id, value, { model });
    return 1;
  }
  const progressRows = await loadProgress();
  const changes = cascadeChanges(officialTree(model, progressRows), target.id, value);
  const result = await applyProgressStatuses(changes, { model, progressRows });
  return result.written + result.cleared;
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

/* ------------------------------------------------------------- my plan ---- */

/**
 * Official syllabus nodes join *My plan* by reference. The node gets
 * `in_plan: true` on its progress row — the same row that holds its status, so
 * a line ticked in the tree is ticked in My plan too, and nothing the
 * commission wrote is copied into the reader's own store. A plan is any paper,
 * section, unit or line; a whole stage is too broad to plan as one item.
 */
export { isInPlan };

/** Official nodes the reader has put in My plan, in syllabus order. */
export function plannedNodes(model, progressRows) {
  if (!model?.ok) return [];
  const out = [];
  for (const [nodeId, row] of asProgressMap(progressRows)) {
    if (!isInPlan(row)) continue;
    const node = model.nodes.get(nodeId);
    if (node && node.kind !== 'exam') out.push(node);
  }
  return out.sort((a, b) => a.order - b.order);
}

/** The node itself, or its nearest heading, that is in My plan; null when neither is. */
export function planAnchor(model, progressRows, node) {
  const rows = asProgressMap(progressRows);
  const seen = new Set();
  for (let cursor = node; cursor && cursor.kind !== 'exam' && !seen.has(cursor.id); cursor = model.nodes.get(cursor.parentId)) {
    seen.add(cursor.id);
    if (isInPlan(rows.get(cursor.id))) return cursor;
  }
  return null;
}

/** Put an official node in My plan, optionally with a target date, priority or notes. */
export async function addOfficialToPlan(nodeId, fields = {}, { model = null } = {}) {
  const node = model?.nodes?.get(nodeId) || null;
  if (model?.ok && !node) throw new Error('That part of the syllabus no longer exists.');
  if (node?.kind === 'exam') throw new Error('Add a paper, section or line rather than a whole stage.');
  const patch = { in_plan: true };
  for (const field of PLAN_FIELDS) if (field in fields) patch[field] = fields[field];
  return setProgressPlan(nodeId, patch, { model });
}

/**
 * Take an official node out of My plan. Its target date, priority and notes go
 * with it; its status stays, because the status belongs to the syllabus line,
 * not to the plan.
 */
export async function removeOfficialFromPlan(nodeId, { model = null } = {}) {
  return setProgressPlan(nodeId, { in_plan: false, priority: null, target_date: null, notes: null }, { model });
}

/**
 * What My plan holds, read once. `entries` are the planned official nodes
 * that are not inside another planned node — a section added along with its
 * paper is shown inside the paper rather than twice — and `summary` counts each
 * line once: the lines of those entries plus every item of the reader's own.
 */
export function planOverview(model, progressRows, plan, index = null) {
  const rows = asProgressMap(progressRows);
  const idx = index || buildProgressIndex(model, rows, plan);
  const planned = plannedNodes(model, rows);
  const plannedIds = new Set(planned.map((node) => node.id));
  const entries = planned.filter((node) => {
    for (let parent = model.nodes.get(node.parentId); parent; parent = model.nodes.get(parent.parentId)) {
      if (plannedIds.has(parent.id)) return false;
    }
    return true;
  });
  const summary = emptySummary();
  for (const node of entries) addSummary(summary, idx.official.get(node.id));
  for (const root of plan?.roots || []) addSummary(summary, idx.plan.get(root.id));
  finaliseSummary(summary);
  return { planned, plannedIds, entries, summary, ownItems: plan?.rows?.length || 0 };
}

/**
 * Target dates in My plan on items that are not finished, soonest first,
 * split into overdue and upcoming against `today` (a `YYYY-MM-DD` key).
 */
export function planDeadlines(model, progressRows, plan, today, index = null) {
  const rows = asProgressMap(progressRows);
  const idx = index || buildProgressIndex(model, rows, plan);
  const items = [];
  for (const node of plannedNodes(model, rows)) {
    const date = rows.get(node.id)?.target_date;
    const summary = idx.official.get(node.id);
    if (!date || (summary && summary.total && summary.done === summary.total)) continue;
    items.push({ scope: 'official', id: node.id, title: officialLabel(node), target_date: date });
  }
  for (const row of plan?.rows || []) {
    const summary = idx.plan.get(row.id);
    const finished = summary ? summary.total && summary.done === summary.total : isDone(row.status);
    if (!row.target_date || finished) continue;
    items.push({ scope: 'plan', id: row.id, title: planLabel(row), target_date: row.target_date });
  }
  items.sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));
  return {
    overdue: items.filter((item) => item.target_date < today),
    upcoming: items.filter((item) => item.target_date >= today),
  };
}

/* ----------------------------------------------------------- composition - */

/**
 * Everything the Syllabus section and the dashboard need, read once.
 */
export async function loadSyllabusWorkspace() {
  const model = await loadSyllabus();
  const [progressRows, plan] = await Promise.all([loadProgress(), loadPlan({ model })]);
  const index = buildProgressIndex(model, progressRows, plan);
  return { model, progressRows, plan, index, progress: combinedProgress(model, progressRows, plan, index) };
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
