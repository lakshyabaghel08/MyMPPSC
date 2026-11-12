/* Independent verification of the 2012 final-answer-audit checkpoint.
 * Run from anywhere: node checkpoints/2012-final-answer-audit/verify.mjs
 * It checks the frozen checkpoint copies and the still-live 2012 audit inputs,
 * decompresses the historical bank, and verifies that the active bank preserves
 * the checkpoint's 2012 paper exactly. The 2009–2011 papers were later retired,
 * so the whole historical bank is intentionally not compared to the live bank.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sumFile = readFileSync(path.join(here, 'SHA256SUMS'), 'utf8').trim().split('\n').filter(Boolean);

for (const line of sumFile) {
  const [expected, rel] = line.split(/\s+/);
  const bytes = readFileSync(path.join(root, rel));
  const actual = createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual, expected, `${rel}: checksum changed since the checkpoint`);
}

const gz = readFileSync(path.join(here, 'mymppsc-pyq-bank.json.gz'));
const checkpoint = JSON.parse(gunzipSync(gz).toString('utf8'));
const live = JSON.parse(readFileSync(path.join(root, 'data/pyq/mymppsc-pyq-bank.json'), 'utf8'));
const q12 = checkpoint.questions.filter((q) => q.year === 2012);
assert.equal(live.questions.length, 1300, 'the active bank contains only the 2012–2024 scope');
assert.equal(live.papers.length, 13);
assert.ok(live.questions.every((q) => q.year >= 2012 && q.year <= 2024));
assert.deepEqual(live.questions.filter((q) => q.year === 2012), q12, 'the live 2012 questions must equal the audited checkpoint records');
assert.deepEqual(live.papers.find((p) => p.paper_id === 'MPPSC-2012-P1'), checkpoint.papers.find((p) => p.paper_id === 'MPPSC-2012-P1'), 'the live 2012 paper metadata must equal the checkpoint');

assert.equal(checkpoint.questions.length, 1684);
assert.equal(checkpoint.papers.length, 16);
assert.equal(q12.length, 100);
assert.equal(q12.filter((q) => q.verified_answer?.answer?.length === 1).length, 89);
assert.equal(q12.filter((q) => !q.verified_answer).length, 11);
assert.equal(q12.filter((q) => q.explanation?.option_explanations?.length === 4).length, 100);
assert.equal(q12.filter((q) => q.explanation.option_explanations.every((r) => r.is_correct === null)).length, 11);
assert.equal(q12.filter((q) => q.supplied_answer?.answer !== null).length, 0);
assert.equal(checkpoint.papers.find((p) => p.paper_id === 'MPPSC-2012-P1').scoring.rules_known, false);

console.log(`Verified ${sumFile.length} checksums; the live 2012 paper matches the historical checkpoint.`);
console.log('Historical checkpoint: 1,684 questions / 16 papers. Active bank: 1,300 questions / 13 papers (2009–2011 retired).');
console.log('2012: 100 questions, 89 independently verified, 11 unkeyed, 100 four-part explanations, 11 "unstated" option sets.');
