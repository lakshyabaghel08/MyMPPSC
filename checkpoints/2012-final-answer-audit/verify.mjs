/* Independent verification of the 2012 final-answer-audit checkpoint.
 * Run from anywhere: node checkpoints/2012-final-answer-audit/verify.mjs
 * It checks every SHA-256 in SHA256SUMS against the live workspace file,
 * decompresses the checkpoint bank and compares it to the shipped bank, and
 * recomputes the 2012 headline counts from the checkpoint copy.
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
assert.deepEqual(checkpoint, live, 'the compressed checkpoint bank must equal the live bank byte-for-byte after parsing');

const q12 = checkpoint.questions.filter((q) => q.year === 2012);
assert.equal(checkpoint.questions.length, 1684);
assert.equal(checkpoint.papers.length, 16);
assert.equal(q12.length, 100);
assert.equal(q12.filter((q) => q.verified_answer?.answer?.length === 1).length, 89);
assert.equal(q12.filter((q) => !q.verified_answer).length, 11);
assert.equal(q12.filter((q) => q.explanation?.option_explanations?.length === 4).length, 100);
assert.equal(q12.filter((q) => q.explanation.option_explanations.every((r) => r.is_correct === null)).length, 11);
assert.equal(q12.filter((q) => q.supplied_answer?.answer !== null).length, 0);
assert.equal(checkpoint.papers.find((p) => p.paper_id === 'MPPSC-2012-P1').scoring.rules_known, false);

console.log(`Verified ${sumFile.length} checksums plus the decompressed bank.`);
console.log('Checkpoint: 1,684 questions / 16 papers; 2012 = 100 questions, 89 independently verified, 11 unkeyed, 100 four-part explanations, 11 "unstated" option sets.');
