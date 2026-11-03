import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const taxonomy = JSON.parse(readFileSync(new URL('../data/pyq/source/2009-2011/final-taxonomy-2011.json', import.meta.url), 'utf8'));

test('reviewed 2011 final taxonomy covers all 118 integrated questions', () => {
  const labels = Object.values(taxonomy.labels);
  assert.equal(labels.length, 118);
  const counts = {};
  for (const label of labels) counts[label.subject] = (counts[label.subject] || 0) + 1;
  assert.deepEqual(counts, {
    Geography: 108,
    Economy: 4,
    Environment: 2,
    'Science and Technology': 1,
    'Art and Culture': 2,
    'Madhya Pradesh Special': 1,
  });
});

test('reviewed 2011 subject and topic corrections are present', () => {
  const labels = taxonomy.labels;
  assert.deepEqual([labels['MPPSC-2011-006'].subject, labels['MPPSC-2011-006'].topic], ['Geography', 'Economic and human geography']);
  assert.deepEqual([labels['MPPSC-2011-008'].subject, labels['MPPSC-2011-008'].topic], ['Geography', 'World Geography']);
  assert.deepEqual([labels['MPPSC-2011-014'].topic, labels['MPPSC-2011-014'].subtopic], ['Physical Geography', 'Rocks and minerals']);
  assert.equal(labels['MPPSC-2011-036'].subtopic, null);
  assert.deepEqual([labels['MPPSC-2011-068'].topic, labels['MPPSC-2011-068'].subtopic], ['Physical Geography', 'Earthquakes and volcanoes']);
});
