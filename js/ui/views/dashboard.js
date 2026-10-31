/**
 * dashboard.js — Today: the study command centre.
 *
 * The screen is built as a desk that starts work, in this reading order:
 *
 *   1. **The hero** — the one thing that matters most right now: the unfinished
 *      sitting (with its progress bar and one Resume link), or, when nothing
 *      is half-done, the single next-best sitting with its real question count
 *      and a one-click Start.
 *   2. **The standing strip** — six figures that say where the reader stands:
 *      bank size, coverage, first-attempt accuracy, syllabus progress (split
 *      Prelims/Mains), revision due, open mistakes. Each cell is a link to the
 *      screen that owns the number.
 *   3. **The deck** — every startable sitting as a row (services/nextup.js
 *      decides what deserves a row and what the row would contain), plus the
 *      revision∩mistakes cross-signal when both are non-empty.
 *   4. **The weakest topics** — a short table with an evidence-strength meter
 *      per row, because a table is the right shape for numbers you compare.
 *   5. **The margin** — the standing facts about this device's data (missing
 *      keys, unclassified questions) and where the full reports live.
 *
 * Nothing is guessed: a row with no evidence behind it says so and does not
 * start. The DOM contract the journeys rely on is kept: `.start-row` rows with
 * `button[data-option]` (or a `#/runner/…` Resume link), `.evidence-meter`s in
 * the weakest table, and no provenance chips on this screen.
 */

import { state } from '../../core/state.js';
import { esc, confirmDialog, toast, evidenceMeter, screenHead, sheet, marginNote, segmented, metaLine, icon } from '../components.js';
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

/** A small glyph per option kind, so the deck scans by shape before by words. */
const OPTION_GLYPH = {
  resume: '▶',
  revision: '↻',
  smart: '◆',
  paper: '▤',
  topic: '◇',
  unseen: '✦',
  mistakes: '⚑',
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

/** One deck row. The count beside the title is the row's reason to exist. */
function deskRow(option) {
  const disabled = option.kind === 'resume' ? false : !option.count;
  const count = option.countLabel || (option.count ? `${option.count} question${option.count === 1 ? '' : 's'}` : 'nothing stored');
  return `<li class="start-row${disabled ? ' is-empty' : ''}"><div class="desk-row">
    <span class="desk-mark kind-${esc(option.kind)}" aria-hidden="true">${icon({revision:'revision',smart:'smart',paper:'test-centre',unseen:'book-open',mistakes:'mistakes',topic:'topic'}[option.kind] || 'topic', { size: 20 })}</span>
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
  return `<div class="focus-list">${priorities.map((priority, index) => {
    const judged = priority.scored || 0;
    const size2 = Math.min(priority.available, size);
    const accuracy = judged >= 3 ? fmtPct(priority.accuracy) : '—';
    return `<article class="focus-row">
      <div class="focus-row-top"><span class="focus-number" aria-hidden="true">0${index + 1}</span>
        <a href="${esc(topicPracticeHref(priority.subject, priority.topic))}">${esc(priority.topic)}</a>
        <span class="focus-accuracy" aria-label="First-attempt accuracy">${esc(accuracy)}</span>
      </div>
      <p class="focus-sub">${esc(priority.subject)} · ${esc(String(priority.available))} stored</p>
      <div class="focus-row-foot">${evidenceMeter(judged)}
        <button class="quiet-action" type="button" data-action="practise-topic" data-subject="${esc(priority.subject)}" data-topic="${esc(priority.topic)}" ${size2 ? '' : 'disabled'}>
          Practise${size2 ? ` ${size2}` : ''} <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>`;
  }).join('')}</div>`;
}

/* ------------------------------------------------------------------ hero -- */

/**
 * The one thing that matters most right now. An unfinished sitting always wins
 * (it is literally half-done work); otherwise the first deck row that can
 * actually start.
 */
function studyArtwork() {
  return `<div class="cc-hero-art" aria-hidden="true">
    <svg viewBox="0 0 240 190" fill="none" focusable="false">
      <circle class="art-orbit" cx="127" cy="92" r="77" />
      <circle class="art-dot" cx="190" cy="42" r="9" />
      <path class="art-spark" d="M40 48v16m-8-8h16M195 133v12m-6-6h12" />
      <g transform="rotate(-9 120 100)">
        <rect class="art-book-back" x="57" y="40" width="125" height="119" rx="10" />
        <rect class="art-book-page" x="48" y="31" width="125" height="119" rx="10" />
        <path class="art-rule" d="M68 57h57M68 70h83M68 83h65" />
        <rect class="art-check-bg" x="68" y="102" width="17" height="17" rx="5" />
        <path class="art-check" d="m72 110 3 3 6-7" />
        <path class="art-rule" d="M96 110h48M68 131h76" />
      </g>
      <g transform="rotate(9 166 125)">
        <rect class="art-book-front" x="125" y="91" width="66" height="65" rx="10" />
        <path class="art-book-mark" d="M146 92v27l10-6 10 6V92" />
      </g>
      <circle class="art-small-dot" cx="57" cy="155" r="5" />
    </svg>
  </div>`;
}

function heroBlock(unfinished, nextUp) {
  if (unfinished) {
    const answered = unfinished.answered || 0;
    const total = unfinished.total || unfinished.count || 0;
    return `<section class="cc-hero cc-hero-resume" aria-label="Unfinished test">
      <div class="cc-hero-main">
        <p class="cc-kicker"><span class="live-dot"></span>Unfinished test</p>
        <h2 class="cc-hero-title"><a href="#/${esc(unfinished.href || '')}">${esc(unfinished.label)}</a></h2>
        ${metaLine([`Started ${esc(fmtDate(unfinished.startedAt || new Date().toISOString()))}`,`${answered} of ${total} answered`,unfinished.extra ? esc(unfinished.extra) : ''])}
        <div class="cc-hero-bar">${segmented([{ label: 'answered', value: answered, tone: 'ok' }, { label: 'left', value: Math.max(0, total - answered), tone: 'blank' }], { label: `${answered} of ${total} questions answered` })}</div>
        <div class="cc-hero-actions"><a class="btn btn-primary cc-hero-cta" href="#/${esc(unfinished.href || '')}" aria-label="Resume — ${esc(unfinished.label)}">Resume session <span aria-hidden="true">→</span></a><span class="cc-hero-note">Right where you left off.</span></div>
      </div>${studyArtwork()}
    </section>`;
  }
  if (nextUp) {
    const verb = OPTION_VERB[nextUp.kind] || 'Start';
    return `<section class="cc-hero" aria-label="Next up">
      <div class="cc-hero-main">
        <p class="cc-kicker">${icon('smart', { size: 14 })} Recommended next</p>
        <h2 class="cc-hero-title">${esc(nextUp.label)}</h2>
        <p class="cc-hero-detail">${esc(nextUp.detail)}</p>
        <div class="cc-hero-actions"><button class="btn btn-primary cc-hero-cta" type="button" data-action="start-option" data-option="${esc(nextUp.id)}" aria-label="${esc(`${verb} — ${nextUp.label}, ${nextUp.count || 0} question(s)`)}">${esc(verb)} ${nextUp.count || 0} questions <span aria-hidden="true">→</span></button><span class="cc-hero-note">One session. A little more confidence.</span></div>
      </div>${studyArtwork()}
    </section>`;
  }
  return '';
}

/* ----------------------------------------------------------- standing strip -- */

/** One figure of the standing strip; a link when the number has a home screen. */
function statCell({ label, value, sub = '', href = null, tone = '', symbol = 'bank' }) {
  const inner = `<span class="cc-stat-label"><span class="cc-stat-icon">${icon(symbol, { size: 16 })}</span>${esc(label)}</span>
    <span class="cc-stat-value${tone ? ` ${tone}` : ''}">${value}</span>
    ${sub ? `<span class="cc-stat-sub">${sub}</span>` : ''}`;
  if (href) return `<a class="cc-stat tone-${tone || 'accent'}" href="${esc(href)}">${inner}</a>`;
  return `<div class="cc-stat tone-${tone || 'accent'}">${inner}</div>`;
}

function standingStrip({ bank, analytics, curriculum, dueRevision, openMistakes }) {
  const prelims = curriculum.index.official.get('prelims');
  const mains = curriculum.index.official.get('mains');
  const sylTotal = curriculum.progress.total || 0;
  const sylDone = curriculum.progress.done || 0;
  // The segmented bar uses the same order as the Syllabus screen: revised,
  // completed, in progress, over the track.
  let x = 0;
  const segs = [];
  for (const status of ['revised', 'completed', 'in_progress']) {
    const count = curriculum.progress.byStatus?.[status] || 0;
    if (!count || !sylTotal) continue;
    const width = (count / sylTotal) * 100;
    segs.push(`<rect class="syl-seg ${status}" x="${x.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="10"></rect>`);
    x += width;
  }
  const bar = `<svg class="syl-bar mini cc-stat-bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="syl-seg track" x="0" y="0" width="100" height="10"></rect>${segs.join('')}</svg>`;

  const sylSub = `${bar}<span>Prelims ${prelims?.done || 0}/${prelims?.total || 0} · Mains ${mains?.done || 0}/${mains?.total || 0}</span>`;

  return `<section class="cc-stats" aria-label="Where you stand">
    ${statCell({ label: 'Question bank', value: esc(String(bank.total)), sub: `${esc(String(bank.papers))} papers stored`, href: '#/bank', symbol: 'bank', tone: 'accent' })}
    ${statCell({
      label: 'Covered',
      value: `${esc(String(analytics.counts.attemptedUnique))}<small>/${esc(String(analytics.counts.availableQuestions))}</small>`,
      sub: `${fmtPct(analytics.counts.coverage)} of the bank attempted`,
      href: '#/analytics', symbol: 'book-open', tone: 'info',
    })}
    ${statCell({
      label: 'First-attempt accuracy',
      value: analytics.accuracy.firstAttemptSample ? fmtPct(analytics.accuracy.firstAttempt) : '—',
      sub: analytics.accuracy.firstAttemptSample ? `over ${analytics.accuracy.firstAttemptSample} answered` : 'none scored yet',
      href: '#/analytics', symbol: 'target', tone: 'ok',
    })}
    ${statCell({ label: 'Syllabus done', value: `${esc(String(sylDone))}<small>/${esc(String(sylTotal))}</small>`, sub: sylSub, href: '#/syllabus', symbol: 'syllabus', tone: 'violet' })}
    ${statCell({ label: 'Revision due', value: esc(String(dueRevision)), sub: dueRevision ? 'scheduled review is waiting' : 'nothing due now', href: '#/revision', tone: 'warn', symbol: 'revision' })}
    ${statCell({ label: 'Open mistakes', value: esc(String(openMistakes)), sub: openMistakes ? 'in the Mistake Book' : 'nothing open', href: '#/mistakes', tone: 'bad', symbol: 'mistakes' })}
  </section>`;
}

/* -------------------------------------------------------------- empty state -- */

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
    const [{ options, bank }, overlap, submitted] = await Promise.all([
      buildStartOptions({ size }),
      reviewOverlap().catch(() => null),
      testsSvc.listTests({ status: 'submitted', limit: 1 }),
    ]);

    const { analytics } = await loadAnalytics();
    const curriculum = await loadSyllabusWorkspace();
    const priorities = studyPriorities({ analytics, syllabusProgress: curriculum.progress, limit: 4 });

    renderedOptions = new Map(options.map((option) => [option.id, option]));
    const unfinished = options.find((option) => option.kind === 'resume') || null;
    // Five rows at most: the hero carries the unfinished sitting (or the next
    // best start), and "practise a weak topic" belongs to the table below,
    // with its evidence.
    const deck = options.filter((option) => option.id !== 'weak' && option.kind !== 'resume').slice(0, 5);
    const nextUp = deck.find((option) => option.count > 0) || null;

    const bankInfo = bankSummary();
    const dueRevision = overlap?.due ?? 0;
    const openMistakes = overlap?.openMistakes ?? 0;
    const both = overlap?.dueAndOpen ?? 0;

    const missingKeys = metas.filter((m) => !m.hasSuppliedAnswer && !m.hasVerifiedAnswer).length;

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
      `<p>Your questions, attempts and progress stay in this browser. No account. No uploads.</p>
       <p>Export a backup to keep a copy outside this device.</p>
       ${missingKeys ? `<p class="margin-warning">${missingKeys} question(s) have no answer key and are excluded from scoring.</p>` : ''}
       ${bankInfo.unclassified ? `<p>${bankInfo.unclassified} question(s) are unclassified.</p>` : ''}
       <a href="#/settings">Backup &amp; storage <span aria-hidden="true">→</span></a>
       ${submitted.length ? '<a href="#/analytics">Recent sessions &amp; insights <span aria-hidden="true">→</span></a>' : ''}`,
      { title: 'Local by design' },
    );

    return `
      ${screenHead({
        title: 'Today',
        className: 'today-head',
        eyebrow: `${greeting()} · ${todayLine()}`,
        purpose: 'A little progress, every day. Make your next session count.',
        primary: '<a class="btn" href="#/topic">Build a session <span aria-hidden="true">↗</span></a>',
        secondary:
          '<button class="btn btn-sm btn-quiet" type="button" id="dashPractise">Quick session…</button>',
      })}

      <div class="cc">
        ${heroBlock(unfinished, nextUp)}
        ${standingStrip({ bank, analytics, curriculum, dueRevision, openMistakes })}

        <div class="cc-lower">
          <div class="cc-desk">
            ${sheet({
              className: 'desk-sheet',
              label: 'Your study shortcuts',
              body: `<ul class="desk-list">${deck.map(deskRow).join('')}</ul>${overlapLine}`,
              footer: '<a class="quiet-action" href="#/test-centre">Explore all previous-year papers <span aria-hidden="true">→</span></a>',
            })}
          </div>
          <aside class="cc-aside">
            ${sheet({
              className: 'focus-sheet',
              label: 'A little extra focus',
              action: '<a class="quiet-action" href="#/analytics">Insights ↗</a>',
              body: attention,
              footer: priorities.length
                ? '<p class="tiny text-soft m-0">Based on your bank, recorded accuracy and syllabus marks. A study aid, not a forecast. Accuracy appears after three judged answers.</p>'
                : '',
            })}
            ${margin}
          </aside>
        </div>
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
