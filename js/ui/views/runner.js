/**
 * runner.js — The test-taking screen (crown jewel).
 *
 * Handles: original question order, timer, question palette, mark for review,
 * clear response, confidence marking, learning-mode feedback, automatic saving,
 * distraction-free focus mode, keyboard shortcut bar + aria-keyshortcuts,
 * Devanagari lang="hi" typography, resume after a refresh and submission with
 * confirmation.
 */

import { CONFIDENCE_LEVELS, STORES } from '../../core/constants.js';
import { state } from '../../core/state.js';
import * as db from '../../core/db.js';
import {
  esc,
  fmtClock,
  badge,
  notice,
  warningList,
  renderExplanation,
  questionTypeLabel,
  answerKeyBadge,
  confidenceLabel,
  languageSwitcher,
  sourceChip,
  demoBadge,
  langAttr,
  toast,
  confirmDialog,
  openModal,
} from '../components.js';
import { getQuestions } from '../../services/questions.js';
import * as tests from '../../services/tests.js';
import { displayVariant } from '../../core/schema.js';
import { fmtDate } from '../../core/util.js';

let session = null; // { test, questions, lang, ticker, lastSwitchAt, saveState }

function idsFromParam(param) {
  if (!param) return null;
  try {
    return decodeURIComponent(param).split(',').map((s) => s.trim()).filter(Boolean);
  } catch {
    return param.split(',');
  }
}

export async function loadSession(testId, { questionIds = null } = {}) {
  const test = await db.get(STORES.TESTS, testId);
  if (!test) return null;
  const ids = questionIds && questionIds.length ? questionIds : test.question_ids;
  const questions = await getQuestions(ids);
  return { test, questions, lang: test.language || state.settings.language, ticker: null, lastSwitchAt: Date.now(), saveState: 'saved', pendingIds: questionIds && questionIds.length && !test.question_ids?.length ? ids : null };
}

function currentQuestion() {
  const index = session.test.current_index || 0;
  const id = session.test.question_ids[index];
  return { id, question: session.questions.get(id), index };
}

function responseFor(id) {
  return session.test.responses[id] || { selected: [], flagged: false, confidence: null, time_spent_ms: 0, revealed: false, visits: 0 };
}

function optionKeysFor(question) {
  const variant = displayVariant(question, session.lang).variant || Object.values(question.language_variants)[0];
  const keys = (variant?.options || []).map((o) => o.key);
  const order = tests.optionOrderFor(session.test, question);
  if (!order) return keys;
  const filtered = order.filter((k) => keys.includes(k));
  return filtered.length === keys.length ? filtered : keys;
}

function orderedOptions(question) {
  const { variant } = displayVariant(question, session.lang);
  const keys = optionKeysFor(question);
  const byKey = new Map((variant?.options || []).map((o) => [o.key, o]));
  return keys.map((k) => byKey.get(k)).filter(Boolean);
}

function keyProvenanceChip(question) {
  if (question.dispute?.is_disputed || question.supplied?.status === 'disputed') {
    return sourceChip('disputed', 'disputed key');
  }
  if (question.verified?.answer?.length) {
    return sourceChip('verified', 'independently verified');
  }
  if (question.supplied?.answer?.length) {
    return sourceChip('supplied', 'supplied key');
  }
  return sourceChip('unavailable', 'key missing');
}

function markup() {
  const { test } = session;
  const { id: questionId, question, index } = currentQuestion();
  const progress = tests.testProgress(test);
  const response = responseFor(questionId);
  const learningMode = test.config.feedback_mode === 'learning';
  const revealed = learningMode && response.revealed;
  const paper = test.paper_snapshot;
  const totalQuestions = test.question_ids.length;
  const isFocusMode = typeof document !== 'undefined' && document.body.classList.contains('runner-focus');

  if (!question) {
    return `<h1 class="runner-title">${esc(test.label || 'Test')}</h1>${notice('This question could not be loaded from the local database. It may have been removed by undoing an import.', 'bad')}`;
  }

  const { variant, lang, fallback } = displayVariant(question, session.lang);
  const options = orderedOptions(question);
  const answers = new Set();
  const effective = question.verified?.answer?.length ? question.verified.answer : question.supplied?.answer || [];
  if (revealed) effective.forEach((a) => answers.add(a));

  const remaining = test.timer.remaining_seconds;
  const timerClass = remaining !== null && remaining !== undefined ? (remaining <= 60 ? 'bad' : remaining <= 300 ? 'warn' : '') : '';
  const saveStateClass = session.saveState === 'saving' ? 'saving' : session.saveState === 'error' ? 'error' : '';

  const confidenceControl = test.config.confidence === 'off'
    ? ''
    : `<div class="row tight mt-3">
        <span class="tiny muted">Recall confidence${test.config.confidence === 'required' ? ' (required)' : ''}:</span>
        <span class="seg" role="group" aria-label="Recall confidence" data-confidence>
          ${Object.entries(CONFIDENCE_LEVELS)
            .map(([key, label]) => `<button type="button" data-action="confidence" data-value="${key}" aria-keyshortcuts="c" aria-pressed="${response.confidence === key}">${esc(label)}</button>`)
            .join('')}
          <button type="button" data-action="confidence" data-value="" aria-keyshortcuts="c" aria-pressed="${!response.confidence}">Clear</button>
        </span>
        <span class="tiny soft">Stored separately from correctness — a correct guess is treated as weak recall.</span>
      </div>`;

  const paletteHtml = test.question_ids
    .map((id, i) => {
      const r = responseFor(id);
      const classes = [r.selected?.length ? 'answered' : '', r.flagged ? 'flagged' : '', i === index ? 'current' : ''].filter(Boolean).join(' ');
      const number = session.questions.get(id)?.question_number ?? i + 1;
      return `<button type="button" class="${classes}" data-action="goto" data-index="${i}" aria-label="Question ${esc(String(number))}${r.flagged ? ', flagged' : ''}${r.selected?.length ? ', answered' : ''}">${esc(String(number))}${r.flagged ? '<span class="flag-dot" aria-hidden="true">⚑</span>' : ''}</button>`;
    })
    .join('');

  const explanationBlock = revealed
    ? `<div class="mt-4">
        ${renderExplanation(question)}
        ${
          effective.length
            ? `<p class="small mt-2 mb-0">Answer key: <strong>${esc(effective.join(', '))}</strong> ${answerKeyBadge(question.supplied?.status)}${question.verified?.answer ? ` · verified answer: <strong>${esc(question.verified.answer.join(', '))}</strong>` : ''}</p>`
            : '<p class="small text-bad mt-2 mb-0">No usable answer key entry exists for this question, so your response cannot be judged. It is excluded from scoring rather than marked wrong.</p>'
        }
      </div>`
    : '';

  const qLangAttr = langAttr(variant?.question_text, lang);

  return `
  <div class="runner-bar">
    <div class="grow">
      <div class="row tight">
        <h1 class="runner-title">${esc(test.label || 'Practice')}</h1>
        ${test.config.is_authentic_paper ? badge('authentic paper order', 'accent') : badge('custom / practice set', '')}
        ${test.config.is_authentic_paper ? sourceChip('supplied', 'authentic paper') : sourceChip('derived', 'practice session')}
        ${badge(test.config.feedback_mode === 'learning' ? 'learning mode' : 'exam simulation', test.config.feedback_mode === 'learning' ? 'info' : '')}
      </div>
      <div class="tiny muted">
        ${paper ? `${esc(paper.exam || '')} ${paper.year ? `· ${esc(String(paper.year))}` : ''}${paper.set_code ? ` · set ${esc(paper.set_code)}` : ''} · ` : ''}
        Question ${index + 1} of ${totalQuestions}${question.question_number ? ` (paper Q${esc(String(question.question_number))})` : ''}
        · ${progress.answered} answered · ${progress.unanswered} left · ${progress.flagged} flagged
      </div>
    </div>
    <div class="row tight">
      ${test.config.show_timer && remaining !== null && remaining !== undefined ? `<span class="timer ${timerClass}" id="runnerTimer" role="timer">${fmtClock(remaining)}</span>` : '<span class="tiny muted">No time limit</span>'}
      <span class="save-state ${saveStateClass}" id="saveState">${session.saveState === 'saving' ? 'saving…' : session.saveState === 'error' ? 'save failed' : 'saved'}</span>
      <button class="btn btn-sm" type="button" data-action="focus-mode" aria-pressed="${isFocusMode}" title="Toggle distraction-free reading layout">${isFocusMode ? 'Show sidebar' : 'Focus mode'}</button>
      <button class="btn btn-sm" type="button" data-action="print" title="Print question paper">Print</button>
      <button class="btn btn-sm" type="button" data-action="pause">${test.status === 'paused' ? 'Resume' : 'Pause'}</button>
      <button class="btn btn-primary btn-sm" type="button" data-action="submit">Submit</button>
    </div>
  </div>

  <div class="runner">
    <div>
      <article class="question-card" id="questionCard">
        <div class="question-meta">
          <span class="question-num-pill">Q${esc(String(question.question_number ?? index + 1))}</span>
          ${badge(question.classification?.subject || 'Unclassified', question.classification?.isUnclassified ? 'warn' : '')}
          ${question.classification?.topic ? badge(question.classification.topic, '') : ''}
          ${question.classification?.subtopic ? badge(question.classification.subtopic, 'plain') : ''}
          ${badge(questionTypeLabel(question.question_type), 'info')}
          ${answerKeyBadge(question.supplied?.status)}
          ${keyProvenanceChip(question)}
          ${demoBadge(question.is_demonstration)}
          ${fallback && lang !== session.lang ? badge(`showing ${lang === 'hi' ? 'Hindi' : 'English'} (other language unavailable)`, 'warn') : ''}
          ${Object.keys(question.language_variants).length > 1 ? `<span class="ml-auto" data-lang-wrap>${languageSwitcher(question, session.lang)}</span>` : ''}
        </div>

        ${variant?.instructions ? `<div class="instructions"${langAttr(variant.instructions, lang)}>${esc(variant.instructions)}</div>` : ''}
        <p class="question-text ${lang === 'hi' ? 'hi' : ''}"${qLangAttr}>${esc(variant?.question_text || '')}</p>

        <div class="options" role="group" aria-label="Answer options">
          ${options
            .map((opt, optIdx) => {
              const selected = response.selected?.includes(opt.key);
              const isAnswer = revealed && answers.has(opt.key);
              const wrongPick = revealed && selected && !answers.has(opt.key);
              const cls = [isAnswer ? 'correct' : '', wrongPick ? 'incorrect' : ''].filter(Boolean).join(' ');
              const shortcutKey = optIdx < 9 ? String(optIdx + 1) : '';
              return `<button class="option-row ${cls}" type="button" data-action="select" data-key="${esc(opt.key)}" aria-pressed="${selected}"${shortcutKey ? ` aria-keyshortcuts="${shortcutKey}"` : ''}${langAttr(opt.text, lang)}>
                <span class="option-key">${esc(opt.key)}</span>
                <span class="option-text">${esc(opt.text)}</span>
                ${shortcutKey ? `<span class="option-kbd" aria-hidden="true">${shortcutKey}</span>` : ''}
              </button>`;
            })
            .join('')}
        </div>

        ${question.question_type === 'multiple_correct' && !revealed ? '<p class="tiny muted mt-2 mb-0">More than one option may be correct. Select all that apply, then check your answer.</p>' : ''}

        <div class="runner-nav">
          <button class="btn" type="button" data-action="prev" aria-keyshortcuts="ArrowLeft p" ${index === 0 ? 'disabled' : ''}>← Previous</button>
          <button class="btn" type="button" data-action="next" aria-keyshortcuts="ArrowRight n" ${index >= totalQuestions - 1 ? 'disabled' : ''}>Next →</button>
          <button class="btn" type="button" data-action="flag" aria-keyshortcuts="f" aria-pressed="${Boolean(response.flagged)}">${response.flagged ? '⚑ Remove flag' : '⚑ Mark for review'}</button>
          <button class="btn" type="button" data-action="clear" aria-keyshortcuts="u" ${!response.selected?.length ? 'disabled' : ''}>Clear response</button>
          <span class="grow"></span>
          <span class="tiny muted">Time on this question: ${fmtClock(Math.round((response.time_spent_ms || 0) / 1000))}</span>
          ${learningMode && !revealed ? '<button class="btn btn-primary" type="button" data-action="reveal">Check answer</button>' : ''}
        </div>
        ${confidenceControl}
        <div class="kbd-bar" aria-label="Keyboard shortcuts">
          <span><kbd>1</kbd>–<kbd>${Math.min(9, Math.max(1, options.length))}</kbd> select option</span>
          <span><kbd>←</kbd>/<kbd>P</kbd> previous</span>
          <span><kbd>→</kbd>/<kbd>N</kbd> next</span>
          <span><kbd>F</kbd> flag</span>
          <span><kbd>U</kbd> clear</span>
          ${test.config.confidence !== 'off' ? '<span><kbd>C</kbd> confidence</span>' : ''}
          <span><kbd>?</kbd> help</span>
        </div>
        ${explanationBlock}
      </article>
      ${warningList(test.config.warnings)}
    </div>

    <aside class="sticky-side">
      <section class="card">
        <div class="card-head"><h2>Question palette</h2><span class="muted tiny">${progress.answered}/${totalQuestions}</span></div>
        <div class="card-body tight">
          <div class="palette">${paletteHtml}</div>
          <div class="legend">
            <span><i class="swatch ok"></i> answered</span>
            <span><i class="swatch warn"></i> flagged</span>
            <span><i class="swatch"></i> not answered</span>
          </div>
        </div>
      </section>
      ${card_summary(test, progress)}
    </aside>
  </div>`;
}

function card_summary(test, progress) {
  const conf = test.config.confidence !== 'off' ? `<p class="small mt-2 mb-0">Confidence marked: ${progress.confidence.confident} confident · ${progress.confidence.unsure} unsure · ${progress.confidence.guessed} guessed</p>` : '';
  return `<section class="card">
    <div class="card-head"><h2>Scoring in force</h2>${test.config.scoring.rules ? sourceChip('supplied') : sourceChip('unavailable')}</div>
    <div class="card-body tight small">
      ${
        test.config.scoring.rules
          ? `<p class="m-0">${esc(
              [
                `+${test.config.scoring.rules.marks_per_correct} correct`,
                test.config.scoring.rules.negative_marking_enabled ? `−${test.config.scoring.rules.negative_marks_per_incorrect} incorrect` : 'no negative marking',
                `${test.config.scoring.rules.marks_for_unanswered} unanswered`,
              ].join(' · '),
            )}</p>
            <p class="tiny soft mt-1 mb-0">${esc(test.config.scoring.rulesSourceNote || '')}</p>`
          : '<p class="text-bad m-0">Rules are not configured. You can finish the paper, but it cannot be scored until the rules are set.</p>'
      }
      ${conf}
    </div>
    <div class="card-foot small">
      Started ${esc(fmtDate(test.started_at || test.created_at))} · ${test.question_ids.length} questions
    </div>
  </section>`;
}

/* --------------------------------------------------------------- actions --- */

async function persist() {
  session.saveState = 'saving';
  const saveEl = document.getElementById('saveState');
  if (saveEl) {
    saveEl.textContent = 'saving…';
    saveEl.className = 'save-state saving';
  }
  try {
    await tests.saveTest(session.test);
    session.saveState = 'saved';
    if (saveEl) {
      saveEl.textContent = 'saved';
      saveEl.className = 'save-state';
    }
  } catch (err) {
    session.saveState = 'error';
    if (saveEl) {
      saveEl.textContent = 'save failed';
      saveEl.className = 'save-state error';
    }
    toast(`Your answer could not be saved: ${err.message}`, 'bad');
  }
}

function attributeElapsed() {
  const now = Date.now();
  const elapsed = now - session.lastSwitchAt;
  session.lastSwitchAt = now;
  const { id } = currentQuestion();
  if (id) tests.addQuestionTime(session.test, id, elapsed);
  session.test.elapsed_seconds = (session.test.elapsed_seconds || 0) + Math.round(elapsed / 1000);
}

async function repaint(ctx, root) {
  attributeElapsed();
  root.innerHTML = markup();
  attach(ctx, root, { keepTimer: true });
}

async function selectOption(ctx, root, key) {
  const { id, question } = currentQuestion();
  const response = responseFor(id);
  const type = question.question_type;
  const multi = type === 'multiple_correct';
  let selected;
  if (multi) {
    const set = new Set(response.selected || []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    selected = Array.from(set);
  } else {
    selected = [key];
  }
  const patch = { selected, revealed: false };
  await tests.updateResponse(session.test, id, patch);
  await persist();
  await repaint(ctx, root);
  if (session.test.config.feedback_mode === 'learning' && !multi) {
    await reveal(ctx, root);
  }
}

async function reveal(ctx, root) {
  const { id } = currentQuestion();
  await tests.updateResponse(session.test, id, { revealed: true });
  await persist();
  await repaint(ctx, root);
}

async function goto(ctx, root, index) {
  const { test } = session;
  if (test.config.confidence === 'required') {
    const { id } = currentQuestion();
    const response = responseFor(id);
    if (response.selected?.length && !response.confidence) {
      toast('Mark how confident you were before moving on — this test requires it.', 'warn');
      return;
    }
  }
  session.test.current_index = Math.max(0, Math.min(test.question_ids.length - 1, index));
  const { id } = currentQuestion();
  const response = responseFor(id);
  await tests.updateResponse(session.test, id, { visits: (response.visits || 0) + 1 });
  session.lastSwitchAt = Date.now();
  await persist();
  await repaint(ctx, root);
  if (session.test.config.feedback_mode === 'learning' && response.selected?.length && !response.revealed) {
    document.getElementById('questionCard')?.scrollIntoView({ block: 'nearest' });
  }
}

async function toggleFlag(ctx, root) {
  const { id } = currentQuestion();
  const response = responseFor(id);
  await tests.updateResponse(session.test, id, { flagged: !response.flagged });
  await persist();
  await repaint(ctx, root);
}

async function clearResponse(ctx, root) {
  const { id } = currentQuestion();
  await tests.updateResponse(session.test, id, { selected: [], revealed: false });
  await persist();
  await repaint(ctx, root);
}

async function setConfidence(ctx, root, value) {
  const { id } = currentQuestion();
  await tests.updateResponse(session.test, id, { confidence: value || null });
  await persist();
  await repaint(ctx, root);
}

export async function submitWithConfirmation(ctx, { auto = false, root = null } = {}) {
  const test = session.test;
  if (!test.config.scoring?.rules) {
    const rules = await askForRules();
    if (!rules) return false;
    test.config.scoring = { ...test.config.scoring, rules, source: 'user_configured', rulesSourceNote: 'Rules you configured when submitting this test.', needsConfiguration: false };
  }
  const progress = tests.testProgress(test);
  if (!auto) {
    const requiredMissing = test.config.confidence === 'required' ? test.question_ids.filter((id) => responseFor(id).selected?.length && !responseFor(id).confidence).length : 0;
    const ok = await confirmDialog({
      title: 'Submit this test?',
      message: `You answered <strong>${progress.answered}</strong> of ${progress.total} questions.
        ${progress.unanswered ? `<br /><strong>${progress.unanswered}</strong> question(s) are unanswered — they stay unanswered rather than being guessed.` : ''}
        ${progress.flagged ? `<br />${progress.flagged} question(s) are still marked for review.` : ''}
        ${requiredMissing ? `<br /><span class="text-warn">${requiredMissing} answered question(s) have no confidence mark yet.</span>` : ''}
        <br /><br />Scoring uses: ${esc(
          [
            `+${test.config.scoring.rules.marks_per_correct} correct`,
            test.config.scoring.rules.negative_marking_enabled ? `−${test.config.scoring.rules.negative_marks_per_incorrect} incorrect` : 'no negative marking',
          ].join(', '),
        )}.`,
      confirmLabel: 'Submit and see results',
    });
    if (!ok) return false;
  }
  attributeElapsed();
  try {
    await tests.submitTest(test, { auto });
    if (session.ticker) clearInterval(session.ticker);
    session.ticker = null;
    document.body?.classList.remove('runner-focus');
    toast(auto ? 'Time is up — the test was submitted automatically.' : 'Test submitted. Results are ready.', auto ? 'warn' : 'ok');
    ctx.navigate(`report/${test.id}`);
    return true;
  } catch (err) {
    toast(`The test could not be submitted: ${err.message}`, 'bad');
    return false;
  }
}

async function askForRules(paper = null) {
  const p = paper || session?.test?.paper_snapshot || null;
  const defaults = state.settings.defaultScoring;
  const value = await openModal({
    title: 'Set the scoring rules for this test',
    body: `${notice(
      p && !p.scoring?.rules_known
        ? `The source paper <strong>${esc(p.paper_id)}</strong> did not supply scoring rules, so no marks can be assumed. Enter the rules you want to be scored by (for example the official scheme printed on the paper).`
        : 'This test has no scoring rules yet. Enter the marks to use.',
      'warn',
    )}
    <div class="field-row">
      <label class="field"><span class="label-text">Marks per correct answer</span><input type="number" step="0.25" id="rpCorrect" value="${esc(String(defaults.marksPerCorrect ?? 2))}" /></label>
      <label class="field"><span class="label-text">Marks per incorrect answer (negative)</span><input type="number" step="0.01" id="rpWrong" value="${esc(String(defaults.negativeMarksPerIncorrect ?? 0))}" /></label>
      <label class="field"><span class="label-text">Marks for unanswered</span><input type="number" step="0.25" id="rpUnanswered" value="${esc(String(defaults.marksForUnanswered ?? 0))}" /></label>
    </div>
    <label class="check"><input type="checkbox" id="rpNegative" ${defaults.negativeMarkingEnabled ? 'checked' : ''} /><span>Apply negative marking for incorrect answers</span></label>
    <p class="hint">Rules are stored with the test and shown in the report. Nothing is assumed on your behalf.</p>`,
    actions: [
      { label: 'Cancel', value: '__cancel' },
      { label: 'Use these rules', tone: 'btn-primary', value: '__ok' },
    ],
  });
  if (value !== '__ok') return null;
  const marksPerCorrect = Number(document.getElementById('rpCorrect')?.value);
  const negativeMarksPerIncorrect = Number(document.getElementById('rpWrong')?.value) || 0;
  const marksForUnanswered = Number(document.getElementById('rpUnanswered')?.value) || 0;
  const negativeMarkingEnabled = Boolean(document.getElementById('rpNegative')?.checked);
  if (!Number.isFinite(marksPerCorrect) || marksPerCorrect <= 0) {
    toast('Marks per correct answer must be a positive number.', 'bad');
    return null;
  }
  return { marks_per_correct: marksPerCorrect, negative_marks_per_incorrect: Math.abs(negativeMarksPerIncorrect), negative_marking_enabled: negativeMarkingEnabled, marks_for_unanswered: marksForUnanswered };
}

function startTicker(ctx, root) {
  if (session.ticker) clearInterval(session.ticker);
  session.ticker = setInterval(async () => {
    const test = session.test;
    if (test.status !== 'in_progress' || test.timer.running === false) return;
    test.elapsed_seconds = (test.elapsed_seconds || 0) + 1;
    if (test.timer.remaining_seconds !== null && test.timer.remaining_seconds !== undefined) {
      test.timer.remaining_seconds = Math.max(0, test.timer.remaining_seconds - 1);
      const el = document.getElementById('runnerTimer');
      if (el) {
        el.textContent = fmtClock(test.timer.remaining_seconds);
        el.className = `timer ${test.timer.remaining_seconds <= 60 ? 'bad' : test.timer.remaining_seconds <= 300 ? 'warn' : ''}`;
      }
      if (test.timer.remaining_seconds <= 0) {
        clearInterval(session.ticker);
        session.ticker = null;
        if (test.config.auto_submit_on_expiry) {
          await submitWithConfirmation(ctx, { auto: true, root });
        } else {
          toast('Time is up. Submit when you are ready — the timer has stopped.', 'warn');
        }
      }
    }
    if (test.elapsed_seconds % 5 === 0) {
      tests.saveTest(test).catch(() => {});
    }
  }, 1000);
  session.ticker?.unref?.();
}

function attach(ctx, root, { keepTimer = false } = {}) {
  root.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      const action = btn.dataset.action;
      ev.preventDefault();
      if (action === 'select') await selectOption(ctx, root, btn.dataset.key);
      else if (action === 'next') await goto(ctx, root, (session.test.current_index || 0) + 1);
      else if (action === 'prev') await goto(ctx, root, (session.test.current_index || 0) - 1);
      else if (action === 'goto') await goto(ctx, root, Number(btn.dataset.index));
      else if (action === 'flag') await toggleFlag(ctx, root);
      else if (action === 'clear') await clearResponse(ctx, root);
      else if (action === 'confidence') await setConfidence(ctx, root, btn.dataset.value || null);
      else if (action === 'reveal') await reveal(ctx, root);
      else if (action === 'submit') await submitWithConfirmation(ctx, { root });
      else if (action === 'focus-mode') {
        document.body?.classList.toggle('runner-focus');
        await repaint(ctx, root);
      } else if (action === 'print') {
        window.print?.();
      } else if (action === 'pause') {
        const test = session.test;
        if (test.status === 'paused') {
          test.status = 'in_progress';
          test.timer.running = true;
          test.timer.last_tick_at = new Date().toISOString();
          toast('Timer resumed.', 'info');
        } else {
          test.status = 'paused';
          tests.pauseTimer(test);
          toast('Test paused. The clock is stopped; your answers are saved.', 'info');
        }
        await persist();
        await repaint(ctx, root);
        if (test.status === 'in_progress') startTicker(ctx, root);
      } else if (action === 'lang') return;
    });
  });
  root.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      session.lang = btn.dataset.lang;
      session.test.language = btn.dataset.lang;
      await persist();
      await repaint(ctx, root);
    });
  });
  if (keepTimer && session.ticker === null && session.test.status === 'in_progress') startTicker(ctx, root);
  if (!keepTimer) {
    wireKeyboard(ctx, root);
  }
}

function wireKeyboard(ctx, root) {
  const handler = async (ev) => {
    const tag = ev.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target?.isContentEditable) return;
    if (document.getElementById('modalRoot')?.hidden === false) return;
    const index = session.test.current_index || 0;
    if (/^[1-9]$/.test(ev.key)) {
      const options = orderedOptions(session.questions.get(session.test.question_ids[index]));
      const opt = options[Number(ev.key) - 1];
      if (opt) {
        ev.preventDefault();
        await selectOption(ctx, root, opt.key);
      }
    } else if (ev.key === 'ArrowRight' || ev.key.toLowerCase() === 'n') {
      ev.preventDefault();
      await goto(ctx, root, index + 1);
    } else if (ev.key === 'ArrowLeft' || ev.key.toLowerCase() === 'p') {
      ev.preventDefault();
      await goto(ctx, root, index - 1);
    } else if (ev.key.toLowerCase() === 'f') {
      ev.preventDefault();
      await toggleFlag(ctx, root);
    } else if (ev.key.toLowerCase() === 'u') {
      ev.preventDefault();
      await clearResponse(ctx, root);
    } else if (ev.key.toLowerCase() === 'c' && session.test.config.confidence !== 'off') {
      ev.preventDefault();
      const order = ['confident', 'unsure', 'guessed', null];
      const current = responseFor(session.test.question_ids[index]).confidence || null;
      const next = order[(order.indexOf(current) + 1) % order.length];
      await setConfidence(ctx, root, next);
    }
  };
  document.addEventListener('keydown', handler);
  session.keyboardHandler = handler;
}

/* ------------------------------------------------------------------ view --- */

const view = {
  title: 'Test',

  async render(ctx) {
    if (session?.ticker) clearInterval(session.ticker);
    if (session?.keyboardHandler) document.removeEventListener('keydown', session.keyboardHandler);
    const [testId, sessionId] = ctx.params;
    const loaded = await loadSession(testId, { questionIds: sessionId ? idsFromParam(sessionId) : null });
    if (!loaded) {
      return `<h1>Test</h1>${notice('That test session was not found in local storage. It may have been deleted by a restore. <a href="#/test-centre">Back to the test centre</a>.', 'warn')}`;
    }
    session = loaded;
    if (session.test.status === 'submitted') {
      ctx.navigate(`report/${session.test.id}`, { replace: true });
      return '';
    }
    if (!session.test.started_at) {
      session.test.started_at = new Date().toISOString();
    }
    const reconcile = tests.reconcileTimer(session.test, {});
    await tests.saveTest(session.test);
    session.lastSwitchAt = Date.now();
    const resumeNote =
      reconcile.gapSeconds > 20
        ? notice(`You were away for about ${Math.round(reconcile.gapSeconds / 60)} minute(s). That time was charged to the test clock and your answers were kept.`, 'info')
        : '';
    return resumeNote + markup();
  },

  async mount(ctx, root) {
    if (!session) return;
    attach(ctx, root, {});
    startTicker(ctx, root);
    if (session.test.status === 'paused') {
      toast('This test is paused. Press Resume to continue the clock.', 'info');
    }
  },

  /**
   * Called by the router before another screen renders. The ticker is stopped so
   * it cannot keep saving in the background, but the test clock is *not*
   * rewound: reconcileTimer() charges the elapsed wall-clock time when the test
   * is opened again, exactly as it does after a page refresh.
   */
  async cleanup() {
    if (session?.ticker) clearInterval(session.ticker);
    if (session?.keyboardHandler) document.removeEventListener('keydown', session.keyboardHandler);
    document.body?.classList.remove('runner-focus');
    if (session?.test && session.test.status === 'in_progress') {
      await tests.saveTest(session.test).catch((err) => console.warn('Could not save the test on leaving the screen', err));
    }
    session = null;
  },
};

export default view;
export { askForRules, session as _session };
