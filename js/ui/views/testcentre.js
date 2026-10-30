/**
 * testcentre.js — PYQ Test Centre.
 *
 * The screen used to be a dozen identical 54-word cards, each repeating the same
 * scoring sentence and hiding the one thing that differs — the paper — behind a
 * second disclosure. It is now a single filterable table: year · paper ·
 * questions · duration · scheme · your best · action, with the detail of a row
 * one tap away inside the row itself, and any session still in progress pinned
 * above the table.
 *
 * The provenance rules are unchanged and still visible: the source metadata and
 * the practice scoring policy are stated separately, and applying the latest
 * reported +3/−1/0 pattern to older papers is not a claim about their
 * historical rules.
 */

import { state } from '../../core/state.js';
import {
  esc,
  card,
  screenHead,
  countChip,
  cardInfo,
  filterChip,
  emptyState,
  dataTable,
  openModal,
  toast,
  confirmDialog,
  answerKeyBadge,
  demoBadge,
  createFilterState,
} from '../components.js';
import { fmtDate, fmtMarks, fmtPct, fmtClock, shuffle } from '../../core/util.js';
import { paperSummary } from '../../services/select.js';
import * as tests from '../../services/tests.js';
import { resolveScoringRules } from '../../services/scoring.js';
import { configFields, readConfig, mountConfigFields, scoringUnknownNotice, startPracticeTest } from './shared.js';
import { openPracticeSheet } from '../practicesheet.js';

/** The table's filters, remembered per screen (see `createFilterState`). */
const filters = createFilterState({ year: 'all', unfinishedOnly: false, showAll: false });

/** One row of the papers table: the columns a reader compares across papers. */
function paperRow({ paper, summary }, unfinishedByPaper) {
  const resolved = resolveScoringRules({ paper });
  const hasScoring = Boolean(resolved.rules);
  const isLatestPractice = resolved.schemeId === 'mppsc-sse-prelims-latest-practice' && !paper.user_scoring_override;
  const scheme = hasScoring
    ? `+${fmtMarks(resolved.rules.marks_per_correct)} / −${fmtMarks(resolved.rules.negative_marks_per_incorrect)} / ${fmtMarks(resolved.rules.marks_for_unanswered)}`
    : 'unknown';
  const flags = [];
  if (summary.placeholder) flags.push(badgeHtml('metadata missing', 'bad'));
  if (summary.disputed) flags.push(badgeHtml(`${summary.disputed} disputed`, 'bad'));
  if (summary.missingAnswers) flags.push(badgeHtml(`${summary.missingAnswers} without a key`, 'warn'));
  if (paper.is_demonstration) flags.push(demoBadge(true));

  const open = unfinishedByPaper.get(paper.paper_id);
  const best = summary.best || null;
  const detailId = `paperDetail-${paper.paper_id}`;
  // Per-row expansion is a button + panel rather than a <details>: `<details>`
  // is a *disclosure*, and the density budget allows three per screen, not one
  // per row. The panel is toggled by mount() with aria-expanded and `hidden`.
  const detail = `<button class="btn btn-quiet btn-sm row-detail-toggle" type="button" data-action="toggle-row" aria-expanded="false" aria-controls="${esc(detailId)}">Details</button>
    <div class="row-detail-body small" id="${esc(detailId)}" hidden>
      <p class="m-0">${esc(paper.exam || 'Examination not stated')}${paper.year ? ` · ${esc(String(paper.year))}` : ''}${
        paper.set_code ? ` · set ${esc(paper.set_code)}` : ''
      }${paper.paper_code ? ` · ${esc(paper.paper_code)}` : ''}</p>
      <p class="m-0 mt-1">${
        hasScoring
          ? `Scoring: +${fmtMarks(resolved.rules.marks_per_correct)} per correct${
              resolved.rules.negative_marking_enabled ? `, −${fmtMarks(resolved.rules.negative_marks_per_incorrect)} per incorrect` : ', no negative marking'
            }, ${fmtMarks(resolved.rules.marks_for_unanswered)} unanswered.`
          : 'Scoring rules are not known for this paper yet.'
      }${isLatestPractice ? ' Current-pattern practice policy — not a historical-rule claim.' : ''}</p>
      <p class="m-0 mt-1">${summary.bilingual || 0} question(s) carry both English and Hindi text.${flags.length ? ` ${flags.join(' ')}` : ''}</p>
      <div class="row tight mt-2">
        <button class="btn btn-sm" type="button" data-action="paper-details" data-paper="${esc(paper.paper_id)}">Open the question list</button>
      </div>
    </div>`;

  return [
    esc(String(paper.year ?? '—')),
    `<strong>${esc(paper.paper_name || paper.paper_id)}</strong>
     <div class="tiny muted">${isLatestPractice ? 'latest pattern · practice only' : 'source paper'}</div>
     ${detail}`,
    `${String(summary.present)}<div class="tiny muted">${summary.bilingual ? `${summary.bilingual} bilingual` : 'single language'}</div>`,
    paper.duration_minutes ? `${esc(String(paper.duration_minutes))} min` : '<span class="soft">—</span>',
    `${scheme}<div class="tiny muted">${isLatestPractice ? 'practice policy' : 'from the paper'}</div>`,
    best
      ? `${esc(fmtMarks(best.score))} / ${esc(fmtMarks(best.max_marks))}<div class="tiny muted">${esc(fmtPct(best.accuracy, 0))} · ${esc(fmtDate(best.at))}</div>`
      : '<span class="soft">not attempted</span>',
    open
      ? `<button class="btn btn-primary btn-sm" type="button" data-action="resume" data-test="${esc(open.id)}">Resume</button>
         <div class="tiny muted">${tests.testProgress(open).answered} answered</div>`
      : `<button class="btn btn-sm" type="button" data-action="start-paper" data-paper="${esc(paper.paper_id)}" ${summary.present ? '' : 'disabled'}>Start</button>`,
  ];
}

const badgeHtml = (text, tone) => `<span class="badge ${tone}">${esc(text)}</span>`;

export default {
  title: 'PYQ Test Centre',

  async render(ctx) {
    const metas = Array.from(state.questionIndex.values());
    const papers = Array.from(state.papers.values()).sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    const unfinished = await tests.unfinishedTests();
    const submitted = await tests.listTests({ status: 'submitted' });

    if (!papers.length) {
      return `
        ${screenHead({
          title: 'PYQ Test Centre',
          purpose: 'Full previous-year paper simulations, in the order the paper stored.',
          primary: '<a class="btn btn-primary" href="#/bank">Import a question bank</a>',
        })}
        ${card({
          title: 'No previous-year papers are stored yet',
          body: emptyState({
            title: 'Import a validated question bank to begin',
            message: 'MyMPPSC does not ship with MPPSC previous-year papers. Import a bank produced by your separate preparation pipeline — the Question Bank screen explains the format, validates the file and shows a full summary before anything is written.',
            willShow: 'One row per stored paper, with its year, question count, duration and your best score.',
            action: '<a class="btn btn-primary" href="#/bank">Go to Question Bank &amp; Imports</a>',
          }),
        })}`;
    }

    const paperSummaries = papers.map((paper) => ({ paper, summary: paperSummary(paper, metas) }));
    // "Your best" is the best submitted score per paper, counted from the tests
    // the reader actually took; it is never estimated.
    const bestByPaper = new Map();
    const finishedByPaper = new Map();
    for (const test of submitted) {
      const paperId = test.paper_id || test.paper_snapshot?.paper_id;
      if (!paperId) continue;
      const score = Number(test.result?.score);
      if (!Number.isFinite(score)) continue;
      const previous = bestByPaper.get(paperId);
      if (!previous || score > previous.score) {
        bestByPaper.set(paperId, {
          score,
          max_marks: test.result?.max_marks ?? 0,
          accuracy: test.result?.accuracy ?? 0,
          at: test.submitted_at,
        });
      }
      finishedByPaper.set(paperId, (finishedByPaper.get(paperId) || 0) + 1);
    }
    for (const { paper, summary } of paperSummaries) {
      summary.best = bestByPaper.get(paper.paper_id) || null;
      summary.finished = finishedByPaper.get(paper.paper_id) || 0;
    }
    const unfinishedByPaper = new Map(unfinished.map((test) => [test.paper_id || test.paper_snapshot?.paper_id, test]));

    const current = filters.get();
    const years = Array.from(new Set(papers.map((paper) => paper.year).filter(Boolean))).sort((a, b) => Number(b) - Number(a));
    let rows = paperSummaries.filter(({ paper, summary }) => {
      if (current.year !== 'all' && String(paper.year) !== String(current.year)) return false;
      if (current.unfinishedOnly && !unfinishedByPaper.get(paper.paper_id)) return false;
      return true;
    });
    const total = rows.length;
    if (!current.showAll) rows = rows.slice(0, 12);
    const hidden = total - rows.length;

    const filterRow = `<div class="card-toolbar">
      <div class="filters m-0">
        <label class="field"><span class="label-text">Year</span>
          <select id="tcYear"><option value="all">All years</option>${years
            .map((year) => `<option value="${esc(String(year))}" ${String(current.year) === String(year) ? 'selected' : ''}>${esc(String(year))}</option>`)
            .join('')}</select>
        </label>
        <label class="check self-end"><input type="checkbox" id="tcUnfinished" ${current.unfinishedOnly ? 'checked' : ''} /><span>Only papers with a session in progress</span></label>
      </div>
      ${filterChip(filters.count(), { unit: 'filter' })}
    </div>`;

    const resumeStrip = unfinished.length
      ? `<div class="resume-list" role="list" aria-label="Sessions in progress">
          ${unfinished
            .map((test) => {
              const progress = tests.testProgress(test);
              return `<div class="resume-list-row" role="listitem">
                <div><strong>${esc(test.label || test.kind)}</strong>
                  <div class="tiny muted">${esc(tests.describeTest(test))} · started ${esc(fmtDate(test.started_at || test.created_at))} · ${progress.answered} answered, ${progress.unanswered} left${
                    test.timer?.remaining_seconds !== null && test.timer?.remaining_seconds !== undefined ? ` · ${esc(fmtClock(test.timer.remaining_seconds))} remaining` : ''
                  }${test.status === 'paused' ? ' · paused' : ''}</div>
                </div>
                <div class="row tight">
                  <button class="btn btn-primary btn-sm" type="button" data-action="resume" data-test="${esc(test.id)}">Resume</button>
                  <button class="btn btn-sm" type="button" data-action="abandon" data-test="${esc(test.id)}">Discard</button>
                </div>
              </div>`;
            })
            .join('')}
        </div>`
      : '';

    return `
      ${screenHead({
        title: 'PYQ Test Centre',
        purpose: 'Every stored paper in one table: questions, duration, scoring and your best attempt. Start a full simulation, or resume one still in progress.',
        primary: '<button class="btn btn-primary" type="button" data-action="practise-now">Practise now</button>',
        secondary: '<a class="btn btn-sm" href="#/topic">Topic &amp; custom practice</a>',
      })}

      ${card({
        title: 'Previous-year papers',
        count: countChip(`${total} paper${total === 1 ? '' : 's'}`),
        info: cardInfo(
          'About scoring and these papers',
          '<p class="small m-0">Full-paper practice follows the stored question order. Source metadata is shown separately from practice scoring: the latest reported MPPSC pattern (+3/−1/0) is applied to the bundled 2013–2024 papers by policy, not as a claim about each paper’s historical rules. Everything is stored in local IndexedDB on this device.</p>',
        ),
        body: `${resumeStrip}
          ${filterRow}
          ${dataTable({
            columns: [
              { label: 'Year' },
              { label: 'Paper' },
              { label: 'Questions', num: true },
              { label: 'Duration' },
              { label: 'Scheme' },
              { label: 'Your best' },
              { label: 'Action' },
            ],
            rows: rows.map((entry) => paperRow(entry, unfinishedByPaper)),
            empty: 'No paper matches these filters.',
            className: 'compact cards-mobile paper-table',
          })}
          ${hidden > 0 ? `<div class="show-all-row"><button class="btn btn-sm" type="button" data-action="show-all">Show all ${total} papers <span class="muted">(+${hidden})</span></button></div>` : ''}`,
        footer: `<span class="tiny">Rules unknown: ${paperSummaries.filter(({ summary }) => !summary.scoringKnown).length} paper(s). A paper is never scored with guessed rules — you are asked to configure them first.</span>`,
      })}`;
  },

  async mount(ctx, root) {
    const current = filters.get();

    document.getElementById('tcYear')?.addEventListener('change', async (ev) => {
      filters.set({ year: ev.target.value });
      await ctx.refresh();
    });
    document.getElementById('tcUnfinished')?.addEventListener('change', async (ev) => {
      filters.set({ unfinishedOnly: ev.target.checked });
      await ctx.refresh();
    });

    root.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'clear-filters') {
        filters.reset();
        await ctx.refresh();
      } else if (action === 'toggle-row') {
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        if (!panel) return;
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        panel.hidden = open;
      } else if (action === 'show-all') {
        filters.set({ showAll: true });
        await ctx.refresh();
      } else if (action === 'practise-now') {
        await openPracticeSheet(ctx, { source: 'test centre' });
      } else if (action === 'resume') {
        ctx.navigate(`runner/${btn.dataset.test}`);
      } else if (action === 'abandon') {
        const ok = await confirmDialog({
          title: 'Discard this test?',
          message: 'The answers you gave in this session will be deleted. Nothing is added to your analytics or mistake book. This cannot be undone.',
          confirmLabel: 'Discard the test',
          danger: true,
        });
        if (!ok) return;
        const test = await tests.loadTest(btn.dataset.test);
        await tests.abandonTest(test);
        toast('Test discarded.', 'info');
        await ctx.refresh();
      } else if (action === 'paper-details') {
        const paper = state.papers.get(btn.dataset.paper);
        const summary = paperSummary(paper, Array.from(state.questionIndex.values()));
        const questions = paper.question_order.map((id) => state.questionIndex.get(id)).filter(Boolean);
        await openModal({
          title: `${paper.paper_name || paper.paper_id} — details`,
          wide: true,
          body: `
            ${scoringUnknownNotice(paper)}
            <p class="small">Original order preserved: ${paper.original_order_preserved ? 'yes' : 'reconstructed at import (flagged)'}${
              paper.placeholder ? '<br />This is a placeholder paper created because the imported bank had no metadata for it.' : ''
            } ${summary.bilingual} question(s) carry both languages.</p>
            ${dataTable({
              columns: [{ label: 'Q no.' }, { label: 'Subject' }, { label: 'Topic' }, { label: 'Answer key' }, { label: 'Explanation' }],
              rows: questions.slice(0, 60).map((q) => [
                esc(String(q.question_number ?? '—')),
                esc(q.subject || 'Unclassified'),
                esc(q.topic || '—'),
                answerKeyBadge(q.answerStatus) || '<span class="soft tiny">available</span>',
                q.hasExplanation ? '<span class="soft tiny">supplied</span>' : '<span class="badge warn">none</span>',
              ]),
              className: 'compact',
            })}
            ${questions.length > 60 ? `<p class="tiny muted">Showing 60 of ${questions.length} questions.</p>` : ''}`,
          actions: [{ label: 'Close', tone: 'btn-primary', value: 'close' }],
        });
      } else if (action === 'start-paper') {
        const paper = state.papers.get(btn.dataset.paper);
        const answered = await openModal({
          title: `Start full simulation — ${paper.paper_name || paper.paper_id}`,
          wide: true,
          body: `
            ${scoringUnknownNotice(paper)}
            <p class="small">${paper.question_order.length} questions, scored +3 / −1 / 0.</p>
            ${configFields({ paper, defaultCount: paper.question_order.length, allowCustomScoring: true, allowRepeatOverride: false, maxCount: paper.question_order.length })}
            <label class="check"><input type="checkbox" id="simulationStrict" checked /><span>Keep the exact original order (recommended for a faithful simulation)</span></label>`,
          onMount: () => {
            mountConfigFields({ paper, defaultCount: paper.question_order.length, maxCount: paper.question_order.length, allowRepeatOverride: false });
          },
          actions: [
            { label: 'Cancel', value: '__cancel' },
            { label: 'Start simulation', tone: 'btn-primary', value: '__start' },
          ],
        });
        if (answered !== '__start') return;
        const config = readConfig('practiceCfg', { paper, defaultCount: paper.question_order.length });
        const strict = Boolean(document.getElementById('simulationStrict')?.checked);
        const questionIds = strict ? paper.question_order.slice() : shuffle(paper.question_order);
        await startPracticeTest(ctx, {
          kind: 'pyq_full',
          label: `${paper.paper_name || paper.exam || paper.paper_id}${paper.year ? ` ${paper.year}` : ''}${paper.set_code ? ` (set ${paper.set_code})` : ''}`,
          questionIds,
          metas: questionIds.map((id) => state.questionIndex.get(id)).filter(Boolean),
          config,
          orderSource: strict ? 'original' : 'shuffled',
          paper,
          selectionNotes: strict ? ['Original paper order retained.'] : ['Question order shuffled for this sitting.'],
        });
      }
    }, { signal: ctx.signal });

    // `current` is read above so the screen's first paint and its listeners
    // agree; the object itself is re-read on each render.
    void current;
  },
};
