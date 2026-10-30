/**
 * practice-flow.test.js — the three front doors and what they start.
 *
 * Phase 2 of the interface work is about getting from "I have a minute" to a
 * running session without reading a screen. This suite drives the three entry
 * points the reader actually has — the dashboard's *Practise now*, the header's
 * *Quick practice* and the `#/practise` deep link — through the real sheet, and
 * checks that:
 *
 *  * a session really starts, with the frozen rules the sheet must not offer as
 *    choices;
 *  * the sheet remembers the size and feedback timing between openings, using
 *    the same per-screen form memory the full practice screen uses;
 *  * the resume strip appears while a test is in progress and is absent on the
 *    runner itself;
 *  * ⌘K offers Go (every destination), Do (actions that resolve) and Find
 *    (subjects, topics, syllabus lines, questions), keyboard-only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { bootJsdom } from '../tools/density.mjs';
import { repoRoot } from './helpers.mjs';

const dom = await bootJsdom();
const { window } = dom;
const app = await import('../js/app.js');
const stateModule = await import('../js/core/state.js');
const { state } = stateModule;
const importer = await import('../js/services/importer.js');
const testsSvc = await import('../js/services/tests.js');
const { FIXED_TEST_RULES } = await import('../js/core/constants.js');

const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => Array.from(window.document.querySelectorAll(selector));
const click = (element) => {
  assert.ok(element, 'expected an element to click');
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
};
const key = (element, keyName) => {
  element.dispatchEvent(new window.KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true }));
};
const waitFor = async (predicate, { timeout = 6000, interval = 15, label = 'condition' } = {}) => {
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
};
const goto = async (route) => {
  window.location.hash = `#/${route}`;
  await app.router.resolve();
};

test('the app boots with a bank and an unfinished session', async () => {
  const log = console.log;
  console.log = () => {};
  try {
    await stateModule.loadSettings();
    await stateModule.refreshQuestionIndex({ silent: true });
    const text = await readFile(path.join(repoRoot, 'data/demo/demo-bank.json'), 'utf8');
    const analysis = await importer.analyseBankFile(text, { filename: 'demo-bank.json' });
    await importer.executeImport(analysis, { conflictPolicy: 'skip' });
    await stateModule.refreshQuestionIndex({ silent: true });
    app.boot();
    for (let i = 0; i < 400 && !app.router; i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
    assert.ok(state.questionIndex.size > 0, 'the bank is loaded');
  } finally {
    console.log = log;
  }
});

test('the practice sheet asks what, how many, feedback — and nothing frozen', async () => {
  await goto('dashboard');
  click($('#dashPractise'));
  const modal = await waitFor(() => $('#modalRoot .modal'), { label: 'the practice sheet' });

  assert.match(modal.textContent, /What to practise/, 'it asks what to practise');
  assert.equal(modal.querySelectorAll('input[name="sheetCfgPool"]').length, 4, 'four pools, each with a count');
  assert.ok(modal.querySelector('#sheetCfgCount'), 'it asks how many questions');
  assert.ok(modal.querySelector('#sheetCfgFeedback'), 'it asks when to reveal answers');
  assert.match(modal.textContent, /Confidence marking is always optional per question/, 'the frozen rules are stated, not offered');
  assert.equal(modal.querySelectorAll('[name="confidence"], [id*="confidence" i], [name="answerPolicy"], select[id*="Policy"]').length, 0, 'no choice exists for a frozen rule');
  assert.match(modal.textContent, /Topic & Custom Practice/, 'the full builder is one tap away');
  assert.ok(modal.querySelector('a[href="#/topic"]'), 'and that link is a real destination');

  // Start a real session from the sheet.
  const before = (await testsSvc.listTests({ limit: 500 })).length;
  modal.querySelector('#sheetCfgCount').value = '5';
  modal.querySelector('#sheetCfgCount').dispatchEvent(new window.Event('change', { bubbles: true }));
  click(modal.querySelector('[data-modal-action="1"]'));
  await waitFor(() => window.location.hash.startsWith('#/runner/'), { label: 'the new session' });
  await waitFor(() => $('#view .runner'), { label: 'the runner to render' });

  const after = await testsSvc.listTests({ limit: 500 });
  assert.equal(after.length, before + 1, 'one test was created');
  const created = after.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  assert.equal(created.question_ids.length, 5, 'the sheet started the size that was typed');
  assert.equal(created.config.answer_policy, FIXED_TEST_RULES.answerPolicy, 'the frozen answer policy was applied, not chosen');
  assert.equal(created.config.unresolved_policy, FIXED_TEST_RULES.unresolvedPolicy);
  assert.notEqual(created.config.confidence, 'off', 'confidence marking stays available in every session');
});

test('the sheet remembers the size and feedback between openings', async () => {
  await goto('dashboard');
  click($('#quickStartBtn'));
  let modal = await waitFor(() => $('#modalRoot .modal'), { label: 'the sheet from the header' });
  modal.querySelector('#sheetCfgCount').value = '7';
  modal.querySelector('#sheetCfgCount').dispatchEvent(new window.Event('change', { bubbles: true }));
  modal.querySelector('#sheetCfgFeedback').value = 'learning';
  modal.querySelector('#sheetCfgFeedback').dispatchEvent(new window.Event('change', { bubbles: true }));
  click(modal.querySelector('[data-modal-action="0"]'));
  await waitFor(() => $('#modalRoot').hidden, { label: 'the sheet to close' });

  click($('#quickStartBtn'));
  modal = await waitFor(() => $('#modalRoot .modal'), { label: 'the sheet reopened' });
  assert.equal(modal.querySelector('#sheetCfgCount').value, '7', 'the size I typed came back');
  assert.equal(modal.querySelector('#sheetCfgFeedback').value, 'learning', 'and so did the feedback timing');
  click(modal.querySelector('[data-modal-action="0"]'));
});

test('the #/practise deep link opens the same sheet', async () => {
  window.location.hash = '#/practise';
  await app.router.resolve();
  await waitFor(() => $('#modalRoot .modal'), { label: 'the sheet from a deep link' });
  assert.match($('#modalRoot .modal').textContent, /What to practise/);
  click($('#modalRoot .modal [data-modal-close]'));
  await waitFor(() => $('#modalRoot').hidden, { label: 'the sheet to close' });
  await waitFor(() => window.location.hash === '#/dashboard', { label: 'the deep link to settle on the dashboard' });
});

test('the resume strip shows a session in progress everywhere but the runner', async () => {
  // Make sure something is in progress.
  let unfinished = await testsSvc.unfinishedTests();
  if (!unfinished.length) {
    const ids = Array.from(state.questionIndex.keys()).slice(0, 4);
    const live = await testsSvc.createTest({
      kind: 'custom',
      label: 'Resume strip probe',
      questionIds: ids,
      questionMetas: ids.map((id) => state.questionIndex.get(id)),
      orderSource: 'shuffled',
      config: { feedbackMode: 'exam', scoring: { source: 'custom', marksPerCorrect: 3 } },
    });
    await testsSvc.saveTest(live);
    unfinished = await testsSvc.unfinishedTests();
  }
  assert.ok(unfinished.length, 'there is an unfinished session');

  for (const route of ['dashboard', 'topic', 'syllabus', 'settings']) {
    await goto(route);
    assert.equal($('#modalRoot').hidden, true, `no dialog is left open when arriving at ${route} (title=${$('#modalRoot .modal h2')?.textContent})`);
    await waitFor(() => $('#resumeStrip') && $('#resumeStrip').hidden === false, { label: `the strip on ${route}` });
    const strip = $('#resumeStrip');
    assert.match(strip.textContent, /answered/, 'it says how far the session has got');
    assert.match(strip.querySelector('a').getAttribute('href'), /^#\/runner\//, 'and links to the session');
  }

  await goto(`runner/${unfinished[0].id}`);
  assert.equal($('#resumeStrip').hidden, true, 'the runner is the resume: no strip over it');

  await goto('dashboard');
  await waitFor(() => $('#resumeStrip').hidden === false, { label: 'the strip to return' });
  // Finish the probe so later tests start clean.
  const probe = await testsSvc.loadTest(unfinished[0].id);
  if (probe) await testsSvc.abandonTest(probe);
});

test('⌘K is a front door: Go lists every destination, Do acts, Find resolves', async () => {
  await goto('dashboard');
  const rootEl = $('#modalRoot');
  assert.equal(rootEl.hidden, true, `no dialog should be open (hidden=${rootEl.hidden}, title=${rootEl.querySelector('.modal h2')?.textContent})`);
  $('#commandBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const modal = await waitFor(() => $('#modalRoot .command-menu'), { label: 'the command palette' });
  const groups = Array.from(modal.querySelectorAll('.command-group-title')).map((el) => el.textContent.trim());
  assert.deepEqual(groups.slice(0, 2), ['Go', 'Do'], 'the list is grouped by intent');

  const goItems = Array.from(modal.querySelectorAll('.command-item[data-command-kind="go"]'));
  assert.equal(goItems.length, 11, 'Go lists all eleven destinations');
  for (const item of goItems) assert.match(item.textContent, /Goes to /, 'every item says where it goes');

  // Keyboard only: filter to Settings and press Enter.
  const input = modal.querySelector('#commandSearch');
  input.value = 'settings';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  key(input, 'Enter');
  await waitFor(() => window.location.hash === '#/settings', { label: 'keyboard navigation to Settings' });
  await waitFor(() => $('#view .screen-head h1')?.textContent.includes('Settings'), { label: 'the Settings screen' });

  // Do: start a 20-question set, keyboard only.
  $('#commandBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor(() => $('#modalRoot .command-menu'), { label: 'the palette again' });
  const input2 = $('#commandSearch');
  input2.value = '20-question';
  input2.dispatchEvent(new window.Event('input', { bubbles: true }));
  key(input2, 'Enter');
  await waitFor(() => window.location.hash.startsWith('#/runner/'), { label: 'the 20-question session' });
  const created = (await testsSvc.listTests({ limit: 500 })).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  assert.equal(created.question_ids.length, 20);

  // Find: a subject and the syllabus index both resolve.
  await goto('dashboard');
  $('#commandBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor(() => $('#modalRoot .command-menu'), { label: 'the palette a third time' });
  const input3 = $('#commandSearch');
  input3.value = 'history';
  input3.dispatchEvent(new window.Event('input', { bubbles: true }));
  const findItems = await waitFor(() => {
    const items = $$('#commandFind .command-item');
    return items.length ? items : null;
  }, { label: 'Find results' });
  assert.ok(findItems.length >= 1, 'Find returns subjects, topics, syllabus lines or questions');
  for (const item of findItems) assert.match(item.textContent, /./, 'every result names something');
  key(input3, 'Escape');
});
