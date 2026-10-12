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

export async function setProgressStatus(nodeId, status, { model = null, sectionId = null } = {}) {
  if (!nodeId) throw new Error('A syllabus node is required.');
  if (!(status in PROGRESS_STATUSES)) throw new Error(`Unknown syllabus status "${status}".`);
  const node = model?.nodes?.get(nodeId) || null;
  const existing = await db.get(STORES.SYLLABUS_PROGRESS, nodeId);

  if (status === 'not_started') {
    // Not started is the absence of a row, so clearing keeps the store small and
    // makes "reset" and "set back to not started" the same operation.
    if (existing) await db.remove(STORES.SYLLABUS_PROGRESS, nodeId);
    logEvent('syllabus', `Cleared progress for ${nodeId}`);
    return null;
  }

  const row = {
    node_id: nodeId,
    status,
    section_id: sectionId || node?.parentId || existing?.section_id || null,
    paper_id: node?.paperId || existing?.paper_id || null,
    exam_id: node?.examId || existing?.exam_id || null,
    updated_at: nowIso(),
    created_at: existing?.created_at || nowIso(),
  };
  await db.put(STORES.SYLLABUS_PROGRESS, row);
  logEvent('syllabus', `Marked ${nodeId} as ${status}`);
  return row;
}

/** Remove every progress row for this module only. Nothing else is touched. */
export async function resetProgress() {
  const before = await db.count(STORES.SYLLABUS_PROGRESS).catch(() => null);
  await db.clearStore(STORES.SYLLABUS_PROGRESS);
  logEvent('syllabus', 'Syllabus progress reset');
  return { cleared: before };
}

/**
 * Roll-up of the user's marks over any set of nodes. Counts only leaves that
 * exist in the syllabus, so a stale row for a removed node cannot inflate it.
 */
export function progressSummary(model, progressRows) {
  const byLeafStatus = { not_started: 0, in_progress: 0, completed: 0, revised: 0 };
  let done = 0;
  let touched = 0;
  const leaves = model.leafIds;
  for (const id of leaves) {
    const row = progressRows.get(id);
    const status = row && row.status in PROGRESS_STATUSES ? row.status : 'not_started';
    byLeafStatus[status] += 1;
    if (status !== 'not_started') touched += 1;
    if (DONE_STATUSES.has(status)) done += 1;
  }
  return {
    total: leaves.length,
    done,
    touched,
    byStatus: byLeafStatus,
    completion: leaves.length ? done / leaves.length : 0,
  };
}

/** Progress restricted to the leaves inside one node (a paper, section or unit). */
export function progressForNode(model, node, progressRows) {
  const leaves = leavesOf(model.nodes, node);
  let done = 0;
  let inProgress = 0;
  const byStatus = { not_started: 0, in_progress: 0, completed: 0, revised: 0 };
  for (const leaf of leaves) {
    const row = progressRows.get(leaf.id);
    const status = row && row.status in PROGRESS_STATUSES ? row.status : 'not_started';
    byStatus[status] += 1;
    if (DONE_STATUSES.has(status)) done += 1;
    if (status === 'in_progress') inProgress += 1;
  }
  return { total: leaves.length, done, inProgress, byStatus, completion: leaves.length ? done / leaves.length : 0 };
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
