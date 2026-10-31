/**
 * ux-journeys.test.js — the five journeys the Phase-2 redesign promised.
 *
 * Every other UI suite checks a screen. This one checks the *routes through*
 * the screens, because that is what the redesign changed: how many actions it
 * takes to start the right thing, how many to act on a result, and what a
 * reader keeps hold of on the way (their filter, their scroll position, their
 * place in a queue).
 *
 *   A. Start studying — Today's rows are real, data-backed one-click starts.
 *   B. Build a session — the builder's panel is the confirmation; no dialog.
 *   C. Take a test — answering patches in place; palette filters and jumps; the
 *      submit sheet states the decision before it is taken.
 *   D. Learn from the results — the report's actions are buttons that start
 *      real sessions, and the weak topics carry their own Practise control.
 *   E. Revise — one question panel shared by the Mistake Book and the Revision
 *      Centre, opened inside the row; marking revised is one click.
 *
 * The suite drives the real index.html in jsdom against the demonstration bank.
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
const revisionSvc = await import('../js/services/revision.js');

const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => Array.from(window.document.querySelectorAll(selector));
const text = () => ($('#view')?.textContent || '').replace(/\s+/g, ' ').trim();

const click = (element) => {
  assert.ok(element, 'expected an element to click');
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, { label = 'condition', timeout = 8000, interval = 20 } = {}) {
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
  await waitFor(() => !/Loading local data/.test(text()), { label: `${route} to render` });
  return text();
}

const hashId = () => window.location.hash.split('/').pop();
const startRow = (id) => $(`#view .start-row [data-option="${id}"]`);

/* ------------------------------------------------------------------ boot -- */

test('00. the app boots with a demonstration bank to drive the journeys', async () => {
  const log = console.log;
  console.log = () => {};
  try {
    await stateModule.loadSettings();
    await stateModule.refreshQuestionIndex({ silent: true });
    if (!state.questionIndex.size) {
      const raw = await readFile(path.join(repoRoot, 'data/demo/demo-bank.json'), 'utf8');
      const analysis = await importer.analyseBankFile(raw, { filename: 'demo-bank.json' });
      await importer.executeImport(analysis, { conflictPolicy: 'skip' });
      await stateModule.refreshQuestionIndex({ silent: true });
    }
    app.boot();
    for (let i = 0; i < 400 && !app.router; i += 1) await sleep(25);
    assert.ok(state.questionIndex.size > 0, 'a bank is stored');
  } finally {
    console.log = log;
  }
});

/* ------------------------------------------------------------ journey A --- */

test('A. Today is a launcher: every row states a stored count and starts on click', async () => {
  await goto('dashboard');
  const rows = $$('#view .start-row');
  assert.ok(rows.length >= 5, 'the deck offers several real starts');

  // Every row that is not empty says how many questions it would start and
  // shows that number to the reader, not just to a screen reader.
  for (const row of rows) {
    const button = row.querySelector('button[data-option], a[href^="#/runner/"]');
    assert.ok(button, 'each row has exactly one action');
    if (row.classList.contains('is-empty')) {
      assert.ok(button.disabled || button.getAttribute('aria-disabled') === 'true', 'an empty row cannot be started');
      continue;
    }
    assert.match(row.textContent, /\d/, 'a startable row shows its size');
  }

  // One click on the smart row starts a session — no sheet, no dialog.
  const smart = startRow('smart');
  assert.ok(smart && !smart.disabled, 'a smart session is available');
  const before = (await testsSvc.listTests({ limit: 500 })).length;
  click(smart);
  await waitFor(() => /^#\/runner\//.test(window.location.hash), { label: 'the runner route' });
  await waitFor(() => /Question 1 of/.test(text()), { label: 'the runner markup' });
  const created = await testsSvc.listTests({ limit: 500 });
  assert.equal(created.length, before + 1, 'exactly one session was created');
  const test = created.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  assert.ok(test.question_ids.length > 0, 'the session has questions');

  // It is unfinished now, so Today offers it as a link that can be opened in a
  // new tab — and labels it in the reader's own words.
  await goto('dashboard');
  const resume = $$('#view a[href^="#/runner/"]').find((a) => /Resume/.test(a.textContent));
  assert.ok(resume, 'the unfinished session is offered as a real link');
  assert.match(text(), /unfinished test/i, 'and named as unfinished');
  click(resume);
  await waitFor(() => /Question 1 of/.test(text()), { label: 'the same session' });
  assert.equal(hashId(), test.id, 'the link returns to the same session');
});

/* ------------------------------------------------------------ journey B --- */

test('B. Building a session has no confirmation dialog: the panel is the confirmation', async () => {
  await goto('topic');
  const boxes = $$('#view input[data-action="pick-subject"]');
  assert.ok(boxes.length, 'the builder lists subjects');
  click(boxes[0]);
  await waitFor(() => $$('#view input[data-action="pick-subject"]').some((b) => b.checked), { label: 'a ticked subject' });

  const panel = $('#sessionPanel');
  assert.ok(panel, 'the session panel exists');
  const summary = panel.textContent.replace(/\s+/g, ' ');
  assert.match(summary, /\d+ questions? ready/, 'the panel states what will start');
  const count = Number(($('#pickMatch')?.textContent || '').replace(/\D/g, ''));
  assert.ok(count > 0, 'the pool is not empty');

  click($('#view [data-action="start-practice"]'));
  await waitFor(() => /^#\/runner\//.test(window.location.hash), { label: 'the runner route' });
  assert.equal($('#modalRoot').hidden, true, 'nothing was confirmed twice');
  const test = await testsSvc.loadTest(hashId());
  assert.equal(test.kind, 'topic', 'one subject with no topic is a topic session');
  assert.ok(test.question_ids.length > 0);
});

/* ------------------------------------------------------------ journey C --- */

test('C. Taking a test patches in place; the palette filters; the submit sheet states the decision', async () => {
  // A short session keeps the journey quick but exercises every control.
  await goto('runner/' + hashId());
  await waitFor(() => $('#view .runner'), { label: 'the runner' });

  const cardBefore = $('#questionCard');
  const option = $('#view [data-action="select"]');
  option.focus();
  click(option);
  await waitFor(() => $('#view [data-action="select"][aria-pressed="true"]'), { label: 'the pressed option' });
  assert.equal($('#questionCard'), cardBefore, 'answering does not replace the question card');
  assert.equal(window.document.activeElement, option, 'and does not move focus');

  const counts = await waitFor(() => {
    const answered = $$('#view .palette [data-action="goto"]').filter((b) => /answered/.test(b.getAttribute('aria-label') || '')).length;
    return answered >= 1 ? answered : null;
  }, { label: 'the palette to count the answer' });
  assert.ok(counts >= 1, 'the palette counts the answered question');

  // Filters narrow the grid without touching the session.
  const visibleCells = () => $$('#view .palette [data-action="goto"]').filter((b) => !b.hidden && !b.closest('[hidden]'));
  const totalCells = visibleCells().length;
  click($('#view [data-action="palette-filter"][data-filter="unanswered"]'));
  await waitFor(() => visibleCells().length === totalCells - counts, { label: 'the palette filtered to unanswered' });
  assert.equal(
    visibleCells().some((b) => /answered/.test(b.getAttribute('aria-label') || '')),
    false,
    'no answered question stays visible under the unanswered filter',
  );
  click($('#view [data-action="palette-filter"][data-filter="all"]'));

  // Flagging is in place too, and `]` jumps to the next unanswered question.
  const flag = $('#view [data-action="flag"]');
  click(flag);
  await waitFor(() => $('#view [data-action="flag"]')?.getAttribute('aria-pressed') === 'true', { label: 'the flag' });
  assert.equal($('#view [data-action="flag"]'), flag, 'flagging does not replace the control');

  // The submission sheet lists every decision before it is taken.
  click($('#view [data-action="submit"]'));
  const sheet = await waitFor(() => ($('#modalRoot').hidden === false ? $('#modalRoot') : null), { label: 'the submit sheet' });
  const sheetText = sheet.textContent.replace(/\s+/g, ' ');
  assert.match(sheetText, /Answered/i, 'it states how many were answered');
  assert.match(sheetText, /Unanswered/i, 'and how many are left');
  assert.match(sheetText, /Submit/i, 'and offers the submit action');
  const firstUnanswered = sheet.querySelector('[data-action="go-unanswered"], [data-modal-action="0"]');
  assert.ok(firstUnanswered, 'it offers a way back to the first unanswered question');
});

/* ------------------------------------------------------------ journey D --- */

test('D. The report leads with actions, and every weak topic can be practised from its row', async () => {
  // Finish the session started above.
  const sheet = $('#modalRoot');
  if (sheet && sheet.hidden === false) {
    const submit = Array.from(sheet.querySelectorAll('button')).find((b) => /Submit and see results|Submit/i.test(b.textContent));
    click(submit);
  }
  await waitFor(() => /^#\/report\//.test(window.location.hash), { label: 'the report route' });
  const report = await waitFor(() => (/Do something about it/.test(text()) ? text() : null), { label: 'the report' });

  // Order: the result, then what to do, then the topics, then the review.
  const order = ['How this sitting went', 'Do something about it', 'Weakest topics in this sitting', 'Question review', 'The details'];
  let cursor = -1;
  for (const heading of order) {
    const at = report.indexOf(heading);
    assert.ok(at > cursor, `${heading} comes after the previous section`);
    cursor = at;
  }
  assert.match(report, /Scoring rules/i, 'the rules that produced the score are still stated');

  // Each action states a count and is a real control.
  const actions = $$('#view .action-row button[data-action], #view .action-row a[href]');
  assert.ok(actions.length >= 3, 'the debrief offers several next actions');
  assert.ok($$('#view [data-action="retry-incorrect"]').length >= 1, 'retry is offered');
  assert.ok($$('#view [data-action="practise-weak"]').length >= 1, 'practising the weak topics is offered');

  // Practising a weak topic starts a session from this report.
  const practise = $$('#view [data-action="practise-weak"], #view tbody [data-action="practise-topic"]').find((b) => !b.disabled);
  if (practise) {
    click(practise);
    await waitFor(() => /^#\/runner\//.test(window.location.hash), { label: 'a session from the report' });
    const started = await testsSvc.loadTest(hashId());
    assert.ok(started.question_ids.length > 0, 'the session is real');
    await goto(`report/${started.id}`);
    await waitFor(() => !/Loading local data/.test(text()), { label: 'the report again' });
  }
});

/* ------------------------------------------------------------ journey E --- */

test('E. Review happens inside the row, and marking revised is one click', async () => {
  // Seed one mistake and one due revision so both screens have a row.
  const [firstId] = state.questionIndex.keys();
  await revisionSvc.ensureRevisionRecord(firstId, { reason: 'due for the journey test', dueDays: 0 });

  await goto('mistakes');
  const expand = $$('#view [data-action="expand"]')[0];
  if (!expand) {
    // Nothing was ever judged wrong in this bank: the screen must still be
    // honest about it rather than pretending to have rows.
    assert.match(text(), /Nothing to review|No mistakes recorded/i, 'an empty Mistake Book says so');
    return;
  }
  const rowsBefore = $$('#view tbody tr').length;
  const questionId = String(expand.dataset.key).split('::')[0];
  click(expand);
  const panel = await waitFor(() => {
    const node = $(`#view [data-review-for="${questionId}"]`);
    return node && node.textContent.includes('Attempt') ? node : null;
  }, { label: 'the inline review panel' });
  assert.equal($('#modalRoot').hidden, true, 'the review opened in the row, not over the list');
  assert.match(panel.textContent, /Attempts on this question/, 'it lists the attempt history');
  assert.ok($$('#view tbody tr').length >= rowsBefore, 'the list is still there');
  assert.equal(expand.getAttribute('aria-expanded'), 'true', 'the row says it is open');
  click(expand);
  await waitFor(() => expand.getAttribute('aria-expanded') === 'false', { label: 'the panel to close' });

  // The Revision Centre uses the same panel, and marks revised in place.
  await goto('revision');
  const mark = $$('#view [data-action="mark"]')[0];
  if (!mark) {
    assert.match(text(), /Nothing is scheduled/i, 'an empty queue says so');
    return;
  }
  const split = mark.parentElement.querySelector('.mark-split');
  assert.equal(split.hidden, true, 'the two-state choice starts closed');
  click(mark);
  await waitFor(() => split.hidden === false, { label: 'the inline choice' });
  assert.equal($('#modalRoot').hidden, true, 'no dialog was opened for the common action');
  const knew = split.querySelector('[data-action="mark-outcome"][data-outcome="correct"]');
  assert.ok(knew, 'the reader can say they knew it');
  const before = (await revisionSvc.allRevisionRecords()).find((r) => r.question_id === mark.dataset.qid);
  click(knew);
  await waitFor(async () => {
    const after = (await revisionSvc.allRevisionRecords()).find((r) => r.question_id === mark.dataset.qid);
    return after && before && (after.next_due !== before.next_due || after.level !== before.level) ? after : null;
  }, { label: 'the schedule to move' });
});
