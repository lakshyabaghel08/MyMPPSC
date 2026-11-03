import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { append2009to2011 } from '../tools/classify/append-2009-2011.mjs';
import { loadTaxonomy } from '../tools/classify/taxonomy.mjs';
const load = async p => JSON.parse(await readFile(p, 'utf8'));

test('2011 review matches the third-party answer list, keeps uncertainty unkeyed and flags paper identity', async () => {
  const bank = await load('data/pyq/mymppsc-pyq-bank.json');
  const review = await load('data/pyq/source/2009-2011/answer-review-2011.json');
  const raw = (await readFile('data/pyq/source/2009-2011/pdf-extracted-2011.txt', 'utf8')).split('ANSWERS').at(-1);
  const key = new Map([...raw.matchAll(/(\d+)\.\s*\(([A-D*])\)/g)].map(m => [Number(m[1]), m[2]]));
  assert.equal(key.size, 120);
  assert.match(bank.papers.find(p => p.year === 2011).paper_name, /identity disputed/);
  const q = bank.questions.filter(q => q.year === 2011);
  assert.equal(q.length, 118); assert.equal(review.records.length, 118);
  const counts = {supported: 0, disputed: 0, unresolved: 0};
  for (const [i, r] of review.records.entries()) {
    assert.equal(q[i].id, r.question_id); assert.equal(q[i].question_number, r.question_number);
    assert.equal(r.source_key, key.get(r.question_number) === '*' ? null : key.get(r.question_number));
    assert.ok(r.reasoning); counts[r.status]++;
    if (r.status === 'supported') {
      assert.equal(r.answer, r.source_key); assert.deepEqual(q[i].supplied_answer.answer, [r.answer]);
      assert.equal(q[i].answer_key_status, 'unofficial'); assert.match(q[i].supplied_answer.notes, /identity disputed/);
      assert.equal(q[i].explanation.correct_reasoning, r.reasoning); assert.equal(q[i].verified_answer, undefined);
    } else {
      assert.equal(r.answer, null); assert.equal(q[i].supplied_answer.answer, null); assert.equal(q[i].explanation, null);
      assert.equal(q[i].dispute.status, 'unresolved'); assert.equal(q[i].dispute.is_disputed, r.status === 'disputed');
    }
  }
  assert.deepEqual(counts, {supported: 88, disputed: 12, unresolved: 18});
  for (const id of ['MPPSC-2011-007','MPPSC-2011-038']) assert.ok(!q.some(row => row.id === id));
});

test('2011 rebuild rejects missing, duplicated or invalid review data', async () => {
  const inputs = {};
  for (const y of [2009,2010,2011]) inputs[y] = {source: await load(`data/pyq/source/2009-2011/pdf-transcription-${y}.json`), labels: await load(`data/pyq/source/2009-2011/final-taxonomy-${y}.json`)};
  const review = await load('data/pyq/source/2009-2011/answer-review-2011.json');
  inputs[2010].review = await load('data/pyq/source/2009-2011/answer-review-2010.json');
  inputs[2009].review = await load('data/pyq/source/2009-2011/answer-review-2009.json');
  const taxonomy = await loadTaxonomy();
  for (const bad of [undefined, {...review, records: review.records.slice(1)}, {...review, records: review.records.map((r,i) => i === 1 ? review.records[0] : r)}, {...review, records: review.records.map((r,i) => i === 2 ? {...r,answer:'Z'} : r)}]) {
    inputs[2011].review = bad;
    assert.throws(() => append2009to2011({questions:[],papers:[]}, inputs, taxonomy), /2011/);
  }
});
