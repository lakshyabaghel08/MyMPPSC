/**
 * runner.js — the test-taking screen.
 *
 * An examination interface has one job: never make the reader think about the
 * interface. This pass rebuilt the parts that did:
 *
 *  - **No full repaint for an answer.** Answering, flagging, clearing, marking
 *    confidence or revealing an answer now repaints the question card and the
 *    palette cells only. The timer, the bar, the sidebar and the scroll position
 *    are never touched, so the reading position and the focused control stay
 *    exactly where they were. Navigation between questions repaints the card
 *    and scrolls to it; changing language or focus mode repaints the screen.
 *  - **The palette answers "what is left?"** It carries live counts and a
 *    filter (all / unanswered / flagged / answered), and offers jumps to the
 *    next unanswered (`]`) or the next flagged (`[`) question.
 *  - **On a narrow screen the palette is a sheet.** A bar button shows the
 *    progress and opens the palette from the bottom, instead of leaving a long
 *    grid under the question.
 *  - **Submitting is a decision sheet, not a warning.** Answered, unanswered,
 *    flagged, missing confidence marks and the scoring rules in one panel, with
 *    a route back to the first unanswered question next to the submit button.
 *
 * Everything the previous build guaranteed is preserved: original question
 * order, the timer and pause, mark for review, clear response, optional
 * confidence, learning-mode feedback, automatic saving with its state, resume
 * after a refresh, distraction-free mode, the shortcut legend (which lists only
 * keys that work), Devanagari `lang` handling, print, and submission with the
 * frozen confidence/answer-key/unresolved rules.
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
  openModal,
} from '../components.js';
import { getQuestions } from '../../services/questions.js';
import * as tests from '../../services/tests.js';
import { displayVariant } from '../../core/schema.js';
import { fmtDate } from '../../core/util.js';

let session = null; // { test, questions, lang, ticker, lastSwitchAt, saveState, paletteFilter, legendOpen }

/** Palette filters, in the order they are offered. */
const PALETTE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unanswered', label: 'Unanswered' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'answered', label: 'Answered' },
];

const $ = (id, root = document) => root.querySelector(`#${id}`);

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
  return {
    test,
    questions,
    lang: test.language || state.settings.language,
    ticker: null,
    lastSwitchAt: Date.now(),
    saveState: 'saved',
    paletteFilter: 'all',
    legendOpen: false,
    pendingIds: questionIds && questionIds.length && !test.question_ids?.length ? ids : null,
  };
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

/* ------------------------------------------------------------- palette --- */

/** Counts the palette and the mobile bar both display. */
function paletteCounts(test) {
  let answered = 0;
  let flagged = 0;
  for (const id of test.question_ids) {
    const r = responseFor(id);
    if (r.selected?.length) answered += 1;
    if (r.flagged) flagged += 1;
  }
  const total = test.question_ids.length;
  return { total, answered, flagged, unanswered: total - answered };
}

function matchesPaletteFilter(buttonIndex, test, filter) {
  const response = responseFor(test.question_ids[buttonIndex]);
  if (filter === 'answered') return Boolean(response.selected?.length);
  if (filter === 'flagged') return Boolean(response.flagged);
  if (filter === 'unanswered') return !response.selected?.length;
  return true;
}

function paletteGridMarkup(test, index) {
  const total = test.question_ids.length;
  return test.question_ids
    .map((id, i) => {
      const r = responseFor(id);
      const classes = [r.selected?.length ? 'answered' : '', r.flagged ? 'flagged' : '', i === index ? 'current' : ''].filter(Boolean).join(' ');
      const q = session.questions.get(id);
      const origin = [q?.year ? `${q.year}` : null, q?.question_number ? `paper Q${q.question_number}` : null].filter(Boolean).join(' · ');
      const hidden = !matchesPaletteFilter(i, test, session.paletteFilter) ? ' hidden' : '';
      return `<button type="button" class="${classes}" data-action="goto" data-index="${i}"${i === index ? ' aria-current="step"' : ''}${hidden} aria-label="Question ${i + 1} of ${total}${origin ? ` (${esc(origin)})` : ''}${r.flagged ? ', flagged' : ''}${r.selected?.length ? ', answered' : ''}">${i + 1}${r.flagged ? '<span class="flag-dot" aria-hidden="true">⚑</span>' : ''}</button>`;
    })
    .join('');
}

function paletteToolsMarkup(counts) {
  const countFor = (id) => (id === 'all' ? counts.total : id === 'answered' ? counts.answered : id === 'flagged' ? counts.flagged : counts.unanswered);
  return `<div class="palette-tools" role="group" aria-label="Filter the question palette">
    ${PALETTE_FILTERS.map(
      (filter) =>
        `<button type="button" class="palette-filter" data-action="palette-filter" data-filter="${filter.id}" aria-pressed="${session.paletteFilter === filter.id}">
          ${esc(filter.label)} <span class="palette-filter-count">${countFor(filter.id)}</span>
        </button>`,
    ).join('')}
  </div>`;
}

function paletteJumpsMarkup() {
  return `<div class="palette-jumps">
    <button class="btn btn-sm btn-quiet" type="button" data-action="next-unanswered" aria-keyshortcuts="]" title="Jump to the next unanswered question (])">Next unanswered →</button>
    <button class="btn btn-sm btn-quiet" type="button" data-action="next-flagged" aria-keyshortcuts="[" title="Jump to the next flagged question ([)">Next flagged →</button>
  </div>`;
}

/* ------------------------------------------------------------ shortcuts -- */

/**
 * The header's shortcut legend: a non-modal popover toggled by the "?" button.
 * It lists exactly the keys this screen answers to, so it can never advertise a
 * shortcut that does nothing. It takes no focus when it opens, traps nothing,
 * closes on Escape, on its ✕ or on a click elsewhere.
 */
function shortcutLegend({ optionCount, confidence, open }) {
  const last = Math.min(9, Math.max(1, optionCount));
  const rows = [
    [`<kbd>1</kbd>–<kbd>${last}</kbd>`, 'Choose an option, in the order shown'],
    ['<kbd>→</kbd> or <kbd>N</kbd>', 'Next question'],
    ['<kbd>←</kbd> or <kbd>P</kbd>', 'Previous question'],
    ['<kbd>]</kbd>', 'Next unanswered question'],
    ['<kbd>[</kbd>', 'Next flagged question'],
    ['<kbd>F</kbd>', 'Mark for review, or remove the flag'],
    ['<kbd>U</kbd>', 'Clear your response'],
    ...(confidence ? [['<kbd>C</kbd>', 'Step through confidence: confident, unsure, guessed, not marked']] : []),
    ['<kbd>D</kbd>', 'Distraction-free reading'],
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

/* --------------------------------------------------------------- markup --- */

/** The confidence strip for the current question. */
function confidenceMarkup(test, response) {
  if (test.config.confidence === 'off') return '';
  return `<div class="confidence-box">
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
}

/** The question card only — this is the unit that is repainted on an answer. */
function questionCardMarkup() {
  const { test } = session;
  const { id: questionId, question, index } = currentQuestion();
  const progress = tests.testProgress(test);
  const response = responseFor(questionId);
  const learningMode = test.config.feedback_mode === 'learning';
  const revealed = learningMode && response.revealed;
  const paper = test.paper_snapshot;
  const totalQuestions = test.question_ids.length;

  if (!question) {
    return `${notice('This question could not be loaded from the local database. It may have been removed by undoing an import.', 'bad')}`;
  }

  const { variant, lang, fallback } = displayVariant(question, session.lang);
  const options = orderedOptions(question);
  const answers = new Set();
  const effective = question.verified?.answer?.length ? question.verified.answer : question.supplied?.answer || [];
  if (revealed) effective.forEach((a) => answers.add(a));

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
    ${confidenceMarkup(test, response)}
    <div class="kbd-bar" aria-label="Keyboard shortcuts">
      <span><kbd>1</kbd>–<kbd>${Math.min(9, Math.max(1, options.length))}</kbd> select option</span>
      <span><kbd>←</kbd>/<kbd>P</kbd> previous</span>
      <span><kbd>→</kbd>/<kbd>N</kbd> next</span>
      <span><kbd>]</kbd> next unanswered</span>
      <span><kbd>F</kbd> flag</span>
      <span><kbd>U</kbd> clear</span>
      ${test.config.confidence !== 'off' ? '<span><kbd>C</kbd> confidence</span>' : ''}
      <span><kbd>?</kbd> help</span>
    </div>
    <div id="explanationSlot">${explanationBlock}</div>`;
}

/** The score/source card under the palette. */
function scoringCard(test, progress) {
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

function markup() {
  const { test } = session;
  const { question, index } = currentQuestion();
  const progress = tests.testProgress(test);
  const totalQuestions = test.question_ids.length;
  const remaining = test.timer.remaining_seconds;
  const timerClass = remaining !== null && remaining !== undefined ? (remaining <= 60 ? 'bad' : remaining <= 300 ? 'warn' : '') : '';
  const saveStateClass = session.saveState === 'saving' ? 'saving' : session.saveState === 'error' ? 'error' : '';
  const isFocusMode = typeof document !== 'undefined' && document.body.classList.contains('runner-focus');
  const counts = paletteCounts(test);

  if (!question) {
    return `<h1 class="runner-title">${esc(test.label || 'Test')}</h1>${notice('This question could not be loaded from the local database. It may have been removed by undoing an import.', 'bad')}`;
  }

  const options = orderedOptions(question);

  return `
  <div class="runner-bar">
    <div class="grow">
      <nav class="crumbs" aria-label="Breadcrumb">
        <ol><li><a href="#/test-centre">Papers</a></li><li aria-current="page">${esc(test.label || 'Practice')}</li></ol>
      </nav>
      <div class="row tight">
        <h1 class="runner-title">${esc(test.label || 'Practice')}</h1>
        <span class="tiny muted">${test.config.feedback_mode === 'learning' ? 'Learning mode — answers revealed as you go' : 'Exam mode — answers revealed after submitting'}</span>
      </div>
      <div class="tiny muted" id="runnerProgress">
        Question ${index + 1} of ${totalQuestions}
        · ${progress.answered} answered · ${progress.unanswered} left${progress.flagged ? ` · ${progress.flagged} flagged` : ''}
      </div>
    </div>
    <div class="row tight">
      ${test.config.show_timer && remaining !== null && remaining !== undefined ? `<span class="timer ${timerClass}" id="runnerTimer" role="timer">${fmtClock(remaining)}</span>` : '<span class="tiny muted">No time limit</span>'}
      <span class="save-state ${saveStateClass}" id="saveState">${session.saveState === 'saving' ? 'saving…' : session.saveState === 'error' ? 'save failed' : 'saved'}</span>
      <button class="btn btn-sm btn-quiet runner-palette-btn" type="button" data-action="palette-toggle" aria-expanded="false" aria-controls="runnerSide" aria-label="Open the question palette">Palette <span class="runner-palette-progress" id="paletteSummary">${counts.answered}/${counts.total}</span></button>
      <button class="btn btn-sm btn-quiet" type="button" data-action="focus-mode" aria-pressed="${isFocusMode}" title="Toggle distraction-free reading layout (D)">${isFocusMode ? 'Show sidebar' : 'Focus'}</button>
      <button class="btn btn-sm btn-quiet" type="button" data-action="pause">${test.status === 'paused' ? 'Resume' : 'Pause'}</button>
      <button class="btn btn-primary btn-sm" type="button" data-action="submit">Submit</button>
      <button class="btn btn-sm btn-icon kbd-legend-toggle" type="button" data-action="kbd-legend" aria-expanded="${Boolean(session.legendOpen)}" aria-controls="runnerKbdLegend" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">?</button>
    </div>
    ${shortcutLegend({ optionCount: options.length, confidence: test.config.confidence !== 'off', open: Boolean(session.legendOpen) })}
  </div>

  <div class="runner">
    <div class="runner-main">
      <article class="question-card" id="questionCard" data-revealed="${String(session.test.config.feedback_mode === 'learning' && Boolean(responseFor(session.test.question_ids[session.test.current_index || 0]).revealed))}">${questionCardMarkup()}</article>
      ${test.config.warnings?.length ? infoToggle('Notes about this test', `<ul class="small">${test.config.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`) : ''}
    </div>

    <aside class="sticky-side runner-side" id="runnerSide">
      <section class="card palette-card">
        <div class="card-head">
          <h2>Questions</h2>
          <span class="muted tiny" id="paletteHeadCount">${counts.answered}/${counts.total}</span>
          <button class="btn btn-sm btn-quiet palette-close" type="button" data-action="palette-toggle" aria-label="Close the question palette">Close</button>
        </div>
        <div class="card-body tight">
          ${paletteToolsMarkup(counts)}
          <div class="palette" id="paletteGrid">${paletteGridMarkup(test, index)}</div>
          <div class="legend">
            <span><i class="swatch ok" aria-hidden="true"></i> answered</span>
            <span><i class="swatch warn" aria-hidden="true">⚑</i> flagged</span>
            <span><i class="swatch" aria-hidden="true"></i> not answered</span>
            <span><i class="swatch current" aria-hidden="true"></i> current question</span>
          </div>
          ${paletteJumpsMarkup()}
          <div class="row mt-3">
            <button class="btn btn-sm btn-quiet" type="button" data-action="print">Print question paper</button>
          </div>
        </div>
      </section>
      ${scoringCard(test, progress)}
    </aside>
  </div>`;
}

/* --------------------------------------------------------------- paints --- */

/** Where focus was, expressed as a selector that survives a card repaint. */
function focusKeyWithin(root) {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (!active || !root.contains(active) || !active.dataset?.action) return null;
  const bits = [`[data-action="${active.dataset.action}"]`];
  if (active.dataset.value !== undefined) bits.push(`[data-value="${active.dataset.value}"]`);
  if (active.dataset.key !== undefined) bits.push(`[data-key="${active.dataset.key}"]`);
  if (active.dataset.index !== undefined) bits.push(`[data-index="${active.dataset.index}"]`);
  return bits.join('');
}

function restoreFocus(root, key) {
  if (!key) return;
  const again = root.querySelector(key);
  if (again && typeof again.focus === 'function') {
    try {
      again.focus({ preventScroll: true });
    } catch {
      /* focus is best effort */
    }
  }
}

/** Repaint the question card only, keeping focus where it was. */
function paintCard(root, { keepFocus = true } = {}) {
  const card = root.querySelector('#questionCard');
  if (!card) return;
  const key = keepFocus ? focusKeyWithin(root) : null;
  card.innerHTML = questionCardMarkup();
  card.dataset.revealed = String(session.test.config.feedback_mode === 'learning' && Boolean(responseFor(currentQuestion().id).revealed));
  restoreFocus(root, key);
}

/** Repaint the palette cells and every count that mirrors them. */
function paintPalette(root) {
  const { test } = session;
  const index = test.current_index || 0;
  const counts = paletteCounts(test);
  const grid = root.querySelector('#paletteGrid');
  if (grid) {
    const key = focusKeyWithin(grid);
    grid.innerHTML = paletteGridMarkup(test, index);
    restoreFocus(root, key);
  }
  const tools = root.querySelector('.palette-tools');
  if (tools) {
    const key = focusKeyWithin(tools);
    tools.outerHTML = paletteToolsMarkup(counts);
    restoreFocus(root, key);
  }
  const set = (selector, text) => {
    const el = root.querySelector(selector);
    if (el) el.textContent = text;
  };
  set('#paletteHeadCount', `${counts.answered}/${counts.total}`);
  set('#paletteSummary', `${counts.answered}/${counts.total}`);
  set('#runnerProgress', `Question ${index + 1} of ${counts.total} · ${counts.answered} answered · ${counts.unanswered} left${counts.flagged ? ` · ${counts.flagged} flagged` : ''}`);
}

/** Repaint everything (language switch, focus mode, resume). */
function paintAll(root) {
  root.innerHTML = markup();
}

/* -------------------------------------------------------------- actions --- */

async function persist() {
  // The router may have torn the session down while a save was in flight.
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

/** Everything an answer-level action needs after the model changed. */
function afterAnswerChange(root) {
  const { id } = currentQuestion();
  const response = responseFor(id);
  // A revealed answer brings its explanation, which is markup the card did not
  // have before — that repaint is real. Everything else (selecting, flagging,
  // clearing, marking confidence) is a property of controls that already
  // exist, so it is patched onto those very controls: the node the reader just
  // pressed stays the node they are holding, and focus, scroll and reading
  // position do not move.
  // A reveal (or its removal, when a response is cleared) changes what the card
  // *is* — explanation, key marking, the "Check answer" control — so that one
  // transition repaints. Everything else is patched onto the existing controls.
  const card = root.querySelector('#questionCard');
  const wasRevealed = card?.dataset.revealed === 'true';
  const isRevealed = session.test.config.feedback_mode === 'learning' && Boolean(response.revealed);
  if (isRevealed !== wasRevealed) paintCard(root);
  else syncCardControls(root, response);
  paintPalette(root);
}

/** Patch the card's own controls to match the stored response. */
function syncCardControls(root, response) {
  const card = root.querySelector('#questionCard');
  if (!card) return;
  const selected = new Set(response.selected || []);
  card.querySelectorAll('[data-action="select"]').forEach((button) => {
    button.setAttribute('aria-pressed', String(selected.has(button.dataset.key)));
  });
  const flag = card.querySelector('[data-action="flag"]');
  if (flag) {
    flag.setAttribute('aria-pressed', String(Boolean(response.flagged)));
    flag.textContent = response.flagged ? '⚑ Remove flag' : '⚑ Mark for review';
  }
  const clear = card.querySelector('[data-action="clear"]');
  if (clear) clear.disabled = !selected.size;
  card.querySelectorAll('[data-action="confidence"]').forEach((button) => {
    const value = button.dataset.value || null;
    button.setAttribute('aria-pressed', String(Boolean(value) && response.confidence === value));
  });
  // The confidence line changes words ("Not marked" ↔ "Marked: …" ↔ the
  // remove control), so that one paragraph is rebuilt in place.
  const status = card.querySelector('.confidence-box [role="status"]');
  const remove = card.querySelector('.confidence-box [data-action="confidence"][data-value=""]');
  if (status) status.textContent = response.confidence ? `Marked: ${confidenceLabel(response.confidence)}` : 'Not marked';
  if (response.confidence && !remove && status?.parentElement) {
    const button = document.createElement('button');
    button.className = 'btn btn-sm btn-quiet';
    button.type = 'button';
    button.dataset.action = 'confidence';
    button.dataset.value = '';
    button.setAttribute('aria-keyshortcuts', 'c');
    button.textContent = '✕ Remove mark';
    // Same parent as the status line: inserting into the box rather than its
    // row would put the button outside the row it belongs to.
    status.parentElement.insertBefore(button, status);
  } else if (!response.confidence && remove) {
    remove.remove();
  }
}

async function selectOption(ctx, root, key) {
  const { id, question } = currentQuestion();
  const response = responseFor(id);
  const multi = question.question_type === 'multiple_correct';
  let selected;
  if (multi) {
    const set = new Set(response.selected || []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    selected = Array.from(set);
  } else {
    selected = [key];
  }
  // Learning mode reveals a single-answer pick in the same repaint.
  const revealNow = session.test.config.feedback_mode === 'learning' && !multi;
  await tests.updateResponse(session.test, id, { selected, revealed: revealNow });
  await persist();
  afterAnswerChange(root);
}

async function reveal(ctx, root) {
  const { id } = currentQuestion();
  await tests.updateResponse(session.test, id, { revealed: true });
  await persist();
  afterAnswerChange(root);
}

async function toggleFlag(ctx, root) {
  const { id } = currentQuestion();
  const response = responseFor(id);
  await tests.updateResponse(session.test, id, { flagged: !response.flagged });
  await persist();
  afterAnswerChange(root);
}

async function clearResponse(ctx, root) {
  const { id } = currentQuestion();
  await tests.updateResponse(session.test, id, { selected: [], revealed: false });
  await persist();
  afterAnswerChange(root);
}

async function setConfidence(ctx, root, value) {
  const { id } = currentQuestion();
  await tests.updateResponse(session.test, id, { confidence: value || null });
  await persist();
  afterAnswerChange(root);
}

/** Move to a question. Repaints the card and palette, then scrolls to the card. */
async function goto(ctx, root, index, { scroll = true } = {}) {
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
  paintCard(root, { keepFocus: false });
  paintPalette(root);
  if (scroll) {
    document.body?.classList.remove('palette-open');
    const toggle = root.querySelector('[data-action="palette-toggle"]');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    const card = document.getElementById('questionCard');
    if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'start' });
  }
}

/**
 * Jump to the next question matching a predicate, wrapping once. This is the
 * "I have two minutes and seven blanks" shortcut: it never changes anything but
 * the current index.
 */
async function jumpTo(ctx, root, predicate, label) {
  const { test } = session;
  const total = test.question_ids.length;
  const from = test.current_index || 0;
  for (let step = 1; step <= total; step += 1) {
    const index = (from + step) % total;
    if (predicate(test.question_ids[index], index)) {
      if (index === from) {
        toast(`This is the only ${label} question — you are on it.`, 'info');
        return;
      }
      await goto(ctx, root, index);
      return;
    }
  }
  toast(`There are no ${label} questions.`, 'info');
}

/* --------------------------------------------------------- submission --- */

/**
 * The submission sheet: what is answered, what is not, what is still flagged,
 * the rules that will score it — and, next to Submit, a way back to the first
 * unanswered question. A prose confirmation told the reader about a problem it
 * gave them no way to fix.
 */
async function submitWithConfirmation(ctx, { auto = false, root = null } = {}) {
  const test = session.test;
  if (!test.config.scoring?.rules) {
    const rules = await askForRules();
    if (!rules) return false;
    test.config.scoring = { ...test.config.scoring, rules, source: 'user_configured', rulesSourceNote: 'Rules you configured when submitting this test.', needsConfiguration: false };
  }
  const progress = tests.testProgress(test);
  if (!auto) {
    const requiredMissing = test.config.confidence === 'required' ? test.question_ids.filter((id) => responseFor(id).selected?.length && !responseFor(id).confidence).length : 0;
    const firstUnanswered = test.question_ids.findIndex((id) => !responseFor(id).selected?.length);
    const rules = test.config.scoring.rules;
    const rows = [
      ['Answered', `${progress.answered} of ${progress.total}`, progress.answered === progress.total ? 'ok' : ''],
      ['Unanswered', `${progress.unanswered}`, progress.unanswered ? 'warn' : ''],
      ['Marked for review', `${progress.flagged}`, progress.flagged ? 'warn' : ''],
      ...(test.config.confidence === 'required' ? [['Confidence missing', `${requiredMissing}`, requiredMissing ? 'bad' : '']] : []),
    ];
    const value = await openModal({
      title: 'Submit this test?',
      wide: false,
      body: `
        <div class="submit-summary">
          ${rows
            .map(
              ([label, value2, tone]) => `<div class="submit-row ${tone}"><span>${esc(label)}</span><strong>${esc(value2)}</strong></div>`,
            )
            .join('')}
          <div class="submit-row"><span>Scoring</span><strong>${esc(
            [`+${rules.marks_per_correct} correct`, rules.negative_marking_enabled ? `−${rules.negative_marks_per_incorrect} incorrect` : 'no negative marking', `${rules.marks_for_unanswered} unanswered`].join(' · '),
          )}</strong></div>
        </div>
        <p class="small muted mt-3 mb-0">${
          progress.unanswered
            ? `${progress.unanswered} question(s) will be left unanswered — they are not guessed for you. You can go back to them instead of submitting.`
            : 'Every question has an answer. Submitting now scores the test as it stands.'
        }</p>`,
      actions: [
        { label: 'Keep working', value: 'cancel' },
        { label: 'Submit and see results', tone: 'btn-primary', value: 'submit' },
        ...(progress.unanswered || progress.flagged ? [{ label: progress.unanswered ? 'Go to first unanswered' : 'Go to first flagged', value: 'fix' }] : []),
      ],
    });
    if (value === 'fix') {
      const target = progress.unanswered ? firstUnanswered : test.question_ids.findIndex((id) => responseFor(id).flagged);
      if (root && target >= 0) await goto(ctx, root, target);
      return false;
    }
    if (value !== 'submit') return false;
  }
  attributeElapsed();
  try {
    await tests.submitTest(test, { auto });
    if (session.ticker) clearInterval(session.ticker);
    session.ticker = null;
    document.body?.classList.remove('runner-focus');
    document.body?.classList.remove('palette-open');
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

/* ------------------------------------------------------------- ticking --- */

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

/* -------------------------------------------------------------- attach --- */

/**
 * All controls are handled by one delegated listener on `#view`, so repainting
 * part of the screen can never leave a control without a handler — or bind the
 * same handler twice.
 */
function attach(ctx, root, { keepTimer = false } = {}) {
  {
    // One delegated listener per render of this screen. The router aborts the
    // previous render's signal before a new screen paints, so this can never
    // pile up — and because the listener is on the container, repainting the
    // card or the palette never costs a re-bind.
    root.addEventListener(
      'click',
      async (ev) => {
        const langBtn = ev.target.closest('[data-lang]');
        if (langBtn && root.contains(langBtn)) {
          session.lang = langBtn.dataset.lang;
          session.test.language = langBtn.dataset.lang;
          await persist();
          paintAll(root);
          return;
        }
        const btn = ev.target.closest('[data-action]');
        if (!btn || !root.contains(btn)) return;
        const action = btn.dataset.action;
        if (action === 'lang') return;
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
        else if (action === 'next-unanswered') await jumpTo(ctx, root, (id) => !responseFor(id).selected?.length, 'unanswered');
        else if (action === 'next-flagged') await jumpTo(ctx, root, (id) => Boolean(responseFor(id).flagged), 'flagged');
        else if (action === 'palette-filter') {
          session.paletteFilter = btn.dataset.filter;
          paintPalette(root);
        } else if (action === 'palette-toggle') {
          const open = !document.body.classList.contains('palette-open');
          document.body.classList.toggle('palette-open', open);
          root.querySelectorAll('[data-action="palette-toggle"]').forEach((toggle) => toggle.setAttribute('aria-expanded', String(open)));
        } else if (action === 'focus-mode') {
          document.body?.classList.toggle('runner-focus');
          paintAll(root);
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
          paintAll(root);
          if (test.status === 'in_progress') startTicker(ctx, root);
        }
      },
      { signal: ctx.signal },
    );
    wireKeyboard(ctx, root);
  }
  if (keepTimer && session.ticker === null && session.test.status === 'in_progress') startTicker(ctx, root);
}

/**
 * Show or hide the shortcut legend in place (no repaint, so nothing moves).
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

async function wireKeyboard(ctx, root) {
  const handler = async (ev) => {
    const tag = ev.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target?.isContentEditable) return;
    if (document.getElementById('modalRoot')?.hidden === false) return;
    if (ev.key === 'Escape') {
      if (session?.legendOpen && !ev.defaultPrevented) {
        ev.preventDefault();
        setLegendOpen(root, false);
      }
      if (document.body.classList.contains('palette-open')) {
        document.body.classList.remove('palette-open');
        root.querySelectorAll('[data-action="palette-toggle"]').forEach((toggle) => toggle.setAttribute('aria-expanded', 'false'));
      }
      return;
    }
    // Browser and system shortcuts are not ours.
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
    } else if (ev.key === ']') {
      ev.preventDefault();
      await jumpTo(ctx, root, (id) => !responseFor(id).selected?.length, 'unanswered');
    } else if (ev.key === '[') {
      ev.preventDefault();
      await jumpTo(ctx, root, (id) => Boolean(responseFor(id).flagged), 'flagged');
    } else if (ev.key.toLowerCase() === 'f') {
      ev.preventDefault();
      await toggleFlag(ctx, root);
    } else if (ev.key.toLowerCase() === 'u') {
      ev.preventDefault();
      await clearResponse(ctx, root);
    } else if (ev.key.toLowerCase() === 'd') {
      ev.preventDefault();
      document.body.classList.toggle('runner-focus');
      paintAll(root);
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

/** Remove the document listeners added for this session. */
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
      return `<h1>Test</h1>${notice('That test session was not found in local storage. It may have been deleted by a restore. <a href="#/test-centre">Back to Papers</a>.', 'warn')}`;
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
    document.body?.classList.remove('palette-open');
    attach(ctx, root, {});
    startTicker(ctx, root);
    if (session.test.status === 'paused') {
      toast('This test is paused. Press Resume to continue the clock.', 'info');
    }
  },

  /**
   * Called by the router before another screen renders: stop the ticker and
   * release the document listeners, but never rewind the clock (opening the
   * test again reconciles the elapsed wall-clock time).
   */
  async cleanup() {
    if (session?.ticker) clearInterval(session.ticker);
    unwireKeyboard();
    document.body?.classList.remove('runner-focus');
    document.body?.classList.remove('palette-open');
    if (session?.test && session.test.status === 'in_progress') {
      await tests.saveTest(session.test).catch((err) => console.warn('Could not save the test on leaving the screen', err));
    }
    session = null;
  },
};

export default view;
export { askForRules, session as _session };
