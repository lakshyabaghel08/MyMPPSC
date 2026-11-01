/**
 * tools/classify/reviewed-corrections.mjs — apply what the audits decided.
 *
 * The bank is regenerated from the extraction, and the extraction prints the
 * paper's own answer key. Everything the answer audits decided — corrected keys,
 * repaired option texts, rewritten explanations, dispute flags — lives outside
 * the extraction, so without this pass a clean rebuild would quietly restore the
 * printed keys, the scanned option text and the scraped prose. That is the defect
 * this module exists to close: the corrections are data, and a rebuild applies
 * them deterministically, once, with a record of what it did.
 *
 * The declared corrections are split by kind, because they are edited by
 * different reviews and are easier to check apart:
 *
 *   data/pyq/reviewed-corrections.json   answers, option texts, the declaration
 *                                        lists, the audit summaries
 *   data/pyq/reviewed-explanations.json  the reviewed explanation prose itself
 *   data/pyq/reviewed-disputes.json      the dispute blocks
 *
 * Application rules (all enforced, never skipped silently):
 *   - every declared id must exist in the intake, exactly once;
 *   - a correction whose `from` no longer matches is a rejection, not a guess:
 *     either the intake is already corrected (counted as already applied) or the
 *     declaration and the data have drifted apart (counted as rejected, which the
 *     caller turns into a failed build);
 *   - an option repair must still quote the printed text it replaces;
 *   - the explanation list and the explanation file must name the same ids.
 */

export const CORRECTIONS_VERSION = '1.0.0';

const clone = (value) => (value === undefined ? undefined : structuredClone(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keysOf = (map) => Object.keys(map || {}).sort();

/**
 * Validate the three correction files against each other before anything is
 * applied. Anything inconsistent throws here rather than drifting later.
 */
export function parseReviewedCorrections({ corrections, explanations, disputes }) {
  if (!corrections || typeof corrections !== 'object') throw new Error('reviewed-corrections: the file must be a JSON object');
  const answers = corrections.answer_corrections || {};
  const options = corrections.option_corrections || {};
  const rewritten = Array.isArray(corrections.narrative_rewritten) ? corrections.narrative_rewritten : [];
  const complete = Array.isArray(corrections.option_reasoning_complete) ? corrections.option_reasoning_complete : [];

  const answerById = new Map();
  for (const [id, entry] of Object.entries(answers)) {
    if (!id) throw new Error('reviewed-corrections: an answer correction has no id');
    if (!Array.isArray(entry?.from) || !Array.isArray(entry?.to) || !entry.to.length) {
      throw new Error(`reviewed-corrections: ${id} answer correction needs \`from\` and \`to\` arrays`);
    }
    if (!String(entry.basis || '').trim()) throw new Error(`reviewed-corrections: ${id} answer correction needs a basis`);
    if (same(entry.from, entry.to)) throw new Error(`reviewed-corrections: ${id} answer correction changes nothing`);
    answerById.set(id, { from: entry.from.map(String), to: entry.to.map(String), basis: entry.basis });
  }

  const optionByQuestion = new Map();
  for (const [id, byKey] of Object.entries(options)) {
    if (!byKey || typeof byKey !== 'object' || !Object.keys(byKey).length) throw new Error(`reviewed-corrections: ${id} option correction is empty`);
    const repaired = new Map();
    for (const [key, entry] of Object.entries(byKey)) {
      if (typeof entry?.from !== 'string' || typeof entry?.to !== 'string') throw new Error(`reviewed-corrections: ${id} ${key} option correction needs string from/to`);
      if (entry.from === entry.to) throw new Error(`reviewed-corrections: ${id} ${key} option correction changes nothing`);
      repaired.set(key, { from: entry.from, to: entry.to });
    }
    optionByQuestion.set(id, repaired);
  }

  const explanationById = new Map();
  const explanationSource = explanations?.explanations || {};
  for (const [id, entry] of Object.entries(explanationSource)) {
    if (!entry || typeof entry !== 'object') throw new Error(`reviewed-explanations: ${id} has no explanation object`);
    if (!String(entry.correct_reasoning || '').trim()) throw new Error(`reviewed-explanations: ${id} has no correct_reasoning`);
    explanationById.set(id, entry);
  }
  const rewrittenSet = new Set(rewritten);
  if (rewrittenSet.size !== rewritten.length) throw new Error('reviewed-corrections: narrative_rewritten has duplicates');
  const missingProse = [...rewrittenSet].filter((id) => !explanationById.has(id)).sort();
  const undeclaredProse = keysOf(explanationSource).filter((id) => !rewrittenSet.has(id));
  if (missingProse.length) throw new Error(`reviewed-explanations: no reviewed prose for declared rewrite(s) ${missingProse.join(', ')}`);
  if (undeclaredProse.length) throw new Error(`reviewed-explanations: prose exists but is not declared in narrative_rewritten: ${undeclaredProse.join(', ')}`);

  const disputeById = new Map();
  for (const [id, entry] of Object.entries(disputes?.disputes || {})) {
    if (!entry || entry.is_disputed !== true) throw new Error(`reviewed-disputes: ${id} is not a dispute block`);
    disputeById.set(id, entry);
  }

  // An answer correction and a reviewed explanation must agree about the key: a
  // corrected question whose option rows still tick the old letter would teach
  // both answers at once.
  for (const [id, entry] of answerById) {
    const prose = explanationById.get(id);
    if (!prose?.option_explanations) continue;
    const flagged = prose.option_explanations.filter((row) => row.is_correct === true).map((row) => row.key).sort();
    if (!same(flagged, entry.to.slice().sort())) {
      throw new Error(`reviewed-corrections: ${id} corrected key ${entry.to.join(',')} disagrees with the explanation's correct options ${flagged.join(',')}`);
    }
  }

  return {
    version: corrections.version ?? null,
    answers: answerById,
    options: optionByQuestion,
    explanations: explanationById,
    rewrittenIds: rewrittenSet,
    completeIds: new Set(complete),
    disputes: disputeById,
  };
}

/**
 * Apply a parsed correction bundle to an intake (in place, on the caller's copy).
 * Returns a summary that the pipeline reports and the tests assert on.
 */
export function applyReviewedCorrections(intake, bundle, opts = {}) {
  // Questions handled by another pass (the app-authored model questions, which are
  // appended after sanitisation in their final form) are deferred, not skipped:
  // `applyDeferredCorrections` has to find and confirm every one of them later.
  const deferIds = opts.deferIds instanceof Set ? opts.deferIds : new Set(opts.deferIds || []);
  if (!intake || !Array.isArray(intake.questions)) throw new Error('reviewed-corrections: the intake has no questions');
  const byId = new Map();
  for (const question of intake.questions) {
    if (byId.has(question.id)) throw new Error(`reviewed-corrections: duplicate question id ${question.id} in the intake`);
    byId.set(question.id, question);
  }
  const requireQuestion = (id, kind) => {
    const question = byId.get(id);
    if (!question) throw new Error(`reviewed-corrections: ${kind} names ${id}, which is not in the intake`);
    return question;
  };

  const applied = { answers: [], options: [], explanations: [], disputes: [] };
  const alreadyApplied = { answers: [], options: [], explanations: [], disputes: [] };
  const deferred = { answers: [], options: [], explanations: [], disputes: [] };
  const rejected = [];
  const notes = [];

  // 1. corrected answer keys
  for (const id of keysOf(Object.fromEntries(bundle.answers))) {
    const entry = bundle.answers.get(id);
    if (deferIds.has(id)) { deferred.answers.push(id); continue; }
    const question = requireQuestion(id, 'an answer correction');
    const current = (question.supplied_answer?.answer || []).map(String);
    if (same(current, entry.to)) {
      alreadyApplied.answers.push(id);
      continue;
    }
    if (!same(current, entry.from)) {
      rejected.push({ id, kind: 'answer', reason: `stored answer ${current.join(',') || '(none)'} matches neither the printed key ${entry.from.join(',')} nor the corrected key ${entry.to.join(',')}` });
      continue;
    }
    question.supplied_answer = { ...(question.supplied_answer || {}), answer: entry.to.slice() };
    applied.answers.push({ id, printed_answer: entry.from.slice(), answer: entry.to.slice(), basis: entry.basis });
  }

  // 2. repaired option texts
  for (const id of keysOf(Object.fromEntries(bundle.options))) {
    const repaired = bundle.options.get(id);
    if (deferIds.has(id)) { deferred.options.push(id); continue; }
    const question = requireQuestion(id, 'an option correction');
    const options = question.language_variants?.en?.options || [];
    let touched = 0;
    for (const key of [...repaired.keys()].sort()) {
      const entry = repaired.get(key);
      const option = options.find((o) => o.key === key);
      if (!option) {
        rejected.push({ id, kind: 'option', key, reason: `option ${key} does not exist` });
        continue;
      }
      if (option.text === entry.to) {
        alreadyApplied.options.push(`${id}:${key}`);
        touched += 1;
        continue;
      }
      if (option.text !== entry.from) {
        rejected.push({ id, kind: 'option', key, reason: `option ${key} reads ${JSON.stringify(option.text)}, which is neither the printed text nor the repair` });
        continue;
      }
      option.text = entry.to;
      applied.options.push({ id, key, printed_text: entry.from, text: entry.to });
      touched += 1;
    }
    if (!touched) notes.push(`option correction ${id} changed nothing`);
  }

  // 3. reviewed explanation prose
  for (const id of [...bundle.explanations.keys()].sort()) {
    if (deferIds.has(id)) { deferred.explanations.push(id); continue; }
    const question = requireQuestion(id, 'a reviewed explanation');
    const entry = clone(bundle.explanations.get(id));
    if (same(question.explanation, entry)) {
      alreadyApplied.explanations.push(id);
      continue;
    }
    question.explanation = entry;
    applied.explanations.push(id);
  }

  // 4. dispute blocks
  for (const id of [...bundle.disputes.keys()].sort()) {
    if (deferIds.has(id)) { deferred.disputes.push(id); continue; }
    const question = requireQuestion(id, 'a dispute block');
    const entry = clone(bundle.disputes.get(id));
    if (same(question.dispute, entry)) {
      alreadyApplied.disputes.push(id);
      continue;
    }
    question.dispute = entry;
    applied.disputes.push(id);
  }

  // 5. declarations that carry no payload of their own still have to name real
  //    questions, so a stale manifest line cannot survive unnoticed.
  const orphanDeclarations = [];
  for (const id of [...bundle.rewrittenIds].sort()) {
    if (!byId.has(id) && !deferIds.has(id)) orphanDeclarations.push(`narrative_rewritten:${id}`);
  }
  for (const id of [...bundle.completeIds].sort()) {
    if (!byId.has(id) && !deferIds.has(id)) orphanDeclarations.push(`option_reasoning_complete:${id}`);
  }
  const orphanAnswers = [...bundle.answers.keys()].filter((id) => !byId.has(id) && !deferIds.has(id));
  const orphanOptions = [...bundle.options.keys()].filter((id) => !byId.has(id) && !deferIds.has(id));
  const orphanDisputes = [...bundle.disputes.keys()].filter((id) => !byId.has(id) && !deferIds.has(id));
  for (const id of orphanAnswers) orphanDeclarations.push(`answer_corrections:${id}`);
  for (const id of orphanOptions) orphanDeclarations.push(`option_corrections:${id}`);
  for (const id of orphanDisputes) orphanDeclarations.push(`disputes:${id}`);
  if (orphanDeclarations.length) {
    throw new Error(`reviewed-corrections: declared entries with no matching question: ${orphanDeclarations.join(', ')}`);
  }

  const summary = {
    files: opts.files || null,
    manifest_version: bundle.version,
    applied: {
      answers: applied.answers.length,
      options: applied.options.length,
      explanations: applied.explanations.length,
      disputes: applied.disputes.length,
    },
    already_applied: {
      answers: alreadyApplied.answers.length,
      options: alreadyApplied.options.length,
      explanations: alreadyApplied.explanations.length,
      disputes: alreadyApplied.disputes.length,
    },
    deferred,
    rejected,
    declared: {
      answer_corrections: bundle.answers.size,
      option_corrections: bundle.options.size,
      narrative_rewritten: bundle.rewrittenIds.size,
      option_reasoning_complete: bundle.completeIds.size,
      disputes: bundle.disputes.size,
    },
    answers: applied.answers,
    options: applied.options,
    notes,
  };
  summary.ok = rejected.length === 0;
  summary.reconciled = summary.applied.answers + summary.already_applied.answers === summary.declared.answer_corrections
    && summary.applied.options + summary.already_applied.options + summary.deferred.options.length === summary.declared.option_corrections
    && summary.applied.explanations + summary.already_applied.explanations + summary.deferred.explanations.length === summary.declared.narrative_rewritten
    && summary.applied.disputes + summary.already_applied.disputes + summary.deferred.disputes.length === summary.declared.disputes;
  return summary;
}

/** Apply the 29 app-authored model questions to a built bank (in place). */
export function applyModelQuestions(bank, bundle) {
  const questions = bundle?.questions || [];
  if (!questions.length) throw new Error('model-questions: the file declares no questions');
  const present = new Set(bank.questions.map((q) => q.id));
  const paperById = new Map(bank.papers.map((p) => [p.paper_id, p]));
  const added = [];
  const already = [];
  for (const question of questions) {
    if (present.has(question.id)) {
      already.push(question.id);
      continue;
    }
    const paper = paperById.get(question.paper_id);
    if (!paper) throw new Error(`model-questions: ${question.id} names paper ${question.paper_id}, which the bank does not contain`);
    if (question.metadata?.model_question !== true) throw new Error(`model-questions: ${question.id} is not flagged as a model question`);
    bank.questions.push(structuredClone(question));
    present.add(question.id);
    added.push(question.id);
  }
  // Put the bank back in its canonical order: papers as declared, then question
  // number inside each paper. An appended record therefore lands at its own
  // number instead of at the end of the file, and two rebuilds agree exactly.
  const paperIndex = new Map(bank.papers.map((paper, index) => [paper.paper_id, index]));
  bank.questions.sort((a, b) => {
    const left = paperIndex.get(a.paper_id) ?? Number.MAX_SAFE_INTEGER;
    const right = paperIndex.get(b.paper_id) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return (a.question_number ?? 0) - (b.question_number ?? 0);
  });
  // Rebuild each affected paper's order from question numbers so an inserted
  // record lands at its own number instead of at the end of the list.
  for (const paper of bank.papers) {
    const ids = bank.questions
      .filter((q) => q.paper_id === paper.paper_id)
      .sort((a, b) => (a.question_number ?? 0) - (b.question_number ?? 0))
      .map((q) => q.id);
    if (ids.length) paper.question_order = ids;
  }
  return { added, already, total: questions.length };
}

/**
 * Confirm the corrections that were deferred to the model-question pass. Every
 * deferred entry must be applied to a record that exists by then; a mismatch is
 * an error, so nothing can be dropped between the two passes.
 */
export function applyDeferredCorrections(questions, deferred, bundle) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const applied = { answers: [], options: [], explanations: [], disputes: [] };
  const problems = [];
  const requireQuestion = (id, kind) => {
    const question = byId.get(id);
    if (!question) problems.push(`${kind} ${id}: the deferred record is not in the bank`);
    return question;
  };
  for (const id of deferred.answers || []) {
    const question = requireQuestion(id, 'answer correction');
    if (!question) continue;
    const entry = bundle.answers.get(id);
    question.supplied_answer = { ...(question.supplied_answer || {}), answer: entry.to.slice() };
    applied.answers.push(id);
  }
  for (const id of deferred.options || []) {
    const question = requireQuestion(id, 'option correction');
    if (!question) continue;
    for (const [key, entry] of bundle.options.get(id)) {
      const option = (question.language_variants?.en?.options || []).find((o) => o.key === key);
      if (!option) { problems.push(`option correction ${id} ${key}: the option does not exist`); continue; }
      option.text = entry.to;
    }
    applied.options.push(id);
  }
  for (const id of deferred.explanations || []) {
    const question = requireQuestion(id, 'reviewed explanation');
    if (!question) continue;
    question.explanation = structuredClone(bundle.explanations.get(id));
    applied.explanations.push(id);
  }
  for (const id of deferred.disputes || []) {
    const question = requireQuestion(id, 'dispute block');
    if (!question) continue;
    question.dispute = structuredClone(bundle.disputes.get(id));
    applied.disputes.push(id);
  }
  return { applied, problems };
}
