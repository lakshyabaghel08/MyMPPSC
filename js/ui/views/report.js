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
  tile,
  notice,
  dataTable,
  barList,
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
} from '../components.js';
import { fmtMarks, fmtClock, fmtDate, fmtDuration, fmtPct } from '../../core/util.js';
import { getQuestion } from '../../services/questions.js';
import { describeRules } from '../../services/scoring.js';
import { ensureRevisionRecord } from '../../services/revision.js';
import { attemptHistoryForQuestion, attemptTrend } from '../../services/attempts.js';
import * as tests from '../../services/tests.js';

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

    return `
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

      <div class="grid tiles mb-4">
        ${tile({
          label: 'Score',
          value: `${esc(fmtMarks(result.score))} <small class="muted">/ ${esc(fmtMarks(result.max_marks))}</small>`,
          sub: esc(describeRules(result.scoring, result.scoring?.source)),
          tone: 'accent',
          source: result.score === null ? 'unavailable' : 'derived',
          where: result.scoring?.source ? `Source: ${result.scoring.source.replace(/_/g, ' ')}` : 'Rules not configured',
        })}
        ${tile({
          label: 'Accuracy',
          value: result.accuracy === null ? '—' : esc(fmtPct(result.accuracy, 0)),
          sub: `${counts.correct} correct of ${judgedCount} judged`,
          tone: result.accuracy === null ? '' : result.accuracy >= 0.6 ? 'ok' : 'warn',
          source: judgedCount ? 'measured' : 'unavailable',
          where: `Judged sample n=${judgedCount}`,
        })}
        ${tile({
          label: 'Attempted',
          value: `${counts.attempted}/${counts.total}`,
          sub: `${counts.unanswered} left unanswered`,
          source: 'measured',
          where: 'Recorded during this session',
        })}
        ${tile({
          label: 'Negative marks',
          value: esc(fmtMarks(result.negative_marks_applied)),
          sub: 'lost to wrong answers',
          tone: result.negative_marks_applied ? 'warn' : '',
          source: 'derived',
          where: 'Deducted from incorrect answers',
        })}
      </div>

      ${result.warnings?.length ? notice(`<ul>${result.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`, 'warn', { title: 'Read with the score' }) : ''}

      ${tabs({
        id: 'reportTabs',
        activeId: 'tabs-overview',
        items: [
          {
            id: 'tabs-overview',
            label: 'Overview',
            body: `
              ${card({
                title: 'Scoring rules actually used',
                body: `<p>${esc(describeRules(result.scoring, result.scoring?.source))}</p>
                  ${result.scoring?.rules_source_note ? infoToggle('Where these rules come from', `<p class="small m-0">${esc(result.scoring.rules_source_note)}</p>`) : ''}
                  ${result.accuracy_note ? `<p class="small text-warn">${esc(result.accuracy_note)}</p>` : ''}
                  ${test.config.feedback_mode === 'learning' ? '<p class="small">This test ran in learning mode, so answers were revealed as you went.</p>' : ''}`,
              })}
              <div class="grid cols-2">
                ${card({
                  title: 'Outcome counts',
                  body: dataTable({
                    columns: [{ label: 'Outcome' }, { label: 'Count', num: true }, { label: 'Share', num: true }],
                    rows: [
                      ['Correct', String(counts.correct), pct(counts.total ? counts.correct / counts.total : NaN)],
                      ['Incorrect', String(counts.incorrect), pct(counts.total ? counts.incorrect / counts.total : NaN)],
                      ['Unanswered', String(counts.unanswered), pct(counts.total ? counts.unanswered / counts.total : NaN)],
                      ['Not scored (no usable key)', String(counts.unscored), pct(counts.total ? counts.unscored / counts.total : NaN)],
                      ['Flagged for review', String(counts.flagged), '—'],
                    ],
                    className: 'compact',
                  }),
                })}
                ${card({
                  title: 'Weakest topics in this test',
                  body: barList(
                    (result.per_topic || [])
                      .filter((t) => t.correct + t.incorrect > 0)
                      .slice(0, 6)
                      .map((t) => ({
                        label: t.topic || t.subject || 'Unclassified',
                        value: Number.isFinite(t.accuracy) ? t.accuracy : 0,
                        tone: t.accuracy >= 0.75 ? 'ok' : t.accuracy >= 0.5 ? 'warn' : 'bad',
                        right: `${t.correct}/${t.correct + t.incorrect}`,
                      })),
                  ),
                })}
              </div>
              ${card({
                title: 'Time per question',
                subtitle: `${fmtDuration(Math.round(result.per_question.reduce((a, r) => a + (r.time_spent_ms || 0), 0) / 1000))} in total`,
                body: dataTable({
                  columns: [{ label: 'Q' }, { label: 'Topic' }, { label: 'Outcome' }, { label: 'Time', num: true }, { label: 'Confidence' }],
                  rows: result.per_question
                    .map((r, i) => [esc(`Q${i + 1}`), esc(r.topic || r.subject || 'Unclassified'), outcomeBadge(r), fmtClock(Math.round((r.time_spent_ms || 0) / 1000)), r.confidence ? esc(confidenceLabel(r.confidence)) : '<span class="soft">—</span>'])
                    .slice(0, 40),
                  className: 'compact',
                }),
                footer: result.per_question.length > 40 ? `Showing the first 40 of ${result.per_question.length} questions.` : '',
              })}`,
          },
          {
            id: 'tabs-confidence',
            label: 'Confidence',
            body: test.config.confidence === 'off'
              ? emptyState({ title: 'Confidence tracking was off for this test', message: 'Turn it on in Settings or when starting a test to see how sure you felt against what you got right. It is always stored separately from correctness.' })
              : card({
                  title: 'Confidence against correctness',
                  subtitle: 'A correct guess is not strong recall',
                  body: `
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
                }),
          },
          {
            id: 'tabs-advice',
            label: 'What to do next',
            body: `
              ${card({ title: 'Revision recommendations', body: recommendations.length ? `<ul>${recommendations.map((r) => `<li>${r}</li>`).join('')}</ul>` : '<p class="muted small">Nothing stands out yet — no pattern was strong enough to recommend a change.</p>' })}
              ${card({
                title: 'Repeated mistakes touching this test',
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
                  : '<p class="muted small">No repeated mistakes were detected among these questions.</p>',
              })}
              ${unresolved.length
                ? card({
                    title: 'Answers that remain unresolved',
                    tone: 'warn',
                    body: `<p class="small">These questions were judged with an answer key that is missing, disputed or contradicted by a verified answer. The stored key is preserved; nothing was silently rewritten.</p>
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
                      })}`,
                  })
                : ''}`,
          },
          { id: 'tabs-review', label: `Question review (${result.per_question.length})`, body: reviewBody },
        ],
      })}

      <section class="sticky-actions">
        <a class="btn btn-primary" href="#/test-centre">Done — back to test centre</a>
        <button class="btn" type="button" data-action="retry-incorrect">Retry the incorrect questions</button>
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
        const attempts = await attemptHistoryForQuestion(target.dataset.qid);
        const trend = attemptTrend(attempts);
        await openModal({
          title: `Attempt history — ${target.dataset.qid}`,
          body: `${dataTable({
            columns: [{ label: '#' }, { label: 'When' }, { label: 'Outcome' }, { label: 'Confidence' }, { label: 'Time' }, { label: 'Source' }],
            rows: trend.map((t) => [
              String(t.index),
              esc(fmtDate(t.at)),
              badge(t.outcome, t.outcome === 'correct' ? 'ok' : t.outcome === 'incorrect' ? 'bad' : 'warn'),
              t.confidence ? esc(confidenceLabel(t.confidence)) : '<span class="soft">—</span>',
              fmtClock(Math.round((t.time_spent_ms || 0) / 1000)),
              esc(t.kind || '—'),
            ]),
            className: 'compact',
          })}
          <p class="small muted">Resolving a mistake never deletes attempts — this list stays available.</p>`,
          actions: [{ label: 'Close', tone: 'btn-primary', value: 'close' }],
        });
      }
      if (action === 'queue-revision') {
        await ensureRevisionRecord(target.dataset.qid, { reason: 'Added from a test report.' });
        toast('Added to the revision queue.', 'ok');
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
          config: { feedbackMode: 'learning', confidence: state.settings.confidenceTracking },
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
    });
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
