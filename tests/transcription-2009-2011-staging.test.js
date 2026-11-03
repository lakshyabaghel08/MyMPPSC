import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const dir = 'data/pyq/source/2009-2011';
const read = (name) => JSON.parse(readFileSync(`${dir}/${name}`, 'utf8'));

test('2009–2011 staging reproduces the sources and retains only ordered, keyless English candidates', () => {
  for (const script of ['transcribe-2009-2010.py', 'transcribe-2011-paper.py', 'classify-2009-2011-staging.py']) {
    execFileSync('python3', [`tools/${script}`, '--check']);
  }
  const bank = JSON.parse(readFileSync('data/pyq/mymppsc-pyq-bank.json', 'utf8'));
  const bankIds = new Set(bank.questions.map((q) => q.id));
  for (const [year, count] of [[2009, 131], [2010, 96], [2011, 120]]) {
    const source = read(`transcription-${year}.json`);
    const labels = read(`taxonomy-${year}.json`).labels;
    assert.equal(source.questions.length, count);
    assert.equal(Object.keys(labels).length, count);
    let previous = 0;
    for (const q of source.questions) {
      assert.ok(q.question_number > previous);
      previous = q.question_number;
      assert.equal(q.id, `MPPSC-${year}-${String(previous).padStart(3, '0')}`);
      assert.equal(bankIds.has(q.id), !(year === 2011 && [7, 38].includes(q.question_number)));
      assert.deepEqual(Object.keys(q.language_variants), ['en']);
      assert.deepEqual(q.language_variants.en.options.map((o) => o.key), ['A', 'B', 'C', 'D']);
      assert.ok(q.language_variants.en.question_text && q.language_variants.en.options.every((o) => o.text));
      assert.ok(labels[q.id].subject);
      assert.equal(labels[q.id].topic, null);
      assert.equal(labels[q.id].subtopic, null);
      assert.ok(!('supplied_answer' in q) && !('explanation' in q));
    }
  }
  const nine = read('transcription-2009.json').questions;
  assert.ok(!nine.some((q) => [46, 75, 76, 77, 78, 145].includes(q.question_number)));
  assert.match(nine.find((q) => q.question_number === 101).language_variants.en.instructions, /101 to 110/);
  assert.match(nine.find((q) => q.question_number === 101).language_variants.en.options[0].text, /Both/);
  assert.ok(nine.some((q) => q.question_number === 15));
  assert.ok(nine.some((q) => q.question_number === 16));
  const ten = read('transcription-2010.json').questions;
  assert.ok(!ten.some((q) => q.question_number === 17));
  assert.match(ten.find((q) => q.question_number === 69).language_variants.en.question_text, /Nuskhai-Dilkusha/);
});
