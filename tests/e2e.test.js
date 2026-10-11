/**
 * e2e.test.js — End-to-end workflow on a fresh database.
 *
 * Import → start a full-paper simulation → answer with a mix of right, wrong and
 * skipped responses (plus confidence) → resume after an interruption → submit →
 * score → mistake book → revision schedule → analytics → custom test → syllabus
 * → backup/restore.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, importDemoBank, answerTest, approx } from './helpers.mjs';

const m = await bootApp();
let testId = null;

test('1. import the demonstration bank', async () => {
  const { analysis, result } = await importDemoBank();
  assert.equal(analysis.report.fatal.length, 0);
  assert.equal(result.stats.questionsAdded, 34);
  assert.equal(m.appState.questionIndex.size, 34);
  assert.equal(m.appState.papers.size, 3);
});

test('2. an incomplete paper and an unknown-rules paper are selected', async () => {
  const p1 = await m.db.get(m.constants.STORES.PAPERS, 'DEMO-P1');
  assert.equal(p1.scoring.rules_known, true);
  const p3 = await m.db.get(m.constants.STORES.PAPERS, 'DEMO-P3');
  assert.equal(p3.original_question_count, 15);
  const summary = m.select.paperSummary(p3, Array.from(m.appState.questionIndex.values()));
  assert.equal(summary.complete, false);
  assert.equal(summary.missingCount, 9);

  // A paper that does not state its rules but is an MPPSC preliminary paper now
  // gets the applicable examination-year scheme automatically — no manual
  // configuration, and the scheme is named in the warnings.
  const p2 = await m.db.get(m.constants.STORES.PAPERS, 'DEMO-P2');
  const test2 = m.tests.buildTest({ kind: 'pyq_full', label: 'Rules check', paper: p2, questionIds: p2.question_order, config: {} });
  assert.equal(test2.config.scoring.needsConfiguration, false);
  assert.equal(test2.config.scoring.source, 'mppsc_builtin');
  assert.equal(test2.config.scoring.rules.marks_per_correct, 2);
  assert.equal(test2.config.scoring.rules.negative_marking_enabled, false);
  assert.ok(test2.config.warnings.some((w) => /MPPSC scheme/i.test(w)), 'the applied scheme is named in the warnings');

  // A paper outside the MPPSC preliminary coverage still refuses to be guessed.
  const alien = m.tests.buildTest({
    kind: 'pyq_full',
    label: 'Unknown exam',
    paper: { paper_id: 'OTHER-1', exam: 'Some Other Commission Examination', year: 2011, paper_code: 'P1', scoring: { rules_known: false }, question_order: [] },
    questionIds: [],
    config: {},
  });
  assert.equal(alien.config.scoring.needsConfiguration, true);
  assert.equal(alien.config.scoring.rules, null);
});

test('3. a full-paper simulation starts in the original order with the source duration', async () => {
  const paper = await m.db.get(m.constants.STORES.PAPERS, 'DEMO-P1');
  const questionIds = paper.question_order.slice();
  const test = await m.tests.createTest({
    kind: 'pyq_full',
    label: `${paper.exam} ${paper.year}`,
    paper,
    questionIds,
    questionMetas: questionIds.map((id) => m.appState.questionIndex.get(id)),
    orderSource: 'original',
    config: { feedbackMode: 'exam', confidence: 'optional' },
  });
  testId = test.id;
  assert.deepEqual(test.question_ids, paper.question_order, 'original paper order is used for the simulation');
  assert.equal(test.config.duration_minutes, 36, 'duration comes from the paper metadata');
  assert.equal(test.config.scoring.rules.marks_per_correct, 2);
  assert.equal(test.config.scoring.rules.negative_marking_enabled, true);
  assert.equal(test.config.is_authentic_paper, true);
  assert.equal(test.option_order && Object.keys(test.option_order).length, 0, 'options are not shuffled by default');

  const started = m.tests.startTimer(test);
  await m.tests.saveTest(started);
  const stored = await m.db.get(m.constants.STORES.TESTS, test.id);
  assert.equal(stored.status, 'in_progress');
});

test('4. progress is saved as the user answers and survives an interruption', async () => {
  const test = await m.db.get(m.constants.STORES.TESTS, testId);
  const questions = await m.questions.getQuestions(test.question_ids);

  // answer the first three correctly, two wrongly, flag one, skip some
  for (let i = 0; i < 3; i += 1) {
    const q = questions.get(test.question_ids[i]);
    await m.tests.updateResponse(test, q.id, { selected: q.supplied.answer.slice(), confidence: i === 0 ? 'confident' : null });
  }
  for (let i = 3; i < 5; i += 1) {
    const q = questions.get(test.question_ids[i]);
    const keys = Object.values(q.language_variants)[0].options.map((o) => o.key);
    await m.tests.updateResponse(test, q.id, { selected: [keys.find((k) => !q.supplied.answer.includes(k))], confidence: 'guessed' });
  }
  await m.tests.updateResponse(test, test.question_ids[5], { selected: ['A'], flagged: true, confidence: 'unsure' });
  m.tests.addQuestionTime(test, test.question_ids[0], 42000);
  test.current_index = 7;
  await m.tests.saveTest(test);

  // simulate a reload: re-read from the database
  const reloaded = await m.db.get(m.constants.STORES.TESTS, testId);
  const progress = m.tests.testProgress(reloaded);
  assert.equal(progress.answered, 6);
  assert.equal(progress.flagged, 1);
  assert.equal(progress.total, 18);
  assert.equal(progress.confidence.guessed, 2);

  const reconcile = m.tests.reconcileTimer(reloaded, { autoSubmit: false });
  assert.ok(reconcile.gapSeconds >= 0, 'time away from the tab is charged to the test, not lost');
  assert.equal(reloaded.timer.remaining_seconds !== null, true);
  await m.tests.saveTest(reloaded);
});

test('5. submitting scores deterministically with the source rules', async () => {
  const test = await m.db.get(m.constants.STORES.TESTS, testId);
  const questions = await m.questions.getQuestions(test.question_ids);
  const expected = (() => {
    let score = 0;
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    for (const id of test.question_ids) {
      const q = questions.get(id);
      const r = test.responses[id];
      if (!r?.selected?.length) {
        unanswered += 1;
        continue;
      }
      const answer = q.supplied.answer;
      const isCorrect = r.selected.slice().sort().join(',') === answer.slice().sort().join(',');
      if (isCorrect) {
        correct += 1;
        score += 2;
      } else {
        incorrect += 1;
        score -= 2 / 3;
      }
    }
    return { score, correct, incorrect, unanswered };
  })();

  const { result, recorded } = await m.tests.submitTest(test);
  assert.equal(result.counts.correct, expected.correct);
  assert.equal(result.counts.incorrect, expected.incorrect);
  assert.equal(result.counts.unanswered, expected.unanswered);
  assert.ok(approx(result.score, Math.round(expected.score * 100) / 100, 0.01), `expected ${expected.score}, got ${result.score}`);
  assert.equal(result.max_marks, 36);
  assert.equal(recorded.attempts.length, 18);
  assert.ok(result.per_question.length === 18);
  assert.ok(result.accuracy !== null);

  const stored = await m.db.get(m.constants.STORES.TESTS, testId);
  assert.equal(stored.status, 'submitted');
  assert.equal(stored.result.score, result.score, 'the report is stored with the session');
  assert.ok(stored.result.per_topic.length > 0);
  assert.equal(await m.db.count(m.constants.STORES.ATTEMPTS), 18);
});

test('6. the report distinguishes outcomes and lists the weak areas', async () => {
  const test = await m.db.get(m.constants.STORES.TESTS, testId);
  const result = test.result;
  assert.equal(result.counts.total, 18);
  assert.equal(result.counts.attempted, result.counts.correct + result.counts.incorrect);
  assert.equal(result.counts.unanswered, 18 - result.counts.attempted);
  const flagged = result.per_question.filter((q) => q.flagged);
  assert.equal(flagged.length, 1);
  const weakRecallCorrect = result.per_question.filter((q) => q.outcome === 'correct' && (q.confidence === 'guessed' || q.confidence === 'unsure'));
  assert.equal(result.counts.lowConfidenceCorrect, weakRecallCorrect.length, 'a correct guess or unsure answer is counted as weak recall');
  assert.ok(result.per_question.every((q) => typeof q.marks === 'number'));
  assert.ok(result.per_question.every((q) => q.time_spent_ms !== undefined));
  const topicRow = result.per_topic[0];
  assert.ok('accuracy' in topicRow && 'subject' in topicRow);
});

test('7. mistakes are recorded, repeated mistakes escalate and resolutions keep the history', async () => {
  const mistakes = await m.mistakes.listMistakes({ status: 'open' });
  assert.ok(mistakes.length > 0);
  const types = new Set(mistakes.map((x) => x.type));
  assert.ok(types.has('incorrect'), 'wrong answers open a mistake entry');
  assert.ok(types.has('skipped'), 'skipped questions are recorded separately');
  assert.ok(types.has('flagged'), 'flagged questions are recorded');
  assert.ok(types.has('low_confidence_correct'), 'correct-but-uncertain answers are recorded when confidence tracking is on');

  const counts = await m.mistakes.mistakeCounts();
  assert.ok(counts.open >= 4);

  // answer one of the wrong questions correctly in a new test and check auto-resolution
  const wrongOne = mistakes.find((x) => x.type === 'incorrect');
  const question = await m.questions.getQuestion(wrongOne.question_id);
  const retry = await m.tests.createTest({
    kind: 'mistake_retry',
    label: 'Mistake retry',
    questionIds: [question.id],
    config: { feedbackMode: 'learning', confidence: 'optional' },
  });
  retry.responses[question.id] = { selected: question.supplied.answer.slice(), confidence: 'confident', time_spent_ms: 20000 };
  await m.tests.saveTest(retry);
  await m.tests.submitTest(retry);

  const afterResolve = await m.db.get(m.constants.STORES.MISTAKES, wrongOne.key);
  assert.equal(afterResolve.status, 'resolved', 'answering correctly later resolves the open mistake');
  assert.ok(afterResolve.history.length >= 2, 'the history records both the mistake and its resolution');
  const attempts = await m.mistakes.attemptHistoryForQuestion(question.id);
  assert.equal(attempts.length, 2, 'both attempts are kept; resolving never erases history');
  const trend = m.mistakes.attemptTrend(attempts);
  assert.deepEqual(trend.map((t) => t.outcome), ['incorrect', 'correct']);

  // and a second miss reopens it
  const retryAgain = await m.tests.createTest({ kind: 'mistake_retry', label: 'Mistake retry 2', questionIds: [question.id], config: { feedbackMode: 'exam', confidence: 'off' } });
  const keys = Object.values(question.language_variants)[0].options.map((o) => o.key);
  retryAgain.responses[question.id] = { selected: [keys.find((k) => !question.supplied.answer.includes(k))], time_spent_ms: 15000 };
  await m.tests.saveTest(retryAgain);
  await m.tests.submitTest(retryAgain);
  const reopened = await m.db.get(m.constants.STORES.MISTAKES, wrongOne.key);
  assert.equal(reopened.status, 'open');
  assert.ok(reopened.occurrences >= 2);
  assert.equal(reopened.repeated, true, 'a repeated mistake is flagged as such');
});

test('8. revision is scheduled from real performance and can be worked from the queue', async () => {
  const summary = await m.revision.revisionSummary();
  assert.equal(summary.total, 18, 'every question attempted in the paper simulation has a revision record');
  const correctIds = [];
  const test = await m.db.get(m.constants.STORES.TESTS, testId);
  for (const q of test.result.per_question) if (q.outcome === 'correct') correctIds.push(q.question_id);
  const confident = summary.records.find((r) => r.question_id === test.question_ids[0]);
  const wrong = summary.records.find((r) => r.question_id === test.question_ids[3]);
  assert.ok(confident.interval_days >= wrong.interval_days, 'a confident correct answer is scheduled further out than a wrong one');
  assert.ok(wrong.reason.length > 0 && confident.reason.length > 0, 'each record explains its date');
  assert.ok(summary.overdue.length + summary.dueToday.length + summary.upcoming.length === summary.total);

  const before = (await m.db.get(m.constants.STORES.REVISION, wrong.question_id)).history.length;
  const fromQueue = await m.revision.markRevised(wrong.question_id, { outcome: 'correct', confidence: 'unsure', note: 'read the explanation' });
  assert.equal(fromQueue.history.length, before + 1, 'working the queue adds one auditable entry');
  assert.match(fromQueue.history[fromQueue.history.length - 1].reason, /unsure/i);
  assert.equal(fromQueue.last_result.outcome, 'correct');
});

test('9. analytics are computed from the recorded attempts only', async () => {
  const attempts = await m.mistakes.allAttempts();
  const analytics = m.analytics.buildAnalytics({
    metas: Array.from(m.appState.questionIndex.values()),
    attempts,
    revisionRecords: await m.revision.allRevisionRecords(),
    mistakes: await m.db.getAll(m.constants.STORES.MISTAKES),
    papers: m.appState.papers,
  });
  assert.equal(analytics.counts.availableQuestions, 34);
  assert.equal(analytics.counts.attemptedUnique, 18, 'the 18 paper questions; retries of the same question do not add coverage');
  assert.ok(analytics.counts.totalAttempts > analytics.counts.attemptedUnique, 'repeats count as attempts but not as coverage');
  assert.equal(analytics.counts.correct + analytics.counts.incorrect + analytics.counts.unanswered, analytics.counts.totalAttempts);
  assert.ok(analytics.frequency.total === 34);
  assert.ok(analytics.tests.length >= 3, 'each submitted test produces a trend row');
  assert.ok(analytics.accuracy.firstAttemptSample > 0);
  assert.ok(analytics.revision.tracked >= 18);
  assert.ok(analytics.bySubject.length > 0);
  assert.ok(analytics.time.avgSecPerQuestion > 0);
});

test('10. a custom test uses user-selected filters, custom scoring and shuffled options where safe', async () => {
  const summary = m.select.buildAttemptSummary(await m.mistakes.allAttempts());
  const candidates = m.select.filterMetas(Array.from(m.appState.questionIndex.values()), { subject: 'Geography' }, summary);
  assert.ok(candidates.length >= 6);
  const picked = m.select.selectQuestions(candidates, { count: 5, attemptSummary: summary, seed: 99, strategy: 'least-attempted' });
  assert.equal(picked.selected.length, 5);

  const test = await m.tests.createTest({
    kind: 'custom',
    label: 'Custom Geography test',
    questionIds: picked.selected.map((q) => q.id),
    questionMetas: picked.selected,
    orderSource: 'shuffled',
    config: {
      feedbackMode: 'learning',
      confidence: 'required',
      durationMinutes: 10,
      randomizeOptions: true,
      usePaperRules: false,
      scoring: { source: 'custom', marksPerCorrect: 1, negativeMarksPerIncorrect: 0.25, negativeMarkingEnabled: true, marksForUnanswered: 0 },
      selectionNotes: ['Assembled as a custom test, not an authentic previous-year paper.'],
    },
  });
  assert.equal(test.config.scoring.source, 'user_configured');
  assert.match(test.config.scoring.rulesSourceNote, /Custom rules/);
  assert.equal(test.config.is_authentic_paper, false);
  assert.equal(test.config.confidence, 'required');

  const questions = await m.questions.getQuestions(test.question_ids);
  // option shuffling is applied to normal questions but never to matching questions
  const matchingQuestion = Array.from(questions.values()).find((q) => q.question_type === 'matching');
  if (matchingQuestion) {
    const order = m.tests.optionOrderFor(test, matchingQuestion);
    const original = Object.values(matchingQuestion.language_variants)[0].options.map((o) => o.key);
    assert.deepEqual(order, original, 'matching options are never reordered');
  }
  const normalQuestion = Array.from(questions.values()).find((q) => q.question_type === 'single_correct');
  const firstOrder = m.tests.optionOrderFor(test, normalQuestion).slice();
  const secondOrder = m.tests.optionOrderFor(test, normalQuestion).slice();
  assert.deepEqual(firstOrder, secondOrder, 'the shuffled order is stable for a given test');
  assert.equal(firstOrder.length, Object.values(normalQuestion.language_variants)[0].options.length);

  // answer everything correctly and check the custom marks
  for (const q of questions.values()) {
    test.responses[q.id] = { selected: (q.verified?.answer?.length ? q.verified.answer : q.supplied.answer).slice(), confidence: 'confident', time_spent_ms: 15000 };
  }
  await m.tests.saveTest(test);
  const { result } = await m.tests.submitTest(test);
  const expected = test.question_ids.length * 1; // 1 mark per correct, no wrong answers
  assert.equal(result.score, expected, 'custom marks are applied');
  assert.equal(result.scoring.source, 'user_configured');
  assert.equal(result.counts.lowConfidenceCorrect, 0);
});

test('11. topic classification corrections update analytics and are reversible', async () => {
  const before = await m.analytics.buildAnalytics({ metas: Array.from(m.appState.questionIndex.values()), attempts: [], papers: m.appState.papers });
  const beforeCount = before.frequency.byTopic.find((t) => t.topic === 'Rivers of Madhya Pradesh').count;
  await m.questions.updateClassification('DEMO-P1-016', { subject: 'Geography (edited)', topic: 'Drainage (edited)', note: 'classification was wrong' });
  const after = await m.analytics.buildAnalytics({ metas: Array.from(m.appState.questionIndex.values()), attempts: [], papers: m.appState.papers });
  const afterRivers = after.frequency.byTopic.find((t) => t.topic === 'Rivers of Madhya Pradesh');
  assert.equal(afterRivers.count, beforeCount - 1, 'a corrected question moves to the new classification');
  assert.ok(after.frequency.byTopic.some((t) => t.topic === 'Drainage (edited)'));
  const stored = await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-016');
  assert.equal(stored.classification.original.topic, 'Rivers of Madhya Pradesh', 'the imported classification is preserved');
  assert.equal(stored.user_corrections.length, 1);
  assert.equal(stored.user_corrections[0].before.topic, 'Rivers of Madhya Pradesh');
  await m.questions.revertClassification('DEMO-P1-016');
  const reverted = await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-016');
  assert.equal(reverted.classification.topic, 'Rivers of Madhya Pradesh');
});

test('12. syllabus tracking is manual and stays separate from question classifications', async () => {
  const created = await m.planner.bootstrapFromBank();
  assert.ok(created.created > 0, 'syllabus nodes can be suggested from the bank');
  const rows = await m.planner.listSyllabus();
  assert.ok(rows.every((r) => r.status === 'not_started'), 'suggesting nodes never marks anything complete');
  const geography = rows.find((r) => r.level === 'subject' && r.title === 'Geography');
  await m.planner.updateSyllabusItem(geography.id, { status: 'in_progress', priority: 'high', target_date: '2026-04-01' });
  const analytics = m.analytics.buildAnalytics({ metas: Array.from(m.appState.questionIndex.values()), attempts: await m.mistakes.allAttempts(), papers: m.appState.papers });
  const progress = m.planner.syllabusProgress(await m.planner.listSyllabus(), analytics);
  assert.ok(progress.overallCompletion > 0);
  const node = progress.nodes.find((n) => n.id === geography.id);
  assert.ok(node.completion > 0);
  const bankLinked = progress.nodes.find((n) => n.level === 'topic' && n.subject === 'Geography' && n.topic === 'Rivers of Madhya Pradesh');
  assert.ok(bankLinked.bank, 'topics are linked to their question-bank performance');
  assert.ok(bankLinked.status === 'not_started', 'attempting questions does not complete the syllabus item');

  const task = await m.planner.createTask({ title: 'Read NCERT chapters', syllabus_id: geography.id, due_date: '2026-01-01', priority: 'high' });
  const buckets = await m.planner.taskBuckets(new Date('2026-02-01T00:00:00Z'));
  assert.ok(buckets.overdue.some((t) => t.id === task.id), 'overdue work is visible');
  const suggestions = m.analytics.studyPriorities({ analytics, syllabusProgress: progress, limit: 3 });
  assert.ok(suggestions.length > 0);
});

test('13. everything survives a backup and restore cycle', async () => {
  const backup = await m.data.buildBackup();
  const validation = m.data.validateBackup(backup);
  assert.equal(validation.ok, true);
  await m.db.wipeAll();
  await m.state.refreshQuestionIndex({ silent: true });
  assert.equal(m.appState.questionIndex.size, 0, 'the database is empty before the restore');

  const stats = await m.data.restoreBackup(validation, { mode: 'replace' });
  assert.equal(stats.questions, 34);
  const analytics = m.analytics.buildAnalytics({
    metas: Array.from(m.appState.questionIndex.values()),
    attempts: await m.mistakes.allAttempts(),
    papers: m.appState.papers,
  });
  assert.equal(analytics.counts.availableQuestions, 34);
  assert.ok(analytics.counts.totalAttempts > 0, 'practice history is restored');
  const tests = await m.tests.listTests();
  assert.ok(tests.length >= 4);
  const revision = await m.revision.revisionSummary();
  assert.ok(revision.total > 0);
  const syllabus = await m.planner.listSyllabus();
  assert.ok(syllabus.length > 0);
  assert.ok((await m.planner.listSessions().catch(() => [])).length >= 0);
});

test('14. offline behaviour does not depend on the network', async () => {
  // The services in this test suite run with no network at all: no fetch, no API
  // key, no remote call. This asserts that nothing in the app layer asks for one.
  const sourceFiles = ['../js/services/scoring.js', '../js/services/analytics.js', '../js/services/select.js', '../js/services/revision.js', '../js/services/tests.js'];
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const file of sourceFiles) {
    const text = await readFile(path.resolve(here, file), 'utf8');
    assert.equal(/fetch\(|XMLHttpRequest|https?:\/\/api/.test(text), false, `${file} must not make network calls`);
  }
});
