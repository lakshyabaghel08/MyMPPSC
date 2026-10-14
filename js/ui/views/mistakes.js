/**
 * mistakes.js — Mistake Book.
 *
 * Automatically collects incorrect answers, skipped questions, flagged
 * questions, repeated mistakes and (when confidence tracking is on) correct but
 * uncertain answers. Items can be retried, resolved, reopened or removed — and
 * resolving never erases the underlying attempt history.
 */

import { MISTAKE_TYPES } from '../../core/constants.js';
import { state } from '../../core/state.js';
import {
  esc,
  badge,
  card,
  tile,
  dataTable,
  emptyState,
  toast,
  openModal,
  confirmDialog,
  renderExplanation,
  confidenceLabel,
  questionTypeLabel,
  answerKeyBadge,
  langAttr,
} from '../components.js';
import { fmtDate, fmtClock, fmtRelative } from '../../core/util.js';
import { listMistakes, mistakeCounts, resolveMistake, reopenMistake, removeMistake, attemptHistoryForQuestion, attemptTrend } from '../../services/attempts.js';
import { getQuestions } from '../../services/questions.js';
import { startPracticeTest } from './shared.js';

const viewState = { status: 'open', type: 'all', subject: 'all', topic: 'all', year: 'all' };

function filtersMarkup(metas, counts) {
  const subjects = Array.from(new Set(metas.map((m) => m.subject || 'Unclassified'))).sort();
  const years = Array.from(new Set(metas.map((m) => m.year).filter((y) => y !== null && y !== undefined))).sort((a, b) => Number(b) - Number(a));
  const topics = Array.from(new Set(metas.filter((m) => viewState.subject === 'all' || (m.subject || 'Unclassified') === viewState.subject).map((m) => m.topic || 'Unclassified'))).sort();
  return `<div class="filters">
    <label class="field"><span class="label-text">Status</span>
      <select id="mStatus">
        <option value="open" ${viewState.status === 'open' ? 'selected' : ''}>Open (${counts.open})</option>
        <option value="resolved" ${viewState.status === 'resolved' ? 'selected' : ''}>Resolved (${counts.resolved})</option>
        <option value="all" ${viewState.status === 'all' ? 'selected' : ''}>All (${counts.total})</option>
      </select>
    </label>
    <label class="field"><span class="label-text">Mistake type</span>
      <select id="mType">
        <option value="all">All types</option>
        ${Object.entries(MISTAKE_TYPES).map(([key, label]) => `<option value="${esc(key)}" ${viewState.type === key ? 'selected' : ''}>${esc(label)}${counts.byType[key] ? ` (${counts.byType[key]})` : ''}</option>`).join('')}
        <option value="repeated" ${viewState.type === 'repeated' ? 'selected' : ''}>Repeated mistakes only (${counts.repeated})</option>
      </select>
    </label>
    <label class="field"><span class="label-text">Subject</span>
      <select id="mSubject"><option value="all">All subjects</option>${subjects.map((s) => `<option value="${esc(s)}" ${viewState.subject === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
    </label>
    <label class="field"><span class="label-text">Topic</span>
      <select id="mTopic"><option value="all">All topics</option>${topics.map((t) => `<option value="${esc(t)}" ${viewState.topic === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    </label>
    <label class="field"><span class="label-text">Year</span>
      <select id="mYear"><option value="all">All years</option>${years.map((y) => `<option value="${esc(String(y))}" ${String(viewState.year) === String(y) ? 'selected' : ''}>${esc(String(y))}</option>`).join('')}</select>
    </label>
  </div>`;
}

function typeBadge(type) {
  const tone = { incorrect: 'bad', skipped: 'warn', flagged: 'warn', low_confidence_correct: 'info', repeated: 'bad' }[type] || '';
  return badge(MISTAKE_TYPES[type] || type, tone);
}

export default {
  title: 'Mistake Book',

  async render() {
    const metas = Array.from(state.questionIndex.values());
    const counts = await mistakeCounts();
    if (!counts.total) {
      return `
        <h1>Mistake Book</h1>
        ${card({
          title: 'Mistake Book',
          body: emptyState({
            title: 'No mistakes recorded yet',
            message: metas.length
              ? 'Incorrect answers, skipped questions, questions you flag for review, repeated mistakes and (when confidence tracking is on) correct but uncertain answers appear here automatically after you submit a test.'
              : 'Import a question bank and attempt a test; this screen fills itself from your results.',
            action: metas.length ? '<a class="btn btn-primary" href="#/test-centre">Start a test</a>' : '<a class="btn btn-primary" href="#/bank">Import a question bank</a>',
          }),
        })}`;
    }

    const rows = await listMistakes({
      status: viewState.status,
      type: viewState.type,
      subject: viewState.subject === 'all' ? null : viewState.subject,
      topic: viewState.topic === 'all' ? null : viewState.topic,
      year: viewState.year === 'all' ? null : viewState.year,
    });

    const openByType = counts.byType;
    const tableRows = rows.map((m) => {
      const meta = state.questionIndex.get(m.question_id);
      const preview = meta ? `${esc(meta.subject || 'Unclassified')} · ${esc(meta.topic || '—')}` : '<span class="soft">question no longer stored</span>';
      return [
        `<div><strong>Q${esc(String(meta?.question_number ?? '—'))}</strong> <span class="mono tiny">${esc(m.question_id)}</span></div>
         <div class="tiny muted">${preview}</div>`,
        `${typeBadge(m.type)}${m.occurrences >= 2 ? ` ${badge(`repeated ×${m.occurrences}`, 'bad')}` : ''}
         <div class="tiny muted">${m.status === 'resolved' ? `resolved ${esc(fmtRelative(m.resolved_at))}` : `seen ${esc(fmtRelative(m.last_seen_at))}`}</div>`,
        m.detail?.confidence ? badge(`confidence: ${confidenceLabel(m.detail.confidence)}`, 'info') : '<span class="soft tiny">—</span>',
        `<div class="row tight">
           <button class="btn btn-sm" type="button" data-action="retry" data-qid="${esc(m.question_id)}">Retry</button>
           <button class="btn btn-sm" type="button" data-action="view" data-key="${esc(m.key)}">History &amp; explanation</button>
           ${
             m.status === 'resolved'
               ? `<button class="btn btn-sm" type="button" data-action="reopen" data-key="${esc(m.key)}">Reopen</button>`
               : `<button class="btn btn-sm" type="button" data-action="resolve" data-key="${esc(m.key)}">Resolve</button>`
           }
           <button class="btn btn-sm btn-quiet" type="button" data-action="remove" data-key="${esc(m.key)}">Remove</button>
         </div>`,
      ];
    });

    const topicGroups = new Map();
    for (const m of rows) {
      const key = `${m.subject || 'Unclassified'}||${m.topic || 'Unclassified'}`;
      topicGroups.set(key, (topicGroups.get(key) || 0) + 1);
    }

    return `
      <h1>Mistake Book</h1>
      <p class="muted">Everything recorded automatically from your tests. Resolving an item keeps its attempt history — nothing is erased.</p>

      <div class="grid tiles mb-4">
        ${tile({ label: 'Open items', value: String(counts.open), sub: `${counts.repeated} repeated`, tone: counts.open ? 'warn' : 'ok', source: 'measured', where: 'Active unresolved entries' })}
        ${tile({ label: 'Incorrect', value: String(openByType.incorrect || 0), sub: 'wrong answers', tone: 'bad', source: 'measured', where: 'Scored wrong in a test' })}
        ${tile({ label: 'Skipped', value: String(openByType.skipped || 0), sub: 'kept separate from wrong answers', source: 'measured', where: 'Left blank in a test' })}
        ${tile({ label: 'Uncertain correct', value: String(openByType.low_confidence_correct || 0), sub: 'guesses and unsure answers', source: 'measured', where: 'Correct but marked unsure/guessed' })}
      </div>

      ${card({ title: 'Filters', body: filtersMarkup(metas, counts) })}

      ${card({
        title: `Items (${rows.length})`,
        actions: `<button class="btn btn-sm btn-primary" type="button" data-action="retry-all">Retry all shown</button>`,
        body: dataTable({
          columns: [{ label: 'Question' }, { label: 'Why it is here' }, { label: 'Confidence' }, { label: 'Actions' }],
          rows: tableRows,
          empty: 'No items match these filters.',
          className: 'compact',
        }),
        footer: topicGroups.size ? `Spread across ${topicGroups.size} topic group(s). Use “Retry all shown” to practise the filtered set, or retry a single topic from the list below.` : '',
      })}

      ${card({
        title: 'Topics with the most open items',
        body: topicGroups.size
          ? dataTable({
              columns: [{ label: 'Topic' }, { label: 'Open items', num: true }, { label: '' }],
              rows: Array.from(topicGroups.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([key, count]) => {
                  const [subject, topic] = key.split('||');
                  return [esc(`${topic} · ${subject}`), String(count), `<button class="btn btn-sm" type="button" data-action="retry-topic" data-subject="${esc(subject)}" data-topic="${esc(topic)}">Retry this topic</button>`];
                }),
              className: 'compact',
            })
          : '<p class="muted small">No open items.</p>',
      })}`;
  },

  async mount(ctx, root) {
    const rerender = async () => {
      viewState.status = document.getElementById('mStatus')?.value || 'open';
      viewState.type = document.getElementById('mType')?.value || 'all';
      const subject = document.getElementById('mSubject')?.value || 'all';
      viewState.subject = subject;
      viewState.topic = document.getElementById('mTopic')?.value || 'all';
      viewState.year = document.getElementById('mYear')?.value || 'all';
      await ctx.refresh();
    };
    ['mStatus', 'mType', 'mSubject', 'mTopic', 'mYear'].forEach((id) => document.getElementById(id)?.addEventListener('change', rerender));

    root.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'retry') {
        const id = btn.dataset.qid;
        const test = await startPracticeTest(ctx, {
          kind: 'mistake_retry',
          label: 'Mistake retry — single question',
          questionIds: [id],
          metas: [state.questionIndex.get(id)].filter(Boolean),
          config: { feedbackMode: 'learning', confidence: 'optional', durationMinutes: null },
        });
        return test;
      }

      if (action === 'retry-all') {
        const rows = await listMistakes({ status: viewState.status, type: viewState.type, subject: viewState.subject === 'all' ? null : viewState.subject, topic: viewState.topic === 'all' ? null : viewState.topic, year: viewState.year === 'all' ? null : viewState.year });
        const ids = Array.from(new Set(rows.filter((r) => r.status === 'open').map((r) => r.question_id)));
        if (!ids.length) {
          toast('No open items in this filter to retry.', 'info');
          return;
        }
        await startPracticeTest(ctx, {
          kind: 'mistake_retry',
          label: `Mistake retry — ${ids.length} question(s)`,
          questionIds: ids,
          metas: ids.map((id) => state.questionIndex.get(id)).filter(Boolean),
          config: { feedbackMode: 'learning', confidence: state.settings.confidenceTracking, durationMinutes: null },
        });
        return;
      }

      if (action === 'retry-topic') {
        const subject = btn.dataset.subject;
        const topic = btn.dataset.topic;
        const ids = Array.from(state.questionIndex.values())
          .filter((m) => (m.subject || 'Unclassified') === subject && (m.topic || 'Unclassified') === topic)
          .map((m) => m.id);
        await startPracticeTest(ctx, {
          kind: 'mistake_retry',
          label: `Mistake retry — ${topic}`,
          questionIds: ids,
          metas: ids.map((id) => state.questionIndex.get(id)).filter(Boolean),
          config: { feedbackMode: 'learning', confidence: state.settings.confidenceTracking, durationMinutes: null },
        });
        return;
      }

      if (action === 'resolve') {
        const note = await openModal({
          title: 'Resolve this mistake',
          body: `<p class="small">Resolving removes the item from the open list but keeps every attempt in the history. Add an optional note about why it is resolved.</p>
            <label class="field"><span class="label-text">Note (optional)</span><input type="text" id="resolveNote" placeholder="e.g. re-read the concept, answered correctly twice" /></label>`,
          actions: [
            { label: 'Cancel', value: '__cancel' },
            { label: 'Resolve', tone: 'btn-primary', value: '__ok' },
          ],
        });
        if (note !== '__ok') return;
        const text = document.getElementById('resolveNote')?.value || 'Resolved by you.';
        await resolveMistake(btn.dataset.key, text);
        toast('Marked resolved. Attempt history is unchanged.', 'ok');
        await ctx.refresh();
        return;
      }

      if (action === 'reopen') {
        await reopenMistake(btn.dataset.key, 'Reopened by you.');
        toast('Item reopened.', 'info');
        await ctx.refresh();
        return;
      }

      if (action === 'remove') {
        const ok = await confirmDialog({
          title: 'Remove this entry from the book?',
          message: 'The entry disappears from the list. Your attempts, analytics and revision schedule for this question are <strong>not</strong> deleted — this only stops it being tracked as a mistake here.',
          confirmLabel: 'Remove entry',
        });
        if (!ok) return;
        await removeMistake(btn.dataset.key);
        toast('Entry removed. Attempts were kept.', 'info');
        await ctx.refresh();
        return;
      }

      if (action === 'view') {
        const key = btn.dataset.key;
        const questionId = key.split('::')[0];
        const attempts = await attemptHistoryForQuestion(questionId);
        const trend = attemptTrend(attempts);
        const map = await getQuestions([questionId]);
        const question = map.get(questionId);
        const firstVariant = question ? Object.values(question.language_variants)[0] : null;
        await openModal({
          title: `Attempt history — ${questionId}`,
          wide: true,
          body: `
            <h3>How performance changed</h3>
            ${dataTable({
              columns: [{ label: '#' }, { label: 'When' }, { label: 'Outcome' }, { label: 'Confidence' }, { label: 'Time' }, { label: 'Test kind' }],
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
            ${
              question
                ? `<h3 class="mt-4">Question (${esc(questionTypeLabel(question.question_type))}) ${answerKeyBadge(question.supplied?.status)}</h3>
                   <p class="question-text"${langAttr(firstVariant?.question_text)}>${esc(firstVariant?.question_text || '')}</p>
                   <ol class="small">${(firstVariant?.options || []).map((o) => `<li${langAttr(o.text)}><strong>${esc(o.key)}.</strong> ${esc(o.text)}${(question.supplied.answer || []).includes(o.key) ? ' <span class="badge ok">key</span>' : ''}</li>`).join('')}</ol>
                   ${renderExplanation(question)}`
                : '<p class="muted">This question is no longer in the database.</p>'
            }
            <p class="tiny muted">Resolving a mistake never removes attempts — the rows above are the permanent record.</p>`,
          actions: [{ label: 'Close', tone: 'btn-primary', value: 'close' }],
        });
      }
    });
  },
};
