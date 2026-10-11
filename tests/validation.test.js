/**
 * validation.test.js — Schema and import validation.
 *
 * Covers: valid bank, malformed JSON, unsupported schema version, duplicate ids,
 * invalid answer references, unmatched paper metadata, missing options, missing
 * answers and bilingual pairing rules.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, readText, readJson } from './helpers.mjs';

const m = await bootApp();

test('demonstration bank validates with the expected warnings and no fatals', async () => {
  const text = await readText('demo/demo-bank.json');
  const analysis = await m.importer.analyseBankFile(text, { filename: 'demo-bank.json' });
  const { report } = analysis;
  assert.equal(report.fatal.length, 0, 'demo bank must not have fatal problems');
  assert.ok(report.questions.length >= 34, `expected at least 34 importable questions, got ${report.questions.length}`);
  assert.equal(report.stats.papers, 3);
  assert.equal(report.duplicateIds.length, 0);
  assert.equal(report.nearDuplicates.length > 0, true, 'demo bank contains a deliberate near-duplicate pair');
  assert.ok(report.warnings.some((w) => w.code === 'question_count_mismatch'), 'incomplete paper must be flagged');
  assert.ok(report.infos.some((i) => i.code === 'demonstration_bank'), 'demonstration banks must be labelled');
  assert.equal(report.stats.missingAnswers, 1, 'exactly one demo question has no answer key entry');
  assert.equal(report.stats.disputedAnswers, 1, 'exactly one demo question has a disputed key');
  assert.equal(report.stats.verifiedAnswers, 1);
});

test('malformed JSON is rejected safely with a readable message', async () => {
  const analysis = await m.importer.analyseBankFile('{ "schema_version": "1.0.0", questions: [ }', { filename: 'broken.json' });
  assert.equal(analysis.stage, 'error');
  assert.match(analysis.fatalMessage, /not valid JSON/i);
  assert.equal(analysis.report, null);
});

test('unsupported schema major version blocks the import', async () => {
  const analysis = await m.importer.analyseBankObject({ schema_version: '2.0.0', bank_id: 'x', papers: [], questions: [] });
  assert.equal(analysis.stage, 'blocked');
  assert.ok(analysis.report.fatal.some((f) => f.code === 'unsupported_schema_major'));
});

test('record-level problems are reported, not silently dropped', async () => {
  const fixture = await readJson('examples/invalid-records-fixture.json');
  const analysis = await m.importer.analyseBankObject(fixture, { filename: 'invalid-records-fixture.json' });
  const { report } = analysis;
  const codes = report.errors.map((e) => e.code);
  assert.ok(codes.includes('duplicate_question_id'), 'duplicate ids must be an error');
  assert.ok(codes.includes('invalid_answer_reference'), 'answer referencing a non-existent option must be an error');
  assert.ok(codes.includes('too_few_options'), 'single-option questions must be an error');
  assert.ok(
    report.warnings.some((w) => w.code === 'paper_metadata_missing'),
    'unmatched paper metadata must warn and create a placeholder',
  );
  assert.equal(report.rejected.length, 4, 'four records should be rejected: duplicate id, invalid answer reference, single option, and null question text');
  const rejectionReasons = report.rejected.map((r) => r.reason).join(' | ');
  assert.match(rejectionReasons, /Duplicate id/);
  assert.match(rejectionReasons, /does not match any option key/);
  assert.match(rejectionReasons, /only 1 option/);
  assert.match(rejectionReasons, /No usable language variant/);
  assert.equal(report.questions.length, 2, 'the valid records are still importable');
  assert.equal(report.placeholderPapers.length, 1);
  const placeholder = report.papers.find((p) => p.placeholder);
  assert.equal(placeholder.scoring.rules_known, false, 'placeholder paper must not invent scoring rules');
  assert.equal(placeholder.duration_minutes, null);
});

test('a question without any language variant is rejected', () => {
  const { question, issues } = m.schema.normaliseQuestion({ id: 'X-1', paper_id: 'P', question_number: 1 }, {});
  void question;
  assert.ok(issues.some((i) => i.code === 'missing_language_variant' && i.severity === 'error'));
  const report = m.validate.validateBank({
    schema_version: '1.0.0',
    bank_id: 'no-variant',
    papers: [{ paper_id: 'P', exam: 'E', year: 2020, original_question_count: 1, scoring: { rules_known: true, marks_per_correct: 2 } }],
    questions: [{ id: 'X-1', paper_id: 'P', question_number: 1 }],
  });
  assert.equal(report.questions.length, 0, 'the record must not be imported');
  assert.equal(report.rejected.length, 1);
  assert.ok(question.id === 'X-1', 'the normaliser still returns the record so the problem can be described');
});

test('a record with no id at all is reported with its position', () => {
  const report = m.validate.validateBank({
    schema_version: '1.0.0',
    bank_id: 'no-id',
    papers: [{ paper_id: 'P', exam: 'E', year: 2020, original_question_count: 1, scoring: { rules_known: true, marks_per_correct: 2 } }],
    questions: [{ paper_id: 'P', question_number: 1, language_variants: { en: { question_text: 'Q?', options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }] } } }],
  });
  assert.ok(report.errors.some((e) => e.code === 'missing_id'));
  assert.equal(report.questions.length, 0);
});

test('bilingual variants share one question id and are not counted twice', async () => {
  const text = await readText('demo/demo-bank.json');
  const analysis = await m.importer.analyseBankFile(text);
  const q = analysis.report.questions.find((x) => x.id === 'DEMO-P1-001');
  assert.ok(q.language_variants.en && q.language_variants.hi, 'both language variants must live under one id');
  const hindi = analysis.report.questions.filter((x) => x.language_variants.hi);
  assert.ok(hindi.length > 0);
  const ids = analysis.report.questions.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  assert.equal(analysis.report.stats.bilingual, 17, 'seventeen demo questions carry both languages under one id');
});

test('original wording is preserved verbatim and never translated', async () => {
  const text = await readText('demo/demo-bank.json');
  const raw = JSON.parse(text);
  const analysis = await m.importer.analyseBankFile(text);
  const rawQ = raw.questions.find((q) => q.id === 'DEMO-P1-001');
  const imported = analysis.report.questions.find((q) => q.id === 'DEMO-P1-001');
  assert.equal(imported.language_variants.en.question_text, rawQ.language_variants.en.question_text);
  assert.deepEqual(imported.language_variants.hi.options, rawQ.language_variants.hi.options);
  assert.match(imported.language_variants.hi.question_text, /मध्य प्रदेश/);
});

test('missing information is explicit, never invented', () => {
  const { question } = m.schema.normaliseQuestion(
    {
      id: 'Y-1',
      paper_id: 'P',
      question_number: 1,
      language_variants: { en: { question_text: 'Question?', options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }] } },
    },
    {},
  );
  assert.equal(question.supplied.answer, null);
  assert.equal(question.supplied.status, 'missing');
  assert.equal(question.verified, null);
  assert.equal(question.explanation, null);
  assert.equal(question.classification.subject, null);
  assert.equal(question.classification.isUnclassified, true);
});

test('unsupported option keys in the key are rejected as errors', () => {
  const { issues } = m.schema.normaliseQuestion(
    {
      id: 'Y-2',
      paper_id: 'P',
      question_number: 2,
      language_variants: { en: { question_text: 'Q?', options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }] } },
      supplied_answer: { answer: ['Q'], status: 'final' },
    },
    {},
  );
  assert.ok(issues.some((i) => i.code === 'invalid_answer_reference' && i.severity === 'error'));
  assert.ok(issues.some((i) => i.code === 'invalid_answer_reference'));
});

test('duplicate paper ids are reported and only the first is used', () => {
  const bank = {
    schema_version: '1.0.0',
    bank_id: 'dup-paper',
    papers: [
      { paper_id: 'P1', exam: 'E', year: 2020, original_question_count: 1, scoring: { rules_known: true, marks_per_correct: 2 } },
      { paper_id: 'P1', exam: 'E', year: 2020, original_question_count: 1, scoring: { rules_known: true, marks_per_correct: 2 } },
    ],
    questions: [
      {
        id: 'Q1',
        paper_id: 'P1',
        question_number: 1,
        language_variants: { en: { question_text: 'Q?', options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }] } },
        supplied_answer: { answer: ['A'], status: 'final' },
      },
    ],
  };
  const report = m.validate.validateBank(bank);
  assert.ok(report.errors.some((e) => e.code === 'duplicate_paper_id'));
  assert.equal(report.papers.length, 1);
});

test('question order is preserved and gaps are reconstructed with a warning', () => {
  const bank = {
    schema_version: '1.0.0',
    bank_id: 'order-test',
    papers: [
      {
        paper_id: 'P1',
        exam: 'E',
        year: 2021,
        original_question_count: 3,
        scoring: { rules_known: true, marks_per_correct: 2 },
        question_order: ['Q3', 'Q1'],
      },
    ],
    questions: [3, 1, 2].map((n) => ({
      id: `Q${n}`,
      paper_id: 'P1',
      question_number: n,
      language_variants: { en: { question_text: `Question ${n}?`, options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }] } },
      supplied_answer: { answer: ['A'], status: 'final' },
    })),
  };
  const report = m.validate.validateBank(bank);
  assert.deepEqual(report.papers[0].question_order, ['Q3', 'Q1', 'Q2'], 'declared order first, then reconstructed entries by original number');
  assert.ok(report.warnings.some((w) => w.code === 'order_incomplete'));
  assert.equal(report.papers[0].original_order_preserved, false);
});

test('identical text under different ids is flagged as duplicate content', () => {
  const q = (id) => ({
    id,
    paper_id: 'P1',
    question_number: 1,
    language_variants: { en: { question_text: 'Same question text?', options: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }] } },
    supplied_answer: { answer: ['A'], status: 'final' },
  });
  const bank = {
    schema_version: '1.0.0',
    bank_id: 'dup-content',
    papers: [{ paper_id: 'P1', exam: 'E', year: 2020, original_question_count: 2, scoring: { rules_known: true, marks_per_correct: 2 } }],
    questions: [q('A1'), q('A2')],
  };
  const report = m.validate.validateBank(bank);
  assert.ok(report.warnings.some((w) => w.code === 'identical_question_content'));
});
