/**
 * bulk-questions.test.js — the services behind the Question Bank's bulk actions.
 *
 * Requirement it proves: a bulk subject/topic change and a bulk delete go
 * through the same per-question services as the single-question editor (no
 * write that skips the existence check, the correction history or the
 * preserved imported labels), a bulk change can be undone exactly — including
 * "no label" and the marker that decides whether a bank update may refresh a
 * question's labels — and an undo never overwrites newer work.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, importDemoBank } from './helpers.mjs';

const m = await bootApp();
await importDemoBank();
const { questions, db, constants } = m;
const ids = () => [...m.appState.questionIndex.keys()].sort();
const load = async (id) => (await questions.getQuestions([id])).get(id);

test('a bulk change runs the single-question correction on each question', async () => {
  const [a, b, c] = ids();
  const before = await questions.getQuestions([a, b, c]);
  const result = await questions.updateClassifications([a, b, c, 'NO-SUCH-ID', a], { topic: '  Bulk   topic ' });

  assert.deepEqual(result.changed.map((x) => x.id), [a, b, c], 'each id once, in order');
  assert.deepEqual(result.failed.map((x) => x.id), ['NO-SUCH-ID'], 'a missing question is reported, not skipped silently');
  for (const id of [a, b, c]) {
    const q = await load(id);
    const was = before.get(id).classification;
    assert.equal(q.classification.topic, 'Bulk topic', 'the label is tidied like a typed label');
    assert.equal(q.classification.subject, was.subject, "a blank subject keeps each question's own");
    assert.deepEqual(q.classification.original, was.original, 'the imported labels are preserved');
    assert.ok(q.classification.userEditedAt, "marked as the reader's edit, so a bank update keeps it");
    assert.equal(q.user_corrections.at(-1).kind, 'classification', 'recorded in the correction history');
    assert.deepEqual(q.user_corrections.at(-1).before, { subject: was.subject, topic: was.topic, subtopic: was.subtopic });
    assert.equal(m.appState.questionIndex.get(id).topic, 'Bulk topic', 'the in-memory index follows');
  }
  const tree = m.appState.subjects.find((s) => s.subject === before.get(a).classification.subject);
  assert.ok(tree?.topics.some((t) => t.topic === 'Bulk topic'), 'the practice filter tree sees the new topic without a reload');

  const undo = await questions.restoreClassifications(result.changed, { note: 'test undo' });
  assert.deepEqual(undo.restored, [a, b, c]);
  for (const id of [a, b, c]) {
    const q = await load(id);
    const was = before.get(id).classification;
    assert.equal(q.classification.topic, was.topic);
    assert.equal(q.classification.userEditedAt ?? null, was.userEditedAt ?? null, 'the edit marker comes back too');
    assert.equal(q.user_corrections.at(-1).kind, 'classification_restored', 'the undo is itself on the record');
  }
});

test('labels a question already carries are not re-recorded, and an empty change is refused', async () => {
  const [a] = ids();
  const q = await load(a);
  const corrections = q.user_corrections?.length || 0;
  const result = await questions.updateClassifications([a], { subject: q.classification.subject, topic: q.classification.topic });
  assert.deepEqual(result.unchanged, [a]);
  assert.equal(result.changed.length, 0);
  assert.equal((await load(a)).user_corrections?.length || 0, corrections, 'no empty correction');
  assert.equal((await load(a)).classification.userEditedAt ?? null, q.classification.userEditedAt ?? null, 'and it keeps following bank updates');

  await assert.rejects(questions.updateClassifications(ids().slice(0, 2), { subject: '   ', topic: null }), /subject, a topic, or both/);
});

test('undo puts back "no label" exactly, which the plain editor cannot express', async () => {
  const id = ids()[3];
  // Set up a question imported without a topic.
  const record = await load(id);
  record.classification.topic = null;
  record.classification.original = { ...record.classification.original, topic: null };
  await db.put(constants.STORES.QUESTIONS, record);
  await m.state.refreshQuestionIndex({ silent: true });

  const result = await questions.updateClassifications([id], { topic: 'Given a topic' });
  assert.equal((await load(id)).classification.topic, 'Given a topic');
  await questions.restoreClassifications(result.changed);
  const back = await load(id);
  assert.equal(back.classification.topic, null, 'null restored, not left as the batch value');
  assert.equal(back.classification.userEditedAt, null, 'back to its imported labels');
  assert.equal(m.appState.questionIndex.get(id).topic, null);
});

test('undo leaves alone a question whose labels changed again after the batch', async () => {
  const [, , , , d, e] = ids();
  const result = await questions.updateClassifications([d, e], { subject: 'Batch subject' });
  await questions.updateClassification(e, { subject: 'Edited later by hand' });
  const undo = await questions.restoreClassifications(result.changed);
  assert.deepEqual(undo.restored, [d]);
  assert.deepEqual(undo.skipped.map((s) => s.id), [e]);
  assert.equal((await load(e)).classification.subject, 'Edited later by hand', 'the newer edit survives the undo');
});

test('deleteQuestions removes, reports what was already gone, and tells the shell', async () => {
  const [x, y] = ids().slice(-2);
  const sizeBefore = m.appState.questionIndex.size;
  let events = 0;
  const off = m.state.on('bank:changed', () => {
    events += 1;
  });
  const result = await questions.deleteQuestions([x, y, 'NEVER-STORED', x]);
  off();
  assert.deepEqual(result.deleted, [x, y]);
  assert.deepEqual(result.missing, ['NEVER-STORED']);
  assert.equal(await db.get(constants.STORES.QUESTIONS, x), undefined);
  assert.equal(m.appState.questionIndex.size, sizeBefore - 2, 'the index is rebuilt');
  assert.ok(events >= 1, 'the bank pill listens for bank:changed');
  assert.deepEqual(await questions.deleteQuestions([]), { deleted: [], missing: [] });
});
