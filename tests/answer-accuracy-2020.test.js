/**
 * answer-accuracy-2020.test.js — the guard on what a learner is taught from the
 * 2020 paper.
 *
 * The 2020 final answer audit changed five printed keys (008, 032, 054, 076, 095)
 * and recorded four defective items as ambiguous (037, 045, 093, 098). This suite
 * protects those decisions and the invariants behind them:
 *
 *   1. the audit record covers all 100 questions of MPPSC-2020-P1 exactly once,
 *      and its counts are recomputed from the rows and reconcile;
 *   2. every stored answer agrees with its own option correctness flags, and no
 *      explanation names a letter that the stored answer does not contain;
 *   3. a question labelled ambiguous carries an unresolved dispute block, and an
 *      unresolved dispute in the bank cannot be labelled confirmed;
 *   4. every corrected answer is declared in reviewed-corrections.json with a
 *      stated basis whose `from` is the printed key and whose `to` is in the bank;
 *   5. the five corrected answers teach the verified fact, not the printed key.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2020.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2020);
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the 2020 audit covers every question of the paper exactly once', () => {
  assert.equal(audited.length, 100, 'one paper of 100 questions');
  assert.equal(audit.questions.length, 100, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2020-P1']);
  assert.deepEqual(audited.map((q) => q.question_number).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const record of audit.questions) {
    assert.equal(record.year, 2020, `${record.id}: year recorded`);
    assert.ok(record.note && record.note.trim().length > 20, `${record.id}: the row states why it was decided`);
  }
});

test('the recorded 2020 counts are recomputed from the rows and reconcile', () => {
  const counted = { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
  for (const record of audit.questions) {
    counted.reviewed += 1;
    counted[record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2020'], counted, 'per-year counts match the rows');
  assert.deepEqual(audit.summary.total, counted, 'totals reconcile');
  assert.equal(counted.reviewed, counted.confirmed + counted.corrected + counted.ambiguous, 'every row has exactly one status');
  assert.equal(counted.reviewed, 100);
  assert.equal(counted.corrected, audit.summary.total.corrected);
  assert.equal(counted.ambiguous, audit.summary.total.ambiguous);
  assert.equal(audit.summary.explanations_rebuilt, 100, 'every explanation was rebuilt, not left as scraped prose');
});

test('every stored 2020 answer agrees with its own option correctness flags', () => {
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

test('no 2020 explanation calls an option correct that the stored answer does not contain', () => {
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

test('2020 ambiguous items stay visibly flagged, and unresolved flags stay labelled ambiguous', () => {
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
  assert.ok(byId.get('MPPSC-2020-045').dispute.reason.includes('Tandra'), 'the Tantya Bhil naming conflict is spelled out');
  assert.ok(byId.get('MPPSC-2020-037').dispute.reason.includes('entry 37'), 'the two-entry elections item is spelled out');
});

test('every 2020 correction is declared in the manifest and reflected in the bank', () => {
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
  assert.deepEqual(corrections.final_audit_2020.corrected_ids.slice().sort(), corrected.map((r) => r.id).sort(),
    'the manifest summary lists exactly the corrected questions');
  assert.deepEqual(corrections.final_audit_2020.ambiguous_ids.slice().sort(),
    audit.questions.filter((r) => r.status === 'ambiguous').map((r) => r.id).sort(),
    'the manifest summary lists exactly the ambiguous questions');
  assert.equal(corrections.final_audit_2020.reviewed, audit.summary.total.reviewed);
});

test('the five corrected 2020 keys teach the verified fact', () => {
  const check = (id, answer, reasoningPattern, printed) => {
    const q = byId.get(id);
    assert.deepEqual(q.supplied_answer.answer, [answer], `${id}: stored answer`);
    const flags = q.explanation.option_explanations.filter((r) => r.is_correct).map((r) => r.key);
    assert.deepEqual(flags, [answer], `${id}: only the corrected option is marked correct`);
    assert.match(q.explanation.correct_reasoning, reasoningPattern, `${id}: reasoning states the fact`);
    assert.deepEqual(corrections.answer_corrections[id].from, [printed], `${id}: the printed key is recorded`);
  };
  // Oil India was a Navratna in January 2020; Coal India has been Maharatna since 2011.
  check('MPPSC-2020-008', 'D', /Oil India/i, 'B');
  // Kailash Satyarthi was born at Vidisha.
  check('MPPSC-2020-032', 'D', /Vidisha/i, 'B');
  // The 1956 Act created 14 states and 6 union territories.
  check('MPPSC-2020-054', 'B', /fourteen states and six union territories/i, 'A');
  // Bhagwat Dayal Sharma was Haryana's first Chief Minister and later MP's Governor.
  check('MPPSC-2020-076', 'D', /Haryana/i, 'B');
  // PUMA = Programmable Universal Machine for Assembly.
  check('MPPSC-2020-095', 'C', /Programmable Universal Machine for Assembly/i, 'B');
});

test('verified 2020 answers that differ from the printed key are not quietly re-keyed elsewhere', () => {
  // A guard against drift in the other direction: these answers were checked and
  // confirmed, so a later "cleanup" of the key must fail loudly here.
  const confirmed = {
    'MPPSC-2020-022': ['B'], // Gahora
    'MPPSC-2020-067': ['B'], // Arod (Aror) per the Chachnama
    'MPPSC-2020-072': ['D'], // Frank Anthony
    'MPPSC-2020-075': ['C'], // both (i) and (ii) true — the 101st Amendment amended Article 368(2)
    'MPPSC-2020-021': ['A'], // Dost Mohammad Khan founded Bhopal
    'MPPSC-2020-038': ['A'], // MP State Election Commission, 1 February 1994
  };
  for (const [id, answer] of Object.entries(confirmed)) {
    assert.deepEqual(byId.get(id).supplied_answer.answer, answer, `${id}: confirmed key must not drift`);
    assert.equal(corrections.answer_corrections[id], undefined, `${id}: no correction is declared for a confirmed answer`);
  }
});

test('2020 option repairs are declared and in place', () => {
  assert.deepEqual(corrections.option_corrections['MPPSC-2020-047'], { D: { from: 'Lucknow 1', to: 'Lucknow' } });
  assert.equal(byId.get('MPPSC-2020-047').language_variants.en.options.find((o) => o.key === 'D').text, 'Lucknow');
  assert.deepEqual(corrections.option_corrections['MPPSC-2020-100'], {
    B: { from: 'Coaching for Scheduled Tribe Students for sports 🔾🔾', to: 'Coaching for Scheduled Tribe Students for sports' },
  });
  assert.equal(byId.get('MPPSC-2020-100').language_variants.en.options.find((o) => o.key === 'B').text,
    'Coaching for Scheduled Tribe Students for sports');
});
