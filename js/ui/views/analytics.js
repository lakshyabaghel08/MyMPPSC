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
  badge,
  card,
  tile,
  notice,
  dataTable,
  emptyState,
  progressBar,
  toast,
  evidenceMeter,
  infoToggle,
  tabs,
  mountTabs,
  screenHead,
  countChip,
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

function verdictBadge(row) {
  const tone = row.verdict === 'strong' ? 'ok' : row.verdict === 'weak' ? 'bad' : row.verdict === 'developing' ? 'warn' : 'info';
  return badge(row.verdict, tone);
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
        ${card({
          title: 'Analytics needs data',
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

    const subjectRows = analytics.bySubject.map((row) => [
      `<strong>${esc(row.subject)}</strong>`,
      String(row.available),
      String(row.attemptedUnique),
      fmtPct(row.coverage),
      accuracyText(row.accuracy, row.scored),
      accuracyText(row.firstAttemptAccuracy, row.firstAttemptScored),
      verdictBadge(row),
    ]);

    const subjectFilter = viewState.subject;
    const topicRows = analytics.byTopic
      .filter((row) => subjectFilter === 'all' || row.subject === subjectFilter)
      .sort((a, b) => (b.available - a.available) || (a.topic < b.topic ? -1 : 1))
      .map((row) => [
        `<strong>${esc(row.topic)}</strong><div class="tiny muted">${esc(row.subject)}</div>`,
        String(row.available),
        `${String(row.attemptedUnique)} <div class="tiny muted">${fmtPct(row.coverage)} covered</div>`,
        accuracyText(row.accuracy, row.scored),
        accuracyText(row.firstAttemptAccuracy, row.firstAttemptScored),
        row.avgTimeSec === null ? '<span class="soft">—</span>' : `${esc(String(row.avgTimeSec))}s`,
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

    return `
      <p class="muted">All figures come from attempts stored on this device. Nothing is estimated, extrapolated or projected.</p>

      <div class="grid tiles mb-3">
        ${tile({ label: 'First-attempt accuracy', value: analytics.accuracy.firstAttemptSample ? fmtPct(analytics.accuracy.firstAttempt) : '—', sub: analytics.accuracy.firstAttemptSample ? `on ${analytics.accuracy.firstAttemptSample} first attempts` : 'no first attempts yet', source: analytics.accuracy.firstAttemptSample ? 'measured' : 'unavailable', where: 'First scored attempt per unique question' })}
        ${tile({ label: 'Accuracy (all attempts)', value: counts.correct + counts.incorrect ? fmtPct(analytics.accuracy.all) : '—', sub: `${counts.correct} correct · ${counts.incorrect} incorrect`, source: counts.correct + counts.incorrect ? 'measured' : 'unavailable', where: 'All judged attempts including repeats' })}
        ${tile({ label: 'Answer rate', value: counts.totalAttempts ? fmtPct(analytics.accuracy.answerRate) : '—', sub: `${counts.unanswered} left unanswered · ${counts.unscored} unscored`, source: counts.totalAttempts ? 'measured' : 'unavailable', where: 'Answered share of total attempts' })}
      </div>

      ${infoToggle('How to read these figures', `<p class="small m-0">Question counts here describe your own imported bank, not the examination. A topic with 3 stored questions cannot support a strong conclusion, so figures below show their sample size, and rows with fewer than ${MIN_SAMPLE_HINT} scored answers are labelled “insufficient evidence”. A “weak topic” verdict needs at least ${MIN_SAMPLE_STRONG}.</p>`)}

      ${card({
        title: 'Subjects',
        body: dataTable({
          columns: [{ label: 'Subject' }, { label: 'Available', num: true }, { label: 'Attempted', num: true }, { label: 'Coverage', num: true }, { label: 'Accuracy (all)', num: true }, { label: 'First-attempt accuracy', num: true }, { label: 'Verdict' }],
          rows: subjectRows,
          empty: 'No subjects yet.',
          className: 'compact cards-mobile',
        }),
      })}

      ${card({
        title: 'Topics',
        count: countChip(`${topicRows.length} topic${topicRows.length === 1 ? '' : 's'}`),
        actions: `<label class="field field-inline m-0"><span class="label-text">Subject</span>
          <select id="anaSubject"><option value="all">All subjects</option>${subjects.map((s) => `<option value="${esc(s)}" ${viewState.subject === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>`,
        body: dataTable({
          columns: [{ label: 'Topic' }, { label: 'Available', num: true }, { label: 'Attempted', num: true }, { label: 'Accuracy (all)', num: true }, { label: 'First-attempt', num: true }, { label: 'Avg time', num: true }, { label: 'Verdict' }],
          rows: topicRows,
          empty: 'No topics match this filter.',
          className: 'compact cards-mobile',
        }),
      })}

      ${card({
        title: 'Where the evidence points',
        subtitle: 'Weak, strong and too thin to judge — the three verdicts side by side',
        body: verdictRows.length
          ? dataTable({
              columns: [{ label: 'Topic' }, { label: 'Verdict' }, { label: 'Accuracy', num: true }, { label: 'Scored', num: true }, { label: 'Coverage', num: true }],
              rows: verdictRows.map((r) => [
                `<strong>${esc(r.topic)}</strong><div class="tiny muted">${esc(r.subject)}</div>`,
                badge(r.kind === 'weak' ? 'weak' : r.kind === 'strong' ? 'strong' : 'too thin', r.kind === 'weak' ? 'bad' : r.kind === 'strong' ? 'ok' : 'warn'),
                r.accuracy === null || r.accuracy === undefined ? '<span class="soft">—</span>' : fmtPct(r.accuracy),
                String(r.scored || 0),
                fmtPct(r.coverage),
              ]),
              className: 'compact cards-mobile',
            })
          : '<p class="muted small">No topic has enough judged answers for a verdict yet. A weak or strong verdict needs at least five scored answers.</p>',
        footer: `A verdict needs at least ${MIN_SAMPLE_STRONG} scored answers; fewer than ${MIN_SAMPLE_HINT} is shown as a small sample. Nothing here is a prediction.`,
      })}

      ${card({
        title: 'Coverage gaps',
        subtitle: 'Topics you have never attempted, or touched only lightly',
        body: coverageRows.length
          ? dataTable({
              columns: [{ label: 'Topic' }, { label: 'Available', num: true }, { label: 'Covered', num: true }, { label: 'Why it is here' }, { label: '' }],
              rows: coverageRows.map((r) => [
                `<strong>${esc(r.topic)}</strong><div class="tiny muted">${esc(r.subject)}</div>`,
                String(r.available),
                fmtPct(r.coverage),
                esc(r.reason),
                `<a class="btn btn-sm" href="${esc(topicPracticeHref(r.subject, r.topic))}">Practise</a>`,
              ]),
              className: 'compact cards-mobile',
            })
          : '<p class="muted small">Every topic with stored questions has been attempted at more than 30% coverage.</p>',
      })}

      <div class="split-2">
        ${card({
          title: 'Confidence analysis',
          subtitle: analytics.confidence.enabled ? 'Confidence you marked, shown separately from correctness' : 'Confidence marking is optional',
          body: analytics.confidence.enabled
            ? `${dataTable({
                columns: [{ label: 'Marked as' }, { label: 'Correct', num: true }, { label: 'Incorrect', num: true }, { label: 'Unanswered', num: true }, { label: 'Total', num: true }, { label: 'Accuracy', num: true }],
                rows: confidenceRows,
                empty: 'No confidence data yet.',
                className: 'compact cards-mobile',
              })}
               <div class="row mt-2">
                 ${badge(`${analytics.confidence.overconfidence} confident but wrong`, analytics.confidence.overconfidence ? 'bad' : '')}
                 ${badge(`${analytics.confidence.underconfidence} correct but unsure/guessed`, 'warn')}
               </div>
               <p class="tiny muted">${esc(analytics.confidence.note)}</p>`
            : `<p class="small muted">Mark confidence on any question, in any session, to compare how sure you felt with how you did. Correct-but-guessed answers are scheduled for earlier revision.</p>`,
        })}

        ${card({
          title: 'Time per question',
          body: `
            ${dataTable({
              columns: [{ label: 'Measure' }, { label: 'Value' }],
              rows: [
                ['Average per question', analytics.time.avgSecPerQuestion === null ? '—' : `${analytics.time.avgSecPerQuestion}s`],
                ['Median per question', analytics.time.medianSecPerQuestion === null ? '—' : `${analytics.time.medianSecPerQuestion}s`],
                ['Average per correct answer', analytics.time.avgSecPerCorrect === null ? '—' : `${analytics.time.avgSecPerCorrect}s`],
              ],
              className: 'compact',
            })}
            <h3 class="mt-3">Slowest answers</h3>
            ${dataTable({ columns: [{ label: 'Question' }, { label: 'Subject' }, { label: 'Topic' }, { label: 'Time', num: true }, { label: 'Outcome' }], rows: slowestRows, empty: 'No timings recorded.', className: 'compact' })}`,
        })}
      </div>

      <div class="split-2">
        ${card({
          title: 'Mistakes',
          count: countChip(`${analytics.mistakes.open} open`),
          body: `
            <div class="grid tiles">
              ${tile({ label: 'Open entries', value: String(analytics.mistakes.open), sub: `${analytics.mistakes.repeated} repeated`, source: 'measured' })}
              ${tile({ label: 'Incorrect', value: String(counts.incorrect), sub: 'wrong answers recorded', source: 'measured' })}
              ${tile({ label: 'Skipped', value: String(counts.unanswered), sub: 'left unanswered', source: 'measured' })}
              ${tile({ label: 'Flagged for review', value: String(counts.flagged), sub: 'marked during tests', source: 'measured' })}
            </div>
            ${analytics.mistakes.top.length
              ? `<h3 class="mt-3">Most repeated</h3>
                 ${dataTable({
                   columns: [{ label: 'Question' }, { label: 'Type' }, { label: 'Times', num: true }, { label: 'Last seen' }],
                   rows: analytics.mistakes.top.slice(0, 8).map((m) => [
                     `<span class="mono tiny">${esc(m.question_id)}</span><div class="tiny muted">${esc(m.subject || '—')} · ${esc(m.topic || '—')}</div>`,
                     esc(m.type),
                     String(m.occurrences),
                     esc(fmtDate(m.last_seen_at)),
                   ]),
                   className: 'compact',
                 })}`
              : '<p class="muted small">No open mistake entries.</p>'}
            <div class="row mt-2"><a class="btn btn-sm" href="#/mistakes">Open the Mistake Book</a></div>`,
        })}

        ${card({
          title: 'Revision',
          count: countChip(`${analytics.revision.dueToday + analytics.revision.overdue} due`),
          body: `
            <div class="grid tiles">
              ${tile({ label: 'Tracked', value: String(analytics.revision.tracked), sub: 'questions with a schedule', source: 'measured' })}
              ${tile({ label: 'Due today', value: String(analytics.revision.dueToday), tone: analytics.revision.dueToday ? 'warn' : '', source: 'derived' })}
              ${tile({ label: 'Overdue', value: String(analytics.revision.overdue), tone: analytics.revision.overdue ? 'bad' : 'ok', source: 'derived' })}
              ${tile({ label: 'Upcoming', value: String(analytics.revision.upcoming), source: 'derived' })}
            </div>
            ${
              analytics.revision.effectiveness.withHistory
                ? `<h3 class="mt-3">Change between first and latest scored attempt</h3>
                   ${progressBar(analytics.revision.effectiveness.improved / analytics.revision.effectiveness.withHistory, 'ok')}
                   <p class="small mt-2">${analytics.revision.effectiveness.improved} improved · ${analytics.revision.effectiveness.worsened} declined · ${analytics.revision.effectiveness.unchanged} unchanged, across ${analytics.revision.effectiveness.withHistory} question(s).</p>`
                : '<p class="muted small">Not enough repeated attempts yet to compare first and latest answers.</p>'
            }
            <div class="row mt-2"><a class="btn btn-sm" href="#/revision">Revision Centre</a></div>`,
        })}
      </div>`;
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
    ${card({
      title: 'Topic frequency in your bank',
      count: countChip(`${freqAll.length} topic${freqAll.length === 1 ? '' : 's'}`),
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
      footer: `${esc(analytics.frequency.disclaimer)} Topics tagged “unclassified” are excluded; ${analytics.frequency.byTopic.filter((r) => r.unclassified).length} group(s) are currently unclassified.`,
    })}

    ${card({
      title: 'Study priorities',
      count: countChip(`${priorityAll.length} ranked`),
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
      footer: 'A study aid based on your own recorded evidence and the questions you happen to have imported — not a prediction of examination content or of your result.',
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
    const strip = loaded.metas.length
      ? `<div class="grid tiles mb-2">
          ${tile({ label: 'Questions available', value: String(counts.availableQuestions), sub: 'unique questions stored on this device', source: 'supplied', where: 'Stored in local IndexedDB bank' })}
          ${tile({ label: 'Unique questions attempted', value: String(counts.attemptedUnique), sub: `${fmtPct(counts.coverage)} of the bank — repeats do not increase this`, source: 'measured', where: 'Unique question IDs with ≥1 attempt' })}
          ${tile({ label: 'Total attempts', value: String(counts.totalAttempts), sub: `${counts.repeatAttempts} attempt(s) beyond the first on a question`, source: 'measured', where: 'Every recorded attempt in local store' })}
        </div>
        ${infoToggle('Available, attempted and attempts — what differs', '<p class="small m-0">Three different numbers: what is <em>available</em> to answer, what you have <em>attempted</em> at least once, and how many <em>attempts</em> you have made. The tabs below never mix them — one reports your attempts, the other counts the stored papers.</p>')}`
      : '';

    return `
      ${screenHead({
        title: 'Insights',
        purpose: 'Two readings of the same preparation: what you have done, and what the papers stored on this device actually contain. They are counted from different data and are never mixed.',
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
