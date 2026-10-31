/**
 * report.js — Detailed post-test report.
 *
 * Shows the score with the rules that produced it, counts, topic performance,
 * time per question, confidence analysis, weak areas, repeated mistakes,
 * revision recommendations and a filterable question-by-question review.
 * Reviewing every question is encouraged but never forced: leaving is one click.
 */

import { STORES } from '../../core/constants.js';
import * as db from '../../core/db.js';
import { state } from '../../core/state.js';
import {
  esc,
  badge,
  notice,
  dataTable,
  pct,
  renderExplanation,
  answerKeyBadge,
  confidenceLabel,
  emptyState,
  tabs,
  mountTabs,
  toast,
  openModal,
  demoBadge,
  langAttr,
  infoToggle,
  segmented,
  metaLine,
  barRows,
} from '../components.js';
import { fmtMarks, fmtClock, fmtDate, fmtPct, todayKey } from '../../core/util.js';
import { getQuestion } from '../../services/questions.js';
import { describeRules } from '../../services/scoring.js';
import { ensureRevisionRecord, allRevisionRecords } from '../../services/revision.js';
import * as tests from '../../services/tests.js';
import { startTopicSession } from './shared.js';
import { openReviewPanel } from '../reviewpanel.js';

const FILTERS = [
  { id: 'all', label: 'All questions' },
  { id: 'incorrect', label: 'Incorrect' },
  { id: 'skipped', label: 'Skipped' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'low_confidence', label: 'Low confidence' },
  { id: 'unresolved', label: 'Unresolved answers' },
  { id: 'unscored', label: 'Not scored' },
];

let viewState = { filter: 'all', expanded: {} };

function outcomeBadge(row) {
  const tones = { correct: 'ok', incorrect: 'bad', unanswered: 'warn', unscored: '' };
  const labels = { correct: 'correct', incorrect: 'incorrect', unanswered: 'unanswered', unscored: 'not scored' };
  return badge(labels[row.outcome] || row.outcome, tones[row.outcome] || '');
}

function rowMatches(row, filter) {
  switch (filter) {
    case 'incorrect':
      return row.outcome === 'incorrect';
    case 'skipped':
      return row.outcome === 'unanswered';
    case 'flagged':
      return row.flagged;
    case 'low_confidence':
      return row.confidence === 'unsure' || row.confidence === 'guessed';
    case 'unresolved':
      return Boolean(row.disputed || (!row.supplied_answer && !row.verified_answer) || row.excluded_for_unresolved);
    case 'unscored':
      return row.outcome === 'unscored';
    default:
      return true;
  }
}

const OUTCOME_MARK = {
  correct: { mark: '✓', word: 'correct', tone: 'ok' },
  incorrect: { mark: '✗', word: 'wrong', tone: 'bad' },
  unanswered: { mark: '–', word: 'left blank', tone: 'blank' },
  unscored: { mark: '·', word: 'not scored', tone: 'blank' },
};

/**
 * One line per question, collapsed. The reader scans a hundred lines, opens the
 * two they want to understand, and the full question, options, key, explanation
 * and actions are all still there when they do. Nothing is deleted: the line is
 * one click from the card it replaces.
 */
function questionReviewBlock(row, question, lang, position = null) {
  if (!question) return `<p class="quiet-note">Question ${esc(row.question_id)} is no longer in the local database.</p>`;
  const variant = question.language_variants?.[lang] || Object.values(question.language_variants || {})[0];
  const selected = row.selected || [];
  const outcome = OUTCOME_MARK[row.outcome] || OUTCOME_MARK.unscored;
  const origin = [question.year ? `MPPSC ${esc(String(question.year))}` : null, row.question_number ? `Paper Q${esc(String(question.question_number))}` : null].filter(Boolean).join(' · ');
  const stem = esc(variant?.question_text || '');
  const shortStem = stem.length > 116 ? `${stem.slice(0, 116).trimEnd()}…` : stem;
  const yourAnswer = selected.length ? selected.join(', ') : '—';
  const key = row.answer?.length ? row.answer.join(', ') : 'none';
  return `
    <article class="review-item" data-review="${esc(row.question_id)}">
      <button class="review-line" type="button" data-action="expand" data-qid="${esc(row.question_id)}" aria-expanded="false">
        <span class="review-num">${position ?? '—'}</span>
        <span class="review-stem${lang === 'hi' ? ' hi' : ''}"${langAttr(variant?.question_text, lang)}>${shortStem}</span>
        <span class="review-mark is-${outcome.tone}" title="${esc(outcome.word)}"><b aria-hidden="true">${outcome.mark}</b><span class="sr-only">${esc(outcome.word)}</span></span>
        <span class="review-key">you ${esc(yourAnswer)} <span aria-hidden="true">/</span> key ${esc(key)}</span>
        <span class="review-time">${fmtClock(Math.round((row.time_spent_ms || 0) / 1000))}</span>
      </button>
      <div class="review-body" hidden>
        <div class="question-head">
          <p class="question-meta">
            <span class="question-num-pill">Q${position ?? '—'}</span>
            ${origin ? `<span class="question-origin">${origin}</span>` : ''}
            <span class="question-class">${esc([row.subject, row.topic].filter(Boolean).join(' · ') || 'Unclassified')}</span>
            ${row.flagged ? `<span class="text-warn">flagged</span>` : ''}
            ${row.confidence ? `<span>confidence: ${esc(confidenceLabel(row.confidence))}</span>` : ''}
            ${row.demonstration ? '<span>demonstration</span>' : ''}
          </p>
          <div class="question-tools">${answerKeyBadge(question.supplied?.status)}${row.answer?.length ? '' : badge('answer key missing', 'bad')}</div>
        </div>
        <p class="question-text ${lang === 'hi' ? 'hi' : ''}"${langAttr(variant?.question_text, lang)}>${stem}</p>
        <table class="review-options"><tbody>
          ${(variant?.options || [])
            .map((opt) => {
              const isAnswer = (row.answer || []).includes(opt.key);
              const wasSelected = selected.includes(opt.key);
              const cls = [isAnswer ? 'is-key' : '', wasSelected ? 'is-picked' : ''].filter(Boolean).join(' ');
              return `<tr class="${cls}"><td class="mono col-key">${esc(opt.key)}</td><td${langAttr(opt.text, lang)}>${esc(opt.text)}</td>
                <td class="col-choice">${isAnswer ? '<span class="tag">key</span>' : ''}${wasSelected ? '<span class="tag is-you">you</span>' : ''}</td></tr>`;
            })
            .join('')}
        </tbody></table>
        <p class="small mt-2">
          Answer used for scoring: <strong>${esc(key)}</strong>
          ${row.answer_basis ? `(${esc(row.answer_basis === 'verified' ? 'your verified answer' : 'the stored answer key')})` : ''}
          ${row.supplied_answer && row.verified_answer && row.supplied_answer.join(',') !== row.verified_answer.join(',') ? `, the stored key said <strong>${esc(row.supplied_answer.join(', '))}</strong>, your verified answer is <strong>${esc(row.verified_answer.join(', '))}</strong> — both are preserved.` : ''}
          ${row.note ? `<br /><span class="soft">${esc(row.note)}</span>` : ''}
        </p>
        ${renderExplanation(question)}
        <div class="row tight mt-3">
          <button class="quiet-action" type="button" data-action="history" data-qid="${esc(row.question_id)}">Attempt history</button>
          <button class="quiet-action" type="button" data-action="queue-revision" data-qid="${esc(row.question_id)}">Add to revision</button>
          <a class="quiet-action" href="#/bank/question/${encodeURIComponent(row.question_id)}">Open in the bank</a>
        </div>
      </div>
    </article>`;
}

export default {
  title: 'Test report',

  async render(ctx) {
    const [testId] = ctx.params;
    const test = await db.get(STORES.TESTS, testId);
    viewState.testId = testId;
    viewState.result = test?.result || null;
    if (!test) return `<h1>Test report</h1>${notice('That test report is no longer stored. <a href="#/test-centre">Back to the test centre</a>.', 'warn')}`;
    if (test.status !== 'submitted' || !test.result) {
      return `<h1>${esc(test.label || 'Test report')}</h1>${notice(`This test has not been submitted yet. <a href="#/runner/${esc(test.id)}">Continue the test</a> or <a href="#/test-centre">go back</a>.`, 'info')}`;
    }
    const result = test.result;
    viewState.filter = viewState.filter || 'all';
    const questions = new Map();
    for (const row of result.per_question) {
      if (!questions.has(row.question_id)) questions.set(row.question_id, await getQuestion(row.question_id));
    }

    const counts = result.counts;
    const judgedCount = counts.correct + counts.incorrect;
    const filtered = result.per_question.filter((row) => rowMatches(row, viewState.filter));
    const unresolved = result.unresolved_answers || [];
    const repeated = await repeatedMistakesFor(result.per_question.map((r) => r.question_id));
    const recommendations = buildRecommendations(result, test);

    const weakTopics = (result.per_topic || [])
      .filter((t) => t.correct + t.incorrect > 0)
      .sort((a, b) => a.accuracy - b.accuracy);
    const incorrectIds = result.per_question.filter((r) => r.outcome === 'incorrect').map((r) => r.question_id);
    const flaggedRows = result.per_question.filter((r) => r.flagged);
    const practiceSize = Math.min(20, Math.max(5, weakTopics[0]?.correct + weakTopics[0]?.incorrect || 0));

    // Questions from *this* sitting that are due for revision today, and the
    // pool the weak-topic action would draw from. Both are real sets, so the
    // buttons can state their size instead of promising a vague session.
    const testQuestionIds = new Set(result.per_question.map((row) => row.question_id));
    const dueFromThisTest = (await allRevisionRecords()).filter(
      (rec) => testQuestionIds.has(rec.question_id) && rec.next_due && rec.next_due <= todayKey(),
    ).length;
    const weakTopicKeys = new Set(
      weakTopics.filter((t) => t.accuracy < 0.6).map((t) => `${t.subject || 'Unclassified'}||${t.topic || 'Unclassified'}`),
    );
    const weakPoolSize = Array.from(state.questionIndex.values()).filter((meta) =>
      weakTopicKeys.has(`${meta.subject || 'Unclassified'}||${meta.topic || 'Unclassified'}`),
    ).length;

    // 1 — the result, as one figure and one bar, with the rules behind a disclosure.
    const filterCounts = FILTERS.map((f) => ({ ...f, n: result.per_question.filter((r) => rowMatches(r, f.id)).length }));
    const shownFilters = filterCounts.filter((f) => f.id === 'all' || f.n > 0);
    const reviewBody = `
      <div class="filter-row" role="group" aria-label="Filter the review">
        ${shownFilters
          .map(
            (f) => `<button class="quiet-action${viewState.filter === f.id ? ' is-active' : ''}" type="button" data-action="filter" data-filter="${f.id}">${esc(
              f.id === 'all' ? 'All' : f.label.replace(' questions', '').replace(' answers', ''),
            )} ${f.n}</button>`,
          )
          .join('')}
      </div>
      ${
        filtered.length
          ? `<div class="review-lines">${filtered
              .map((row) => questionReviewBlock(row, questions.get(row.question_id), test.language || state.settings.language, result.per_question.indexOf(row) + 1))
              .join('')}</div>`
          : `<p class="quiet-note">Nothing matches this filter. Leaving the review here is fine — the score above is final.</p>`
      }`;

    const headline = `
      <section class="sheet report-headline">
        <div class="score-line">
          <p class="score-figure">${esc(fmtMarks(result.score))}<small> / ${esc(fmtMarks(result.max_marks))}</small></p>
          <div class="score-aside">
            ${segmented(
              [
                { label: 'correct', value: counts.correct, tone: 'ok' },
                { label: 'wrong', value: counts.incorrect, tone: 'bad' },
                { label: 'left blank', value: counts.unanswered, tone: 'blank' },
              ],
              { label: `${counts.correct} correct, ${counts.incorrect} wrong, ${counts.unanswered} left blank` },
            )}
            ${metaLine([
              `${result.accuracy === null ? 'no' : esc(fmtPct(result.accuracy, 0))} accuracy over ${judgedCount} judged`,
              `${counts.unscored} not scored`,
              `negative marks ${esc(fmtMarks(result.negative_marks_applied))}`,
            ])}
          </div>
        </div>
        ${result.accuracy_note ? notice(esc(result.accuracy_note), 'warn') : ''}
        ${result.warnings?.length ? notice(`<ul class="m-0">${result.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`, 'warn', { title: 'Read with the score' }) : ''}
        ${infoToggle(
          'Scoring rules actually used',
          `<p class="small m-0">${esc(describeRules(result.scoring, result.scoring?.source))}</p>
           ${result.scoring?.rules_source_note ? `<p class="small m-0 mt-1">${esc(result.scoring.rules_source_note)}</p>` : ''}
           ${test.config.feedback_mode === 'learning' ? '<p class="small m-0 mt-1">This sitting ran in learning mode, so answers were revealed as you went.</p>' : ''}`,
        )}
      </section>`;

    // 2 — three lines of work, each of which starts something real.
    const actions = `
      <section class="sheet">
        <p class="section-label">Do something about it</p>
        <div class="action-rows">
          <div class="action-row">
            <div class="action-row-main">
              <p class="action-row-title">Answer the ${incorrectIds.length || 'no'} you got wrong</p>
              <p class="action-row-meta">Learning mode, in the order they were asked.</p>
            </div>
            <button class="btn btn-sm btn-primary" type="button" data-action="retry-incorrect" ${incorrectIds.length ? '' : 'disabled'}>Retry ${incorrectIds.length || ''} incorrect</button>
          </div>
          <div class="action-row">
            <div class="action-row-main">
              <p class="action-row-title">Practise the ${weakTopicKeys.size || 'no'} weak topic${weakTopicKeys.size === 1 ? '' : 's'}</p>
              <p class="action-row-meta">Weakest first, from ${weakPoolSize} stored question${weakPoolSize === 1 ? '' : 's'}.</p>
            </div>
            <button class="btn btn-sm" type="button" data-action="practise-weak" ${weakTopicKeys.size ? '' : 'disabled'}>Practise ${Math.min(practiceSize, weakPoolSize) || ''}</button>
          </div>
          <div class="action-row">
            <div class="action-row-main">
              <p class="action-row-title">Revise the ${dueFromThisTest || 'no'} due from this sitting</p>
              <p class="action-row-meta">${dueFromThisTest ? 'Scheduled on or before today.' : 'Nothing from this sitting is due yet.'}</p>
            </div>
            <button class="btn btn-sm" type="button" data-action="revise-due" ${dueFromThisTest ? '' : 'disabled'}>Revise ${dueFromThisTest || ''}</button>
          </div>
        </div>
        ${
          unresolved.length
            ? `<p class="overlap-line"><strong>${unresolved.length}</strong> question(s) were judged with a missing or disputed key. <button class="quiet-action" type="button" data-action="resolve">Fix unresolved answers</button></p>`
            : ''
        }
      </section>`;

    // 3 — weak topics as bars: the same numbers, without a badge per cell.
    const weak = `
      <section class="sheet">
        <div class="sheet-head">
          <p class="section-label">Weakest topics in this sitting</p>
          ${flaggedRows.length ? `<button class="quiet-action" type="button" data-action="filter" data-filter="flagged">Show ${flaggedRows.length} flagged</button>` : ''}
        </div>
        ${
          weakTopics.length
            ? barRows(
                weakTopics.slice(0, 8).map((t) => ({
                  name: `${esc(t.topic || t.subject || 'Unclassified')}<small>${esc(t.subject || '—')} <span aria-hidden="true">/</span> ${t.correct} of ${t.correct + t.incorrect} correct</small>`,
                  value: t.accuracy,
                  valueLabel: pct(t.accuracy),
                  action: `<button class="btn btn-sm" type="button" data-action="practise-topic" data-subject="${esc(t.subject || '')}" data-topic="${esc(t.topic || '')}">Practise ${practiceSize}</button>`,
                })),
              ) + (weakTopics.length > 8 ? `<p class="tiny text-soft mt-2 mb-0">The eight weakest of ${weakTopics.length} topics with judged answers.</p>` : '')
            : `<p class="quiet-note m-0">Nothing here was scored topic by topic, so this sitting says nothing about any topic.</p>`
        }
      </section>`;

    // 4 — the review: one line per question, opening in place.
    const review = `
      <section class="sheet">
        <div class="sheet-head">
          <p class="section-label">Question review</p>
          <button class="quiet-action" type="button" data-action="practise-filtered" ${filtered.length ? '' : 'disabled'}>Practise these ${filtered.length}</button>
        </div>
        ${reviewBody}
      </section>`;

    // 5 — the details: confidence, pacing, repeated mistakes, unresolved keys.
    const details = `
      <section class="sheet">
        <p class="section-label">The details</p>
        ${tabs({
          id: 'reportTabs',
          activeId: 'tabs-confidence',
          items: [
            {
              id: 'tabs-confidence',
              label: 'Confidence',
              body:
                test.config.confidence === 'off'
                  ? emptyState({ title: 'Confidence tracking was off for this sitting', message: 'Turn it on in Settings or when starting a test to see how sure you felt against what you got right.' })
                  : `${dataTable({
                      columns: [{ label: 'Confidence' }, { label: 'Correct', num: true }, { label: 'Incorrect', num: true }, { label: 'Left blank', num: true }],
                      rows: ['confident', 'unsure', 'guessed', 'none'].map((level) => {
                        const rows = result.per_question.filter((r) => (r.confidence || 'none') === level);
                        return [
                          esc(level === 'none' ? 'not marked' : confidenceLabel(level)),
                          String(rows.filter((r) => r.outcome === 'correct').length),
                          String(rows.filter((r) => r.outcome === 'incorrect').length),
                          String(rows.filter((r) => r.outcome === 'unanswered').length),
                        ];
                      }),
                      className: 'compact',
                    })}
                    ${counts.confidentIncorrect ? `<p class="quiet-note">${counts.confidentIncorrect} confident answer(s) were wrong — check whether two similar concepts are being confused.</p>` : ''}
                    ${counts.lowConfidenceCorrect ? `<p class="quiet-note">${counts.lowConfidenceCorrect} correct answer(s) were unsure or guessed, so they come back sooner instead of counting as mastered.</p>` : ''}`,
            },
            {
              id: 'tabs-pacing',
              label: 'Pacing',
              body: dataTable({
                columns: [{ label: 'Q' }, { label: 'Topic' }, { label: 'Outcome' }, { label: 'Time', num: true }, { label: 'Confidence' }],
                rows: result.per_question
                  .map((r, i) => [
                    esc(`Q${i + 1}`),
                    esc(r.topic || r.subject || 'Unclassified'),
                    outcomeBadge(r),
                    fmtClock(Math.round((r.time_spent_ms || 0) / 1000)),
                    r.confidence ? esc(confidenceLabel(r.confidence)) : '<span class="soft">—</span>',
                  ])
                  .slice(0, 40),
                className: 'compact',
              }),
            },
            {
              id: 'tabs-next',
              label: 'Recommendations',
              body: recommendations.length
                ? `<ul class="m-0">${recommendations.map((r) => `<li>${r}</li>`).join('')}</ul>`
                : '<p class="muted small m-0">Nothing stands out yet — no pattern was strong enough to recommend a change.</p>',
            },
            {
              id: 'tabs-repeated',
              label: 'Repeated mistakes',
              body: repeated.length
                ? dataTable({
                    columns: [{ label: 'Question' }, { label: 'Topic' }, { label: 'Times wrong', num: true }, { label: '' }],
                    rows: repeated.map((r) => [
                      esc(`Q${r.question_number ?? r.question_id}`),
                      esc(r.topic || r.subject || '—'),
                      String(r.occurrences),
                      `<button class="quiet-action" type="button" data-action="history" data-qid="${esc(r.question_id)}">History</button>`,
                    ]),
                    className: 'compact',
                  })
                : '<p class="muted small m-0">No repeated mistakes among these questions.</p>',
            },
            {
              id: 'tabs-unresolved',
              label: `Unresolved (${unresolved.length})`,
              body: unresolved.length
                ? `${dataTable({
                    columns: [{ label: 'Question' }, { label: 'Issue' }, { label: 'Stored key' }, { label: 'Your verified answer' }, { label: '' }],
                    rows: unresolved.map((u) => [
                      esc(u.question_id),
                      esc(u.reason),
                      u.supplied ? esc(u.supplied.join(', ')) : '<span class="soft">missing</span>',
                      u.verified ? esc(u.verified.join(', ')) : '<span class="soft">none</span>',
                      `<a class="quiet-action" href="#/bank/question/${encodeURIComponent(u.question_id)}">Review</a>`,
                    ]),
                    className: 'compact',
                  })}<p class="quiet-note">The stored key is preserved; nothing was rewritten.</p>`
                : '<p class="muted small m-0">Every question here was judged with a usable key.</p>',
            },
          ],
        })}
      </section>`;

    const paperBits = [test.paper_snapshot?.exam, test.paper_snapshot?.year, test.paper_snapshot?.set_code ? `set ${test.paper_snapshot.set_code}` : null].filter(Boolean);
    return `
      <nav class="crumbs" aria-label="Breadcrumb">
        <ol><li><a href="#/dashboard">Today</a></li><li><a href="#/test-centre">Papers</a></li><li aria-current="page">Report</li></ol>
      </nav>
      <header class="screen-head">
        <div class="screen-head-text">
          <p class="eyebrow">How this sitting went</p>
          <h1>${esc(test.label || 'Test report')}</h1>
          ${metaLine([
            paperBits.length ? esc(paperBits.join(', ')) : '',
            `submitted ${esc(fmtDate(test.submitted_at))}`,
            result.auto_submitted ? 'automatically, when the timer expired' : '',
            `${counts.total} questions`,
          ])}
        </div>
        <div class="screen-actions">
          <button class="btn btn-sm btn-quiet" type="button" data-action="print">Print or save PDF</button>
          <a class="btn btn-sm btn-quiet" href="#/test-centre">Papers</a>
        </div>
      </header>

      ${headline}
      ${actions}
      ${weak}
      ${review}
      ${details}

      <section class="sticky-actions">
        <a class="btn btn-primary" href="#/test-centre">Done — back to papers</a>
        <button class="btn" type="button" data-action="retry-incorrect" ${incorrectIds.length ? '' : 'disabled'}>Retry the incorrect questions</button>
        ${unresolved.length ? '<button class="btn" type="button" data-action="resolve">Fix unresolved answers</button>' : ''}
      </section>`;
  },

  async mount(ctx, root) {
    mountTabs(root);
    root.querySelectorAll('[data-action="filter"]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        viewState.filter = btn.dataset.filter;
        // The router keeps the reader's place on a same-screen refresh, so
        // there is deliberately no scroll-to-top here.
        await ctx.refresh();
      }),
    );
    root.addEventListener('click', async (ev) => {
      const target = ev.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'print') window.print();
      if (action === 'expand') {
        // One line opens into the full question. The collapsed line is the
        // whole review at a glance; nothing below it is a second screen.
        const body = target.parentElement?.querySelector('.review-body');
        if (!body) return;
        const open = target.getAttribute('aria-expanded') === 'true';
        target.setAttribute('aria-expanded', String(!open));
        body.hidden = open;
        return;
      }
      if (action === 'history') {
        // One review panel for the whole app: what you answered, the key, the
        // explanation and every attempt, without leaving the report.
        const qid = target.dataset.qid;
        await openReviewPanel(qid, { title: `Attempt history — ${qid}`, focus: 'Every attempt on this question, including this sitting.' });
        return;
      }
      if (action === 'queue-revision') {
        await ensureRevisionRecord(target.dataset.qid, { reason: 'Added from a test report.' });
        toast('Added to the revision queue.', 'ok');
      }
      if (action === 'practise-topic') {
        await startTopicSession(ctx, {
          subject: target.dataset.subject || null,
          topic: target.dataset.topic || null,
          count: Number(target.textContent.replace(/\D/g, '')) || null,
          strategy: 'weakest-first',
          feedbackMode: 'learning',
        });
        return;
      }
      if (action === 'practise-filtered') {
        const ids = currentResult().per_question.filter((row) => rowMatches(row, viewState.filter)).map((row) => row.question_id);
        if (!ids.length) {
          toast('Nothing is in this filter.', 'info');
          return;
        }
        const session = await tests.createTest({
          kind: 'custom',
          label: `Review practice — ${ids.length} question(s)`,
          questionIds: ids,
          questionMetas: ids.map((id) => state.questionIndex.get(id)).filter(Boolean),
          config: { feedbackMode: 'learning' },
          orderSource: 'review-order',
          selectionNotes: [`The ${ids.length} question(s) in the “${viewState.filter}” filter of this report, in the order they were asked.`],
        });
        ctx.navigate(`runner/${encodeURIComponent(session.id)}`);
        return;
      }
      if (action === 'practise-weak') {
        const rows = currentResult().per_topic || [];
        const weak = rows.filter((t) => t.correct + t.incorrect > 0 && t.accuracy < 0.6);
        const keys = new Set(weak.map((t) => `${t.subject || 'Unclassified'}||${t.topic || 'Unclassified'}`));
        const ids = Array.from(state.questionIndex.values())
          .filter((meta) => keys.has(`${meta.subject || 'Unclassified'}||${meta.topic || 'Unclassified'}`))
          .map((meta) => meta.id)
          .slice(0, 20);
        if (!ids.length) {
          toast('No stored question matches those topics any more.', 'info');
          return;
        }
        const session = await tests.createTest({
          kind: 'custom',
          label: `Weak topics from a test — ${ids.length} question(s)`,
          questionIds: ids,
          questionMetas: ids.map((id) => state.questionIndex.get(id)).filter(Boolean),
          config: { feedbackMode: 'learning' },
          orderSource: 'weakest-first',
          selectionNotes: ['Built from the topics this sitting scored lowest.', ...weak.slice(0, 5).map((t) => `${t.topic || t.subject}: ${t.correct}/${t.correct + t.incorrect} correct`)],
        });
        ctx.navigate(`runner/${encodeURIComponent(session.id)}`);
        return;
      }
      if (action === 'revise-due') {
        const testIds = new Set(currentResult().per_question.map((row) => row.question_id));
        const ids = (await allRevisionRecords())
          .filter((rec) => testIds.has(rec.question_id) && rec.next_due && rec.next_due <= todayKey())
          .map((rec) => rec.question_id)
          .filter((id) => state.questionIndex.has(id));
        if (!ids.length) {
          toast('Nothing from this sitting is due for revision yet.', 'info');
          return;
        }
        const session = await tests.createTest({
          kind: 'revision',
          label: `Revision from a test — ${ids.length} due question(s)`,
          questionIds: ids,
          questionMetas: ids.map((id) => state.questionIndex.get(id)).filter(Boolean),
          config: { feedbackMode: 'learning' },
          orderSource: 'due',
          selectionNotes: ['Questions from this sitting whose revision date has arrived.'],
        });
        ctx.navigate(`runner/${encodeURIComponent(session.id)}`);
        return;
      }
      if (action === 'retry-incorrect') {
        const ids = currentResult().per_question.filter((r) => r.outcome === 'incorrect').map((r) => r.question_id);
        if (!ids.length) {
          toast('No incorrect answers in this test.', 'info');
          return;
        }
        const test = await tests.createTest({
          kind: 'mistake_retry',
          label: 'Retry: incorrect questions from an earlier test',
          questionIds: ids,
          questionMetas: [],
          config: { feedbackMode: 'learning' },
        });
        ctx.navigate(`runner/${test.id}`);
      }
      if (action === 'resolve') {
        const unresolved = currentResult().unresolved_answers || [];
        await openModal({
          title: 'Unresolved answers in this test',
          wide: true,
          body: `<p class="small">Record an independently verified answer where you are confident about it; the stored key stays untouched and the change is logged as a user correction.</p>
            ${dataTable({
              columns: [{ label: 'Question' }, { label: 'Issue' }, { label: '' }],
              rows: unresolved.map((u) => [esc(u.question_id), esc(u.reason), `<a class="btn btn-sm" href="#/bank/question/${encodeURIComponent(u.question_id)}">Open question</a>`]),
              className: 'compact',
            })}`,
          actions: [{ label: 'Close', tone: 'btn-primary', value: 'close' }],
        });
      }
    }, { signal: ctx.signal });
  },
};

function currentResult() {
  return viewState.result || { per_question: [], unanswered: [], unresolved_answers: [] };
}

async function repeatedMistakesFor(questionIds) {
  const rows = await db.getAll(STORES.MISTAKES);
  return rows.filter((m) => questionIds.includes(m.question_id) && m.occurrences >= 2).map((m) => ({ ...m, question_number: state.questionIndex.get(m.question_id)?.question_number }));
}

function buildRecommendations(result, test) {
  const out = [];
  const weak = (result.per_topic || []).filter((t) => t.correct + t.incorrect >= 2 && t.accuracy < 0.6);
  for (const topic of weak.slice(0, 3)) {
    out.push(`Revise <strong>${esc(topic.topic || topic.subject)}</strong> — accuracy here was ${Math.round(topic.accuracy * 100)}% over ${topic.correct + topic.incorrect} judged answer(s). Practise the same topic again from Topic Practice.`);
  }
  if (result.counts.unanswered > result.counts.total * 0.25) {
    out.push(`${result.counts.unanswered} questions were left unanswered. If that was intentional exam strategy, keep it; otherwise practise timed sets to build pacing — time per question is shown above.`);
  }
  if (result.counts.confidentIncorrect >= 2) {
    out.push(`${result.counts.confidentIncorrect} confident but wrong answers point to a specific confusion. Compare those options side by side in the Mistake Book before revising the whole topic.`);
  }
  if (result.counts.lowConfidenceCorrect >= 2) {
    out.push(`${result.counts.lowConfidenceCorrect} correct answers were guesses or uncertain. They have been scheduled to come back soon in the Revision Centre.`);
  }
  const unscored = result.counts.unscored || 0;
  if (unscored) {
    out.push(`${unscored} question(s) had no usable answer key and were excluded from the score. If you can establish the answer from the source paper, record it as a verified answer so future tests can judge them.`);
  }
  if (test.kind === 'pyq_full' && test.paper_snapshot && !test.paper_snapshot.original_order_preserved) {
    out.push('This simulation used a reconstructed paper order because the imported bank was missing order information. Check the source before comparing scores with the real paper.');
  }
  return out;
}
