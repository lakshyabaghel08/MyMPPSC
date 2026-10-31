/**
 * app.js — Application bootstrap, navigation, theme switch and global behaviour.
 */

import { APP_VERSION, STORES } from './core/constants.js';
import * as db from './core/db.js';
import { state, loadUiPrefs, loadSettings, saveSettings, applyTheme, resolveEffectiveTheme, refreshQuestionIndex, on } from './core/state.js';
import { Router } from './ui/router.js';
import { toast, openModal, confirmDialog, esc, notice, icon } from './ui/components.js';
import { logEvent, downloadJson, fmtDate, shuffle } from './core/util.js';
import { mistakeCounts } from './services/attempts.js';
import { ensureBuiltinBank } from './services/builtin-bank.js';
import { revisionSummary } from './services/revision.js';
import * as tests from './services/tests.js';
import { buildBackup, markBackupTaken, lastBackupInfo } from './services/data.js';
import { openPracticeSheet } from './ui/practicesheet.js';
import { buildStartOptions } from './services/nextup.js';
import { startOption } from './ui/views/shared.js';

import dashboardView from './ui/views/dashboard.js';
import testCentreView from './ui/views/testcentre.js';
import runnerView from './ui/views/runner.js';
import reportView from './ui/views/report.js';
import topicView from './ui/views/topic.js';
import smartView from './ui/views/smart.js';
import mistakesView from './ui/views/mistakes.js';
import revisionView from './ui/views/revision.js';
import syllabusView from './ui/views/syllabus.js';
import syllabusAnalysisView from './ui/views/syllabus-analysis.js';
import insightsView from './ui/views/analytics.js';
import pyqAnalysisView from './ui/views/pyq-analysis.js';
import bankView from './ui/views/bank.js';
import settingsView from './ui/views/settings.js';
import helpView from './ui/views/help.js';

const NAV = [
  { route: 'dashboard', label: 'Today', icon: 'dashboard', group: 'Study' },
  { route: 'test-centre', label: 'Papers', icon: 'test-centre', group: 'Study' },
  // Topic Practice and the Custom Test builder were two screens over the same
  // question bank with the same filters, the same three selection strategies
  // and the same session form; one was simply the single-select version of the
  // other. They are one screen. Picking a single topic is the narrow case of
  // picking any set of subjects and topics.
  { route: 'topic', label: 'Practice', icon: 'topic', group: 'Study' },
  { route: 'smart', label: 'Smart', icon: 'smart', group: 'Study' },
  { route: 'mistakes', label: 'Mistakes', icon: 'mistakes', badge: 'mistakes', group: 'Review' },
  { route: 'revision', label: 'Revision', icon: 'revision', badge: 'revision', group: 'Review' },
  // The official syllabus, the study planner, performance analytics and the
  // question-bank analysis used to be four destinations. They are two: one
  // curriculum, and one place for the numbers. The old routes still resolve —
  // see the legacy registrations below — they are simply not advertised twice.
  { route: 'syllabus', label: 'Syllabus', icon: 'syllabus', group: 'Plan' },
  { route: 'analytics', label: 'Insights', icon: 'analytics', group: 'Plan' },
  { route: 'bank', label: 'Bank', icon: 'bank', group: 'Manage' },
  { route: 'settings', label: 'Settings', icon: 'settings', group: 'Manage' },
  { route: 'help', label: 'Help & How it works', icon: 'help', group: 'Manage' },
];

/**
 * Route names that are not navigation destinations of their own but must still
 * highlight one. `#/pyq-analysis` and `#/syllabus-analysis` are the addresses
 * the curated syllabus chips and older bookmarks use for sections that were
 * merged into Insights and Syllabus; `#/custom` is the old Custom Test address,
 * now an alias of the merged practice screen. Without this map those routes
 * rendered the right screen with nothing selected in the navigation, which reads
 * as "you are nowhere".
 */
const NAV_ALIASES = {
  'pyq-analysis': 'analytics',
  'syllabus-analysis': 'syllabus',
  custom: 'topic',
};

let router = null;
let drawerUsedAsModal = false;
/** Desktop sidebar rail preference (persisted per browser profile). */
const NAV_COLLAPSED_KEY = 'mymppsc.navCollapsed';
const badges = { mistakes: 0, revision: 0, imported: false };

function isOffCanvasViewport() {
  return typeof window !== 'undefined' && (window.innerWidth <= 860 || drawerUsedAsModal);
}

function setNavInert(isInert) {
  const nav = document.getElementById('appNav');
  if (!nav) return;
  nav.inert = isInert;
  if (isInert) {
    nav.setAttribute('inert', '');
    nav.setAttribute('aria-hidden', 'true');
    nav.querySelectorAll('button, a').forEach((el) => el.setAttribute('tabindex', '-1'));
  } else {
    nav.removeAttribute('inert');
    nav.removeAttribute('aria-hidden');
    nav.querySelectorAll('button, a').forEach((el) => el.removeAttribute('tabindex'));
  }
}

export function applyNavCollapsed(collapsed, { persist = false } = {}) {
  const body = document.getElementById('appBody');
  const button = document.getElementById('navCollapse');
  if (!body) return;
  body.classList.toggle('nav-collapsed', Boolean(collapsed));
  if (button) {
    button.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Expand navigation' : 'Collapse navigation';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }
  if (persist) {
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* a blocked storage API must not stop navigation */
    }
  }
  syncDrawerState();
}

function restoreNavCollapsed() {
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(NAV_COLLAPSED_KEY) === '1';
  } catch {
    collapsed = false;
  }
  applyNavCollapsed(collapsed);
}

function syncDrawerState() {
  const open = document.body.classList.contains('nav-open');
  const navToggle = document.getElementById('navToggle');
  const scrim = document.getElementById('navScrim');
  if (navToggle) navToggle.setAttribute('aria-expanded', String(open));
  if (scrim) scrim.hidden = !open;
  if (open) {
    setNavInert(false);
  } else if (isOffCanvasViewport()) {
    setNavInert(true);
  } else {
    setNavInert(false);
  }
}

export function openDrawer() {
  drawerUsedAsModal = true;
  document.body.classList.add('nav-open');
  syncDrawerState();
  const nav = document.getElementById('appNav');
  const target = nav?.querySelector('.nav-link[aria-current="page"]') || nav?.querySelector('.nav-link');
  target?.focus?.();
}

export function closeDrawer({ restoreFocus = false } = {}) {
  const wasOpen = document.body.classList.contains('nav-open');
  document.body.classList.remove('nav-open');
  syncDrawerState();
  if (wasOpen && restoreFocus) {
    document.getElementById('navToggle')?.focus?.();
  }
}

function syncThemeToggleButton() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const effective = applyTheme(state.settings);
  const next = effective === 'dark' ? 'light' : 'dark';
  btn.setAttribute('aria-pressed', String(effective === 'dark'));
  btn.setAttribute('aria-label', `Switch to ${next} theme (current: ${effective})`);
  btn.setAttribute('title', `Switch to ${next} theme (current: ${effective})`);
  btn.innerHTML = icon(effective === 'dark' ? 'sun' : 'moon');
}

function renderNav() {
  const list = document.getElementById('navList');
  if (!list) return;
  let currentGroup = null;
  list.innerHTML = NAV.map((item) => {
    const value = badges[item.badge];
    const badgeHtml = value ? `<span class="nav-badge">${value}</span>` : '';
    const groupLabel = item.group !== currentGroup
      ? `<li class="nav-section-label" aria-hidden="true">${esc(item.group)}</li>`
      : '';
    currentGroup = item.group;
    return `${groupLabel}<li><button class="nav-link" type="button" data-route="${item.route}" aria-label="${esc(item.label)}" title="${esc(item.label)}">
      <span class="nav-icon" aria-hidden="true">${icon(item.icon)}</span>
      <span class="nav-label">${esc(item.label)}</span>${badgeHtml}
    </button></li>`;
  }).join('');
  list.querySelectorAll('.nav-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeDrawer({ restoreFocus: false });
      router.navigate(btn.dataset.route);
    });
  });
  markActiveNav(router?.currentRoute?.name);
  syncDrawerState();
}

function markActiveNav(routeName) {
  const destination = NAV_ALIASES[routeName] || routeName;
  document.querySelectorAll('.nav-link').forEach((btn) => {
    if (btn.dataset.route === destination) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
}

async function refreshBadges() {
  try {
    const [mistakes, revision] = await Promise.all([mistakeCounts(), revisionSummary()]);
    badges.mistakes = mistakes.open;
    badges.revision = revision.dueToday.length + revision.overdue.length;
    badges.imported = state.questionIndex.size > 0;
    renderNav();
    const pill = document.getElementById('bankPill');
    if (pill) {
      pill.textContent = state.questionIndex.size
        ? `Bank: ${state.questionIndex.size} questions · ${state.papers.size} papers`
        : 'Bank: no questions imported yet';
      pill.title = state.questionIndex.size
        ? 'Questions stored in this browser profile (IndexedDB)'
        : 'Import a question bank from the Question Bank screen to begin';
    }
    const summary = document.getElementById('navDataSummary');
    const backup = lastBackupInfo();
    if (summary) {
      summary.textContent = state.questionIndex.size ? `${state.counts.attempts} attempts` : 'empty';
      summary.title = backup ? `Last backup: ${fmtDate(backup.at)}` : 'No backup taken yet';
    }
  } catch (err) {
    console.warn('Could not refresh navigation badges', err);
  }
}

/**
 * Show or hide the offline notice. `forced` is used by the online/offline
 * events, which are more reliable than navigator.onLine on some platforms.
 */
function setOfflinePill(forced = null) {
  const pill = document.getElementById('offlinePill');
  if (!pill) return;
  const offline = forced === null ? navigator.onLine === false : forced === true;
  pill.hidden = !offline;
}

async function backupNow({ silent = false } = {}) {
  try {
    const backup = await buildBackup();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadJson(backup, `mymppsc-backup-${stamp}.json`);
    markBackupTaken({ questions: backup.counts.questions, attempts: backup.counts.attempts });
    if (!silent) toast('Backup downloaded. Keep the file somewhere outside the browser.', 'ok');
    refreshBadges();
    return backup;
  } catch (err) {
    toast(`Backup failed: ${err.message}`, 'bad');
    return null;
  }
}

function helpDialog() {
  openModal({
    title: 'Help, keyboard shortcuts and limitations',
    wide: true,
    body: `
      <div id="helpContent">
        <p><strong>MyMPPSC</strong> keeps everything — question bank, attempts, mistakes, revision schedule and syllabus — in this browser's IndexedDB. Nothing is uploaded, and no account is needed. Export a JSON backup regularly: clearing site data or running out of disk space will remove local storage.</p>
        <h3>Keyboard shortcuts</h3>
        <ul class="small">
          <li><code>1</code>…<code>9</code> — choose an option while a question is open</li>
          <li><code>→</code> / <code>N</code> next question · <code>←</code> / <code>P</code> previous question</li>
          <li><code>F</code> mark for review · <code>U</code> clear response</li>
          <li><code>C</code> cycle confidence (when confidence tracking is on)</li>
          <li><code>?</code> this dialog · <code>Esc</code> close dialogs or navigation drawer</li>
        </ul>
        <h3>What this app does not do</h3>
        <ul class="small">
          <li>It does not generate explanations, answers or classifications with AI. Those arrive with the imported question bank, produced and reviewed by your separate preparation pipeline.</li>
          <li>It does not verify anything for you. The bundled 2013–2024 bank is transcribed previous-year material whose stored keys have not been checked against an official MPPSC key. The latest reported marking pattern is used for practice across every bundled year, not claimed as the historical rule for each paper.</li>
          <li>It does not predict future examinations. Topic frequency is a study-prioritisation aid only.</li>
          <li>It does not schedule revision as a guarantee of retention — the interval is a study aid based on your recorded performance.</li>
          <li>Multiple-correct questions use exact set matching (no partial credit) unless a future scoring rule adds it.</li>
        </ul>
        <h3>Version</h3>
        <p class="small muted">App ${APP_VERSION} · schema 1.0.0 · see <code>docs/LIMITATIONS.md</code> in the project for the full list.</p>
      </div>`,
    actions: [{ label: 'Close', tone: 'btn-primary', value: 'close' }],
  });
}


/* ------------------------------------------------------------ ⌘K palette -- */

/**
 * The command palette is the app's front door: three intent groups, each item
 * saying what it will do and where it will take you.
 *
 *   Go   — the eleven screens.
 *   Do   — start a 20-question set, resume the session in progress, mark a
 *          syllabus line, export a backup.
 *   Find — subjects and topics from the question index, syllabus lines through
 *          `searchSyllabus()`, and questions by their own text.
 *
 * It is keyboard-only usable: ↑/↓ move through the visible items across every
 * group, Enter opens the highlighted one, Esc closes (the shared modal owns the
 * focus trap and the focus restoration). The list is capped per group so the
 * palette never becomes a page.
 */

const COMMAND_LIMIT = 5;

/** Subjects and topics from the stored index, newest counts first. */
function findClassification(query) {
  const needle = query.toLowerCase();
  const subjects = [];
  const topics = [];
  for (const node of state.subjects) {
    if (node.subject.toLowerCase().includes(needle)) subjects.push({ subject: node.subject, count: node.count });
    for (const topic of node.topics) {
      if (`${node.subject} ${topic.topic}`.toLowerCase().includes(needle)) {
        topics.push({ subject: node.subject, topic: topic.topic, count: topic.count });
      }
    }
  }
  return { subjects: subjects.slice(0, COMMAND_LIMIT), topics: topics.slice(0, COMMAND_LIMIT) };
}

let syllabusModelCache = null;
async function findSyllabusLines(query) {
  try {
    const [{ loadSyllabus, searchSyllabus }, { nodeLabel }] = await Promise.all([
      import('./services/syllabus.js'),
      import('./services/syllabus.js'),
    ]);
    if (!syllabusModelCache) syllabusModelCache = await loadSyllabus();
    if (!syllabusModelCache?.ok) return [];
    return searchSyllabus(syllabusModelCache, query, { limit: COMMAND_LIMIT }).map((result) => ({
      id: result.id,
      label: nodeLabel(syllabusModelCache.nodes.get(result.id)) || result.label,
      examId: syllabusModelCache.nodes.get(result.id)?.examId || 'prelims',
    }));
  } catch {
    return [];
  }
}

/**
 * Question text, loaded once from IndexedDB and kept for the page's lifetime.
 * Only the two language variants' stems are indexed — enough to find a question
 * the reader remembers a phrase of, without pretending to be a search engine.
 */
let questionTextCache = null;
async function questionTextIndex() {
  if (questionTextCache) return questionTextCache;
  const rows = await db.getAll(STORES.QUESTIONS);
  questionTextCache = rows.map((question) => {
    const texts = Object.values(question.language_variants || {})
      .map((variant) => String(variant?.question_text || ''))
      .filter(Boolean);
    return { id: question.id, text: texts.join(' '), label: texts[0] || question.id };
  });
  return questionTextCache;
}

async function findQuestions(query) {
  const needle = query.toLowerCase();
  if (needle.length < 3) return [];
  try {
    const index = await questionTextIndex();
    const hits = [];
    for (const row of index) {
      if (!row.text.toLowerCase().includes(needle)) continue;
      hits.push(row);
      if (hits.length >= COMMAND_LIMIT) break;
    }
    return hits;
  } catch {
    return [];
  }
}

/** One palette item: `{ kind, id, label, hint, where, run }`. */
function commandItem({ label, hint, where, id, kind }) {
  return `<button class="command-item" type="button" role="option" aria-selected="false" data-command-id="${esc(id)}" data-command-kind="${esc(kind)}" data-command-label="${esc(`${label} ${where}`.toLowerCase())}">
    <span class="command-item-text"><strong>${esc(label)}</strong>${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    <span class="command-where">${esc(where)}</span>
  </button>`;
}

function commandGroup(title, items) {
  if (!items.length) return '';
  const id = `commandGroup-${title.replace(/\s+/g, '-')}`;
  return `<div class="command-group" role="group" aria-labelledby="${esc(id)}">
    <p class="command-group-title" id="${esc(id)}">${esc(title)}</p>
    ${items.join('')}
  </div>`;
}

async function openCommandMenu() {
  const modalRoot = document.getElementById('modalRoot');
  if (!modalRoot?.hidden) return;

  const goItems = NAV.map((item) =>
    commandItem({ kind: 'go', id: `go:${item.route}`, label: item.label, hint: item.group, where: `Goes to ${item.label}` }),
  );

  // The "Do" group is data-aware: it offers the actions the stored data says
  // are worth doing now (resume, revision due, the next paper, open mistakes)
  // rather than a static list, each with the count that justifies it.
  let options = [];
  try {
    ({ options } = await buildStartOptions({ size: 20 }));
  } catch {
    options = [];
  }
  const optionById = new Map(options.map((option) => [option.id, option]));
  const resumeOption = optionById.get('resume');
  const dataActions = ['revision', 'smart', 'paper', 'mistakes']
    .map((id) => optionById.get(id))
    .filter((option) => option && option.count > 0);

  const doItems = [
    resumeOption
      ? commandItem({
          kind: 'do',
          id: 'do:option:resume',
          label: `Resume “${resumeOption.label}”`,
          hint: resumeOption.detail,
          where: 'Continues the session in the runner',
        })
      : null,
    ...dataActions.map((option) =>
      commandItem({
        kind: 'do',
        id: `do:option:${option.id}`,
        label: `${option.label} — ${option.count} question${option.count === 1 ? '' : 's'}`,
        hint: option.detail,
        where: 'Starts a session in the runner',
      }),
    ),
    commandItem({ kind: 'do', id: 'do:start20', label: 'Start a 20-question set', hint: 'Random questions from the whole bank', where: 'Starts a session in the runner' }),
    commandItem({ kind: 'do', id: 'do:mark', label: 'Mark a syllabus line', hint: 'Opens the first line in the tree', where: 'Goes to Syllabus' }),
    commandItem({ kind: 'do', id: 'do:backup', label: 'Export a backup', hint: 'Every store in one JSON file', where: 'Downloads mymppsc-backup-*.json' }),
  ].filter(Boolean);

  openModal({
    title: 'Search, start and find',
    body: `<div class="command-menu">
      <label class="command-search">
        <span class="sr-only">Search screens, actions, subjects, topics, syllabus lines and questions</span>
        ${icon('search', { size: 18 })}
        <input id="commandSearch" type="search" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="commandResults" aria-autocomplete="list" placeholder="Screens, actions, subjects, topics, syllabus, questions…" />
        <kbd>Esc</kbd>
      </label>
      <div class="command-results" id="commandResults" role="listbox" aria-label="Results">
        ${commandGroup('Go', goItems)}
        ${commandGroup('Do', doItems)}
        <div id="commandFind" aria-live="polite"></div>
      </div>
      <p class="command-hint">↑ ↓ move · Enter open · Esc close · Tab moves between fields</p>
    </div>`,
    onMount(modal, close) {
      modal.classList.add('command-modal');
      const input = modal.querySelector('#commandSearch');
      const results = modal.querySelector('#commandResults');
      const findRoot = modal.querySelector('#commandFind');

      const visibleItems = () => Array.from(results.querySelectorAll('.command-item')).filter((item) => !item.hidden && !item.closest('[hidden]'));
      let activeIndex = -1;
      const paintActive = (next) => {
        const items = visibleItems();
        items.forEach((item) => {
          item.setAttribute('aria-selected', 'false');
          item.classList.remove('is-active');
        });
        if (!items.length) {
          activeIndex = -1;
          return;
        }
        activeIndex = (next + items.length) % items.length;
        const item = items[activeIndex];
        item.setAttribute('aria-selected', 'true');
        item.classList.add('is-active');
        modal.querySelector('#commandSearch')?.setAttribute('aria-activedescendant', item.dataset.commandId || '');
        item.scrollIntoView?.({ block: 'nearest' });
      };

      const filterStatic = () => {
        const query = input.value.trim().toLowerCase();
        results.querySelectorAll('[data-command-id]').forEach((item) => {
          item.hidden = Boolean(query) && !item.dataset.commandLabel.includes(query);
        });
        results.querySelectorAll('.command-group').forEach((group) => {
          group.hidden = !group.querySelector('[data-command-id]:not([hidden])');
        });
      };

      const renderFind = async () => {
        const query = input.value.trim();
        if (query.length < 2) {
          findRoot.innerHTML = '';
          return;
        }
        const [{ subjects, topics }, syllabus, questions] = await Promise.all([findClassification(query), findSyllabusLines(query), findQuestions(query)]);
        const groups = [
          commandGroup(
            'Find — subjects',
            subjects.map((row) => commandItem({ kind: 'find', id: `subject:${row.subject}`, label: row.subject, hint: `${row.count} question(s)`, where: 'Opens Topic & Custom Practice with it ticked' })),
          ),
          commandGroup(
            'Find — topics',
            topics.map((row) => commandItem({ kind: 'find', id: `topic:${row.subject}||${row.topic}`, label: `${row.topic}`, hint: `${row.subject} · ${row.count} question(s)`, where: 'Opens Topic & Custom Practice on this topic' })),
          ),
          commandGroup(
            'Find — syllabus',
            syllabus.map((row) => commandItem({ kind: 'find', id: `syllabus:${row.id}`, label: row.label, hint: row.examId === 'mains' ? 'Mains' : 'Prelims', where: 'Opens the line on the Syllabus screen' })),
          ),
          commandGroup(
            'Find — questions',
            questions.map((row) => commandItem({ kind: 'find', id: `question:${row.id}`, label: row.label.slice(0, 70), hint: row.id, where: 'Opens the question in the Question Bank' })),
          ),
        ].join('');
        findRoot.innerHTML = groups;
        // New results start at the top of the list.
        activeIndex = -1;
      };

      const run = (item) => {
        const kind = item.dataset.commandKind;
        const id = item.dataset.commandId.slice(item.dataset.commandId.indexOf(':') + 1);
        close(null);
        if (kind === 'go') {
          router.navigate(id);
          return;
        }
        if (kind === 'do') {
          runCommandAction(id);
          return;
        }
        if (id.startsWith('subject:')) router.navigate(`topic/${encodeURIComponent(id.slice('subject:'.length))}`);
        else if (id.startsWith('topic:')) router.navigate(`topic/${encodeURIComponent(id.slice('topic:'.length))}`);
        else if (id.startsWith('syllabus:')) router.navigate(`syllabus/official/${encodeURIComponent(id.slice('syllabus:'.length))}`);
        else if (id.startsWith('question:')) router.navigate(`bank/question/${encodeURIComponent(id.slice('question:'.length))}`);
      };

      results.addEventListener('click', (ev) => {
        const item = ev.target.closest('.command-item');
        if (item) run(item);
      });

      let findTimer = null;
      input.addEventListener('input', () => {
        filterStatic();
        paintActive(-1);
        clearTimeout(findTimer);
        findTimer = setTimeout(renderFind, 140);
        findTimer?.unref?.();
      });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          paintActive(activeIndex + 1);
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          paintActive(activeIndex - 1);
        } else if (ev.key === 'Enter') {
          ev.preventDefault();
          const items = visibleItems();
          const target = items[activeIndex] || items[0];
          if (target) run(target);
        } else if (ev.key === 'Home') {
          ev.preventDefault();
          paintActive(0);
        } else if (ev.key === 'End') {
          ev.preventDefault();
          paintActive(visibleItems().length - 1);
        }
      });
      input.focus();
    },
  });
}

/** The "Do" group's actions. Each finishes before the dialog's promise settles. */
async function runCommandAction(id) {
  if (id.startsWith('option:')) {
    const optionId = id.slice('option:'.length);
    const { options } = await buildStartOptions({ size: 20 });
    const option = options.find((entry) => entry.id === optionId);
    if (!option) {
      toast('That action is not available with the stored data right now.', 'info');
      return;
    }
    await startOption({ navigate: (path) => router.navigate(path) }, option);
    return;
  }
  if (id === 'start20') {
    const ids = shuffle(Array.from(state.questionIndex.keys())).slice(0, 20);
    if (!ids.length) {
      toast('Import a question bank first.', 'warn');
      router.navigate('bank');
      return;
    }
    const test = await tests.createTest({
      kind: 'custom',
      label: 'Practice — 20 questions',
      questionIds: ids,
      questionMetas: ids.map((qid) => state.questionIndex.get(qid)).filter(Boolean),
      orderSource: 'shuffled',
      config: { feedbackMode: state.settings.feedbackMode, randomizeOptions: state.settings.randomizeOptions },
      selectionNotes: ['Started from the command palette: 20 random questions from the whole bank.'],
    });
    router.navigate(`runner/${encodeURIComponent(test.id)}`);
    return;
  }
  if (id === 'resume') {
    const unfinished = await tests.unfinishedTests();
    if (!unfinished.length) {
      toast('Nothing is in progress. Start a session first.', 'info');
      return;
    }
    router.navigate(`runner/${encodeURIComponent(unfinished[0].id)}`);
    return;
  }
  if (id === 'mark') {
    await router.navigate('syllabus');
    // The first line's status mark is the control that marks a syllabus line;
    // focusing it makes the action one Enter away, with the keyboard only.
    setTimeout(() => document.querySelector('#view [data-cycle]')?.focus?.(), 0);
    return;
  }
  if (id === 'backup') await backupNow();
}


/* --------------------------------------------- bottom tab bar (≤560px) ---- */

/**
 * The five destinations a study session actually uses, pinned to the bottom of
 * the screen on phones (css/app.css hides the bar above 560px, where the
 * sidebar already lists everything). "More" opens the full drawer, so no
 * destination is lost — the bar is a shortcut, not a second navigation model.
 */
const TAB_BAR_ROUTES = ['dashboard', 'test-centre', 'smart', 'mistakes', 'revision'];

function renderTabBar() {
  const bar = document.getElementById('tabBar');
  if (!bar) return;
  const entries = TAB_BAR_ROUTES.map((route) => NAV.find((item) => item.route === route)).filter(Boolean);
  bar.innerHTML = `${entries
    .map(
      (item) => `<button class="tab-bar-item" type="button" data-route="${esc(item.route)}">
        <span class="tab-bar-icon" aria-hidden="true">${icon(item.icon, { size: 20 })}</span>
        <span class="tab-bar-label">${esc(item.route === 'dashboard' ? 'Today' : item.label.replace(' & Custom Practice', '').replace('PYQ ', ''))}</span>
      </button>`,
    )
    .join('')}
    <button class="tab-bar-item" type="button" data-more="1">
      <span class="tab-bar-icon" aria-hidden="true">${icon('topic', { size: 20 })}</span>
      <span class="tab-bar-label">More</span>
    </button>`;
  bar.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', () => {
      closeDrawer({ restoreFocus: false });
      router.navigate(button.dataset.route);
    });
  });
  bar.querySelector('[data-more]')?.addEventListener('click', () => openDrawer());
  markActiveTabBar(router?.currentRoute?.name);
}

function markActiveTabBar(routeName) {
  const destination = NAV_ALIASES[routeName] || routeName;
  document.querySelectorAll('#tabBar .tab-bar-item[data-route]').forEach((button) => {
    if (button.dataset.route === destination) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

/* ------------------------------------------------------- resume strip ---- */

/**
 * While a test is in progress, one strip — in the header on desktop, under it
 * on a phone — says which paper or set is open, how far it has got, and offers
 * Resume. It is deliberately absent on the runner itself (the runner *is* the
 * resume) and it disappears the moment nothing is in progress.
 */
async function refreshResumeStrip() {
  const strip = document.getElementById('resumeStrip');
  if (!strip) return;
  const routeName = router?.currentRoute?.name || '';
  if (routeName === 'runner' || routeName === 'report') {
    strip.hidden = true;
    return;
  }
  let unfinished = [];
  try {
    unfinished = await tests.unfinishedTests();
  } catch {
    unfinished = [];
  }
  if (!unfinished.length) {
    strip.hidden = true;
    return;
  }
  const test = unfinished[0];
  let progress = { answered: 0, unanswered: test.question_ids?.length || 0 };
  try {
    progress = tests.testProgress(test);
  } catch {
    /* keep the label-only strip */
  }
  const label = test.label || test.kind || 'Test in progress';
  document.getElementById('resumeStripText').textContent = `${label} · ${progress.answered} answered, ${progress.unanswered} left${
    unfinished.length > 1 ? ` · +${unfinished.length - 1} more` : ''
  }`;
  const button = document.getElementById('resumeStripBtn');
  if (button) {
    button.href = `#/runner/${encodeURIComponent(test.id)}`;
    button.textContent = 'Resume';
    button.setAttribute('aria-label', `Resume ${label}`);
  }
  strip.hidden = false;
}

/* --------------------------------------------------- #/practise link ------ */

/** `#/practise` opens the practice sheet over the dashboard (a deep link). */
let practiseLinkHandled = false;
function handlePracticeDeepLink(routeName, params) {
  let requested = routeName;
  try {
    requested = router.parse().requested;
  } catch {
    /* fall back to the resolved route name */
  }
  if (requested !== 'practise') {
    practiseLinkHandled = false;
    return;
  }
  if (practiseLinkHandled) return;
  practiseLinkHandled = true;
  openPracticeSheet({ navigate: (path) => router.navigate(path) }, { source: 'deep link' });
  // Move the address off `#/practise` so a later render does not reopen the
  // sheet. A plain navigate (not `replace`) is used because replacing the hash
  // is not observable in every environment, and the deep link is worth one
  // history entry anyway: Back returns to wherever the reader came from.
  router.navigate('dashboard');
}

function wireGlobalActions() {
  document.getElementById('quickStartBtn')?.addEventListener('click', () => openPracticeSheet({ navigate: (path) => router.navigate(path) }, { source: 'header' }));
  document.getElementById('commandBtn')?.addEventListener('click', openCommandMenu);
  document.getElementById('helpBtn')?.addEventListener('click', helpDialog);
  document.getElementById('themeToggle')?.addEventListener('click', async () => {
    const current = resolveEffectiveTheme(state.settings.theme);
    const next = current === 'dark' ? 'light' : 'dark';
    await saveSettings({ theme: next });
    syncThemeToggleButton();
  });

  document.getElementById('navCollapse')?.addEventListener('click', () => {
    const body = document.getElementById('appBody');
    applyNavCollapsed(!body?.classList.contains('nav-collapsed'), { persist: true });
  });

  const navToggle = document.getElementById('navToggle');
  navToggle?.addEventListener('click', () => {
    const isOpen = document.body.classList.contains('nav-open');
    if (isOpen) closeDrawer({ restoreFocus: true });
    else openDrawer();
  });

  document.getElementById('navScrim')?.addEventListener('click', () => {
    closeDrawer({ restoreFocus: true });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) {
      drawerUsedAsModal = false;
      document.body.classList.remove('nav-open');
    }
    syncDrawerState();
  });

  if (typeof window.matchMedia === 'function') {
    try {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener?.('change', () => {
        if ((state.settings.theme || 'system') === 'system') syncThemeToggleButton();
      });
    } catch {
      /* ignore matchMedia listener issues */
    }
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && document.body.classList.contains('nav-open')) {
      ev.preventDefault();
      closeDrawer({ restoreFocus: true });
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      openCommandMenu();
      return;
    }
    const tag = ev.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target?.isContentEditable) return;
    if (ev.key === '?') {
      ev.preventDefault();
      helpDialog();
    }
  });

  window.addEventListener('online', () => setOfflinePill(false));
  window.addEventListener('offline', () => {
    setOfflinePill(true);
    toast('You are offline. MyMPPSC keeps working: the question bank, tests, analytics and revision are all local.', 'warn');
  });
  window.addEventListener('error', (ev) => {
    console.error('Unhandled error', ev.error || ev.message);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    console.error('Unhandled promise rejection', ev.reason);
    toast(`Something went wrong: ${ev.reason?.message || ev.reason}`, 'bad');
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol === 'file:') {
    logEvent('pwa', 'Service worker registration skipped for file:// — serve the folder over http(s) for offline support.');
    return;
  }
  try {
    await navigator.serviceWorker.register('sw.js', { scope: './' });
    logEvent('pwa', 'Service worker registered');
  } catch (err) {
    console.warn('Service worker registration failed', err);
  }
}

let booted = false;

async function boot() {
  if (booted) return;
  booted = true;
  loadUiPrefs();
  try {
    await db.getDb();
  } catch (err) {
    state.dbError = err;
    document.getElementById('view').innerHTML = notice(
      `<strong>Local storage is unavailable.</strong> ${esc(err.message)} MyMPPSC stores everything in your browser, so it cannot run without IndexedDB. Try a normal (non-private) window and allow site data, then reload.`,
      'bad',
    );
    return;
  }
  try {
    await loadSettings();
    await refreshQuestionIndex({ silent: true });
    // The MPPSC 2013–2024 bank ships with the repository and is loaded here, so
    // a fresh installation never has to import a file by hand. The loader is
    // idempotent (it compares the file's SHA-256 with the one it recorded) and
    // non-destructive (it merges through the normal importer, preserving
    // corrections, attempts and locally authored questions).
    const builtin = await ensureBuiltinBank({ silent: true });
    if (builtin.status === 'loaded' || builtin.status === 'updated') {
      await refreshQuestionIndex({ silent: true });
      toast(builtin.message, 'ok');
    }
    if (builtin.status === 'blocked') console.error('Built-in bank was not imported:', builtin.message);
  } catch (err) {
    console.error('Could not load local data', err);
    toast(`Local data could not be fully loaded: ${err.message}`, 'bad');
  }

  syncThemeToggleButton();

  router = new Router({
    container: document.getElementById('view'),
    fallback: 'dashboard',
    onNavigate: (routeName, params) => {
      markActiveNav(routeName);
      markActiveTabBar(routeName);
      handlePracticeDeepLink(routeName, params);
      refreshResumeStrip();
    },
  });

  router.register('dashboard', dashboardView);
  router.register('test-centre', testCentreView);
  router.register('runner', runnerView);
  router.register('report', reportView);
  router.register('topic', topicView);
  router.register('smart', smartView);
  router.register('mistakes', mistakesView);
  router.register('revision', revisionView);
  router.register('syllabus', syllabusView);
  router.register('analytics', insightsView);
  // Legacy routes. `#/syllabus-analysis/<nodeId>` and `#/pyq-analysis/<Subject>`
  // are used by the curated syllabus link chips and by anything a user
  // bookmarked before the two merges, so they keep resolving to the section
  // that absorbed them instead of falling back to the dashboard.
  router.register('syllabus-analysis', syllabusAnalysisView);
  router.register('pyq-analysis', pyqAnalysisView);
  router.register('bank', bankView);
  router.register('settings', settingsView);
  router.register('help', helpView);
  // `#/custom` (and anything under it) opens the merged practice screen. It is
  // an alias rather than a registration so the address, the view and the
  // highlighted navigation item all agree on one destination.
  router.alias('custom', 'topic');

  restoreNavCollapsed();
  renderNav();
  renderTabBar();
  wireGlobalActions();
  setOfflinePill();
  router.start();
  await refreshBadges();
  await refreshResumeStrip();
  db.requestPersistence().catch(() => {});
  registerServiceWorker();

  on('bank:changed', () => refreshBadges());
  on('attempts:changed', () => {
    refreshBadges();
    refreshResumeStrip();
  });
  on('mistakes:changed', () => refreshBadges());
  on('settings:changed', () => {
    syncThemeToggleButton();
    refreshBadges();
  });

  // Offer the demonstration dataset on a completely empty first run.
  if (!state.questionIndex.size) {
    const dismissed = localStorage.getItem('mymppsc.demoPromptDismissed') === '1';
    if (!dismissed) {
      const wants = await confirmDialog({
        title: 'Start with the demonstration dataset?',
        message:
          'No question bank is stored yet. You can load a small, clearly-labelled <strong>demonstration dataset</strong> (synthetic questions, NOT genuine MPPSC papers) to try every feature, or import your own validated bank.',
        confirmLabel: 'Load demonstration data',
        cancelLabel: 'Not now',
      });
      if (wants) {
        const { loadDemoBank } = await import('./ui/views/bank.js');
        await loadDemoBank();
        await refreshBadges();
        router.resolve();
      } else {
        localStorage.setItem('mymppsc.demoPromptDismissed', '1');
      }
    }
  }
  logEvent('app', `Booted MyMPPSC ${APP_VERSION}`);
}

window.addEventListener('DOMContentLoaded', boot);

// If this module is evaluated after the document has already been parsed (for
// example when it is imported dynamically, or by a test harness), boot straight
// away instead of waiting for an event that will never fire again.
if (document.readyState !== 'loading') boot();

export { router, backupNow, refreshBadges, refreshResumeStrip, renderTabBar, openCommandMenu, openPracticeSheet, boot };
