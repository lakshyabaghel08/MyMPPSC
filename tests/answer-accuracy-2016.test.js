/**
 * answer-accuracy-2016.test.js — the guard on what a learner is taught from the
 * 2016 paper.
 *
 * The 2016 final answer audit confirmed every printed key and recorded three
 * items as ambiguous (026, 032, 054). This suite protects those decisions and
 * the invariants behind them:
 *
 *   1. the audit record covers all 100 questions of MPPSC-2016-P1 exactly once,
 *      and its counts are recomputed from the rows and reconcile;
 *   2. every stored answer agrees with its own option correctness flags, and no
 *      explanation names a letter that the stored answer does not contain;
 *   3. a question labelled ambiguous carries an unresolved dispute block, and an
 *      unresolved dispute in the bank cannot be labelled confirmed;
 *   4. the audit corrected nothing, so no 2016 answer correction may be declared;
 *   5. verified answers are not quietly re-keyed;
 *   6. the scan repairs of the option text are declared, quoted and in force.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2016.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2016);
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the 2016 audit covers every question of the paper exactly once', () => {
  assert.equal(audited.length, 100, 'one paper of 100 questions');
  assert.equal(audit.questions.length, 100, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2016-P1']);
  assert.deepEqual(audited.map((q) => q.question_number).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const record of audit.questions) {
    assert.equal(record.year, 2016, `${record.id}: year recorded`);
    assert.ok(record.note && record.note.trim().length > 20, `${record.id}: the row states why it was decided`);
  }
});

test('the recorded 2016 counts are recomputed from the rows and reconcile', () => {
  const counted = { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
  for (const record of audit.questions) {
    counted.reviewed += 1;
    counted[record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2016'], counted, 'per-year counts match the rows');
  assert.deepEqual(audit.summary.total, counted, 'totals reconcile');
  assert.equal(counted.reviewed, counted.confirmed + counted.corrected + counted.ambiguous, 'every row has exactly one status');
  assert.equal(counted.reviewed, 100);
  assert.equal(counted.corrected, 0, 'the 2016 audit found no demonstrable key error');
  assert.equal(counted.ambiguous, 3, 'three items carry more than one defensible answer');
  assert.equal(audit.summary.explanations_rebuilt, 100, 'every explanation was rebuilt, not left as scraped prose');
});

test('every stored 2016 answer agrees with its own option correctness flags', () => {
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

test('no 2016 explanation calls an option correct that the stored answer does not contain', () => {
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

test('2016 ambiguous items stay visibly flagged, and unresolved flags stay labelled ambiguous', () => {
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
  assert.match(byId.get('MPPSC-2016-026').dispute.reason, /Third Five-Year Plan/, 'the plan-period disagreement is spelled out');
  assert.match(byId.get('MPPSC-2016-032').dispute.reason, /Chandi Prasad Bhatt/, 'the Chipko leadership problem is spelled out');
  assert.match(byId.get('MPPSC-2016-054').dispute.reason, /all-weather/, 'the PMGSY wording problem is spelled out');
});

test('the 2016 audit declares no answer correction', () => {
  assert.deepEqual(audit.summary.total.corrected, 0);
  assert.deepEqual(audit.summary.corrected_ids, []);
  const declared2016 = Object.keys(corrections.answer_corrections).filter((id) => id.startsWith('MPPSC-2016-'));
  assert.deepEqual(declared2016, [], 'no 2016 key is declared corrected');
  assert.deepEqual(corrections.final_audit_2016.corrected_ids, [], 'the manifest summary agrees');
  assert.deepEqual(
    corrections.final_audit_2016.ambiguous_ids.slice().sort(),
    audit.questions.filter((r) => r.status === 'ambiguous').map((r) => r.id).sort(),
    'the manifest summary lists exactly the ambiguous questions',
  );
  assert.equal(corrections.final_audit_2016.reviewed, audit.summary.total.reviewed);
  assert.equal(corrections.final_audit_2016.confirmed, audit.summary.total.confirmed);
});

test('verified 2016 answers are not quietly re-keyed', () => {
  const confirmed = {
    'MPPSC-2016-001': ['D'], // longest land frontier: Bangladesh
    'MPPSC-2016-012': ['A'], // Chambal badlands are a product of gully erosion
    'MPPSC-2016-031': ['B'], // Jal Purush: Rajendra Singh, printed Choudhary
    'MPPSC-2016-049': ['A'], // Gold Export Promotion Park at Indore
    'MPPSC-2016-053': ['A'], // first MP Mineral Policy, 1995
    'MPPSC-2016-070': ['B'], // Kaimur range divides the Yamuna from the Son
    'MPPSC-2016-074': ['C'], // Chambal valley sits in the Central India Plateau
    'MPPSC-2016-098': ['B'], // the untrue statement about the 1894 Act
  };
  for (const [id, answer] of Object.entries(confirmed)) {
    assert.deepEqual(byId.get(id).supplied_answer.answer, answer, `${id}: confirmed key must not drift`);
    assert.equal(corrections.answer_corrections[id], undefined, `${id}: no correction is declared for a confirmed answer`);
  }
});

test('2016 option repairs are declared, quoted and in force', () => {
  const expected = {
    'MPPSC-2016-004': {
      B: { from: 'III, 1, IV, II', to: 'III, I, IV, II' },
      C: { from: '1, III, IV, II', to: 'I, III, IV, II' },
      D: {
        from: 'III, IV, I, II Rank State Area (km2) 1 Rajasthan 342,239 2 Madhya Pradesh 308,245 3 Maharashtra 307,713 4 Uttar Pradesh 240,928 5 Gujarat 196,024 6 Karnataka 191,791 7 Andhra Pradesh 160,205 8 Odisha 155,707 9 Chhattisgarh 135,191 10 Tamil Nadu 130,058',
        to: 'III, IV, I, II',
      },
    },
    'MPPSC-2016-006': { B: { from: 'Sericulture.', to: 'Sericulture' } },
    'MPPSC-2016-022': { B: { from: 'kilocaloric', to: 'kilocalorie' } },
    'MPPSC-2016-079': { A: { from: "Raisen'", to: 'Raisen' } },
  };
  for (const [id, byKey] of Object.entries(expected)) {
    for (const [key, repair] of Object.entries(byKey)) {
      assert.deepEqual(corrections.option_corrections[id][key], repair, `${id} ${key}: repair quoted in the manifest`);
      const option = byId.get(id).language_variants.en.options.find((o) => o.key === key);
      assert.equal(option.text, repair.to, `${id} ${key}: repair is in force in the bank`);
    }
  }
  const repaired = Object.entries(corrections.option_corrections)
    .filter(([id]) => id.startsWith('MPPSC-2016-'));
  assert.equal(repaired.length, 4, 'four 2016 questions carry scan repairs');
});
