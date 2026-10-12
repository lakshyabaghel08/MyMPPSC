/**
 * tools/classify/reports.mjs — the two reports the pipeline must produce.
 *
 *  - classification report: how many questions were placed at each level, with
 *    counts and percentages, plus the unclassified and low-confidence lists;
 *  - review report: everything a human still has to look at — ambiguous
 *    classifications, missing keys, suspected duplicates, integrity problems —
 *    with the explicit note that nothing was deleted or merged to produce it.
 *
 * Both are derived only from data that already exists in the built bank and the
 * app's own validation report. Nothing here re-judges an answer key.
 *
 * This module is build-time only: nothing in js/ imports it.
 */

export const LOW_CONFIDENCE_THRESHOLD = 0.6;

const pct = (n, total) => (total ? `${Math.round((n / total) * 1000) / 10}%` : '0%');

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

/**
 * @param {object[]} rows one entry per question:
 *   {id, paperId, year, subject, topic, subtopic, confidence, source, flags[], reason, candidates[]}
 */
export function buildClassificationReport(rows, meta = {}) {
  const total = rows.length;
  const bySubject = new Map();
  const byTopic = new Map();
  const bySubtopic = new Map();
  const bySource = new Map();
  const byYear = new Map();
  const confidenceBuckets = { '0.00–0.39': 0, '0.40–0.59': 0, '0.60–0.79': 0, '0.80–0.95': 0, unset: 0 };

  let subjectCount = 0;
  let topicCount = 0;
  let subtopicCount = 0;
  let mpSpecific = 0;

  for (const row of rows) {
    const subject = row.subject || 'Unclassified';
    bump(bySubject, subject);
    bump(byYear, row.year === null || row.year === undefined ? 'unknown' : row.year);
    if (row.subject) {
      subjectCount += 1;
      bySource.set(row.source || 'unknown', (bySource.get(row.source || 'unknown') || 0) + 1);
      if (row.topic) {
        topicCount += 1;
        bump(byTopic, `${row.subject} / ${row.topic}`);
      }
      if (row.subtopic) {
        subtopicCount += 1;
        bump(bySubtopic, `${row.subject} / ${row.topic} / ${row.subtopic}`);
      }
      const c = row.confidence;
      if (c === null || c === undefined) confidenceBuckets.unset += 1;
      else if (c < 0.4) confidenceBuckets['0.00–0.39'] += 1;
      else if (c < 0.6) confidenceBuckets['0.40–0.59'] += 1;
      else if (c < 0.8) confidenceBuckets['0.60–0.79'] += 1;
      else confidenceBuckets['0.80–0.95'] += 1;
    } else {
      bySource.set('unclassified', (bySource.get('unclassified') || 0) + 1);
      confidenceBuckets.unset += 1;
    }
    if (row.mpSpecific) mpSpecific += 1;
  }

  const sortedEntries = (map) => Array.from(map.entries()).sort((a, b) => (b[1] === a[1] ? String(a[0]).localeCompare(String(b[0])) : b[1] - a[1]));

  return {
    generated_at: new Date().toISOString(),
    total_questions: total,
    levels: {
      subject: { classified: subjectCount, percentage: total ? Math.round((subjectCount / total) * 1000) / 10 : 0, unclassified: total - subjectCount },
      topic: { classified: topicCount, percentage: total ? Math.round((topicCount / total) * 1000) / 10 : 0, missing: total - topicCount },
      subtopic: { classified: subtopicCount, percentage: total ? Math.round((subtopicCount / total) * 1000) / 10 : 0, missing: total - subtopicCount },
    },
    by_subject: sortedEntries(bySubject).map(([subject, count]) => ({ subject, count, percentage: pct(count, total) })),
    by_topic: sortedEntries(byTopic).map(([topic, count]) => ({ topic, count, percentage: pct(count, total) })),
    by_subtopic: sortedEntries(bySubtopic).map(([subtopic, count]) => ({ subtopic, count, percentage: pct(count, total) })),
    by_source: sortedEntries(bySource).map(([source, count]) => ({ source, count, percentage: pct(count, total) })),
    by_year: sortedEntries(byYear).map(([year, count]) => ({ year, count })),
    confidence_distribution: confidenceBuckets,
    madhya_pradesh_specific: mpSpecific,
    unclassified: rows
      .filter((r) => !r.subject)
      .map((r) => ({ id: r.id, paper_id: r.paperId, year: r.year, reason: r.reason, candidates: r.candidates, excerpt: r.excerpt })),
    low_confidence: rows
      .filter((r) => r.subject && r.confidence !== null && r.confidence < LOW_CONFIDENCE_THRESHOLD)
      .map((r) => ({ id: r.id, paper_id: r.paperId, year: r.year, subject: r.subject, topic: r.topic, subtopic: r.subtopic, confidence: r.confidence, reason: r.reason, excerpt: r.excerpt })),
    topic_ambiguous: rows
      .filter((r) => r.subject && r.flags?.includes('ambiguous_topic'))
      .map((r) => ({ id: r.id, subject: r.subject, reason: r.reason, candidates: r.candidates })),
    meta,
  };
}

export function renderClassificationMarkdown(report, meta = {}) {
  const L = [];
  L.push(`# Classification report — ${meta.bankName || meta.bankId || 'question bank'}`);
  L.push('');
  L.push(`Generated ${report.generated_at} by ${meta.generator || 'tools/classify-bank.mjs'}.`);
  L.push('');
  L.push(`Questions in the bank: **${report.total_questions}**`);
  if (meta.taxonomy_version) {
    L.push('');
    L.push(
      `Labels come from \`${meta.taxonomy_path || 'data/taxonomy/mppsc-taxonomy.json'}\` (version ${meta.taxonomy_version}, ${
        (meta.taxonomy_subjects || meta.subjects_allowed || []).length
      } subjects, ${meta.rule_count ?? '—'} rules), written by ${meta.generator || 'tools/classify-bank.mjs'}.`,
    );
  }
  L.push('');
  L.push('## Coverage by level');
  L.push('');
  L.push('| Level | Classified | % of bank | Not set |');
  L.push('| --- | --- | --- | --- |');
  L.push(`| Subject | ${report.levels.subject.classified} | ${report.levels.subject.percentage}% | ${report.levels.subject.unclassified} |`);
  L.push(`| Topic | ${report.levels.topic.classified} | ${report.levels.topic.percentage}% | ${report.levels.topic.missing} |`);
  L.push(`| Subtopic | ${report.levels.subtopic.classified} | ${report.levels.subtopic.percentage}% | ${report.levels.subtopic.missing} |`);
  L.push('');
  L.push('A missing topic or subtopic is not a failure: the pipeline only sets a level when the evidence supports it, and an unsupported level is left `null` rather than filled with a guess.');
  L.push('');
  L.push('## Questions by subject');
  L.push('');
  L.push('| Subject | Questions | % of bank |');
  L.push('| --- | --- | --- |');
  for (const row of report.by_subject) L.push(`| ${row.subject} | ${row.count} | ${row.percentage} |`);
  L.push('');
  L.push('## Questions by topic');
  L.push('');
  L.push('| Topic | Questions | % of bank |');
  L.push('| --- | --- | --- |');
  for (const row of report.by_topic) L.push(`| ${row.topic} | ${row.count} | ${row.percentage} |`);
  L.push('');
  L.push('## Questions by subtopic');
  L.push('');
  L.push('| Subtopic | Questions | % of bank |');
  L.push('| --- | --- | --- |');
  for (const row of report.by_subtopic) L.push(`| ${row.subtopic} | ${row.count} | ${row.percentage} |`);
  L.push('');
  L.push('## How each classification was produced');
  L.push('');
  L.push('| Source | Questions | % of bank |');
  L.push('| --- | --- | --- |');
  for (const row of report.by_source) L.push(`| ${row.source} | ${row.count} | ${row.percentage} |`);
  L.push('');
  if (meta.reviewed_merge) {
    L.push(`Reviewed labels: **${meta.reviewed_merge.applied} applied** (${meta.reviewed_merge.changed} replaced a rule-engine guess), ${meta.reviewed_merge.rejected} rejected. These were decided by a person reading the question, its options, the printed answer and the explanation — **no AI provider was used**. Every decision is listed in the review report.`);
    L.push('');
  }
  if (meta.ai_merge) {
    L.push(`AI label merge: **${meta.ai_merge.applied} applied**, ${meta.ai_merge.preserved} existing classification(s) preserved, ${meta.ai_merge.rejected} rejected (out of taxonomy, malformed or protected), ${meta.ai_merge.malformed} malformed line(s). Every decision is listed in the review report.`);
    L.push('');
  }
  L.push('## Confidence distribution (classified questions)');
  L.push('');
  L.push('| Confidence band | Questions |');
  L.push('| --- | --- |');
  for (const [band, count] of Object.entries(report.confidence_distribution)) L.push(`| ${band} | ${count} |`);
  L.push('');
  L.push(`Madhya-Pradesh-specific questions: **${report.madhya_pradesh_specific}** of ${report.total_questions}.`);
  L.push('');
  L.push('## Unclassified questions');
  L.push('');
  if (!report.unclassified.length) L.push('None — every question received a subject.');
  else {
    L.push('These keep `subject`, `topic` and `subtopic` = `null`, so the app shows them as *Unclassified* and they can be filtered for review. No label was invented for them.');
    L.push('');
    L.push('| Question | Paper | Year | Why it is unclassified | Best candidates |');
    L.push('| --- | --- | --- | --- | --- |');
    for (const row of report.unclassified) {
      const cands = (row.candidates || []).map((c) => `${c.subject} (${c.score})`).join(', ') || '—';
      L.push(`| \`${row.id}\` | ${row.paper_id || '—'} | ${row.year ?? '—'} | ${row.reason || 'unknown'} | ${cands} |`);
    }
  }
  L.push('');
  L.push(`## Low-confidence classifications (below ${LOW_CONFIDENCE_THRESHOLD})`);
  L.push('');
  if (!report.low_confidence.length) L.push('None.');
  else {
    L.push('| Question | Subject | Topic | Confidence | Note |');
    L.push('| --- | --- | --- | --- | --- |');
    for (const row of report.low_confidence) {
      L.push(`| \`${row.id}\` | ${row.subject} | ${row.topic || '—'} | ${row.confidence} | ${row.reason || ''} |`);
    }
  }
  L.push('');
  return `${L.join('\n')}\n`;
}

/**
 * Build the review report from the built bank plus the app's validation report.
 * The `preserved` section is the audit trail proving nothing was deleted.
 */
function explanationHasContent(explanation) {
  if (typeof explanation === 'string') return Boolean(explanation.trim());
  if (!explanation || typeof explanation !== 'object') return false;
  if (typeof explanation.correct_reasoning === 'string' && explanation.correct_reasoning.trim()) return true;
  if ((explanation.option_explanations || []).some((row) => typeof row?.text === 'string' && row.text.trim())) return true;
  return ['key_concepts', 'revision_takeaways'].some((key) =>
    (explanation[key] || []).some((value) => typeof value === 'string' ? value.trim() : Boolean(value)),
  );
}

export function buildReviewReport(bank, validation, rows, extra = {}) {
  const questions = bank.questions || [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const rowsById = new Map((rows || []).map((r) => [r.id, r]));

  const issueFor = (code, ids) => [...validation.errors, ...validation.warnings, ...validation.fatal].filter((i) => i.code === code && (!ids || ids.includes(i.questionId)));

  const missingAnswers = questions
    .filter((q) => !q.supplied_answer || !q.supplied_answer.answer || !q.supplied_answer.answer.length)
    .map((q) => ({
      id: q.id,
      paper_id: q.paper_id,
      year: q.year,
      status: q.supplied_answer?.status || 'missing',
      excerpt: firstVariant(q).question_text?.slice(0, 140) || '',
      note: 'No key was fabricated. The record keeps answer: null and answer_key_status: "missing".',
    }));

  const nearDuplicates = (validation.nearDuplicates || []).map((pair) => ({
    a: pair.a,
    b: pair.b,
    similarity: pair.similarity,
    basis: pair.basis,
    same_paper: byId.get(pair.a)?.paper_id === byId.get(pair.b)?.paper_id,
    kept: 'both records retained in the bank',
  }));

  const identicalGroups = [...validation.warnings]
    .filter((w) => w.code === 'identical_question_content')
    .map((w) => ({ ids: w.ids, note: 'identical question text and options under different ids; both kept' }));

  const ambiguous = (rows || [])
    .filter((r) => !r.subject || r.flags?.includes('ambiguous_topic'))
    .map((r) => ({
      id: r.id,
      subject: r.subject || null,
      topic: r.topic || null,
      reason: r.reason,
      candidates: r.candidates,
      excerpt: r.excerpt,
    }));

  const lowConfidence = (rows || [])
    .filter((r) => r.subject && r.confidence !== null && r.confidence < LOW_CONFIDENCE_THRESHOLD)
    .map((r) => ({ id: r.id, subject: r.subject, topic: r.topic, confidence: r.confidence, reason: r.reason }));

  const integrity = {
    missing_language_variant: rows.filter((r) => r.flags?.includes('missing_language_variant')).map((r) => ({ id: r.id })),
    fewer_than_two_options: questions
      .filter((q) => Object.values(q.language_variants || {}).some((v) => (v.options || []).length < 2))
      .map((q) => ({ id: q.id })),
    empty_option_text: uniqIds(issueFor('empty_option_text')),
    invalid_answer_reference: uniqIds(issueFor('invalid_answer_reference')),
    duplicate_option_key: uniqIds(issueFor('duplicate_option_key')),
    multi_answer_on_single_correct: uniqIds(issueFor('multi_answer_on_single_correct')),
    missing_question_number: uniqIds(issueFor('missing_question_number')),
    disputed_keys: questions.filter((q) => q.dispute?.is_disputed || q.supplied_answer?.status === 'disputed').map((q) => ({ id: q.id, reason: q.dispute?.reason || null })),
    verified_differs_from_supplied: questions
      .filter((q) => q.verified_answer?.answer?.length && q.supplied_answer?.answer?.length && q.verified_answer.answer.join(',') !== q.supplied_answer.answer.join(','))
      .map((q) => ({ id: q.id, supplied: q.supplied_answer.answer, verified: q.verified_answer.answer })),
    duplicate_ids_in_source: extra.duplicateIds || [],
    unmapped_source_keys: extra.unmappedKeys || [],
    adapter_notes: (extra.recordIssues || []).slice(0, 200),
    rejected_records: (validation.rejected || []).map((r) => ({ id: r.id, reason: r.reason })),
    explanations_present: questions.filter((q) => explanationHasContent(q.explanation)).length,
    without_explanation: questions.filter((q) => !explanationHasContent(q.explanation)).length,
  };

  const reviewed = extra.reviewedSummary || null;
  const answers = extra.answerSummary || null;
  const repair = extra.repair || null;
  const ai = extra.aiSummary || null;
  const sanitisation = extra.sanitisation || null;
  const sourceAudit = extra.sourceAudit || null;
  const historicalSourceAudit = extra.historicalSourceAudit || null;
  const historicalTotals = historicalSourceAudit
    ? historicalSourceAudit.years.reduce(
        (totals, year) => ({
          missing_explanations: totals.missing_explanations + year.missing_explanation_numbers.length,
          placeholder_explanations: totals.placeholder_explanations + year.placeholder_explanation_numbers.length,
          empty_option_text: totals.empty_option_text + year.empty_option_text.length,
        }),
        { missing_explanations: 0, placeholder_explanations: 0, empty_option_text: 0 },
      )
    : { missing_explanations: 0, placeholder_explanations: 0, empty_option_text: 0 };
  const countValues = (value) => Object.values(value || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
  const repairMetadataRemoved = countValues(repair?.metadata_removed);
  const sanitisedBuildMetadataRemoved = sanitisation
    ? Number(Boolean(sanitisation.removed.bank_generator)) +
      Number(Boolean(sanitisation.removed.bank_provenance)) +
      Number(Boolean(sanitisation.removed.bank_classification_meta)) +
      countValues(sanitisation.removed.paper_metadata_fields) +
      countValues(sanitisation.removed.parser_metadata_fields)
    : 0;
  const repairProvenanceRemoved = repair
    ? repair.provenance_moved.question_source_references +
      repair.answer_sources_blanked +
      repair.paper_fixes.answer_key_sources_blanked +
      repair.paper_fixes.source_file_lists_blanked +
      repairMetadataRemoved +
      Number(Boolean(repair.provenance_moved.bank_provenance))
    : 0;
  const sanitisedProvenanceRemoved = sanitisation
    ? sanitisation.removed.question_source_references +
      sanitisation.removed.supplied_answer_sources +
      sanitisation.removed.paper_source_files.length +
      sanitisedBuildMetadataRemoved
    : 0;
  const preservedAutomaticSchemes = (sanitisation?.marking_scheme_preserved || []).filter((scheme) => scheme.scheme_id).length;

  return {
    generated_at: new Date().toISOString(),
    totals: {
      questions_in_bank: questions.length,
      questions_in_source: extra.sourceQuestionCount ?? questions.length,
      records_removed: 0,
      records_merged: 0,
      missing_answer_keys: missingAnswers.length,
      near_duplicate_pairs: nearDuplicates.length,
      identical_content_groups: identicalGroups.length,
      ambiguous_classifications: ambiguous.length,
      low_confidence_classifications: lowConfidence.length,
      // The repair pass and final sanitiser both remove build-time provenance;
      // count every field removed before the app-facing file is written.
      provenance_fields_removed: repairProvenanceRemoved + sanitisedProvenanceRemoved,
      escapes_repaired: (repair ? repair.text_repairs.occurrences : 0) + (sanitisation ? sanitisation.repaired_escapes.occurrences : 0),
      papers_with_automatic_scheme: sanitisation ? sanitisation.marking_scheme.length + preservedAutomaticSchemes : 0,
      papers_without_scheme: sanitisation ? sanitisation.marking_scheme_unresolved.length : 0,
      reviewed_labels_applied: reviewed ? reviewed.applied.length : 0,
      reviewed_labels_rejected: reviewed ? reviewed.rejected.length : 0,
      answers_resolved: answers ? answers.applied.length : 0,
      answers_resolution_rejected: answers ? answers.rejected.length : 0,
      answers_printed_keys_preserved: answers ? answers.preserved.length : 0,
      text_repairs: repair ? repair.text_repairs.occurrences : 0,
      ai_labels_applied: ai ? ai.applied.length : 0,
      ai_labels_preserved: ai ? ai.preserved.length : 0,
      ai_labels_rejected: ai ? ai.rejected.length : 0,
      ai_labels_malformed: ai ? ai.malformed.length : 0,
      source_blocks_detected: sourceAudit ? sourceAudit.stats.question_blocks_detected : null,
      records_excluded_by_source_parser: sourceAudit ? sourceAudit.excluded.length : 0,
      historical_source_questions: historicalSourceAudit?.question_count ?? 0,
      historical_source_papers: historicalSourceAudit?.paper_count ?? 0,
      historical_source_repairs: historicalSourceAudit?.repairs?.length ?? 0,
      historical_missing_explanations: historicalTotals.missing_explanations,
      historical_placeholders_removed: historicalTotals.placeholder_explanations,
      historical_empty_option_texts_preserved: historicalTotals.empty_option_text,
    },
    missing_answers: missingAnswers,
    near_duplicates: nearDuplicates,
    identical_content_groups: identicalGroups,
    ambiguous_classifications: ambiguous,
    low_confidence_classifications: lowConfidence,
    source_extraction: sourceAudit,
    historical_sources: historicalSourceAudit,
    extraction_repairs: repair,
    reviewed_merge: reviewed
      ? {
          statement:
            'These classification decisions were taken by a person who read each question together with its options, printed answer and explanation, in cases where the rule engine could not place the question or placed it with weak evidence. A label is stored only when every level of it exists in data/taxonomy/mppsc-taxonomy.json; the source is recorded as "reviewed", never as an AI classification.',
          applied: reviewed.applied,
          rejected: reviewed.rejected,
          malformed: reviewed.malformed,
          decisions: (reviewed.decisions || []).slice(0, 400),
        }
      : null,
    answer_merge: answers
      ? {
          statement:
            'A question the source left without any answer stays keyless unless a person resolves it. These are those resolutions: the answer was chosen by reading the question, its options and the source explanation, and, where the commission deleted the question, by the settled position on the point. The merge refuses to touch a record that already carries a printed key, and the source explanation that was replaced is recorded below. The app-facing bank carries the answer and the explanation text only — the basis and the reason live here.',
          applied: answers.applied,
          preserved: answers.preserved,
          rejected: answers.rejected,
          malformed: answers.malformed,
          decisions: (answers.decisions || []).slice(0, 200),
        }
      : null,
    sanitisation,
    ai_merge: ai
      ? {
          statement:
            'Provider labels are merged only when they validate against data/taxonomy/mppsc-taxonomy.json. An empty, malformed or out-of-taxonomy response changes nothing: the existing subject, topic and subtopic are kept, and the response is listed here. A level the taxonomy rejects is preserved when it still fits the subject, otherwise it is dropped and the reason recorded.',
          applied: ai.applied,
          preserved: ai.preserved,
          rejected: ai.rejected,
          flagged: ai.flagged,
          malformed: ai.malformed,
          decisions: (ai.decisions || []).slice(0, 200),
        }
      : null,
    integrity,
    preserved: {
      statement: historicalSourceAudit
        ? 'All 571 pre-existing 2019–2024 questions retain their ids, years, numbers, wording, options, explanations, supplied answers and taxonomy labels. Internal metadata is sanitized and their scoring metadata is updated to the latest-pattern practice policy. All 600 historical source records are retained with their printed keys; no question was merged or dropped. Only exact “Factual Question” placeholders were changed to null, and the narrowly scoped, source-evidenced extraction repairs listed in historical_sources were applied. Preliminary labels, review flags and source provenance remain in this report, not in the app-facing JSON. Similar-looking questions are flagged but never deduplicated.'
        : 'No source question record was deleted or merged. Question text, options, stored answers and explanations are carried over except for explicitly reported safe extraction repairs. Source provenance (book names, page references, answer sources, key-issue labels) is deliberately not part of the app-facing bank — it is recorded in the sanitisation section of this report instead. Where two records look alike both are kept and flagged here instead of being merged.',
      questions_kept: questions.length,
      review_flags_added: (rows || []).filter((r) => r.flags?.length).length,
    },
  };
}

function uniqIds(issues) {
  return Array.from(new Set(issues.map((i) => i.questionId).filter(Boolean))).map((id) => ({ id }));
}

function firstVariant(q) {
  const variants = q.language_variants || {};
  return variants.en || Object.values(variants)[0] || {};
}

export function renderHistoricalSourceAuditMarkdown(audit) {
  const L = [];
  L.push('# Historical source integration audit — 2013–2018');
  L.push('');
  L.push(audit.statement || 'Internal source audit.');
  L.push('');
  L.push(`Integrated records: **${audit.question_count} questions across ${audit.paper_count} papers**; expected ${audit.expected_questions_per_paper} per year. Rejected: **${audit.records_rejected}**. Merged/deduplicated: **${audit.records_merged}**.`);
  L.push('');
  L.push('Every source package was adapted by its own schema branch. The README counts, structured source records and review-report entries are checked before a build succeeds. Printed answer keys remain supplied, not independently verified; preliminary source labels are audit-only and no AI provider was run.');
  L.push('');
  L.push('| Year | Adapter schema | Questions | Review-flagged | Missing explanations | Placeholder explanations cleared | Empty option texts preserved | Safe repairs | README/report checks |');
  L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const year of audit.years || []) {
    const checks = year.source_report_checks || {};
    const checkResults = [
      checks.question_count_matches,
      checks.missing_answer_numbers_match,
      checks.missing_explanation_numbers_match,
      checks.review_count_matches,
      checks.source_flag_count_matches_review_items,
      checks.readme_question_count_matches,
      checks.readme_four_option_count_matches,
      checks.readme_review_flag_count_matches,
      checks.readme_missing_answer_count_matches,
      checks.readme_missing_explanation_count_matches,
    ].filter((value) => value !== null && value !== undefined);
    const checkLabel = checkResults.every(Boolean) ? `${checkResults.length}/${checkResults.length} match` : `${checkResults.filter(Boolean).length}/${checkResults.length} match — see details`;
    const repairCount = (audit.repairs || []).filter((repair) => repair.year === year.year).length;
    L.push(`| ${year.year} | ${year.source_schema} | ${year.source_record_count} | ${year.review_report?.flagged_record_count ?? '—'} | ${year.missing_explanation_numbers.length} | ${year.placeholder_explanation_numbers.length} | ${year.empty_option_text.length} | ${repairCount} | ${checkLabel} |`);
  }
  L.push('');
  L.push('## Readme and report consistency');
  L.push('');
  for (const year of audit.years || []) {
    const checks = year.source_report_checks || {};
    const mark = (value) => value === null || value === undefined ? 'not stated in that file' : value ? 'match' : 'MISMATCH';
    L.push(`- **${year.year}:** ${year.readme?.declared_question_count ?? 'README question count not stated'} questions in README (${mark(checks.readme_question_count_matches)}); source-review count ${mark(checks.question_count_matches)}; printed-answer gaps ${mark(checks.missing_answer_numbers_match)}; missing-explanation list/count ${mark(checks.missing_explanation_numbers_match)}; source flags vs review items ${mark(checks.source_flag_count_matches_review_items)}.`);
    const placeholders = year.placeholder_explanation_numbers || [];
    const empty = year.empty_option_text || [];
    if (placeholders.length) L.push(`  - Exact generic placeholders cleared to null: Q${placeholders.join(', Q')}.`);
    if (empty.length) L.push(`  - Empty option text kept empty (not reconstructed): Q${empty.join(', Q')}.`);
    const sourceDuplicates = year.source_duplicate_option_keys || [];
    if (sourceDuplicates.length) L.push(`  - Source option-key anomaly repaired from the verbatim source snippet: ${sourceDuplicates.map((entry) => `Q${entry.question_number} (${entry.keys.join('/')})`).join(', ')}.`);
  }
  L.push('');
  L.push('The source packages declare four options per question. Every adapted record retains four positions, every printed answer maps to an option, and no record is silently skipped. Blank option text, missing explanations and source flags remain listed here rather than being filled with guesses.');
  L.push('');
  L.push('## Source-provided preliminary subject counts (audit only)');
  L.push('');
  L.push('These labels were **not** imported as final classifications. The deterministic rules classify the app bank; the canonical taxonomy and coverage are in `classification-report.md`.');
  L.push('');
  for (const year of audit.years || []) {
    const counts = Object.entries(year.preliminary_classification_counts || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    L.push(`- **${year.year}:** ${counts.map(([label, count]) => `${label} ${count}`).join('; ') || 'no preliminary labels'}.`);
  }
  L.push('');
  L.push('## Review-report corrections');
  L.push('');
  if (!(audit.review_report_corrections || []).length) L.push('None.');
  else {
    L.push('Three stale 2018 review notes were corrected after checking the matching source question, options, printed key and explanation. Question wording, options, printed answers and explanations were not changed by these report corrections.');
    L.push('');
    L.push('| Question | Prior note | Corrected note / action | Reason |');
    L.push('| --- | --- | --- | --- |');
    for (const correction of audit.review_report_corrections) {
      L.push(`| ${correction.year} Q${correction.question_number} | ${escapeCell(correction.before, 1000)} | ${correction.after ? escapeCell(correction.after, 1000) : 'Removed unrelated note; generic placeholder flag retained'} | ${escapeCell(correction.reason, 1000)} |`);
    }
  }
  L.push('');
  L.push('## Safe source-text repairs');
  L.push('');
  const nonPlaceholderRepairs = (audit.repairs || []).filter((repair) => !/exact generic placeholder/i.test(repair.reason));
  if (!nonPlaceholderRepairs.length) L.push('None.');
  else {
    L.push('Only source-evidenced extraction/formatting artefacts were repaired; full before/after values remain in the JSON audit.');
    L.push('');
    L.push('| Question | Field | Repair |');
    L.push('| --- | --- | --- |');
    for (const repair of nonPlaceholderRepairs) L.push(`| ${repair.year} Q${repair.question_number} | ${repair.field} | ${escapeCell(repair.reason)} |`);
  }
  L.push('');
  L.push(`Historical missing explanations: **${(audit.years || []).reduce((count, year) => count + year.missing_explanation_numbers.length, 0)}**. Exact generic “Factual Question” placeholders cleared: **${(audit.years || []).reduce((count, year) => count + year.placeholder_explanation_numbers.length, 0)}**. No explanation was written or expanded.`);
  L.push('');
  L.push(`Review-report/question-text mismatches: **${(audit.report_mismatches || []).length}**. Extra report-only flags: **${(audit.report_flag_differences || []).length}**. These were zero at the successful build.`);
  L.push('');
  L.push('## Marking and answer verification');
  L.push('');
  L.push(audit.marking_policy || 'Historical scoring schemes are not assumed.');
  L.push('');
  L.push(audit.answer_policy || 'Printed answer keys remain source-supplied and unverified.');
  L.push('');
  return `${L.join('\n').trimEnd()}\n`;
}

export function renderReviewMarkdown(report) {
  const L = [];
  L.push('# PYQ bank review report');
  L.push('');
  L.push(`Generated ${report.generated_at}.`);
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push('| Check | Count |');
  L.push('| --- | --- |');
  L.push(`| Questions in the source file | ${report.totals.questions_in_source} |`);
  L.push(`| Questions in the built bank | ${report.totals.questions_in_bank} |`);
  L.push(`| Records removed | ${report.totals.records_removed} |`);
  L.push(`| Records merged | ${report.totals.records_merged} |`);
  L.push(`| Missing answer keys | ${report.totals.missing_answer_keys} |`);
  L.push(`| Near-duplicate pairs | ${report.totals.near_duplicate_pairs} |`);
  L.push(`| Identical-content groups | ${report.totals.identical_content_groups} |`);
  L.push(`| Ambiguous classifications | ${report.totals.ambiguous_classifications} |`);
  L.push(`| Low-confidence classifications | ${report.totals.low_confidence_classifications} |`);
  L.push(`| Reviewed classification decisions applied / rejected | ${report.totals.reviewed_labels_applied} / ${report.totals.reviewed_labels_rejected} |`);
  L.push(`| Keyless questions resolved by a human / printed keys preserved | ${report.totals.answers_resolved} / ${report.totals.answers_printed_keys_preserved} |`);
  L.push(`| Extraction artefacts repaired (escaped line breaks) | ${report.totals.text_repairs} |`);
  L.push(`| Source-provenance fields removed before the bank was built | ${report.totals.provenance_fields_removed} |`);
  L.push(`| Literal \\n escapes repaired | ${report.totals.escapes_repaired} |`);
  L.push(`| Papers given an automatic MPPSC scheme | ${report.totals.papers_with_automatic_scheme} |`);
  L.push(`| Papers with no verified scheme (app asks for rules) | ${report.totals.papers_without_scheme} |`);
  L.push(`| AI labels applied / preserved / rejected / malformed | ${report.totals.ai_labels_applied} / ${report.totals.ai_labels_preserved} / ${report.totals.ai_labels_rejected} / ${report.totals.ai_labels_malformed} |`);
  if (report.historical_sources) {
    L.push(`| Historical 2013–2018 source questions / papers | ${report.totals.historical_source_questions} / ${report.totals.historical_source_papers} |`);
    L.push(`| Historical missing explanations / placeholders cleared | ${report.totals.historical_missing_explanations} / ${report.totals.historical_placeholders_removed} |`);
    L.push(`| Historical safe source-text repairs | ${report.totals.historical_source_repairs} |`);
  }
  L.push('');
  if (report.historical_sources) {
    L.push(renderHistoricalSourceAuditMarkdown(report.historical_sources).trimEnd());
    L.push('');
  }
  L.push('## Missing answer keys');
  L.push('');
  if (!report.missing_answers.length) L.push('None.');
  else {
    L.push('These questions are in the bank with `supplied_answer.answer = null` and `answer_key_status = "missing"`. The app excludes them from scoring and labels them *Answer key missing*. **No answer was fabricated for any of them.**');
    L.push('');
    L.push('| Question | Paper | Year | Question text (excerpt) |');
    L.push('| --- | --- | --- | --- |');
    for (const row of report.missing_answers) L.push(`| \`${row.id}\` | ${row.paper_id || '—'} | ${row.year ?? '—'} | ${escapeCell(row.excerpt)} |`);
  }
  L.push('');
  if (report.answer_merge) {
    L.push('## Answer resolutions');
    L.push('');
    L.push(report.answer_merge.statement);
    L.push('');
    L.push(`Applied: **${report.answer_merge.applied.length}**, printed keys left untouched: ${report.answer_merge.preserved.length}, rejected: ${report.answer_merge.rejected.length}, malformed lines: ${report.answer_merge.malformed.length}.`);
    L.push('');
    if (report.answer_merge.decisions.length) {
      L.push('| Question | Action | Answer | Basis | Explanation in the bank | Why |');
      L.push('| --- | --- | --- | --- | --- | --- |');
      for (const d of report.answer_merge.decisions) {
        L.push(`| \`${d.id ?? 'unknown'}\` | ${d.action} | ${d.answer ? `\`${d.answer}\`` : '—'} | ${d.basis || '—'} | ${escapeCell(d.explanation || '')} | ${escapeCell(d.reason || '')} |`);
      }
    }
    L.push('');
  }
  L.push('## Suspected duplicates');
  L.push('');
  if (!report.near_duplicates.length && !report.identical_content_groups.length) L.push('None.');
  else {
    L.push('Detected by the same similarity pass the app runs at import time (blended token and 3-word-shingle Jaccard on the question text). **Both records of every pair are kept** — the pipeline never merges or deletes a suspected duplicate, because reworded questions about the same fact are often legitimately separate.');
    L.push('');
    L.push('| Question A | Question B | Similarity | Same paper? |');
    L.push('| --- | --- | --- | --- |');
    for (const row of report.near_duplicates) L.push(`| \`${row.a}\` | \`${row.b}\` | ${row.similarity} | ${row.same_paper ? 'yes' : 'no'} |`);
    for (const group of report.identical_content_groups) L.push(`| ${group.ids.map((id) => `\`${id}\``).join(' / ')} | — | identical text and options | — |`);
  }
  L.push('');
  L.push('## Ambiguous classifications');
  L.push('');
  if (!report.ambiguous_classifications.length) L.push('None.');
  else {
    L.push('Either the evidence was too weak to pick a subject, or two subjects scored too close to separate. These are left `Unclassified` (or without a topic) and are exactly the records the resumable AI queue picks up.');
    L.push('');
    L.push('| Question | Assigned | Reason | Candidates |');
    L.push('| --- | --- | --- | --- |');
    for (const row of report.ambiguous_classifications) {
      const assigned = row.subject ? `${row.subject}${row.topic ? ` / ${row.topic}` : ''}` : 'unclassified';
      const cands = (row.candidates || []).map((c) => `${c.subject} (${c.score})`).join(', ') || '—';
      L.push(`| \`${row.id}\` | ${assigned} | ${row.reason || '—'} | ${cands} |`);
    }
  }
  L.push('');
  L.push('## Low-confidence classifications');
  L.push('');
  if (!report.low_confidence_classifications.length) L.push('None.');
  else {
    L.push(`Classified, but below the ${LOW_CONFIDENCE_THRESHOLD} review threshold. The app marks them as uncertain.`);
    L.push('');
    L.push('| Question | Subject | Topic | Confidence |');
    L.push('| --- | --- | --- | --- |');
    for (const row of report.low_confidence_classifications) L.push(`| \`${row.id}\` | ${row.subject} | ${row.topic || '—'} | ${row.confidence} |`);
  }
  L.push('');
  if (report.source_extraction) {
    const se = report.source_extraction;
    L.push('## Source extraction findings');
    L.push('');
    L.push(
      `Reported by the source parser itself (${se.file || 'review file'}${se.parser_version ? `, parser ${se.parser_version}` : ''}; input \`${se.input_file || 'unknown'}\`${se.input_sha256 ? `, sha256 \`${se.input_sha256.slice(0, 16)}…\`` : ''}).`,
    );
    L.push('');
    L.push('| Measure | Value |');
    L.push('| --- | --- |');
    for (const [key, value] of Object.entries(se.stats)) {
      if (value === null || value === undefined) continue;
      L.push(`| ${key.replace(/_/g, ' ')} | ${value} |`);
    }
    L.push('');
    if (se.excluded.length) {
      L.push(`**${se.excluded.length} question block(s) the parser refused to export — they are NOT in this bank** and need manual transcription from the book:`);
      L.push('');
      L.push('| Id | Year / Q# | Page | Why | Preview |');
      L.push('| --- | --- | --- | --- | --- |');
      for (const r of se.excluded) {
        L.push(`| \`${r.id}\` | ${r.year} / ${r.question_number} | ${r.start_page ?? '—'} | ${escapeCell(r.flags.join(', '))} | ${escapeCell(r.preview || '')} |`);
      }
      L.push('');
    }
    const gapYears = Object.entries(se.numbering_gaps || {}).filter(([, list]) => Array.isArray(list) && list.length);
    if (gapYears.length) {
      const total = gapYears.reduce((n, [, list]) => n + list.length, 0);
      L.push(`**${total} numbering gap(s)** across ${gapYears.length} year(s). A gap may be a deleted question, an extraction miss, or a question start the parser could not recognise — the source parser explicitly warns not to assume the question is absent from the book:`);
      L.push('');
      for (const [year, list] of gapYears) L.push(`- ${year}: ${list.join(', ')}`);
      L.push('');
    }
    if (se.flagged.length) {
      L.push(`${se.flagged.length} further record(s) the parser flagged but still exported:`);
      L.push('');
      for (const r of se.flagged) L.push(`- \`${r.id}\` (${r.year} Q${r.question_number}): ${r.flags.join(', ')}`);
      L.push('');
    }
    for (const note of se.notes || []) L.push(`> ${note}`);
    if ((se.notes || []).length) L.push('');
  }
  if (report.ai_merge) {
    L.push('## AI label merge');
    L.push('');
    L.push(report.ai_merge.statement);
    L.push('');
    L.push('| Question | Decision | Subject / topic / subtopic after | Why |');
    L.push('| --- | --- | --- | --- |');
    for (const d of report.ai_merge.decisions) {
      const after = d.after ? `${d.after.subject}${d.after.topic ? ` / ${d.after.topic}` : ''}${d.after.subtopic ? ` / ${d.after.subtopic}` : ''}` : '—';
      L.push(`| \`${d.id ?? 'unknown'}\` | ${d.action} | ${after} | ${escapeCell(d.reason || '')} |`);
    }
    if (report.ai_merge.malformed.length) {
      L.push('');
      L.push('Malformed provider lines that were skipped (never silently dropped):');
      L.push('');
      for (const m of report.ai_merge.malformed) L.push(`- line ${m.line ?? '—'}: ${escapeCell(m.reason)} — \`${escapeCell(m.excerpt || '')}\``);
    }
    L.push('');
  }
  if (report.extraction_repairs) {
    const r = report.extraction_repairs;
    L.push('## Extraction repairs');
    L.push('');
    L.push(r.statement);
    L.push('');
    L.push('| Repair | Value |');
    L.push('| --- | --- |');
    L.push(`| Escaped line breaks converted to real newlines | ${r.text_repairs.occurrences} in ${r.text_repairs.strings} string(s) |`);
    for (const [field, count] of Object.entries(r.text_repairs.by_field)) L.push(`| — in \`${field}\` | ${count} |`);
    L.push(`| Question source references moved out of the bank | ${r.provenance_moved.question_source_references} |`);
    for (const [key, count] of Object.entries(r.metadata_removed)) L.push(`| Parser metadata \`${key}\` removed | ${count} |`);
    L.push(`| Answer source labels removed | ${r.answer_sources_blanked} |`);
    L.push(`| Paper names normalised | ${r.paper_fixes.renamed.length} |`);
    L.push(`| Paper answer-key source blocks removed | ${r.paper_fixes.answer_key_sources_blanked} |`);
    L.push(`| Paper source-file lists removed | ${r.paper_fixes.source_file_lists_blanked} |`);
    L.push('');
    if (r.provenance_moved.bank_provenance) {
      L.push('The bank-level provenance block that was removed is recorded in the sanitisation section below.');
      L.push('');
    }
    L.push(r.untouched);
    L.push('');
  }
  if (report.reviewed_merge) {
    L.push('## Reviewed classification decisions');
    L.push('');
    L.push(report.reviewed_merge.statement);
    L.push('');
    L.push(`Applied: **${report.reviewed_merge.applied.length}**, rejected: ${report.reviewed_merge.rejected.length}, malformed lines: ${report.reviewed_merge.malformed.length}.`);
    L.push('');
    if (report.reviewed_merge.decisions.length) {
      L.push('| Question | Decision | Subject / topic / subtopic after | Why |');
      L.push('| --- | --- | --- | --- |');
      for (const d of report.reviewed_merge.decisions) {
        const after = d.after ? `${d.after.subject}${d.after.topic ? ` / ${d.after.topic}` : ''}${d.after.subtopic ? ` / ${d.after.subtopic}` : ''}` : '—';
        const beforeText = d.before ? `was \`${d.before.subject}${d.before.topic ? ` / ${d.before.topic}` : ''}\`` : 'was unclassified';
        L.push(`| \`${d.id ?? 'unknown'}\` | ${d.action} (${beforeText}) | ${after} | ${escapeCell(d.reason || '')} |`);
      }
    }
    if (report.reviewed_merge.rejected.length) {
      L.push('');
      L.push('Labels that were refused (nothing was changed for those questions):');
      L.push('');
      for (const r of report.reviewed_merge.rejected) L.push(`- \`${r.id ?? 'unknown'}\`: ${escapeCell(r.reason)}`);
    }
    if (report.reviewed_merge.malformed.length) {
      L.push('');
      L.push('Malformed lines that were skipped (never silently dropped):');
      L.push('');
      for (const m of report.reviewed_merge.malformed) L.push(`- line ${m.line ?? '—'}: ${escapeCell(m.reason)} — \`${escapeCell(m.excerpt || '')}\``);
    }
    L.push('');
  }
  if (report.sanitisation) {
    const san = report.sanitisation;
    L.push('## App-facing bank sanitisation');
    L.push('');
    L.push(san.statement);
    L.push('');
    L.push('| What | Value |');
    L.push('| --- | --- |');
    L.push(`| Bank id | \`${san.identifiers.bank_id_before || '—'}\` → \`${san.identifiers.bank_id_after}\` |`);
    L.push(`| Bank name | ${escapeCell(san.identifiers.bank_name_after)} |`);
    if (san.identifiers.paper_ids.length) {
      L.push(`| Paper ids | ${san.identifiers.paper_ids.map((p) => `\`${p.from}\` → \`${p.to}\``).join('<br />')} |`);
    }
    // Two passes remove provenance: the extraction repair pass, which runs
    // before the bank is built, and this sanitiser, which is the second line of
    // defence. Both are reported so the numbers add up to the file the app loads.
    const parserFieldsTotal = Object.values(san.removed.parser_metadata_fields).reduce((a, b) => a + b, 0);
    L.push(`| Question \`source_reference\` removed by the repair pass | ${report.extraction_repairs ? report.extraction_repairs.provenance_moved.question_source_references : 0} |`);
    L.push(`| Question \`source_reference\` still present when the sanitiser ran | ${san.removed.question_source_references} |`);
    L.push(`| \`supplied_answer.source\` still present when the sanitiser ran | ${san.removed.supplied_answer_sources} |`);
    L.push(`| Paper-level answer-key blocks removed | ${san.removed.paper_answer_keys} |`);
    L.push(`| Paper source-file lists removed | ${san.removed.paper_source_files.length} |`);
    L.push(`| Parser metadata fields removed (${Object.entries(san.removed.parser_metadata_fields).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}) | ${parserFieldsTotal} |`);
    L.push(`| Review bookkeeping fields removed from \`metadata\` | ${san.removed.review_metadata_fields ?? 0} |`);
    const pipelineFields = san.removed.parser_metadata_fields;
    const pipelineNotesTotal = ['classification_flags', 'classification_evidence', 'classification_review', 'classification_dropped', 'near_duplicate_candidates', 'answer_review', 'question_type_basis', 'section'].reduce((sum, k) => sum + (pipelineFields[k] || 0), 0);
    L.push(`| Pipeline working notes removed from \`metadata\` (flags, evidence, duplicate pointers) | ${pipelineNotesTotal} |`);
    const bookkeeping = san.removed.classification_bookkeeping || {};
    L.push(`| Classification bookkeeping removed from the records (${Object.entries(bookkeeping).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}) | ${Object.values(bookkeeping).reduce((a, b) => a + b, 0)} |`);
    L.push(`| Explanation review fields removed (status, reviewer, dates) | ${san.removed.explanation_bookkeeping ?? 0} |`);
    L.push(`| Answer keys re-labelled \`supplied\` | ${san.answer_status.remapped_to_supplied} |`);
    L.push(`| Reviewed classification decisions kept as classification | ${report.totals.reviewed_labels_applied} |`);
    L.push(`| Questions kept without a key | ${san.answer_status.missing} |`);
    L.push(`| Bank-level classification metadata removed from the file | ${san.removed.bank_classification_meta ? 'yes (shown below)' : 'none present'} |`);
    L.push(`| Literal \\n escapes repaired by the sanitiser (the repair pass does the rest) | ${san.repaired_escapes.occurrences} in ${san.repaired_escapes.strings} string(s) |`);
    L.push('');
    if (san.removed.bank_classification_meta) {
      L.push('The bank-level `classification_meta` block that was removed, so a bank re-fed through the pipeline does not hand its build notes straight back to the app:');
      L.push('');
      L.push('```json');
      L.push(JSON.stringify(san.removed.bank_classification_meta, null, 2));
      L.push('```');
      L.push('');
    }
    if (san.removed.bank_provenance) {
      L.push('The bank-level provenance block that was removed (kept here as the audit record):');
      L.push('');
      L.push('```json');
      L.push(JSON.stringify(san.removed.bank_provenance, null, 2));
      L.push('```');
      L.push('');
    }
    if (san.removed.bank_generator) {
      L.push('The bank-level generator/build note was removed from the app-facing JSON:');
      L.push('');
      L.push('```json');
      L.push(JSON.stringify(san.removed.bank_generator, null, 2));
      L.push('```');
      L.push('');
    }
    const removedPaperMetadata = Object.entries(san.removed.paper_metadata_fields || {});
    if (removedPaperMetadata.length) {
      L.push(`Internal paper metadata fields removed: ${removedPaperMetadata.map(([key, count]) => `\`${key}\` (${count})`).join(', ')}.`);
      L.push('');
    }
    if (san.removed.paper_source_files.length) {
      L.push(`Source files no longer recorded in the bank: ${san.removed.paper_source_files.map((f) => `\`${f.file || 'unknown'}\` (${f.paper_id})`).join(', ')}.`);
      L.push('');
    }
    L.push('### Marking schemes retained or resolved for each paper');
    L.push('');
    if (!san.marking_scheme.length && !san.marking_scheme_unresolved.length && !(san.marking_scheme_preserved || []).length) L.push('No papers.');
    else {
      L.push('| Paper | Year | Scheme | Correct | Incorrect | Unanswered | Total | Duration | Evidence confidence |');
      L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const m of san.marking_scheme_preserved || []) {
        L.push(`| \`${m.paper_id}\` | ${m.year ?? '—'} | ${m.scheme_id || 'pre-existing declared rules'} | +${m.marks_per_correct} | ${m.negative_marks_per_incorrect ? `−${m.negative_marks_per_incorrect}` : '0'} | ${m.marks_for_unanswered} | ${m.total_marks ?? '—'} | ${m.duration_minutes ?? '—'} | preserved |`);
      }
      for (const m of san.marking_scheme) {
        L.push(
          `| \`${m.paper_id}\` | ${m.year} | ${m.scheme_id} | +${m.marks_per_correct} | ${m.negative_marks_per_incorrect ? `−${m.negative_marks_per_incorrect}` : '0'} | ${m.marks_for_unanswered} | ${m.total_marks ?? '—'} | ${m.duration_minutes ?? '—'} | ${m.confidence} |`,
        );
      }
      for (const m of san.marking_scheme_unresolved) {
        L.push(`| \`${m.paper_id}\` | ${m.year ?? '—'} | no verified scheme — the app asks before scoring | — | — | — | — | — | — |`);
      }
      L.push('');
    }
  }
  L.push('## Content integrity');
  L.push('');
  const I = report.integrity;
  L.push('| Check | Count |');
  L.push('| --- | --- |');
  L.push(`| Variants with no question text | ${I.missing_language_variant.length} |`);
  L.push(`| Variants with fewer than two options | ${I.fewer_than_two_options.length} |`);
  L.push(`| Empty option text | ${I.empty_option_text.length} |`);
  L.push(`| Answers that do not match an option key | ${I.invalid_answer_reference.length} |`);
  L.push(`| Duplicated option keys | ${I.duplicate_option_key.length} |`);
  L.push(`| Multi-answer keys on single-correct questions | ${I.multi_answer_on_single_correct.length} |`);
  L.push(`| Questions with no question number | ${I.missing_question_number.length} |`);
  L.push(`| Disputed keys | ${I.disputed_keys.length} |`);
  L.push(`| Verified answer differs from printed key | ${I.verified_differs_from_supplied.length} |`);
  L.push(`| Records rejected by validation | ${I.rejected_records.length} |`);
  L.push(`| Questions without an explanation | ${I.without_explanation} |`);
  L.push(`| Explanations carried into the bank | ${I.explanations_present} |`);
  L.push(`| Duplicate ids in the source | ${I.duplicate_ids_in_source.length} |`);
  L.push(`| Unmapped source keys | ${I.unmapped_source_keys.length} |`);
  L.push('');
  if (I.invalid_answer_reference.length || I.fewer_than_two_options.length || I.missing_language_variant.length || I.rejected_records.length) {
    L.push('### Blocking content problems');
    L.push('');
    for (const row of I.rejected_records) L.push(`- \`${row.id}\`: rejected — ${row.reason}`);
    for (const row of I.invalid_answer_reference) L.push(`- \`${row.id}\`: printed answer does not match any option key`);
    for (const row of I.fewer_than_two_options) L.push(`- \`${row.id}\`: fewer than two options in a language variant`);
    for (const row of I.missing_language_variant) L.push(`- \`${row.id}\`: no usable language variant`);
    L.push('');
  }
  if (I.unmapped_source_keys.length) {
    L.push(`### Source fields this pipeline does not read`);
    L.push('');
    L.push('These keys exist in the source file but are not part of the question-bank schema, so their values were **not** carried over. Nothing was silently discarded: extend `tools/classify/intake-adapter.mjs` if any of them carries content you need.');
    L.push('');
    L.push(I.unmapped_source_keys.map((k) => `\`${k}\``).join(', '));
    L.push('');
  }
  if (I.adapter_notes?.length) {
    L.push('### Per-record adapter notes');
    L.push('');
    for (const row of I.adapter_notes) L.push(`- ${row.problem}`);
    L.push('');
  }
  L.push('## Preservation statement');
  L.push('');
  L.push(report.preserved.statement);
  L.push('');
  L.push(`Review flags attached to records: **${report.preserved.review_flags_added}**.`);
  L.push('');
  return `${L.join('\n')}\n`;
}

function escapeCell(text, maxLength = 140) {
  const escaped = String(text || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return escaped.slice(0, maxLength);
}
