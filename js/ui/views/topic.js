/**
 * topic.js — Topic-wise practice.
 *
 * Filter by subject/topic/subtopic (year, paper, question type and attempt
 * history are tucked behind "More filters"); see how many questions match
 * before starting; configure the session size and feedback up front, with the
 * remaining rules summarised in plain language and editable under "Advanced
 * settings".
 */

import { state } from '../../core/state.js';
import { esc, card, dataTable, toast, emptyState, sourceChip, kpi, pageHead, sectionHead, filterChip } from '../components.js';
import { QUESTION_TYPES, LANGUAGE_LABELS } from '../../core/constants.js';
import { filterMetas, availability, selectQuestions, ATTEMPT_STATE_FILTERS } from '../../services/select.js';
import { configFields, readConfig, mountConfigFields, startPracticeTest, countSummary, availabilityTable, currentAttemptSummary } from './shared.js';

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
      <label class="field"><span class="label-text">Attempt history</span>
        <select id="fAttempt">${Object.entries(ATTEMPT_STATE_FILTERS).map(([k, label]) => `<option value="${esc(k)}" ${filters.attemptState === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
      </label>
    </div>
    <details class="disclosure mt-2">
      <summary>More filters — year, paper, question type, language</summary>
      <div class="filters mt-2">
        <label class="field"><span class="label-text">Year</span>
          <select id="fYear"><option value="all">All years</option>${options.years.map((y) => `<option value="${esc(y)}" ${String(filters.year) === String(y) ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select>
        </label>
        <label class="field"><span class="label-text">Paper</span>
          <select id="fPaper"><option value="all">All papers</option>${options.papers.map((p) => `<option value="${esc(p.paper_id)}" ${filters.paperId === p.paper_id ? 'selected' : ''}>${esc(p.paper_name || p.paper_id)}${p.year ? ` (${esc(String(p.year))}${p.set_code ? `, ${esc(p.set_code)}` : ''})` : ''}</option>`).join('')}</select>
        </label>
        <label class="field"><span class="label-text">Question type</span>
          <select id="fType"><option value="all">All types</option>${Object.entries(QUESTION_TYPES).map(([k, label]) => `<option value="${esc(k)}" ${filters.questionType === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
        </label>
        <label class="field"><span class="label-text">Language availability</span>
          <select id="fLanguage"><option value="all">Any</option>${Object.entries(LANGUAGE_LABELS).map(([k, label]) => `<option value="${esc(k)}" ${filters.language === k ? 'selected' : ''}>Has ${esc(label)} text</option>`).join('')}</select>
        </label>
        <label class="field"><span class="label-text">Search id, subject or topic</span>
          <input type="search" id="fSearch" value="${esc(filters.search)}" placeholder="e.g. Narmada" />
        </label>
      </div>
      <div class="row mt-2">
        <label class="check m-0"><input type="checkbox" id="fExcludeDemo" ${filters.excludeDemonstration ? 'checked' : ''} /><span>Exclude demonstration questions</span></label>
        <label class="check m-0"><input type="checkbox" id="fReviewed" ${filters.onlyReviewedExplanation ? 'checked' : ''} /><span>Only questions with a reviewed explanation</span></label>
      </div>
    </details>
    <div class="row mt-2">
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

  async render() {
    const metas = Array.from(state.questionIndex.values());
    if (!metas.length) {
      return `
        ${pageHead({ title: 'Topic Practice', description: 'Build a practice session from your own question bank — filter by subject, topic, subtopic, year, paper, question type and attempt history.' })}
        ${card({
          title: 'Topic practice needs a question bank',
          body: emptyState({
            title: 'No questions stored yet',
            message: 'Import a validated bank first; this screen will then let you filter by subject, topic, subtopic, year, paper, question type and attempt history.',
            action: '<a class="btn btn-primary" href="#/bank">Question Bank &amp; Imports</a>',
          }),
        })}`;
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

    const subjectChips = subjectOptions.length > 1
      ? `<div class="filter-chips mt-3" role="group" aria-label="Quick subject filter">
          ${['all', ...subjectOptions].map((subject) => filterChip({ id: subject, label: subject === 'all' ? 'All subjects' : subject, pressed: filters.subject === subject, action: 'subject-chip' })).join('')}
        </div>`
      : '';

    return `
      ${pageHead({
        title: 'Topic Practice',
        description: 'Pick a subject and go — or narrow it down further. Counts update as you change the filters, before you start. Session rules are pre-filled from your defaults; only size and feedback need a decision.',
        actions: `<a class="btn btn-quiet" href="#/bank">Question Bank &amp; Imports</a>`,
        meta: sourceChip('supplied', 'bank metadata'),
      })}

      <div class="kpi-grid">
        ${kpi({ label: 'Matching questions', value: String(availabilityData.total), context: 'against the current filters', tone: availabilityData.total ? 'accent' : 'warn', iconName: 'filter' })}
        ${kpi({ label: 'Never attempted', value: String(availabilityData.unseen), context: 'unseen questions in this set', iconName: 'sparkle' })}
        ${kpi({ label: 'Answered wrong before', value: String(availabilityData.incorrect), context: availabilityData.incorrect ? 'good revision candidates' : 'nothing wrong so far', tone: availabilityData.incorrect ? 'warn' : 'ok', iconName: 'alert' })}
        ${kpi({ label: 'Skipped before', value: String(availabilityData.skipped), context: 'left unanswered in past sessions', iconName: 'clock' })}
      </div>

      ${card({ title: 'Filters', right: sourceChip('measured', 'local attempt history'), body: filtersMarkup(filters, { subjects: subjectOptions, topics: topicOptions, subtopics: subtopicOptions, years: yearOptions, papers }) + subjectChips })}

      ${sectionHead({ title: 'Available questions', meta: `${availabilityData.total} of ${metas.length} stored question(s) match · ${availabilityData.unseen} never attempted`, kicker: 'Before you start' })}
      ${card({
        right: sourceChip('supplied', 'bank metadata'),
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
        right: sourceChip('derived', 'session rules'),
        body: `
          ${configFields({
            paper: null,
            defaultCount: Math.min(20, Math.max(1, matching.length)),
            maxCount: matching.length,
            allowCustomScoring: true,
            extraQuick: `
            <label class="field"><span class="label-text">Selection strategy</span>
              <select id="practiceStrategy">
                <option value="random">Random from the matching set</option>
                <option value="least-attempted">Least attempted first</option>
                <option value="weakest-first">Weakest performance first</option>
              </select>
            </label>`,
          })}
          <div class="sticky-actions">
            <button class="btn btn-primary" type="button" id="startTopic" ${matching.length ? '' : 'disabled'}>Start practice session</button>
            <span class="tiny muted">${matching.length ? `${availabilityData.unseen} of these have never been attempted.` : 'Adjust the filters to enable this.'}</span>
          </div>`,
      })}`;
  },

  async mount(ctx) {
    mountConfigFields({ defaultCount: 20 });
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
    document.getElementById('view')?.addEventListener('click', async (ev) => {
      const chip = ev.target.closest('[data-action="subject-chip"]');
      if (!chip) return;
      viewState.filters = { ...viewState.filters, subject: chip.dataset.value || 'all', topic: 'all', subtopic: 'all' };
      await ctx.refresh();
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
