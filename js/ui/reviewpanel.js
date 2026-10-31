/**
 * reviewpanel.js — one question-review panel, shared by every screen that asks
 * the reader to look at a question again.
 *
 * The Mistake Book and the Revision Centre were each carrying their own copy of
 * the same modal: attempt history table, question text, options, explanation.
 * The two copies drifted (one listed confidence, the other listed time; one
 * marked the key, the other did not), and neither said plainly what the reader
 * last answered. This module is that panel, once, written in the order a person
 * actually reviews a question:
 *
 *   1. what happened last time (outcome, your answer, the key, how long, how sure)
 *   2. the question, with both the key and your own answer marked
 *   3. the explanation that shipped with the bank (never invented)
 *   4. every previous attempt, oldest first, so a repeated mistake is visible
 *   5. caller-specific facts (why the item is in the book; how it was scheduled)
 *
 * The panel is a modal rather than a route because it is opened *from* a row
 * and returns to it: closing puts focus back on the row's button (openModal
 * restores focus), and the row's own actions are not repainted while it is open.
 */

import {
  esc,
  badge,
  dataTable,
  langAttr,
  openModal,
  renderExplanation,
  answerKeyBadge,
  confidenceLabel,
} from './components.js';
import { fmtClock, fmtDate, fmtRelative } from '../core/util.js';
import { attemptHistoryForQuestion, attemptTrend } from '../services/attempts.js';
import { getQuestions } from '../services/questions.js';

/** The bank's own text for a question, in its first available language. */
function variantsOf(question) {
  const variants = Object.entries(question?.language_variants || {});
  const [lang, first] = variants[0] || [null, null];
  return { lang, variant: first, options: first?.options || [] };
}

const keySet = (question) => new Set([].concat(question?.supplied?.answer || []).map(String));

/**
 * The verdict line: the one sentence a reader needs before reading anything
 * else. It never guesses — a question with no recorded attempt says so.
 */
export function verdictLine(questionId, trend) {
  const last = trend[trend.length - 1];
  if (!last) {
    return `<div class="review-verdict"><p class="m-0">No attempt on this question has been recorded, so there is nothing to compare. Attempt it and this panel fills itself.</p></div>`;
  }
  const outcome = last.outcome === 'correct' ? ['Correct', 'ok'] : last.outcome === 'incorrect' ? ['Incorrect', 'bad'] : ['Not answered', 'warn'];
  const given = (last.selected || []).length ? esc(last.selected.join(', ')) : '<span class="soft">nothing</span>';
  const seconds = Math.round((last.time_spent_ms || 0) / 1000);
  return `<div class="review-verdict">
    <p class="m-0">${badge(outcome[0], outcome[1])} on ${esc(fmtDate(last.at))} · you answered ${given}${
      last.key?.length ? ` · key ${esc(last.key.join(', '))}` : ''
    }${seconds ? ` · ${esc(fmtClock(seconds))} spent` : ''}${
      last.confidence ? ` · marked ${esc(confidenceLabel(last.confidence))}` : ''
    }</p>
    <p class="tiny muted m-0 mt-1">Attempt ${trend.length} of this question · ${esc(last.kind || 'unknown test kind')}</p>
  </div>`;
}

/** The question as it was stored, with the key and your last answer marked. */
export function questionBlock(question, trend, { lang = null } = {}) {
  if (!question) {
    return `<p class="muted small">This question is no longer in the question bank. The record of your attempts is kept, but the text is gone.</p>`;
  }
  const { lang: storedLang, variant, options } = variantsOf(question);
  const activeLang = lang || storedLang;
  const keys = keySet(question);
  const last = trend[trend.length - 1] || null;
  const chosen = new Set((last?.selected || []).map(String));
  return `
    <div class="review-question">
      <p class="review-question-text"${langAttr(variant?.question_text, activeLang)}>${esc(variant?.question_text || '')}</p>
      <ol class="review-options">
        ${options
          .map((option) => {
            const isKey = keys.has(String(option.key));
            const isChosen = chosen.has(String(option.key));
            const marks = [
              isKey ? '<span class="badge ok">key</span>' : '',
              isChosen ? '<span class="badge info">your answer</span>' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return `<li class="review-option${isKey ? ' is-key' : ''}${isChosen ? ' is-chosen' : ''}">
              <span class="review-option-key">${esc(option.key)}</span>
              <span class="review-option-text"${langAttr(option.text, activeLang)}>${esc(option.text)}</span>
              ${marks}
            </li>`;
          })
          .join('')}
      </ol>
      ${answerKeyBadge(question.supplied?.status) ? `<p class="m-0 mt-1">${answerKeyBadge(question.supplied?.status)}</p>` : ''}
    </div>`;
}

/** Every recorded attempt on the question, oldest first. */
export function historyBlock(trend, { caption = 'Attempts on this question' } = {}) {
  return `<div class="review-history">
    <h3>${esc(caption)}</h3>
    ${dataTable({
      columns: [{ label: '#' }, { label: 'When' }, { label: 'Outcome' }, { label: 'You answered' }, { label: 'Confidence' }, { label: 'Time' }],
      rows: trend.map((row) => [
        String(row.index),
        `<span title="${esc(fmtRelative(row.at))}">${esc(fmtDate(row.at))}</span>`,
        badge(
          row.outcome === 'correct' ? 'correct' : row.outcome === 'incorrect' ? 'incorrect' : 'not answered',
          row.outcome === 'correct' ? 'ok' : row.outcome === 'incorrect' ? 'bad' : 'warn',
        ),
        (row.selected || []).length ? esc(row.selected.join(', ')) : '<span class="soft">—</span>',
        row.confidence ? esc(confidenceLabel(row.confidence)) : '<span class="soft">—</span>',
        row.time_spent_ms ? esc(fmtClock(Math.round(row.time_spent_ms / 1000))) : '<span class="soft">—</span>',
      ]),
      empty: 'No attempts recorded on this question yet.',
      className: 'compact review-history-table',
    })}
  </div>`;
}

/**
 * Load everything the panel shows. Callers use this when they need the same
 * facts outside the modal (a row preview, a test assertion).
 */
export async function loadReview(questionId) {
  const [attempts, map] = await Promise.all([attemptHistoryForQuestion(questionId), getQuestions([questionId])]);
  // `attemptTrend` is the shared shape for history rows; the panel additionally
  // needs what was answered and what the key was, both of which live on the
  // attempt itself. They are copied across here rather than widening the
  // service's contract for one screen.
  const trend = attemptTrend(attempts).map((row, i) => ({
    ...row,
    selected: attempts[i].selected || [],
    key: [].concat(attempts[i].answer ?? attempts[i].supplied_answer ?? []).filter((v) => v !== null && v !== undefined),
  }));
  const question = map.get(questionId) || null;
  return { questionId, question, attempts, trend, last: trend[trend.length - 1] || null };
}

/**
 * The same content as the modal, as markup — for screens that open the review
 * *inside* their own list (a table row's detail panel) rather than over it.
 */
export function reviewBodyMarkup(review, { focus = '', extraBody = '' } = {}) {
  const { questionId, question, trend } = review;
  return `
    ${focus ? `<p class="review-focus small m-0">${esc(focus)}</p>` : ''}
    ${verdictLine(questionId, trend)}
    ${questionBlock(question, trend)}
    ${question ? renderExplanation(question) : ''}
    ${historyBlock(trend)}
    ${extraBody}`;
}

/**
 * Open the review panel.
 *
 * @param {string} questionId
 * @param {object} options
 *   title       — modal title (defaults to "Review — <id>")
 *   focus       — one line above the verdict, e.g. why the row is in the book
 *   extraBody   — caller-specific markup placed between history and explanation
 *   actions     — buttons rendered beside Close; each is { label, tone, action }
 *   onAction    — async (action, close) handler for those buttons
 * @returns {Promise<string|null>} the modal's resolved value
 */
export async function openReviewPanel(questionId, options = {}) {
  const { title = `Review — ${questionId}`, focus = '', extraBody = '', actions = [], onAction = null } = options;
  const review = await loadReview(questionId);
  const { question, trend } = review;

  const body = reviewBodyMarkup(review, { focus, extraBody });

  const values = actions.map((action, index) => ({ ...action, value: action.value || `act-${index}` }));
  return openModal({
    title,
    wide: true,
    body,
    onMount: (modal, close) => {
      if (!onAction) return;
      for (const action of values) {
        modal.querySelector(`[data-action="${action.value}"]`)?.addEventListener('click', async () => {
          await onAction(action.value, close);
        });
      }
    },
    actions: [
      ...values.map((action) => ({ label: action.label, value: action.value, tone: action.tone })),
      { label: 'Close', tone: values.length ? '' : 'btn-primary', value: 'close' },
    ],
  });
}

/** The question id inside a mistake/revision key (`<id>::<type>` or a bare id). */
export const questionIdFromKey = (key) => String(key || '').split('::')[0];
