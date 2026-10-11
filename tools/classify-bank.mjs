#!/usr/bin/env node
/**
 * tools/classify-bank.mjs — the PYQ classification pipeline.
 *
 *   node tools/classify-bank.mjs --in data/pyq/source/MPPSC_PYQ_intake.json \
 *       --out data/pyq/mymppsc-pyq-bank.json --reports data/pyq
 *
 * One deterministic pass:
 *   1. adapt the source extraction into the intake shape (tools/classify/intake-adapter.mjs);
 *   2. classify every question with the rule engine, or keep a source/AI label;
 *   3. merge any provider labels (--apply-ai) and re-validate them against the taxonomy;
 *   4. build the bank with the app's own tool (tools/build-bank.mjs);
 *   5. validate it with the app's own validator (js/core/validate.js);
 *   6. write the classification report, the review report and the AI queue.
 *
 * Nothing is invented and nothing is deleted: an unplaceable question stays
 * unclassified with a reason, a printed answer stays printed, and both members
 * of every suspected duplicate pair stay in the bank.
 *
 * Build-time tool only — the browser app never imports this file.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBankFromIntake } from './build-bank.mjs';
import { validateBank } from '../js/core/validate.js';
import { loadTaxonomy, subjectNames, reconcile, TAXONOMY_PATH } from './classify/taxonomy.mjs';
import { RULES, classifyWithRules, validateRules, CLASSIFICATION_SOURCE_RULES } from './classify/rules.mjs';
import { adaptIntake } from './classify/intake-adapter.mjs';
import { buildAiQueue, renderAiQueueJsonl, renderAiTaxonomy, parseLabels, applyAiLabels } from './classify/ai-queue.mjs';
import {
  buildClassificationReport,
  renderClassificationMarkdown,
  buildReviewReport,
  renderReviewMarkdown,
  LOW_CONFIDENCE_THRESHOLD,
} from './classify/reports.mjs';

const TOOL_VERSION = '1.0.0';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resolve = (file) => (path.isAbsolute(file) ? file : path.join(root, file));

function args(argv) {
  const out = { flags: new Set(), values: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out.values[key] = next;
      i += 1;
    } else out.flags.add(key);
  }
  return out;
}

/** Evidence text for the rule engine: stem + options + explanation (as context). */
function evidenceFor(question) {
  const variant = question.language_variants?.en || Object.values(question.language_variants || {})[0] || {};
  return {
    question_text: variant.question_text || '',
    option_texts: (variant.options || []).map((o) => o.text),
    explanation_text: typeof question.explanation === 'string' ? question.explanation : question.explanation?.correct_reasoning || '',
  };
}

function excerpt(question, length = 120) {
  const variant = question.language_variants?.en || Object.values(question.language_variants || {})[0] || {};
  return String(variant.question_text || '').replace(/\s+/g, ' ').trim().slice(0, length);
}

/**
 * Classify one intake question in place.
 * Precedence: a provider label already applied > a source-supplied
 * classification that reconciles with the taxonomy > the rule engine.
 */
export function classifyQuestion(question, taxonomy) {
  const flags = [];
  const metadata = { ...(question.metadata || {}) };
  const evidence = evidenceFor(question);
  const decision = classifyWithRules(evidence, { taxonomy });
  const sourceSubject = question.subject || null;
  const sourceTopic = question.topic || null;
  const sourceSubtopic = question.subtopic || null;
  const sourceProvenance = question.classification_source || null;

  let outcome;
  if (sourceProvenance === 'pipeline-ai') {
    // A provider label was merged earlier in this run; trust the merge, which
    // already validated the label against the taxonomy.
    outcome = {
      assigned: Boolean(question.subject),
      subject: question.subject || null,
      topic: question.topic || null,
      subtopic: question.subtopic || null,
      confidence: question.classification_confidence ?? null,
      source: 'pipeline-ai',
      reason: question.subject ? null : 'ai_no_label',
      candidates: decision.candidates,
      matched: decision.matched,
      mpSpecific: decision.mpSpecific,
    };
    if (!outcome.assigned) flags.push('unclassified_after_ai');
    if (outcome.confidence !== null && outcome.confidence < LOW_CONFIDENCE_THRESHOLD) flags.push('low_confidence_ai');
  } else if (sourceSubject) {
    const reconciled = reconcile(taxonomy, sourceSubject, sourceTopic, sourceSubtopic);
    if (reconciled.subject) {
      question.subject = reconciled.subject;
      question.topic = reconciled.topic;
      question.subtopic = reconciled.subtopic;
      question.classification_confidence = Number.isFinite(Number(question.classification_confidence)) ? Number(question.classification_confidence) : null;
      question.classification_source = sourceProvenance || 'source_extraction';
      outcome = {
        assigned: true,
        subject: reconciled.subject,
        topic: reconciled.topic,
        subtopic: reconciled.subtopic,
        confidence: question.classification_confidence,
        source: question.classification_source,
        reason: reconciled.problems.join('; ') || null,
        candidates: decision.candidates,
        matched: decision.matched,
        mpSpecific: decision.mpSpecific,
      };
      flags.push('source_classification_kept');
      if (reconciled.problems.length) flags.push('source_classification_partially_dropped');
      if (decision.assigned && decision.subject && decision.subject !== reconciled.subject) {
        flags.push('source_vs_rules_disagree');
        metadata.classification_review = {
          source: { subject: reconciled.subject, topic: reconciled.topic, subtopic: reconciled.subtopic },
          rule_suggestion: { subject: decision.subject, topic: decision.topic, subtopic: decision.subtopic, confidence: decision.confidence },
          note: 'The source classification was kept. The rule engine would have chosen a different subject; a human should confirm which one is right.',
        };
      }
    } else {
      flags.push('source_classification_not_in_taxonomy');
      metadata.classification_dropped = { subject: sourceSubject, topic: sourceTopic, subtopic: sourceSubtopic, source: sourceProvenance };
      outcome = { ...decision, source: CLASSIFICATION_SOURCE_RULES };
    }
  } else {
    outcome = { ...decision, source: CLASSIFICATION_SOURCE_RULES };
  }

  if (!outcome.assigned) {
    question.subject = null;
    question.topic = null;
    question.subtopic = null;
    question.classification_confidence = null;
    question.classification_source = outcome.source;
    flags.push(`unclassified_${outcome.reason || 'unknown_reason'}`);
  } else {
    question.subject = outcome.subject;
    question.topic = outcome.topic;
    question.subtopic = outcome.subtopic;
    question.classification_confidence = outcome.confidence;
    question.classification_source = outcome.source;
    flags.push(...(outcome.flags || []));
    if (outcome.confidence !== null && outcome.confidence < LOW_CONFIDENCE_THRESHOLD) flags.push('low_confidence');
    if (outcome.reason && outcome.reason.startsWith('topic ambiguous')) flags.push('ambiguous_topic');
  }

  if (decision.mpSpecific) flags.push('madhya_pradesh_specific');
  if (!question.supplied_answer?.answer?.length) flags.push('missing_answer_key');

  question.metadata = {
    ...metadata,
    classification_flags: Array.from(new Set(flags)),
    ...(decision.mpMarkers?.length ? { classification_evidence: { mp_markers: decision.mpMarkers, matched_rules: (outcome.matched || []).slice(0, 4).map((m) => m.ruleId) } } : { classification_evidence: { matched_rules: (outcome.matched || []).slice(0, 4).map((m) => m.ruleId) } }),
  };

  return {
    id: question.id,
    paperId: question.paper_id,
    year: question.year ?? null,
    subject: question.subject,
    topic: question.topic,
    subtopic: question.subtopic,
    confidence: question.classification_confidence ?? null,
    source: question.classification_source || null,
    flags: Array.from(new Set(flags)),
    reason: outcome.reason,
    candidates: outcome.candidates || [],
    mpSpecific: Boolean(decision.mpSpecific),
    excerpt: excerpt(question),
  };
}

/** Run the whole pipeline against a parsed source object. */
export async function runPipeline(source, opts = {}) {
  const taxonomy = await loadTaxonomy(opts.taxonomy || TAXONOMY_PATH);
  const ruleProblems = validateRules(taxonomy);
  if (ruleProblems.length) {
    throw new Error(`The rule table does not match the taxonomy:\n  - ${ruleProblems.join('\n  - ')}`);
  }

  const adapted = adaptIntake(source, {
    bankId: opts.bankId,
    bankName: opts.bankName,
    isDemonstration: opts.isDemonstration,
  });
  const intake = adapted.intake;
  const pipelineNotes = [...adapted.notes];

  // The rule engine runs first so the AI merge always has something to compare
  // against. A provider reply that is empty, malformed or out of taxonomy then
  // leaves the classification the rules produced untouched, and a reply with a
  // valid subject but an unusable topic keeps the topic the rules found.
  let rows = intake.questions.map((q) => classifyQuestion(q, taxonomy));

  let aiSummary = null;
  if (opts.aiLabels) {
    const { labels, notes: labelNotes, malformed } = parseLabels(opts.aiLabels);
    pipelineNotes.push(...labelNotes);
    aiSummary = applyAiLabels(intake, labels, taxonomy, {
      provider: opts.aiProvider,
      model: opts.aiModel,
      malformed,
      overwriteSource: Boolean(opts.overwriteSourceClassification),
    });
    pipelineNotes.push(...aiSummary.notes.map((n) => `AI labels: ${n}`));
    pipelineNotes.push(
      `AI labels merged: ${aiSummary.applied.length} applied, ${aiSummary.preserved.length} preserved, ${aiSummary.rejected.length} rejected, ${aiSummary.malformed.length} malformed line(s).`,
    );
    for (const r of aiSummary.rejected) pipelineNotes.push(`AI label rejected for ${r.id ?? 'an unknown id'}: ${r.reason}`);
    // Refresh only the rows the merge actually changed, so the queue, the
    // reports and the bank describe the same thing. Every other question keeps
    // the row its rule pass produced.
    const appliedIds = new Set(aiSummary.applied.map((a) => a.id));
    if (appliedIds.size) {
      const rowById = new Map(rows.map((r) => [r.id, r]));
      rows = intake.questions.map((q) => (appliedIds.has(q.id) ? classifyQuestion(q, taxonomy) : rowById.get(q.id)));
    }
  }

  const byId = new Map(intake.questions.map((q) => [q.id, q]));

  const { bank, warnings } = buildBankFromIntake(intake);
  bank.generator = {
    name: 'tools/classify-bank.mjs',
    version: TOOL_VERSION,
    notes: `Classified with the deterministic rule engine (tools/classify/rules.mjs, taxonomy ${taxonomy.version}). Source question text, options, printed answers and explanations are reproduced verbatim; only classification and review metadata were added.`,
  };
  bank.classification_meta = {
    tool: `tools/classify-bank.mjs ${TOOL_VERSION}`,
    taxonomy_path: 'data/taxonomy/mppsc-taxonomy.json',
    taxonomy_version: taxonomy.version,
    taxonomy_subjects: subjectNames(taxonomy),
    rule_count: RULES.length,
    ai_labels_applied: aiSummary ? aiSummary.applied.length : 0,
    low_confidence_threshold: LOW_CONFIDENCE_THRESHOLD,
  };

  const validation = validateBank(bank, {});

  // Duplicate flags come from the validator, so they are attached after it runs.
  // Adding metadata cannot change a validation result, so the report above stays valid.
  const bankById = new Map(bank.questions.map((q) => [q.id, q]));
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const partners = new Map();
  for (const pair of validation.nearDuplicates || []) {
    const list = partners.get(pair.a) || [];
    list.push({ id: pair.b, similarity: pair.similarity });
    partners.set(pair.a, list);
    const listB = partners.get(pair.b) || [];
    listB.push({ id: pair.a, similarity: pair.similarity });
    partners.set(pair.b, listB);
  }
  for (const [id, list] of partners.entries()) {
    const q = bankById.get(id);
    const row = rowById.get(id);
    if (q) {
      q.metadata = { ...(q.metadata || {}), near_duplicate_candidates: list };
      q.metadata.classification_flags = Array.from(new Set([...(q.metadata.classification_flags || []), 'near_duplicate_candidate']));
    }
    if (row) {
      row.flags = Array.from(new Set([...(row.flags || []), 'near_duplicate_candidate']));
      row.duplicatePartners = list;
    }
  }
  for (const issue of validation.warnings.filter((w) => w.code === 'identical_question_content')) {
    for (const id of issue.ids || []) {
      const q = bankById.get(id);
      const row = rowById.get(id);
      if (q) q.metadata.classification_flags = Array.from(new Set([...(q.metadata.classification_flags || []), 'identical_content_group']));
      if (row) row.flags = Array.from(new Set([...(row.flags || []), 'identical_content_group']));
    }
  }

  const meta = {
    bankId: bank.bank_id,
    bankName: bank.bank_name,
    generator: `tools/classify-bank.mjs ${TOOL_VERSION}`,
    taxonomy_version: taxonomy.version,
    subjects_allowed: subjectNames(taxonomy),
    pipeline_notes: pipelineNotes,
    ai_merge: aiSummary
      ? {
          applied: aiSummary.applied.length,
          preserved: aiSummary.preserved.length,
          rejected: aiSummary.rejected.length,
          flagged: aiSummary.flagged.length,
          malformed: aiSummary.malformed.length,
        }
      : null,
  };

  const classificationReport = buildClassificationReport(rows, meta);
  const reviewReport = buildReviewReport(
    bank,
    validation,
    rows,
    {
      sourceQuestionCount: opts.sourceQuestionCount ?? (Array.isArray(source?.questions) ? source.questions.length : rows.length),
      duplicateIds: adapted.duplicateIds,
      unmappedKeys: adapted.unmappedKeys,
      recordIssues: adapted.recordIssues,
      aiSummary,
    },
  );

  const aiQueue = buildAiQueue(rows, bankById, taxonomy);

  return {
    intake,
    bank,
    rows,
    validation,
    buildWarnings: warnings,
    classificationReport,
    reviewReport,
    aiQueue,
    aiSummary,
    meta,
    taxonomy,
  };
}

const HELP = `tools/classify-bank.mjs — classify a PYQ extraction into an importable MyMPPSC bank.

Usage:
  node tools/classify-bank.mjs --in <source.json> --out <bank.json> [--reports <dir>] [options]

Options:
  --in <file>          source intake/extraction file (the pipeline's only input)
  --out <file>         where to write the classified bank
  --reports <dir>      where to write classification-report and review-report (default: <out> directory)
  --ai-queue <file>    where to write the resumable AI queue (default: <reports>/ai-queue.jsonl)
  --apply-ai <file>    merge provider labels from this JSONL/JSON file before building
  --ai-provider <name> provider name recorded on merged labels (default: from MYMPPSC_AI_PROVIDER)
  --ai-model <name>    model name recorded on merged labels (default: from MYMPPSC_AI_MODEL)
  --overwrite-source   let provider labels replace a classification the source file supplied
  --bank-id <id>       override the bank id
  --bank-name <name>   override the bank name
  --strict             exit non-zero when anything needs review
  --quiet              only print the essentials
`;

async function main() {
  const parsed = args(process.argv.slice(2));
  if (parsed.flags.has('help') || !parsed.values.in || !parsed.values.out) {
    console.log(HELP);
    process.exit(parsed.flags.has('help') ? 0 : 1);
  }

  const sourceText = await readFile(resolve(parsed.values.in), 'utf8');
  const source = JSON.parse(sourceText);

  const outPath = resolve(parsed.values.out);
  const reportsDir = resolve(parsed.values.reports || path.dirname(outPath));
  const aiQueuePath = resolve(parsed.values['ai-queue'] || path.join(reportsDir, 'ai-queue.jsonl'));

  const result = await runPipeline(source, {
    bankId: parsed.values['bank-id'],
    bankName: parsed.values['bank-name'],
    aiLabels: parsed.values['apply-ai'] ? await readFile(resolve(parsed.values['apply-ai']), 'utf8') : null,
    aiProvider: parsed.values['ai-provider'] || process.env.MYMPPSC_AI_PROVIDER || null,
    aiModel: parsed.values['ai-model'] || process.env.MYMPPSC_AI_MODEL || null,
    overwriteSourceClassification: parsed.flags.has('overwrite-source'),
  });

  const { bank, validation, classificationReport, reviewReport, aiQueue, buildWarnings, aiSummary } = result;

  console.log(`Source  : ${parsed.values.in}`);
  console.log(`Bank    : ${outPath}`);
  console.log(`Reports : ${reportsDir}`);
  console.log('');
  console.log(`questions          : ${bank.questions.length} (source: ${reviewReport.totals.questions_in_source})`);
  console.log(`papers             : ${bank.papers.length}`);
  console.log(`subject classified : ${classificationReport.levels.subject.classified} (${classificationReport.levels.subject.percentage}%)`);
  console.log(`topic classified   : ${classificationReport.levels.topic.classified} (${classificationReport.levels.topic.percentage}%)`);
  console.log(`subtopic classified: ${classificationReport.levels.subtopic.classified} (${classificationReport.levels.subtopic.percentage}%)`);
  console.log(`unclassified       : ${classificationReport.levels.subject.unclassified}`);
  console.log(`low confidence     : ${classificationReport.low_confidence.length}`);
  console.log(`missing answer keys: ${reviewReport.totals.missing_answer_keys}`);
  console.log(`near-duplicate pair: ${reviewReport.totals.near_duplicate_pairs}`);
  console.log(`AI queue           : ${aiQueue.length}`);
  if (aiSummary) {
    console.log(
      `AI labels merged   : ${aiSummary.applied.length} applied, ${aiSummary.preserved.length} preserved, ${aiSummary.rejected.length} rejected, ${aiSummary.malformed.length} malformed`,
    );
  }
  console.log('');
  console.log(`validator: ${validation.ok ? 'ok' : 'blocked'} — fatal ${validation.fatal.length}, errors ${validation.errors.length}, rejected ${validation.rejected.length}, warnings ${validation.warnings.length}`);
  if (validation.fatal.length || validation.errors.length) {
    for (const issue of [...validation.fatal, ...validation.errors].slice(0, 12)) {
      console.log(`  - ${issue.questionId || issue.paperId || '—'}: ${issue.message}`);
    }
  }
  if (buildWarnings.length && !parsed.flags.has('quiet')) {
    console.log('');
    console.log('Build notes:');
    for (const w of buildWarnings.slice(0, 10)) console.log(`  - ${w}`);
    if (buildWarnings.length > 10) console.log(`  … and ${buildWarnings.length - 10} more.`);
  }
  if (result.meta.pipeline_notes.length && !parsed.flags.has('quiet')) {
    console.log('');
    console.log('Pipeline notes:');
    for (const n of result.meta.pipeline_notes.slice(0, 10)) console.log(`  - ${n}`);
    if (result.meta.pipeline_notes.length > 10) console.log(`  … and ${result.meta.pipeline_notes.length - 10} more.`);
  }

  if (validation.rejected.length || validation.fatal.length) {
    console.log('\nNothing was written: the app would reject records from this bank. Fix the source and run again.');
    process.exit(2);
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await mkdir(reportsDir, { recursive: true });
  await writeFile(outPath, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
  await writeFile(path.join(reportsDir, 'classification-report.json'), `${JSON.stringify(classificationReport, null, 2)}\n`, 'utf8');
  await writeFile(path.join(reportsDir, 'classification-report.md'), renderClassificationMarkdown(classificationReport, result.meta), 'utf8');
  await writeFile(path.join(reportsDir, 'review-report.json'), `${JSON.stringify(reviewReport, null, 2)}\n`, 'utf8');
  await writeFile(path.join(reportsDir, 'review-report.md'), renderReviewMarkdown(reviewReport), 'utf8');
  await writeFile(aiQueuePath, renderAiQueueJsonl(aiQueue), 'utf8');
  // The closed vocabulary the provider must choose from, shared by every queue
  // item so the queue file stays small. Written even for an empty queue so a
  // resume run always finds it.
  await writeFile(aiQueuePath.replace(/\.jsonl?$/i, '') + '.taxonomy.json', renderAiTaxonomy(result.taxonomy), 'utf8');

  console.log('');
  console.log(`Wrote ${bank.questions.length} question(s) across ${bank.papers.length} paper(s).`);
  console.log(`  ${path.relative(root, outPath)}`);
  console.log(`  ${path.relative(root, path.join(reportsDir, 'classification-report.md'))}`);
  console.log(`  ${path.relative(root, path.join(reportsDir, 'review-report.md'))}`);
  if (aiQueue.length) {
    console.log(`  ${path.relative(root, aiQueuePath)} — ${aiQueue.length} question(s) still need a semantic label.`);
    console.log(`  ${path.relative(root, aiQueuePath.replace(/\.jsonl?$/i, '') + '.taxonomy.json')} — the closed vocabulary those requests must use.`);
    console.log('  Run tools/classify/ai-provider.mjs on it, then re-run with --apply-ai to resume.');
  }
  console.log('\nImport it in the app: Question Bank & Imports → choose the file.');

  if (parsed.flags.has('strict')) {
    const pending = validation.warnings.length + classificationReport.levels.subject.unclassified + aiQueue.length;
    if (pending) {
      console.log(`\n--strict: ${pending} item(s) still need attention.`);
      process.exit(3);
    }
  }
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`classify-bank failed: ${err.message}`);
    process.exit(1);
  });
}
