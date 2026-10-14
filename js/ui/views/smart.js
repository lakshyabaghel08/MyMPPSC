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
import { esc, card, notice, dataTable, tile, toast, emptyState, infoToggle } from '../components.js';
import { allAttempts } from '../../services/attempts.js';
import { buildAttemptSummary, smartPracticePlan, SMART_BUCKETS, computeTopicStats } from '../../services/select.js';
import { configFields, readConfig, mountConfigFields, startPracticeTest, currentAttemptSummary } from './shared.js';

const viewState = { count: 20, overrideRepeats: false, includeDemonstration: true, plan: null };

export default {
  title: 'Smart Practice',

  async render() {
    const metas = Array.from(state.questionIndex.values());
    if (!metas.length) {
      return `
        <h1>Smart Practice</h1>
        ${card({
          title: 'Smart practice needs a question bank',
          body: emptyState({
            title: 'No questions stored yet',
            message: 'Import a validated bank first.',
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
      .slice(0, 6);

    const bucketRows = SMART_BUCKETS.map((b) => [
      esc(b.label),
      String(plan.bucketSizes[b.id] ?? 0),
      String(plan.allocation[b.id] || 0),
      `<span class="tiny muted">${esc(b.why)}</span>`,
    ]);

    return `
      <h1>Smart Practice</h1>
      <p class="muted">A session assembled from your recorded performance: what is due for revision, what you keep getting wrong, what you skipped, and what you have never seen.</p>

      <div class="grid tiles mb-4">
        ${tile({ label: 'Questions due for revision', value: String(plan.counts.revisionDue), sub: 'due today or overdue', tone: plan.counts.revisionDue ? 'accent' : '', source: 'derived', where: 'Scheduled from attempt history' })}
        ${tile({ label: 'Repeated mistakes', value: String(plan.counts.repeatedMistakes), sub: 'wrong twice or wrong most recently', tone: plan.counts.repeatedMistakes ? 'warn' : '', source: 'measured', where: 'From local Mistake Book' })}
        ${tile({ label: 'Never attempted', value: String(plan.counts.unseen), sub: `of ${metas.length} stored questions`, source: 'measured', where: 'Zero recorded attempts' })}
        ${tile({ label: 'Weak topics', value: String(plan.counts.weakTopics), sub: 'at least 3 judged answers each', source: 'derived', where: 'Min 3 judged & low accuracy' })}
      </div>

      ${card({
        title: 'How this session will be built',
        body: `
          ${dataTable({ columns: [{ label: 'Source of questions' }, { label: 'Available', num: true }, { label: 'In this session', num: true }, { label: 'Why' }], rows: bucketRows, className: 'compact' })}
          <div class="row mt-3">
            <label class="check m-0"><input type="checkbox" id="smartOverrideRepeats" ${viewState.overrideRepeats ? 'checked' : ''} /><span>Override repeat rules — allow questions I saw recently</span></label>
            <label class="check m-0"><input type="checkbox" id="smartIncludeDemo" ${viewState.includeDemonstration ? 'checked' : ''} /><span>Include demonstration questions</span></label>
          </div>
          <details class="disclosure mt-3"><summary>Why this session was generated (${plan.explain.length} point(s))</summary><ul class="small">${plan.explain.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></details>
        `,
        footer: infoToggle('About this plan', '<p class="small m-0">Historical question frequency is a study-prioritisation aid only. It is not evidence about what a future examination will contain.</p>'),
      })}

      ${card({
        title: 'Session settings',
        body: `${configFields({ paper: null, defaultCount: viewState.count, maxCount: metas.length, allowCustomScoring: true })}
        <div class="sticky-actions">
          <button class="btn btn-primary" type="button" id="startSmart">Start smart practice</button>
          <span class="tiny muted">${plan.questionIds.length} question(s) will be included.</span>
        </div>`,
      })}

      ${card({
        title: 'Topics driving this session',
        body: weakTopicRows.length
          ? dataTable({
              columns: [{ label: 'Topic' }, { label: 'Subject' }, { label: 'Judged answers', num: true }, { label: 'Accuracy', num: true }],
              rows: weakTopicRows.map((t) => [esc(t.topic), esc(t.subject), `${String(t.scored)}`, `${Math.round(t.accuracy * 100)}%`]),
              className: 'compact',
            })
          : notice('Not enough judged answers exist yet to call any topic weak. Smart practice is therefore weighted towards unseen questions and due revisions.', 'info'),
      })}`;
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
