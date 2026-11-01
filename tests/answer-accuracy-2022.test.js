/**
 * answer-accuracy-2022.test.js — the guard on what a learner is taught from the
 * 2022 paper.
 *
 * The 2022 final answer audit re-derived all 100 questions, kept the five keys
 * corrected by the earlier 2021–2024 pass as declared corrections, narrowed the
 * two-answer key of 045 to the paper's single printed key, and left one item
 * flagged as an unresolved dispute. No option text in this paper was damaged, so
 * the audit declares no option repair. This suite protects those decisions:
 *
 *   1. the audit record covers all 100 questions of MPPSC-2022-P1 exactly once,
 *      and its counts are recomputed from the rows and reconcile;
 *   2. every stored answer agrees with its own option correctness flags;
 *   3. every correction is declared with a stated basis whose `from` is the
 *      printed key and whose `to` is in the bank;
 *   4. the narrowed key of 045 is the paper's single answer, and the looseness of
 *      the question stays on record;
 *   5. no option repair is claimed for a paper that needed none;
 *   6. every 2022 explanation is declared complete.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2022.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2022);
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the 2022 audit covers every question of the paper exactly once', () => {
  assert.equal(audited.length, 100, 'one paper of 100 questions');
  assert.equal(audit.questions.length, 100, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2022-P1']);
  assert.deepEqual(audited.map((q) => q.question_number).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const record of audit.questions) {
    assert.equal(record.year, 2022, `${record.id}: year recorded`);
    assert.ok(record.note && record.note.trim().length > 20, `${record.id}: the row states why it was decided`);
    assert.equal(record.option_reasons, 4, `${record.id}: four reasoned options`);
  }
});

test('the recorded 2022 counts are recomputed from the rows and reconcile', () => {
  const counted = { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
  for (const record of audit.questions) {
    counted.reviewed += 1;
    counted[record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2022'], counted, 'per-year counts match the rows');
  assert.deepEqual(audit.summary.total, counted, 'totals reconcile');
  assert.equal(counted.reviewed, counted.confirmed + counted.corrected + counted.ambiguous, 'every row has exactly one status');
  assert.equal(counted.reviewed, 100);
  assert.equal(counted.corrected, 6, 'five earlier corrections plus the narrowed two-answer key of 045');
  assert.equal(counted.ambiguous, 0, 'no item was left undecided');
  assert.equal(audit.summary.explanations_rebuilt, 100, 'every explanation was rebuilt');
  assert.equal(audit.summary.printed_keys_compared, 100, 'the printed key was compared for every question');
});

test('every stored 2022 answer agrees with its own option correctness flags', () => {
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

test('every 2022 correction is declared, quoted and reflected in the bank', () => {
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
  assert.deepEqual(corrections.final_audit_2022.corrected_ids.slice().sort(), corrected.map((r) => r.id).sort(),
    'the manifest summary lists exactly the corrected questions');
  assert.equal(corrections.final_audit_2022.reviewed, audit.summary.total.reviewed);
});

test('the two-answer key of 045 is narrowed to the paper single key', () => {
  const q = byId.get('MPPSC-2022-045');
  assert.deepEqual(q.supplied_answer.answer, ['D'], 'only Bulsar is keyed');
  const flags = q.explanation.option_explanations.filter((r) => r.is_correct).map((r) => r.key);
  assert.deepEqual(flags, ['D'], 'only the keyed option is marked correct');
  assert.deepEqual(corrections.answer_corrections['MPPSC-2022-045'].from, ['C', 'D'], 'the two-answer key is recorded');
  assert.equal(q.dispute?.status, 'unresolved', 'the looseness of the question stays on record');
  assert.ok(q.dispute?.reason && q.dispute.reason.trim().length > 40, 'and is explained');
});

test('the option repairs the paper already carried are still in force', () => {
  // This pass found no new scan damage; the five repairs below were declared by
  // the earlier 2021–2024 pass and must keep applying.
  const expected = {
    'MPPSC-2022-026': { D: { from: 'Satpura National Park 3', to: 'Satpura National Park' } },
    'MPPSC-2022-055': { D: { from: 'Article 328 1', to: 'Article 328' } },
    'MPPSC-2022-077': { D: { from: 'Mayurbhanj of iron ore. district has a significant place in Odisha in terms', to: 'Mayurbhanj district has a significant place in Odisha in terms of iron ore.' } },
    'MPPSC-2022-086': { D: { from: 'Generally, the winter season is dry', to: 'Generally, the winter season is dry in Madhya Pradesh.' } },
    'MPPSC-2022-099': { D: { from: 'Minister, Parliamentary Affairs Department 🔾🔾', to: 'Minister, Parliamentary Affairs Department' } },
  };
  for (const [id, byKey] of Object.entries(expected)) {
    for (const [key, repair] of Object.entries(byKey)) {
      assert.deepEqual(corrections.option_corrections[id][key], repair, `${id} ${key}: repair quoted in the manifest`);
      const option = byId.get(id).language_variants.en.options.find((o) => o.key === key);
      assert.equal(option.text, repair.to, `${id} ${key}: repair is in force in the bank`);
    }
  }
  const declared = Object.keys(corrections.option_corrections).filter((id) => id.startsWith('MPPSC-2022-')).sort();
  assert.deepEqual(declared, Object.keys(expected).sort(), 'this pass added no new option repair to the paper');
  const emptied = audited.filter((q) => q.language_variants.en.options.some((o) => !o.text || !o.text.trim()));
  assert.deepEqual(emptied.map((q) => q.id), [], 'no 2022 question has an empty option');
});

test('verified 2022 answers are not quietly re-keyed', () => {
  const confirmed = {
    'MPPSC-2022-009': ['C'], // tunnel diode, ultra-high-speed switching
    'MPPSC-2022-022': ['B'], // Saadat Khan and the 1857 revolt at Indore
    'MPPSC-2022-068': ['A'], // 91st Amendment, ceiling on the Council of Ministers
    'MPPSC-2022-074': ['C'], // Meghalaya, highest decadal growth
    'MPPSC-2022-076': ['A'], // Mizoram, highest female literacy among these states
    'MPPSC-2022-096': ['C'], // three spells of President's Rule
    'MPPSC-2022-098': ['A'], // Ravishankar Shukla, first Chief Minister
  };
  for (const [id, answer] of Object.entries(confirmed)) {
    assert.deepEqual(byId.get(id).supplied_answer.answer, answer, `${id}: confirmed key must not drift`);
  }
});

test('every 2022 explanation is declared complete', () => {
  const declared = corrections.option_reasoning_complete.filter((id) => id.startsWith('MPPSC-2022-')).sort();
  assert.equal(declared.length, 100, 'every 2022 explanation is declared complete');
  assert.deepEqual(audit.summary.option_reasoning_declared_incomplete, [],
    'the audit records no half-finished 2022 item');
  for (const q of audited) {
    assert.ok(q.explanation.correct_reasoning.length >= 140, `${q.id}: the reasoning is a real explanation`);
    assert.ok(Array.isArray(q.explanation.key_concepts) && q.explanation.key_concepts.length >= 2, `${q.id}: concepts listed`);
    assert.ok(Array.isArray(q.explanation.revision_takeaways) && q.explanation.revision_takeaways.length >= 1, `${q.id}: takeaway listed`);
  }
});
