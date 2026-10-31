/**
 * ui-improvements.test.js — skeleton loading states, Question Bank bulk
 * actions, the runner's shortcut legend, the redesigned bank panel of
 * Insights, dark-mode polish, and the bugs found on the way.
 *
 * Boots the real index.html in jsdom with the bundled 1,200-question bank, the
 * same way tests/ui.test.js does, and drives the screens like a reader.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { repoRoot } from './helpers.mjs';

/* ------------------------------------------------------------- harness ---- */

const html = await readFile(path.join(repoRoot, 'index.html'), 'utf8');
const css = await readFile(path.join(repoRoot, 'css', 'app.css'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8080/', pretendToBeVisual: true });
const { window } = dom;
window.scrollTo = () => {};

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
for (const name of ['document', 'location', 'history', 'localStorage', 'sessionStorage', 'navigator', 'CSS', 'HTMLElement', 'Node', 'Event', 'CustomEvent']) {
  setGlobal(name, window[name]);
}
setGlobal('window', window);
setGlobal('indexedDB', new IDBFactory());
setGlobal('IDBKeyRange', IDBKeyRange);
setGlobal('fetch', async (input) => {
  const raw = typeof input === 'string' ? input : input?.url || String(input);
  const relative = raw.replace(/^https?:\/\/[^/]+\//, '').split(/[?#]/)[0];
  try {
    const body = await readFile(path.join(repoRoot, relative));
    return new Response(body, { status: 200, headers: { 'content-type': relative.endsWith('.json') ? 'application/json' : 'text/plain' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
});

const app = await import('../js/app.js');
const { state } = await import('../js/core/state.js');
const { safeDecodeParam } = await import('../js/ui/router.js');
const components = await import('../js/ui/components.js');
const skeletons = await import('../js/ui/skeletons.js');

const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => Array.from(window.document.querySelectorAll(selector));
const viewText = () => ($('#view')?.textContent || '').replace(/\s+/g, ' ');
const click = (element) => {
  assert.ok(element, 'expected an element to click');
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
};
const tick = (box) => {
  assert.ok(box, 'expected a checkbox');
  box.click(); // toggles and fires change, as a real click does
};
const key = (init) => {
  const ev = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  window.document.dispatchEvent(ev);
  return ev;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, { timeout = 6000, interval = 15, label = 'condition' } = {}) {
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
  return viewText();
}

/** Re-render the current screen and wait for it (what ctx.refresh() does). */
const settle = () => app.router.resolve();

await waitFor(() => app.router !== null && state.dbError === null, { label: 'the app to boot', timeout: 20000 });
await waitFor(() => state.questionIndex.size === 1200, { label: 'the bundled bank', timeout: 20000 });
await waitFor(() => $$('#navList .nav-link').length >= 10, { label: 'navigation' });

/* ------------------------------------------------------------- skeletons -- */

test('skeletons: one hidden status line, decorative blocks only, nothing to focus or read twice', () => {
  const samples = {
    dashboard: skeletons.dashboardSkeleton(),
    'dashboard (empty)': skeletons.dashboardSkeleton({ hasBank: false }),
    insights: skeletons.insightsSkeleton(),
    'insights bank': skeletons.insightsSkeleton({ panel: 'bank' }),
    revision: skeletons.revisionSkeleton(),
    ...Object.fromEntries(['import', 'questions', 'integrity', 'duplicates', 'history'].map((tab) => [`bank ${tab}`, skeletons.bankSkeleton({ tab })])),
  };
  for (const [name, markup] of Object.entries(samples)) {
    const host = window.document.createElement('div');
    host.innerHTML = markup;
    const root = host.firstElementChild;
    assert.equal(root.getAttribute('role'), 'status', `${name}: a status region`);
    assert.equal(root.getAttribute('aria-busy'), 'true', `${name}: marked busy`);
    assert.equal(root.textContent.trim(), 'Loading local data…', `${name}: the only text is the hidden status line`);
    assert.ok(root.querySelector('.sr-only'), `${name}: the line is visually hidden`);
    assert.equal(root.querySelector('.skeleton-body').getAttribute('aria-hidden'), 'true', `${name}: blocks are decorative`);
    assert.equal(host.querySelectorAll('h1, h2, h3, a, button, input, select, textarea, [tabindex]').length, 0, `${name}: no headings or controls`);
    assert.equal(/style=/.test(markup), false, `${name}: no inline styles`);
    assert.ok(host.querySelectorAll('.skeleton-block, .skeleton-line').length >= 6, `${name}: has a shape`);
  }
  assert.ok(samples['bank questions'].includes('skeleton-check'), 'the question list placeholder has its selection column');
  assert.ok(samples['insights bank'].includes('skeleton-chart'), 'the bank panel placeholder has its charts');
  assert.ok(samples.dashboard.includes('grid tiles'), 'the dashboard placeholder uses the real stat layout');
});

test('the router paints a screen’s skeleton while it loads, and the loading line otherwise', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const view = (extra) => ({ title: 'Probe', async render() { await gate; return '<h1>Probe</h1><p>probe ready</p>'; }, ...extra });
  app.router.register('probe-skeleton', view({ skeleton: () => components.skeletonScreen([components.skeleton.heading()]) }));
  app.router.register('probe-broken', view({ skeleton() { throw new Error('broken placeholder'); } }));
  app.router.register('probe-plain', view({}));
  try {
    for (const [route, expected] of [['probe-skeleton', '.skeleton'], ['probe-broken', '.loading-block'], ['probe-plain', '.loading-block']]) {
      window.location.hash = `#/${route}`;
      const pending = app.router.resolve();
      await waitFor(() => $(`#view ${expected}`), { label: `${route} placeholder` });
      assert.match(viewText(), /Loading local data/, `${route}: the status line is there for assistive tech (and for the test helpers)`);
      if (route !== 'probe-plain') continue;
      release();
      await pending;
      assert.match(viewText(), /probe ready/);
      assert.equal($('#view .skeleton, #view .loading-block'), null, 'the placeholder is replaced by the screen');
    }
  } finally {
    release();
    delete app.router.routes['probe-skeleton'];
    delete app.router.routes['probe-broken'];
    delete app.router.routes['probe-plain'];
  }
  await goto('dashboard');
});

test('every heavy screen offers a skeleton in its own shape', async () => {
  for (const route of ['dashboard', 'analytics', 'pyq-analysis', 'revision', 'bank']) {
    const markup = app.router.routes[route].skeleton({ route, params: [], isRefresh: false });
    assert.match(markup, /class="skeleton"/, `${route} has a skeleton`);
  }
  assert.ok(app.router.routes['pyq-analysis'].skeleton().includes('skeleton-chart'), 'the legacy bank route shows the bank panel shape');
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.skeleton-block,\s*\.skeleton-line \{\s*animation: skeleton-pulse/, 'the pulse only runs when motion is allowed');
  assert.match(css, /\.skeleton-block,\s*\.skeleton-line \{[^}]*background: var\(--border-subtle\);[^}]*border: 1px solid transparent;/, 'token colour, and an outline in forced colours');
});

/* ------------------------------------------------------ listener lifetime -- */

test('listeners a screen adds to #view end with that screen (no pile-up across refreshes)', async () => {
  let hits = 0;
  app.router.register('probe-signal', {
    title: 'Signal probe',
    render: () => '<h1>Signal probe</h1><button id="probeButton" type="button">Probe</button>',
    mount(ctx, root) {
      root.addEventListener('click', () => { hits += 1; }, { signal: ctx.signal });
    },
  });
  try {
    await goto('probe-signal');
    await settle();
    await settle();
    click($('#probeButton'));
    assert.equal(hits, 1, 'three renders, one live listener');
    await goto('dashboard');
    click($('#view'));
    assert.equal(hits, 1, 'and none once the screen is gone');
  } finally {
    delete app.router.routes['probe-signal'];
  }

  // Every view that delegates on the shared container passes the signal.
  const dir = path.join(repoRoot, 'js', 'ui', 'views');
  for (const file of await readdir(dir)) {
    if (file === 'shared.js') continue; // delegates on an element inside the view, not on #view
    const source = await readFile(path.join(dir, file), 'utf8');
    for (const match of source.matchAll(/root\.addEventListener\(/g)) {
      let depth = 0;
      let end = match.index + match[0].length - 1;
      do {
        const ch = source[end];
        if (ch === '(') depth += 1;
        else if (ch === ')') depth -= 1;
        end += 1;
      } while (depth > 0 && end < source.length);
      assert.match(source.slice(match.index, end), /signal:\s*ctx\.signal/, `${file}: root listener without ctx.signal`);
    }
  }
});

/* ----------------------------------------------------------- bank panel -- */

test('Insights keeps the reader on the bank tab when a chip refreshes it; navigating still opens the route’s tab', async () => {
  await goto('dashboard');
  await goto('analytics');
  let panels = $$('#view .tabpanel');
  assert.equal(panels[0].hidden, false, 'performance first');
  click($$('#view .tabs .tab')[1]);
  assert.equal($$('#view .tabpanel')[1].hidden, false);

  click($('#view [data-action="pyq-subject"][data-value="History"]'));
  await settle();
  assert.equal($('#view [data-action="pyq-subject"][data-value="History"]').getAttribute('aria-pressed'), 'true');
  panels = $$('#view .tabpanel');
  assert.equal(panels[1].hidden, false, 'the refresh kept the bank tab open (it used to snap back to My performance)');
  assert.equal(panels[0].hidden, true);
  assert.match(panels[1].textContent, /History · 178 question\(s\) in 7 topic\(s\)/);
  assert.ok($('#view .pyq-topic-chart svg'), 'the subject’s topics are charted');
  assert.ok($('#view a[href="#/topic/History"]'), 'with a way to practise the whole subject');

  click($('#view [data-action="pyq-subject"][data-value="all"]'));
  await settle();
  await goto('dashboard');
  await goto('analytics');
  assert.equal($$('#view .tabpanel')[0].hidden, false, 'a navigation opens the route’s panel again');
});

test('the bank panel is lean: four tiles, charts, short tables, detail behind ⓘ, no clutter', async () => {
  await goto('pyq-analysis');
  const panel = $$('#view .tabpanel')[1];
  assert.equal(panel.querySelectorAll('.pyq-summary-grid .tile').length, 4);
  assert.equal(panel.querySelectorAll('.prov-chip, [data-source]').length, 0, 'no provenance chips');
  assert.doesNotMatch(panel.textContent, /\b(in)?complete\b/i, 'no per-paper complete/incomplete labels');
  assert.equal(panel.querySelectorAll('.notice, .pyq-unplaced-banner').length, 0, 'no banners');
  for (const table of panel.querySelectorAll('table')) {
    const columns = table.querySelectorAll('thead th').length;
    const insideInfo = Boolean(table.closest('details.info-toggle, details.chart-data'));
    assert.ok(insideInfo || columns <= 6, `an open table has at most 6 columns (found ${columns})`);
  }
  const matrices = panel.querySelectorAll('.pyq-matrix');
  assert.ok(matrices.length >= 2, 'the year-by-year matrices are still there');
  for (const matrix of matrices) assert.ok(matrix.closest('details.info-toggle.info-wide'), 'behind the ⓘ toggle');
  assert.equal(panel.querySelectorAll('h1, h3, h4').length, 0, 'the panel only uses h2');
});

test('the bank panel’s numbers are the Question Bank screen’s numbers', async () => {
  await goto('pyq-analysis');
  const chipCount = (chip) => Number(chip.querySelector('.chip-count').firstChild.textContent);
  const chips = $$('#view [data-action="pyq-subject"]');
  const total = chipCount(chips.find((c) => c.dataset.value === 'all'));
  const bySubject = chips.filter((c) => c.dataset.value !== 'all').map((c) => [c.dataset.value, chipCount(c)]);
  assert.equal(bySubject.reduce((a, [, n]) => a + n, 0), total, 'the subjects add up to the total');
  const keyTile = $$('#view .pyq-summary-grid .tile').find((t) => /Answer keys/.test(t.textContent));
  const keys = keyTile.querySelector('.tile-value').textContent.match(/(\d+)\/(\d+)/);

  click($('#view [data-action="pyq-subject"][data-value="History"]'));
  await settle();
  const topicRows = $$('#view .pyq-topic-table tbody tr').map((row) => [
    row.querySelector('.pyq-topic-name').textContent.trim(),
    Number(row.querySelector('td[data-label="Questions"]').textContent),
  ]);
  assert.ok(topicRows.length > 1);
  click($('#view [data-action="pyq-subject"][data-value="all"]'));
  await settle();

  await goto('bank');
  click($$('#bankTabs .tab').find((t) => t.dataset.tab === 'questions'));
  const listed = () => Number(viewText().match(/Questions \((\d+) of (\d+)\)/)?.[1]);
  assert.equal(Number(viewText().match(/Questions \((\d+) of (\d+)\)/)[2]), total, 'same total');
  for (const [subject, count] of bySubject) {
    const select = $('#qSubject');
    select.value = subject;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    assert.equal(listed(), count, `${subject}: Insights says ${count}, the Question Bank lists ${listed()}`);
  }
  for (const [topic, count] of topicRows.slice(0, 3)) {
    const subject = $('#qSubject');
    subject.value = 'History';
    subject.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    const select = $('#qTopic');
    select.value = topic;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    assert.equal(listed(), count, `History › ${topic}: Insights says ${count}, the Question Bank lists ${listed()}`);
  }
  for (const id of ['qSubject', 'qTopic']) {
    const select = $(`#${id}`);
    select.value = 'all';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  }
  click($$('#bankTabs .tab').find((t) => t.dataset.tab === 'integrity'));
  assert.match(viewText(), new RegExp(`Answer keys present ${keys[1]}/${keys[2]}`), 'same answer-key coverage as the Integrity tab');
  click($$('#bankTabs .tab').find((t) => t.dataset.tab === 'questions'));
});

/* --------------------------------------------------------- bulk actions -- */

const rowBoxes = () => $$('#view input[data-action="bank-select"]');
const bulkButton = (action) => $(`#view [data-action="${action}"]`);

test('Question Bank: tick rows, select the visible page, keep a selection across pages', async () => {
  await goto('bank');
  click($$('#bankTabs .tab').find((t) => t.dataset.tab === 'questions'));
  assert.equal(rowBoxes().length, 25, 'one checkbox per visible row');
  assert.match(rowBoxes()[0].getAttribute('aria-label'), /^Select question Q\S+ \(.+\)$/, 'each box is named');
  assert.equal($('#qBulkCount').textContent, 'No questions selected');
  for (const action of ['bulk-classify', 'bulk-delete', 'bulk-clear']) assert.equal(bulkButton(action).disabled, true);

  tick(rowBoxes()[0]);
  tick(rowBoxes()[1]);
  assert.equal($('#qBulkCount').textContent, '2 selected');
  assert.equal($('#qSelectAll').indeterminate, true, 'a partial page shows as mixed');
  assert.equal(bulkButton('bulk-delete').disabled, false);

  tick($('#qSelectAll'));
  assert.equal(rowBoxes().filter((b) => b.checked).length, 25, 'select-all ticks every visible row');
  assert.equal($('#qBulkCount').textContent, '25 selected');
  tick($('#qSelectAll'));
  assert.equal($('#qBulkCount').textContent, 'No questions selected');

  tick(rowBoxes()[0]);
  const first = rowBoxes()[0].dataset.value;
  click($('#qNext'));
  await settle();
  assert.match(viewText(), /Page 2 of/);
  assert.equal($('#qBulkCount').textContent, '1 selected · 1 not on this page', 'the selection survives paging, and says where it is');
  click($('#qPrev'));
  await settle();
  assert.equal(rowBoxes().find((b) => b.dataset.value === first).checked, true);

  click(bulkButton('bulk-clear'));
  assert.equal($('#qBulkCount').textContent, 'No questions selected');
  assert.equal(window.document.activeElement?.id, 'qSelectAll', 'focus stays in the list when the button disables');
});

test('Question Bank: a bulk subject/topic change asks first, uses the correction service, keeps focus, and can be undone', async () => {
  const picked = rowBoxes().slice(0, 3).map((b) => b.dataset.value);
  const before = picked.map((id) => state.questionIndex.get(id).topic);
  rowBoxes().slice(0, 3).forEach(tick);

  click(bulkButton('bulk-classify'));
  await waitFor(() => !$('#modalRoot').hidden && $('#bulkTopic'), { label: 'the bulk dialog' });
  assert.match($('#modalRoot').textContent, /3 question\(s\)/);
  click($('#modalRoot [data-value="apply"]'));
  assert.equal($('#modalRoot').hidden, false, 'an empty form does not close the dialog');
  assert.equal($('#bulkClassifyError').hidden, false, 'and says why');

  $('#bulkTopic').value = 'Bulk UI topic';
  click($('#modalRoot [data-value="apply"]'));
  await waitFor(() => $('#view .bulk-result'), { label: 'the result notice' });
  await settle();
  for (const id of picked) {
    assert.equal(state.questionIndex.get(id).topic, 'Bulk UI topic');
    assert.equal((await import('../js/services/questions.js')).correctionHistory(await (await import('../js/services/questions.js')).getQuestion(id))[0].kind, 'classification');
  }
  assert.match($('#view .bulk-result').textContent, /Gave 3 question\(s\) the topic “Bulk UI topic”/);
  assert.equal($('#qBulkCount').textContent, 'No questions selected', 'the selection is cleared');
  assert.equal(window.document.activeElement?.id, 'qSelectAll', 'the refresh brought focus back to the list');

  click(bulkButton('bulk-undo'));
  await waitFor(() => !$('#modalRoot').hidden, { label: 'the undo confirmation' });
  click($('#modalRoot [data-modal-action="1"]'));
  await waitFor(() => !$('#view .bulk-result'), { label: 'the undo' });
  await settle();
  picked.forEach((id, i) => assert.equal(state.questionIndex.get(id).topic, before[i], `${id} is back to its own topic`));
});

test('Question Bank: a bulk delete names what goes, can be cancelled, and updates the bank everywhere', async () => {
  const doomed = rowBoxes().slice(0, 2).map((b) => b.dataset.value);
  const sizeBefore = state.questionIndex.size;
  rowBoxes().slice(0, 2).forEach(tick);

  click(bulkButton('bulk-delete'));
  await waitFor(() => !$('#modalRoot').hidden, { label: 'the delete confirmation' });
  for (const id of doomed) assert.ok($('#modalRoot').textContent.includes(id), 'the dialog lists the questions');
  assert.match($('#modalRoot').textContent, /cannot be undone/);
  click($('#modalRoot [data-value="cancel"]'));
  await waitFor(() => $('#modalRoot').hidden);
  assert.equal(state.questionIndex.size, sizeBefore, 'cancel deletes nothing');

  click(bulkButton('bulk-delete'));
  await waitFor(() => !$('#modalRoot').hidden);
  click($('#modalRoot [data-value="delete"]'));
  await waitFor(() => state.questionIndex.size === sizeBefore - 2, { label: 'the deletion' });
  await settle();
  for (const id of doomed) assert.equal(state.questionIndex.has(id), false);
  await waitFor(() => new RegExp(`Bank: ${sizeBefore - 2} questions`).test($('#bankPill').textContent), { label: 'the bank pill' });
  // The header pill updates as soon as the store does; the list behind it is
  // repainted a moment later, because a screen refreshing itself now keeps the
  // DOM the reader is looking at until the new markup is ready rather than
  // collapsing the page into a loading line first.
  await waitFor(() => $('#qBulkCount')?.textContent === 'No questions selected', { label: 'the selection to be cleared' });
});

/* ------------------------------------------------------------- runner ---- */

test('runner: the “?” legend lists the real shortcuts, closes on Escape, moves nothing, traps nothing', async () => {
  await goto('topic');
  const count = $('#practiceCfgCount');
  count.value = '3';
  count.dispatchEvent(new window.Event('change', { bubbles: true }));
  click($('#view [data-action="start-practice"]'));
  // The builder starts what its session panel already describes — no second
  // confirmation of the same summary.
  await waitFor(() => /#\/runner\//.test(window.location.hash), { label: 'the runner' });
  await waitFor(() => /Question 1 of/.test(viewText()), { label: 'runner markup' });

  const toggle = () => $('#view [data-action="kbd-legend"]');
  const legend = () => $('#runnerKbdLegend');
  assert.equal(toggle().getAttribute('aria-controls'), 'runnerKbdLegend');
  assert.equal(toggle().getAttribute('aria-expanded'), 'false');
  assert.equal(legend().hidden, true);
  assert.notEqual(legend().getAttribute('role'), 'dialog', 'not a modal');
  assert.equal(legend().getAttribute('aria-modal'), null);

  toggle().focus();
  click(toggle());
  assert.equal(legend().hidden, false);
  assert.equal(toggle().getAttribute('aria-expanded'), 'true');
  assert.equal(window.document.activeElement, toggle(), 'opening does not move focus, so nothing scrolls');

  const options = $$('#view [data-action="select"]').length;
  const confidenceOn = Boolean($('#view [data-confidence]'));
  const listed = $$('#runnerKbdLegend dt').map((dt) => dt.textContent.replace(/\s+/g, ' ').trim());
  assert.deepEqual(listed, [`1–${Math.min(9, options)}`, '→ or N', '← or P', ']', '[', 'F', 'U', ...(confidenceOn ? ['C'] : []), 'D', '?', 'Ctrl/⌘ K', 'Esc']);

  // A documented key does what the legend says, and the legend survives the repaint.
  key({ key: 'f' });
  await waitFor(() => $('#view [data-action="flag"]')?.getAttribute('aria-pressed') === 'true', { label: 'F flags' });
  assert.equal(legend().hidden, false, 'still open after the repaint');
  assert.equal(window.document.activeElement, toggle(), 'and focus came back to the same control');

  // Browser shortcuts are not runner shortcuts.
  const ctrlF = key({ key: 'f', ctrlKey: true });
  const metaN = key({ key: 'n', metaKey: true });
  await sleep(60);
  assert.equal(ctrlF.defaultPrevented, false, 'Ctrl+F is left to the browser');
  assert.equal(metaN.defaultPrevented, false);
  assert.equal($('#view [data-action="flag"]').getAttribute('aria-pressed'), 'true', 'Ctrl+F did not unflag');
  assert.match(viewText(), /Question 1 of/, '⌘N did not move on');

  // No focus trap: Tab is never intercepted.
  assert.equal(key({ key: 'Tab' }).defaultPrevented, false);

  const esc = key({ key: 'Escape' });
  assert.equal(esc.defaultPrevented, true);
  assert.equal(legend().hidden, true, 'Escape closes it');
  assert.equal(toggle().getAttribute('aria-expanded'), 'false');

  click(toggle());
  $('#view [data-action="kbd-legend-close"]').focus();
  key({ key: 'Escape' });
  assert.equal(legend().hidden, true);
  assert.equal(window.document.activeElement, toggle(), 'focus inside the legend returns to the “?” button');

  click(toggle());
  click($('#view [data-action="kbd-legend-close"]'));
  assert.equal(legend().hidden, true, 'the ✕ closes it (no Escape key on a phone)');

  click(toggle());
  click($('#questionCard'));
  assert.equal(legend().hidden, true, 'a click elsewhere closes it');

  assert.equal($$('#view .palette [aria-current="step"]').length, 1, 'the current question is exposed, not only outlined');
  assert.ok($('#view .legend .swatch.current'), 'and the palette legend explains every state');
  await goto('dashboard');
});

/* ----------------------------------------------------------- regressions -- */

test('the revision queue card no longer prints a stray “}”', async () => {
  const revisionSvc = await import('../js/services/revision.js');
  await revisionSvc.ensureRevisionRecord(Array.from(state.questionIndex.keys())[0], { reason: 'probe', dueDays: 0 });
  await goto('revision');
  const queue = $$('#view .card').find((card) => /^Queue \(/.test(card.querySelector('h2')?.textContent || ''));
  assert.ok(queue, 'the queue card renders');
  assert.equal(queue.querySelector('.card-body').textContent.includes('}'), false);
});

test('the evidence meter emits only classes the stylesheet styles', () => {
  const strong = components.evidenceMeter(5);
  const weak = components.evidenceMeter(1);
  assert.match(strong, /evidence-meter solid/);
  assert.equal((strong.match(/evidence-pip on/g) || []).length, 3);
  assert.match(weak, /evidence-meter insufficient/);
  assert.equal((weak.match(/evidence-pip on/g) || []).length, 1);
  const classes = new Set([...`${strong}${weak}`.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
  for (const name of classes) assert.ok(new RegExp(`\\.${name}\\b`).test(css), `.${name} is styled`);
});

test('dark-mode polish: states keep a non-colour cue and decorations stay behind text', () => {
  assert.match(css, /\.palette button\.answered::after\s*\{[^}]*border-top:\s*3px solid currentColor/, 'answered has a shape cue');
  assert.match(css, /\.tab\[aria-selected="true"\]\s*\{[^}]*inset 0 0 0 1px var\(--border\)/, 'the selected tab is outlined');
  assert.match(css, /\.seg button\[aria-pressed="true"\]\s*\{[^}]*inset 0 0 0 1px var\(--border\)/, 'so is the pressed segment');
  assert.match(css, /\.tile > \*\s*\{\s*position: relative;\s*z-index: 1;/, 'tile text paints above the corner circle');
  assert.match(css, /select,\s*textarea\s*\{\s*border-color: var\(--border\);/, 'form fields keep a 3:1 boundary');
  const dark = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)[1];
  assert.match(dark, /--track:\s*var\(--border-subtle\)/, 'dark tracks are visible');
});

/* -------------------------------------------------- bugs fixed on the way -- */

test('a malformed route parameter is data, not a crash (B5)', async () => {
  // `decodeURIComponent` throws URIError on a stray or truncated escape. The
  // router used to let that escape as an unhandled rejection: the hash changed,
  // the screen did not, and the only trace was a line in the console.
  assert.equal(safeDecodeParam('50%'), '50%', 'a stray percent sign is kept as written');
  assert.equal(safeDecodeParam('%E0%A4%A'), '%E0%A4%A', 'a truncated UTF-8 escape is kept as written');
  assert.equal(safeDecodeParam('A%20B'), 'A B', 'a well-formed escape still decodes');
  assert.equal(safeDecodeParam('%25'), '%', 'and an escaped percent sign decodes to one');
  assert.equal(safeDecodeParam(null), '', 'a missing parameter is an empty string');

  for (const hash of ['#/topic/50%', '#/topic/%E0%A4%A', '#/bank/100%', '#/pyq-analysis/%zz']) {
    window.location.hash = hash;
    await app.router.resolve();
    const parsed = app.router.parse();
    assert.ok(parsed.params.length >= 1, `${hash}: the parameter survived`);
    assert.ok(!/could not be displayed/i.test(viewText()), `${hash}: the screen rendered`);
    assert.ok(!/Loading local data/.test(viewText()), `${hash}: and is not stuck loading`);
    assert.match($('#view h1').textContent, /\S/, `${hash}: it is a real screen`);
  }
  // The address that used to break is a valid deep link target: it names no
  // subject the bank holds, so the practice screen simply ignores it.
  await goto('topic/50%');
  assert.equal($('#view h1').textContent.trim(), 'Practice', 'the merged screen keeps one name');
  assert.equal($('#pickMatch').textContent.trim(), `${state.questionIndex.size} questions match`, 'and the pool is untouched');
  assert.ok($('#view [data-action="clear-selection"]').disabled, 'nothing was selected by the nonsense parameter');
  await goto('dashboard');
});

test('a refresh keeps the screen the reader is looking at, and the newest render wins (B6)', async () => {
  // Re-rendering in place used to paint the "Loading local data…" placeholder
  // first, so a full practice screen collapsed to one line and back on every
  // ticked checkbox — and a slow render could still land on top of a newer one.
  const delays = [];
  let renders = 0;
  app.router.register('probe-refresh', {
    title: 'Probe refresh',
    render: async (ctx) => {
      renders += 1;
      const n = renders;
      await sleep(delays.length ? delays.shift() : 1);
      return `<h1>Probe refresh</h1><p id="probeOut">render ${n}${ctx.isRefresh ? ' refresh' : ' arrival'}</p>`;
    },
  });
  try {
    await goto('probe-refresh');
    const painted = $('#probeOut');
    assert.match(painted.textContent, /render 1 arrival/, 'a navigation paints the screen');

    // What ctx.refresh() does: another render of the destination already shown.
    delays.push(40);
    const refresh = app.router.resolve({ dedupe: false });
    await sleep(8);
    assert.equal($('#probeOut'), painted, 'the DOM the reader is looking at is kept while it rebuilds');
    assert.ok(!/Loading local data/.test(viewText()), 'no placeholder is painted over a refresh');
    assert.ok(!$('#view .loading-block, #view .skeleton'), 'and no skeleton either');
    await refresh;
    assert.match($('#probeOut').textContent, /render 2 refresh/, 'the refresh is recognised as one');
    assert.notEqual($('#probeOut'), painted, 'and the new markup did replace it');

    // Two refreshes at once: the first is slow, the second is quick. The slow
    // one must not paint over the screen the reader asked for last.
    delays.push(60, 2);
    const slow = app.router.resolve({ dedupe: false });
    const quick = app.router.resolve({ dedupe: false });
    await Promise.all([slow, quick]);
    assert.match($('#probeOut').textContent, /render 4 refresh/, 'the newest render is the one on screen');

    // A duplicate ask for the destination already being rendered joins it
    // instead of starting a second render of the same thing.
    const before = renders;
    delays.push(30);
    const first = app.router.resolve();
    const second = app.router.resolve();
    await Promise.all([first, second]);
    assert.equal(renders, before + 1, 'one navigation asked twice, one render');
  } finally {
    delete app.router.routes['probe-refresh'];
  }
  await goto('dashboard');
});

test('the phone header fits one row: touch targets, an icon-only Quick practice (B11)', () => {
  // jsdom does no layout, so this asserts the rules that make the row fit
  // rather than measuring it. On a 390px phone the header actions held about
  // 460px of content in a 366px row that was allowed to wrap, which is the two
  // ragged rows the report described.
  const phone = css.slice(css.lastIndexOf('@media (max-width: 560px) {'));
  assert.match(phone, /#quickStartBtn \.btn-label \{\s*display: none;\s*\}/, 'the label goes, the button stays');
  assert.match(phone, /#quickStartBtn \{[^}]*min-width: var\(--touch-min\)/, 'and it stays a 44px touch target');
  assert.match(phone, /\.command-trigger \{[^}]*min-width: var\(--touch-min\);[^}]*width: var\(--touch-min\)/, 'the search trigger grows to 44px too');
  assert.match(phone, /\.brand-mark \{[^}]*width: 36px/, 'the wordmark gives up its room');
  assert.match(phone, /\.header-actions \.offline-pill \{[^}]*flex: 1 0 100%/, 'the offline status takes its own row instead of ragging the buttons');
  assert.match(css, /--touch-min:\s*44px;/, 'the touch minimum is a token, not a magic number');

  // An icon-only button has to keep its name for assistive tech.
  const quick = $('#quickStartBtn');
  assert.equal(quick.getAttribute('aria-label'), 'Quick practice', 'the name stays on the button');
  assert.equal(quick.getAttribute('title'), 'Quick practice', 'and on the tooltip');
  assert.ok(quick.querySelector('.btn-label'), 'the visible label is still in the markup for wide screens');
  assert.equal(quick.querySelector('.icon').getAttribute('aria-hidden'), 'true', 'the icon is decorative');
  const search = $('#commandBtn');
  assert.equal(search.getAttribute('aria-label'), 'Search and navigate', 'the search trigger keeps its name when its label is hidden');
  assert.match(css, /\.command-trigger > span:nth-child\(2\),\s*\.command-trigger kbd \{\s*display: none;/, 'hidden only below 640px');
});
