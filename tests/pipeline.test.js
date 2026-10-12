/**
 * pipeline.test.js — the parts of tools/classify-bank.mjs that prepare the real
 * bank for the app: the extraction repair pass, the reviewed-label merge,
 * and the sanitiser that writes the app-facing file.
 *
 * These steps decide what the committed bank may contain, so they are tested
 * directly, not only through the bank they produced:
 *   - an escape artefact becomes a real newline and nothing else changes;
 *   - provenance leaves the data and is recorded in the report;
 *   - a reviewed label is applied as "reviewed", never as an AI label, and a
 *     label that contradicts the taxonomy is refused without changing anything;
 *   - the sanitiser renames source-flavoured ids, maps answer statuses, writes
 *     the automatic marking scheme and never guesses one for an uncovered year.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { repoRoot, dataPath } from './helpers.mjs';
import { repairEscapedNewlines, repairIntake } from '../tools/classify/repair.mjs';
import { parseReviewedLabels, applyReviewedLabels, CLASSIFICATION_SOURCE_REVIEWED } from '../tools/classify/reviewed-labels.mjs';
import { sanitiseBank, cleanPaperId, APP_BANK_ID, APP_BANK_NAME } from '../tools/classify/sanitise-bank.mjs';
import { loadTaxonomy } from '../tools/classify/taxonomy.mjs';
import { runPipeline } from '../tools/classify-bank.mjs';

const sampleSource = async () => JSON.parse(await readFile(path.join(repoRoot, 'demo', 'pyq-intake-sample.json'), 'utf8'));

/* ------------------------------------------------------------- repair --- */

test('an escape artefact becomes a real newline; ordinary text is untouched', () => {
  const escaped = 'The right was removed by the 44th\\nConstitutional Amendment.\\nIt came into force in 1978.';
  const repaired = repairEscapedNewlines(escaped);
  assert.equal(repaired.count, 2);
  assert.ok(!repaired.text.includes('\\n'), 'no literal escape survives');
  assert.equal(repaired.text.split('\n').length, 3);
  assert.equal(repaired.text.replace(/\n/g, ' '), escaped.replace(/\\n/g, ' '), 'only the escapes changed');

  const real = 'A line\nand another';
  const untouched = repairEscapedNewlines(real);
  assert.equal(untouched.count, 0);
  assert.equal(untouched.text, real);
});

test('the repair pass moves provenance out of the data and records what it moved', async () => {
  const intake = { ...(await sampleSource()) };
  // The adapter copies the source records; the repair pass is the step that
  // removes provenance, so hand it the shapes it sees after adaptation.
  intake.questions = intake.questions.map((q) => ({
    ...q,
    supplied_answer: { answer: q.answer ?? null, status: q.answer_status ?? null, source: q.answer_source ?? null, notes: null },
  }));
  const report = repairIntake(intake);

  assert.equal('provenance' in intake, false, 'the bank-level provenance block is gone');
  assert.equal(report.provenance_moved.bank_provenance.kind, 'synthetic_demo', 'and recorded in the report instead');
  assert.equal(intake.questions.filter((q) => q.source_reference).length, 0);
  assert.equal(report.provenance_moved.question_source_references, 1, 'the sample carries one source reference');
  assert.ok(report.provenance_moved.samples.length > 0, 'a sample reference is kept for the audit trail');
  assert.equal(intake.questions.every((q) => q.supplied_answer.source === null), true);
  assert.equal(report.answer_sources_blanked, 8, 'the eight sample answers that named a source were blanked');
  assert.equal(report.paper_fixes.answer_key_sources_blanked + report.paper_fixes.source_file_lists_blanked > 0, true);
});

test('the pipeline never mutates the object it was handed', async () => {
  const source = await sampleSource();
  const before = JSON.stringify(source);
  await runPipeline(source);
  assert.equal(JSON.stringify(source), before, 'a second run on the same parsed source must see the same input');
});

/* ----------------------------------------------------- reviewed labels --- */

test('a reviewed label is applied as "reviewed" and never as an AI label', async () => {
  const taxonomy = await loadTaxonomy();
  const intake = { questions: [{ id: 'Q1', subject: null, topic: null, subtopic: null, metadata: {} }] };
  const text = JSON.stringify({
    id: 'Q1',
    subject: 'Polity',
    topic: 'Constitution of India',
    subtopic: 'Fundamental Rights',
    confidence: 0.9,
    reason: 'Article 32 discussion',
  });
  const { labels, malformed } = parseReviewedLabels(text);
  assert.equal(labels.length, 1);
  assert.equal(malformed.length, 0);

  const summary = applyReviewedLabels(intake, labels, taxonomy, { labelFile: 'data/pyq/reviewed-labels.jsonl', malformed });
  assert.equal(summary.applied.length, 1);
  assert.equal(summary.rejected.length, 0);
  const q = intake.questions[0];
  assert.equal(q.subject, 'Polity');
  assert.equal(q.topic, 'Constitution of India');
  assert.equal(q.subtopic, 'Fundamental Rights');
  assert.equal(q.classification_source, CLASSIFICATION_SOURCE_REVIEWED);
  assert.equal(q.metadata.reviewed_classification.method, 'human_review');
  assert.equal(q.metadata.reviewed_classification.label_file, 'data/pyq/reviewed-labels.jsonl');
  assert.ok(!('ai_classification' in q.metadata), 'a human decision is never stamped as an AI one');
});

test('an explicit agent-assisted review method is preserved in internal metadata', async () => {
  const taxonomy = await loadTaxonomy();
  const intake = { questions: [{ id: 'Q1', subject: null, topic: null, subtopic: null, metadata: {} }] };
  const { labels } = parseReviewedLabels(JSON.stringify({
    id: 'Q1',
    subject: 'Polity',
    topic: 'Constitution of India',
    subtopic: 'Fundamental Rights',
    confidence: 0.9,
    review_method: 'agent_assisted_validation',
    reason: 'A review method is explicitly disclosed and the full path is checked against the taxonomy.',
  }));

  const summary = applyReviewedLabels(intake, labels, taxonomy);
  assert.equal(summary.applied.length, 1);
  assert.equal(intake.questions[0].metadata.reviewed_classification.method, 'agent_assisted_validation');
  assert.equal(summary.decisions[0].review_method, 'agent_assisted_validation');
});

test('a reviewed label the taxonomy cannot hold changes nothing', async () => {
  const taxonomy = await loadTaxonomy();
  const intake = {
    questions: [
      { id: 'Q1', subject: null, topic: null, subtopic: null, metadata: {} },
      { id: 'Q2', subject: 'History', topic: 'Modern India', subtopic: null, metadata: {} },
    ],
  };
  const labels = [
    { id: 'Q1', subject: 'Astrology' },
    { id: 'Q2', subject: 'History', topic: 'Renaissance and Reformation' }, // real topic, wrong subject
    { id: 'Q3', subject: 'Polity' },
    { id: 'Q4', subject: 42 },
  ];
  const summary = applyReviewedLabels(intake, labels, taxonomy, { malformed: [{ line: 5, reason: 'not JSON', excerpt: '{oops' }] });
  assert.equal(summary.applied.length, 0);
  assert.equal(summary.rejected.length, 4);
  assert.equal(summary.malformed.length, 1);
  assert.equal(intake.questions[0].subject, null, 'an out-of-taxonomy label leaves the question alone');
  assert.equal(intake.questions[1].subject, 'History', 'a topic that does not belong to the subject is refused');
  assert.equal(intake.questions[1].topic, 'Modern India');
});

test('the committed review file only contains real taxonomy paths', async () => {
  const text = await readFile(dataPath('pyq', 'reviewed-labels.jsonl'), 'utf8');
  const taxonomy = await loadTaxonomy();
  const { labels, malformed } = parseReviewedLabels(text);
  assert.equal(malformed.length, 0, 'every line of the committed review file parses');
  assert.ok(labels.length > 500, `expected all original and remediated review labels, found ${labels.length}`);
  const seen = new Set();
  for (const label of labels) {
    assert.equal(seen.has(label.id), false, `${label.id} appears twice`);
    seen.add(label.id);
    assert.equal(typeof label.reason, 'string', `${label.id} must record why it was classified this way`);
    const subject = taxonomy.subjects.get(label.subject);
    assert.ok(subject, `${label.id}: ${label.subject} is not a taxonomy subject`);
    if (label.topic) {
      assert.ok(subject.has(label.topic), `${label.id}: ${label.subject} / ${label.topic} is not in the taxonomy`);
      if (label.subtopic) {
        assert.ok(subject.get(label.topic).includes(label.subtopic), `${label.id}: ${label.subject} / ${label.topic} / ${label.subtopic} is not in the taxonomy`);
      }
    }
    // Plain-language guard: no label may claim a provider wrote it.
    assert.ok(!/\b(ai|gpt|llm)\b/i.test(label.reason), `${label.id}: the reason must not claim an AI decision`);
  }
});

/* ----------------------------------------------------------- sanitiser --- */

test('paper ids lose their source-flavoured suffix', () => {
  assert.equal(cleanPaperId('MPPSC-2019-GS1-BOOK'), 'MPPSC-2019-P1');
  assert.equal(cleanPaperId('MPPSC-2021-GS2-BOOK'), 'MPPSC-2021-P2');
  assert.equal(cleanPaperId('MPPSC-2022-GS-I-BOOK'), 'MPPSC-2022-P1');
  assert.equal(cleanPaperId('MPPSC-2024-P1'), 'MPPSC-2024-P1');
  assert.equal(cleanPaperId(null), '');
});

test('the sanitiser writes the marking scheme and removes every source claim', () => {
  const bank = {
    schema_version: '1.0.0',
    bank_id: 'mppsc-solved-pyq-book-2019-2024',
    bank_name: 'book transcription',
    provenance: { kind: 'coaching_material', sources: [{ description: 'some-book.md' }] },
    generator: { name: 'tools/classify-bank.mjs', version: '1.0.0', notes: 'old text' },
    papers: [
      {
        paper_id: 'MPPSC-2019-GS1-BOOK',
        exam: 'MPPSC State Service Preliminary Examination',
        year: 2019,
        paper_code: 'GS-I',
        paper_name: 'MPPSC 2019 Prelims — solved-book transcription',
        answer_key: { source: 'Some Coaching Book', status: 'unofficial', notes: 'printed answers' },
        source_files: [{ path: 'some-book.md' }],
        metadata: { source_kind: 'coaching_material', built_by: 'tools/build-bank.mjs' },
        scoring: { rules_known: false },
      },
      {
        paper_id: 'MPPSC-2012-GS1-BOOK',
        exam: 'MPPSC State Service Preliminary Examination',
        year: 2012,
        paper_code: 'GS-I',
        paper_name: 'MPPSC 2012 Prelims — solved-book transcription',
        scoring: { rules_known: false },
      },
    ],
    questions: [
      {
        id: 'MPPSC-2019-001',
        paper_id: 'MPPSC-2019-GS1-BOOK',
        language_variants: { en: { question_text: 'Stem', options: [{ key: 'A', text: 'One' }] } },
        supplied_answer: { answer: ['A'], status: 'unofficial', source: 'Some Coaching Book' },
        answer_key_status: 'unofficial',
        source_reference: { file: 'some-book.md', page: 3 },
        metadata: { book_additional_information: 'note from the book', parser_version: '0.1.0' },
        subject: null,
        topic: null,
        subtopic: null,
      },
      {
        id: 'MPPSC-2019-002',
        paper_id: 'MPPSC-2019-GS1-BOOK',
        language_variants: { en: { question_text: 'Stem', options: [{ key: 'A', text: 'One' }] } },
        supplied_answer: { answer: null, status: 'missing', source: null },
        answer_key_status: 'missing',
        explanation: { status: 'unreviewed', correct_reasoning: 'a\\nb' },
        metadata: {},
        subject: null,
        topic: null,
        subtopic: null,
      },
    ],
  };

  const { bank: clean, report } = sanitiseBank(bank);
  assert.equal(clean.bank_id, APP_BANK_ID);
  assert.equal(clean.bank_name, APP_BANK_NAME);
  assert.equal('provenance' in clean, false);
  assert.equal(report.removed.bank_provenance.kind, 'coaching_material', 'the removed block is kept in the report');

  assert.equal(clean.papers[0].paper_id, 'MPPSC-2019-P1');
  assert.equal(clean.papers[0].paper_name, 'MPPSC 2019 Prelims Paper I (General Studies)');
  assert.equal('answer_key' in clean.papers[0], false);
  assert.equal('source_files' in clean.papers[0], false);
  assert.equal('metadata' in clean.papers[0], false, 'internal paper build metadata is stripped');
  assert.equal(clean.papers[0].scoring.rules_known, true);
  assert.equal(clean.papers[0].scoring.marks_per_correct, 3);
  assert.equal(clean.papers[0].scoring.negative_marks_per_incorrect, 1);
  assert.equal(clean.papers[0].scoring.negative_marking_enabled, true);
  assert.equal(clean.papers[0].scoring.marks_for_unanswered, 0);
  assert.equal(clean.papers[0].scoring.scheme_id, 'mppsc-sse-prelims-latest-practice');
  assert.equal(clean.papers[0].total_marks, 300);
  assert.equal(clean.papers[0].duration_minutes, 120);

  // A year no verified scheme covers keeps its rules unknown: the app asks.
  assert.equal(clean.papers[1].scoring.rules_known, false);
  assert.equal(clean.papers[1].scoring.marks_per_correct, null);
  assert.match(clean.papers[1].scoring.notes, /does not assume/i);
  assert.deepEqual(
    report.marking_scheme_unresolved.map((p) => p.paper_id),
    ['MPPSC-2012-P1'],
  );

  const q1 = clean.questions[0];
  assert.equal(q1.paper_id, 'MPPSC-2019-P1');
  assert.equal('source_reference' in q1, false);
  assert.equal(q1.supplied_answer.status, 'supplied');
  assert.equal('source' in q1.supplied_answer, false);
  assert.equal(q1.answer_key_status, 'supplied');
  assert.equal('book_additional_information' in (q1.metadata || {}), false);
  assert.equal('reviewed_classification' in (q1.metadata || {}), false, 'review bookkeeping is stripped too');
  assert.equal('parser_version' in (q1.metadata || {}), false);

  const q2 = clean.questions[1];
  assert.equal(q2.supplied_answer.status, 'missing');
  assert.equal(q2.explanation.correct_reasoning, 'a\nb', 'the escape becomes a real newline');
  assert.equal(report.repaired_escapes.occurrences, 1);
  assert.equal(report.answer_status.missing, 1);
  assert.equal('generator' in clean, false, 'internal generator/build metadata is stripped');
  assert.ok(report.removed.bank_generator, 'the generator block is retained in the internal audit');
  assert.ok(!/solved-book|coaching/i.test(JSON.stringify(clean)), 'no source name survives anywhere in the bank');
});

test('a paper that states its own rules keeps them, and a sample keeps its identity', () => {
  const sample = {
    is_demonstration: true,
    bank_id: 'SAMPLE-2023-GS1',
    bank_name: 'Sample General Studies Paper I',
    papers: [
      {
        paper_id: 'SAMPLE-2023-GS1',
        year: 2023,
        paper_code: 'GS-I',
        paper_name: 'Sample General Studies Paper I',
        scoring: { rules_known: true, marks_per_correct: 2, negative_marks_per_incorrect: 0.66, negative_marking_enabled: true, marks_for_unanswered: 0, rules_source: 'Illustrative rule set for the pipeline sample.' },
      },
    ],
    questions: [],
  };
  const { bank: clean, report } = sanitiseBank(sample);
  // A sample must never look like the real bank…
  assert.equal(clean.bank_id, 'SAMPLE-2023-GS1');
  assert.equal(clean.bank_name, 'Sample General Studies Paper I');
  assert.equal(clean.papers[0].paper_id, 'SAMPLE-2023-GS1');
  assert.equal(report.identifiers.stamped_app_identity, false);
  // …and a rule set the source stated is not overwritten by the table lookup.
  assert.equal(clean.papers[0].scoring.negative_marking_enabled, true);
  assert.equal(clean.papers[0].scoring.negative_marks_per_incorrect, 0.66);
  assert.equal(clean.papers[0].scoring.scheme_id, undefined, 'no automatic scheme is claimed for it');
  assert.deepEqual(
    report.marking_scheme_preserved.map((p) => p.paper_id),
    ['SAMPLE-2023-GS1'],
  );
  assert.equal(report.marking_scheme.length, 0);
});

test('the committed bank is the sanitised one: scheme written, no provenance, no AI claims', async () => {
  const bank = JSON.parse(await readFile(dataPath('pyq', 'mymppsc-pyq-bank.json'), 'utf8'));
  assert.equal(bank.bank_id, APP_BANK_ID);
  assert.equal('provenance' in bank, false);
  assert.equal(JSON.stringify(bank).includes('YOUR_BOOK'), false, 'the source file name is not in the bank');
  assert.equal(JSON.stringify(bank).includes('unofficial'), false);
  assert.equal(bank.questions.filter((q) => q.source_reference).length, 0);
  const rawEscapes = [];
  const walk = (value, where) => {
    if (typeof value === 'string') {
      if (value.includes('\\n')) rawEscapes.push(where);
      return;
    }
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${where}.${k}`);
  };
  walk(bank, 'bank');
  assert.deepEqual(rawEscapes, [], 'no two-character escape artefact is left in the bank text');
  // What the file says about its labels is limited to the vocabulary and the tool
  // that wrote them; how many labels came from a review pass or a provider belongs
  // to data/pyq/review-report.json.
  assert.equal('classification_meta' in bank, false, 'the shipped file describes the questions, not the build that produced them');
  assert.equal(bank.questions.some((q) => 'classification_source' in q || 'classification_confidence' in q), false, 'no per-record label provenance in the shipped file');

  assert.equal(bank.questions.length, 1171);
  assert.equal(bank.papers.length, 12);
  assert.equal('generator' in bank, false);
  for (const paper of bank.papers) {
    assert.match(paper.paper_id, /^MPPSC-\d{4}-P1$/, `${paper.paper_id} should be an app-facing id`);
    assert.equal(paper.scoring.rules_known, true, `${paper.paper_id} must carry the latest practice scheme`);
    assert.equal(paper.scoring.scheme_id, 'mppsc-sse-prelims-latest-practice');
    assert.equal(paper.scoring.marks_per_correct, 3);
    assert.equal(paper.scoring.negative_marking_enabled, true);
    assert.equal(paper.scoring.negative_marks_per_incorrect, 1);
    assert.equal(paper.total_marks, 300);
    assert.equal(paper.original_question_count, 100, 'source paper length is retained');
  }
  const statuses = new Set(bank.questions.map((q) => q.answer_key_status));
  assert.deepEqual([...statuses].sort(), ['supplied'], 'the committed answer review resolved the last keyless questions');
  // The review decision itself is a classification, and stays; the review
  // file's path and timestamp are build-time bookkeeping and do not.
  assert.equal(bank.questions.some((q) => q.metadata && 'reviewed_classification' in q.metadata), false, 'review bookkeeping is not app data');
  assert.equal(JSON.stringify(bank).includes('label_file'), false, 'the review file path is not in the bank');
  assert.ok(bank.questions.some((q) => q.subject && q.topic), 'the reviewed labels are still the classification');
  assert.ok(bank.questions.every((q) => !q.metadata || !('label_file' in q.metadata)));
});
