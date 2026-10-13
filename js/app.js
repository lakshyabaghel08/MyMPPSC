/**
 * app.js — Application bootstrap, navigation, theme switch and global behaviour.
 */

import { APP_VERSION, STORES } from './core/constants.js';
import * as db from './core/db.js';
import { state, loadUiPrefs, loadSettings, saveSettings, applyTheme, resolveEffectiveTheme, refreshQuestionIndex, on } from './core/state.js';
import { Router } from './ui/router.js';
import { toast, openModal, confirmDialog, esc, notice, icon } from './ui/components.js';
import { logEvent, downloadJson, fmtDate } from './core/util.js';
import { mistakeCounts } from './services/attempts.js';
import { ensureBuiltinBank } from './services/builtin-bank.js';
import { revisionSummary } from './services/revision.js';
import { buildBackup, markBackupTaken, lastBackupInfo } from './services/data.js';

import dashboardView from './ui/views/dashboard.js';
import testCentreView from './ui/views/testcentre.js';
import runnerView from './ui/views/runner.js';
import reportView from './ui/views/report.js';
import topicView from './ui/views/topic.js';
import customView from './ui/views/custom.js';
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
  { route: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'Workspace' },
  { route: 'test-centre', label: 'PYQ Test Centre', icon: 'test-centre', group: 'Practice' },
  { route: 'topic', label: 'Topic Practice', icon: 'topic', group: 'Practice' },
  { route: 'custom', label: 'Custom Test', icon: 'custom', group: 'Practice' },
  { route: 'smart', label: 'Smart Practice', icon: 'smart', group: 'Practice' },
  { route: 'mistakes', label: 'Mistake Book', icon: 'mistakes', badge: 'mistakes', group: 'Improve' },
  { route: 'revision', label: 'Revision Centre', icon: 'revision', badge: 'revision', group: 'Improve' },
  // The official syllabus, the study planner, performance analytics and the
  // question-bank analysis used to be four destinations. They are two: one
  // curriculum, and one place for the numbers. The old routes still resolve —
  // see the legacy registrations below — they are simply not advertised twice.
  { route: 'syllabus', label: 'Syllabus', icon: 'syllabus', group: 'Improve' },
  { route: 'analytics', label: 'Insights', icon: 'analytics', group: 'Improve' },
  { route: 'bank', label: 'Question Bank & Imports', icon: 'bank', group: 'System' },
  { route: 'settings', label: 'Settings & Backup', icon: 'settings', group: 'System' },
  { route: 'help', label: 'Help & How it works', icon: 'help', group: 'System' },
];

let router = null;
let drawerUsedAsModal = false;
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

export function syncDrawerState() {
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
    return `${groupLabel}<li><button class="nav-link" type="button" data-route="${item.route}">
      <span class="nav-icon" aria-hidden="true">${icon(item.icon)}</span>
      <span>${esc(item.label)}</span>${badgeHtml}
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
  document.querySelectorAll('.nav-link').forEach((btn) => {
    if (btn.dataset.route === routeName) btn.setAttribute('aria-current', 'page');
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

function openCommandMenu() {
  const modalRoot = document.getElementById('modalRoot');
  if (!modalRoot?.hidden) return;

  const items = NAV.map((item) => `
    <button class="command-item" type="button" data-command-route="${esc(item.route)}" data-command-label="${esc(`${item.label} ${item.group}`.toLowerCase())}">
      <span class="command-item-icon">${icon(item.icon, { size: 18 })}</span>
      <span><strong>${esc(item.label)}</strong><small>${esc(item.group)}</small></span>
      <span class="command-arrow" aria-hidden="true">→</span>
    </button>`).join('');

  openModal({
    title: 'Go anywhere',
    body: `<div class="command-menu">
      <label class="command-search">
        <span class="sr-only">Search screens</span>
        ${icon('search', { size: 18 })}
        <input id="commandSearch" type="search" autocomplete="off" placeholder="Search practice, revision, analytics…" />
        <kbd>Esc</kbd>
      </label>
      <div class="command-results" id="commandResults">${items}</div>
      <p class="command-hint">Type to filter · use Tab to move · Enter to open</p>
    </div>`,
    onMount(modal, close) {
      modal.classList.add('command-modal');
      const input = modal.querySelector('#commandSearch');
      const commands = [...modal.querySelectorAll('[data-command-route]')];
      const filter = () => {
        const query = input.value.trim().toLowerCase();
        commands.forEach((button) => {
          button.hidden = query && !button.dataset.commandLabel.includes(query);
        });
      };
      commands.forEach((button) => button.addEventListener('click', () => {
        const route = button.dataset.commandRoute;
        close(route);
        router.navigate(route);
      }));
      input.addEventListener('input', filter);
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const first = commands.find((button) => !button.hidden);
        if (first) {
          ev.preventDefault();
          first.click();
        }
      });
      input.focus();
    },
  });
}

async function quickPractice() {
  if (!state.questionIndex.size) {
    toast('Import a question bank first — the Question Bank screen explains the format and includes a demonstration dataset.', 'warn');
    router.navigate('bank');
    return;
  }
  const [{ smartPracticePlan, buildAttemptSummary }, { allAttempts }, tests] = await Promise.all([
    import('./services/select.js'),
    import('./services/attempts.js'),
    import('./services/tests.js'),
  ]);
  const plan = smartPracticePlan({
    metas: Array.from(state.questionIndex.values()),
    attemptSummary: buildAttemptSummary(await allAttempts()),
    revisionRecords: await db.getAll(STORES.REVISION),
    count: Math.min(10, state.questionIndex.size),
  });
  const metas = plan.questionIds.map((id) => state.questionIndex.get(id)).filter(Boolean);
  if (!metas.length) {
    toast('There is nothing suitable to practise right now.', 'warn');
    return;
  }
  const test = await tests.createTest({
    kind: 'smart',
    label: 'Quick practice',
    questionIds: plan.questionIds,
    questionMetas: metas,
    orderSource: 'shuffled',
    config: {
      feedbackMode: 'learning',
      confidence: state.settings.confidenceTracking,
      durationMinutes: null,
      randomizeOptions: state.settings.randomizeOptions,
    },
    selectionNotes: ['Quick practice — built from what is due for revision, what you keep getting wrong and what you have not seen yet.', ...plan.explain],
  });
  router.navigate(`runner/${encodeURIComponent(test.id)}`);
}

function wireGlobalActions() {
  document.getElementById('quickStartBtn')?.addEventListener('click', quickPractice);
  document.getElementById('commandBtn')?.addEventListener('click', openCommandMenu);
  document.getElementById('helpBtn')?.addEventListener('click', helpDialog);
  document.getElementById('navBackupBtn')?.addEventListener('click', () => backupNow());
  document.getElementById('themeToggle')?.addEventListener('click', async () => {
    const current = resolveEffectiveTheme(state.settings.theme);
    const next = current === 'dark' ? 'light' : 'dark';
    await saveSettings({ theme: next });
    syncThemeToggleButton();
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
    onNavigate: (routeName) => markActiveNav(routeName),
  });

  router.register('dashboard', dashboardView);
  router.register('test-centre', testCentreView);
  router.register('runner', runnerView);
  router.register('report', reportView);
  router.register('topic', topicView);
  router.register('custom', customView);
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

  renderNav();
  wireGlobalActions();
  setOfflinePill();
  router.start();
  await refreshBadges();
  db.requestPersistence().catch(() => {});
  registerServiceWorker();

  on('bank:changed', () => refreshBadges());
  on('attempts:changed', () => refreshBadges());
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

export { router, backupNow, refreshBadges, boot };
