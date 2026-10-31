/**
 * dashboard.js — The start screen.
 *
 * The dashboard answers three questions and nothing else:
 *
 *   1. What should I do next?      → the "next up" panel (resume, or one clear
 *                                     way to start) and the revision queue.
 *   2. Where do I stand?            → four figures in one quiet strip, each one
 *                                     a number the reader can act on.
 *   3. What has changed lately?     → a short list of recommended topics and
 *                                     the most recent sessions.
 *
 * Everything else — integrity notices, methodology — is one line or one
 * disclosure away. A dashboard is a place to start, not a report to read.
 */

import { state } from '../../core/state.js';
import { esc, card, confirmDialog, toast, evidenceMeter, screenHead, cardInfo } from '../components.js';
import { fmtPct, fmtRelative, fmtDate, topicPracticeHref } from '../../core/util.js';
import { loadAnalytics, dashboardSummary, studyPriorities } from '../../services/analytics.js';
import * as testsSvc from '../../services/tests.js';
import { loadSyllabusWorkspace } from '../../services/syllabus-hub.js';
import * as revision from '../../services/revision.js';
import { bankSummary } from '../../services/questions.js';
import { startPracticeTest } from './shared.js';
import { openPracticeSheet } from '../practicesheet.js';
import { dashboardSkeleton } from '../skeletons.js';

/** A short, human time-of-day line; it never replaces the page title. */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function noBankCard() {
  return `
    ${screenHead({
      title: 'Welcome to MyMPPSC',
      purpose: 'A local-first MPPSC Prelims practice app. The question bank, your answers, mistakes and revision schedule live in this browser.',
      primary: '<a class="btn btn-primary" href="#/bank">Import a question bank</a>',
      secondary: '<a class="btn btn-quiet" href="#/help">How this app works</a>',
    })}
    ${card({
      title: 'Start with a question bank',
      body: `
        <ol class="small">
          <li>Import a bank exported by your own data pipeline, or load the clearly-labelled demonstration bank to look around.</li>
          <li>Take a paper simulation, a topic set or a smart session.</li>
          <li>Review the report, work through mistakes, and let the revision schedule tell you what is due.</li>
        </ol>
        <div class="row">
          <button class="btn" type="button" id="dashLoadDemo">Load the demonstration bank</button>
        </div>
        <p class="tiny muted mt-2 mb-0">Demonstration questions are synthetic examples written to show the schema. They are never presented as authentic MPPSC previous-year questions.</p>`,
    })}`;
}

/** One row of the "recommended next" list. */
function priorityRow(priority) {
  const href = topicPracticeHref(priority.subject, priority.topic);
  const accuracy = priority.scored ? `${fmtPct(priority.accuracy)} accuracy` : 'no evidence yet';
  return `<div class="list-row-item">
    <div class="list-row-main">
      <p class="list-row-title"><a href="${esc(href)}">${esc(priority.topic)}</a></p>
      <p class="list-row-meta">${esc(priority.subject)} · ${esc(String(priority.available))} question${priority.available === 1 ? '' : 's'} · ${esc(accuracy)}</p>
    </div>
    ${evidenceMeter(priority.scored || 0)}
    <a class="row-action" href="${esc(href)}">Practise</a>
  </div>`;
}

/** One row of the recent-sessions list. */
function recentRow(test) {
  const score = test.score === null || test.score === undefined
    ? '—'
    : `${esc(String(test.score))}${test.max ? ` / ${esc(String(test.max))}` : ''}`;
  const accuracy = test.accuracy === null || test.accuracy === undefined ? 'submitted' : `${fmtPct(test.accuracy)} accuracy`;
  return `<div class="list-row-item">
    <div class="list-row-main">
      <p class="list-row-title"><a href="#/report/${esc(test.id)}">${esc(test.label)}</a></p>
      <p class="list-row-meta">${esc(fmtDate(test.at))} · ${esc(accuracy)}</p>
    </div>
    <span class="list-row-value">${score}<small>marks</small></span>
  </div>`;
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
    // was read; the hub reads both.
    const curriculum = await loadSyllabusWorkspace();
    const priorities = studyPriorities({ analytics, syllabusProgress: curriculum.progress, limit: 4 });

    const missingKeys = metas.filter((m) => !m.hasSuppliedAnswer && !m.hasVerifiedAnswer).length;
    const disputed = metas.filter((m) => m.disputed).length;
    const attention = [];
    if (missingKeys) attention.push(`${missingKeys} question(s) have no answer key and are excluded from scoring.`);
    if (disputed) attention.push(`${disputed} question(s) carry a disputed answer key.`);
    if (bank.unclassified) attention.push(`${bank.unclassified} question(s) are not classified by subject or topic.`);

    const dueCount = summary.dueToday + summary.overdue;
    const open = unfinished[0] || null;
    let openProgress = null;
    if (open) {
      try {
        openProgress = testsSvc.testProgress(open);
      } catch {
        openProgress = null;
      }
    }

    const nextUp = open
      ? `<div class="next-up-main">
          <p class="next-up-kicker">${esc(greeting())} · continue</p>
          <h2 class="next-up-title">${esc(open.label || open.kind || 'Unfinished session')}</h2>
          <p class="next-up-meta">You have an unfinished test: ${
            openProgress ? `${openProgress.answered} answered, ${openProgress.unanswered} left` : 'saved on this device'
          } · updated ${esc(fmtRelative(open.updated_at))}${unfinished.length > 1 ? ` · ${unfinished.length - 1} more in progress` : ''}</p>
          <div class="next-up-actions">
            <a class="btn btn-primary" href="#/runner/${esc(open.id)}">Resume session</a>
            <button class="btn" type="button" id="dashPractise">Start something new</button>
          </div>
        </div>`
      : `<div class="next-up-main">
          <p class="next-up-kicker">${esc(greeting())} · next up</p>
          <h2 class="next-up-title">Start a focused practice session</h2>
          <p class="next-up-meta">${bank.total} questions across ${bank.papers} paper(s), ready to practise. Twenty questions is a good sitting; choose a paper or a topic when you want something narrower.</p>
          <div class="next-up-actions">
            <button class="btn btn-primary" type="button" id="dashPractise">Practise now</button>
            <a class="btn" href="#/test-centre">Paper simulation</a>
            <a class="btn btn-quiet" href="#/topic">Choose topics</a>
          </div>
        </div>`;

    const revisionAside = dueCount
      ? `<div class="next-up-aside">
          <p class="next-up-aside-title">Revision due</p>
          <p class="next-up-count">${dueCount} <span>question${dueCount === 1 ? '' : 's'}</span></p>
          <p class="quiet-note">${summary.overdue ? `${summary.overdue} overdue` : 'All due today'}${summary.upcoming ? ` · ${summary.upcoming} scheduled ahead` : ''}</p>
          <div class="next-up-actions"><button class="btn btn-sm" type="button" id="dashReviseDue">Start revision</button></div>
        </div>`
      : `<div class="next-up-aside">
          <p class="next-up-aside-title">Revision</p>
          <p class="next-up-count">0 <span>due</span></p>
          <p class="quiet-note">${summary.upcoming ? `${summary.upcoming} question(s) scheduled ahead.` : 'Nothing is scheduled yet — attempt a set and revision dates appear.'}</p>
          <div class="next-up-actions"><a class="btn btn-sm btn-quiet" href="#/revision">Revision centre</a></div>
        </div>`;

    const statStrip = `<div class="stat-strip" role="group" aria-label="Preparation overview">
      <div class="stat">
        <span class="stat-label">Questions attempted</span>
        <span class="stat-value">${esc(String(analytics.counts.attemptedUnique))} <small>of ${esc(String(bank.total))}</small></span>
        <span class="stat-note">${fmtPct(analytics.counts.coverage)} of the bank covered</span>
      </div>
      <div class="stat">
        <span class="stat-label">First-attempt accuracy</span>
        <span class="stat-value">${analytics.accuracy.firstAttemptSample ? fmtPct(analytics.accuracy.firstAttempt) : '—'}</span>
        <span class="stat-note">${analytics.accuracy.firstAttemptSample ? `${analytics.accuracy.firstAttemptSample} first attempts scored` : 'Complete a scored attempt to begin'}</span>
      </div>
      <a class="stat" href="#/revision">
        <span class="stat-label">Due for revision</span>
        <span class="stat-value">${dueCount}</span>
        <span class="stat-note">${summary.overdue ? `${summary.overdue} overdue` : summary.dueToday ? 'due today' : 'nothing overdue'}</span>
      </a>
      <a class="stat" href="#/syllabus">
        <span class="stat-label">Syllabus</span>
        <span class="stat-value">${curriculum.progress.done} <small>of ${curriculum.progress.total}</small></span> <span class="stat-note">item(s) done · marked on the commission's 2026 syllabus</span>
      </a>
    </div>`;

    const prioritiesCard = card({
      title: 'Recommended next',
      count: priorities.length ? `${priorities.length} topic${priorities.length === 1 ? '' : 's'}` : null,
      info: cardInfo(
        'How recommendations are ranked',
        '<p class="small m-0">Topics combine question frequency in your imported bank, your recorded accuracy and your own syllabus marks. Frequency is a study aid, not a forecast of any future examination. A topic needs at least three judged answers before its accuracy is described.</p>',
      ),
      action: '<a class="btn btn-sm btn-quiet" href="#/analytics">All insights</a>',
      body: priorities.length
        ? `<div class="list-rows">${priorities.map(priorityRow).join('')}</div>`
        : `<p class="quiet-note">Recommendations appear once the bank is classified and you have recorded an attempt or marked a syllabus line. ${evidenceMeter(0)}</p>
           <div class="next-up-actions"><a class="btn btn-sm" href="#/topic">Practise a topic</a></div>`,
    });

    const recentCard = card({
      title: 'Recent sessions',
      action: '<a class="btn btn-sm btn-quiet" href="#/analytics">History</a>',
      body: summary.recentTests.length
        ? `<div class="list-rows">${summary.recentTests.slice(0, 4).map(recentRow).join('')}</div>`
        : '<p class="quiet-note">No submitted sessions yet. Your results will appear here after the first test.</p>',
    });

    const attentionLine = attention.length
      ? `<p class="quiet-note mt-2">${esc(attention.join(' '))} <a href="#/bank">Review in the question bank</a>.</p>`
      : '';

    return `
      ${screenHead({
        title: 'Dashboard',
        purpose: 'Where your preparation stands today, and the one useful thing to do next.',
        primary: '<button class="btn btn-primary" type="button" id="dashPractiseHead">Practise now</button>',
        secondary: '<a class="btn btn-sm btn-quiet" href="#/revision">Revision queue</a><a class="btn btn-sm btn-quiet" href="#/test-centre">Paper tests</a>',
      })}

      <section class="next-up" aria-label="Next step">
        ${nextUp}
        ${revisionAside}
      </section>

      ${statStrip}

      <div class="split-2">
        ${prioritiesCard}
        ${recentCard}
      </div>
      ${attentionLine}
    `;
  },

  async mount(ctx) {
    const openSheet = () => openPracticeSheet(ctx, { source: 'dashboard' });
    document.getElementById('dashPractise')?.addEventListener('click', openSheet);
    document.getElementById('dashPractiseHead')?.addEventListener('click', openSheet);

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
