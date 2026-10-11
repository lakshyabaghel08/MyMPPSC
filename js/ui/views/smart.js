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
import { esc, card, notice, dataTable, kpi, toast, emptyState, sourceChip, evidenceMeter, pageHead, sectionHead, ring } from '../components.js';
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
        ${pageHead({ title: 'Smart Practice', description: 'A session assembled from your recorded performance — weak topics, due revisions, repeated mistakes, skipped questions and unseen coverage.' })}
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

    const coveredFraction = metas.length ? (metas.length - plan.counts.unseen) / metas.length : 0;

    return `
      ${pageHead({
        title: 'Smart Practice',
        description: 'A session assembled from your recorded performance: what is due for revision, what you keep getting wrong, what you skipped, and what you have never seen.',
        actions: `<a class="btn btn-quiet" href="#/revision">Revision Centre</a>`,
      })}

      <div class="kpi-grid">
        ${kpi({ label: 'Questions due for revision', value: String(plan.counts.revisionDue), context: 'due today or overdue', tone: plan.counts.revisionDue ? 'accent' : '', iconName: 'revision', foot: sourceChip('derived', 'scheduled from attempt history') })}
        ${kpi({ label: 'Repeated mistakes', value: String(plan.counts.repeatedMistakes), context: 'wrong twice or wrong most recently', tone: plan.counts.repeatedMistakes ? 'warn' : '', iconName: 'alert', foot: sourceChip('measured', 'local Mistake Book') })}
        ${kpi({ label: 'Never attempted', value: String(plan.counts.unseen), context: `of ${metas.length} stored questions`, iconName: 'sparkle', foot: sourceChip('measured', 'zero recorded attempts') })}
        ${kpi({ label: 'Weak topics', value: String(plan.counts.weakTopics), context: 'at least 3 judged answers each', iconName: 'target', foot: sourceChip('derived', 'min 3 judged · low accuracy') })}
      </div>

      ${sectionHead({ title: 'How this session will be built', kicker: 'Plan', meta: `${plan.questionIds.length} question(s) selected`, actions: sourceChip('derived', `${plan.questionIds.length} picked`) })}
      ${card({
        body: `
          ${
            plan.questionIds.length
              ? `<div class="alloc-bar" role="img" aria-label="${esc(
                  SMART_BUCKETS.filter((b) => (plan.allocation[b.id] || 0) > 0)
                    .map((b) => `${plan.allocation[b.id]} from ${b.label.toLowerCase()}`)
                    .join(', ') || 'No questions could be allocated',
                )}">
                  ${SMART_BUCKETS.filter((b) => (plan.allocation[b.id] || 0) > 0)
                    .map((b) => `<span class="alloc-seg" data-alloc-seg="${esc(b.id)}" data-alloc-value="${esc(String(plan.allocation[b.id] || 0))}"></span>`)
                    .join('')}
                </div>
                <div class="alloc-legend">
                  ${SMART_BUCKETS.filter((b) => (plan.allocation[b.id] || 0) > 0)
                    .map((b) => `<span><i></i>${esc(b.label)} · ${esc(String(plan.allocation[b.id] || 0))}</span>`)
                    .join('')}
                </div>`
              : ''
          }

          <div class="split-2 relaxed">
            <div>${dataTable({ columns: [{ label: 'Source of questions' }, { label: 'Available', num: true }, { label: 'In this session', num: true }, { label: 'Why' }], rows: bucketRows, className: 'compact' })}</div>
            <div class="ring-panel">
              ${ring(coveredFraction, { label: 'Bank coverage', sub: `${metas.length - plan.counts.unseen} of ${metas.length} seen`, size: 128, width: 11 })}
              <p class="tiny muted m-0">Share of your stored bank that has at least one recorded attempt. The remaining ${plan.counts.unseen} question(s) are eligible for fresh coverage.</p>
            </div>
          </div>
          <div class="row mt-3">
            <label class="check m-0"><input type="checkbox" id="smartOverrideRepeats" ${viewState.overrideRepeats ? 'checked' : ''} /><span>Override repeat rules — allow questions I saw recently</span></label>
            <label class="check m-0"><input type="checkbox" id="smartIncludeDemo" ${viewState.includeDemonstration ? 'checked' : ''} /><span>Include demonstration questions</span></label>
          </div>
          <details class="disclosure mt-3"><summary>Why this session was generated (${plan.explain.length} point(s))</summary><ul class="small">${plan.explain.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></details>
        `,
        footer: 'Historical question frequency is a study-prioritisation aid only. It is not evidence about what a future examination will contain.',
      })}

      ${sectionHead({ title: 'Session settings', kicker: 'Start', meta: 'Size and feedback are the only decisions', actions: sourceChip('derived', 'session rules') })}
      ${card({
        body: `${configFields({ paper: null, defaultCount: viewState.count, maxCount: metas.length, allowCustomScoring: true })}
        <div class="sticky-actions">
          <button class="btn btn-primary" type="button" id="startSmart">Start smart practice</button>
          <span class="tiny muted">${plan.questionIds.length} question(s) will be included.</span>
        </div>`,
      })}

      ${sectionHead({ title: 'Topics driving this session', meta: 'Ranked by accuracy where at least three answers were judged', actions: sourceChip('derived', 'min 3 judged') })}
      ${card({
        body: weakTopicRows.length
          ? dataTable({
              columns: [{ label: 'Topic' }, { label: 'Subject' }, { label: 'Judged answers', num: true }, { label: 'Accuracy', num: true }],
              rows: weakTopicRows.map((t) => [esc(t.topic), esc(t.subject), `${String(t.scored)} ${evidenceMeter(t.scored)}`, `${Math.round(t.accuracy * 100)}%`]),
              className: 'compact',
            })
          : notice('Not enough judged answers exist yet to call any topic weak. Smart practice is therefore weighted towards unseen questions and due revisions.', 'info'),
      })}`;
  },

  async mount(ctx) {
    const allocTotal = [...document.querySelectorAll('[data-alloc-value]')].reduce((a, el) => a + (Number(el.dataset.allocValue) || 0), 0) || 1;
    document.querySelectorAll('[data-alloc-seg]').forEach((el) => {
      el.style.setProperty('--alloc-w', String(((Number(el.dataset.allocValue) || 0) / allocTotal) * 100));
    });

    mountConfigFields({
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
