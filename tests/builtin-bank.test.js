/**
 * builtin-bank.test.js — the repository-backed loader, in an isolated database.
 *
 * Requirement it proves: open the app → the committed 2013–2024 bank is there
 * without uploading anything → it is never duplicated however often the app is
 * opened → a rebuilt bank refreshes the stored records while your own work
 * (corrections, verified answers, your own questions) survives → removing the
 * bundled bank touches nothing else.
 *
 * The loader is driven with `{ text }` (its documented test hook) so the suite
 * never touches the network; the fetch path and the precache list are covered by
 * the UI suite and `npm run check`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, readText, importDemoBank, startPaperTest, answerTest } from './helpers.mjs';

const m = await bootApp();
const builtin = await import('../js/services/builtin-bank.js');

const BANK_PATH = 'pyq/mymppsc-pyq-bank.json';
const bankText = await readText(BANK_PATH);

test('a fresh install loads the committed bank with no manual import', async () => {
  await bootApp();
  const result = await builtin.ensureBuiltinBank({ text: bankText });

  assert.equal(result.status, 'loaded');
  assert.equal(result.meta.bank_id, 'mppsc-prelims-paper1-2019-2024');
  assert.equal(result.meta.questions, 1200);
  assert.equal(result.meta.papers, 12);
  assert.equal(m.appState.questionIndex.size, 1200, 'every question is in the live index');
  assert.equal(m.appState.papers.size, 12);

  // The latest practice scheme is applied uniformly, including to past years.
  const paper = await m.db.get(m.constants.STORES.PAPERS, 'MPPSC-2019-P1');
  assert.equal(paper.scoring.rules_known, true);
  assert.equal(paper.scoring.scheme_id, 'mppsc-sse-prelims-latest-practice');
  assert.equal(paper.scoring.marks_per_correct, 3);
  assert.equal(paper.scoring.negative_marks_per_incorrect, 1);
  assert.equal(paper.scoring.negative_marking_enabled, true);
  assert.equal(paper.total_marks, 300);
});

test('opening the app again changes nothing and duplicates nothing', async () => {
  const before = await m.db.count(m.constants.STORES.QUESTIONS);
  const again = await builtin.ensureBuiltinBank({ text: bankText });
  assert.equal(again.status, 'current', 'an unchanged bank is not re-imported');
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), before);
  assert.equal(await m.db.count(m.constants.STORES.PAPERS), 12, 'papers are not duplicated either');
  // The expanded bank still records one repository import.
  const history = await m.importer.importHistory();
  assert.equal(history.filter((row) => row.bank_id === 'mppsc-prelims-paper1-2019-2024').length, 1, 'the bank was imported exactly once');
});

test('a rebuild upgrades stale stored scoring metadata but preserves a user override', async () => {
  await bootApp();
  await builtin.ensureBuiltinBank({ text: bankText });
  const priorPattern = {
    rules_known: true,
    marks_per_correct: 2,
    negative_marks_per_incorrect: 0,
    negative_marking_enabled: false,
    marks_for_unanswered: 0,
    rules_source: 'old bundled pattern',
    scheme_id: 'mppsc-sse-prelims-2019-2025',
  };
  const currentPaper = await m.db.get(m.constants.STORES.PAPERS, 'MPPSC-2019-P1');
  const overriddenPaper = await m.db.get(m.constants.STORES.PAPERS, 'MPPSC-2020-P1');
  await m.db.put(m.constants.STORES.PAPERS, { ...currentPaper, scoring: priorPattern });
  await m.db.put(m.constants.STORES.PAPERS, {
    ...overriddenPaper,
    scoring: { ...priorPattern, rules_source: 'configured by the learner' },
    user_scoring_override: true,
  });

  const refreshed = await builtin.ensureBuiltinBank({ text: bankText });
  assert.equal(refreshed.status, 'updated', 'paper scoring changes are noticed even when the bank hash is unchanged');
  const upgraded = await m.db.get(m.constants.STORES.PAPERS, 'MPPSC-2019-P1');
  assert.equal(upgraded.scoring.scheme_id, 'mppsc-sse-prelims-latest-practice');
  assert.equal(upgraded.scoring.marks_per_correct, 3);
  assert.equal(upgraded.scoring.negative_marks_per_incorrect, 1);
  assert.equal(upgraded.scoring.negative_marking_enabled, true);

  const keptOverride = await m.db.get(m.constants.STORES.PAPERS, 'MPPSC-2020-P1');
  assert.equal(keptOverride.user_scoring_override, true);
  assert.equal(keptOverride.scoring.rules_source, 'configured by the learner');
  assert.equal(keptOverride.scoring.marks_per_correct, 2, 'a learner\'s explicit scoring choice wins');
});

test('an upgraded bank refreshes records and keeps the user\'s own work', async () => {
  // The user corrects a classification and records a verified answer.
  await m.questions.updateClassification('MPPSC-2019-001', { subject: 'History', topic: 'Modern India', subtopic: 'Indian National Congress' });
  await m.questions.setVerifiedAnswer('MPPSC-2019-001', { answer: ['C'], evidence: [{ note: 'checked by hand' }] });
  await m.questions.setDispute('MPPSC-2019-001', { isDisputed: true, reason: 'the printed key looks wrong' });
  const marks = await m.db.get(m.constants.STORES.QUESTIONS, 'MPPSC-2019-001');

  // A rebuilt bank: one question corrected (an option's wording, a refreshed
  // explanation and a re-classification), one question untouched.
  const rebuilt = JSON.parse(bankText);
  rebuilt.generated_at = new Date(Date.now() + 60_000).toISOString();
  const target = rebuilt.questions.find((q) => q.id === 'MPPSC-2019-001');
  target.explanation.correct_reasoning = `${target.explanation.correct_reasoning}\n(Explanation refreshed in a later build.)`;
  target.subject = 'Polity';
  target.topic = 'Union Executive';
  target.language_variants.en.options[1].text = `${target.language_variants.en.options[1].text} (corrected in a later build)`;

  const result = await builtin.ensureBuiltinBank({ text: JSON.stringify(rebuilt) });
  assert.equal(result.status, 'updated', 'a rebuilt file is applied');
  assert.ok(result.stats.questionsUpdated >= 1, 'the corrected record is refreshed');
  assert.equal(result.stats.questionsAdded, 0, 'no question is added by an update');
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1200, 'and none is duplicated');

  const after = await m.db.get(m.constants.STORES.QUESTIONS, 'MPPSC-2019-001');
  assert.match(after.language_variants.en.options[1].text, /corrected in a later build/, 'the corrected option text is stored');
  assert.match(after.explanation.correct_reasoning, /refreshed in a later build/, 'so is the refreshed explanation');

  // A question whose wording and options are byte-identical is not rewritten,
  // even if its explanation changed: the importer's conflict test is the
  // fingerprint over question text and options, the same identity the rest of
  // the app deduplicates on. A file that changes only explanations therefore
  // reports `current` — documented behaviour, asserted here so it cannot drift.
  const untouched = JSON.parse(JSON.stringify(rebuilt));
  untouched.generated_at = new Date(Date.now() + 120_000).toISOString();
  const other = untouched.questions.find((q) => q.id === 'MPPSC-2020-001');
  other.explanation.correct_reasoning = 'A different build of the same question.';
  const second = await builtin.ensureBuiltinBank({ text: JSON.stringify(untouched) });
  assert.equal(second.status, 'current', 'an explanation-only rebuild writes nothing');
  assert.notEqual(
    (await m.db.get(m.constants.STORES.QUESTIONS, 'MPPSC-2020-001')).explanation.correct_reasoning,
    'A different build of the same question.',
    'the stored copy of an unchanged question is not rewritten',
  );
  // The recorded hash did move, so the next boot compares against the new file.
  const meta = await m.db.getMeta(builtin.BUILTIN_BANK_META);
  assert.equal(meta.sha256, second.meta.sha256);
  // The user's work wins over the incoming file.
  assert.equal(after.verified.answer.join(','), 'C', 'the verified answer survives an update');
  assert.equal(after.verified.evidence.length >= 1, true);
  assert.equal(after.dispute?.is_disputed, true, 'the dispute flag survives an update');
  assert.equal(after.classification.subject, 'History', 'the user\'s classification is kept as the one in use');
  assert.ok(after.classification.userEditedAt, 'the record is marked as edited by the user, which is what protects it');
  assert.equal('source' in after.classification, false, 'and not by a provenance marker on the label');
  assert.equal(after.classification.pipeline_latest?.subject, 'Polity', 'and the new pipeline label is kept alongside it');
  assert.equal(marks.verified.answer.join(','), 'C');
});

test('a user\'s own bank is untouched when the bundled bank reloads or is removed', async () => {
  await bootApp();
  await builtin.ensureBuiltinBank({ text: bankText });
  await importDemoBank();
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1234);

  await builtin.ensureBuiltinBank({ text: bankText, force: true });
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1234, 'a forced reload duplicates nothing');
  assert.ok(await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-001'), 'the user\'s own question is still there');

  const removed = await builtin.removeBuiltinBank();
  assert.equal(removed.removedQuestions, 1200, 'exactly the bundled questions are removed');
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 34, 'the user\'s own 34 questions remain');
  assert.equal(await m.db.count(m.constants.STORES.PAPERS), 3, 'and their papers remain');
  assert.equal((await builtin.builtinBankInfo()).loaded, false, 'the app knows the bundled bank is gone');

  const reloaded = await builtin.ensureBuiltinBank({ text: bankText });
  assert.equal(reloaded.status, 'loaded');
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1234, 'and it can be loaded again in full');
});

test('a bank that fails validation is never half-imported', async () => {
  await bootApp();
  const broken = { schema_version: '1.0.0', bank_id: 'broken', papers: [], questions: [{ id: 'X-1' }] };
  const result = await builtin.ensureBuiltinBank({ text: JSON.stringify(broken) });
  assert.ok(['blocked', 'error'].includes(result.status), `expected a refusal, got ${result.status}`);
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 0, 'nothing was written');
  assert.equal(await m.db.count(m.constants.STORES.PAPERS), 0);

  const notJson = await builtin.ensureBuiltinBank({ text: '{ not json' });
  assert.equal(notJson.status, 'error');
  assert.match(notJson.message, /not valid JSON/);
});

test('scoring a real paper uses the scheme that came with the bank', async () => {
  await bootApp();
  await builtin.ensureBuiltinBank({ text: bankText });
  const paper = await m.db.get(m.constants.STORES.PAPERS, 'MPPSC-2024-P1');
  const resolved = m.scoring.resolveScoringRules({ paper });
  assert.equal(resolved.source, 'mppsc_builtin', 'latest-pattern practice scoring is not mislabeled as a paper historical rule');
  assert.equal(resolved.needsConfiguration, false, 'no manual marks entry is needed');
  assert.equal(resolved.schemeId, 'mppsc-sse-prelims-latest-practice');
  assert.equal(resolved.rules.marks_per_correct, 3);
  assert.equal(resolved.rules.negative_marks_per_incorrect, 1);
  assert.equal(resolved.rules.negative_marking_enabled, true);
  assert.equal(resolved.rules.marks_for_unanswered, 0);
  assert.match(m.scoring.describeRules(resolved.rules, resolved.source), /latest MPPSC practice pattern/);
  assert.match(resolved.rulesSourceNote, /must not be described as evidence about historical rules/i);
});

test('a session on a real 2019 paper uses the latest +3/−1/0 practice pattern', async () => {
  // Three questions of `MPPSC-2019-P1`, answered through the real test service:
  // correct, wrong, left blank. The latest MPPSC practice pattern gives +3 / −1 / 0.
  const paper = await m.db.get(m.constants.STORES.PAPERS, 'MPPSC-2019-P1');
  const ids = paper.question_order.filter((id) => m.appState.questionIndex.get(id)?.hasSuppliedAnswer).slice(0, 3);
  assert.equal(ids.length, 3, 'the paper has at least three questions with a stored key');
  const test = await m.tests.createTest({
    kind: 'pyq_full',
    label: 'Scheme check',
    paper,
    questionIds: ids,
    questionMetas: ids.map((id) => m.appState.questionIndex.get(id)),
    orderSource: 'original',
    config: { feedbackMode: 'exam', confidence: 'off' },
  });
  assert.equal(test.config.scoring.source, 'mppsc_builtin');
  assert.equal(test.config.scoring.needsConfiguration, false);

  await answerTest(test, { correct: [0], incorrect: [1], skip: [2] });
  const { result } = await m.tests.submitTest(test);
  assert.equal(result.scoring.marks_per_correct, 3);
  assert.equal(result.scoring.source, 'mppsc_builtin');
  assert.equal(result.counts.correct, 1);
  assert.equal(result.counts.incorrect, 1);
  assert.equal(result.counts.unanswered, 1);
  assert.equal(result.counts.unscored, 0, 'every question carried a key');
  assert.equal(result.score, 2, 'one correct answer (+3) and one incorrect answer (−1)');
  assert.equal(result.max_marks, 9, '3 questions × 3 marks');
  assert.equal(result.negative_marks_applied, -1, 'the incorrect answer deducts one mark');
});

test('the same latest pattern is selected for 2026 and the historical bundled papers', async () => {
  const fresh = m.scoring.resolveScoringRules({
    paper: { paper_id: 'MPPSC-2026-P1', exam: 'MPPSC State Service Preliminary Examination', year: 2026, paper_code: 'GS-I', scoring: { rules_known: false } },
  });
  assert.equal(fresh.schemeId, 'mppsc-sse-prelims-latest-practice');
  assert.equal(fresh.rules.marks_per_correct, 3);
  assert.equal(fresh.rules.negative_marking_enabled, true);
  assert.equal(fresh.rules.negative_marks_per_incorrect, 1);

  const was = m.scoring.resolveScoringRules({ paper: await m.db.get(m.constants.STORES.PAPERS, 'MPPSC-2019-P1') });
  assert.equal(was.schemeId, 'mppsc-sse-prelims-latest-practice');
  assert.equal(was.rules.marks_per_correct, 3);
  assert.equal(was.rules.negative_marking_enabled, true);
});
