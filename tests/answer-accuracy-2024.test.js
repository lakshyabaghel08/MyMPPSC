/**
 * answer-accuracy-2024.test.js — the guard on what a learner is taught from the
 * 2024 paper.
 *
 * The 2024 final answer audit re-derived all 100 questions of MPPSC-2024-P1,
 * confirmed the keys the bank already carried except where the evidence
 * contradicts them (one printed key corrected, the cricket series), left the
 * Birha folk-song item 027 flagged rather than forced to a single letter, and
 * rebuilt every explanation to the per-option standard. Five numbers the
 * extraction never printed are app-authored model questions, declared as such.
 * This suite protects those decisions:
 *
 *   1. the audit record covers all 100 questions exactly once, and its counts are
 *      recomputed from the rows and reconcile;
 *   2. every stored answer agrees with its own option correctness flags;
 *   3. every correction is declared with a stated basis whose `from` is the
 *      printed key and whose `to` is in the bank;
 *   4. the two-answer item 029 and the disputed item 027 are recorded, not
 *      hidden;
 *   5. the option repairs the paper carries are quoted and in force;
 *   6. every 2024 explanation is declared complete, the model questions included.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2024.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2024);
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the 2024 audit covers every question of the paper exactly once', () => {
  assert.equal(audited.length, 100, 'one paper of 100 questions');
  assert.equal(audit.questions.length, 100, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2024-P1']);
  assert.deepEqual(audited.map((q) => q.question_number).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const record of audit.questions) {
    assert.equal(record.year, 2024, `${record.id}: year recorded`);
    assert.ok(record.note && record.note.trim().length > 20, `${record.id}: the row states why it was decided`);
    assert.equal(record.option_reasons, 4, `${record.id}: four reasoned options`);
    assert.equal(record.explanation_rebuilt, true, `${record.id}: the explanation was rebuilt`);
  }
});

test('the recorded 2024 counts are recomputed from the rows and reconcile', () => {
  const counted = { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
  for (const record of audit.questions) {
    counted.reviewed += 1;
    counted[record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2024'], counted, 'per-year counts match the rows');
  assert.deepEqual(audit.summary.total, counted, 'totals reconcile');
  assert.equal(counted.reviewed, counted.confirmed + counted.corrected + counted.ambiguous, 'every row has exactly one status');
  assert.equal(counted.reviewed, 100);
  assert.equal(counted.corrected, 5, 'the five printed keys the paper corrects are recorded');
  assert.equal(counted.ambiguous, 1, 'exactly one item is recorded as undecided');
  assert.equal(audit.summary.explanations_rebuilt, 100, 'every explanation was rebuilt');
  assert.equal(audit.summary.printed_keys_compared, 100, 'the printed key was compared for every question');
  assert.equal(audit.summary.option_reasoning_declared_incomplete.length, 0, 'no half-finished item is left behind');
});

test('every stored 2024 answer agrees with its own option correctness flags', () => {
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

test('every 2024 correction is declared, quoted and reflected in the bank', () => {
  const corrected = audit.questions.filter((r) => r.status === 'corrected');
  assert.equal(corrected.length, 5, 'five corrections are recorded for this paper');
  for (const record of corrected) {
    const declaration = corrections.answer_corrections[record.id];
    assert.ok(declaration, `${record.id}: correction is declared in reviewed-corrections.json`);
    assert.ok(declaration.basis && declaration.basis.trim().length > 20, `${record.id}: correction states a basis`);
    assert.deepEqual(record.printed_key, declaration.from, `${record.id}: the record quotes the printed key`);
    assert.deepEqual(record.answer, declaration.to, `${record.id}: the record quotes the corrected key`);
    assert.deepEqual(byId.get(record.id).supplied_answer.answer, declaration.to, `${record.id}: bank carries the corrected key`);
  }
  assert.deepEqual(corrections.final_audit_2024.corrected_ids.slice().sort(), corrected.map((r) => r.id).sort(),
    'the manifest summary lists exactly the corrected questions');
  assert.equal(corrections.final_audit_2024.reviewed, audit.summary.total.reviewed);
  assert.equal(corrections.final_audit_2024.corrected, 5);
  assert.equal(corrections.final_audit_2024.ambiguous, 1);
});

test('the disputed Birha item of 027 is kept as printed and stays flagged', () => {
  const q = byId.get('MPPSC-2024-027');
  assert.deepEqual(q.supplied_answer.answer, ['A'], 'the paper keys Gond');
  const flags = q.explanation.option_explanations.filter((r) => r.is_correct).map((r) => r.key);
  assert.deepEqual(flags, ['A'], 'only the keyed option is ticked');
  assert.equal(records.get('MPPSC-2024-027').status, 'ambiguous', 'the item is recorded as undecided, not as confirmed');
  assert.equal(q.dispute?.status, 'unresolved', 'the looseness of the question stays on record');
  assert.ok(q.dispute?.reason && q.dispute.reason.trim().length > 40, 'and is explained');
  assert.match(q.explanation.correct_reasoning, /Kol/, 'the reasoning says why B is arguable');
  assert.equal(corrections.final_audit_2024.ambiguous_ids.includes('MPPSC-2024-027'), true,
    'the manifest summary names the flagged item');
});

test('the two-answer printed key of 029 is settled by the audit, not hidden', () => {
  const q = byId.get('MPPSC-2024-029');
  assert.deepEqual(q.supplied_answer.answer, ['C'], 'the bank carries the single settled answer');
  const declaration = corrections.answer_corrections['MPPSC-2024-029'];
  assert.deepEqual(declaration.from, ['B', 'C'], 'the manifest quotes both printed letters');
  assert.deepEqual(declaration.to, ['C'], 'and the letter the evidence supports');
  const flags = q.explanation.option_explanations.filter((r) => r.is_correct).map((r) => r.key);
  assert.deepEqual(flags, ['C'], 'the option flags follow the settled key');
});

test('the option repairs the paper carries are quoted in the manifest and in force', () => {
  const expected = {
    'MPPSC-2024-006': { D: { from: '33 2', to: '33' } },
    'MPPSC-2024-020': { D: { from: 'State list 8', to: 'State list' } },
    'MPPSC-2024-036': { D: { from: 'Beti Bachao Beti Padhao Abhiyan and Sukanya Samriddhi Yojana 3', to: 'Beti Bachao Beti Padhao Abhiyan and Sukanya Samriddhi Yojana' } },
    'MPPSC-2024-061': { D: { from: 'Hemchandra Bandopadhyay 5', to: 'Hemchandra Bandopadhyay' } },
    'MPPSC-2024-075': { D: { from: 'La Nina strengthens the Indian Monsoon. 0', to: 'La Nina strengthens the Indian Monsoon.' } },
    'MPPSC-2024-097': { D: { from: 'Khargone 9', to: 'Khargone' } },
  };
  for (const [id, byKey] of Object.entries(expected)) {
    for (const [key, repair] of Object.entries(byKey)) {
      assert.deepEqual(corrections.option_corrections[id][key], repair, `${id} ${key}: repair quoted in the manifest`);
      const option = byId.get(id).language_variants.en.options.find((o) => o.key === key);
      assert.equal(option.text, repair.to, `${id} ${key}: repair is in force in the bank`);
    }
  }
  const declared = Object.keys(corrections.option_corrections).filter((id) => id.startsWith('MPPSC-2024-')).sort();
  assert.deepEqual(declared, Object.keys(expected).sort(), 'this pass added no new option repair outside the six declared');
  const emptied = audited.filter((q) => q.language_variants.en.options.some((o) => !o.text || !o.text.trim()));
  assert.deepEqual(emptied.map((q) => q.id), [], 'no 2024 question has an empty option');
});

test('verified 2024 answers are not quietly re-keyed', () => {
  const confirmed = {
    'MPPSC-2024-012': ['A'], // the false statement about the Chambal ravines
    'MPPSC-2024-038': ['D'], // Chinnor rice, Balaghat
    'MPPSC-2024-043': ['A'], // kept as keyed
    'MPPSC-2024-056': ['C'], // bamboo nationalisation, 1973
    'MPPSC-2024-082': ['C'], // Sudha Murty, the twelfth nominated seat
    'MPPSC-2024-092': ['A'], // Shatpath Brahman, the first literary mention of the Narmada
    'MPPSC-2024-093': ['B'], // Varahamihira, Kayatha
    'MPPSC-2024-096': ['C'], // Kudgarya, the Gammat sutradhar
    'MPPSC-2024-100': ['B'], // the closing question of the paper
  };
  for (const [id, answer] of Object.entries(confirmed)) {
    assert.deepEqual(byId.get(id).supplied_answer.answer, answer, `${id}: confirmed key must not drift`);
  }
  // 096 was never mis-keyed: the extraction, the bank and this audit all print C,
  // so it must not appear as a correction.
  assert.equal(corrections.answer_corrections['MPPSC-2024-096'], undefined,
    'no correction is declared for a key that was never wrong');
});

test('every 2024 explanation is declared complete, the model questions included', () => {
  const declared = corrections.option_reasoning_complete.filter((id) => id.startsWith('MPPSC-2024-')).sort();
  assert.equal(declared.length, 100, 'every 2024 explanation is declared complete');
  assert.deepEqual(audit.summary.option_reasoning_declared_incomplete, [],
    'the audit records no half-finished 2024 item');
  for (const q of audited) {
    assert.ok(q.explanation.correct_reasoning.length >= 140, `${q.id}: the reasoning is a real explanation`);
    assert.ok(Array.isArray(q.explanation.key_concepts) && q.explanation.key_concepts.length >= 2, `${q.id}: concepts listed`);
    assert.ok(Array.isArray(q.explanation.revision_takeaways) && q.explanation.revision_takeaways.length >= 1, `${q.id}: takeaway listed`);
  }
  // Five printed numbers were never captured, so the app-authored records that
  // fill them are declared separately instead of being passed off as recovered text.
  assert.deepEqual(audit.summary.model_questions.slice().sort(),
    ['MPPSC-2024-019', 'MPPSC-2024-039', 'MPPSC-2024-073', 'MPPSC-2024-081', 'MPPSC-2024-091'],
    'the app-authored questions of this paper are named');
  for (const id of audit.summary.model_questions) {
    assert.equal(byId.get(id).metadata?.model_question, true, `${id}: flagged as a model question in the bank`);
  }
});
