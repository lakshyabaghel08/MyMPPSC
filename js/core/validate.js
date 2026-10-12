/**
 * validate.js — Question-bank validation.
 *
 * Validation never silently discards a record: every problem is returned with a
 * human-readable explanation, a severity and the record it belongs to. Fatal
 * problems block the import; record-level errors exclude just that record and
 * are reported in the import summary.
 */

import { SUPPORTED_SCHEMA_MAJOR, SUPPORTED_SCHEMA_VERSIONS, QUESTION_TYPES } from './constants.js';
import { normaliseQuestion, normalisePaper } from './schema.js';
import { jaccard, shingles, tokenSet, uniq } from './util.js';

export const ISSUE_LIMIT = 300; // keep the report small enough to render; the rest is summarised

function push(list, issue) {
  if (list.length < ISSUE_LIMIT) list.push(issue);
  else if (list.length === ISSUE_LIMIT) list.push({ code: 'truncated', severity: 'info', message: `Further issues of this kind are not listed (limit ${ISSUE_LIMIT}).` });
  return list;
}

/** Parse JSON text safely, returning a discriminated result rather than throwing. */
export function parseJsonText(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Validate a raw bank object.
 * @param {object} raw parsed JSON
 * @param {{nearDuplicateThreshold?: number, compareFingerprints?: Map<string,string>}} opts
 * @returns {object} report
 */
export function validateBank(raw, opts = {}) {
  const nearThreshold = opts.nearDuplicateThreshold ?? 0.62;
  const fatal = [];
  const errors = [];
  const warnings = [];
  const infos = [];

  const report = {
    ok: false,
    fatal,
    errors,
    warnings,
    infos,
    papers: [],
    questions: [],
    rejected: [],
    duplicateIds: [],
    duplicatePaperIds: [],
    nearDuplicates: [],
    placeholderPapers: [],
    paperChecks: [],
    stats: null,
    meta: {},
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    push(fatal, { code: 'not_an_object', severity: 'fatal', message: 'The file does not contain a JSON object. A question bank must be a JSON object with schema_version, papers and questions.' });
    return report;
  }

  /* ------------------------------------------------------------ envelope -- */
  const version = typeof raw.schema_version === 'string' ? raw.schema_version.trim() : null;
  if (!version) {
    push(fatal, { code: 'missing_schema_version', severity: 'fatal', message: 'The bank has no schema_version field. Import is blocked so that incompatible data cannot enter the database.' });
  } else {
    const major = version.split('.')[0];
    if (String(major) !== String(SUPPORTED_SCHEMA_MAJOR)) {
      push(fatal, {
        code: 'unsupported_schema_major',
        severity: 'fatal',
        message: `Bank schema version ${version} is not supported by this build (supported major version: ${SUPPORTED_SCHEMA_MAJOR}, known versions: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}).`,
      });
    } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
      push(warnings, {
        code: 'unknown_schema_minor',
        severity: 'warning',
        message: `Bank schema version ${version} is newer than the versions this build was tested against (${SUPPORTED_SCHEMA_VERSIONS.join(', ')}). Import continues; unknown fields are preserved untouched.`,
      });
    }
  }

  if (!Array.isArray(raw.papers)) {
    push(fatal, { code: 'papers_not_array', severity: 'fatal', message: 'The bank has no "papers" array. Paper metadata is required so simulations know the original question order, duration and scoring rules.' });
  }
  if (!Array.isArray(raw.questions)) {
    push(fatal, { code: 'questions_not_array', severity: 'fatal', message: 'The bank has no "questions" array.' });
  }
  if (fatal.some((f) => f.code === 'papers_not_array' || f.code === 'questions_not_array')) return report;

  const bankId = typeof raw.bank_id === 'string' && raw.bank_id ? raw.bank_id : null;
  if (!bankId) push(warnings, { code: 'missing_bank_id', severity: 'warning', message: 'The bank has no bank_id; re-importing the same file may be harder to detect. A stable bank_id is recommended.' });

  const demoFlag = raw.is_demonstration === true || raw.provenance?.kind === 'synthetic_demo';
  if (demoFlag) {
    push(infos, {
      code: 'demonstration_bank',
      severity: 'info',
      message: 'This bank is labelled as demonstration material. Its questions will be shown with a "demonstration" marker and must never be presented as genuine previous-year questions.',
    });
  }
  if (raw.provenance?.kind === 'official_paper' && raw.provenance?.verified !== true) {
    push(warnings, { code: 'provenance_unverified', severity: 'warning', message: 'The bank claims to be an official paper but provenance.verified is not true; records will be labelled as unverified.' });
  }

  const bankDefaults = {
    bankId,
    demoFlag,
    bankExamDefault: typeof raw.exam === 'string' ? raw.exam : null,
    bankKeySource: null,
  };

  /* -------------------------------------------------------------- papers -- */
  const paperById = new Map();
  for (const rawPaper of raw.papers) {
    const { paper, issues } = normalisePaper(rawPaper, bankDefaults);
    for (const issue of issues) {
      const target = issue.severity === 'error' ? errors : issue.severity === 'warning' ? warnings : infos;
      push(target, issue);
    }
    if (!paper) continue;
    if (paperById.has(paper.paper_id)) {
      push(errors, { code: 'duplicate_paper_id', severity: 'error', paperId: paper.paper_id, message: `Paper id "${paper.paper_id}" appears more than once; the later record was ignored.` });
      report.duplicatePaperIds.push(paper.paper_id);
      continue;
    }
    paperById.set(paper.paper_id, paper);
  }

  /* ----------------------------------------------------------- questions -- */
  const questions = [];
  const seenIds = new Map(); // id → index in questions
  const fingerprintMap = new Map(); // fingerprint → [ids]
  const rawDuplicateIds = [];

  raw.questions.forEach((rawQuestion, index) => {
    const paperRef = rawQuestion && typeof rawQuestion === 'object' ? rawQuestion.paper_id : null;
    const ctx = {
      ...bankDefaults,
      paperId: typeof paperRef === 'string' ? paperRef : null,
      paper: paperById.get(paperRef) || null,
    };
    const { question, issues } = normaliseQuestion(rawQuestion, ctx);
    const hasError = issues.some((i) => i.severity === 'error');
    for (const issue of issues) {
      const issueWithIndex = { ...issue, index };
      const target = issue.severity === 'error' ? errors : issue.severity === 'warning' ? warnings : infos;
      push(target, issueWithIndex);
    }
    if (!question || hasError) {
      if (question) report.rejected.push({ id: question.id, index, reason: issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' ') });
      else if (rawQuestion?.id) report.rejected.push({ id: rawQuestion.id, index, reason: issues.map((i) => i.message).join(' ') });
      return;
    }
    if (seenIds.has(question.id)) {
      const first = seenIds.get(question.id);
      push(errors, {
        code: 'duplicate_question_id',
        severity: 'error',
        questionId: question.id,
        index,
        message: `Question id "${question.id}" appears more than once in this file (first at position ${first + 1}). The later copy was skipped — duplicates must be resolved in the source pipeline.`,
      });
      rawDuplicateIds.push(question.id);
      report.rejected.push({ id: question.id, index, reason: 'Duplicate id within the file.' });
      return;
    }
    seenIds.set(question.id, index);
    if (!question.question_number && question.question_number !== 0) {
      push(warnings, { code: 'missing_question_number', severity: 'warning', questionId: question.id, message: `Question "${question.id}" has no original question number; paper order falls back to file order for this record.` });
    }
    const list = fingerprintMap.get(question.fingerprint) || [];
    list.push(question.id);
    fingerprintMap.set(question.fingerprint, list);
    questions.push(question);
  });

  report.duplicateIds = uniq(rawDuplicateIds);

  /* ------------------------------------------- duplicate content checks -- */
  for (const [fp, ids] of fingerprintMap.entries()) {
    if (ids.length > 1) {
      push(warnings, {
        code: 'identical_question_content',
        severity: 'warning',
        message: `Questions with different ids have identical text and options: ${ids.join(', ')}. This usually means the same question was printed in more than one paper/set.`,
        ids,
        fingerprint: fp,
      });
    }
  }

  // Near-duplicate detection. Exact repeats are caught by the fingerprint above;
  // this pass finds *potential* duplicates (reworded/paraphrased records) using a
  // blended token + 3-word-shingle Jaccard similarity, with an inverted index so
  // a large bank does not need a quadratic comparison.
  const shingleIndex = new Map();
  const questionShingles = new Map();
  const questionTokens = new Map();
  questions.forEach((q) => {
    const text = q.text_key || '';
    const tokens = tokenSet(text);
    const set = shingles(text, 3);
    questionTokens.set(q.id, tokens);
    questionShingles.set(q.id, set);
    for (const s of Array.from(set).slice(0, 40)) {
      if (!shingleIndex.has(s)) shingleIndex.set(s, []);
      const bucket = shingleIndex.get(s);
      if (bucket.length < 40) bucket.push(q.id);
    }
  });
  const similarityOf = (idA, idB) => {
    const tokenSim = jaccard(questionTokens.get(idA), questionTokens.get(idB));
    const shingleSim = jaccard(questionShingles.get(idA), questionShingles.get(idB));
    return Math.max(tokenSim, shingleSim);
  };
  const compared = new Set();
  const nearDuplicates = [];
  let comparisonBudget = 200000;
  for (const bucket of shingleIndex.values()) {
    if (bucket.length < 2 || bucket.length > 40) continue;
    for (let i = 0; i < bucket.length && comparisonBudget > 0; i += 1) {
      for (let j = i + 1; j < bucket.length && comparisonBudget > 0; j += 1) {
        const [a, b] = [bucket[i], bucket[j]].sort();
        const key = `${a}|${b}`;
        if (compared.has(key)) continue;
        compared.add(key);
        comparisonBudget -= 1;
        const sim = similarityOf(a, b);
        if (sim >= nearThreshold) nearDuplicates.push({ a, b, similarity: Math.round(sim * 1000) / 1000, basis: 'similar wording and options' });
      }
    }
  }
  report.nearDuplicates = nearDuplicates.sort((x, y) => y.similarity - x.similarity);
  if (nearDuplicates.length) {
    push(warnings, {
      code: 'near_duplicate_questions',
      severity: 'warning',
      message: `${nearDuplicates.length} pair(s) of questions look like possible duplicates (similarity >= ${nearThreshold} on wording and options). They were kept as separate questions; review them on the Question Bank screen.`,
      pairs: nearDuplicates.slice(0, 50),
    });
  }

  /* --------------------------------------------- paper/question matching -- */
  const byPaper = new Map();
  for (const q of questions) {
    if (!q.paper_id) {
      push(warnings, { code: 'question_without_paper', severity: 'warning', questionId: q.id, message: `Question "${q.id}" has no paper_id; it was placed in an auto-created placeholder paper.` });
      q.paper_id = 'UNASSIGNED';
    }
    if (!byPaper.has(q.paper_id)) byPaper.set(q.paper_id, []);
    byPaper.get(q.paper_id).push(q);
  }

  for (const paperId of byPaper.keys()) {
    if (!paperById.has(paperId)) {
      push(warnings, {
        code: 'paper_metadata_missing',
        severity: 'warning',
        paperId,
        message: `Questions reference paper "${paperId}" but the bank contains no metadata for it. A placeholder paper is created with unknown duration, marks and scoring rules; no values are invented.`,
      });
      const placeholder = {
        paper_id: paperId,
        exam: byPaper.get(paperId)[0]?.exam || bankDefaults.bankExamDefault || null,
        year: byPaper.get(paperId)[0]?.year ?? null,
        paper_name: null,
        paper_code: null,
        set_code: byPaper.get(paperId)[0]?.set_code ?? null,
        language: null,
        original_question_count: byPaper.get(paperId).length,
        duration_minutes: null,
        total_marks: null,
        scoring: { rules_known: false, marks_per_correct: null, negative_marks_per_incorrect: null, negative_marking_enabled: null, marks_for_unanswered: null, rules_source: null, notes: 'Auto-created placeholder: the bank supplied no paper metadata.' },
        question_order: [],
        answer_key: { source: null, status: 'unknown', published_at: null, notes: 'Unknown: no paper metadata in the bank.' },
        source_files: [],
        import_validation: { status: 'unknown', checked_at: null, notes: 'Placeholder created at import.' },
        is_demonstration: demoFlag,
        metadata: { placeholder: true },
        placeholder: true,
        bank_id: bankId,
        imported_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      paperById.set(paperId, placeholder);
      report.placeholderPapers.push(paperId);
    }
  }

  for (const [paperId, paper] of paperById.entries()) {
    const qs = byPaper.get(paperId) || [];
    const checks = { paperId, declared: paper.original_question_count, present: qs.length, missingNumbers: [], orderNotes: [] };
    if (paper.original_question_count !== null && paper.original_question_count !== qs.length) {
      push(warnings, {
        code: 'question_count_mismatch',
        severity: 'warning',
        paperId,
        message: `Paper "${paperId}" declares ${paper.original_question_count} original question(s) but ${qs.length} question(s) are present in this bank. The paper is marked incomplete and full-paper simulation will show a warning.`,
      });
      const numbersPresent = new Set(qs.map((q) => Number(q.question_number)).filter((n) => Number.isFinite(n)));
      if (numbersPresent.size) {
        const max = Math.max(...numbersPresent);
        if (max <= 1000) {
          for (let n = 1; n <= Math.max(max, paper.original_question_count || 0); n += 1) {
            if (!numbersPresent.has(n)) checks.missingNumbers.push(n);
          }
        }
      }
    }
    // original paper order
    const idsPresent = new Set(qs.map((q) => q.id));
    const ordered = [];
    for (const id of paper.question_order) {
      if (idsPresent.has(id)) ordered.push(id);
      else push(warnings, { code: 'order_entry_missing_question', severity: 'warning', paperId, message: `Paper "${paperId}" lists question "${id}" in question_order but the bank contains no such question.` });
    }
    const missingFromOrder = qs.filter((q) => !paper.question_order.includes(q.id)).map((q) => q.id);
    if (missingFromOrder.length) {
      if (paper.question_order.length) {
        push(warnings, {
          code: 'order_incomplete',
          severity: 'warning',
          paperId,
          message: `${missingFromOrder.length} question(s) of paper "${paperId}" were absent from question_order; they were appended using original question-number order and flagged.`,
        });
      }
      const sortedRest = qs
        .filter((q) => missingFromOrder.includes(q.id))
        .sort((a, b) => {
          const na = Number(a.question_number);
          const nb = Number(b.question_number);
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          return String(a.question_number ?? '').localeCompare(String(b.question_number ?? ''), undefined, { numeric: true });
        })
        .map((q) => q.id);
      ordered.push(...sortedRest);
    }
    const finalOrder = ordered.length ? ordered : qs.map((q) => q.id);
    paper.question_order = finalOrder;
    paper.original_order_preserved = paper.question_order.length === qs.length && !missingFromOrder.length;
    if (!paper.original_order_preserved) checks.orderNotes.push('Order was reconstructed for missing entries.');
    // per-question integrity annotation
    for (const q of qs) {
      if (paper.placeholder) {
        q.validation_notes = (q.validation_notes || []).concat('Paper metadata missing in this bank.');
        if (q.validation_status === 'valid') q.validation_status = 'valid_with_warnings';
      }
      q.paper_incomplete = paper.original_question_count !== null && paper.original_question_count !== qs.length;
      q.paper_order_index = paper.question_order.indexOf(q.id);
    }
    checks.ids = paper.question_order;
    report.paperChecks.push(checks);
    paperById.set(paperId, paper);
  }

  /* -------------------------------------------------------------- stats -- */
  const stats = {
    papers: paperById.size,
    questions: questions.length,
    rejectedRecords: report.rejected.length,
    errors: errors.length,
    warnings: warnings.length,
    bilingual: questions.filter((q) => q.language_variants.en && q.language_variants.hi).length,
    englishOnly: questions.filter((q) => q.language_variants.en && !q.language_variants.hi).length,
    hindiOnly: questions.filter((q) => q.language_variants.hi && !q.language_variants.en).length,
    unclassified: questions.filter((q) => q.classification.isUnclassified).length,
    byType: {},
    bySubject: {},
    byAnswerKeyStatus: {},
    missingAnswers: questions.filter((q) => !q.supplied.answer && !q.verified?.answer).length,
    disputedAnswers: questions.filter((q) => q.dispute?.is_disputed || q.supplied.status === 'disputed').length,
    verifiedAnswers: questions.filter((q) => q.verified?.answer).length,
    withExplanation: questions.filter((q) => q.explanation).length,
    demonstration: questions.filter((q) => q.is_demonstration).length,
    unknownScoringPapers: Array.from(paperById.values()).filter((p) => !p.scoring.rules_known).length,
    incompletePapers: Array.from(paperById.values()).filter((p) => p.original_question_count !== null && p.original_question_count !== (byPaper.get(p.paper_id) || []).length).length,
  };
  for (const q of questions) {
    stats.byType[q.question_type] = (stats.byType[q.question_type] || 0) + 1;
    const s = q.classification.subject || 'Unclassified';
    stats.bySubject[s] = (stats.bySubject[s] || 0) + 1;
    stats.byAnswerKeyStatus[q.supplied.status || 'unknown'] = (stats.byAnswerKeyStatus[q.supplied.status || 'unknown'] || 0) + 1;
  }
  report.stats = stats;
  report.meta = {
    bankId,
    bankName: typeof raw.bank_name === 'string' ? raw.bank_name : null,
    schemaVersion: version,
    demoFlag,
    generator: raw.generator || null,
    provenance: raw.provenance || null,
    generatedAt: raw.generated_at || null,
    raw,
  };
  report.ok = fatal.length === 0 && questions.length > 0;
  if (!questions.length && !fatal.length) {
    push(fatal, { code: 'no_importable_questions', severity: 'fatal', message: 'No question in this file passed validation, so there is nothing to import.' });
    report.ok = false;
  }

  report.papers = Array.from(paperById.values());
  report.questions = questions;
  report.hasContentProblem = errors.length > 0 || report.rejected.length > 0;
  return report;
}

/** Cross-check an already-validated report against what is stored locally. */
export function compareWithExisting(report, existing = {}) {
  const existingIds = existing.ids instanceof Set ? existing.ids : new Set(existing.ids || []);
  const existingFingerprints = existing.fingerprints instanceof Map ? existing.fingerprints : new Map();
  const existingPaperIds = new Set(existing.paperIds || []);
  const conflicts = [];
  const unchanged = [];
  const updates = [];
  for (const q of report.questions) {
    if (!existingIds.has(q.id)) continue;
    const fpList = existingFingerprints.get(q.fingerprint);
    if (fpList && fpList.includes(q.id)) unchanged.push(q.id);
    else updates.push(q.id);
    if (conflicts.length < 200) conflicts.push({ id: q.id, kind: unchanged.includes(q.id) ? 'identical' : 'changed' });
  }
  return {
    existingQuestionCount: existingIds.size,
    newQuestions: report.questions.filter((q) => !existingIds.has(q.id)).length,
    alreadyPresent: conflicts.length,
    identicalRecords: unchanged.length,
    changedRecords: updates.length,
    newPapers: report.papers.filter((p) => !existingPaperIds.has(p.paper_id)).length,
    existingPapersTouched: report.papers.filter((p) => existingPaperIds.has(p.paper_id)).length,
    changedQuestionIds: updates,
  };
}

/** Explain a validation report in plain language (used by the summary screen). */
export function summariseReport(report) {
  if (!report) return 'No report.';
  const parts = [];
  if (report.fatal.length) parts.push(`${report.fatal.length} blocking problem(s): the import cannot continue.`);
  if (report.errors.length) parts.push(`${report.errors.length} record-level error(s): those records will be skipped and listed below.`);
  if (report.warnings.length) parts.push(`${report.warnings.length} warning(s): the import can continue, but review them.`);
  if (!parts.length) parts.push('No problems found.');
  if (report.stats) parts.push(`${report.stats.questions} question(s) and ${report.stats.papers} paper(s) are ready to import.`);
  return parts.join(' ');
}

export function isQuestionTypeSupported(type) {
  return Boolean(QUESTION_TYPES[type]);
}
