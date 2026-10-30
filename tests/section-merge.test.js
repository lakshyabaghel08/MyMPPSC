/**
 * section-merge.test.js — the two merged sections.
 *
 * Four screens became two:
 *
 *   Syllabus & Planner  +  Syllabus Analysis   ->  Syllabus
 *   Analytics           +  PYQ Analysis        ->  Insights
 *
 * The first was a genuine duplication — one curriculum kept in two stores,
 * with two progress figures that could not see each other. The second was not:
 * the two panels answer different questions over different data and must stay
 * distinguishable inside the one section.
 *
 * What is asserted here is the part of the merge that could silently rot:
 * one status vocabulary that never over-claims, one roll-up that reaches the
 * dashboard, planning data that survives a status change without being counted,
 * and the legacy routes that outside links still use.
 *
 * *My plan* has since been removed from the interface. Its stores are still on
 * disk and still travel in backups, so what is asserted about them now is the
 * opposite of what it was: they are preserved, and they are ignored.
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

const hub = await import('../js/services/syllabus-hub.js');
const syllabus = await import('../js/services/syllabus.js');
const planner = await import('../js/services/planner.js');
const db = await import('../js/core/db.js');
const { STORES } = await import('../js/core/constants.js');

const app = await import('../js/app.js');
const { state } = await import('../js/core/state.js');

const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => [...window.document.querySelectorAll(selector)];
const viewText = () => $('#view')?.textContent?.replace(/\s+/g, ' ').trim() || '';

async function waitFor(predicate, { label = 'condition', timeout = 5000, interval = 20 } = {}) {
  const started = Date.now();
  for (;;) {
    const result = await predicate();
    if (result) return result;
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

async function goto(route) {
  window.location.hash = `#/${route}`;
  await app.router.resolve();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (!/Loading local data/.test(viewText())) break;
    await app.router.resolve();
  }
  await waitFor(() => !/Loading local data/.test(viewText()), { label: `${route} to render` });
  return viewText();
}

await waitFor(() => app.router !== null && state.dbError === null, { label: 'the app to boot' });

/* ------------------------------------------------------- one vocabulary --- */

test('1. the merged vocabulary never promotes a legacy status into a done state', () => {
  assert.deepEqual(Object.keys(hub.STATUSES), ['not_started', 'in_progress', 'completed', 'revised']);

  // The planner's `revising` sat *before* `completed` in its own ordering, so
  // it never asserted the item was finished. Reading it as the official
  // module's `revised` would mark it done on the user's behalf.
  assert.equal(hub.normaliseStatus('revising'), 'in_progress');
  assert.equal(hub.isDone('revising'), false, 'a legacy "revising" item is not counted as done');
  assert.equal(hub.isDone('completed'), true);
  assert.equal(hub.isDone('revised'), true);
  assert.equal(hub.statusScore('revising') < hub.statusScore('completed'), true);

  // Anything unknown degrades to "not started" rather than throwing a screen away.
  assert.equal(hub.normaliseStatus('nonsense'), 'not_started');
  assert.equal(hub.normaliseStatus(undefined), 'not_started');
});

/* ------------------------------------------------------------ attachment -- */

test('2. the curated mapping is the only bridge between the bank and the syllabus', async () => {
  const model = await syllabus.loadSyllabus();
  assert.equal(model.ok, true, 'the syllabus loads');

  // The mapping is what lets a mark on an official heading speak about a
  // question-bank topic. It is built from the curated pyq-links file alone, so
  // it can only ever associate what that file associated.
  const index = hub.buildAttachmentIndex(model);
  assert.ok(index.byTopic.size > 0, 'the curated pyq-links mapping yields topic lookups');
  for (const nodeId of index.byTopic.values()) {
    assert.equal(model.nodes.has(nodeId), true, 'every association points at a real syllabus node');
  }
  assert.ok(index.bySubject.size > 0, 'subject-level associations are resolved too');

  const known = [...index.byTopic.entries()][0];
  assert.match(known[0], /\|\|/, 'a topic association is keyed subject||topic, the way the bank is keyed');
  assert.equal(index.byTopic.get('Knitting||Cables'), undefined, 'a topic the mapping never saw has no home');
});

test('3. plan rows are preserved on disk and ignored by every figure', async () => {
  const model = await syllabus.loadSyllabus();
  await syllabus.resetProgress();

  // A reader who used *My plan* before it was removed still has these rows.
  const mapped = await planner.addSyllabusItem({ title: 'Ancient India', subject: 'History', topic: 'Ancient India' });
  const loose = await planner.addSyllabusItem({ title: 'Weekly current affairs digest' });
  await planner.setSyllabusStatuses(new Map([[mapped.id, 'completed'], [loose.id, 'in_progress']]));

  const clean = hub.combinedProgress(model, await syllabus.loadProgress());
  assert.equal(clean.done, 0, 'nothing is marked on the official syllabus');

  // The planner's rows are still exactly where they were...
  const rows = await db.getAll(STORES.SYLLABUS);
  assert.equal(rows.length, 2, 'the syllabus store still holds the reader\u2019s own items');
  assert.equal(rows.find((r) => r.id === mapped.id)?.status, 'completed', 'with the statuses it was given');

  // ...and they change nothing: not the total, not the done count, not the
  // per-topic index that study priorities read.
  const withPlan = hub.combinedProgress(model, await syllabus.loadProgress());
  assert.equal(withPlan.total, clean.total, 'legacy plan rows do not change the total');
  assert.equal(withPlan.done, clean.done, 'legacy plan rows do not count as done');
  assert.equal(withPlan.byTopic.size, 0, 'a plan row no longer speaks for a bank topic');

  // The official tree never gained them as children, either.
  const host = 'prelims/paper-1/s1';
  assert.equal(model.nodes.get(host).childIds.includes(mapped.id), false);
  assert.equal(model.nodes.has(mapped.id), false, 'a plan item is not a syllabus node');

  await planner.deleteSyllabusItem(mapped.id, { withChildren: true });
  await planner.deleteSyllabusItem(loose.id, { withChildren: true });
  assert.equal((await planner.listSyllabus()).length, 0, 'the fixtures are cleaned up');
});

/* --------------------------------------------------------------- roll-up -- */

test('4. one roll-up counts the official syllabus, and it is what the dashboard quotes', async () => {
  const model = await syllabus.loadSyllabus();
  await syllabus.resetProgress();

  const before = hub.combinedProgress(model, await syllabus.loadProgress());
  assert.equal(before.done, 0);
  assert.equal(before.total, before.official.total, 'the headline figure is the official one');
  assert.ok(before.total > 200, 'the official syllabus has hundreds of topics to count');

  const leaf = model.leafIds.find((id) => id.startsWith('prelims/'));
  await syllabus.setProgressStatus(leaf, 'completed');

  const after = hub.combinedProgress(model, await syllabus.loadProgress());
  assert.equal(after.official.done, 1, 'the official mark is counted');
  assert.equal(after.done, 1, 'and it is the only thing the section reports');
  assert.equal(after.total, before.total, 'marking a topic never changes how many there are');

  // A plan row added alongside it moves nothing.
  const mine = await planner.addSyllabusItem({ title: 'Map practice' });
  await planner.setSyllabusStatuses(new Map([[mine.id, 'revised']]));
  const withPlan = hub.combinedProgress(model, await syllabus.loadProgress());
  assert.equal(withPlan.done, 1, 'an item of the reader\u2019s own is not counted any more');
  assert.equal(withPlan.total, before.total);

  const text = await goto('dashboard');
  assert.match(text, new RegExp(`${after.done} of ${after.total} item\\(s\\) done`));
  assert.match(text, /marked on the commission's 2026 syllabus/);
  assert.ok(!/items you added yourself/.test(text), 'the dashboard no longer quotes a second, plan figure');

  await planner.deleteSyllabusItem(mine.id, { withChildren: true });
  await syllabus.resetProgress();
});

/* ------------------------------------------------------- planning fields -- */

test('5. planning fields already stored on a row survive a status change', async () => {
  const model = await syllabus.loadSyllabus();
  await syllabus.resetProgress();
  const node = 'prelims/paper-1/s1';

  // *My plan* is gone from the interface, but a target date and a note written
  // before that are still on the reader's device, still in every backup, and
  // still not the app's to delete.
  await syllabus.setProgressPlan(node, { target_date: '2026-02-01', notes: 'Finish NCERT first' }, { model });
  let row = await db.get(STORES.SYLLABUS_PROGRESS, node);
  assert.equal(row.target_date, '2026-02-01');
  assert.equal(row.status, 'not_started', 'a stored plan does not imply progress');
  assert.equal(hub.combinedProgress(model, await syllabus.loadProgress()).done, 0, 'and it is not counted as progress');

  // Marking the node keeps what was typed.
  await hub.setStatus(node, 'in_progress', { model });
  row = await db.get(STORES.SYLLABUS_PROGRESS, node);
  assert.equal(row.status, 'in_progress');
  assert.equal(row.notes, 'Finish NCERT first', 'the note survived the status change');

  // Clearing the status must not silently delete text the user typed.
  await hub.setStatus(node, 'not_started', { model });
  row = await db.get(STORES.SYLLABUS_PROGRESS, node);
  assert.ok(row, 'the row is kept because it still holds planning data');
  assert.equal(row.status, 'not_started');
  assert.equal(row.target_date, '2026-02-01');

  // Once the stored plan is emptied too, the row goes: "unmarked" leaves nothing behind.
  await syllabus.setProgressPlan(node, { target_date: null, notes: null, priority: null }, { model });
  assert.equal(await db.get(STORES.SYLLABUS_PROGRESS, node), undefined);

  // A node with a status but no plan still clears completely, as it always did.
  await hub.setStatus(node, 'completed', { model });
  assert.ok(await db.get(STORES.SYLLABUS_PROGRESS, node));
  await hub.setStatus(node, 'not_started', { model });
  assert.equal(await db.get(STORES.SYLLABUS_PROGRESS, node), undefined);
});

test('6. the two stores stay separate on disk', async () => {
  const model = await syllabus.loadSyllabus();
  const mine = await planner.addSyllabusItem({ title: 'My own unit' });
  await planner.setSyllabusStatuses(new Map([[mine.id, 'completed']]));
  await hub.setStatus('prelims/paper-1/s1', 'completed', { model });

  const official = await db.getAll(STORES.SYLLABUS_PROGRESS);
  const plan = await db.getAll(STORES.SYLLABUS);
  assert.equal(official.length, 1);
  assert.equal(official[0].node_id, 'prelims/paper-1/s1');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, mine.id, 'the planner store holds only the reader\u2019s own tree');
  assert.equal(
    official.some((row) => row.node_id === mine.id),
    false,
    'a plan item never becomes a row in the official progress store',
  );

  // Resetting official progress leaves the reader's own items alone.
  await syllabus.resetProgress();
  assert.equal((await db.getAll(STORES.SYLLABUS_PROGRESS)).length, 0);
  assert.equal((await db.getAll(STORES.SYLLABUS)).length, 1, 'the planner store is untouched by an official reset');
  await planner.deleteSyllabusItem(mine.id, { withChildren: true });
});

/* ------------------------------------------------------------ the screens - */

test('7. the Syllabus section carries the official tree, and only that', async () => {
  const mine = await planner.addSyllabusItem({ title: 'Ancient India', subject: 'History', topic: 'Ancient India' });
  const loose = await planner.addSyllabusItem({ title: 'Weekly current affairs digest' });

  const text = await goto('syllabus');
  assert.equal($$('#view h1').length, 1, 'exactly one h1');
  assert.match(text, /PAPER-I GENERAL STUDIES/, 'the official tree is the spine');
  assert.ok(!/My plan/.test(text), 'there is no plan tab any more');
  assert.ok(!/Weekly current affairs digest/.test(text), 'an item the reader typed is not shown in the tree');
  assert.ok(!/your item/.test(text), 'and nothing is badged as the reader\u2019s own');
  assert.equal($$('#view .syl-switch [role="tab"]').length, 2, 'the switch is Prelims and Mains');

  // A heading's panel offers progress and the commission's wording — no plan.
  await goto('syllabus/official/prelims/paper-1/s1');
  await waitFor(() => /Official wording/.test(viewText()), { label: 'the deep-linked node' });
  assert.match(viewText(), /Your progress/);
  assert.ok(!/Your plan/.test(viewText()), 'no planning fields are offered');
  assert.ok(!/Add to My plan/.test(viewText()));
  assert.ok(!/Your items here/.test(viewText()));

  // The old plan deep link falls back to the section home instead of throwing.
  await goto(`syllabus/plan/${loose.id}`);
  assert.ok(!/could not be displayed/i.test(viewText()), 'a legacy plan link renders without an error');
  assert.match($('#view h1').textContent, /Syllabus/);
  assert.equal($$('#view .syl-row.selected').length, 0, 'and selects nothing');

  await planner.deleteSyllabusItem(mine.id, { withChildren: true });
  await planner.deleteSyllabusItem(loose.id, { withChildren: true });
});

test('8. Insights holds both panels and keeps their data sources apart', async () => {
  const text = await goto('analytics');
  assert.equal($$('#view h1').length, 1, 'exactly one h1 for the section');
  assert.match($('#view h1').textContent, /Insights/);

  const tabButtons = $$('#view .tabs .tab').map((tab) => tab.textContent.trim());
  // Three readings, in the order the section reads: what you did, what the
  // papers contain, and what that suggests studying next.
  assert.deepEqual(tabButtons, ['My performance', 'The question bank', 'Priorities']);

  // All panels are rendered; the performance one is shown first.
  const panels = $$('#view .tabpanel');
  assert.equal(panels.length, 3);
  assert.equal(panels[0].hidden, false, 'performance is the default panel');
  assert.equal(panels[1].hidden, true);
  assert.equal(panels[2].hidden, true);
  assert.match(panels[0].textContent, /All figures come from attempts stored on this device/);
  assert.match(panels[1].textContent, /What the stored papers contain/);
  assert.match(panels[2].textContent, /Topic frequency in your bank/);

  // The boundary that makes the merge honest: counting on one side, measured
  // performance on the other.
  assert.equal(/First-attempt accuracy/.test(panels[1].textContent), false, 'the bank panel shows no performance');
  assert.equal(/Questions per subject|Year by year — what each paper contributed/.test(panels[0].textContent), false, 'the performance panel does no bank counting');
  void text;
});

test('9. the routes the merge replaced still resolve', async () => {
  // Nothing outside this app can be updated: the curated syllabus chips link to
  // `#/pyq-analysis/<Subject>`, and readers may have bookmarked either screen.
  const legacySyllabus = await goto('syllabus-analysis');
  assert.ok(!/could not be displayed/i.test(legacySyllabus));
  assert.match($('#view h1').textContent, /Syllabus/);

  const model = await syllabus.loadSyllabus();
  const node = 'prelims/paper-1/s1';
  await goto(`syllabus-analysis/${node}`);
  await waitFor(() => /Official syllabus/.test(viewText()), { label: 'the deep-linked node' });
  assert.match(viewText(), /Your progress/, 'a legacy deep link lands on the merged detail panel');
  assert.equal($('.nav-link[aria-current="page"]')?.dataset.route, 'syllabus', 'and the legacy address highlights the section that absorbed it');

  await goto('pyq-analysis');
  assert.equal($('.nav-link[aria-current="page"]')?.dataset.route, 'analytics', 'the other legacy address highlights Insights');

  const legacyBank = await goto('pyq-analysis');
  assert.ok(!/could not be displayed/i.test(legacyBank));
  assert.match($('#view h1').textContent, /Insights/);
  const panels = $$('#view .tabpanel');
  assert.equal(panels[1].hidden, false, 'arriving by the old route opens the panel that absorbed it');
  assert.equal(panels[0].hidden, true);

  // The chips built by the syllabus service still point somewhere real.
  const links = syllabus.pyqLinksFor(model, node);
  assert.ok(links.length > 0, 'the curated mapping yields chips for this heading');
  for (const link of links) {
    const route = link.analysisHref.replace(/^#\//, '').split('/')[0];
    assert.ok(app.router.routes[route], `${link.analysisHref} resolves to a registered route`);
  }
});

/* ----------------------------------------- the roll-up reaching priorities -- */

test('10. study priorities read the curriculum the reader marked', async () => {
  // `studyPriorities()` weighs what the reader marked on the curriculum through
  // a `byTopic` index keyed the way the question bank is keyed. Nothing ever
  // built one before the sections merged, so the branch could not run and
  // official progress was invisible to priorities.
  const { loadAnalytics, studyPriorities } = await import('../js/services/analytics.js');
  const model = await syllabus.loadSyllabus();
  await syllabus.resetProgress();

  const { analytics } = await loadAnalytics();
  const attachments = hub.buildAttachmentIndex(model);
  const pair = [...attachments.byTopic.entries()].find(([key]) =>
    analytics.byTopic.some((topic) => hub.topicKey(topic.subject, topic.topic) === key));
  assert.ok(pair, 'the curated mapping ties at least one bank topic to an official heading');
  const [key, nodeId] = pair;

  const priorityFor = async () => {
    const { progress } = await hub.loadSyllabusWorkspace();
    assert.ok(progress.byTopic instanceof Map, 'the roll-up carries the topic index priorities need');
    return studyPriorities({ analytics, syllabusProgress: progress, limit: 500 })
      .find((row) => hub.topicKey(row.subject, row.topic) === key);
  };

  const before = await priorityFor();
  assert.ok(before, 'the topic is ranked');
  assert.equal(before.syllabus, null, 'nothing is claimed about a curriculum the reader has not marked');

  await hub.setStatus(nodeId, 'in_progress', { model });
  const after = await priorityFor();
  assert.equal(after.syllabus.status, 'in_progress', 'a mark on the official heading reaches the ranking');
  assert.ok(after.priorityScore > before.priorityScore, 'an unfinished topic ranks higher than before');
  assert.ok(after.reasons.some((r) => /syllabus item in progress/i.test(r)), 'and says why');

  // A priority stored on the row is the reader's own planning data. It is kept
  // on disk, but it no longer moves a suggestion: *My plan* is not part of the
  // interface, so nothing on screen would explain why the order changed.
  await syllabus.setProgressPlan(nodeId, { priority: 'high' }, { model });
  const withPriority = await priorityFor();
  assert.equal(withPriority.priorityScore, after.priorityScore, 'a stored plan priority changes nothing');
  assert.equal(withPriority.syllabus.priority, undefined, 'and is not reported as a reason');
  assert.ok(!withPriority.reasons.some((r) => /priority/i.test(r)));
  assert.equal((await db.get(STORES.SYLLABUS_PROGRESS, nodeId)).priority, 'high', 'but it is still stored');

  await syllabus.resetProgress();
  await syllabus.setProgressPlan(nodeId, { priority: null }, { model });
});
