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
  for (const required of ['Dashboard', 'PYQ Test Centre', 'Topic Practice', 'Smart Practice', 'Mistake Book', 'Revision Centre', 'Syllabus & Planner', 'Analytics', 'PYQ Analysis', 'Question Bank & Imports', 'Settings & Backup']) {
    assert.ok(labels.some((l) => l.includes(required)), `navigation should offer ${required}`);
  }

  // First run with an empty database: the repository-backed MPPSC bank loads by
  // itself, so the app does not have to fall back to the demonstration prompt.
  await waitFor(() => state.questionIndex.size > 0, { label: 'bundled bank load' });
  assert.equal(state.questionIndex.size, 1171, 'the committed 2013-2024 bank is loaded from the repository');

  await goto('test-centre');
  assert.match(viewText(), /MPPSC 2019|MPPSC\s*2019|2019/, 'the Test Centre lists the real papers');
  assert.match(viewText(), /latest pattern · practice only/i, 'the current scheme is identified as a practice policy, not source evidence');
  assert.match(viewText(), /not as a claim about each paper.s historical rules/i);
  await goto('bank');
  assert.match(viewText(), /2013–2024|2013-2024/, 'the Question Bank screen names the bundled bank');
});

test('every route renders without an error notice', async () => {
  for (const route of ['dashboard', 'test-centre', 'topic', 'custom', 'smart', 'mistakes', 'revision', 'syllabus', 'analytics', 'pyq-analysis', 'bank', 'settings', 'help']) {
    await goto(route);
    const text = viewText();
    assert.ok(text.length > 40, `${route} rendered almost nothing`);
    assert.ok(!/could not be displayed/i.test(text), `${route} reported a rendering error: ${text.slice(0, 200)}`);
    assert.ok(!/Loading local data/.test(text), `${route} stayed on the loading state`);
  }
});

test('PYQ Analysis counts the bundled bank and deep-links into practice', async () => {
  await goto('pyq-analysis');
  assert.match(viewText(), /Questions per subject/);
  assert.match(viewText(), /Subject-by-year breakdown/);
  assert.match(viewText(), /Questions per topic/);
  assert.match(viewText(), /(?:1,171|1171)/, 'the whole bundled bank is counted');
  assert.match(viewText(), /2013–2024/, 'year columns and span include the historical papers');

  const link = $$('#view a[href^="#/topic/"]')[0];
  assert.ok(link, 'a subject row offers a way to practise it');
  const target = decodeURIComponent(link.getAttribute('href').replace('#/topic/', ''));
  const [subject] = target.split('||');

  await goto(`topic/${encodeURIComponent(target)}`);
  assert.equal(document.getElementById('fSubject').value, subject, 'the link preselects the subject it was clicked from');

  // …and editing a filter afterwards sticks: the route param is applied once per
  // navigation, not on every re-render.
  const select = document.getElementById('fSubject');
  select.value = 'all';
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
  await waitFor(() => document.getElementById('fSubject')?.value === 'all', { label: 'the edited filter to survive the re-render' });
  assert.equal(document.getElementById('fSubject').value, 'all', 'the route does not snap the filter back');

  // Returning to PYQ Analysis, filtering by a subject chip, and following a topic-level Practice link
  await goto('pyq-analysis');
  const topicLink = $$('#view a[href^="#/topic/"]').find((a) => decodeURIComponent(a.getAttribute('href')).includes('||'));
  assert.ok(topicLink, 'a topic row offers a direct Practice link for that subject and topic');
  const topicTarget = decodeURIComponent(topicLink.getAttribute('href').replace('#/topic/', ''));
  const [topicSubject, topicName] = topicTarget.split('||');

  await goto(`topic/${encodeURIComponent(topicTarget)}`);
  assert.equal(document.getElementById('fSubject').value, topicSubject, 'topic Practice link preselects the subject');
  assert.equal(document.getElementById('fTopic').value, topicName, 'topic Practice link preselects the topic');
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
  assert.match(detail, /Answer/);
  assert.match(detail, /Stored with the question/);
  assert.match(detail, /Explanation/);
  // Where an answer came from is never shown anywhere in the interface.
  assert.ok(!/unofficial|coaching|solved PYQ|printed answer/i.test(detail), 'no source provenance in the question dialog');
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

test('practice setup is progressive: essentials first, advanced collapsed and summarised', async () => {
  await goto('topic');
  assert.ok($('#practiceCfgCount'), 'session size is visible up front');
  assert.ok($('#practiceCfgFeedback'), 'feedback timing is visible up front');
  assert.ok($('#practiceStrategy'), 'topic selection strategy stays with the quick settings');
  const summary = $('#practiceCfgSummary');
  assert.ok(summary, 'the full session rules are summarised in plain language');
  assert.match(summary.textContent, /This session: \d+ question/);

  const advanced = $$('#view details.disclosure').find((d) => /Advanced settings/.test(d.querySelector('summary')?.textContent || ''));
  assert.ok(advanced, 'timing, scoring and confidence live behind one disclosure');
  assert.equal(advanced.open, false, 'the advanced settings start collapsed');

  change($('#practiceCfgMarksCorrect'), '5');
  assert.match($('#practiceCfgSummary').textContent, /\+5 marks, no negative marking/, 'the summary follows advanced changes');
  click($('#practiceCfgReset'));
  assert.match($('#practiceCfgSummary').textContent, /\+2 marks, no negative marking/, 'reset returns to the saved defaults');

  await goto('smart');
  assert.ok($('#practiceCfgCount'), 'smart practice has one size control in the session form');
  assert.ok(!$('#smartCount'), 'the duplicate size selector is gone');
  change($('#practiceCfgCount'), '15');
  await waitFor(() => /This session: 15 questions/.test($('#practiceCfgSummary')?.textContent || ''), { label: 'size change rebuilds the smart plan' });

  await goto('syllabus');
  const plannerText = viewText();
  assert.match(plannerText, /Syllabus structure/);
  assert.ok(!/Log a study session/.test(plannerText), 'study-session logging is gone from the planner');
  assert.ok(!/Study minutes per day/.test(plannerText), 'the study-minutes chart is gone from the planner');
  assert.ok(!/Recent sessions/.test(plannerText), 'the recent-sessions table is gone from the planner');
  assert.ok(!/Open tasks/.test(plannerText) && !/Suggested tasks/.test(plannerText) && !/New task/.test(plannerText), 'tasks are gone from the planner');

  await goto('custom');
  assert.ok($('#assembleCustom'), 'the custom builder still assembles tests');
  const moreNarrowing = $$('#view details.disclosure').find((d) => /Narrow further/.test(d.querySelector('summary')?.textContent || ''));
  assert.ok(moreNarrowing, 'year/paper/type pickers are tucked away');
  assert.equal(moreNarrowing.open, false, 'the optional pickers start collapsed');

  await goto('dashboard');
  assert.ok(!/Today's tasks/.test(viewText()), 'the dashboard no longer advertises the removed planner tasks');
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

test('every route renders with one h1, no skipped heading levels, and updates document.title', async () => {
  const routes = [
    'dashboard',
    'test-centre',
    'topic',
    'custom',
    'smart',
    'mistakes',
    'revision',
    'syllabus',
    'analytics',
    'pyq-analysis',
    'bank',
    'settings',
    'help',
  ];

  const seenTitles = new Set();
  for (const route of routes) {
    await goto(route);
    const h1s = $$('#view h1');
    assert.equal(h1s.length, 1, `route #/${route} must render exactly one <h1> (found ${h1s.length})`);

    const headings = $$('#view h1, #view h2, #view h3, #view h4, #view h5, #view h6');
    let prevLevel = 1;
    for (let i = 0; i < headings.length; i += 1) {
      const level = Number(headings[i].tagName.slice(1));
      if (i === 0) {
        assert.equal(level, 1, `first heading on #/${route} must be <h1>`);
      } else {
        assert.ok(
          level <= prevLevel + 1,
          `route #/${route} skipped a heading level from <h${prevLevel}> to <h${level}> ("${headings[i].textContent.trim()}")`,
        );
      }
      prevLevel = level;
    }

    assert.match(window.document.title, /· MyMPPSC$/, `document.title on #/${route} must end with "· MyMPPSC"`);
    seenTitles.add(window.document.title);
  }
  assert.ok(seenTitles.size >= 10, 'document.title must change across routes');
});

test('dialogs move focus inside, trap Tab at boundaries, close on Escape, and restore focus to the trigger', async () => {
  await goto('dashboard');
  const trigger = $('#helpBtn');
  trigger.focus();
  assert.equal(window.document.activeElement, trigger);

  click(trigger);
  await waitFor(() => !$('#modalRoot').hidden && $('#modalRoot .modal'), { label: 'modal open' });

  const modal = $('#modalRoot .modal');
  assert.equal(modal.getAttribute('role'), 'dialog');
  assert.equal(modal.getAttribute('aria-modal'), 'true');
  assert.ok(modal.getAttribute('aria-labelledby'), 'dialog must have aria-labelledby');
  assert.ok(modal.contains(window.document.activeElement), 'opening a dialog must move focus inside it');
  assert.equal($('#main').hasAttribute('inert'), true, 'background #main must be inert while dialog is open');

  const focusables = Array.from(
    modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  );
  assert.ok(focusables.length >= 2, 'dialog should have at least two focusable controls');

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  last.focus();
  assert.equal(window.document.activeElement, last);
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(window.document.activeElement, first, 'Tab on the last focusable element must wrap to the first');

  first.focus();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(window.document.activeElement, last, 'Shift+Tab on the first focusable element must wrap to the last');

  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await waitFor(() => $('#modalRoot').hidden, { label: 'modal closed on Escape' });
  assert.equal($('#main').hasAttribute('inert'), false, 'closing dialog must remove inert from #main');
  assert.equal(window.document.activeElement, trigger, 'closing dialog must restore focus to the trigger element');
});

test('off-canvas navigation is not focusable when closed and closes on scrim click or Escape', async () => {
  const prevWidth = window.innerWidth;
  window.innerWidth = 600;
  window.dispatchEvent(new window.Event('resize'));

  const nav = $('#appNav');
  const toggle = $('#navToggle');
  const scrim = $('#navScrim');

  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(nav.hasAttribute('inert'), true, 'closed off-canvas nav must have inert');
  assert.equal(nav.getAttribute('aria-hidden'), 'true', 'closed off-canvas nav must have aria-hidden="true"');
  const closedFocusables = Array.from(nav.querySelectorAll('a, button')).filter((el) => el.getAttribute('tabindex') !== '-1');
  assert.equal(closedFocusables.length, 0, 'closed off-canvas nav links must have tabindex="-1" so they cannot receive focus');

  click(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(nav.hasAttribute('inert'), false, 'open off-canvas nav must not be inert');
  assert.equal(nav.getAttribute('aria-hidden'), null);
  assert.equal(scrim.hidden, false, 'scrim must be visible when drawer is open');

  click(scrim);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false', 'clicking scrim must close the drawer');
  assert.equal(scrim.hidden, true);
  assert.equal(nav.hasAttribute('inert'), true);
  assert.equal(window.document.activeElement, toggle, 'closing drawer must restore focus to #navToggle');

  window.innerWidth = prevWidth;
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(nav.hasAttribute('inert'), false, 'desktop nav must remain interactive');
});

test('tabs implement APG roving tabindex and respond to ArrowRight, ArrowLeft, Home, and End', async () => {
  await goto('bank');
  const tablist = $('#view [role="tablist"]');
  assert.ok(tablist, 'bank view should render a tablist');
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  assert.ok(tabs.length >= 3, 'bank tablist should have multiple tabs');

  click(tabs[0]);
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(tabs[0].getAttribute('tabindex'), '0');
  assert.equal(tabs[1].getAttribute('aria-selected'), 'false');
  assert.equal(tabs[1].getAttribute('tabindex'), '-1');

  tabs[0].focus();
  tabs[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
  assert.equal(tabs[1].getAttribute('tabindex'), '0');
  assert.equal(tabs[0].getAttribute('tabindex'), '-1');
  assert.equal(window.document.activeElement, tabs[1]);
  assert.equal($(`#${tabs[1].getAttribute('aria-controls')}`).hidden, false);
  assert.equal($(`#${tabs[0].getAttribute('aria-controls')}`).hidden, true);

  tabs[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
  const lastIdx = tabs.length - 1;
  assert.equal(tabs[lastIdx].getAttribute('aria-selected'), 'true');
  assert.equal(window.document.activeElement, tabs[lastIdx]);

  tabs[lastIdx].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(window.document.activeElement, tabs[0]);

  tabs[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  assert.equal(tabs[lastIdx].getAttribute('aria-selected'), 'true');
});

test('theme setting and header toggle apply data-theme to html and update theme-color meta', async () => {
  await goto('settings');
  const themeSelect = $('#setTheme');
  assert.ok(themeSelect, 'settings must include #setTheme selector');

  change(themeSelect, 'dark');
  await waitFor(() => window.document.documentElement.getAttribute('data-theme') === 'dark', { label: 'dark theme applied' });
  assert.equal($('#themeColorMeta')?.getAttribute('content'), '#0f141c');

  change(themeSelect, 'light');
  await waitFor(() => window.document.documentElement.getAttribute('data-theme') === 'light', { label: 'light theme applied' });
  assert.equal($('#themeColorMeta')?.getAttribute('content'), '#f6f3ec');

  click($('#themeToggle'));
  await waitFor(() => window.document.documentElement.getAttribute('data-theme') === 'dark', { label: 'header theme toggle to dark' });
  assert.equal($('#themeToggle').getAttribute('aria-pressed'), 'true');

  click($('#themeToggle'));
  await waitFor(() => window.document.documentElement.getAttribute('data-theme') === 'light', { label: 'header theme toggle to light' });
  assert.equal($('#themeToggle').getAttribute('aria-pressed'), 'false');
});

test('runner supports focus mode, keyboard hints, Hindi lang="hi" tagging, and provenance chips', async () => {
  await goto('dashboard');
  assert.ok($$('#view [data-source]').length >= 5, 'dashboard must render provenance source chips');
  assert.ok($$('#view .evidence-meter').length >= 1, 'dashboard must render evidence strength meters');

  await goto('topic');
  change($('#practiceCfgCount'), '2');
  click($('#startTopic'));
  await waitFor(() => /#\/runner\//.test(window.location.hash), { label: 'runner started' });
  await waitFor(() => /Question 1 of/.test(viewText()), { label: 'runner rendered' });

  assert.equal($$('#view h1').length, 1, 'runner must have one h1');
  assert.ok($('#view .kbd-bar'), 'runner must render keyboard hint bar');
  assert.ok($('#view [data-action="next"]')?.getAttribute('aria-keyshortcuts'), 'runner controls must expose aria-keyshortcuts');

  const focusBtn = $('#view [data-action="focus-mode"]');
  assert.ok(focusBtn, 'runner must provide a focus-mode toggle');
  click(focusBtn);
  assert.equal(window.document.body.classList.contains('runner-focus'), true, 'focus mode must toggle runner-focus class on body');

  const hiBtn = $$('#view [data-action="lang"]').find((b) => b.dataset.lang === 'hi');
  if (hiBtn) {
    click(hiBtn);
    await waitFor(() => $('#view .question-stem[lang="hi"]'), { label: 'Hindi lang="hi" stem' });
    assert.ok($('#view .question-stem[lang="hi"]'), 'Devanagari stem must carry lang="hi"');
  }

  await goto('dashboard');
  assert.equal(window.document.body.classList.contains('runner-focus'), false, 'leaving the runner must clear runner-focus class from body');
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
