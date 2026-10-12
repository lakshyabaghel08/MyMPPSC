/**
 * pyq-bank.test.js — the real 2013–2024 PYQ bank, through the real importer.
 *
 * This suite is deliberately isolated: bootApp() gives every run a fresh
 * in-memory IndexedDB and an empty localStorage, so nothing here can touch a
 * user's own data. What it proves is that the bank produced by
 * tools/classify-bank.mjs from data/pyq/source/MPPSC_PYQ_intake.json is
 * accepted by the app, arrives complete, and keeps the source's answer
 * semantics — including the eight questions the source left without a key, which a
 * committed review file resolves and nothing else may.
 *
 * If data/pyq/mymppsc-pyq-bank.json is absent the suite skips rather than
 * fails, so a fresh clone without the built bank still passes `npm test`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { bootApp, readJson, readText, dataPath, importDemoBank } from './helpers.mjs';
import { parseAnswerReviews } from '../tools/classify/answer-review.mjs';

const BANK_PATH = dataPath('pyq', 'mymppsc-pyq-bank.json');
const INTAKE_PATH = dataPath('pyq', 'source', 'MPPSC_PYQ_intake.json');
const haveBank = existsSync(BANK_PATH) && existsSync(INTAKE_PATH);

const m = await bootApp();

test('the real PYQ bank and its source intake are both present', { skip: !haveBank && 'bank not built yet' }, () => {
  assert.ok(haveBank, 'run tools/classify-bank.mjs first');
});

test('the app accepts the real bank and imports all 1,171 questions', { skip: !haveBank }, async () => {
  const text = await readText('pyq/mymppsc-pyq-bank.json');
  const analysis = await m.importer.analyseBankFile(text, { filename: 'mymppsc-pyq-bank.json' });
  assert.equal(analysis.stage, 'ready', `the importer refused the bank: ${analysis.fatalMessage}`);
  assert.equal(analysis.report.fatal.length, 0);
  assert.equal(analysis.report.errors.length, 0);
  assert.equal(analysis.report.rejected.length, 0, 'no record is rejected');
  assert.equal(analysis.report.meta.demoFlag, false, 'this is real data, not a demo fixture');
  assert.equal(analysis.report.stats.questions, 1171);
  assert.equal(analysis.report.stats.papers, 12);

  const result = await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  assert.equal(result.stats.questionsAdded, 1171);
  assert.equal(result.stats.papersAdded, 12);
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1171);
  assert.equal(m.appState.questionIndex.size, 1171, 'the index holds every question');

  const history = await m.importer.importHistory();
  assert.equal(history[0].bank_id, 'mppsc-prelims-paper1-2019-2024');
  assert.equal(history[0].is_demonstration, false);
});

test('every source record arrives, with its id, year and paper intact', { skip: !haveBank }, async () => {
  const source = await readJson('pyq/source/MPPSC_PYQ_intake.json');
  assert.equal(source.questions.length, 571);
  // The app-facing bank renames the extraction's paper ids (`…-GS1-BOOK` →
  // `…-P1`); question ids never change, and the mapping is one-to-one.
  const cleanPaperId = (id) => String(id).replace(/-GS(II|I|2|1)-BOOK$/i, (_m, code) => `-P${/^(II|2)$/i.test(String(code)) ? '2' : '1'}`);
  const paperIds = new Set(source.questions.map((q) => q.paper_id));
  assert.equal(new Set([...paperIds].map(cleanPaperId)).size, paperIds.size, 'paper ids stay distinct');
  // The committed review file is the one thing allowed to supply an answer the
  // extraction did not print, so those ids are checked against it instead.
  const resolved = new Set(parseAnswerReviews(await readText('pyq/reviewed-answers.jsonl')).resolutions.map((r) => r.id));
  for (const q of source.questions) {
    const meta = m.appState.questionIndex.get(q.id);
    assert.ok(meta, `${q.id} is missing from the imported bank`);
    assert.equal(meta.paper_id, cleanPaperId(q.paper_id));
    assert.equal(meta.question_number, q.question_number);
    const stored = await m.db.get(m.constants.STORES.QUESTIONS, q.id);
    assert.equal(stored.language_variants.en.question_text, q.en.question_text, `${q.id}: question text must be verbatim`);
    assert.deepEqual(
      stored.language_variants.en.options.map((o) => [o.key, o.text]),
      (q.en.options || []).map((o) => [o.key, o.text]),
      `${q.id}: options must be verbatim`,
    );
    if (resolved.has(q.id)) {
      assert.equal(q.answer, undefined, `${q.id}: the extraction printed no key for it`);
      continue;
    }
    assert.deepEqual(stored.supplied?.answer ?? null, q.answer ?? null, `${q.id}: the printed key must not change`);
  }
});

test('the eight questions the source left keyless come from the committed review file', { skip: !haveBank }, async () => {
  const bank = await readJson('pyq/mymppsc-pyq-bank.json');
  const review = parseAnswerReviews(await readText('pyq/reviewed-answers.jsonl'));
  assert.equal(review.malformed.length, 0, 'the review file itself must parse cleanly');
  assert.equal(review.resolutions.length, 8, 'it covers exactly the eight the source left keyless');

  const byId = new Map(bank.questions.map((q) => [q.id, q]));
  for (const resolution of review.resolutions) {
    const q = byId.get(resolution.id);
    assert.ok(q, `${resolution.id}: the review file names a question that is not in the bank`);
    assert.deepEqual([...q.supplied_answer.answer].sort(), [...resolution.answer].sort(), `${q.id}: the bank carries the reviewed answer`);
    assert.equal(q.answer_key_status, 'supplied', `${q.id}: labelled as supplied by review, never as a printed key`);
    assert.ok(q.explanation, `${q.id}: the reasoning that goes with it is stored too`);
    const meta = m.appState.questionIndex.get(q.id);
    assert.equal(meta.hasSuppliedAnswer, true, `${q.id}: the app can score it`);
    assert.ok(!q.verified_answer?.answer?.length, `${q.id}: it is not presented as a verified answer`);
  }

  // Nothing may quietly invent a key either: a question outside the review file
  // keeps whatever the source printed, and the source printed none of these.
  assert.equal(bank.questions.filter((x) => !x.supplied_answer?.answer?.length).length, 0, 'every question in the shipped bank is keyed');
});

test('answers are stored without provenance and none is marked verified', { skip: !haveBank }, async () => {
  const bank = await readJson('pyq/mymppsc-pyq-bank.json');
  const withKey = bank.questions.filter((q) => q.supplied_answer?.answer?.length);
  assert.equal(withKey.length, 1171, 'every question carries a key once the review file is applied');
  // No source claim survives into the app-facing bank: no provenance block, no
  // per-question source references, no key-issue labels ('unofficial'/'final').
  assert.equal('provenance' in bank, false, 'the bank carries no provenance block');
  assert.equal(bank.questions.filter((q) => q.source_reference).length, 0, 'no question carries a source reference');
  assert.equal(bank.questions.filter((q) => q.supplied_answer?.source).length, 0, 'no stored answer names a source');
  const statuses = new Set(bank.questions.map((q) => q.answer_key_status));
  assert.deepEqual([...statuses].sort(), ['supplied'], 'the review pass resolved the last missing keys');
  assert.equal(bank.questions.filter((q) => q.verified_answer?.answer?.length).length, 0);
  const meta = m.appState.questionIndex.get('MPPSC-2019-001');
  assert.equal(meta.answerStatus, 'supplied');
  assert.equal(meta.hasSuppliedAnswer, true);
});

test('classification survived the import, and every label is a real taxonomy node', { skip: !haveBank }, async () => {
  const index = [...m.appState.questionIndex.values()];
  const classified = index.filter((q) => q.subject);
  const current = index.filter((q) => Number(q.year) >= 2019);
  const historical = index.filter((q) => Number(q.year) >= 2013 && Number(q.year) <= 2018);
  assert.equal(index.length, 1171);
  assert.equal(classified.length, 1171, 'all questions now have a supported subject');
  assert.equal(index.filter((q) => !q.subject).length, 0);
  assert.equal(current.length, 571);
  assert.equal(current.filter((q) => q.subject).length, 571, 'all existing current-bank classifications are preserved');
  assert.equal(historical.length, 600);
  assert.equal(historical.filter((q) => q.subject).length, 600, 'all historical records have an audited subject');
  assert.equal(index.filter((q) => q.topic).length, 1162, 'topic-only gaps are retained where no topic is supported');
  assert.equal(index.filter((q) => q.subtopic).length, 1076, 'unsupported subtopics are not fabricated');
  assert.equal(m.appState.questionIndex.get('MPPSC-2019-001').subject, 'Polity');

  // Classification provenance is audit-only. The focused remediation adds
  // agent-assisted, taxonomy-validated labels to the reviewed sidecar; the older
  // pipeline reports are explicitly marked as pre-remediation snapshots. The
  // app-facing bank carries labels only, never internal provenance or confidence.
  const bank = await readJson('pyq/mymppsc-pyq-bank.json');
  const review = await readJson('pyq/review-report.json');
  assert.equal(bank.questions.some((q) => 'classification_source' in q || 'classification_confidence' in q), false, 'no label provenance or confidence in the shipped file');
  assert.equal(review.report_status, 'pre_remediation_integration_snapshot', 'the older pipeline report is clearly historical');
  assert.equal(review.totals.ai_labels_applied, 0, 'the pre-remediation snapshot recorded no provider-classifier output');
  assert.equal(review.totals.reviewed_labels_applied, 244, 'the snapshot records the original reviewed-label count');
  assert.equal('explanation_status' in bank.questions[0], false, 'and no explanation review state either');
  assert.equal(bank.questions.some((q) => q.explanation && typeof q.explanation === 'object' && ('status' in q.explanation || 'reviewed_by' in q.explanation)), false, 'stored explanations carry their text and nothing else');

  // Every supplied level is a real taxonomy node; a supported subject-only
  // label remains valid without fabricating a topic to fill the gap.
  const taxonomy = await readJson('taxonomy/mppsc-taxonomy.json');
  const subjects = new Map(taxonomy.subjects.map((s) => [s.subject, new Map(s.topics.map((t) => [t.topic, t.subtopics]))]));
  for (const q of classified) {
    assert.ok(subjects.has(q.subject), `${q.subject} is not a taxonomy subject`);
    if (q.topic) {
      assert.ok(subjects.get(q.subject).has(q.topic), `${q.subject} / ${q.topic} is not in the taxonomy`);
      if (q.subtopic) assert.ok(subjects.get(q.subject).get(q.topic).includes(q.subtopic));
    } else {
      assert.equal(q.subtopic ?? null, null, `${q.id} cannot have a subtopic without a topic`);
    }
  }
  for (const q of bank.questions) {
    if (q.subtopic) assert.ok(subjects.get(q.subject)?.get(q.topic)?.includes(q.subtopic), `${q.id}: ${q.subtopic} is not in the taxonomy`);
  }
});

test('importing the PYQ bank does not disturb a bank the user already has', { skip: !haveBank }, async () => {
  await bootApp();
  await importDemoBank();
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 34, 'the user already has the demo bank');

  const text = await readText('pyq/mymppsc-pyq-bank.json');
  const analysis = await m.importer.analyseBankFile(text, { filename: 'mymppsc-pyq-bank.json' });
  await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });

  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1205, '34 + 1,171, nothing overwritten');
  assert.ok(await m.db.get(m.constants.STORES.QUESTIONS, 'DEMO-P1-001'), 'the pre-existing question is untouched');
  assert.ok(await m.db.get(m.constants.STORES.QUESTIONS, 'MPPSC-2019-001'), 'and the new one is there');
});

test('re-importing the same file adds nothing', { skip: !haveBank }, async () => {
  const text = await readText('pyq/mymppsc-pyq-bank.json');
  const analysis = await m.importer.analyseBankFile(text, { filename: 'mymppsc-pyq-bank.json' });
  assert.equal(analysis.comparison.newQuestions, 0);
  assert.equal(analysis.comparison.identicalRecords, 1171, 'every record matches what is already stored');
  assert.equal(analysis.comparison.changedRecords, 0, 'nothing would be overwritten');
  const result = await m.importer.executeImport(analysis, { conflictPolicy: 'skip' });
  assert.equal(result.stats.questionsAdded, 0);
  assert.equal(await m.db.count(m.constants.STORES.QUESTIONS), 1205);
});
