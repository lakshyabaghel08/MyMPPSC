/**
 * marking.js — the MPPSC marking schemes the app applies automatically.
 *
 * Why this file exists
 * --------------------
 * A full-paper simulation must be scored with the rules that applied to *that*
 * paper. Asking the user to type marks and penalties for every paper invites
 * mistakes, and copying a rule block onto every question would make a pattern
 * change impossible to apply consistently. So the schemes live here, once, and
 * every part of the system reads from them:
 *
 *   - the pipeline (tools/classify/sanitise-bank.mjs, which builds the bank the
 *     app loads) writes the matching scheme into each paper in the JSON;
 *   - js/services/scoring.js uses the scheme as the automatic fallback when a
 *     stored paper does not carry usable rules of its own (for example a bank
 *     built before this module existed, or a bank from an older schema);
 *   - the UI shows which scheme was used through `describeScheme`.
 *
 * How a scheme is selected
 * ------------------------
 * `resolveMppscMarkingScheme({ exam, year, paperCode })` matches on the exam
 * (a State Service Preliminary paper), the exam year and, where a scheme
 * differs per paper, the paper code. A year with no scheme coverage returns
 * `null`: the app then refuses to invent rules and asks for configuration
 * (docs/MARKING.md lists the coverage and its caveats).
 *
 * Evidence
 * --------
 * The scheme carries its reported evidence and a separate product-policy note;
 * applying a current pattern to old papers must not be described as historical evidence.
 *
 *  - Latest-pattern practice for every bundled year (2013 onward): +3 for a
 *    correct answer, −1 for a wrong answer, 0 for unanswered, 100 questions
 *    and 300 marks in 120 minutes. At the user's direction, the latest reported
 *    pattern is applied uniformly to past papers; this is not a claim that the
 *    same rules were historically in force for every year.
 *
 * If MPPSC changes the pattern again, add one entry to MPPSC_MARKING_SCHEMES and
 * nothing else: the pipeline, the scorer and the UI all follow it.
 */

/** Exam families this module knows about. Matching is case-insensitive. */
export const MPPSC_PRELIMS_EXAM = 'MPPSC State Service Preliminary Examination';

/** Paper code used for the General Studies paper (the app's GS-I). */
export const MPPSC_PRELIMS_GS_PAPER = 'GS-I';
/** Paper code used for the General Aptitude (CSAT) paper. */
export const MPPSC_PRELIMS_APTITUDE_PAPER = 'GS-II';

export const SCHEME_SOURCE_BUILTIN = 'mppsc_builtin';

/**
 * The scheme's `appliesFrom` / `appliesTo` are inclusive exam years; `null`
 * means "open-ended".
 */
export const MPPSC_MARKING_SCHEMES = Object.freeze([
  Object.freeze({
    id: 'mppsc-sse-prelims-latest-practice',
    label: 'MPPSC latest prelims pattern (uniform practice scoring)',
    appliesFrom: 2013,
    appliesTo: null,
    exam_match: ['mppsc state service preliminary', 'mppsc prelims', 'mppsc state service'],
    marks_per_correct: 3,
    negative_marks_per_incorrect: 1,
    negative_marking_enabled: true,
    marks_for_unanswered: 0,
    duration_minutes: 120,
    original_question_count: 100,
    total_marks: 300,
    per_paper: {
      'GS-I': { marks_per_correct: 3, total_marks: 300, original_question_count: 100 },
      'GS-II': { marks_per_correct: 3, total_marks: 300, original_question_count: 100 },
    },
    qualifying: Object.freeze({
      paper_code: 'GS-II',
      percent: 33,
      reserved_percent: null,
      note: 'Paper-II (General Aptitude/CSAT) is qualifying in the latest reported pattern (33%). It does not affect the scoring of Paper-I.',
      confidence: 'reported',
    }),
    source: 'Latest reported MPPSC State Service preliminary pattern: 3 marks per correct answer and 1 mark deducted per wrong answer; 100 questions × 3 marks = 300 marks in 120 minutes. This rule is deliberately applied to all 2013-onward practice papers by product policy, not asserted as each year’s historical rule.',
    evidence: Object.freeze([
      'Free Press Journal, 14 April 2026 — "one-third mark will be deducted for every wrong answer … each correct answer carries three marks" (3R−1W model).',
      'Dainik Bhaskar English, 26 April 2026 — negative marking introduced in the 2026 preliminary examination: one-third of the marks deducted per wrong answer.',
      'Published 2026 pattern tables list each preliminary paper as 100 questions / 300 marks: 100 × 3 marks.',
    ]),
    confidence: 'reported',
    application_note: 'By user direction, the current/latest pattern is applied uniformly to the 2013–2024 archive for practice scoring. This must not be described as evidence about historical rules.',
  }),
]);

const norm = (v) => String(v ?? '').trim().toLowerCase();

/** Does this paper look like an MPPSC preliminary paper? */
export function isMppscPrelimsPaper(paper = {}) {
  const hay = `${norm(paper.exam)} ${norm(paper.paper_name)}`;
  if (!hay.trim() || hay.includes('demonstration')) return false;
  return hay.includes('mppsc') || hay.includes('madhya pradesh public service commission');
}

/** All schemes that could apply to a paper, newest first. */
export function candidateSchemes(paper = {}) {
  const examHay = `${norm(paper.exam)} ${norm(paper.paper_name)}`;
  return MPPSC_MARKING_SCHEMES.filter((scheme) => {
    if (!scheme.exam_match?.length) return true;
    return scheme.exam_match.some((needle) => examHay.includes(needle)) || examHay.includes('mppsc') || examHay.includes('madhya pradesh public service commission');
  });
}

/**
 * Resolve the scheme that applies to a paper.
 * @returns {object|null} the scheme (with `rules` and `paper_defaults` helpers), or null when no year window matches.
 */
export function resolveMppscMarkingScheme(paper = {}) {
  const year = Number(paper.year);
  if (!Number.isFinite(year)) return null;
  if (!isMppscPrelimsPaper(paper)) return null;
  const matches = candidateSchemes(paper).filter(
    (scheme) => year >= scheme.appliesFrom && (scheme.appliesTo === null || year <= scheme.appliesTo),
  );
  if (!matches.length) return null;
  matches.sort((a, b) => b.appliesFrom - a.appliesFrom);
  const scheme = matches[0];
  const code = paper.paper_code ? String(paper.paper_code).toUpperCase() : null;
  const perPaper = code && scheme.per_paper ? scheme.per_paper[code] || null : null;
  const marksPerCorrect = perPaper?.marks_per_correct ?? scheme.marks_per_correct;
  const scale = scheme.marks_per_correct ? marksPerCorrect / scheme.marks_per_correct : 1;
  return {
    ...scheme,
    paper_code: code,
    marks_per_correct: marksPerCorrect,
    negative_marks_per_incorrect: scheme.negative_marking_enabled ? scheme.negative_marks_per_incorrect * scale : 0,
    total_marks: perPaper?.total_marks ?? scheme.total_marks,
    original_question_count: perPaper?.original_question_count ?? scheme.original_question_count,
    qualifying: scheme.qualifying && (!code || scheme.qualifying.paper_code === code) ? scheme.qualifying : null,
  };
}

/** The scheme's scoring block in the shape a paper record uses. */
export function schemeScoring(scheme) {
  if (!scheme) return null;
  return {
    rules_known: true,
    marks_per_correct: scheme.marks_per_correct,
    negative_marks_per_incorrect: scheme.negative_marking_enabled ? Math.abs(scheme.negative_marks_per_incorrect) : 0,
    negative_marking_enabled: Boolean(scheme.negative_marking_enabled),
    marks_for_unanswered: scheme.marks_for_unanswered || 0,
    rules_source: `${scheme.label} — ${scheme.source}`,
    notes: null,
    scheme_id: scheme.id,
  };
}

/** Rules in the shape js/services/scoring.js consumes. */
export function schemeRules(scheme) {
  if (!scheme) return null;
  return {
    marks_per_correct: scheme.marks_per_correct,
    negative_marks_per_incorrect: scheme.negative_marking_enabled ? Math.abs(scheme.negative_marks_per_incorrect) : 0,
    negative_marking_enabled: Boolean(scheme.negative_marking_enabled),
    marks_for_unanswered: scheme.marks_for_unanswered || 0,
  };
}

/** One plain-language line naming the scheme and its rules. */
export function describeScheme(scheme) {
  if (!scheme) return null;
  const bits = [`${scheme.label}: +${scheme.marks_per_correct} per correct`];
  bits.push(scheme.negative_marking_enabled ? `−${scheme.negative_marks_per_incorrect} per incorrect` : 'no negative marking');
  bits.push(`${scheme.marks_for_unanswered || 0} for unanswered`);
  if (scheme.total_marks) bits.push(`${scheme.total_marks} marks in ${scheme.duration_minutes || '—'} minutes`);
  return bits.join(', ');
}

/** The scheme id that applies to a paper, or null. Used by the pipeline and tests. */
export function schemeIdForPaper(paper = {}) {
  const scheme = resolveMppscMarkingScheme(paper);
  return scheme ? scheme.id : null;
}
