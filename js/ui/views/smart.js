/**
 * smart.js — Smart Practice.
 *
 * Assembles a session from weak topics, due revisions, repeated mistakes,
 * previously skipped questions, unseen coverage and under-practised topics —
 * and always explains why the session looks the way it does. It also states
 * plainly that question frequency is not a prediction of future papers.
 * Session size lives in one place (the shared session form); everything else
 * about the session is pre-filled from Settings and editable under "Advanced
 * settings".
 */

import { STORES } from '../../core/constants.js';
import * as db from '../../core/db.js';
import { state } from '../../core/state.js';
import { esc, sheet, notice, toast, emptyState, screenHead } from '../components.js';
import { allAttempts } from '../../services/attempts.js';
import { buildAttemptSummary, smartPracticePlan, SMART_BUCKETS, computeTopicStats } from '../../services/select.js';
import { configFields, readConfig, mountConfigFields, startPracticeTest, currentAttemptSummary } from './shared.js';

const viewState = { count: 20, overrideRepeats: false, includeDemonstration: true, plan: null };

/** Ten ticks, filled in proportion to what a source contributes to the sitting. */
function ticks(value, total) {
  const filled = total ? Math.round((value / total) * 10) : 0;
  return `<span class="plan-ticks" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i class="${i < filled ? 'is-on' : ''}"></i>`).join('')}</span>`;
}

/** Only the sources that actually contribute earn a line. */
function planRows(plan, total) {
  const rows = SMART_BUCKETS.map((bucket) => ({ bucket, n: plan.allocation[bucket.id] || 0 }))
    .filter((row) => row.n > 0)
    .sort((a, b) => b.n - a.n);
  if (!rows.length) {
    return `<p class="plan-empty">Nothing is due, wrong or unseen just yet — the plan falls back to whatever suits the bank best.</p>`;
  }
  return `<ol class="plan-rows">${rows
    .map(
      ({ bucket, n }) => `<li class="plan-row">
        <span class="plan-num">${n}</span>
        <span class="plan-what">
          <span class="plan-name">${esc(bucket.label)}</span>
          <span class="plan-why">${esc(bucket.why)}</span>
        </span>
        ${ticks(n, total)}
        <span class="plan-avail">of ${plan.bucketSizes[bucket.id] ?? 0} available</span>
      </li>`,
    )
    .join('')}</ol>`;
}

export default {
  title: 'Smart Practice',

  async render() {
    const metas = Array.from(state.questionIndex.values());
    if (!metas.length) {
      return `
        ${screenHead({
          title: 'Smart Practice',
          purpose: 'A session assembled from your recorded performance: revision due, repeated mistakes, skipped questions and unseen coverage.',
          primary: '<a class="btn btn-primary" href="#/bank">Import a question bank</a>',
        })}
        ${sheet({
          label: 'Smart practice needs a question bank',
          body: emptyState({
            title: 'No questions stored yet',
            message: 'Import a validated bank first.',
            willShow: 'A plan that says how many questions come from each source, and why.',
            action: '<a class="btn btn-primary" href="#/bank">Question Bank &amp; Imports</a>',
          }),
        })}`;
    }
    const attempts = await allAttempts();
    const attemptSummary = buildAttemptSummary(attempts);
    const revisionRecords = await db.getAll(STORES.REVISION);
    const topicStats = computeTopicStats(metas, attemptSummary);

    const plan = smartPracticePlan({
      metas,
      attemptSummary,
      revisionRecords,
      count: viewState.count,
      includeDemonstration: viewState.includeDemonstration,
      respectCooldown: !viewState.overrideRepeats,
      topicStats,
    });
    viewState.plan = plan;

    const weakTopicRows = Object.values(topicStats)
      .filter((t) => t.scored >= 3)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    const total = plan.questionIds.length;
    const sources = SMART_BUCKETS.filter((b) => (plan.allocation[b.id] || 0) > 0).length;

    return `
      ${screenHead({
        title: 'Smart Practice',
        purpose: 'One sitting assembled from what is due, what you keep getting wrong, what you skipped and what you have never seen.',
        secondary: '<a class="btn btn-sm btn-quiet" href="#/topic">Build it myself</a>',
      })}

      <div class="practice-layout smart-layout">
        <section class="sheet">
          <div class="sheet-head">
            <p class="section-label">How this session will be built</p>
            <div class="sheet-action"><span class="plan-total">${total} selected${sources ? ` from ${sources} source${sources === 1 ? '' : 's'}` : ''}</span></div>
          </div>

          ${planRows(plan, total)}

          <p class="plan-caution">Historical question frequency is a study aid — not evidence about what a future examination will contain.</p>

          ${
            weakTopicRows.length
              ? `<p class="section-label mt-4">Weakest topics right now</p>
                <ul class="weak-rows">${weakTopicRows
                  .map(
                    (t) => `<li class="weak-row">
                      <span class="weak-name">${esc(t.topic)}</span>
                      <span class="weak-sub">${esc(t.subject)} · ${String(t.scored)} judged</span>
                      <span class="weak-acc">${Math.round(t.accuracy * 100)}%</span>
                    </li>`,
                  )
                  .join('')}</ul>
                <p class="tiny text-soft m-0 mt-2"><a href="#/insights/">See every topic&rsquo;s accuracy in Insights</a></p>`
              : notice('No topic has enough judged answers to be called weak yet. The plan therefore leans on due revisions and unseen questions.', 'info')
          }

          <details class="disclosure mt-4">
            <summary>Every rule behind this plan (${plan.explain.length})</summary>
            <ul class="small mt-2">${plan.explain.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
          </details>
        </section>

        <aside class="practice-session" aria-label="Your session">
          <div class="practice-session-head">
            <h2>Your session</h2>
            <span id="sessionCount">${total} question${total === 1 ? '' : 's'} assembled</span>
            <span class="session-kind">Smart practice — not a previous-year paper</span>
          </div>
          <div class="practice-session-body">
            ${configFields({ paper: null, defaultCount: viewState.count, maxCount: metas.length, allowCustomScoring: true })}

            <div class="session-order">
              <label class="check"><input type="checkbox" id="smartOverrideRepeats" ${viewState.overrideRepeats ? 'checked' : ''} /><span>Include questions I saw in the last few days</span></label>
              <label class="check"><input type="checkbox" id="smartIncludeDemo" ${viewState.includeDemonstration ? 'checked' : ''} /><span>Include demonstration questions</span></label>
            </div>

            <div class="practice-start">
              <button class="btn btn-primary btn-block" type="button" id="startSmart" ${total ? '' : 'disabled'}>Start ${total || ''} question${total === 1 ? '' : 's'}</button>
              <p class="tiny text-soft m-0 mt-2">The plan is rebuilt whenever you change the size or the sources.</p>
            </div>
          </div>
        </aside>
      </div>`;
  },

  async mount(ctx) {
    mountConfigFields({
      // This screen rebuilds its plan — and re-renders itself — whenever the
      // size or an inclusion switch changes. `screen` is the per-screen form
      // memory in shared.js: without it each of those rebuilds threw away the
      // feedback timing, time limit and scoring the reader had just set.
      screen: 'smart',
      defaultCount: viewState.count,
      onCountChange: async (n) => {
        viewState.count = n;
        await ctx.refresh();
      },
    });
    document.getElementById('smartOverrideRepeats')?.addEventListener('change', async (ev) => {
      viewState.overrideRepeats = ev.target.checked;
      await ctx.refresh();
    });
    document.getElementById('smartIncludeDemo')?.addEventListener('change', async (ev) => {
      viewState.includeDemonstration = ev.target.checked;
      await ctx.refresh();
    });

    document.getElementById('startSmart')?.addEventListener('click', async () => {
      const metas = Array.from(state.questionIndex.values());
      const attemptSummary = await currentAttemptSummary();
      const revisionRecords = await db.getAll(STORES.REVISION);
      const config = readConfig('practiceCfg', {});
      const plan = smartPracticePlan({
        metas,
        attemptSummary,
        revisionRecords,
        count: config.count,
        includeDemonstration: viewState.includeDemonstration,
        respectCooldown: !viewState.overrideRepeats,
      });
      if (!plan.questionIds.length) {
        toast('No questions could be selected. Import more questions or relax the filters.', 'warn');
        return;
      }
      const byId = new Map(metas.map((m) => [m.id, m]));
      await startPracticeTest(ctx, {
        kind: 'smart',
        label: `Smart practice — ${plan.questionIds.length} questions`,
        questionIds: plan.questionIds.map((id) => id),
        metas: plan.questionIds.map((id) => byId.get(id)).filter(Boolean),
        config: {
          ...config,
          usePaperRules: false,
          scoring: config.scoring || { source: 'custom', ...state.settings.defaultScoring },
        },
        orderSource: 'shuffled',
        selectionNotes: plan.explain,
      });
    });
  },
};
