/**
 * pyq-bank.test.js — the real 2019–2024 PYQ bank, through the real importer.
 *
 * This suite is deliberately isolated: bootApp() gives every run a fresh
 * in-memory IndexedDB and an empty localStorage, so nothing here can touch a
 * user's own data. What it proves is that the bank produced by
 * tools/classify-bank.mjs from data/pyq/source/MPPSC_PYQ_intake.json is
 * accepted by the app, arrives complete, and keeps the source's answer
 * semantics — including the eight questions that have no key at all.
 *
 * If data/pyq/mymppsc-pyq-bank.json is absent the suite skips rather than
 * fails, so a fresh clone without the built bank still passes `npm test`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { bootApp, readJson, readText, dataPath, importDemoBank } from './helpers.mjs';

const BANK_PATH = dataPath('pyq', 'mymppsc-pyq-bank.json');
const INTAKE_PATH = dataPath('pyq', 'source', 'MPPSC_PYQ_intake.json');
const haveBank = existsSync(BANK_PATH) && existsSync(INTAKE_PATH);

const m = await bootApp();

test('the real PYQ bank and its source intake are both present', { skip: !haveBank && 'bank not built yet' }, () => {
  assert.ok(haveBank, 'run tools/classify-bank.mjs first');
});

test('the app accepts the real bank and imports all 571 questions', { skip: !haveBank }, async () => {
  const text = await readText('pyq/mymppsc-pyq-bank.json');
  const analysis = await m.importer.analyseBankFile(text, { filename: 'mymppsc-pyq-bank.json' });
  assert.equal(analysis.stage, 'ready', `the importer refused the bank: ${analysis.fatalMessage}`);
  assert.equal(analysis.report.fatal.length, 0);
  assert.equal(analysis.report.errors.length, 0);
  assert.equal(analysis.report.rejected.length, 0, 'no record is rejected');
  assert.equal(analysis.report.meta.demoFlag, false, 'this is real data, not a demo fixture');
  assert.equal(analysis.report.stats.questions, 571);
  assert.equal(analysis.report.stats.papers, 6);

  const result = await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  assert.equal(result.stats.questionsAdded, 571);
  assert.equal(result.stats.papersAdded, 6);
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 571);
  assert.equal(m.appState.questionIndex.size, 571, 'the index holds every question');

  const history = await m.importer.importHistory();
  assert.equal(history[0].bank_id, 'mppsc-solved-pyq-book-2019-2024');
  assert.equal(history[0].is_demonstration, false);
});

test('every source record arrives, with its id, year and paper intact', { skip: !haveBank }, async () => {
  const source = await readJson('pyq/source/MPPSC_PYQ_intake.json');
  assert.equal(source.questions.length, 571);
  for (const q of source.questions) {
    const meta = m.appState.questionIndex.get(q.id);
    assert.ok(meta, `${q.id} is missing from the imported bank`);
    assert.equal(meta.paper_id, q.paper_id);
    assert.equal(meta.question_number, q.question_number);
    const stored = await m.db.get(m.constants.STORES.QUESTIONS, q.id);
    assert.equal(stored.language_variants.en.question_text, q.en.question_text, `${q.id}: question text must be verbatim`);
    assert.deepEqual(
      stored.language_variants.en.options.map((o) => [o.key, o.text]),
      (q.en.options || []).map((o) => [o.key, o.text]),
      `${q.id}: options must be verbatim`,
    );
    assert.deepEqual(stored.supplied?.answer ?? null, q.answer ?? null, `${q.id}: the printed key must not change`);
  }
});

test('no answer was invented for the eight questions that have no key', { skip: !haveBank }, async () => {
  const bank = await readJson('pyq/mymppsc-pyq-bank.json');
  const keyless = bank.questions.filter((q) => !q.supplied_answer?.answer?.length);
  assert.equal(keyless.length, 8, 'the source reports eight; the bank must still report eight');
  for (const q of keyless) {
    const meta = m.appState.questionIndex.get(q.id);
    assert.equal(meta.hasSuppliedAnswer, false, `${q.id}: still has no answer`);
    assert.equal(meta.answerStatus, 'missing', `${q.id}: recorded as missing, not guessed`);
    assert.equal(q.supplied_answer.status, 'missing');
    assert.ok(!q.verified_answer?.answer?.length, `${q.id}: nothing was presented as a verified answer`);
  }
});

test('printed answers stay unofficial and none is marked verified', { skip: !haveBank }, async () => {
  const bank = await readJson('pyq/mymppsc-pyq-bank.json');
  const unofficial = bank.questions.filter((q) => q.supplied_answer?.status === 'unofficial');
  assert.equal(unofficial.length, 563);
  assert.equal(bank.questions.filter((q) => q.verified_answer?.answer?.length).length, 0);
  assert.equal(bank.provenance.verified, false, 'the bank still says the source is unverified');
  assert.equal(bank.provenance.kind, 'coaching_material');
  const meta = m.appState.questionIndex.get('MPPSC-2019-001');
  assert.equal(meta.answerStatus, 'unofficial');
  assert.equal(meta.hasSuppliedAnswer, true);
});

test('classification survived the import, and unclassified stayed unclassified', { skip: !haveBank }, async () => {
  const classified = [...m.appState.questionIndex.values()].filter((q) => q.subject);
  assert.equal(classified.length, 366, 'the rule engine placed 366 of 571');
  const unclassified = [...m.appState.questionIndex.values()].filter((q) => !q.subject);
  assert.equal(unclassified.length, 205);
  for (const q of unclassified) assert.equal(q.unclassified, true, `${q.id} is flagged unclassified, not silently bucketed`);
  assert.equal(m.appState.questionIndex.get('MPPSC-2019-001').subject, 'Polity');
  // Every assigned label is a real taxonomy node.
  const taxonomy = await readJson('taxonomy/mppsc-taxonomy.json');
  const subjects = new Map(taxonomy.subjects.map((s) => [s.subject, new Map(s.topics.map((t) => [t.topic, t.subtopics]))]));
  for (const q of classified) {
    assert.ok(subjects.has(q.subject), `${q.subject} is not a taxonomy subject`);
    if (q.topic) {
      assert.ok(subjects.get(q.subject).has(q.topic), `${q.subject} / ${q.topic} is not in the taxonomy`);
      if (q.subtopic) assert.ok(subjects.get(q.subject).get(q.topic).includes(q.subtopic));
    }
  }
});

test('importing the PYQ bank does not disturb a bank the user already has', { skip: !haveBank }, async () => {
  await bootApp();
  await importDemoBank();
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 34, 'the user already has the demo bank');

  const text = await readText('pyq/mymppsc-pyq-bank.json');
  const analysis = await m.importer.analyseBankFile(text, { filename: 'mymppsc-pyq-bank.json' });
  await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });

  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 605, '34 + 571, nothing overwritten');
  assert.ok(await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-001'), 'the pre-existing question is untouched');
  assert.ok(await m.db.get(m.constants.STORES.QUESTIONS, 'MPPSC-2019-001'), 'and the new one is there');
});

test('re-importing the same file adds nothing', { skip: !haveBank }, async () => {
  const text = await readText('pyq/mymppsc-pyq-bank.json');
  const analysis = await m.importer.analyseBankFile(text, { filename: 'mymppsc-pyq-bank.json' });
  assert.equal(analysis.comparison.newQuestions, 0);
  assert.equal(analysis.comparison.identicalRecords, 571, 'every record matches what is already stored');
  assert.equal(analysis.comparison.changedRecords, 0, 'nothing would be overwritten');
  const result = await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  assert.equal(result.stats.questionsAdded, 0);
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 605);
});
