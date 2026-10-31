/**
 * screen-anatomy.test.js — the contract every screen is built to.
 *
 * docs/UI.md §6 says a screen opens with one `.screen-head`: the page's only
 * `<h1>`, one purpose line, and its actions. Cards follow §7: one `<h2>` title
 * row, an optional count chip, at most one ⓘ and at most one action. This suite
 * checks the rendered result on all eleven destinations, and measures each one
 * against the density budget in js/ui/budget.js — the same numbers that
 * `npm run check` enforces.
 *
 * It also asserts the mobile rules that jsdom cannot measure (no layout engine),
 * in the same way the existing phone-header regression test does: by reading the
 * stylesheet for the rules that make the layout work.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { card, countChip } from '../js/ui/components.js';
import { bootJsdom, SCREENS } from '../tools/density.mjs';
import { repoRoot } from './helpers.mjs';
import { measureScreen, auditScreen, DENSITY_BUDGET } from '../js/ui/budget.js';

const dom = await bootJsdom();
const { window } = dom;
const app = await import('../js/app.js');
const stateModule = await import('../js/core/state.js');
const { state } = stateModule;
const importer = await import('../js/services/importer.js');
const testsSvc = await import('../js/services/tests.js');
const questionsSvc = await import('../js/services/questions.js');

const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => Array.from(window.document.querySelectorAll(selector));
const css = await readFile(path.join(repoRoot, 'css/app.css'), 'utf8');

test('the anatomy suite boots a real app with a bank and some recorded activity', async () => {
  // Nothing is logged to the console while the suite runs; the app is noisy.
  const log = console.log;
  console.log = () => {};
  try {
    await stateModule.loadSettings();
    await stateModule.refreshQuestionIndex({ silent: true });
    const text = await readFile(path.join(repoRoot, 'data/demo/demo-bank.json'), 'utf8');
    const analysis = await importer.analyseBankFile(text, { filename: 'demo-bank.json' });
    await importer.executeImport(analysis, { conflictPolicy: 'skip' });
    await stateModule.refreshQuestionIndex({ silent: true });

    const metas = Array.from(state.questionIndex.values());
    const paper = state.papers.get(metas[0]?.paper_id);
    const picked = metas.slice(0, 12).map((m) => m.id);
    if (paper && picked.length) {
      const test = await testsSvc.createTest({
        kind: 'pyq_full',
        label: 'Anatomy set',
        paper,
        questionIds: picked,
        questionMetas: picked.map((id) => state.questionIndex.get(id)),
        orderSource: 'original',
        config: { feedbackMode: 'exam', confidence: 'off', scoring: { source: 'custom', marksPerCorrect: 3, negativeMarksIncorrect: 1, negativeMarksPerIncorrect: 1 } },
      });
      const map = await questionsSvc.getQuestions(picked);
      picked.forEach((id, index) => {
        const q = map.get(id);
        if (!q) return;
        const answer = q.verified?.answer?.length ? q.verified.answer : q.supplied?.answer || [];
        const options = Object.values(q.language_variants || {})[0]?.options?.map((o) => o.key) || ['a', 'b', 'c', 'd'];
        test.responses[id] = {
          selected: index % 3 === 0 ? answer : options.filter((k) => !answer.includes(k)).slice(0, 1),
          flagged: index === 2,
          confidence: index % 2 ? 'confident' : 'guessed',
          time_spent_ms: 30000,
          revealed: false,
          answered_at: new Date().toISOString(),
          visits: 1,
        };
      });
      await testsSvc.submitTest(test, { auto: false });
      const live = await testsSvc.createTest({
        kind: 'pyq_full',
        label: 'Anatomy unfinished set',
        paper,
        questionIds: picked.slice(0, 6),
        questionMetas: picked.slice(0, 6).map((id) => state.questionIndex.get(id)),
        orderSource: 'original',
        config: { feedbackMode: 'exam', confidence: 'off', scoring: { source: 'custom', marksPerCorrect: 3, negativeMarksIncorrect: 1 } },
      });
      live.responses[picked[0]] = { selected: [], flagged: false, confidence: null, time_spent_ms: 0, revealed: false, answered_at: null, visits: 1 };
      await testsSvc.saveTest(live);
    }
    app.boot();
    for (let i = 0; i < 400 && !app.router; i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
    assert.ok(app.router, 'the app booted');
  } finally {
    console.log = log;
  }
});

async function goto(route) {
  window.location.hash = `#/${route}`;
  await app.router.resolve();
  return window.document.getElementById('view');
}

test('every screen has one h1, inside its screen head, with a purpose line', async () => {
  for (const route of SCREENS) {
    const root = await goto(route);
    const h1s = root.querySelectorAll('h1');
    assert.equal(h1s.length, 1, `${route}: exactly one <h1> on the screen`);
    const head = h1s[0].closest('.screen-head');
    assert.ok(head, `${route}: the h1 lives in .screen-head, not loose in the body`);
    assert.match(head.querySelector('.screen-purpose')?.textContent || '', /\S/, `${route}: the screen says what it is for`);
    assert.ok(head.querySelector('.screen-actions .btn'), `${route}: the screen offers at least one next action`);
  }
});

test('no screen skips a heading level', async () => {
  for (const route of SCREENS) {
    const root = await goto(route);
    const levels = Array.from(root.querySelectorAll('h1, h2, h3, h4')).map((h) => Number(h.tagName.slice(1)));
    let previous = 0;
    for (const level of levels) {
      assert.ok(level <= previous + 1, `${route}: heading goes from h${previous} to h${level}`);
      previous = Math.max(previous, level);
    }
  }
});

test('each card has one title row: h2, at most one ⓘ and at most one action', async () => {
  for (const route of SCREENS) {
    const root = await goto(route);
    for (const card of root.querySelectorAll('.card')) {
      const heads = card.querySelectorAll('.card-head');
      assert.ok(heads.length <= 1, `${route}: a card has one head`);
      const titleHeadings = card.querySelectorAll('.card-head > .card-head-text h2, .card-head > .card-head-text h3');
      assert.ok(titleHeadings.length <= 1, `${route}: a card's title row carries at most one heading`);
      const infos = card.querySelectorAll('.card-head .info-toggle');
      assert.ok(infos.length <= 1, `${route}: a card head carries at most one ⓘ`);
      const actions = card.querySelectorAll('.card-head .card-action > *');
      assert.ok(actions.length <= 1, `${route}: a card head carries at most one action (put the rest in a toolbar)`);
    }
  }
});

test('screen text never exposes escaped HTML attributes', async () => {
  for (const route of SCREENS) {
    const root = await goto(route);
    assert.doesNotMatch(root.textContent, /class=["']/i, `${route}: no leaked markup in screen text`);
  }
});

test('card count accepts plain text and legacy chips without double escaping', () => {
  const container = window.document.createElement('div');
  for (const count of ['12 < items', countChip('12 < items')]) {
    container.innerHTML = card({ title: 'Test', count });
    assert.equal(container.querySelectorAll('.count-chip').length, 1);
    assert.equal(container.querySelector('.count-chip').textContent, '12 < items');
    assert.doesNotMatch(container.textContent, /class=/);
  }
  for (const count of [null, undefined, '', '  ']) {
    container.innerHTML = card({ title: 'Test', count });
    assert.equal(container.querySelector('.count-chip'), null);
  }
  container.innerHTML = card({ title: 'Test', count: 0 });
  assert.equal(container.querySelector('.count-chip').textContent, '0');
});

test('view card count slots do not wrap values in countChip', async () => {
  const dir = path.join(repoRoot, 'js/ui/views');
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.js')) continue;
    assert.doesNotMatch(await readFile(path.join(dir, file), 'utf8'), /\bcount\s*:\s*countChip\s*\(/, file);
  }
});

test('header wraps and tab bar display rules are scoped to their breakpoints', () => {
  const style = window.document.createElement('style');
  style.textContent = css;
  window.document.head.append(style);
  try {
    const rules = Array.from(style.sheet.cssRules);
    assert.ok(rules.some((rule) => rule.selectorText === '.app-header' && rule.style.getPropertyValue('flex-wrap') === 'wrap'));
    const displays = [];
    function collect(list, media = '') {
      for (const rule of list) {
        if (rule.selectorText === '.tab-bar' && rule.style.getPropertyValue('display')) {
          displays.push({ media, display: rule.style.getPropertyValue('display') });
        }
        if (rule.cssRules?.length) collect(rule.cssRules, rule.conditionText || media);
      }
    }
    collect(rules);
    assert.deepEqual(displays, [
      { media: '(max-width: 560px)', display: 'grid' },
      { media: '(min-width: 561px)', display: 'none' },
    ]);
  } finally {
    style.remove();
  }
});

test('every screen is inside the density budget', async () => {
  for (const route of SCREENS) {
    const root = await goto(route);
    const measured = measureScreen(root);
    assert.deepEqual(auditScreen(route, measured), [], `${route} is inside the budget`);
    assert.ok(measured.words > 0 || measured.cards === 0, `${route}: either it says something or it has no cards`);
    assert.ok(measured.cards <= DENSITY_BUDGET.cardsPerScreen);
  }
});

test('the card anatomy is styled from tokens, not from per-screen rules', () => {
  assert.match(css, /\.screen-head\s*\{[^}]*border-bottom:\s*1px solid var\(--border-subtle\)/, '.screen-head keeps a quiet rule');
  assert.match(css, /\.card-head\s*\{[^}]*padding:\s*var\(--pad-card-head\)/, '.card-head takes its padding from the density token');
  assert.match(css, /\.card-body\s*\{[^}]*padding:\s*var\(--pad-card\)/, '.card-body takes its padding from the density token');
  assert.match(css, /\.count-chip\s*\{[^}]*font-size:\s*var\(--text-xs\)/, 'a count chip is a caption, not a second title');
  assert.match(css, /\.screen-purpose\s*\{[^}]*max-width:\s*var\(--measure\)/, 'the purpose line keeps the 65ch measure');
});

test('compact density really changes padding, row height and leading', () => {
  const compact = css.slice(css.indexOf(':root[data-density="compact"] {'));
  assert.match(compact, /--pad-card:\s*12px/, 'compact shrinks card padding');
  assert.match(compact, /--pad-card-head:\s*9px 12px/, 'compact shrinks the card head');
  assert.match(compact, /--pad-cell-y:\s*4px/, 'compact shrinks table row height');
  assert.match(compact, /--lh-base:\s*1\.42/, 'compact tightens body leading');
  assert.match(css, /table\.data td[^{]*\{[^}]*padding:\s*var\(--pad-cell-y\) var\(--pad-cell-x\)/, 'table cells read the density tokens');
});

test('the phone shell has a five-item tab bar and card rows, with 44px targets', () => {
  const phone = css.slice(css.lastIndexOf('@media (max-width: 560px) {'));
  assert.match(css, /\.tab-bar\s*\{[^}]*display:\s*none/, 'the bar is off above 560px');
  assert.match(phone, /\.tab-bar\s*\{[^}]*display:\s*grid/, 'and a grid of destinations at 560px');
  assert.match(phone, /\.tab-bar-item\s*\{[^}]*min-height:\s*var\(--touch-min\)/, 'every tab is a touch target');
  assert.match(css, /--touch-min:\s*44px/, 'the touch minimum is a token');
  assert.match(phone, /table\.data\.cards-mobile td\[data-label\]::before\s*\{[^}]*content:\s*attr\(data-label\)/, 'a wide table becomes labelled rows');
  assert.match(phone, /\.option-row\s*\{[^}]*min-height:\s*56px/, 'runner options are comfortably tappable');
  assert.match(phone, /\.runner-nav\s*\{[^}]*position:\s*sticky/, 'the runner answer bar stays in reach');
  const bar = $('#tabBar');
  assert.equal(bar.querySelectorAll('.tab-bar-item[data-route]').length, 5, 'five destinations are pinned, and More opens the drawer');
  assert.equal(bar.querySelectorAll('[data-more]').length, 1, 'the drawer is still one tap away');
  assert.equal(bar.getAttribute('aria-label'), 'Quick navigation');
});

test('the runner keeps its desktop tools when the phone rules change it', async () => {
  const text = await readFile(path.join(repoRoot, 'js/ui/views/runner.js'), 'utf8');
  for (const tool of ['data-action="focus-mode"', 'data-action="kbd-legend"', 'runnerKbdLegend', 'aria-keyshortcuts']) {
    assert.ok(text.includes(tool), `the runner still offers ${tool}`);
  }
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*\.runner/, 'runner animation is behind reduced-motion');
});
