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
 * dashboard, plan items that attach to the official tree without becoming
 * part of it, planning fields that survive a status change, and the legacy
 * routes that outside links still use.
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

test('2. plan items attach to official nodes only where the curated mapping says so', async () => {
  const model = await syllabus.loadSyllabus();
  assert.equal(model.ok, true, 'the syllabus loads');

  const index = hub.buildAttachmentIndex(model);
  assert.ok(index.byTopic.size > 0, 'the curated pyq-links mapping yields topic lookups');

  // A subject+topic the mapping knows resolves to the heading it was curated against.
  const known = { subject: 'History', topic: 'Ancient India' };
  const hit = hub.suggestAttachment(model, known, index);
  assert.ok(hit, 'a mapped topic finds a home');
  assert.equal(hit.basis, 'mapping');
  assert.equal(model.nodes.has(hit.nodeId), true, 'and that home is a real syllabus node');

  // Something the mapping has never heard of gets no suggestion at all, rather
  // than a guess from fuzzy title matching.
  assert.equal(hub.suggestAttachment(model, { subject: 'Knitting', topic: 'Cables' }, index), null);
  assert.equal(hub.suggestAttachment(model, { title: 'A loose note' }, index), null);

  // An explicit pin always wins, and a pin to a node that no longer exists is
  // ignored instead of hiding the item.
  const pinned = { subject: 'History', topic: 'Ancient India', attach_mode: 'manual', attached_node_id: 'prelims/paper-1/s5' };
  assert.deepEqual(hub.suggestAttachment(model, pinned, index), { nodeId: 'prelims/paper-1/s5', basis: 'pinned' });
  assert.equal(hub.suggestAttachment(model, { attach_mode: 'manual', attached_node_id: 'not/a/node' }, index), null);

  // "Manual, nowhere" is a real decision: it parks the item in My plan.
  assert.equal(hub.suggestAttachment(model, { ...known, attach_mode: 'manual', attached_node_id: null }, index), null);
});

test('3. an attached item is shown under its node without joining the official tree', async () => {
  const model = await syllabus.loadSyllabus();
  const mapped = await planner.addSyllabusItem({ title: 'Ancient India', subject: 'History', topic: 'Ancient India' });
  const loose = await planner.addSyllabusItem({ title: 'Weekly current affairs digest' });
  const child = await planner.addSyllabusItem({ parentId: mapped.id, title: 'Harappan sites revision' });

  const plan = await hub.loadPlan({ model });
  const host = hub.suggestAttachment(model, await db.get(STORES.SYLLABUS, mapped.id), plan.index);
  assert.ok(host, 'the mapped item has a host node');

  assert.deepEqual(
    hub.planItemsFor(plan, host.nodeId).map((row) => row.id),
    [mapped.id],
    'only the root item is attached; its children travel with it',
  );
  assert.equal(
    hub.planSubtreeFor(plan, host.nodeId).length,
    2,
    'the subtree under the host counts the child too',
  );
  assert.deepEqual(plan.unattached.map((row) => row.id), [loose.id], 'an unmapped item waits in My plan');

  // The official model is data that ships with the app: attaching must not
  // have added anything to it.
  const node = model.nodes.get(host.nodeId);
  assert.equal(
    node.childIds.includes(mapped.id),
    false,
    'the official node did not gain the plan item as a child',
  );
  assert.equal(node.childIds.every((id) => model.nodes.has(id)), true, 'its children are all official nodes');

  await planner.deleteSyllabusItem(mapped.id, { withChildren: true });
  await planner.deleteSyllabusItem(loose.id, { withChildren: true });
  assert.equal((await planner.listSyllabus()).length, 0, 'the fixtures are cleaned up');
  void child;
});

/* --------------------------------------------------------------- roll-up -- */

test('4. one roll-up counts both stores, and it is what the dashboard quotes', async () => {
  const model = await syllabus.loadSyllabus();
  await syllabus.resetProgress();

  const before = hub.combinedProgress(model, await syllabus.loadProgress(), await hub.loadPlan({ model }));
  assert.equal(before.done, 0);
  assert.equal(before.total, before.official.total, 'with no plan items the total is the official one');

  // One official leaf, and one item of the user's own.
  const leaf = model.leafIds.find((id) => id.startsWith('prelims/'));
  await syllabus.setProgressStatus(leaf, 'completed');
  const mine = await planner.addSyllabusItem({ title: 'Map practice' });
  await hub.setStatus({ scope: 'plan', id: mine.id }, 'revised');

  const after = hub.combinedProgress(model, await syllabus.loadProgress(), await hub.loadPlan({ model }));
  assert.equal(after.official.done, 1, 'the official mark is counted');
  assert.equal(after.plan.done, 1, 'the plan mark is counted');
  assert.equal(after.done, 2, 'and the section reports one figure over both');
  assert.equal(after.total, before.total + 1);

  // The dashboard was blind to official progress before the merge; now it is
  // the combined figure that reaches the screen.
  const text = await goto('dashboard');
  assert.match(text, new RegExp(`${after.done} of ${after.total} item\\(s\\) done`));
  assert.match(text, /marked on the commission's 2026 syllabus/);

  await planner.deleteSyllabusItem(mine.id, { withChildren: true });
  await syllabus.resetProgress();
});

/* ------------------------------------------------------- planning fields -- */

test('5. planning fields work on an official node and survive a status change', async () => {
  const model = await syllabus.loadSyllabus();
  await syllabus.resetProgress();
  const node = 'prelims/paper-1/s1';

  // A target date with no status: the row exists for the plan alone.
  await hub.setPlanFields({ scope: 'official', id: node }, { target_date: '2026-02-01', notes: 'Finish NCERT first' }, { model });
  let row = await db.get(STORES.SYLLABUS_PROGRESS, node);
  assert.equal(row.target_date, '2026-02-01');
  assert.equal(row.status, 'not_started', 'a plan does not imply progress');

  // Marking it keeps the plan.
  await hub.setStatus({ scope: 'official', id: node }, 'in_progress', { model });
  row = await db.get(STORES.SYLLABUS_PROGRESS, node);
  assert.equal(row.status, 'in_progress');
  assert.equal(row.notes, 'Finish NCERT first', 'the note survived the status change');

  // Clearing the status must not silently delete text the user typed.
  await hub.setStatus({ scope: 'official', id: node }, 'not_started', { model });
  row = await db.get(STORES.SYLLABUS_PROGRESS, node);
  assert.ok(row, 'the row is kept because it still holds a plan');
  assert.equal(row.status, 'not_started');
  assert.equal(row.target_date, '2026-02-01');

  // Once the plan is emptied too, the row goes: "unmarked" leaves nothing behind.
  await hub.setPlanFields({ scope: 'official', id: node }, { target_date: null, notes: null, priority: null }, { model });
  assert.equal(await db.get(STORES.SYLLABUS_PROGRESS, node), undefined);

  // A node with a status but no plan still clears completely, as it always did.
  await hub.setStatus({ scope: 'official', id: node }, 'completed', { model });
  assert.ok(await db.get(STORES.SYLLABUS_PROGRESS, node));
  await hub.setStatus({ scope: 'official', id: node }, 'not_started', { model });
  assert.equal(await db.get(STORES.SYLLABUS_PROGRESS, node), undefined);
});

test('6. the two stores stay separate on disk', async () => {
  const model = await syllabus.loadSyllabus();
  const mine = await planner.addSyllabusItem({ title: 'My own unit' });
  await hub.setStatus({ scope: 'plan', id: mine.id }, 'completed');
  await hub.setStatus({ scope: 'official', id: 'prelims/paper-1/s1' }, 'completed', { model });

  const official = await db.getAll(STORES.SYLLABUS_PROGRESS);
  const plan = await db.getAll(STORES.SYLLABUS);
  assert.equal(official.length, 1);
  assert.equal(official[0].node_id, 'prelims/paper-1/s1');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, mine.id, 'the planner store holds only the user tree');
  assert.equal(
    official.some((row) => row.node_id === mine.id),
    false,
    'a plan item never becomes a row in the official progress store',
  );

  // Resetting official progress leaves the user's own items alone.
  await syllabus.resetProgress();
  assert.equal((await db.getAll(STORES.SYLLABUS_PROGRESS)).length, 0);
  assert.equal((await db.getAll(STORES.SYLLABUS)).length, 1, 'the plan is untouched by an official reset');
  await planner.deleteSyllabusItem(mine.id, { withChildren: true });
});

/* ------------------------------------------------------------ the screens - */

test('7. the Syllabus section carries the official tree and the plan together', async () => {
  const model = await syllabus.loadSyllabus();
  const mine = await planner.addSyllabusItem({ title: 'Ancient India', subject: 'History', topic: 'Ancient India' });
  const loose = await planner.addSyllabusItem({ title: 'Weekly current affairs digest' });

  const text = await goto('syllabus');
  assert.equal($$('#view h1').length, 1, 'exactly one h1');
  assert.match(text, /भारत का इतिहास|PAPER-I GENERAL STUDIES/, 'the official tree is the spine');
  assert.match(text, /My plan/, 'the plan has its own branch in the rail');

  // The mapped item appears inside the paper, badged as the reader's own.
  const host = hub.suggestAttachment(model, await db.get(STORES.SYLLABUS, mine.id), hub.buildAttachmentIndex(model));
  await goto(`syllabus/official/${host.nodeId}`);
  await waitFor(() => /your item/.test(viewText()), { label: 'the attached plan item' });
  assert.match(viewText(), /Ancient India/);
  assert.match(viewText(), /Your plan/, 'planning fields are offered on an official node');

  // The unmapped one is in My plan, not lost.
  await goto(`syllabus/plan/${loose.id}`);
  await waitFor(() => /Weekly current affairs digest/.test(viewText()), { label: 'the plan item detail' });
  assert.match(viewText(), /Your own item/, 'and it is labelled as the reader\u2019s, not the commission\u2019s');

  await planner.deleteSyllabusItem(mine.id, { withChildren: true });
  await planner.deleteSyllabusItem(loose.id, { withChildren: true });
});

test('8. Insights holds both panels and keeps their data sources apart', async () => {
  const text = await goto('analytics');
  assert.equal($$('#view h1').length, 1, 'exactly one h1 for the section');
  assert.match($('#view h1').textContent, /Insights/);

  const tabButtons = $$('#view .tabs .tab').map((tab) => tab.textContent.trim());
  assert.deepEqual(tabButtons, ['My performance', 'The question bank']);

  // Both panels are rendered; the performance one is shown first.
  const panels = $$('#view .tabpanel');
  assert.equal(panels.length, 2);
  assert.equal(panels[0].hidden, false, 'performance is the default panel');
  assert.equal(panels[1].hidden, true);
  assert.match(panels[0].textContent, /All figures come from attempts stored on this device/);
  assert.match(panels[1].textContent, /What the stored papers contain/);

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
  assert.match(viewText(), /Your plan/, 'a legacy deep link lands on the merged detail panel');

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

test('10. study priorities read the curriculum from both stores', async () => {
  // `studyPriorities()` has always had a branch that weighs what the reader
  // marked on the curriculum, but nothing ever built the `byTopic` index it
  // reads, so the branch could not run: the planner's roll-up did not carry
  // the field, and progress on the official syllabus had no route into it at
  // all. The merged roll-up answers for both stores.
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
    assert.ok(progress.byTopic instanceof Map, 'the one roll-up carries the topic index priorities need');
    return studyPriorities({ analytics, syllabusProgress: progress, limit: 500 })
      .find((row) => hub.topicKey(row.subject, row.topic) === key);
  };

  const before = await priorityFor();
  assert.ok(before, 'the topic is ranked');
  assert.equal(before.syllabus, null, 'nothing is claimed about a curriculum the reader has not marked');

  // Marking the OFFICIAL heading — the half that was invisible to priorities.
  await hub.setStatus({ scope: 'official', id: nodeId }, 'in_progress', { model });
  await hub.setPlanFields({ scope: 'official', id: nodeId }, { priority: 'high' }, { model });

  const after = await priorityFor();
  assert.equal(after.syllabus.status, 'in_progress');
  assert.equal(after.syllabus.priority, 'high');
  assert.ok(after.priorityScore > before.priorityScore, 'a high-priority unfinished topic ranks higher than before');
  assert.ok(after.reasons.some((r) => /high priority/i.test(r)), 'and says why');

  // A plan item of the reader's own speaks for the same topic. Where the two
  // disagree the merge must not conclude more than either store on its own:
  // the least advanced status wins.
  const topic = analytics.byTopic.find((t) => hub.topicKey(t.subject, t.topic) === key);
  const mine = await planner.addSyllabusItem({
    title: 'My own line on this topic',
    level: 'topic',
    subject: topic.subject,
    topic: topic.topic,
  });
  await hub.setStatus({ scope: 'official', id: nodeId }, 'completed', { model });
  const split = await priorityFor();
  assert.equal(split.syllabus.status, 'not_started', 'an open item of the reader\u2019s own is not done because the official line was ticked');

  await planner.deleteSyllabusItem(mine.id, { withChildren: true });
  await syllabus.resetProgress();
});
