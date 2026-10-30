/**
 * dashboard.js — The start screen.
 *
 * Hierarchy:
 *   1. What should I do now? ("Today" panel: next revision due, unfinished session to resume, weakest 3 topics with evidence)
 *   2. What do I actually know? (Measured coverage, accuracy, revision queue, study time)
 *   3. Where did it come from? (Provenance chips, evidence meters, attention notices)
 */

import { state } from '../../core/state.js';
import { esc, card, badge, icon, dataTable, confirmDialog, toast, evidenceMeter, screenHead, countChip, cardInfo, emptyState } from '../components.js';
import { fmtPct, fmtDuration, fmtDate, fmtRelative, topicPracticeHref } from '../../core/util.js';
import { loadAnalytics, dashboardSummary, studyPriorities } from '../../services/analytics.js';
import * as testsSvc from '../../services/tests.js';
import { loadSyllabusWorkspace } from '../../services/syllabus-hub.js';
import * as revision from '../../services/revision.js';
import { bankSummary } from '../../services/questions.js';
import { startPracticeTest } from './shared.js';
import { openPracticeSheet } from '../practicesheet.js';
import { dashboardSkeleton } from '../skeletons.js';

function tone(value, { good = 0.75, bad = 0.5 } = {}) {
  if (!Number.isFinite(value)) return '';
  if (value >= good) return 'ok';
  if (value < bad) return 'bad';
  return 'warn';
}

function metricCard({ iconName, label, value, context, secondaryLabel, secondaryValue, secondaryContext = '', tone = '' }) {
  return `<article class="metric-card ${tone}">
    <div class="metric-card-top">
      <span class="metric-label">${esc(label)}</span>
      <span class="metric-icon">${icon(iconName, { size: 19 })}</span>
    </div>
    <div class="metric-value">${value}</div>
    <div class="metric-context">${context}</div>
    <div class="metric-secondary">
      <div>
        <span>${esc(secondaryLabel)}</span>
        ${secondaryContext ? `<small>${secondaryContext}</small>` : ''}
      </div>
      <strong>${secondaryValue}</strong>
    </div>
  </article>`;
}

function noBankCard() {
  return `
    ${screenHead({
      title: 'Welcome to MyMPPSC',
      purpose: 'A local-first MPPSC Prelims practice app: the bank, your answers, mistakes and revision schedule live in this browser.',
      primary: '<a class="btn btn-primary" href="#/bank">Import a question bank</a>',
      secondary: '<a class="btn btn-quiet" href="#/help">How this app works</a>',
    })}
    ${card({
      title: 'Start by importing a question bank',
      body: `
        <ol class="small">
          <li>Import a question bank JSON file exported by your own data pipeline (or load the clearly-labelled demonstration bank to look around).</li>
          <li>Take a test — a full paper simulation, a topic set, a custom set or a smart session.</li>
          <li>Review the report, work through your mistake book, and let the revision schedule tell you what is due.</li>
        </ol>
        <div class="row">
          <button class="btn" type="button" id="dashLoadDemo">Load the demonstration bank</button>
        </div>
        <p class="tiny muted mt-2 mb-0">Demonstration questions are synthetic examples written to show the schema. They are never presented as authentic MPPSC previous-year questions.</p>`,
    })}`;
}

export default {
  title: 'Dashboard',

  /** Placeholder while the analytics and test history load (router.js). */
  skeleton() {
    return dashboardSkeleton({ hasBank: state.questionIndex.size > 0 });
  },

  async render() {
    const metas = Array.from(state.questionIndex.values());
    if (!metas.length) return noBankCard();

    const { analytics } = await loadAnalytics();
    const [allTests, unfinished] = await Promise.all([testsSvc.listTests({ limit: 200 }), testsSvc.unfinishedTests()]);

    const summary = dashboardSummary({ analytics, tests: allTests, revision: analytics.revision, settings: state.settings });
    const bank = bankSummary();
    // One figure for the whole curriculum. Progress marked on the official
    // syllabus used to be invisible here, because only the planner's own store
    // was read; the hub reads both. The same roll-up feeds study priorities,
    // which previously received a shape that carried no topic index at all.
    const curriculum = await loadSyllabusWorkspace();
    const priorities = studyPriorities({ analytics, syllabusProgress: curriculum.progress, limit: 6 });

    const missingKeys = metas.filter((m) => !m.hasSuppliedAnswer && !m.hasVerifiedAnswer).length;
    const disputed = metas.filter((m) => m.disputed).length;

    const recentTestRows = summary.recentTests.map((t) => [
      `<a href="#/report/${esc(t.id)}">${esc(t.label)}</a><div class="tiny muted">${esc(fmtDate(t.at))}</div>`,
      t.score === null || t.score === undefined ? '<span class="soft">—</span>' : `${esc(String(t.score))}${t.max ? ` / ${esc(String(t.max))}` : ''}`,
      t.accuracy === null || t.accuracy === undefined ? '<span class="soft">—</span>' : esc(fmtPct(t.accuracy)),
    ]);

    const priorityRows = priorities.map((p) => [
      `<strong>${esc(p.topic)}</strong><div class="tiny muted">${esc(p.subject)}</div>`,
      `${esc(String(p.available))}`,
      p.scored ? `${esc(fmtPct(p.accuracy))} ${evidenceMeter(p.scored)}` : '<span class="soft">no evidence</span>',
      `<div class="tiny">${p.reasons.slice(0, 3).map((r) => esc(r)).join('<br />')}</div>`,
      `<a class="btn btn-sm" href="${esc(topicPracticeHref(p.subject, p.topic))}">Practise</a>`,
    ]);

    const attention = [];
    if (missingKeys) attention.push(`${missingKeys} question(s) have no answer key at all — they are excluded from scoring rather than marked wrong.`);
    if (disputed) attention.push(`${disputed} question(s) have a disputed answer key. The stored key is preserved and the report shows which key was used.`);
    if (bank.unclassified) attention.push(`${bank.unclassified} question(s) are not yet classified by subject/topic, so they cannot appear in topic-level analysis until you classify them.`);

    const dueCount = summary.dueToday + summary.overdue;
    const weakTopics = (analytics.topics || []).filter((t) => t.verdict === 'weak').slice(0, 3);

    const todayPanel = card({
      title: 'Today — what should I do now?',
      subtitle: 'Your focused plan, based on what needs attention next.',
      className: 'today-command',
      body: `<div class="today-grid">
        <div class="today-item">
          <div class="today-item-head">
            <span class="action-icon revision">${icon('revision', { size: 20 })}</span>
            <div><span class="today-item-title">Revision queue</span><span class="today-eyebrow">Spaced repetition</span></div>
          </div>
          <p class="small m-0">
            ${
              dueCount > 0
                ? `<strong>${dueCount}</strong> question(s) due (${summary.dueToday} today · ${summary.overdue} overdue).`
                : 'No questions are due for revision right now.'
            }
          </p>
          <div class="row tight mt-auto pt-1">
            <button class="btn btn-primary btn-sm" type="button" id="dashReviseDue" ${dueCount ? '' : 'disabled'}>
              Start revision
            </button>
            <a class="btn btn-sm" href="#/revision">Queue</a>
          </div>
        </div>

        <div class="today-item">
          <div class="today-item-head">
            <span class="action-icon test">${icon('test-centre', { size: 20 })}</span>
            <div><span class="today-item-title">Active session</span><span class="today-eyebrow">Autosaved on this device</span></div>
          </div>
          <p class="small m-0">
            ${
              unfinished.length
                ? `You have <strong>${unfinished.length}</strong> unfinished test session(s). <strong>${esc(unfinished[0].label)}</strong> — updated ${esc(fmtRelative(unfinished[0].updated_at))}${unfinished.length > 1 ? ` (+${unfinished.length - 1} more)` : ''}.`
                : 'No unfinished test session. Start a paper simulation or smart practice set.'
            }
          </p>
          <div class="row tight mt-auto pt-1">
            ${
              unfinished.length
                ? `<a class="btn btn-primary btn-sm" href="#/runner/${esc(unfinished[0].id)}">Resume</a><a class="btn btn-sm" href="#/test-centre">See all</a>`
                : `<a class="btn btn-primary btn-sm" href="#/test-centre">Paper simulations</a><a class="btn btn-sm" href="#/smart">Smart practice</a>`
            }
          </div>
        </div>

        <div class="today-item">
          <div class="today-item-head">
            <span class="action-icon analytics">${icon('analytics', { size: 20 })}</span>
            <div><span class="today-item-title">Topics to strengthen</span><span class="today-eyebrow">Based on 3+ judged attempts</span></div>
          </div>
          ${
            weakTopics.length
              ? `<ul class="small m-0">${weakTopics
                  .map(
                    (t) =>
                      `<li><strong>${esc(t.subject)} › ${esc(t.topic)}</strong> — ${fmtPct(t.accuracy)} ${evidenceMeter(t.scored)}</li>`,
                  )
                  .join('')}</ul>`
              : `<p class="small muted m-0">No topic has enough judged evidence and low accuracy yet. ${evidenceMeter(0, 3)}</p>`
          }
          <div class="row tight mt-auto pt-1">
            <a class="btn btn-sm" href="#/topic">Topic practice</a>
            <a class="btn btn-sm" href="#/analytics">Analytics</a>
          </div>
        </div>
      </div>`,
    });

    return `
      ${screenHead({
        title: 'Dashboard',
        purpose: 'Your daily plan, evidence-led revision and every practice session, counted from what this device has recorded.',
        primary: '<button class="btn btn-primary" type="button" id="dashPractise">Practise now</button>',
        secondary:
          '<a class="btn btn-sm" href="#/test-centre">Paper simulations</a><a class="btn btn-sm" href="#/topic">Topic &amp; custom</a><a class="btn btn-sm" href="#/revision">Revision</a>',
      })}

      ${todayPanel}

      <div class="metrics-grid" aria-label="Study overview">
        ${metricCard({
          iconName: 'bank',
          label: 'Question bank',
          value: esc(String(bank.total)),
          context: `${bank.papers} paper(s) · ${bank.bilingual} bilingual`,
          secondaryLabel: 'Attempted',
          secondaryValue: esc(String(analytics.counts.attemptedUnique)),
          secondaryContext: `${fmtPct(analytics.counts.coverage)} coverage`,
          tone: analytics.counts.coverage > 0.5 ? 'ok' : '',
        })}
        ${metricCard({
          iconName: 'analytics',
          label: 'First-attempt accuracy',
          value: analytics.accuracy.firstAttemptSample ? esc(fmtPct(analytics.accuracy.firstAttempt)) : '—',
          context: analytics.accuracy.firstAttemptSample ? `${analytics.accuracy.firstAttemptSample} scored first attempts` : 'Complete a scored attempt to begin',
          secondaryLabel: 'Total attempts',
          secondaryValue: esc(String(analytics.counts.totalAttempts)),
          secondaryContext: `${analytics.counts.repeatAttempts} repeats`,
          tone: tone(analytics.accuracy.firstAttempt),
        })}
        ${metricCard({
          iconName: 'revision',
          label: 'Due for revision',
          value: esc(String(dueCount)),
          context: `${summary.overdue} overdue · ${summary.upcoming} upcoming`,
          secondaryLabel: 'Open mistakes',
          secondaryValue: esc(String(analytics.mistakes.open)),
          secondaryContext: `${analytics.mistakes.repeated} repeated`,
          tone: summary.overdue || analytics.mistakes.open ? 'warn' : 'ok',
        })}
        ${metricCard({
          iconName: 'smart',
          label: 'Study today',
          value: esc(fmtDuration(summary.todayAttempts.minutes * 60)),
          context: `${summary.todayAttempts.attempts} answers · ${summary.activityByDay.filter((d) => d.attempts > 0).length} active day(s)`,
          secondaryLabel: 'Last 7 days',
          secondaryValue: esc(String(summary.activityByDay.reduce((a, d) => a + d.attempts, 0))),
          secondaryContext: `answers · ${summary.activityByDay.filter((d) => d.attempts > 0).length} active day(s)`,
        })}
      </div>

      <div class="split-2">
        <div>
          ${card({
            title: 'Study priorities',
            count: countChip(`${priorityRows.length} topic${priorityRows.length === 1 ? '' : 's'}`),
            subtitle: 'From your recorded performance, bank coverage and syllabus status',
            info: cardInfo(
              'How priorities are ranked',
              '<p class="small m-0">Priorities combine question frequency in your imported bank, your recorded accuracy and your own syllabus notes. Frequency is a study aid, not a forecast of any future examination.</p>',
            ),
            body: priorityRows.length
              ? dataTable({ columns: [{ label: 'Topic' }, { label: 'Qs', num: true }, { label: 'Accuracy', num: true }, { label: 'Basis' }, { label: '' }], rows: priorityRows, className: 'compact' })
              : emptyState({
                  title: 'No priorities yet',
                  message: 'Priorities appear once the bank is classified and you have recorded an attempt or marked a syllabus line.',
                  willShow: 'A ranked list of the topics worth your next session, with the reason beside each one.',
                  action: '<a class="btn btn-primary" href="#/topic">Practise a topic</a>',
                }),
          })}
        </div>

        <div>
          ${attention.length ? card({ title: 'Needs your attention', body: `<ul class="small">${attention.map((a) => `<li>${esc(a)}</li>`).join('')}</ul><div class="row mt-2"><a class="btn btn-sm" href="#/bank">Open Question Bank &amp; Imports</a></div>` }) : card({ title: 'Answer-key and content integrity', body: '<p class="small">Every stored question has an answer key or is flagged as unresolved, and every classification is traceable. Nothing needs attention right now.</p>' })}

          ${card({
            title: 'Recent tests',
            body: recentTestRows.length
              ? dataTable({ columns: [{ label: 'Test' }, { label: 'Score', num: true }, { label: 'Accuracy', num: true }], rows: recentTestRows, className: 'compact' })
              : '<p class="muted small">No submitted tests yet.</p>',
          })}
        </div>
      </div>

      ${card({
        title: 'Syllabus progress',
        body: `
          <div class="row mb-2">
            ${badge(`${curriculum.progress.done} of ${curriculum.progress.total} item(s) done`, 'info')}
            ${badge(`${Math.round(curriculum.progress.completion * 100)}% complete overall`, curriculum.progress.completion > 0.6 ? 'ok' : '')}
            <a class="btn btn-sm btn-quiet" href="#/syllabus">Open the syllabus</a>
          </div>
          <p class="small muted m-0">${curriculum.progress.official.done} of ${curriculum.progress.official.total} marked on the commission's 2026 syllabus. Status is always something you set by hand — nothing here is inferred from your attempts.</p>`,
      })}`;
  },

  async mount(ctx, root) {
    document.getElementById('dashPractise')?.addEventListener('click', () => openPracticeSheet(ctx, { source: 'dashboard' }));

    document.getElementById('dashReviseDue')?.addEventListener('click', async () => {
      const records = await revision.allRevisionRecords();
      const queue = revision.dueQueue(records);
      const capped = queue.ids.filter((id) => state.questionIndex.has(id));
      if (!capped.length) {
        toast('Nothing is due for revision.', 'info');
        return;
      }
      await startPracticeTest(ctx, {
        kind: 'revision',
        label: `Revision — ${capped.length} due question(s)`,
        questionIds: capped,
        metas: capped.map((id) => state.questionIndex.get(id)).filter(Boolean),
        config: { feedbackMode: 'learning', durationMinutes: null, randomizeOptions: state.settings.randomizeOptions },
        orderSource: 'due_first',
        selectionNotes: ['Questions whose scheduled revision date has arrived or passed.', 'Revision dates come from your recorded outcomes and confidence, with the rule shown in the Revision Centre.'],
      });
    });

    document.getElementById('dashLoadDemo')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Load the demonstration bank?',
        message: 'This adds a small set of clearly-labelled synthetic demonstration questions so you can explore the app. They are not genuine MPPSC previous-year questions and are marked with a "demonstration" badge everywhere they appear.',
        confirmLabel: 'Load demonstration bank',
      });
      if (!ok) return;
      try {
        const { loadDemoBank } = await import('./bank.js');
        await loadDemoBank();
        toast('Demonstration bank loaded.', 'ok');
        await ctx.refresh();
      } catch (err) {
        toast(`The demonstration bank could not be loaded: ${err.message}`, 'bad');
      }
    });
  },
};
