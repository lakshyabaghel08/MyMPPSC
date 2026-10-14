/**
 * shared.js — Helpers shared by the practice setup screens.
 *
 * The configuration form is deliberately progressive. Only the two choices
 * people actually vary per session (size and feedback timing) stay visible;
 * everything else is summarised in plain language and lives behind an
 * "Advanced settings" disclosure, pre-filled with the defaults from Settings.
 * Keeping the form in one place means Topic Practice, the Custom Test builder,
 * Smart Practice and PYQ simulations behave identically.
 */

import { state } from '../../core/state.js';
import { esc, notice, badge, dataTable, toast, infoToggle } from '../components.js';
import { CONFIDENCE_TRACKING, ANSWER_POLICIES } from '../../core/constants.js';
import { allAttempts } from '../../services/attempts.js';
import { buildAttemptSummary } from '../../services/select.js';
import * as tests from '../../services/tests.js';
import { getQuestions } from '../../services/questions.js';
import { resolveScoringRules } from '../../services/scoring.js';

const LATEST_MPPSC_PRACTICE_SCHEME = 'mppsc-sse-prelims-latest-practice';

export const CONFIG_PREFIX = 'practiceCfg';

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
    confidence: s.confidenceTracking,
    answerPolicy: s.answerPolicy,
    unresolvedPolicy: s.scoringPolicyWhenUnresolved,
    randomizeOptions: s.randomizeOptions,
    preferUnseen: allowRepeatOverride ? s.repeatPolicy.preferUnseen : false,
    usePaperRules: Boolean(paper && resolveScoringRules({ paper }).rules),
    scoring: { source: 'custom', ...s.defaultScoring },
  };
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
  parts.push(v.confidence === 'off' ? 'confidence off' : `confidence ${v.confidence}`);
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
            <label class="field"><span class="label-text">Confidence marking</span>
              <select id="${prefix}Confidence">
                <option value="off" ${s.confidenceTracking === 'off' ? 'selected' : ''}>${esc(CONFIDENCE_TRACKING.off)}</option>
                <option value="optional" ${s.confidenceTracking === 'optional' ? 'selected' : ''}>${esc(CONFIDENCE_TRACKING.optional)}</option>
                <option value="required" ${s.confidenceTracking === 'required' ? 'selected' : ''}>${esc(CONFIDENCE_TRACKING.required)}</option>
              </select>
              <span class="hint">Optional per question. Stored separately from correctness; it never changes your marks.</span>
            </label>
            <label class="field"><span class="label-text">Answer policy (which key is used to judge a response)</span>
              <select id="${prefix}Policy">
                <option value="verified_preferred" ${s.answerPolicy === 'verified_preferred' ? 'selected' : ''}>${esc(ANSWER_POLICIES.verified_preferred)}</option>
                <option value="supplied" ${s.answerPolicy === 'supplied' ? 'selected' : ''}>${esc(ANSWER_POLICIES.supplied)}</option>
                <option value="verified_only" ${s.answerPolicy === 'verified_only' ? 'selected' : ''}>${esc(ANSWER_POLICIES.verified_only)}</option>
              </select>
              <span class="hint">The stored key is never overwritten.</span>
            </label>
            <label class="field"><span class="label-text">If an answer is still unresolved (missing or disputed)</span>
              <select id="${prefix}Unresolved">
                <option value="supplied" ${s.scoringPolicyWhenUnresolved === 'supplied' ? 'selected' : ''}>Judge it with the supplied key and flag it in the report</option>
                <option value="verified" ${s.scoringPolicyWhenUnresolved === 'verified' ? 'selected' : ''}>Only judge it when an independently verified answer exists</option>
                <option value="exclude" ${s.scoringPolicyWhenUnresolved === 'exclude' ? 'selected' : ''}>Exclude unresolved questions from the score entirely</option>
              </select>
            </label>
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
    confidence: value('Confidence')?.value || state.settings.confidenceTracking,
    answerPolicy: value('Policy')?.value || state.settings.answerPolicy,
    unresolvedPolicy: value('Unresolved')?.value || state.settings.scoringPolicyWhenUnresolved,
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
export function mountConfigFields({ prefix = CONFIG_PREFIX, paper = null, defaultCount = 20, maxCount = null, allowRepeatOverride = true, onCountChange = null } = {}) {
  const root = document.querySelector(`[data-config-root="${prefix}"]`);
  if (!root) return;
  const summaryEl = document.getElementById(`${prefix}Summary`);
  const refreshSummary = () => {
    if (!summaryEl) return;
    summaryEl.textContent = describeConfig(readConfig(prefix, { paper, defaultCount }), { allowRepeatOverride, paper });
  };

  root.addEventListener('change', (ev) => {
    refreshSummary();
    if (onCountChange && ev.target?.id === `${prefix}Count`) {
      onCountChange(Number(ev.target.value) || defaultCount);
    }
  });

  document.getElementById(`${prefix}Reset`)?.addEventListener('click', () => {
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
    setVal('Confidence', init.confidence);
    setVal('Policy', init.answerPolicy);
    setVal('Unresolved', init.unresolvedPolicy);
    setChk('ShuffleOptions', init.randomizeOptions);
    setChk('PreferUnseen', init.preferUnseen);
    setChk('UsePaperRules', init.usePaperRules);
    setVal('MarksCorrect', init.scoring.marksPerCorrect);
    setVal('MarksWrong', init.scoring.negativeMarksPerIncorrect);
    setVal('MarksUnanswered', init.scoring.marksForUnanswered);
    setChk('Negative', init.scoring.negativeMarkingEnabled);
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

/** Availability table used by practice setup screens. */
export function availabilityTable(availability, { subjectLabel = 'Subject' } = {}) {
  const rows = Object.entries(availability.bySubject || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([subject, count]) => [esc(subject), String(count)]);
  return dataTable({
    columns: [{ label: subjectLabel }, { label: 'Matching questions', num: true }],
    rows,
    empty: 'No questions match the current filters.',
    className: 'compact',
  });
}

export function countSummary(availability, extra = '') {
  return `<p class="small muted my-2"><strong>${availability.total} matching</strong> · ${availability.unseen} never attempted · ${availability.incorrect} answered wrong before · ${availability.skipped} skipped before${extra}</p>`;
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

export async function ensureQuestionsEncodable(ids) {
  const questions = await getQuestions(ids);
  return questions;
}
