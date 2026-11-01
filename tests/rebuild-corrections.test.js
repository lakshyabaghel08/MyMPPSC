/**
 * rebuild-corrections.test.js — a clean rebuild must not undo the audits.
 *
 * The bank is generated from the extraction, and the extraction carries the
 * paper's own answer key. Everything the answer audits decided lives outside it:
 * corrected keys, repaired option texts, rewritten explanations and dispute
 * flags. Before this suite, a `node tools/classify-bank.mjs …` rebuild silently
 * restored the printed keys — the exact failure mode the audits exist to prevent.
 *
 * These tests pin the pipeline closed:
 *
 *   1. the declared corrections reconcile with the data files and with the
 *      printed keys the audits recorded (nothing declared twice, nothing orphaned);
 *   2. applying them twice is a no-op the second time (applied exactly once);
 *   3. a drifted `from` is a rejection, and a rejection fails the build;
 *   4. a full clean rebuild reproduces the committed bank — including 2021-010,
 *      the 2020 and 2017 corrections and the 100-question papers — and is deterministic.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataPath } from './helpers.mjs';
import { runPipeline } from '../tools/classify-bank.mjs';
import { parseReviewedCorrections, applyReviewedCorrections } from '../tools/classify/reviewed-corrections.mjs';
import { loadCombinedHistoricalIntake } from '../tools/classify/historical-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));
const readJsonl = async (...parts) => (await readFile(dataPath(...parts), 'utf8'))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const [correctionsFile, explanationsFile, disputesFile, modelFile, bank, baseline, audit2020, audit2019, audit2017] = await Promise.all([
  readJson('pyq', 'reviewed-corrections.json'),
  readJson('pyq', 'reviewed-explanations.json'),
  readJson('pyq', 'reviewed-disputes.json'),
  readJson('pyq', 'model-questions.json'),
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJsonl('pyq', 'quality-audit', 'question-audit-baseline.jsonl'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2020.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2019.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2017.json'),
]);

const bundle = parseReviewedCorrections({
  corrections: correctionsFile,
  explanations: explanationsFile,
  disputes: disputesFile,
});

const bankById = new Map(bank.questions.map((q) => [q.id, q]));

test('the corrections reconcile: declared, applied and stored agree', () => {
  // The declaration lists and the prose file name the same questions, both ways.
  assert.deepEqual(
    Object.keys(explanationsFile.explanations).sort(),
    correctionsFile.narrative_rewritten.slice().sort(),
    'reviewed-explanations.json and narrative_rewritten name the same ids',
  );
  // Every declared correction names a question that exists in the shipped bank.
  for (const id of Object.keys(correctionsFile.answer_corrections)) {
    assert.ok(bankById.has(id), `${id}: answer correction names a shipped question`);
  }
  for (const id of Object.keys(correctionsFile.option_corrections)) {
    assert.ok(bankById.has(id), `${id}: option correction names a shipped question`);
  }
  for (const id of correctionsFile.narrative_rewritten) {
    assert.ok(bankById.has(id), `${id}: explanation rewrite names a shipped question`);
  }
  for (const id of correctionsFile.option_reasoning_complete) {
    assert.ok(bankById.has(id), `${id}: completeness declaration names a shipped question`);
  }
  for (const id of Object.keys(disputesFile.disputes)) {
    assert.ok(bankById.has(id), `${id}: dispute block names a shipped question`);
  }
  // Every dispute block in the shipped bank is declared, so a rebuild restores it.
  const shippedDisputes = bank.questions.filter((q) => q.dispute).map((q) => q.id).sort();
  assert.deepEqual(shippedDisputes, Object.keys(disputesFile.disputes).sort(), 'every shipped dispute block is declared');
  // And every shipped answer/option/explanation that a correction describes is in force.
  for (const [id, entry] of Object.entries(correctionsFile.answer_corrections)) {
    assert.deepEqual(bankById.get(id).supplied_answer.answer, entry.to, `${id}: the declared key is what shipped`);
  }
  for (const [id, byKey] of Object.entries(correctionsFile.option_corrections)) {
    for (const [key, entry] of Object.entries(byKey)) {
      assert.equal(bankById.get(id).language_variants.en.options.find((o) => o.key === key).text, entry.to, `${id} ${key}: the repair is what shipped`);
    }
  }
  for (const id of correctionsFile.narrative_rewritten) {
    assert.deepEqual(bankById.get(id).explanation, explanationsFile.explanations[id], `${id}: the reviewed prose is what shipped`);
  }
});

test('every correction quotes the printed key the audits recorded', () => {
  const printed2020 = new Map(audit2020.questions.map((r) => [r.id, r.printed_key]));
  const printed2019 = new Map(audit2019.questions.map((r) => [r.id, r.printed_key]));
  const printed2017 = new Map(audit2017.questions.map((r) => [r.id, r.printed_key]));
  const printed2124 = new Map(baseline.map((q) => [q.id, q.answer?.stored_answer ?? null]));
  for (const [id, entry] of Object.entries(correctionsFile.answer_corrections)) {
    const printed = printed2020.has(id) ? printed2020.get(id)
      : printed2019.has(id) ? printed2019.get(id)
      : printed2017.has(id) ? printed2017.get(id)
      : printed2124.get(id);
    assert.ok(printed, `${id}: the printed key is recorded in an audit record`);
    assert.deepEqual(entry.from, printed, `${id}: the declaration quotes the printed key`);
  }
  // The audits' own summaries must agree with the declarations beside them. The
  // 2021–2024 summary lists only the key that audit corrected (2021-010); the 16
  // earlier re-keys were re-derived and confirmed in that pass and are listed in
  // its report, so they are checked for presence rather than for provenance.
  const fromManifest = Object.keys(correctionsFile.answer_corrections).sort();
  assert.deepEqual(
    correctionsFile.final_audit_2020.corrected_ids.slice().sort(),
    fromManifest.filter((id) => id.startsWith('MPPSC-2020-')),
    'the 2020 audit summary lists exactly the 2020 corrections',
  );
  for (const id of correctionsFile.final_audit_2021_2024.corrected_ids) {
    assert.ok(fromManifest.includes(id), `${id}: the 2021–2024 audit summary names a declared correction`);
  }
  assert.deepEqual(correctionsFile.final_audit_2021_2024.corrected_ids, ['MPPSC-2021-010']);
  assert.ok(fromManifest.includes('MPPSC-2021-010'), 'the 2021 correction is carried too, not only 2020');
  assert.deepEqual(
    correctionsFile.final_audit_2017.corrected_ids.slice().sort(),
    fromManifest.filter((id) => id.startsWith('MPPSC-2017-')),
    'the 2017 audit summary lists exactly the 2017 corrections',
  );
  assert.deepEqual(
    correctionsFile.final_audit_2019.corrected_ids.slice().sort(),
    fromManifest.filter((id) => id.startsWith('MPPSC-2019-')),
    'the 2019 audit summary lists exactly the 2019 corrections',
  );
  assert.equal(fromManifest.length, 28, 'five 2020 keys, five 2019 keys, the seventeen declared for 2021–2024 and one for 2017 — the 2018 audit corrected no key');
});

test('a correction is applied once: a second application is a recorded no-op', () => {
  const intake = { questions: bank.questions.filter((q) => correctionsFile.narrative_rewritten.includes(q.id)).map((q) => structuredClone(q)) };
  const first = applyReviewedCorrections(intake, bundle, { deferIds: new Set(modelFile.questions.map((q) => q.id)) });
  assert.equal(first.rejected.length, 0, 'nothing is rejected on already-corrected data');
  assert.equal(first.applied.answers, 0, 'the keys are already corrected');
  assert.equal(first.applied.options, 0, 'the option texts are already repaired');
  assert.equal(first.applied.explanations, 0, 'the reviewed prose is recognised, not rewritten');
  assert.equal(
    first.already_applied.explanations + first.deferred.explanations.length,
    first.declared.narrative_rewritten,
    'every reviewed explanation is already in place',
  );
  assert.equal(first.applied.answers + first.already_applied.answers + first.deferred.answers.length, first.declared.answer_corrections);
  assert.equal(first.reconciled, true, 'applied + already applied + deferred accounts for every declaration');
  const snapshot = JSON.stringify(intake);
  const second = applyReviewedCorrections(intake, bundle, { deferIds: new Set(modelFile.questions.map((q) => q.id)) });
  assert.equal(JSON.stringify(intake), snapshot, 'a repeat application changes nothing');
  assert.deepEqual(second.rejected, []);
});

test('drifted data is rejected loudly, not overwritten', () => {
  const intake = { questions: bank.questions.map((q) => structuredClone(q)) };
  const drifted = intake.questions.find((q) => q.id === 'MPPSC-2021-010');
  drifted.supplied_answer = { answer: ['C'] };
  drifted.explanation = { correct_reasoning: 'placeholder' };
  const summary = applyReviewedCorrections(intake, bundle, { deferIds: new Set(modelFile.questions.map((q) => q.id)) });
  assert.equal(summary.ok, false, 'a key that is neither printed nor corrected is a rejection');
  const rejection = summary.rejected.find((r) => r.id === 'MPPSC-2021-010');
  assert.ok(rejection && /matches neither/.test(rejection.reason));
  assert.deepEqual(drifted.supplied_answer.answer, ['C'], 'the drifted value is left alone for a human to resolve');
  // A drifted option text is rejected the same way.
  const intake2 = { questions: bank.questions.map((q) => structuredClone(q)) };
  const opt = intake2.questions.find((q) => q.id === 'MPPSC-2020-047');
  opt.language_variants.en.options.find((o) => o.key === 'D').text = 'Lucknow (Uttar Pradesh)';
  const summary2 = applyReviewedCorrections(intake2, bundle, { deferIds: new Set(modelFile.questions.map((q) => q.id)) });
  assert.ok(summary2.rejected.some((r) => r.kind === 'option' && /neither the printed text nor the repair/.test(r.reason)));
  // Orphans are errors too: a correction may not point at a question that is gone.
  assert.throws(
    () => applyReviewedCorrections({ questions: [{ id: 'MPPSC-2021-010', supplied_answer: { answer: ['A'] } }] }, bundle),
    /answer correction names MPPSC-(2017|2019)-\d+(?:, which is not in the intake)/,
  );
});

test('the correction files cannot disagree with themselves', () => {
  // Prose without a declaration, or a declaration without prose.
  const missing = structuredClone(explanationsFile);
  delete missing.explanations['MPPSC-2021-010'];
  assert.throws(
    () => parseReviewedCorrections({ corrections: correctionsFile, explanations: missing, disputes: disputesFile }),
    /no reviewed prose for declared rewrite/,
  );
  const extra = structuredClone(explanationsFile);
  extra.explanations['MPPSC-1999-001'] = { correct_reasoning: 'x' };
  assert.throws(
    () => parseReviewedCorrections({ corrections: correctionsFile, explanations: extra, disputes: disputesFile }),
    /not declared in narrative_rewritten/,
  );
  // A corrected key whose prose still ticks the old letter.
  const contradictory = structuredClone(explanationsFile);
  contradictory.explanations['MPPSC-2020-032'].option_explanations = contradictory.explanations['MPPSC-2020-032'].option_explanations
    .map((row) => ({ ...row, is_correct: row.key === 'B' }));
  assert.throws(
    () => parseReviewedCorrections({ corrections: correctionsFile, explanations: contradictory, disputes: disputesFile }),
    /MPPSC-2020-032 corrected key D disagrees with the explanation/,
  );
});

test('a clean rebuild reproduces the shipped bank, corrections included', async () => {
  const [base, reviewedLabels, reviewedAnswers] = await Promise.all([
    readJson('pyq', 'source', 'MPPSC_PYQ_intake.json'),
    readFile(dataPath('pyq', 'reviewed-labels.jsonl'), 'utf8'),
    readFile(dataPath('pyq', 'reviewed-answers.jsonl'), 'utf8'),
  ]);
  const combined = await loadCombinedHistoricalIntake(base, path.join(root, 'data/pyq/source/2013-18'));
  const result = await runPipeline(combined.intake, {
    historicalSourceAudit: combined.audit,
    reviewedLabels,
    answerReviews: reviewedAnswers,
    answerReviewFile: 'data/pyq/reviewed-answers.jsonl',
    corrections: bundle,
    correctionFiles: {
      corrections: 'data/pyq/reviewed-corrections.json',
      explanations: 'data/pyq/reviewed-explanations.json',
      disputes: 'data/pyq/reviewed-disputes.json',
    },
    modelQuestions: modelFile,
  });

  assert.equal(result.correctionsSummary.rejected.length, 0, 'no correction was rejected during the rebuild');
  assert.equal(result.correctionsSummary.reconciled, true, 'every declaration was applied or already satisfied');
  assert.equal(result.correctionsSummary.applied.answers, 28, 'all 28 corrected keys were re-applied');
  assert.equal(
    result.correctionsSummary.applied.explanations + result.correctionsSummary.deferred.explanations.length,
    771,
    'all 771 reviewed explanations were restored',
  );
  assert.equal(result.modelSummary.added.length, 29, 'the 29 model questions were appended');

  const rebuilt = result.bank;
  assert.equal(rebuilt.questions.length, 1200);
  assert.equal(rebuilt.questions.filter((q) => Number(q.year) === 2020).length, 100, 'the 2020 paper still has 100 questions');
  assert.equal(rebuilt.questions.filter((q) => Number(q.year) === 2019).length, 100, 'the 2019 paper is complete too');
  for (const paper of rebuilt.papers) {
    assert.equal(paper.question_order.length, 100, `${paper.paper_id}: 100 questions in order`);
  }

  // Content equality with the shipped file, ignoring the two build stamps.
  const strip = (b) => {
    const copy = structuredClone(b);
    delete copy.generated_at;
    delete copy.app_compatibility;
    // Round-trip through JSON so build-time `undefined` fields compare the way
    // the written file does.
    return JSON.parse(JSON.stringify(copy));
  };
  const rebuiltById = new Map(strip(rebuilt).questions.map((q) => [q.id, q]));
  const rebuiltFlat = strip(rebuilt);
  const shipped = strip(bank);
  assert.deepEqual([...rebuiltById.keys()], shipped.questions.map((q) => q.id), 'same questions in the same order');
  assert.deepEqual(rebuiltFlat.papers, shipped.papers, 'same papers, same question order');
  for (const question of shipped.questions) {
    assert.deepEqual(rebuiltById.get(question.id), question, `${question.id}: the rebuild reproduces the shipped record`);
  }

  // Spot-checks that name the audits this suite exists to protect.
  const byId = rebuiltById;
  assert.deepEqual(byId.get('MPPSC-2021-010').supplied_answer.answer, ['A'], 'the 2021 phosphatase correction survives the rebuild');
  assert.deepEqual(byId.get('MPPSC-2020-008').supplied_answer.answer, ['D'], 'the 2020 Maharatna correction survives the rebuild');
  assert.deepEqual(byId.get('MPPSC-2019-027').supplied_answer.answer, ['C'], 'the 2019 re-appointment correction survives the rebuild');
  assert.deepEqual(byId.get('MPPSC-2019-046').supplied_answer.answer, ['D'], 'the 2019 karewa correction survives the rebuild');
  assert.deepEqual(byId.get('MPPSC-2019-097').supplied_answer.answer, ['D'], 'the 2019 highway correction survives the rebuild');
  assert.equal(byId.get('MPPSC-2018-010').language_variants.en.options.find((o) => o.key === 'D').text, 'Island of Lost Girls - Kunal Basu', 'the 2018 book-pair option repair survives the rebuild');
  assert.equal(byId.get('MPPSC-2018-078').language_variants.en.options.find((o) => o.key === 'A').text, 'Computer technology as modus operandi and intangibility of the environment', 'the 2018 stray-comma repair survives the rebuild');
  assert.equal(byId.get('MPPSC-2018-055').dispute?.status, 'unresolved', 'the 2018 multi-key flag survives the rebuild');
  assert.equal(byId.get('MPPSC-2018-100').explanation.option_explanations.length, 4, 'the 2018 prose travels with the rebuild');
  assert.equal(byId.get('MPPSC-2019-060').explanation.option_explanations.length, 4, 'the 2019 prose travels with the rebuild');
  assert.equal(byId.get('MPPSC-2020-047').language_variants.en.options.find((o) => o.key === 'D').text, 'Lucknow', 'the repaired option text survives');
  assert.equal(byId.get('MPPSC-2020-037').dispute?.status, 'unresolved', 'the 2020 ambiguity flag survives');
  assert.deepEqual(byId.get('MPPSC-2020-009').supplied_answer.answer, ['A'], 'a model question keeps its key');
});

test('two clean rebuilds produce byte-identical content', async () => {
  const base = await readJson('pyq', 'source', 'MPPSC_PYQ_intake.json');
  const [reviewedLabels, reviewedAnswers] = await Promise.all([
    readFile(dataPath('pyq', 'reviewed-labels.jsonl'), 'utf8'),
    readFile(dataPath('pyq', 'reviewed-answers.jsonl'), 'utf8'),
  ]);
  const options = {
    reviewedLabels,
    answerReviews: reviewedAnswers,
    corrections: bundle,
    modelQuestions: modelFile,
  };
  const first = await loadCombinedHistoricalIntake(base, path.join(root, 'data/pyq/source/2013-18'));
  const second = await loadCombinedHistoricalIntake(base, path.join(root, 'data/pyq/source/2013-18'));
  const a = await runPipeline(first.intake, { ...options, historicalSourceAudit: first.audit });
  const b = await runPipeline(second.intake, { ...options, historicalSourceAudit: second.audit });
  const strip = (bankJson) => {
    const copy = structuredClone(bankJson);
    delete copy.generated_at;
    return JSON.stringify(copy);
  };
  assert.equal(strip(a.bank), strip(b.bank), 'the pipeline is deterministic with corrections applied');
});
