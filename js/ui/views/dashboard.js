/**
 * dashboard.js — The study command centre.
 *
 * Hierarchy:
 *   1. What should I do now? (resume a session, the due revision queue, the
 *      weakest topics with their evidence strength)
 *   2. What do I actually know? (measured coverage, first-attempt accuracy,
 *      revision queue, study rhythm)
 *   3. Where did it come from? (provenance chips, sample sizes, integrity
 *      notices whenever the user must act)
 *
 * Every figure is read from stored records; nothing is estimated or invented.
 */

import { state } from '../../core/state.js';
import {
  esc,
  card,
  badge,
  icon,
  notice,
  dataTable,
  confirmDialog,
  lineChart,
  barChart,
  barList,
  ring,
  kpi,
  toast,
  sourceChip,
  evidenceMeter,
  emptyState,
  sectionHead,
} from '../components.js';
import { fmtPct, fmtDuration, fmtDate, fmtRelative, clamp } from '../../core/util.js';
import { loadAnalytics, dashboardSummary, studyPriorities } from '../../services/analytics.js';
import * as testsSvc from '../../services/tests.js';
import * as planner from '../../services/planner.js';
import * as revision from '../../services/revision.js';
import { bankSummary } from '../../services/questions.js';
import { recentAttempts } from '../../services/attempts.js';
import { startPracticeTest } from './shared.js';

function tone(value, { good = 0.75, bad = 0.5 } = {}) {
  if (!Number.isFinite(value)) return '';
  if (value >= good) return 'ok';
  if (value < bad) return 'bad';
  return 'warn';
}

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Late session';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Percentage change between two comparable windows, or null when unusable. */
function delta(now, before) {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before <= 0) return null;
  return (now - before) / before;
}

function trendChip(value, { unit = '%', invert = false, label = 'vs previous 7 days' } = {}) {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 1000) / 10;
  const improving = invert ? rounded < 0 : rounded > 0;
  const flat = rounded === 0;
  return {
    tone: flat ? 'flat' : improving ? 'up' : 'down',
    label: `${rounded > 0 ? '+' : ''}${rounded}${unit} ${label}`,
  };
}

function noBankCard() {
  return `
    <section class="hero">
      <div class="hero-copy">
        <span class="section-kicker">MyMPPSC · local-first</span>
        <h1>Set up your study workspace</h1>
        <p>Everything you import and record stays in this browser: question bank, answers, mistakes, revision schedule and syllabus. No account, no upload, no network calls after the page loads.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/bank">Import a question bank</a>
          <button class="btn hero-ghost" type="button" id="dashLoadDemo">Load the demonstration bank</button>
          <a class="btn hero-ghost" href="#/help">See how it works</a>
        </div>
      </div>
      <div class="hero-aside">
        <div class="hero-facts">
          <div class="hero-fact"><span>Questions stored</span><strong>0</strong></div>
          <div class="hero-fact"><span>Papers</span><strong>0</strong></div>
          <div class="hero-fact"><span>Attempts recorded</span><strong>0</strong></div>
        </div>
      </div>
    </section>

    <div class="split-2">
      <div>
        ${card({
          title: 'Three steps to a working workspace',
          right: sourceChip('supplied', 'local IndexedDB'),
          body: `
            <ol class="small">
              <li><strong>Import a bank.</strong> The file is validated and summarised before anything is written. Invalid records are rejected with reasons — never dropped silently.</li>
              <li><strong>Take one test.</strong> A full paper simulation keeps the source question order, duration and scoring rules; practice sets are labelled as practice.</li>
              <li><strong>Work the loop.</strong> Reports, the mistake book and the revision queue all read from the same stored attempts, so every number stays traceable.</li>
            </ol>
            <p class="tiny muted mb-0">Demonstration questions are synthetic examples written to exercise the schema. They are badged “demonstration” everywhere and are never presented as authentic MPPSC previous-year questions.</p>`,
        })}
      </div>
      <div>
        ${card({
          title: 'What is bundled — and what is not',
          right: sourceChip('unavailable', 'no content shipped'),
          body: `<ul class="small mb-0">
            <li><strong>Bundled:</strong> the application, the design system, validation rules, scheduling rules and this documentation.</li>
            <li><strong>Not bundled:</strong> real previous-year papers, official answer keys, an official syllabus, or any AI-generation of questions and explanations.</li>
            <li><strong>Yours:</strong> every question, key, explanation, classification and study record you import or type.</li>
          </ul>`,
        })}
      </div>
    </div>`;
}

export default {
  title: 'Dashboard',

  async render() {
    const metas = Array.from(state.questionIndex.values());
    if (!metas.length) return noBankCard();

    const { analytics } = await loadAnalytics();
    const [allTests, unfinished, attempts] = await Promise.all([
      testsSvc.listTests({ limit: 200 }),
      testsSvc.unfinishedTests(),
      recentAttempts(60),
    ]);

    const summary = dashboardSummary({ analytics, tests: allTests, revision: analytics.revision, settings: state.settings });
    const bank = bankSummary();
    const syllabusRows = await planner.listSyllabus();
    const progress = planner.syllabusProgress(syllabusRows, analytics);
    const priorities = studyPriorities({ analytics, syllabusProgress: progress, limit: 5 });

    const missingKeys = metas.filter((m) => !m.hasSuppliedAnswer && !m.hasVerifiedAnswer).length;
    const disputed = metas.filter((m) => m.disputed).length;
    const unresolvedExplanations = metas.filter((m) => m.explanationStatus === 'missing' || m.explanationStatus === 'unreviewed').length;

    const activity = summary.activityByDay.map((d) => ({ label: d.date.slice(5), value: d.attempts }));
    const rhythm = analytics.daily.slice(-14).map((d) => ({ label: d.date.slice(5), value: d.attempts }));
    const accuracyTrend = analytics.daily.slice(-14).filter((d) => d.accuracy !== null).map((d) => ({ label: d.date.slice(5), value: d.accuracy }));

    /* Real period-over-period comparisons from the stored daily rows. */
    const last7 = analytics.daily.slice(-7);
    const prev7 = analytics.daily.slice(-14, -7);
    const sum = (rows, key) => rows.reduce((acc, row) => acc + (row[key] || 0), 0);
    const accuracyOf = (rows) => {
      const correct = sum(rows, 'correct');
      const judged = correct + sum(rows, 'incorrect');
      return judged ? correct / judged : null;
    };
    const timeTrend = trendChip(delta(sum(last7, 'minutes'), sum(prev7, 'minutes')), { label: 'vs previous 7 days' });
    const attemptTrend = trendChip(delta(sum(last7, 'attempts'), sum(prev7, 'attempts')), { label: 'vs previous 7 days' });
    const accuracyDelta = (() => {
      const a = accuracyOf(last7);
      const b = accuracyOf(prev7);
      if (a === null || b === null) return null;
      return { tone: Math.round((a - b) * 1000) / 10 === 0 ? 'flat' : a > b ? 'up' : 'down', label: `${a > b ? '+' : ''}${Math.round((a - b) * 1000) / 10}pp vs previous 7 days` };
    })();

    const recentTestRows = summary.recentTests.map((t) => [
      `<a href="#/report/${esc(t.id)}">${esc(t.label)}</a><div class="tiny muted">${esc(fmtRelative(t.at))}</div>`,
      t.score === null || t.score === undefined ? '<span class="soft">—</span>' : `${esc(String(Math.round(t.score * 100) / 100))}${t.max ? ` <span class="soft tiny">/ ${esc(String(t.max))}</span>` : ''}`,
      t.accuracy === null || t.accuracy === undefined ? '<span class="soft">—</span>' : `${esc(fmtPct(t.accuracy))} <span class="tiny muted">(${esc(String((t.counts?.correct || 0) + (t.counts?.incorrect || 0)))} judged)</span>`,
      `<a class="btn btn-sm btn-quiet" href="#/report/${esc(t.id)}">Report</a>`,
    ]);

    const priorityRows = priorities.map((p) => [
      `<strong>${esc(p.topic)}</strong><div class="tiny muted">${esc(p.subject)}</div>`,
      `<span data-sort-value="${esc(String(p.available))}">${esc(String(p.available))}</span>`,
      p.scored ? `${esc(fmtPct(p.accuracy))} ${evidenceMeter(p.scored, 3, { showLabel: false })}` : '<span class="soft">no evidence</span>',
      `<span class="tiny">${p.reasons.slice(0, 2).map((r) => esc(r)).join('<br />')}</span>`,
      `<a class="btn btn-sm" href="#/topic/${encodeURIComponent(`${p.subject}||${p.topic}`)}">Practise</a>`,
    ]);

    const attention = [];
    if (missingKeys) attention.push(`${missingKeys} question(s) have no answer key at all — they are excluded from scoring rather than marked wrong.`);
    if (disputed) attention.push(`${disputed} question(s) have a disputed or unverified answer key. The supplied key is preserved and each report states which key judged the answer.`);
    if (bank.unclassified) attention.push(`${bank.unclassified} question(s) are not classified by subject/topic yet, so they cannot appear in topic-level analysis until you classify them.`);
    if (unresolvedExplanations) attention.push(`${unresolvedExplanations} question(s) have a missing or not-yet-reviewed explanation. Explanations are shown exactly as supplied — this app never writes one.`);

    const dueCount = summary.dueToday + summary.overdue;
    const weakTopics = (analytics.topics || []).filter((t) => t.verdict === 'weak').slice(0, 4);
    const openMistakes = analytics.mistakes.open;
    const unfinishedTest = unfinished[0] || null;

    /* ------------------------------------------------------------- hero --- */
    const heroPrimary = unfinishedTest
      ? `<a class="btn btn-primary" href="#/runner/${esc(unfinishedTest.id)}">Resume “${esc(unfinishedTest.label || unfinishedTest.kind)}”</a>`
      : `<a class="btn btn-primary" href="#/smart">Start smart practice</a>`;

    const hero = `
      <section class="hero" aria-labelledby="dashboardTitle">
        <div class="hero-copy">
          <span class="section-kicker">${esc(greeting())} · ${esc(fmtDate(new Date()))}</span>
          <h1 id="dashboardTitle">${unfinishedTest ? 'Pick up where you left off' : 'Your study command centre'}</h1>
          <p>${
            unfinishedTest
              ? `An unfinished test is still open: <strong>${esc(unfinishedTest.label || unfinishedTest.kind)}</strong>. Your answers and the test clock were saved locally.`
              : `Everything below is measured from your own attempts. The next useful action is one click away — practise, revise, or review what went wrong.`
          }</p>
          <div class="hero-actions">
            ${heroPrimary}
            <button class="btn hero-ghost" type="button" id="dashReviseDue" ${dueCount ? '' : 'disabled'}>Revise ${dueCount ? `${dueCount} due` : 'nothing due'}</button>
            <a class="btn hero-ghost" href="#/test-centre">Paper simulations</a>
          </div>
        </div>
        <div class="hero-aside">
          <div class="hero-facts">
            <div class="hero-fact"><span>Due or overdue</span><strong>${dueCount}</strong></div>
            <div class="hero-fact"><span>Open mistakes</span><strong>${openMistakes}</strong></div>
            <div class="hero-fact"><span>Answers today</span><strong>${summary.todayAttempts.attempts}</strong></div>
            <div class="hero-fact"><span>Active-day streak</span><strong>${summary.streak}</strong></div>
          </div>
        </div>
      </section>`;

    /* ------------------------------------------------------------ KPIs ---- */
    const kpis = `
      <div class="kpi-grid" aria-label="Study overview">
        ${kpi({
          label: 'Bank coverage',
          value: esc(fmtPct(analytics.counts.coverage)),
          context: `${esc(String(analytics.counts.attemptedUnique))} of ${esc(String(analytics.counts.availableQuestions))} questions attempted · ${esc(String(bank.papers))} paper(s)`,
          tone: tone(analytics.counts.coverage, { good: 0.5, bad: 0.2 }),
          iconName: 'layers',
          spark: summary.activityByDay.map((d) => d.attempts),
          foot: `<div><span>Attempts recorded</span><strong>${esc(String(analytics.counts.totalAttempts))}</strong></div>
                 <div class="right"><span class="muted">${esc(String(analytics.counts.repeatAttempts))} beyond first</span></div>`,
        })}
        ${kpi({
          label: 'First-attempt accuracy',
          value: analytics.accuracy.firstAttemptSample ? esc(fmtPct(analytics.accuracy.firstAttempt)) : '—',
          context: analytics.accuracy.firstAttemptSample
            ? `on ${esc(String(analytics.accuracy.firstAttemptSample))} scored first attempts ${evidenceMeter(analytics.accuracy.firstAttemptSample)}`
            : 'No scored first attempts yet',
          tone: tone(analytics.accuracy.firstAttempt),
          iconName: 'target',
          trend: accuracyDelta,
          foot: `<div><span>All attempts</span><strong>${analytics.counts.correct + analytics.counts.incorrect ? esc(fmtPct(analytics.accuracy.all)) : '—'}</strong></div>
                 <div class="right"><span class="muted">${esc(String(analytics.counts.correct))} correct · ${esc(String(analytics.counts.incorrect))} wrong</span></div>`,
        })}
        ${kpi({
          label: 'Revision queue',
          value: esc(String(dueCount)),
          context: `${esc(String(summary.dueToday))} due today · ${esc(String(summary.overdue))} overdue · ${esc(String(summary.upcoming))} upcoming`,
          tone: summary.overdue ? 'bad' : dueCount ? 'warn' : 'ok',
          iconName: 'revision',
          foot: `<div><span>Tracked questions</span><strong>${esc(String(analytics.revision.tracked))}</strong></div>
                 <div class="right"><a class="btn btn-sm btn-quiet" href="#/revision">Open queue</a></div>`,
        })}
        ${kpi({
          label: 'Study time today',
          value: esc(fmtDuration(summary.todayAttempts.minutes * 60)),
          context: `${esc(String(summary.todayAttempts.attempts))} answer(s) recorded today · ${esc(String(summary.streak))}-day streak`,
          iconName: 'clock',
          trend: timeTrend || attemptTrend,
          spark: rhythm.map((d) => d.value),
          foot: `<div><span>Last 7 days</span><strong>${esc(String(sum(last7, 'attempts')))} answers</strong></div>
                 <div class="right"><span class="muted">${esc(String(sum(last7, 'minutes')))} minutes</span></div>`,
        })}
      </div>`;

    /* ------------------------------------------------------- next actions - */
    const nextActions = card({
      title: 'Do this next',
      subtitle: 'Ranked from your own queue, mistakes and evidence strength',
      className: 'today-command',
      right: sourceChip('derived', 'from stored records'),
      body: `<div class="today-grid">
        <div class="today-item ${unfinishedTest ? 'warn' : ''}">
          <div class="today-item-head">
            <span class="action-icon test" aria-hidden="true">${icon('play', { size: 19 })}</span>
            <div><span class="today-item-title">Unfinished test</span><span class="today-eyebrow">${unfinishedTest ? 'Answers and clock saved locally — resume at any time' : 'Nothing pending'}</span></div>
          </div>
          ${
            unfinishedTest
              ? `<p class="small m-0">${esc(unfinishedTest.label || unfinishedTest.kind)} · ${esc(testsSvc.describeTest(unfinishedTest))}</p>
                 <p class="tiny muted m-0">Started ${esc(fmtDate(unfinishedTest.started_at || unfinishedTest.created_at))}${
                   unfinishedTest.timer?.remaining_seconds !== null && unfinishedTest.timer?.remaining_seconds !== undefined
                     ? ` · ${esc(String(Math.floor(unfinishedTest.timer.remaining_seconds / 60)))} min left`
                     : ''
                 }</p>
                 <div class="row tight mt-auto pt-1"><a class="btn btn-primary btn-sm" href="#/runner/${esc(unfinishedTest.id)}">Resume</a><a class="btn btn-sm" href="#/test-centre">All sessions</a></div>`
              : `<p class="small m-0">No test is part-way through. Paper simulations run in the source order with the source duration.</p>
                 <div class="row tight mt-auto pt-1"><a class="btn btn-primary btn-sm" href="#/test-centre">Paper simulations</a><a class="btn btn-sm" href="#/smart">Smart practice</a></div>`
          }
        </div>

        <div class="today-item ${summary.overdue ? 'bad' : dueCount ? 'warn' : 'ok'}">
          <div class="today-item-head">
            <span class="action-icon revision" aria-hidden="true">${icon('revision', { size: 19 })}</span>
            <div><span class="today-item-title">Revision queue</span><span class="today-eyebrow">Spaced repetition over your answers</span></div>
          </div>
          <p class="small m-0">${
            dueCount
              ? `<strong>${dueCount}</strong> question(s) due (${summary.dueToday} today · ${summary.overdue} overdue).`
              : 'Nothing is due right now. New attempts will schedule themselves automatically.'
          }</p>
          <p class="tiny muted m-0">Every date shows the numeric basis it came from — outcome, confidence, level and interval.</p>
          <div class="row tight mt-auto pt-1">
            <button class="btn btn-primary btn-sm" type="button" id="dashReviseQueue" ${dueCount ? '' : 'disabled'}>Start revision</button>
            <a class="btn btn-sm" href="#/revision">Open queue</a>
          </div>
        </div>

        <div class="today-item ${weakTopics.length ? 'accent' : 'ok'}">
          <div class="today-item-head">
            <span class="action-icon analytics" aria-hidden="true">${icon('target', { size: 19 })}</span>
            <div><span class="today-item-title">Topics to strengthen</span><span class="today-eyebrow">At least 5 judged answers each</span></div>
          </div>
          ${
            weakTopics.length
              ? `<ul class="small m-0">${weakTopics
                  .slice(0, 3)
                  .map((t) => `<li><strong>${esc(t.subject)} › ${esc(t.topic)}</strong> — ${esc(fmtPct(t.accuracy))} ${evidenceMeter(t.scored, 5)}</li>`)
                  .join('')}</ul>`
              : `<p class="small m-0">No topic has both enough judged evidence and low accuracy yet.</p>
                 <p class="tiny muted m-0">A verdict is only given after 5 judged answers, so early sessions stay descriptive rather than judgemental.</p>`
          }
          <div class="row tight mt-auto pt-1">
            <a class="btn btn-sm" href="#/topic">Topic practice</a>
            <a class="btn btn-sm" href="#/analytics">Analytics</a>
          </div>
        </div>
      </div>`,
    });

    /* ------------------------------------------------------------- charts - */
    const activityCard = card({
      title: 'Study rhythm',
      subtitle: 'Answers per day, last 14 days',
      right: sourceChip('measured'),
      body:
        rhythm.some((r) => r.value)
          ? barChart({ data: rhythm, height: 168, valueFormat: (v) => String(v), unitLabel: 'answers', interactive: true, title: 'Answers per day' })
          : emptyState({ title: 'No attempts in the last fortnight', message: 'Start a practice set or a paper simulation and this chart fills from your own records.', iconName: 'analytics' }),
      footer: `Active days in the last week: ${summary.activityByDay.filter((d) => d.attempts > 0).length} of 7 · ${esc(String(sum(last7, 'minutes')))} minutes recorded.`,
    });

    const accuracyCard = card({
      title: 'Accuracy trend',
      subtitle: 'Every scored attempt per day (repeats included)',
      right: sourceChip('measured'),
      body: accuracyTrend.length >= 2
        ? lineChart({ points: accuracyTrend, height: 168, title: 'Accuracy per day' })
        : emptyState({ title: 'Not enough recorded days yet', message: 'Two days with scored attempts are needed before a trend line means anything.', iconName: 'target' }),
      footer: 'This line counts repeats. The separate first-attempt figure on the left is the honest measure of first-time recall.',
    });

    /* ------------------------------------------------------------ sidebar - */
    const coverageRing = card({
      title: 'Bank coverage',
      right: sourceChip('measured', 'unique questions'),
      body: `
        <div class="row">
          ${ring(analytics.counts.coverage, { sub: 'attempted', tone: tone(analytics.counts.coverage, { good: 0.5, bad: 0.2 }), label: 'Coverage' })}
          <div class="grow stack-sm">
            <div class="stat-strip">
              <div><span class="stat-label">Attempted</span><span class="stat-value">${esc(String(analytics.counts.attemptedUnique))}</span><span class="tiny muted">unique questions</span></div>
              <div><span class="stat-label">Stored</span><span class="stat-value">${esc(String(analytics.counts.availableQuestions))}</span><span class="tiny muted">in the bank</span></div>
            </div>
            <p class="tiny muted m-0">A question answered five times still counts once here, so coverage never inflates through repetition.</p>
          </div>
        </div>`,
      footer: `${esc(String(analytics.counts.totalAttempts))} recorded attempts · ${esc(String(analytics.counts.repeatAttempts))} beyond the first · ${esc(String(bank.bilingual))} bilingual question(s).`,
    });

    const outcomeMix = card({
      title: 'Outcome mix',
      subtitle: 'Every recorded attempt',
      right: sourceChip('measured'),
      body: barList(
        [
          { label: 'Correct', value: analytics.counts.correct, tone: 'ok', right: `${analytics.counts.correct}` },
          { label: 'Incorrect', value: analytics.counts.incorrect, tone: 'bad', right: `${analytics.counts.incorrect}` },
          { label: 'Left unanswered', value: analytics.counts.unanswered, tone: 'warn', right: `${analytics.counts.unanswered}` },
          { label: 'Not scored (no usable key)', value: analytics.counts.unscored, tone: '', right: `${analytics.counts.unscored}` },
        ],
        Math.max(1, analytics.counts.totalAttempts),
      ),
      footer: `Flagged for review during tests: ${esc(String(analytics.counts.flagged))}. Answer rate ${analytics.counts.totalAttempts ? esc(fmtPct(analytics.accuracy.answerRate)) : '—'}.`,
    });

    const weakTopicsCard = card({
      title: 'Weak topics',
      subtitle: 'Enough judged answers to say something useful',
      right: sourceChip('derived', 'min 5 judged'),
      body: weakTopics.length
        ? barList(
            weakTopics.map((t) => ({
              label: `${t.topic} · ${t.subject}`,
              value: t.accuracy,
              tone: t.accuracy < 0.5 ? 'bad' : 'warn',
              right: fmtPct(t.accuracy, 0),
            })),
            1,
          )
        : emptyState({ title: 'No weak verdicts yet', message: 'A topic needs at least five judged answers before the app will call it weak. Until then it stays “developing”.', iconName: 'target' }),
      footer: 'Accuracy is the share of judged attempts on that topic. Small samples are labelled everywhere rather than smoothed over.',
    });

    const prioritiesCard = card({
      title: 'Study priorities',
      subtitle: 'Derived ranking with its reasons',
      right: sourceChip('derived'),
      body: priorityRows.length
        ? dataTable({
            columns: [{ label: 'Topic' }, { label: 'Qs', num: true }, { label: 'Accuracy', num: true }, { label: 'Basis' }, { label: '' }],
            rows: priorityRows,
            className: 'compact',
            sortable: true,
          })
        : `<p class="muted small m-0">No topics to prioritise yet.</p>`,
      footer: 'The ranking combines bank frequency with your recorded accuracy and syllabus status. Frequency is a study aid, never a forecast of a future paper.',
    });

    const integrityCard = attention.length
      ? card({
          title: 'Needs your attention',
          tone: 'warn',
          right: sourceChip('disputed'),
          body: `<ul class="small">${attention.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
                 <div class="row mt-2"><a class="btn btn-sm" href="#/bank">Open Question Bank &amp; Imports</a><a class="btn btn-sm btn-quiet" href="#/analytics">See how figures are computed</a></div>`,
        })
      : card({
          title: 'Answer-key and content integrity',
          tone: 'ok',
          right: sourceChip('verified'),
          body: `<p class="small m-0">Every stored question carries an answer key or is explicitly flagged as unresolved, and every classification is traceable to its import or to your own correction. Nothing needs attention right now.</p>`,
        });

    const syllabusCard = card({
      title: 'Syllabus progress',
      subtitle: 'Your own checklist — nothing is hard-coded',
      right: sourceChip('supplied', 'manual status'),
      body: progress.total
        ? `<div class="row">
             ${ring(progress.overallCompletion, { sub: 'complete', tone: progress.overallCompletion > 0.6 ? 'ok' : '', label: 'Syllabus completion' })}
             <div class="grow stack-sm">
               ${barList(
                 Object.entries(planner.STATUSES)
                   .filter(([key]) => (progress.byStatus[key] || 0) > 0)
                   .map(([key, label]) => ({ label, value: progress.byStatus[key] || 0, right: String(progress.byStatus[key] || 0) })),
                 progress.total,
               )}
               <a class="btn btn-sm" href="#/syllabus">Manage syllabus</a>
             </div>
           </div>`
        : emptyState({
            title: 'No syllabus structure yet',
            message: 'Import a structure you made, generate one from the subjects already classified in your bank, or add items by hand.',
            action: '<a class="btn btn-primary" href="#/syllabus">Open Syllabus &amp; Planner</a>',
            iconName: 'syllabus',
          }),
    });

    /* ------------------------------------------------------------ activity - */
    const recentActivity = attempts.length
      ? `<ul class="timeline">${attempts
          .slice(0, 6)
          .map((a) => {
            const row = analytics.topics?.find?.((t) => t.topic === a.topic) || null;
            const toneByOutcome = a.outcome === 'correct' ? 'ok' : a.outcome === 'incorrect' ? 'bad' : 'warn';
            const glyph = a.outcome === 'correct' ? '✓' : a.outcome === 'incorrect' ? '✕' : '—';
            return `<li class="timeline-item">
              <span class="timeline-dot ${toneByOutcome}" aria-hidden="true">${glyph}</span>
              <div class="timeline-body">
                <span class="timeline-title">${esc(a.subject || 'Unclassified')}${a.topic ? ` › ${esc(a.topic)}` : ''}</span>
                <span class="timeline-meta">${esc(a.outcome)} · ${esc(fmtRelative(a.created_at))} · ${Math.round((a.time_spent_ms || 0) / 1000)}s${a.confidence ? ` · marked ${esc(a.confidence)}` : ''}</span>
              </div>
            </li>`;
          })
          .join('')}</ul>`
      : emptyState({ title: 'No attempts recorded yet', message: 'Your answers will appear here as soon as you submit a practice set or a paper simulation.', iconName: 'clock' });

    return `
      ${hero}
      ${attention.length ? notice(`<ul>${attention.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`, 'warn', { title: 'Read before you decide what to practise' }) : ''}
      ${kpis}
      ${nextActions}

      ${sectionHead({ title: 'How your preparation is going', meta: 'Measured from stored attempts in this browser', kicker: 'Analytics' })}

      <div class="split-2">
        <div>
          ${activityCard}
          ${accuracyCard}
          ${card({
            title: 'Recent tests',
            right: sourceChip('measured', 'submitted'),
            body: recentTestRows.length
              ? dataTable({
                  columns: [{ label: 'Test' }, { label: 'Score', num: true }, { label: 'Accuracy', num: true }, { label: '' }],
                  rows: recentTestRows,
                  className: 'compact',
                  sortable: true,
                })
              : `<p class="muted small m-0">No submitted tests yet. Your first report will appear here.</p>`,
            footer: `<a class="btn btn-sm btn-quiet" href="#/analytics">Open full analytics</a>`,
          })}
        </div>
        <div>
          ${coverageRing}
          ${outcomeMix}
          ${weakTopicsCard}
          ${integrityCard}
        </div>
      </div>

      <div class="split-2">
        <div>
          ${prioritiesCard}
        </div>
        <div>
          ${card({ title: 'Recent activity', subtitle: 'Latest recorded answers', right: sourceChip('measured'), body: recentActivity, footer: `<a class="btn btn-sm btn-quiet" href="#/mistakes">Open the Mistake Book</a>` })}
          ${syllabusCard}
        </div>
      </div>

      ${card({
        title: 'Everything is local',
        right: sourceChip('measured', 'this browser'),
        body: `<div class="stat-strip">
            <div><span class="stat-label">Questions</span><span class="stat-value">${esc(String(state.counts.questions || metas.length))}</span></div>
            <div><span class="stat-label">Papers</span><span class="stat-value">${esc(String(state.counts.papers || bank.papers))}</span></div>
            <div><span class="stat-label">Attempts</span><span class="stat-value">${esc(String(state.counts.attempts || analytics.counts.totalAttempts))}</span></div>
            <div><span class="stat-label">Tests</span><span class="stat-value">${esc(String(state.counts.tests || 0))}</span></div>
          </div>
          <p class="tiny muted mb-0">Browser storage can be cleared by you, by the browser, or when the device runs out of space. Keep a JSON backup outside the browser — <a href="#/settings">Settings &amp; Backup</a> writes one with a SHA-256 integrity hash.</p>`,
      })}`;
  },

  async mount(ctx, root) {
    const startDueSession = async () => {
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
    };

    document.getElementById('dashReviseDue')?.addEventListener('click', startDueSession);
    document.getElementById('dashReviseQueue')?.addEventListener('click', startDueSession);

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
