/**
 * dashboard.js — Today: the screen that starts work.
 *
 * The dashboard used to *describe* preparation and then link elsewhere: a
 * next-up block, a stat strip, a recommendation list whose rows only navigated,
 * and a recent-sessions list. A returning learner still had to walk through two
 * or three screens (and a configuration modal) to be answering a question.
 *
 * Today launches. Every row in the start deck is built from stored data — an
 * unfinished test, the revision schedule, the smart plan, the newest stored
 * paper, never-seen questions, the open mistake book — states its real count,
 * and starts the session in one click (see services/nextup.js for the rules, and
 * views/shared.js for the shared starters). Nothing here estimates anything: a
 * row with no evidence behind it shows 0 and says why, and is not clickable.
 *
 * Beneath the deck: one row per weak topic with a *Practise* button that starts
 * a topic session immediately, the four figures that describe standing, and the
 * recent sittings. Cards are the exception, not the unit: the deck, the figures
 * and the cross-signal live on the page itself.
 */

import { state } from '../../core/state.js';
import { esc, card, confirmDialog, toast, evidenceMeter, screenHead, cardInfo } from '../components.js';
import { fmtPct, fmtDate, fmtMarks, topicPracticeHref } from '../../core/util.js';
import { loadAnalytics, studyPriorities } from '../../services/analytics.js';
import * as testsSvc from '../../services/tests.js';
import { loadSyllabusWorkspace } from '../../services/syllabus-hub.js';
import { buildStartOptions, reviewOverlap, DEFAULT_SESSION_SIZE } from '../../services/nextup.js';
import { bankSummary } from '../../services/questions.js';
import { startOption, startTopicSession, startPool } from './shared.js';
import { openPracticeSheet } from '../practicesheet.js';
import { dashboardSkeleton } from '../skeletons.js';

/**
 * The options the last render painted, keyed by id. The row the reader clicks
 * must start the session whose count they just read, so the descriptors are
 * kept rather than rebuilt on click (stored data may have changed meanwhile,
 * but the button said 20 and must start 20).
 */
let renderedOptions = new Map();

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
      title: 'Today',
      purpose: 'A local-first MPPSC Prelims practice app. The question bank, your answers, mistakes and revision schedule live in this browser.',
      primary: '<a class="btn btn-primary" href="#/bank">Import a question bank</a>',
      secondary: '<a class="btn btn-quiet" href="#/help">How this app works</a>',
    })}
    ${card({
      title: 'Start with a question bank',
      body: `
        <ol class="small">
          <li>Import a bank exported by your own data pipeline, or load the clearly-labelled demonstration bank to look around.</li>
          <li>Today will then offer the next sitting — a paper, a topic, a smart mix or due revision — in one click.</li>
          <li>Review the report, work through mistakes, and let the revision schedule tell you what is due.</li>
        </ol>
        <div class="row">
          <button class="btn" type="button" id="dashLoadDemo">Load the demonstration bank</button>
        </div>
        <p class="tiny muted mt-2 mb-0">Demonstration questions are synthetic examples written to show the schema. They are never presented as authentic MPPSC previous-year questions.</p>`,
    })}`;
}

/** Verb for a start option, so the button says what will happen. */
const OPTION_VERB = {
  resume: 'Resume',
  revision: 'Revise now',
  smart: 'Start',
  paper: 'Start paper',
  topic: 'Practise',
  unseen: 'Start',
  mistakes: 'Retry',
};

/** Legend for the deck rows: an option with a route is a link… */
function startAction(option, disabled) {
  const verb = OPTION_VERB[option.kind] || 'Start';
  const label = `${verb} — ${option.label}${option.count ? `, ${option.count} question(s)` : ''}`;
  const tone = option.tone === 'accent' ? 'btn-primary' : '';
  // Resume is a real route (`#/runner/<id>`), so it stays a link: it can be
  // opened in a new tab and the browser's back button returns to Today.
  if (option.href) {
    return `<a class="btn ${tone} btn-sm" href="#/${esc(option.href)}" aria-label="${esc(label)}">${esc(verb)}</a>`;
  }
  return `<button class="btn ${tone} btn-sm" type="button" data-action="start-option" data-option="${esc(option.id)}"
      ${disabled ? 'disabled' : ''} aria-label="${esc(label)}">${esc(verb)}</button>`;
}

/**
 * One row of the start deck. The count is the justification for the row, so it
 * sits beside the button rather than in a separate summary elsewhere.
 */
function startRow(option) {
  const disabled = option.kind === 'resume' ? false : !option.count;
  const countText = option.countLabel || (option.count ? `${option.count}` : 'none');
  return `<li class="start-row ${disabled ? 'is-empty' : ''} ${option.tone === 'accent' ? 'is-accent' : ''}">
    <div class="start-row-main">
      <p class="start-row-label">${esc(option.label)}${option.extra ? ` <span class="start-row-extra">${esc(option.extra)}</span>` : ''}</p>
      <p class="start-row-detail">${esc(option.detail)}</p>
    </div>
    <span class="start-row-count" aria-hidden="true">${esc(countText)}</span>
    ${startAction(option, disabled)}
  </li>`;
}

/** One weak-topic row with the practice action attached to it. */
function attentionRow(priority, maxCount) {
  const judged = priority.scored || 0;
  const evidence = judged >= 3 ? `${fmtPct(priority.accuracy)} accuracy over ${judged} judged` : judged ? `${judged} judged — too thin to judge yet` : 'never attempted';
  const size = Math.min(priority.available, maxCount);
  return `<div class="action-row">
    <div class="action-row-main">
      <p class="action-row-title"><a href="${esc(topicPracticeHref(priority.subject, priority.topic))}">${esc(priority.topic)}</a></p>
      <p class="action-row-meta">${esc(priority.subject)} · ${esc(evidence)} · ${esc(String(priority.available))} stored</p>
    </div>
    ${evidenceMeter(judged)}
    <button class="btn btn-sm" type="button" data-action="practise-topic" data-subject="${esc(priority.subject)}" data-topic="${esc(priority.topic)}" ${size ? '' : 'disabled'}>
      Practise${size ? ` ${size}` : ''}
    </button>
  </div>`;
}

/** One row of the recent-sessions list. */
function recentRow(test) {
  const score = test.score === null || test.score === undefined
    ? '—'
    : `${esc(fmtMarks(test.score))}${test.max ? ` / ${esc(fmtMarks(test.max))}` : ''}`;
  const accuracy = test.accuracy === null || test.accuracy === undefined ? 'submitted' : `${fmtPct(test.accuracy)} accuracy`;
  return `<div class="action-row">
    <div class="action-row-main">
      <p class="action-row-title"><a href="#/report/${esc(test.id)}">${esc(test.label)}</a></p>
      <p class="action-row-meta">${esc(fmtDate(test.at))} · ${esc(accuracy)}</p>
    </div>
    <span class="action-row-value">${score}<small>marks</small></span>
    <a class="btn btn-sm btn-quiet" href="#/report/${esc(test.id)}">Debrief</a>
  </div>`;
}

export default {
  title: 'Today',

  /** Placeholder while the analytics and test history load (router.js). */
  skeleton() {
    return dashboardSkeleton({ hasBank: state.questionIndex.size > 0 });
  },

  async render(ctx) {
    const metas = Array.from(state.questionIndex.values());
    if (!metas.length) return noBankCard();

    const size = DEFAULT_SESSION_SIZE;
    const [{ options, bank }, overlap, unpublished, submitted] = await Promise.all([
      buildStartOptions({ size }),
      reviewOverlap().catch(() => null),
      testsSvc.unfinishedTests().catch(() => []),
      testsSvc.listTests({ status: 'submitted', limit: 6 }),
    ]);

    const { analytics } = await loadAnalytics();
    const curriculum = await loadSyllabusWorkspace();
    const priorities = studyPriorities({ analytics, syllabusProgress: curriculum.progress, limit: 4 });

    // "Practise a weak topic" is the one thing the deck deliberately does not
    // duplicate: the attention list below is where topics live, with their
    // evidence and their own counts.
    renderedOptions = new Map(options.map((option) => [option.id, option]));
    const deck = options.filter((option) => option.id !== 'weak');
    const bankInfo = bankSummary();
    const dueRevision = overlap?.due ?? 0;
    const openMistakes = overlap?.openMistakes ?? 0;
    const both = overlap?.dueAndOpen ?? 0;

    const unfinishedCount = unpublished.length;
    const purpose = [
      greeting(),
      `${bank.total} questions across ${bank.papers} paper${bank.papers === 1 ? '' : 's'} stored`,
      unfinishedCount ? `${unfinishedCount} unfinished test${unfinishedCount === 1 ? '' : 's'} ready to resume` : null,
      dueRevision ? `${dueRevision} due for revision` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const integrity = [];
    const missingKeys = metas.filter((m) => !m.hasSuppliedAnswer && !m.hasVerifiedAnswer).length;
    if (missingKeys) integrity.push(`${missingKeys} question(s) have no answer key and are excluded from scoring.`);
    if (bankInfo.unclassified) integrity.push(`${bankInfo.unclassified} question(s) are not classified by subject or topic.`);

    const attentionCard = card({
      title: 'Needs attention',
      count: priorities.length ? `${priorities.length} topic${priorities.length === 1 ? '' : 's'}` : null,
      info: cardInfo(
        'How this list is ranked',
        '<p class="small m-0">Topics combine question frequency in your imported bank, your recorded accuracy and your own syllabus marks. Frequency is a study aid, not a forecast of any future examination. A topic needs at least three judged answers before its accuracy is described.</p>',
      ),
      action: '<a class="btn btn-sm btn-quiet" href="#/analytics">All insights</a>',
      body: priorities.length
        ? `<div class="action-rows">${priorities.map((row) => attentionRow(row, size)).join('')}</div>`
        : `<p class="quiet-note m-0">Recommendations appear once the bank is classified and you have recorded an attempt or marked a syllabus line. In the meantime, the deck above starts with unseen questions.</p>`,
      footer: both
        ? `<div class="cross-signal">
            <span><strong>${both}</strong> of the ${dueRevision} due question(s) are also open mistakes — the highest-value review there is.</span>
            <button class="btn btn-sm" type="button" data-action="practise-both">Practise both (${both})</button>
          </div>`
        : openMistakes
          ? `<div class="cross-signal">
              <span><strong>${openMistakes}</strong> question(s) are open in the Mistake Book.</span>
              <a class="btn btn-sm" href="#/mistakes">Open the Mistake Book</a>
            </div>`
          : '',
    });

    const recentCard = card({
      title: 'Recent sittings',
      action: '<a class="btn btn-sm btn-quiet" href="#/analytics">History</a>',
      body: submitted.length
        ? `<div class="action-rows">${submitted.slice(0, 4).map(recentRow).join('')}</div>`
        : '<p class="quiet-note m-0">Nothing submitted yet. The first finished session appears here with its marks and a debrief.</p>',
    });

    const statStrip = `<div class="stat-strip" role="group" aria-label="Preparation overview">
      <div class="stat">
        <span class="stat-label">Questions attempted</span>
        <span class="stat-value">${esc(String(analytics.counts.attemptedUnique))} <small>of ${esc(String(bank.total))}</small></span>
        <span class="stat-note">${fmtPct(analytics.counts.coverage)} of the bank covered</span>
      </div>
      <div class="stat">
        <span class="stat-label">First-attempt accuracy</span>
        <span class="stat-value">${analytics.accuracy.firstAttemptSample ? fmtPct(analytics.accuracy.firstAttempt) : '—'}</span>
        <span class="stat-note">${analytics.accuracy.firstAttemptSample ? `${analytics.accuracy.firstAttemptSample} first attempts scored` : 'complete a scored attempt to begin'}</span>
      </div>
      <a class="stat" href="#/revision">
        <span class="stat-label">Due for revision</span>
        <span class="stat-value">${dueRevision}</span>
        <span class="stat-note">${both ? `${both} also open mistakes` : openMistakes ? `${openMistakes} open mistakes` : 'nothing overdue'}</span>
      </a>
      <a class="stat" href="#/syllabus">
        <span class="stat-label">Syllabus</span>
        <span class="stat-value">${curriculum.progress.done} <small>of ${curriculum.progress.total}</small></span>
        <span class="stat-note">item(s) done · marked on the commission's 2026 syllabus</span>
      </a>
    </div>`;

    return `
      ${screenHead({
        title: 'Today',
        purpose: esc(purpose),
        primary: `<button class="btn btn-primary" type="button" data-action="start-option" data-option="smart">Start a ${size}-question smart session</button>`,
        secondary:
          '<button class="btn btn-sm btn-quiet" type="button" id="dashPractise">Quick session…</button>' +
          '<a class="btn btn-sm btn-quiet" href="#/topic">Build a session</a>',
      })}

      <section class="start-deck" aria-labelledby="startDeckTitle">
        <div class="start-deck-head">
          <h2 id="startDeckTitle">Start now</h2>
          <p>Every row is built from what is stored on this device and starts a real session.</p>
        </div>
        <ul class="start-rows">${deck.map(startRow).join('')}</ul>
      </section>

      ${statStrip}

      <div class="split-2">
        ${attentionCard}
        ${recentCard}
      </div>
      ${integrity.length ? `<p class="quiet-note mt-2">${esc(integrity.join(' '))} <a href="#/bank">Review in the question bank</a>.</p>` : ''}
    `;
  },

  async mount(ctx, root) {
    root.addEventListener(
      'click',
      async (ev) => {
        const button = ev.target.closest('[data-action]');
        if (!button || !root.contains(button)) return;
        const action = button.dataset.action;

        if (action === 'start-option') {
          // The descriptor the row was painted from — same pool, same count.
          const option = renderedOptions.get(button.dataset.option);
          if (!option) return;
          button.disabled = true;
          try {
            await startOption(ctx, option);
          } finally {
            button.disabled = false;
          }
          return;
        }

        if (action === 'practise-topic') {
          button.disabled = true;
          try {
            await startTopicSession(ctx, { subject: button.dataset.subject, topic: button.dataset.topic });
          } finally {
            button.disabled = false;
          }
          return;
        }

        if (action === 'practise-both') {
          const overlap = await reviewOverlap();
          const ids = overlap.bothIds;
          if (!ids.length) {
            toast('Nothing is both due and open right now.', 'info');
            return;
          }
          await startPool(ctx, {
            ids,
            label: `Revision + mistakes — ${ids.length} question(s)`,
            notes: ['Questions that are both due for revision and open in the Mistake Book.'],
            config: { feedbackMode: 'learning', durationMinutes: null },
            orderSource: 'due_first',
            kind: 'revision',
          });
        }
      },
      { signal: ctx.signal },
    );

    document.getElementById('dashPractise')?.addEventListener('click', () => openPracticeSheet(ctx, { source: 'today' }), { signal: ctx.signal });

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
