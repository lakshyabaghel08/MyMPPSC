/**
 * topic.js — Topic & Custom Practice.
 *
 * Topic Practice and the Custom Test builder were two screens over the same
 * bank with the same filters, the same three selection strategies and the same
 * session form; one was simply the single-select version of the other. They are
 * one screen now, and the single-topic case is just the narrowest selection it
 * can make.
 *
 * Selection is a **union**: tick any subjects and any topics inside them and
 * the pool is everything ticked, nothing else. Tick nothing and the pool is the
 * whole bank. Two rules fall out of that, and they are the two bugs this screen
 * used to have:
 *
 *  - A topic can never be selected "under" a subject that is not selected, so
 *    a stale topic cannot silently narrow the pool to zero questions.
 *  - Every count shown here is counted **within its own subject**. "Unclassified"
 *    under Polity is Polity's own unclassified questions, not the nine from
 *    every subject that happen to have no topic label.
 *
 * Two decisions are kept apart on purpose, because conflating them is what made
 * "shuffle off" still hand out a random order:
 *
 *  - **Strategy** (random / least-attempted / weakest-first) decides *which*
 *    questions are picked from the pool.
 *  - **Shuffle question order** decides how the picked questions are *arranged*.
 *    Off means paper order — year, then paper, then question number — and
 *    `order_source` records which of the two actually happened.
 *
 * The screen re-renders in place whenever the selection or a filter changes;
 * expanding or collapsing a subject group is a DOM toggle only, and the set of
 * expanded groups is remembered across refreshes.
 */

import { state } from '../../core/state.js';
import { esc, card, toast, notice, emptyState, infoToggle, confirmDialog, screenHead, filterChip, cardInfo } from '../components.js';
import { QUESTION_TYPES, LANGUAGE_LABELS } from '../../core/constants.js';
import { parseTopicPracticeParam } from '../../core/util.js';
import { filterMetas, selectQuestions, ATTEMPT_STATE_FILTERS, arrangeForPaper } from '../../services/select.js';
import { configFields, readConfig, mountConfigFields, startPracticeTest, currentAttemptSummary } from './shared.js';

/** Form-memory key for the shared session form (see `shared.js`). */
const SCREEN = 'topic';

/** A question with no topic label is counted under this topic, inside its own subject. */
const NO_TOPIC = 'Unclassified';

const viewState = {
  /** The `#/topic/<param>` string already applied, so it is applied once per arrival. */
  appliedRoute: '',
  /** subject -> { all: boolean, topics: Set<string> }. Empty map = the whole bank. */
  selection: new Map(),
  /** Subject groups the reader has opened. Survives in-place re-renders. */
  expanded: new Set(),
  /** Whether the "Narrow further" disclosure is open. */
  narrowOpen: false,
  strategy: 'random',
  shuffleOrder: false,
  filters: defaultFilters(),
};

function defaultFilters() {
  return {
    attemptState: 'any',
    years: [],
    papers: [],
    types: [],
    subtopic: 'all',
    language: 'all',
    onlyWithExplanation: false,
    search: '',
    excludeDemonstration: false,
  };
}

/** How many of the "Narrow further" controls are away from their default. */
function activeFilterCount() {
  const f = viewState.filters;
  let n = 0;
  if (f.attemptState !== 'any') n += 1;
  if (f.years.length) n += 1;
  if (f.papers.length) n += 1;
  if (f.types.length) n += 1;
  if (f.subtopic !== 'all') n += 1;
  if (f.language !== 'all') n += 1;
  if (f.onlyWithExplanation) n += 1;
  if (f.search.trim()) n += 1;
  if (f.excludeDemonstration) n += 1;
  return n;
}

/* ---------------------------------------------------------- selection ---- */

/**
 * The selected (subject, topic) pairs. A whole subject appears once with
 * `topic: null`, which is how "exactly one subject and at most one topic" is
 * recognised when the test kind is decided.
 */
function selectedPairs() {
  const pairs = [];
  for (const [subject, entry] of viewState.selection) {
    if (entry.all) pairs.push({ subject, topic: null });
    else for (const topic of entry.topics) pairs.push({ subject, topic });
  }
  return pairs;
}

/** Union semantics: nothing ticked means the whole bank. */
function matchesSelection(meta) {
  if (!viewState.selection.size) return true;
  const entry = viewState.selection.get(meta.subject || NO_TOPIC);
  if (!entry) return false;
  if (entry.all) return true;
  return entry.topics.has(meta.topic || NO_TOPIC);
}

function setSubject(subject, on) {
  if (!on) viewState.selection.delete(subject);
  else viewState.selection.set(subject, { all: true, topics: new Set() });
}

function setTopic(subject, topic, on) {
  let entry = viewState.selection.get(subject);
  if (on) {
    if (!entry || entry.all) {
      // Ticking one topic inside a whole subject narrows it to that topic plus
      // the ones already ticked; the subject stops being "all".
      entry = { all: false, topics: new Set() };
      viewState.selection.set(subject, entry);
    }
    entry.topics.add(topic);
    // Every topic of the subject ticked one by one is the same selection as
    // ticking the subject, and is reported the same way: the box reads as
    // checked rather than half-ticked, the summary says "whole subject", and a
    // single subject like that is still a topic session. Only the subject's
    // full topic list collapses it — a filter can hide topics, and silently
    // widening the selection behind a filter would surprise the reader later.
    const all = topicsOfSubject(subject);
    if (all.length && all.every((t) => entry.topics.has(t))) {
      entry.all = true;
      entry.topics.clear();
    }
  } else if (entry) {
    if (entry.all) {
      // Unticking one topic inside a whole subject keeps every other topic.
      const all = topicsOfSubject(subject);
      entry = { all: false, topics: new Set(all.filter((t) => t !== topic)) };
      viewState.selection.set(subject, entry);
    } else {
      entry.topics.delete(topic);
    }
    if (!entry.all && entry.topics.size === 0) viewState.selection.delete(subject);
  }
}

/** Topics the bank holds for a subject, in the order the picker lists them. */
function topicsOfSubject(subject) {
  return subjectGroups().find((g) => g.subject === subject)?.topics.map((t) => t.topic) || [];
}

/* ------------------------------------------------------------- counts ---- */

/**
 * Subject groups with their topics, counted over `pool`.
 *
 * Counts are per subject: the same topic name under two subjects is two
 * different rows with two different numbers, and a subject's "Unclassified"
 * row counts only that subject's questions with no topic label. A subject that
 * is selected but currently holds nothing (a filter narrowed it away) is still
 * listed, so a selection can never become invisible and impossible to undo.
 */
function subjectGroups(pool = null) {
  const source = pool || Array.from(state.questionIndex.values());
  const bySubject = new Map();
  for (const meta of source) {
    const subject = meta.subject || NO_TOPIC;
    const topic = meta.topic || NO_TOPIC;
    if (!bySubject.has(subject)) bySubject.set(subject, new Map());
    const topics = bySubject.get(subject);
    topics.set(topic, (topics.get(topic) || 0) + 1);
  }
  // Anything with a live selection is listed even when the pool no longer holds it.
  for (const subject of viewState.selection.keys()) if (!bySubject.has(subject)) bySubject.set(subject, new Map());

  return Array.from(bySubject.entries())
    .map(([subject, topics]) => ({
      subject,
      count: Array.from(topics.values()).reduce((a, b) => a + b, 0),
      topics: Array.from(topics.entries())
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic)),
    }))
    .sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject));
}

/* ------------------------------------------------------------- filter ---- */

function narrowedPool(metas, attemptSummary) {
  const f = viewState.filters;
  const pairs = selectedPairs();
  const single = pairs.length === 1 ? pairs[0] : null;
  // The subtopic control only exists when exactly one topic is selected; a
  // value left over from an earlier selection must not keep filtering.
  const subtopic = single && single.topic && f.subtopic !== 'all' ? f.subtopic : 'all';
  const base = filterMetas(
    metas,
    {
      attemptState: f.attemptState,
      language: f.language,
      onlyWithExplanation: f.onlyWithExplanation,
      excludeDemonstration: f.excludeDemonstration,
      search: f.search,
      subtopic,
    },
    attemptSummary,
  );
  return base.filter((m) => {
    if (f.years.length && !f.years.includes(String(m.year))) return false;
    if (f.papers.length && !f.papers.includes(m.paper_id)) return false;
    if (f.types.length && !f.types.includes(m.question_type)) return false;
    return true;
  });
}

/** Subtopics of the one selected topic, if exactly one topic is selected. */
function subtopicChoices(narrowed) {
  const pairs = selectedPairs();
  if (pairs.length !== 1 || !pairs[0].topic) return [];
  const { subject, topic } = pairs[0];
  const found = new Map();
  for (const meta of narrowed) {
    if ((meta.subject || NO_TOPIC) !== subject || (meta.topic || NO_TOPIC) !== topic) continue;
    if (!meta.subtopic) continue;
    found.set(meta.subtopic, (found.get(meta.subtopic) || 0) + 1);
  }
  return Array.from(found.entries())
    .map(([subtopic, count]) => ({ subtopic, count }))
    .sort((a, b) => b.count - a.count || a.subtopic.localeCompare(b.subtopic));
}

/* --------------------------------------------------------------- copy ---- */

/** One line saying what is ticked, in words rather than as a second table. */
function selectionSentence(groups) {
  if (!viewState.selection.size) return 'Nothing ticked — the whole bank is included.';
  const bits = [];
  for (const group of groups) {
    const entry = viewState.selection.get(group.subject);
    if (!entry) continue;
    if (entry.all) bits.push(`${group.subject} (whole subject)`);
    else if (entry.topics.size === 1) bits.push(`${group.subject}: ${Array.from(entry.topics)[0]}`);
    else bits.push(`${group.subject}: ${entry.topics.size} topics`);
  }
  const shown = bits.slice(0, 3).join(' · ');
  return bits.length > 3 ? `${shown} · +${bits.length - 3} more` : shown;
}

function paperList() {
  return Array.from(state.papers.values()).sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || String(a.paper_id).localeCompare(String(b.paper_id)));
}

function yearList() {
  const years = Array.from(new Set(paperList().map((p) => p.year).filter(Boolean))).map(String);
  return years.sort((a, b) => Number(b) - Number(a));
}

/* -------------------------------------------------------------- markup ---- */

function checkboxList({ name, options, selectedValues, action }) {
  return `<div class="pick-choices">${options
    .map(
      (option) =>
        `<label class="check pick-check"><input type="checkbox" data-action="${esc(action)}" data-value="${esc(option.value)}" ${selectedValues.includes(option.value) ? 'checked' : ''} /><span${option.hindi ? ' lang="hi"' : ''}>${esc(option.label)}${option.count === null || option.count === undefined ? '' : ` <span class="pick-count">(${esc(String(option.count))})</span>`}</span></label>`,
    )
    .join('')}</div>`;
}

function subjectPicker(groups) {
  if (!groups.length) return notice('No questions match the filters under “Narrow further”.', 'info');
  return `<ul class="pick-list">${groups
    .map((group, groupIndex) => {
      const entry = viewState.selection.get(group.subject);
      const tickedTopics = entry && !entry.all ? entry.topics : new Set();
      const isAll = Boolean(entry?.all);
      const open = viewState.expanded.has(group.subject);
      const topicsId = `pickTopics${groupIndex}`;
      return `<li class="pick-group">
        <div class="pick-row">
          <label class="check pick-check">
            <input type="checkbox" id="pickSubject${groupIndex}" data-action="pick-subject" data-value="${esc(group.subject)}" ${isAll ? 'checked' : ''} />
            <span>${esc(group.subject)} <span class="pick-count">(${esc(String(group.count))})</span></span>
          </label>
          <button class="pick-caret" type="button" data-action="pick-expand" data-value="${esc(group.subject)}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${topicsId}" title="${open ? 'Hide' : 'Show'} topics in ${esc(group.subject)}">
            <span class="sr-only">${open ? 'Hide' : 'Show'} topics in ${esc(group.subject)}</span>
          </button>
        </div>
        <div class="pick-topics" id="${topicsId}" ${open ? '' : 'hidden'}>
          ${
            group.topics.length
              ? group.topics
                  .map(
                    (topic) => `<label class="check pick-check">
                      <input type="checkbox" data-action="pick-topic" data-value="${esc(`${group.subject}||${topic.topic}`)}" ${isAll || tickedTopics.has(topic.topic) ? 'checked' : ''} />
                      <span>${esc(topic.topic)} <span class="pick-count">(${esc(String(topic.count))})</span></span>
                    </label>`,
                  )
                  .join('')
              : '<p class="tiny muted m-0">No questions in this subject match the current filters.</p>'
          }
        </div>
      </li>`;
    })
    .join('')}</ul>`;
}

function narrowBlock({ narrowed, subtopics }) {
  const f = viewState.filters;
  const years = yearList();
  const papers = paperList();
  const active = activeFilterCount();
  const pairs = selectedPairs();
  const singleTopic = pairs.length === 1 && pairs[0].topic ? pairs[0] : null;

  return `<details class="disclosure" id="narrowFilters" ${viewState.narrowOpen ? 'open' : ''}>
    <summary>Narrow further${active ? ` — ${active} filter${active === 1 ? '' : 's'} on` : ''}</summary>
    <div class="mt-3">
      <div class="filters">
        <label class="field"><span class="label-text">Attempt history</span>
          <select id="fAttempt" data-action="filter">
            ${Object.entries(ATTEMPT_STATE_FILTERS)
              .map(([value, label]) => `<option value="${esc(value)}" ${f.attemptState === value ? 'selected' : ''}>${esc(label)}</option>`)
              .join('')}
          </select>
        </label>
        <label class="field"><span class="label-text">Language</span>
          <select id="fLanguage" data-action="filter">
            <option value="all" ${f.language === 'all' ? 'selected' : ''}>All languages</option>
            ${Object.entries(LANGUAGE_LABELS)
              .map(([code, label]) => `<option value="${esc(code)}" ${f.language === code ? 'selected' : ''}>${esc(label)}</option>`)
              .join('')}
          </select>
        </label>
        <label class="field"><span class="label-text">Search text</span>
          <input type="search" id="fSearch" placeholder="Search the question text" value="${esc(f.search)}" />
        </label>
      </div>

      ${
        singleTopic
          ? `<label class="field"><span class="label-text">Subtopic (within ${esc(singleTopic.topic)})</span>
          <select id="fSubtopic" data-action="filter">
            <option value="all" ${f.subtopic === 'all' ? 'selected' : ''}>All subtopics</option>
            ${subtopics.map((s) => `<option value="${esc(s.subtopic)}" ${f.subtopic === s.subtopic ? 'selected' : ''}>${esc(s.subtopic)} (${esc(String(s.count))})</option>`).join('')}
          </select>
          <span class="hint">Shown because exactly one topic is selected.</span>
        </label>`
          : ''
      }

      ${
        years.length
          ? `<h3>Years</h3>${checkboxList({ action: 'filter-year', options: years.map((y) => ({ value: y, label: y })), selectedValues: f.years })}`
          : ''
      }
      ${
        papers.length
          ? `<h3>Papers</h3>${checkboxList({
              action: 'filter-paper',
              options: papers.map((p) => ({
                value: p.paper_id,
                label: `${p.exam || 'Paper'} ${p.year || ''}${p.set_code ? ` set ${p.set_code}` : ''}`.trim(),
              })),
              selectedValues: f.papers,
            })}`
          : ''
      }
      <h3>Question types</h3>
      ${checkboxList({ action: 'filter-type', options: Object.entries(QUESTION_TYPES).map(([value, label]) => ({ value, label })), selectedValues: f.types })}

      <div class="stack mt-3">
        <label class="check"><input type="checkbox" id="fExplanation" data-action="filter" ${f.onlyWithExplanation ? 'checked' : ''} /><span>Only questions with an explanation</span></label>
        <label class="check"><input type="checkbox" id="fExcludeDemo" data-action="filter" ${f.excludeDemonstration ? 'checked' : ''} /><span>Exclude demonstration questions</span></label>
      </div>

      <div class="row mt-3">
        <button class="btn btn-sm" type="button" data-action="clear-filters">Clear these filters</button>
        <span class="tiny muted">${narrowed.length} question(s) before the subject/topic selection is applied.</span>
      </div>
    </div>
  </details>`;
}

export default {
  title: 'Topic & Custom Practice',

  async render(ctx) {
    // A deep link is applied once, on arrival. An in-place refresh (a ticked
    // box, a changed filter) must not re-impose it over what the reader has
    // just edited — which is what the old hashchange listener worked around.
    if (!ctx?.isRefresh) applyRouteParams(ctx?.params);

    const metas = Array.from(state.questionIndex.values());
    if (!metas.length) {
      return `
        ${screenHead({
          title: 'Topic &amp; Custom Practice',
          purpose: 'Pick any subjects and topics — the pool is everything you tick, and nothing ticked means the whole bank.',
          primary: '<a class="btn btn-primary" href="#/bank">Import a question bank</a>',
        })}
        ${card({
          title: 'Practice needs a question bank',
          body: emptyState({
            title: 'No questions stored yet',
            message: 'Import a validated bank first, then pick the subjects and topics you want to practise.',
            willShow: 'Every subject in your bank with its own question count, ready to tick.',
            action: '<a class="btn btn-primary" href="#/bank">Question Bank &amp; Imports</a>',
          }),
        })}`;
    }

    const attemptSummary = await currentAttemptSummary();
    const narrowed = narrowedPool(metas, attemptSummary);
    const groups = subjectGroups(narrowed);
    const pool = narrowed.filter(matchesSelection);
    const subtopics = subtopicChoices(narrowed);
    const pairs = selectedPairs();
    const topicsTicked = pairs.filter((p) => p.topic).length;
    const subjectsTicked = viewState.selection.size;
    const isTopicPractice = subjectsTicked === 1 && topicsTicked <= 1;
    const matchCount = pool.length;

    return `
      ${screenHead({
        title: 'Topic &amp; Custom Practice',
        purpose: 'Pick any subjects and topics — the pool is everything you tick, and nothing ticked means the whole bank. Assembled from your imported bank, never labelled as an authentic paper.',
        primary: `<button class="btn btn-primary" type="button" data-action="start-practice" ${matchCount ? '' : 'disabled'}>Start practice · ${matchCount} question${matchCount === 1 ? '' : 's'}</button>`,
        secondary: filterChip(activeFilterCount()),
      })}

      ${card({
        title: 'What to include',
        count: `${matchCount} match`,
        info: cardInfo('About this screen', '<p class="small m-0">Topic Practice and the Custom Test builder were the same screen twice, so they are one screen now. A single subject with at most one topic is recorded as a <strong>topic</strong> session, exactly as before; anything wider is recorded as a <strong>custom</strong> set. <code>#/custom</code> still opens this screen. Choosing a strategy decides <em>which</em> questions are picked; “shuffle question order” decides how they are arranged — with shuffling off they run in paper order (year, then paper, then question number).</p>'),
        body: `
          <p class="small m-0" id="pickSummary">${esc(selectionSentence(groups))}</p>
          <p class="pick-match" role="status"><strong id="pickMatch">${esc(String(matchCount))} question${matchCount === 1 ? '' : 's'} match</strong>${
            matchCount !== narrowed.length ? ` <span class="tiny muted">of ${esc(String(narrowed.length))} after your other filters</span>` : ''
          }</p>
          ${subjectPicker(groups)}
          <div class="row mt-3">
            <button class="btn btn-sm" type="button" data-action="clear-selection" ${viewState.selection.size ? '' : 'disabled'}>Clear the selection</button>
            <span class="tiny muted">Counts are per subject, over the questions your other filters leave.</span>
          </div>
        `,
      })}

      ${card({ title: 'Narrow further', body: narrowBlock({ narrowed, subtopics }) })}

      ${card({
        title: 'Session',
        body: `
          <div class="filters mb-3">
            <label class="field"><span class="label-text">Which questions are picked</span>
              <select id="practiceStrategy" data-action="strategy">
                <option value="random" ${viewState.strategy === 'random' ? 'selected' : ''}>Random</option>
                <option value="least-attempted" ${viewState.strategy === 'least-attempted' ? 'selected' : ''}>Least attempted first</option>
                <option value="weakest-first" ${viewState.strategy === 'weakest-first' ? 'selected' : ''}>Weakest topics first</option>
              </select>
              <span class="hint">Decides which questions are picked from the pool, not the order they come in.</span>
            </label>
          </div>
          <label class="check"><input type="checkbox" id="practiceShuffleOrder" data-action="shuffle-order" ${viewState.shuffleOrder ? 'checked' : ''} /><span>Shuffle question order</span></label>
          <p class="hint mt-0">${
            viewState.shuffleOrder
              ? 'Questions will be arranged at random for this session.'
              : 'Questions will run in paper order — year, then paper, then question number.'
          }</p>
          ${configFields({ paper: null, defaultCount: Math.min(20, Math.max(1, matchCount)), maxCount: matchCount, allowCustomScoring: true })}
          <div class="sticky-actions">
            <button class="btn btn-primary" type="button" data-action="start-practice" ${matchCount ? '' : 'disabled'}>Start practice</button>
            <span class="tiny muted">${isTopicPractice ? 'Recorded as a topic session' : 'Recorded as a custom set'}.</span>
          </div>
        `,
      })}
    `;
  },

  async mount(ctx, root) {
    mountConfigFields({ defaultCount: 20, screen: SCREEN });

    // `indeterminate` is a property, not an attribute, so the tri-state mark has
    // to be applied after the HTML is in the document.
    root.querySelectorAll('input[data-action="pick-subject"]').forEach((box) => {
      const subject = box.dataset.value;
      const entry = viewState.selection.get(subject);
      box.indeterminate = Boolean(entry) && !entry.all;
    });

    let searchTimer = null;
    const rerender = async () => {
      await ctx.refresh();
    };

    // Both listeners go on `#view`, which outlives every screen: without the
    // abort signal they would survive each in-place re-render and pile up, one
    // more per refresh, until a single tick ran the same handler a dozen times.
    root.addEventListener('change', async (ev) => {
      const el = ev.target;
      const action = el?.dataset?.action;
      if (!action) return;
      if (action === 'pick-subject') {
        setSubject(el.dataset.value, el.checked);
        await rerender();
        return;
      }
      if (action === 'pick-topic') {
        const [subject, topic] = String(el.dataset.value).split('||');
        setTopic(subject, topic, el.checked);
        await rerender();
        return;
      }
      if (action === 'filter-year' || action === 'filter-paper' || action === 'filter-type') {
        const key = action === 'filter-year' ? 'years' : action === 'filter-paper' ? 'papers' : 'types';
        const list = viewState.filters[key];
        const value = el.dataset.value;
        if (el.checked && !list.includes(value)) list.push(value);
        if (!el.checked) viewState.filters[key] = list.filter((v) => v !== value);
        await rerender();
        return;
      }
      if (action === 'strategy') {
        viewState.strategy = el.value;
        return;
      }
      if (action === 'shuffle-order') {
        viewState.shuffleOrder = el.checked;
        await rerender();
        return;
      }
      if (action === 'filter') {
        const f = viewState.filters;
        if (el.id === 'fAttempt') f.attemptState = el.value;
        else if (el.id === 'fLanguage') f.language = el.value;
        else if (el.id === 'fSubtopic') f.subtopic = el.value;
        else if (el.id === 'fExplanation') f.onlyWithExplanation = el.checked;
        else if (el.id === 'fExcludeDemo') f.excludeDemonstration = el.checked;
        await rerender();
      }
    }, { signal: ctx.signal });

    root.addEventListener('click', async (ev) => {
      const button = ev.target.closest('[data-action]');
      if (!button || !root.contains(button)) return;
      const action = button.dataset.action;
      if (action === 'pick-expand') {
        // Expanding is a DOM toggle: no re-render, no lost scroll position, and
        // the open set is remembered so a later refresh restores it.
        const subject = button.dataset.value;
        const panel = document.getElementById(button.getAttribute('aria-controls'));
        const open = !viewState.expanded.has(subject);
        if (open) viewState.expanded.add(subject);
        else viewState.expanded.delete(subject);
        if (panel) panel.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }
      if (action === 'clear-selection') {
        // Back to the screen's starting state: nothing ticked, nothing open.
        viewState.selection.clear();
        viewState.expanded.clear();
        await rerender();
        return;
      }
      if (action === 'clear-filters') {
        viewState.filters = defaultFilters();
        await rerender();
        return;
      }
      if (action === 'start-practice') await startPractice(ctx, root);
    }, { signal: ctx.signal });

    root.querySelector('#fSearch')?.addEventListener('input', (ev) => {
      const value = ev.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        viewState.filters.search = value;
        await rerender();
      }, 350);
    });

    root.querySelector('#narrowFilters')?.addEventListener('toggle', (ev) => {
      viewState.narrowOpen = ev.target.open;
    });
  },
};

/* -------------------------------------------------------------- start ---- */

async function startPractice(ctx, root) {
  const metas = Array.from(state.questionIndex.values());
  const attemptSummary = await currentAttemptSummary();
  const narrowed = narrowedPool(metas, attemptSummary);
  const pool = narrowed.filter(matchesSelection);
  if (!pool.length) {
    toast('No questions match the current selection and filters.', 'warn');
    return;
  }

  const config = readConfig('practiceCfg', {});
  const pairs = selectedPairs();
  const topicsTicked = pairs.filter((p) => p.topic).length;
  const subjectsTicked = viewState.selection.size;
  // Exactly one subject and at most one topic is the old Topic Practice case and
  // keeps its kind and its label; anything wider is a custom set.
  const isTopicPractice = subjectsTicked === 1 && topicsTicked <= 1;
  const kind = isTopicPractice ? 'topic' : 'custom';

  const f = viewState.filters;
  const labelBits = [];
  if (!subjectsTicked) labelBits.push('All subjects');
  else if (pairs[0] && pairs[0].topic) labelBits.push(pairs[0].subject, pairs[0].topic);
  else if (pairs[0]) labelBits.push(pairs[0].subject);
  if (f.years.length === 1) labelBits.push(f.years[0]);
  if (f.types.length === 1) labelBits.push(QUESTION_TYPES[f.types[0]] || f.types[0]);
  const label = `${isTopicPractice ? 'Topic practice' : 'Custom test'} — ${labelBits.join(' · ') || 'whole bank'}`;

  const strategy = viewState.strategy;
  const pick = selectQuestions(pool, {
    count: config.count,
    strategy,
    attemptSummary,
    repeatPolicy: { preferUnseen: config.preferUnseen, cooldownDays: state.settings.repeatPolicy.cooldownDays },
    seed: strategy === 'random' ? null : `${kind}:${pool.length}:${config.count}`,
  });

  // Strategy decides which questions are in; the shuffle decides how they are
  // arranged. With shuffling off the picked questions are put back into paper
  // order, so `order_source` states what actually happened.
  const arranged = viewState.shuffleOrder ? pick.selected : arrangeForPaper(pick.selected);
  const orderSource = viewState.shuffleOrder ? 'shuffled' : 'paper_order';
  const questionIds = arranged.map((m) => m.id);

  // A single subject with at most one topic starts straight away, as Topic
  // Practice always did. A wider set is a custom assembly, so it is confirmed
  // first — and the confirmation states the order the questions will actually
  // arrive in, which is the thing the screen used to get wrong.
  if (!isTopicPractice) {
    const ok = await confirmDialog({
      title: 'Start this custom set?',
      message: `${questionIds.length} question(s) from ${pool.length} matching. Picked by “${strategyLabel(strategy)}”, then ${
        viewState.shuffleOrder ? 'shuffled' : 'put in paper order (year, then paper, then question number)'
      }. Recorded as a custom set — not an authentic paper.${pick.notes.length ? ` ${pick.notes.join(' ')}` : ''}`,
      confirmLabel: 'Start',
    });
    if (!ok) return;
  }

  await startPracticeTest(ctx, {
    kind,
    label,
    questionIds,
    metas: arranged,
    config: { ...config, usePaperRules: false, scoring: config.scoring || { source: 'custom', ...state.settings.defaultScoring } },
    orderSource,
    selectionNotes: [
      viewState.selection.size ? `Selected: ${selectionSentence(subjectGroups(narrowed))}` : 'Selected: the whole bank (nothing ticked).',
      `Pick strategy: ${strategyLabel(strategy)}.`,
      viewState.shuffleOrder ? 'Question order: shuffled for this session.' : 'Question order: paper order (year, then paper, then question number).',
      ...pick.notes,
    ],
  });
}

function strategyLabel(strategy) {
  return strategy === 'weakest-first' ? 'weakest topics first' : strategy === 'least-attempted' ? 'least attempted first' : 'random';
}

/* -------------------------------------------------------- deep links ---- */

/**
 * Apply `#/topic/<Subject>` and `#/topic/<Subject>||<Topic>` to the selection.
 *
 * Called only when the screen is entered, never on an in-place refresh, so a
 * filter change cannot re-impose a link the reader has already edited away
 * from. An empty parameter is left alone: arriving at `#/topic` keeps whatever
 * was already ticked instead of wiping it — but it does forget the link that
 * was applied, so arriving at the same address again later still applies it.
 *
 * A link is only applied when the bank can honour it. A subject the bank does
 * not hold (a mistyped address, an old bookmark, a label renamed at import) is
 * ignored rather than selected, because selecting it would leave the reader
 * with "0 questions match" and nothing on screen to explain why; a subject with
 * an unknown topic falls back to the whole subject.
 */
export function applyRouteParams(params) {
  const raw = String(params?.[0] || '');
  if (!raw) {
    viewState.appliedRoute = '';
    return false;
  }
  if (raw === viewState.appliedRoute) return false;
  const { subject, topic } = parseTopicPracticeParam(raw);
  if (!subject) return false;
  // With no bank there is nothing to select against, and the screen says so.
  if (!state.questionIndex.size) return false;
  const group = subjectGroups().find((g) => g.subject === subject);
  if (!group) return false;
  const knownTopic = topic && group.topics.some((t) => t.topic === topic) ? topic : null;
  viewState.appliedRoute = raw;
  viewState.selection.clear();
  if (knownTopic) {
    setTopic(subject, knownTopic, true); // the same path a click takes
    viewState.expanded.add(subject);
  } else {
    setSubject(subject, true);
  }
  return true;
}
