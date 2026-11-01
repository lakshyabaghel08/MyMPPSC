/**
 * answer-accuracy-2019.test.js — the guard on what a learner is taught from the
 * 2019 paper.
 *
 * The 2019 final answer audit changed five printed keys (027, 046, 060, 074, 097)
 * and recorded two defective items as ambiguous (002, 067). This suite protects
 * those decisions and the invariants behind them:
 *
 *   1. the audit record covers all 100 questions of MPPSC-2019-P1 exactly once,
 *      and its counts are recomputed from the rows and reconcile;
 *   2. every stored answer agrees with its own option correctness flags, and no
 *      explanation names a letter that the stored answer does not contain;
 *   3. a question labelled ambiguous carries an unresolved dispute block, and an
 *      unresolved dispute in the bank cannot be labelled confirmed;
 *   4. every corrected answer is declared in reviewed-corrections.json with a
 *      stated basis whose `from` is the printed key and whose `to` is in the bank;
 *   5. the five corrected answers teach the verified fact, not the printed key;
 *   6. the answers that were checked and confirmed cannot drift later;
 *   7. the five app-authored model questions are honest about having no printed key.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections, disputesFile] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2019.json'),
  readJson('pyq', 'reviewed-corrections.json'),
  readJson('pyq', 'reviewed-disputes.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2019);
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the 2019 audit covers every question of the paper exactly once', () => {
  assert.equal(audited.length, 100, 'one paper of 100 questions');
  assert.equal(audit.questions.length, 100, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2019-P1']);
  assert.deepEqual(audited.map((q) => q.question_number).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const record of audit.questions) {
    assert.equal(record.year, 2019, `${record.id}: year recorded`);
    assert.ok(record.note && record.note.trim().length > 20, `${record.id}: the row states why it was decided`);
    assert.equal(record.option_reasons, 4, `${record.id}: four option reasons are recorded`);
  }
});

test('the recorded 2019 counts are recomputed from the rows and reconcile', () => {
  const counted = { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
  for (const record of audit.questions) {
    counted.reviewed += 1;
    counted[record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2019'], counted, 'per-year counts match the rows');
  assert.deepEqual(audit.summary.total, counted, 'totals reconcile');
  assert.equal(counted.reviewed, counted.confirmed + counted.corrected + counted.ambiguous, 'every row has exactly one status');
  assert.equal(counted.reviewed, 100);
  assert.equal(counted.corrected, audit.summary.total.corrected);
  assert.equal(counted.ambiguous, audit.summary.total.ambiguous);
  assert.deepEqual(counted, { reviewed: 100, confirmed: 93, corrected: 5, ambiguous: 2 });
  assert.equal(audit.summary.explanations_rebuilt, 100, 'every explanation was rebuilt, not left as scraped prose');
  // The manifest carries the same summary as the audit record.
  assert.deepEqual(corrections.final_audit_2019.corrected_ids.slice().sort(),
    audit.questions.filter((r) => r.status === 'corrected').map((r) => r.id).sort(),
    'the manifest lists exactly the corrected questions');
  assert.deepEqual(corrections.final_audit_2019.ambiguous_ids.slice().sort(),
    audit.questions.filter((r) => r.status === 'ambiguous').map((r) => r.id).sort(),
    'the manifest lists exactly the ambiguous questions');
});

test('every stored 2019 answer agrees with its own option correctness flags', () => {
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

test('no 2019 explanation calls an option correct that the stored answer does not contain', () => {
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

test('2019 ambiguous items stay visibly flagged, and unresolved flags stay labelled ambiguous', () => {
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
  assert.ok(byId.get('MPPSC-2019-002').dispute.reason.includes('Jayaprakash Narayan'),
    'the partyless democracy conflict is spelled out');
  assert.ok(byId.get('MPPSC-2019-067').dispute.reason.includes('243ZA'),
    'the 243K/243ZA defect is spelled out');
  // Two items are flagged but resolved, with the reading stated rather than hidden.
  assert.equal(byId.get('MPPSC-2019-066').dispute.status, 'resolved', 'the panchayat count is date-dependent, not wrong');
  assert.equal(byId.get('MPPSC-2019-100').dispute.status, 'resolved', 'the boundary list is incomplete, not wrong');
  assert.equal(disputesFile.disputes['MPPSC-2019-066'].status, 'resolved');
});

test('every 2019 correction is declared in the manifest and reflected in the bank', () => {
  const corrected = audit.questions.filter((r) => r.status === 'corrected');
  assert.equal(corrected.length, 5, 'five printed keys were corrected');
  for (const record of corrected) {
    const declaration = corrections.answer_corrections[record.id];
    assert.ok(declaration, `${record.id}: correction is declared in reviewed-corrections.json`);
    assert.ok(declaration.basis && declaration.basis.trim().length > 20, `${record.id}: correction states a basis`);
    assert.deepEqual(record.printed_key, declaration.from, `${record.id}: the record quotes the printed key`);
    assert.deepEqual(record.answer, declaration.to, `${record.id}: the record quotes the corrected key`);
    assert.notDeepEqual(declaration.from, declaration.to, `${record.id}: a correction changes something`);
    assert.deepEqual(byId.get(record.id).supplied_answer.answer, declaration.to, `${record.id}: bank carries the corrected key`);
  }
});

test('the five corrected 2019 keys teach the verified fact', () => {
  const check = (id, answer, reasoningPattern, printed) => {
    const q = byId.get(id);
    assert.deepEqual(q.supplied_answer.answer, [answer], `${id}: stored answer`);
    const flags = q.explanation.option_explanations.filter((r) => r.is_correct).map((r) => r.key);
    assert.deepEqual(flags, [answer], `${id}: only the corrected option is marked correct`);
    assert.match(q.explanation.correct_reasoning, reasoningPattern, `${id}: reasoning states the fact`);
    assert.deepEqual(corrections.answer_corrections[id].from, printed, `${id}: the printed key is recorded`);
  };
  // Section 6(2) of the Human Rights Act allows a Member's re-appointment, so only "not eligible" is false.
  check('MPPSC-2019-027', 'C', /re-appointment/, ['A', 'B', 'C']);
  // Karewas are a Kashmir valley landform.
  check('MPPSC-2019-046', 'D', /Karewa/, ['C']);
  // Kathi is the Nimar folk dance; the bamboo kathi is only its prop.
  check('MPPSC-2019-060', 'D', /Nimar/, ['C']);
  // A keyboard is an input device, so only plotter-printer-monitor are all outputs.
  check('MPPSC-2019-074', 'D', /keyboard/i, ['B']);
  // Old NH-8 ran Delhi-Jaipur-Ahmedabad-Mumbai, never entering Madhya Pradesh.
  check('MPPSC-2019-097', 'D', /NH-8/, ['A']);
});

test('verified 2019 answers that were not changed cannot be quietly re-keyed elsewhere', () => {
  const confirmed = {
    'MPPSC-2019-002': ['C', 'D'], // partyless democracy — JP Narayan and Gandhi, kept ambiguous
    'MPPSC-2019-018': ['D'], // Justice Anshuman Singh, Rajasthan and Gujarat but never MP
    'MPPSC-2019-043': ['A', 'B'], // both Tarikh-i-Firozshahi authors
    'MPPSC-2019-057': ['C', 'D'], // Patelia belongs to the Bhil entry; Mahar is not Korku
    'MPPSC-2019-066': ['C'], // five panchayat general elections by 2019
    'MPPSC-2019-079': ['B'], // Exclusive Special Court is section 2(bd), not 2(d)
    'MPPSC-2019-100': ['B'], // Nepal, Pakistan, China, Bangladesh
  };
  for (const [id, answer] of Object.entries(confirmed)) {
    assert.deepEqual(byId.get(id).supplied_answer.answer, answer, `${id}: confirmed key must not drift`);
    assert.equal(corrections.answer_corrections[id], undefined, `${id}: no correction is declared for a confirmed answer`);
  }
});

test('the five app-authored 2019 model questions carry no invented printed key', () => {
  const models = audit.questions.filter((r) => r.model_question);
  assert.deepEqual(models.map((r) => r.id).sort(),
    ['MPPSC-2019-044', 'MPPSC-2019-047', 'MPPSC-2019-061', 'MPPSC-2019-075', 'MPPSC-2019-098']);
  for (const record of models) {
    assert.equal(record.printed_key, null, `${record.id}: no printed key is claimed`);
    assert.match(record.note, /no printed key/, `${record.id}: the row says why`);
    assert.equal(record.status, 'confirmed', `${record.id}: the answer was still verified`);
  }
  // Every other question does have a printed key recorded, and it is a key.
  for (const record of audit.questions.filter((r) => !r.model_question)) {
    assert.ok(Array.isArray(record.printed_key) && record.printed_key.length > 0, `${record.id}: printed key recorded`);
  }
  assert.equal(audit.summary.printed_keys_compared, 95);
});
