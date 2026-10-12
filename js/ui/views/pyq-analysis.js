/**
 * pyq-analysis.js — PYQ Analysis.
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
import { esc, card, tile, dataTable, barChart, emptyState, notice, sourceChip, pct } from '../components.js';

const viewState = { subject: 'all' };

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

export default {
  title: 'PYQ Analysis',

  async render(ctx) {
    const metas = Array.from(state.questionIndex.values());
    const papers = Array.from(state.papers.values());
    const summary = summariseBank(metas, papers);

    if (!metas.length) {
      return `
        <h1>PYQ Analysis</h1>
        ${card({
          title: 'Nothing to analyse yet',
          body: emptyState({
            title: 'No questions are stored',
            message: 'Import a previous-year question bank first. This screen counts what is actually stored on this device, by subject and by topic.',
            action: '<a class="btn btn-primary" href="#/bank">Question Bank &amp; Imports</a>',
          }),
        })}`;
    }

    const years = summary.years.map(String);
    const subjectFilter = viewState.subject;
    const topicsFor = subjectFilter === 'all' ? summary.topics : summary.topics.filter((t) => t.subject === subjectFilter);
    const shownTopics = topicsFor.slice(0, 40);
    const papersForYear = (year) => papers.filter((p) => String(p.year ?? '—') === String(year)).length;

    return `
      <h1>PYQ Analysis</h1>
      <p class="muted">What the previous-year questions on this device cover, counted by subject and by topic. A study map of the stored papers — not a forecast of the next one.</p>

      <div class="tile-row">
        ${tile({ label: 'Questions counted', value: String(summary.total), sub: `${summary.papers} paper(s) · ${esc(summary.yearSpan)}`, source: 'measured' })}
        ${tile({ label: 'Subjects', value: String(summary.subjectCount), sub: summary.unclassified ? `${summary.unclassified} question(s) not matched to a subject` : 'every question matched', tone: summary.unclassified ? 'warn' : '', source: 'measured' })}
        ${tile({ label: 'Topics', value: String(summary.topicCount), sub: `across ${summary.subjects.length} subject group(s)`, source: 'measured' })}
        ${tile({ label: 'With an answer stored', value: `${summary.withKey}/${summary.total}`, sub: summary.withoutKey ? `${summary.withoutKey} question(s) to resolve in the bank` : 'nothing outstanding', tone: summary.withoutKey ? 'warn' : 'ok', source: 'verified' })}
      </div>

      ${notice(
        `Counting stops at the topic level: subtopic labels come from the import rather than from the printed paper, so a per-subtopic count would describe this bank instead of the examination.`,
        'info',
      )}

      ${card({
        title: 'Questions per subject',
        subtitle: years.length > 1 ? `Totals, then what each paper contributed (${years.join(', ')})` : 'Totals across the stored papers',
        right: sourceChip('measured', `${summary.total} question(s)`),
        body: `
          ${barChart({
            data: summary.subjects.map((s) => ({ label: s.subject.length > 14 ? `${s.subject.slice(0, 13)}…` : s.subject, value: s.questions })),
            height: 180,
            yLabel: 'Questions per subject',
            valueFormat: (v) => String(Math.round(v)),
          })}
          <div class="mt-2">
            ${dataTable({
              columns: [
                { label: 'Subject' },
                { label: 'Questions', num: true },
                { label: 'Share', num: true },
                { label: 'Topics', num: true },
                ...years.map((y) => ({ label: y, num: true })),
                { label: '' },
              ],
              rows: summary.subjects.map((s) => [
                esc(s.subject),
                `<strong>${String(s.questions)}</strong>`,
                pct(s.share),
                String(s.topics),
                ...perYear(s, years),
                `<a class="btn btn-sm" href="#/topic/${encodeURIComponent(s.subject)}">Practise</a>`,
              ]),
              className: 'pyq-matrix',
              empty: 'No questions are matched to a subject yet.',
            })}
          </div>`,
        footer: `Share is of the whole bank. ${summary.subjects.filter((s) => s.subject !== UNCLASSIFIED_SUBJECT).length} subject(s) hold questions${summary.unclassified ? `, ${summary.unclassified} do not` : ''}.`,
      })}

      ${card({
        title: 'Questions per topic',
        subtitle: subjectFilter === 'all' ? `The ${shownTopics.length} most frequent topics in the bank` : `Topics under ${subjectFilter}`,
        right: sourceChip('measured', `${topicsFor.length} topic(s)`),
        body: `
          <div class="chips">
            ${['all', ...summary.subjects.map((s) => s.subject)]
              .map((s) => `<button type="button" class="chip ${subjectFilter === s ? 'on' : ''}" data-action="pyq-subject" data-value="${esc(s)}">${s === 'all' ? 'All subjects' : esc(s)}</button>`)
              .join('')}
          </div>
          <div class="mt-2">
            ${dataTable({
              columns: [
                { label: 'Topic' },
                { label: 'Subject' },
                ...years.map((y) => ({ label: y, num: true })),
                { label: 'Questions', num: true },
                { label: 'Share of subject', num: true },
                { label: '' },
              ],
              rows: shownTopics.map((t) => [
                `<span class="wrap">${esc(t.topic)}</span>`,
                `<span class="soft tiny">${esc(t.subject)}</span>`,
                ...perYear(t, years),
                `<strong>${String(t.questions)}</strong>`,
                pct(t.shareOfSubject),
                `<a class="btn btn-sm" href="#/topic/${encodeURIComponent(`${t.subject}||${t.topic}`)}">Practise</a>`,
              ]),
              className: 'pyq-matrix',
              empty: 'No topic matches this filter.',
            })}
          </div>
          ${topicsFor.length > shownTopics.length ? `<p class="small soft mt-2">${topicsFor.length - shownTopics.length} further topic(s) in this filter hold fewer questions than those listed.</p>` : ''}`,
        footer: years.length > 1 ? 'The year columns show how many questions each paper contributed to that topic; the shading is relative to the row, not to the whole bank.' : 'Counts are over the papers stored on this device.',
      })}

      ${
        years.length > 1
          ? card({
              title: 'Papers in the bank',
              subtitle: 'What each year contributed',
              right: sourceChip('measured', `${summary.byYear.length} year(s)`),
              body: dataTable({
                columns: [{ label: 'Year' }, { label: 'Questions', num: true }, { label: 'Subjects', num: true }, { label: 'Topics', num: true }, { label: 'Papers stored', num: true }],
                rows: summary.byYear.map((y) => [
                  esc(String(y.year ?? '—')),
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
  },

  mount(ctx, root) {
    root.querySelectorAll('[data-action="pyq-subject"]').forEach((button) => {
      button.addEventListener('click', () => {
        viewState.subject = button.dataset.value;
        ctx.refresh();
      });
    });
  },
};
