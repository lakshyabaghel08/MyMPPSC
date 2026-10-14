/**
 * syllabus-progress.test.js — progress tracking and My plan in the Syllabus section.
 *
 * Regression tests for what the Syllabus section got wrong before this
 * revision, and for the "add it to My plan" feature it gained:
 *
 *  * a dialog handed back nothing that was typed into it (every new plan item
 *    "needed a title", and editing a plan saved its defaults over it);
 *  * a status stored on a heading was counted nowhere;
 *  * a paper missed the reader's items pinned beneath it, and a plan heading
 *    was counted next to its own sub-items;
 *  * resetting progress deleted typed notes, and an export promised statuses
 *    an import then dropped;
 *  * with a topic open, the stage switch and My plan tab snapped back to it;
 *  * search ignored the reader's own items and rendered a query as markup;
 *  * the shared progress bars had no fill rules, so they drew as black blocks;
 *  * the first mark (and clearing the last) moved every row under the pointer,
 *    and an item added under a topic stayed folded out of sight.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { repoRoot } from './helpers.mjs';

/* ------------------------------------------------------------- harness ---- */

const html = await readFile(path.join(repoRoot, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8080/', pretendToBeVisual: true });
const { window } = dom;
window.scrollTo = () => {};

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

setGlobal('window', window);
setGlobal('document', window.document);
setGlobal('location', window.location);
setGlobal('history', window.history);
setGlobal('localStorage', window.localStorage);
setGlobal('sessionStorage', window.sessionStorage);
setGlobal('navigator', window.navigator);
setGlobal('CSS', window.CSS);
setGlobal('HTMLElement', window.HTMLElement);
setGlobal('Node', window.Node);
setGlobal('Event', window.Event);
setGlobal('CustomEvent', window.CustomEvent);
setGlobal('indexedDB', new IDBFactory());
setGlobal('IDBKeyRange', IDBKeyRange);

setGlobal('fetch', async (input) => {
  const raw = typeof input === 'string' ? input : input?.url || String(input);
  const relative = raw.replace(/^https?:\/\/[^/]+\//, '').split(/[?#]/)[0];
  try {
    const body = await readFile(path.join(repoRoot, relative));
    const type = relative.endsWith('.json') ? 'application/json' : 'text/plain';
    return new Response(body, { status: 200, headers: { 'content-type': type } });
  } catch {
    return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
});

window.localStorage.setItem('mymppsc.demoPromptDismissed', '1');

const hub = await import('../js/services/syllabus-hub.js');
const syllabus = await import('../js/services/syllabus.js');
const planner = await import('../js/services/planner.js');
const db = await import('../js/core/db.js');
const { STORES } = await import('../js/core/constants.js');
const components = await import('../js/ui/components.js');

const app = await import('../js/app.js');
const { state } = await import('../js/core/state.js');

const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => [...window.document.querySelectorAll(selector)];
const viewText = () => $('#view')?.textContent?.replace(/\s+/g, ' ').trim() || '';
const click = (element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, { label = 'condition', timeout = 5000, interval = 20 } = {}) {
  const started = Date.now();
  for (;;) {
    let result = null;
    try {
      result = await predicate();
    } catch {
      result = null;
    }
    if (result) return result;
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${label}`);
    await sleep(interval);
  }
}

async function goto(route) {
  window.location.hash = `#/${route}`;
  await app.router.resolve();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await sleep(25);
    if (!/Loading local data/.test(viewText())) break;
    await app.router.resolve();
  }
  await waitFor(() => !/Loading local data/.test(viewText()), { label: `${route} to render` });
  return viewText();
}

/** Clicks an element once it exists, so a re-render cannot swallow the click. */
async function tap(selector) {
  const element = await waitFor(() => $(selector), { label: selector });
  click(element);
  return element;
}

/** Types into a field of the open dialog the way a reader would. */
function fill(selector, value) {
  const field = $(selector);
  field.value = value;
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
  field.dispatchEvent(new window.Event('change', { bubbles: true }));
}

const progressRows = () => db.getAll(STORES.SYLLABUS_PROGRESS);

async function clean() {
  await db.clearStore(STORES.SYLLABUS_PROGRESS);
  await db.clearStore(STORES.SYLLABUS);
}

await waitFor(() => app.router !== null && state.dbError === null, { label: 'the app to boot' });

const model = await syllabus.loadSyllabus();
const S1 = 'prelims/paper-1/s1';
const S2 = 'prelims/paper-1/s2';
const PAPER = 'prelims/paper-1';
const linesOf = (id) => syllabus.leavesOf(model.nodes, model.nodes.get(id)).map((leaf) => leaf.id);

/* ------------------------------------------------------------- dialogs ---- */

test('1. a dialog hands back what was typed into it', async () => {
  // Every caller reads its fields after `await openModal(...)`. The dialog used
  // to empty itself before resolving, so those reads all came back null.
  const pending = components.openModal({
    title: 'Name it',
    body: '<input type="text" id="probeField" />',
    actions: [{ label: 'Save', value: 'ok', tone: 'btn-primary' }],
  });
  $('#probeField').value = 'Typed by the reader';
  click($('#modalRoot [data-modal-action]'));
  const choice = await pending;
  assert.equal(choice, 'ok');
  assert.equal(document.getElementById('probeField')?.value, 'Typed by the reader', 'the field is still readable after the dialog resolves');
  assert.equal($('#modalRoot').hidden, true, 'the dialog is hidden at once');
  await sleep(10);
  assert.equal($('#modalRoot').innerHTML, '', 'and its markup is released straight after');
});

/* ------------------------------------------------------------ progress ---- */

test('2. a mark on a heading counts for every topic under it; a topic marked on its own keeps its own', async () => {
  await clean();
  const lines = linesOf(S1);
  assert.ok(lines.length >= 3, 'the section has several topics');

  await hub.setStatus({ scope: 'official', id: S1 }, 'completed', { model });
  let rows = await syllabus.loadProgress();
  assert.equal(rows.size, 1, 'one row: the heading');
  let index = syllabus.officialStatusIndex(model, rows);
  assert.equal(index.get(S1).done, lines.length, 'every topic under the heading counts as done');
  assert.equal(index.get(S1).status, 'completed');
  assert.equal(index.get(lines[0]).status, 'completed');
  assert.equal(index.get(lines[0]).own, 'not_started', 'the topic carries the heading\u2019s mark without a row of its own');
  assert.equal(syllabus.progressSummary(model, rows).done, lines.length, 'and the overall figure moves with it');

  await hub.setStatus({ scope: 'official', id: lines[0] }, 'in_progress', { model });
  rows = await syllabus.loadProgress();
  index = syllabus.officialStatusIndex(model, rows);
  assert.equal(index.get(lines[0]).status, 'in_progress');
  assert.equal(index.get(S1).done, lines.length - 1);
  assert.equal(index.get(S1).status, 'in_progress', 'a heading shows the roll-up of its topics');

  // "Not started" on one topic under a marked heading: the heading's mark is
  // spelled out on its other topics, so it cannot come back on this one.
  await hub.setStatus({ scope: 'official', id: lines[1] }, 'not_started', { model });
  rows = await syllabus.loadProgress();
  index = syllabus.officialStatusIndex(model, rows);
  assert.equal(index.get(lines[1]).status, 'not_started');
  assert.equal(rows.has(S1), false, 'the heading\u2019s own mark is gone');
  assert.equal(index.get(lines[0]).status, 'in_progress', 'a topic marked on its own keeps its mark');
  assert.equal(index.get(lines[2]).status, 'completed', 'the others keep the heading\u2019s mark');
  assert.equal(index.get(S1).done, lines.length - 2);

  // Marking the heading again replaces everything beneath it.
  await hub.setStatus({ scope: 'official', id: S1 }, 'revised', { model });
  rows = await syllabus.loadProgress();
  assert.deepEqual([...rows.keys()], [S1], 'marks beneath a newly marked heading give way to it');
  assert.equal(syllabus.officialStatusIndex(model, rows).get(S1).status, 'revised');

  await hub.setStatus({ scope: 'official', id: S1 }, 'not_started', { model });
  assert.equal((await progressRows()).length, 0, 'clearing the heading leaves nothing behind');
});

test('3. cascadeChanges works the same way on any tree', () => {
  // A ─ B ─ b1, b2
  //   └ C ─ c1
  const children = { A: ['B', 'C'], B: ['b1', 'b2'], C: ['c1'] };
  const parents = { B: 'A', C: 'A', b1: 'B', b2: 'B', c1: 'C' };
  const own = { A: 'completed', b1: 'revised' };
  const tree = {
    childrenOf: (id) => children[id] || [],
    parentOf: (id) => parents[id] || null,
    ownOf: (id) => own[id] || 'not_started',
  };
  assert.deepEqual(
    Object.fromEntries(hub.cascadeChanges(tree, 'b2', 'not_started')),
    { A: 'not_started', c1: 'completed', b2: 'not_started' },
    'the heading\u2019s mark moves onto its unmarked topics before one is cleared',
  );
  assert.deepEqual(Object.fromEntries(hub.cascadeChanges(tree, 'A', 'in_progress')), { b1: 'not_started', A: 'in_progress' });
  assert.deepEqual(Object.fromEntries(hub.cascadeChanges(tree, 'c1', 'revised')), { c1: 'revised' }, 'a topic is marked on its own');
});

test('4. a paper counts the reader\u2019s items pinned anywhere beneath it', async () => {
  await clean();
  const line = linesOf(S1)[0];
  const mine = await planner.addSyllabusItem({ title: 'Pinned to one topic' });
  await hub.attachPlanItem(mine.id, line);
  await hub.setStatus({ scope: 'plan', id: mine.id }, 'completed', { model });

  const rows = await syllabus.loadProgress();
  const plan = await hub.loadPlan({ model });
  const index = hub.buildProgressIndex(model, rows, plan);
  assert.equal(index.node.get(S1).planItems, 1);
  assert.equal(index.node.get(PAPER).planItems, 1, 'the paper sees an item pinned two levels down');
  assert.equal(index.node.get(PAPER).done, 1);
  assert.equal(index.node.get(PAPER).total, linesOf(PAPER).length + 1);
  assert.equal(index.node.get('prelims').done, 1, 'and so does the stage');
  assert.equal(hub.nodeProgress(model, model.nodes.get(PAPER), rows, plan).planItems, 1);
});

test('5. the reader\u2019s own plan counts items, not headings, and marks a heading\u2019s sub-items', async () => {
  await clean();
  const parent = await planner.addSyllabusItem({ title: 'Indian Polity' });
  const first = await planner.addSyllabusItem({ parentId: parent.id, title: 'Preamble' });
  const second = await planner.addSyllabusItem({ parentId: parent.id, title: 'Fundamental Rights' });
  await hub.setStatus({ scope: 'plan', id: first.id }, 'completed', { model });
  await hub.setStatus({ scope: 'plan', id: second.id }, 'completed', { model });

  let plan = await hub.loadPlan({ model });
  let progress = hub.combinedProgress(model, await syllabus.loadProgress(), plan);
  assert.equal(progress.plan.total, 2, 'the heading is not counted next to its own sub-items');
  assert.equal(progress.plan.done, 2, 'both sub-items finished means everything is finished, not 2 of 3');
  assert.equal(hub.planStatusIndex(plan).get(parent.id).status, 'completed');

  const third = await planner.addSyllabusItem({ parentId: parent.id, title: 'Directive Principles' });
  await hub.setStatus({ scope: 'plan', id: parent.id }, 'in_progress', { model });
  plan = await hub.loadPlan({ model });
  const index = hub.planStatusIndex(plan);
  assert.equal(index.get(third.id).status, 'in_progress', 'marking an item marks its sub-items');
  assert.equal(index.get(first.id).status, 'in_progress', 'and replaces their own marks');
  assert.equal(normalised(plan.byId.get(first.id).status), 'not_started', 'which are cleared on disk');

  progress = hub.combinedProgress(model, await syllabus.loadProgress(), plan);
  assert.equal(progress.plan.total, 3);
  assert.equal(progress.plan.inProgress, 3);
});

const normalised = (status) => hub.normaliseStatus(status);

test('6. resetting progress clears statuses and keeps what the reader planned', async () => {
  await clean();
  const lines = linesOf(S1);
  await hub.setStatus({ scope: 'official', id: lines[0] }, 'completed', { model });
  await hub.setStatus({ scope: 'official', id: lines[1] }, 'revised', { model });
  await hub.setPlanFields({ scope: 'official', id: lines[1] }, { notes: 'Re-read the Upanishads chapter' }, { model });
  await hub.addOfficialToPlan(S2, { target_date: '2026-11-01' }, { model });
  await hub.setStatus({ scope: 'official', id: S2 }, 'in_progress', { model });

  const result = await syllabus.resetProgress();
  assert.equal(result.cleared, 3);
  const rows = await syllabus.loadProgress();
  assert.equal(rows.has(lines[0]), false, 'a row that held only a status is removed');
  assert.equal(rows.get(lines[1]).notes, 'Re-read the Upanishads chapter', 'typed notes survive a reset');
  assert.equal(rows.get(lines[1]).status, 'not_started');
  assert.equal(syllabus.isInPlan(rows.get(S2)), true, 'a node in My plan stays in My plan');
  assert.equal(rows.get(S2).target_date, '2026-11-01');
  assert.equal(rows.get(S2).status, 'not_started');
});

/* ------------------------------------------------------------- my plan ---- */

test('7. official nodes join My plan by reference and share their status with the tree', async () => {
  await clean();
  const lines = linesOf(S1);
  await hub.addOfficialToPlan(S1, { target_date: '2026-01-05', priority: 'high' }, { model });
  await hub.addOfficialToPlan(lines[1], {}, { model });
  const mine = await planner.addSyllabusItem({ title: 'Newspaper notes' });

  let rows = await syllabus.loadProgress();
  let plan = await hub.loadPlan({ model });
  let overview = hub.planOverview(model, rows, plan);
  assert.deepEqual(overview.planned.map((node) => node.id), [S1, lines[1]]);
  assert.deepEqual(overview.entries.map((node) => node.id), [S1], 'a topic inside a planned section is not listed twice');
  assert.equal(overview.summary.total, lines.length + 1, 'each topic is counted once, plus the reader\u2019s own item');
  assert.equal(hub.planAnchor(model, rows, model.nodes.get(lines[2]))?.id, S1, 'a topic is in the plan through its section');
  assert.equal((await planner.listSyllabus()).length, 1, 'nothing official is copied into the reader\u2019s own store');

  // A status marked in the tree is the status in My plan.
  await hub.setStatus({ scope: 'official', id: lines[2] }, 'completed', { model });
  rows = await syllabus.loadProgress();
  overview = hub.planOverview(model, rows, plan);
  assert.equal(overview.summary.done, 1);
  assert.equal(syllabus.isInPlan(rows.get(lines[2])), false, 'marking a topic does not add it to the plan');

  const due = hub.planDeadlines(model, rows, plan, '2026-10-14');
  assert.deepEqual(due.overdue.map((item) => item.id), [S1], 'an unfinished item past its target date is overdue');

  await hub.setStatus({ scope: 'official', id: S1 }, 'completed', { model });
  rows = await syllabus.loadProgress();
  assert.equal(hub.planDeadlines(model, rows, plan, '2026-10-14').overdue.length, 0, 'a finished item is never overdue');

  await hub.removeOfficialFromPlan(S1, { model });
  rows = await syllabus.loadProgress();
  assert.equal(syllabus.isInPlan(rows.get(S1)), false);
  assert.equal(rows.get(S1).status, 'completed', 'leaving the plan keeps the progress');
  assert.equal(rows.get(S1).target_date, null);

  await assert.rejects(() => hub.addOfficialToPlan('prelims', {}, { model }), /whole stage/);
  await planner.deleteSyllabusItem(mine.id);
  plan = await hub.loadPlan({ model });
  assert.equal(plan.rows.length, 0);
});

test('8. an export restores statuses and notes, and an unknown status is refused', async () => {
  await clean();
  const parent = await planner.addSyllabusItem({ title: 'Ethics', notes: 'Case studies first' });
  const child = await planner.addSyllabusItem({ parentId: parent.id, title: 'Attitude' });
  await hub.setStatus({ scope: 'plan', id: child.id }, 'revised', { model });

  const payload = JSON.parse(JSON.stringify(await planner.exportSyllabus()));
  await db.clearStore(STORES.SYLLABUS);
  const result = await planner.importSyllabus(payload.subjects);
  assert.equal(result.added, 2);
  const rows = await planner.listSyllabus();
  assert.equal(rows.find((row) => row.title === 'Ethics').notes, 'Case studies first', 'notes travel with an export');
  assert.equal(rows.find((row) => row.title === 'Attitude').status, 'revised', 'statuses are restored, as the export promises');

  await assert.rejects(() => hub.setStatus({ scope: 'official', id: S1 }, 'nonsense', { model }), /Unknown syllabus status/);
  await assert.rejects(() => planner.setSyllabusStatuses(new Map([[child.id, 'done-ish']])), /Unknown syllabus status/);
  assert.equal((await progressRows()).length, 0, 'nothing was stored for the refused status');
});

/* -------------------------------------------------------------- screen ---- */

test('9. one click marks a topic, a heading marks all of its topics, and the figures follow', async () => {
  await clean();
  await goto('syllabus');
  if (!$('.syl-switch-btn[data-exam="prelims"]')?.classList.contains('on')) {
    await tap('.syl-switch-btn[data-exam="prelims"]');
    await waitFor(() => $('.syl-switch-btn[data-exam="prelims"]').classList.contains('on'), { label: 'Prelims' });
  }
  assert.match(viewText(), /Track your preparation/, 'until something is marked, the screen explains how marking works');

  const first = linesOf(S1)[0];
  await tap(`[data-cycle="${first}"]`);
  await waitFor(async () => (await syllabus.loadProgress()).get(first)?.status === 'in_progress', { label: 'in progress' });
  await waitFor(() => $(`[data-cycle="${first}"]`)?.dataset.current === 'in_progress', { label: 'the mark to update' });
  assert.equal(document.activeElement?.dataset?.cycle, first, 'focus stays on the mark that was used');
  await tap(`[data-cycle="${first}"]`);
  await waitFor(async () => (await syllabus.loadProgress()).get(first)?.status === 'completed', { label: 'completed' });
  await waitFor(() => /1 of 77 topics/.test(viewText()), { label: 'the overview to count it' });

  // Open the section and mark all of its topics from its panel.
  await goto(`syllabus/official/${S1}`);
  await waitFor(() => /Mark all \d+ topics at once/.test(viewText()), { label: 'the heading panel' });
  await tap(`[data-set-status="${S1}"][data-status="completed"][data-bulk]`);
  const count = linesOf(S1).length;
  await waitFor(
    () => $(`.syl-title[data-open="${S1}"]`)?.closest('.syl-row')?.querySelector('.syl-count-num')?.textContent === `${count}/${count}`,
    { label: 'the heading to show every topic done' },
  );
  assert.match(viewText(), new RegExp(`${count} of 77 topics`), 'a heading mark reaches the overview');
  const rows = await syllabus.loadProgress();
  assert.deepEqual([...rows.keys()], [S1], 'one row for the heading; the topic\u2019s own mark gave way');
  assert.equal($('[data-reset-progress]').disabled, false, 'a heading mark is something to reset');
});

test('10. "+" puts a section in My plan, and My plan edits keep what was typed', async () => {
  await clean();
  await goto('syllabus');
  await tap(`[data-plan-add="${S2}"]`);
  await waitFor(async () => syllabus.isInPlan((await syllabus.loadProgress()).get(S2)), { label: 'the section in the plan' });
  await waitFor(() => $(`[data-plan-remove="${S2}"]`), { label: 'the row to say it is in the plan' });
  await waitFor(() => /My plan 1/.test($('.syl-switch-plan')?.textContent.replace(/\s+/g, ' ') || ''), { label: 'the tab count' });

  await tap('.syl-switch-btn[data-paper="__my_plan__"]');
  await waitFor(() => $(`.syl-card [data-edit-plan="${S2}"]`), { label: 'the My plan card' });

  // Set a target date and a note through the dialog.
  click($(`.syl-card [data-edit-plan="${S2}"]`));
  await waitFor(() => $('#sylTarget'), { label: 'the plan dialog' });
  fill('#sylTarget', '2026-12-01');
  fill('#sylNotes', 'Two chapters a week');
  click($('#modalRoot [data-value="ok"]'));
  await waitFor(async () => (await syllabus.loadProgress()).get(S2)?.notes === 'Two chapters a week', { label: 'the note to be saved' });
  let row = (await syllabus.loadProgress()).get(S2);
  assert.equal(row.target_date, '2026-12-01');

  // Change only the priority: the date and the note must survive.
  await waitFor(() => $(`.syl-card [data-edit-plan="${S2}"]`) && $('#modalRoot').hidden, { label: 'the card again' });
  click($(`.syl-card [data-edit-plan="${S2}"]`));
  await waitFor(() => $('#sylPriority') && $('#sylTarget')?.value === '2026-12-01', { label: 'the dialog, prefilled' });
  fill('#sylPriority', 'high');
  click($('#modalRoot [data-value="ok"]'));
  await waitFor(async () => (await syllabus.loadProgress()).get(S2)?.priority === 'high', { label: 'the priority' });
  row = (await syllabus.loadProgress()).get(S2);
  assert.equal(row.target_date, '2026-12-01', 'editing one field kept the target date');
  assert.equal(row.notes, 'Two chapters a week', 'and the note');
  assert.equal(syllabus.isInPlan(row), true);

  // Add an item of the reader's own.
  await waitFor(() => $('#sylAddRoot') && $('#modalRoot').hidden, { label: 'the add button' });
  click($('#sylAddRoot'));
  await waitFor(() => $('#sylTitle'), { label: 'the add dialog' });
  fill('#sylTitle', 'Weekly essay practice');
  click($('#modalRoot [data-value="ok"]'));
  await waitFor(async () => (await planner.listSyllabus()).some((item) => item.title === 'Weekly essay practice'), {
    label: 'the new item, with the typed title',
  });
  await waitFor(() => /Weekly essay practice/.test(viewText()), { label: 'the item on screen' });
  assert.match(viewText(), /Your own items/);
});

test('11. with a topic open, the stage switch and My plan still switch', async () => {
  await goto(`syllabus/official/${S1}`);
  await waitFor(() => /Official syllabus/.test(viewText()), { label: 'the open section' });
  await tap('.syl-switch-btn[data-exam="mains"]');
  await waitFor(() => $('.syl-switch-btn[data-exam="mains"]')?.classList.contains('on'), { label: 'Mains to be shown' });
  await waitFor(() => window.location.hash === '#/syllabus', { label: 'the address to drop the open topic' });
  assert.match(viewText(), /FIRST PAPER|प्रथम प्रश्न पत्र/);

  await goto(`syllabus/official/${S1}`);
  await waitFor(() => /Official syllabus/.test(viewText()), { label: 'the open section again' });
  await tap('.syl-switch-btn[data-paper="__my_plan__"]');
  await waitFor(() => $('.syl-switch-plan')?.classList.contains('on'), { label: 'My plan to be shown' });
  assert.match(viewText(), /Add your own item/);
});

test('12. search finds the reader\u2019s own items and shows a query as text', async () => {
  await clean();
  await planner.addSyllabusItem({ title: 'Zebra crossing case notes' });
  await goto('syllabus');
  await tap('.syl-switch-btn[data-exam="prelims"]');
  await waitFor(() => $('#sylSearch'), { label: 'the search box' });

  const search = async (query) => {
    const input = $('#sylSearch');
    input.value = query;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(260);
  };
  await search('Zebra');
  await waitFor(() => $$('#view .syl-result').some((result) => /Zebra crossing case notes/.test(result.textContent)), {
    label: 'the reader\u2019s own item in the results',
  });
  assert.match(viewText(), /Your own items/);

  await search('<img src=x onerror=alert(1)>');
  await waitFor(() => /No match/.test(viewText()), { label: 'no match' });
  assert.equal($('#view img'), null, 'the query is never parsed as markup');
  assert.match(viewText(), /<img src=x onerror=alert\(1\)>/, 'it is shown as the text that was typed');
  $('[data-clear-search]') && click($('[data-clear-search]'));
});

test('13. the shared progress bars are drawn with theme fills', async () => {
  const css = await readFile(path.join(repoRoot, 'css', 'app.css'), 'utf8');
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[\\s,}])${escaped}\\s*(,[^{]*)?\\{[^}]*\\}`, 'm').exec(css)?.[0] || '';
  };
  assert.match(rule('.progress-bg'), /fill:\s*var\(--bg-sunken\)/);
  assert.match(rule('.progress-fg'), /fill:\s*var\(--accent\)/);
  assert.match(rule('.progress-fg.ok'), /fill:\s*var\(--ok\)/);
  assert.match(rule('.bar-fg'), /fill:/);
  assert.match(rule('.progress-svg'), /height:\s*8px/, 'an unsized inline SVG would render 300 by 150 pixels');
  for (const status of ['in_progress', 'completed', 'revised']) {
    assert.match(rule(`.syl-seg.${status}`), /fill:\s*var\(--/, `the syllabus bar fills ${status} from a token`);
  }
});

test('14. marking a topic keeps it under the pointer when the summary above it changes height', async () => {
  await clean();
  await goto('syllabus');
  if (!$('.syl-switch-btn[data-exam="prelims"]')?.classList.contains('on')) {
    await tap('.syl-switch-btn[data-exam="prelims"]');
    await waitFor(() => $('.syl-switch-btn[data-exam="prelims"]').classList.contains('on'), { label: 'Prelims' });
  }
  await waitFor(() => $('.syl-intro'), { label: 'the intro card' });
  const first = linesOf(S1)[0];
  const mark = `[data-cycle="${first}"]`;

  // jsdom has no layout, so stand in for it: the intro card is 69px taller
  // than the progress summary that replaces it, and every row below moves.
  const proto = window.Element.prototype;
  const realRect = proto.getBoundingClientRect;
  const realScrollTo = window.scrollTo;
  const scrolls = [];
  proto.getBoundingClientRect = function rect() {
    const top = this.matches(mark) ? ($('.syl-intro') ? 400 : 331) : 0;
    return { top, bottom: top + 44, left: 0, right: 44, width: 44, height: 44, x: 0, y: top };
  };
  window.scrollTo = (x, y) => scrolls.push(y);
  try {
    await tap(mark);
    await waitFor(() => $(mark)?.dataset.current === 'in_progress', { label: 'the first mark' });
    assert.equal($('.syl-intro'), null, 'the first mark replaces the intro with the summary');
    assert.deepEqual(scrolls, [-69], 'the page follows the rows up, so the mark stays under the pointer');

    for (const status of ['completed', 'revised', 'not_started']) {
      await tap(mark);
      await waitFor(() => $(mark)?.dataset.current === status, { label: status });
    }
    assert.ok($('.syl-intro'), 'clearing the last mark brings the intro back');
    assert.deepEqual(scrolls, [-69, 69], 'the page follows the rows down again; marks that move nothing do not scroll');
    assert.equal(document.activeElement?.dataset?.cycle, first, 'and focus stays on the mark');
  } finally {
    proto.getBoundingClientRect = realRect;
    window.scrollTo = realScrollTo;
  }
});

test('15. an item added under a topic shows in the tree at once', async () => {
  await clean();
  // A topic two levels down (folded by default once it has children) that no
  // earlier test has opened.
  const section = model.nodes
    .get(PAPER)
    .childIds.map((id) => model.nodes.get(id))
    .find((node) => node.id !== S1 && node.id !== S2 && node.childIds.length && !model.nodes.get(node.childIds[0]).childIds.length);
  const topic = section.childIds[0];
  await goto(`syllabus/official/${topic}`);
  await tap(`[data-add-plan-here="${topic}"]`);
  await waitFor(() => $('#sylTitle'), { label: 'the new item dialog' });
  fill('#sylTitle', 'Map work for this topic');
  click($('#modalRoot [data-value="ok"]'));
  await waitFor(() => $('#modalRoot').hidden && $(`.syl-title[data-open="${topic}"]`), { label: 'the dialog to close' });

  await waitFor(() => $(`.syl-title[data-open="${topic}"]`)?.closest('li.syl-node')?.querySelector('.syl-node-plan'), {
    label: 'the new item under its topic',
    timeout: 1500,
  });
  const row = $(`.syl-title[data-open="${topic}"]`).closest('li.syl-node');
  assert.match(row.querySelector('.syl-node-plan')?.textContent || '', /Map work for this topic/, 'the item shows in the tree under its topic');
  assert.equal(row.querySelector(':scope > .syl-row .syl-caret')?.getAttribute('aria-expanded'), 'true', 'and the topic is open');
});
