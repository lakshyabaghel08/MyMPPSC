/**
 * backup.test.js — Export, validation and restore.
 *
 * The whole point of a backup is that user progress survives: attempts, tests,
 * mistake book, revision schedule, syllabus, tasks and settings.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, importDemoBank } from './helpers.mjs';

const m = await bootApp();
await importDemoBank();

async function createProgress() {
  const metas = m.state; // module namespace helper; see helpers.mjs
  const paper = await m.db.get(m.constants.STORES.PAPERS, 'DEMO-P1');
  const questionIds = paper.question_order.slice(0, 6);
  const test = await m.tests.createTest({
    kind: 'pyq_full',
    label: 'Backup test paper',
    paper,
    questionIds,
    questionMetas: questionIds.map((id) => m.appState.questionIndex.get(id)),
    config: { feedbackMode: 'exam', confidence: 'optional', durationMinutes: 12 },
  });
  const questions = await m.questions.getQuestions(questionIds);
  test.responses[questionIds[0]] = { selected: questions.get(questionIds[0]).supplied.answer, flagged: false, confidence: 'confident', time_spent_ms: 20000 };
  test.responses[questionIds[1]] = { selected: ['A'].filter((k) => !(questions.get(questionIds[1]).supplied.answer || []).includes(k)).concat(questions.get(questionIds[1]).supplied.answer.includes('D') ? [] : ['D']), flagged: true, confidence: 'guessed', time_spent_ms: 30000 };
  test.responses[questionIds[2]] = { selected: [], flagged: false, confidence: null, time_spent_ms: 5000 };
  await m.tests.saveTest(test);
  const { result } = await m.tests.submitTest(test);
  return { test, result };
}

test('a backup captures progress, not just the question list', async () => {
  const { test, result } = await createProgress();
  const task = await m.planner.createTask({ title: 'Revise rivers', type: 'revision', due_date: '2026-03-01' });
  const syllabus = await m.planner.addSyllabusItem({ title: 'Geography' });
  await m.planner.logSession({ minutes: 45, category: 'practice', subject: 'Geography' });
  await m.state.saveSettings({ language: 'hi' });

  const backup = await m.data.buildBackup();
  assert.equal(backup.format, 'mymppsc-backup');
  assert.equal(backup.payload.questions.length, 34);
  assert.equal(backup.payload.papers.length, 3);
  assert.equal(backup.payload.tests.length, 1);
  assert.equal(backup.payload.attempts.length, test.question_ids.length, 'one attempt row per question in the submitted test');
  assert.ok(backup.payload.revision.length > 0, 'revision schedule is included');
  assert.ok(backup.payload.mistakes.length > 0, 'mistake book entries are included');
  assert.equal(backup.payload.tasks.length, 1);
  assert.equal(backup.payload.syllabus.length, 1);
  assert.equal(backup.payload.sessions.length, 1);
  assert.equal(backup.payload.settings.language, 'hi');
  assert.ok(backup.integrity.payload_sha256);
  assert.equal(result.counts.total, 6);

  const validation = m.data.validateBackup(backup);
  assert.equal(validation.ok, true, validation.errors.join(' '));
  const integrity = await m.data.verifyBackupIntegrity(backup);
  assert.equal(integrity.checked, true);
  assert.equal(integrity.matches, true);

  // keep the backup for the restore tests below
  globalThis.__backup = backup;
  globalThis.__progress = { testId: test.id, taskId: task.id, syllabusId: syllabus.id, result };
});

test('malformed or incompatible backups are refused with a reason', () => {
  const notAnObject = m.data.validateBackup('nonsense');
  assert.equal(notAnObject.ok, false);
  assert.match(notAnObject.errors[0], /not a JSON object/i);

  const wrongFormat = m.data.validateBackup({ format: 'something-else', format_version: '1.0.0', payload: {} });
  assert.equal(wrongFormat.ok, false);
  assert.match(wrongFormat.errors.join(' '), /not a mymppsc-backup backup/i);

  const futureVersion = m.data.validateBackup({ format: 'mymppsc-backup', format_version: '9.0.0', payload: {} });
  assert.equal(futureVersion.ok, false);
  assert.match(futureVersion.errors.join(' '), /not compatible/i);

  const missingPayload = m.data.validateBackup({ format: 'mymppsc-backup', format_version: '1.0.0' });
  assert.equal(missingPayload.ok, false);
  assert.match(missingPayload.errors.join(' '), /no payload/i);

  const brokenRow = m.data.validateBackup({
    format: 'mymppsc-backup',
    format_version: '1.0.0',
    payload: { questions: [null], attempts: [{ nope: 1 }] },
  });
  assert.equal(brokenRow.ok, false);
  assert.ok(brokenRow.errors.some((e) => /not an object/.test(e)));
  assert.ok(brokenRow.errors.some((e) => /has no "id" field/.test(e)));
});

test('a restore over an empty database brings back every part of the progress', async () => {
  const backup = globalThis.__backup;
  const progress = globalThis.__progress;
  const validation = m.data.validateBackup(backup);
  const stats = await m.data.restoreBackup(validation, { mode: 'replace' });
  assert.equal(stats.questions, 34);
  assert.equal(stats.papers, 3);
  assert.equal(stats.tests, 1);
  assert.ok(stats.attempts >= 6);
  assert.ok(stats.revision >= 1);
  assert.ok(stats.mistakes >= 1);
  assert.equal(stats.tasks, 1);
  assert.equal(stats.syllabus, 1);
  assert.equal(stats.sessions, 1);

  const test = await m.db.get(m.constants.STORES.TESTS, progress.testId);
  assert.ok(test, 'the submitted test is back');
  assert.equal(test.status, 'submitted');
  assert.equal(test.result.score, progress.result.score, 'the stored report is intact');
  assert.equal(test.result.counts.total, 6);
  const attempts = await m.db.getByIndex(m.constants.STORES.ATTEMPTS, 'test_id', progress.testId);
  assert.equal(attempts.length, 6);
  assert.equal(await m.db.count(m.constants.STORES.SESSIONS), 1);
  assert.equal(m.appState.settings.language, 'hi', 'settings are restored too');
  assert.equal(m.appState.questionIndex.size, 34, 'the question index is rebuilt after a restore');
});

test('a merge restore does not duplicate rows and keeps newer local user work', async () => {
  const backup = globalThis.__backup;
  await m.state.saveSettings({ language: 'en' });
  await m.questions.updateClassification('DEMO-P1-005', { subject: 'Edited after backup', topic: 'Edited topic' });
  const edited = await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-005');

  const validation = m.data.validateBackup(backup);
  await m.data.restoreBackup(validation, { mode: 'merge' });
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 34, 'merging the same bank does not duplicate questions');
  assert.equal(await m.db.count(m.constants.STORES.TESTS), 1);
  assert.equal(await m.db.count(m.constants.STORES.TASKS), 1);
  assert.equal(await m.db.count(m.constants.STORES.SESSIONS), 1);

  const after = await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-005');
  assert.equal(after.classification.subject, 'Edited after backup', 'a newer local edit is not rolled back by an older backup');
  assert.equal(after.updated_at, edited.updated_at);
  assert.equal(m.appState.settings.language, 'en', 'merge keeps the settings that are already in place when the backup is older');
});

test('restoring refuses to run on a backup that failed validation', async () => {
  const invalid = m.data.validateBackup({ format: 'nope', payload: {} });
  await assert.rejects(() => m.data.restoreBackup(invalid, { mode: 'replace' }), /did not pass validation/i);
});

test('the exported bank is re-importable in the standard schema', async () => {
  const bank = await m.data.exportBankJson();
  assert.equal(bank.schema_version, '1.0.0');
  assert.equal(bank.questions.length, 34);
  assert.ok(bank.questions.every((q) => q.language_variants && q.id));
  assert.ok(bank.questions.some((q) => q.answer_key_status === 'disputed'));
  const analysis = await m.importer.analyseBankObject(bank, { filename: 'local-export.json' });
  assert.equal(analysis.report.fatal.length, 0);
  assert.equal(analysis.report.questions.length, 34);
  assert.equal(analysis.report.errors.length, 0, `exported bank must re-validate: ${analysis.report.errors.map((e) => e.message).join('; ')}`);
  // Re-importing must not duplicate anything.
  const result = await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  assert.equal(result.stats.questionsAdded, 0);
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 34);
});

test('a progress-only export is small and does not contain the question bank', async () => {
  const progress = await m.data.exportProgressJson();
  assert.equal(progress.format, 'mymppsc-progress');
  assert.ok(progress.counts.attempts >= 6);
  assert.equal(progress.payload.questions, undefined);
  assert.ok(progress.payload.settings, 'settings still travel with a progress export');
});

test('the backup self-check reports integrity and counts', async () => {
  const check = await m.data.backupRoundTripCheck();
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  assert.equal(check.integrity.matches, true);
  assert.equal(check.counts.questions, 34);
});
