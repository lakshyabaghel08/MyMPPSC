/**
 * syllabus-analysis.test.js — the Syllabus Analysis module.
 *
 * Two layers are covered here:
 *  1. the extracted syllabus and its derived study guidance, checked against the
 *     notification that ships in the repository (wording, coverage, and the
 *     absence of examination-administration content);
 *  2. the screen itself, booted in jsdom, driven the way a reader would use it:
 *     switch stage, expand, open a topic, search, mark progress, reset.
 *
 * The bundled question bank is never written to by anything in this suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
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

/** fetch() that serves the repository from disk, so relative URLs work in jsdom. */
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

const syllabus = await import('../js/services/syllabus.js');
const db = await import('../js/core/db.js');
const planner = await import('../js/services/planner.js');
const { STORES } = await import('../js/core/constants.js');

const app = await import('../js/app.js');
const { state } = await import('../js/core/state.js');

const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => Array.from(window.document.querySelectorAll(selector));
const viewText = () => ($('#view')?.textContent || '').replace(/\s+/g, ' ');

function click(element) {
  assert.ok(element, 'expected an element to click');
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

async function waitFor(predicate, { timeout = 8000, interval = 20, label = 'condition' } = {}) {
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
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

async function goto(route) {
  window.location.hash = `#/${route}`;
  await app.router.resolve();
  // jsdom delivers the hashchange event a tick later, which resolves the route
  // again. Wait until the screen has settled so a click cannot land on the
  // transient loading state.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
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

/** Every curriculum string in the extracted syllabus, with the field it sits in. */
function curriculumStrings(official) {
  const out = [];
  const visit = (value, where) => {
    if (typeof value === 'string') out.push({ where, text: value });
    else if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${where}[${index}]`));
    else if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        if (['source', 'extraction_notes', 'exam', 'format', 'format_version', 'counts', 'src'].includes(key)) continue;
        visit(entry, `${where}.${key}`);
      }
    }
  };
  visit(official.exams, 'exams');
  return out;
}

const officialRaw = await readFile(path.join(repoRoot, 'data', 'syllabus', 'mppsc-2026-syllabus.json'), 'utf8');
const official = JSON.parse(officialRaw);

/* ------------------------------------------------------------ the data ---- */

test('1. the extracted syllabus is the committed notification', async () => {
  const source = await readFile(path.join(repoRoot, 'data', 'MPPSC 2026 Syllabus.md'));
  const sha = createHash('sha256').update(source).digest('hex');
  assert.equal(official.source.sha256, sha, 'the JSON records the hash of the source it was built from');
  assert.deepEqual(official.source.pages_missing, [8, 18, 45], 'the missing source pages are declared, not hidden');

  assert.equal(official.counts.prelims_papers, 2);
  assert.equal(official.counts.prelims_sections, 17);
  assert.equal(official.counts.prelims_topics, 70);
  assert.equal(official.counts.mains_papers, 6);
  assert.equal(official.counts.mains_units, 52);
  assert.equal(official.counts.mains_topics, 222);

  // The shortfall in the English rendition is recorded as a source property, not
  // repaired by inventing text.
  const partial = official.exams[0].papers[0].sections.filter((s) => s.topics.some((t) => t.text.hi && !t.text.en));
  assert.ok(partial.length >= 1, 'at least one Prelims section is Hindi-only in the source');
  assert.ok(official.extraction_notes.length >= 4, 'the extraction notes explain what the source does and does not contain');
});

test('2. every prelims and mains paper, part and section is represented', async () => {
  const [prelims, mains] = official.exams;
  assert.equal(prelims.papers.length, 2);
  assert.equal(mains.papers.length, 6);

  for (const paper of prelims.papers) {
    assert.ok(paper.titles.hi && paper.titles.en, `${paper.id} carries both renditions of its title`);
    assert.ok(paper.sections.length >= 7, `${paper.id} keeps every numbered item of the notification`);
    for (const section of paper.sections) {
      assert.ok(section.number, `${section.id} keeps its number`);
      assert.ok(section.titles.hi || section.titles.en, `${section.id} keeps its heading`);
      assert.ok(section.topics.every((topic) => topic.text.hi || topic.text.en), `${section.id} has no empty topics`);
      assert.ok(section.topics.every((topic) => topic.src.hi?.line || topic.src.en?.line), `${section.id}: every topic records its source line`);
    }
  }

  for (const paper of mains.papers) {
    assert.ok(paper.parts.length >= 1, `${paper.id} has at least one part`);
    for (const part of paper.parts) {
      assert.ok(part.units.length >= 4, `${part.id} keeps its units`);
      for (const unit of part.units) {
        assert.ok(unit.number, `${unit.id} keeps its number`);
        // A unit may carry its name in the heading or its content under the
        // heading; the source does both, and neither is ever invented here.
        const lines = unit.topics.length + (unit.groups || []).reduce((total, group) => total + group.topics.length, 0);
        assert.ok(unit.titles.hi || unit.titles.en || lines > 0, `${unit.id} is never an empty unit`);
      }
    }
  }

  // Paper V and VI are tables in the notification; their rows must survive as units.
  const paperFive = mains.papers.find((p) => p.id === 'mains/paper-V');
  const paperSix = mains.papers.find((p) => p.id === 'mains/paper-VI');
  assert.equal(paperFive.parts[0].units.length, 8);
  assert.equal(paperSix.parts[0].units.length, 4);
  assert.ok(paperFive.parts[0].units.every((u) => u.marker), 'table rows keep their (क)(ख)(ग) markers');
});

test('3. no examination-administration content is carried into the syllabus', async () => {
  const marks = /[\d०-९]\s*अंक|नकारात्मक अंकन|अर्हक अंक|कुल प्रश्न|समय\s*[-:]?\s*\d+\s*घंटे/;
  const offenders = curriculumStrings(official).filter((entry) => marks.test(entry.text));
  assert.deepEqual(offenders, [], 'marks, durations and qualifying rules stay out of the curriculum');

  const words = curriculumStrings(official).filter((entry) => /लगभग\s*[\d०-९]+\s*शब्दों में/.test(entry.text));
  assert.deepEqual(words, [], 'word-count-only instructions are dropped from the curriculum');
});

test('4. the study guidance resolves against the official lines', async () => {
  const model = await syllabus.loadSyllabus();
  assert.equal(model.ok, true, `the syllabus loads (${model.error || 'ok'})`);

  const guideFiles = (await readdir(path.join(repoRoot, 'data', 'syllabus', 'study-guide'))).filter((f) => f.endsWith('.json'));
  assert.equal(guideFiles.length, 4);

  // Every heading the guide claims must exist, and every unit must resolve to
  // official lines — a unit that resolves to nothing is never rendered.
  for (const [nodeId, entry] of model.guide) {
    assert.ok(model.nodes.has(nodeId), `${nodeId} is a real syllabus node`);
    assert.deepEqual(entry.unresolved, [], `${nodeId}: every study unit is traceable to the official syllabus`);
    for (const unit of entry.units) {
      assert.ok(unit.covers.length > 0, `${nodeId}: "${unit.title}" covers at least one official line`);
      assert.ok(unit.covers.every((id) => model.nodes.has(id)));
    }
  }

  // Coverage the module promises: every paper, and every section that groups
  // lines (Prelims Paper II is an itemised list, covered at paper level).
  const required = [];
  for (const exam of official.exams) {
    for (const paper of exam.papers) {
      required.push(paper.id);
      for (const section of paper.sections || []) if (section.topics.length) required.push(section.id);
    }
  }
  for (const id of required) {
    assert.ok(model.guide.has(id), `${id} has a labelled study breakdown`);
  }

  // Guidance is guidance: it never claims to be the official syllabus.
  for (const entry of model.guide.values()) {
    for (const unit of entry.units) {
      assert.ok(model.nodes.has(unit.covers[0]), 'units point at official nodes, not at free text');
    }
  }
});

test('5. search locates a match inside its hierarchy', async () => {
  const model = await syllabus.loadSyllabus();
  const results = syllabus.searchSyllabus(model, 'अल-नीनो', { examId: 'prelims' });
  assert.ok(results.length >= 1, 'a topic named in the source is found');
  const hit = results[0];
  assert.ok(hit.path.length >= 3, 'a result carries its place in the hierarchy');
  assert.ok(model.nodes.has(hit.id));
  assert.equal(model.nodes.get(hit.id).examId, 'prelims');

  for (const hit of syllabus.searchSyllabus(model, 'जलवायु', { examId: 'mains' })) {
    assert.equal(model.nodes.get(hit.id).examId, 'mains', 'search is scoped to the stage on screen');
  }
  assert.deepEqual(syllabus.searchSyllabus(model, '   '), [], 'an empty query returns nothing');
});

test('6. progress lives in its own store, apart from the planner, and clears only itself', async () => {
  const model = await syllabus.loadSyllabus();
  const leaf = model.leafIds.find((id) => id.startsWith('prelims/paper-1/s1/'));
  assert.ok(leaf, 'a Prelims topic to mark');

  const plannerRow = await planner.addSyllabusItem({ title: 'Planner row that must survive' });
  assert.ok(plannerRow?.id);

  await syllabus.setProgressStatus(leaf, 'completed');
  const rows = await db.getAll(STORES.SYLLABUS_PROGRESS);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].node_id, leaf);
  assert.equal(rows[0].status, 'completed');
  assert.ok(rows[0].updated_at, 'rows are timestamped');

  const reloaded = await syllabus.loadProgress();
  assert.equal(reloaded.get(leaf).status, 'completed', 'progress survives a fresh read from IndexedDB');
  const summary = syllabus.progressSummary(model, reloaded);
  assert.equal(summary.done, 1);
  assert.equal(summary.touched, 1);
  assert.ok(summary.total > 1);
  assert.ok(Math.abs(summary.completion - 1 / summary.total) < 1e-9);

  // Setting a node back to "not started" removes its row instead of storing noise.
  await syllabus.setProgressStatus(leaf, 'not_started');
  assert.equal((await db.getAll(STORES.SYLLABUS_PROGRESS)).length, 0);

  await syllabus.setProgressStatus(leaf, 'in_progress');
  await syllabus.setProgressStatus(model.leafIds[1], 'revised');
  assert.equal((await db.getAll(STORES.SYLLABUS_PROGRESS)).length, 2);

  await syllabus.resetProgress();
  assert.equal((await db.getAll(STORES.SYLLABUS_PROGRESS)).length, 0, 'reset clears this module only');

  const plannerRows = await planner.listSyllabus();
  assert.ok(plannerRows.some((row) => row.id === plannerRow.id), 'the planner syllabus is untouched by a syllabus reset');
  await planner.deleteSyllabusItem(plannerRow.id);

  await assert.rejects(() => syllabus.setProgressStatus(leaf, 'nonsense'), /Unknown syllabus status/);
});

test('7. PYQ links are read-only, curated, and omitted where no mapping exists', async () => {
  const model = await syllabus.loadSyllabus();
  const taxonomy = JSON.parse(await readFile(path.join(repoRoot, 'data', 'taxonomy', 'mppsc-taxonomy.json'), 'utf8'));
  const known = new Map(taxonomy.subjects.map((s) => [s.subject, (s.topics || []).map((t) => t.topic)]));

  const links = syllabus.pyqLinksFor(model, 'prelims/paper-1/s1');
  assert.ok(links.length > 0, 'a mapped heading offers practice links');
  for (const link of links) {
    assert.ok(known.has(link.subject), `${link.subject} is a subject the bank already uses`);
    if (link.topic) assert.ok(known.get(link.subject).includes(link.topic), `${link.subject}||${link.topic} is an existing topic`);
    assert.match(link.practiceHref, /^#\/topic\//, 'links point at the existing practice screen');
    assert.equal('count' in link, false, 'no count is implied when the mapping is partial');
  }

  assert.deepEqual(syllabus.pyqLinksFor(model, 'prelims/paper-1/s9'), [], 'a heading with no reliable mapping offers nothing at all');
  assert.deepEqual(syllabus.pyqLinksFor(model, 'mains/paper-I'), [], 'Mains headings never link into a Prelims bank');
  assert.deepEqual(syllabus.pyqLinksFor(model, 'not/a/node'), []);
});

/* ------------------------------------------------------------- the view --- */

test('8. the route renders the syllabus and switches stage', async () => {
  await waitFor(() => $$('#navList .nav-link').length >= 10 && state.dbError === null, { label: 'the app to boot' });
  await waitFor(() => app.router !== null, { label: 'the router' });
  // `#/syllabus-analysis` is the pre-merge route and still resolves: it is in
  // the curated PYQ chips and in anything a reader bookmarked.
  const text = await goto('syllabus-analysis');
  assert.match(text, /Syllabus/);
  assert.match(text, /भारत का इतिहास|PAPER-I GENERAL STUDIES|प्रथम प्रश्न पत्र/, 'the Prelims Paper I tree is on screen');
  assert.ok(!/could not be displayed/i.test(text), 'the screen rendered');
  assert.match(text, /Expand all/);

  // Prelims and Mains. The third tab used to be *My plan*, which is gone.
  const stageSwitch = $$('.syl-switch-btn');
  assert.equal(stageSwitch.length, 2, 'Prelims ↔ Mains');
  assert.deepEqual(stageSwitch.map((b) => b.textContent.replace(/\s+/g, ' ').trim().replace(/ \d+$/, '')), ['Prelims', 'Mains']);
  assert.deepEqual(stageSwitch.map((b) => b.getAttribute('role')), ['tab', 'tab'], 'the switch is still a tab list');
  click(stageSwitch[1]);
  await waitFor(() => /प्रथम प्रश्न पत्र|FIRST PAPER/.test(viewText()), { label: 'the Mains tree' });
  assert.match(viewText(), /Study breakdown|Official/, 'Mains gets the same treatment as Prelims');

  click($$('.syl-switch-btn')[0]);
  await waitFor(() => /History of India|PAPER-I GENERAL STUDIES/.test(viewText()), { label: 'back to Prelims' });
});

test('9. expand, collapse and the detail panel work from the tree', async () => {
  const firstCaret = $('.syl-caret:not(.spacer)');
  assert.ok(firstCaret, 'a branch is expandable');
  const branchId = firstCaret.dataset.toggle;
  click(firstCaret);
  await waitFor(() => document.querySelector(`.syl-caret[data-toggle="${branchId}"]`)?.getAttribute('aria-expanded') === 'false', {
    label: 'the branch to collapse',
  });

  click($(`.syl-caret[data-toggle="${branchId}"]`));
  await waitFor(() => document.querySelector(`.syl-caret[data-toggle="${branchId}"]`)?.getAttribute('aria-expanded') === 'true', {
    label: 'the branch to expand again',
  });

  // Expand all, then collapse all.
  click($('[data-expand-all]'));
  await waitFor(() => !$('.syl-caret[aria-expanded="false"]'), { label: 'everything to expand' });
  click($('[data-collapse-all]'));
  await waitFor(() => $$('.syl-caret[aria-expanded="true"]').length <= 1, { label: 'everything to collapse' });

  // Opening a section is a real route, so back returns to the tree.
  const sectionButton = $$('#view .syl-title').find((button) => button.dataset.open.endsWith('s1'));
  assert.ok(sectionButton, 'a section title is openable');
  const nodeId = sectionButton.dataset.open;
  click(sectionButton);
  await waitFor(() => window.location.hash === `#/syllabus/official/${nodeId}`, { label: 'the hash to follow the opened node' });
  await waitFor(() => /Official syllabus/.test(viewText()), { label: 'the detail panel' });
  assert.match(viewText(), /Study breakdown/, 'the derived breakdown is shown and labelled');
  assert.match(viewText(), /derived/);

  await tap('[data-close-detail]');
  await waitFor(() => window.location.hash === '#/syllabus', { label: 'the detail to close' });
  await waitFor(() => !/Official syllabus/.test(viewText()), { label: 'the panel to disappear' });
  assert.ok(!/Official syllabus/.test(viewText()), 'the panel is gone');

  // Back and forward move between the opened topic and the tree.
  window.history.back();
  await app.router.resolve();
  await waitFor(() => /Official syllabus/.test(viewText()), { label: 'the reopened detail' });
});

test('10. search results open the topic in its place', async () => {
  await goto('syllabus-analysis');
  const input = $('#sylSearch');
  assert.ok(input, 'the syllabus has a search box');
  input.value = 'अल-नीनो';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await waitFor(() => $$('#view .syl-result').length > 0, { label: 'search results' });
  assert.ok($$('#view .syl-result-path').length > 0, 'a result shows where it sits');

  // The query is official Hindi; the result is labelled in the interface
  // language, which for this line is the app's own English rendering.
  assert.match($('#view .syl-result-text').textContent, /El Nino/);
  assert.equal($('#view .syl-result-text').getAttribute('lang'), null, 'an English label is not tagged as Hindi');

  click($('#view .syl-result'));
  await waitFor(() => $('.syl-detail'), { label: 'the topic detail' });
  assert.match(viewText(), /Official wording/);
  // …and the wording block is the commission's Hindi, verbatim.
  const said = $('.syl-detail .syl-said');
  assert.match(said.textContent, /अल-नीनो/);
  assert.equal(said.getAttribute('lang'), 'hi', 'the official wording is marked as Hindi');
  assert.match($('.syl-detail-title').textContent, /El Nino/, 'the panel title is the English rendering');
  assert.match(viewText(), /About this English wording/, 'and the panel says that rendering is not official text');
  assert.equal($('#sylSearch').value, '', 'opening a result returns to the tree with the query cleared');
});

test('11. marking from the screen persists, and reset asks first', async () => {
  const model = await syllabus.loadSyllabus();
  const target = model.leafIds.find((id) => id.startsWith('prelims/paper-1/s2/'));
  await goto(`syllabus-analysis/${target}`);
  await waitFor(() => $('.syl-detail') && /Your progress/.test(viewText()), { label: 'the progress block' });

  const completed = $$('#view [data-status="completed"]')[0];
  assert.ok(completed, 'the status control offers Completed');
  click(completed);
  await waitFor(async () => (await db.getAll(STORES.SYLLABUS_PROGRESS)).length === 1, { label: 'the stored status' });
  const row = (await db.getAll(STORES.SYLLABUS_PROGRESS))[0];
  assert.equal(row.node_id, target);
  assert.equal(row.status, 'completed');

  // Reload the screen: the mark is still there, and the tree shows it.
  await goto('syllabus');
  assert.ok($$('#view .syl-dot').length >= 1, 'a marked line shows its state');

  // Reset asks for confirmation first.
  await tap('[data-reset-progress]');
  await waitFor(() => $('#modalRoot').hidden === false, { label: 'the confirmation dialog' });
  assert.match($('#modalRoot').textContent, /Reset syllabus progress\?/);

  const cancel = $$('#modalRoot [data-modal-action]').find((button) => /Cancel/i.test(button.textContent));
  click(cancel);
  await waitFor(() => $('#modalRoot').hidden === true, { label: 'the dialog to close' });
  assert.equal((await db.getAll(STORES.SYLLABUS_PROGRESS)).length, 1, 'cancelling keeps the marks');

  await tap('[data-reset-progress]');
  await waitFor(() => $('#modalRoot').hidden === false, { label: 'the dialog again' });
  const confirm = $$('#modalRoot [data-modal-action]').find((button) => /^Reset$/i.test(button.textContent.trim()));
  click(confirm);
  await waitFor(async () => (await db.getAll(STORES.SYLLABUS_PROGRESS)).length === 0, { label: 'progress to clear' });
  assert.equal($('[data-reset-progress]').disabled, true, 'the reset control disables itself when there is nothing to clear');
});

test('12. the other routes still render', async () => {
  for (const route of ['dashboard', 'test-centre', 'topic', 'revision', 'syllabus', 'analytics', 'pyq-analysis', 'bank', 'settings', 'help']) {
    const text = await goto(route);
    assert.ok(text.length > 40, `${route} rendered almost nothing`);
    assert.ok(!/could not be displayed/i.test(text), `${route} reported an error`);
  }
  const labels = $$('#navList .nav-link').map((link) => link.textContent.trim());
  // The planner and the official syllabus are one destination after the merge,
  // and the legacy route above still reaches it.
  assert.deepEqual(
    labels.filter((label) => /Syllabus/.test(label)),
    ['Syllabus'],
    'one syllabus entry in the navigation, not two',
  );
});

/* ------------------------------------- English renderings of the syllabus -- */

const translationsPath = path.join(repoRoot, 'data', 'syllabus', 'translations', 'en.json');
const translations = JSON.parse(await readFile(translationsPath, 'utf8'));
const DEVANAGARI = /[\u0900-\u097F]/;

/** id → the notification's own object, so a rendering can be checked against the source. */
function officialById(root) {
  const found = new Map();
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    if (typeof value.id === 'string' && !found.has(value.id)) found.set(value.id, value);
    for (const child of Object.values(value)) walk(child);
    return undefined;
  };
  walk(root);
  return found;
}

test('13. every Hindi-only line has a hand-written English rendering that still matches the notification', async () => {
  const model = await syllabus.loadSyllabus({ force: true });
  const byId = officialById(official);

  assert.equal(translations.format, 'mymppsc-syllabus-translations');
  assert.equal(translations.language, 'en');
  assert.equal(translations.source, 'data/syllabus/mppsc-2026-syllabus.json', 'the file names the notification it renders');
  assert.match(translations.notice, /never written back into the official syllabus data/, 'and says what it is not');
  assert.match(translations.notice, /Hand-written/, 'and how it was made');

  // The lines that need a rendering: official Hindi with no official English.
  const hindiOnly = [];
  for (const node of model.nodes.values()) {
    const wording = syllabus.wordingOf(node);
    if (wording?.hi && !wording?.en) hindiOnly.push(node);
  }
  assert.ok(hindiOnly.length >= 50, `expected the notification's Hindi-only lines, found ${hindiOnly.length}`);

  const expected = new Set();
  for (const node of hindiOnly) {
    const field = node.text?.hi ? 'text' : 'title';
    const entry = translations.entries[node.id];
    assert.ok(entry, `${node.id} has a rendering`);
    assert.ok(entry[field], `${node.id}.${field} has a rendering`);
    assert.deepEqual(Object.keys(entry), [field], `${node.id} renders the one field that needs it`);
    const officialHi = byId.get(node.id)?.[field === 'text' ? 'text' : 'titles']?.hi ?? null;
    assert.ok(officialHi, `${node.id} exists in the notification with Hindi wording`);
    assert.equal(entry[field].hi, officialHi, `${node.id}: the Hindi stored beside the rendering is still the commission's, verbatim`);
    assert.equal(entry[field].hi, syllabus.wordingOf(node).hi, `${node.id}: and the model carries the same wording`);
    const en = entry[field].en;
    assert.ok(typeof en === 'string' && en.trim().length >= 3, `${node.id}: the rendering is not empty`);
    assert.ok(!DEVANAGARI.test(en), `${node.id}: the rendering is English, not a copy of the Hindi`);
    expected.add(node.id);
  }

  // Nothing stale: no entry for a line the notification publishes in English,
  // and none for a node that is no longer there.
  for (const [id, entry] of Object.entries(translations.entries)) {
    assert.ok(expected.has(id), `${id} is still a Hindi-only line`);
    const source = byId.get(id);
    assert.ok(source, `${id} still exists in the notification`);
    for (const field of Object.keys(entry)) {
      const officialField = field === 'text' ? 'text' : 'titles';
      assert.ok(source[officialField], `${id}.${field} is a real field of that line`);
      assert.ok(!source[officialField].en, `${id}.${field} has no official English for a rendering to sit over`);
    }
  }
  assert.equal(Object.keys(translations.entries).length, expected.size, 'one entry per Hindi-only line, no more');

  // A rendering sits beside the node; the official wording is never rewritten.
  const sample = model.nodes.get(hindiOnly[0].id);
  assert.ok(sample.translation, 'the model attaches the rendering to the node');
  assert.ok(!syllabus.wordingOf(sample).en, 'and the official wording still has no English');
  assert.equal(JSON.stringify(model.official), JSON.stringify(official), 'the notification inside the model is the file, unchanged');
});

test('14. English mode shows English everywhere, Hindi mode is untouched, and search takes all three wordings', async () => {
  const model = await syllabus.loadSyllabus();

  // English is the default interface language here.
  assert.equal(syllabus.displayLanguage(), 'en');
  let rendered = 0;
  const untitled = [];
  for (const node of model.nodes.values()) {
    const label = syllabus.nodeLabel(node, 'en');
    const wording = syllabus.wordingOf(node);
    if (!wording?.hi && !wording?.en) {
      // A numbered container the notification never gave a title of its own.
      // The screen shows its number; there is no wording to render.
      assert.equal(label.source, 'none', `${node.id} has nothing to label it`);
      assert.equal(node.kind, 'unit', `${node.id} is a container, not a line of the syllabus`);
      assert.ok(node.number, `${node.id} carries the number the screen shows instead`);
      untitled.push(node);
      continue;
    }
    assert.ok(label.text.trim(), `${node.id} has a label in English mode`);
    assert.notEqual(label.source, 'hindi', `${node.id} is never bare Hindi in English mode`);
    assert.notEqual(label.source, 'none', `${node.id} is never blank`);
    if (label.source === 'rendering') {
      rendered += 1;
      assert.ok(!DEVANAGARI.test(label.text), `${node.id}: "${label.text}" reads as English`);
    }
    assert.equal(label.lang, 'en', `${node.id} is tagged as English in English mode`);
  }
  assert.ok(rendered >= 55, `${rendered} labels come from the hand-written renderings`);
  assert.equal(untitled.length, 13, 'the untitled containers are the only nodes with no label of their own');

  // The five lines the commission published in English only.
  const englishOnly = [...model.nodes.values()].filter((n) => {
    const wording = syllabus.wordingOf(n);
    return wording?.en && !wording?.hi;
  });
  assert.equal(englishOnly.length, 5, 'five lines were published in English only');
  for (const node of englishOnly) {
    assert.equal(syllabus.nodeLabel(node, 'en').source, 'official', `${node.id} shows the commission's own English`);
    assert.deepEqual(syllabus.officialWording(node), { text: syllabus.wordingOf(node).en, lang: 'en', englishOnly: true });
    assert.equal(syllabus.nodeLabel(node, 'hi').source, 'official-only-en', `${node.id} stays English in Hindi mode too, and says why`);
  }

  // Hindi mode is exactly what it was before the renderings existed.
  for (const node of model.nodes.values()) {
    const label = syllabus.nodeLabel(node, 'hi');
    const wording = syllabus.wordingOf(node);
    if (wording?.hi) {
      assert.equal(label.text, wording.hi, `${node.id} shows the official Hindi`);
      assert.equal(label.source, 'official');
      assert.equal(label.lang, 'hi');
    } else if (wording?.en) {
      assert.equal(label.source, 'official-only-en', `${node.id} has no Hindi to show`);
    } else {
      assert.equal(label.source, 'none', `${node.id} is still an untitled container`);
    }
  }

  // All three wordings of one line are searchable, and the official Hindi wins.
  const target = model.nodes.get('prelims/paper-1/s1/t1');
  const rendering = translations.entries[target.id].text;
  const byHindi = syllabus.searchSyllabus(model, 'संकल्पना एवं विचार');
  const byRendering = syllabus.searchSyllabus(model, 'Ancient Indian Knowledge Tradition');
  for (const [name, results] of [['official Hindi', byHindi], ['the English rendering', byRendering]]) {
    const hit = results.find((r) => r.id === target.id);
    assert.ok(hit, `${name} finds the line`);
    assert.equal(hit.label, rendering.en, 'and the result is labelled in the interface language');
    assert.equal(hit.labelSource, 'rendering');
  }
  assert.equal(byHindi.find((r) => r.id === target.id).matched, syllabus.wordingOf(target).hi, 'a Hindi query matches the Hindi wording');
  assert.equal(byRendering.find((r) => r.id === target.id).matched, rendering.en, 'an English query matches the rendering');
  // The commission's own English is searchable as well — here on one of the
  // five lines that exist in English only, so the match can only be official.
  const officialEn = syllabus.wordingOf(englishOnly[0]).en;
  const word = officialEn.split(/[^A-Za-z]+/).filter((w) => w.length > 8).pop();
  const byOfficialEnglish = syllabus.searchSyllabus(model, word);
  const officialHit = byOfficialEnglish.find((r) => r.id === englishOnly[0].id);
  assert.ok(officialHit, `the official English "${word}" finds ${englishOnly[0].id}`);
  assert.equal(officialHit.matched, officialEn, 'and it matched the commission\'s wording, not a rendering');
  assert.equal(officialHit.labelSource, 'official');

  // On the screen: an English-only line says so, and the wording block stays official.
  await goto(`syllabus/official/${englishOnly[0].id}`);
  await waitFor(() => $('.syl-detail'), { label: 'the detail panel' });
  assert.match(viewText(), /Published in English only/, 'the reader is told there is no Hindi for this line');
  assert.equal($('.syl-detail-title').textContent.trim(), syllabus.wordingOf(englishOnly[0]).en.trim());
  // The document language is English, so English wording needs no lang tag;
  // Hindi wording does, and test 10 asserts that one.
  assert.equal($('.syl-detail .syl-said').getAttribute('lang'), null, 'the official wording is not tagged as another language');
  assert.equal($('.syl-detail .syl-said').textContent.trim(), officialEn.trim(), 'and it is the commission\'s own text');
  assert.ok(!/About this English wording/.test(viewText()), 'and no unofficial-rendering note is offered for official text');
});
