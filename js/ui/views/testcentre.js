/**
 * testcentre.js — PYQ Test Centre.
 *
 * Select a genuine previous-year paper and attempt it in its original order,
 * with the source duration and the source scoring rules. Papers whose metadata is
 * incomplete or whose rules are unknown are clearly flagged instead of being
 * presented as faithful simulations. Unfinished tests can be resumed.
 */

import { state } from '../../core/state.js';
import {
  esc,
  badge,
  card,
  tile,
  notice,
  dataTable,
  emptyState,
  openModal,
  toast,
  confirmDialog,
  answerKeyBadge,
  sourceChip,
  demoBadge,
  pageHead,
  filterChip,
  ring,
  icon,
} from '../components.js';
import { fmtDate, fmtMarks, fmtPct, fmtClock } from '../../core/util.js';
import { paperSummary } from '../../services/select.js';
import * as tests from '../../services/tests.js';
import { configFields, readConfig, mountConfigFields, incompletePaperNotice, scoringUnknownNotice, startPracticeTest } from './shared.js';

const viewState = { filter: 'all', sort: 'newest' };

const PAPER_FILTERS = [
  { id: 'all', label: 'All papers' },
  { id: 'ready', label: 'Ready to simulate' },
  { id: 'incomplete', label: 'Incomplete' },
  { id: 'unknown-rules', label: 'Rules unknown' },
  { id: 'disputed', label: 'Disputed keys' },
  { id: 'demonstration', label: 'Demonstration' },
];

function paperMatches(paper, summary, filter) {
  switch (filter) {
    case 'ready':
      return summary.present > 0 && summary.complete !== false && summary.scoringKnown && !summary.disputed && !summary.missingAnswers;
    case 'incomplete':
      return summary.complete === false || summary.placeholder;
    case 'unknown-rules':
      return !summary.scoringKnown;
    case 'disputed':
      return Boolean(summary.disputed);
    case 'demonstration':
      return Boolean(paper.is_demonstration);
    default:
      return true;
  }
}

function sortPapers(rows, sort) {
  const copy = rows.slice();
  if (sort === 'oldest') return copy.sort((a, b) => Number(a.paper.year || 0) - Number(b.paper.year || 0));
  if (sort === 'name') return copy.sort((a, b) => String(a.paper.paper_name || a.paper.paper_id).localeCompare(String(b.paper.paper_name || b.paper.paper_id)));
  if (sort === 'questions') return copy.sort((a, b) => b.summary.present - a.summary.present);
  return copy.sort((a, b) => Number(b.paper.year || 0) - Number(a.paper.year || 0));
}

function paperCard(paper, summary) {
  const questions = summary.present;
  const ready = questions > 0;
  const flags = [];
  if (summary.placeholder) flags.push(badge('paper metadata missing', 'bad'));
  if (summary.complete === false) flags.push(badge('incomplete paper', 'warn'));
  if (!summary.scoringKnown) flags.push(badge('scoring rules unknown', 'warn'));
  if (summary.disputed) flags.push(badge(`${summary.disputed} disputed answer(s)`, 'bad'));
  if (summary.missingAnswers) flags.push(badge(`${summary.missingAnswers} question(s) without a key`, 'warn'));
  if (paper.is_demonstration) flags.push(demoBadge(true));
  if (summary.bilingual) flags.push(badge(`${summary.bilingual} bilingual`, 'info'));

  const readiness = summary.present > 0 && summary.complete !== false && summary.scoringKnown && !summary.disputed && !summary.missingAnswers;
  return `<section class="card ${readiness ? '' : 'warn'}">
    <div class="card-body">
      <div class="spread">
        <div class="grow">
          <div class="row tight">
            <h3 class="mb-1">${esc(paper.paper_name || paper.paper_id)}</h3>
            ${summary.scoringKnown ? sourceChip('supplied', 'source rules') : sourceChip('unavailable', 'rules unknown')}
            ${readiness ? badge('ready', 'ok') : badge('read before starting', 'warn')}
          </div>
          <p class="muted small m-0">
            ${esc(paper.exam || 'Examination not stated')}
            ${paper.year ? ` · ${esc(String(paper.year))}` : ' · year not stated'}
            ${paper.set_code ? ` · set ${esc(paper.set_code)}` : ''}
            ${paper.paper_code ? ` · ${esc(paper.paper_code)}` : ''}
          </p>
          <div class="stat-strip">
            <div><span class="stat-label">Stored</span><span class="stat-value">${questions}</span><span class="tiny muted">${summary.declared !== null && summary.declared !== undefined ? `source declares ${esc(String(summary.declared))}` : 'source count not stated'}</span></div>
            <div><span class="stat-label">Duration</span><span class="stat-value">${paper.duration_minutes ? esc(String(paper.duration_minutes)) : '—'}</span><span class="tiny muted">${paper.duration_minutes ? 'minutes' : 'not stated'}</span></div>
            <div><span class="stat-label">Marks</span><span class="stat-value">${paper.total_marks ? esc(String(paper.total_marks)) : '—'}</span><span class="tiny muted">${paper.total_marks ? 'total' : 'not stated'}</span></div>
          </div>
          <div class="row tight mt-2">
            ${answerKeyBadge(paper.answer_key?.status)}
            ${flags.join(' ')}
          </div>
          <p class="tiny muted mt-2 mb-0">
            ${summary.scoringKnown ? `Scoring: +${esc(fmtMarks(paper.scoring.marks_per_correct))} per correct${paper.scoring.negative_marking_enabled ? `, −${esc(fmtMarks(paper.scoring.negative_marks_per_incorrect))} per incorrect` : ', no negative marking'} ${paper.scoring.rules_source ? `· source: ${esc(paper.scoring.rules_source)}` : ''}` : 'Scoring rules are not known from the source.'}
            ${paper.answer_key?.source ? ` · key source: ${esc(paper.answer_key.source)}` : ' · key source not recorded'}
          </p>
        </div>
        <div class="stack-sm paper-actions">
          <button class="btn btn-primary" type="button" data-action="start-paper" data-paper="${esc(paper.paper_id)}" ${ready ? '' : 'disabled'}>Start full simulation</button>
          <button class="btn" type="button" data-action="paper-details" data-paper="${esc(paper.paper_id)}">Paper details</button>
        </div>
      </div>
    </div>
  </section>`;
}

export default {
  title: 'PYQ Test Centre',

  async render() {
    const metas = Array.from(state.questionIndex.values());
    const papers = Array.from(state.papers.values()).sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    const unfinished = await tests.unfinishedTests();
    const submitted = (await tests.listTests({ status: 'submitted' })).slice(0, 12);

    if (!papers.length) {
      return `
        ${pageHead({ title: 'PYQ Test Centre', description: 'Full-paper simulations in the original question order, with the source duration and scoring rules.' })}
        ${card({
          title: 'No previous-year papers are stored yet',
          body: `${emptyState({
            title: 'Import a validated question bank to begin',
            message: 'MyMPPSC does not ship with MPPSC previous-year papers. Import a bank produced by your separate preparation pipeline — the Question Bank screen explains the format, validates the file and shows a full summary before anything is written.',
            action: '<a class="btn btn-primary" href="#/bank">Go to Question Bank &amp; Imports</a>',
          })}`,
        })}`;
    }

    const paperSummaries = papers.map((paper) => ({ paper, summary: paperSummary(paper, metas) }));
    const countsByFilter = Object.fromEntries(PAPER_FILTERS.map((f) => [f.id, paperSummaries.filter(({ paper, summary }) => paperMatches(paper, summary, f.id)).length]));
    const shownPapers = sortPapers(paperSummaries.filter(({ paper, summary }) => paperMatches(paper, summary, viewState.filter)), viewState.sort);
    const totals = paperSummaries.reduce(
      (acc, { summary }) => ({
        questions: acc.questions + summary.present,
        complete: acc.complete + (summary.complete ? 1 : 0),
        unknownRules: acc.unknownRules + (summary.scoringKnown ? 0 : 1),
      }),
      { questions: 0, complete: 0, unknownRules: 0 },
    );

    return `
      ${pageHead({
        title: 'PYQ Test Centre',
        description: 'Full-paper simulations use the imported question order, the source duration and the source scoring rules. Anything the source does not state is shown as unknown rather than assumed.',
        actions: `<a class="btn btn-quiet" href="#/help">How simulations work</a>`,
      })}

      <div class="kpi-grid">
        ${tile({ label: 'Papers stored', value: String(papers.length), sub: `${totals.complete} with a complete question set`, source: 'supplied', where: 'Imported paper records', icon: 'book' })}
        ${tile({ label: 'Questions available', value: String(totals.questions), sub: `${state.subjects.length} subject group(s)`, source: 'supplied', where: 'Stored in local IndexedDB', icon: 'layers' })}
        ${tile({ label: 'Rules unknown', value: String(totals.unknownRules), sub: totals.unknownRules ? 'configure before scoring' : 'all papers state their rules', tone: totals.unknownRules ? 'warn' : 'ok', source: totals.unknownRules ? 'unavailable' : 'supplied', where: 'Source paper scoring metadata', icon: 'alert' })}
        ${tile({ label: 'Unfinished tests', value: String(unfinished.length), sub: unfinished.length ? 'resume below' : 'nothing pending', tone: unfinished.length ? 'accent' : '', source: 'measured', where: 'Active local test sessions', icon: 'clock' })}
      </div>

      ${
        unfinished.length
          ? card({
              title: 'Resume an unfinished test',
              tone: 'accent',
              right: sourceChip('measured', 'autosaved'),
              body: `${unfinished
                .map((t) => {
                  const p = tests.testProgress(t);
                  return `<div class="spread row-divider">
                  <div>
                    <strong>${esc(t.label || t.kind)}</strong>
                    <div class="tiny muted">${esc(tests.describeTest(t))} · started ${esc(fmtDate(t.started_at || t.created_at))} · ${p.answered} answered, ${p.unanswered} left${t.timer?.remaining_seconds !== null && t.timer?.remaining_seconds !== undefined ? ` · ${esc(fmtClock(t.timer.remaining_seconds))} remaining` : ''}${t.status === 'paused' ? ' · paused' : ''}</div>
                  </div>
                  <div class="row tight">
                    <button class="btn btn-primary btn-sm" type="button" data-action="resume" data-test="${esc(t.id)}">Resume</button>
                    <button class="btn btn-sm" type="button" data-action="abandon" data-test="${esc(t.id)}">Discard</button>
                  </div>
                </div>`;
                })
                .join('')}`,
            })
          : ''
      }

      <div class="section-head">
        <div><span class="section-kicker">Simulations</span><h2>Available papers</h2></div>
        <div class="toolbar">
          <label class="field field-inline m-0"><span class="label-text">Sort</span>
            <select id="paperSort" class="w-narrow">
              <option value="newest" ${viewState.sort === 'newest' ? 'selected' : ''}>Newest first</option>
              <option value="oldest" ${viewState.sort === 'oldest' ? 'selected' : ''}>Oldest first</option>
              <option value="name" ${viewState.sort === 'name' ? 'selected' : ''}>Paper name</option>
              <option value="questions" ${viewState.sort === 'questions' ? 'selected' : ''}>Most questions</option>
            </select>
          </label>
        </div>
      </div>
      <div class="filter-chips mb-3" role="group" aria-label="Filter papers">
        ${PAPER_FILTERS.map((f) => filterChip({ id: f.id, label: f.label, count: countsByFilter[f.id], pressed: viewState.filter === f.id, action: 'paper-filter' })).join('')}
      </div>
      ${
        shownPapers.length
          ? shownPapers.map(({ paper, summary }) => paperCard(paper, summary)).join('')
          : emptyState({ title: 'No paper matches this filter', message: 'Clear the filter to see every stored paper.', action: `<button class="btn" type="button" data-action="paper-filter" data-value="all">Show all papers</button>`, iconName: 'filter' })
      }

      ${
        submitted.length
          ? card({
              title: 'Recent submitted tests',
              right: sourceChip('measured', 'submitted'),
              body: dataTable({
                columns: [{ label: 'Test' }, { label: 'Submitted' }, { label: 'Score', num: true }, { label: 'Accuracy', num: true }, { label: '' }],
                rows: submitted.map((t) => {
                  const r = t.result || {};
                  const answered = (r.counts?.correct || 0) + (r.counts?.incorrect || 0);
                  return [
                    `${esc(t.label || t.kind)}<div class="tiny muted">${esc(tests.describeTest(t))}</div>`,
                    esc(fmtDate(t.submitted_at)),
                    `${esc(fmtMarks(r.score ?? NaN))} / ${esc(fmtMarks(r.max_marks ?? NaN))}`,
                    answered ? `${esc(fmtPct(r.accuracy, 0))} <span class="tiny muted">(${answered} judged)</span>` : '<span class="soft">—</span>',
                    `<a class="btn btn-sm" href="#/report/${esc(t.id)}">Open report</a>`,
                  ];
                }),
                className: 'compact',
              }),
            })
          : ''
      }

      ${notice(
        `Papers are shown exactly as they were imported. If a paper is incomplete, has a disputed key or lacks stated scoring rules, that is displayed above — MyMPPSC will not fill the gap with invented questions, answers or marks.`,
        'info',
      )}`;
  },

  async mount(ctx, root) {
    document.getElementById('paperSort')?.addEventListener('change', async (ev) => {
      viewState.sort = ev.target.value;
      await ctx.refresh();
    });

    root.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'paper-filter') {
        viewState.filter = btn.dataset.value || 'all';
        await ctx.refresh();
        return;
      }
      if (action === 'resume') {
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
            ${incompletePaperNotice(summary)}
            ${scoringUnknownNotice(paper)}
            ${notice(
              `Source files: ${(paper.source_files || []).map((f) => esc(f.path || 'unnamed')).join(', ') || 'not recorded'}<br />
               Import validation: ${esc(paper.import_validation?.status || 'unknown')} ${paper.import_validation?.notes ? `— ${esc(paper.import_validation.notes)}` : ''}<br />
               Original order preserved: ${paper.original_order_preserved ? 'yes' : 'reconstructed at import (flagged)'}${paper.placeholder ? '<br />This is a placeholder paper created because the imported bank had no metadata for it.' : ''}`,
              'info',
            )}
            ${dataTable({
              columns: [{ label: 'Q no.' }, { label: 'Subject' }, { label: 'Topic' }, { label: 'Key' }, { label: 'Explanation' }],
              rows: questions.slice(0, 60).map((q) => [
                esc(String(q.question_number ?? '—')),
                esc(q.subject || 'Unclassified'),
                esc(q.topic || '—'),
                answerKeyBadge(q.answerStatus),
                badge(q.explanationStatus || 'missing', q.explanationStatus === 'reviewed' || q.explanationStatus === 'approved' ? 'ok' : 'warn'),
              ]),
              className: 'compact',
            })}
            ${questions.length > 60 ? `<p class="tiny muted">Showing 60 of ${questions.length} questions.</p>` : ''}`,
          actions: [{ label: 'Close', tone: 'btn-primary', value: 'close' }],
        });
      } else if (action === 'start-paper') {
        const paper = state.papers.get(btn.dataset.paper);
        const summary = paperSummary(paper, Array.from(state.questionIndex.values()));
        const answered = await openModal({
          title: `Start full simulation — ${paper.paper_name || paper.paper_id}`,
          wide: true,
          body: `
            ${incompletePaperNotice(summary)}
            ${scoringUnknownNotice(paper)}
            <p class="small">This simulation will use the paper's original question order (${paper.question_order.length} stored questions), the source duration when known, and the source scoring rules.</p>
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
        config.usePaperRules = paper.scoring?.rules_known ? Boolean(document.getElementById('practiceCfgUsePaperRules')?.checked) : false;
        const strict = Boolean(document.getElementById('simulationStrict')?.checked);
        const questionIds = strict ? paper.question_order.slice() : paper.question_order.slice();
        await startPracticeTest(ctx, {
          kind: 'pyq_full',
          label: `${paper.paper_name || paper.exam || paper.paper_id}${paper.year ? ` ${paper.year}` : ''}${paper.set_code ? ` (set ${paper.set_code})` : ''}`,
          questionIds,
          metas: questionIds.map((id) => state.questionIndex.get(id)).filter(Boolean),
          config,
          orderSource: 'original',
          paper,
          selectionNotes: strict ? ['Original paper order retained.'] : [],
        });
      }
    });
  },
};
