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
  const view = await import('../js/ui/views/pyq-analysis.js');
  const html = await view.default.render({});

  const metas = [...m.appState.questionIndex.values()];
  const summary = summariseBank(metas, [...m.appState.papers.values()]);
  assert.ok(metas.length > 0, 'the demonstration bank is loaded');

  assert.equal((html.match(/<h1/g) || []).length, 1, 'exactly one h1');
  assert.match(html, /<h1>PYQ Analysis<\/h1>/);
  for (const heading of html.match(/<h[3-6][ >]/g) || []) assert.fail(`the screen jumps to ${heading.trim()}: headings must go h1 -> h2`);
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
  assert.ok(html.includes('class="prov-chip'), 'its numbers say where they came from');
});

test('the horizontal subject chart renders all 571 real bank questions with untruncated, non-overlapping labels', async () => {
  const m = await bootApp();
  const builtin = await import('../js/services/builtin-bank.js');
  const bankText = await readText('pyq/mymppsc-pyq-bank.json');
  await builtin.ensureBuiltinBank({ text: bankText });

  const view = await import('../js/ui/views/pyq-analysis.js');
  const html = await view.default.render({});

  assert.equal(html.includes('NaN'), false, 'no NaN values in rendered markup');
  assert.equal(html.includes('undefined'), false, 'no undefined values in rendered markup');

  // Summary cards reflect real calculated values (571 questions, 6 papers, 10 subjects, 64 topics, 571/571 keys)
  assert.match(html, /571/);
  assert.match(html, /6<\/strong>\s*paper\(s\)|6 paper\(s\)/);
  assert.match(html, /2019–2024/);
  assert.match(html, /571\/571/);

  // Every subject label in the chart is rendered in full (no truncation with ellipsis) and sorted highest-first
  const labelMatches = [...html.matchAll(/<text class="chart-subject-label"[^>]*y="([^"]+)"[^>]*>([^<]+)<\/text>/g)];
  assert.equal(labelMatches.length, 10, 'all 10 syllabus subjects are plotted in the chart');

  const labels = labelMatches.map((match) => match[2]);
  const yPositions = labelMatches.map((match) => Number(match[1]));
  assert.equal(labels[0], 'Polity', 'highest-count subject (Polity, 108) is plotted first');
  assert.equal(labels[1], 'Geography', 'second-highest subject (Geography, 100) is plotted second');
  assert.equal(labels[labels.length - 1], 'General Aptitude', 'lowest-count subject (General Aptitude, 7) is plotted last');

  for (const fullSubject of ['Science and Technology', 'Madhya Pradesh Special', 'Art and Culture', 'General Aptitude', 'Current Affairs']) {
    assert.ok(labels.includes(fullSubject), `full untruncated label "${fullSubject}" is present in the chart`);
  }
  assert.equal(labels.some((l) => l.includes('…')), false, 'no subject label is truncated');

  // Verify every subject label sits on its own distinct vertical row (>= 24px apart) so labels never collide
  for (let i = 1; i < yPositions.length; i += 1) {
    assert.ok(yPositions[i] - yPositions[i - 1] >= 24, `row ${i} and row ${i - 1} must not overlap vertically`);
  }

  // Verify end-of-bar total counts are present for each bar
  const valueMatches = [...html.matchAll(/<text class="chart-value-label"[^>]*>([^<]+)<\/text>/g)].map((m2) => m2[1]);
  assert.equal(valueMatches.length, 10, 'each bar has an end-of-bar total label');
  assert.match(valueMatches[0], /^108\b/);
  assert.match(valueMatches[1], /^100\b/);
  assert.match(valueMatches[2], /^94\b/);
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


