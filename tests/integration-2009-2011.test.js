import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { append2009to2011 } from '../tools/classify/append-2009-2011.mjs';
import { loadTaxonomy } from '../tools/classify/taxonomy.mjs';
import { validateBank } from '../js/core/validate.js';

const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

test('complete PDF-derived questions integrate without changing prior records, keys or source wording', async () => {
  execFileSync('python3', ['tools/classify-2009-2011-final.py', '--check']);
  const bank = await read('data/pyq/mymppsc-pyq-bank.json');
  const oldQuestions = bank.questions.filter((q) => q.year >= 2012);
  const oldPapers = bank.papers.filter((p) => p.year >= 2012);
  assert.equal(hash(oldQuestions), 'a4896e24a9faca0b67927385095373bc1e45a49d7d72ecc8c990bcf8fadfb967');
  assert.equal(hash(oldPapers), '9512bea56b3718080f9b56d6e3bcef11bd0d65c9eb671947708298a5a50a1e14');
  const inputs = {};
  for (const year of [2009, 2010, 2011]) inputs[year] = {
    source: await read(`data/pyq/source/2009-2011/pdf-transcription-${year}.json`),
    labels: await read(`data/pyq/source/2009-2011/final-taxonomy-${year}.json`),
    review: await read(`data/pyq/source/2009-2011/answer-review-${year}.json`),
  };
  const candidate = { questions: structuredClone(oldQuestions), papers: structuredClone(oldPapers) };
  const taxonomy = await loadTaxonomy();
  assert.equal(append2009to2011(candidate, inputs, taxonomy), 384);
  assert.deepEqual(candidate.questions, bank.questions);
  assert.deepEqual(candidate.papers, bank.papers);
  assert.throws(() => append2009to2011(candidate, inputs, taxonomy), /already exists/);
  for (const [year, count, original] of [[2009, 146, 150], [2010, 120, 120], [2011, 118, 120]]) {
    const paper = bank.papers.find((p) => p.year === year);
    const questions = bank.questions.filter((q) => q.year === year);
    assert.equal(questions.length, count);
    assert.equal(paper.original_question_count, original);
    assert.deepEqual(paper.question_order, questions.map((q) => q.id));
    assert.equal(paper.scoring.rules_known, false);
    for (const q of questions) {
      const source = inputs[year].source.questions.find((r) => r.id === q.id).language_variants.en;
      assert.equal(q.language_variants.en.question_text, source.question_text);
      assert.deepEqual(q.language_variants.en.options, source.options);
      assert.equal(q.language_variants.en.instructions, source.instructions ?? null);
      assert.deepEqual(Object.keys(q.language_variants), ['en']);
      assert.deepEqual([q.subject, q.topic, q.subtopic], Object.values(inputs[year].labels.labels[q.id]));
      {
        const r = inputs[year].review.records.find(row => row.question_id === q.id);
        assert.ok(r);
        if (r.status === 'supported') {
          assert.deepEqual(q.supplied_answer.answer, [r.answer]);
          assert.equal(q.answer_key_status, 'unofficial');
          assert.equal(q.explanation.correct_reasoning, r.reasoning);
        } else {
          assert.equal(q.supplied_answer.answer, null);
          assert.equal(q.dispute.status, 'unresolved');
          assert.equal(q.dispute.is_disputed, r.status === 'disputed');
        }
      }
    }
  }
  const incomplete = await read('data/pyq/source/2009-2011/incomplete-questions.json');
  assert.deepEqual(incomplete.questions.map((q) => q.id), ['MPPSC-2009-075', 'MPPSC-2009-076', 'MPPSC-2009-077', 'MPPSC-2009-078', 'MPPSC-2011-007', 'MPPSC-2011-038']);
  for (const q of incomplete.questions) assert.ok(!bank.questions.some((row) => row.id === q.id));
  const report = validateBank(bank);
  assert.equal(report.fatal.length, 0);
  assert.equal(report.errors.length, 0);
  assert.equal(report.rejected.length, 0);
});
