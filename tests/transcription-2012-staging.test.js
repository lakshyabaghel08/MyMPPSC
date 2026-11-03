import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { append2012 } from '../tools/classify/append-2012.mjs';
import { loadTaxonomy } from '../tools/classify/taxonomy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));

test('2012 staging is source-derived, bilingual, keyless and collision-free', async () => {
  execFileSync('python3', ['tools/transcribe-2012-paper.py', '--check'], { cwd: root });
  const data = await readJson('data/pyq/source/2012-recovery/transcription-staging.json');
  const bank = await readJson('data/pyq/mymppsc-pyq-bank.json');
  assert.equal(data.questions.length, 100);
  const baselineIds = new Set(bank.questions.filter((q) => q.year > 2012).map((q) => q.id));
  for (const [i, q] of data.questions.entries()) {
    assert.equal(q.id, `MPPSC-2012-${String(i + 1).padStart(3, '0')}`);
    assert.equal(q.question_number, i + 1);
    assert.equal(baselineIds.has(q.id), false);
    assert.deepEqual(Object.keys(q.language_variants).sort(), ['en', 'hi']);
    for (const variant of Object.values(q.language_variants)) {
      assert.ok(variant.question_text);
      assert.deepEqual(variant.options.map((o) => o.key), ['A', 'B', 'C', 'D']);
      assert.ok(variant.options.every((o) => o.text));
      assert.ok(variant.options.every((o) => !/\n\d{1,2}$/.test(o.text)), 'page numbers must not leak into options');
    }
    assert.equal(q.supplied_answer, undefined);
    assert.equal(q.verified_answer, undefined);
    assert.equal(q.explanation, undefined);
  }
  const byNum = (n) => data.questions[n - 1].language_variants.en;
  assert.match(byNum(31).options[2].text, /universal adult franchise/);
  assert.equal(byNum(96).options[1].text, 'The whole of India except the scheduled areas');
  assert.equal(byNum(96).options[2].text, 'The whole of India except the state of Jammu & Kashmir');
  assert.equal(byNum(96).options[3].text, 'The whole of India except the union territories of Goa, Daman and Diu');
  assert.equal(byNum(64).options[3].text, 'Both (A) and (B)');
  assert.deepEqual(byNum(56).options.map((o) => o.text), ['1', '2', '3', '4']);
});

test('2012 integration preserves the previous bank and reproduces every source variant', async () => {
  const bank = await readJson('data/pyq/mymppsc-pyq-bank.json');
  const source = await readJson('data/pyq/source/2012-recovery/transcription-staging.json');
  const labels = await readJson('data/pyq/source/2012-recovery/taxonomy-2012.json');
  const reassessment = await readJson('data/pyq/source/2012-recovery/answer-reassessment-2012.json');
  const oldQuestions = bank.questions.filter((q) => q.year > 2012);
  const oldPapers = bank.papers.filter((p) => p.year > 2012);
  const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  assert.equal(hash(oldQuestions), 'f8b865b0debf8db23e5fbe22fae46d187d58c47819e3925fd1135eaf185bf53a');
  assert.equal(hash(oldPapers), '9c05c5d142bdfc3e0b83f53b72c9970c4ca619ed246f5dc4abb1368ee98d84fd');
  const candidate = { questions: structuredClone(oldQuestions), papers: structuredClone(oldPapers) };
  const taxonomy = await loadTaxonomy();
  assert.equal(append2012(candidate, source, labels, taxonomy, reassessment), 100);
  assert.deepEqual(candidate.questions, bank.questions.filter((q) => q.year >= 2012));
  assert.deepEqual(candidate.papers, bank.papers.filter((p) => p.year >= 2012));
  assert.throws(() => append2012(candidate, source, labels, taxonomy, reassessment), /already exists/);
  const paper = bank.papers.find((p) => p.year === 2012);
  assert.equal(paper.scoring.rules_known, false);
  assert.deepEqual(paper.question_order, source.questions.map((q) => q.id));
  for (const q of bank.questions.filter((q) => q.year === 2012)) {
    const expected = source.questions[q.question_number - 1];
    for (const lang of ['hi', 'en']) {
      assert.equal(q.language_variants[lang].question_text, expected.language_variants[lang].question_text);
      assert.deepEqual(q.language_variants[lang].options, expected.language_variants[lang].options);
    }
    assert.equal(q.supplied_answer.answer, null);
    const r = reassessment.records[q.question_number - 1];
    assert.equal(q.answer_key_status, r.status === 'disputed' ? 'disputed' : 'missing');
    if (r.status === 'verified') {
      assert.deepEqual(q.verified_answer.answer, [r.proposed_answer]);
      assert.equal(q.explanation.correct_reasoning, r.reasoning);
    } else {
      assert.equal(q.verified_answer, undefined);
      assert.equal(q.explanation, null);
      assert.equal(q.dispute.status, 'unresolved');
    }
  }
});


test('2012 append rejects missing or corrupt reassessment without modifying the bank', async () => {
  const source = await readJson('data/pyq/source/2012-recovery/transcription-staging.json');
  const labels = await readJson('data/pyq/source/2012-recovery/taxonomy-2012.json');
  const review = await readJson('data/pyq/source/2012-recovery/answer-reassessment-2012.json');
  const taxonomy = await loadTaxonomy();
  for (const mutate of [
    () => undefined,
    () => { const r = structuredClone(review); r.records.pop(); return r; },
    () => { const r = structuredClone(review); r.records[3].question_id = r.records[0].question_id; return r; },
    () => { const r = structuredClone(review); r.records[0].proposed_answer = 'Z'; return r; },
    () => { const r = structuredClone(review); r.records[0].sources = []; return r; },
  ]) {
    const bank = { questions: [], papers: [] };
    assert.throws(() => append2012(bank, source, labels, taxonomy, mutate()), /2012/);
    assert.deepEqual(bank, { questions: [], papers: [] });
  }
});
