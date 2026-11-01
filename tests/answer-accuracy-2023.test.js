/**
 * answer-accuracy-2023.test.js — the guard on what a learner is taught from the
 * 2023 paper.
 *
 * The 2023 final answer audit re-derived all 100 questions of MPPSC-2023-P1,
 * confirmed the six keys the earlier 2021–2024 pass had already corrected, left
 * the two-answer item 005 flagged rather than forced to one letter, and rebuilt
 * every explanation to the per-option standard. Five numbers the extraction
 * never printed are app-authored model questions, declared as such. This suite
 * protects those decisions:
 *
 *   1. the audit record covers all 100 questions exactly once, and its counts are
 *      recomputed from the rows and reconcile;
 *   2. every stored answer agrees with its own option correctness flags;
 *   3. every correction is declared with a stated basis whose `from` is the
 *      printed key and whose `to` is in the bank;
 *   4. the two-answer key of 005 is recorded, not hidden: both keyed options are
 *      ticked and the item stays an unresolved dispute;
 *   5. the option repairs the paper carries are quoted and in force;
 *   6. every 2023 explanation is declared complete, the model questions included.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2023.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2023);
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the 2023 audit covers every question of the paper exactly once', () => {
  assert.equal(audited.length, 100, 'one paper of 100 questions');
  assert.equal(audit.questions.length, 100, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2023-P1']);
  assert.deepEqual(audited.map((q) => q.question_number).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const record of audit.questions) {
    assert.equal(record.year, 2023, `${record.id}: year recorded`);
    assert.ok(record.note && record.note.trim().length > 20, `${record.id}: the row states why it was decided`);
    assert.equal(record.option_reasons, 4, `${record.id}: four reasoned options`);
    assert.equal(record.explanation_rebuilt, true, `${record.id}: the explanation was rebuilt`);
  }
});

test('the recorded 2023 counts are recomputed from the rows and reconcile', () => {
  const counted = { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
  for (const record of audit.questions) {
    counted.reviewed += 1;
    counted[record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2023'], counted, 'per-year counts match the rows');
  assert.deepEqual(audit.summary.total, counted, 'totals reconcile');
  assert.equal(counted.reviewed, counted.confirmed + counted.corrected + counted.ambiguous, 'every row has exactly one status');
  assert.equal(counted.reviewed, 100);
  assert.equal(counted.corrected, 6, 'the six printed keys carried by the paper are recorded');
  assert.equal(counted.ambiguous, 1, 'exactly one item is recorded as undecided');
  assert.equal(audit.summary.explanations_rebuilt, 100, 'every explanation was rebuilt');
  assert.equal(audit.summary.printed_keys_compared, 100, 'the printed key was compared for every question');
  assert.equal(audit.summary.option_reasoning_declared_incomplete.length, 0, 'no half-finished item is left behind');
});

test('every stored 2023 answer agrees with its own option correctness flags', () => {
  const offenders = [];
  for (const q of audited) {
    const rows = q.explanation.option_explanations || [];
    assert.equal(rows.length, 4, `${q.id}: four option rows`);
    const answer = new Set(q.supplied_answer.answer.map((x) => String(x).toUpperCase()));
    const flagged = new Set(rows.filter((r) => r.is_correct === true).map((r) => r.key));
    const same = flagged.size === answer.size && [...flagged].every((k) => answer.has(k));
    if (!same) offenders.push(`${q.id}: flags ${[...flagged].join(',') || 'none'} vs answer ${[...answer].join(',') || 'none'}`);
  }
  assert.deepEqual(offenders, [], `answer/flag contradictions:\n${offenders.join('\n')}`);
});

test('every 2023 correction is declared, quoted and reflected in the bank', () => {
  const corrected = audit.questions.filter((r) => r.status === 'corrected');
  assert.equal(corrected.length, 6, 'six corrections are recorded for this paper');
  for (const record of corrected) {
    const declaration = corrections.answer_corrections[record.id];
    assert.ok(declaration, `${record.id}: correction is declared in reviewed-corrections.json`);
    assert.ok(declaration.basis && declaration.basis.trim().length > 20, `${record.id}: correction states a basis`);
    assert.deepEqual(record.printed_key, declaration.from, `${record.id}: the record quotes the printed key`);
    assert.deepEqual(record.answer, declaration.to, `${record.id}: the record quotes the corrected key`);
    assert.deepEqual(byId.get(record.id).supplied_answer.answer, declaration.to, `${record.id}: bank carries the corrected key`);
  }
  assert.deepEqual(corrections.final_audit_2023.corrected_ids.slice().sort(), corrected.map((r) => r.id).sort(),
    'the manifest summary lists exactly the corrected questions');
  assert.equal(corrections.final_audit_2023.reviewed, audit.summary.total.reviewed);
});

test('the two-answer key of 005 is kept as printed and stays flagged', () => {
  const q = byId.get('MPPSC-2023-005');
  assert.deepEqual(q.supplied_answer.answer, ['B', 'D'], 'the paper keys both options');
  const flags = q.explanation.option_explanations.filter((r) => r.is_correct).map((r) => r.key);
  assert.deepEqual(flags, ['B', 'D'], 'both keyed options are ticked');
  assert.equal(records.get('MPPSC-2023-005').status, 'ambiguous', 'the item is recorded as undecided, not as confirmed');
  assert.equal(q.dispute?.status, 'unresolved', 'the looseness of the question stays on record');
  assert.ok(q.dispute?.reason && q.dispute.reason.trim().length > 40, 'and is explained');
  assert.match(q.explanation.correct_reasoning, /fluorosis/i, 'the reasoning says why B is arguable');
  assert.equal(corrections.final_audit_2023.ambiguous_ids.includes('MPPSC-2023-005'), true,
    'the manifest summary names the flagged item');
});

test('the option repairs the paper carries are quoted in the manifest and in force', () => {
  const expected = {
    'MPPSC-2023-045': { D: { from: 'None of the above 8', to: 'None of the above' } },
    'MPPSC-2023-092': { D: { from: '1942 A.D. 7', to: '1942 A.D.' } },
  };
  for (const [id, byKey] of Object.entries(expected)) {
    for (const [key, repair] of Object.entries(byKey)) {
      assert.deepEqual(corrections.option_corrections[id][key], repair, `${id} ${key}: repair quoted in the manifest`);
      const option = byId.get(id).language_variants.en.options.find((o) => o.key === key);
      assert.equal(option.text, repair.to, `${id} ${key}: repair is in force in the bank`);
    }
  }
  const declared = Object.keys(corrections.option_corrections).filter((id) => id.startsWith('MPPSC-2023-')).sort();
  assert.deepEqual(declared, Object.keys(expected).sort(), 'this pass added no new option repair to the paper');
  const emptied = audited.filter((q) => q.language_variants.en.options.some((o) => !o.text || !o.text.trim()));
  assert.deepEqual(emptied.map((q) => q.id), [], 'no 2023 question has an empty option');
});

test('verified 2023 answers are not quietly re-keyed', () => {
  const confirmed = {
    'MPPSC-2023-002': ['D'], // Jabalpur, the High Court seat
    'MPPSC-2023-012': ['D'], // BRAP 2020, Madhya Pradesh among the Achievers
    'MPPSC-2023-013': ['B'], // Anuppur, Betul, Chhindwara, Mandsaur by growth rate
    'MPPSC-2023-038': ['B'], // Lance Naik Manju, the first woman soldier skydiver
    'MPPSC-2023-041': ['C'], // MP Online is not the state procurement portal
    'MPPSC-2023-052': ['A'], // Gaza Strip on the Mediterranean
    'MPPSC-2023-078': ['B'], // Amarkantak thermal power station at Chachai
    'MPPSC-2023-100': ['C'], // Thona-Luhari firing, 8 February 1939
  };
  for (const [id, answer] of Object.entries(confirmed)) {
    assert.deepEqual(byId.get(id).supplied_answer.answer, answer, `${id}: confirmed key must not drift`);
  }
});

test('every 2023 explanation is declared complete, the model questions included', () => {
  const declared = corrections.option_reasoning_complete.filter((id) => id.startsWith('MPPSC-2023-')).sort();
  assert.equal(declared.length, 100, 'every 2023 explanation is declared complete');
  assert.deepEqual(audit.summary.option_reasoning_declared_incomplete, [],
    'the audit records no half-finished 2023 item');
  for (const q of audited) {
    assert.ok(q.explanation.correct_reasoning.length >= 140, `${q.id}: the reasoning is a real explanation`);
    assert.ok(Array.isArray(q.explanation.key_concepts) && q.explanation.key_concepts.length >= 2, `${q.id}: concepts listed`);
    assert.ok(Array.isArray(q.explanation.revision_takeaways) && q.explanation.revision_takeaways.length >= 1, `${q.id}: takeaway listed`);
  }
  // Five printed numbers were never captured, so the app-authored records that
  // fill them are declared separately instead of being passed off as recovered text.
  assert.deepEqual(audit.summary.model_questions.slice().sort(),
    ['MPPSC-2023-002', 'MPPSC-2023-047', 'MPPSC-2023-053', 'MPPSC-2023-058', 'MPPSC-2023-060'],
    'the app-authored questions of this paper are named');
  for (const id of audit.summary.model_questions) {
    assert.equal(byId.get(id).metadata?.model_question, true, `${id}: flagged as a model question in the bank`);
  }
});
