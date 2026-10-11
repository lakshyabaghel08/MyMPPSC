/**
 * import.test.js — Import workflow against a real (in-memory) IndexedDB.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, readText, readJson, importDemoBank } from './helpers.mjs';

const m = await bootApp();

test('import writes questions, papers and an import record', async () => {
  const { analysis, result } = await importDemoBank();
  assert.equal(analysis.stage, 'ready');
  assert.equal(result.stats.questionsAdded, 34);
  assert.equal(result.stats.papersAdded, 3);
  const stored = await m.db.getAll(m.constants.STORES.QUESTIONS);
  assert.equal(stored.length, 34);
  const papers = await m.db.getAll(m.constants.STORES.PAPERS);
  assert.equal(papers.length, 3);
  const history = await m.importer.importHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].bank_id, 'DEMO-SYNTHETIC-001');
  assert.equal(history[0].validation_status, 'valid_with_warnings');
  assert.equal(history[0].is_demonstration, true);
});

test('the index reflects the imported bank, including language and answer metadata', async () => {
  assert.equal(m.appState.questionIndex.size, 34);
  const meta = m.appState.questionIndex.get('DEMO-P1-001');
  assert.deepEqual(meta.langs, ['en', 'hi']);
  assert.equal(meta.hasSuppliedAnswer, true);
  assert.equal(meta.explanationStatus, 'reviewed');
  const disputed = m.appState.questionIndex.get('DEMO-P2-003');
  assert.equal(disputed.disputed, true);
  assert.equal(m.appState.papers.get('DEMO-P1').scoring.marks_per_correct, 2);
});

test('re-importing the identical bank creates no duplicates', async () => {
  const text = await readText('demo/demo-bank.json');
  const analysis = await m.importer.analyseBankFile(text, { filename: 'demo-bank.json' });
  assert.equal(analysis.comparison.newQuestions, 0, 'every question is already stored');
  assert.equal(analysis.comparison.alreadyPresent, 34);
  const result = await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  assert.equal(result.stats.questionsAdded, 0);
  assert.equal(result.stats.questionsSkipped, 34);
  const stored = await m.db.getAll(m.constants.STORES.QUESTIONS);
  assert.equal(stored.length, 34, 'no duplicate rows were created');
  assert.equal(await m.db.count(m.constants.STORES.IMPORTS), 2, 'the second import is logged as well');
});

test('the same file imported twice is detected by hash', async () => {
  const text = await readText('demo/demo-bank.json');
  const analysis = await m.importer.analyseBankFile(text, { filename: 'demo-bank.json' });
  assert.ok(analysis.sameFilePreviouslyImportedAt, 'the file hash matches an earlier import');
});

test('a changed question is not overwritten unless the user chooses "update"', async () => {
  const stored = await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-001');
  const bank = JSON.parse(await readText('demo/demo-bank.json'));
  const target = bank.questions.find((q) => q.id === 'DEMO-P1-001');
  target.language_variants.en.question_text = 'Which river is known as the lifeline of Madhya Pradesh (reworded)?';

  const analysisSkip = await m.importer.analyseBankObject(bank, { filename: 'changed.json' });
  assert.equal(analysisSkip.comparison.changedRecords, 1);
  const skipResult = await m.importer.executeImport(analysisSkip, { conflictPolicy: 'skip' });
  assert.equal(skipResult.stats.questionsUpdated, 0);
  const afterSkip = await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-001');
  assert.equal(afterSkip.language_variants.en.question_text, stored.language_variants.en.question_text, 'existing wording kept');

  // add a user correction first, then update, to prove user work survives
  await m.questions.updateClassification('DEMO-P1-001', { subject: 'My Subject', topic: 'My Topic', note: 'user edit' });
  const analysisUpdate = await m.importer.analyseBankObject(bank, { filename: 'changed.json' });
  const updateResult = await m.importer.executeImport(analysisUpdate, { conflictPolicy: 'update' });
  assert.equal(updateResult.stats.questionsUpdated, 1);
  const afterUpdate = await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-001');
  assert.match(afterUpdate.language_variants.en.question_text, /reworded/);
  assert.equal(afterUpdate.classification.subject, 'My Subject', 'user classification survives a re-import');
  assert.ok(afterUpdate.user_corrections.length >= 2, 'correction history is preserved and extended');
  assert.equal(afterUpdate.supplied.answer[0], 'B', 'supplied answer still intact');
  await m.questions.revertClassification('DEMO-P1-001');
});

test('importing a bank with an unmatched paper creates a flagged placeholder paper', async () => {
  const fixture = await readJson('examples/invalid-records-fixture.json');
  const analysis = await m.importer.analyseBankObject(fixture, { filename: 'invalid-records-fixture.json' });
  const before = await m.db.count(m.constants.STORES.QUESTIONS);
  const result = await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  assert.equal(result.stats.questionsAdded, 2, 'only the valid records are written');
  assert.equal(result.rejected.length, 4);
  assert.deepEqual(result.importRecord.placeholder_papers, ['FIX-MISSING-PAPER']);
  const paper = await m.db.get(m.constants.STORES.PAPERS, 'FIX-MISSING-PAPER');
  assert.equal(paper.placeholder, true);
  assert.equal(paper.scoring.rules_known, false);
  assert.equal(paper.duration_minutes, null);
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), before + 2);
});

test('a bank that fails validation cannot be imported at all', async () => {
  const analysis = await m.importer.analyseBankObject({ schema_version: '9.0.0', papers: [], questions: [] });
  assert.equal(analysis.stage, 'blocked');
  await assert.rejects(() => m.importer.executeImport(analysis), /did not pass validation/i);
  const analysisBroken = await m.importer.analyseBankFile('not json at all', { filename: 'x.json' });
  await assert.rejects(() => m.importer.executeImport(analysisBroken), /did not pass validation/i);
});

test('importing a second, unrelated bank leaves the first bank untouched', async () => {
  const other = {
    schema_version: '1.0.0',
    bank_id: 'SECOND-BANK',
    bank_name: 'Second test bank',
    papers: [{ paper_id: 'SEC-P1', exam: 'Second Exam', year: 2019, original_question_count: 1, duration_minutes: 2, total_marks: 4, scoring: { rules_known: true, marks_per_correct: 4 }, answer_key: { source: 'second key', status: 'final' } }],
    questions: [
      {
        id: 'SEC-001',
        paper_id: 'SEC-P1',
        question_number: 1,
        exam: 'Second Exam',
        year: 2019,
        question_type: 'single_correct',
        language_variants: { en: { question_text: 'Second bank question?', options: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }] } },
        supplied_answer: { answer: ['A'], status: 'final', source: 'second key' },
        answer_key_status: 'final',
        subject: 'Second Subject',
        topic: 'Second Topic',
      },
    ],
  };
  const analysis = await m.importer.analyseBankObject(other, { filename: 'second.json' });
  assert.equal(analysis.report.fatal.length, 0);
  const result = await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  assert.equal(result.stats.questionsAdded, 1);
  assert.equal(result.stats.papersAdded, 1);
  assert.equal((await m.db.getAll(m.constants.STORES.QUESTIONS)).length, 37);
  assert.ok(m.appState.papers.get('DEMO-P1'), 'the earlier paper is still present');
});

test('undoing an import removes only that bank\'s questions', async () => {
  const history = await m.importer.importHistory();
  const second = history.find((h) => h.bank_id === 'SECOND-BANK');
  const removed = await m.importer.undoImport(second.id, { removeAttempts: true });
  assert.equal(removed.removedQuestions, 1);
  assert.equal(removed.removedPapers, 1);
  assert.equal(await m.db.get(m.constants.STORES.QUESTIONS, 'SEC-001'), undefined);
  assert.ok(await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-001'), 'the demonstration bank survives');
  const record = await m.db.get(m.constants.STORES.IMPORTS, second.id);
  assert.ok(record.undone_at, 'the undo is recorded');
});

test('import progress is reported and large banks are written in batches', async () => {
  const big = {
    schema_version: '1.0.0',
    bank_id: 'BATCH-BANK',
    papers: [{ paper_id: 'BATCH-P1', exam: 'Batch', year: 2018, original_question_count: 1200, scoring: { rules_known: true, marks_per_correct: 2 } }],
    questions: Array.from({ length: 1200 }, (_, i) => ({
      id: `BATCH-${String(i + 1).padStart(4, '0')}`,
      paper_id: 'BATCH-P1',
      question_number: i + 1,
      question_type: 'single_correct',
      language_variants: { en: { question_text: `Batch question number ${i + 1} about a topic?`, options: [{ key: 'A', text: 'Alpha' }, { key: 'B', text: 'Beta' }, { key: 'C', text: 'Gamma' }] } },
      supplied_answer: { answer: ['A'], status: 'provisional', source: 'batch key' },
      subject: i % 2 ? 'Batch A' : 'Batch B',
      topic: `Topic ${i % 7}`,
    })),
  };
  const analysis = await m.importer.analyseBankObject(big, { filename: 'batch.json' });
  assert.equal(analysis.report.questions.length, 1200);
  const progress = [];
  const unsubscribe = m.state.on('import:progress', (p) => progress.push(p.done));
  const result = await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  unsubscribe();
  assert.equal(result.stats.questionsAdded, 1200);
  assert.ok(progress.length >= 3, 'batched writes report progress');
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1236);
  await m.importer.undoImport(result.importRecord.id);
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 36);
});
