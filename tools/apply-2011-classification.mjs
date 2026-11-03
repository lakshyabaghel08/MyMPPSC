import { readFileSync, writeFileSync } from 'node:fs';

const bankPath = 'data/pyq/mymppsc-pyq-bank.json';
const finalPath = 'data/pyq/source/2009-2011/final-taxonomy-2011.json';
const canonicalPath = 'data/taxonomy/mppsc-taxonomy.json';

const bank = JSON.parse(readFileSync(bankPath, 'utf8'));
const final = JSON.parse(readFileSync(finalPath, 'utf8'));
const canonical = JSON.parse(readFileSync(canonicalPath, 'utf8'));
const questions = bank.questions.filter((q) => q.year === 2011);

if (questions.length !== 118 || Object.keys(final.labels).length !== 118) {
  throw new Error('Expected exactly 118 integrated 2011 questions and final labels');
}

const valid = new Map(canonical.subjects.map((subject) => [
  subject.subject,
  new Map(subject.topics.map((topic) => [topic.topic, new Set(topic.subtopics)])),
]));

for (const question of questions) {
  const label = final.labels[question.id];
  if (!label) throw new Error(`Missing final classification for ${question.id}`);
  const topics = valid.get(label.subject);
  if (!topics || (label.topic && !topics.has(label.topic)) ||
      (label.subtopic && (!label.topic || !topics.get(label.topic).has(label.subtopic)))) {
    throw new Error(`Invalid taxonomy path for ${question.id}`);
  }
}

for (const question of questions) {
  const label = final.labels[question.id];
  question.subject = label.subject;
  question.topic = label.topic ?? null;
  question.subtopic = label.subtopic ?? null;
}

const counts = {};
for (const question of questions) {
  counts[question.subject] = (counts[question.subject] || 0) + 1;
}
const expected = {
  Geography: 108,
  Economy: 4,
  Environment: 2,
  'Science and Technology': 1,
  'Art and Culture': 2,
  'Madhya Pradesh Special': 1,
};
if (JSON.stringify(counts) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected 2011 subject distribution: ${JSON.stringify(counts)}`);
}

writeFileSync(bankPath, JSON.stringify(bank, null, 2) + '\n');
console.log('Applied reviewed classifications to 118 2011 questions:', counts);
