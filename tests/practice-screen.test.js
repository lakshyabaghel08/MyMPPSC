/**
 * practice-screen.test.js — Topic & Custom Practice, the screen that replaced
 * Topic Practice and the Custom Test builder.
 *
 * Boots the real index.html in jsdom with the bundled 1,200-question bank and
 * drives the screen the way a reader does. What is asserted here is the part
 * the two old screens got wrong, plus the parts that could silently rot:
 *
 *  * selection is a **union** — a topic can never stay selected "under" a
 *    subject that is not selected, which is how the old builder produced
 *    "0 questions match" behind a full-looking form (bug B1);
 *  * every count belongs to **its own subject** — "Unclassified" under Polity is
 *    Polity's own unlabelled questions, not the ones from the whole bank (B2);
 *  * the strategy decides *which* questions are picked and "shuffle question
 *    order" decides how they are arranged, and `order_source` says which of the
 *    two actually happened (B3);
 *  * the session form survives an in-place re-render (B4);
 *  * `#/custom`, `#/custom/…` and `#/topic/<Subject>[||<Topic>]` all land on
 *    this screen with the right navigation item highlighted (B8), and every
 *    practice link in the app is built by the one shared helper (B10);
 *  * expanding a subject group is a DOM toggle, not a re-render.
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
const testsSvc = await import('../js/services/tests.js');
const selectSvc = await import('../js/services/select.js');
const { topicPracticeHref, parseTopicPracticeParam } = await import('../js/core/util.js');

const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => Array.from(window.document.querySelectorAll(selector));
const viewText = () => ($('#view')?.textContent || '').replace(/\s+/g, ' ');
const click = (element) => {
  assert.ok(element, 'expected an element to click');
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
};
/** Tick or untick a checkbox the way a click does (property + change event). */
const tick = (box) => {
  assert.ok(box, 'expected a checkbox to click');
  box.click();
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, { timeout = 8000, interval = 15, label = 'condition' } = {}) {
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
  await waitFor(() => !/Loading local data/.test(viewText()), { label: `${route} to render` });
  return viewText();
}

/* ------------------------------------------------------- screen helpers --- */

const subjectBox = (name) => $(`#view input[data-action="pick-subject"][data-value="${window.CSS.escape(name)}"]`);
const topicBox = (subject, topic) =>
  $(`#view input[data-action="pick-topic"][data-value="${window.CSS.escape(`${subject}||${topic}`)}"]`);
const caret = (subject) => $(`#view [data-action="pick-expand"][data-value="${window.CSS.escape(subject)}"]`);
const matchCount = () => Number(($('#pickMatch')?.textContent || '').replace(/[^\d]/g, ''));
/**
 * Wait for the pool itself. A ticked checkbox changes its own `checked`
 * property before the re-render that reports it, so waiting on the property
 * would pass on the previous screen and read stale numbers.
 */
const awaitCount = (expected, label = `the pool to hold ${expected}`) => waitFor(() => matchCount() === expected, { label });
const narrowSummary = () => ($('#narrowFilters > summary')?.textContent || '').trim();

/** Open a subject group and hand back the topic checkboxes inside it. */
async function openGroup(subject) {
  const button = caret(subject);
  assert.ok(button, `expected an expand button for ${subject}`);
  const panelId = button.getAttribute('aria-controls');
  if ($(`#${window.CSS.escape(panelId)}`)?.hidden) click(button);
  await waitFor(() => $(`#${window.CSS.escape(panelId)}`)?.hidden === false, { label: `${subject} to open` });
  return { button, panelId, topics: $$(`#${window.CSS.escape(panelId)} input[data-action="pick-topic"]`) };
}

/** The screen as it starts: nothing ticked, nothing filtered, every group folded. */
async function resetScreen() {
  await goto('topic');
  await waitFor(() => $('#view [data-action="clear-selection"]'), { label: 'the practice picker' });
  const clear = $('#view [data-action="clear-selection"]');
  if (!clear.disabled) {
    click(clear);
    await waitFor(() => $('#view [data-action="clear-selection"]').disabled, { label: 'the selection to clear' });
  }
  for (const open of $$('#view [data-action="pick-expand"][aria-expanded="true"]')) click(open);
  if (narrowSummary() !== 'Narrow further') {
    click($('#view [data-action="clear-filters"]'));
    await waitFor(() => narrowSummary() === 'Narrow further', { label: 'the filters to clear' });
  }
}

/* --------------------------------------------------------- bank helpers --- */

const NO_TOPIC = 'Unclassified';
const metas = () => Array.from(state.questionIndex.values());
const countWhere = (predicate) => metas().filter(predicate).length;
const subjectCount = (subject) => countWhere((m) => (m.subject || NO_TOPIC) === subject);
const topicCount = (subject, topic) =>
  countWhere((m) => (m.subject || NO_TOPIC) === subject && (m.topic || NO_TOPIC) === topic);

/**
 * The bank the way the picker sees it, so a test never has to guess a subject
 * name: `[{ subject, count, topics: [{ topic, count }] }]`, biggest first.
 */
function bankGroups() {
  const bySubject = new Map();
  for (const meta of metas()) {
    const subject = meta.subject || NO_TOPIC;
    const topic = meta.topic || NO_TOPIC;
    if (!bySubject.has(subject)) bySubject.set(subject, new Map());
    const topics = bySubject.get(subject);
    topics.set(topic, (topics.get(topic) || 0) + 1);
  }
  return Array.from(bySubject.entries())
    .map(([subject, topics]) => ({
      subject,
      count: Array.from(topics.values()).reduce((a, b) => a + b, 0),
      topics: Array.from(topics.entries())
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic)),
    }))
    .sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject));
}

await waitFor(() => app.router !== null && state.dbError === null, { label: 'the app to boot' });
await waitFor(() => state.questionIndex.size >= 1200, { label: 'the bundled bank' });

const BANK = bankGroups();
const BIGGEST = BANK[0];
/** A subject with at least two topics, so "all" and "some" can be told apart. */
const SPLIT = BANK.find((g) => g.topics.length >= 2 && g.topics[0].count < g.count);
const OTHER = BANK.find((g) => g.subject !== BIGGEST.subject && g.subject !== SPLIT.subject);

/* ---------------------------------------------------------------- tests --- */

test('nothing ticked means the whole bank, and every group starts collapsed', async () => {
  await resetScreen();
  assert.ok(BANK.length >= 3, 'the bank spans several subjects');
  assert.ok(SPLIT && OTHER, 'and at least three of them are distinct enough to compare');
  assert.equal(matchCount(), state.questionIndex.size, 'an empty selection is the whole bank');
  assert.match($('#pickSummary').textContent, /Nothing ticked — the whole bank is included/, 'and the summary says so in words');
  assert.equal($('#pickMatch').textContent.trim(), `${state.questionIndex.size} questions match`);

  const groups = $$('#view .pick-group');
  assert.equal(groups.length, BANK.length, 'one row per subject the bank holds');
  assert.equal(
    groups.map((g) => Number(g.querySelector('.pick-count').textContent.replace(/\D/g, ''))).reduce((a, b) => a + b, 0),
    state.questionIndex.size,
    'the per-subject counts account for every stored question exactly once',
  );
  assert.ok(groups.every((g) => g.querySelector('.pick-topics').hidden), 'every subject group starts collapsed');
  assert.ok(
    groups.every((g) => g.querySelector('[data-action="pick-expand"]').getAttribute('aria-expanded') === 'false'),
    'and says so to a screen reader',
  );
  assert.ok($('#view [data-action="clear-selection"]').disabled, 'there is nothing to clear');
});

test('a subject checkbox is tri-state over its own topics', async () => {
  await resetScreen();
  const subject = SPLIT.subject;
  const dropped = SPLIT.topics[SPLIT.topics.length - 1]; // the smallest topic in it
  const box = subjectBox(subject);
  assert.equal(box.checked, false, 'nothing is ticked to start with');
  assert.equal(box.indeterminate, false);

  tick(box);
  await awaitCount(subjectCount(subject), 'the whole subject');
  assert.equal(subjectBox(subject).checked, true, 'a whole subject is "all of it"');
  assert.equal(subjectBox(subject).indeterminate, false);

  const { topics } = await openGroup(subject);
  assert.equal(topics.length, SPLIT.topics.length, 'the group lists the subject\'s own topics');
  assert.ok(topics.every((t) => t.checked), 'a whole subject ticks every topic in it');

  tick(topicBox(subject, dropped.topic));
  await awaitCount(subjectCount(subject) - dropped.count, 'the subject minus one topic');
  assert.equal(subjectBox(subject).indeterminate, true, '"some of it", not "all of it"');
  assert.equal(subjectBox(subject).checked, false);

  tick(topicBox(subject, dropped.topic));
  await awaitCount(subjectCount(subject), 'the whole subject again');
  assert.equal(subjectBox(subject).checked, true, 'the last topic ticks the subject back up to whole');
  assert.equal(subjectBox(subject).indeterminate, false);

  tick(subjectBox(subject));
  await awaitCount(state.questionIndex.size, 'the whole bank');
  assert.equal(subjectBox(subject).checked, false, 'unticking a subject clears its topics too');
  assert.equal(subjectBox(subject).indeterminate, false);
  const reopened = await openGroup(subject);
  assert.ok(reopened.topics.every((t) => !t.checked), 'nothing inside it is left ticked');
});

test('the selection is a union across subjects, and a topic cannot outlive its subject (B1)', async () => {
  await resetScreen();
  const first = SPLIT.topics[0];
  await openGroup(SPLIT.subject);
  tick(topicBox(SPLIT.subject, first.topic));
  await awaitCount(first.count, 'one topic');
  assert.equal(subjectBox(SPLIT.subject).indeterminate, true, 'one topic leaves its subject half-ticked');

  // A second subject joins the pool; it does not narrow it. The old builder
  // intersected the two, so ticking a subject outside the topic's own subject
  // dropped the pool to zero while the form still looked full.
  tick(subjectBox(OTHER.subject));
  await awaitCount(first.count + subjectCount(OTHER.subject), 'the two selections added together');
  assert.match($('#pickSummary').textContent, /whole subject/, 'the summary describes what is ticked');
  assert.match($('#pickSummary').textContent, new RegExp(SPLIT.subject), 'and names both subjects');

  // Two clicks take a half-ticked subject back to unticked: first to whole,
  // then to nothing. Either way no topic survives without its subject.
  tick(subjectBox(SPLIT.subject));
  await awaitCount(subjectCount(SPLIT.subject) + subjectCount(OTHER.subject), 'the subject back to whole');
  assert.ok(
    (await openGroup(SPLIT.subject)).topics.every((t) => t.checked),
    'going back to whole re-ticks every topic in it',
  );
  tick(subjectBox(SPLIT.subject));
  await awaitCount(subjectCount(OTHER.subject), 'the subject gone');
  assert.equal(subjectBox(SPLIT.subject).checked, false);
  assert.equal(subjectBox(SPLIT.subject).indeterminate, false);
  const reopened = await openGroup(SPLIT.subject);
  assert.ok(
    reopened.topics.every((t) => !t.checked),
    'no topic is left ticked under a subject that is not selected',
  );
  assert.ok(!new RegExp(SPLIT.subject).test($('#pickSummary').textContent), 'and the summary does not claim it');

  // Two topics from two subjects: still a union, and the kind is a custom set.
  tick(topicBox(SPLIT.subject, first.topic));
  await awaitCount(first.count + subjectCount(OTHER.subject), 'the union again');
  assert.match(viewText(), /Recorded as a custom set/, 'two subjects is wider than one topic');
});

test('counts belong to their own subject, not to the topic name across the bank (B2)', async () => {
  await resetScreen();
  const unlabelled = countWhere((m) => !m.topic);
  const holders = BANK.filter((g) => g.topics.some((t) => t.topic === NO_TOPIC));
  assert.ok(holders.length >= 1, 'at least one subject holds questions with no topic label');
  // The bug was only visible where the same label is shared, so insist on one.
  assert.ok(
    holders.some((g) => g.topics.find((t) => t.topic === NO_TOPIC).count < unlabelled),
    'the bank has more than one subject contributing unlabelled questions',
  );

  for (const group of holders) {
    const own = group.topics.find((t) => t.topic === NO_TOPIC).count;
    const { panelId } = await openGroup(group.subject);
    const row = $$(`#${window.CSS.escape(panelId)} .pick-check`).find((label) => label.textContent.trim().startsWith(NO_TOPIC));
    assert.ok(row, `${group.subject} lists its own unlabelled questions`);
    assert.equal(
      Number(row.querySelector('.pick-count').textContent.replace(/\D/g, '')),
      own,
      `"${NO_TOPIC}" under ${group.subject} counts ${group.subject}'s own ${own}, not the bank's ${unlabelled}`,
    );
    // Every topic row inside the group adds up to the group's own total.
    const rows = $$(`#${window.CSS.escape(panelId)} .pick-check`);
    assert.equal(
      rows.reduce((total, label) => total + Number(label.querySelector('.pick-count').textContent.replace(/\D/g, '')), 0),
      group.count,
      `${group.subject}'s topic counts add up to its subject count`,
    );
    click(caret(group.subject));
  }
});

test('a deep link selects what it names, once per arrival', async () => {
  const subject = SPLIT.subject;
  const topic = SPLIT.topics[0].topic;

  await goto(`topic/${encodeURIComponent(subject)}`);
  await waitFor(() => subjectBox(subject)?.checked === true, { label: 'the subject to be ticked' });
  assert.equal(matchCount(), subjectCount(subject), 'a subject link selects the whole subject');

  await goto(`topic/${topicPracticeHref(subject, topic).slice('#/topic/'.length)}`);
  await waitFor(() => topicBox(subject, topic)?.checked === true, { label: 'the topic to be ticked' });
  assert.equal(subjectBox(subject).indeterminate, true, 'one topic leaves the subject half-ticked');
  assert.equal(matchCount(), topicCount(subject, topic));
  assert.match(viewText(), /Recorded as a topic session/, 'and it is still a topic session');

  // Editing the selection afterwards sticks: the route is applied on arrival,
  // not re-imposed on every in-place re-render.
  tick(subjectBox(subject));
  await awaitCount(subjectCount(subject), 'the subject back to whole');
  tick(subjectBox(OTHER.subject));
  await awaitCount(subjectCount(subject) + subjectCount(OTHER.subject), 'a second subject');
  assert.equal(subjectBox(subject).checked, true, 'the link is not re-applied over the edit');

  // A subject the bank does not hold is ignored rather than selected: choosing
  // it would leave "0 questions match" with nothing on screen to explain why.
  await resetScreen();
  await goto(`topic/${encodeURIComponent('Not A Real Subject')}`);
  assert.equal(matchCount(), state.questionIndex.size, 'an unknown subject leaves the pool alone');
  assert.ok($('#view [data-action="clear-selection"]').disabled, 'and selects nothing');

  // An unknown topic under a real subject falls back to the whole subject.
  await goto(`topic/${topicPracticeHref(subject, 'Not A Real Topic').slice('#/topic/'.length)}`);
  await waitFor(() => subjectBox(subject)?.checked === true, { label: 'the subject to be ticked' });
  assert.equal(matchCount(), subjectCount(subject), 'a stale topic label still gets the reader into the subject');
});

test('#/custom opens the same screen with the merged item highlighted (B8)', async () => {
  await resetScreen();
  await goto('custom');
  assert.match($('#view h1').textContent, /Topic & Custom Practice/);
  assert.ok($('#view [data-action="start-practice"]'), 'the builder is there');
  assert.equal($('.nav-link[aria-current="page"]')?.dataset.route, 'topic', 'the navigation agrees on one destination');
  assert.equal($$('#navList .nav-link').filter((l) => /Custom Test/.test(l.textContent)).length, 0, 'and offers it once');

  await goto('custom/anything/at/all');
  assert.match($('#view h1').textContent, /Topic & Custom Practice/, 'anything under the old address lands here too');
  assert.equal($('.nav-link[aria-current="page"]')?.dataset.route, 'topic');
  assert.equal(matchCount(), state.questionIndex.size, 'without an empty pool and no explanation');

  // The other two legacy addresses highlight the sections that absorbed them.
  await goto('pyq-analysis');
  assert.equal($('.nav-link[aria-current="page"]')?.dataset.route, 'analytics');
  await goto('syllabus-analysis');
  assert.equal($('.nav-link[aria-current="page"]')?.dataset.route, 'syllabus');
});

test('one helper builds every practice deep link (B10)', async () => {
  assert.equal(topicPracticeHref(BIGGEST.subject), `#/topic/${encodeURIComponent(BIGGEST.subject)}`);
  assert.equal(
    topicPracticeHref(SPLIT.subject, SPLIT.topics[0].topic),
    `#/topic/${encodeURIComponent(SPLIT.subject)}||${encodeURIComponent(SPLIT.topics[0].topic)}`,
    'each half is encoded on its own, so the || in the address is always the separator',
  );
  assert.equal(topicPracticeHref('A B', 'C/D'), '#/topic/A%20B||C%2FD');
  assert.deepEqual(parseTopicPracticeParam(`${SPLIT.subject}||${SPLIT.topics[0].topic}`), {
    subject: SPLIT.subject,
    topic: SPLIT.topics[0].topic,
  });
  assert.deepEqual(parseTopicPracticeParam(BIGGEST.subject), { subject: BIGGEST.subject, topic: null });
  assert.deepEqual(parseTopicPracticeParam(''), { subject: null, topic: null });

  let seen = 0;
  for (const route of ['pyq-analysis', 'dashboard', 'syllabus/official/prelims/paper-1/s1']) {
    await goto(route);
    for (const link of $$('#view a[href^="#/topic/"]')) {
      seen += 1;
      const href = link.getAttribute('href');
      const [subject, topic = null] = href.slice('#/topic/'.length).split('||').map(decodeURIComponent);
      assert.equal(href, topicPracticeHref(subject, topic), `${route} → ${href} is the shared helper's form`);
    }
  }
  assert.ok(seen >= 3, `expected practice links on those screens, found ${seen}`);
});

test('shuffle off really is paper order, and order_source says so (B3)', async () => {
  await resetScreen();
  const shuffleBox = $('#practiceShuffleOrder');
  assert.equal(shuffleBox.checked, false, 'shuffling is off by default');
  assert.match(viewText(), /paper order — year, then paper, then question number/, 'and the screen says what that means');
  $('#practiceCfgCount').value = '30';
  $('#practiceCfgCount').dispatchEvent(new window.Event('change', { bubbles: true }));
  click($('#view [data-action="start-practice"]'));
  // Nothing is ticked, so this is a custom set: it asks first.
  await waitFor(() => !$('#modalRoot').hidden, { label: 'the confirmation' });
  assert.match($('#modalRoot').textContent, /paper order/, 'the confirmation states the order too');
  click($('#modalRoot [data-value="confirm"]'));
  await waitFor(() => /^#\/runner\//.test(window.location.hash), { label: 'the runner' });

  const record = await testsSvc.loadTest(window.location.hash.split('/').pop());
  assert.equal(record.kind, 'custom', 'the whole bank is not one subject, so it is a custom set');
  assert.equal(record.order_source, 'paper_order', 'order_source states what actually happened');
  assert.equal(record.question_ids.length, 30);

  const picked = record.question_ids.map((id) => state.questionIndex.get(id));
  assert.deepEqual(
    record.question_ids,
    selectSvc.arrangeForPaper(picked).map((m) => m.id),
    'the questions really are in year, paper, question-number order',
  );
  const years = picked.map((m) => Number(m.year) || 0);
  assert.deepEqual(years, [...years].sort((a, b) => a - b), 'no later year appears before an earlier one');
  assert.match(record.config.selection_notes.join(' '), /paper order/, 'and the notes recorded on the test agree');
});

test('shuffle on arranges the same pick differently and says so', async () => {
  await resetScreen();
  tick(subjectBox(SPLIT.subject));
  await awaitCount(subjectCount(SPLIT.subject), 'a subject to be ticked');
  tick($('#practiceShuffleOrder'));
  await waitFor(() => /arranged at random for this session/.test(viewText()), { label: 'the hint to follow the checkbox' });
  assert.equal($('#practiceShuffleOrder').checked, true);
  $('#practiceCfgCount').value = '25';
  $('#practiceCfgCount').dispatchEvent(new window.Event('change', { bubbles: true }));
  click($('#view [data-action="start-practice"]'));
  await waitFor(() => /^#\/runner\//.test(window.location.hash), { label: 'the runner' });

  const record = await testsSvc.loadTest(window.location.hash.split('/').pop());
  assert.equal(record.kind, 'topic', 'exactly one subject is still a topic session');
  assert.match(record.label, new RegExp(`^Topic practice — ${SPLIT.subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.equal(record.order_source, 'shuffled');
  assert.equal(record.question_ids.length, 25);
  assert.notDeepEqual(
    record.question_ids,
    selectSvc.arrangeForPaper(record.question_ids.map((id) => state.questionIndex.get(id))).map((m) => m.id),
    'a shuffled session is not in paper order',
  );
});

test('the session form survives an in-place re-render (B4)', async () => {
  await resetScreen();
  // What the reader types is theirs, not the screen's: a re-render used to
  // rebuild the form from the Settings defaults and quietly discard it.
  const count = $('#practiceCfgCount');
  count.value = '7';
  count.dispatchEvent(new window.Event('change', { bubbles: true }));
  const feedback = $('#practiceCfgFeedback');
  const otherFeedback = feedback.value === 'learning' ? 'exam' : 'learning';
  feedback.value = otherFeedback;
  feedback.dispatchEvent(new window.Event('change', { bubbles: true }));
  const minutes = $('#practiceCfgMinutes');
  minutes.value = '15';
  minutes.dispatchEvent(new window.Event('input', { bubbles: true }));
  minutes.dispatchEvent(new window.Event('change', { bubbles: true }));
  const advanced = $$('#view .practice-setup details.disclosure')[0];
  advanced.open = true;
  advanced.dispatchEvent(new window.Event('toggle', { bubbles: true }));
  await waitFor(() => /This session: 7 questions/.test($('#practiceCfgSummary').textContent), { label: 'the summary' });
  assert.match($('#practiceCfgSummary').textContent, /15-minute limit/, 'the summary reads the form, not the defaults');

  // Any change re-renders the screen in place.
  tick(subjectBox(OTHER.subject));
  await awaitCount(subjectCount(OTHER.subject), 'the re-render');

  assert.equal($('#practiceCfgCount').value, '7', 'the size survived');
  assert.equal($('#practiceCfgFeedback').value, otherFeedback, 'the feedback timing survived');
  assert.equal($('#practiceCfgMinutes').value, '15', 'the time limit survived');
  assert.equal($$('#view .practice-setup details.disclosure')[0].open, true, 'the disclosure the reader opened is still open');
  assert.match($('#practiceCfgSummary').textContent, /This session: 7 questions/);

  // "Reset" means it: the saved defaults come back and the memory goes with them.
  click($('#practiceCfgReset'));
  await waitFor(() => $('#practiceCfgFeedback').value !== otherFeedback, { label: 'the reset' });
  assert.equal($('#practiceCfgFeedback').value, state.settings.feedbackMode, 'back to the saved default');
  assert.equal($('#practiceCfgMinutes').value, '', 'and the time limit is cleared');
  tick(subjectBox(BIGGEST.subject));
  await awaitCount(subjectCount(OTHER.subject) + subjectCount(BIGGEST.subject), 'another re-render');
  assert.equal($('#practiceCfgFeedback').value, state.settings.feedbackMode, 'the reset is not undone by the next render');
});

test('expanding a subject group does not re-render the screen', async () => {
  await resetScreen();
  // A marker node inside the screen: a re-render replaces every element, so if
  // this one survives, nothing was rebuilt.
  const marker = $('#pickMatch');
  const subject = OTHER.subject;
  const { button, panelId } = await openGroup(subject);
  assert.equal(button.getAttribute('aria-expanded'), 'true');

  click(button);
  assert.equal($(`#${window.CSS.escape(panelId)}`).hidden, true, 'and folds away again');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal($('#pickMatch'), marker, 'the screen was not rebuilt to do it');

  // The open set is remembered across a re-render that does happen.
  click(caret(subject));
  tick(subjectBox(BIGGEST.subject));
  await awaitCount(subjectCount(BIGGEST.subject), 'the re-render');
  assert.equal(caret(subject).getAttribute('aria-expanded'), 'true', 'the group is still open after the refresh');
  assert.equal($(`#${window.CSS.escape(caret(subject).getAttribute('aria-controls'))}`).hidden, false);
});

test('"Narrow further" filters the pool and reports how many are on', async () => {
  await resetScreen();
  const disclosure = $('#narrowFilters');
  assert.ok(disclosure, 'the optional filters are tucked away');
  assert.equal(disclosure.open, false, 'and start collapsed');
  assert.equal(narrowSummary(), 'Narrow further', 'with no count while nothing is filtered');

  disclosure.open = true;
  disclosure.dispatchEvent(new window.Event('toggle', { bubbles: true }));
  const whole = matchCount();
  const year = String(metas().find((m) => m.year).year);
  tick($(`#view input[data-action="filter-year"][data-value="${window.CSS.escape(year)}"]`));
  await awaitCount(countWhere((m) => String(m.year) === year), `the ${year} questions`);
  assert.equal(narrowSummary(), 'Narrow further — 1 filter on', 'the collapsed summary counts the active filters');

  // A second year joins rather than replaces.
  const second = metas().map((m) => String(m.year)).find((y) => y !== year);
  tick($(`#view input[data-action="filter-year"][data-value="${window.CSS.escape(second)}"]`));
  await awaitCount(countWhere((m) => [year, second].includes(String(m.year))), 'both years');
  assert.equal(narrowSummary(), 'Narrow further — 1 filter on', 'years are one filter, however many are ticked');

  // A subtopic control appears only when exactly one topic is selected.
  assert.equal($('#fSubtopic'), null, 'no subtopic filter while a whole bank is selected');
  click($('#view [data-action="clear-filters"]'));
  await awaitCount(whole, 'the filters to clear');
  assert.equal(narrowSummary(), 'Narrow further');

  await openGroup(SPLIT.subject);
  tick(topicBox(SPLIT.subject, SPLIT.topics[0].topic));
  await awaitCount(SPLIT.topics[0].count, 'one topic');
  const subtopic = $('#fSubtopic');
  assert.ok(subtopic, 'exactly one topic offers a subtopic filter');
  assert.match(subtopic.closest('label').textContent, /Shown because exactly one topic is selected/);

  tick(topicBox(SPLIT.subject, SPLIT.topics[0].topic));
  await awaitCount(whole, 'the topic dropped again');
  assert.equal($('#fSubtopic'), null, 'and the subtopic filter goes with it');

  tick(subjectBox(SPLIT.subject));
  await awaitCount(subjectCount(SPLIT.subject), 'a whole subject');
  assert.equal($('#fSubtopic'), null, 'a whole subject is wider than one topic');

  assert.ok(!/Include questions I have already attempted/.test(viewText()), 'the old repeat checkbox is gone');
  assert.ok(!/Matching questions/.test(viewText()), 'and so are the availability tables');
});

test('the three frozen test rules reach every session started here', async () => {
  await resetScreen();
  tick(subjectBox(SPLIT.subject));
  await awaitCount(subjectCount(SPLIT.subject), 'a subject to be ticked');
  $('#practiceCfgCount').value = '3';
  $('#practiceCfgCount').dispatchEvent(new window.Event('change', { bubbles: true }));
  click($('#view [data-action="start-practice"]'));
  await waitFor(() => /^#\/runner\//.test(window.location.hash), { label: 'the runner' });

  const record = await testsSvc.loadTest(window.location.hash.split('/').pop());
  assert.equal(record.config.confidence, 'optional', 'confidence marking is optional');
  assert.equal(record.config.answer_policy, 'verified_preferred', 'verified keys win');
  assert.equal(record.config.unresolved_policy, 'supplied', 'an unresolved key falls back to the supplied answer');

  await goto('topic');
  assert.match(viewText(), /Confidence marking is always optional/, 'the form states the rules');
  assert.equal($('#practiceCfgConfidence'), null, 'there is no confidence selector');
  assert.equal($('#practiceCfgPolicy'), null, 'no answer-policy selector');
  assert.equal($('#practiceCfgUnresolved'), null, 'and no unresolved-key selector');
});
