/**
 * explanation-quality.test.js — what an explanation has to actually contain.
 *
 * The earlier suites could only see that four option rows existed. A row that
 * repeats its own option text and carries a tick satisfies that, and teaches
 * nothing — which is exactly the defect the 2021–2024 audit found. These tests
 * look at the prose instead: does each option say why it is or is not the
 * answer, do the labels agree with the stored key, and is the reasoning about
 * this question rather than a boilerplate sentence that would fit any question?
 *
 * The manifest in data/pyq/reviewed-corrections.json names every question whose
 * explanation meets the standard (`option_reasoning_complete`). The strict rules
 * below apply to exactly that set, and a further test proves the set is exact —
 * nothing complete is missing from it and nothing incomplete is in it. Questions
 * outside the set are counted and reported, never silently asserted as done.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dataPath } from './helpers.mjs';

const readJson = async (...parts) => JSON.parse(await readFile(dataPath(...parts), 'utf8'));

const norm = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A reason must say something: a real sentence, and not the option text again. */
function isMeaningfulReason(reason, optionText) {
  const r = String(reason ?? '').trim();
  if (!r) return false;
  if (r.split(/\s+/).length < 5) return false;
  const rn = norm(r);
  const tn = norm(optionText);
  if (!rn) return false;
  if (tn && rn === tn) return false;
  // "Article 328" answering the option "Article 328" is a restatement, not a reason.
  if (tn && tn.includes(rn) && rn.length <= tn.length + 8) return false;
  return true;
}

/** Levenshtein distance, capped — enough to align transliteration variants. */
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

/**
 * Does the commentary pick up a distinctive term from the question?
 * The printed papers spell proper nouns inconsistently ("McMohan"/"McMahon",
 * "Malaw"/"Malwa", "Vishakhadutta"/"Vishakhadatta"), so a near-match counts.
 */
function sharesTerm(source, reasoning) {
  const words = (text) => norm(text).split(/\s+/).filter((w) => w.length >= 5);
  const left = words(source);
  const right = words(reasoning);
  return left.some((a) => right.some((b) => editDistance(a, b) <= 2));
}

/** Every requirement an explanation must meet to count as complete. */
function meetsStandard(q) {
  const rows = q.explanation?.option_explanations || [];
  const questionKeys = q.language_variants.en.options.map((o) => o.key);
  if (rows.length !== questionKeys.length) return false;
  if (rows.some((r, i) => r.key !== questionKeys[i])) return false;
  if (rows.some((r) => r.text !== q.language_variants.en.options.find((o) => o.key === r.key)?.text)) return false;
  const answer = new Set(q.supplied_answer.answer.map((x) => String(x).toUpperCase()));
  if (rows.some((r) => r.is_correct !== answer.has(r.key))) return false;
  if (rows.some((r) => !isMeaningfulReason(r.reason, r.text))) return false;
  const reasons = rows.map((r) => norm(r.reason));
  if (new Set(reasons).size !== reasons.length) return false;
  const reasoning = String(q.explanation.correct_reasoning || '').trim();
  if (reasoning.length < 40) return false;
  return true;
}

const [bank, corrections] = await Promise.all([
  readJson('pyq', 'mymppsc-pyq-bank.json'),
  readJson('pyq', 'reviewed-corrections.json'),
]);

const byId = new Map(bank.questions.map((q) => [q.id, q]));
const declared = corrections.option_reasoning_complete || [];
const declaredSet = new Set(declared);
const audited = bank.questions.filter((q) => [2019, 2020, 2021, 2022, 2023, 2024].includes(Number(q.year)));
const standard = audited.filter((q) => declaredSet.has(q.id));

test('every question declared complete exists in the audited bank', () => {
  assert.ok(declared.length > 0, 'the manifest declares at least one complete explanation');
  for (const id of declared) {
    assert.ok(byId.has(id), `${id}: declared complete but absent from the bank`);
  }
  assert.equal(new Set(declared).size, declared.length, 'the declared list has no duplicates');
});

test('a complete explanation covers exactly the question’s own four option keys and text', () => {
  for (const q of standard) {
    const rows = q.explanation.option_explanations;
    const options = q.language_variants.en.options;
    assert.equal(rows.length, 4, `${q.id}: four option explanations`);
    assert.deepEqual(rows.map((r) => r.key), options.map((o) => o.key), `${q.id}: keys match, in order`);
    for (const row of rows) {
      assert.equal(row.text, options.find((o) => o.key === row.key).text, `${q.id} ${row.key}: quotes the real option`);
    }
  }
});

test('every option of a complete explanation carries meaningful, non-repetitive reasoning', () => {
  const offenders = [];
  for (const q of standard) {
    for (const row of q.explanation.option_explanations) {
      if (!isMeaningfulReason(row.reason, row.text)) offenders.push(`${q.id} ${row.key}: ${JSON.stringify(row.reason ?? null)}`);
    }
  }
  assert.deepEqual(offenders, [], `options without genuine reasoning:\n${offenders.join('\n')}`);
});

test('the correct/incorrect label on every option agrees with the stored answer', () => {
  for (const q of standard) {
    const answer = new Set(q.supplied_answer.answer.map((x) => String(x).toUpperCase()));
    const flagged = new Set(q.explanation.option_explanations.filter((o) => o.is_correct === true).map((o) => o.key));
    assert.deepEqual([...flagged].sort(), [...answer].sort(), `${q.id}: exactly the stored answer is marked correct`);
  }
});

test('option reasoning is per-option, not one paragraph copied four times', () => {
  for (const q of standard) {
    const reasons = q.explanation.option_explanations.map((o) => norm(o.reason));
    assert.equal(new Set(reasons).size, reasons.length, `${q.id}: each option has its own reasoning`);
    assert.ok(!reasons.includes(''), `${q.id}: no empty option reasoning`);
  }
});

test('reasoning is about its own question, not boilerplate', () => {
  const generic = ['hence option is correct', 'as explained above', 'this is the correct answer because it is correct'];
  const seen = new Map();
  for (const q of standard) {
    const reasoning = String(q.explanation.correct_reasoning || '');
    assert.ok(reasoning.trim().length >= 40, `${q.id}: reasoning is substantial`);
    const low = reasoning.toLowerCase();
    for (const phrase of generic) assert.ok(!low.includes(phrase), `${q.id}: no placeholder phrasing`);
    const source = [q.language_variants.en.question_text,
      ...q.language_variants.en.options.map((o) => o.text)].join(' ');
    assert.ok(sharesTerm(source, reasoning),
      `${q.id}: reasoning discusses none of the terms in its own question or options: ${reasoning.slice(0, 80)}…`);
    const key = norm(reasoning);
    assert.ok(!seen.has(key), `${q.id}: duplicates the reasoning of ${seen.get(key)}`);
    seen.set(key, q.id);
  }
});

test('the completeness list is exact: nothing complete is missing and nothing incomplete is listed', () => {
  // This is the guard that keeps the manifest honest. It is computed from the
  // bank, so the declared list can never drift ahead of or behind the data.
  const actuallyComplete = audited.filter((q) => meetsStandard(q)).map((q) => q.id).sort();
  assert.deepEqual([...declared].sort(), actuallyComplete,
    'option_reasoning_complete must list exactly the questions that meet the standard');
});

test('coverage is counted from the bank and reported per year', () => {
  const byYear = (y) => audited.filter((q) => Number(q.year) === y);
  // 2019, 2020 and 2021 were taken to completion in separate passes; they must stay there.
  assert.equal(byYear(2019).filter((q) => declaredSet.has(q.id)).length, 100,
    'every 2019 explanation carries per-option reasoning');
  assert.equal(byYear(2020).filter((q) => declaredSet.has(q.id)).length, 100,
    'every 2020 explanation carries per-option reasoning');
  assert.equal(byYear(2021).filter((q) => declaredSet.has(q.id)).length, 100,
    'every 2021 explanation carries per-option reasoning');
  // The remaining years are declared incomplete rather than presented as finished.
  const outstanding = audited.length - standard.length;
  assert.ok(outstanding > 0, `2022–2024 still owe per-option reasoning: ${outstanding} questions`);
  for (const y of [2022, 2023, 2024]) {
    assert.ok(byYear(y).filter((q) => !declaredSet.has(q.id)).length > 0,
      `${y}: outstanding questions must be visible, not silently claimed complete`);
  }
});
