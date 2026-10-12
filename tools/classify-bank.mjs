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
 *   3. merge maintainer review labels (--apply-review) and any provider labels
 *      (--apply-ai), re-validating both against the taxonomy, then the human
 *      answer/explanation resolutions for questions the source left keyless
 *      (--apply-answers);
 *   4. build the bank with the app's own tool (tools/build-bank.mjs) and sanitise it
 *      for the app: no source provenance, neutral answer-key statuses, the
 *      automatic MPPSC marking scheme per paper (tools/classify/sanitise-bank.mjs);
 *   4b. merge human review decisions (--apply-review) and repair the extraction's
 *      artefacts (tools/classify/repair.mjs);
 *   5. validate it with the app's own validator (js/core/validate.js);
 *   6. write the classification report, the review report and the AI queue.
 *
 * Nothing is invented and nothing is deleted: an unplaceable question stays
 * unclassified with a reason, a printed answer stays printed, and both members
 * of every suspected duplicate pair stay in the bank. Where the source printed no
 * answer at all, the answer and explanation can be supplied by a human review
 * file (--apply-answers); the pipeline itself never writes a key.
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
import { adaptIntake, normaliseSourceReview } from './classify/intake-adapter.mjs';
import { loadCombinedHistoricalIntake } from './classify/historical-sources.mjs';
import { buildAiQueue, renderAiQueueJsonl, renderAiTaxonomy, parseLabels, applyAiLabels } from './classify/ai-queue.mjs';
import { sanitiseBank, APP_BANK_ID } from './classify/sanitise-bank.mjs';
import { repairIntake } from './classify/repair.mjs';
import { parseReviewedLabels, applyReviewedLabels, CLASSIFICATION_SOURCE_REVIEWED } from './classify/reviewed-labels.mjs';
import { parseAnswerReviews, applyAnswerReviews } from './classify/answer-review.mjs';
import {
  buildClassificationReport,
  renderClassificationMarkdown,
  buildReviewReport,
  renderReviewMarkdown,
  renderHistoricalSourceAuditMarkdown,
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
  if (sourceProvenance === CLASSIFICATION_SOURCE_REVIEWED) {
    // A human reviewed this question in the label file; that decision stands.
    outcome = {
      assigned: Boolean(question.subject),
      subject: question.subject || null,
      topic: question.topic || null,
      subtopic: question.subtopic || null,
      confidence: question.classification_confidence ?? null,
      source: CLASSIFICATION_SOURCE_REVIEWED,
      reason: question.subject ? null : 'reviewed_label_without_subject',
      candidates: decision.candidates,
      matched: decision.matched,
      mpSpecific: decision.mpSpecific,
    };
    if (outcome.assigned) flags.push('reviewed_classification_kept');
    else flags.push('unclassified_after_review');
  } else if (sourceProvenance === 'pipeline-ai') {
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

  // Work on a copy: the repair pass edits the intake in place (it moves
  // provenance out of the data), and a pipeline must never mutate the caller's
  // object — the same parsed source is re-run by the determinism test.
  const adapted = adaptIntake(structuredClone(source), {
    bankId: opts.bankId,
    bankName: opts.bankName,
    isDemonstration: opts.isDemonstration,
  });
  const intake = adapted.intake;
  const pipelineNotes = [...adapted.notes];

  // The extraction's own artefacts (escaped line breaks, source references,
  // parser metadata) are repaired/moved before anything reads the text.
  const repairReport = opts.repair === false ? null : repairIntake(intake);
  if (repairReport) {
    pipelineNotes.push(
      `Extraction repairs: ${repairReport.text_repairs.occurrences} escaped line break(s) in ${repairReport.text_repairs.strings} string(s); ${repairReport.provenance_moved.question_source_references} source reference(s) and ${Object.values(repairReport.metadata_removed).reduce((a, b) => a + b, 0)} parser metadata field(s) moved out of the bank; ${repairReport.answer_sources_blanked} answer source label(s) removed.`,
    );
  }

  // The rule engine runs first so the AI merge always has something to compare
  // against. A provider reply that is empty, malformed or out of taxonomy then
  // leaves the classification the rules produced untouched, and a reply with a
  // valid subject but an unusable topic keeps the topic the rules found.
  let rows = intake.questions.map((q) => classifyQuestion(q, taxonomy));

  // Human review decisions are merged first: they are made by someone who read
  // the options, the printed answer and the explanation, so they outrank the
  // rule engine. A provider merge later still protects them (see ai-queue.mjs).
  let reviewedSummary = null;
  if (opts.reviewedLabels) {
    const { labels, notes: labelNotes, malformed } = parseReviewedLabels(opts.reviewedLabels);
    pipelineNotes.push(...labelNotes);
    reviewedSummary = applyReviewedLabels(intake, labels, taxonomy, {
      labelFile: opts.reviewedLabelFile || null,
      malformed,
    });
    pipelineNotes.push(...reviewedSummary.notes.map((n) => `Reviewed labels: ${n}`));
    pipelineNotes.push(
      `Reviewed labels merged: ${reviewedSummary.applied.length} applied (${reviewedSummary.applied.filter((a) => a.changed).length} changed a rule-engine guess), ${reviewedSummary.rejected.length} rejected, ${reviewedSummary.malformed.length} malformed line(s).`,
    );
    for (const r of reviewedSummary.rejected) pipelineNotes.push(`Reviewed label rejected for ${r.id ?? 'an unknown id'}: ${r.reason}`);
  }

  /** Re-run the rule pass for the questions a merge actually changed. */
  const refreshRows = (current, ids) => {
    if (!ids.size) return current;
    const rowById = new Map(current.map((r) => [r.id, r]));
    return intake.questions.map((q) => (ids.has(q.id) ? classifyQuestion(q, taxonomy) : rowById.get(q.id)));
  };

  rows = refreshRows(rows, new Set((reviewedSummary?.applied || []).map((a) => a.id)));


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
    // the row its previous pass produced.
    rows = refreshRows(rows, new Set(aiSummary.applied.map((a) => a.id)));
  }

  // Human answers and explanations for the questions the source left keyless
  // (tools/classify/answer-review.mjs). This runs after every classification pass
  // on purpose: the rule engine reads an explanation as evidence, so the
  // classification of a question must not move just because its key was resolved.
  let answerSummary = null;
  if (opts.answerReviews) {
    const { resolutions, notes: resolutionNotes, malformed } = parseAnswerReviews(opts.answerReviews);
    pipelineNotes.push(...resolutionNotes);
    answerSummary = applyAnswerReviews(intake, resolutions, { file: opts.answerReviewFile || null, malformed });
    pipelineNotes.push(...answerSummary.notes.map((n) => `Answer resolutions: ${n}`));
    pipelineNotes.push(
      `Answer resolutions merged: ${answerSummary.applied.length} applied, ${answerSummary.preserved.length} preserved (the source had already printed a key), ${answerSummary.rejected.length} rejected, ${answerSummary.malformed.length} malformed line(s).`,
    );
    for (const r of answerSummary.rejected) pipelineNotes.push(`Answer resolution rejected for ${r.id ?? 'an unknown id'}: ${r.reason}`);
    // A resolved record no longer needs the missing-key flag, in the row that
    // feeds the reports or in the record's own metadata.
    const resolvedIds = new Set(answerSummary.ids);
    if (resolvedIds.size) {
      rows = rows.map((row) =>
        resolvedIds.has(row.id)
          ? { ...row, flags: Array.from(new Set([...(row.flags || []).filter((f) => f !== 'missing_answer_key'), 'answer_resolved_by_review'])) }
          : row,
      );
      for (const id of resolvedIds) {
        const question = intake.questions.find((q) => q.id === id);
        if (question?.metadata?.classification_flags) {
          question.metadata.classification_flags = question.metadata.classification_flags.filter((f) => f !== 'missing_answer_key');
        }
      }
    }
  }

  const byId = new Map(intake.questions.map((q) => [q.id, q]));

  const { bank, warnings } = buildBankFromIntake(intake);

  // The boundary between working files and the app-facing bank. Question ids
  // remain stable; internal references/labels are removed, a small set of
  // source extraction artefacts is repaired, and every change is listed in the
  // separate review report. Root-level generator/source metadata is not shipped.
  const { report: sanitisation } = sanitiseBank(bank);
  const paperIdMap = new Map(Object.entries(sanitisation.paper_id_map || {}));
  if (paperIdMap.size) {
    for (const row of rows) if (paperIdMap.has(row.paperId)) row.paperId = paperIdMap.get(row.paperId);
  }

  const validation = validateBank(bank, {});

  // Suspected duplicates are reported, never merged. The pairs are attached to
  // the rows that feed the review report only: recording them on the app-facing
  // records would be bookkeeping a learner cannot act on, and the app rediscovers
  // duplicates itself when it validates a bank.
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
    const row = rowById.get(id);
    if (row) {
      row.flags = Array.from(new Set([...(row.flags || []), 'near_duplicate_candidate']));
      row.duplicatePartners = list;
    }
  }
  for (const issue of validation.warnings.filter((w) => w.code === 'identical_question_content')) {
    for (const id of issue.ids || []) {
      const row = rowById.get(id);
      if (row) row.flags = Array.from(new Set([...(row.flags || []), 'identical_content_group']));
    }
  }

  const meta = {
    bankId: bank.bank_id,
    bankName: bank.bank_name,
    generator: `tools/classify-bank.mjs ${TOOL_VERSION}`,
    taxonomy_path: 'data/taxonomy/mppsc-taxonomy.json',
    taxonomy_version: taxonomy.version,
    taxonomy_subjects: subjectNames(taxonomy),
    rule_count: RULES.length,
    subjects_allowed: subjectNames(taxonomy),
    pipeline_notes: pipelineNotes,
    repair: repairReport,
    reviewed_merge: reviewedSummary
      ? { applied: reviewedSummary.applied.length, changed: reviewedSummary.applied.filter((a) => a.changed).length, rejected: reviewedSummary.rejected.length, source: CLASSIFICATION_SOURCE_REVIEWED }
      : null,
    answer_merge: answerSummary
      ? {
          applied: answerSummary.applied.length,
          preserved: answerSummary.preserved.length,
          rejected: answerSummary.rejected.length,
          malformed: answerSummary.malformed.length,
        }
      : null,
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
      reviewedSummary,
      answerSummary,
      aiSummary,
      sanitisation,
      repair: repairReport,
      sourceAudit: opts.sourceAudit || null,
      historicalSourceAudit: opts.historicalSourceAudit || null,
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
    sanitisation,
    repairReport,
    reviewedSummary,
    answerSummary,
    meta,
    taxonomy,
  };
}

const HELP = `tools/classify-bank.mjs — classify a PYQ extraction into an importable MyMPPSC bank.

Usage:
  node tools/classify-bank.mjs --in <source.json> --out <bank.json> [--reports <dir>] [options]

Options:
  --in <file>          source intake/extraction file; historical rebuilds from raw intake also need both committed review files
  --out <file>         where to write the classified bank
  --reports <dir>      where to write classification-report and review-report (default: <out> directory)
  --include-2013-2018  append the six historical packages to the 571-question 2019–2024 base; raw intake requires --apply-review and --apply-answers
  --historical-source-dir <dir> override data/pyq/source/2013-18 for that adapter
  --ai-queue <file>    where to write the resumable AI queue (default: <reports>/ai-queue.jsonl)
  --apply-ai <file>    merge provider labels from this JSONL/JSON file before building
  --apply-review <f>   merge human review decisions from this JSONL/JSON file before building.
                       They are recorded as classification_source "reviewed" — never as AI
  --apply-answers <f>  merge human answer + explanation resolutions for questions the source
                       left without a key (JSONL: {id, answer, basis, reason, explanation}).
                       A record that already has a printed key is never overwritten
  --source-review <f>  the source parser's own review file; its findings (records it
                       refused to export, numbering gaps) are carried into the review
                       report. Default: MPPSC_PYQ_Review.json next to --in, if present
  --no-source-review   do not look for that file
  --no-repair          do not repair the extraction's escape artefacts/provenance
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
  let source = JSON.parse(sourceText);
  let historicalSourceAudit = null;
  if (parsed.flags.has('include-2013-2018')) {
    const baseline = Array.isArray(source?.questions) ? source.questions : [];
    const expectedYears = new Set([2019, 2020, 2021, 2022, 2023, 2024]);
    const paperYears = new Map((Array.isArray(source?.papers) ? source.papers : []).map((paper) => [String(paper.paper_id), Number(paper.year)]));
    const yearsMatch = baseline.length === 571 && baseline.every((question) => {
      const year = Number(question.year ?? paperYears.get(String(question.paper_id)));
      return expectedYears.has(year);
    });
    const labelledProductionBank = source?.schema_version === '1.0.0' && source?.bank_id === APP_BANK_ID && baseline.every((question) => Boolean(question.subject));
    const reviewRebuiltRawIntake = source?.intake_version === '1.0.0' && parsed.values['apply-review'] && parsed.values['apply-answers'];
    if (!yearsMatch || (!labelledProductionBank && !reviewRebuiltRawIntake)) {
      throw new Error('--include-2013-2018 requires the existing 571-question 2019–2024 base plus --apply-review and --apply-answers when starting from raw intake, so its labels and reviewed answers are restored before appending the six historical packages.');
    }
    const historicalDir = parsed.values['historical-source-dir']
      ? resolve(parsed.values['historical-source-dir'])
      : resolve('data/pyq/source/2013-18');
    const combined = await loadCombinedHistoricalIntake(source, historicalDir);
    source = combined.intake;
    historicalSourceAudit = combined.audit;
  }

  const outPath = resolve(parsed.values.out);
  const reportsDir = resolve(parsed.values.reports || path.dirname(outPath));
  const aiQueuePath = resolve(parsed.values['ai-queue'] || path.join(reportsDir, 'ai-queue.jsonl'));

  // The source parser ships its own review file. When it is there, its caveats
  // belong in our review report: they are the difference between "571 questions"
  // and "571 of the 573 blocks the parser found".
  let sourceAudit = null;
  if (!parsed.flags.has('no-source-review')) {
    const reviewPath = parsed.values['source-review']
      ? resolve(parsed.values['source-review'])
      : path.join(path.dirname(resolve(parsed.values.in)), 'MPPSC_PYQ_Review.json');
    try {
      sourceAudit = normaliseSourceReview(JSON.parse(await readFile(reviewPath, 'utf8')), {
        file: path.relative(root, reviewPath) || path.basename(reviewPath),
      });
    } catch {
      sourceAudit = null; // no review file, or not one we recognise — not an error
    }
    if (parsed.values['source-review'] && !sourceAudit) {
      console.error(`--source-review: ${parsed.values['source-review']} is not a recognised review file; continuing without it.`);
    }
  }

  const result = await runPipeline(source, {
    sourceAudit,
    historicalSourceAudit,
    bankId: parsed.values['bank-id'],
    bankName: parsed.values['bank-name'],
    reviewedLabels: parsed.values['apply-review'] ? await readFile(resolve(parsed.values['apply-review']), 'utf8') : null,
    reviewedLabelFile: parsed.values['apply-review'] ? path.relative(root, resolve(parsed.values['apply-review'])) : null,
    answerReviews: parsed.values['apply-answers'] ? await readFile(resolve(parsed.values['apply-answers']), 'utf8') : null,
    answerReviewFile: parsed.values['apply-answers'] ? path.relative(root, resolve(parsed.values['apply-answers'])) : null,
    repair: !parsed.flags.has('no-repair'),
    aiLabels: parsed.values['apply-ai'] ? await readFile(resolve(parsed.values['apply-ai']), 'utf8') : null,
    aiProvider: parsed.values['ai-provider'] || process.env.MYMPPSC_AI_PROVIDER || null,
    aiModel: parsed.values['ai-model'] || process.env.MYMPPSC_AI_MODEL || null,
    overwriteSourceClassification: parsed.flags.has('overwrite-source'),
  });

  const { bank, validation, classificationReport, reviewReport, aiQueue, buildWarnings, aiSummary, sanitisation, repairReport, reviewedSummary, answerSummary } = result;

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
  console.log(`explanations       : ${reviewReport.integrity.explanations_present} present, ${reviewReport.integrity.without_explanation} without`);
  console.log(`near-duplicate pair: ${reviewReport.totals.near_duplicate_pairs}`);
  console.log(`AI queue           : ${aiQueue.length}`);
  console.log(`provenance removed : ${sanitisation.removed.question_source_references} question reference(s), ${sanitisation.removed.supplied_answer_sources} answer source(s), ${sanitisation.removed.paper_source_files.length} source file(s)`);
  console.log(`escapes repaired   : ${sanitisation.repaired_escapes.occurrences} literal \\n sequence(s) in ${sanitisation.repaired_escapes.strings} string(s)`);
  const knownMarkingSchemes = [
    ...(sanitisation.marking_scheme_preserved || []).filter((scheme) => scheme.scheme_id),
    ...sanitisation.marking_scheme,
  ];
  console.log(`marking schemes    : ${knownMarkingSchemes.length} paper(s) — ${knownMarkingSchemes.map((m) => `${m.paper_id}:${m.scheme_id}`).join(', ') || 'none'}`);
  if (sanitisation.marking_scheme_unresolved.length) {
    console.log(`  unresolved rules : ${sanitisation.marking_scheme_unresolved.map((m) => m.paper_id).join(', ')}`);
  }
  if (sourceAudit) {
    console.log(
      `source parser      : ${sourceAudit.stats.question_blocks_detected} block(s) detected, ${sourceAudit.excluded.length} NOT exported, ${sourceAudit.flagged.length} flagged (${sourceAudit.file})`,
    );
  }
  if (historicalSourceAudit) {
    console.log(`historical sources  : ${historicalSourceAudit.question_count} questions across ${historicalSourceAudit.paper_count} papers; ${historicalSourceAudit.records_rejected} rejected`);
    console.log(`source audit        : ${historicalSourceAudit.repairs.length} documented safe/placeholders repairs; ${historicalSourceAudit.review_report_corrections.length} review-report corrections`);
  }
  if (reviewedSummary) {
    console.log(
      `reviewed labels    : ${reviewedSummary.applied.length} applied, ${reviewedSummary.rejected.length} rejected, ${reviewedSummary.malformed.length} malformed`,
    );
  }
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
  if (historicalSourceAudit) {
    await writeFile(path.join(reportsDir, 'historical-source-audit.json'), `${JSON.stringify(historicalSourceAudit, null, 2)}\n`, 'utf8');
    await writeFile(path.join(reportsDir, 'historical-source-audit.md'), renderHistoricalSourceAuditMarkdown(historicalSourceAudit), 'utf8');
  }
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
