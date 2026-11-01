/**
 * answer-accuracy-2014.test.js — the guard on what a learner is taught from the
 * 2014 paper.
 *
 * The 2014 final answer audit corrected three printed keys (001, 065, 069),
 * repaired nine scan-damaged option texts across six questions and recorded two
 * resolved disputes (032, 065). This suite protects those decisions and the
 * invariants behind them:
 *
 *   1. the audit record covers all 100 questions of MPPSC-2014-P1 exactly once,
 *      and its counts are recomputed from the rows and reconcile;
 *   2. every stored answer agrees with its own option correctness flags;
 *   3. every corrected answer is declared in reviewed-corrections.json with a
 *      stated basis whose `from` is the printed key and whose `to` is in the bank;
 *   4. the corrected answers teach the verified fact rather than the printed key;
 *   5. the scan repairs, including the six options the source left empty, are
 *      declared, quoted and in force;
 *   6. the one question whose printed stem has no word long enough for the
 *      anti-boilerplate check is declared, not silently counted as complete.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2014.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2014);
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the 2014 audit covers every question of the paper exactly once', () => {
  assert.equal(audited.length, 100, 'one paper of 100 questions');
  assert.equal(audit.questions.length, 100, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2014-P1']);
  assert.deepEqual(audited.map((q) => q.question_number).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const record of audit.questions) {
    assert.equal(record.year, 2014, `${record.id}: year recorded`);
    assert.ok(record.note && record.note.trim().length > 20, `${record.id}: the row states why it was decided`);
    assert.equal(record.option_reasons, 4, `${record.id}: four reasoned options`);
  }
});

test('the recorded 2014 counts are recomputed from the rows and reconcile', () => {
  const counted = { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
  for (const record of audit.questions) {
    counted.reviewed += 1;
    counted[record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2014'], counted, 'per-year counts match the rows');
  assert.deepEqual(audit.summary.total, counted, 'totals reconcile');
  assert.equal(counted.reviewed, counted.confirmed + counted.corrected + counted.ambiguous, 'every row has exactly one status');
  assert.equal(counted.reviewed, 100);
  assert.equal(counted.corrected, 3, 'three printed keys were corrected');
  assert.equal(counted.ambiguous, 0, 'no item was left undecided');
  assert.equal(audit.summary.explanations_rebuilt, 100, 'every explanation was rebuilt');
  assert.equal(audit.summary.printed_keys_compared, 100, 'the printed key was compared for every question');
});

test('every stored 2014 answer agrees with its own option correctness flags', () => {
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

test('every 2014 correction is declared, quoted and reflected in the bank', () => {
  const corrected = audit.questions.filter((r) => r.status === 'corrected');
  assert.equal(corrected.length, 3, 'three printed keys were corrected');
  for (const record of corrected) {
    const declaration = corrections.answer_corrections[record.id];
    assert.ok(declaration, `${record.id}: correction is declared in reviewed-corrections.json`);
    assert.ok(declaration.basis && declaration.basis.trim().length > 20, `${record.id}: correction states a basis`);
    assert.deepEqual(record.printed_key, declaration.from, `${record.id}: the record quotes the printed key`);
    assert.deepEqual(record.answer, declaration.to, `${record.id}: the record quotes the corrected key`);
    assert.notDeepEqual(declaration.from, declaration.to, `${record.id}: a correction changes something`);
    assert.deepEqual(byId.get(record.id).supplied_answer.answer, declaration.to, `${record.id}: bank carries the corrected key`);
  }
  assert.deepEqual(corrections.final_audit_2014.corrected_ids.slice().sort(), corrected.map((r) => r.id).sort(),
    'the manifest summary lists exactly the corrected questions');
  assert.deepEqual(corrections.final_audit_2014.ambiguous_ids, [], 'no item is recorded as ambiguous');
  assert.equal(corrections.final_audit_2014.reviewed, audit.summary.total.reviewed);
});

test('the corrected 2014 keys teach the verified facts', () => {
  const expectations = {
    'MPPSC-2014-001': { answer: ['B'], pattern: /socialistic pattern of society/i, from: ['D'] },
    'MPPSC-2014-065': { answer: ['D'], pattern: /Leader of the Opposition in the Rajya Sabha/i, from: ['B'] },
    'MPPSC-2014-069': { answer: ['B'], pattern: /six months/i, from: ['C'] },
  };
  for (const [id, expected] of Object.entries(expectations)) {
    const q = byId.get(id);
    assert.deepEqual(q.supplied_answer.answer, expected.answer, `${id}: corrected key in the bank`);
    const flags = q.explanation.option_explanations.filter((r) => r.is_correct).map((r) => r.key);
    assert.deepEqual(flags, expected.answer, `${id}: only the corrected option is marked correct`);
    assert.match(q.explanation.correct_reasoning, expected.pattern, `${id}: the reasoning states the verified fact`);
    assert.deepEqual(corrections.answer_corrections[id].from, expected.from, `${id}: the printed key is recorded`);
  }
});

test('the two 2014 disputes are recorded as resolved, not left hanging', () => {
  for (const id of ['MPPSC-2014-032', 'MPPSC-2014-065']) {
    const q = byId.get(id);
    assert.equal(q.dispute?.is_disputed, true, `${id}: the item carries a dispute block`);
    assert.equal(q.dispute?.status, 'resolved', `${id}: the dispute was settled`);
    assert.ok(q.dispute?.reason && q.dispute.reason.trim().length > 40, `${id}: the conflict is explained`);
  }
  const unresolved = audited.filter((q) => q.dispute?.status === 'unresolved');
  assert.deepEqual(unresolved.map((q) => q.id), [], 'no 2014 item is left unresolved');
});

test('verified 2014 answers are not quietly re-keyed', () => {
  const confirmed = {
    'MPPSC-2014-002': ['A'], // Balwant Rai Mehta, three tier panchayati raj
    'MPPSC-2014-031': ['D'], // Balaghat, highest sex ratio
    'MPPSC-2014-032': ['B'], // Mandla Plant Fossils National Park
    'MPPSC-2014-033': ['A'], // teak 17.8% of forest area
    'MPPSC-2014-034': ['B'], // irrigation potential 44.94 lakh
    'MPPSC-2014-037': ['D'], // graphite in Betul
    'MPPSC-2014-055': ['B'], // Red Data Book, IUCN
    'MPPSC-2014-061': ['B'], // Patel chaired the advisory committee
    'MPPSC-2014-067': ['B'], // collective fine, State Government
    'MPPSC-2014-072': ['B'], // PCR Act, Judicial Magistrate First Class
    'MPPSC-2014-081': ['B'], // Gaur dance, Mauriya
    'MPPSC-2014-092': ['B'], // Prabhash Joshi award, mallakhamb
    'MPPSC-2014-100': ['A'], // Ambedkar stadium, Faizabad
  };
  for (const [id, answer] of Object.entries(confirmed)) {
    assert.deepEqual(byId.get(id).supplied_answer.answer, answer, `${id}: confirmed key must not drift`);
    assert.equal(corrections.answer_corrections[id], undefined, `${id}: no correction is declared for a confirmed answer`);
  }
});

test('2014 option repairs are declared, quoted and in force', () => {
  const expected = {
    'MPPSC-2014-004': { A: { from: '', to: 'L.K. Advani' } },
    'MPPSC-2014-027': { A: { from: '', to: 'sikkim' } },
    'MPPSC-2014-035': { A: { from: '', to: 'ponds and swamps' } },
    'MPPSC-2014-041': { A: { from: '', to: '55 medals' } },
    'MPPSC-2014-055': { B: { from: 'W\\.', to: 'I.U.C.N.' }, C: { from: '', to: 'I.B.W.C.' }, D: { from: 'W\\.W.F.', to: 'W.W.F.' } },
    'MPPSC-2014-061': { B: { from: 'R. Ambedkar', to: 'Sardar Patel' }, C: { from: '', to: 'B.N. Rao' }, D: { from: '', to: 'B. R. Ambedkar' } },
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
  assert.deepEqual(emptied.map((q) => q.id), [], 'the six questions the source shipped with empty options are complete');
});

test('the byte question is complete in prose and named as the term-check exemption', () => {
  const declared = corrections.option_reasoning_complete.filter((id) => id.startsWith('MPPSC-2014-')).sort();
  assert.equal(declared.length, 100, 'every 2014 explanation is declared complete');
  assert.deepEqual(audit.summary.option_reasoning_declared_incomplete, [],
    'the audit records no half-finished 2014 item');
  // 2014-074 ("One byte has … 8-bits") is complete by every structural rule; the
  // anti-boilerplate term check simply has no five-letter word to match against.
  const q = byId.get('MPPSC-2014-074');
  assert.equal(q.explanation.option_explanations.length, 4);
  assert.ok(q.explanation.correct_reasoning.length > 40);
  const source = [q.language_variants.en.question_text, ...q.language_variants.en.options.map((o) => o.text)].join(' ');
  const words = source.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
  assert.ok(!words.some((w) => w.length >= 5),
    'the exemption is justified: the printed text holds no word of five letters or more');
});
