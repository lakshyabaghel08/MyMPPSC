/**
 * answer-accuracy-2018.test.js — the guard on what a learner is taught from the
 * 2018 paper.
 *
 * The 2018 final answer audit confirmed 96 printed keys, changed none, and
 * recorded four items as ambiguous/defective (015 women elected in 2013, 019
 * Kalika Purana, 055 Dhoopgarh, 078 cyber crime features). It also repaired
 * three pieces of scan damage in the option text. This suite protects those
 * decisions and the invariants behind them:
 *
 *   1. the audit record covers all 100 questions of MPPSC-2018-P1 exactly once,
 *      and its counts are recomputed from the rows and reconcile;
 *   2. every stored answer agrees with its own option correctness flags;
 *   3. a question labelled ambiguous carries an unresolved dispute block, and an
 *      unresolved dispute in the bank cannot be labelled confirmed;
 *   4. the audit corrects no printed key, so nothing 2018 appears in the answer
 *      correction manifest;
 *   5. the three option repairs are declared, quoted from the printed text and in
 *      force in the bank;
 *   6. the answers that were checked and confirmed cannot drift later;
 *   7. the paper carries no app-authored model question, and every question has a
 *      printed key on record.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const [bank, audit, corrections, disputesFile] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2018.json'),
  readJson('pyq', 'reviewed-corrections.json'),
  readJson('pyq', 'reviewed-disputes.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2018);
const byId = new Map(audited.map((q) => [q.id, q]));
const records = new Map(audit.questions.map((r) => [r.id, r]));

test('the 2018 audit covers every question of the paper exactly once', () => {
  assert.equal(audited.length, 100, 'one paper of 100 questions');
  assert.equal(audit.questions.length, 100, 'the audit record has one row per question');
  assert.deepEqual([...records.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2018-P1']);
  assert.deepEqual(audited.map((q) => q.question_number).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const record of audit.questions) {
    assert.equal(record.year, 2018, `${record.id}: year recorded`);
    assert.equal(record.paper_id, 'MPPSC-2018-P1', `${record.id}: paper recorded`);
    assert.ok(record.note && record.note.trim().length > 20, `${record.id}: the row states why it was decided`);
    assert.equal(record.option_reasons, 4, `${record.id}: four option reasons are recorded`);
    assert.equal(record.explanation_rebuilt, true, `${record.id}: the explanation was rebuilt`);
  }
});

test('the recorded 2018 counts are recomputed from the rows and reconcile', () => {
  const counted = { reviewed: 0, confirmed: 0, corrected: 0, ambiguous: 0 };
  for (const record of audit.questions) {
    counted.reviewed += 1;
    counted[record.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2018'], counted, 'per-year counts match the rows');
  assert.deepEqual(audit.summary.total, counted, 'totals reconcile');
  assert.equal(counted.reviewed, counted.confirmed + counted.corrected + counted.ambiguous, 'every row has exactly one status');
  assert.deepEqual(counted, { reviewed: 100, confirmed: 96, corrected: 0, ambiguous: 4 });
  assert.equal(audit.summary.explanations_rebuilt, 100, 'every explanation was rebuilt, not left as scraped prose');
  assert.equal(audit.summary.printed_keys_compared, 100, 'every question had a printed key to compare against');
  assert.deepEqual(audit.summary.model_questions, [], 'the 2018 paper has no app-authored question');
  // The manifest carries the same summary as the audit record.
  assert.deepEqual(corrections.final_audit_2018.corrected_ids, [], 'no 2018 key was corrected');
  assert.deepEqual(corrections.final_audit_2018.ambiguous_ids.slice().sort(),
    audit.questions.filter((r) => r.status === 'ambiguous').map((r) => r.id).sort(),
    'the manifest lists exactly the ambiguous questions');
  assert.equal(corrections.final_audit_2018.reviewed, 100);
  assert.equal(corrections.final_audit_2018.confirmed, 96);
  assert.equal(corrections.final_audit_2018.ambiguous, 4);
});

test('every stored 2018 answer agrees with its own option correctness flags', () => {
  const offenders = [];
  for (const q of audited) {
    const rows = q.explanation?.option_explanations || [];
    assert.equal(rows.length, 4, `${q.id}: four option rows`);
    assert.deepEqual(rows.map((r) => r.key), q.language_variants.en.options.map((o) => o.key), `${q.id}: rows in option order`);
    const answer = new Set(q.supplied_answer.answer.map((x) => String(x).toUpperCase()));
    const flagged = new Set(rows.filter((r) => r.is_correct === true).map((r) => r.key));
    const same = flagged.size === answer.size && [...flagged].every((k) => answer.has(k));
    if (!same) offenders.push(`${q.id}: flags ${[...flagged].join(',') || 'none'} vs answer ${[...answer].join(',') || 'none'}`);
  }
  assert.deepEqual(offenders, [], `answer/flag contradictions:\n${offenders.join('\n')}`);
});

test('no 2018 explanation calls an option correct that the stored answer does not contain', () => {
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

test('2018 ambiguous items stay visibly flagged, and unresolved flags stay labelled ambiguous', () => {
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
  assert.deepEqual(audit.questions.filter((r) => r.status === 'ambiguous').map((r) => r.id),
    ['MPPSC-2018-015', 'MPPSC-2018-019', 'MPPSC-2018-055', 'MPPSC-2018-078']);
  assert.match(byId.get('MPPSC-2018-015').dispute.reason, /29 or 30/, 'the women-in-assembly count conflict is spelled out');
  assert.match(byId.get('MPPSC-2018-019').dispute.reason, /Shakta|Shaktism/, 'the Kalika Purana conflict is spelled out');
  assert.match(byId.get('MPPSC-2018-055').dispute.reason, /Mahadeo/, 'the Satpura/Mahadeo overlap is spelled out');
  assert.match(byId.get('MPPSC-2018-078').dispute.reason, /modus operandi/, 'the two cyber crime formulations are spelled out');
  assert.equal(disputesFile.disputes['MPPSC-2018-019'].is_disputed, true);
});

test('the 2018 audit declares no answer correction, and none of its ids appears in the correction map', () => {
  const declared = Object.keys(corrections.answer_corrections).filter((id) => id.startsWith('MPPSC-2018-'));
  assert.deepEqual(declared, [], 'a confirmed key is not re-declared as a correction');
  for (const record of audit.questions) {
    assert.deepEqual(record.printed_key, record.answer, `${record.id}: the printed key is what the bank stores`);
  }
});

test('the three 2018 option repairs are declared, quoted from the printed text and in force', () => {
  const declared = corrections.option_corrections;
  assert.deepEqual(Object.keys(declared).filter((id) => id.startsWith('MPPSC-2018-')).sort(),
    ['MPPSC-2018-010', 'MPPSC-2018-078', 'MPPSC-2018-096']);
  const repairs = [
    ['MPPSC-2018-010', 'D', 'Island of Lost - Kunal Basu Girls', 'Island of Lost Girls - Kunal Basu'],
    ['MPPSC-2018-078', 'A', 'Computer technology as, modus operandi and intangibility of the environment', 'Computer technology as modus operandi and intangibility of the environment'],
    ['MPPSC-2018-096', 'C', 'The Chairperson of- the National Human Rights Commission', 'The Chairperson of the National Human Rights Commission'],
  ];
  for (const [id, key, from, to] of repairs) {
    assert.deepEqual(declared[id][key], { from, to }, `${id} ${key}: repair quoted in the manifest`);
    const shipped = byId.get(id).language_variants.en.options.find((o) => o.key === key).text;
    assert.equal(shipped, to, `${id} ${key}: the repaired text is what shipped`);
    const row = byId.get(id).explanation.option_explanations.find((r) => r.key === key);
    assert.equal(row.text, to, `${id} ${key}: the explanation quotes the repaired option`);
  }
  // The audit record carries the same repairs, so the report and the data agree.
  assert.deepEqual(audit.summary.option_repairs.map((r) => `${r.id}:${r.key}`).sort(),
    ['MPPSC-2018-010:D', 'MPPSC-2018-078:A', 'MPPSC-2018-096:C']);
  assert.equal(audit.summary.option_repairs.find((r) => r.id === 'MPPSC-2018-010').to, 'Island of Lost Girls - Kunal Basu');
});

test('verified 2018 answers that were not changed cannot be quietly re-keyed', () => {
  const confirmed = {
    'MPPSC-2018-014': ['B'], // IMF, 189 members in 2018
    'MPPSC-2018-019': ['D'], // Kalika Purana — official key retained, dispute recorded
    'MPPSC-2018-040': ['D'], // GSDP growth 7.5 per cent, constant prices
    'MPPSC-2018-044': ['A'], // Andhra Pradesh has 11 Rajya Sabha seats, not 18
    'MPPSC-2018-055': ['A'], // Dhoopgarh in the Satpura range (Mahadeo within it)
    'MPPSC-2018-064': ['D'], // Dindori sex ratio above 1,000
    'MPPSC-2018-071': ['A'], // 10 hours of farm supply under Atal Jyoti Abhiyan
    'MPPSC-2018-081': ['B'], // economic boycott defined in section 2(bc)
    'MPPSC-2018-085': ['C'], // 23 sections in the PoA Act
    'MPPSC-2018-089': ['A'], // PCR Act extends to the whole of India
    'MPPSC-2018-100': ['C'], // Godavari is the second largest basin
  };
  for (const [id, answer] of Object.entries(confirmed)) {
    assert.deepEqual(byId.get(id).supplied_answer.answer, answer, `${id}: confirmed key must not drift`);
    assert.equal(corrections.answer_corrections[id], undefined, `${id}: no correction is declared for a confirmed answer`);
  }
  // A defective key that no option supports is kept but stays flagged, not silently "fixed".
  assert.deepEqual(byId.get('MPPSC-2018-015').supplied_answer.answer, ['D']);
  assert.match(byId.get('MPPSC-2018-015').explanation.option_explanations.find((r) => r.key === 'D').reason, /defective/);
});

test('the 2018 prose is written for its own question and shares no text with another year', () => {
  const seen = new Map();
  for (const q of bank.questions) {
    const prose = q.explanation?.correct_reasoning;
    if (!prose) continue;
    const key = prose.trim();
    if (seen.has(key)) assert.fail(`${q.id}: duplicates the explanation of ${seen.get(key)}`);
    seen.set(key, q.id);
  }
  const debris = [/https?:\/\//i, /\bwww\./i, /\[\d+\]/, /lorem ipsum/i, /as explained above/i, /hence option is correct/i];
  for (const q of audited) {
    const prose = q.explanation.correct_reasoning;
    for (const pattern of debris) assert.doesNotMatch(prose, pattern, `${q.id}: no scan debris or filler in the reasoning`);
    assert.doesNotMatch(JSON.stringify(q.explanation.option_explanations.map((r) => r.reason)), debris[0], `${q.id}: no URLs in option reasoning`);
    const others = audited.filter((o) => o.id !== q.id);
    for (const other of others) {
      assert.notEqual(other.explanation.correct_reasoning, prose, `${q.id}: reasoning is not borrowed from another question`);
    }
  }
});
