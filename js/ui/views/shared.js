/**
 * shared.js — Helpers shared by the practice setup screens.
 *
 * Keeping the configuration form in one place means Topic Practice, the Custom
 * Test builder and Smart Practice behave identically and all read the same
 * defaults from Settings.
 */

import { state } from '../../core/state.js';
import { esc, notice, badge, dataTable } from '../components.js';
import { CONFIDENCE_TRACKING, FEEDBACK_MODES, ANSWER_POLICIES } from '../../core/constants.js';
import { allAttempts } from '../../services/attempts.js';
import { buildAttemptSummary } from '../../services/select.js';
import * as tests from '../../services/tests.js';
import { getQuestions } from '../../services/questions.js';

export const CONFIG_PREFIX = 'practiceCfg';

/** Attempt summary built once per setup render. */
export async function currentAttemptSummary() {
  return buildAttemptSummary(await allAttempts());
}

/**
 * Configuration block shared by every practice setup screen.
 * @param {object} opts { showScoringCustom, defaultCount, paper, allowRepeatOverride }
 */
export function configFields({ prefix = CONFIG_PREFIX, paper = null, defaultCount = 20, allowCustomScoring = true, allowRepeatOverride = true, maxCount = null } = {}) {
  const s = state.settings;
  const paperRules = paper?.scoring?.rules_known
    ? `+${paper.scoring.marks_per_correct} correct${paper.scoring.negative_marking_enabled ? `, −${paper.scoring.negative_marks_per_incorrect} incorrect` : ', no negative marking'} (from the paper metadata)`
    : null;
  return `
    <fieldset>
      <legend>Session size and timing</legend>
      <div class="field-row">
        <label class="field"><span class="label-text">Number of questions</span>
          <input type="number" min="1" ${maxCount ? `max="${esc(String(maxCount))}"` : ''} step="1" id="${prefix}Count" value="${esc(String(Math.min(defaultCount, maxCount || defaultCount)))}" />
        </label>
        <label class="field"><span class="label-text">Time limit (minutes, blank = none)</span>
          <input type="number" min="1" step="1" id="${prefix}Minutes" value="${paper?.duration_minutes ? esc(String(paper.duration_minutes)) : ''}" ${paper?.duration_minutes ? '' : 'placeholder="no limit"'} />
        </label>
      </div>
      <label class="check"><input type="checkbox" id="${prefix}Timer" ${s.showTimer ? 'checked' : ''} /><span>Show the timer</span></label>
      <label class="check"><input type="checkbox" id="${prefix}AutoSubmit" ${s.autoSubmitOnExpiry ? 'checked' : ''} /><span>Submit automatically when time runs out</span></label>
      <label class="check"><input type="checkbox" id="${prefix}AllowPause" ${s.allowPause ? 'checked' : ''} /><span>Allow pausing (the clock stops while paused)</span></label>
    </fieldset>

    <fieldset>
      <legend>Feedback and confidence</legend>
      <label class="field"><span class="label-text">Feedback timing</span>
        <select id="${prefix}Feedback">
          <option value="exam" ${s.feedbackMode === 'exam' ? 'selected' : ''}>${esc(FEEDBACK_MODES.exam)}</option>
          <option value="learning" ${s.feedbackMode === 'learning' ? 'selected' : ''}>${esc(FEEDBACK_MODES.learning)}</option>
        </select>
      </label>
      <label class="field"><span class="label-text">Confidence marking</span>
        <select id="${prefix}Confidence">
          <option value="off" ${s.confidenceTracking === 'off' ? 'selected' : ''}>${esc(CONFIDENCE_TRACKING.off)}</option>
          <option value="optional" ${s.confidenceTracking === 'optional' ? 'selected' : ''}>${esc(CONFIDENCE_TRACKING.optional)}</option>
          <option value="required" ${s.confidenceTracking === 'required' ? 'selected' : ''}>${esc(CONFIDENCE_TRACKING.required)}</option>
        </select>
        <span class="hint">Confidence is stored separately from correctness. Correct guesses are treated as weak recall and returned sooner.</span>
      </label>
      <label class="field"><span class="label-text">Answer policy (which key is used to judge a response)</span>
        <select id="${prefix}Policy">
          <option value="verified_preferred" ${s.answerPolicy === 'verified_preferred' ? 'selected' : ''}>${esc(ANSWER_POLICIES.verified_preferred)}</option>
          <option value="supplied" ${s.answerPolicy === 'supplied' ? 'selected' : ''}>${esc(ANSWER_POLICIES.supplied)}</option>
          <option value="verified_only" ${s.answerPolicy === 'verified_only' ? 'selected' : ''}>${esc(ANSWER_POLICIES.verified_only)}</option>
        </select>
        <span class="hint">The supplied key is never overwritten, whichever policy you choose.</span>
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
          ? `<label class="check"><input type="checkbox" id="${prefix}UsePaperRules" checked /><span>Use the source paper's rules — ${esc(paperRules)}</span></label>
             <p class="hint">Clear the box to override the marks for this session only.</p>`
          : `<p class="hint mt-0">${paper ? 'The source paper does not state scoring rules.' : 'No source paper rules apply to this session.'} Set the marks explicitly — nothing is assumed for you.</p>`
      }
      <div class="field-row">
        <label class="field"><span class="label-text">Marks per correct answer</span><input type="number" step="0.25" id="${prefix}MarksCorrect" value="${esc(String(s.defaultScoring.marksPerCorrect))}" /></label>
        <label class="field"><span class="label-text">Marks per incorrect answer</span><input type="number" step="0.01" id="${prefix}MarksWrong" value="${esc(String(s.defaultScoring.negativeMarksPerIncorrect))}" /></label>
        <label class="field"><span class="label-text">Marks for unanswered</span><input type="number" step="0.25" id="${prefix}MarksUnanswered" value="${esc(String(s.defaultScoring.marksForUnanswered))}" /></label>
      </div>
      <label class="check"><input type="checkbox" id="${prefix}Negative" ${s.defaultScoring.negativeMarkingEnabled ? 'checked' : ''} /><span>Apply negative marking</span></label>
    </fieldset>`
        : ''
    }`;
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
  const usePaperRules = paper?.scoring?.rules_known ? (value('UsePaperRules') ? checked('UsePaperRules') : false) : false;
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
  return `<div class="row my-2">
    ${badge(`${availability.total} matching`, 'accent')}
    ${badge(`${availability.unseen} never attempted`, 'info')}
    ${badge(`${availability.incorrect} answered wrong before`, availability.incorrect ? 'bad' : '')}
    ${badge(`${availability.skipped} skipped before`, availability.skipped ? 'warn' : '')}
    ${extra}
  </div>`;
}

export function incompletePaperNotice(paperSummary) {
  if (!paperSummary) return '';
  if (paperSummary.complete === false) {
    return notice(
      `This paper declares <strong>${esc(String(paperSummary.declared))}</strong> questions but only <strong>${esc(String(paperSummary.present))}</strong> are stored locally (${esc(String(paperSummary.missingCount))} missing). The simulation will include only the questions that exist; nothing is invented to fill the gap.`,
      'warn',
      { title: 'Incomplete paper' },
    );
  }
  return '';
}

export function scoringUnknownNotice(paper) {
  if (paper?.scoring && paper.scoring.rules_known === false) {
    return notice('The source does not state this paper\'s scoring rules, so no marks will be assumed. You will be asked to configure them before the test can be scored.', 'warn', { title: 'Scoring rules unknown' });
  }
  return '';
}

export async function ensureQuestionsEncodable(ids) {
  const questions = await getQuestions(ids);
  return questions;
}
