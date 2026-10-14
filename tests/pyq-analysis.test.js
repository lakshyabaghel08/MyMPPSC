/**
 * pyq-analysis.test.js — the PYQ analysis screen and the counting behind it.
 *
 * Requirement it proves: a learner can see how many previous-year questions each
 * subject and each topic contributes, per paper, from the bank actually stored on
 * the device — with the counts agreeing with the question index, nothing finer
 * than a topic being exposed, and nothing invented for a question that has no
 * subject at all.
 *
 * The service is pure, so it is tested against hand-made metas first (exact
 * arithmetic, no fixtures) and then against the demonstration bank through the
 * real state, where the view itself is rendered and inspected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, importDemoBank, readText } from './helpers.mjs';
import { summariseBank, topicStanding, topicKey, UNCLASSIFIED_SUBJECT } from '../js/services/pyq-analysis.js';

const meta = (o) => ({
  subject: null,
  topic: null,
  subtopic: null,
  year: 2024,
  hasSuppliedAnswer: true,
  hasVerifiedAnswer: false,
  hasExplanation: false,
  isDemonstration: false,
  ...o,
});

/* ------------------------------------------------------------- the service -- */

test('the analysis counts per subject and per topic, including which paper each came from', () => {
  const metas = [
    meta({ id: 'A1', subject: 'Geography', topic: 'Rivers of Madhya Pradesh', subtopic: 'Narmada basin', year: 2023 }),
    meta({ id: 'A2', subject: 'Geography', topic: 'Rivers of Madhya Pradesh', subtopic: 'Tapti basin', year: 2024 }),
    meta({ id: 'B1', subject: 'Geography', topic: 'Climate', year: 2024, hasExplanation: true }),
    meta({ id: 'C1', subject: 'Polity', topic: 'Judiciary', year: 2023, hasSuppliedAnswer: false }),
    meta({ id: 'D1', year: 2024 }),
  ];
  const summary = summariseBank(metas, []);

  assert.equal(summary.total, 5);
  assert.deepEqual(summary.years, [2023, 2024]);
  assert.equal(summary.yearSpan, '2023–2024');

  // Subject order follows the app's own syllabus order, with the unplaced bucket last.
  assert.deepEqual(summary.subjects.map((s) => s.subject), ['Polity', 'Geography', UNCLASSIFIED_SUBJECT]);
  assert.deepEqual(summary.subjects.map((s) => s.questions), [1, 3, 1]);

  const geography = summary.subjects.find((s) => s.subject === 'Geography');
  assert.equal(geography.share, 0.6, '3 of 5 questions');
  assert.equal(geography.topics, 2, 'two topics, not three: the third level is not counted');
  assert.deepEqual(geography.byYear, { 2023: 1, 2024: 2 });
  assert.equal(geography.explanation, 1, 'only one of them carries an explanation');

  const rivers = summary.topics.find((t) => t.topic === 'Rivers of Madhya Pradesh');
  assert.equal(rivers.questions, 2);
  assert.equal(rivers.shareOfSubject, 2 / 3, 'share is of the subject it belongs to');
  assert.deepEqual(rivers.byYear, { 2023: 1, 2024: 1 });

  assert.equal(summary.unclassified, 1, 'a question with no subject is counted as unplaced');
  assert.equal(summary.withoutKey, 1, 'and a question with no stored answer is counted as unkeyed');
  assert.equal(summary.subjectCount, 2, 'the unplaced bucket is not a subject');
  assert.equal(summary.topicCount, 3);
});

test('subtopics are not counted, because they describe the import and not the paper', () => {
  const metas = [meta({ id: 'A1', subject: 'Geography', topic: 'Rivers', subtopic: 'Narmada basin' })];
  const summary = summariseBank(metas, []);
  assert.equal(JSON.stringify(summary).includes('Narmada'), false, 'no subtopic text reaches the analysis output');
  assert.equal('subtopics' in summary, false);
  assert.equal(summary.subjects[0].subtopics, undefined);
});

test('every question is counted exactly once, and only by what the record says', () => {
  const metas = [];
  for (let i = 0; i < 40; i += 1) {
    metas.push(meta({ id: `Q-${i}`, subject: i % 3 === 0 ? null : `Subject ${i % 3}`, topic: i % 5 === 0 ? null : `Topic ${i % 5}`, year: 2019 + (i % 6), hasSuppliedAnswer: i % 7 !== 0 }));
  }
  const summary = summariseBank(metas, []);
  assert.equal(summary.subjects.reduce((a, s) => a + s.questions, 0), 40, 'subject counts add up to the bank');
  assert.equal(summary.topics.reduce((a, t) => a + t.questions, 0), 40, 'topic counts do too');
  assert.equal(summary.byYear.reduce((a, y) => a + y.questions, 0), 40);
  assert.equal(summary.withKey + summary.withoutKey, 40);
  const unplaced = summary.subjects.find((s) => s.subject === UNCLASSIFIED_SUBJECT);
  assert.ok(unplaced, 'the unplaced questions are a visible bucket rather than a silent loss');
  assert.equal(unplaced.questions, metas.filter((m) => !m.subject).length);
});

test('a question with no stored answer still shows up, as a gap rather than as a zero', () => {
  const metas = [meta({ id: 'A1', subject: 'History', topic: 'Modern India', hasSuppliedAnswer: false, hasVerifiedAnswer: false })];
  const summary = summariseBank(metas, []);
  assert.equal(summary.total, 1, 'it is not dropped from the counts');
  assert.equal(summary.subjects[0].questions, 1);
  assert.equal(summary.subjects[0].withKey, 0);
  assert.equal(summary.subjects[0].withoutKey, 1);
});

test('a verified answer counts as an answer, and demonstration questions are separable', () => {
  const metas = [
    meta({ id: 'A1', subject: 'History', topic: 'Modern India', hasSuppliedAnswer: false, hasVerifiedAnswer: true }),
    meta({ id: 'A2', subject: 'History', topic: 'Modern India', isDemonstration: true }),
  ];
  const summary = summariseBank(metas, []);
  assert.equal(summary.withKey, 2, 'either record of an answer makes the question scoreable');
  assert.equal(summary.demonstration, 1);
  assert.equal(summary.subjects[0].demonstration, 1, 'a subject reports how much of it is filler');
});

test('topicStanding ranks a topic within the bank it came from', () => {
  const metas = [
    meta({ id: 'A1', subject: 'Geography', topic: 'Rivers' }),
    meta({ id: 'A2', subject: 'Geography', topic: 'Rivers' }),
    meta({ id: 'B1', subject: 'Geography', topic: 'Climate' }),
  ];
  const summary = summariseBank(metas, []);
  const standing = topicStanding(metas[0], summary);
  assert.equal(standing.questions, 2);
  assert.equal(standing.rank, 1, 'the most frequent topic ranks first');
  assert.equal(standing.isFrequent, false, 'two questions is not called frequent');
  assert.equal(topicStanding({ subject: 'Zoology', topic: 'None' }, summary), null, 'an unknown grouping has no standing');
});

test('topicKey matches the key the practice filters use', () => {
  assert.equal(topicKey('Geography', 'Rivers'), 'Geography||Rivers');
  assert.equal(topicKey(null, null), `${UNCLASSIFIED_SUBJECT}||${UNCLASSIFIED_SUBJECT}`);
});

test('an empty bank yields zeros instead of dividing by nothing', () => {
  const summary = summariseBank([], []);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.subjects, []);
  assert.deepEqual(summary.topics, []);
  assert.equal(summary.yearSpan, '—');
  assert.equal(topicStanding(meta({ id: 'x' }), summary), null);
});

/* ---------------------------------------------------------------- the view -- */

test('the screen renders the counts it computed, from the real imported bank', async () => {
  const m = await bootApp();
  await importDemoBank();
  // The screen is now a panel of the Insights section; render the panel on its
  // own so this stays a test of the counting, not of the shell.
  const view = await import('../js/ui/views/pyq-analysis.js');
  const html = await view.renderBankPanel({});

  const metas = [...m.appState.questionIndex.values()];
  const summary = summariseBank(metas, [...m.appState.papers.values()]);
  assert.ok(metas.length > 0, 'the demonstration bank is loaded');

  assert.equal((html.match(/<h1/g) || []).length, 0, 'the panel leaves the page heading to the Insights shell');
  assert.match(html, /<h2>What the stored papers contain<\/h2>/);
  for (const heading of html.match(/<h[3-6][ >]/g) || []) assert.fail(`the panel jumps to ${heading.trim()}: headings must go h2 -> h2`);
  assert.match(html, /Questions per subject/);
  assert.match(html, /Questions per topic/);
  assert.equal(/<th[^>]*>\s*Subtopic/i.test(html), false, 'no subtopic column anywhere');
  assert.equal(/per subtopic/i.test(html), false, 'and no per-subtopic count');

  // Every subject and topic in the index appears with the count the service computed.
  for (const subject of summary.subjects) {
    assert.ok(html.includes(`>${subject.questions}<`) || html.includes(`<strong>${subject.questions}</strong>`), `${subject.subject} count is on the screen`);
  }
  assert.ok(html.includes(`${summary.papers} paper(s)`), 'it says which papers the counts come from');
  assert.ok(html.includes(`href="#/topic/`), 'a count leads to practice on that group');
});

test('the screen keeps the honest framing, and says so when there is nothing to frame', async () => {
  const withData = await import('../js/ui/views/pyq-analysis.js');
  const html = await withData.default.render({});
  assert.match(html, /not a forecast/i, 'the counts are labelled as a study map, not a prediction');

  await bootApp(); // a fresh, empty device
  const empty = await withData.default.render({});
  assert.match(empty, /Nothing to analyse yet/, 'an empty device is told that plainly');
  assert.match(empty, /import a previous-year question bank/i);
  assert.equal(empty.includes('<table'), false, 'no empty tables are drawn');
});

test('the screen adds no inline styles, no scripts and no remote calls', async () => {
  const m = await bootApp();
  await importDemoBank();
  const view = await import('../js/ui/views/pyq-analysis.js');
  const html = await view.default.render({});
  assert.equal(/style="/.test(html), false, 'styling lives in css/app.css');
  assert.equal(/<script/.test(html), false);
  assert.equal(/https?:\/\//.test(html.replace(/http:\/\/www\.w3\.org/g, '')), false, 'no external reference');
  assert.equal(/localhost/.test(html), false);
  assert.equal(html.includes('class="prov-chip'), false, 'provenance chips no longer clutter the panel; the framing text carries it');
});

test('the horizontal subject chart renders all 1,200 bank questions across 2013–2024', async () => {
  const m = await bootApp();
  const builtin = await import('../js/services/builtin-bank.js');
  const bankText = await readText('pyq/mymppsc-pyq-bank.json');
  await builtin.ensureBuiltinBank({ text: bankText });

  const view = await import('../js/ui/views/pyq-analysis.js');
  const html = await view.default.render({});

  assert.equal(html.includes('NaN'), false, 'no NaN values in rendered markup');
  assert.equal(html.includes('undefined'), false, 'no undefined values in rendered markup');

  const metas = [...m.appState.questionIndex.values()];
  const summary = summariseBank(metas, [...m.appState.papers.values()]);
  assert.equal(summary.total, 1200);
  assert.equal(summary.papers, 12);
  assert.equal(summary.yearSpan, '2013–2024');
  assert.equal(summary.withKey, 1200);
  assert.match(html, /1200\/1200/);
  assert.doesNotMatch(html, /verified key/i, 'answer-key coverage is measured, not represented as independent verification');
  assert.match(html, /12<\/strong>\s*paper\(s\)|12 paper\(s\)/);
  assert.match(html, /2013–2024/);

  // Subject labels are data-driven. The audited bank now has no unplaced
  // subjects; taxonomy-supported topic/subtopic gaps remain separately tracked.
  const labelMatches = [...html.matchAll(/<text class="chart-subject-label"[^>]*y="([^"]+)"[^>]*>([^<]+)<\/text>/g)];
  const expectedSubjects = summary.subjects.slice().sort((a, b) => {
    const aUnplaced = a.subject === UNCLASSIFIED_SUBJECT ? 1 : 0;
    const bUnplaced = b.subject === UNCLASSIFIED_SUBJECT ? 1 : 0;
    return aUnplaced - bUnplaced || b.questions - a.questions || String(a.subject).localeCompare(String(b.subject));
  });
  assert.equal(summary.unclassified, 0, 'every question has a taxonomy-supported subject after the audit');
  assert.equal(labelMatches.length, expectedSubjects.length, 'every subject present in the bank is plotted');
  const labels = labelMatches.map((match) => match[2]);
  assert.deepEqual(labels, expectedSubjects.map((row) => row.subject));
  assert.equal(labels.includes(UNCLASSIFIED_SUBJECT), false, 'the final bank has no questions without a subject');
  assert.equal(labels.some((label) => label.includes('…')), false, 'no subject label is truncated');

  const yPositions = labelMatches.map((match) => Number(match[1]));
  for (let i = 1; i < yPositions.length; i += 1) {
    assert.ok(yPositions[i] - yPositions[i - 1] >= 24, `row ${i} and row ${i - 1} must not overlap vertically`);
  }

  const valueMatches = [...html.matchAll(/<text class="chart-value-label"[^>]*>([^<]+)<\/text>/g)].map((match) => match[1]);
  assert.equal(valueMatches.length, expectedSubjects.length, 'each chart bar has a total label');
  expectedSubjects.forEach((row, index) => assert.match(valueMatches[index], new RegExp(`^${row.questions}\\b`)));
});

test('the unplaced-question bucket is surfaced clearly when records lack a subject or topic', async () => {
  const m = await bootApp();
  await importDemoBank();
  // Add an unclassified question record into the live index to verify the unplaced bucket UI
  m.appState.questionIndex.set(
    'UNPLACED-1',
    meta({ id: 'UNPLACED-1', subject: null, topic: null, year: 2024 }),
  );

  const view = await import('../js/ui/views/pyq-analysis.js');
  const html = await view.default.render({});

  assert.match(html, /Unplaced questions/);
  assert.match(html, /Unplaced-question bucket/);
  assert.match(html, /Unclassified/);
  assert.match(html, /href="#\/topic\/Unclassified"/);
});


