/**
 * syllabus-progress.test.js — progress tracking in the Syllabus section.
 *
 * Regression tests for what the Syllabus section got wrong before this
 * revision:
 *
 *  * a dialog handed back nothing that was typed into it;
 *  * a status stored on a heading was counted nowhere;
 *  * resetting progress deleted typed notes, and an export promised statuses
 *    an import then dropped;
 *  * with a topic open, the stage switch snapped back to it;
 *  * search rendered a query as markup;
 *  * the shared progress bars had no fill rules, so they drew as black blocks;
 *  * the first mark (and clearing the last) moved every row under the pointer.
 *
 * *My plan* has since been removed from the interface. Its two stores are still
 * on disk and still travel in backups, so what is asserted about them is that
 * they are preserved and ignored: a legacy plan row must never change a total,
 * a count or a status on this screen.
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

test('4. a paper counts its own official topics, and a legacy plan row changes nothing', async () => {
  await clean();
  const line = linesOf(S1)[0];
  const rows = await syllabus.loadProgress();
  const index = hub.buildProgressIndex(model, rows);
  assert.equal(index.official.get(PAPER).total, linesOf(PAPER).length, 'a paper counts every official topic under it');
  assert.equal(index.official.get('prelims').total, linesOf('prelims').length, 'and so does the stage');
  assert.equal(hub.nodeProgress(model, model.nodes.get(PAPER), rows).total, linesOf(PAPER).length);

  // A reader who used *My plan* before it was removed still has rows pinned to
  // these nodes, and rows of their own in the planner store. Neither is counted.
  await syllabus.setProgressPlan(line, { target_date: '2026-03-01', priority: 'high', notes: 'Legacy plan row' }, { model });
  const mine = await planner.addSyllabusItem({ title: 'Legacy plan item', subject: 'History', topic: 'Ancient India' });
  await planner.setSyllabusStatuses(new Map([[mine.id, 'completed']]));

  const after = hub.buildProgressIndex(model, await syllabus.loadProgress());
  assert.equal(after.official.get(PAPER).total, linesOf(PAPER).length, 'the paper total is unchanged');
  assert.equal(after.official.get(PAPER).done, 0, 'a legacy plan row is not progress');
  assert.equal(hub.combinedProgress(model, await syllabus.loadProgress()).done, 0);

  // The row itself is untouched: this screen does not clean up after itself.
  const kept = await db.get(STORES.SYLLABUS_PROGRESS, line);
  assert.equal(kept.notes, 'Legacy plan row');
  assert.equal(kept.target_date, '2026-03-01');
  assert.equal(kept.priority, 'high');

  await planner.deleteSyllabusItem(mine.id, { withChildren: true });
  await clean();
});

test('5. the planner store still keeps its own tree, and the syllabus does not read it', async () => {
  await clean();
  const parent = await planner.addSyllabusItem({ title: 'Indian Polity' });
  const first = await planner.addSyllabusItem({ parentId: parent.id, title: 'Preamble' });
  const second = await planner.addSyllabusItem({ parentId: parent.id, title: 'Fundamental Rights' });
  await planner.setSyllabusStatuses(new Map([[first.id, 'completed'], [second.id, 'completed']]));

  // The store is intact and self-consistent — a restored backup still makes sense.
  const rows = await planner.listSyllabus();
  assert.equal(rows.length, 3);
  assert.equal(planner.buildTree(rows).length, 1, 'one root with two children');
  assert.equal(rows.find((row) => row.id === first.id).status, 'completed');

  // And none of it reaches a syllabus figure.
  const progress = hub.combinedProgress(model, await syllabus.loadProgress());
  assert.equal(progress.done, 0, 'no plan item is counted as progress');
  assert.equal(progress.byTopic.size, 0, 'no plan item speaks for a question-bank topic');
  assert.equal(progress.plan, undefined, 'the roll-up no longer reports a plan figure at all');

  await planner.deleteSyllabusItem(parent.id, { withChildren: true });
});

test('6. resetting progress clears statuses and keeps what the reader planned', async () => {
  await clean();
  const lines = linesOf(S1);
  await hub.setStatus({ scope: 'official', id: lines[0] }, 'completed', { model });
  await hub.setStatus({ scope: 'official', id: lines[1] }, 'revised', { model });
  await syllabus.setProgressPlan(lines[1], { notes: 'Re-read the Upanishads chapter' }, { model });
  await syllabus.setProgressPlan(S2, { in_plan: true, target_date: '2026-11-01' }, { model });
  await hub.setStatus({ scope: 'official', id: S2 }, 'in_progress', { model });

  const result = await syllabus.resetProgress();
  assert.equal(result.cleared, 3);
  const rows = await syllabus.loadProgress();
  assert.equal(rows.has(lines[0]), false, 'a row that held only a status is removed');
  assert.equal(rows.get(lines[1]).notes, 'Re-read the Upanishads chapter', 'typed notes survive a reset');
  assert.equal(rows.get(lines[1]).status, 'not_started');
  assert.equal(syllabus.isInPlan(rows.get(S2)), true, 'a row the reader put in My plan keeps that flag');
  assert.equal(rows.get(S2).target_date, '2026-11-01');
  assert.equal(rows.get(S2).status, 'not_started');
  assert.equal(hub.combinedProgress(model, rows).done, 0, 'and none of it counts as progress');
});

/* ------------------------------------------------- legacy plan fields ---- */

test('7. a row that holds only legacy plan data is kept, and counts as nothing', async () => {
  await clean();
  const lines = linesOf(S1);

  // What "Add to My plan" used to write: a flag, a date, a priority, a note.
  await syllabus.setProgressPlan(S1, { in_plan: true, target_date: '2026-01-05', priority: 'high', notes: 'Start here' }, { model });
  await syllabus.setProgressPlan(lines[1], { in_plan: true }, { model });

  let rows = await syllabus.loadProgress();
  assert.equal(rows.size, 2, 'both rows exist for their plan data alone');
  assert.equal(syllabus.isInPlan(rows.get(S1)), true);
  assert.equal(hub.combinedProgress(model, rows).done, 0, 'neither is progress');
  assert.equal((await planner.listSyllabus()).length, 0, 'nothing official was ever copied into the planner store');

  // Marking a topic still works, and still does not create plan data.
  await hub.setStatus({ scope: 'official', id: lines[2] }, 'completed', { model });
  rows = await syllabus.loadProgress();
  assert.equal(rows.get(lines[2]).status, 'completed');
  assert.equal(syllabus.isInPlan(rows.get(lines[2])), false, 'marking a topic does not put it in a plan');
  assert.equal(hub.combinedProgress(model, rows).done, 1, 'only the real mark is counted');

  // The legacy rows survive everything the screen does, including a reset.
  await syllabus.resetProgress();
  rows = await syllabus.loadProgress();
  assert.equal(rows.get(S1).notes, 'Start here', 'a reset clears statuses, not typed notes');
  assert.equal(rows.get(S1).target_date, '2026-01-05');
  assert.equal(rows.get(lines[2]), undefined, 'a row that held only a status is removed');

  await clean();
});

test('8. an export restores statuses and notes, and an unknown status is refused', async () => {
  await clean();
  const parent = await planner.addSyllabusItem({ title: 'Ethics', notes: 'Case studies first' });
  const child = await planner.addSyllabusItem({ parentId: parent.id, title: 'Attitude' });
  await planner.setSyllabusStatuses(new Map([[child.id, 'revised']]));

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

test('10. the tree offers progress and nothing to plan', async () => {
  await clean();
  await goto('syllabus');
  await waitFor(() => $(`.syl-title[data-open="${S2}"]`), { label: 'the section row' });

  // Every control on a row is about progress: the mark, the caret, the title.
  const row = $(`.syl-title[data-open="${S2}"]`).closest('.syl-row');
  assert.ok(row.querySelector(`[data-cycle="${S2}"]`) || row.querySelector('.syl-caret'), 'the row offers a mark or an expand control');
  assert.equal(row.querySelector('[data-plan-add]'), null, 'there is no "add to My plan" button');
  assert.equal(row.querySelector('[data-plan-remove]'), null, 'and no "in plan" pill');
  assert.equal(row.querySelector('.syl-plan-count'), null, 'no "+N of your own" chip');
  assert.ok(!/Add paper to My plan/.test(viewText()), 'the toolbar does not offer to plan a paper');
  assert.ok(!/Add your own item/.test(viewText()), 'nor to write an item of your own');

  // A heading's panel is progress plus the commission's wording — no plan block.
  await goto(`syllabus/official/${S2}`);
  await waitFor(() => /Your progress/.test(viewText()), { label: 'the progress block' });
  assert.match(viewText(), /Mark all \d+ topics at once/);
  assert.ok(!/Your plan/.test(viewText()), 'no planning fields are offered');
  assert.ok(!/Your items here/.test(viewText()), 'and no list of the reader\u2019s own items');
  assert.equal($('[data-edit-plan]'), null);
  assert.equal($('#sylAddRoot'), null);
  assert.equal($('#sylBootstrap'), null);
  assert.equal($('#sylImport'), null);
  assert.equal($('#sylExport'), null);
});

test('11. with a topic open, the stage switch still switches', async () => {
  await goto(`syllabus/official/${S1}`);
  await waitFor(() => /Official syllabus/.test(viewText()), { label: 'the open section' });
  await tap('.syl-switch-btn[data-exam="mains"]');
  await waitFor(() => $('.syl-switch-btn[data-exam="mains"]')?.classList.contains('on'), { label: 'Mains to be shown' });
  await waitFor(() => window.location.hash === '#/syllabus', { label: 'the address to drop the open topic' });
  assert.match(viewText(), /FIRST PAPER|पंचम प्रश्न पत्र|FIFTH PAPER/, 'the Mains papers are listed');
  assert.equal($$('#view .syl-row.selected').length, 0, 'the Prelims topic is not still open');

  // The switch is Prelims and Mains: the third tab was My plan.
  assert.deepEqual(
    $$('.syl-switch-btn').map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
    ['Prelims', 'Mains'],
  );
  assert.equal($('.syl-switch-plan'), null, 'there is no plan tab');

  await goto(`syllabus/official/${S1}`);
  await waitFor(() => /Official syllabus/.test(viewText()), { label: 'the open section again' });
  await tap('.syl-switch-btn[data-exam="prelims"]');
  await waitFor(() => $('.syl-switch-btn[data-exam="prelims"]')?.classList.contains('on'), { label: 'back to Prelims' });
});

test('12. search reaches the official wording and shows a query as text', async () => {
  await clean();
  // A plan item used to be searchable. It is not part of the screen any more,
  // so it must not appear in the results either.
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
  await waitFor(() => /No match/.test(viewText()), { label: 'no match' });
  assert.ok(!/Zebra crossing case notes/.test(viewText()), 'an item of the reader\u2019s own is not in the results');
  assert.ok(!/Your own items/.test(viewText()), 'and there is no second group of results');

  // The official Hindi wording is still found.
  await search('अल-नीनो');
  await waitFor(() => $$('#view .syl-result').length > 0, { label: 'a Hindi match' });

  await search('<img src=x onerror=alert(1)>');
  await waitFor(() => /No match/.test(viewText()), { label: 'no match again' });
  assert.equal($('#view img'), null, 'the query is never parsed as markup');
  assert.match(viewText(), /<img src=x onerror=alert\(1\)>/, 'it is shown as the text that was typed');
  $('[data-clear-search]') && click($('[data-clear-search]'));
  await waitFor(() => $('#sylSearch')?.value === '', { label: 'the search to clear' });
  await planner.deleteSyllabusItem((await planner.listSyllabus())[0].id, { withChildren: true });
});

test('13. the shared progress bars are drawn with theme fills', async () => {
  const css = await readFile(path.join(repoRoot, 'css', 'app.css'), 'utf8');
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[\\s,}])${escaped}\\s*(,[^{]*)?\\{[^}]*\\}`, 'm').exec(css)?.[0] || '';
  };
  // The empty track has its own token (dark mode used to draw it at 1.13:1
  // against the card, i.e. not at all), and its 100% extent a >= 3:1 edge.
  assert.match(rule('.progress-bg'), /fill:\s*var\(--track\)/);
  assert.match(css, /\.progress-svg,\s*\.bar-item \.bar-svg\s*\{[^}]*outline:\s*1px solid var\(--border\)/, 'progress tracks show their full extent');
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

test('15. a deep link opens its topic in place, and a legacy plan link falls back to the section', async () => {
  await clean();
  // A topic two levels down, folded by default.
  const section = model.nodes
    .get(PAPER)
    .childIds.map((id) => model.nodes.get(id))
    .find((node) => node.id !== S1 && node.id !== S2 && node.childIds.length && !model.nodes.get(node.childIds[0]).childIds.length);
  const topic = section.childIds[0];

  await goto(`syllabus/official/${topic}`);
  await waitFor(() => $(`.syl-title[data-open="${topic}"]`)?.closest('.syl-row')?.classList.contains('selected'), {
    label: 'the topic to be open in its place',
  });
  assert.equal($('.syl-detail [data-close-detail]') !== null, true, 'its detail panel is on screen');
  assert.match(viewText(), /Official wording/, 'with the commission\u2019s own text');
  assert.equal(
    $(`.syl-title[data-open="${section.id}"]`)?.closest('li.syl-node')?.querySelector('.syl-caret')?.getAttribute('aria-expanded'),
    'true',
    'and its heading is expanded so the row is actually visible',
  );

  // `#/syllabus/plan/<id>` was an item in My plan. The address is still out
  // there in bookmarks and notes, so it must land somewhere sane rather than
  // throw: the section home, with nothing selected.
  await goto('syllabus/plan/some-legacy-item');
  assert.ok(!/could not be displayed/i.test(viewText()), 'a legacy plan link renders without an error');
  assert.match($('#view h1').textContent, /Syllabus/);
  assert.equal($$('#view .syl-row.selected').length, 0, 'and selects nothing');
  assert.ok($('.syl-tree'), 'the tree is there');
});
