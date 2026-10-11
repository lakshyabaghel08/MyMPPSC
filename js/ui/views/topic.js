/**
 * topic.js — Topic-wise practice.
 *
 * Filter by subject/topic/subtopic, year, paper, question type and attempt
 * history; see how many questions match before starting; configure session size,
 * feedback timing, confidence, option shuffling and scoring.
 */

import { state } from '../../core/state.js';
import { esc, card, dataTable, toast, emptyState } from '../components.js';
import { QUESTION_TYPES, LANGUAGE_LABELS } from '../../core/constants.js';
import { filterMetas, availability, selectQuestions, ATTEMPT_STATE_FILTERS } from '../../services/select.js';
import { configFields, readConfig, startPracticeTest, countSummary, availabilityTable, currentAttemptSummary } from './shared.js';

const viewState = {
  filters: { subject: 'all', topic: 'all', subtopic: 'all', year: 'all', paperId: 'all', questionType: 'all', attemptState: 'any', language: 'all', excludeDemonstration: false, onlyReviewedExplanation: false, search: '' },
};

function filtersMarkup(filters, options) {
  return `
    <div class="filters">
      <label class="field"><span class="label-text">Subject</span>
        <select id="fSubject"><option value="all">All subjects</option>${options.subjects.map((s) => `<option value="${esc(s)}" ${filters.subject === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="label-text">Topic</span>
        <select id="fTopic"><option value="all">All topics</option>${options.topics.map((t) => `<option value="${esc(t)}" ${filters.topic === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="label-text">Subtopic</span>
        <select id="fSubtopic"><option value="all">All subtopics</option>${options.subtopics.map((t) => `<option value="${esc(t)}" ${filters.subtopic === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="label-text">Year</span>
        <select id="fYear"><option value="all">All years</option>${options.years.map((y) => `<option value="${esc(y)}" ${String(filters.year) === String(y) ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="label-text">Paper</span>
        <select id="fPaper"><option value="all">All papers</option>${options.papers.map((p) => `<option value="${esc(p.paper_id)}" ${filters.paperId === p.paper_id ? 'selected' : ''}>${esc(p.paper_name || p.paper_id)}${p.year ? ` (${esc(String(p.year))}${p.set_code ? `, ${esc(p.set_code)}` : ''})` : ''}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="label-text">Question type</span>
        <select id="fType"><option value="all">All types</option>${Object.entries(QUESTION_TYPES).map(([k, label]) => `<option value="${esc(k)}" ${filters.questionType === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="label-text">Attempt history</span>
        <select id="fAttempt">${Object.entries(ATTEMPT_STATE_FILTERS).map(([k, label]) => `<option value="${esc(k)}" ${filters.attemptState === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="label-text">Language availability</span>
        <select id="fLanguage"><option value="all">Any</option>${Object.entries(LANGUAGE_LABELS).map(([k, label]) => `<option value="${esc(k)}" ${filters.language === k ? 'selected' : ''}>Has ${esc(label)} text</option>`).join('')}</select>
      </label>
      <label class="field"><span class="label-text">Search id, subject or topic</span>
        <input type="search" id="fSearch" value="${esc(filters.search)}" placeholder="e.g. Narmada" />
      </label>
    </div>
    <div class="row" style="margin-top:6px">
      <label class="check" style="margin:0"><input type="checkbox" id="fExcludeDemo" ${filters.excludeDemonstration ? 'checked' : ''} /><span>Exclude demonstration questions</span></label>
      <label class="check" style="margin:0"><input type="checkbox" id="fReviewed" ${filters.onlyReviewedExplanation ? 'checked' : ''} /><span>Only questions with a reviewed explanation</span></label>
      <button class="btn btn-sm" type="button" id="fReset">Reset filters</button>
    </div>`;
}

function readFilters() {
  const value = (id) => document.getElementById(id)?.value;
  return {
    subject: value('fSubject') ?? 'all',
    topic: value('fTopic') ?? 'all',
    subtopic: value('fSubtopic') ?? 'all',
    year: value('fYear') ?? 'all',
    paperId: value('fPaper') ?? 'all',
    questionType: value('fType') ?? 'all',
    attemptState: value('fAttempt') ?? 'any',
    language: value('fLanguage') ?? 'all',
    search: value('fSearch') ?? '',
    excludeDemonstration: Boolean(document.getElementById('fExcludeDemo')?.checked),
    onlyReviewedExplanation: Boolean(document.getElementById('fReviewed')?.checked),
  };
}

export default {
  title: 'Topic Practice',

  async render(ctx) {
    const metas = Array.from(state.questionIndex.values());
    if (!metas.length) {
      return card({
        title: 'Topic practice needs a question bank',
        body: emptyState({ title: 'No questions stored yet', message: 'Import a validated bank first; this screen will then let you filter by subject, topic, subtopic, year, paper, question type and attempt history.', action: '<a class="btn btn-primary" href="#/bank">Question Bank &amp; Imports</a>' }),
      });
    }
    const attemptSummary = await currentAttemptSummary();
    const filters = viewState.filters;
    const matching = filterMetas(metas, filters, attemptSummary);
    const availabilityData = availability(metas, filters, attemptSummary);

    const subjectOptions = Array.from(new Set(metas.map((m) => m.subject || 'Unclassified'))).sort();
    const topicOptions = Array.from(new Set(metas.filter((m) => filters.subject === 'all' || (m.subject || 'Unclassified') === filters.subject).map((m) => m.topic || 'Unclassified'))).sort();
    const subtopicOptions = Array.from(new Set(metas.filter((m) => (filters.subject === 'all' || (m.subject || 'Unclassified') === filters.subject) && (filters.topic === 'all' || (m.topic || 'Unclassified') === filters.topic) && m.subtopic).map((m) => m.subtopic))).sort();
    const yearOptions = Array.from(new Set(metas.map((m) => m.year).filter((y) => y !== null && y !== undefined))).sort((a, b) => Number(b) - Number(a));
    const papers = Array.from(state.papers.values());

    const topicStats = Object.entries(availabilityData.byTopic)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 14);

    return `
      <h1>Topic Practice</h1>
      <p class="muted">Choose exactly what you want to practise. Counts update as you change the filters, before you start.</p>

      ${card({ title: 'Filters', body: filtersMarkup(filters, { subjects: subjectOptions, topics: topicOptions, subtopics: subtopicOptions, years: yearOptions, papers }) })}

      ${card({
        title: 'Available questions',
        body: `
          ${countSummary(availabilityData)}
          <div class="split-2">
            <div>${dataTable({
              columns: [{ label: 'Topic' }, { label: 'Questions', num: true }],
              rows: topicStats.map((t) => [esc(t.key.split('||').join(' · ')), String(t.count)]),
              empty: 'No questions match the current filters.',
              className: 'compact',
            })}</div>
            <div>${availabilityTable(availabilityData)}</div>
          </div>`,
      })}

      ${card({
        title: 'Session settings',
        subtitle: `${matching.length} question(s) will be drawn from`,
        body: `
          ${configFields({ paper: null, defaultCount: Math.min(20, Math.max(1, matching.length)), maxCount: matching.length, allowCustomScoring: true })}
          <div class="row">
            <label class="field" style="flex:1 1 220px"><span class="label-text">Selection strategy</span>
              <select id="practiceStrategy">
                <option value="random">Random from the matching set</option>
                <option value="least-attempted">Least attempted first</option>
                <option value="weakest-first">Weakest performance first</option>
              </select>
            </label>
          </div>
          <div class="sticky-actions">
            <button class="btn btn-primary" type="button" id="startTopic" ${matching.length ? '' : 'disabled'}>Start practice session</button>
            <span class="tiny muted">${matching.length ? `${availabilityData.unseen} of these have never been attempted.` : 'Adjust the filters to enable this.'}</span>
          </div>`,
      })}`;
  },

  async mount(ctx, root) {
    const rerender = async () => {
      viewState.filters = readFilters();
      await ctx.refresh();
    };
    ['fSubject', 'fTopic', 'fSubtopic', 'fYear', 'fPaper', 'fType', 'fAttempt', 'fLanguage'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', rerender);
    });
    ['fExcludeDemo', 'fReviewed'].forEach((id) => document.getElementById(id)?.addEventListener('change', rerender));
    let searchTimer = null;
    document.getElementById('fSearch')?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(rerender, 350);
    });
    document.getElementById('fReset')?.addEventListener('click', async () => {
      viewState.filters = { subject: 'all', topic: 'all', subtopic: 'all', year: 'all', paperId: 'all', questionType: 'all', attemptState: 'any', language: 'all', excludeDemonstration: false, onlyReviewedExplanation: false, search: '' };
      await ctx.refresh();
    });

    document.getElementById('startTopic')?.addEventListener('click', async () => {
      const metas = Array.from(state.questionIndex.values());
      const attemptSummary = await currentAttemptSummary();
      const config = readConfig('practiceCfg', {});
      const strategy = document.getElementById('practiceStrategy')?.value || 'random';
      const candidates = filterMetas(metas, viewState.filters, attemptSummary);
      const pick = selectQuestions(candidates, {
        count: config.count,
        strategy: strategy === 'smart' ? 'weakest-first' : strategy,
        attemptSummary,
        repeatPolicy: { ...state.settings.repeatPolicy, preferUnseen: config.preferUnseen },
      });
      if (!pick.selected.length) {
        toast('No questions match the current filters.', 'warn');
        return;
      }
      const f = viewState.filters;
      const label = [f.subject !== 'all' ? f.subject : 'All subjects', f.topic !== 'all' ? f.topic : null, f.year !== 'all' ? f.year : null, f.questionType !== 'all' ? QUESTION_TYPES[f.questionType] : null].filter(Boolean).join(' · ');
      await startPracticeTest(ctx, {
        kind: 'topic',
        label: `Topic practice — ${label}`,
        questionIds: pick.selected.map((m) => m.id),
        metas: pick.selected,
        config: { ...config, usePaperRules: false, scoring: config.scoring || { source: 'custom', ...state.settings.defaultScoring } },
        orderSource: config.randomizeQuestions ? 'shuffled' : 'as_selected',
        selectionNotes: pick.notes,
      });
    });
  },
};
