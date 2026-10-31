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
  dataTable,
  emptyState,
  toast,
  openModal,
  confirmDialog,
  confidenceLabel,
  screenHead,
  sheet,
} from '../components.js';
import { fmtRelative, todayKey } from '../../core/util.js';
import { listMistakes, mistakeCounts, resolveMistake, reopenMistake, removeMistake } from '../../services/attempts.js';
import { allRevisionRecords } from '../../services/revision.js';
import { startPracticeTest } from './shared.js';
import { loadReview, reviewBodyMarkup } from '../reviewpanel.js';

const viewState = { status: 'open', type: 'all', subject: 'all', topic: 'all', year: 'all' };

/** How many filters are away from the screen's starting state. */
const activeFilterCount = () =>
  [viewState.status !== 'open', viewState.type !== 'all', viewState.subject !== 'all', viewState.topic !== 'all', viewState.year !== 'all'].filter(Boolean).length;

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

/** Why an item is here: a word with a tone, not a badge per row. */
function typeBadge(type) {
  const tone = { incorrect: 'is-bad', skipped: 'is-warn', flagged: 'is-warn', low_confidence_correct: 'is-soft', repeated: 'is-bad' }[type] || 'is-soft';
  return `<span class="why-word ${tone}">${esc(MISTAKE_TYPES[type] || type)}</span>`;
}

export default {
  title: 'Mistake Book',

  async render() {
    const metas = Array.from(state.questionIndex.values());
    const counts = await mistakeCounts();
    if (!counts.total) {
      return `
        ${screenHead({
          title: 'Mistake Book',
          purpose: 'Wrong answers, skipped questions, flagged questions and correct-but-guessed answers, collected automatically from your tests.',
          primary: '<a class="btn btn-primary" href="#/test-centre">Start a test</a>',
          secondary: '<a class="btn btn-sm" href="#/topic">Practise a topic</a>',
        })}
        ${sheet({
          label: 'Nothing to review yet',
          body: emptyState({
            title: 'No mistakes recorded yet',
            message: metas.length
              ? 'Your first submitted test fills this book automatically. Resolving an item never deletes the attempt behind it.'
              : 'Import a question bank and attempt a test; this screen fills itself from your results.',
            willShow: 'Every wrong, skipped or flagged question, grouped by topic, with Retry, Resolve and History beside each one.',
            action: metas.length ? '<a class="btn btn-primary" href="#/test-centre">Start a test</a>' : '<a class="btn btn-primary" href="#/bank">Import a question bank</a>',
          }),
        })}`;
    }

    // Cross-signal: an item that is also in the revision queue today is worth
    // more than the same item on its own — the reader can act on both at once.
    const revisionRecords = await allRevisionRecords();
    const today = todayKey();
    const dueByQuestion = new Map(
      revisionRecords.filter((rec) => rec.next_due && rec.next_due <= today).map((rec) => [rec.question_id, rec.next_due]),
    );

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
      const why = [
        typeBadge(m.type),
        m.occurrences >= 2 ? `<span class="why-note">repeated ${m.occurrences} times</span>` : '',
        dueByQuestion.has(m.question_id) ? '<span class="why-note is-now">due for revision</span>' : '',
        m.detail?.confidence ? `<span class="why-note">marked ${esc(confidenceLabel(m.detail.confidence))}</span>` : '',
      ]
        .filter(Boolean)
        .join(' ');
      // Two columns, because a row asks two questions: which question is this
      // and why is it here, then what do I do about it. Resolving or removing
      // an item is maintenance, so it lives inside the opened row rather than
      // competing with Retry on every line.
      const cells = [
        `<div class="mistake-what">
           <p class="mistake-title"><strong>Q${esc(String(meta?.question_number ?? '—'))}</strong> <span class="mono tiny">${esc(m.question_id)}</span></p>
           <p class="tiny text-soft m-0">${preview}</p>
           <p class="mistake-why">${why}<span class="why-note">${m.status === 'resolved' ? `resolved ${esc(fmtRelative(m.resolved_at))}` : `seen ${esc(fmtRelative(m.last_seen_at))}`}</span></p>
         </div>`,
        `<div class="row tight">
           <button class="btn btn-sm btn-primary" type="button" data-action="retry" data-qid="${esc(m.question_id)}">Retry</button>
           <button class="quiet-action" type="button" data-action="expand" data-key="${esc(m.key)}" data-status="${esc(m.status)}" aria-expanded="false" aria-controls="reviewrow-${esc(m.question_id)}" aria-label="Review this question: its attempt history, the explanation and the actions on this item">Review</button>
         </div>`,
      ];
      // The review opens *in the row*, so the reader keeps their filters,
      // their scroll position and the rest of the list.
      return {
        cells,
        detail: `<div class="review-inline" data-review-for="${esc(m.question_id)}"></div>`,
        detailId: `reviewrow-${esc(m.question_id)}`,
        detailHidden: true,
      };
    });

    const topicGroups = new Map();
    for (const m of rows) {
      const key = `${m.subject || 'Unclassified'}||${m.topic || 'Unclassified'}`;
      topicGroups.set(key, (topicGroups.get(key) || 0) + 1);
    }

    return `
      ${screenHead({
        title: 'Mistake Book',
        purpose: `${counts.open} open item${counts.open === 1 ? '' : 's'}${counts.repeated ? ` · ${counts.repeated} repeated` : ''}. Everything here was recorded automatically; resolving an item never erases its attempt history.`,
        primary: '<button class="btn btn-primary" type="button" data-action="practise-now">Practise these mistakes</button>',
        secondary: `<a class="btn btn-sm btn-quiet" href="#/revision">Revision queue</a>`,
      })}

      ${sheet({
        label: 'Items',
        count: `${rows.length} shown`,
        action: `<button class="quiet-action" type="button" data-action="retry-all">Retry all shown</button>`,
        body: `
          <details class="disclosure">
            <summary>Filters${activeFilterCount() ? ` · ${activeFilterCount()} on` : ''}</summary>
            <div class="mt-2">${filtersMarkup(metas, counts)}</div>
            ${activeFilterCount() ? '<div class="row"><button class="btn btn-sm btn-quiet" type="button" data-action="clear-filters">Clear filters</button></div>' : ''}
          </details>
          ${dataTable({
            columns: [{ label: 'Question, and why it is here' }, { label: 'Do' }],
            rows: tableRows,
            empty: 'No items match these filters.',
            className: 'compact cards-mobile',
          })}
          ${
            topicGroups.size
              ? `<details class="disclosure mt-3"><summary>Topics with the most open items</summary>
                  ${dataTable({
                    columns: [{ label: 'Topic' }, { label: 'Open items', num: true }, { label: '' }],
                    rows: Array.from(topicGroups.entries())
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 12)
                      .map(([key, count]) => {
                        const [subject, topic] = key.split('||');
                        return [esc(`${topic} · ${subject}`), String(count), `<button class="btn btn-sm" type="button" data-action="retry-topic" data-subject="${esc(subject)}" data-topic="${esc(topic)}">Retry this topic</button>`];
                      }),
                    className: 'compact',
                  })}
                </details>`
              : ''
          }`,
        footer: topicGroups.size ? `Spread across ${topicGroups.size} topic group(s). “Retry all shown” practises the filtered set.` : '',
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

      if (action === 'clear-filters') {
        viewState.type = 'all';
        viewState.subject = 'all';
        viewState.topic = 'all';
        viewState.year = 'all';
        viewState.status = 'open';
        await ctx.refresh();
        return;
      }

      if (action === 'practise-now') {
        const { openPracticeSheet } = await import('../practicesheet.js');
        await openPracticeSheet(ctx, { pool: 'mistakes', source: 'mistake book' });
        return;
      }

      if (action === 'retry') {
        const id = btn.dataset.qid;
        const test = await startPracticeTest(ctx, {
          kind: 'mistake_retry',
          label: 'Mistake retry — single question',
          questionIds: [id],
          metas: [state.questionIndex.get(id)].filter(Boolean),
          config: { feedbackMode: 'learning', durationMinutes: null },
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
          config: { feedbackMode: 'learning', durationMinutes: null },
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
          config: { feedbackMode: 'learning', durationMinutes: null },
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

      if (action === 'expand') {
        const key = btn.dataset.key;
        const [questionId, type] = String(key).split('::');
        const row = document.getElementById(`reviewrow-${questionId}`);
        const panel = row?.querySelector('.review-inline');
        if (!row || !panel) return;
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        btn.textContent = open ? 'Review' : 'Close';
        row.hidden = open;
        if (open) return;
        if (panel.dataset.filled === '1') return;
        panel.innerHTML = '<p class="small muted m-0">Loading the question…</p>';
        const review = await loadReview(questionId);
        panel.innerHTML = reviewBodyMarkup(review, {
          focus: `In the Mistake Book as: ${MISTAKE_TYPES[type] || type || 'a mistake'}. Resolving an item never deletes the attempts listed here.`,
        });
        // Maintenance belongs to the item the reader has opened, not to every
        // row on the screen: two buttons per line instead of four.
        const resolved = btn.dataset.status === 'resolved';
        panel.insertAdjacentHTML(
          'beforeend',
          `<div class="row tight row-maintenance">
            ${
              resolved
                ? `<button class="btn btn-sm" type="button" data-action="reopen" data-key="${esc(key)}">Reopen this item</button>`
                : `<button class="btn btn-sm" type="button" data-action="resolve" data-key="${esc(key)}">Mark resolved</button>`
            }
            <button class="btn btn-sm btn-quiet" type="button" data-action="remove" data-key="${esc(key)}">Remove from the book</button>
            <span class="tiny text-soft">Resolving never deletes the attempts above.</span>
          </div>`,
        );
        panel.dataset.filled = '1';
        row.scrollIntoView?.({ block: 'nearest' });
        return;
      }
    }, { signal: ctx.signal });
  },
};
