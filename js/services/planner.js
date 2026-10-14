/**
 * planner.js — Syllabus tracker, study tasks and study sessions.
 *
 * The syllabus is only what the user (or an imported syllabus file) puts in it.
 * No allegedly complete MPPSC syllabus is hard-coded. Question-bank
 * classifications can be used to *suggest* syllabus nodes and to link
 * performance to them, but a question's topic never completes a syllabus item:
 * only an explicit user action does.
 */

import { STORES } from '../core/constants.js';
import * as db from '../core/db.js';
import { state } from '../core/state.js';
import { uid, nowIso, todayKey, daysBetween, addDays, round, logEvent, sortBy } from '../core/util.js';

/**
 * Planner statuses.
 *
 * `revising` predates the merged Syllabus section and sat *before* `completed`
 * in this module's ordering, so it never meant "done". The merged section
 * speaks one vocabulary (see `syllabus-hub.js`) and maps it to `in_progress`
 * rather than to the official module's `revised`, which does count as done —
 * promoting it would mark items complete that the user never marked complete.
 * It is kept here so rows written by older builds still read back.
 */
export const STATUSES = {
  not_started: 'Not started',
  in_progress: 'In progress',
  revising: 'Revising',
  completed: 'Completed',
};

export const TASK_STATUSES = { todo: 'To do', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' };

/* -------------------------------------------------------------- syllabus -- */

export async function listSyllabus() {
  const rows = await db.getAll(STORES.SYLLABUS);
  return rows.sort(sortBy((r) => r.order ?? 0, 'asc'));
}

export function buildTree(rows) {
  const byParent = new Map();
  for (const row of rows) {
    const key = row.parent_id || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(row);
  }
  for (const list of byParent.values()) list.sort(sortBy((r) => r.order ?? 0, 'asc'));
  const build = (parentId) =>
    (byParent.get(parentId || 'root') || []).map((row) => ({
      ...row,
      children: build(row.id),
    }));
  return build(null);
}

/**
 * Every status a planner row may carry. `revised` is written by the merged
 * Syllabus section (`syllabus-hub.js`), which speaks one vocabulary for the
 * official syllabus and the user's own items.
 */
const ROW_STATUSES = new Set([...Object.keys(STATUSES), 'revised']);

export async function addSyllabusItem({ parentId = null, title, subject = null, topic = null, subtopic = null, priority = 'medium', target_date = null, notes = null, source = 'user', attached_node_id = null, status = 'not_started' }) {
  if (!title || !String(title).trim()) throw new Error('A syllabus item needs a title.');
  const rows = await listSyllabus();
  const parent = parentId ? rows.find((r) => r.id === parentId) : null;
  const level = parent ? (parent.level === 'subject' ? 'topic' : 'subtopic') : 'subject';
  const item = {
    id: uid('syl'),
    parent_id: parentId,
    /**
     * The official syllabus node this item is shown under, when the user has
     * pinned it to one. Null means "suggest a home from the curated mapping, or
     * leave it in My plan". It is a display relationship only: the official
     * tree ships as data and is never written to.
     */
    attached_node_id: attached_node_id || null,
    level,
    title: String(title).trim(),
    subject: subject || parent?.subject || (level === 'subject' ? String(title).trim() : null),
    topic: topic || parent?.topic || (level === 'topic' ? String(title).trim() : null),
    subtopic: subtopic || parent?.subtopic || (level === 'subtopic' ? String(title).trim() : null),
    status: ROW_STATUSES.has(status) ? status : 'not_started',
    status_source: 'manual',
    priority,
    target_date,
    notes,
    source,
    linked_bank_path: Boolean((subject || parent?.subject) && (topic || parent?.topic)),
    order: rows.filter((r) => r.parent_id === parentId).length,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await db.put(STORES.SYLLABUS, item);
  logEvent('planner', `Added syllabus item ${item.title}`);
  return item;
}

export async function updateSyllabusItem(id, patch) {
  const row = await db.get(STORES.SYLLABUS, id);
  if (!row) throw new Error('That syllabus item no longer exists.');
  const updated = { ...row, ...patch, updated_at: nowIso() };
  if (patch.status && patch.status !== row.status) {
    updated.status_source = patch.status_source || 'manual';
    updated.status_changed_at = nowIso();
  }
  await db.put(STORES.SYLLABUS, updated);
  return updated;
}

/**
 * Store several statuses at once — what marking an item with sub-items comes
 * to. `changes` maps a row id to its new status. One read and one write,
 * whatever the number of rows.
 */
export async function setSyllabusStatuses(changes) {
  const entries = changes instanceof Map ? [...changes] : Object.entries(changes || {});
  if (!entries.length) return [];
  for (const [, status] of entries) {
    if (!ROW_STATUSES.has(status)) throw new Error(`Unknown syllabus status "${status}".`);
  }
  const rows = new Map((await db.getAll(STORES.SYLLABUS)).map((row) => [row.id, row]));
  const now = nowIso();
  const updated = [];
  for (const [id, status] of entries) {
    const row = rows.get(id);
    if (!row || row.status === status) continue;
    updated.push({ ...row, status, status_source: 'manual', status_changed_at: now, updated_at: now });
  }
  await db.putMany(STORES.SYLLABUS, updated);
  if (updated.length) logEvent('planner', `Updated the status of ${updated.length} syllabus item(s)`);
  return updated;
}

/** Descendants of a node (used for completion roll-up and safe deletion). */
export function descendants(rows, id) {
  const out = [];
  const walk = (parentId) => {
    for (const row of rows) {
      if (row.parent_id === parentId) {
        out.push(row);
        walk(row.id);
      }
    }
  };
  walk(id);
  return out;
}

export async function deleteSyllabusItem(id, { withChildren = true } = {}) {
  const rows = await listSyllabus();
  const toDelete = withChildren ? [id, ...descendants(rows, id).map((r) => r.id)] : [id];
  const tasks = await db.getAll(STORES.TASKS);
  const linkedTasks = tasks.filter((t) => toDelete.includes(t.syllabus_id));
  for (const task of linkedTasks) await db.put(STORES.TASKS, { ...task, syllabus_id: null, notes: `${task.notes || ''}\n[Syllabus link removed when the item was deleted]`.trim() });
  await db.removeMany(STORES.SYLLABUS, toDelete);
  return { removed: toDelete.length, unlinkedTasks: linkedTasks.length };
}

/** Import a syllabus structure from JSON (never from a hard-coded list). */
export async function importSyllabus(raw, { replace = false, source = 'imported' } = {}) {
  const errors = [];
  const items = [];
  const normaliseNodes = (nodes, parent = null, path = {}) => {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((node, index) => {
      if (typeof node === 'string') {
        items.push({ parent, title: node, index, path });
        return;
      }
      if (!node || typeof node !== 'object' || !node.title) {
        errors.push(`Node ${index + 1}${parent ? ` under "${parent.title}"` : ''} has no title.`);
        return;
      }
      const full = { parent, title: String(node.title), index, path, node };
      items.push(full);
      const children = node.topics || node.children || node.subtopics || null;
      if (children) normaliseNodes(children, full, path);
    });
  };
  const structure = raw?.subjects || raw?.syllabus || raw?.items || (Array.isArray(raw) ? raw : null);
  if (!structure) {
    return { ok: false, errors: ['Expected an object with a "subjects" array (each entry having "topics", optionally "subtopics"), or a plain array of subject names.'], added: 0 };
  }
  normaliseNodes(structure, null, {});

  let added = 0;
  const idByTitle = new Map();
  if (replace) await db.clearStore(STORES.SYLLABUS);
  const pathKeyOf = (item) => {
    const parts = [];
    let cursor = item;
    while (cursor) {
      parts.unshift(cursor.title);
      cursor = cursor.parent;
    }
    return parts.join(' > ');
  };

  for (const item of items) {
    const parentId = item.parent ? idByTitle.get(pathKeyOf(item.parent)) || null : null;
    const created = await addSyllabusItem({
      parentId,
      title: item.title,
      source: item.node?.source || source,
      priority: item.node?.priority || 'medium',
      target_date: item.node?.target_date || null,
      notes: item.node?.notes || null,
      // An export carries each item's status so progress can be restored;
      // anything unrecognised starts as not started.
      status: item.node?.status || 'not_started',
    });
    idByTitle.set(pathKeyOf(item), created.id);
    added += 1;
  }
  return { ok: errors.length === 0, errors, added, items };
}

export async function exportSyllabus() {
  const rows = await listSyllabus();
  const tree = buildTree(rows);
  const serialise = (nodes) =>
    nodes.map((n) => ({
      title: n.title,
      status: n.status,
      priority: n.priority,
      target_date: n.target_date,
      notes: n.notes || undefined,
      topics: n.children?.length ? serialise(n.children) : undefined,
    }));
  return {
    format: 'mymppsc-syllabus',
    format_version: '1.0.0',
    exported_at: nowIso(),
    notes: 'Your own syllabus items with their status, priority, target date and notes. Importing restores all of them; remove the status fields to import as a fresh structure.',
    subjects: serialise(tree),
  };
}

/** Create syllabus nodes from the question bank's classifications (suggestions). */
export async function bootstrapFromBank({ onlySubjects = null } = {}) {
  const existing = await listSyllabus();
  const existingKeys = new Set(existing.map((r) => `${r.subtitle || ''}|${r.title}`));
  let created = 0;
  for (const subjectNode of state.subjects) {
    if (onlySubjects && !onlySubjects.includes(subjectNode.subject)) continue;
    if (subjectNode.subject === 'Unclassified') continue;
    let subjectRow = existing.find((r) => r.level === 'subject' && r.title === subjectNode.subject);
    if (!subjectRow) {
      subjectRow = await addSyllabusItem({ title: subjectNode.subject, subject: subjectNode.subject, source: 'question-bank' });
      created += 1;
    }
    for (const topicNode of subjectNode.topics) {
      if (topicNode.topic === 'Unclassified') continue;
      let topicRow = (await listSyllabus()).find((r) => r.level === 'topic' && r.parent_id === subjectRow.id && r.title === topicNode.topic);
      if (!topicRow) {
        topicRow = await addSyllabusItem({ parentId: subjectRow.id, title: topicNode.topic, subject: subjectNode.subject, topic: topicNode.topic, source: 'question-bank' });
        created += 1;
      }
      for (const subNode of topicNode.subtopics || []) {
        const key = `subtitle|${subNode.subtopic}`;
        const already = (await listSyllabus()).find((r) => r.parent_id === topicRow.id && r.title === subNode.subtopic);
        if (!already && !existingKeys.has(key)) {
          await addSyllabusItem({ parentId: topicRow.id, title: subNode.subtopic, subject: subjectNode.subject, topic: topicNode.topic, subtopic: subNode.subtopic, source: 'question-bank' });
          created += 1;
        }
      }
    }
  }
  return { created };
}

/**
 * Completion percentages plus (clearly separate) question-bank linkage.
 * Bank linkage is informational: it never changes a status.
 */
export function syllabusProgress(rows, analytics) {
  const rowsById = new Map(rows.map((r) => [r.id, r]));
  const byBankPath = new Map();
  if (analytics) {
    for (const topic of analytics.byTopic) {
      byBankPath.set(`${topic.subject}||${topic.topic}`, topic);
    }
  }
  const progressOf = (row) => {
    const own = statusScore(row.status);
    const children = rows.filter((r) => r.parent_id === row.id);
    if (!children.length) return { completion: own };
    const childAverage = children.reduce((acc, child) => acc + progressOf(child).completion, 0) / children.length;
    // A node's own status counts as half of its completion so that manual
    // progress on a parent is visible without pretending its children are done.
    return { completion: (own + childAverage) / 2 };
  };
  return {
    total: rows.length,
    byStatus: rows.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {}),
    overallCompletion: (() => {
      const roots = rows.filter((r) => !r.parent_id);
      if (roots.length) return roots.reduce((acc, r) => acc + progressOf(r).completion, 0) / roots.length;
      return rows.length ? rows.reduce((acc, r) => acc + statusScore(r.status), 0) / rows.length : 0;
    })(),
    nodes: rows.map((row) => {
      const bank = row.level === 'topic' && row.subject && row.topic ? byBankPath.get(`${row.subject}||${row.topic}`) : null;
      return {
        ...row,
        completion: progressOf(row).completion,
        bank: bank
          ? {
              available: bank.available,
              attemptedUnique: bank.attemptedUnique,
              accuracy: Number.isFinite(bank.accuracy) ? bank.accuracy : null,
              scored: bank.scored,
              verdict: bank.verdict,
            }
          : null,
        children: rows.filter((r) => r.parent_id === row.id).length,
        parent: row.parent_id ? rowsById.get(row.parent_id)?.title || null : null,
      };
    }),
  };
}

/**
 * Completion weight of a status. Kept in step with `syllabus-hub.js`, which
 * owns the merged vocabulary — this module cannot import it without a cycle.
 * `revising` is the legacy spelling of `in_progress` and, as there, is not a
 * done state.
 */
function statusScore(status) {
  return { not_started: 0, in_progress: 0.4, revising: 0.4, completed: 1, revised: 1 }[status] ?? 0;
}

/* ----------------------------------------------------------------- tasks -- */

export async function createTask({ title, type = 'study', syllabus_id = null, due_date = null, priority = 'medium', estimate_minutes = 30, notes = null, subject = null, topic = null, linked_question_ids = [] }) {
  if (!title || !String(title).trim()) throw new Error('A task needs a title.');
  const task = {
    id: uid('task'),
    title: String(title).trim(),
    type,
    syllabus_id,
    subject,
    topic,
    due_date: due_date || todayKey(),
    priority,
    estimate_minutes,
    notes,
    status: 'todo',
    linked_question_ids,
    created_at: nowIso(),
    updated_at: nowIso(),
    completed_at: null,
  };
  await db.put(STORES.TASKS, task);
  return task;
}

export async function updateTask(id, patch) {
  const task = await db.get(STORES.TASKS, id);
  if (!task) throw new Error('That task no longer exists.');
  const updated = { ...task, ...patch, updated_at: nowIso() };
  if (patch.status === 'done' && task.status !== 'done') updated.completed_at = nowIso();
  if (patch.status && patch.status !== 'done') updated.completed_at = null;
  await db.put(STORES.TASKS, updated);
  return updated;
}

/**
 * Complete a task. Syllabus progress only moves when the caller explicitly asks
 * for it, because a task finishing does not mean a syllabus topic is mastered.
 */
export async function completeTask(id, { markSyllabus = 'none', syllabusStatus = 'in_progress' } = {}) {
  const task = await db.get(STORES.TASKS, id);
  if (!task) throw new Error('That task no longer exists.');
  const updated = await updateTask(id, { status: 'done' });
  let syllabusUpdate = null;
  if (markSyllabus !== 'none' && task.syllabus_id) {
    const row = await db.get(STORES.SYLLABUS, task.syllabus_id);
    if (row) {
      const nextStatus = markSyllabus === 'complete' ? 'completed' : syllabusStatus;
      if (statusScore(nextStatus) > statusScore(row.status) || markSyllabus !== 'none') {
        syllabusUpdate = await updateSyllabusItem(row.id, { status: nextStatus, status_source: 'task' });
      }
    }
  }
  return { task: updated, syllabusUpdate };
}

export async function deleteTask(id) {
  await db.remove(STORES.TASKS, id);
  return true;
}

export async function listTasks({ status = null, from = null, to = null } = {}) {
  let rows = await db.getAll(STORES.TASKS);
  if (status) rows = Array.isArray(status) ? rows.filter((t) => status.includes(t.status)) : rows.filter((t) => t.status === status);
  if (from) rows = rows.filter((t) => (t.due_date || '') >= from);
  if (to) rows = rows.filter((t) => (t.due_date || '') <= to);
  const priorityWeight = { high: 0, medium: 1, low: 2 };
  return rows.sort((a, b) => {
    const da = a.due_date || '9999-99-99';
    const db_ = b.due_date || '9999-99-99';
    if (da !== db_) return da < db_ ? -1 : 1;
    return (priorityWeight[a.priority] ?? 1) - (priorityWeight[b.priority] ?? 1);
  });
}

export async function taskBuckets(reference = new Date()) {
  const rows = await listTasks({ status: ['todo', 'in_progress'] });
  const today = todayKey(reference);
  return {
    overdue: rows.filter((t) => t.due_date && t.due_date < today),
    today: rows.filter((t) => t.due_date === today),
    upcoming: rows.filter((t) => t.due_date && t.due_date > today),
    undated: rows.filter((t) => !t.due_date),
  };
}

/**
 * Suggest study tasks from real weaknesses. Suggestions are never auto-created
 * without the user pressing the button.
 */
export function suggestTasks({ analytics, syllabusProgressData = null, limit = 6 }) {
  const suggestions = [];
  const syllabusByTopic = new Map((syllabusProgressData?.nodes || []).filter((n) => n.level === 'topic').map((n) => [`${n.subject}||${n.topic}`, n]));
  for (const topic of analytics.weakTopics.slice(0, limit)) {
    const syllabus = syllabusByTopic.get(topic.key) || null;
    suggestions.push({
      title: `Revise: ${topic.topic}${topic.subject ? ` (${topic.subject})` : ''}`,
      type: 'revision',
      subject: topic.subject,
      topic: topic.topic,
      syllabus_id: syllabus?.id || null,
      priority: 'high',
      basis: `Accuracy ${Math.round((topic.accuracy || 0) * 100)}% over ${topic.scored} scored answers, with ${topic.available} question(s) available in the bank.`,
      linked_question_ids: [],
    });
  }
  for (const topic of analytics.neverAttemptedTopics.slice(0, limit)) {
    if (suggestions.length >= limit * 2) break;
    suggestions.push({
      title: `First practice: ${topic.topic}${topic.subject ? ` (${topic.subject})` : ''}`,
      type: 'practice',
      subject: topic.subject,
      topic: topic.topic,
      priority: 'medium',
      basis: `${topic.available} question(s) in the bank for this topic, none attempted yet.`,
      linked_question_ids: [],
    });
  }
  for (const topic of analytics.underPractised.slice(0, limit)) {
    if (suggestions.length >= limit * 2) break;
    suggestions.push({
      title: `Widen coverage: ${topic.topic}`,
      type: 'practice',
      subject: topic.subject,
      topic: topic.topic,
      priority: 'medium',
      basis: `Only ${Math.round(topic.coverage * 100)}% of the ${topic.available} stored questions attempted.`,
      linked_question_ids: [],
    });
  }
  return suggestions.slice(0, limit);
}

/* -------------------------------------------------------- study sessions -- */

export async function logSession({ minutes, category = 'study', subject = null, topic = null, syllabus_id = null, notes = null, started_at = null, ended_at = null }) {
  const session = {
    id: uid('sess'),
    minutes: Math.max(1, Math.round(minutes || 0)),
    category,
    subject,
    topic,
    syllabus_id,
    notes,
    started_at: started_at || nowIso(),
    ended_at: ended_at || nowIso(),
    created_at: nowIso(),
  };
  if (session.started_at && session.ended_at) {
    const computed = Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 60000);
    if (computed > 0) session.minutes = Math.max(session.minutes, computed);
  }
  await db.put(STORES.SESSIONS, session);
  return session;
}

export async function listSessions({ limit = 200 } = {}) {
  const rows = await db.getAll(STORES.SESSIONS);
  return rows.sort((a, b) => (a.started_at < b.started_at ? 1 : -1)).slice(0, limit);
}

export function sessionsByDay(sessions, days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = todayKey(addDays(new Date(), -i));
    const rows = sessions.filter((s) => (s.started_at || '').slice(0, 10) === key);
    out.push({ date: key, minutes: rows.reduce((acc, s) => acc + (s.minutes || 0), 0), sessions: rows.length });
  }
  return out;
}

export async function studyTotals() {
  const sessions = await db.getAll(STORES.SESSIONS);
  const total = sessions.reduce((acc, s) => acc + (s.minutes || 0), 0);
  const last7 = sessions.filter((s) => daysBetween(new Date(s.started_at), new Date()) <= 7);
  return {
    totalMinutes: total,
    last7Minutes: last7.reduce((acc, s) => acc + (s.minutes || 0), 0),
    sessions: sessions.length,
    avgMinutesPerSession: sessions.length ? round(total / sessions.length, 1) : 0,
  };
}
