/**
 * answer-accuracy-2015.test.js — the guard on what a learner is taught from the
 * 2015 paper.
 *
 * The 2015 final answer audit corrected four printed keys (045, 054, 080, 097)
 * and recorded two resolved disputes (045, 080). This suite protects those
 * decisions and the invariants behind them:
 *
 *   1. the audit record covers all 100 questions of MPPSC-2015-P1 exactly once,
 *      and its counts are recomputed from the rows and reconcile;
 *   2. every stored answer agrees with its own option correctness flags;
 *   3. every corrected answer is declared in reviewed-corrections.json with a
 *      stated basis whose `from` is the printed key and whose `to` is in the bank;
 *   4. the corrected answers teach the verified fact rather than the printed key;
 *   5. the scan repairs of the option text, including the four options the source
 *      left empty, are declared, quoted and in force.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2015.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2015);
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the 2015 audit covers every question of the paper exactly once', () => {
  assert.equal(audited.length, 100, 'one paper of 100 questions');
  assert.equal(audit.questions.length, 100, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2015-P1']);
  assert.deepEqual(audited.map((q) => q.question_number).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const record of audit.questions) {
    assert.equal(record.year, 2015, `${record.id}: year recorded`);
    assert.ok(record.note && record.note.trim().length > 20, `${record.id}: the row states why it was decided`);
    assert.equal(record.option_reasons, 4, `${record.id}: four reasoned options`);
  }
});

test('the recorded 2015 counts are recomputed from the rows and reconcile', () => {
  const counted = { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
  for (const record of audit.questions) {
    counted.reviewed += 1;
    counted[record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2015'], counted, 'per-year counts match the rows');
  assert.deepEqual(audit.summary.total, counted, 'totals reconcile');
  assert.equal(counted.reviewed, counted.confirmed + counted.corrected + counted.ambiguous, 'every row has exactly one status');
  assert.equal(counted.reviewed, 100);
  assert.equal(counted.corrected, 4, 'four printed keys were corrected');
  assert.equal(counted.ambiguous, 0, 'no item was left undecided');
  assert.equal(audit.summary.explanations_rebuilt, 100, 'every explanation was rebuilt');
  assert.equal(audit.summary.printed_keys_compared, 100, 'the printed key was compared for every question');
});

test('every stored 2015 answer agrees with its own option correctness flags', () => {
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

test('every 2015 correction is declared, quoted and reflected in the bank', () => {
  const corrected = audit.questions.filter((r) => r.status === 'corrected');
  assert.equal(corrected.length, 4, 'four printed keys were corrected');
  for (const record of corrected) {
    const declaration = corrections.answer_corrections[record.id];
    assert.ok(declaration, `${record.id}: correction is declared in reviewed-corrections.json`);
    assert.ok(declaration.basis && declaration.basis.trim().length > 20, `${record.id}: correction states a basis`);
    assert.deepEqual(record.printed_key, declaration.from, `${record.id}: the record quotes the printed key`);
    assert.deepEqual(record.answer, declaration.to, `${record.id}: the record quotes the corrected key`);
    assert.notDeepEqual(declaration.from, declaration.to, `${record.id}: a correction changes something`);
    assert.deepEqual(byId.get(record.id).supplied_answer.answer, declaration.to, `${record.id}: bank carries the corrected key`);
  }
  assert.deepEqual(corrections.final_audit_2015.corrected_ids.slice().sort(), corrected.map((r) => r.id).sort(),
    'the manifest summary lists exactly the corrected questions');
  assert.deepEqual(corrections.final_audit_2015.ambiguous_ids, [], 'no item is recorded as ambiguous');
  assert.equal(corrections.final_audit_2015.reviewed, audit.summary.total.reviewed);
});

test('the corrected 2015 keys teach the verified facts', () => {
  const expectations = {
    'MPPSC-2015-045': { answer: ['D'], pattern: /appointed by the Central Government/i, from: ['A'] },
    'MPPSC-2015-054': { answer: ['D'], pattern: /social, the economic and the environmental|three interdependent pillars/i, from: ['A'] },
    'MPPSC-2015-080': { answer: ['A'], pattern: /73rd/i, from: ['D'] },
    'MPPSC-2015-097': { answer: ['A'], pattern: /penicillin/i, from: ['B'] },
  };
  for (const [id, expected] of Object.entries(expectations)) {
    const q = byId.get(id);
    assert.deepEqual(q.supplied_answer.answer, expected.answer, `${id}: corrected key in the bank`);
    const flags = q.explanation.option_explanations.filter((r) => r.is_correct).map((r) => r.key);
    assert.deepEqual(flags, expected.answer, `${id}: only the corrected option is marked correct`);
    assert.match(q.explanation.correct_reasoning, expected.pattern, `${id}: the reasoning states the verified fact`);
    assert.deepEqual(corrections.answer_corrections[id].from, expected.from, `${id}: the printed key is recorded`);
    assert.ok(q.dispute === undefined || q.dispute.status === 'resolved' || q.dispute.is_disputed !== true,
      `${id}: a corrected item is not left flagged unresolved`);
  }
});

test('the two 2015 disputes are recorded as resolved, not left hanging', () => {
  for (const id of ['MPPSC-2015-045', 'MPPSC-2015-080']) {
    const q = byId.get(id);
    assert.equal(q.dispute?.is_disputed, true, `${id}: the item carries a dispute block`);
    assert.equal(q.dispute?.status, 'resolved', `${id}: the dispute was settled by the correction`);
    assert.ok(q.dispute?.reason && q.dispute.reason.trim().length > 40, `${id}: the conflict is explained`);
    assert.equal(records.get(id).status, 'corrected', `${id}: the audit labels it corrected`);
  }
  const unresolved = audited.filter((q) => q.dispute?.status === 'unresolved');
  assert.deepEqual(unresolved.map((q) => q.id), [], 'no 2015 item is left unresolved');
});

test('verified 2015 answers are not quietly re-keyed', () => {
  const confirmed = {
    'MPPSC-2015-004': ['C'], // Ignited Minds, A.P.J. Abdul Kalam
    'MPPSC-2015-032': ['C'], // HDI: health, education, standard of living
    'MPPSC-2015-036': ['A'], // Ambedkar, the sacred-document formulation
    'MPPSC-2015-044': ['C'], // M.V. Mathur on merging the commissions
    'MPPSC-2015-075': ['D'], // PHRA 1993 objectives, all of the above
    'MPPSC-2015-093': ['D'], // microscope for micro and nearby objects
    'MPPSC-2015-099': ['D'], // Gandhi Peace Prize 2013, environmentalist
  };
  for (const [id, answer] of Object.entries(confirmed)) {
    assert.deepEqual(byId.get(id).supplied_answer.answer, answer, `${id}: confirmed key must not drift`);
    assert.equal(corrections.answer_corrections[id], undefined, `${id}: no correction is declared for a confirmed answer`);
  }
});

test('2015 option repairs are declared, quoted and in force', () => {
  const expected = {
    'MPPSC-2015-004': { A: { from: 'P.J. Abdul Kalam', to: 'Vikram Seth' }, C: { from: '', to: 'A.P.J. Abdul Kalam' } },
    'MPPSC-2015-013': { A: { from: '', to: '1825' }, D: { from: '', to: '1830' } },
    'MPPSC-2015-036': { A: { from: '', to: 'B.R. Ambedkar' } },
    'MPPSC-2015-044': { A: { from: '', to: 'D.D. Basu' } },
    'MPPSC-2015-045': { D: { from: 'Environment Minister', to: 'None of the above' } },
    'MPPSC-2015-054': { D: { from: 'None of the above', to: 'All of the above' } },
    'MPPSC-2015-056': { B: { from: 'J.', to: 'J.C. Bose' } },
  };
  for (const [id, byKey] of Object.entries(expected)) {
    for (const [key, repair] of Object.entries(byKey)) {
      assert.deepEqual(corrections.option_corrections[id][key], repair, `${id} ${key}: repair quoted in the manifest`);
      const option = byId.get(id).language_variants.en.options.find((o) => o.key === key);
      assert.equal(option.text, repair.to, `${id} ${key}: repair is in force in the bank`);
      assert.ok(option.text.trim().length > 0, `${id} ${key}: no empty option text survives`);
    }
  }
  const emptied = audited.filter((q) => q.language_variants.en.options.some((o) => !o.text || !o.text.trim()));
  assert.deepEqual(emptied.map((q) => q.id), [], 'the four questions the source shipped with empty options are complete');
});
