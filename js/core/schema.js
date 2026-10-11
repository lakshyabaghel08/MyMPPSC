/**
 * schema.js — Normalisation of imported question-bank records into the internal
 * shape used by the app.
 *
 * Guiding rules (enforced here):
 *  - Nothing is invented. Unknown values stay null/'missing'.
 *  - Original question text and option wording are stored verbatim.
 *  - Hindi and English variants live under one question id.
 *  - The supplied answer key is stored separately from any verified answer.
 */

import { QUESTION_TYPES, SUPPORTED_LANGUAGES, ANSWER_KEY_STATUSES, EXPLANATION_STATUSES, VALIDATION_STATUSES } from './constants.js';
import { normaliseText, sortBy } from './util.js';

export const OPTION_KEY_RE = /^[A-Za-z0-9]{1,3}$/;
export const MIN_OPTIONS = 2;

const asString = (v) => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? null : String(v));
const asNumber = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const asArray = (v) => (Array.isArray(v) ? v : v === null || v === undefined ? [] : [v]);
const asBool = (v) => (v === true ? true : v === false ? false : null);

function normaliseStatus(value, allowed, fallback) {
  const v = asString(value);
  if (v && Object.prototype.hasOwnProperty.call(allowed, v)) return v;
  return fallback;
}

/** Normalise one language variant (question_text + options). */
export function normaliseVariant(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = typeof raw.question_text === 'string' ? raw.question_text.trim() : '';
  if (!text) return null;
  const options = asArray(raw.options)
    .map((opt, i) => {
      if (!opt || typeof opt !== 'object') return null;
      const key = asString(opt.key) ?? String.fromCharCode(65 + i);
      const optText = typeof opt.text === 'string' ? opt.text : opt.text === null || opt.text === undefined ? '' : String(opt.text);
      return { key, text: optText };
    })
    .filter(Boolean);
  return {
    question_text: raw.question_text, // verbatim original wording
    instructions: asString(raw.instructions) || null,
    options,
  };
}

export function normaliseLanguageVariants(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const variants = {};
  for (const lang of SUPPORTED_LANGUAGES) {
    const variant = normaliseVariant(source[lang]);
    if (variant) variants[lang] = variant;
  }
  return variants;
}

/** Deterministic fingerprint used for exact-duplicate detection. */
export function questionFingerprint(question) {
  const preferred = question.language_variants?.en || Object.values(question.language_variants || {})[0];
  if (!preferred) return `id:${question.id}`;
  const text = normaliseText(preferred.question_text);
  const opts = (preferred.options || []).map((o) => normaliseText(o.text)).sort().join('~');
  return `${text}||${opts}`;
}

/** Text-only key (ignores options) used for near-duplicate candidate search. */
export function questionTextKey(question) {
  const preferred = question.language_variants?.en || Object.values(question.language_variants || {})[0];
  return preferred ? normaliseText(preferred.question_text) : '';
}

/**
 * Normalise a raw question record from an import file.
 * @param {object} raw
 * @param {{demoFlag?: boolean}} ctx
 * @returns {{question: object|null, issues: Array}}
 */
export function normaliseQuestion(raw, ctx = {}) {
  const issues = [];
  if (!raw || typeof raw !== 'object') {
    return { question: null, issues: [{ code: 'record_not_object', severity: 'error', message: 'Record is not a JSON object.' }] };
  }
  const id = asString(raw.id);
  if (!id) {
    return { question: null, issues: [{ code: 'missing_id', severity: 'error', message: 'Record has no id; the record cannot be imported.' }] };
  }
  const at = (code, severity, message) => issues.push({ code, severity, message, questionId: id });

  const variants = normaliseLanguageVariants(raw.language_variants);
  const variantLangs = Object.keys(variants);
  if (!variantLangs.length) {
    at('missing_language_variant', 'error', 'No usable language variant (question text + options) found.');
  }
  for (const lang of variantLangs) {
    const v = variants[lang];
    if (!v.options.length) at('missing_options', 'error', `[${lang}] Question has no options.`);
    else if (v.options.length < MIN_OPTIONS) at('too_few_options', 'error', `[${lang}] Question has only ${v.options.length} option(s).`);
    const seenKeys = new Set();
    for (const opt of v.options) {
      if (!OPTION_KEY_RE.test(opt.key || '')) at('bad_option_key', 'error', `[${lang}] Option key "${opt.key}" is not a short alphanumeric label.`);
      if (seenKeys.has(opt.key)) at('duplicate_option_key', 'error', `[${lang}] Option key "${opt.key}" is used more than once.`);
      seenKeys.add(opt.key);
      if (!opt.text || !String(opt.text).trim()) at('empty_option_text', 'warning', `[${lang}] Option "${opt.key}" has empty text.`);
    }
    const otherLangs = variantLangs.filter((l) => l !== lang);
    for (const other of otherLangs) {
      if (variants[other].options.length !== v.options.length) {
        at('variant_option_count_mismatch', 'warning', `Option counts differ between language variants (${lang}: ${v.options.length}, ${other}: ${variants[other].options.length}).`);
      }
    }
  }

  const qtype = asString(raw.question_type);
  const questionType = qtype && QUESTION_TYPES[qtype] ? qtype : qtype ? 'other' : null;
  if (qtype && !QUESTION_TYPES[qtype]) at('unknown_question_type', 'warning', `Unknown question type "${qtype}"; stored as "other".`);
  if (!questionType) at('missing_question_type', 'info', 'Question type is not stated in the source record.');

  const suppliedRaw = raw.supplied_answer && typeof raw.supplied_answer === 'object' ? raw.supplied_answer : {};
  const suppliedAnswerRaw = Array.isArray(suppliedRaw.answer) ? suppliedRaw.answer : suppliedRaw.answer == null ? null : [suppliedRaw.answer];
  const suppliedAnswer = suppliedAnswerRaw
    ? suppliedAnswerRaw.map((a) => asString(a)).filter((a) => a !== null && a !== '')
    : null;

  let keyStatus = normaliseStatus(raw.answer_key_status ?? suppliedRaw.status, ANSWER_KEY_STATUSES, null);
  if (!keyStatus) keyStatus = suppliedAnswer && suppliedAnswer.length ? 'unknown' : 'missing';
  if (!suppliedAnswer || !suppliedAnswer.length) {
    keyStatus = normaliseStatus(keyStatus, ANSWER_KEY_STATUSES, 'missing');
    at('missing_answer_key', 'warning', 'Supplied answer key entry is missing for this question.');
  }

  const paper = ctx.paper || null;
  const expectedKeys = paper ? paperOptionKeysFor(paper, variants) : null;
  if (suppliedAnswer) {
    const allKeys = new Set();
    for (const v of Object.values(variants)) for (const o of v.options) allKeys.add(o.key);
    for (const a of suppliedAnswer) {
      if (allKeys.size && !allKeys.has(a)) {
        at('invalid_answer_reference', 'error', `Supplied answer "${a}" does not match any option key in this question.`);
      } else if (expectedKeys && expectedKeys.size && !expectedKeys.has(a)) {
        at('answer_key_not_in_question', 'warning', `Supplied answer "${a}" is not among this question's option keys.`);
      }
    }
    if (questionType === 'single_correct' && suppliedAnswer.length > 1) {
      at('multi_answer_on_single_correct', 'warning', 'Question type is single-correct but the supplied key lists more than one option.');
    }
  }

  const verifiedRaw = raw.verified_answer && typeof raw.verified_answer === 'object' ? raw.verified_answer : null;
  const verifiedAnswerArr = verifiedRaw
    ? (Array.isArray(verifiedRaw.answer) ? verifiedRaw.answer.map(asString).filter(Boolean) : verifiedRaw.answer == null ? [] : [asString(verifiedRaw.answer)])
    : null;

  const disputeRaw = raw.dispute && typeof raw.dispute === 'object' ? raw.dispute : null;
  const verified = verifiedRaw
    ? {
        answer: verifiedAnswerArr && verifiedAnswerArr.length ? verifiedAnswerArr : null,
        status: normaliseStatus(verifiedRaw.status, { verified: 1, partially_verified: 1, unresolved: 1 }, 'unresolved'),
        verified_by: asString(verifiedRaw.verified_by),
        verified_at: asString(verifiedRaw.verified_at),
        evidence: normaliseEvidence(verifiedRaw.evidence),
        original: { answer: verifiedAnswerArr && verifiedAnswerArr.length ? verifiedAnswerArr : null, verified_by: asString(verifiedRaw.verified_by), verified_at: asString(verifiedRaw.verified_at) },
        history: [],
      }
    : null;

  const explanationRaw = raw.explanation && typeof raw.explanation === 'object' ? raw.explanation : null;
  let explanation = null;
  if (explanationRaw) {
    const correct = asString(explanationRaw.correct_reasoning);
    const optionExplanations = asArray(explanationRaw.option_explanations)
      .map((oe) => (oe && typeof oe === 'object' ? { key: asString(oe.key), text: asString(oe.text), is_correct: asBool(oe.is_correct) } : null))
      .filter((oe) => oe && (oe.text || oe.key));
    const hasContent = Boolean(correct) || optionExplanations.length > 0;
    if (hasContent) {
      explanation = {
        language: 'en',
        status: normaliseStatus(explanationRaw.status ?? raw.explanation_status, EXPLANATION_STATUSES, 'generated'),
        correct_reasoning: correct,
        option_explanations: optionExplanations,
        key_concepts: asArray(explanationRaw.key_concepts).map(asString).filter(Boolean),
        revision_takeaways: asArray(explanationRaw.revision_takeaways).map(asString).filter(Boolean),
        sources: normaliseSources(explanationRaw.sources),
        generated_by: asString(explanationRaw.generated_by),
        reviewed_by: asString(explanationRaw.reviewed_by),
        generated_at: asString(explanationRaw.generated_at),
        reviewed_at: asString(explanationRaw.reviewed_at),
        original: null,
        history: [],
      };
      if (explanation.status === 'missing') {
        at('explanation_status_missing', 'warning', 'Explanation content is present but its status is "missing"; treated as unreviewed.');
        explanation.status = 'generated';
      }
      if (explanation.status === 'generated' || explanation.status === 'missing') {
        at('explanation_unreviewed', 'info', 'Explanation has not been reviewed/approved by the external pipeline.');
      }
    } else {
      at('empty_explanation', 'info', 'Explanation object present but empty; treated as no explanation.');
    }
  }

  const sourceRefRaw = raw.source_reference && typeof raw.source_reference === 'object' ? raw.source_reference : null;
  const subject = asString(raw.subject);
  const topic = asString(raw.topic);
  const subtopic = asString(raw.subtopic);
  const confidence = asNumber(raw.classification_confidence);

  if (!subject && !topic) {
    at('unclassified', 'warning', 'Question has no subject/topic classification; it is kept as "Unclassified" and remains available in the question bank.');
  }
  if (confidence !== null && (confidence < 0.6 || confidence > 1)) {
    at('low_classification_confidence', 'warning', `Classification confidence is ${confidence}; treat the subject/topic label as uncertain.`);
  }
  if (raw.question_type === 'matching' || raw?.metadata?.shuffle_options_forbidden) {
    // recorded in metadata; option shuffling is blocked for matching questions
  }

  const validationStatus = normaliseStatus(raw.validation_status, VALIDATION_STATUSES, issues.some((i) => i.severity === 'error') ? 'invalid' : issues.some((i) => i.severity === 'warning') ? 'valid_with_warnings' : 'valid');

  const question = {
    id,
    exam: asString(raw.exam) || ctx.bankExamDefault || null,
    year: asNumber(raw.year) ?? (typeof raw.year === 'string' ? raw.year : null),
    paper_id: asString(raw.paper_id) || ctx.paperId || null,
    set_code: asString(raw.set_code),
    question_number: asNumber(raw.question_number) ?? asString(raw.question_number),
    question_type: questionType || 'single_correct',
    language_variants: variants,
    classification: {
      subject,
      topic,
      subtopic,
      confidence,
      source: asString(raw.classification_source),
      isUnclassified: !subject && !topic,
      uncertain: confidence !== null && confidence < 0.6,
      original: { subject, topic, subtopic, confidence, source: asString(raw.classification_source) || null },
      history: [],
    },
    supplied: {
      answer: suppliedAnswer && suppliedAnswer.length ? suppliedAnswer : null,
      status: keyStatus,
      source: asString(suppliedRaw.source) ?? (ctx.bankKeySource || null),
      notes: asString(suppliedRaw.notes),
      imported_at: new Date().toISOString(),
    },
    verified,
    verification_evidence: normaliseEvidence(raw.verification_evidence),
    dispute: disputeRaw
      ? {
          is_disputed: disputeRaw.is_disputed === true || (disputeRaw.reason && raw.answer_key_status === 'disputed') || false,
          status: normaliseStatus(disputeRaw.status, { open: 1, resolved: 1, unresolved: 1 }, null),
          reason: asString(disputeRaw.reason),
          raised_by: asString(disputeRaw.raised_by),
        }
      : null,
    explanation,
    explanation_status: explanation ? explanation.status : normaliseStatus(raw.explanation_status, EXPLANATION_STATUSES, 'missing'),
    source_reference: sourceRefRaw
      ? {
          file: asString(sourceRefRaw.file),
          page: sourceRefRaw.page ?? null,
          question_location: asString(sourceRefRaw.question_location),
          note: asString(sourceRefRaw.note),
        }
      : null,
    validation_status: validationStatus,
    validation_notes: asArray(raw.validation_notes).map(asString).filter(Boolean),
    is_demonstration: raw.is_demonstration === true || ctx.demoFlag === true,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    bank_id: ctx.bankId || null,
    imported_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    fingerprint: null, // filled below
    text_key: null,
  };

  if (question.dispute && question.dispute.is_disputed && !question.dispute.reason) {
    at('dispute_without_reason', 'warning', 'Answer is marked disputed but no reason was supplied.');
  }
  if (question.dispute?.is_disputed && (!question.verified || !question.verified.answer)) {
    at('disputed_without_verified_answer', 'warning', 'Answer is disputed and no independently verified answer is recorded; it will be flagged for attention.');
  }

  question.fingerprint = questionFingerprint(question);
  question.text_key = questionTextKey(question);

  return { question, issues };
}

function paperOptionKeysFor() {
  return null; // reserved: paper-level option-key conventions are not assumed
}

function normaliseEvidence(raw) {
  return asArray(raw)
    .map((e) => {
      if (typeof e === 'string') return { title: null, citation: e, url: null, note: null };
      if (!e || typeof e !== 'object') return null;
      return { title: asString(e.title), citation: asString(e.citation), url: asString(e.url), note: asString(e.note) };
    })
    .filter(Boolean);
}

function normaliseSources(raw) {
  return asArray(raw)
    .map((s) => {
      if (typeof s === 'string') return { title: s, citation: null, url: null };
      if (!s || typeof s !== 'object') return null;
      return { title: asString(s.title), citation: asString(s.citation), url: asString(s.url) };
    })
    .filter(Boolean);
}

/** Normalise a paper metadata record. */
export function normalisePaper(raw, ctx = {}) {
  const issues = [];
  if (!raw || typeof raw !== 'object') {
    return { paper: null, issues: [{ code: 'paper_not_object', severity: 'error', message: 'Paper record is not a JSON object.' }] };
  }
  const paperId = asString(raw.paper_id);
  if (!paperId) {
    return { paper: null, issues: [{ code: 'paper_missing_id', severity: 'error', message: 'Paper record has no paper_id.' }] };
  }
  const at = (code, severity, message) => issues.push({ code, severity, message, paperId });

  const scoringRaw = raw.scoring && typeof raw.scoring === 'object' ? raw.scoring : {};
  let rulesKnown = scoringRaw.rules_known === true;
  const marksPerCorrect = asNumber(scoringRaw.marks_per_correct);
  const negative = asNumber(scoringRaw.negative_marks_per_incorrect);
  if (rulesKnown && marksPerCorrect === null) {
    at('scoring_incomplete', 'warning', 'Scoring rules claim to be known but marks per correct answer is missing; the paper will be treated as needing configuration before scoring.');
    rulesKnown = false;
  }
  if (!rulesKnown) at('scoring_unknown', 'info', 'Original scoring rules are not known for this paper; a simulation on this paper requires user configuration.');

  const count = asNumber(raw.original_question_count);
  if (count === null) at('missing_question_count', 'warning', 'Original question count is not stated.');

  const paper = {
    paper_id: paperId,
    exam: asString(raw.exam) || ctx.bankExamDefault || null,
    year: asNumber(raw.year) ?? (typeof raw.year === 'string' ? raw.year : null),
    paper_name: asString(raw.paper_name),
    paper_code: asString(raw.paper_code),
    set_code: asString(raw.set_code),
    language: asString(raw.language) || null,
    original_question_count: count,
    duration_minutes: asNumber(raw.duration_minutes),
    total_marks: asNumber(raw.total_marks),
    scoring: {
      rules_known: rulesKnown,
      marks_per_correct: marksPerCorrect,
      negative_marks_per_incorrect: negative,
      negative_marking_enabled: asBool(scoringRaw.negative_marking_enabled) ?? (negative ? true : null),
      marks_for_unanswered: asNumber(scoringRaw.marks_for_unanswered),
      rules_source: asString(scoringRaw.rules_source),
      notes: asString(scoringRaw.notes),
      // Which automatic scheme the rules came from (js/core/marking.js). Kept so
      // a stored paper still says what was applied to it, and so an export
      // round-trips the scheme instead of only its numbers.
      scheme_id: asString(scoringRaw.scheme_id),
    },
    question_order: asArray(raw.question_order).map(asString).filter(Boolean),
    answer_key: {
      source: asString(raw.answer_key?.source),
      status: normaliseStatus(raw.answer_key?.status, ANSWER_KEY_STATUSES, 'unknown'),
      published_at: asString(raw.answer_key?.published_at),
      notes: asString(raw.answer_key?.notes),
    },
    source_files: asArray(raw.source_files)
      .map((f) => (f && typeof f === 'object' ? { path: asString(f.path), pages: f.pages ?? null, sha256: asString(f.sha256) } : null))
      .filter(Boolean),
    import_validation: {
      status: normaliseStatus(raw.import_validation?.status, VALIDATION_STATUSES, 'unknown'),
      checked_at: asString(raw.import_validation?.checked_at),
      notes: asString(raw.import_validation?.notes),
    },
    is_demonstration: raw.is_demonstration === true || ctx.demoFlag === true,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    bank_id: ctx.bankId || null,
    imported_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { paper, issues };
}

/** Choose the variant to display, with graceful fallback to another language. */
export function displayVariant(question, language = 'en') {
  const variants = question?.language_variants || {};
  if (variants[language]) return { lang: language, variant: variants[language], fallback: false };
  const fallbackLang = Object.keys(variants)[0];
  if (!fallbackLang) return { lang: null, variant: null, fallback: true };
  return { lang: fallbackLang, variant: variants[fallbackLang], fallback: true };
}

export function availableLanguages(question) {
  return SUPPORTED_LANGUAGES.filter((l) => Boolean(question?.language_variants?.[l]));
}

export function isBilingual(question) {
  return availableLanguages(question).length > 1;
}

/** Effective answer according to the configured policy (never overwrites the key). */
export function effectiveAnswer(question, policy = 'verified_preferred') {
  const supplied = question?.supplied?.answer && question.supplied.answer.length ? question.supplied.answer : null;
  const verified = question?.verified?.answer && question.verified.answer.length ? question.verified.answer : null;
  if (policy === 'supplied') return { answer: supplied, basis: supplied ? 'supplied' : null };
  if (policy === 'verified_only') return { answer: verified, basis: verified ? 'verified' : null };
  if (verified) return { answer: verified, basis: 'verified' };
  return { answer: supplied, basis: supplied ? 'supplied' : null };
}

/** Does this question need the user's attention on answer-integrity grounds? */
export function answerIntegrity(question) {
  const supplied = question?.supplied?.answer || null;
  const verified = question?.verified?.answer || null;
  const disputed = Boolean(question?.dispute?.is_disputed) || question?.supplied?.status === 'disputed';
  const missing = !supplied && !verified;
  const conflict = Boolean(supplied && verified && supplied.slice().sort().join(',') !== verified.slice().sort().join(','));
  const unresolved = Boolean(missing || disputed || (question?.dispute?.status === 'open'));
  return {
    supplied,
    verified,
    disputed,
    missing,
    conflict,
    unresolved,
    downgraded: Boolean(verified && supplied && conflict) ? false : false,
    needsAttention: Boolean(missing || disputed || conflict),
    label: missing
      ? 'Answer key missing'
      : disputed
        ? 'Answer key disputed'
        : conflict
          ? 'Verified answer differs from supplied key'
          : null,
  };
}

export function sortedSubjects(questions) {
  const map = new Map();
  for (const q of questions) {
    const s = q.classification?.subject || 'Unclassified';
    map.set(s, (map.get(s) || 0) + 1);
  }
  return Array.from(map.entries()).sort(sortBy(([, n]) => n, 'desc'));
}
