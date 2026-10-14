/**
 * syllabus.js — the official MPPSC 2026 syllabus, its study breakdown and the
 * user's progress through it.
 *
 * Three separate bodies of data are combined here and never mixed:
 *  1. `mppsc-2026-syllabus.json` — the official syllabus, extracted verbatim
 *     from the commission's revised notification. Built by tools/build-syllabus.mjs.
 *  2. `study-guide/*.json` — derived study guidance. Every unit it adds either
 *     groups official lines or subdivides one of them; the build refuses any
 *     unit that is not traceable to the official text.
 *  3. IndexedDB rows in the `syllabus_progress` store — the user's own status
 *     marks. Separate from the planner's syllabus rows and from every
 *     question-bank or attempt record.
 *
 * Nothing in this module classifies a question, scores an attempt or writes to
 * the question bank.
 */

import { STORES } from '../core/constants.js';
import * as db from '../core/db.js';
import { state } from '../core/state.js';
import { nowIso, logEvent } from '../core/util.js';

/* ------------------------------------------------------------- locations -- */

/** Paths are relative to the app root, so GitHub Pages sub-paths keep working. */
export const SYLLABUS_PATHS = {
  official: 'data/syllabus/mppsc-2026-syllabus.json',
  guides: [
    'data/syllabus/study-guide/prelims.json',
    'data/syllabus/study-guide/mains-papers-1-2.json',
    'data/syllabus/study-guide/mains-papers-3-4.json',
    'data/syllabus/study-guide/mains-papers-5-6.json',
  ],
  pyqLinks: 'data/syllabus/pyq-links.json',
};

export const PROGRESS_STATUSES = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  revised: 'Revised',
};

/** The single source of truth for "this counts as done" in this module. */
export const DONE_STATUSES = new Set(['completed', 'revised']);

export const EXAM_LABELS = {
  prelims: 'Prelims',
  mains: 'Mains',
};

/* ---------------------------------------------------------------- loading - */

let cache = null;
let inFlight = null;

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path} could not be loaded (HTTP ${response.status}).`);
  return response.json();
}

/**
 * Load and index the syllabus. Cached for the session; `force` re-reads.
 * @returns {Promise<{ok: boolean, error?: string, model?: object}>}
 */
export async function loadSyllabus({ force = false } = {}) {
  if (cache && !force) return cache;
  if (inFlight && !force) return inFlight;
  inFlight = (async () => {
    try {
      const [official, pyqLinks, ...guides] = await Promise.all([
        fetchJson(SYLLABUS_PATHS.official),
        fetchJson(SYLLABUS_PATHS.pyqLinks),
        ...SYLLABUS_PATHS.guides.map(fetchJson),
      ]);
      const model = buildModel({ official, guides, pyqLinks });
      cache = { ok: true, ...model };
      return cache;
    } catch (error) {
      cache = { ok: false, error: error.message };
      return cache;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Drop the cached syllabus (used by tests and by a manual reload). */
export function resetSyllabusCache() {
  cache = null;
  inFlight = null;
}

/* ------------------------------------------------------------------- model - */

const hasDevanagari = (text) => typeof text === 'string' && /[\u0900-\u097F]/.test(text);

/** The language to render labels in, honouring the app-wide setting. */
export function displayLanguage() {
  return state.settings?.language === 'hi' ? 'hi' : 'en';
}

/** Choose the best available rendition for a label. */
export function pickText(titles, lang = displayLanguage()) {
  if (!titles) return '';
  const other = lang === 'hi' ? 'en' : 'hi';
  return titles[lang] || titles[other] || '';
}

export function buildModel({ official, guides, pyqLinks }) {
  const guideHeadings = Object.assign({}, ...guides.map((g) => g.headings || {}));
  const connections = guides.flatMap((g) => g.connections || []);
  const revisionGroups = guides.flatMap((g) => g.revisionGroups || []);
  const guideNotices = guides.map((g) => g.notice).filter(Boolean);

  const nodes = new Map();
  const topLevel = [];
  let order = 0;

  const addNode = (node) => {
    nodes.set(node.id, node);
    node.order = order;
    order += 1;
    return node;
  };

  const makeTopic = (topic, parent) => {
    const node = addNode({
      id: topic.id,
      kind: 'topic',
      titles: { hi: topic.text.hi, en: topic.text.en },
      text: topic.text,
      src: topic.src,
      parentId: parent.id,
      examId: parent.examId,
      paperId: parent.paperId,
      childIds: [],
      topicCount: 0,
    });
    return node;
  };

  const makeGroup = (group, parent) => {
    const node = addNode({
      id: group.id,
      kind: 'group',
      titles: group.titles,
      src: group.src,
      parentId: parent.id,
      examId: parent.examId,
      paperId: parent.paperId,
      childIds: [],
      topicCount: group.topics.length,
    });
    node.childIds = group.topics.map((t) => makeTopic(t, node).id);
    return node;
  };

  const makeUnit = (unit, parent) => {
    const node = addNode({
      id: unit.id,
      kind: 'unit',
      number: unit.number,
      marker: unit.marker || null,
      titles: unit.titles,
      scope: unit.scope || null,
      src: unit.src,
      parentId: parent.id,
      examId: parent.examId,
      paperId: parent.paperId,
      childIds: [],
      topicCount: unit.topics.length + (unit.groups || []).reduce((a, g) => a + g.topics.length, 0),
    });
    const childIds = [];
    (unit.groups || []).forEach((g) => childIds.push(makeGroup(g, node).id));
    unit.topics.forEach((t) => childIds.push(makeTopic(t, node).id));
    node.childIds = childIds;
    return node;
  };

  const makeSection = (section, parent) => {
    const node = addNode({
      id: section.id,
      kind: 'section',
      number: section.number,
      titles: section.titles,
      src: section.src,
      parentId: parent.id,
      examId: parent.examId,
      paperId: parent.paperId,
      childIds: [],
      topicCount: section.topics.length,
    });
    node.childIds = section.topics.map((t) => makeTopic(t, node).id);
    return node;
  };

  const exams = official.exams.map((exam) => {
    const examNode = addNode({
      id: exam.id,
      kind: 'exam',
      titles: exam.titles,
      parentId: null,
      examId: exam.id,
      paperId: null,
      childIds: [],
      topicCount: 0,
    });
    const papers = exam.papers.map((paper) => {
      const paperNode = addNode({
        id: paper.id,
        kind: 'paper',
        code: paper.code || null,
        number: paper.number || null,
        titles: paper.titles,
        src: paper.src || null,
        parentId: examNode.id,
        examId: exam.id,
        paperId: paper.id,
        childIds: [],
        topicCount: paper.counts?.topics ?? 0,
      });
      const children = [];
      (paper.sections || []).forEach((s) => children.push(makeSection(s, paperNode).id));
      (paper.parts || []).forEach((part) => {
        const partNode = addNode({
          id: part.id,
          kind: 'part',
          side: part.side,
          titles: part.titles,
          scope: part.scope || null,
          src: part.src,
          parentId: paperNode.id,
          examId: exam.id,
          paperId: paper.id,
          childIds: [],
          topicCount: (part.units || []).reduce((a, u) => a + u.topics.length + (u.groups || []).reduce((b, g) => b + g.topics.length, 0), 0),
        });
        partNode.childIds = (part.units || []).map((u) => makeUnit(u, partNode).id);
        children.push(partNode.id);
      });
      paperNode.childIds = children;
      return paperNode;
    });
    examNode.childIds = papers.map((p) => p.id);
    topLevel.push(examNode.id);
    return examNode;
  });

  // Derived study guidance is resolved here so the view only ever renders
  // already-verified references.
  const guide = new Map();
  for (const [nodeId, entry] of Object.entries(guideHeadings)) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    const leaves = leavesOf(nodes, node);
    const resolved = { focus: entry.focus || null, units: [], unresolved: [] };
    for (const unit of entry.units || []) {
      const matched = [];
      for (const prefix of unit.match || []) {
        const hit = leaves.filter((leaf) => {
          const text = leaf.text ? leaf.text.hi || leaf.text.en || '' : pickText(leaf.titles, 'hi') || pickText(leaf.titles, 'en') || '';
          return text.startsWith(prefix);
        });
        if (hit.length === 1) matched.push(hit[0]);
        else resolved.unresolved.push({ unit: unit.title, prefix, matches: hit.length });
      }
      const splitIds = [];
      for (const fragment of unit.split || []) {
        const host = matched.find((leaf) => {
          const text = leaf.text ? leaf.text.hi || leaf.text.en || '' : '';
          return text.includes(fragment);
        });
        if (host) splitIds.push(`${host.id}#${fragment}`);
      }
      resolved.units.push({
        title: unit.title,
        note: unit.note || null,
        covers: matched.map((leaf) => leaf.id),
        splits: splitIds,
      });
    }
    guide.set(nodeId, resolved);
  }

  const leafIds = [];
  for (const node of nodes.values()) if (!node.childIds.length) leafIds.push(node.id);

  return {
    official,
    nodes,
    topLevel,
    leafIds,
    guide,
    guideNotices,
    connections,
    revisionGroups,
    pyqLinks: pyqLinks.links || {},
    pyqNotice: pyqLinks.notice || null,
    pyqScopeNote: pyqLinks.scope_note || null,
    counts: official.counts || {},
    notes: official.extraction_notes || [],
    source: official.source || {},
  };
}

/** Every descendant of a node that has no children of its own. */
export function leavesOf(nodes, node) {
  if (!node) return [];
  if (!node.childIds.length) return [node];
  return node.childIds.flatMap((id) => leavesOf(nodes, nodes.get(id)));
}

/** Ancestors of a node, outermost first, excluding the node itself. */
export function ancestorsOf(nodes, node) {
  const chain = [];
  let cursor = node;
  while (cursor?.parentId) {
    cursor = nodes.get(cursor.parentId);
    if (!cursor) break;
    chain.unshift(cursor);
  }
  return chain;
}

/** Ancestors plus the node itself. */
export function pathOf(nodes, node) {
  return [...ancestorsOf(nodes, node), node].filter(Boolean);
}

/** The nearest ancestor of a given kind. */
export function nearestOfKind(nodes, node, kind) {
  let cursor = node;
  while (cursor) {
    if (cursor.kind === kind) return cursor;
    cursor = nodes.get(cursor.parentId);
  }
  return null;
}

/** Flat, ordered list of the nodes inside one exam. */
export function nodesOfExam(nodes, examId) {
  const out = [];
  const walk = (id) => {
    const node = nodes.get(id);
    if (!node) return;
    out.push(node);
    node.childIds.forEach(walk);
  };
  walk(examId);
  return out;
}

/* ----------------------------------------------------------------- search -- */

const normalise = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Search the syllabus. Matches are returned with the path that locates them, so
 * a result can be shown inside its hierarchy rather than as a detached line.
 */
export function searchSyllabus(model, query, { limit = 60, examId = null } = {}) {
  const needle = normalise(query);
  if (!needle) return [];
  const results = [];
  for (const node of model.nodes.values()) {
    if (examId && node.examId !== examId) continue;
    if (node.kind === 'exam') continue;

    const fields = [];
    if (node.text) {
      fields.push(['topic', node.text.hi], ['topic', node.text.en]);
    } else {
      fields.push(['heading', node.titles?.hi], ['heading', node.titles?.en]);
    }
    const guideEntry = model.guide.get(node.id);
    for (const unit of guideEntry?.units || []) fields.push(['study unit', unit.title]);

    let hit = null;
    for (const [field, value] of fields) {
      const hay = normalise(value);
      if (!hay) continue;
      const at = hay.indexOf(needle);
      if (at === -1) continue;
      hit = { field, value, at };
      break;
    }
    if (!hit) continue;

    results.push({
      id: node.id,
      kind: node.kind,
      field: hit.field,
      label: node.text ? node.text.hi || node.text.en : pickText(node.titles, 'hi') || pickText(node.titles, 'en'),
      path: pathOf(model.nodes, node).map((n) => n.titles ? pickText(n.titles) : '').filter(Boolean),
      pathIds: pathOf(model.nodes, node).map((n) => n.id),
    });
    if (results.length >= limit) break;
  }
  return results;
}

/* --------------------------------------------------------------- progress -- */

/** All stored progress rows, as a Map keyed by node id. */
export async function loadProgress() {
  const rows = await db.getAll(STORES.SYLLABUS_PROGRESS);
  const map = new Map();
  for (const row of rows) map.set(row.node_id, row);
  return map;
}

/**
 * Plan fields a user can attach to an official syllabus node. They are the
 * planner's own vocabulary, stored on the progress row so that scheduling a
 * real notification topic does not require inventing a parallel planner item.
 * They are the user's words, never the commission's.
 */
export const PLAN_FIELDS = ['priority', 'target_date', 'notes'];

/** True when a row carries a target date, a priority or a note. */
export function hasPlanFields(row) {
  if (!row) return false;
  return Boolean(row.priority || row.target_date || String(row.notes || '').trim());
}

/**
 * True when the reader has put this official node in *My plan*.
 *
 * `in_plan` is the explicit choice, made with "Add to my plan". A row written
 * before the flag existed that carries a plan (a target date, a priority, a
 * note) was planned by the reader as well, so it counts unless they have since
 * taken it out (`in_plan: false`).
 */
export function isInPlan(row) {
  if (!row) return false;
  if (row.in_plan === true) return true;
  if (row.in_plan === false) return false;
  return hasPlanFields(row);
}

/**
 * True when a row holds something of the reader's besides its status — a plan
 * or the choice to keep the node in *My plan*. Such a row is never deleted to
 * clear a status, because that would discard what the reader typed or chose.
 */
export function hasPlanContent(row) {
  return hasPlanFields(row) || row?.in_plan === true;
}

/** Copy the reader's plan from `source` onto a row that is being rewritten. */
function withPlanFields(row, source) {
  const out = { ...row };
  for (const field of PLAN_FIELDS) out[field] = source?.[field] ?? null;
  if (source && typeof source.in_plan === 'boolean') out.in_plan = source.in_plan;
  if (source?.planned_at) out.planned_at = source.planned_at;
  return out;
}

/** The structural fields every stored row carries, resolved from the model when it is at hand. */
function placement(nodeId, node, existing, sectionId = null) {
  return {
    node_id: nodeId,
    section_id: sectionId || node?.parentId || existing?.section_id || null,
    paper_id: node?.paperId || existing?.paper_id || null,
    exam_id: node?.examId || existing?.exam_id || null,
  };
}

/**
 * Store the status of exactly one node. This is the raw write: it does not
 * look at the node's headings or lines. The Syllabus screen marks items
 * through `setStatus()` in `syllabus-hub.js`, which works out what marking a
 * heading means for the lines under it and calls `applyProgressStatuses()`.
 */
export async function setProgressStatus(nodeId, status, { model = null, sectionId = null } = {}) {
  if (!nodeId) throw new Error('A syllabus node is required.');
  if (!(status in PROGRESS_STATUSES)) throw new Error(`Unknown syllabus status "${status}".`);
  const node = model?.nodes?.get(nodeId) || null;
  const existing = await db.get(STORES.SYLLABUS_PROGRESS, nodeId);

  if (status === 'not_started') {
    // "Not started" is normally the absence of a row, which keeps the store
    // small and makes "reset" and "set back to not started" the same operation.
    // A row that also holds a plan (priority, target date, notes, a place in
    // My plan) is kept and only loses its status: deleting it would silently
    // discard what the user typed, which is never an acceptable side effect of
    // changing a status.
    if (!existing) return null;
    if (!hasPlanContent(existing)) {
      await db.remove(STORES.SYLLABUS_PROGRESS, nodeId);
      logEvent('syllabus', `Cleared progress for ${nodeId}`);
      return null;
    }
    const kept = { ...existing, status: 'not_started', updated_at: nowIso() };
    await db.put(STORES.SYLLABUS_PROGRESS, kept);
    logEvent('syllabus', `Cleared progress for ${nodeId}, keeping its plan`);
    return kept;
  }

  const row = withPlanFields(
    {
      ...placement(nodeId, node, existing, sectionId),
      status,
      updated_at: nowIso(),
      created_at: existing?.created_at || nowIso(),
    },
    existing,
  );
  await db.put(STORES.SYLLABUS_PROGRESS, row);
  logEvent('syllabus', `Marked ${nodeId} as ${status}`);
  return row;
}

/**
 * Store several statuses at once, in one transaction. `changes` maps a node
 * id to the status it should now carry itself (`not_started` clears it). The
 * same keep-the-plan rule as `setProgressStatus()` applies to every row.
 */
export async function applyProgressStatuses(changes, { model = null, progressRows = null } = {}) {
  const entries = changes instanceof Map ? [...changes] : Object.entries(changes || {});
  for (const [, status] of entries) {
    if (!(status in PROGRESS_STATUSES)) throw new Error(`Unknown syllabus status "${status}".`);
  }
  const rows = progressRows instanceof Map ? progressRows : await loadProgress();
  const now = nowIso();
  const puts = [];
  const removals = [];
  for (const [nodeId, status] of entries) {
    const existing = rows.get(nodeId) || null;
    const current = existing && existing.status in PROGRESS_STATUSES ? existing.status : 'not_started';
    if (status === 'not_started') {
      if (!existing) continue;
      if (!hasPlanContent(existing)) removals.push(nodeId);
      else if (current !== 'not_started') puts.push({ ...existing, status: 'not_started', updated_at: now });
      continue;
    }
    if (existing && current === status) continue;
    const node = model?.nodes?.get(nodeId) || null;
    puts.push(
      withPlanFields(
        { ...placement(nodeId, node, existing), status, updated_at: now, created_at: existing?.created_at || now },
        existing,
      ),
    );
  }
  await db.writeBatch(STORES.SYLLABUS_PROGRESS, { put: puts, remove: removals });
  if (puts.length || removals.length) logEvent('syllabus', `Updated the status of ${puts.length + removals.length} syllabus item(s)`);
  return { written: puts.length, cleared: removals.length };
}

/**
 * Attach (or clear) planning fields on an official syllabus node without
 * touching its status. `in_plan` puts the node in My plan (true) or takes it
 * out (false). Returns the stored row, or null when the node ends up carrying
 * nothing at all.
 */
export async function setProgressPlan(nodeId, patch = {}, { model = null, sectionId = null } = {}) {
  if (!nodeId) throw new Error('A syllabus node is required.');
  const node = model?.nodes?.get(nodeId) || null;
  const existing = await db.get(STORES.SYLLABUS_PROGRESS, nodeId);

  const next = {
    ...placement(nodeId, node, existing, sectionId),
    status: existing?.status || 'not_started',
    created_at: existing?.created_at || nowIso(),
    updated_at: nowIso(),
    priority: existing?.priority ?? null,
    target_date: existing?.target_date ?? null,
    notes: existing?.notes ?? null,
  };
  if (typeof existing?.in_plan === 'boolean') next.in_plan = existing.in_plan;
  if (existing?.planned_at) next.planned_at = existing.planned_at;
  for (const field of PLAN_FIELDS) {
    if (field in patch) {
      const value = patch[field];
      next[field] = value === '' || value === undefined ? null : value;
    }
  }
  if ('in_plan' in patch) {
    const joining = Boolean(patch.in_plan);
    if (joining && !isInPlan(existing)) next.planned_at = nowIso();
    if (!joining) delete next.planned_at;
    next.in_plan = joining;
  }

  // A node with neither a status nor a plan is simply unmarked: drop the row
  // rather than leaving an empty one behind.
  if (next.status === 'not_started' && !hasPlanContent(next)) {
    if (existing) await db.remove(STORES.SYLLABUS_PROGRESS, nodeId);
    return null;
  }
  await db.put(STORES.SYLLABUS_PROGRESS, next);
  logEvent('syllabus', `Updated the plan on ${nodeId}`);
  return next;
}

/**
 * Clear every status marked on the official syllabus. Nothing outside this
 * store is touched — and inside it, a row that also holds the reader's plan
 * (a place in My plan, a target date, a priority, a note) keeps that plan and
 * only loses its status. This used to empty the store, which deleted typed
 * notes along with the ticks.
 */
export async function resetProgress() {
  const rows = await db.getAll(STORES.SYLLABUS_PROGRESS);
  const now = nowIso();
  const puts = [];
  const removals = [];
  let cleared = 0;
  for (const row of rows) {
    const marked = row.status in PROGRESS_STATUSES && row.status !== 'not_started';
    if (marked) cleared += 1;
    if (!hasPlanContent(row)) removals.push(row.node_id);
    else if (marked) puts.push({ ...row, status: 'not_started', updated_at: now });
  }
  await db.writeBatch(STORES.SYLLABUS_PROGRESS, { put: puts, remove: removals });
  logEvent('syllabus', 'Syllabus progress reset');
  return { cleared, plansKept: rows.length - removals.length };
}

/* ------------------------------------------------------------- roll-ups -- */

/**
 * How progress is read, in both the official tree and the reader's own:
 *
 *  * A line (a node with nothing under it) has its own status if it was given
 *    one; otherwise it carries the status of its nearest marked heading. So
 *    marking a section "completed" completes every line in it, while a line
 *    marked on its own keeps its own status.
 *  * A heading shows the roll-up of its lines: completed when every line is
 *    done, revised when every line is revised, in progress once any line is
 *    started, and not started otherwise.
 *
 * Only lines are counted, so a section is never counted next to its own lines.
 * Before this rule a status stored on a heading was counted nowhere: marking
 * "1. भारत का इतिहास" completed left every figure on the screen at zero.
 */
export const emptySummary = () => ({
  total: 0,
  done: 0,
  inProgress: 0,
  touched: 0,
  byStatus: { not_started: 0, in_progress: 0, completed: 0, revised: 0 },
  completion: 0,
  status: 'not_started',
});

/** The status a set of lines adds up to. */
export function rolledUpStatus(summary) {
  if (!summary?.total || !summary.touched) return 'not_started';
  if (summary.byStatus.revised === summary.total) return 'revised';
  if (summary.done === summary.total) return 'completed';
  return 'in_progress';
}

export function finaliseSummary(summary) {
  summary.completion = summary.total ? summary.done / summary.total : 0;
  summary.status = rolledUpStatus(summary);
  return summary;
}

/** Add one summary's counts into another (the status is recomputed by `finaliseSummary`). */
export function addSummary(into, from) {
  if (!from) return into;
  into.total += from.total;
  into.done += from.done;
  into.inProgress += from.inProgress;
  into.touched += from.touched;
  for (const key of Object.keys(into.byStatus)) into.byStatus[key] += from.byStatus[key] || 0;
  return into;
}

/** The summary of a single line with a given status. */
export function lineSummary(status) {
  const summary = emptySummary();
  const value = status in PROGRESS_STATUSES ? status : 'not_started';
  summary.total = 1;
  summary.byStatus[value] = 1;
  if (DONE_STATUSES.has(value)) summary.done = 1;
  if (value === 'in_progress') summary.inProgress = 1;
  if (value !== 'not_started') summary.touched = 1;
  return finaliseSummary(summary);
}

/**
 * Every official node's summary under the rule above, in one pass.
 * Returns a Map from node id to `{ total, done, inProgress, touched, byStatus,
 * completion, status, own }`, where `status` is what the reader sees (the
 * line's effective status, or the heading's roll-up) and `own` is what is
 * stored on the node itself.
 */
export function officialStatusIndex(model, progressRows) {
  const out = new Map();
  if (!model?.nodes) return out;
  const rows = progressRows instanceof Map ? progressRows : new Map();
  const ownOf = (id) => {
    const row = rows.get(id);
    return row && row.status in PROGRESS_STATUSES ? row.status : 'not_started';
  };
  const visit = (id, inherited) => {
    const node = model.nodes.get(id);
    if (!node) return null;
    const own = ownOf(id);
    const carried = own !== 'not_started' ? own : inherited;
    let summary;
    if (!node.childIds.length) {
      summary = lineSummary(carried);
    } else {
      summary = emptySummary();
      for (const childId of node.childIds) addSummary(summary, visit(childId, carried));
      finaliseSummary(summary);
    }
    summary.own = own;
    out.set(id, summary);
    return summary;
  };
  for (const id of model.topLevel || []) visit(id, 'not_started');
  return out;
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
 * Roll-up of the user's marks over the whole syllabus. Counts only lines that
 * exist in the syllabus, so a stale row for a removed node cannot inflate it.
 */
export function progressSummary(model, progressRows) {
  const index = officialStatusIndex(model, progressRows);
  const total = emptySummary();
  for (const id of model.topLevel || []) addSummary(total, index.get(id));
  return publicSummary(finaliseSummary(total));
}

/** Progress restricted to the lines inside one node (a paper, section or unit). */
export function progressForNode(model, node, progressRows) {
  const summary = node ? officialStatusIndex(model, progressRows).get(node.id) : null;
  return publicSummary(summary || emptySummary());
}

/* --------------------------------------------------------------- PYQ links - */

/**
 * Read-only links from a syllabus heading into the existing practice and
 * analysis screens. Returns [] when no reliable mapping exists — never a link
 * to an empty result and never a count.
 */
export function pyqLinksFor(model, nodeId) {
  const entries = model.pyqLinks[nodeId];
  if (!Array.isArray(entries) || !entries.length) return [];
  return entries.map((entry) => ({
    subject: entry.subject,
    topic: entry.topic || null,
    label: entry.topic || entry.subject,
    practiceHref: entry.topic ? `#/topic/${encodeURIComponent(entry.subject)}||${encodeURIComponent(entry.topic)}` : `#/topic/${encodeURIComponent(entry.subject)}`,
    analysisHref: `#/pyq-analysis/${encodeURIComponent(entry.subject)}`,
  }));
}

/** Suggestions from the study guide that involve a node but are not its own. */
export function relatedGuidance(model, node) {
  const connections = model.connections.filter((c) => c.a === node.id || c.b === node.id);
  const revisions = model.revisionGroups.filter((g) => (g.nodes || []).includes(node.id));
  const relatedIds = new Set();
  for (const c of connections) relatedIds.add(c.a === node.id ? c.b : c.a);
  return {
    connections: connections.map((c) => ({ ...c, otherId: c.a === node.id ? c.b : c.a })),
    revisionGroups: revisions,
    related: [...relatedIds].map((id) => model.nodes.get(id)).filter(Boolean),
  };
}

/**
 * Which pages of the source document a node's text was taken from. Used only to
 * point back at the source file in the one place where that helps the reader
 * (the detail panel), never as decoration in the tree.
 */
export function sourceRefs(model, node) {
  const pages = new Set();
  const visit = (id) => {
    const current = model.nodes.get(id);
    if (!current) return;
    for (const src of [current.src?.hi, current.src?.en]) {
      if (src?.page) pages.add(src.page);
    }
    current.childIds.forEach(visit);
  };
  visit(node.id);
  return [...pages].sort((a, b) => a - b);
}
