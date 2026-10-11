/**
 * syllabus.js (view) — Syllabus & Study Planner.
 *
 * No syllabus content ships with this app and none is hard-coded: the structure
 * is whatever you import or type yourself. Progress is always marked as manual,
 * and question-bank statistics are shown separately from your own status.
 */

import { state } from '../../core/state.js';
import { esc, badge, card, tile, notice, dataTable, emptyState, toast, openModal, confirmDialog, lineChart } from '../components.js';
import { fmtDate, fmtDuration, fmtRelative, todayKey } from '../../core/util.js';
import { readFileAsText, downloadJson } from '../../core/util.js';
import * as planner from '../../services/planner.js';
import { loadAnalytics } from '../../services/analytics.js';

const viewState = { expanded: new Set(), collapsed: new Set() };

/** Top-level branches are open by default; any branch can be collapsed or opened by hand. */
function nodeExpanded(node, depth) {
  if (viewState.collapsed.has(node.id)) return false;
  return viewState.expanded.has(node.id) || depth === 0;
}

function statusSelect(row) {
  return `<select class="status-select" data-syllabus-status="${esc(row.id)}" aria-label="Status for ${esc(row.title)}">
    ${Object.entries(planner.STATUSES).map(([key, label]) => `<option value="${esc(key)}" ${row.status === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}
  </select>`;
}

function nodeRow(row, progressNode, depth, expanded) {
  const hasChildren = (progressNode?.children || 0) > 0;
  const completion = progressNode?.completion ?? 0;
  const bank = progressNode?.bank;
  return `
    <div class="syllabus-row depth-${Math.min(depth, 4)}">
      <div class="syllabus-main">
        <div class="syllabus-title">
          ${hasChildren ? `<button class="btn btn-quiet btn-icon" type="button" data-toggle-node="${esc(row.id)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="Expand or collapse">${expanded ? '▾' : '▸'}</button>` : '<span class="spacer"></span>'}
          <span class="level-chip">${esc(row.level)}</span>
          <strong>${esc(row.title)}</strong>
          ${row.source === 'question-bank' ? badge('from question bank', 'info') : row.source === 'user' ? '' : badge(esc(row.source || 'imported'), '')}
          ${row.priority === 'high' ? badge('high priority', 'warn') : ''}
          ${completion > 0 ? badge(`${Math.round(completion * 100)}% complete`, completion >= 1 ? 'ok' : '') : ''}
        </div>
        <div class="syllabus-meta tiny muted">
          ${row.target_date ? `target ${esc(fmtDate(row.target_date))} · ` : ''}${bank ? `${bank.available} question(s) in this topic · ${bank.attemptedUnique} attempted${bank.scored >= 3 ? ` · ${Math.round(bank.accuracy * 100)}% accuracy` : ' · too few attempts to judge'}` : 'no linked questions in the bank'}
        </div>
      </div>
      <div class="syllabus-actions">
        ${statusSelect(row)}
        <button class="btn btn-sm" type="button" data-add-child="${esc(row.id)}">Add child</button>
        <button class="btn btn-sm" type="button" data-edit-node="${esc(row.id)}">Edit</button>
        <button class="btn btn-sm btn-quiet" type="button" data-delete-node="${esc(row.id)}">Delete</button>
      </div>
    </div>`;
}

function renderNodes(nodes, progressById, depth = 0, out = []) {
  for (const node of nodes) {
    const expanded = node.children?.length ? nodeExpanded(node, depth) : false;
    out.push(nodeRow(node, progressById.get(node.id), depth, expanded));
    if (expanded) renderNodes(node.children, progressById, depth + 1, out);
  }
  return out.join('');
}

function taskCard(buckets) {
  const section = (label, tone, rows) =>
    rows.length
      ? `<h4 class="task-section ${tone}">${esc(label)} <span class="soft">(${rows.length})</span></h4>
         ${dataTable({
           columns: [{ label: 'Task' }, { label: 'Due' }, { label: 'Est.' }, { label: '' }],
           rows: rows.map((t) => [
             `<strong>${esc(t.title)}</strong>${t.subject ? `<div class="tiny muted">${esc(t.subject)}${t.topic ? ` · ${esc(t.topic)}` : ''}</div>` : ''}${t.notes ? `<div class="tiny muted">${esc(t.notes.split('\n')[0])}</div>` : ''}`,
             t.due_date ? esc(fmtDate(t.due_date)) : '<span class="soft">no date</span>',
             `${esc(String(t.estimate_minutes || 30))} min`,
             `<div class="row tight"><button class="btn btn-sm" type="button" data-task-done="${esc(t.id)}">Done</button><button class="btn btn-sm btn-quiet" type="button" data-task-delete="${esc(t.id)}">Delete</button></div>`,
           ]),
           empty: '—',
           className: 'compact',
         })}`
      : '';
  return `
    ${section('Overdue', 'bad', buckets.overdue)}
    ${section('Due today', 'warn', buckets.today)}
    ${section('Upcoming', '', buckets.upcoming)}
    ${section('No date set', 'soft', buckets.undated)}
    ${!buckets.overdue.length && !buckets.today.length && !buckets.upcoming.length && !buckets.undated.length ? '<p class="muted small">No open tasks.</p>' : ''}`;
}

export default {
  title: 'Syllabus & Study Planner',

  async render(ctx) {
    const rows = await planner.listSyllabus();
    const { analytics } = await loadAnalytics();
    const progress = planner.syllabusProgress(rows, analytics);
    const progressById = new Map(progress.nodes.map((n) => [n.id, n]));
    const tree = planner.buildTree(rows);
    const [buckets, sessions, totals, tasks] = await Promise.all([planner.taskBuckets(), planner.listSessions({ limit: 40 }), planner.studyTotals(), planner.listTasks({})]);
    const suggestions = planner.suggestTasks({ analytics, syllabusProgressData: progress, limit: 5 });
    const byDay = planner.sessionsByDay(sessions, 14);

    const recentSessions = sessions.slice(0, 12).map((s) => [
      esc(fmtRelative(s.started_at)),
      esc(s.category),
      `${esc(String(s.minutes))} min`,
      esc([s.subject, s.topic].filter(Boolean).join(' · ') || '—'),
      esc(s.notes || '—'),
    ]);

    return `
      <h1>Syllabus &amp; Study Planner</h1>
      ${notice(
        'No syllabus is built into MyMPPSC and none is hard-coded anywhere in the code. The tree below contains only what you import or type. Progress status is manual; question-bank statistics are shown next to it and never change a status on their own.',
        'info',
      )}

      <div class="grid tiles" style="margin-bottom:16px">
        ${tile({ label: 'Syllabus items', value: String(progress.total), sub: `${Object.entries(planner.STATUSES).map(([k, l]) => `${progress.byStatus[k] || 0} ${l.toLowerCase()}`).join(' · ')}` })}
        ${tile({ label: 'Overall completion', value: `${Math.round(progress.overallCompletion * 100)}%`, sub: 'average of your marked statuses' })}
        ${tile({ label: 'Open tasks', value: String(buckets.overdue.length + buckets.today.length + buckets.upcoming.length + buckets.undated.length), sub: `${buckets.overdue.length} overdue`, tone: buckets.overdue.length ? 'bad' : '' })}
        ${tile({ label: 'Study time logged', value: fmtDuration(totals.totalMinutes * 60), sub: `${totals.sessions} session(s) · ${totals.last7Minutes} min in 7 days` })}
      </div>

      ${card({
        title: 'Syllabus structure',
        actions: `
          <button class="btn btn-sm btn-primary" type="button" id="sylAddRoot">Add a subject</button>
          <button class="btn btn-sm" type="button" id="sylBootstrap">Suggest from question bank</button>
          <button class="btn btn-sm" type="button" id="sylImport">Import JSON</button>
          <button class="btn btn-sm btn-quiet" type="button" id="sylExport">Export</button>
          <input type="file" id="sylFile" accept="application/json,.json" hidden />`,
        body: rows.length
          ? `<div class="syllabus-tree">${renderNodes(tree, progressById)}</div>
             <p class="tiny muted" style="margin-top:10px">${rows.filter((r) => r.source === 'question-bank').length} item(s) were suggested from your question bank classifications. Those are a copy of your imported data, not an official syllabus.</p>`
          : emptyState({
              title: 'No syllabus items yet',
              message: 'Import a JSON structure you made yourself, generate a starting point from the subjects and topics already classified in your question bank, or add items one by one.',
              action: '<button class="btn btn-primary" type="button" id="sylBootstrap2">Suggest from question bank</button>',
            }),
      })}

      <div class="split-2">
        <div>
          ${card({
            title: 'Tasks',
            actions: `<button class="btn btn-sm btn-primary" type="button" id="taskAdd">New task</button>`,
            body: taskCard(buckets),
            footer: 'Tasks are reminders you create. Nothing is generated in the background — suggestions below must be added by you.',
          })}

          ${card({
            title: 'Suggested tasks',
            subtitle: 'Derived from your recorded weak areas, coverage and syllabus status',
            body: suggestions.length
              ? dataTable({
                  columns: [{ label: 'Suggestion' }, { label: 'Basis' }, { label: '' }],
                  rows: suggestions.map((s, i) => [
                    `<strong>${esc(s.title)}</strong><div class="tiny muted">${esc(s.type)} · ${esc(s.priority)} priority</div>`,
                    `<span class="tiny">${esc(s.basis)}</span>`,
                    `<button class="btn btn-sm" type="button" data-add-suggestion="${i}">Add</button>`,
                  ]),
                  className: 'compact',
                })
              : '<p class="muted small">Not enough recorded evidence yet to suggest anything. Attempt more questions first.</p>',
          })}
        </div>

        <div>
          ${card({
            title: 'Log a study session',
            body: `
              <form id="sessionForm" class="field-row">
                <label class="field"><span class="label-text">Minutes</span><input type="number" min="1" step="5" id="sessMinutes" value="30" style="width:90px" /></label>
                <label class="field"><span class="label-text">Activity</span>
                  <select id="sessCategory">
                    <option value="study">Reading / notes</option>
                    <option value="practice">Practice questions</option>
                    <option value="revision">Revision</option>
                    <option value="test">Test</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label class="field"><span class="label-text">Subject (optional)</span><input type="text" id="sessSubject" /></label>
                <label class="field"><span class="label-text">Topic (optional)</span><input type="text" id="sessTopic" /></label>
                <label class="field" style="flex:1 1 100%"><span class="label-text">Notes (optional)</span><input type="text" id="sessNotes" /></label>
                <button class="btn btn-primary" type="submit">Log session</button>
              </form>`,
          })}

          ${card({
            title: 'Study minutes per day',
            subtitle: 'Last 14 days',
            body: byDay.some((d) => d.minutes)
              ? lineChart({ points: byDay.map((d) => ({ label: d.date.slice(5), value: d.minutes })), height: 150, yFormat: (v) => `${Math.round(v)}m`, yMax: Math.max(30, ...byDay.map((d) => d.minutes)) })
              : '<p class="muted small">No sessions logged yet.</p>',
          })}

          ${card({
            title: 'Recent sessions',
            body: dataTable({
              columns: [{ label: 'When' }, { label: 'Activity' }, { label: 'Time', num: true }, { label: 'Focus' }, { label: 'Notes' }],
              rows: recentSessions,
              empty: 'No sessions logged yet.',
              className: 'compact',
            }),
          })}
        </div>
      </div>`;
  },

  async mount(ctx, root) {
    const rerender = () => ctx.refresh();

    const askNode = async ({ title, node = null }) => {
      const value = await openModal({
        title,
        body: `
          <label class="field"><span class="label-text">Title</span><input type="text" id="sylTitle" value="${esc(node?.title || '')}" /></label>
          <label class="field"><span class="label-text">Priority</span>
            <select id="sylPriority">${['high', 'medium', 'low'].map((p) => `<option value="${p}" ${node?.priority === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
          </label>
          <label class="field"><span class="label-text">Target date (optional)</span><input type="date" id="sylTarget" value="${esc(node?.target_date || '')}" /></label>
          <label class="field"><span class="label-text">Notes (optional)</span><textarea id="sylNotes" rows="2">${esc(node?.notes || '')}</textarea></label>`,
        actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Save', tone: 'btn-primary', value: 'ok' }],
      });
      if (value !== 'ok') return null;
      const title2 = document.getElementById('sylTitle')?.value.trim();
      if (!title2) {
        toast('A syllabus item needs a title.', 'warn');
        return null;
      }
      return {
        title: title2,
        priority: document.getElementById('sylPriority')?.value || 'medium',
        target_date: document.getElementById('sylTarget')?.value || null,
        notes: document.getElementById('sylNotes')?.value || null,
      };
    };

    const addRoot = async () => {
      const data = await askNode({ title: 'Add a syllabus subject' });
      if (!data) return;
      await planner.addSyllabusItem({ parentId: null, title: data.title, priority: data.priority, target_date: data.target_date, notes: data.notes, source: 'user' });
      toast('Syllabus item added.', 'ok');
      await rerender();
    };
    document.getElementById('sylAddRoot')?.addEventListener('click', addRoot);

    const bootstrap = async () => {
      const ok = await confirmDialog({
        title: 'Create syllabus items from the question bank?',
        message: `This copies the <strong>subjects and topics that exist in your imported question bank</strong> (${state.subjects.length} subject(s)) into the planner as a starting structure. It is a suggestion based on your own data, not an official MPPSC syllabus. Items already present are left untouched.`,
        confirmLabel: 'Create items',
      });
      if (!ok) return;
      const result = await planner.bootstrapFromBank({});
      toast(result.created ? `${result.created} syllabus item(s) created.` : 'Nothing new to add — the structure already exists.', result.created ? 'ok' : 'info');
      await rerender();
    };
    document.getElementById('sylBootstrap')?.addEventListener('click', bootstrap);
    document.getElementById('sylBootstrap2')?.addEventListener('click', bootstrap);

    document.getElementById('sylExport')?.addEventListener('click', async () => {
      const payload = await planner.exportSyllabus();
      downloadJson(payload, `mymppsc-syllabus-${todayKey()}.json`);
      toast('Syllabus exported.', 'ok');
    });

    document.getElementById('sylImport')?.addEventListener('click', () => document.getElementById('sylFile')?.click());
    document.getElementById('sylFile')?.addEventListener('change', async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const text = await readFileAsText(file);
        const parsed = JSON.parse(text);
        const nodes = parsed.subjects || parsed.items || parsed;
        const result = await planner.importSyllabus(nodes, { replace: false, source: 'imported' });
        if (!result.added) {
          toast(`Nothing was imported. ${result.errors.join(' ')}`, 'warn');
        } else {
          toast(`${result.added} syllabus item(s) imported.${result.errors.length ? ` ${result.errors.length} problem(s): ${result.errors.slice(0, 2).join(' ')}` : ''}`, 'ok');
        }
        await rerender();
      } catch (err) {
        toast(`The syllabus file could not be read: ${err.message}`, 'bad');
      } finally {
        ev.target.value = '';
      }
    });

    document.getElementById('taskAdd')?.addEventListener('click', async () => {
      const value = await openModal({
        title: 'New study task',
        body: `
          <label class="field"><span class="label-text">What will you do?</span><input type="text" id="taskTitle" placeholder="e.g. Revise Fundamental Rights" /></label>
          <div class="field-row">
            <label class="field"><span class="label-text">Type</span>
              <select id="taskType">
                <option value="study">Study</option>
                <option value="practice">Practice</option>
                <option value="revision">Revision</option>
                <option value="test">Test</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label class="field"><span class="label-text">Due date</span><input type="date" id="taskDue" value="${esc(todayKey())}" /></label>
            <label class="field"><span class="label-text">Estimate (minutes)</span><input type="number" min="5" step="5" id="taskEstimate" value="30" /></label>
            <label class="field"><span class="label-text">Priority</span>
              <select id="taskPriority"><option value="high">High</option><option value="medium" selected>Medium</option><option value="low">Low</option></select>
            </label>
          </div>
          <label class="field"><span class="label-text">Notes (optional)</span><textarea id="taskNotes" rows="2"></textarea></label>`,
        actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Create task', tone: 'btn-primary', value: 'ok' }],
      });
      if (value !== 'ok') return;
      const title = document.getElementById('taskTitle')?.value.trim();
      if (!title) {
        toast('Give the task a title.', 'warn');
        return;
      }
      await planner.createTask({
        title,
        type: document.getElementById('taskType')?.value || 'study',
        due_date: document.getElementById('taskDue')?.value || null,
        estimate_minutes: Number(document.getElementById('taskEstimate')?.value) || 30,
        priority: document.getElementById('taskPriority')?.value || 'medium',
        notes: document.getElementById('taskNotes')?.value || null,
      });
      toast('Task created.', 'ok');
      await rerender();
    });

    document.getElementById('sessionForm')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const minutes = Number(document.getElementById('sessMinutes')?.value) || 0;
      if (minutes <= 0) {
        toast('Enter how many minutes you studied.', 'warn');
        return;
      }
      await planner.logSession({
        minutes,
        category: document.getElementById('sessCategory')?.value || 'study',
        subject: document.getElementById('sessSubject')?.value.trim() || null,
        topic: document.getElementById('sessTopic')?.value.trim() || null,
        notes: document.getElementById('sessNotes')?.value.trim() || null,
      });
      toast('Session logged.', 'ok');
      await rerender();
    });

    root.addEventListener('click', async (ev) => {
      const target = ev.target.closest('[data-toggle-node],[data-add-child],[data-edit-node],[data-delete-node],[data-task-done],[data-task-delete],[data-add-suggestion]');
      if (!target) return;
      const d = target.dataset;

      if (d.toggleNode) {
        const isOpen = viewState.expanded.has(d.toggleNode) || (root.querySelector(`[data-toggle-node="${d.toggleNode}"]`)?.getAttribute('aria-expanded') === 'true');
        if (isOpen) {
          viewState.expanded.delete(d.toggleNode);
          viewState.collapsed.add(d.toggleNode);
        } else {
          viewState.collapsed.delete(d.toggleNode);
          viewState.expanded.add(d.toggleNode);
        }
        await rerender();
        return;
      }
      if (d.addChild) {
        const data = await askNode({ title: 'Add a child item' });
        if (!data) return;
        await planner.addSyllabusItem({ parentId: d.addChild, title: data.title, priority: data.priority, target_date: data.target_date, notes: data.notes, source: 'user' });
        viewState.collapsed.delete(d.addChild);
        viewState.expanded.add(d.addChild);
        toast('Syllabus item added.', 'ok');
        await rerender();
        return;
      }
      if (d.editNode) {
        const rows = await planner.listSyllabus();
        const node = rows.find((r) => r.id === d.editNode);
        if (!node) return;
        const data = await askNode({ title: 'Edit syllabus item', node });
        if (!data) return;
        await planner.updateSyllabusItem(node.id, data);
        toast('Syllabus item updated.', 'ok');
        await rerender();
        return;
      }
      if (d.deleteNode) {
        const rows = await planner.listSyllabus();
        const node = rows.find((r) => r.id === d.deleteNode);
        const children = planner.descendants(rows, d.deleteNode).length;
        const ok = await confirmDialog({
          title: 'Delete this syllabus item?',
          message: `“${esc(node?.title || '')}”${children ? ` and its ${children} child item(s)` : ''} will be removed. Tasks linked to it stay, but their link is cleared. Question-bank data is untouched.`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        await planner.deleteSyllabusItem(d.deleteNode, { withChildren: true });
        toast('Syllabus item deleted.', 'info');
        await rerender();
        return;
      }
      if (d.taskDone) {
        const value = await openModal({
          title: 'Finish this task',
          body: `<label class="field"><span class="label-text">Also update the linked syllabus item status?</span>
            <select id="doneMark"><option value="none">No, leave the syllabus item as it is</option><option value="in_progress">Mark it in progress</option><option value="completed">Mark it completed</option></select></label>`,
          actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Mark done', tone: 'btn-primary', value: 'ok' }],
        });
        if (value !== 'ok') return;
        await planner.completeTask(d.taskDone, { markSyllabus: document.getElementById('doneMark')?.value || 'none' });
        toast('Task marked done.', 'ok');
        await rerender();
        return;
      }
      if (d.taskDelete) {
        const ok = await confirmDialog({ title: 'Delete this task?', message: 'The task is removed. Nothing else is affected.', confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        await planner.deleteTask(d.taskDelete);
        await rerender();
        return;
      }
      if (d.addSuggestion) {
        const { analytics } = await loadAnalytics();
        const progressData = planner.syllabusProgress(await planner.listSyllabus(), analytics);
        const suggestion = planner.suggestTasks({ analytics, syllabusProgressData: progressData, limit: 5 })[Number(d.addSuggestion)];
        if (!suggestion) return;
        await planner.createTask({
          title: suggestion.title,
          type: suggestion.type,
          syllabus_id: suggestion.syllabus_id,
          subject: suggestion.subject,
          topic: suggestion.topic,
          priority: suggestion.priority,
          due_date: todayKey(),
          notes: suggestion.basis,
        });
        toast('Suggested task added.', 'ok');
        await rerender();
      }
    });

    root.addEventListener('change', async (ev) => {
      const select = ev.target.closest('[data-syllabus-status]');
      if (!select) return;
      await planner.updateSyllabusItem(select.dataset.syllabusStatus, { status: select.value, status_source: 'manual' });
      toast('Status updated.', 'ok');
      await rerender();
    });
  },
};
