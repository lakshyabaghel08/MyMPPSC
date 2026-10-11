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
 * differs per paper, the paper code. A year with no verified scheme returns
 * `null`: the app then refuses to invent rules and asks for configuration
 * (docs/MARKING.md lists exactly which years are covered and which are not).
 *
 * Evidence
 * --------
 * Every scheme carries its evidence in `source` / `evidence` fields. The two
 * schemes below are the paper patterns for the MPPSC State Service Preliminary
 * examination:
 *
 *  - 2019–2025 (the pattern in force for every paper in the bundled bank):
 *    Paper-I General Studies, 100 questions × 2 marks = 200 marks, 120 minutes,
 *    **no negative marking**, 0 for unanswered.
 *  - 2026 onwards: MPPSC introduced negative marking in the preliminary
 *    examination for the first time in 2026 — each correct answer carries
 *    3 marks and one-third of that (1 mark) is deducted for a wrong answer;
 *    100 questions × 3 marks = 300 marks per paper.
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
 * The schemes. `appliesFrom` / `appliesTo` are inclusive exam years; `null`
 * means "open-ended". Order does not matter — the resolver checks the year
 * window and picks the scheme whose window contains the paper's year.
 */
export const MPPSC_MARKING_SCHEMES = Object.freeze([
  Object.freeze({
    id: 'mppsc-sse-prelims-2019-2025',
    label: 'MPPSC State Service Prelims 2019–2025 pattern',
    appliesFrom: 2019,
    appliesTo: 2025,
    exam_match: ['mppsc state service preliminary', 'mppsc prelims', 'mppsc state service'],
    marks_per_correct: 2,
    negative_marks_per_incorrect: 0,
    negative_marking_enabled: false,
    marks_for_unanswered: 0,
    duration_minutes: 120,
    original_question_count: 100,
    total_marks: 200,
    per_paper: {
      'GS-I': { marks_per_correct: 2, total_marks: 200, original_question_count: 100 },
      'GS-II': { marks_per_correct: 2, total_marks: 200, original_question_count: 100 },
    },
    qualifying: Object.freeze({
      paper_code: 'GS-II',
      percent: 40,
      reserved_percent: 30,
      note: 'Paper-II (General Aptitude/CSAT) is qualifying; the 2019 and later notifications state a minimum of 40% (30% for reserved categories). It does not affect the scoring of Paper-I.',
      confidence: 'reported',
    }),
    source: 'MPPSC State Service Preliminary examination pattern for the 2019–2025 cycles: Paper-I General Studies 100 questions × 2 marks = 200 marks in 120 minutes, no negative marking.',
    evidence: Object.freeze([
      'MPPSC 2019 State Service notification summary — Paper-I General Studies 200 marks, 10:00–12:00; Paper-II CSAT qualifying; "no negative marking".',
      'MPPSC preliminary pattern descriptions for the 2020–2025 cycles: 100 questions per paper, 2 marks per correct answer, no deduction for wrong or unattempted answers.',
      'Negative marking was introduced in the preliminary examination "for the first time" in 2026 (Free Press Journal, 14 April 2026; Dainik Bhaskar English, 26 April 2026), which confirms it did not apply to the 2019–2025 papers in this bank.',
    ]),
    confidence: 'verified',
  }),
  Object.freeze({
    id: 'mppsc-sse-prelims-2026-plus',
    label: 'MPPSC State Service Prelims 2026 onwards pattern (3 marks, −1)',
    appliesFrom: 2026,
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
      note: 'Paper-II (General Aptitude/CSAT) is qualifying in the revised pattern; MPPSC published it as qualifying (33%). It does not affect the scoring of Paper-I.',
      confidence: 'reported',
    }),
    source: 'MPPSC State Service preliminary examination revised rules for 2026 onwards: negative marking introduced for the first time — 3 marks per correct answer and one-third (1 mark) deducted for each wrong answer.',
    evidence: Object.freeze([
      'Free Press Journal, 14 April 2026 — "one-third mark will be deducted for every wrong answer … each correct answer carries three marks" (3R−1W model).',
      'Dainik Bhaskar English, 26 April 2026 — negative marking introduced in the 2026 preliminary examination: one-third of the marks deducted per wrong answer.',
      'Published 2026 pattern tables list each preliminary paper as 100 questions / 300 marks: 100 × 3 marks.',
    ]),
    confidence: 'reported',
  }),
]);

const norm = (v) => String(v ?? '').trim().toLowerCase();

/** Does this paper look like an MPPSC preliminary paper? */
export function isMppscPrelimsPaper(paper = {}) {
  const hay = `${norm(paper.exam)} ${norm(paper.paper_name)}`;
  if (!hay.trim()) return false;
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
