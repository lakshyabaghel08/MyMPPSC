/**
 * tools.test.js — the build-time intake tool.
 *
 * The app ships a small bridge for the separate data pipeline
 * (tools/build-bank.mjs). This suite proves that bridge produces something the
 * app itself accepts: the output is validated with the app's validator and then
 * actually imported into a real (in-memory) database.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bootApp, dataPath, currentModules } from './helpers.mjs';
import { buildBankFromIntake } from '../tools/build-bank.mjs';

async function readIntake() {
  return JSON.parse(await readFile(dataPath('..', 'demo', 'intake-sample.json'), 'utf8'));
}

test('the intake tool builds a bank the app accepts', async () => {
  const intake = await readIntake();
  const { bank, warnings } = buildBankFromIntake(intake);

  assert.equal(bank.schema_version, '1.0.0');
  assert.equal(bank.questions.length, intake.questions.length);
  assert.equal(bank.papers.length, intake.papers.length);
  assert.equal(bank.is_demonstration, true, 'the tool must carry the demonstration flag through');

  // Language shorthand was expanded into the schema's language_variants shape.
  const first = bank.questions.find((q) => q.id === 'SAMPLE-2024-P1-001');
  assert.ok(first.language_variants.en && first.language_variants.hi, 'en/hi shorthand should become language_variants');
  assert.equal(first.supplied_answer.answer[0], 'B', 'the answer shorthand should become a supplied_answer record');
  assert.equal(first.answer_key_status, 'final');
  assert.equal(first.exam, intake.exam_default, 'exam should be inherited from the intake/paper');

  // Paper order is derived from question numbers when the intake does not state it.
  const paper1 = bank.papers.find((p) => p.paper_id === 'SAMPLE-2024-P1');
  assert.deepEqual(paper1.question_order, ['SAMPLE-2024-P1-001', 'SAMPLE-2024-P1-002', 'SAMPLE-2024-P1-003']);

  // A string explanation becomes an explicitly unreviewed record rather than being polished up.
  const second = bank.questions.find((q) => q.id === 'SAMPLE-2024-P1-002');
  assert.equal(second.explanation.status, 'unreviewed');

  // A paper with no stated rules keeps rules_known: false, so the app refuses to guess.
  const paper2 = bank.papers.find((p) => p.paper_id === 'SAMPLE-2024-P2');
  assert.equal(paper2.scoring.rules_known, false);

  const m = currentModules() || (await bootApp());
  const report = m.validate.validateBank(bank, {});
  assert.equal(report.fatal.length, 0, `no blocking problems expected: ${JSON.stringify(report.fatal)}`);
  assert.equal(report.errors.length, 0);
  assert.equal(report.rejected.length, 0);
  assert.equal(report.questions.length, intake.questions.length);
  assert.ok(
    report.warnings.some((w) => w.questionId === 'SAMPLE-2024-P2-002'),
    'the question with no answer key should be reported as a warning',
  );
  // The tool's own notes should not add noise for a well-formed intake file.
  assert.deepEqual(warnings, [], `unexpected intake notes: ${warnings.join(' | ')}`);
});

test('a built bank file can be written, re-read and imported into the app', async () => {
  const m = await bootApp();
  const intake = await readIntake();
  const { bank } = buildBankFromIntake(intake);

  const dir = await mkdtemp(path.join(tmpdir(), 'mymppsc-intake-'));
  const file = path.join(dir, 'built-bank.json');
  await writeFile(file, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');

  const text = await readFile(file, 'utf8');
  const analysis = await m.importer.analyseBankFile(text, { filename: 'built-bank.json' });
  assert.equal(analysis.stage, 'ready', `expected the built bank to analyse cleanly: ${analysis.fatalMessage}`);
  assert.equal(analysis.report.questions.length, intake.questions.length);
  assert.equal(analysis.comparison.newQuestions, intake.questions.length, 'everything should be new in an empty database');

  const result = await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  assert.equal(result.stats.questionsAdded, intake.questions.length);
  assert.equal(result.stats.papersAdded, intake.papers.length);

  const { state } = await import('../js/core/state.js');
  assert.equal(state.questionIndex.size, intake.questions.length);
  assert.ok(state.papers.has('SAMPLE-2024-P2'));
  const question = await m.questions.getQuestion('SAMPLE-2024-P2-002');
  assert.equal(question.supplied.answer, null, 'a question with no key must not be given one by the import path');
  const imported = state.questionIndex.get('SAMPLE-2024-P2-002');
  assert.equal(imported.hasSuppliedAnswer, false);
  assert.equal(imported.demonstration, true, 'demonstration records must remain flagged after import');

  await rm(dir, { recursive: true, force: true });
});

test('the tool refuses to invent content and reports what it cannot know', async () => {
  const m = await bootApp();
  const minimal = {
    intake_version: '1.0.0',
    bank_id: 'minimal',
    is_demonstration: true,
    papers: [{ paper_id: 'MIN-P1', paper_name: 'Minimal', year: 2025 }],
    questions: [
      { id: 'MIN-1', paper_id: 'MIN-P1', question_number: 1, en: { question_text: 'Filler?', options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }] } },
      { id: 'MIN-2', paper_id: 'MISSING-PAPER', question_number: 2, en: { question_text: 'Filler two?', options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }] } },
    ],
  };
  const { bank, warnings } = buildBankFromIntake(minimal);
  assert.equal(bank.papers[0].scoring.rules_known, false, 'missing rules must stay unknown, never defaulted to a guess');
  assert.equal(bank.questions[0].supplied_answer, undefined, 'the tool must not invent an answer key');
  assert.ok(warnings.some((w) => /MISSING-PAPER/.test(w)), 'a question on an undescribed paper must be reported');

  const report = m.validate.validateBank(bank, {});
  assert.ok(report.warnings.some((w) => w.questionId === 'MIN-1'), 'a question with no answer key must be warned about');
  // The bank is still importable: the placeholder paper is created and reported.
  const analysis = await m.importer.analyseBankObject(bank, {});
  assert.equal(analysis.stage, 'ready');
  assert.ok(analysis.report.placeholderPapers.includes('MISSING-PAPER'), `expected a placeholder paper for MISSING-PAPER, got ${JSON.stringify(analysis.report.placeholderPapers)}`);

  // An intake file with no questions is refused outright.
  assert.throws(() => buildBankFromIntake({ papers: [], questions: [] }), /no questions/i);
});
