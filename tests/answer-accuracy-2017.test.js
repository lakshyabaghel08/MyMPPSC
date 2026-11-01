/**
 * answer-accuracy-2017.test.js — the guard on what a learner is taught from the
 * 2017 paper.
 *
 * The 2017 final answer audit changed one printed key (100) and recorded three
 * items as ambiguous (043, 054, 059). This suite protects those decisions and
 * the invariants behind them:
 *
 *   1. the audit record covers all 100 questions of MPPSC-2017-P1 exactly once,
 *      and its counts are recomputed from the rows and reconcile;
 *   2. every stored answer agrees with its own option correctness flags, and no
 *      explanation names a letter that the stored answer does not contain;
 *   3. a question labelled ambiguous carries an unresolved dispute block, and an
 *      unresolved dispute in the bank cannot be labelled confirmed;
 *   4. every corrected answer is declared in reviewed-corrections.json with a
 *      stated basis whose `from` is the printed key and whose `to` is in the bank;
 *   5. the corrected answer teaches the verified fact rather than the printed key;
 *   6. the scan repairs of the option text are declared, quoted and in force.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2017.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2017);
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the 2017 audit covers every question of the paper exactly once', () => {
  assert.equal(audited.length, 100, 'one paper of 100 questions');
  assert.equal(audit.questions.length, 100, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2017-P1']);
  assert.deepEqual(audited.map((q) => q.question_number).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const record of audit.questions) {
    assert.equal(record.year, 2017, `${record.id}: year recorded`);
    assert.ok(record.note && record.note.trim().length > 20, `${record.id}: the row states why it was decided`);
  }
});

test('the recorded 2017 counts are recomputed from the rows and reconcile', () => {
  const counted = { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
  for (const record of audit.questions) {
    counted.reviewed += 1;
    counted[record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2017'], counted, 'per-year counts match the rows');
  assert.deepEqual(audit.summary.total, counted, 'totals reconcile');
  assert.equal(counted.reviewed, counted.confirmed + counted.corrected + counted.ambiguous, 'every row has exactly one status');
  assert.equal(counted.reviewed, 100);
  assert.equal(counted.corrected, audit.summary.total.corrected);
  assert.equal(counted.ambiguous, audit.summary.total.ambiguous);
  assert.equal(audit.summary.explanations_rebuilt, 100, 'every explanation was rebuilt, not left as scraped prose');
});

test('every stored 2017 answer agrees with its own option correctness flags', () => {
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

test('no 2017 explanation calls an option correct that the stored answer does not contain', () => {
  const offenders = [];
  const pattern = /Hence option ([A-D])(?: \([^)]+\))? is (?:the )?(?:correct|answer)/g;
  for (const q of audited) {
    const reasoning = String(q.explanation?.correct_reasoning || '');
    const answer = new Set(q.supplied_answer.answer.map((x) => String(x).toUpperCase()));
    for (const match of reasoning.matchAll(pattern)) {
      if (!answer.has(match[1])) offenders.push(`${q.id}: explanation says ${match[1]}, answer is ${[...answer].join(',')}`);
    }
  }
  assert.deepEqual(offenders, [], `explanation/answer contradictions:\n${offenders.join('\n')}`);
});

test('2017 ambiguous items stay visibly flagged, and unresolved flags stay labelled ambiguous', () => {
  for (const record of audit.questions) {
    const q = byId.get(record.id);
    if (record.status === 'ambiguous') {
      assert.equal(q.dispute?.is_disputed, true, `${record.id}: ambiguous questions carry a dispute block`);
      assert.equal(q.dispute?.status, 'unresolved', `${record.id}: ambiguity is recorded as unresolved`);
      assert.ok(q.dispute?.reason && q.dispute.reason.trim().length > 40, `${record.id}: the ambiguity is explained`);
      continue;
    }
    if (q.dispute?.status === 'unresolved') {
      assert.equal(record.status, 'ambiguous', `${record.id}: an unresolved flag must be labelled ambiguous in the audit`);
    }
  }
  assert.match(byId.get('MPPSC-2017-043').dispute.reason, /2021/, 'the T20 World Cup date problem is spelled out');
  assert.match(byId.get('MPPSC-2017-054').dispute.reason, /Jahaz Mahal/, 'the Mandu palace attribution problem is spelled out');
  assert.match(byId.get('MPPSC-2017-059').dispute.reason, /2019 amendment/, 'the NHRC tenure change is spelled out');
});

test('every 2017 correction is declared in the manifest and reflected in the bank', () => {
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
  assert.deepEqual(corrections.final_audit_2017.corrected_ids.slice().sort(), corrected.map((r) => r.id).sort(),
    'the manifest summary lists exactly the corrected questions');
  assert.deepEqual(corrections.final_audit_2017.ambiguous_ids.slice().sort(),
    audit.questions.filter((r) => r.status === 'ambiguous').map((r) => r.id).sort(),
    'the manifest summary lists exactly the ambiguous questions');
  assert.equal(corrections.final_audit_2017.reviewed, audit.summary.total.reviewed);
});

test('the corrected 2017 key teaches the verified fact', () => {
  const q = byId.get('MPPSC-2017-100');
  assert.deepEqual(q.supplied_answer.answer, ['C'], 'the IMF lends to member countries only');
  const flags = q.explanation.option_explanations.filter((r) => r.is_correct).map((r) => r.key);
  assert.deepEqual(flags, ['C'], 'only the corrected option is marked correct');
  assert.match(q.explanation.correct_reasoning, /member countries/i, 'the reasoning states the membership condition');
  assert.deepEqual(corrections.answer_corrections['MPPSC-2017-100'].from, ['B'], 'the printed key is recorded');
});

test('verified 2017 answers are not quietly re-keyed elsewhere', () => {
  const confirmed = {
    'MPPSC-2017-001': ['A'], // Ghazi (printed Ghani) Malik = Ghiyasuddin Tughlaq
    'MPPSC-2017-030': ['D'], // vitamin D belongs to McCollum, not Paul Muller
    'MPPSC-2017-051': ['C'], // constitutional autocracy, Government of India Act 1935
    'MPPSC-2017-071': ['D'], // Bhawani Prasad Mishra was born in Hoshangabad district
    'MPPSC-2017-085': ['C'], // the same IMF question is keyed C at 85
    'MPPSC-2017-087': ['A'], // the IPL 2016 final was played in Bengaluru, Karnataka
  };
  for (const [id, answer] of Object.entries(confirmed)) {
    assert.deepEqual(byId.get(id).supplied_answer.answer, answer, `${id}: confirmed key must not drift`);
    assert.equal(corrections.answer_corrections[id], undefined, `${id}: no correction is declared for a confirmed answer`);
  }
});

test('2017 option repairs are declared, quoted and in force', () => {
  const expected = {
    'MPPSC-2017-030': {
      A: { from: 'Vitamin A- Maculan', to: 'Vitamin A- McCollum' },
      B: { from: 'Vitemin B- Maculan', to: 'Vitamin B- McCollum' },
      C: { from: 'Vitemin C- James Lind', to: 'Vitamin C- James Lind' },
    },
    'MPPSC-2017-051': { C: { from: 'The Government of India Act of 1935 [', to: 'The Government of India Act of 1935' } },
    'MPPSC-2017-054': { D: { from: 'Hoshang Shah [P.T.O.', to: 'Hoshang Shah' } },
    'MPPSC-2017-058': { C: { from: 'N. M. Lolchande', to: 'N. M. Lokhande' } },
    'MPPSC-2017-077': { C: { from: 'Russin', to: 'Russia' } },
  };
  for (const [id, byKey] of Object.entries(expected)) {
    for (const [key, repair] of Object.entries(byKey)) {
      assert.deepEqual(corrections.option_corrections[id][key], repair, `${id} ${key}: repair quoted in the manifest`);
      const option = byId.get(id).language_variants.en.options.find((o) => o.key === key);
      assert.equal(option.text, repair.to, `${id} ${key}: repair is in force in the bank`);
    }
  }
});
