/**
 * shared.js — Helpers shared by the practice setup screens.
 *
 * The configuration form is deliberately progressive. Only the two choices
 * people actually vary per session (size and feedback timing) stay visible;
 * everything else is summarised in plain language and lives behind an
 * "Advanced settings" disclosure, pre-filled with the defaults from Settings.
 * Keeping the form in one place means Topic & Custom Practice, Smart Practice
 * and PYQ simulations behave identically.
 *
 * Three rules are not in the form at all, because they are not preferences:
 * confidence marking is always optional, a verified answer is preferred over
 * the supplied key, and an unresolved key is judged with the supplied answer
 * and flagged in the report. `FIXED_TEST_RULES` in core/constants.js is the
 * single place they are decided; `buildTest()` writes them into every new test.
 */

import { state } from '../../core/state.js';
import { esc, notice, toast, infoToggle } from '../components.js';
import { ANSWER_POLICIES, FIXED_TEST_RULES } from '../../core/constants.js';
import { allAttempts, listMistakes } from '../../services/attempts.js';
import { buildAttemptSummary, selectQuestions } from '../../services/select.js';
import * as tests from '../../services/tests.js';
import { resolveScoringRules } from '../../services/scoring.js';
import { allRevisionRecords, dueQueue } from '../../services/revision.js';
import { shuffle } from '../../core/util.js';

const LATEST_MPPSC_PRACTICE_SCHEME = 'mppsc-sse-prelims-latest-practice';

export const CONFIG_PREFIX = 'practiceCfg';

/** Default size for a session assembled without asking the reader. */
export const DEFAULT_PRACTICE_SIZE = 20;

/** Attempt summary built once per setup render. */
export async function currentAttemptSummary() {
  return buildAttemptSummary(await allAttempts());
}

/** The form values a session starts from: the saved defaults in Settings. */
function initialConfigValues({ paper = null, defaultCount = 20, maxCount = null, allowRepeatOverride = true } = {}) {
  const s = state.settings;
  const count = Math.min(defaultCount, maxCount || defaultCount);
  return {
    count,
    durationMinutes: paper?.duration_minutes || null,
    showTimer: s.showTimer,
    autoSubmitOnExpiry: s.autoSubmitOnExpiry,
    allowPause: s.allowPause,
    feedbackMode: s.feedbackMode,
    randomizeOptions: s.randomizeOptions,
    preferUnseen: allowRepeatOverride ? s.repeatPolicy.preferUnseen : false,
    usePaperRules: Boolean(paper && resolveScoringRules({ paper }).rules),
    scoring: { source: 'custom', ...s.defaultScoring },
  };
}

/** The one line that states the three rules no session can change. */
export const FIXED_RULES_NOTE = `Confidence marking is always optional per question. Answers are judged with ${ANSWER_POLICIES[FIXED_TEST_RULES.answerPolicy].toLowerCase()}, and a missing or disputed key is judged with the supplied answer and flagged in the report. These three rules are the same in every test.`;

/* ------------------------------------------------------- form memory ---- */

/**
 * Per-screen memory of the session form.
 *
 * Every practice screen re-renders itself in place whenever a filter, a
 * checkbox or the session size changes. Rebuilding the form from the Settings
 * defaults on each of those renders threw away what the reader had just typed:
 * a size of 12 snapped back to 25, "learning" feedback back to "exam", a time
 * limit back to blank, a chosen strategy back to random. The values are kept
 * here for the lifetime of the page, one entry per screen, and re-applied to
 * the DOM after each render — so a refresh keeps the form while a new visit to
 * the screen still starts from the saved defaults.
 */
const sessionForms = new Map();

/** Forget what a screen remembers about its form (used by "Reset"). */
export function clearSessionForm(screen) {
  if (screen) sessionForms.delete(screen);
}

function captureForm(formRoot) {
  const values = {};
  formRoot.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.id) return;
    if (el.type === 'checkbox' || el.type === 'radio') values[el.id] = { checked: el.checked };
    else values[el.id] = { value: el.value };
  });
  // A disclosure the reader opened stays open across the refresh.
  formRoot.querySelectorAll('details').forEach((el, index) => {
    values[`__details${index}`] = { open: el.open };
  });
  return values;
}

function applyForm(formRoot, values, { maxCount = null } = {}) {
  if (!values) return;
  formRoot.querySelectorAll('input, select, textarea').forEach((el) => {
    const remembered = values[el.id];
    if (!remembered) return;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = Boolean(remembered.checked);
    else {
      let next = remembered.value;
      // A remembered size must never exceed what the current filters allow.
      if (el.type === 'number' && maxCount && Number(next) > Number(maxCount)) next = String(maxCount);
      el.value = next;
    }
  });
  formRoot.querySelectorAll('details').forEach((el, index) => {
    const remembered = values[`__details${index}`];
    if (remembered) el.open = Boolean(remembered.open);
  });
}

/** Marks string, e.g. "+2 / −0.67 marks" or "+2 marks, no negative marking". */
function describeMarks(v, paper) {
  const resolved = paper ? resolveScoringRules({ paper }) : null;
  if (v.usePaperRules && resolved?.rules) {
    const rules = resolved.rules;
    if (resolved.schemeId === LATEST_MPPSC_PRACTICE_SCHEME && !paper?.user_scoring_override) {
      return `MPPSC pattern +${rules.marks_per_correct} / −${rules.negative_marks_per_incorrect} / ${rules.marks_for_unanswered}`;
    }
    return `the paper's scoring rules (+${rules.marks_per_correct}${rules.negative_marking_enabled ? ` / −${rules.negative_marks_per_incorrect}` : ', no negative'})`;
  }
  const base = v.scoring.negativeMarkingEnabled
    ? `+${v.scoring.marksPerCorrect} / −${v.scoring.negativeMarksPerIncorrect} marks`
    : `+${v.scoring.marksPerCorrect} marks, no negative marking`;
  return v.scoring.marksForUnanswered ? `${base}, ${v.scoring.marksForUnanswered} for unanswered` : base;
}

/** One plain-language line describing everything the session will do. */
function describeConfig(v, { allowRepeatOverride = true, paper = null } = {}) {
  const parts = [
    `${v.count} question${v.count === 1 ? '' : 's'}`,
    v.feedbackMode === 'learning' ? 'feedback after every question' : 'feedback after submitting',
    v.durationMinutes
      ? `${v.durationMinutes}-minute limit${v.autoSubmitOnExpiry ? ', auto-submit' : ''}${v.showTimer ? '' : ', timer hidden'}`
      : 'no time limit',
    describeMarks(v, paper),
    v.randomizeOptions ? 'options shuffled where safe' : 'original option order',
  ];
  if (allowRepeatOverride) parts.push(v.preferUnseen ? 'unseen questions preferred' : 'repeats not restricted');
  parts.push('confidence optional');
  return `This session: ${parts.join(' · ')}.`;
}

/**
 * Configuration block shared by every practice setup screen.
 *
 * Visible: number of questions + feedback timing (plus screen-specific
 * `extraQuick` controls). Everything else is behind a closed disclosure and is
 * described in one live summary line, so the form can be used without opening
 * it at all.
 *
 * @param {object} opts { prefix, paper, defaultCount, maxCount, allowCustomScoring, allowRepeatOverride, extraQuick }
 */
export function configFields({ prefix = CONFIG_PREFIX, paper = null, defaultCount = 20, allowCustomScoring = true, allowRepeatOverride = true, maxCount = null, extraQuick = '' } = {}) {
  const s = state.settings;
  const init = initialConfigValues({ paper, defaultCount, maxCount, allowRepeatOverride });
  const resolvedPaperRules = paper ? resolveScoringRules({ paper }) : null;
  const isLatestPractice = resolvedPaperRules?.schemeId === LATEST_MPPSC_PRACTICE_SCHEME && !paper?.user_scoring_override;
  const paperRules = resolvedPaperRules?.rules
    ? isLatestPractice
      ? `+${resolvedPaperRules.rules.marks_per_correct} correct, −${resolvedPaperRules.rules.negative_marks_per_incorrect} incorrect, ${resolvedPaperRules.rules.marks_for_unanswered} unanswered`
      : `+${resolvedPaperRules.rules.marks_per_correct} correct${resolvedPaperRules.rules.negative_marking_enabled ? `, −${resolvedPaperRules.rules.negative_marks_per_incorrect} incorrect` : ', no negative marking'} (from the paper metadata)`
    : null;
  const paperRulesLabel = isLatestPractice ? 'Use latest MPPSC practice pattern' : 'Use the source paper’s rules';
  return `
    <div class="practice-setup" data-config-root="${prefix}">
      <div class="field-row">
        <label class="field"><span class="label-text">Number of questions</span>
          <input type="number" min="1" ${maxCount ? `max="${esc(String(maxCount))}"` : ''} step="1" id="${prefix}Count" value="${esc(String(init.count))}" />
        </label>
        <label class="field"><span class="label-text">Feedback</span>
          <select id="${prefix}Feedback">
            <option value="exam" ${s.feedbackMode === 'exam' ? 'selected' : ''}>Exam style — reveal answers after submitting</option>
            <option value="learning" ${s.feedbackMode === 'learning' ? 'selected' : ''}>Learning — reveal the answer straight away</option>
          </select>
        </label>
        ${extraQuick}
      </div>
      <p class="settings-summary" id="${prefix}Summary">${esc(describeConfig(init, { allowRepeatOverride, paper }))}</p>

      <details class="disclosure">
        <summary>Advanced settings — timing, scoring and more (already filled in from your defaults)</summary>
        <div class="mt-3">
          <p class="hint mt-0">Everything here is already set to the defaults saved in Settings &amp; Backup, and applies to this session only. The summary above updates as you change things.</p>

          <fieldset>
            <legend>Timing</legend>
            <div class="field-row">
              <label class="field"><span class="label-text">Time limit (minutes, blank = none)</span>
                <input type="number" min="1" step="1" id="${prefix}Minutes" value="${paper?.duration_minutes ? esc(String(paper.duration_minutes)) : ''}" ${paper?.duration_minutes ? '' : 'placeholder="no limit"'} />
              </label>
            </div>
            <label class="check"><input type="checkbox" id="${prefix}Timer" ${s.showTimer ? 'checked' : ''} /><span>Show the timer</span></label>
            <label class="check"><input type="checkbox" id="${prefix}AutoSubmit" ${s.autoSubmitOnExpiry ? 'checked' : ''} /><span>Submit automatically when time runs out</span></label>
            <label class="check"><input type="checkbox" id="${prefix}AllowPause" ${s.allowPause ? 'checked' : ''} /><span>Allow pausing (the clock stops while paused)</span></label>
          </fieldset>

          <fieldset>
            <legend>Confidence and answer keys</legend>
            <p class="hint mt-0 mb-0">${esc(FIXED_RULES_NOTE)}</p>
          </fieldset>

          <fieldset>
            <legend>Question presentation</legend>
            <label class="check"><input type="checkbox" id="${prefix}ShuffleOptions" ${s.randomizeOptions ? 'checked' : ''} /><span>Randomise option order where it is safe (never for matching or other positional question types)</span></label>
            ${allowRepeatOverride ? `<label class="check"><input type="checkbox" id="${prefix}PreferUnseen" ${s.repeatPolicy.preferUnseen ? 'checked' : ''} /><span>Prefer questions I have not attempted yet, with a ${esc(String(s.repeatPolicy.cooldownDays))}-day cooldown before repeating</span></label>` : ''}
          </fieldset>

          ${
            allowCustomScoring
              ? `<fieldset>
            <legend>Scoring</legend>
            ${
              paperRules
                ? `<label class="check"><input type="checkbox" id="${prefix}UsePaperRules" checked /><span>${esc(paperRulesLabel)} — ${esc(paperRules)}</span></label>
                   <p class="hint">Clear the box to override the marks for this session only.</p>
                   ${isLatestPractice ? infoToggle('About this scoring', '<p class="small m-0">The latest reported MPPSC pattern (+3/−1/0) is applied to every bundled paper as a practice policy. It is not a claim about the historical rules of any particular year.</p>') : ''}`
                : `<p class="hint mt-0">Scoring below starts from the MPPSC +3 / −1 / 0 default. Change it for this session if you want different marks.</p>`
            }
            <div class="field-row">
              <label class="field"><span class="label-text">Marks per correct answer</span><input type="number" step="0.25" id="${prefix}MarksCorrect" value="${esc(String(s.defaultScoring.marksPerCorrect))}" /></label>
              <label class="field"><span class="label-text">Marks per incorrect answer</span><input type="number" step="0.01" id="${prefix}MarksWrong" value="${esc(String(s.defaultScoring.negativeMarksPerIncorrect))}" /></label>
              <label class="field"><span class="label-text">Marks for unanswered</span><input type="number" step="0.25" id="${prefix}MarksUnanswered" value="${esc(String(s.defaultScoring.marksForUnanswered))}" /></label>
            </div>
            <label class="check"><input type="checkbox" id="${prefix}Negative" ${s.defaultScoring.negativeMarkingEnabled ? 'checked' : ''} /><span>Apply negative marking</span></label>
          </fieldset>`
              : ''
          }

          <button class="btn btn-sm" type="button" id="${prefix}Reset">Reset advanced settings to my defaults</button>
        </div>
      </details>
    </div>`;
}

/** Read the configuration block back into a config object for createTest(). */
export function readConfig(prefix = CONFIG_PREFIX, { paper = null, defaultCount = 20 } = {}) {
  const value = (id) => document.getElementById(`${prefix}${id}`);
  const num = (id, fallback = null) => {
    const raw = value(id)?.value;
    if (raw === '' || raw === undefined || raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const checked = (id) => Boolean(value(id)?.checked);
  const paperRules = paper ? resolveScoringRules({ paper }).rules : null;
  const usePaperRules = paperRules ? (value('UsePaperRules') ? checked('UsePaperRules') : true) : false;
  const customScoring = {
    source: 'custom',
    marksPerCorrect: num('MarksCorrect', state.settings.defaultScoring.marksPerCorrect),
    negativeMarksPerIncorrect: num('MarksWrong', state.settings.defaultScoring.negativeMarksPerIncorrect),
    negativeMarkingEnabled: checked('Negative'),
    marksForUnanswered: num('MarksUnanswered', 0),
  };
  return {
    count: num('Count', defaultCount) || defaultCount,
    durationMinutes: num('Minutes', null),
    showTimer: checked('Timer'),
    autoSubmitOnExpiry: checked('AutoSubmit'),
    allowPause: checked('AllowPause'),
    feedbackMode: value('Feedback')?.value || state.settings.feedbackMode,
    randomizeOptions: checked('ShuffleOptions'),
    preferUnseen: checked('PreferUnseen'),
    usePaperRules,
    scoring: usePaperRules ? null : customScoring,
  };
}

/**
 * Wire the configuration block after render: keep the plain-language summary
 * in sync with the form and handle "Reset advanced settings to my defaults".
 * `onCountChange` fires when the session size is edited (Smart Practice uses
 * it to rebuild its plan preview).
 */
export function mountConfigFields({ prefix = CONFIG_PREFIX, paper = null, defaultCount = 20, maxCount = null, allowRepeatOverride = true, onCountChange = null, screen = null } = {}) {
  const root = document.querySelector(`[data-config-root="${prefix}"]`);
  if (!root) return;
  const summaryEl = document.getElementById(`${prefix}Summary`);
  const refreshSummary = () => {
    if (!summaryEl) return;
    summaryEl.textContent = describeConfig(readConfig(prefix, { paper, defaultCount }), { allowRepeatOverride, paper });
  };

  // Put back what this screen's form held before the re-render, then keep it.
  if (screen) {
    applyForm(root, sessionForms.get(screen), { maxCount });
    refreshSummary();
  }
  const remember = () => {
    if (screen) sessionForms.set(screen, captureForm(root));
  };
  remember();

  root.addEventListener('change', (ev) => {
    remember();
    refreshSummary();
    if (onCountChange && ev.target?.id === `${prefix}Count`) {
      onCountChange(Number(ev.target.value) || defaultCount);
    }
  });
  root.addEventListener('input', remember);
  root.addEventListener('toggle', remember, true);

  document.getElementById(`${prefix}Reset`)?.addEventListener('click', () => {
    clearSessionForm(screen);
    const init = initialConfigValues({ paper, defaultCount, maxCount, allowRepeatOverride });
    const setVal = (id, v) => {
      const el = document.getElementById(`${prefix}${id}`);
      if (el) el.value = v == null ? '' : String(v);
    };
    const setChk = (id, v) => {
      const el = document.getElementById(`${prefix}${id}`);
      if (el) el.checked = Boolean(v);
    };
    setVal('Minutes', init.durationMinutes);
    setChk('Timer', init.showTimer);
    setChk('AutoSubmit', init.autoSubmitOnExpiry);
    setChk('AllowPause', init.allowPause);
    setVal('Feedback', init.feedbackMode);
    setChk('ShuffleOptions', init.randomizeOptions);
    setChk('PreferUnseen', init.preferUnseen);
    setChk('UsePaperRules', init.usePaperRules);
    setVal('MarksCorrect', init.scoring.marksPerCorrect);
    setVal('MarksWrong', init.scoring.negativeMarksPerIncorrect);
    setVal('MarksUnanswered', init.scoring.marksForUnanswered);
    setChk('Negative', init.scoring.negativeMarkingEnabled);
    remember();
    refreshSummary();
    toast('Advanced settings reset to your saved defaults.', 'info');
  });
}

/** Create the test from a selection and go straight to the runner. */
export async function startPracticeTest(ctx, { kind, label, questionIds, metas = [], config = {}, orderSource = 'as_selected', paper = null, selectionNotes = [] }) {
  if (!questionIds?.length) return null;
  const test = await tests.createTest({
    kind,
    label,
    paper,
    questionIds,
    questionMetas: metas,
    orderSource,
    config,
    selectionNotes,
  });
  ctx.navigate(`runner/${test.id}`);
  return test;
}

export function scoringUnknownNotice(paper) {
  if (!paper) return '';
  const resolved = resolveScoringRules({ paper });
  if (resolved.schemeId === LATEST_MPPSC_PRACTICE_SCHEME && !paper.user_scoring_override) {
    return infoToggle('About this scoring', '<p class="small m-0">The latest reported MPPSC +3/−1/0 pattern is applied here as a practice policy. It is not evidence of the historical rules for this paper.</p>');
  }
  if (!resolved.rules) {
    return notice("No applicable marking scheme is available for this paper. Configure scoring before the test can be scored.", 'warn', { title: 'Scoring rules unknown' });
  }
  return '';
}

/* ------------------------------------------------- one-click starters ---- */

/**
 * Start a session from a resolved pool descriptor:
 * `{ ids, label, notes, config, orderSource, paper, kind }`.
 *
 * Every screen that offers "practise this" goes through here, so the session a
 * row on Today starts is the same shape as the one the builder starts from the
 * same questions — same fixed rules, same scoring resolution, same navigation.
 */
export async function startPool(ctx, pool) {
  if (!pool?.ids?.length) {
    toast('There is nothing in that pool right now. Try another option, or import more questions.', 'warn');
    return null;
  }
  const metas = pool.ids.map((id) => state.questionIndex.get(id)).filter(Boolean);
  return startPracticeTest(ctx, {
    kind: pool.kind || 'custom',
    label: pool.label,
    questionIds: pool.ids,
    metas,
    config: {
      ...(pool.config || {}),
      usePaperRules: pool.paper ? (pool.config?.usePaperRules ?? true) : false,
      scoring: pool.paper ? pool.config?.scoring : pool.config?.scoring || { source: 'custom', ...state.settings.defaultScoring },
    },
    orderSource: pool.orderSource || 'shuffled',
    paper: pool.paper || null,
    selectionNotes: pool.notes || [],
  });
}

/** Test kind for the options produced by `services/nextup.js`. */
const OPTION_KINDS = {
  resume: null,
  revision: 'revision',
  smart: 'smart',
  paper: 'pyq_full',
  topic: 'topic',
  unseen: 'custom',
  mistakes: 'mistake_retry',
};

/**
 * Start one option from `buildStartOptions()`. A resume option carries its own
 * href and is a navigation, not a new test.
 */
export async function startOption(ctx, option) {
  if (!option) return null;
  if (option.kind === 'resume') {
    if (option.href) ctx.navigate(option.href);
    return null;
  }
  if (!option.count) {
    toast('There is nothing in that pool yet.', 'info');
    return null;
  }
  const resolved = await option.pool();
  return startPool(ctx, { ...resolved, kind: OPTION_KINDS[option.kind] || 'custom' });
}

/**
 * Practise one topic (or a whole subject) immediately.
 *
 * This is the action behind every recommendation row: dashboard, results,
 * Insights, Mistake Book topic roll-up. It picks with the weakest-first
 * strategy by default, in learning mode, with no time limit — the shape of a
 * study sitting rather than an exam simulation.
 */
export async function startTopicSession(ctx, { subject = null, topic = null, count = null, strategy = 'weakest-first', feedbackMode = 'learning' } = {}) {
  const metas = Array.from(state.questionIndex.values()).filter(
    (m) => (!subject || (m.subject || 'Unclassified') === subject) && (!topic || (m.topic || 'Unclassified') === topic),
  );
  if (!metas.length) {
    toast('No stored questions match that selection.', 'warn');
    return null;
  }
  const attemptSummary = await currentAttemptSummary();
  const size = Math.max(1, Math.min(Number(count) || DEFAULT_PRACTICE_SIZE, metas.length));
  const picked = selectQuestions(metas, {
    count: size,
    strategy,
    attemptSummary,
    repeatPolicy: { preferUnseen: true, cooldownDays: state.settings.repeatPolicy.cooldownDays },
  });
  const ids = picked.selected.map((m) => m.id);
  return startPracticeTest(ctx, {
    kind: 'topic',
    label: topic ? `Topic practice — ${topic}` : `Subject practice — ${subject}`,
    questionIds: ids,
    metas: picked.selected,
    config: { feedbackMode, durationMinutes: null, usePaperRules: false, scoring: { source: 'custom', ...state.settings.defaultScoring } },
    orderSource: strategy === 'random' ? 'shuffled' : strategy,
    selectionNotes: [
      topic ? `Selected: ${subject} · ${topic}` : `Selected: ${subject}`,
      `Pick strategy: ${strategy === 'weakest-first' ? 'weakest topics first' : strategy === 'least-attempted' ? 'least attempted first' : 'random'}.`,
      ...picked.notes,
    ],
  });
}

/** A stored paper, in its own order, as an examination simulation. */
export async function startPaperSimulation(ctx, paper, { count = null, strict = true } = {}) {
  if (!paper) return null;
  const full = (paper.question_order || []).filter((id) => state.questionIndex.has(id));
  if (!full.length) {
    toast('This paper has no stored questions to practise.', 'warn');
    return null;
  }
  const size = Math.max(1, Math.min(Number(count) || full.length, full.length));
  const short = size < full.length;
  const ordered = strict ? full.slice(0, size) : shuffle(full.slice()).slice(0, size);
  return startPracticeTest(ctx, {
    kind: 'pyq_full',
    label: `${paper.paper_name || paper.exam || paper.paper_id}${paper.year ? ` — ${paper.year}` : ''}${paper.set_code ? ` (set ${paper.set_code})` : ''}${short ? ` · first ${size}` : ''}`,
    questionIds: ordered,
    metas: ordered.map((id) => state.questionIndex.get(id)).filter(Boolean),
    config: {
      // A shortened run is no longer a timed simulation of the paper; the clock
      // would otherwise fail the reader on questions they never saw.
      feedbackMode: 'exam',
      durationMinutes: short ? null : paper.duration_minutes || null,
      showTimer: !short,
    },
    orderSource: strict ? 'original' : 'shuffled',
    paper,
    selectionNotes: short
      ? [`The first ${size} of ${full.length} questions, in the paper's order.`, 'No time limit: this is a shortened run, not a full simulation.']
      : [strict ? 'Original paper order retained.' : 'Question order shuffled for this sitting.'],
  });
}

/** The smart plan, started from wherever the reader is. */
export async function startSmartSession(ctx, { count = DEFAULT_PRACTICE_SIZE, includeDemonstration = true, respectCooldown = true } = {}) {
  const metas = Array.from(state.questionIndex.values());
  if (!metas.length) return null;
  const attemptSummary = await currentAttemptSummary();
  const { smartPracticePlan } = await import('../../services/select.js');
  const plan = smartPracticePlan({
    metas,
    attemptSummary,
    revisionRecords: await allRevisionRecords(),
    count,
    includeDemonstration,
    respectCooldown,
  });
  if (!plan.questionIds.length) {
    toast('No questions could be selected. Import more questions or relax the filters.', 'warn');
    return null;
  }
  const byId = new Map(metas.map((m) => [m.id, m]));
  return startPracticeTest(ctx, {
    kind: 'smart',
    label: `Smart practice — ${plan.questionIds.length} questions`,
    questionIds: plan.questionIds.slice(),
    metas: plan.questionIds.map((id) => byId.get(id)).filter(Boolean),
    config: {
      feedbackMode: state.settings.feedbackMode,
      durationMinutes: null,
      usePaperRules: false,
      scoring: { source: 'custom', ...state.settings.defaultScoring },
    },
    orderSource: 'shuffled',
    selectionNotes: plan.explain,
  });
}

/** Due revision, capped to one sitting (the schedule keeps the rest due). */
export async function startRevisionDue(ctx) {
  const queue = dueQueue(await allRevisionRecords());
  const ids = queue.ids.filter((id) => state.questionIndex.has(id));
  if (!ids.length) {
    toast('Nothing is due for revision right now.', 'info');
    return null;
  }
  if (queue.remaining > 0) toast(`${queue.total} questions are due; this sitting takes the first ${ids.length}. The rest stay due.`, 'info');
  return startPracticeTest(ctx, {
    kind: 'revision',
    label: `Revision — ${ids.length} due question(s)`,
    questionIds: ids,
    metas: ids.map((id) => state.questionIndex.get(id)).filter(Boolean),
    config: { feedbackMode: 'learning', durationMinutes: null },
    orderSource: 'due_first',
    selectionNotes: ['Questions whose scheduled revision date has arrived or passed.'],
  });
}

/** Every open mistake in one sitting. */
export async function startOpenMistakes(ctx, { limit = 40 } = {}) {
  const rows = await listMistakes({ status: 'open' });
  const ids = Array.from(new Set(rows.map((row) => row.question_id))).filter((id) => state.questionIndex.has(id)).slice(0, limit);
  if (!ids.length) {
    toast('Nothing is open in the Mistake Book.', 'info');
    return null;
  }
  return startPracticeTest(ctx, {
    kind: 'mistake_retry',
    label: `Mistake retry — ${ids.length} question(s)`,
    questionIds: ids,
    metas: ids.map((id) => state.questionIndex.get(id)).filter(Boolean),
    config: { feedbackMode: 'learning', durationMinutes: null },
    orderSource: 'due_first',
    selectionNotes: ['Questions still open in the Mistake Book.'],
  });
}
