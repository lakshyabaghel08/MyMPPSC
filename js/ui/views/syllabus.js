/**
 * syllabus.js (view) — Syllabus & Study Planner.
 *
 * No syllabus content ships with this app and none is hard-coded: the structure
 * is whatever you import or type yourself. Progress is always marked as manual,
 * and question-bank statistics are shown separately from your own status.
 */

import { state } from '../../core/state.js';
import { esc, badge, card, notice, emptyState, toast, openModal, confirmDialog, kpi, pageHead, sectionHead, ring, sourceChip, progressBar } from '../components.js';
import { fmtDate, todayKey, readFileAsText, downloadJson } from '../../core/util.js';
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

export default {
  title: 'Syllabus & Study Planner',

  async render(ctx) {
    const rows = await planner.listSyllabus();
    const { analytics } = await loadAnalytics();
    const progress = planner.syllabusProgress(rows, analytics);
    const progressById = new Map(progress.nodes.map((n) => [n.id, n]));
    const tree = planner.buildTree(rows);

    return `
      ${pageHead({
        title: 'Syllabus &amp; Study Planner',
        description: 'The tree below contains only what you import or type — no syllabus ships with this app. Progress status is manual; question-bank statistics sit beside it and never change a status on their own.',
        actions: `<button class="btn btn-primary" type="button" id="sylAddRoot">Add a subject</button>`,
      })}
      ${notice(
        'No syllabus is built into MyMPPSC and none is hard-coded anywhere in the code. Question-bank statistics are shown next to your manual status and never change it.',
        'info',
      )}

      <div class="kpi-grid">
        ${kpi({ label: 'Syllabus items', value: String(progress.total), context: Object.entries(planner.STATUSES).map(([k, l]) => `${progress.byStatus[k] || 0} ${l.toLowerCase()}`).join(' · '), iconName: 'syllabus', foot: sourceChip('supplied', 'user-defined tree') })}
        ${kpi({ label: 'Overall completion', value: `${Math.round(progress.overallCompletion * 100)}%`, context: 'average of your marked statuses', iconName: 'target', foot: sourceChip('derived', 'manual status completion') })}
        ${kpi({ label: 'High priority', value: String(rows.filter((r) => r.priority === 'high').length), context: 'items you flagged as high priority', tone: rows.some((r) => r.priority === 'high') ? 'warn' : '', iconName: 'flame', foot: sourceChip('supplied', 'your own marking') })}
        ${kpi({ label: 'Dates approaching', value: String(rows.filter((r) => r.target_date && r.target_date >= todayKey()).length), context: 'items with a target date still ahead', iconName: 'calendar', foot: sourceChip('supplied', 'targets you set') })}
      </div>

      ${sectionHead({ title: 'Syllabus structure', kicker: 'Plan', meta: rows.length ? `${rows.length} item(s) · ${rows.filter((r) => r.source === 'question-bank').length} suggested from the bank` : 'Nothing added yet', actions: `
          <button class="btn btn-sm" type="button" id="sylBootstrap">Suggest from question bank</button>
          <button class="btn btn-sm" type="button" id="sylImport">Import JSON</button>
          <button class="btn btn-sm btn-quiet" type="button" id="sylExport">Export</button>
          <input type="file" id="sylFile" accept="application/json,.json" hidden />` })}
      ${card({
        actions: `
          <button class="btn btn-sm btn-primary" type="button" id="sylAddRoot">Add a subject</button>
          <button class="btn btn-sm" type="button" id="sylBootstrap">Suggest from question bank</button>
          <button class="btn btn-sm" type="button" id="sylImport">Import JSON</button>
          <button class="btn btn-sm btn-quiet" type="button" id="sylExport">Export</button>
          <input type="file" id="sylFile" accept="application/json,.json" hidden />`,
        body: rows.length
          ? `<div class="split-2 relaxed">
              <div>
                <div class="syllabus-tree">${renderNodes(tree, progressById)}</div>
                <p class="tiny muted mt-3 mb-0">${rows.filter((r) => r.source === 'question-bank').length} item(s) were suggested from your question bank classifications. Those are a copy of your imported data, not an official syllabus.</p>
              </div>
              <div class="ring-panel">
                ${ring(progress.overallCompletion, { label: 'Overall completion', sub: `${Math.round(progress.overallCompletion * 100)}% marked complete`, size: 132, width: 11 })}
                ${progressBar(progress.overallCompletion, '')}
                <p class="tiny muted m-0">Averaged from the manual status you set on each item. Bank statistics never move this value.</p>
              </div>
            </div>`
          : emptyState({
              title: 'No syllabus items yet',
              message: 'Import a JSON structure you made yourself, generate a starting point from the subjects and topics already classified in your question bank, or add items one by one.',
              action: '<button class="btn btn-primary" type="button" id="sylBootstrap2">Suggest from question bank</button>',
            }),
      })}`;
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

    root.addEventListener('click', async (ev) => {
      const target = ev.target.closest('[data-toggle-node],[data-add-child],[data-edit-node],[data-delete-node]');
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
          message: `“${esc(node?.title || '')}”${children ? ` and its ${children} child item(s)` : ''} will be removed. Question-bank data is untouched.`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        await planner.deleteSyllabusItem(d.deleteNode, { withChildren: true });
        toast('Syllabus item deleted.', 'info');
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
