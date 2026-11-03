/**
 * final-answer-audit-2012.test.js — the guard on the 2012 final answer audit.
 *
 * The 2012 paper has no authenticated MPPSC answer key. This suite protects
 * what the independent audit decided: 79 integrated answers preserved, 10
 * previously unkeyed questions resolved with cited evidence, 11 defective or
 * genuinely ambiguous questions deliberately left unkeyed, and all 100
 * questions carrying the 2013–2024 four-part explanation standard. It also
 * recomputes the answer changes, source references and dispute status from the
 * shipped data instead of trusting the report's headline numbers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';
import { parseReviewedCorrections } from '../tools/classify/reviewed-corrections.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));
const norm = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function sharesTerm(source, reasoning) {
  const words = (text) => norm(text).split(/\s+/).filter((w) => w.length >= 5);
  return words(source).some((a) => words(reasoning).some((b) => editDistance(a, b) <= 2));
}

function isMeaningfulReason(reason, optionText) {
  const r = String(reason ?? '').trim();
  if (!r || r.split(/\s+/).length < 5) return false;
  const rn = norm(r);
  const tn = norm(optionText);
  if (!rn || (tn && rn === tn)) return false;
  if (tn && tn.includes(rn) && rn.length <= tn.length + 8) return false;
  return true;
}

const [bank, audit, reassessment, explanationsFile, corrections2012, corrections2013] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'quality-audit', 'final-answer-audit-2012.json'),
  readJson('pyq', 'source', '2012-recovery', 'answer-reassessment-2012.json'),
  readJson('pyq', 'reviewed-explanations-2012.json'),
  readJson('pyq', 'reviewed-corrections-2012.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const audited = bank.questions.filter((q) => Number(q.year) === 2012).sort((a, b) => a.question_number - b.question_number);
const byId = new Map(audited.map((q) => [q.id, q]));
const rowsById = new Map(audit.questions.map((r) => [r.id, r]));
const reviewByNumber = new Map(reassessment.records.map((r) => [r.question_number, r]));
const proseById = explanationsFile.explanations;
const bundle2012 = parseReviewedCorrections({ corrections: corrections2012, explanations: explanationsFile, disputes: { disputes: {} } });

const NEWLY_KEYED = [4, 12, 19, 29, 46, 53, 75, 88, 90, 94].map((n) => `MPPSC-2012-${String(n).padStart(3, '0')}`);
const UNKEYED = [15, 22, 41, 45, 47, 50, 63, 67, 73, 92, 95].map((n) => `MPPSC-2012-${String(n).padStart(3, '0')}`);

test('the 2012 audit covers all 100 questions exactly once', () => {
  assert.equal(audited.length, 100);
  assert.equal(audit.questions.length, 100);
  assert.deepEqual([...rowsById.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual(audited.map((q) => q.question_number), Array.from({ length: 100 }, (_, i) => i + 1));
  assert.deepEqual([...new Set(audited.map((q) => q.paper_id))], ['MPPSC-2012-P1']);
  assert.equal(audit.paper_id, 'MPPSC-2012-P1');
  assert.equal(audit.year, 2012);
  for (const row of audit.questions) {
    assert.equal(row.year, 2012);
    assert.ok(row.note && row.note.length > 40, `${row.id}: the decision has a stated basis`);
    assert.ok(row.uncertainty && row.uncertainty.length > 10, `${row.id}: the uncertainty is recorded`);
    assert.ok(Array.isArray(row.sources) && row.sources.length > 0, `${row.id}: sources are preserved`);
    assert.ok(row.sources.every((url) => /^https?:\/\//.test(url)));
    assert.equal(row.explanation_rebuilt, true);
    assert.equal(row.option_reasons, 4);
    assert.equal(row.official_mppsc_key_authenticated, false);
  }
});

test('the recorded 2012 counts are recomputed from the rows and the bank', () => {
  const counted = { reviewed: 0, preserved: 0, resolved: 0, defective: 0, ambiguous: 0 };
  for (const row of audit.questions) {
    counted.reviewed += 1;
    counted[row.status] += 1;
  }
  assert.deepEqual(audit.summary.by_year['2012'], counted);
  assert.deepEqual(audit.summary.total, counted);
  assert.equal(counted.reviewed, counted.preserved + counted.resolved + counted.defective + counted.ambiguous);
  assert.equal(counted.reviewed, 100);
  assert.equal(counted.preserved, 79);
  assert.equal(counted.resolved, 10);
  assert.equal(counted.defective, 7);
  assert.equal(counted.ambiguous, 4);
  assert.equal(audit.summary.explanations_rebuilt, 100);
  assert.equal(audit.summary.option_reasoning_complete, 100);
  assert.deepEqual(audit.summary.answer_changes, []);
  assert.deepEqual(audit.summary.corrected_ids, []);
  assert.deepEqual(audit.summary.newly_keyed_ids.slice().sort(), NEWLY_KEYED.sort());
  assert.deepEqual(audit.summary.ambiguous_ids.slice().sort(), UNKEYED.sort());
  assert.equal(audit.summary.official_mppsc_key_authenticated, false);
  assert.deepEqual(audit.summary.disputed_unresolved.before, { disputed: 7, unresolved: 14, unkeyed: 21 });
  assert.deepEqual(audit.summary.disputed_unresolved.after, { disputed: 3, unresolved: 8, unkeyed: 11 });
  assert.equal(bank.papers.find((p) => p.year === 2012).scoring.rules_known, false);
});

test('no integrated answer was changed and ten new keys are independently verified', () => {
  const verified = audited.filter((q) => q.verified_answer?.answer?.length === 1);
  assert.equal(verified.length, 89, '79 preserved + 10 resolved');
  for (const q of audited) {
    const row = rowsById.get(q.id);
    const review = reviewByNumber.get(q.question_number);
    assert.equal(q.supplied_answer.answer, null, `${q.id}: still no supplied answer`);
    assert.equal(q.supplied_answer.status, 'missing');
    if (row.status === 'preserved' || row.status === 'resolved') {
      assert.equal(review.status, 'verified');
      if (row.status === 'preserved') {
        assert.equal(row.previous_status, 'verified');
        assert.deepEqual([row.previous_answer], [review.proposed_answer], `${q.id}: the integrated answer was preserved`);
      } else {
        assert.notEqual(row.previous_status, 'verified', `${q.id}: was previously unkeyed`);
      }
      assert.deepEqual(q.verified_answer.answer, [review.proposed_answer]);
      assert.deepEqual(row.answer, [review.proposed_answer]);
      assert.equal(row.independently_verified, true);
      assert.match(q.verified_answer.verified_by, /not an official MPPSC key/);
    } else {
      assert.ok(['disputed', 'unresolved'].includes(review.status));
      assert.equal(q.verified_answer, undefined);
      assert.deepEqual(row.answer, null);
      assert.equal(row.independently_verified, false);
    }
  }
  assert.deepEqual(verified.filter((q) => UNKEYED.includes(q.id)).map((q) => q.id), []);
  assert.deepEqual(NEWLY_KEYED.filter((id) => rowsById.get(id).previous_status === 'verified'), []);
  // 2013–2024 corrections are untouched by this year's audit.
  assert.equal(corrections2013.final_audit_2013.corrected_ids.length, 1);
  assert.deepEqual(Object.keys(corrections2013.answer_corrections).filter((id) => id.startsWith('MPPSC-2012-')), []);
});

test('every 2012 explanation meets the 2013–2024 four-part standard', () => {
  const generic = ['hence option is correct', 'as explained above', 'this is the correct answer because it is correct'];
  const seen = new Map();
  assert.equal(Object.keys(proseById).length, 100);
  for (const q of audited) {
    const prose = proseById[q.id];
    assert.ok(prose, `${q.id}: prose exists`);
    assert.deepEqual(q.explanation, prose, `${q.id}: the reviewed prose is what shipped`);
    assert.equal(prose.language, 'en');
    const options = q.language_variants.en.options;
    assert.equal(prose.option_explanations.length, 4);
    assert.deepEqual(prose.option_explanations.map((r) => r.key), options.map((o) => o.key));
    for (const row of prose.option_explanations) {
      assert.equal(row.text, options.find((o) => o.key === row.key).text, `${q.id} ${row.key}: quotes the real option`);
      assert.ok(isMeaningfulReason(row.reason, row.text), `${q.id} ${row.key}: a genuine reason`);
    }
    const reasons = prose.option_explanations.map((r) => norm(r.reason));
    assert.equal(new Set(reasons).size, 4, `${q.id}: each option has its own reason`);
    const answer = rowsById.get(q.id).answer || [];
    const flagged = prose.option_explanations.filter((r) => r.is_correct === true).map((r) => r.key).sort();
    assert.deepEqual(flagged, answer.slice().sort(), `${q.id}: exactly the stored answer is ticked`);
    assert.deepEqual(prose.option_explanations.map((r) => r.is_correct),
      answer.length ? options.map((o) => o.key === answer[0]) : [null, null, null, null],
      `${q.id}: unkeyed items are unstated, keyed items use true/false`);
    const reasoning = prose.correct_reasoning;
    assert.ok(reasoning.length >= 140, `${q.id}: substantive reasoning`);
    for (const phrase of generic) assert.ok(!reasoning.toLowerCase().includes(phrase), `${q.id}: no placeholder phrasing`);
    const source = [q.language_variants.en.question_text, ...options.map((o) => o.text)].join(' ');
    assert.ok(sharesTerm(source, reasoning), `${q.id}: reasoning discusses its own question`);
    const key = norm(reasoning);
    assert.ok(!seen.has(key), `${q.id}: reasoning is not copied from ${seen.get(key)}`);
    seen.set(key, q.id);
    assert.ok(Array.isArray(prose.key_concepts) && prose.key_concepts.length >= 2 && prose.key_concepts.length <= 3);
    assert.ok(Array.isArray(prose.revision_takeaways) && prose.revision_takeaways.length >= 1 && prose.revision_takeaways.length <= 2);
    assert.ok(Array.isArray(prose.sources) && prose.sources.length > 0);
    assert.doesNotMatch(JSON.stringify(prose), /"(status|generated_by|reviewed_by|reviewed_at)":/);
  }
});

test('source references and uncertainty records survive into the shipped bank', () => {
  let distinct = new Set();
  for (const q of audited) {
    const review = reviewByNumber.get(q.question_number);
    const row = rowsById.get(q.id);
    distinct = new Set([...distinct, ...review.sources]);
    assert.deepEqual(q.explanation.sources.map((s) => s.url), review.sources, `${q.id}: explanation sources`);
    assert.deepEqual(row.sources, review.sources, `${q.id}: audit sources`);
    if (review.status === 'verified') {
      assert.deepEqual(q.verified_answer.evidence.map((e) => e.url), review.sources);
      assert.equal(q.verified_answer.evidence[0].note, review.ambiguity_or_limitation);
    } else {
      assert.deepEqual(q.verification_evidence.map((e) => e.url), review.sources);
      assert.ok(q.dispute.reason.includes(review.ambiguity_or_limitation));
      assert.equal(row.uncertainty, review.ambiguity_or_limitation);
    }
  }
  assert.equal(audit.summary.source_references.distinct_urls, distinct.size);
  assert.equal(audit.summary.source_references.questions_with_sources, 100);
  assert.equal(audit.summary.source_references.verified_evidence_urls, audited.filter((q) => q.verified_answer).reduce((n, q) => n + q.verified_answer.evidence.length, 0));
  assert.equal(audit.summary.source_references.unkeyed_evidence_urls, audited.filter((q) => !q.verified_answer).reduce((n, q) => n + q.verification_evidence.length, 0));
});

test('genuinely ambiguous and defective items stay unkeyed with visible disputes', () => {
  assert.equal(audited.filter((q) => !q.verified_answer).length, 11);
  assert.deepEqual(audited.filter((q) => !q.verified_answer).map((q) => q.id).sort(), UNKEYED.slice().sort());
  assert.deepEqual(audited.filter((q) => q.dispute?.is_disputed === true).map((q) => q.id).sort(),
    [15, 50, 92].map((n) => `MPPSC-2012-${String(n).padStart(3, '0')}`).sort());
  for (const id of UNKEYED) {
    const q = byId.get(id);
    const row = rowsById.get(id);
    assert.equal(q.dispute.status, 'unresolved', `${id}: the dispute stays open`);
    assert.equal(q.answer_key_status, q.dispute.is_disputed ? 'disputed' : 'missing');
    assert.deepEqual(q.explanation.option_explanations.filter((o) => o.is_correct).map((o) => o.key), [], `${id}: no option forced`);
    assert.ok(row.uncertainty.length > 40, `${id}: the reason it is unkeyed is documented`);
    assert.ok(['defective', 'ambiguous'].includes(row.status));
  }
  assert.equal(audited.filter((q) => rowsById.get(q.id).status === 'defective').length, 7);
  assert.equal(audited.filter((q) => rowsById.get(q.id).status === 'ambiguous').length, 4);
});

test('unkeyed 2012 options render as unstated rather than falsely incorrect', async () => {
  // js/ui/components.js prints "not correct" for `false` and "unstated" for
  // null. An unkeyed question must not label all four options "not correct".
  const { normaliseQuestion } = await import('../js/core/schema.js');
  const components = await readFile(new URL('../js/ui/components.js', import.meta.url), 'utf8');
  assert.match(components, /is_correct === false \? badge\('not correct', 'plain'\) : .*unstated/, 'a null flag renders as "unstated"');
  for (const id of UNKEYED) {
    const { question } = normaliseQuestion(byId.get(id), {});
    assert.ok(question?.explanation, `${id}: the explanation survives normalisation`);
    assert.deepEqual(question.explanation.option_explanations.map((r) => r.is_correct), [null, null, null, null], `${id}: unstated in the app`);
  }
  const keyed = normaliseQuestion(byId.get('MPPSC-2012-001'), {}).question;
  assert.deepEqual(keyed.explanation.option_explanations.map((r) => r.is_correct), [false, true, false, false], 'Q1 keys B and marks the rest false');
});

test('the 2012 explanation declarations use the existing corrections pipeline and stay exact', () => {
  assert.equal(bundle2012.explanations.size, 100);
  assert.equal(bundle2012.rewrittenIds.size, 100);
  assert.equal(bundle2012.completeIds.size, 100);
  assert.equal(bundle2012.answers.size, 0);
  assert.equal(bundle2012.options.size, 0);
  assert.equal(bundle2012.disputes.size, 0);
  assert.deepEqual([...bundle2012.explanations.keys()].sort(), audited.map((q) => q.id).sort());
  assert.deepEqual(corrections2012.narrative_rewritten, corrections2012.option_reasoning_complete);
  assert.equal(corrections2012.final_audit_2012.reviewed, 100);
  assert.equal(corrections2012.final_audit_2012.explanations_rebuilt, 100);
  assert.equal(corrections2012.final_audit_2012.official_mppsc_key_authenticated, false);
  assert.deepEqual(corrections2012.final_audit_2012.corrected_ids, []);
  assert.deepEqual(corrections2012.final_audit_2012.newly_keyed_ids.slice().sort(), NEWLY_KEYED.slice().sort());
  assert.deepEqual(corrections2012.final_audit_2012.ambiguous_ids.slice().sort(), UNKEYED.slice().sort());
  assert.equal(explanationsFile.paper_id, 'MPPSC-2012-P1');
  assert.ok(explanationsFile.note.includes('not officially authenticated'));
  assert.ok(explanationsFile.source_audits.includes('data/pyq/quality-audit/final-answer-audit-2012.json'));
});
