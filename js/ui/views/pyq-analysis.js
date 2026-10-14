/**
 * pyq-analysis.js — the question-bank panel of the Insights section.
 *
 * This was the standalone "PYQ Analysis" screen. Insights now holds two
 * panels — what you did, and what the bank contains — so this module exports
 * the second one and keeps a view for the legacy `#/pyq-analysis` route.
 *
 * Counts the previous-year questions stored on this device by subject and by topic, and shows what
 * each stored paper contributed to each group. Every number here is arithmetic over the imported
 * bank: it says what these papers contain, not what a future paper will.
 *
 * Layout, top to bottom, sized for a full bank (1,200 questions, 12 papers):
 *  1. four summary tiles — questions, subjects, topics, answer keys;
 *  2. "Questions per subject": one bar chart, with the year-by-year matrix behind ⓘ;
 *  3. "Questions per topic": subject chips, a bar chart of that subject's topics and a short
 *     table (count, share, how many papers hold it, practice link), with its year-by-year
 *     matrix behind ⓘ;
 *  4. one ⓘ "About these counts" for everything else.
 * The wide per-year tables used to sit open on the page (17 columns each); they are now one tap
 * away. No provenance chips, no per-paper complete/incomplete labels, no banners.
 *
 * Every count is the Question Bank screen's own: groups use the same keys as its filters
 * (`subject || 'Unclassified'`, `topic || 'Unclassified'`), so filtering that screen by a subject
 * or topic lists exactly the questions counted here.
 *
 * Granularity stops at the topic level on purpose — finer labels come from the import, not from the
 * printed paper — and nothing on this screen describes how the bank was produced.
 */

import { state } from '../../core/state.js';
import { summariseBank, UNCLASSIFIED_SUBJECT } from '../../services/pyq-analysis.js';
import { esc, badge, card, tile, dataTable, barChart, emptyState, infoToggle, pct, fmtPct, icon } from '../components.js';
import { insightsSkeleton } from '../skeletons.js';

/** Topics charted before "Show all". Every subject in the bundled bank has fewer. */
export const TOPIC_LIMIT = 15;

const viewState = {
  appliedRoute: '',
  subject: 'all',
  sort: 'count', // 'count' | 'syllabus'
  search: '',
  showAllTopics: false,
};

/** Count shading in four buckets, so the eye finds the heavy years without a legend. */
function heat(value, max) {
  if (!value) return 'heat heat-none';
  const ratio = value / Math.max(1, max);
  if (ratio >= 0.66) return 'heat heat-3';
  if (ratio >= 0.33) return 'heat heat-2';
  return 'heat heat-1';
}

const cell = (value, max) => `<span class="${heat(value, max)}">${String(value || 0)}</span>`;

const perYear = (row, years) => {
  const max = Math.max(1, ...years.map((y) => row.byYear[y] || 0));
  return years.map((y) => cell(row.byYear[y] || 0, max));
};

function sortSubjects(subjects, mode = 'count') {
  const list = subjects.slice();
  if (mode === 'syllabus') return list;
  return list.sort((a, b) => {
    const aUnplaced = a.subject === UNCLASSIFIED_SUBJECT ? 1 : 0;
    const bUnplaced = b.subject === UNCLASSIFIED_SUBJECT ? 1 : 0;
    if (aUnplaced !== bUnplaced) return aUnplaced - bUnplaced;
    return b.questions - a.questions || String(a.subject).localeCompare(String(b.subject));
  });
}

const practiseHref = (subject, topic = null) => `#/topic/${encodeURIComponent(topic ? `${subject}||${topic}` : subject)}`;
const practiseLink = (subject, topic = null) => `<a class="btn btn-sm pyq-practice-btn" href="${practiseHref(subject, topic)}">Practise</a>`;
const subjectTag = (subject) => `<span class="pyq-subject-tag ${subject === UNCLASSIFIED_SUBJECT ? 'warn' : ''}">${esc(subject)}</span>`;

const HEAT_LEGEND = `<div class="pyq-heat-legend" aria-hidden="true">
    <span class="tiny muted">Shading, relative to each row:</span>
    <span class="heat heat-none">0</span><span class="heat heat-1">Low</span><span class="heat heat-2">Mid</span><span class="heat heat-3">Peak</span>
  </div>`;

/** Rows × stored years, a total column and (optionally) a practice link; shaded per row. */
function yearMatrix({ rows, years, labelHeader, label, footer = null, practise = null, className = '' }) {
  return dataTable({
    columns: [
      { label: labelHeader },
      ...years.map((y) => ({ label: y, num: true })),
      { label: 'Total', num: true, className: 'total-col' },
      ...(practise ? [{ label: 'Practice' }] : []),
    ],
    rows: rows.map((row) => [label(row), ...perYear(row, years), `<strong>${String(row.questions)}</strong>`, ...(practise ? [practise(row)] : [])]),
    footer,
    className: `pyq-matrix ${className}`.trim(),
  });
}

/**
 * The panel body. It renders no <h1>: the Insights shell owns the page
 * heading, and a panel that claimed its own would leave the screen with two.
 * Every heading in it is an <h2> (the card titles), so the outline stays flat.
 */
export async function renderBankPanel(ctx) {
  const metas = Array.from(state.questionIndex.values());
  const papers = Array.from(state.papers.values());
  const summary = summariseBank(metas, papers);

  if (!metas.length) {
    return `
      <div class="screen-head pyq-screen-head">
        <div class="pyq-head-copy">
          <span class="section-kicker">MPPSC Prelims Paper I · Question bank</span>
          <h2>What the stored papers contain</h2>
          <p class="muted">Counts the MPPSC Prelims questions stored on this device by subject and topic — a study map of the available papers, not a forecast of the next one.</p>
        </div>
      </div>
      ${card({
        title: 'Nothing to analyse yet',
        body: emptyState({
          title: 'No questions are stored',
          message: 'Import a previous-year question bank first. This screen counts what is actually stored on this device, by subject and by topic.',
          action: '<a class="btn btn-primary" href="#/bank">Question Bank &amp; Imports</a>',
        }),
      })}`;
  }

  // `#/pyq-analysis/<Subject>` preselects a subject once per navigation, so a
  // chip the reader picks afterwards is not snapped back on the next refresh.
  const fromRoute = String(ctx?.params?.[0] || '');
  if (fromRoute !== viewState.appliedRoute) {
    viewState.appliedRoute = fromRoute;
    if (fromRoute) viewState.subject = fromRoute;
  }
  if (viewState.subject !== 'all' && !summary.subjects.some((s) => s.subject === viewState.subject)) {
    viewState.subject = 'all';
  }

  const years = summary.years.map(String);
  const total = summary.total;
  const paperTotal = summary.papers || new Set(metas.map((m) => m.paper_id).filter(Boolean)).size;
  const spanLabel = summary.yearSpan !== '—' ? summary.yearSpan : 'years not stated';
  const subjectSort = viewState.sort === 'syllabus' ? 'syllabus' : 'count';
  const sortedSubjects = sortSubjects(summary.subjects, subjectSort);
  const selected = viewState.subject === 'all' ? null : summary.subjects.find((s) => s.subject === viewState.subject) || null;
  const topicless = summary.topics.filter((t) => t.unclassified).reduce((acc, t) => acc + t.questions, 0);
  const yearTotals = new Map(summary.byYear.map((y) => [String(y.year ?? '—'), y.questions]));

  /* ------------------------------------------------------------ tiles -- */

  const tiles = `
    <div class="pyq-summary-grid" role="region" aria-label="Question bank summary">
      ${tile({ label: 'Questions', value: String(total), sub: `${paperTotal} paper(s) · ${esc(summary.yearSpan)}` })}
      ${tile({
        label: 'Subjects',
        value: String(summary.subjectCount),
        sub: summary.unclassified ? `${summary.unclassified} question(s) have none — counted as Unclassified` : 'every question has one',
        tone: summary.unclassified ? 'warn' : '',
      })}
      ${tile({
        label: 'Topics',
        value: String(summary.topicCount),
        sub: topicless ? `${topicless} question(s) have none` : `across ${summary.subjectCount} subject(s)`,
        tone: topicless ? 'warn' : '',
      })}
      ${tile({
        label: 'Answer keys',
        value: `${summary.withKey}/${total} <small>(${pct(total ? summary.withKey / total : 0, 0)})</small>`,
        sub: summary.withoutKey ? `${summary.withoutKey} to resolve in the Question Bank` : 'every question has one',
        tone: summary.withoutKey ? 'warn' : 'ok',
      })}
    </div>`;

  /* --------------------------------------------------------- subjects -- */

  const subjectChart = barChart({
    data: sortedSubjects.map((s) => ({
      label: s.subject,
      value: s.questions,
      share: s.share,
      tone: s.subject === UNCLASSIFIED_SUBJECT ? 'warn' : '',
      tooltip: `${s.subject}: ${s.questions} question(s), ${fmtPct(s.share, 1)} of the bank, ${s.topics} topic(s), in ${s.papers} of ${paperTotal} paper(s)`,
    })),
    yLabel: `Questions per subject — ${total} questions in all`,
    valueFormat: (v) => String(Math.round(Number(v) || 0)),
    labelHeader: 'Subject',
    valueHeader: 'Questions',
    shareHeader: 'Share of bank',
  });

  const subjectFooter = [
    `<strong>All subjects</strong>`,
    ...years.map((y) => `<strong>${String(yearTotals.get(y) || 0)}</strong>`),
    `<strong>${String(total)}</strong>`,
    `<a class="btn btn-sm btn-quiet pyq-practice-btn" href="#/topic">All topics</a>`,
  ];

  const subjectYears = infoToggle(
    years.length ? 'Year by year — what each paper contributed' : 'Every subject, with a practice link',
    `${years.length > 1 ? HEAT_LEGEND : ''}
     ${yearMatrix({
       rows: sortedSubjects,
       years,
       labelHeader: 'Subject',
       label: (s) => `<span class="pyq-subject-name">${esc(s.subject)}</span>`,
       footer: subjectFooter,
       practise: (s) => practiseLink(s.subject),
       className: 'pyq-subject-matrix',
     })}`,
    { className: 'info-wide' },
  );

  const subjectsCard = card({
    title: 'Questions per subject',
    subtitle: `Share of all ${total} questions · ${subjectSort === 'count' ? 'largest first' : 'syllabus order'}`,
    actions: `
      <div class="seg" role="group" aria-label="Sort subjects">
        <button type="button" data-action="pyq-sort" data-value="count" aria-pressed="${subjectSort === 'count'}">Highest count</button>
        <button type="button" data-action="pyq-sort" data-value="syllabus" aria-pressed="${subjectSort === 'syllabus'}">Syllabus order</button>
      </div>`,
    body: `<div class="pyq-subject-chart">${subjectChart}</div>${subjectYears}`,
  });

  /* ----------------------------------------------------------- topics -- */

  const searchQuery = viewState.search.trim().toLowerCase();
  const inScope = selected ? summary.topics.filter((t) => t.subject === selected.subject) : summary.topics;
  const matching = searchQuery
    ? inScope.filter((t) => String(t.topic).toLowerCase().includes(searchQuery) || String(t.subject).toLowerCase().includes(searchQuery))
    : inScope;
  const shown = viewState.showAllTopics ? matching : matching.slice(0, TOPIC_LIMIT);
  // With a subject picked, shares are of that subject; across all subjects, of the bank.
  const shareOf = (t) => (selected ? t.shareOfSubject : t.share);
  const shareWord = selected ? 'subject' : 'bank';
  // A name used under more than one subject ("Unclassified") is told apart by its subject.
  const nameCount = new Map();
  for (const t of shown) nameCount.set(t.topic, (nameCount.get(t.topic) || 0) + 1);
  const topicLabel = (t) => (!selected && nameCount.get(t.topic) > 1 ? `${t.topic} · ${t.subject}` : t.topic);

  const chips = ['all', ...sortedSubjects.map((s) => s.subject)]
    .map((value) => {
      const row = summary.subjects.find((s) => s.subject === value);
      const on = viewState.subject === value;
      const count = value === 'all' ? total : row?.questions || 0;
      return `<button type="button" class="chip ${on ? 'on' : ''} ${value === UNCLASSIFIED_SUBJECT ? 'chip-warn' : ''}" data-action="pyq-subject" data-value="${esc(value)}" aria-pressed="${on}">
          <span>${value === 'all' ? 'All subjects' : esc(value)}</span>
          <span class="chip-count">${count}<span class="sr-only"> questions</span></span>
        </button>`;
    })
    .join('');

  const topicChart = shown.length
    ? barChart({
        data: shown.map((t) => ({
          label: topicLabel(t),
          value: t.questions,
          share: shareOf(t),
          tone: t.unclassified ? 'warn' : '',
          tooltip: `${t.topic} (${t.subject}): ${t.questions} question(s), ${fmtPct(shareOf(t), 1)} of the ${shareWord}, in ${t.papers} of ${paperTotal} paper(s)`,
        })),
        yLabel: selected ? `Questions per topic in ${selected.subject}` : `Questions per topic — the ${shown.length} largest`,
        valueFormat: (v) => String(Math.round(Number(v) || 0)),
        // The table below lists the same rows, with what a chart cannot carry.
        dataTable: false,
      })
    : '';

  const topicTable = dataTable({
    columns: [
      { label: 'Topic' },
      ...(selected ? [] : [{ label: 'Subject' }]),
      { label: 'Questions', num: true },
      { label: `Share of ${shareWord}`, num: true },
      { label: 'Papers', num: true },
      { label: 'Practice' },
    ],
    rows: shown.map((t) => [
      `<span class="wrap pyq-topic-name">${esc(t.topic)}</span>${t.unclassified ? ` ${badge('no topic label', 'warn')}` : ''}`,
      ...(selected ? [] : [subjectTag(t.subject)]),
      `<strong>${String(t.questions)}</strong>`,
      pct(shareOf(t), 1),
      `${String(t.papers)}<span class="soft"> of ${String(paperTotal)}</span>`,
      practiseLink(t.subject, t.topic),
    ]),
    className: 'compact pyq-topic-table',
    empty: searchQuery ? `No topic matches “${viewState.search.trim()}”.` : 'No topic matches this filter.',
  });

  const topicYears = shown.length
    ? infoToggle(
        `Year by year — ${selected ? selected.subject : 'these topics'}`,
        `${years.length > 1 ? HEAT_LEGEND : ''}
         ${yearMatrix({
           rows: shown,
           years,
           labelHeader: 'Topic',
           label: (t) => `<span class="wrap pyq-topic-name">${esc(t.topic)}</span>${selected ? '' : ` ${subjectTag(t.subject)}`}`,
           className: 'pyq-topic-matrix',
         })}`,
        { className: 'info-wide' },
      )
    : '';

  // Topics are counted the way the Topics tile counts them — named topics —
  // with each subject's questions that have no topic named separately, so the
  // tile, this line and the "Show all" button always add up.
  const named = matching.filter((t) => !t.unclassified).length;
  const groups = matching.length - named;
  const topicWords = `${named} topic(s)${groups ? ` and ${groups} Unclassified group(s)` : ''}`;
  const subtitle = searchQuery
    ? `${matching.length} topic(s) match “${viewState.search.trim()}”${selected ? ` in ${selected.subject}` : ''}`
    : selected
      ? `${selected.subject} · ${selected.questions} question(s) in ${topicWords}`
      : shown.length < matching.length
        ? `All subjects · the ${shown.length} largest of ${topicWords}`
        : `All subjects · ${topicWords}`;

  const topicsCard = card({
    title: 'Questions per topic',
    subtitle,
    actions: selected ? `<a class="btn btn-sm" href="${practiseHref(selected.subject)}">Practise all ${esc(selected.subject)}</a>` : '',
    body: `
      <div class="pyq-topic-toolbar">
        <div class="chips pyq-subject-chips" role="group" aria-label="Show the topics of one subject">${chips}</div>
        <div class="pyq-topic-controls">
          <label class="pyq-search-box">
            <span class="sr-only">Filter topics by name</span>
            ${icon('search', { size: 15 })}
            <input type="search" id="pyqTopicSearch" value="${esc(viewState.search)}" placeholder="Filter topics by name…" autocomplete="off" />
          </label>
          ${viewState.search ? '<button type="button" class="btn btn-sm btn-quiet" data-action="pyq-clear-search">Clear</button>' : ''}
        </div>
      </div>
      ${shown.length ? `<div class="pyq-topic-chart mt-3">${topicChart}</div>` : ''}
      <div class="mt-2">${topicTable}</div>
      ${
        matching.length > TOPIC_LIMIT
          ? `<div class="pyq-topic-more mt-2">
              <p class="small soft m-0">${viewState.showAllTopics ? `All ${matching.length} shown.` : `${matching.length - shown.length} smaller not shown.`}</p>
              <button type="button" class="btn btn-sm btn-quiet" data-action="pyq-toggle-limit" aria-pressed="${viewState.showAllTopics}">${viewState.showAllTopics ? `Show the ${TOPIC_LIMIT} largest` : `Show all ${matching.length}`}</button>
            </div>`
          : ''
      }
      ${topicYears}`,
  });

  /* ------------------------------------------------------------ about -- */

  const about = infoToggle(
    'About these counts',
    [
      `<p class="small">These are the Question Bank screen's own counts: filter its Questions tab by the same subject or topic and it lists the same questions.</p>`,
      summary.unclassified
        ? `<p class="small">${summary.unclassified} question(s) have no subject label. They are counted under <strong>${esc(UNCLASSIFIED_SUBJECT)}</strong> — in the chart, the chips and every total — so each stored question is accounted for once.</p>`
        : '',
      topicless ? `<p class="small">${topicless} question(s) have a subject but no topic label; each subject lists them as the topic <strong>${esc(UNCLASSIFIED_SUBJECT)}</strong>.</p>` : '',
      `<p class="small">Shares in the subject chart, and with “All subjects” picked, are of all ${total} questions; with one subject picked they are of that subject. “Papers” is how many of the ${paperTotal} stored papers hold at least one question on the topic.</p>`,
      summary.demonstration
        ? `<p class="small">${summary.demonstration} of these questions are demonstration questions, included so the screens can be tried out; exclude them under Topic Practice before reading a count as your real coverage.</p>`
        : '',
      '<p class="small m-0">Counting stops at the topic level: subtopic labels come from the import rather than from the printed paper, so a per-subtopic count would describe this bank instead of the examination.</p>',
    ].join(''),
  );

  return `
    <div class="screen-head pyq-screen-head">
      <div class="pyq-head-copy">
        <span class="section-kicker">MPPSC Prelims Paper I · Question bank</span>
        <h2>What the stored papers contain</h2>
        <p class="muted">The ${total} questions stored on this device (${esc(spanLabel)}), counted by subject and by topic — a study map of these papers, not a forecast of the next one.</p>
      </div>
    </div>
    ${tiles}
    ${subjectsCard}
    ${topicsCard}
    ${about}`;
}

/** Wire the panel's own controls. Safe to call when the panel is hidden. */
export function mountBankPanel(ctx, root) {
  root.querySelectorAll('[data-action="pyq-subject"]').forEach((button) => {
    button.addEventListener('click', () => {
      viewState.subject = button.dataset.value || 'all';
      viewState.showAllTopics = false;
      ctx.refresh();
    });
  });

  root.querySelectorAll('[data-action="pyq-sort"]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextSort = button.dataset.value === 'syllabus' ? 'syllabus' : 'count';
      if (viewState.sort !== nextSort) {
        viewState.sort = nextSort;
        ctx.refresh();
      }
    });
  });

  root.querySelectorAll('[data-action="pyq-toggle-limit"]').forEach((button) => {
    button.addEventListener('click', () => {
      viewState.showAllTopics = !viewState.showAllTopics;
      ctx.refresh();
    });
  });

  root.querySelectorAll('[data-action="pyq-clear-search"]').forEach((button) => {
    button.addEventListener('click', () => {
      viewState.search = '';
      ctx.refresh();
    });
  });

  const searchInput = root.querySelector('#pyqTopicSearch');
  if (searchInput) {
    let searchTimer = null;
    searchInput.addEventListener('input', (ev) => {
      viewState.search = ev.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        await ctx.refresh();
        const refreshed = document.getElementById('pyqTopicSearch');
        if (refreshed) {
          refreshed.focus({ preventScroll: true });
          const len = refreshed.value.length;
          try {
            refreshed.setSelectionRange(len, len);
          } catch {
            /* ignore selection range error on search input in some environments */
          }
        }
      }, 220);
    });
  }
}

/**
 * The legacy `#/pyq-analysis` route (and `#/pyq-analysis/<Subject>`), which the
 * syllabus PYQ chips and existing bookmarks still use. It opens the merged
 * Insights section on this panel. The shell is imported lazily so the two
 * modules do not form an import cycle.
 */
export default {
  title: 'Insights',

  /** The router needs the placeholder synchronously, so it is built here, not in the shell. */
  skeleton() {
    return insightsSkeleton({ panel: 'bank' });
  },

  async render(ctx) {
    const { default: insights } = await import('./analytics.js');
    return insights.render(ctx);
  },

  async mount(ctx, root) {
    const { default: insights } = await import('./analytics.js');
    return insights.mount(ctx, root);
  },
};
