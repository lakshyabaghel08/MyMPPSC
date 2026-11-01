/**
 * answer-accuracy.test.js — the guard on what a learner is actually taught.
 *
 * The 2021–2024 audit changed one stored key (2021-010, phosphatase test) and
 * recorded seven defective items as ambiguous. This suite protects those
 * decisions and, more importantly, the invariants behind them:
 *
 *   1. every question of 2021–2024 carries a classification in the audit record,
 *      and the record's counts reconcile with the bank (computed, not copied);
 *   2. every stored answer agrees with its own option correctness flags;
 *   3. every explanation that names an option as "correct" names one that is in
 *      the stored answer;
 *   4. a question labelled ambiguous is flagged as disputed in the bank, and a
 *      question flagged unresolved is labelled ambiguous in the record;
 *   5. every corrected answer is declared in reviewed-corrections.json with a
 *      basis, and the declaration matches the bank.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2021-2024.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const YEARS = [2021, 2022, 2023, 2024];
const audited = bank.questions.filter((q) => YEARS.includes(Number(q.year)));
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the audit covers every question of 2021–2024 exactly once', () => {
  assert.equal(audited.length, 400, 'four papers of 100 questions');
  assert.equal(audit.questions.length, 400, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  for (const year of YEARS) {
    assert.equal(audited.filter((q) => Number(q.year) === year).length, 100, `${year}: 100 questions`);
    assert.equal(audit.questions.filter((r) => r.year === year).length, 100, `${year}: 100 audited rows`);
  }
});

test('the recorded counts are computed from the bank and reconcile', () => {
  const counted = {};
  for (const record of audit.questions) {
    counted[record.year] = counted[record.year] || { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
    counted[record.year].reviewed += 1;
    counted[record.year][record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year, counted, 'per-year counts match the rows');
  const total = Object.values(counted).reduce((acc, year) => {
    for (const key of Object.keys(year)) acc[key] = (acc[key] || 0) + year[key];
    return acc;
  }, {});
  assert.deepEqual(audit.summary.total, total, 'totals reconcile');
  for (const year of Object.values(counted)) {
    assert.equal(year.reviewed, year.confirmed + year.corrected + year.ambiguous, 'each year adds up');
  }
  assert.equal(audit.summary.total.reviewed, 400);
});

test('every stored answer agrees with its own option correctness flags', () => {
  const offenders = [];
  for (const q of audited) {
    const rows = q.explanation?.option_explanations;
    if (!rows) continue;
    const answer = new Set(q.supplied_answer.answer.map((x) => String(x).toUpperCase()));
    const flagged = new Set(rows.filter((r) => r.is_correct === true).map((r) => r.key));
    const same = flagged.size === answer.size && [...flagged].every((k) => answer.has(k));
    if (!same) offenders.push(`${q.id}: flags ${[...flagged].join(',') || 'none'} vs answer ${[...answer].join(',') || 'none'}`);
  }
  assert.deepEqual(offenders, [], `answer/flag contradictions:\n${offenders.join('\n')}`);
});

test('no explanation calls an option correct that the stored answer does not contain', () => {
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

test('ambiguous questions stay visibly flagged, and unresolved flags stay labelled ambiguous', () => {
  for (const record of audit.questions) {
    const q = byId.get(record.id);
    if (record.status === 'ambiguous') {
      assert.equal(q.dispute?.is_disputed, true, `${record.id}: ambiguous questions carry a dispute block`);
      assert.equal(q.dispute?.status, 'unresolved', `${record.id}: ambiguity is recorded as unresolved`);
      assert.ok(q.dispute?.reason && q.dispute.reason.trim().length > 40, `${record.id}: the ambiguity is explained`);
      assert.ok(record.note, `${record.id}: the audit record says what is wrong with the item`);
      continue;
    }
    if (q.dispute?.status === 'unresolved') {
      assert.equal(record.status, 'ambiguous', `${record.id}: an unresolved flag must be labelled ambiguous in the audit`);
    }
  }
});

test('every correction is declared in the manifest and reflected in the bank', () => {
  const corrected = audit.questions.filter((r) => r.status === 'corrected');
  assert.ok(corrected.length > 0, 'the audit recorded at least one correction');
  for (const record of corrected) {
    const declaration = corrections.answer_corrections[record.id];
    assert.ok(declaration, `${record.id}: correction is declared in reviewed-corrections.json`);
    assert.ok(declaration.basis && declaration.basis.trim().length > 20, `${record.id}: correction states a basis`);
    assert.deepEqual(byId.get(record.id).supplied_answer.answer, declaration.to, `${record.id}: bank carries the corrected key`);
    assert.notDeepEqual(declaration.from, declaration.to, `${record.id}: a correction changes something`);
    assert.deepEqual(record.answer, declaration.to, `${record.id}: audit record quotes the corrected key`);
  }
  assert.deepEqual(
    [...audit.summary.total && corrections.final_audit_2021_2024.corrected_ids].sort(),
    corrected.map((r) => r.id).sort(),
    'the manifest summary lists exactly the corrected questions',
  );
  assert.deepEqual(
    corrections.final_audit_2021_2024.ambiguous_ids.slice().sort(),
    audit.questions.filter((r) => r.status === 'ambiguous').map((r) => r.id).sort(),
    'the manifest summary lists exactly the ambiguous questions',
  );
  assert.equal(corrections.final_audit_2021_2024.reviewed, audit.summary.total.reviewed);
});

test('the 2021-010 phosphatase answer teaches milk, not the printed key', () => {
  const q = byId.get('MPPSC-2021-010');
  assert.deepEqual(q.supplied_answer.answer, ['A']);
  const flags = q.explanation.option_explanations.filter((r) => r.is_correct).map((r) => r.key);
  assert.deepEqual(flags, ['A']);
  assert.match(q.explanation.correct_reasoning, /milk/i);
  assert.equal(q.dispute?.status, 'resolved', 'the official-key error is recorded, not hidden');
});
