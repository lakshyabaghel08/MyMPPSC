/**
 * builtin-bank.test.js — the repository-backed loader, in an isolated database.
 *
 * Requirement it proves: open the app → the committed 2012–2024 bank is there
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
  assert.equal(result.meta.questions, 1300);
  assert.equal(result.meta.papers, 13);
  assert.equal(m.appState.questionIndex.size, 1300, 'every question is in the live index');
  assert.equal(m.appState.papers.size, 13);

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
  assert.equal(await m.db.count(m.constants.STORES.PAPERS), 13, 'papers are not duplicated either');
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
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1300, 'and none is duplicated');

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
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1334);

  await builtin.ensureBuiltinBank({ text: bankText, force: true });
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1334, 'a forced reload duplicates nothing');
  assert.ok(await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-001'), 'the user\'s own question is still there');

  const removed = await builtin.removeBuiltinBank();
  assert.equal(removed.removedQuestions, 1300, 'exactly the bundled questions are removed');
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 34, 'the user\'s own 34 questions remain');
  assert.equal(await m.db.count(m.constants.STORES.PAPERS), 3, 'and their papers remain');
  assert.equal((await builtin.builtinBankInfo()).loaded, false, 'the app knows the bundled bank is gone');

  const reloaded = await builtin.ensureBuiltinBank({ text: bankText });
  assert.equal(reloaded.status, 'loaded');
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1334, 'and it can be loaded again in full');
});

test('upgrading the old bundled bank adds the keyless 2012 paper without overwriting user edits', async () => {
  await bootApp();
  const old = JSON.parse(bankText);
  old.questions = old.questions.filter((q) => q.year !== 2012);
  old.papers = old.papers.filter((p) => p.year !== 2012);
  await builtin.ensureBuiltinBank({ text: JSON.stringify(old) });
  await m.questions.updateClassification('MPPSC-2019-001', { subject: 'History', topic: 'Modern India', subtopic: 'Indian National Congress' });
  await m.questions.setVerifiedAnswer('MPPSC-2019-001', { answer: ['C'], evidence: [{ note: 'checked by hand' }] });
  const result = await builtin.ensureBuiltinBank({ text: bankText });
  assert.equal(result.status, 'updated');
  assert.equal(result.stats.questionsAdded, 100);
  const existing = await m.db.get(m.constants.STORES.QUESTIONS, 'MPPSC-2019-001');
  assert.equal(existing.classification.subject, 'History');
  assert.deepEqual(existing.verified.answer, ['C']);
  const added = await m.db.get(m.constants.STORES.QUESTIONS, 'MPPSC-2012-031');
  assert.equal(added.supplied.answer, null);
  assert.match(added.language_variants.en.options[2].text, /universal adult franchise/);
  assert.equal((await m.db.get(m.constants.STORES.PAPERS, 'MPPSC-2012-P1')).scoring.rules_known, false);
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


test('an unchanged active bank still retires old bundled papers and preserves study history', async () => {
  await bootApp();
  const active = JSON.parse(bankText);
  const archive = JSON.parse(await readText('pyq/archive/mppsc-2009-2011-papers.json'));
  const old = { ...active, questions: [...active.questions, ...archive.questions], papers: [...active.papers, ...archive.papers] };
  const oldText = JSON.stringify(old);
  const installed = await builtin.ensureBuiltinBank({ text: oldText });
  assert.equal(installed.status, 'loaded');
  assert.equal(installed.retirement.removedQuestions, 0, 'nothing is retired before the legacy records are stored');
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1684);

  // Put back a complete legacy installation *after* loading, with the current
  // file hash already recorded. This is the upgrade path a merge-only importer
  // used to miss: no incoming record changed, yet 384 old records remained.
  const analysis = await m.importer.analyseBankFile(oldText, { filename: 'legacy-bank.json' });
  await m.importer.executeImport(analysis, { conflictPolicy: 'update' });
  const currentHash = await m.importer.sha256Hex(bankText);
  await m.db.setMeta(builtin.BUILTIN_BANK_META, { ...(await m.db.getMeta(builtin.BUILTIN_BANK_META)), sha256: currentHash });
  await m.state.refreshQuestionIndex({ silent: true });
  assert.equal(m.appState.questionIndex.size, 1684);

  const retiredId = 'MPPSC-2009-001';
  await m.questions.updateClassification(retiredId, { subject: 'History', topic: 'Ancient India' });
  await m.revision.ensureRevisionRecord(retiredId, { reason: 'Historical schedule must survive' });
  const attempt = { id: 'legacy-attempt', question_id: retiredId, test_id: 'legacy-test', paper_id: 'MPPSC-2009-P1', outcome: 'incorrect', created_at: new Date().toISOString(), is_first_attempt: true };
  await m.db.put(m.constants.STORES.ATTEMPTS, attempt);
  await m.db.put(m.constants.STORES.MISTAKES, { key: 'legacy-mistake', question_id: retiredId, type: 'incorrect', status: 'open', occurrences: 1 });

  const upgraded = await builtin.ensureBuiltinBank({ text: bankText });
  assert.equal(upgraded.retirement.removedQuestions, 384);
  assert.equal(upgraded.retirement.removedPapers, 3);
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1300);
  assert.equal(await m.db.count(m.constants.STORES.PAPERS), 13);
  assert.equal(m.appState.questionIndex.has(retiredId), false);
  assert.deepEqual(await m.db.get(m.constants.STORES.ATTEMPTS, 'legacy-attempt'), attempt, 'attempt history is not erased');
  assert.ok(await m.db.get(m.constants.STORES.REVISION, retiredId), 'the raw revision history remains available to backups');
  assert.ok(await m.db.get(m.constants.STORES.MISTAKES, 'legacy-mistake'), 'the raw mistake history remains available to backups');
  assert.equal((await m.revision.allRevisionRecords()).some((r) => r.question_id === retiredId), false, 'removed questions are not actionable revision items');
  assert.equal((await m.attempts.listMistakes({ status: 'all' })).some((r) => r.question_id === retiredId), false, 'removed questions are not actionable mistakes');
  const analytics = m.analytics.buildAnalytics({ metas: [...m.appState.questionIndex.values()], attempts: [attempt], revisionRecords: [{ question_id: retiredId, next_due: '2020-01-01', state: 'learning' }], mistakes: [{ question_id: retiredId, status: 'open', occurrences: 1 }] });
  assert.equal(analytics.counts.totalAttempts, 1, 'historical performance still counts');
  assert.equal(analytics.counts.coverage, 0, 'a removed question cannot inflate coverage of the active bank');
  assert.equal(analytics.revision.tracked, 0);
  assert.equal(analytics.mistakes.open, 0);

  const again = await builtin.ensureBuiltinBank({ text: bankText });
  assert.equal(again.status, 'current');
  assert.deepEqual(again.retirement, { removedQuestions: 0, removedPapers: 0 });
});

test('retirement works offline and never removes an independently imported paper from the same years', async () => {
  await bootApp();
  const archive = JSON.parse(await readText('pyq/archive/mppsc-2009-2011-papers.json'));
  const own = {
    schema_version: '1.0.0', bank_id: 'my-own-historical-bank', bank_name: 'My own verified copies',
    questions: archive.questions.filter((q) => q.year === 2010).map((q) => ({ ...q, id: `OWN-${q.id}` })),
    papers: archive.papers.filter((p) => p.year === 2010).map((p) => ({ ...p, paper_id: 'OWN-2010-P1' })),
  };
  own.questions = own.questions.map((q) => ({ ...q, paper_id: 'OWN-2010-P1' }));
  own.papers[0].question_order = own.questions.map((q) => q.id);
  const ownAnalysis = await m.importer.analyseBankObject(own, { filename: 'my-copies.json' });
  await m.importer.executeImport(ownAnalysis, { conflictPolicy: 'skip' });
  // Legacy bundled copies alongside the learner's own bank.
  const legacy = { schema_version: '1.0.0', bank_id: builtin.BUILTIN_BANK_ID, questions: archive.questions, papers: archive.papers };
  const legacyAnalysis = await m.importer.analyseBankObject(legacy, { filename: 'legacy.json' });
  await m.importer.executeImport(legacyAnalysis, { conflictPolicy: 'skip' });
  await m.state.refreshQuestionIndex({ silent: true });
  assert.equal(m.appState.questionIndex.size, 504);

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const result = await builtin.ensureBuiltinBank();
    assert.equal(result.status, 'unavailable');
    assert.equal(result.retirement.removedQuestions, 384);
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 120);
  assert.equal(await m.db.count(m.constants.STORES.PAPERS), 1);
  assert.ok(await m.db.get(m.constants.STORES.QUESTIONS, 'OWN-MPPSC-2010-001'));
  assert.ok(await m.db.get(m.constants.STORES.PAPERS, 'OWN-2010-P1'));
});

test('restoring a pre-removal backup cannot resurrect retired bundled papers', async () => {
  await bootApp();
  const active = JSON.parse(bankText);
  const archive = JSON.parse(await readText('pyq/archive/mppsc-2009-2011-papers.json'));
  const legacy = { ...active, questions: [...active.questions, ...archive.questions], papers: [...active.papers, ...archive.papers] };
  const analysis = await m.importer.analyseBankObject(legacy, { filename: 'legacy.json' });
  await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  await m.db.setMeta(builtin.BUILTIN_BANK_META, { bank_id: builtin.BUILTIN_BANK_ID, sha256: await m.importer.sha256Hex(bankText) });
  await m.state.refreshQuestionIndex({ silent: true });
  const backup = await m.data.buildBackup();
  assert.equal(backup.payload.questions.length, 1684);
  await bootApp();
  const validation = m.data.validateBackup(backup);
  assert.equal(validation.ok, true);
  const restored = await m.data.restoreBackup(validation, { mode: 'replace' });
  assert.equal(restored.retiredBundled.removedQuestions, 384);
  assert.equal(restored.questions, 1300);
  assert.equal(m.appState.questionIndex.size, 1300);
  assert.equal(m.appState.papers.size, 13);
  const after = await builtin.ensureBuiltinBank({ text: bankText });
  assert.equal(after.status, 'current');
  assert.equal(after.meta.questions, 1300, 'the recorded loader metadata describes the active file, not the restored legacy file');
  assert.equal(after.meta.papers, 13);
});
