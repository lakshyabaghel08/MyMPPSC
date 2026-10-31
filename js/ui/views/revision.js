/**
 * revision.js (view) — Revision Centre.
 *
 * Due today, overdue and upcoming questions, each with the numeric basis for
 * its scheduled date and a plain-language reason. Nothing here promises
 * retention; the schedule is a transparent rule you can inspect and override.
 */

import { state } from '../../core/state.js';
import {
  esc,
  badge,
  notice,
  dataTable,
  emptyState,
  toast,
  openModal,
  confirmDialog,
  infoToggle,
  screenHead,
  sheet,
  marginNote,
  metaLine,
  stamp,
} from '../components.js';
import { fmtDate, fmtRelative, todayKey } from '../../core/util.js';
import { getQuestion } from '../../services/questions.js';
import * as revision from '../../services/revision.js';
import { allAttempts, listMistakes } from '../../services/attempts.js';
import { startPracticeTest } from './shared.js';
import { loadReview, reviewBodyMarkup } from '../reviewpanel.js';
import { revisionSkeleton } from '../skeletons.js';

const viewState = { filter: 'due', subject: 'all', topic: 'all', limit: revision.REVISION_PAGE_SIZE };

/** How many of the queue's filters are away from their starting state. */
const activeRevisionFilters = () => [viewState.filter !== 'due', viewState.subject !== 'all', viewState.topic !== 'all'].filter(Boolean).length;

function rulesBody() {
  const cfg = state.settings.revision;
  const intervals = Object.entries(cfg.intervals).map(([level, days]) => `level ${level} → ${days} day(s)`).join(' · ');
  return `
      <p class="small">Every scheduled date comes from the outcome of your last attempt on that question, the confidence you marked (if you mark it) and how long the answer took. The basis for each question is listed with it.</p>
      <ul class="small">
        <li><strong>Correct and confident</strong> moves the question up one level: ${esc(intervals)}.</li>
        <li><strong>Correct but unsure</strong> keeps the level but shortens the interval by ${Math.round((1 - cfg.uncertainMultiplier) * 100)}%.</li>
        <li><strong>Correct but guessed</strong> drops back to level ${esc(String(cfg.hardResetTo))} with a ${Math.round(cfg.guessMultiplier * 100)}% interval — a lucky guess is treated as weak recall, not mastery.</li>
        <li><strong>Incorrect</strong> resets to level ${esc(String(cfg.hardResetTo))}, counts a lapse and is scheduled again within days.</li>
        <li><strong>Unanswered</strong> is treated as a miss (settable in Settings) but stays labelled separately from a wrong answer.</li>
        <li><strong>Slow answers</strong> (over ${esc(String(cfg.slowAnswerSeconds))}s) shorten the next interval by 25%.</li>
        <li>Intervals are clamped between ${esc(String(cfg.minIntervalDays))} and ${esc(String(cfg.maxIntervalDays))} days.</li>
      </ul>
      <p class="tiny muted mb-0">This is a spaced-repetition heuristic based on your own recorded answers. It cannot guarantee that anything is remembered, and it is not a prediction about any examination. The queue holds at most one record per bank question, so it stays manageable however large the bank grows; each sitting takes at most ${revision.REVISION_SESSION_CAP} due questions.</p>`;
}

export default {
  title: 'Revision Centre',

  /** Placeholder while the schedule and attempt history load (router.js). */
  skeleton() {
    return revisionSkeleton();
  },

  async render() {
    const records = await revision.allRevisionRecords();
    const metas = Array.from(state.questionIndex.values());

    if (!records.length) {
      return `
        ${screenHead({
          title: 'Revision Centre',
          eyebrow: 'Nothing scheduled yet',
          purpose: metas.length ? 'Dates appear from your own recorded outcomes.' : 'Revision is built from attempts on your own bank.',
          primary: metas.length ? '<a class="btn btn-primary" href="#/topic">Start practising</a>' : '<a class="btn btn-primary" href="#/bank">Import a bank</a>',
        })}
        ${sheet({
          label: 'How it works',
          body: `<p class="m-0">Every question you attempt gets its own revision date, derived from whether you were right, how confident you were and how long you took. You can also add one by hand.</p>`,
          footer: infoToggle('How the revision schedule is decided', rulesBody()),
        })}`;
    }

    const buckets = revision.bucketise(records);
    const attempts = await allAttempts();
    const effectiveness = revision.revisionEffectiveness(records, attempts);
    const scoredAttempts = attempts.filter((a) => a.outcome === 'correct' || a.outcome === 'incorrect');
    const revisionAccuracy = scoredAttempts.length ? scoredAttempts.filter((a) => a.outcome === 'correct').length / scoredAttempts.length : NaN;

    const filtered = [...buckets.overdue, ...buckets.dueToday, ...buckets.upcoming]
      .filter((r) => (viewState.filter === 'all' ? true : viewState.filter === 'due' ? r.next_due <= todayKey() : viewState.filter === 'upcoming' ? r.next_due > todayKey() : true))
      .filter((r) => (viewState.subject === 'all' ? true : (r.subject || 'Unclassified') === viewState.subject))
      .filter((r) => (viewState.topic === 'all' ? true : (r.topic || 'Unclassified') === viewState.topic))
      .sort((a, b) => (a.next_due < b.next_due ? -1 : 1));

    const subjects = Array.from(new Set(records.map((r) => r.subject || 'Unclassified'))).sort();
    const topics = Array.from(new Set(records.filter((r) => viewState.subject === 'all' || (r.subject || 'Unclassified') === viewState.subject).map((r) => r.topic || 'Unclassified'))).sort();

    const openMistakeKeys = new Set((await listMistakes({ status: 'open' })).map((row) => row.question_id));
    const today = todayKey();
    const dueCount = buckets.overdue.length + buckets.dueToday.length;
    const cap = revision.REVISION_SESSION_CAP;

    const visible = filtered.slice(0, viewState.limit);
    // The stem is what the reader is deciding about, so it is worth one read
    // per visible row (a page is at most REVISION_PAGE_SIZE questions).
    const stems = new Map();
    await Promise.all(
      visible.map(async (rec) => {
        const question = state.questionIndex.has(rec.question_id) ? await getQuestion(rec.question_id) : null;
        const variant = question?.language_variants?.[state.settings.language] || Object.values(question?.language_variants || {})[0];
        stems.set(rec.question_id, variant?.question_text || '');
      }),
    );

    const entries = visible
      .map((rec) => {
        const meta = state.questionIndex.get(rec.question_id);
        const overdue = rec.next_due < today;
        const stampText = overdue ? 'overdue' : rec.next_due === today ? 'today' : fmtDate(rec.next_due);
        const stem = String(stems.get(rec.question_id) || '').replace(/\s+/g, ' ').trim();
        const clipped = stem.length > 150 ? `${stem.slice(0, 150).trimEnd()}…` : stem;
        return `<article class="queue-entry">
          <div class="queue-stamp">
            ${stamp(stampText, { tone: overdue || rec.next_due === today ? 'now' : '' })}
            <span class="stamp">level ${esc(String(rec.level))}</span>
          </div>
          <div class="queue-main">
            <p class="queue-question"${meta?.langs?.includes('hi') && state.settings.language === 'hi' ? ' lang="hi"' : ''}>${clipped ? esc(clipped) : `<span class="text-soft">Question ${esc(rec.question_id)} — not in the bank</span>`}</p>
            <p class="meta-line">
              ${meta ? `${esc(meta.subject || 'Unclassified')} <span aria-hidden="true">/</span> ${esc(meta.topic || '—')}` : 'not stored'}
              ${openMistakeKeys.has(rec.question_id) ? '<span class="text-now">also an open mistake</span>' : ''}
              ${rec.manual_override ? '<span>date set by you</span>' : ''}
              ${rec.lapses ? `<span>${esc(String(rec.lapses))} lapse(s)</span>` : ''}
            </p>
          </div>
          <div class="queue-actions">
            <button class="quiet-action" type="button" data-action="mark-outcome" data-outcome="correct" data-qid="${esc(rec.question_id)}">Knew it</button>
            <button class="quiet-action" type="button" data-action="mark-outcome" data-outcome="incorrect" data-qid="${esc(rec.question_id)}">Still unclear</button>
            <button class="quiet-action" type="button" data-action="mark-note" data-qid="${esc(rec.question_id)}">With a note…</button>
            <button class="quiet-action" type="button" data-action="details" data-qid="${esc(rec.question_id)}" aria-expanded="false" aria-controls="revrow-${esc(rec.question_id)}">Why this date</button>
            <button class="btn btn-sm" type="button" data-action="revise" data-qid="${esc(rec.question_id)}">Practise</button>
          </div>
        </article>
        <div class="queue-detail" id="revrow-${esc(rec.question_id)}" hidden><div class="review-inline" data-review-for="${esc(rec.question_id)}"></div></div>`;
      })
      .join('');

    // The next seven days, as a strip: the one visual that answers "what is
    // coming" without a table of dates.
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      const count = [...buckets.dueToday, ...buckets.upcoming].filter((rec) => rec.next_due === key).length;
      return { date, key, count };
    });
    const bucketOf = (count) => (count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 10 ? 3 : 4);
    const loadStrip = `<div class="load-strip" role="img" aria-label="Questions due over the next seven days: ${days.map((d) => `${d.date.getDate()} ${d.count}`).join(', ')}">
        ${days
          .map(
            (d) => `<span class="load-day"><i class="lvl${bucketOf(d.count)}"></i><b>${d.date.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}</b><em>${d.count || ''}</em></span>`,
          )
          .join('')}
      </div>`;

    const margin = marginNote(
      `<p>Tracked <b class="fig">${records.length}</b> of ${metas.length} questions.</p>
       <p>Average interval <b class="fig">${Math.round(records.reduce((a, r) => a + (r.interval_days || 0), 0) / records.length)}</b> days.</p>
       <p>Lapses <b class="fig">${records.reduce((a, r) => a + (r.lapses || 0), 0)}</b> — wrong or blanked after scheduling.</p>
       <p>Revision accuracy <b class="fig">${Number.isNaN(revisionAccuracy) ? '—' : `${Math.round(revisionAccuracy * 100)}%`}</b> across scored attempts.</p>
       ${
         effectiveness.withHistory
           ? `<p>First to latest attempt: <b class="fig">${effectiveness.improved}</b> improved, ${effectiveness.worsened} declined, ${effectiveness.unchanged} unchanged.</p>`
           : `<p>Not enough history yet to say whether revision is working — two scored attempts on a question are needed.</p>`
       }`,
      { title: 'Schedule health' },
    );

    return `
      ${screenHead({
        title: 'Revision Centre',
        eyebrow: dueCount ? `${dueCount} due now${buckets.overdue.length ? `, ${buckets.overdue.length} overdue` : ''}` : 'Nothing due today',
        purpose: 'Each date comes from your own recorded outcomes, and can be overridden.',
        primary: `<button class="btn btn-primary" type="button" data-action="revise-due" ${dueCount ? '' : 'disabled'}>Revise ${Math.min(cap, dueCount)} of ${dueCount}</button>`,
        secondary: '<button class="btn btn-sm btn-quiet" type="button" data-action="add-manual">Add a question</button>',
      })}

      <div class="with-margin">
        <div>
          ${sheet({
            label: `Queue — ${filtered.length} of ${records.length}`,
            action: infoToggle('How the revision schedule is decided', rulesBody()),
            body: `
              <div class="filters">
                <label class="field"><span class="label-text">Show</span>
                  <select id="revFilter">
                    <option value="due" ${viewState.filter === 'due' ? 'selected' : ''}>Due now (${dueCount})</option>
                    <option value="upcoming" ${viewState.filter === 'upcoming' ? 'selected' : ''}>Upcoming (${buckets.upcoming.length})</option>
                    <option value="all" ${viewState.filter === 'all' ? 'selected' : ''}>Everything (${records.length})</option>
                  </select>
                </label>
                <label class="field"><span class="label-text">Subject</span>
                  <select id="revSubject"><option value="all">All subjects</option>${subjects.map((s2) => `<option value="${esc(s2)}" ${viewState.subject === s2 ? 'selected' : ''}>${esc(s2)}</option>`).join('')}</select>
                </label>
                <label class="field"><span class="label-text">Topic</span>
                  <select id="revTopic"><option value="all">All topics</option>${topics.map((t) => `<option value="${esc(t)}" ${viewState.topic === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
                </label>
              </div>
              ${
                visible.length
                  ? `<div class="queue-list">${entries}</div>`
                  : `<p class="quiet-note">Nothing matches this filter. ${records.length} question(s) are still tracked.</p>`
              }
              ${
                filtered.length > visible.length
                  ? `<div class="row mt-3"><button class="quiet-action" type="button" data-action="show-more">Show more — ${visible.length} of ${filtered.length} shown</button></div>`
                  : ''
              }`,
            footer: `<p class="tiny text-soft m-0">Most overdue first; one sitting takes at most ${cap} questions, and the rest stay due.</p>`,
          })}
        </div>
        ${margin}
      </div>

      ${sheet({
        label: 'The next seven days',
        body: loadStrip,
      })}`;
  },

  async mount(ctx, root) {
    const rerender = async () => {
      viewState.limit = revision.REVISION_PAGE_SIZE;
      viewState.filter = document.getElementById('revFilter')?.value || 'due';
      viewState.subject = document.getElementById('revSubject')?.value || 'all';
      viewState.topic = document.getElementById('revTopic')?.value || 'all';
      await ctx.refresh();
    };
    ['revFilter', 'revSubject', 'revTopic'].forEach((id) => document.getElementById(id)?.addEventListener('change', rerender));

    root.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'revise') {
        const id = btn.dataset.qid;
        await startPracticeTest(ctx, {
          kind: 'revision',
          label: 'Revision — single question',
          questionIds: [id],
          metas: [state.questionIndex.get(id)].filter(Boolean),
          config: { feedbackMode: 'learning', durationMinutes: null },
          orderSource: 'due_first',
        });
        return;
      }

      if (action === 'show-more') {
        viewState.limit += revision.REVISION_PAGE_SIZE;
        await ctx.refresh();
        return;
      }

      if (action === 'revise-due') {
        const records = await revision.allRevisionRecords();
        const queue = revision.dueQueue(records);
        const ids = queue.ids.filter((id) => state.questionIndex.has(id));
        if (!ids.length) {
          toast('Nothing is due right now.', 'info');
          return;
        }
        if (queue.remaining > 0) toast(`${queue.total} questions are due; this sitting takes the first ${ids.length}. The rest stay due.`, 'info');
        await startPracticeTest(ctx, {
          kind: 'revision',
          label: `Revision — ${ids.length} due question(s)`,
          questionIds: ids,
          metas: ids.map((id) => state.questionIndex.get(id)).filter(Boolean),
          config: { feedbackMode: 'learning', durationMinutes: null },
          orderSource: 'due_first',
        });
        return;
      }

      if (action === 'add-manual') {
        const value = await openModal({
          title: 'Add a question to the revision queue',
          body: `
            <label class="field"><span class="label-text">Question id</span><input type="text" id="manualQid" placeholder="e.g. P1-2021-014" /></label>
            <label class="field"><span class="label-text">Revise again in (days)</span><input type="number" min="1" step="1" id="manualDays" value="1" /></label>
            <p class="tiny muted">A question you add by hand keeps its own schedule and states that it was added manually.</p>`,
          actions: [
            { label: 'Cancel', value: 'cancel' },
            { label: 'Add', tone: 'btn-primary', value: 'ok' },
          ],
        });
        if (value !== 'ok') return;
        const qid = document.getElementById('manualQid')?.value.trim();
        const days = Number(document.getElementById('manualDays')?.value) || 1;
        if (!qid) {
          toast('Enter a question id.', 'warn');
          return;
        }
        if (!state.questionIndex.has(qid)) {
          toast(`No stored question has the id "${qid}".`, 'bad');
          return;
        }
        await revision.ensureRevisionRecord(qid, { reason: `Added to the revision queue by you (revise again in ${days} day(s)).`, dueDays: days });
        toast('Question added to the revision queue.', 'ok');
        await ctx.refresh();
        return;
      }

      if (action === 'mark-outcome') {
        const outcome = btn.dataset.outcome === 'incorrect' ? 'incorrect' : 'correct';
        await revision.markRevised(btn.dataset.qid, { outcome, confidence: null, note: null });
        toast(outcome === 'correct' ? 'Marked revised — the question moves on in the schedule.' : 'Recorded as still unclear — the question comes back sooner.', 'ok');
        await ctx.refresh();
        return;
      }

      if (action === 'mark-note') {
        const value = await openModal({
          title: 'Mark as revised, with a note',
          body: `
            <p class="small">Use this when you revised the question outside the app (notes, a book, a group discussion) and want the schedule to move on.</p>
            <label class="field"><span class="label-text">How did it go?</span>
              <select id="markOutcome">
                <option value="correct">I understood it / answered it correctly</option>
                <option value="incorrect">It is still unclear to me</option>
              </select>
            </label>
            <label class="field"><span class="label-text">Note (optional, stored with the entry)</span><input type="text" id="markNote" placeholder="e.g. re-read the chapter notes" /></label>`,
          actions: [
            { label: 'Cancel', value: 'cancel' },
            { label: 'Save', tone: 'btn-primary', value: 'ok' },
          ],
        });
        if (value !== 'ok') return;
        const outcome = document.getElementById('markOutcome')?.value || 'correct';
        const note = document.getElementById('markNote')?.value || null;
        await revision.markRevised(btn.dataset.qid, { outcome, confidence: null, note });
        toast('Revision recorded; the question was rescheduled.', 'ok');
        await ctx.refresh();
        return;
      }

      if (action === 'details') {
        // The question, its schedule and its history open *in the row*: the
        // same panel the Mistake Book shows, so the reader keeps the queue.
        const questionId = btn.dataset.qid;
        const row = document.getElementById(`revrow-${questionId}`);
        const panel = row?.querySelector('.review-inline');
        if (!row || !panel) return;
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        btn.textContent = open ? 'Details' : 'Hide details';
        row.hidden = open;
        if (open || panel.dataset.filled === '1') return;
        panel.innerHTML = '<p class="small muted m-0">Loading the question…</p>';
        const rec = (await revision.allRevisionRecords()).find((r) => r.question_id === questionId);
        const review = await loadReview(questionId);
        panel.innerHTML = reviewBodyMarkup(review, {
          focus: rec
            ? `Scheduled for ${rec.next_due} · level ${rec.level} · every ${rec.interval_days} day(s)${rec.manual_override ? ' · set by you' : ''}. ${rec.reason || ''}`
            : 'This question is no longer scheduled.',
          extraBody: `<div class="review-schedule">
            <h3>Why this date</h3>
            <p class="small m-0">${esc(rec?.reason || 'No reason recorded.')}</p>
            <p class="tiny muted mono m-0 mt-1">${esc(rec ? revision.describeScheduleBasis(rec.basis) : '')}</p>
            ${dataTable({
              columns: [{ label: 'Field' }, { label: 'Value' }],
              rows: rec
                ? [
                    ['State', esc(rec.state)],
                    ['Interval', `${esc(String(rec.interval_days))} day(s)`],
                    ['Next due', esc(rec.next_due)],
                    ['Lapses', esc(String(rec.lapses || 0))],
                    ['Manual override', rec.manual_override ? 'yes' : 'no'],
                  ]
                : [],
              empty: 'Nothing is scheduled for this question.',
              className: 'compact',
            })}
            <h3>Schedule history</h3>
            ${dataTable({
              columns: [{ label: 'When' }, { label: 'Outcome' }, { label: 'Interval' }, { label: 'Next due' }, { label: 'Reason' }],
              rows: (rec?.history || []).slice().reverse().map((h) => [esc(fmtRelative(h.at)), esc(h.outcome), `${esc(String(h.interval_days ?? '—'))} d`, esc(h.next_due || '—'), esc(h.reason || '—')]),
              empty: 'No history yet.',
              className: 'compact',
            })}
            <div class="row mt-2">
              <button class="btn btn-sm" type="button" data-action="reschedule" data-qid="${esc(questionId)}">Reschedule…</button>
              <button class="btn btn-sm" type="button" data-action="interval" data-qid="${esc(questionId)}">Set interval…</button>
              <button class="btn btn-sm btn-danger" type="button" data-action="remove" data-qid="${esc(questionId)}">Remove from queue</button>
            </div>
          </div>`,
        });
        panel.dataset.filled = '1';
        row.scrollIntoView?.({ block: 'nearest' });
        return;
      }

      if (action === 'reschedule') {
        const questionId = btn.dataset.qid;
        const answer = await openModal({
          title: 'Reschedule this question',
          body: `<label class="field"><span class="label-text">Revise again on</span><input type="date" id="reschedDate" value="${esc(todayKey())}" /></label>
                 <label class="field"><span class="label-text">Note (stored with the change)</span><input type="text" id="reschedNote" /></label>`,
          actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Save', tone: 'btn-primary', value: 'ok' }],
        });
        if (answer !== 'ok') return;
        const date = document.getElementById('reschedDate')?.value;
        if (!date) return;
        await revision.reschedule(questionId, date, document.getElementById('reschedNote')?.value || '');
        toast(`Rescheduled to ${date}.`, 'ok');
        await ctx.refresh();
        return;
      }

      if (action === 'interval') {
        const questionId = btn.dataset.qid;
        const answer = await openModal({
          title: 'Set the next interval',
          body: `<label class="field"><span class="label-text">Days until this question returns</span><input type="number" min="1" max="365" id="intervalDays" value="7" /></label>`,
          actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Save', tone: 'btn-primary', value: 'ok' }],
        });
        if (answer !== 'ok') return;
        const days = Number(document.getElementById('intervalDays')?.value) || 7;
        await revision.setManualInterval(questionId, days, 'manual interval set by you');
        toast(`This question will return in ${days} day(s).`, 'ok');
        await ctx.refresh();
        return;
      }

      if (action === 'remove') {
        const ok = await confirmDialog({
          title: 'Remove from the revision queue?',
          message: 'The question stops being scheduled. Your attempts and analytics are not affected, and a future attempt will schedule it again.',
          confirmLabel: 'Remove',
          danger: true,
        });
        if (!ok) return;
        await revision.removeFromQueue(btn.dataset.qid);
        toast('Removed from the revision queue.', 'info');
        await ctx.refresh();
        return;
      }

    }, { signal: ctx.signal });
  },
};
