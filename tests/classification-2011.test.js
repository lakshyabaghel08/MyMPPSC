import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bank = JSON.parse(readFileSync(new URL('../data/pyq/mymppsc-pyq-bank.json', import.meta.url), 'utf8'));
const taxonomy = JSON.parse(readFileSync(new URL('../data/pyq/source/2009-2011/final-taxonomy-2011.json', import.meta.url), 'utf8'));

test('2011 integrated classifications match the reviewed final taxonomy', () => {
  const questions = bank.questions.filter((q) => q.year === 2011);
  assert.equal(questions.length, 118);
  assert.equal(Object.keys(taxonomy.labels).length, 118);
  for (const q of questions) {
    assert.deepEqual(
      { subject: q.subject, topic: q.topic, subtopic: q.subtopic },
      taxonomy.labels[q.id],
      q.id,
    );
  }
  const counts = {};
  for (const q of questions) counts[q.subject] = (counts[q.subject] || 0) + 1;
  assert.deepEqual(counts, {
    Geography: 108,
    Economy: 4,
    Environment: 2,
    'Science and Technology': 1,
    'Art and Culture': 2,
    'Madhya Pradesh Special': 1,
  });
  assert.equal(questions.some((q) => q.id === 'MPPSC-2011-007' || q.id === 'MPPSC-2011-038'), false);
});

test('2011 classification decisions are corrected at subject and lower levels', () => {
  const byId = new Map(bank.questions.filter((q) => q.year === 2011).map((q) => [q.id, q]));
  assert.deepEqual([byId.get('MPPSC-2011-006').subject, byId.get('MPPSC-2011-006').topic], ['Geography', 'Economic and human geography']);
  assert.deepEqual([byId.get('MPPSC-2011-008').subject, byId.get('MPPSC-2011-008').topic], ['Geography', 'World Geography']);
  assert.deepEqual([byId.get('MPPSC-2011-014').topic, byId.get('MPPSC-2011-014').subtopic], ['Physical Geography', 'Rocks and minerals']);
  assert.equal(byId.get('MPPSC-2011-036').subtopic, null);
  assert.deepEqual([byId.get('MPPSC-2011-068').topic, byId.get('MPPSC-2011-068').subtopic], ['Physical Geography', 'Earthquakes and volcanoes']);
});
