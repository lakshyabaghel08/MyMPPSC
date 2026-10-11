/**
 * ui.test.js — user-interface smoke and journey tests.
 *
 * The service-layer suites run in plain Node. This suite boots the real
 * index.html in jsdom with IndexedDB (fake-indexeddb), then drives the actual
 * screens the way a person would: navigate every route, import the
 * demonstration bank through the Import screen, start a full paper simulation,
 * answer questions, submit, and read the report.
 *
 * It is not a substitute for looking at the app in a browser, but it does prove
 * the modules load, the router contract holds, the views render without
 * throwing, and the main journey works end to end.
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

const app = await import('../js/app.js');
const { state } = await import('../js/core/state.js');

function $(selector) {
  return window.document.querySelector(selector);
}

function $$(selector) {
  return Array.from(window.document.querySelectorAll(selector));
}

function viewText() {
  return ($('#view')?.textContent || '').replace(/\s+/g, ' ');
}

function click(element) {
  assert.ok(element, 'expected an element to click');
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function change(element, value) {
  element.value = value;
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
}

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
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

async function goto(route) {
  window.location.hash = `#/${route}`;
  await app.router.resolve();
  return viewText();
}

/* ---------------------------------------------------------------- tests --- */

test('boots, renders the shell and the demonstration prompt', async () => {
  await waitFor(() => $$('#navList .nav-link').length >= 10, { label: 'navigation links' });
  assert.equal(state.dbError, null);
  const labels = $$('#navList .nav-link').map((b) => b.textContent.trim());
  for (const required of ['Dashboard', 'PYQ Test Centre', 'Topic Practice', 'Smart Practice', 'Mistake Book', 'Revision Centre', 'Syllabus & Planner', 'Analytics', 'Question Bank & Imports', 'Settings & Backup']) {
    assert.ok(labels.some((l) => l.includes(required)), `navigation should offer ${required}`);
  }

  // First run with an empty database: the app offers the demonstration bank.
  const modal = await waitFor(() => ($('#modalRoot').hidden ? null : $('#modalRoot')), { label: 'first-run prompt' });
  assert.match(modal.textContent, /demonstration/i);
  assert.match(modal.textContent, /not genuine|NOT genuine|synthetic/i);
  const notNow = modal.querySelector('[data-modal-action="0"]');
  click(notNow);
  await waitFor(() => $('#modalRoot').hidden, { label: 'prompt dismissal' });
});

test('every route renders without an error notice', async () => {
  for (const route of ['dashboard', 'test-centre', 'topic', 'custom', 'smart', 'mistakes', 'revision', 'syllabus', 'analytics', 'bank', 'settings', 'help']) {
    await goto(route);
    const text = viewText();
    assert.ok(text.length > 40, `${route} rendered almost nothing`);
    assert.ok(!/could not be displayed/i.test(text), `${route} reported a rendering error: ${text.slice(0, 200)}`);
    assert.ok(!/Loading local data/.test(text), `${route} stayed on the loading state`);
  }
});

test('the question bank screen imports the demonstration bank through the UI', async () => {
  await goto('bank');
  assert.match(viewText(), /Import a question bank/);
  click($('#loadDemo'));
  await waitFor(() => /Pre-import summary/.test(viewText()), { label: 'pre-import summary' });
  const summary = viewText();
  assert.match(summary, /Questions in file/);
  assert.match(summary, /Demonstration bank/i, 'the demonstration flag must be surfaced before importing');

  click($('#confirmImport'));
  await waitFor(() => $('#modalRoot').hidden === false, { label: 'confirmation dialog' });
  click($('#modalRoot').querySelector('[data-modal-action="1"]'));
  await waitFor(() => /Import complete/.test(viewText()), { label: 'import result' });
  const result = viewText();
  assert.match(result, /Questions added/);
  assert.ok(state.questionIndex.size >= 30, `expected the demo bank to be stored, found ${state.questionIndex.size}`);
  assert.ok(state.papers.size >= 3, 'expected the demo papers to be stored');

  await waitFor(() => /Bank: \d+ questions/.test($('#bankPill').textContent), { label: 'bank pill update' });
  assert.match($('#bankPill').textContent, new RegExp(`Bank: ${state.questionIndex.size} questions`));

  // The questions tab lists stored questions.
  const questionsTab = $$('#bankTabs .tab').find((t) => t.dataset.tab === 'questions');
  click(questionsTab);
  assert.match(viewText(), /Questions \(\d+ of \d+\)/);
  assert.ok($$('#view [data-open-question]').length > 0, 'question rows should offer an Open action');

  // Opening a question shows its answer keys and explanation status.
  click($$('#view [data-open-question]')[0]);
  await waitFor(() => $('#modalRoot').hidden === false, { label: 'question dialog' });
  const detail = $('#modalRoot').textContent;
  assert.match(detail, /Answer keys/);
  assert.match(detail, /Supplied by the source/);
  assert.match(detail, /Explanation/);
  click($('#modalRoot').querySelector('[data-modal-close]'));
});

test('practice setup screens describe what is available before starting', async () => {
  await goto('topic');
  assert.match(viewText(), /Available questions/);
  assert.match(viewText(), /matching/);
  await goto('smart');
  assert.match(viewText(), /How this session will be built/);
  assert.match(viewText(), /not evidence about what a future examination will contain/i);
  await goto('custom');
  assert.match(viewText(), /not an authentic previous-year paper/i);
  await goto('test-centre');
  assert.match(viewText(), /Previous-year papers|Paper simulations|Test Centre/i);
});

test('a full paper simulation runs, autosaves, submits and reports', async () => {
  await goto('test-centre');
  const start = $$('#view [data-action="start-paper"]').find((b) => !b.disabled);
  assert.ok(start, 'a paper simulation should be startable');
  const paperId = start.dataset.paper;
  click(start);
  await waitFor(() => $('#modalRoot').hidden === false, { label: 'simulation dialog' });
  click($('#modalRoot').querySelector('[data-modal-action="1"]'));

  await waitFor(() => /#\/runner\//.test(window.location.hash), { label: 'runner route' });
  await waitFor(() => /Question 1 of/.test(viewText()), { label: 'runner markup' });

  const testId = window.location.hash.split('/').pop();
  const { loadTest } = await import('../js/services/tests.js');
  let record = await loadTest(testId);
  assert.ok(record, 'the test session should be persisted');
  assert.equal(record.question_ids.length, state.papers.get(paperId).question_order.length, 'a full simulation keeps every stored question of the paper');

  // Answer the first question by clicking an option, then move on.
  const firstOption = $('#view [data-action="select"]');
  click(firstOption);
  await waitFor(async () => {
    const t = await loadTest(testId);
    return Object.values(t.responses).some((r) => r.selected?.length);
  }, { label: 'autosaved response' });

  click($('#view [data-action="next"]'));
  await waitFor(() => /Question 2 of/.test(viewText()), { label: 'second question' });
  click($('#view [data-action="flag"]'));
  await waitFor(async () => {
    const t = await loadTest(testId);
    return Object.values(t.responses).some((r) => r.flagged);
  }, { label: 'flag persisted' });

  click($$('#view [data-action="goto"]')[2]);
  await waitFor(() => /Question 3 of/.test(viewText()), { label: 'palette navigation' });
  const secondOption = $$('#view [data-action="select"]')[1];
  click(secondOption);

  click($('#view [data-action="submit"]'));
  await waitFor(() => $('#modalRoot').hidden === false, { label: 'submit confirmation' });
  const confirmText = $('#modalRoot').textContent;
  assert.match(confirmText, /unanswered|Submit/i);
  click($('#modalRoot').querySelector('[data-modal-action="1"]'));

  await waitFor(() => /#\/report\//.test(window.location.hash), { label: 'report route' });
  await waitFor(() => /Question review|Scoring rules/.test(viewText()), { label: 'report content' });
  const report = viewText();
  assert.match(report, /Scoring rules/i);
  assert.match(report, /Correct|Incorrect/i);
  record = await loadTest(testId);
  assert.equal(record.status, 'submitted');
  assert.ok(record.result && typeof record.result.score === 'number');
  assert.equal(record.result.counts.total, record.question_ids.length);
});

test('practice setup screens start real sessions from the shared configuration form', async () => {
  const { loadTest } = await import('../js/services/tests.js');
  const { state: appState } = await import('../js/core/state.js');

  // Topic practice: change the configured size, then start.
  await goto('topic');
  change($('#practiceCfgCount'), '4');
  click($('#startTopic'));
  await waitFor(() => /#\/runner\//.test(window.location.hash), { label: 'topic session route' });
  await waitFor(() => /Question 1 of/.test(viewText()), { label: 'topic runner markup' });
  let testId = window.location.hash.split('/').pop();
  let record = await loadTest(testId);
  assert.equal(record.kind, 'topic');
  assert.equal(record.question_ids.length, 4, 'the configured session size should be honoured');
  assert.equal(new Set(record.question_ids).size, record.question_ids.length, 'a practice set must not repeat a question');
  for (const id of record.question_ids) assert.ok(appState.questionIndex.has(id), `${id} should come from the stored index`);

  // Answer one question so the session is genuinely in progress, then leave it
  // unfinished on purpose: the dashboard should offer to resume it.
  click($('#view [data-action="select"]'));
  await waitFor(async () => {
    const t = await loadTest(testId);
    return Object.values(t.responses || {}).some((r) => r.selected?.length);
  }, { label: 'topic response autosave' });

  // Leaving the test screen must stop its background timer: the stored session
  // should not keep ticking (and writing) while another screen is open.
  await goto('dashboard');
  const beforeLap = (await loadTest(testId)).timer.remaining_seconds;
  await new Promise((resolve) => setTimeout(resolve, 2600));
  const afterLap = (await loadTest(testId)).timer.remaining_seconds;
  assert.equal(afterLap, beforeLap, 'the test clock must not keep ticking after leaving the test screen');

  assert.match(viewText(), /unfinished test/i);
  const resume = $$('#view a[href^="#/runner/"]').find((a) => /Resume/.test(a.textContent));
  assert.ok(resume, 'the dashboard should offer to resume the unfinished session');
  click(resume);
  await waitFor(() => /Question \d+ of/.test(viewText()), { label: 'resumed runner' });
  record = await loadTest(window.location.hash.split('/').pop());
  assert.equal(record.id, testId, 'resuming must return to the same session');
  assert.ok(Object.values(record.responses).some((r) => r.selected?.length), 'resumed session keeps its answers');

  // Smart practice: build and start a session.
  await goto('smart');
  click($('#startSmart'));
  await waitFor(() => /#\/runner\//.test(window.location.hash) && window.location.hash.split('/').pop() !== testId, { label: 'smart session route' });
  await waitFor(() => /Question 1 of/.test(viewText()), { label: 'smart runner markup' });
  const smart = await loadTest(window.location.hash.split('/').pop());
  assert.equal(smart.kind, 'smart');
  assert.ok(smart.question_ids.length > 0);
  assert.ok((smart.config.selection_notes || []).some((n) => /not a prediction/i.test(n)), 'a smart session must carry its explanation notes');
});

test('the mistake book, revision centre and analytics reflect the submitted test', async () => {
  await goto('mistakes');
  assert.match(viewText(), /Mistake Book/);
  assert.ok(!/No mistakes recorded yet/.test(viewText()) || state.settings.confidenceTracking !== 'off', 'the mistake book should reflect stored attempts');

  await goto('revision');
  assert.match(viewText(), /Revision Centre/);
  assert.match(viewText(), /How the revision schedule is decided/);
  assert.match(viewText(), /cannot guarantee/i);

  await goto('analytics');
  const analytics = viewText();
  assert.match(analytics, /Questions available/);
  assert.match(analytics, /Unique questions attempted/);
  assert.match(analytics, /Total attempts/);
  assert.match(analytics, /First-attempt accuracy/);
  assert.match(analytics, /not a prediction|does not predict/i);
});

test('settings persist, diagnostics run and the keyboard entry point works', async () => {
  await goto('settings');
  assert.match(viewText(), /Language, theme and defaults/);

  const select = $('#setConfidence');
  change(select, 'required');
  await waitFor(() => state.settings.confidenceTracking === 'required', { label: 'setting persisted' });
  change($('#setConfidence'), 'off');
  await waitFor(() => state.settings.confidenceTracking === 'off', { label: 'setting restored' });

  click($('#backupCheck'));
  await waitFor(() => /Round-trip self-test passed/.test($('#toastStack').textContent), { label: 'self-test toast' });

  await goto('analytics');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true }));
  await waitFor(async () => {
    const modal = $('#modalRoot').hidden ? null : $('#modalRoot');
    if (!modal) throw new Error('no modal yet');
    return /What this app does not do/.test(modal.textContent) ? modal : null;
  }, { label: 'help dialog' });
  assert.match($('#modalRoot').textContent, /does not generate explanations/i);
  click($('#modalRoot').querySelector('[data-modal-close]'));
});

test('the offline notice and service worker registration are wired without errors', async () => {
  window.dispatchEvent(new window.Event('offline'));
  await waitFor(() => /You are offline/.test($('#toastStack').textContent), { label: 'offline toast' });
  assert.equal($('#offlinePill').hidden, false);
  window.dispatchEvent(new window.Event('online'));
  assert.equal($('#offlinePill').hidden, true);
});

/* ------------------------------------------------- stylesheet regression -- */

/**
 * Regression test for the deployed-shell bug: the app shipped
 * `.modal-root { display: grid }` with no `[hidden]` reset. The browser's
 * built-in `[hidden] { display: none }` is a *user-agent* declaration, and any
 * author declaration that sets `display` beats it, so from the first frame the
 * empty `<div class="modal-root" id="modalRoot" hidden>` was laid out as a
 * full-viewport, z-index 70 overlay that swallowed every click — and the
 * always-present toast layer could swallow the clicks that got past it.
 *
 * This test reads the real index.html and css/app.css and renders them in a
 * fresh JSDOM: the shared document above has already been booted and mutated,
 * so it cannot show what a visitor's first frame looks like.
 *
 * One caveat about jsdom, stated rather than hidden: jsdom's default
 * stylesheet gives `[hidden]` the specificity of
 * `[hidden]:not([hidden=until-found i]):not(embed)`, which is higher than a
 * plain class selector, so jsdom accidentally keeps the `.modal-root` case
 * hidden even without the app's reset. `#toastStack` is styled through an
 * *id* selector, which does beat that rule, so the toast-stack assertion below
 * fails on the real broken stylesheet — that is checked, not assumed.
 */
test('the hidden attribute and the click-through layers cannot cover the app', async () => {
  const css = await readFile(path.join(repoRoot, 'css/app.css'), 'utf8');
  const page = new JSDOM(`<style>${css}</style>${html}`, { url: 'http://localhost:8080/', pretendToBeVisual: true });
  const { window } = page;
  const document = window.document;
  const display = (element) => window.getComputedStyle(element).display;
  const pointerEvents = (element) => window.getComputedStyle(element).pointerEvents;
  const label = (element) => `#${element.id || '(no id)'}${element.className ? `.${String(element.className).split(' ').join('.')}` : ''}`;

  /* 1. Nothing that carries the attribute may be laid out. */

  const initiallyHidden = [...document.querySelectorAll('[hidden]')];
  assert.ok(initiallyHidden.length >= 2, 'index.html is expected to ship hidden elements (the dialog overlay and the offline pill)');
  for (const element of initiallyHidden) {
    assert.equal(display(element), 'none', `${label(element)} carries the hidden attribute and must not be displayed`);
  }

  /* 2. The dialog overlay: a grid only while a dialog is actually open. */

  const modalRoot = document.getElementById('modalRoot');
  assert.equal(display(modalRoot), 'none', 'the empty overlay must not be laid out on the first frame');
  assert.equal(window.getComputedStyle(modalRoot).zIndex, '70', 'the overlay is a full-viewport z-index 70 layer, so hiding it correctly is what matters');
  modalRoot.hidden = false;
  assert.equal(display(modalRoot), 'grid', 'an open dialog must still be laid out as a grid');
  modalRoot.hidden = true;
  assert.equal(display(modalRoot), 'none', 'closing a dialog must hide the overlay again');

  /* 3. The toast layer is permanent, so it must be click-through. */

  const toastStack = document.getElementById('toastStack');
  assert.equal(window.getComputedStyle(toastStack).position, 'fixed');
  assert.equal(pointerEvents(toastStack), 'none', 'the always-present toast layer must not intercept clicks');

  const toast = document.createElement('div');
  toast.className = 'toast';
  toastStack.appendChild(toast);
  assert.equal(pointerEvents(toast), 'auto', 'a toast itself must remain clickable');

  /* 4. The case that fails on the broken stylesheet: an id-selector author
     rule that sets `display` (here `#toastStack { display: grid }`) against a
     `hidden` attribute. Without the reset this computes to grid, exactly the
     bug this test exists to prevent. */

  toastStack.hidden = true;
  assert.equal(display(toastStack), 'none', 'the [hidden] reset must beat an id-selector author display rule');
  toastStack.hidden = false;

  /* 5. And the reset itself must stay in the stylesheet: first rule, !important. */

  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(
    declarations,
    /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
    'css/app.css must keep an `[hidden] { display: none !important; }` reset',
  );
  assert.equal(
    declarations.match(/([^{}]+)\{/)[1].trim(),
    '[hidden]',
    'the [hidden] reset must stay the first rule of the stylesheet',
  );
});
