/**
 * dashboard.js — Today: the screen that starts work.
 *
 * Today is a desk, not a report about a desk. It carries, in reading order:
 *
 *   1. the unfinished sitting, if there is one — with a progress rule and the
 *      one link that continues it;
 *   2. three rows of work, each built from stored data, each starting a real
 *      session in one click (services/nextup.js decides what deserves a row);
 *   3. the weakest topics as a short table, because a table is the right shape
 *      for numbers you compare;
 *   4. in the margin, the standing facts that used to fill a stat strip.
 *
 * Everything removed from this screen — the recent-sittings list, the four
 * figures above the fold, the cross-signal card — still exists: sittings are on
 * the weekly report, the figures are in the margin, and the overlap sentence is
 * one line under the rows. Nothing is guessed: a row with no evidence behind it
 * says so and does not start.
 */

import { state } from '../../core/state.js';
import { esc, confirmDialog, toast, evidenceMeter, screenHead, sheet, marginNote, segmented, metaLine } from '../components.js';
import { fmtPct, fmtDate, topicPracticeHref } from '../../core/util.js';
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

function todayLine() {
  const now = new Date();
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = now.toLocaleDateString('en-GB', { month: 'long' });
  return `${weekday} ${now.getDate()} ${month}`;
}

/** Verb for a start option, so the button says what will happen. */
const OPTION_VERB = {
  resume: 'Resume',
  revision: 'Revise',
  smart: 'Start',
  paper: 'Start',
  topic: 'Practise',
  unseen: 'Start',
  mistakes: 'Retry',
};

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

/** One row of the desk. The count beside the title is the row's reason to exist. */
function deskRow(option) {
  const disabled = option.kind === 'resume' ? false : !option.count;
  const count = option.countLabel || (option.count ? `${option.count} question${option.count === 1 ? '' : 's'}` : 'nothing stored');
  return `<li class="start-row${disabled ? ' is-empty' : ''}"><div class="desk-row">
    <span class="desk-mark" aria-hidden="true">${option.tone === 'accent' ? '◆' : '◇'}</span>
    <span class="desk-title">${esc(option.label)}${option.extra ? ` <em>— ${esc(option.extra)}</em>` : ''}
      <em class="desk-sub">${esc(option.detail)}</em></span>
    <span class="desk-act"><span class="desk-count">${esc(count)}</span>${startAction(option, disabled)}</span>
  </div></li>`;
}

/**
 * The weakest topics, as a table: name, accuracy bar, sample, the one action.
 * `tbody` matters — the report's journey test starts a session from this shape.
 */
function attentionTable(priorities, size) {
  return `<table class="bar-rows">
    <tbody>${priorities
      .map((priority) => {
        const judged = priority.scored || 0;
        const size2 = Math.min(priority.available, size);
        const accuracy = judged >= 3 ? fmtPct(priority.accuracy) : '—';
        const pct = Math.max(3, Math.round(Math.max(0, Math.min(1, Number(priority.accuracy) || 0)) * 20) * 5);
        return `<tr>
          <td class="row-name">
            <a href="${esc(topicPracticeHref(priority.subject, priority.topic))}">${esc(priority.topic)}</a>
            <small>${esc(priority.subject)} <span aria-hidden="true">/</span> ${esc(String(priority.available))} stored ${evidenceMeter(judged)}</small>
          </td>
          <td class="bar-track"><span><i data-pct="${pct}"></i></span></td>
          <td class="row-value">${esc(accuracy)}</td>
          <td class="row-act">
            <button class="btn btn-sm" type="button" data-action="practise-topic" data-subject="${esc(priority.subject)}" data-topic="${esc(priority.topic)}" ${size2 ? '' : 'disabled'}>
              Practise${size2 ? ` ${size2}` : ''}
            </button>
          </td>
        </tr>`;
      })
      .join('')}</tbody>
  </table>`;
}

function noBankCard() {
  return `
    ${screenHead({
      title: 'Today',
      eyebrow: todayLine(),
      purpose: 'A local-first MPPSC Prelims practice app: the bank, your answers and your mistakes stay in this browser.',
      primary: '<a class="btn btn-primary" href="#/bank">Import a question bank</a>',
      secondary: '<a class="btn btn-quiet" href="#/help">How this app works</a>',
    })}
    ${sheet({
      label: 'First, the bank',
      body: `
        <ol class="small">
          <li>Import a bank exported by your own data pipeline, or load the clearly-labelled demonstration bank to look around.</li>
          <li>Today will then offer the next sitting — a paper, a topic, a revision queue — in one click.</li>
          <li>Review the report, work through mistakes, and let the revision schedule tell you what is due.</li>
        </ol>
        <div class="row">
          <button class="btn" type="button" id="dashLoadDemo">Load the demonstration bank</button>
        </div>
        <p class="tiny text-soft mt-2 mb-0">Demonstration questions are synthetic examples written to show the schema. They are never presented as authentic MPPSC previous-year questions.</p>`,
    })}`;
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
      testsSvc.listTests({ status: 'submitted', limit: 1 }),
    ]);

    const { analytics } = await loadAnalytics();
    const curriculum = await loadSyllabusWorkspace();
    const priorities = studyPriorities({ analytics, syllabusProgress: curriculum.progress, limit: 4 });

    renderedOptions = new Map(options.map((option) => [option.id, option]));
    const unfinished = options.find((option) => option.kind === 'resume') || null;
    // Five rows at most: the hero carries the unfinished sitting, and "practise
    // a weak topic" belongs to the table below, with its evidence.
    const deck = options.filter((option) => option.id !== 'weak' && option.kind !== 'resume').slice(0, 5);

    const bankInfo = bankSummary();
    const dueRevision = overlap?.due ?? 0;
    const openMistakes = overlap?.openMistakes ?? 0;
    const both = overlap?.dueAndOpen ?? 0;

    const missingKeys = metas.filter((m) => !m.hasSuppliedAnswer && !m.hasVerifiedAnswer).length;

    const hero = unfinished
      ? sheet({
          label: 'Unfinished test',
          body: `
            <div class="hero-sitting">
              <div>
                <h2 class="hero-title"><a href="#/${esc(unfinished.href || '')}">${esc(unfinished.label)}</a></h2>
                ${metaLine([
                  'unfinished test',
                  `started ${esc(fmtDate(unfinished.startedAt || new Date().toISOString()))}`,
                  `${unfinished.answered || 0} of ${unfinished.total || 0} answered`,
                ])}
              </div>
              <a class="btn btn-primary" href="#/${esc(unfinished.href || '')}" aria-label="Resume — ${esc(unfinished.label)}">Resume</a>
            </div>`,
          footer: `${segmented(
            [
              { label: 'answered', value: unfinished.answered || 0, tone: 'ok' },
              { label: 'left', value: unfinished.count || 0, tone: 'blank' },
            ],
            { label: `${unfinished.answered || 0} of ${unfinished.count || 0} questions answered` },
          )}`,
        })
      : '';

    const overlapLine = both
      ? `<p class="overlap-line"><strong>${both}</strong> of the ${dueRevision} question(s) due for revision are also open mistakes — the highest-value review there is.
          <button class="quiet-action" type="button" data-action="practise-both">Practise both</button></p>`
      : openMistakes
        ? `<p class="overlap-line"><strong>${openMistakes}</strong> question(s) are open in the Mistake Book. <a href="#/mistakes">Open it</a>.</p>`
        : '';

    const attention = priorities.length
      ? attentionTable(priorities, size)
      : `<p class="quiet-note m-0">Nothing is ranked yet. Topics appear here once the bank is classified and you have recorded an attempt or marked a syllabus line. Until then, the rows above start with unseen questions.</p>`;

    const margin = marginNote(
      `<p>Bank <b class="fig">${esc(String(bank.total))}</b> questions, ${esc(String(bank.papers))} paper${bank.papers === 1 ? '' : 's'}.</p>
       <p>Covered <b class="fig">${esc(String(analytics.counts.attemptedUnique))}</b> (${fmtPct(analytics.counts.coverage)}).</p>
       <p>First-attempt accuracy <b class="fig">${analytics.accuracy.firstAttemptSample ? fmtPct(analytics.accuracy.firstAttempt) : '—'}</b>${
         analytics.accuracy.firstAttemptSample ? ` over ${analytics.accuracy.firstAttemptSample} answered` : ' — none scored yet'
       }.</p>
       <p>Syllabus <b class="fig">${curriculum.progress.done}</b> of ${curriculum.progress.total} item(s) done, marked on the commission's 2026 syllabus.</p>
       ${missingKeys ? `<p>${missingKeys} question(s) have no answer key and are excluded from scoring.</p>` : ''}
       ${bankInfo.unclassified ? `<p>${bankInfo.unclassified} question(s) are unclassified.</p>` : ''}
       ${submitted.length ? `<p><a href="#/analytics">Recent sittings and the weekly report</a></p>` : ''}`,
      { title: 'Where you stand' },
    );

    return `
      ${screenHead({
        title: 'Today',
        eyebrow: `${greeting()} — ${todayLine()}`,
        purpose: 'What to do next, from what is stored on this device.',
        primary: `<button class="btn btn-primary" type="button" data-action="start-option" data-option="smart">Start a ${size}-question session</button>`,
        secondary:
          '<button class="btn btn-sm btn-quiet" type="button" id="dashPractise">Quick session…</button>' +
          '<a class="btn btn-sm btn-quiet" href="#/topic">Build a session</a>',
      })}

      <div class="with-margin">
        <div>
          ${hero}
          ${sheet({
            label: 'On the desk',
            body: `<ul class="desk-list">${deck.map(deskRow).join('')}</ul>${overlapLine}`,
          })}
          ${sheet({
            label: 'Where it is weakest',
            action: '<a class="quiet-action" href="#/analytics">All insights</a>',
            body: attention,
            footer: priorities.length
              ? '<p class="tiny text-soft m-0">Ranked by question frequency in your bank, your recorded accuracy and your own syllabus marks — a study aid, not a forecast. Accuracy is described only after three judged answers.</p>'
              : '',
          })}
        </div>
        ${margin}
      </div>`;
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
