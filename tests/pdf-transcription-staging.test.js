import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = 'data/pyq/source/2009-2011';
const read = (name) => JSON.parse(readFileSync(`${dir}/${name}`, 'utf8'));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('PDF-derived candidates retain recovered boundaries, shared directions and source hashes', () => {
  for (const script of ['transcribe-2009-2010-pdf.py', 'transcribe-2011-pdf.py', 'classify-pdf-staging.py']) {
    execFileSync('python3', [`tools/${script}`, '--check']);
  }
  const bank = JSON.parse(readFileSync('data/pyq/mymppsc-pyq-bank.json', 'utf8'));
  const bankIds = new Set(bank.questions.map((q) => q.id));
  for (const [year, count] of [[2009, 146], [2010, 120], [2011, 120]]) {
    const stage = read(`pdf-transcription-${year}.json`);
    const labels = read(`pdf-taxonomy-${year}.json`).labels;
    assert.equal(hash(stage.source_pdf), stage.source_pdf_sha256);
    assert.equal(hash(stage.extracted_text), stage.extracted_text_sha256);
    assert.equal(stage.questions.length, count);
    assert.equal(Object.keys(labels).length, count);
    let previous = 0;
    for (const q of stage.questions) {
      assert.ok(q.question_number > previous);
      previous = q.question_number;
      assert.equal(q.id, `MPPSC-${year}-${String(previous).padStart(3, '0')}`);
      assert.equal(bankIds.has(q.id), !(year === 2011 && [7, 38].includes(q.question_number)));
      assert.deepEqual(Object.keys(q.language_variants), ['en']);
      const v = q.language_variants.en;
      assert.deepEqual(v.options.map((o) => o.key), ['A', 'B', 'C', 'D']);
      assert.ok(v.question_text && v.options.every((o) => o.text));
      assert.doesNotMatch(JSON.stringify(v), /File hosted|# Page|Ans :|http:\/\//);
      assert.ok(labels[q.id].subject);
      assert.equal(labels[q.id].topic, null);
      assert.equal(labels[q.id].subtopic, null);
      assert.ok(!('supplied_answer' in q) && !('explanation' in q));
    }
  }
  const nine = read('pdf-transcription-2009.json');
  assert.deepEqual(nine.excluded_candidates.map((q) => q.question_number), [75, 76, 77, 78]);
  const byNumber = (n) => nine.questions.find((q) => q.question_number === n).language_variants.en;
  for (const n of [46, 47, 48, 49, 50, 82, 83, 84, 85, 145, 146, 147, 148, 149, 150]) assert.ok(byNumber(n));
  assert.match(byNumber(82).instructions, /Sachin, Rahul, Virendra/);
  assert.match(byNumber(85).instructions, /wearing brown pant is carrying bat/);
  assert.match(byNumber(101).instructions, /101 to 110/);
  assert.equal(byNumber(100).options[2].text, 'Michaelangelo');
  const ten = read('pdf-transcription-2010.json').questions;
  assert.equal(ten.find((q) => q.question_number === 17).language_variants.en.options[1].text, 'Kamban');
  assert.equal(ten.find((q) => q.question_number === 28).language_variants.en.options[1].text, 'Kashmir');
  const eleven = read('pdf-transcription-2011.json').questions;
  assert.equal(eleven.find((q) => q.question_number === 71).language_variants.en.options[1].text, 'Fujiyoma');
  assert.match(eleven.find((q) => q.question_number === 38).language_variants.en.options[1].text, /peninsular$/);
});
