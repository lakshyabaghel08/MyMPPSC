/**
 * runner.js — The test-taking screen (crown jewel).
 *
 * Handles: original question order, timer, question palette, mark for review,
 * clear response, confidence marking, learning-mode feedback, automatic saving,
 * distraction-free focus mode, keyboard shortcut bar + aria-keyshortcuts, a
 * "?" shortcut legend in the header (lists only the keys wireKeyboard() and
 * the app shell handle),
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
  renderExplanation,
  answerKeyBadge,
  confidenceLabel,
  languageSwitcher,
  infoToggle,
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

/**
 * The header's shortcut legend: a non-modal popover toggled by the "?"
 * button. It lists exactly the keys this screen answers to — wireKeyboard()
 * below, plus the app-wide ?, Ctrl/⌘ K and Escape from js/app.js — so it can
 * never advertise a shortcut that does nothing. It takes no focus when it
 * opens (so nothing scrolls), traps nothing, closes on Escape, on its ✕ or on
 * a click elsewhere, and stays open across repaints until then.
 */
function shortcutLegend({ optionCount, confidence, open }) {
  const last = Math.min(9, Math.max(1, optionCount));
  const rows = [
    [`<kbd>1</kbd>–<kbd>${last}</kbd>`, 'Choose an option, in the order shown'],
    ['<kbd>→</kbd> or <kbd>N</kbd>', 'Next question'],
    ['<kbd>←</kbd> or <kbd>P</kbd>', 'Previous question'],
    ['<kbd>F</kbd>', 'Mark for review, or remove the flag'],
    ['<kbd>U</kbd>', 'Clear your response'],
    ...(confidence ? [['<kbd>C</kbd>', 'Step through confidence: confident, unsure, guessed, not marked']] : []),
    ['<kbd>?</kbd>', 'Open Help'],
    ['<kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd>', 'Search for a screen or action'],
    ['<kbd>Esc</kbd>', 'Close this list, or a dialog'],
  ];
  return `<div class="kbd-legend" id="runnerKbdLegend" role="group" aria-labelledby="runnerKbdLegendTitle"${open ? '' : ' hidden'}>
      <div class="kbd-legend-head">
        <strong id="runnerKbdLegendTitle">Keyboard shortcuts</strong>
        <button class="btn btn-quiet btn-icon btn-sm" type="button" data-action="kbd-legend-close" aria-label="Close keyboard shortcuts">✕</button>
      </div>
      <dl class="kbd-legend-list">${rows.map(([keys, what]) => `<div><dt>${keys}</dt><dd>${esc(what)}</dd></div>`).join('')}</dl>
      <p class="tiny muted m-0">Shortcuts pause while you type in a field or a dialog is open.</p>
    </div>`;
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

  // Confidence is optional unless the test requires it. Nothing is marked by
  // default: with no mark, no button is pressed and the question simply reads
  // "Not marked". Once a mark exists, "Remove mark" takes it off again.
  const confidenceControl = test.config.confidence === 'off'
    ? ''
    : `<div class="confidence-box">
        <div class="row tight">
          <span class="confidence-label" id="confidenceLabel">How sure were you?${test.config.confidence === 'required' ? ' (required)' : ' (optional)'}</span>
          ${infoToggle('What this is for', '<p class="small m-0">Confidence is stored separately from correctness and never changes your marks. A correct answer you marked as guessed is treated as weak recall and comes back sooner in revision. Leave it unmarked if you prefer — an unmarked question gets no confidence tag at all.</p>')}
        </div>
        <div class="row tight mt-2">
          <span class="seg confidence-seg" role="group" aria-labelledby="confidenceLabel" data-confidence>
            ${Object.entries(CONFIDENCE_LEVELS)
              .map(([key, label]) => `<button type="button" data-action="confidence" data-value="${key}" aria-keyshortcuts="c" aria-pressed="${response.confidence === key}">${esc(label)}</button>`)
              .join('')}
          </span>
          ${
            response.confidence
              ? `<button class="btn btn-sm btn-quiet" type="button" data-action="confidence" data-value="" aria-keyshortcuts="c">✕ Remove mark</button>
                 <span class="tiny muted" role="status">Marked: ${esc(confidenceLabel(response.confidence))}</span>`
              : '<span class="tiny muted" role="status">Not marked</span>'
          }
        </div>
      </div>`;

  // The palette always counts 1, 2, 3… in test order, even when the test is a
  // shuffled mix of papers. Where a question came from (year + its number in
  // its own paper) is shown in the question box and in each button's label.
  const paletteHtml = test.question_ids
    .map((id, i) => {
      const r = responseFor(id);
      const classes = [r.selected?.length ? 'answered' : '', r.flagged ? 'flagged' : '', i === index ? 'current' : ''].filter(Boolean).join(' ');
      const q = session.questions.get(id);
      const origin = [q?.year ? `${q.year}` : null, q?.question_number ? `paper Q${q.question_number}` : null].filter(Boolean).join(' · ');
      return `<button type="button" class="${classes}" data-action="goto" data-index="${i}"${i === index ? ' aria-current="step"' : ''} aria-label="Question ${i + 1} of ${totalQuestions}${origin ? ` (${esc(origin)})` : ''}${r.flagged ? ', flagged' : ''}${r.selected?.length ? ', answered' : ''}">${i + 1}${r.flagged ? '<span class="flag-dot" aria-hidden="true">⚑</span>' : ''}</button>`;
    })
    .join('');

  const explanationBlock = revealed
    ? `<div class="mt-4">
        ${renderExplanation(question)}
        ${
          effective.length
            ? `<p class="small mt-2 mb-0">Answer: <strong>${esc(effective.join(', '))}</strong>${question.verified?.answer ? ` · your verified answer: <strong>${esc(question.verified.answer.join(', '))}</strong>` : ''}</p>`
            : '<p class="small text-bad mt-2 mb-0">No usable answer key entry exists for this question, so your response cannot be judged. It is excluded from scoring rather than marked wrong.</p>'
        }
      </div>`
    : '';

  const qLangAttr = langAttr(variant?.question_text, lang);

  const originBits = [
    question.year ? `MPPSC ${esc(String(question.year))}` : paper?.year ? `MPPSC ${esc(String(paper.year))}` : null,
    question.question_number ? `Paper Q${esc(String(question.question_number))}` : null,
    paper?.set_code ? `Set ${esc(paper.set_code)}` : null,
  ].filter(Boolean);
  const classificationLine = [question.classification?.subject, question.classification?.topic, question.classification?.subtopic].filter(Boolean).join(' · ');

  return `
  <div class="runner-bar">
    <div class="grow">
      <nav class="crumbs" aria-label="Breadcrumb">
        <ol><li><a href="#/test-centre">Test Centre</a></li><li aria-current="page">${esc(test.label || 'Practice')}</li></ol>
      </nav>
      <div class="row tight">
        <h1 class="runner-title">${esc(test.label || 'Practice')}</h1>
        <span class="tiny muted">${test.config.feedback_mode === 'learning' ? 'Learning mode — answers revealed as you go' : 'Exam mode — answers revealed after submitting'}</span>
      </div>
      <div class="tiny muted">
        Question ${index + 1} of ${totalQuestions}
        · ${progress.answered} answered · ${progress.unanswered} left${progress.flagged ? ` · ${progress.flagged} flagged` : ''}
      </div>
    </div>
    <div class="row tight">
      ${test.config.show_timer && remaining !== null && remaining !== undefined ? `<span class="timer ${timerClass}" id="runnerTimer" role="timer">${fmtClock(remaining)}</span>` : '<span class="tiny muted">No time limit</span>'}
      <span class="save-state ${saveStateClass}" id="saveState">${session.saveState === 'saving' ? 'saving…' : session.saveState === 'error' ? 'save failed' : 'saved'}</span>
      <button class="btn btn-sm btn-quiet" type="button" data-action="focus-mode" aria-pressed="${isFocusMode}" title="Toggle distraction-free reading layout">${isFocusMode ? 'Show sidebar' : 'Focus'}</button>
      <button class="btn btn-sm btn-quiet" type="button" data-action="pause">${test.status === 'paused' ? 'Resume' : 'Pause'}</button>
      <button class="btn btn-primary btn-sm" type="button" data-action="submit">Submit</button>
      <button class="btn btn-sm btn-icon kbd-legend-toggle" type="button" data-action="kbd-legend" aria-expanded="${Boolean(session.legendOpen)}" aria-controls="runnerKbdLegend" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">?</button>
    </div>
    ${shortcutLegend({ optionCount: options.length, confidence: test.config.confidence !== 'off', open: Boolean(session.legendOpen) })}
  </div>

  <div class="runner">
    <div>
      <article class="question-card" id="questionCard">
        <div class="question-meta">
          <span class="question-num-pill">Q${index + 1}</span>
          ${originBits.length ? `<span class="question-origin">${originBits.join(' · ')}</span>` : ''}
          ${classificationLine ? `<span class="question-class">${esc(classificationLine)}</span>` : ''}
          ${answerKeyBadge(question.supplied?.status)}
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
      ${test.config.warnings?.length ? infoToggle('Notes about this test', `<ul class="small">${test.config.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`) : ''}
    </div>

    <aside class="sticky-side">
      <section class="card">
        <div class="card-head"><h2>Question palette</h2><span class="muted tiny">${progress.answered}/${totalQuestions}</span></div>
        <div class="card-body tight">
          <div class="palette">${paletteHtml}</div>
          <div class="legend">
            <span><i class="swatch ok" aria-hidden="true"></i> answered</span>
            <span><i class="swatch warn" aria-hidden="true">⚑</i> flagged</span>
            <span><i class="swatch" aria-hidden="true"></i> not answered</span>
            <span><i class="swatch current" aria-hidden="true"></i> current</span>
          </div>
          <div class="row mt-3">
            <button class="btn btn-sm btn-quiet" type="button" data-action="print">Print question paper</button>
          </div>
        </div>
      </section>
      ${card_summary(test, progress)}
    </aside>
  </div>`;
}

function card_summary(test, progress) {
  const marked = progress.confidence.confident + progress.confidence.unsure + progress.confidence.guessed;
  const conf = test.config.confidence !== 'off' && marked ? `<p class="small mt-2 mb-0">Confidence marked on ${marked} question(s).</p>` : '';
  return `<section class="card">
    <div class="card-head"><h2>Scoring</h2></div>
    <div class="card-body tight small">
      ${
        test.config.scoring.rules
          ? `<p class="m-0"><strong>${esc(
              [
                `+${test.config.scoring.rules.marks_per_correct} correct`,
                test.config.scoring.rules.negative_marking_enabled ? `−${test.config.scoring.rules.negative_marks_per_incorrect} incorrect` : 'no negative marking',
                `${test.config.scoring.rules.marks_for_unanswered} unanswered`,
              ].join(' · '),
            )}</strong></p>
            ${test.config.scoring.rulesSourceNote ? infoToggle('Where these rules come from', `<p class="small m-0">${esc(test.config.scoring.rulesSourceNote)}</p>`) : ''}`
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
  // The router may have torn the session down while a save was in flight
  // (leaving the screen mid-answer); writing to the released session then
  // threw. Bail out quietly instead — cleanup() saves the test itself.
  if (!session) return;
  const mine = session;
  mine.saveState = 'saving';
  const saveEl = document.getElementById('saveState');
  if (saveEl) {
    saveEl.textContent = 'saving…';
    saveEl.className = 'save-state saving';
  }
  try {
    await tests.saveTest(mine.test);
    if (session !== mine) return;
    mine.saveState = 'saved';
    if (saveEl) {
      saveEl.textContent = 'saved';
      saveEl.className = 'save-state';
    }
  } catch (err) {
    if (session !== mine) return;
    mine.saveState = 'error';
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

/**
 * Re-render in place without moving the reader. Answering, flagging or marking
 * confidence used to rebuild the whole screen and lose both the scroll
 * position and the focused control; now the scroll offset is restored and
 * focus returns to the equivalent control. Only an explicit move to another
 * question (`toQuestion`) scrolls — to the top of that question.
 */
async function repaint(ctx, root, { toQuestion = false } = {}) {
  attributeElapsed();
  const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const activeKey =
    active && root.contains(active) && active.dataset?.action
      ? `[data-action="${active.dataset.action}"]${active.dataset.value !== undefined ? `[data-value="${active.dataset.value}"]` : ''}${active.dataset.key !== undefined ? `[data-key="${active.dataset.key}"]` : ''}${active.dataset.index !== undefined ? `[data-index="${active.dataset.index}"]` : ''}`
      : null;
  root.innerHTML = markup();
  attach(ctx, root, { keepTimer: true });
  if (toQuestion) {
    const card = document.getElementById('questionCard');
    if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'start' });
    return;
  }
  if (typeof window !== 'undefined') window.scrollTo({ top: scrollY, behavior: 'auto' });
  if (activeKey) {
    const again = root.querySelector(activeKey);
    if (again && typeof again.focus === 'function') {
      try {
        again.focus({ preventScroll: true });
      } catch {
        /* focus is best effort */
      }
    }
  }
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
  // In learning mode a single-answer pick reveals the answer in the same
  // repaint, instead of repainting twice (which flickered and re-attributed
  // time). Multiple-correct questions still wait for "Check answer".
  const revealNow = session.test.config.feedback_mode === 'learning' && !multi;
  const patch = { selected, revealed: revealNow };
  await tests.updateResponse(session.test, id, patch);
  await persist();
  await repaint(ctx, root);
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
  await repaint(ctx, root, { toQuestion: true });
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
        ? `No scoring rules are stored for <strong>${esc(p.paper_id)}</strong> and no automatic scheme covers its examination year, so no marks can be assumed. Enter the rules you want to be scored by.`
        : 'This test has no scoring rules yet. Enter the marks to use.',
      'warn',
    )}
    <div class="field-row">
      <label class="field"><span class="label-text">Marks per correct answer</span><input type="number" step="0.25" id="rpCorrect" value="${esc(String(defaults.marksPerCorrect ?? 3))}" /></label>
      <label class="field"><span class="label-text">Marks per incorrect answer (negative)</span><input type="number" step="0.01" id="rpWrong" value="${esc(String(defaults.negativeMarksPerIncorrect ?? 1))}" /></label>
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
      if (action === 'kbd-legend') setLegendOpen(root, !session.legendOpen);
      else if (action === 'kbd-legend-close') setLegendOpen(root, false, { returnFocus: true });
      else if (action === 'select') await selectOption(ctx, root, btn.dataset.key);
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

/**
 * Show or hide the shortcut legend in place (no repaint, so nothing moves).
 * Focus is only moved when the legend closes with focus inside it — it is
 * about to disappear — and then back to the "?" button, without scrolling.
 */
function setLegendOpen(root, open, { returnFocus = false } = {}) {
  if (!session) return;
  session.legendOpen = open;
  const panel = root.querySelector('#runnerKbdLegend');
  const toggle = root.querySelector('[data-action="kbd-legend"]');
  const hadFocus = Boolean(panel && panel.contains(document.activeElement));
  if (panel) panel.hidden = !open;
  if (toggle) toggle.setAttribute('aria-expanded', String(open));
  if (!open && toggle && (returnFocus || hadFocus)) {
    try {
      toggle.focus({ preventScroll: true });
    } catch {
      /* focus is best effort */
    }
  }
}

function wireKeyboard(ctx, root) {
  const handler = async (ev) => {
    const tag = ev.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target?.isContentEditable) return;
    if (document.getElementById('modalRoot')?.hidden === false) return;
    if (ev.key === 'Escape') {
      // A dialog that handled this Escape has already closed (and prevented it).
      if (session?.legendOpen && !ev.defaultPrevented) {
        ev.preventDefault();
        setLegendOpen(root, false);
      }
      return;
    }
    // Browser and system shortcuts (Ctrl/⌘ + F, P, C, U…, Alt + ←) are not ours:
    // without this, Ctrl+P "went to the previous question" instead of printing.
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
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

  // A click anywhere outside the legend (and outside its "?" button) closes it.
  const dismiss = (ev) => {
    if (!session?.legendOpen) return;
    const panel = root.querySelector('#runnerKbdLegend');
    const toggle = root.querySelector('[data-action="kbd-legend"]');
    if (panel?.contains(ev.target) || toggle?.contains(ev.target)) return;
    setLegendOpen(root, false);
  };
  document.addEventListener('click', dismiss);
  session.legendDismissHandler = dismiss;
}

/** Remove the document listeners wireKeyboard() added. */
function unwireKeyboard() {
  if (session?.keyboardHandler) document.removeEventListener('keydown', session.keyboardHandler);
  if (session?.legendDismissHandler) document.removeEventListener('click', session.legendDismissHandler);
}

/* ------------------------------------------------------------------ view --- */

const view = {
  title: 'Test',

  async render(ctx) {
    if (session?.ticker) clearInterval(session.ticker);
    unwireKeyboard();
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
    unwireKeyboard();
    document.body?.classList.remove('runner-focus');
    if (session?.test && session.test.status === 'in_progress') {
      await tests.saveTest(session.test).catch((err) => console.warn('Could not save the test on leaving the screen', err));
    }
    session = null;
  },
};

export default view;
export { askForRules, session as _session };
