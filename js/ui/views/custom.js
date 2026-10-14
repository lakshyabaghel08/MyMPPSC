/**
 * custom.js — Custom test builder.
 *
 * Assemble a test from selected years, papers, subjects, topics, subtopics and
 * question types. Subjects and topics are up front; years, papers and question
 * types tuck behind one disclosure. Session size and feedback stay visible,
 * while scoring, timing, confidence and repeat handling are summarised in
 * plain language and editable under "Advanced settings". Custom tests are
 * always labelled as such — they are never presented as authentic
 * previous-year papers.
 */

import { state } from '../../core/state.js';
import { esc, card, dataTable, toast, emptyState, confirmDialog, infoToggle } from '../components.js';
import { QUESTION_TYPES } from '../../core/constants.js';
import { filterMetas, selectQuestions, ATTEMPT_STATE_FILTERS } from '../../services/select.js';
import { configFields, readConfig, mountConfigFields, startPracticeTest, currentAttemptSummary, countSummary } from './shared.js';

const viewState = {
  years: [],
  papers: [],
  subjects: [],
  topics: [],
  questionTypes: [],
  attemptState: 'any',
  strategy: 'random',
  excludeDemonstration: false,
  includeAttempted: true,
  orderRandom: true,
};

function readSelection() {
  const selected = (name) => Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);
  viewState.years = selected('cbYear');
  viewState.papers = selected('cbPaper');
  viewState.subjects = selected('cbSubject');
  viewState.topics = selected('cbTopic');
  viewState.questionTypes = selected('cbType');
  viewState.attemptState = document.getElementById('customAttempt')?.value || 'any';
  viewState.strategy = document.getElementById('customStrategy')?.value || 'random';
  viewState.includeAttempted = Boolean(document.getElementById('customIncludeAttempted')?.checked);
  viewState.orderRandom = Boolean(document.getElementById('customOrderRandom')?.checked);
  viewState.excludeDemonstration = Boolean(document.getElementById('customExcludeDemo')?.checked);
  return viewState;
}

function checkboxGroup(name, items, selectedValues, { columns = 3 } = {}) {
  if (!items.length) return '<p class="muted small">Nothing available.</p>';
  return `<div class="grid cols-${columns} gap-xs">${items
    .map(
      (item) => `<label class="check mb-1"><input type="checkbox" name="${esc(name)}" value="${esc(item.value)}" ${selectedValues.includes(item.value) ? 'checked' : ''} />
      <span>${esc(item.label)}${item.count !== undefined ? ` <span class="soft tiny">(${item.count})</span>` : ''}</span></label>`,
    )
    .join('')}</div>`;
}

export default {
  title: 'Custom Test',

  async render() {
    const metas = Array.from(state.questionIndex.values());
    if (!metas.length) {
      return `
        <h1>Custom Test</h1>
        ${card({
          title: 'The custom test builder needs a question bank',
          body: emptyState({
            title: 'No questions stored yet',
            message: 'Import a validated question bank first.',
            action: '<a class="btn btn-primary" href="#/bank">Question Bank &amp; Imports</a>',
          }),
        })}`;
    }
    const attemptSummary = await currentAttemptSummary();

    const filters = {
      year: viewState.years.length === 1 ? viewState.years[0] : null,
      paperId: viewState.papers.length === 1 ? viewState.papers[0] : null,
      subject: viewState.subjects.length === 1 ? viewState.subjects[0] : null,
      topic: viewState.topics.length === 1 ? viewState.topics[0] : null,
      questionType: viewState.questionTypes.length === 1 ? viewState.questionTypes[0] : null,
      attemptState: viewState.attemptState,
      excludeDemonstration: viewState.excludeDemonstration,
    };
    const pool = filterMetas(metas, filters, attemptSummary).filter((m) => {
      if (viewState.years.length && !viewState.years.includes(String(m.year))) return false;
      if (viewState.papers.length && !viewState.papers.includes(m.paper_id)) return false;
      if (viewState.subjects.length && !viewState.subjects.includes(m.subject || 'Unclassified')) return false;
      if (viewState.topics.length && !viewState.topics.includes(m.topic || 'Unclassified')) return false;
      if (viewState.questionTypes.length && !viewState.questionTypes.includes(m.question_type)) return false;
      if (!viewState.includeAttempted && attemptSummary.get(m.id)?.attempts) return false;
      return true;
    });

    const years = Array.from(new Set(metas.map((m) => m.year).filter((y) => y !== null && y !== undefined))).sort((a, b) => Number(b) - Number(a));
    const papers = Array.from(state.papers.values());
    const subjects = Array.from(new Set(metas.map((m) => m.subject || 'Unclassified'))).sort();
    const topics = Array.from(new Set(metas.filter((m) => !viewState.subjects.length || viewState.subjects.includes(m.subject || 'Unclassified')).map((m) => m.topic || 'Unclassified'))).sort();
    const types = Object.keys(QUESTION_TYPES).filter((t) => metas.some((m) => m.question_type === t));

    const byType = Object.entries(
      pool.reduce((acc, m) => {
        acc[m.question_type] = (acc[m.question_type] || 0) + 1;
        return acc;
      }, {}),
    ).map(([type, count]) => [esc(QUESTION_TYPES[type] || type), String(count)]);

    return `
      <h1>Custom Test</h1>
      <p class="muted">Assemble a set from the questions you choose — nothing selected means everything available.</p>
      ${infoToggle('About custom tests', '<p class="small m-0">A custom test is assembled from the questions you choose. It is <strong>not</strong> an authentic previous-year paper and will be labelled as a custom set in the test and in the report.</p>')}

      ${card({
        title: 'What to include',
        subtitle: 'All optional — leave everything unselected to draw from the whole bank',
        body: `
          <div class="split-2">
            <div>
              <h3>Subjects</h3>
              ${checkboxGroup('cbSubject', subjects.map((s) => ({ value: s, label: s, count: metas.filter((m) => (m.subject || 'Unclassified') === s).length })), viewState.subjects, { columns: 2 })}
            </div>
            <div>
              <h3>Topics</h3>
              <p class="tiny muted mt-0">Filtered by the subjects you selected</p>
              ${checkboxGroup('cbTopic', topics.map((t) => ({ value: t, label: t, count: metas.filter((m) => (m.topic || 'Unclassified') === t).length })), viewState.topics, { columns: 1 })}
            </div>
          </div>
          <details class="disclosure mt-2">
            <summary>Narrow further by year, paper or question type</summary>
            <h3>Years</h3>
            ${checkboxGroup('cbYear', years.map((y) => ({ value: String(y), label: String(y), count: metas.filter((m) => String(m.year) === String(y)).length })), viewState.years, { columns: 4 })}
            <h3>Papers</h3>
            ${checkboxGroup('cbPaper', papers.map((p) => ({ value: p.paper_id, label: `${p.paper_name || p.paper_id}${p.year ? ` (${p.year}${p.set_code ? `, set ${p.set_code}` : ''})` : ''}`, count: metas.filter((m) => m.paper_id === p.paper_id).length })), viewState.papers, { columns: 1 })}
            <h3>Question types</h3>
            ${checkboxGroup('cbType', types.map((t) => ({ value: t, label: QUESTION_TYPES[t], count: metas.filter((m) => m.question_type === t).length })), viewState.questionTypes, { columns: 1 })}
          </details>`,
      })}

      ${card({
        title: 'Pool and strategy',
        subtitle: `${pool.length} question(s) match`,
        body: `
          ${countSummary({ total: pool.length, unseen: pool.filter((m) => !attemptSummary.get(m.id)?.attempts).length, incorrect: pool.filter((m) => attemptSummary.get(m.id)?.everIncorrect).length, skipped: pool.filter((m) => attemptSummary.get(m.id)?.everSkipped).length })}
          <div class="field-row">
            <label class="field"><span class="label-text">Previously attempted questions</span>
              <select id="customAttempt">${Object.entries(ATTEMPT_STATE_FILTERS).map(([k, label]) => `<option value="${esc(k)}" ${viewState.attemptState === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
            </label>
            <label class="field"><span class="label-text">Selection strategy</span>
              <select id="customStrategy">
                <option value="random" ${viewState.strategy === 'random' ? 'selected' : ''}>Random from the pool</option>
                <option value="least-attempted" ${viewState.strategy === 'least-attempted' ? 'selected' : ''}>Least attempted first (widen coverage)</option>
                <option value="weakest-first" ${viewState.strategy === 'weakest-first' ? 'selected' : ''}>Weakest performance first</option>
              </select>
            </label>
          </div>
          <details class="disclosure">
            <summary>More pool options</summary>
            <label class="check mt-2"><input type="checkbox" id="customIncludeAttempted" ${viewState.includeAttempted ? 'checked' : ''} /><span>Include questions I have already attempted (repeat rules still apply within the pool)</span></label>
            <label class="check"><input type="checkbox" id="customOrderRandom" ${viewState.orderRandom ? 'checked' : ''} /><span>Shuffle the order of questions in this custom test</span></label>
            <label class="check"><input type="checkbox" id="customExcludeDemo" ${viewState.excludeDemonstration ? 'checked' : ''} /><span>Exclude demonstration questions</span></label>
          </details>
          ${dataTable({ columns: [{ label: 'Question type' }, { label: 'In pool', num: true }], rows: byType, className: 'compact' })}
        `,
      })}

      ${card({
        title: 'Test settings',
        body: `${configFields({ paper: null, defaultCount: Math.min(25, Math.max(1, pool.length)), maxCount: pool.length, allowCustomScoring: true })}
        <div class="sticky-actions">
          <button class="btn btn-primary" type="button" id="assembleCustom" ${pool.length ? '' : 'disabled'}>Assemble custom test</button>
          <span class="tiny muted">${pool.length ? `${pool.length} question(s) in the pool.` : 'Select more filters to build a pool.'}</span>
        </div>`,
      })}`;
  },

  async mount(ctx, root) {
    mountConfigFields({ defaultCount: 25 });
    const rerender = async () => {
      readSelection();
      await ctx.refresh();
    };
    root.querySelectorAll('input[type="checkbox"][name^="cb"], #customAttempt, #customStrategy, #customIncludeAttempted, #customOrderRandom, #customExcludeDemo').forEach((el) => {
      el.addEventListener('change', rerender);
    });

    document.getElementById('assembleCustom')?.addEventListener('click', async () => {
      const selection = readSelection();
      const metas = Array.from(state.questionIndex.values());
      const attemptSummary = await currentAttemptSummary();
      let pool = filterMetas(metas, { attemptState: selection.attemptState, excludeDemonstration: selection.excludeDemonstration }, attemptSummary).filter((m) => {
        if (selection.years.length && !selection.years.includes(String(m.year))) return false;
        if (selection.papers.length && !selection.papers.includes(m.paper_id)) return false;
        if (selection.subjects.length && !selection.subjects.includes(m.subject || 'Unclassified')) return false;
        if (selection.topics.length && !selection.topics.includes(m.topic || 'Unclassified')) return false;
        if (selection.questionTypes.length && !selection.questionTypes.includes(m.question_type)) return false;
        if (!selection.includeAttempted && attemptSummary.get(m.id)?.attempts) return false;
        return true;
      });
      if (!pool.length) {
        toast('No questions match this selection.', 'warn');
        return;
      }
      const config = readConfig('practiceCfg', {});
      const pick = selectQuestions(pool, {
        count: config.count,
        strategy: selection.strategy,
        attemptSummary,
        repeatPolicy: { ...state.settings.repeatPolicy, preferUnseen: config.preferUnseen },
      });
      const ids = pick.selected.map((m) => m.id);
      const ok = await confirmDialog({
        title: 'Start this custom test?',
        message: `<strong>${ids.length}</strong> question(s) from your selection will be used.
          ${selection.orderRandom ? 'Question order will be shuffled.' : 'Questions keep their paper order within each paper.'}
          ${config.randomizeOptions ? 'Option order will be randomised where it is safe — matching questions are never reordered.' : 'Options stay in their original order.'}
          <br /><br />Scoring: ${config.usePaperRules ? 'the source paper rules apply' : `+${esc(String(config.scoring.marksPerCorrect))} correct${config.scoring.negativeMarkingEnabled ? `, −${esc(String(config.scoring.negativeMarksPerIncorrect))} incorrect` : ', no negative marking'}.`}`,
        confirmLabel: 'Start test',
      });
      if (!ok) return;
      await startPracticeTest(ctx, {
        kind: 'custom',
        label: 'Custom test',
        questionIds: ids,
        metas: pick.selected,
        config: { ...config, orderRandom: selection.orderRandom },
        orderSource: selection.orderRandom ? 'shuffled' : 'as_selected',
        selectionNotes: ['Custom test assembled by you — not an authentic previous-year paper.', ...pick.notes],
      });
    });
  },
};
