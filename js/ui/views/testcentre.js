/**
 * testcentre.js — PYQ Test Centre.
 *
 * Select a previous-year paper and attempt it in its stored order. Source
 * metadata is distinguished from the latest-pattern practice scoring policy;
 * applying that policy to older papers is not a claim about historical rules.
 * Unfinished tests can be resumed.
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
  infoToggle,
  demoBadge,
} from '../components.js';
import { fmtDate, fmtMarks, fmtPct, fmtClock } from '../../core/util.js';
import { paperSummary } from '../../services/select.js';
import * as tests from '../../services/tests.js';
import { resolveScoringRules } from '../../services/scoring.js';
import { configFields, readConfig, mountConfigFields, scoringUnknownNotice, startPracticeTest } from './shared.js';
import { shuffle } from '../../core/util.js';

function paperCard(paper, summary) {
  const questions = summary.present;
  const ready = questions > 0;
  const resolved = resolveScoringRules({ paper });
  const hasScoring = Boolean(resolved.rules);
  const isLatestPractice = resolved.schemeId === 'mppsc-sse-prelims-latest-practice' && !paper.user_scoring_override;
  const flags = [];
  if (summary.placeholder) flags.push(badge('paper metadata missing', 'bad'));
  if (!hasScoring) flags.push(badge('scoring rules unknown', 'warn'));
  if (summary.disputed) flags.push(badge(`${summary.disputed} disputed answer(s)`, 'bad'));
  if (summary.missingAnswers) flags.push(badge(`${summary.missingAnswers} question(s) without a key`, 'warn'));
  if (paper.is_demonstration) flags.push(demoBadge(true));

  const scoringText = hasScoring
    ? `Scoring: +${fmtMarks(resolved.rules.marks_per_correct)} per correct${resolved.rules.negative_marking_enabled ? `, −${fmtMarks(resolved.rules.negative_marks_per_incorrect)} per incorrect` : ', no negative marking'}, ${fmtMarks(resolved.rules.marks_for_unanswered)} unanswered${isLatestPractice ? '; current-pattern practice policy, not a historical-rule claim' : ''}.`
    : 'Scoring rules are not yet known for this paper.';
  const scoringLine = hasScoring
    ? `+${fmtMarks(resolved.rules.marks_per_correct)} / −${fmtMarks(resolved.rules.negative_marks_per_incorrect)} / ${fmtMarks(resolved.rules.marks_for_unanswered)} scoring`
    : 'scoring not set yet';
  const facts = [
    `${questions} question${questions === 1 ? '' : 's'}`,
    paper.duration_minutes ? `${paper.duration_minutes} min` : null,
    scoringLine,
  ].filter(Boolean).join(' · ');

  return `<section class="card">
    <div class="card-body">
      <div class="spread">
        <div class="grow">
          <div class="row tight">
            <h3 class="mb-1">${esc(paper.paper_name || paper.paper_id)}</h3>
            ${isLatestPractice ? badge('latest pattern · practice only', 'info') : ''}
          </div>
          <p class="muted small m-0">${esc(facts)}${flags.length ? ` · ${flags.join(' ')}` : ''}</p>
          ${infoToggle('Paper details', `<p class="small m-0">${esc(paper.exam || 'Examination not stated')}${paper.year ? ` · ${esc(String(paper.year))}` : ''}${paper.set_code ? ` · set ${esc(paper.set_code)}` : ''}${paper.paper_code ? ` · ${esc(paper.paper_code)}` : ''}<br />${esc(scoringText)}${summary.bilingual ? `<br />${summary.bilingual} question(s) have both English and Hindi text.` : ''}</p>`)}
        </div>
        <div class="row tight">
          <button class="btn btn-primary" type="button" data-action="start-paper" data-paper="${esc(paper.paper_id)}" ${ready ? '' : 'disabled'}>Start full simulation</button>
          <button class="btn" type="button" data-action="paper-details" data-paper="${esc(paper.paper_id)}">Details</button>
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
        <h1>PYQ Test Centre</h1>
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
    const totals = paperSummaries.reduce(
      (acc, { summary }) => ({
        questions: acc.questions + summary.present,
        unknownRules: acc.unknownRules + (summary.scoringKnown ? 0 : 1),
      }),
      { questions: 0, unknownRules: 0 },
    );

    return `
      <h1>PYQ Test Centre</h1>
      <p class="muted">Pick a paper and attempt it in its original order, scored +3 / −1 / 0.</p>
      ${infoToggle('About scoring and these papers', '<p class="small m-0">Full-paper practice follows the stored question order. Source metadata is shown separately from practice scoring: the latest reported MPPSC pattern (+3/−1/0) is applied to the bundled 2013–2024 papers by policy, not as a claim about each paper’s historical rules. Everything is stored in local IndexedDB on this device.</p>')}

      <div class="grid tiles mb-4">
        ${tile({ label: 'Papers stored', value: String(papers.length), sub: 'ready for a full simulation' })}
        ${tile({ label: 'Questions available', value: String(totals.questions), sub: `${state.subjects.length} subject groups` })}
        ${tile({ label: 'Rules unknown', value: String(totals.unknownRules), sub: 'configure before scoring', tone: totals.unknownRules ? 'warn' : '' })}
        ${tile({ label: 'Unfinished tests', value: String(unfinished.length), sub: unfinished.length ? 'resume below' : 'nothing pending', tone: unfinished.length ? 'accent' : '' })}
      </div>

      ${
        unfinished.length
          ? card({
              title: 'Resume an unfinished test',
              tone: 'accent',
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

      <h2 class="mt-5">Available papers</h2>
      ${paperSummaries.map(({ paper, summary }) => paperCard(paper, summary)).join('')}

      ${
        submitted.length
          ? card({
              title: 'Recent submitted tests',
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

      ${infoToggle('What is and is not claimed here', '<p class="small m-0">Question wording, order and imported metadata are shown as stored. Missing questions, keys and source metadata are not invented. The bundled 2013–2024 papers use the latest reported +3/−1/0 marking pattern for practice only; that policy does not establish their historical scoring rules.</p>')}`;
  },

  async mount(ctx, root) {
    root.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
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
            ${scoringUnknownNotice(paper)}
            ${notice(
              `Import validation: ${esc(paper.import_validation?.status || 'unknown')} ${paper.import_validation?.notes ? `— ${esc(paper.import_validation.notes)}` : ''}<br />
               Original order preserved: ${paper.original_order_preserved ? 'yes' : 'reconstructed at import (flagged)'}${paper.placeholder ? '<br />This is a placeholder paper created because the imported bank had no metadata for it.' : ''}`,
              'info',
            )}
            ${dataTable({
              columns: [{ label: 'Q no.' }, { label: 'Subject' }, { label: 'Topic' }, { label: 'Answer key' }, { label: 'Explanation' }],
              rows: questions.slice(0, 60).map((q) => [
                esc(String(q.question_number ?? '—')),
                esc(q.subject || 'Unclassified'),
                esc(q.topic || '—'),
                answerKeyBadge(q.answerStatus) || '<span class="soft tiny">available</span>',
                q.hasExplanation ? '<span class="soft tiny">supplied</span>' : badge('none', 'warn'),
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
    });
  },
};
