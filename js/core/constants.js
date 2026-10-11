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
 */
export const DB_VERSION = 1;

export const STORES = {
  QUESTIONS: 'questions',
  PAPERS: 'papers',
  TESTS: 'tests',
  ATTEMPTS: 'attempts',
  MISTAKES: 'mistakes',
  REVISION: 'revision',
  SYLLABUS: 'syllabus',
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

export const ANSWER_KEY_STATUSES = {
  provisional: 'Provisional',
  final: 'Final',
  unofficial: 'Unofficial',
  disputed: 'Disputed',
  missing: 'Missing',
  unknown: 'Unknown',
};

export const EXPLANATION_STATUSES = {
  missing: 'Missing',
  generated: 'Generated (not reviewed)',
  reviewed: 'Reviewed',
  approved: 'Approved',
};

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

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'en',
  feedbackMode: 'exam',
  confidenceTracking: 'off',
  answerPolicy: 'verified_preferred',
  scoringPolicyWhenUnresolved: 'supplied', // supplied | verified | exclude
  defaultScoring: {
    marksPerCorrect: 2,
    negativeMarksPerIncorrect: 0,
    negativeMarkingEnabled: false,
    marksForUnanswered: 0,
  },
  showTimer: true,
  warnOnSubmitUnanswered: true,
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
    allowRepeatsInCustom: true,
    cooldownDays: 3,
    unseenRatio: 0.7, // smart practice: target share of unseen questions
    nearDuplicateThreshold: 0.62,
  },
  dailyTaskTarget: 3,
  theme: 'light',
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
