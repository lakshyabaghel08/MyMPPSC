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
  card,
  notice,
  dataTable,
  pct,
  renderExplanation,
  answerKeyBadge,
  confidenceLabel,
  emptyState,
  cardInfo,
  tabs,
  mountTabs,
  toast,
  openModal,
  demoBadge,
  langAttr,
  infoToggle,
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

function questionReviewBlock(row, question, lang, position = null) {
  if (!question) return `<p class="muted small">Question ${esc(row.question_id)} is no longer in the local database.</p>`;
  const variant = question.language_variants?.[lang] || Object.values(question.language_variants || {})[0];
  const selected = row.selected || [];
  const origin = [question.year ? `MPPSC ${esc(String(question.year))}` : null, row.question_number ? `Paper Q${esc(String(row.question_number))}` : null].filter(Boolean).join(' · ');
  return `
    <article class="question-card mb-3 review-item">
      <div class="question-meta">
        <span class="question-num-pill">Q${position ?? '—'}</span>
        ${origin ? `<span class="question-origin">${origin}</span>` : ''}
        ${outcomeBadge(row)}
        <span class="question-class">${esc([row.subject, row.topic].filter(Boolean).join(' · ') || 'Unclassified')}</span>
        ${answerKeyBadge(question.supplied?.status)}
        ${row.answer?.length ? '' : badge('answer key missing', 'bad')}
        ${row.flagged ? badge('flagged', 'warn') : ''}
        ${row.confidence ? `<span class="tiny muted">confidence: ${esc(confidenceLabel(row.confidence))}</span>` : ''}
        ${demoBadge(row.demonstration)}
        <span class="soft tiny">${fmtClock(Math.round((row.time_spent_ms || 0) / 1000))}</span>
      </div>
      <p class="question-text ${lang === 'hi' ? 'hi' : ''}"${langAttr(variant?.question_text, lang)}>${esc(variant?.question_text || '')}</p>
      <div class="table-wrap"><table class="data compact"><tbody>
        ${(variant?.options || [])
          .map((opt) => {
            const isAnswer = (row.answer || []).includes(opt.key);
            const wasSelected = selected.includes(opt.key);
            const mark = isAnswer ? badge('answer key', 'ok') : '';
            const picked = wasSelected ? badge('your choice', wasSelected && !isAnswer ? 'bad' : 'info') : '';
            return `<tr><td class="mono col-key">${esc(opt.key)}</td><td${langAttr(opt.text, lang)}>${esc(opt.text)}</td><td class="col-choice">${mark} ${picked}</td></tr>`;
          })
          .join('')}
      </tbody></table></div>
      <p class="small mt-2">
        Answer used for scoring: <strong>${row.answer?.length ? esc(row.answer.join(', ')) : 'none available'}</strong>
        ${row.answer_basis ? `(${esc(row.answer_basis === 'verified' ? 'your verified answer' : 'the stored answer key')})` : ''}
        ${row.supplied_answer && row.verified_answer && row.supplied_answer.join(',') !== row.verified_answer.join(',') ? ` · the stored key said <strong>${esc(row.supplied_answer.join(', '))}</strong>, your verified answer is <strong>${esc(row.verified_answer.join(', '))}</strong> — both are preserved.` : ''}
        ${row.note ? `<br /><span class="soft">${esc(row.note)}</span>` : ''}
      </p>
      ${renderExplanation(question)}
      <div class="row tight mt-3">
        <button class="btn btn-sm" type="button" data-action="history" data-qid="${esc(row.question_id)}">Attempt history</button>
        <button class="btn btn-sm" type="button" data-action="queue-revision" data-qid="${esc(row.question_id)}">Add to revision queue</button>
        <a class="btn btn-sm" href="#/bank/question/${encodeURIComponent(row.question_id)}">Open in question bank</a>
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

    const reviewBody = `
      <div class="row mb-3">
        ${FILTERS.map((f) => `<button class="btn btn-sm ${viewState.filter === f.id ? 'btn-primary' : ''}" type="button" data-action="filter" data-filter="${f.id}">${esc(f.label)}${f.id === 'all' ? ` (${result.per_question.length})` : ` (${result.per_question.filter((r) => rowMatches(r, f.id)).length})`}</button>`).join('')}
      </div>
      ${
        filtered.length
          ? filtered.map((row) => questionReviewBlock(row, questions.get(row.question_id), test.language || state.settings.language)).join('')
          : emptyState({ title: 'Nothing matches this filter', message: 'Try another filter — or leave the review here. Reviewing mistakes is useful but not mandatory.' })
      }`;

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

    // 1 — the result, in the rules that produced it.
    const resultCard = card({
      title: 'How this sitting went',
      subtitle: `${counts.correct} correct · ${counts.incorrect} incorrect · ${counts.unanswered} unanswered · ${counts.unscored} not scored`,
      body: `
        <div class="stat-strip" role="group" aria-label="Result of this sitting">
          <div class="stat">
            <span class="stat-label">Score</span>
            <span class="stat-value">${esc(fmtMarks(result.score))} <small>of ${esc(fmtMarks(result.max_marks))}</small></span>
            <span class="stat-note">${result.score === null ? 'no score could be computed' : 'derived from the rules below'}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Accuracy</span>
            <span class="stat-value">${result.accuracy === null ? '—' : esc(fmtPct(result.accuracy, 0))}</span>
            <span class="stat-note">${judgedCount ? `${counts.correct} correct of ${judgedCount} judged` : 'nothing judged yet'}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Attempted</span>
            <span class="stat-value">${counts.attempted} <small>of ${counts.total}</small></span>
            <span class="stat-note">${counts.unanswered} left unanswered</span>
          </div>
          <div class="stat">
            <span class="stat-label">Negative marks</span>
            <span class="stat-value">${esc(fmtMarks(result.negative_marks_applied))}</span>
            <span class="stat-note">lost to ${counts.incorrect} wrong answer(s)</span>
          </div>
        </div>
        ${infoToggle('Scoring rules actually used', `<p class="small m-0">${esc(describeRules(result.scoring, result.scoring?.source))}</p>
          ${result.scoring?.rules_source_note ? `<p class="small m-0 mt-1">${esc(result.scoring.rules_source_note)}</p>` : ''}
          ${result.accuracy_note ? `<p class="small text-warn m-0 mt-1">${esc(result.accuracy_note)}</p>` : ''}
          ${test.config.feedback_mode === 'learning' ? '<p class="small m-0 mt-1">This test ran in learning mode, so answers were revealed as you went.</p>' : ''}`)}
        ${result.warnings?.length ? notice(`<ul class="m-0">${result.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`, 'warn', { title: 'Read with the score' }) : ''}`,
    });

    // 2 — what to do about it. Every line is a button that starts something.
    const actionsCard = card({
      title: 'Do something about it',
      subtitle: 'Each action starts a real session or opens the screen that can finish the job.',
      body: `<div class="action-rows">
        <div class="action-row">
          <div class="action-row-main">
            <p class="action-row-title">Retry the ${incorrectIds.length} question(s) you got wrong</p>
            <p class="action-row-meta">A learning-mode set made of exactly these questions, in the order they appeared.</p>
          </div>
          <button class="btn btn-sm btn-primary" type="button" data-action="retry-incorrect" ${incorrectIds.length ? '' : 'disabled'}>Retry ${incorrectIds.length || ''} incorrect</button>
        </div>
        <div class="action-row">
          <div class="action-row-main">
            <p class="action-row-title">Practise the ${weakTopicKeys.size} weak topic(s) from this sitting</p>
            <p class="action-row-meta">${weakPoolSize} stored question(s) across those topics · weakest first, learning mode.</p>
          </div>
          <button class="btn btn-sm btn-primary" type="button" data-action="practise-weak" ${weakTopicKeys.size ? '' : 'disabled'}>Practise ${Math.min(practiceSize, weakPoolSize) || ''}</button>
        </div>
        <div class="action-row">
          <div class="action-row-main">
            <p class="action-row-title">Revise the ${dueFromThisTest} question(s) due from this sitting</p>
            <p class="action-row-meta">${dueFromThisTest ? 'Scheduled on or before today by the revision rules.' : 'Nothing from this sitting is due yet — the Revision Centre will say when.'}</p>
          </div>
          <button class="btn btn-sm" type="button" data-action="revise-due" ${dueFromThisTest ? '' : 'disabled'}>Revise ${dueFromThisTest || ''}</button>
        </div>
        <div class="action-row">
          <div class="action-row-main">
            <p class="action-row-title">Review what you flagged</p>
            <p class="action-row-meta">${flaggedRows.length} question(s) were marked for review during the sitting.</p>
          </div>
          <button class="btn btn-sm" type="button" data-action="filter" data-filter="flagged" ${flaggedRows.length ? '' : 'disabled'}>Show ${flaggedRows.length} flagged</button>
        </div>
        <div class="action-row">
          <div class="action-row-main">
            <p class="action-row-title">Work through the explanations</p>
            <p class="action-row-meta">Every question is listed with its key, your answer and the bank's explanation.</p>
          </div>
          <a class="btn btn-sm" href="#/mistakes">Mistake Book</a>
        </div>
        <div class="action-row">
          <div class="action-row-main">
            <p class="action-row-title">Keep these questions in rotation</p>
            <p class="action-row-meta">${unresolved.length ? `${unresolved.length} answer(s) still need a verified key. ` : ''}Revision dates were scheduled automatically from this sitting.</p>
          </div>
          <a class="btn btn-sm" href="#/revision">Revision Centre</a>
        </div>
      </div>
      ${unresolved.length ? `<div class="cross-signal"><span><strong>${unresolved.length}</strong> question(s) were judged with a missing or disputed key and are flagged in the review below.</span><button class="btn btn-sm" type="button" data-action="resolve">Fix unresolved answers</button></div>` : ''}`,
    });

    // 3 — weak topics, each with the button that practises it.
    const weakCard = card({
      title: 'Weakest topics in this sitting',
      count: weakTopics.length ? `${weakTopics.length} with judged answers` : null,
      info: cardInfo(
        'How a topic is called weak',
        '<p class="small m-0">A topic is listed once at least one answer on it was judged correct or incorrect, ordered by accuracy in this sitting. The count is this sitting only — it is not a forecast about the examination, and a topic with one judged answer is thin evidence.</p>',
      ),
      body: weakTopics.length
        ? dataTable({
            columns: [{ label: 'Topic' }, { label: 'This sitting', num: true }, { label: 'Accuracy', num: true }, { label: '' }],
            rows: weakTopics.slice(0, 8).map((t) => [
              `${esc(t.topic || t.subject || 'Unclassified')}<div class="tiny muted">${esc(t.subject || '—')}</div>`,
              `${t.correct}/${t.correct + t.incorrect}`,
              pct(t.accuracy),
              `<button class="btn btn-sm" type="button" data-action="practise-topic" data-subject="${esc(t.subject || '')}" data-topic="${esc(t.topic || '')}">Practise ${practiceSize}</button>`,
            ]),
            empty: 'No topic had a judged answer in this sitting.',
            className: 'compact',
          })
        : emptyState({
            title: 'Nothing was scored topic by topic',
            message: 'Every question here was unanswered or had no usable key, so this sitting says nothing about any topic.',
          }),
      footer: weakTopics.length > 8 ? `Showing the 8 weakest of ${weakTopics.length} topic(s) with judged answers.` : '',
    });

    // 4 — the review, first class rather than a tab.
    const reviewCard = card({
      title: 'Question review',
      count: `${filtered.length} shown`,
      body: reviewBody,
      footer: 'Reviewing every question is useful but never required — the score and its rules above are final.',
    });

    // 5 — the details: confidence, pacing, repeated mistakes, unresolved keys.
    const detailsCard = card({
      title: 'The details',
      body: tabs({
        id: 'reportTabs',
        activeId: 'tabs-confidence',
        items: [
          {
            id: 'tabs-confidence',
            label: 'Confidence',
            body: test.config.confidence === 'off'
              ? emptyState({ title: 'Confidence tracking was off for this test', message: 'Turn it on in Settings or when starting a test to see how sure you felt against what you got right. It is always stored separately from correctness.' })
              : `
                  <div class="matrix mb-3">
                    ${['confident', 'unsure', 'guessed'].concat(result.per_question.some((r) => !r.confidence) ? ['none'] : [])
                      .map((level) => {
                        const rows = result.per_question.filter((r) => (r.confidence || 'none') === level);
                        const correct = rows.filter((r) => r.outcome === 'correct').length;
                        const incorrect = rows.filter((r) => r.outcome === 'incorrect').length;
                        const label = level === 'none' ? 'not marked' : confidenceLabel(level);
                        return `<div class="cell"><div class="l">${esc(label)}</div><div class="v">${correct}/${correct + incorrect || 0}</div><div class="l">correct</div></div>`;
                      })
                      .join('')}
                  </div>
                  ${dataTable({
                    columns: [{ label: 'Confidence' }, { label: 'Correct', num: true }, { label: 'Incorrect', num: true }, { label: 'Overlooked', num: true }],
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
                  ${counts.confidentIncorrect ? notice(`${counts.confidentIncorrect} question(s) you felt confident about were wrong — check whether a concept is being confused with a similar one.`, 'warn') : ''}
                  ${counts.lowConfidenceCorrect ? notice(`${counts.lowConfidenceCorrect} correct answer(s) were marked unsure or guessed. They are scheduled for additional revision instead of being treated as mastered.`, 'info') : ''}`,
          },
          {
            id: 'tabs-pacing',
            label: 'Pacing',
            body: dataTable({
              columns: [{ label: 'Q' }, { label: 'Topic' }, { label: 'Outcome' }, { label: 'Time', num: true }, { label: 'Confidence' }],
              rows: result.per_question
                .map((r, i) => [esc(`Q${i + 1}`), esc(r.topic || r.subject || 'Unclassified'), outcomeBadge(r), fmtClock(Math.round((r.time_spent_ms || 0) / 1000)), r.confidence ? esc(confidenceLabel(r.confidence)) : '<span class="soft">—</span>'])
                .slice(0, 40),
              className: 'compact',
            }),
            footer: '',
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
                    `<a class="btn btn-sm" href="#/bank/question/${encodeURIComponent(r.question_id)}">Open</a>`,
                  ]),
                  className: 'compact',
                })
              : '<p class="muted small m-0">No repeated mistakes were detected among these questions.</p>',
          },
          {
            id: 'tabs-unresolved',
            label: `Unresolved (${unresolved.length})`,
            body: unresolved.length
              ? `<p class="small">These questions were judged with an answer key that is missing, disputed or contradicted by a verified answer. The stored key is preserved; nothing was silently rewritten.</p>
                ${dataTable({
                  columns: [{ label: 'Question' }, { label: 'Issue' }, { label: 'Stored key' }, { label: 'Your verified answer' }, { label: '' }],
                  rows: unresolved.map((u) => [
                    esc(u.question_id),
                    esc(u.reason),
                    u.supplied ? esc(u.supplied.join(', ')) : '<span class="soft">missing</span>',
                    u.verified ? esc(u.verified.join(', ')) : '<span class="soft">none</span>',
                    `<a class="btn btn-sm" href="#/bank/question/${encodeURIComponent(u.question_id)}">Review</a>`,
                  ]),
                  className: 'compact',
                })}`
              : '<p class="muted small m-0">Every question in this sitting was judged with a usable key.</p>',
          },
        ],
      }),
    });

    return `
      <nav class="crumbs" aria-label="Breadcrumb">
        <ol><li><a href="#/dashboard">Today</a></li><li><a href="#/test-centre">Test Centre</a></li><li aria-current="page">Report</li></ol>
      </nav>
      <div class="spread mb-4">
        <div>
          <div class="row tight">
            <h1 class="m-0">${esc(test.label || 'Test report')}</h1>
          </div>
          <p class="muted small m-0 mt-1">
            ${test.paper_snapshot ? `${esc(test.paper_snapshot.exam || '')} ${test.paper_snapshot.year ? `· ${esc(String(test.paper_snapshot.year))}` : ''}${test.paper_snapshot.set_code ? ` · set ${esc(test.paper_snapshot.set_code)}` : ''} · ` : ''}
            submitted ${esc(fmtDate(test.submitted_at))}${result.auto_submitted ? ' (automatically, when the timer expired)' : ''}
          </p>
        </div>
        <div class="row tight">
          <button class="btn" type="button" data-action="print">Print / save as PDF</button>
          <a class="btn" href="#/test-centre">Back to test centre</a>
        </div>
      </div>

      ${resultCard}
      ${actionsCard}
      ${weakCard}
      ${reviewCard}
      ${detailsCard}

      <section class="sticky-actions">
        <a class="btn btn-primary" href="#/test-centre">Done — back to test centre</a>
        <button class="btn" type="button" data-action="retry-incorrect" ${incorrectIds.length ? '' : 'disabled'}>Retry the incorrect questions</button>
        ${unresolved.length ? '<button class="btn" type="button" data-action="resolve">Fix unresolved answers</button>' : ''}
        <span class="tiny muted">You can leave the review at any time; nothing is lost.</span>
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
