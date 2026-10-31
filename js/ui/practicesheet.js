/**
 * practicesheet.js — the one lightweight way to start practising.
 *
 * Four questions, one screen, one Start button: *what* (the pool), *how many*,
 * *feedback* timing, and go. The full Topic & Custom Practice screen stays one
 * tap away in the sheet's footer for a reader who wants to narrow by year,
 * paper, type, subtopic or search.
 *
 * Two things are shared rather than re-implemented, because duplicating them is
 * how this app used to drift:
 *
 *  - the session form itself (`configFields()` / `mountConfigFields()` in
 *    views/shared.js), including its per-screen form memory, so a size or a
 *    feedback choice made here comes back after a re-render;
 *  - `FIXED_TEST_RULES` through `tests.createTest()`, so the three frozen rules
 *    — confidence always optional, verified key preferred, unresolved key judged
 *    with the supplied answer — are never offered as choices here. The form has
 *    no field for any of them; the sheet says so in one line instead.
 *
 * The sheet is opened from the dashboard's *Practise now*, the header's Quick
 * practice button and the `#/practise` deep link.
 */

import { state } from '../core/state.js';
import { esc, openModal, toast, infoToggle } from './components.js';
import { configFields, mountConfigFields, readConfig, FIXED_RULES_NOTE } from './views/shared.js';
import { buildAttemptSummary, smartPracticePlan } from '../services/select.js';
import { allAttempts } from '../services/attempts.js';
import * as tests from '../services/tests.js';
import { dueQueue, allRevisionRecords } from '../services/revision.js';
import { listMistakes } from '../services/attempts.js';
import { shuffle } from '../core/util.js';

const PREFIX = 'sheetCfg';
const SCREEN = 'practice-sheet';

/** The four pools the sheet can draw from, in the order they are offered. */
export const PRACTICE_POOLS = [
  { id: 'smart', label: 'Smart mix', hint: 'What is due, what you keep getting wrong, and what you have not seen yet.' },
  { id: 'bank', label: 'The whole bank', hint: 'Random questions from every subject you have stored.' },
  { id: 'revision', label: 'Due for revision', hint: 'Questions whose scheduled revision date has arrived.' },
  { id: 'mistakes', label: 'Open mistakes', hint: 'Wrong, skipped and flagged questions still open in the Mistake Book.' },
];

/**
 * Resolve a pool id to question ids. Returns `{ ids, label, notes }`.
 *
 * `count` is passed in for the smart pool because its plan *is* the answer:
 * "what is due, what you keep getting wrong, what you have not seen" is a
 * ranking cut to the size of the session. Building the plan over the whole bank
 * and slicing it afterwards would start a different set from the one the sheet
 * explained, so the size travels with the question.
 */
async function poolFor(poolId, { count = null } = {}) {
  const metas = Array.from(state.questionIndex.values());
  if (poolId === 'revision') {
    const queue = dueQueue(await allRevisionRecords());
    const ids = queue.ids.filter((id) => state.questionIndex.has(id));
    return { ids, label: 'Revision', notes: ['Questions whose scheduled revision date has arrived or passed.'] };
  }
  if (poolId === 'mistakes') {
    const rows = await listMistakes({ status: 'open' });
    const ids = Array.from(new Set(rows.map((row) => row.question_id))).filter((id) => state.questionIndex.has(id));
    return { ids, label: 'Mistakes', notes: ['Questions still open in the Mistake Book.'] };
  }
  if (poolId === 'bank') {
    return {
      ids: metas.map((meta) => meta.id),
      label: 'Practice',
      notes: ['Every subject in the stored bank, in random order for this session.'],
    };
  }
  const plan = smartPracticePlan({
    metas,
    attemptSummary: buildAttemptSummary(await allAttempts()),
    revisionRecords: await allRevisionRecords(),
    count: Math.max(1, Math.min(Number(count) || 20, metas.length)),
  });
  return {
    ids: plan.questionIds.filter((id) => state.questionIndex.has(id)),
    label: 'Smart practice',
    notes: ['Built from what is due for revision, what you keep getting wrong and what you have not seen yet.', ...plan.explain],
  };
}

/**
 * Open the sheet. Resolves when it closes; starting a session navigates to the
 * runner and returns the created test.
 *
 * @param {{ navigate: Function }} ctx   something with `navigate(path)`
 * @param {{ pool?: string, source?: string }} options
 */
export async function openPracticeSheet(ctx, { pool = 'smart', source = 'dashboard' } = {}) {
  if (!state.questionIndex.size) {
    toast('Import a question bank first — the Question Bank screen explains the format and includes a demonstration dataset.', 'warn');
    ctx?.navigate?.('bank');
    return null;
  }
  const pools = await Promise.all(PRACTICE_POOLS.map(async (entry) => ({ ...entry, available: (await poolFor(entry.id)).ids.length })));
  const poolOptions = pools
    .map(
      (entry) => `<label class="check"><input type="radio" name="${PREFIX}Pool" value="${esc(entry.id)}" ${entry.id === pool ? 'checked' : ''} ${entry.available ? '' : 'disabled'} />
        <span><strong>${esc(entry.label)}</strong> <span class="muted tiny">${entry.available} question${entry.available === 1 ? '' : 's'}</span><span class="hint block">${esc(entry.hint)}</span></span></label>`,
    )
    .join('');

  // The pool radios are captured on change rather than read from the DOM after
  // the dialog resolves: a closed dialog's markup is released on the next task.
  let chosenPool = pool;
  const result = await openModal({
    title: 'Practise now',
    body: `
      <p class="small mb-3">One short session. The full <a href="#/topic">Topic &amp; Custom Practice</a> screen is one tap away when you want to narrow by year, paper or topic.</p>
      <fieldset class="practice-sheet-what">
        <legend>What to practise</legend>
        <div class="stack-sm" id="${PREFIX}PoolList">${poolOptions}</div>
      </fieldset>
      ${configFields({ prefix: PREFIX, defaultCount: 20, maxCount: Math.min(100, state.questionIndex.size), allowCustomScoring: false, allowRepeatOverride: true })}
      <p class="hint mb-0">${esc(FIXED_RULES_NOTE)}</p>`,
    actions: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Start practice', tone: 'btn-primary', value: 'start' },
    ],
    onMount(modal) {
      mountConfigFields({ prefix: PREFIX, defaultCount: 20, maxCount: Math.min(100, state.questionIndex.size), allowRepeatOverride: true, screen: SCREEN });
      modal.querySelectorAll(`input[name="${PREFIX}Pool"]`).forEach((radio) => {
        radio.addEventListener('change', () => {
          chosenPool = radio.value;
        });
      });
      // Enter in the size field starts the session, as the size is the only
      // thing the reader usually types.
      modal.querySelector(`#${PREFIX}Count`)?.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        modal.querySelector('[data-value="start"]')?.click();
      });
    },
  });

  if (result !== 'start') return null;
  const config = readConfig(PREFIX, { defaultCount: 20 });
  const requested = Math.max(1, Number(config.count) || 20);
  const picked = await poolFor(chosenPool, { count: requested });
  if (!picked.ids.length) {
    toast('There is nothing in that pool right now. Try another one, or import more questions.', 'warn');
    return null;
  }
  // The smart plan already returns exactly the requested size, in its own
  // priority order; every other pool is drawn from at random here.
  const questionIds = chosenPool === 'smart' ? picked.ids.slice(0, requested) : shuffle(picked.ids).slice(0, requested);
  const metas = questionIds.map((id) => state.questionIndex.get(id)).filter(Boolean);
  const test = await tests.createTest({
    kind: chosenPool === 'smart' ? 'smart' : 'custom',
    label: `${picked.label} — ${questionIds.length} question${questionIds.length === 1 ? '' : 's'}`,
    questionIds,
    questionMetas: metas,
    orderSource: 'shuffled',
    config: {
      feedbackMode: config.feedbackMode,
      durationMinutes: config.durationMinutes,
      showTimer: config.showTimer,
      autoSubmitOnExpiry: config.autoSubmitOnExpiry,
      allowPause: config.allowPause,
      randomizeOptions: config.randomizeOptions,
    },
    selectionNotes: [...picked.notes, `Started from the practice sheet (${source}).`],
  });
  ctx?.navigate?.(`runner/${encodeURIComponent(test.id)}`);
  return test;
}

/** A tiny status line for the sheet's deep link, used by Help. */
export const PRACTICE_SHEET_NOTE = infoToggle(
  'About the practice sheet',
  '<p class="small m-0">Confidence marking, the answer-key policy and the unresolved-key policy are the same in every session, so they are stated rather than offered.</p>',
);
