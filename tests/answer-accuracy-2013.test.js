/**
 * answer-accuracy-2013.test.js — the guard on what a learner is taught from the
 * 2013 paper.
 *
 * The 2013 final answer audit corrected one printed key (073), repaired three
 * scan-damaged option texts across two questions (061, 087) and recorded three
 * disputes: two resolved (061, 073) and one left open (098), where the question
 * offers no correct option at all. This suite protects those decisions and the
 * invariants behind them:
 *
 *   1. the audit record covers all 100 questions of MPPSC-2013-P1 exactly once,
 *      and its counts are recomputed from the rows and reconcile;
 *   2. every stored answer agrees with its own option correctness flags;
 *   3. every corrected answer is declared in reviewed-corrections.json with a
 *      stated basis whose `from` is the printed key and whose `to` is in the bank;
 *   4. the corrected answer teaches the verified fact rather than the printed key;
 *   5. the scan repairs, including the option the source left empty, are
 *      declared, quoted and in force;
 *   6. the defective item 098 stays flagged as ambiguous instead of being forced.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2013.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2013);
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the 2013 audit covers every question of the paper exactly once', () => {
  assert.equal(audited.length, 100, 'one paper of 100 questions');
  assert.equal(audit.questions.length, 100, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2013-P1']);
  assert.deepEqual(audited.map((q) => q.question_number).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const record of audit.questions) {
    assert.equal(record.year, 2013, `${record.id}: year recorded`);
    assert.ok(record.note && record.note.trim().length > 20, `${record.id}: the row states why it was decided`);
    assert.equal(record.option_reasons, 4, `${record.id}: four reasoned options`);
  }
});

test('the recorded 2013 counts are recomputed from the rows and reconcile', () => {
  const counted = { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
  for (const record of audit.questions) {
    counted.reviewed += 1;
    counted[record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2013'], counted, 'per-year counts match the rows');
  assert.deepEqual(audit.summary.total, counted, 'totals reconcile');
  assert.equal(counted.reviewed, counted.confirmed + counted.corrected + counted.ambiguous, 'every row has exactly one status');
  assert.equal(counted.reviewed, 100);
  assert.equal(counted.corrected, 1, 'one printed key was corrected');
  assert.equal(counted.ambiguous, 1, 'one item is recorded as ambiguous');
  assert.equal(counted.confirmed + counted.corrected + counted.ambiguous, 100, 'confirmed + corrected + ambiguous = 100');
  assert.equal(audit.summary.explanations_rebuilt, 100, 'every explanation was rebuilt');
  assert.equal(audit.summary.printed_keys_compared, 100, 'the printed key was compared for every question');
});

test('every stored 2013 answer agrees with its own option correctness flags', () => {
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

test('every 2013 correction is declared, quoted and reflected in the bank', () => {
  const corrected = audit.questions.filter((r) => r.status === 'corrected');
  assert.equal(corrected.length, 1, 'one printed key was corrected');
  for (const record of corrected) {
    const declaration = corrections.answer_corrections[record.id];
    assert.ok(declaration, `${record.id}: correction is declared in reviewed-corrections.json`);
    assert.ok(declaration.basis && declaration.basis.trim().length > 20, `${record.id}: correction states a basis`);
    assert.deepEqual(record.printed_key, declaration.from, `${record.id}: the record quotes the printed key`);
    assert.deepEqual(record.answer, declaration.to, `${record.id}: the record quotes the corrected key`);
    assert.notDeepEqual(declaration.from, declaration.to, `${record.id}: a correction changes something`);
    assert.deepEqual(byId.get(record.id).supplied_answer.answer, declaration.to, `${record.id}: bank carries the corrected key`);
  }
  assert.deepEqual(corrections.final_audit_2013.corrected_ids.slice().sort(), corrected.map((r) => r.id).sort(),
    'the manifest summary lists exactly the corrected questions');
  assert.deepEqual(corrections.final_audit_2013.ambiguous_ids, ['MPPSC-2013-098'],
    'the ambiguous item is named, not hidden');
  assert.equal(corrections.final_audit_2013.reviewed, audit.summary.total.reviewed);
});

test('the corrected 2013 key teaches the verified fact', () => {
  const q = byId.get('MPPSC-2013-073');
  assert.deepEqual(q.supplied_answer.answer, ['D'], 'NH 7 is the longest national highway before the 2010 renumbering');
  const flags = q.explanation.option_explanations.filter((r) => r.is_correct).map((r) => r.key);
  assert.deepEqual(flags, ['D'], 'only the corrected option is marked correct');
  assert.match(q.explanation.correct_reasoning, /2,369 kilometres/i, 'the reasoning states the verified length');
  assert.match(q.explanation.correct_reasoning, /Varanasi to Kanyakumari/i, 'and the verified route');
  assert.deepEqual(corrections.answer_corrections['MPPSC-2013-073'].from, ['A'], 'the printed key is recorded');
});

test('the 2013 disputes are recorded: two resolved, one left open', () => {
  for (const id of ['MPPSC-2013-061', 'MPPSC-2013-073']) {
    const q = byId.get(id);
    assert.equal(q.dispute?.is_disputed, true, `${id}: the item carries a dispute block`);
    assert.equal(q.dispute?.status, 'resolved', `${id}: the dispute was settled`);
    assert.ok(q.dispute?.reason && q.dispute.reason.trim().length > 40, `${id}: the conflict is explained`);
  }
  const open = audited.filter((q) => q.dispute?.status === 'unresolved');
  assert.deepEqual(open.map((q) => q.id), ['MPPSC-2013-098'],
    'the one question with no correct option is flagged unresolved rather than forced');
  assert.match(byId.get('MPPSC-2013-098').explanation.correct_reasoning, /1990-1999/i,
    'the open item states the decade the paper failed to offer');
});

test('verified 2013 answers are not quietly re-keyed', () => {
  const confirmed = {
    'MPPSC-2013-020': ['A'], // anticipatory bail barred by section 18
    'MPPSC-2013-031': ['B'], // Akashvani Indore, 22 May 1955
    'MPPSC-2013-050': ['C'], // Australia, third men's hockey World Cup
    'MPPSC-2013-056': ['C'], // Mansarovar is not one of the four dhams
    'MPPSC-2013-058': ['D'], // shehnai, not of Indo-Islamic origin
    'MPPSC-2013-061': ['C'], // National Planning Committee set up by Subhash Chandra Bose
    'MPPSC-2013-064': ['C'], // Bharat Electronics, Navratna
    'MPPSC-2013-088': ['D'], // Charter Act 1833 ended the tea monopoly
    'MPPSC-2013-098': ['A'], // closest option to the 1990-1999 IDNDR, kept and flagged
  };
  for (const [id, answer] of Object.entries(confirmed)) {
    assert.deepEqual(byId.get(id).supplied_answer.answer, answer, `${id}: confirmed key must not drift`);
  }
  for (const id of Object.keys(confirmed)) {
    if (id === 'MPPSC-2013-098') continue;
    assert.equal(corrections.answer_corrections[id], undefined, `${id}: no correction is declared for a confirmed answer`);
  }
});

test('2013 option repairs are declared, quoted and in force', () => {
  const expected = {
    'MPPSC-2013-061': { A: { from: 'Dalal', to: 'Jawaharlal Nehru' }, B: { from: '', to: 'A. Dalal' } },
    'MPPSC-2013-087': { A: { from: 'V.', to: 'V.D. Savarkar' } },
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
  assert.deepEqual(emptied.map((q) => q.id), [], 'the question the source shipped with an empty option is complete');
});

test('every 2013 explanation is declared complete', () => {
  const declared = corrections.option_reasoning_complete.filter((id) => id.startsWith('MPPSC-2013-')).sort();
  assert.equal(declared.length, 100, 'every 2013 explanation is declared complete');
  assert.deepEqual(audit.summary.option_reasoning_declared_incomplete, [],
    'the audit records no half-finished 2013 item');
  for (const q of audited) {
    assert.ok(q.explanation.correct_reasoning.length >= 140, `${q.id}: the reasoning is a real explanation`);
    assert.ok(Array.isArray(q.explanation.key_concepts) && q.explanation.key_concepts.length >= 2, `${q.id}: concepts listed`);
    assert.ok(Array.isArray(q.explanation.revision_takeaways) && q.explanation.revision_takeaways.length >= 1, `${q.id}: takeaway listed`);
  }
});
