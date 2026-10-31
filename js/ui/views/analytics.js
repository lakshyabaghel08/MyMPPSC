/**
 * analytics.js (view) — the Insights section.
 *
 * Analytics and PYQ Analysis were two screens that read as one idea in the
 * menu but answer different questions over different data: what *you* did,
 * derived from stored attempts, versus what the stored *papers* contain, which
 * is pure counting over the question index. Neither is redundant, so they are
 * merged as one section with two panels rather than one pile of cards.
 *
 * The tab boundary is exactly the data-source boundary, and it is a rule worth
 * keeping: the performance panel never counts the bank as though it were the
 * examination, and the bank panel never shows performance. Each panel still
 * comes from its own service, unchanged by the merge.
 *
 * On the performance panel, the three numbers that are often conflated are
 * shown separately and named clearly: questions available, unique questions
 * attempted, and total attempts.
 */

import {
  esc,
  sheet,
  barRows,
  dataTable,
  emptyState,
  toast,
  infoToggle,
  tabs,
  mountTabs,
  screenHead,
  showAll,
} from '../components.js';
import { fmtPct, fmtDate, fmtDuration, downloadJson, todayKey, topicPracticeHref } from '../../core/util.js';
import { loadAnalytics, studyPriorities, MIN_SAMPLE_HINT, MIN_SAMPLE_STRONG } from '../../services/analytics.js';
import { loadSyllabusWorkspace } from '../../services/syllabus-hub.js';
import { renderBankPanel, mountBankPanel } from './pyq-analysis.js';
import { insightsSkeleton } from '../skeletons.js';

/**
 * `panel` is the tab the reader is on. A navigation opens the panel its route
 * names; an in-place refresh (a filter or chip inside a panel) keeps the one
 * they chose. Without this, every refresh from inside the bank panel — picking
 * a subject chip, searching topics — re-rendered the section on the
 * performance tab and hid what the reader had just changed.
 */
const viewState = { subject: 'all', panel: null, showAllFrequency: false, showAllPriorities: false };

/** Which panel the section opens on. */
const PANELS = { performance: 'insights-performance', bank: 'insights-bank', priorities: 'insights-priorities' };

/** The panel a route opens on: the bank panel's old address opens the bank panel. */
const routePanel = (ctx) => (ctx?.route === 'pyq-analysis' ? PANELS.bank : PANELS.performance);

/** The panel to show for this render (see `viewState.panel`). */
function activePanel(ctx) {
  if (!ctx?.isRefresh || !viewState.panel) viewState.panel = routePanel(ctx);
  return viewState.panel;
}

/** A verdict as a word, not a badge: the word is the meaning. */
function verdictBadge(row) {
  const cls = row.verdict === 'strong' ? 'verdict-strong' : row.verdict === 'weak' ? 'verdict-weak' : 'verdict-thin';
  return `<span class="${cls}">${esc(row.verdict)}</span>`;
}

function accuracyText(value, sample) {
  if (!Number.isFinite(value)) return '<span class="soft">—</span>';
  const text = fmtPct(value);
  // Sample size in plain words beside the figure; no meter widget in tables.
  if (sample < MIN_SAMPLE_HINT) return `${text} <span class="tiny soft">(${sample} judged — small sample)</span>`;
  return `${text} <span class="tiny soft">(${sample} judged)</span>`;
}

/**
 * The performance panel. No <h1>: the section shell owns the page heading.
 */
async function renderPerformancePanel(loaded = null) {
    const { metas, analytics } = loaded || (await loadAnalytics());

    if (!metas.length) {
      return `
        ${sheet({
          label: 'Analytics needs data',
          body: emptyState({
            title: 'No questions stored yet',
            message: 'Import a question bank and record some attempts; this screen reports only measured data.',
            action: '<a class="btn btn-primary" href="#/bank">Question Bank &amp; Imports</a>',
          }),
        })}`;
    }

    // Same roll-up the dashboard quotes, so a topic the reader has marked is
    // weighed identically on both screens. This is curriculum status, not bank
    // counting: the panel still reports only what the attempts measured.
    const curriculum = await loadSyllabusWorkspace();
    const priorities = studyPriorities({ analytics, syllabusProgress: curriculum.progress, limit: viewState.priorityLimit });
    const counts = analytics.counts;

    // A subject row opens the builder already filtered to that subject: the
    // reader's next move after reading a figure is to practise it.
    const subjectRows = analytics.bySubject.map((row) => [
      `<a href="${esc(topicPracticeHref(row.subject))}"><strong>${esc(row.subject)}</strong></a>`,
      String(row.available),
      fmtPct(row.coverage),
      accuracyText(row.firstAttemptAccuracy, row.firstAttemptScored),
    ]);

    const subjectFilter = viewState.subject;
    const topicRows = analytics.byTopic
      .filter((row) => subjectFilter === 'all' || row.subject === subjectFilter)
      .sort((a, b) => (b.available - a.available) || (a.topic < b.topic ? -1 : 1))
      .map((row) => [
        `<a href="${esc(topicPracticeHref(row.subject, row.topic))}"><strong>${esc(row.topic)}</strong></a><div class="tiny muted">${esc(row.subject)}</div>`,
        String(row.available),
        fmtPct(row.coverage),
        accuracyText(row.firstAttemptAccuracy, row.firstAttemptScored),
        verdictBadge(row),
      ]);

    const subjects = analytics.bySubject.map((r) => r.subject).sort();

    const confidenceRows = Object.entries(analytics.confidence.matrix)
      .filter(([, m]) => m.total > 0)
      .map(([key, m]) => [
        esc({ confident: 'Confident', unsure: 'Unsure', guessed: 'Guessed', none: 'Not marked' }[key] || key),
        String(m.correct),
        String(m.incorrect),
        String(m.unanswered),
        `${String(m.total)}`,
        m.correct + m.incorrect ? fmtPct(m.correct / (m.correct + m.incorrect)) : '<span class="soft">—</span>',
      ]);

    const slowestRows = analytics.time.slowest.map((row) => [
      `<span class="mono tiny">${esc(row.question_id)}</span>`,
      esc(row.subject || '—'),
      esc(row.topic || '—'),
      `${esc(String(row.seconds))}s`,
      esc(row.outcome),
    ]);

    const freqTopicRows = analytics.frequency.byTopic.slice(0, 20).map((row) => [
      `<strong>${esc(row.topic)}</strong><div class="tiny muted">${esc(row.subject)}</div>`,
      String(row.count),
      fmtPct(row.share),
      Object.entries(row.byYear).filter(([y]) => y !== 'unknown').map(([y, c]) => `${y}:${c}`).join(', ') || '<span class="soft">year unknown</span>',
    ]);

    const testRows = analytics.tests
      .slice()
      .reverse()
      .slice(0, 25)
      .map((t) => [
        `<a href="#/report/${esc(t.test_id)}">${esc(t.kind || 'test')}</a><div class="tiny muted">${esc(fmtDate(t.at))}</div>`,
        String(t.attempts),
        `${t.correct}/${t.correct + t.incorrect + t.unanswered}`,
        t.accuracy === null ? '<span class="soft">—</span>' : fmtPct(t.accuracy),
        `${esc(String(Math.round(t.marks * 100) / 100))}`,
        fmtDuration(Math.round(t.timeMs / 1000)),
      ]);

    const neverAttempted = analytics.neverAttemptedTopics.slice(0, 12);
    const insufficient = analytics.insufficient.slice(0, 12);
    const underPractised = analytics.underPractised.slice(0, 12);

    // Merge the three verdict lists into one table: a reader comparing "weak",
    // "strong" and "too thin" was scrolling between three cards that answer the
    // same question. One row per topic, one verdict column, sample size beside it.
    const verdictRows = [
      ...analytics.weakTopics.map((r) => ({ ...r, kind: 'weak' })),
      ...analytics.strongTopics.map((r) => ({ ...r, kind: 'strong' })),
      ...insufficient.map((r) => ({ ...r, kind: 'thin' })),
    ]
      .sort((a, b) => (b.kind === 'weak') - (a.kind === 'weak') || (b.scored || 0) - (a.scored || 0))
      .slice(0, 10);

    // Coverage gaps: a topic you have never attempted and a topic you have
    // barely touched are the same next action (practise it), so they share a row.
    const coverageRows = [
      ...neverAttempted.map((r) => ({ ...r, reason: 'never attempted' })),
      ...underPractised.map((r) => ({ ...r, reason: `${fmtPct(r.coverage)} covered` })),
    ].slice(0, 10);

    // One list, four reasons: weak, strong, thin evidence, never attempted or
    // barely touched. They were four tables answering the same question.
    const nextRows = [
      ...verdictRows.map((r) => ({
        subject: r.subject,
        topic: r.topic,
        accuracy: r.accuracy,
        reason: r.kind === 'weak' ? 'weak — needs work' : r.kind === 'strong' ? 'holding up' : `${r.scored || 0} judged — thin evidence`,
      })),
      ...coverageRows.map((r) => ({ ...r, reason: r.reason === 'never attempted' ? 'never attempted' : `only ${r.reason}` })),
    ].slice(0, 12);

    const dueNow = analytics.revision.dueToday + analytics.revision.overdue;

    return `
      ${sheet({
        label: 'Your own attempts',
        action: infoToggle('How to read these figures', `<p class="small m-0">Question counts here describe your own imported bank, not the examination. A topic with 3 stored questions cannot support a strong conclusion, so every figure below shows its sample size, and rows with fewer than ${MIN_SAMPLE_HINT} scored answers are marked “small sample”. A “weak topic” verdict needs at least ${MIN_SAMPLE_STRONG}. Nothing is estimated or projected.</p>`),
        body: `<p class="facts-line">
          <span><b>${analytics.accuracy.firstAttemptSample ? fmtPct(analytics.accuracy.firstAttempt) : '—'}</b> First-attempt accuracy${analytics.accuracy.firstAttemptSample ? ` <small>on ${analytics.accuracy.firstAttemptSample} first attempts</small>` : ''}</span>
          <span><b>${counts.correct + counts.incorrect ? fmtPct(analytics.accuracy.all) : '—'}</b> accuracy, all attempts <small>${counts.correct} correct, ${counts.incorrect} wrong</small></span>
          <span><b>${counts.totalAttempts ? fmtPct(analytics.accuracy.answerRate) : '—'}</b> answer rate <small>${counts.unanswered} left unanswered</small></span>
        </p>`,
        footer: '<p class="tiny text-soft m-0">All figures come from attempts stored on this device. Nothing is estimated, extrapolated or projected.</p>',
      })}

      ${sheet({
        label: 'Where to look next',
        action: '<a class="quiet-action" href="#/topic">Build a session</a>',
        body: nextRows.length
          ? barRows(
              nextRows.map((r) => ({
                name: `<a href="${esc(topicPracticeHref(r.subject, r.topic))}">${esc(r.topic)}</a><small>${esc(r.subject)} <span aria-hidden="true">/</span> ${esc(r.reason)}</small>`,
                value: r.accuracy === null || r.accuracy === undefined ? 0 : r.accuracy,
                valueLabel: r.accuracy === null || r.accuracy === undefined ? '—' : fmtPct(r.accuracy),
                action: `<a class="quiet-action" href="${esc(topicPracticeHref(r.subject, r.topic))}">Practise</a>`,
              })),
            )
          : '<p class="quiet-note m-0">No topic has enough judged answers for a verdict yet. A weak or strong verdict needs at least five scored answers.</p>',
        footer: `<p class="tiny text-soft m-0">A verdict needs at least ${MIN_SAMPLE_STRONG} scored answers, and fewer than ${MIN_SAMPLE_HINT} judged answers is shown as a small sample. A study aid built from your own attempts and the questions you happen to have imported — not a prediction of examination content.</p>`,
      })}

      ${sheet({
        label: 'By subject',
        body: dataTable({
          columns: [{ label: 'Subject' }, { label: 'Available', num: true }, { label: 'Coverage', num: true }, { label: 'First-attempt accuracy', num: true }],
          rows: subjectRows,
          empty: 'No subjects yet.',
          className: 'compact cards-mobile',
        }),
      })}

      ${sheet({
        label: 'By topic',
        count: `${topicRows.length} topic${topicRows.length === 1 ? '' : 's'}`,
        action: `<label class="field field-inline m-0"><span class="label-text">Subject</span>
          <select id="anaSubject"><option value="all">All subjects</option>${subjects.map((s) => `<option value="${esc(s)}" ${viewState.subject === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>`,
        body: dataTable({
          columns: [{ label: 'Topic' }, { label: 'Available', num: true }, { label: 'Coverage', num: true }, { label: 'First-attempt accuracy', num: true }, { label: 'Verdict' }],
          rows: topicRows,
          empty: 'No topics match this filter.',
          className: 'compact cards-mobile',
        }),
      })}

      ${sheet({
        label: 'How you answer',
        body: `
          ${
            analytics.confidence.enabled
              ? `${dataTable({
                  columns: [{ label: 'Marked as' }, { label: 'Correct', num: true }, { label: 'Incorrect', num: true }, { label: 'Unanswered', num: true }, { label: 'Total', num: true }, { label: 'Accuracy', num: true }],
                  rows: confidenceRows,
                  empty: 'No confidence data yet.',
                  className: 'compact cards-mobile',
                })}
                 <p class="quiet-note m-0"><strong>${analytics.confidence.overconfidence}</strong> confident but wrong, <strong>${analytics.confidence.underconfidence}</strong> correct but unsure or guessed. ${esc(analytics.confidence.note)}</p>`
              : `<p class="small muted">Mark confidence on any question, in any session, to compare how sure you felt with how you did. Correct-but-guessed answers are scheduled for earlier revision.</p>`
          }
          <p class="facts-line mt-3">
            <span><b>${analytics.time.avgSecPerQuestion === null ? '—' : `${analytics.time.avgSecPerQuestion}s`}</b> average per question</span>
            <span><b>${analytics.time.medianSecPerQuestion === null ? '—' : `${analytics.time.medianSecPerQuestion}s`}</b> median</span>
            <span><b>${analytics.time.avgSecPerCorrect === null ? '—' : `${analytics.time.avgSecPerCorrect}s`}</b> per correct answer</span>
          </p>
          <details class="disclosure mt-2"><summary>Slowest recorded answers (${slowestRows.length})</summary>
            ${dataTable({ columns: [{ label: 'Question' }, { label: 'Subject' }, { label: 'Topic' }, { label: 'Time', num: true }, { label: 'Outcome' }], rows: slowestRows, empty: 'No timings recorded.', className: 'compact' })}
          </details>`,
      })}

      ${sheet({
        label: 'Mistakes and revision in hand',
        body: `
          <ul class="handover">
            <li>
              <a href="#/mistakes"><strong>Mistake Book</strong></a>
              <span>${analytics.mistakes.open} open · ${analytics.mistakes.repeated} repeated · ${counts.unanswered} skipped · ${counts.flagged} flagged</span>
            </li>
            <li>
              <a href="#/revision"><strong>Revision Centre</strong></a>
              <span>${dueNow} due now · ${analytics.revision.upcoming} upcoming · ${analytics.revision.tracked} tracked</span>
            </li>
          </ul>
          <p class="quiet-note m-0">${
            analytics.revision.effectiveness.withHistory
              ? `On repeat attempts, revision improved ${analytics.revision.effectiveness.improved} and set back ${analytics.revision.effectiveness.worsened} of ${analytics.revision.effectiveness.withHistory} question(s). The Mistake Book holds the ones still open.`
              : 'Not enough repeated attempts yet to compare a first answer with the latest one.'
          }</p>`,
      })}`;
}

/**
 * The priorities panel: what the bank contains (frequency) and what that
 * suggests studying next. Both lists are capped at ten rows with "Show all";
 * the frequency note and the priorities caveat sit in the cards' footers, so
 * neither table is followed by a wall of explanation.
 */
async function renderPrioritiesPanel(loaded = null) {
  const { analytics } = loaded || (await loadAnalytics());
  const freqAll = analytics.frequency.byTopic;
  const freqShown = viewState.showAllFrequency ? freqAll : freqAll.slice(0, 10);
  const priorityAll = studyPriorities({ analytics, syllabusProgress: (await loadSyllabusWorkspace()).progress, limit: 500 });
  const priorityShown = viewState.showAllPriorities ? priorityAll : priorityAll.slice(0, 10);

  return `
    ${sheet({
      label: 'Topic frequency in your bank',
      count: `${freqAll.length} topic${freqAll.length === 1 ? '' : 's'}`,
      body: `
        ${dataTable({
          columns: [{ label: 'Topic' }, { label: 'Questions', num: true }, { label: 'Share of bank', num: true }, { label: 'By year' }],
          rows: freqShown.map((row) => [
            `<strong>${esc(row.topic)}</strong><div class="tiny muted">${esc(row.subject)}</div>`,
            String(row.count),
            fmtPct(row.share),
            Object.entries(row.byYear).filter(([y]) => y !== 'unknown').map(([y, c]) => `${y}:${c}`).join(', ') || '<span class="soft">year unknown</span>',
          ]),
          empty: 'No classified topics yet.',
          className: 'compact cards-mobile',
        })}
        ${showAll({ action: 'show-all-frequency', hidden: freqAll.length - freqShown.length, label: 'Show all topics' })}`,
      footer: `<p class="tiny text-soft m-0">${esc(analytics.frequency.disclaimer)} Topics tagged “unclassified” are excluded; ${analytics.frequency.byTopic.filter((r) => r.unclassified).length} group(s) are currently unclassified.</p>`,
    })}

    ${sheet({
      label: 'Study priorities',
      count: `${priorityAll.length} ranked`,
      body: `
        ${dataTable({
          columns: [{ label: 'Topic' }, { label: 'Score', num: true }, { label: 'Available', num: true }, { label: 'Accuracy', num: true }, { label: 'Why' }],
          rows: priorityShown.map((p) => [
            `<strong>${esc(p.topic)}</strong><div class="tiny muted">${esc(p.subject)}</div>`,
            String(p.priorityScore),
            String(p.available),
            p.scored ? `${fmtPct(p.accuracy)} <span class="tiny soft">(${p.scored} judged)</span>` : '<span class="soft">no data</span>',
            `<span class="tiny">${p.reasons.slice(0, 3).map((r) => esc(r)).join('<br />')}</span>`,
          ]),
          empty: 'No priorities yet.',
          className: 'compact cards-mobile',
        })}
        ${showAll({ action: 'show-all-priorities', hidden: priorityAll.length - priorityShown.length, label: 'Show all priorities' })}`,
      footer: '<p class="tiny text-soft m-0">A study aid based on your own recorded evidence and the questions you happen to have imported — not a prediction of examination content or of your result.</p>',
    })}`;
}

/** Wire the performance panel's own controls. */
function mountPerformancePanel(ctx) {
    document.getElementById('anaSubject')?.addEventListener('change', async (ev) => {
      viewState.subject = ev.target.value;
      await ctx.refresh();
    });

    const exportAnalytics = async () => {
      const { analytics, metas, attempts } = await loadAnalytics();
      downloadJson(
        {
          format: 'mymppsc-analytics',
          format_version: '1.0.0',
          generated_at: new Date().toISOString(),
          note: 'Computed on this device from stored attempts. Question frequency describes the imported bank only and is not a prediction of any examination.',
          definitions: {
            availableQuestions: 'Unique questions stored locally.',
            attemptedUnique: 'Unique questions with at least one recorded attempt.',
            totalAttempts: 'Every recorded attempt, repeats included.',
            firstAttemptAccuracy: 'Correct share of scored first attempts only.',
          },
          analytics,
          bank_snapshot: { questions: metas.length, attempts: attempts.length },
        },
        `mymppsc-analytics-${todayKey()}.json`,
      );
      toast('Analytics report downloaded.', 'ok');
    };
    document.getElementById('anaExport')?.addEventListener('click', exportAnalytics);
    document.getElementById('anaExportHead')?.addEventListener('click', exportAnalytics);
}

/* ------------------------------------------------------------------ shell -- */

export default {
  title: 'Insights',
  eyebrow: 'Your evidence, not a prediction',

  /** Placeholder in the shape of the panel that is about to open (router.js). */
  skeleton(ctx) {
    const panel = ctx?.isRefresh && viewState.panel ? viewState.panel : routePanel(ctx);
    return insightsSkeleton({ panel: panel === PANELS.bank ? 'bank' : 'performance' });
  },

  async render(ctx) {
    // `#/pyq-analysis` and `#/pyq-analysis/<Subject>` were the bank panel's own
    // route before the merge, so arriving by them opens that panel.
    const panel = activePanel(ctx);
    const loaded = await loadAnalytics();
    const [performance, bank, priorities] = await Promise.all([renderPerformancePanel(loaded), renderBankPanel(ctx), renderPrioritiesPanel(loaded)]);
    const counts = loaded.analytics.counts;

    // The three numbers the two tabs are most often confused for one another.
    // They belong to the section, not to either tab, so they are stated once
    // here and neither panel repeats them.
    // The three numbers that are easily confused, stated once as a sentence of
    // facts rather than three tiles. Nothing repeats them in either panel.
    const strip = loaded.metas.length
      ? `<p class="facts-line" role="group" aria-label="Key figures">
          <span><b>${counts.availableQuestions}</b> Questions available <small>stored on this device</small></span>
          <span><b>${counts.attemptedUnique}</b> Unique questions attempted <small>${fmtPct(counts.coverage)} of the bank</small></span>
          <span><b>${counts.totalAttempts}</b> Total attempts <small>${counts.repeatAttempts} beyond the first</small></span>
        </p>`
      : '';

    return `
      ${screenHead({
        title: 'Insights',
        eyebrow: 'Your evidence, not a prediction',
        purpose: 'What you have done, with what the papers you imported contain — counted from different data, never mixed.',
        primary: '<a class="btn btn-primary" href="#/topic">Practise a weak topic</a>',
        secondary: '<button class="btn btn-sm" type="button" id="anaExportHead">Export these figures</button>',
      })}
      ${strip}
      ${tabs({
        activeId: panel,
        items: [
          { id: PANELS.performance, label: 'My performance', body: performance },
          { id: PANELS.bank, label: 'The question bank', body: bank },
          { id: PANELS.priorities, label: 'Priorities', body: priorities },
        ],
      })}`;
  },

  async mount(ctx, root) {
    const container = root || document.getElementById('view');
    mountTabs(container, (id) => {
      if (id === PANELS.performance || id === PANELS.bank || id === PANELS.priorities) viewState.panel = id;
    });
    mountPerformancePanel(ctx);
    mountBankPanel(ctx, container);
    container.querySelectorAll('[data-action="show-all-frequency"], [data-action="show-all-priorities"]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (button.dataset.action === 'show-all-frequency') viewState.showAllFrequency = !viewState.showAllFrequency;
        else viewState.showAllPriorities = !viewState.showAllPriorities;
        await ctx.refresh();
      });
    });
  },
};
