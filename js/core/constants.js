/**
 * constants.js — Application-wide constants, enums and defaults.
 * No DOM access here; safe to import from workers or test harnesses.
 */

export const APP_NAME = 'MyMPPSC';
export const APP_TITLE = 'MyMPPSC — MPPSC Prelims Preparation';
export const APP_VERSION = '1.0.0';

/** Question-bank interchange schema version supported by this build. */
export const SUPPORTED_SCHEMA_MAJOR = 1;
export const SUPPORTED_SCHEMA_VERSIONS = ['1.0.0'];

/** IndexedDB */
export const DB_NAME = 'mymppsc';
/**
 * Bump DB_VERSION and add a migration step in db.js whenever a store or index
 * changes. Never delete an existing store without a migration that exports it.
 *
 * v2 added `syllabus_progress`. applySchema creates any store that is missing,
 * so the upgrade only has to declare the store in STORE_DEFS.
 */
export const DB_VERSION = 2;

export const STORES = {
  QUESTIONS: 'questions',
  PAPERS: 'papers',
  TESTS: 'tests',
  ATTEMPTS: 'attempts',
  MISTAKES: 'mistakes',
  REVISION: 'revision',
  SYLLABUS: 'syllabus',
  /**
   * Progress through the built-in official syllabus. Deliberately its own store:
   * the planner's `syllabus` store holds the user's own tree, and mixing the two
   * would put module nodes into the planner and planner nodes into this module.
   */
  SYLLABUS_PROGRESS: 'syllabus_progress',
  TASKS: 'tasks',
  SESSIONS: 'sessions',
  IMPORTS: 'imports',
  META: 'meta',
  SETTINGS: 'settings',
};

export const STORE_LIST = Object.values(STORES);

/** localStorage keys — only small preferences live here. */
export const LS_KEYS = {
  UI: 'mymppsc.ui',
  SETTINGS: 'mymppsc.settings',
  LAST_BACKUP: 'mymppsc.lastBackupAt',
  IMPORT_HISTORY: 'mymppsc.importHistory',
  ACTIVE_SESSION: 'mymppsc.activeSessionId',
};

export const LANGUAGE_LABELS = { en: 'English', hi: 'हिन्दी' };
export const SUPPORTED_LANGUAGES = ['en', 'hi'];

export const QUESTION_TYPES = {
  single_correct: 'Single correct',
  multiple_correct: 'Multiple correct',
  statement_based: 'Statement based',
  matching: 'Matching',
  assertion_reason: 'Assertion–reason',
  other: 'Other',
};

/**
 * Question types whose options carry positional meaning (pairings). Option
 * order must never be shuffled for these types.
 */
export const NON_SHUFFLEABLE_TYPES = new Set(['matching']);

/**
 * Answer-key states. `supplied` is what the bundled MPPSC bank uses for a key
 * that is stored with the question: the app makes no claim about who issued or
 * verified it and never shows that distinction to the user. The remaining
 * values are kept so banks written by older or external pipelines still import.
 */
export const ANSWER_KEY_STATUSES = {
  supplied: 'Supplied',
  // A supplied key is never described as official: the app does not verify keys
  // against the commission's publications and must not imply that it has.
  provisional: 'Provisional',
  final: 'Final',
  unofficial: 'Unofficial',
  disputed: 'Disputed',
  missing: 'Missing',
  unknown: 'Unknown',
};

/**
 * Explanations are content, not a workflow state: the app shows the prose that
 * came with the bank and says so when there is none. Whether an explanation was
 * reviewed, and by whom, belongs to the preparation pipeline's own reports, so
 * this app has no vocabulary for it.
 */

export const VALIDATION_STATUSES = {
  valid: 'Valid',
  valid_with_warnings: 'Valid with warnings',
  invalid: 'Invalid',
  unknown: 'Unknown',
};

export const MISTAKE_TYPES = {
  incorrect: 'Incorrect',
  skipped: 'Skipped',
  flagged: 'Flagged for review',
  low_confidence_correct: 'Correct but uncertain',
  repeated: 'Repeated mistake',
};

export const CONFIDENCE_LEVELS = {
  confident: 'Confident',
  unsure: 'Unsure',
  guessed: 'Guessed',
};

export const FEEDBACK_MODES = {
  learning: 'Learning mode (reveal answer immediately)',
  exam: 'Exam-simulation mode (reveal after submission)',
};

/** Answer policies for scoring. The supplied key is never overwritten. */
export const ANSWER_POLICIES = {
  supplied: 'Use supplied answer key',
  verified_preferred: 'Prefer verified answer, else supplied',
  verified_only: 'Verified answers only (questions without one are unscored)',
};

export const CONFIDENCE_TRACKING = {
  off: 'Off',
  optional: 'Optional per question',
  required: 'Required before moving on',
};

/**
 * Three test rules that are no longer a preference: every test built from now
 * on uses them, whatever the caller passes.
 *
 *  * `confidence: 'optional'` — the confidence buttons are always available and
 *    never compulsory. They used to default to 'off', which hid a control that
 *    revision depends on.
 *  * `answerPolicy: 'verified_preferred'` — an independently verified answer
 *    wins over the supplied key, and the supplied key is used otherwise.
 *  * `unresolvedPolicy: 'supplied'` — a missing or disputed key is still judged
 *    with the supplied answer and flagged in the report rather than dropped.
 *
 * They are frozen here so that no screen, service or restored backup can drift
 * back to a per-user setting. `scoring.js` keeps supporting every policy value:
 * tests stored before this change carry their own and must still finish and
 * report the way they were scored.
 */
export const FIXED_TEST_RULES = Object.freeze({
  confidence: 'optional',
  answerPolicy: 'verified_preferred',
  unresolvedPolicy: 'supplied',
});

/**
 * Settings keys that were retired. They are stripped on load and on backup
 * restore so an old preference file cannot resurrect a rule that is now fixed
 * (`confidenceTracking`, `answerPolicy`, `scoringPolicyWhenUnresolved`) or a
 * control that never did anything (`warnOnSubmitUnanswered`,
 * `dailyTaskTarget`, `repeatPolicy.allowRepeatsInCustom`).
 */
export const RETIRED_SETTINGS_KEYS = Object.freeze(['confidenceTracking', 'answerPolicy', 'scoringPolicyWhenUnresolved', 'warnOnSubmitUnanswered', 'dailyTaskTarget']);

/** Retired keys nested inside a settings sub-object. */
export const RETIRED_SETTINGS_NESTED = Object.freeze({ repeatPolicy: ['allowRepeatsInCustom'] });

/** Remove every retired key from a settings object, in place. */
export function stripRetiredSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  for (const key of RETIRED_SETTINGS_KEYS) delete settings[key];
  for (const [parent, keys] of Object.entries(RETIRED_SETTINGS_NESTED)) {
    if (!settings[parent] || typeof settings[parent] !== 'object') continue;
    for (const key of keys) delete settings[parent][key];
  }
  return settings;
}

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'en',
  feedbackMode: 'exam',
  // Default scoring for every quiz type is the current MPPSC prelims pattern:
  // +3 for a correct answer, −1 for a wrong answer, 0 for unanswered. Papers
  // with their own stored rules still use those rules; this default fills in
  // for topic, custom, smart, mistake and revision sets, and as the starting
  // point wherever marks are configurable.
  defaultScoring: {
    marksPerCorrect: 3,
    negativeMarksPerIncorrect: 1,
    negativeMarkingEnabled: true,
    marksForUnanswered: 0,
  },
  showTimer: true,
  autoSubmitOnExpiry: true,
  allowPause: true,
  randomizeOptions: false, // default custom-test option
  revision: {
    intervals: { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30, 6: 60 },
    hardResetTo: 1,
    minIntervalDays: 1,
    maxIntervalDays: 180,
    uncertainMultiplier: 0.6,
    guessMultiplier: 0.5,
    slowAnswerSeconds: 120,
    unansweredIsMiss: true,
  },
  repeatPolicy: {
    preferUnseen: true,
    cooldownDays: 3,
    unseenRatio: 0.7, // smart practice: target share of unseen questions
    nearDuplicateThreshold: 0.62,
  },
  theme: 'system',
  density: 'comfortable',
});

/** Python-style array slicing of interval maps keeps JS simple here. */
export const DAY_MS = 86400000;

export const SUBJECT_ORDER = [
  'History',
  'Polity',
  'Geography',
  'Environment',
  'Economy',
  'Science and Technology',
  'Art and Culture',
  'Madhya Pradesh Special',
  'Current Affairs',
  'General Aptitude',
  'Unclassified',
];
