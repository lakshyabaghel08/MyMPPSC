/**
 * syllabus-hub.js — the one roll-up of progress through the official syllabus.
 *
 * The commission's revised 2026 syllabus is the curriculum this app tracks.
 * Its lines are read from `data/syllabus/mppsc-2026-syllabus.json` and the
 * reader's marks from the `syllabus_progress` store; this module is the single
 * place that turns those two into the figures the Syllabus section, the
 * dashboard and study priorities all quote.
 *
 * It used to fold in a second tree — the reader's own plan items from the
 * `syllabus` store — so that "68% complete" could mean official topics plus
 * anything the reader had typed. That mixed two different things in one number,
 * and the screen that offered it is gone: *My plan* was removed from the
 * Syllabus UI, so every figure here now counts **official topics only**.
 *
 * The planner's stores are deliberately untouched. `services/planner.js` still
 * owns `syllabus`, `tasks` and `sessions`, backups still round-trip all three,
 * and plan fields already stored on a `syllabus_progress` row (a target date, a
 * priority, a note, `in_plan`) are still preserved by every status write in
 * `services/syllabus.js` — clearing a mark never discards what a reader typed.
 * What changed is that nothing in the interface reads them any more, so they
 * cannot change a count.
 */

import {
  loadSyllabus,
  loadProgress,
  setProgressStatus,
  applyProgressStatuses,
  officialStatusIndex,
  emptySummary,
  addSummary,
  finaliseSummary,
  labelText,
} from './syllabus.js';

/* ------------------------------------------------------------- statuses -- */

/**
 * The status vocabulary, in the official module's ordering, in which `revised`
 * comes *after* `completed` and counts as done.
 */
export const STATUSES = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  revised: 'Revised',
};

export const STATUS_ORDER = ['not_started', 'in_progress', 'completed', 'revised'];

/** The single source of truth for "this counts as done". */
export const DONE_STATUSES = new Set(['completed', 'revised']);

/**
 * The legacy planner spelling `revising` sat *before* `completed` in its own
 * ordering, so it never asserted that an item was finished. It therefore maps
 * to `in_progress` and not to `revised`: reading it as a done state would mark
 * items complete that the reader never marked complete, and this app would
 * rather under-claim. Rows written with it are still on disk.
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

/* ------------------------------------------------- bank-topic vocabulary -- */

export const topicKey = (subject, topic) => `${subject || ''}||${topic || ''}`;

/**
 * Reverse the curated `pyq-links.json` mapping into lookups from the question
 * bank's own vocabulary to official syllabus nodes.
 *
 * That file is the only trustworthy bridge between the two vocabularies in this
 * repository: it was curated against the bank's taxonomy, so it cannot invent a
 * correspondence the way fuzzy title matching would. Anything it does not cover
 * simply has no association, which is the honest outcome.
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

  // A subject-level association goes to whichever heading the mapping
  // associates with that subject most often — the heading that is that subject.
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

/* ------------------------------------------------------------- roll-up ---- */

/**
 * Progress is read one way (see `officialStatusIndex()` in `syllabus.js`): a
 * line carries its own status or, failing that, that of its nearest marked
 * heading; a heading is the roll-up of its lines; and only lines are counted,
 * so a section is never counted next to its own topics.
 *
 * That replaced two miscounts. A status stored on a heading was counted
 * nowhere, so marking a whole section changed no figure on the screen. And
 * headings used to be counted as items, so a section with both of its topics
 * finished read "2 of 3".
 */

const asProgressMap = (progressRows) =>
  progressRows instanceof Map ? progressRows : new Map((progressRows || []).map((row) => [row.node_id || row.id, row]));

/**
 * Every figure the Syllabus section shows, computed once per render: a Map from
 * node id to that node's own lines. Official topics only.
 */
export function buildProgressIndex(model, progressRows) {
  const rows = asProgressMap(progressRows);
  const official = model?.ok ? officialStatusIndex(model, rows) : new Map();
  return { official, node: official };
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
 * One completion figure for the curriculum: the official topics of the
 * notification, and nothing else. `byTopic` re-keys the same marks into the
 * question bank's vocabulary for `studyPriorities()`.
 */
export function combinedProgress(model, progressRows, index = null) {
  const rows = asProgressMap(progressRows);
  const idx = index || buildProgressIndex(model, rows);
  const official = emptySummary();
  for (const id of model?.ok ? model.topLevel : []) addSummary(official, idx.official.get(id));
  finaliseSummary(official);

  return {
    ...publicSummary(official),
    official: publicSummary(official),
    byTopic: topicStatusIndex(model, rows, idx),
  };
}

/**
 * One status per *question-bank topic*, drawn from the official syllabus.
 *
 * `studyPriorities()` asks a single question of the curriculum — "what has the
 * reader already said about this topic?" — and it expects a `byTopic` map to
 * answer it with. An official heading reaches a bank topic only through the
 * curated mapping, the same association the PYQ chips use, and never by
 * guessing at titles; a heading the reader has said nothing about is left out.
 *
 * Each entry answers with the status the screen shows for it — a heading with
 * the roll-up of its lines, a line with its own status or its heading's — so
 * priorities and the Syllabus section never disagree.
 */
export function topicStatusIndex(model, progressRows, index = null) {
  const byTopic = new Map();
  // `loadProgress()` hands back a Map keyed by node id; accept a plain list
  // too, so a caller holding raw rows gets the same answer.
  const rows = asProgressMap(progressRows);
  const idx = index || buildProgressIndex(model, rows);
  if (!model?.ok) return byTopic;

  const attachments = buildAttachmentIndex(model);
  for (const [key, nodeId] of attachments.byTopic) {
    const entry = rows.get(nodeId);
    const summary = idx.official.get(nodeId);
    if (!entry && !summary?.touched) continue;
    byTopic.set(key, {
      status: normaliseStatus(summary ? summary.status : entry?.status),
      // A target date or priority still stored on the row is the reader's own
      // planning data. It is preserved on disk and in backups, but it is no
      // longer read into a priority: *My plan* is not part of this screen.
      priority: null,
      target_date: null,
    });
  }

  return byTopic;
}

/** Progress for the lines under one official node. */
export function nodeProgress(model, node, progressRows) {
  const summary = (node && buildProgressIndex(model, progressRows).official.get(node.id)) || emptySummary();
  return publicSummary(summary);
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
 * Set a status on an official syllabus node, by id. Marking a heading marks
 * every line under it; see `cascadeChanges()`. Returns the number of stored
 * rows that changed. A row that also holds planning data from before *My plan*
 * was removed keeps that data — see `applyProgressStatuses()`.
 */
export async function setStatus(nodeId, status, { model = null } = {}) {
  // Validate what was asked for, not its normalised form: an unknown value
  // must be refused, not quietly read as "not started" and stored.
  if (!KNOWN_STATUSES.has(String(status))) throw new Error(`Unknown syllabus status "${status}".`);
  const value = normaliseStatus(status);
  const id = nodeId?.id || nodeId;
  if (!id) throw new Error('A syllabus item is required.');

  if (!model?.ok || !model.nodes.has(id)) {
    await setProgressStatus(id, value, { model });
    return 1;
  }
  const progressRows = await loadProgress();
  const changes = cascadeChanges(officialTree(model, progressRows), id, value);
  const result = await applyProgressStatuses(changes, { model, progressRows });
  return result.written + result.cleared;
}

/* ----------------------------------------------------------- composition - */

/**
 * Everything the Syllabus section and the dashboard need, read once. Official
 * syllabus and official progress only.
 */
export async function loadSyllabusWorkspace() {
  const model = await loadSyllabus();
  const progressRows = await loadProgress();
  const index = buildProgressIndex(model, progressRows);
  return { model, progressRows, index, progress: combinedProgress(model, progressRows, index) };
}

/**
 * Display label for an official node in the current interface language, falling
 * back to a structural name where the notification left a unit untitled. A
 * structural name is never syllabus text: it only says which numbered unit the
 * row is.
 */
export function officialLabel(node) {
  if (!node) return '';
  const official = labelText(node);
  if (official) return official;
  if (node.kind === 'unit') return node.number ? `Unit ${node.number}` : 'Unit';
  if (node.kind === 'part') return node.side ? `Part ${node.side.toUpperCase()}` : 'This paper';
  if (node.kind === 'paper') return node.number ? `Paper ${node.number}` : 'Paper';
  return '';
}
