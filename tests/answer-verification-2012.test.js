import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = async (name) => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));

test('2012 staged answer review inventories the live paper and keeps uncertainty explicit', async () => {
  const bank = await load('../data/pyq/mymppsc-pyq-bank.json');
  const audit = await load('../data/pyq/source/2012-recovery/answer-verification-2012.json');
  const questions = bank.questions.filter((q) => q.year === 2012).sort((a, b) => a.question_number - b.question_number);
  assert.equal(questions.length, 100);
  assert.equal(new Set(questions.map((q) => q.id)).size, 100);
  assert.equal(new Set(questions.map((q) => q.paper_id)).size, 1);
  assert.equal(audit.paper_id, questions[0].paper_id);
  assert.equal(audit.records.length, 100);
  assert.equal(audit.status, 'in_progress');
  for (let i = 0; i < 100; i++) {
    const q = questions[i], r = audit.records[i];
    assert.equal(q.question_number, i + 1);
    assert.equal(r.question_number, i + 1);
    assert.equal(r.question_id, q.id);
    const keys = q.language_variants.en.options.map((o) => o.key);
    assert.ok(['verified', 'disputed', 'unresolved'].includes(r.status));
    assert.ok(['researched', 'in_progress', 'not_started'].includes(r.research_state));
    assert.ok(r.evidence.trim());
    assert.ok(r.sources.every((url) => /^https?:\/\//.test(url)));
    assert.ok(r.candidate_options.every((option) => keys.includes(option)));
    if (r.status === 'verified') {
      assert.ok(keys.includes(r.answer));
      assert.equal(r.research_state, 'researched');
      assert.ok(r.sources.length > 0);
      assert.deepEqual(r.candidate_options, []);
    } else {
      assert.equal(r.answer, null);
      if (r.status === 'disputed') {
        assert.equal(r.research_state, 'researched');
        assert.ok(r.candidate_options.length && r.sources.length);
      }
    }
    if (r.research_state === 'not_started') {
      assert.equal(r.status, 'unresolved');
      assert.equal(r.sources.length, 0);
    }
    assert.equal(q.supplied_answer.status, 'missing');
    assert.equal(q.supplied_answer.answer, null);

  }
});


test('reassessed 2012 answers integrate only source-supported single answers', async () => {
  const bank = await load('../data/pyq/mymppsc-pyq-bank.json');
  const audit = await load('../data/pyq/source/2012-recovery/answer-reassessment-2012.json');
  const qs = bank.questions.filter(q => q.year === 2012).sort((a, b) => a.question_number - b.question_number);
  assert.equal(audit.records.length, 100);
  const counts = { verified: 0, disputed: 0, unresolved: 0 };
  for (let i = 0; i < 100; i++) {
    const q = qs[i], r = audit.records[i];
    assert.equal(q.id, r.question_id);
    assert.equal(r.question_number, i + 1);
    assert.ok(Object.hasOwn(counts, r.status)); counts[r.status]++;
    assert.ok(r.reasoning && r.ambiguity_or_limitation);
    assert.ok(r.sources.every(url => /^https?:\/\//.test(url)));
    assert.equal(q.supplied_answer.answer, null);
    if (r.status === 'verified') {
      assert.ok(r.sources.length);
      assert.ok(q.language_variants.en.options.some(o => o.key === r.proposed_answer));
      assert.deepEqual(q.verified_answer.answer, [r.proposed_answer]);
      assert.match(q.verified_answer.verified_by, /not an official MPPSC key/);
      assert.equal(q.explanation.correct_reasoning, r.reasoning);
      assert.deepEqual(q.verified_answer.evidence.map(e => e.url), r.sources);
    } else {
      assert.ok(!q.verified_answer?.answer?.length);
      assert.equal(q.explanation, null);
      assert.equal(q.dispute.status, 'unresolved');
      assert.equal(q.dispute.is_disputed, r.status === 'disputed');
      assert.ok(q.dispute.reason.includes(r.ambiguity_or_limitation));
    }
  }
  assert.deepEqual(counts, { verified: 79, disputed: 7, unresolved: 14 });
});
