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
 * Granularity stops at the topic level on purpose — finer labels come from the import, not from the
 * printed paper — and nothing on this screen describes how the bank was produced.
 */

import { state } from '../../core/state.js';
import { summariseBank, UNCLASSIFIED_SUBJECT } from '../../services/pyq-analysis.js';
import { esc, badge, card, tile, dataTable, barChart, emptyState, notice, sourceChip, pct, fmtPct, icon } from '../components.js';

const viewState = {
  appliedRoute: '',
  subject: 'all',
  sort: 'count', // 'count' | 'syllabus'
  search: '',
  showAllTopics: false,
};

/** Count shading in four buckets, so the eye finds the heavy topics without a legend. */
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

function peakYearInfo(row, years) {
  let bestYear = null;
  let bestCount = 0;
  for (const y of years) {
    const c = row.byYear[y] || 0;
    if (c > bestCount) {
      bestCount = c;
      bestYear = y;
    }
  }
  return bestYear ? { year: bestYear, count: bestCount } : null;
}

/**
 * The panel body. It renders no <h1>: the Insights shell owns the page
 * heading, and a panel that claimed its own would leave the screen with two.
 */
export async function renderBankPanel(ctx) {
    const metas = Array.from(state.questionIndex.values());
    const papers = Array.from(state.papers.values());
    const summary = summariseBank(metas, papers);

    if (!metas.length) {
      return `
        <div class="screen-head pyq-screen-head">
          <div>
            <span class="section-kicker">MPPSC Prelims Paper I · Question Bank Analysis</span>
            <h2>What the stored papers contain</h2>
            <p class="muted">Analyses the MPPSC Prelims questions stored on this device by subject and topic — a study map of the available papers, not a forecast of the next one.</p>
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

    const fromRoute = String(ctx?.params?.[0] || '');
    if (fromRoute !== viewState.appliedRoute) {
      viewState.appliedRoute = fromRoute;
      if (fromRoute) viewState.subject = fromRoute;
    }

    const validSubjects = new Set(summary.subjects.map((s) => s.subject));
    if (viewState.subject !== 'all' && !validSubjects.has(viewState.subject)) {
      viewState.subject = 'all';
    }

    const years = summary.years.map(String);
    const subjectFilter = viewState.subject;
    const subjectSort = viewState.sort === 'syllabus' ? 'syllabus' : 'count';
    const sortedSubjects = sortSubjects(summary.subjects, subjectSort);
    const topByCount = sortSubjects(summary.subjects, 'count').filter((s) => s.subject !== UNCLASSIFIED_SUBJECT);

    const searchQuery = viewState.search.trim().toLowerCase();
    const topicsBySubject = subjectFilter === 'all' ? summary.topics : summary.topics.filter((t) => t.subject === subjectFilter);
    const topicsFor = searchQuery
      ? topicsBySubject.filter(
          (t) => String(t.topic).toLowerCase().includes(searchQuery) || String(t.subject).toLowerCase().includes(searchQuery),
        )
      : topicsBySubject;
    const topicLimit = viewState.showAllTopics ? topicsFor.length : 40;
    const shownTopics = topicsFor.slice(0, topicLimit);

    const papersForYear = (year) => papers.filter((p) => String(p.year ?? '—') === String(year)).length;
    const yearTotalMap = new Map(summary.byYear.map((y) => [String(y.year ?? '—'), y.questions]));
    const keyCoverageRatio = summary.total > 0 ? summary.withKey / summary.total : 0;
    const unplacedTopicQuestions = summary.topics.filter((t) => t.unclassified).reduce((acc, t) => acc + t.questions, 0);

    const topThreeText = topByCount
      .slice(0, 3)
      .map((s) => `${s.subject} (${s.questions} · ${fmtPct(s.share, 1)})`)
      .join(', ');
    const defaultChartReadout = topThreeText
      ? `Highest weightage in bank: ${topThreeText}. Hover or focus any bar to inspect details.`
      : `${summary.total} question(s) across ${summary.subjectCount} subject(s).`;

    const spanLabel = summary.yearSpan !== '—' ? summary.yearSpan : 'years not stated';

    const subjectFooterRow = [
      `<strong>Total (${summary.subjectCount} subject${summary.subjectCount === 1 ? '' : 's'}${summary.unclassified ? ' + unplaced' : ''})</strong>`,
      `<strong>${String(summary.total)}</strong>`,
      '<strong>100%</strong>',
      `<strong>${String(summary.topicCount)}</strong>`,
      ...years.map((y) => `<strong>${String(yearTotalMap.get(y) || 0)}</strong>`),
      `<a class="btn btn-sm btn-quiet" href="#/topic">All topics</a>`,
    ];

    return `
      <div class="screen-head pyq-screen-head">
        <div class="pyq-head-copy">
          <span class="section-kicker">MPPSC Prelims Paper I · Question Bank Analysis</span>
          <h2>What the stored papers contain</h2>
          <p class="muted">Analyses MPPSC Prelims Paper I questions (${esc(spanLabel)}) stored on this device by subject and by topic. A study map of the stored papers — not a forecast of the next one.</p>
        </div>
        <div class="pyq-head-meta" aria-label="Question bank summary metadata">
          <span class="pyq-meta-pill">${icon('test-centre', { size: 15 })}<span><strong>${esc(String(summary.papers))}</strong> paper(s) · <strong>${esc(String(summary.total))}</strong> questions</span></span>
          <span class="pyq-meta-pill">${icon('pyq-analysis', { size: 15 })}<span>Span: <strong>${esc(summary.yearSpan)}</strong></span></span>
          ${sourceChip('measured', `${summary.papers} paper(s)`)}
        </div>
      </div>

      <div class="pyq-summary-grid" role="region" aria-label="Question bank summary metrics">
        ${tile({
          label: 'Total questions',
          value: String(summary.total),
          sub: `${summary.papers} paper(s) · ${esc(summary.yearSpan)}`,
          source: 'measured',
        })}
        ${tile({
          label: 'Subjects',
          value: String(summary.subjectCount),
          sub: summary.unclassified ? `${summary.unclassified} question(s) not matched to a subject` : 'every question matched',
          tone: summary.unclassified ? 'warn' : '',
          source: 'measured',
        })}
        ${tile({
          label: 'Topics',
          value: String(summary.topicCount),
          sub: `across ${summary.subjects.length} subject group(s)`,
          source: 'measured',
        })}
        ${tile({
          label: 'Answer-key coverage',
          value: `${summary.withKey}/${summary.total} <small>(${pct(keyCoverageRatio, 0)})</small>`,
          sub: summary.withoutKey ? `${summary.withoutKey} question(s) to resolve in the bank` : `nothing outstanding · ${summary.explanation} explained`,
          tone: summary.withoutKey ? 'warn' : 'ok',
          source: 'measured',
        })}
        ${tile({
          label: 'Unplaced questions',
          value: String(summary.unclassified),
          sub: summary.unclassified
            ? `${pct(summary.unclassified / Math.max(1, summary.total), 1)} of bank · needs subject label`
            : unplacedTopicQuestions
              ? `${unplacedTopicQuestions} missing topic label only`
              : '0 unplaced · 100% classified',
          tone: summary.unclassified || unplacedTopicQuestions ? 'warn' : 'ok',
          source: 'measured',
        })}
      </div>

      ${notice(
        `Counting stops at the topic level: subtopic labels come from the import rather than from the printed paper, so a per-subtopic count would describe this bank instead of the examination.`,
        'info',
      )}

      ${card({
        title: 'Questions per subject',
        subtitle: `Horizontal comparison of total questions and bank share across ${summary.subjectCount} syllabus subject(s)${summary.unclassified ? ' plus unplaced questions' : ''}`,
        actions: `
          <div class="seg" role="group" aria-label="Sort subjects">
            <button type="button" data-action="pyq-sort" data-value="count" aria-pressed="${subjectSort === 'count'}">Highest count</button>
            <button type="button" data-action="pyq-sort" data-value="syllabus" aria-pressed="${subjectSort === 'syllabus'}">Syllabus order</button>
          </div>
          ${sourceChip('measured', `${summary.total} question(s)`)}`,
        body: `
          <div class="pyq-chart-readout" id="pyqChartReadout" data-default-text="${esc(defaultChartReadout)}" role="status" aria-live="polite">
            <span class="pyq-readout-dot" aria-hidden="true"></span>
            <span id="pyqChartReadoutText">${esc(defaultChartReadout)}</span>
          </div>
          ${barChart({
            data: sortedSubjects.map((s) => {
              const peak = peakYearInfo(s, years);
              return {
                label: s.subject,
                value: s.questions,
                share: s.share,
                tone: s.subject === UNCLASSIFIED_SUBJECT ? 'warn' : '',
                endLabel: `${s.questions} (${fmtPct(s.share, 1)})`,
                tooltip: `${s.subject} — ${s.questions} questions (${fmtPct(s.share, 1)} of bank) · ${s.topics} topic(s)${
                  peak ? ` · Peak year: ${peak.year} (${peak.count} questions)` : ''
                }`,
              };
            }),
            yLabel: 'Questions per subject',
            valueFormat: (v) => String(Math.round(Number(v) || 0)),
          })}`,
        footer: `Share is of the whole bank (${summary.total} questions). ${summary.subjectCount} subject(s) hold questions${
          summary.unclassified ? `, and ${summary.unclassified} question(s) are in the Unclassified bucket` : ''
        }.`,
      })}

      ${card({
        title: 'Subject-by-year breakdown',
        subtitle:
          years.length > 1
            ? `Totals, bank share, topic count, and year-wise contribution (${years.join(', ')})`
            : 'Totals, bank share, and topic count across the stored papers',
        actions: `
          <div class="pyq-heat-legend" aria-label="Row shading scale">
            <span class="tiny muted">Row shading:</span>
            <span class="heat heat-none">0</span>
            <span class="heat heat-1">Low</span>
            <span class="heat heat-2">Mid</span>
            <span class="heat heat-3">Peak</span>
          </div>
          ${sourceChip('measured', `${summary.subjects.length} group(s)`)}`,
        body: dataTable({
          columns: [
            { label: 'Subject' },
            { label: 'Questions', num: true },
            { label: 'Share', num: true },
            { label: 'Topics', num: true },
            ...years.map((y) => ({ label: y, num: true })),
            { label: 'Practice' },
          ],
          rows: sortedSubjects.map((s) => [
            `<div class="pyq-subject-cell"><span class="pyq-subject-name">${esc(s.subject)}</span>${
              s.subject === UNCLASSIFIED_SUBJECT ? ` ${badge('Unplaced', 'warn')}` : ''
            }</div>`,
            `<strong>${String(s.questions)}</strong>`,
            pct(s.share, 1),
            String(s.topics),
            ...perYear(s, years),
            `<a class="btn btn-sm pyq-practice-btn" href="#/topic/${encodeURIComponent(s.subject)}">Practise</a>`,
          ]),
          footer: subjectFooterRow,
          className: 'pyq-matrix pyq-subject-matrix',
          empty: 'No questions are matched to a subject yet.',
        }),
        footer:
          years.length > 1
            ? 'Each year cell shows how many questions that paper contributed to the subject; shading is relative to that subject row so year-to-year shifts stand out.'
            : 'Counts reflect all questions currently stored in this browser.',
      })}

      ${card({
        title: 'Questions per topic',
        subtitle:
          subjectFilter === 'all'
            ? searchQuery
              ? `Matching topics across all subjects (${shownTopics.length} of ${topicsFor.length})`
              : shownTopics.length < topicsFor.length
                ? `The ${shownTopics.length} most frequent topics in the bank (of ${topicsFor.length} total)`
                : `All ${topicsFor.length} topics in the bank, ranked by frequency`
            : `Topics under ${subjectFilter} (${shownTopics.length} of ${topicsFor.length})`,
        right: sourceChip('measured', `${topicsFor.length} topic(s)`),
        body: `
          ${
            summary.unclassified > 0 || unplacedTopicQuestions > 0
              ? `<div class="pyq-unplaced-banner" role="region" aria-label="Unplaced questions bucket">
                  <div>
                    <strong>Unplaced-question bucket:</strong>
                    <span>${
                      summary.unclassified
                        ? `${summary.unclassified} question(s) have no subject label`
                        : `${unplacedTopicQuestions} question(s) have a subject but no topic label`
                    } and are grouped under <code>${esc(UNCLASSIFIED_SUBJECT)}</code> so every question remains accounted for.</span>
                  </div>
                  ${
                    summary.unclassified
                      ? `<button type="button" class="btn btn-sm" data-action="pyq-subject" data-value="${esc(UNCLASSIFIED_SUBJECT)}">Filter unplaced (${summary.unclassified})</button>`
                      : ''
                  }
                </div>`
              : ''
          }
          <div class="pyq-topic-toolbar">
            <div class="chips pyq-subject-chips" role="group" aria-label="Filter topics by subject">
              ${['all', ...summary.subjects.map((s) => s.subject)]
                .map((s) => {
                  const subObj = summary.subjects.find((item) => item.subject === s);
                  const count = s === 'all' ? summary.topics.length : subObj ? subObj.topics : 0;
                  const isUnplaced = s === UNCLASSIFIED_SUBJECT;
                  return `<button type="button" class="chip ${subjectFilter === s ? 'on' : ''} ${isUnplaced ? 'chip-warn' : ''}" data-action="pyq-subject" data-value="${esc(s)}" aria-pressed="${subjectFilter === s}">
                    <span>${s === 'all' ? 'All subjects' : esc(s)}</span>
                    <span class="chip-count">${count}</span>
                  </button>`;
                })
                .join('')}
            </div>
            <div class="pyq-topic-controls">
              <label class="pyq-search-box">
                <span class="sr-only">Filter topics by keyword</span>
                ${icon('search', { size: 15 })}
                <input type="search" id="pyqTopicSearch" value="${esc(viewState.search)}" placeholder="Filter topics by name…" autocomplete="off" />
              </label>
              ${
                viewState.search
                  ? `<button type="button" class="btn btn-sm btn-quiet" data-action="pyq-clear-search">Clear</button>`
                  : ''
              }
              ${
                topicsFor.length > 40
                  ? `<button type="button" class="btn btn-sm" data-action="pyq-toggle-limit" aria-pressed="${viewState.showAllTopics}">
                      ${viewState.showAllTopics ? 'Show top 40' : `Show all ${topicsFor.length}`}
                    </button>`
                  : ''
              }
            </div>
          </div>
          <div class="mt-2">
            ${dataTable({
              columns: [
                { label: 'Topic' },
                { label: 'Subject' },
                ...years.map((y) => ({ label: y, num: true })),
                { label: 'Questions', num: true },
                { label: 'Share of subject', num: true },
                { label: 'Practice' },
              ],
              rows: shownTopics.map((t) => [
                `<div class="pyq-topic-cell"><span class="wrap pyq-topic-name">${esc(t.topic)}</span>${
                  t.unclassified ? ` ${badge('Unplaced', 'warn')}` : ''
                }</div>`,
                `<span class="pyq-subject-tag ${t.subject === UNCLASSIFIED_SUBJECT ? 'warn' : ''}">${esc(t.subject)}</span>`,
                ...perYear(t, years),
                `<strong>${String(t.questions)}</strong>`,
                pct(t.shareOfSubject),
                `<a class="btn btn-sm pyq-practice-btn" href="#/topic/${encodeURIComponent(`${t.subject}||${t.topic}`)}">Practise</a>`,
              ]),
              className: 'pyq-matrix pyq-topic-matrix',
              empty: 'No topic matches this filter.',
            })}
          </div>
          ${
            topicsFor.length > shownTopics.length
              ? `<div class="pyq-topic-more mt-2">
                  <p class="small soft m-0">${topicsFor.length - shownTopics.length} further topic(s) in this filter hold fewer questions than those listed.</p>
                  <button type="button" class="btn btn-sm btn-quiet" data-action="pyq-toggle-limit">Show all ${topicsFor.length} topics</button>
                </div>`
              : ''
          }`,
        footer:
          years.length > 1
            ? 'The year columns show how many questions each paper contributed to that topic; the shading is relative to the row, not to the whole bank.'
            : 'Counts are over the papers stored on this device.',
      })}

      ${
        years.length > 1
          ? card({
              title: 'Papers in the bank',
              subtitle: 'What each year contributed',
              right: sourceChip('measured', `${summary.byYear.length} year(s)`),
              body: dataTable({
                columns: [
                  { label: 'Year' },
                  { label: 'Questions', num: true },
                  { label: 'Subjects', num: true },
                  { label: 'Topics', num: true },
                  { label: 'Papers stored', num: true },
                ],
                rows: summary.byYear.map((y) => [
                  `<strong>${esc(String(y.year ?? '—'))}</strong>`,
                  String(y.questions),
                  String(y.subjects),
                  String(y.topics),
                  String(papersForYear(y.year)),
                ]),
                className: 'compact',
              }),
              footer:
                summary.papersComplete < summary.papers
                  ? `${summary.papers - summary.papersComplete} of the stored paper(s) are marked incomplete: the printed paper had more questions than are stored here, so its counts are of what is available.`
                  : 'Every stored paper is recorded as complete.',
            })
          : ''
      }

      ${notice(
        summary.demonstration
          ? `${summary.demonstration} of these questions are demonstration questions, included so the screens can be tried out; exclude them under Topic Practice before reading a count as your real coverage.`
          : 'These counts cover every question stored on this device, including anything you imported yourself.',
        'info',
      )}`;
}

/** Wire the panel's own controls. Safe to call when the panel is hidden. */
export function mountBankPanel(ctx, root) {
    root.querySelectorAll('[data-action="pyq-subject"]').forEach((button) => {
      button.addEventListener('click', () => {
        viewState.subject = button.dataset.value || 'all';
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
            refreshed.focus();
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

    const readoutEl = root.querySelector('#pyqChartReadout');
    const readoutTextEl = root.querySelector('#pyqChartReadoutText');
    const defaultText = readoutEl?.dataset?.defaultText || '';
    if (readoutTextEl) {
      root.querySelectorAll('.pyq-hbar-chart .chart-row').forEach((row) => {
        const showDetail = () => {
          const detail = row.dataset.chartDetail;
          if (detail) {
            readoutTextEl.textContent = detail;
            readoutEl?.classList.add('active');
          }
        };
        const resetDetail = () => {
          readoutTextEl.textContent = defaultText;
          readoutEl?.classList.remove('active');
        };
        row.addEventListener('mouseenter', showDetail);
        row.addEventListener('focus', showDetail);
        row.addEventListener('mouseleave', resetDetail);
        row.addEventListener('blur', resetDetail);
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

  async render(ctx) {
    const { default: insights } = await import('./analytics.js');
    return insights.render(ctx);
  },

  async mount(ctx, root) {
    const { default: insights } = await import('./analytics.js');
    return insights.mount(ctx, root);
  },
};
