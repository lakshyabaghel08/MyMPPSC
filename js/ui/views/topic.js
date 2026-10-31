/**
 * topic.js — the practice builder (`#/topic`, `#/custom`).
 *
 * This screen is the only place where "what should this sitting contain?" is
 * configured, so it is built around that question rather than around a form.
 * Two panes:
 *
 *   left   the bank — search, subjects, their topics, and the optional filters;
 *   right  the session — what is in the basket, how many questions that is, the
 *          size, the feedback timing, and the one button that starts it.
 *
 * Selection is a **union**: tick any subjects and any topics inside them and
 * the pool is everything ticked, nothing else. Tick nothing and the pool is the
 * whole bank. Two rules fall out of that, and they are the two bugs this screen
 * used to have:
 *
 *  - A topic can never be selected "under" a subject that is not selected, so
 *    a stale topic cannot silently narrow the pool to zero questions.
 *  - Every count shown here is counted **within its own subject**.
 *
 * What changed in this pass, and why:
 *
 *  - Ticking a box no longer re-renders the whole screen through the router.
 *    Only the browse pane is rebuilt (in `paintPicker()`), so the session pane —
 *    and anything typed into it — is never touched, and the reader does not
 *    lose their place or their focus.
 *  - The selection has a persistent representation: a basket of chips with an
 *    × on each, next to the live pool count and the Start button.
 *  - Size presets (10 / 20 / 40 / all) sit beside the count field; the shared
 *    session form still owns the value.
 *  - The confirmation dialog that used to repeat the summary before starting is
 *    gone: the summary is on screen the whole time and the button states the
 *    size it will start.
 *  - "Add all N matching" turns a search into a selection in one click.
 *
 * Two decisions are kept apart on purpose, because conflating them is what made
 * "shuffle off" still hand out a random order:
 *
 *  - **Strategy** (random / least-attempted / weakest-first) decides *which*
 *    questions are picked from the pool.
 *  - **Shuffle question order** decides how the picked questions are *arranged*.
 */

import { state } from '../../core/state.js';
import { esc, sheet, infoToggle, toast, notice, emptyState, screenHead } from '../components.js';
import { QUESTION_TYPES, LANGUAGE_LABELS } from '../../core/constants.js';
import { parseTopicPracticeParam } from '../../core/util.js';
import { filterMetas, selectQuestions, ATTEMPT_STATE_FILTERS, arrangeForPaper } from '../../services/select.js';
import { configFields, readConfig, mountConfigFields, startPracticeTest, currentAttemptSummary } from './shared.js';

/** Form-memory key for the shared session form (see `shared.js`). */
const SCREEN = 'topic';

/** A question with no topic label is counted under this topic, inside its own subject. */
const NO_TOPIC = 'Unclassified';

/** Session sizes offered as one-click presets. */
const SIZE_PRESETS = [10, 20, 40];

const viewState = {
  /** The `#/topic/<param>` string already applied, so it is applied once per arrival. */
  appliedRoute: '',
  /** subject -> { all: boolean, topics: Set<string> }. Empty map = the whole bank. */
  selection: new Map(),
  /** Subject groups the reader has opened. Survives in-place redraws. */
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
    // ticking the subject, and is reported the same way.
    const all = topicsOfSubject(subject);
    if (all.length && all.every((t) => entry.topics.has(t))) {
      entry.all = true;
      entry.topics.clear();
    }
  } else if (entry) {
    if (entry.all) {
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
 * row counts only that subject's questions with no topic label.
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
          ? `<p class="section-label">Years</p>${checkboxList({ action: 'filter-year', options: years.map((y) => ({ value: y, label: y })), selectedValues: f.years })}`
          : ''
      }
      ${
        papers.length
          ? `<p class="section-label">Papers</p>${checkboxList({
              action: 'filter-paper',
              options: papers.map((p) => ({
                value: p.paper_id,
                label: `${p.exam || 'Paper'} ${p.year || ''}${p.set_code ? ` set ${p.set_code}` : ''}`.trim(),
              })),
              selectedValues: f.papers,
            })}`
          : ''
      }
      <p class="section-label">Question types</p>
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

/** The browse pane. Rebuilt in place whenever the selection or a filter changes. */
function pickerMarkup({ groups, narrowed, subtopics, matchCount }) {
  const active = activeFilterCount();
  const search = viewState.filters.search;
  return `
    <div class="practice-search">
      <label class="field field-grow m-0"><span class="label-text">Search the bank</span>
        <input type="search" id="pickerSearch" autocomplete="off" placeholder="Topic, subject or question wording…" value="${esc(search)}" />
      </label>
      ${
        search.trim()
          ? `<button class="btn btn-sm" type="button" data-action="add-matching" ${narrowed.length ? '' : 'disabled'}>Add all ${narrowed.length}</button>`
          : ''
      }
    </div>

    <div class="pick-bar">
      <p class="pick-match" role="status"><strong id="pickMatch">${esc(String(matchCount))} question${matchCount === 1 ? '' : 's'} match</strong>${
        matchCount !== narrowed.length ? ` <span class="tiny text-soft">of ${esc(String(narrowed.length))} after your filters</span>` : ''
      }</p>
      <button class="quiet-action" type="button" data-action="clear-selection" ${viewState.selection.size ? '' : 'disabled'}>Clear the selection</button>
    </div>

    <p class="pick-summary" id="pickSummary">${esc(selectionSentence(groups))}</p>

    ${subjectPicker(groups)}

    ${narrowBlock({ narrowed, subtopics })}`;
}

/** Chips for what is in the basket, each removable. */
function basketMarkup(groups) {
  if (!viewState.selection.size) return '<p class="basket-empty">Nothing ticked — the whole bank is in this session.</p>';
  const chips = [];
  for (const [subject, entry] of viewState.selection) {
    if (entry.all) {
      chips.push(
        `<span class="basket-chip"><span>${esc(subject)} <small>whole subject</small></span><button type="button" class="basket-chip-x" data-action="remove-subject" data-value="${esc(subject)}" aria-label="Remove ${esc(subject)}">✕</button></span>`,
      );
    } else if (entry.topics.size === 1) {
      const topic = Array.from(entry.topics)[0];
      chips.push(
        `<span class="basket-chip"><span>${esc(topic)} <small>${esc(subject)}</small></span><button type="button" class="basket-chip-x" data-action="remove-topic" data-subject="${esc(subject)}" data-value="${esc(topic)}" aria-label="Remove ${esc(topic)}">✕</button></span>`,
      );
    } else {
      chips.push(
        `<span class="basket-chip"><span>${esc(subject)} <small>${entry.topics.size} topics</small></span><button type="button" class="basket-chip-x" data-action="remove-subject" data-value="${esc(subject)}" aria-label="Remove ${esc(subject)}">✕</button></span>`,
      );
    }
  }
  const shown = chips.slice(0, 8).join('');
  const more = chips.length > 8 ? `<span class="basket-chip is-more">+${chips.length - 8} more</span>` : '';
  return `<div class="basket-chips">${shown}${more}</div>`;
}

function sizesMarkup(matchCount) {
  const preset = (value, label) =>
    `<button class="preset" type="button" data-action="preset-count" data-count="${value}" ${matchCount ? '' : 'disabled'}>${esc(label)}</button>`;
  return `<div class="preset-row" role="group" aria-label="Session size">
    ${SIZE_PRESETS.map((n) => preset(Math.min(n, matchCount || n), String(n))).join('')}
    ${preset(matchCount, 'All')}
  </div>`;
}

/** The session pane's live parts, refreshed without rebuilding the form. */
function sessionSummary(matchCount, isTopicPractice) {
  return `<span id="sessionCount">${matchCount} question${matchCount === 1 ? '' : 's'} ready</span>
    <span class="session-kind" id="sessionKind">${isTopicPractice ? 'Recorded as a topic session' : 'Recorded as a custom set'}</span>`;
}

export default {
  title: 'Practice',

  async render(ctx) {
    // A deep link is applied once, on arrival. An in-place refresh must not
    // re-impose it over what the reader has just edited.
    if (!ctx?.isRefresh) applyRouteParams(ctx?.params);

    const metas = Array.from(state.questionIndex.values());
    if (!metas.length) {
      return `
        ${screenHead({
          title: 'Practice',
          purpose: 'Pick any subjects and topics — the pool is everything you tick, and nothing ticked means the whole bank.',
          primary: '<a class="btn btn-primary" href="#/bank">Import a question bank</a>',
        })}
        ${sheet({
          label: 'Practice needs a question bank',
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
    const matchCount = pool.length;
    const isTopicPractice = viewState.selection.size === 1 && selectedPairs().filter((p) => p.topic).length <= 1;

    return `
      ${screenHead({
        title: 'Practice',
        purpose: 'Pick what this sitting covers, then start it.',
        secondary: '<a class="btn btn-sm btn-quiet" href="#/smart">Let the app choose</a>',
      })}

      <div class="practice-layout">
        <section class="sheet practice-browse" aria-label="Choose what to practise">
          <div class="sheet-head">
            <p class="section-label">What to practise</p>
            <div class="sheet-action">${infoToggle(
              'How selection works',
              '<p class="small m-0">A single subject with at most one topic is recorded as a <strong>topic</strong> session; anything wider is a <strong>custom</strong> set. The strategy decides <em>which</em> questions are picked; the order decides how they are arranged — with shuffling off they run in paper order (year, then paper, then question number). Counts are per subject and always describe your imported bank.</p>',
            )}</div>
          </div>
          <div id="pickerPane">${pickerMarkup({ groups, narrowed, subtopics, matchCount })}</div>
        </section>

        <aside class="practice-session" id="sessionPanel" aria-label="Your session">
          <div class="practice-session-head">
            <h2>Your session</h2>
            ${sessionSummary(matchCount, isTopicPractice)}
          </div>
          <div class="practice-session-body">
            <div id="practiceBasket">${basketMarkup(groups)}</div>
            ${sizesMarkup(matchCount)}

            ${configFields({ paper: null, defaultCount: Math.min(20, Math.max(1, matchCount)), maxCount: matchCount, allowCustomScoring: true })}

            <div class="session-order">
              <label class="field"><span class="label-text">Pick questions by</span>
                <select id="practiceStrategy" data-action="strategy">
                  <option value="random" ${viewState.strategy === 'random' ? 'selected' : ''}>Random</option>
                  <option value="least-attempted" ${viewState.strategy === 'least-attempted' ? 'selected' : ''}>Least attempted first</option>
                  <option value="weakest-first" ${viewState.strategy === 'weakest-first' ? 'selected' : ''}>Weakest topics first</option>
                </select>
              </label>
              <label class="check"><input type="checkbox" id="practiceShuffleOrder" data-action="shuffle-order" ${viewState.shuffleOrder ? 'checked' : ''} /><span>Shuffle the order</span></label>
              <p class="hint m-0" id="shuffleHint">${
                viewState.shuffleOrder ? 'Questions are arranged at random for this session.' : 'Runs in paper order — year, then paper, then question number.'
              }</p>
            </div>

            <div class="practice-start">
              <button class="btn btn-primary btn-block" type="button" data-action="start-practice" ${matchCount ? '' : 'disabled'}>
                Start ${matchCount ? `${matchCount} question${matchCount === 1 ? '' : 's'}` : 'practice'}
              </button>
              <p class="tiny text-soft m-0 mt-2">From your own bank — never labelled as an authentic paper.</p>
            </div>
          </div>
        </aside>
      </div>`;
  },

  async mount(ctx, root) {
    mountConfigFields({ defaultCount: 20, screen: SCREEN, maxCount: null });

    const applyIndeterminate = (scope) => {
      scope.querySelectorAll('input[data-action="pick-subject"]').forEach((box) => {
        const entry = viewState.selection.get(box.dataset.value);
        box.indeterminate = Boolean(entry) && !entry.all;
      });
    };
    applyIndeterminate(root);

    /**
     * Rebuild the browse pane and the session's live figures in place.
     *
     * The session form is deliberately *not* rebuilt: the size, feedback, timing
     * and scoring the reader has chosen belong to them, and the router-level
     * refresh this replaces used to make every tick cost a full screen render.
     */
    const paintPicker = async ({ restoreSearch = false } = {}) => {
      const metas = Array.from(state.questionIndex.values());
      const attemptSummary = await currentAttemptSummary();
      const narrowed = narrowedPool(metas, attemptSummary);
      const groups = subjectGroups(narrowed);
      const matchCount = narrowed.filter(matchesSelection).length;
      const subtopics = subtopicChoices(narrowed);
      const pane = root.querySelector('#pickerPane');
      // The reader navigated away while this update was in flight: the screen
      // that owns this pane no longer exists, so there is nothing to paint and
      // nothing to refresh (a refresh here would repaint whatever replaced it).
      if (!pane || ctx.signal?.aborted) return;
      pane.innerHTML = pickerMarkup({ groups, narrowed, subtopics, matchCount });
      applyIndeterminate(pane);

      const basket = root.querySelector('#practiceBasket');
      if (basket) basket.innerHTML = basketMarkup(groups);

      const isTopicPractice = viewState.selection.size === 1 && selectedPairs().filter((p) => p.topic).length <= 1;
      const summary = root.querySelector('#sessionCount');
      if (summary) summary.textContent = `${matchCount} question${matchCount === 1 ? '' : 's'} ready`;
      const kind = root.querySelector('#sessionKind');
      if (kind) kind.textContent = isTopicPractice ? 'Recorded as a topic session' : 'Recorded as a custom set';

      // The size the reader can ask for is bounded by the pool they just built.
      const countInput = root.querySelector('#practiceCfgCount');
      if (countInput) {
        countInput.setAttribute('max', String(Math.max(1, matchCount)));
        if (Number(countInput.value) > matchCount) {
          countInput.value = String(Math.max(1, matchCount));
          countInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      root.querySelectorAll('[data-action="start-practice"]').forEach((button) => {
        button.disabled = matchCount === 0;
        button.textContent = matchCount ? `Start ${matchCount} question${matchCount === 1 ? '' : 's'}` : 'Start practice';
      });
      const presets = root.querySelector('#sessionPanel .preset-row');
      if (presets) presets.outerHTML = sizesMarkup(matchCount);

      if (restoreSearch) {
        const input = root.querySelector('#pickerSearch');
        if (input) {
          input.focus({ preventScroll: true });
          const end = input.value.length;
          try {
            input.setSelectionRange(end, end);
          } catch {
            /* search inputs without a selection API are fine */
          }
        }
      }
    };

    root.addEventListener(
      'change',
      async (ev) => {
        const el = ev.target;
        const action = el?.dataset?.action;
        if (!action) return;
        if (action === 'pick-subject') {
          setSubject(el.dataset.value, el.checked);
          await paintPicker();
          return;
        }
        if (action === 'pick-topic') {
          const [subject, topic] = String(el.dataset.value).split('||');
          setTopic(subject, topic, el.checked);
          await paintPicker();
          return;
        }
        if (action === 'filter-year' || action === 'filter-paper' || action === 'filter-type') {
          const key = action === 'filter-year' ? 'years' : action === 'filter-paper' ? 'papers' : 'types';
          const list = viewState.filters[key];
          const value = el.dataset.value;
          if (el.checked && !list.includes(value)) list.push(value);
          if (!el.checked) viewState.filters[key] = list.filter((v) => v !== value);
          await paintPicker();
          return;
        }
        if (action === 'strategy') {
          viewState.strategy = el.value;
          return;
        }
        if (action === 'shuffle-order') {
          viewState.shuffleOrder = el.checked;
          const hint = root.querySelector('#shuffleHint');
          if (hint) hint.textContent = el.checked ? 'Questions are arranged at random for this session.' : 'Runs in paper order — year, then paper, then question number.';
          return;
        }
        if (action === 'filter') {
          const f = viewState.filters;
          if (el.id === 'fAttempt') f.attemptState = el.value;
          else if (el.id === 'fLanguage') f.language = el.value;
          else if (el.id === 'fSubtopic') f.subtopic = el.value;
          else if (el.id === 'fExplanation') f.onlyWithExplanation = el.checked;
          else if (el.id === 'fExcludeDemo') f.excludeDemonstration = el.checked;
          await paintPicker();
        }
      },
      { signal: ctx.signal },
    );

    root.addEventListener(
      'click',
      async (ev) => {
        const button = ev.target.closest('[data-action]');
        if (!button || !root.contains(button)) return;
        const action = button.dataset.action;
        if (action === 'pick-expand') {
          // Expanding is a DOM toggle: no rebuild, no lost focus, and the open
          // set is remembered so a later redraw restores it.
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
          viewState.selection.clear();
          viewState.expanded.clear();
          await paintPicker();
          return;
        }
        if (action === 'clear-filters') {
          const keepSearch = viewState.filters.search;
          viewState.filters = defaultFilters();
          viewState.filters.search = keepSearch;
          await paintPicker();
          return;
        }
        if (action === 'remove-subject') {
          viewState.selection.delete(button.dataset.value);
          await paintPicker();
          return;
        }
        if (action === 'remove-topic') {
          const [subject, topic] = [button.dataset.subject, button.dataset.value];
          setTopic(subject, topic, false);
          await paintPicker();
          return;
        }
        if (action === 'add-matching') {
          // Turn the current search/filter result into the selection: every
          // subject/topic pair that survived the filters is ticked.
          const metas = Array.from(state.questionIndex.values());
          const attemptSummary = await currentAttemptSummary();
          const narrowed = narrowedPool(metas, attemptSummary);
          for (const meta of narrowed) {
            viewState.selection.set(meta.subject || NO_TOPIC, { all: true, topics: new Set() });
          }
          await paintPicker();
          toast(`${narrowed.length} matching question(s) added to the session.`, 'ok');
          return;
        }
        if (action === 'preset-count') {
          const input = root.querySelector('#practiceCfgCount');
          if (!input) return;
          input.value = button.dataset.count;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        if (action === 'start-practice') await startPractice(ctx, root);
      },
      { signal: ctx.signal },
    );

    // The search field and the filters disclosure are rebuilt with the pane, so
    // both listeners are delegated: a listener on the element itself would go
    // with the element on the first redraw.
    let searchTimer = null;
    root.addEventListener(
      'input',
      (ev) => {
        if (ev.target?.id !== 'pickerSearch') return;
        const value = ev.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          viewState.filters.search = value;
          await paintPicker({ restoreSearch: true });
        }, 280);
      },
      { signal: ctx.signal },
    );

    // `toggle` does not bubble; capturing it on the container does not depend on
    // the disclosure element surviving a redraw.
    root.addEventListener(
      'toggle',
      (ev) => {
        if (ev.target?.id === 'narrowFilters') viewState.narrowOpen = ev.target.open;
      },
      { capture: true, signal: ctx.signal },
    );
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

  const arranged = viewState.shuffleOrder ? pick.selected : arrangeForPaper(pick.selected);
  const orderSource = viewState.shuffleOrder ? 'shuffled' : 'paper_order';
  const questionIds = arranged.map((m) => m.id);

  // No confirmation dialog: the session panel states the pool, the size, the
  // arrangement and the recorded kind while the reader is choosing, and the
  // Start button repeats the size. A second dialog would ask them to confirm
  // what is already on screen.
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
  void root;
}

function strategyLabel(strategy) {
  return strategy === 'weakest-first' ? 'weakest topics first' : strategy === 'least-attempted' ? 'least attempted first' : 'random';
}

/* -------------------------------------------------------- deep links ---- */

/**
 * Apply `#/topic/<Subject>` and `#/topic/<Subject>||<Topic>` to the selection.
 * A link is only applied when the bank can honour it; an unknown subject is
 * ignored rather than selected (which would leave a silent empty pool).
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
  if (!state.questionIndex.size) return false;
  const group = subjectGroups().find((g) => g.subject === subject);
  if (!group) return false;
  const knownTopic = topic && group.topics.some((t) => t.topic === topic) ? topic : null;
  viewState.appliedRoute = raw;
  viewState.selection.clear();
  if (knownTopic) {
    setTopic(subject, knownTopic, true);
    viewState.expanded.add(subject);
  } else {
    setSubject(subject, true);
  }
  return true;
}
