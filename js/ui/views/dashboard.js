/**
 * dashboard.js — The start screen.
 *
 * Hierarchy:
 *   1. What should I do now? ("Today" panel: next revision due, unfinished session to resume, weakest 3 topics with evidence)
 *   2. What do I actually know? (Measured coverage, accuracy, revision queue, study time)
 *   3. Where did it come from? (Provenance chips, evidence meters, attention notices)
 */

import { state } from '../../core/state.js';
import {
  esc,
  card,
  tile,
  badge,
  notice,
  dataTable,
  confirmDialog,
  lineChart,
  toast,
  sourceChip,
  evidenceMeter,
} from '../components.js';
import { fmtPct, fmtDuration, fmtDate, fmtRelative } from '../../core/util.js';
import { loadAnalytics, dashboardSummary, studyPriorities } from '../../services/analytics.js';
import * as testsSvc from '../../services/tests.js';
import * as planner from '../../services/planner.js';
import * as revision from '../../services/revision.js';
import { bankSummary } from '../../services/questions.js';
import { startPracticeTest } from './shared.js';

function tone(value, { good = 0.75, bad = 0.5 } = {}) {
  if (!Number.isFinite(value)) return '';
  if (value >= good) return 'ok';
  if (value < bad) return 'bad';
  return 'warn';
}

function noBankCard() {
  return `
    <h1>Welcome to MyMPPSC</h1>
    ${card({
      title: 'Start by importing a question bank',
      right: sourceChip('supplied', 'local IndexedDB'),
      body: `
        <p>MyMPPSC is a local-first study app. Nothing you do here is uploaded anywhere: the question bank, your answers, your mistakes and your revision schedule all live in this browser's storage, on this device.</p>
        <ol class="small">
          <li>Import a question bank JSON file exported by your own data pipeline (or load the clearly-labelled demonstration bank to look around).</li>
          <li>Take a test — a full paper simulation, a topic set, a custom set or a smart session.</li>
          <li>Review the report, work through your mistake book, and let the revision schedule tell you what is due.</li>
        </ol>
        <div class="row mt-3">
          <a class="btn btn-primary" href="#/bank">Question Bank &amp; Imports</a>
          <button class="btn" type="button" id="dashLoadDemo">Load the demonstration bank</button>
          <a class="btn btn-quiet" href="#/help">How this app works</a>
        </div>
        <p class="tiny muted mt-2 mb-0">Demonstration questions are synthetic examples written to show the schema. They are never presented as authentic MPPSC previous-year questions.</p>`,
    })}`;
}

export default {
  title: 'Dashboard',

  async render() {
    const metas = Array.from(state.questionIndex.values());
    if (!metas.length) return noBankCard();

    const { analytics } = await loadAnalytics();
    const [allTests, unfinished, tasks, , totals] = await Promise.all([
      testsSvc.listTests({ limit: 200 }),
      testsSvc.unfinishedTests(),
      planner.listTasks({}),
      planner.listSessions({ limit: 200 }),
      planner.studyTotals(),
    ]);

    const summary = dashboardSummary({ analytics, tests: allTests, tasks, revision: analytics.revision, settings: state.settings });
    const bank = bankSummary();
    const syllabusRows = await planner.listSyllabus();
    const progress = planner.syllabusProgress(syllabusRows, analytics);
    const priorities = studyPriorities({ analytics, syllabusProgress: progress, limit: 6 });

    const missingKeys = metas.filter((m) => !m.hasSuppliedAnswer && !m.hasVerifiedAnswer).length;
    const disputed = metas.filter((m) => m.disputed).length;
    const unresolvedExplanations = metas.filter((m) => m.explanationStatus === 'missing' || m.explanationStatus === 'unreviewed').length;

    const activity = summary.activityByDay.map((d) => ({ label: d.date.slice(5), value: d.attempts }));
    const accuracyTrend = analytics.daily.slice(-14).filter((d) => d.accuracy !== null).map((d) => ({ label: d.date.slice(5), value: d.accuracy }));

    const recentTestRows = summary.recentTests.map((t) => [
      `<a href="#/report/${esc(t.id)}">${esc(t.label)}</a><div class="tiny muted">${esc(fmtDate(t.at))}</div>`,
      t.score === null || t.score === undefined ? '<span class="soft">—</span>' : `${esc(String(t.score))}${t.max ? ` / ${esc(String(t.max))}` : ''}`,
      t.accuracy === null || t.accuracy === undefined ? '<span class="soft">—</span>' : esc(fmtPct(t.accuracy)),
    ]);

    const taskRows = [...tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date <= summary.today)]
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))
      .slice(0, 6)
      .map((t) => [
        `<strong>${esc(t.title)}</strong>${t.subject ? `<div class="tiny muted">${esc(t.subject)}${t.topic ? ` · ${esc(t.topic)}` : ''}</div>` : ''}`,
        t.due_date < summary.today ? badge(`overdue ${esc(fmtRelative(t.due_date))}`, 'bad') : badge('due today', 'warn'),
        `<button class="btn btn-sm" type="button" data-task-done="${esc(t.id)}">Mark done</button>`,
      ]);

    const priorityRows = priorities.map((p) => [
      `<strong>${esc(p.topic)}</strong><div class="tiny muted">${esc(p.subject)}</div>`,
      `${esc(String(p.available))}`,
      p.scored ? `${esc(fmtPct(p.accuracy))} ${evidenceMeter(p.scored)}` : '<span class="soft">no evidence</span>',
      `<div class="tiny">${p.reasons.slice(0, 3).map((r) => esc(r)).join('<br />')}</div>`,
      `<a class="btn btn-sm" href="#/topic/${encodeURIComponent(`${p.subject}||${p.topic}`)}">Practise</a>`,
    ]);

    const attention = [];
    if (missingKeys) attention.push(`${missingKeys} question(s) have no answer key at all — they are excluded from scoring rather than marked wrong.`);
    if (disputed) attention.push(`${disputed} question(s) have a disputed or unverified answer key. The supplied key is preserved and the report shows which key was used.`);
    if (bank.unclassified) attention.push(`${bank.unclassified} question(s) are not yet classified by subject/topic, so they cannot appear in topic-level analysis until you classify them.`);
    if (unresolvedExplanations) attention.push(`${unresolvedExplanations} question(s) have a missing or not-yet-reviewed explanation. Explanations are shown exactly as supplied — this app never writes one.`);

    const dueCount = summary.dueToday + summary.overdue;
    const weakTopics = (analytics.topics || []).filter((t) => t.verdict === 'weak').slice(0, 3);

    const todayPanel = card({
      title: 'Today — what should I do now?',
      subtitle: 'Immediate actions from your revision schedule, active sessions and recorded topic evidence.',
      right: sourceChip('derived', 'local study state'),
      body: `<div class="today-grid">
        <div class="today-item">
          <div class="row">
            <span class="today-item-title">1. Next revision due</span>
            ${sourceChip('derived', 'spaced repetition')}
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
              Revise ${dueCount} due question(s) now
            </button>
            <a class="btn btn-sm" href="#/revision">Queue</a>
          </div>
        </div>

        <div class="today-item">
          <div class="row">
            <span class="today-item-title">2. Unfinished test</span>
            ${unfinished.length ? sourceChip('measured', 'autosaved') : sourceChip('supplied', 'ready')}
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
          <div class="row">
            <span class="today-item-title">3. Weakest 3 topics (with evidence)</span>
            ${sourceChip('derived', 'min 3 judged')}
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
      <h1>Dashboard</h1>

      ${todayPanel}

      <div class="grid tiles">
        ${tile({ label: 'Questions available', value: String(bank.total), sub: `${bank.papers} paper(s) · ${bank.bilingual} bilingual`, source: 'supplied', where: 'Stored in local IndexedDB bank' })}
        ${tile({ label: 'Questions attempted', value: `${analytics.counts.attemptedUnique}`, sub: `${fmtPct(analytics.counts.coverage)} of the stored bank covered`, tone: analytics.counts.coverage > 0.5 ? 'ok' : '', source: 'measured', where: 'Unique questions tried at least once' })}
        ${tile({ label: 'Total attempts', value: String(analytics.counts.totalAttempts), sub: `${analytics.counts.repeatAttempts} repeat(s) on questions already attempted`, source: 'measured', where: 'Includes repeat attempts across sessions' })}
        ${tile({ label: 'First-attempt accuracy', value: analytics.accuracy.firstAttemptSample ? fmtPct(analytics.accuracy.firstAttempt) : '—', sub: analytics.accuracy.firstAttemptSample ? `over ${analytics.accuracy.firstAttemptSample} first attempts` : 'needs first attempts', tone: tone(analytics.accuracy.firstAttempt), source: analytics.accuracy.firstAttemptSample ? 'measured' : 'unavailable', where: 'First scored attempt per unique question' })}
      </div>

      <div class="grid tiles mt-3">
        ${tile({ label: 'Due for revision', value: String(dueCount), sub: `${summary.overdue} overdue · ${summary.upcoming} upcoming`, tone: summary.overdue ? 'warn' : '', source: 'derived', where: 'Scheduled from correctness & recall confidence' })}
        ${tile({ label: 'Open mistakes', value: String(analytics.mistakes.open), sub: `${analytics.mistakes.repeated} repeated`, tone: analytics.mistakes.open ? 'warn' : 'ok', source: 'measured', where: 'Unresolved wrong answers in Mistake Book' })}
        ${tile({ label: 'Study today', value: fmtDuration(summary.todayAttempts.minutes * 60), sub: `${summary.todayAttempts.attempts} answer(s) today · ${summary.streak}-day streak`, source: 'measured', where: 'Recorded today on this device' })}
        ${tile({ label: 'Study time (7 days)', value: fmtDuration(totals.last7Minutes * 60), sub: `${totals.sessions} session(s) logged · ${totals.avgMinutesPerSession} min average`, source: 'measured', where: 'Last 7 calendar days' })}
      </div>

      ${card({
        title: 'Practise now',
        right: sourceChip('supplied', 'all modes'),
        body: `
          <div class="row">
            <a class="btn btn-primary" href="#/test-centre">Paper simulations</a>
            <a class="btn" href="#/topic">Topic practice</a>
            <a class="btn" href="#/custom">Build a custom test</a>
            <a class="btn" href="#/smart">Smart practice</a>
            <a class="btn" href="#/mistakes">Mistake book</a>
            <a class="btn" href="#/revision">Revision centre</a>
          </div>`,
      })}

      <div class="split-2">
        <div>
          ${card({
            title: "Today's tasks",
            actions: `<a class="btn btn-sm btn-quiet" href="#/syllabus">Plan</a>`,
            body: taskRows.length
              ? dataTable({ columns: [{ label: 'Task' }, { label: 'Due' }, { label: '' }], rows: taskRows, className: 'compact' })
              : `<p class="muted small">No tasks are due today. ${tasks.filter((t) => t.status !== 'done').length} open task(s) in total — create some in the <a href="#/syllabus">Syllabus &amp; Study Planner</a>.</p>`,
          })}

          ${card({
            title: 'Questions answered per day',
            subtitle: 'Last 7 days, from stored attempts',
            right: sourceChip('measured'),
            body: activity.some((a) => a.value) ? lineChart({ points: activity, height: 140, yFormat: (v) => String(Math.round(v)), yMax: Math.max(1, ...activity.map((a) => a.value)) }) : '<p class="muted small">No attempts recorded in the past week.</p>',
          })}

          ${card({
            title: 'Accuracy trend',
            subtitle: 'Last 14 active days (all attempts)',
            right: sourceChip('measured'),
            body: accuracyTrend.length >= 2 ? lineChart({ points: accuracyTrend, height: 140 }) : '<p class="muted small">Not enough recorded days yet to draw a trend.</p>',
            footer: 'Accuracy counts every scored attempt, including repeats. The Analytics screen separates first-attempt accuracy, which does not improve simply by repeating questions.',
          })}
        </div>

        <div>
          ${card({
            title: 'Study priorities',
            subtitle: 'From your recorded performance, bank coverage and syllabus status',
            right: sourceChip('derived'),
            body: priorityRows.length
              ? dataTable({ columns: [{ label: 'Topic' }, { label: 'Qs', num: true }, { label: 'Accuracy', num: true }, { label: 'Basis' }, { label: '' }], rows: priorityRows, className: 'compact' })
              : '<p class="muted small">No topics to prioritise yet.</p>',
            footer: 'Priorities combine question frequency in your imported bank, your recorded accuracy and your own syllabus notes. Frequency is a study aid, not a forecast of any future examination.',
          })}

          ${attention.length ? card({ title: 'Needs your attention', right: sourceChip('disputed'), body: `<ul class="small">${attention.map((a) => `<li>${esc(a)}</li>`).join('')}</ul><div class="row mt-2"><a class="btn btn-sm" href="#/bank">Open Question Bank &amp; Imports</a></div>` }) : card({ title: 'Answer-key and content integrity', right: sourceChip('verified'), body: '<p class="small">Every stored question has an answer key or is flagged as unresolved, and every classification is traceable. Nothing needs attention right now.</p>' })}

          ${card({
            title: 'Recent tests',
            right: sourceChip('measured'),
            body: recentTestRows.length
              ? dataTable({ columns: [{ label: 'Test' }, { label: 'Score', num: true }, { label: 'Accuracy', num: true }], rows: recentTestRows, className: 'compact' })
              : '<p class="muted small">No submitted tests yet.</p>',
          })}
        </div>
      </div>

      ${card({
        title: 'Syllabus progress',
        right: sourceChip('supplied', 'manual checklist'),
        body: `
          <div class="row mb-2">
            ${badge(`${progress.total} syllabus item(s)`, 'info')}
            ${badge(`${Math.round(progress.overallCompletion * 100)}% complete overall`, progress.overallCompletion > 0.6 ? 'ok' : '')}
            <a class="btn btn-sm btn-quiet" href="#/syllabus">Manage syllabus</a>
          </div>
          <p class="small muted m-0">No syllabus is built into this app. The planner mirrors whatever structure you import or create yourself.</p>`,
      })}`;
  },

  async mount(ctx, root) {
    document.getElementById('dashReviseDue')?.addEventListener('click', async () => {
      const records = await revision.allRevisionRecords();
      const buckets = revision.bucketise(records);
      const ids = [...buckets.overdue, ...buckets.dueToday].map((r) => r.question_id).filter((id) => state.questionIndex.has(id));
      if (!ids.length) {
        toast('Nothing is due for revision.', 'info');
        return;
      }
      const capped = ids.slice(0, 30);
      await startPracticeTest(ctx, {
        kind: 'revision',
        label: `Revision — ${capped.length} due question(s)`,
        questionIds: capped,
        metas: capped.map((id) => state.questionIndex.get(id)).filter(Boolean),
        config: { feedbackMode: 'learning', confidence: state.settings.confidenceTracking, durationMinutes: null, randomizeOptions: state.settings.randomizeOptions },
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

    root.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-task-done]');
      if (!btn) return;
      await planner.completeTask(btn.dataset.taskDone, { markSyllabus: 'none' });
      toast('Task marked done.', 'ok');
      await ctx.refresh();
    });
  },
};
