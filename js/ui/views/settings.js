/**
 * settings.js (view) — Settings & Backup.
 *
 * Preferences (with IndexedDB as the source of truth and a localStorage mirror),
 * scoring defaults, revision rules, practice behaviour, full backup/restore with
 * validation, storage diagnostics and a clearly-marked destructive zone.
 */

import { APP_VERSION, DB_NAME, DB_VERSION, SUPPORTED_SCHEMA_VERSIONS, STORES } from '../../core/constants.js';
import { state, saveSettings, resetSettings, loadSettings, refreshQuestionIndex } from '../../core/state.js';
import * as db from '../../core/db.js';
import { esc, badge, card, tile, dataTable, toast, openModal, confirmDialog, tabs, mountTabs, sourceChip } from '../components.js';
import { fmtBytes, fmtDate, fmtRelative, readFileAsText, downloadJson, getLogRing, todayKey } from '../../core/util.js';
import * as data from '../../services/data.js';
import * as builtinBank from '../../services/builtin-bank.js';

const viewState = { tab: 'general', restoreCandidate: null, restoreValidation: null };

function check(id, label, checked, hint = '') {
  return `<label class="check"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} /><span>${label}${hint ? `<span class="hint">${hint}</span>` : ''}</span></label>`;
}

function selectField(id, label, options, value, hint = '') {
  return `<label class="field"><span class="label-text">${label}</span>
    <select id="${id}">${Object.entries(options).map(([k, l]) => `<option value="${esc(k)}" ${String(value) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    ${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
}

function numberField(id, label, value, { step = '1', min = null, max = null, hint = '' } = {}) {
  return `<label class="field"><span class="label-text">${label}</span>
    <input type="number" id="${id}" value="${esc(String(value))}" step="${esc(step)}" ${min !== null ? `min="${esc(String(min))}"` : ''} ${max !== null ? `max="${esc(String(max))}"` : ''} />
    ${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
}

export default {
  title: 'Settings & Backup',

  async render(ctx) {
    const s = state.settings;
    const report = await data.storageReport();
    const log = getLogRing().slice(-25).reverse();
    const lastBackup = data.lastBackupInfo();
    const builtinInfo = await builtinBank.builtinBankInfo();

    const general = `
      ${card({
        title: 'Language, theme and defaults',
        body: `
          <div class="field-row">
            ${selectField('setLanguage', 'Interface and question language', { en: 'English (default)', hi: 'हिन्दी where available' }, s.language, 'Questions are shown in this language when the variant exists. Hindi text is never translated or altered.')}
            ${selectField('setTheme', 'Theme', { light: 'Light', dark: 'Dark', system: 'Follow the system' }, s.theme)}
            ${selectField('setDensity', 'Density', { comfortable: 'Comfortable', compact: 'Compact' }, s.density)}
          </div>
          <div class="field-row">
            ${selectField('setFeedback', 'Default feedback timing', { exam: 'Exam simulation (reveal after submission)', learning: 'Learning mode (reveal immediately)' }, s.feedbackMode)}
            ${selectField('setConfidence', 'Confidence marking', { off: 'Off', optional: 'Optional', required: 'Required' }, s.confidenceTracking, 'Stored separately from correctness. Correct-but-guessed answers return sooner in revision.')}
            ${selectField('setPolicy', 'Answer policy', { verified_preferred: 'Use the verified answer when it exists', supplied: 'Always use the stored answer key', verified_only: 'Only judge questions with a verified answer' }, s.answerPolicy, 'The stored key is never overwritten.')}
          </div>
          <div class="field-row">
            ${selectField('setUnresolved', 'If an answer is missing or disputed', { supplied: 'Judge with the stored key and flag it', verified: 'Only judge when independelty verified', exclude: 'Exclude from the score' }, s.scoringPolicyWhenUnresolved)}
            ${selectField('setDailyTarget', 'Daily task target', { 1: '1 task', 2: '2 tasks', 3: '3 tasks', 4: '4 tasks', 5: '5 tasks' }, s.dailyTaskTarget)}
          </div>
          <div class="stack">
            ${check('setTimer', 'Show the countdown timer by default', s.showTimer)}
            ${check('setAutoSubmit', 'Submit automatically when time runs out', s.autoSubmitOnExpiry)}
            ${check('setAllowPause', 'Allow pausing a test (the clock stops while paused)', s.allowPause)}
            ${check('setWarnUnanswered', 'Warn me when submitting with unanswered questions', s.warnOnSubmitUnanswered)}
            ${check('setShuffleOptions', 'Randomise option order where it is safe (never for matching questions)', s.randomizeOptions)}
          </div>`,
      })}

      ${card({
        title: 'Default scoring (used when no paper rules apply)',
        body: `
          <p class="small">Paper-specific rules always take priority when they are known. These defaults are used for practice sets and as a starting point you can override per test.</p>
          <div class="field-row">
            ${numberField('setMarksCorrect', 'Marks per correct answer', s.defaultScoring.marksPerCorrect, { step: '0.25' })}
            ${numberField('setMarksWrong', 'Negative marks per wrong answer (positive number)', s.defaultScoring.negativeMarksPerIncorrect, { step: '0.01', min: 0 })}
            ${numberField('setMarksUnanswered', 'Marks for an unanswered question', s.defaultScoring.marksForUnanswered, { step: '0.25' })}
          </div>
          ${check('setNegative', 'Apply negative marking with the defaults above', s.defaultScoring.negativeMarkingEnabled)}
          <p class="tiny muted">Scoring is deterministic: the same answers against the same rules always produce the same score. The rules used for every test are stored with that test and displayed in its report.</p>`,
      })}

      ${card({
        title: 'Practice and repeat behaviour',
        body: `
          ${check('setPreferUnseen', 'Prefer questions I have never attempted when building practice sets', s.repeatPolicy.preferUnseen)}
          <div class="field-row">
            ${numberField('setCooldown', 'Cooldown before a question can repeat (days)', s.repeatPolicy.cooldownDays, { min: 0 })}
            ${numberField('setUnseenRatio', 'Target share of unseen questions in smart practice (0–1)', s.repeatPolicy.unseenRatio, { step: '0.05', min: 0, max: 1 })}
            ${numberField('setNearDup', 'Near-duplicate similarity threshold (0–1)', s.repeatPolicy.nearDuplicateThreshold, { step: '0.01', min: 0.3, max: 0.95, hint: 'Used when reporting possible duplicates at import. A higher value reports fewer matches.' })}
          </div>
          ${check('setAllowRepeatsCustom', 'Allow repeats inside custom tests', s.repeatPolicy.allowRepeatsInCustom)}`,
      })}`;

    const revisionTab = `
      ${card({
        title: 'Revision intervals by level',
        body: `
          <p class="small">A correct answer that you were confident about moves a question up one level; each level has its own interval. These numbers are the whole scheduling model — nothing is hidden.</p>
          <div class="field-row">
            ${Object.entries(s.revision.intervals)
              .map(([level, days]) => numberField(`setInterval${level}`, `Level ${level} (days)`, days, { min: 1, max: 365 }))
              .join('')}
          </div>
          <div class="field-row">
            ${numberField('setHardReset', 'Level a wrong answer resets to', s.revision.hardResetTo, { min: 1, max: 6 })}
            ${numberField('setMinInterval', 'Minimum interval (days)', s.revision.minIntervalDays, { min: 1 })}
            ${numberField('setMaxInterval', 'Maximum interval (days)', s.revision.maxIntervalDays, { min: 1 })}
          </div>
          <div class="field-row">
            ${numberField('setUncertainMultiplier', 'Multiplier for correct-but-unsure', s.revision.uncertainMultiplier, { step: '0.05', min: 0.1, max: 1 })}
            ${numberField('setGuessMultiplier', 'Multiplier for correct-but-guessed', s.revision.guessMultiplier, { step: '0.05', min: 0.1, max: 1 })}
            ${numberField('setSlowSeconds', '“Slow answer” threshold (seconds)', s.revision.slowAnswerSeconds, { min: 10, max: 600 })}
          </div>
          ${check('setUnansweredIsMiss', 'Treat an unanswered question as a miss (it still stays labelled separately from a wrong answer)', s.revision.unansweredIsMiss)}
          <p class="tiny muted">Changing these values affects future scheduling only. Existing revision records keep the interval they were given, and every record shows the basis it was computed from.</p>`,
      })}`;

    const backupTab = `
      ${card({
        title: 'Create a backup',
        right: sourceChip('measured', 'local JSON + SHA-256'),
        body: `
          <p class="small">A backup is a single JSON file containing your question bank, papers, tests, attempts, mistakes, revision schedule, syllabus, tasks, study sessions, import history and settings. It is written by your browser to your device — nothing is uploaded.</p>
          <div class="row">
            <label class="check"><input type="checkbox" id="backupTests" checked /><span>Include test sessions and results</span></label>
            <label class="check"><input type="checkbox" id="backupQuestions" checked /><span>Include the question bank (uncheck to back up progress only)</span></label>
          </div>
          <div class="row mt-3">
            <button class="btn btn-primary" type="button" id="makeBackup">Download backup</button>
            <button class="btn" type="button" id="backupProgress">Download progress only</button>
            <button class="btn btn-quiet" type="button" id="backupCheck">Run a round-trip self-test</button>
          </div>
          <p class="tiny muted mt-2">Last backup: ${lastBackup ? esc(`${fmtDate(lastBackup.at)} (${fmtRelative(lastBackup.at)})`) : 'never recorded on this device'}.</p>
          <p class="tiny muted">Browser storage can be cleared by you, by the browser, or when a device runs out of space. Keep a backup file outside the browser.</p>`,
      })}

      ${card({
        title: 'Restore from a backup',
        body: `
          <p class="small">Restoring validates the file first and shows you exactly what it contains before anything is written. Integrity is checked against the SHA-256 recorded inside the file.</p>
          <div class="row"><input type="file" id="restoreFile" accept="application/json,.json" /></div>
          ${viewState.restoreValidation ? renderRestoreSummary() : ''}`,
      })}

      ${card({
        title: 'Storage',
        right: sourceChip('measured', 'IndexedDB'),
        body: `
          <div class="grid tiles">
            ${tile({ label: 'Records stored', value: String(Object.values(report.counts).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0)), sub: `${Object.keys(report.counts).length} stores`, source: 'measured', where: 'Local IndexedDB stores' })}
            ${tile({ label: 'Estimated usage', value: report.estimate?.usage === null || report.estimate?.usage === undefined ? '—' : fmtBytes(report.estimate.usage), sub: report.estimate?.quota ? `of about ${fmtBytes(report.estimate.quota)} available` : 'quota unknown', source: report.estimate?.usage !== null && report.estimate?.usage !== undefined ? 'measured' : 'unavailable', where: 'Browser StorageManager API' })}
            ${tile({ label: 'Persistent storage', value: report.persisted === null ? 'unknown' : report.persisted ? 'granted' : 'not granted', sub: 'asked of the browser, not guaranteed', tone: report.persisted ? 'ok' : '', source: report.persisted === null ? 'unavailable' : 'measured' })}
            ${tile({ label: 'Last backup', value: lastBackup ? fmtRelative(lastBackup.at) : 'never', tone: lastBackup ? '' : 'warn', source: lastBackup ? 'measured' : 'unavailable' })}
          </div>
          ${dataTable({ columns: [{ label: 'Store' }, { label: 'Records', num: true }], rows: Object.entries(report.counts).map(([k, v]) => [esc(k), typeof v === 'number' ? String(v) : esc(String(v))]), className: 'compact' })}
          <div class="row mt-3"><button class="btn btn-sm" type="button" id="requestPersistence">Ask the browser for persistent storage</button></div>
          <p class="tiny muted">${esc(report.warning)}</p>`,
      })}`;

    const diagnosticsTab = `
      ${card({
        title: 'Application',
        body: dataTable({
          columns: [{ label: 'Item' }, { label: 'Value' }],
          rows: [
            ['Application version', esc(APP_VERSION)],
            ['Supported bank schema versions', esc(SUPPORTED_SCHEMA_VERSIONS.join(', '))],
            ['Database', `${esc(DB_NAME)} (version ${esc(String(DB_VERSION))})`],
            ['Stored questions / papers', `${state.questionIndex.size} / ${state.papers.size}`],
            ['Stored tests / attempts', `${state.counts.tests ?? '—'} / ${state.counts.attempts ?? '—'}`],
            ['Interface language', esc(state.settings.language)],
            ['Service worker', 'registered when served over http(s) so the app works offline'],
          ],
          className: 'compact',
        }),
      })}

      ${card({
        title: 'Recent activity log',
        subtitle: 'Kept in memory for this session only',
        body: dataTable({
          columns: [{ label: 'When' }, { label: 'Area' }, { label: 'Event' }],
          rows: log.map((entry) => [esc(fmtRelative(entry.at)), esc(entry.area), esc(entry.message)]),
          empty: 'Nothing logged yet in this session.',
          className: 'compact',
        }),
      })}

      ${card({
        title: 'Destructive actions',
        tone: 'bad',
        body: `
          <p class="small">These actions cannot be undone. Export a backup first.</p>
          <div class="row">
            <button class="btn" type="button" id="resetSettings">Reset all settings to defaults</button>
            ${builtinInfo.loaded ? '<button class="btn" type="button" id="removeBuiltinBank">Remove the bundled MPPSC bank</button>' : ''}
            <button class="btn btn-danger" type="button" id="wipeData">Delete all local data</button>
          </div>
          <p class="tiny muted mb-0">${builtinInfo.loaded ? `The bundled bank holds ${builtinInfo.storedQuestions} question(s) loaded from the repository; removing it leaves your own questions, tests, attempts and revision history untouched, and it is loaded again on the next start while the file is unchanged.` : 'The bundled MPPSC bank is not loaded on this device.'}</p>`,
      })}`;

    return `
      <h1>Settings &amp; Backup</h1>
      ${tabs({
        id: 'settingsTabs',
        activeId: viewState.tab,
        items: [
          { id: 'general', label: 'General', body: general },
          { id: 'revision', label: 'Revision rules', body: revisionTab },
          { id: 'backup', label: 'Backup & restore', body: backupTab },
          { id: 'diagnostics', label: 'Diagnostics', body: diagnosticsTab },
        ],
      })}`;
  },

  async mount(ctx, root) {
    mountTabs(root);
    root.querySelectorAll('.tabs .tab').forEach((tab) => tab.addEventListener('click', () => {
      viewState.tab = tab.dataset.tab;
    }));

    /* --------------------------------------------------------- preferences -- */
    const patchSetting = async (patch) => {
      await saveSettings(patch);
      toast('Setting saved.', 'ok');
    };

    const bindSelect = (id, apply) => {
      document.getElementById(id)?.addEventListener('change', async (ev) => {
        await apply(ev.target.value);
        await ctx.refresh();
      });
    };
    const bindCheck = (id, apply) => {
      document.getElementById(id)?.addEventListener('change', async (ev) => {
        await apply(ev.target.checked);
        await ctx.refresh();
      });
    };
    const bindNumber = (id, apply) => {
      document.getElementById(id)?.addEventListener('change', async (ev) => {
        await apply(Number(ev.target.value));
        await ctx.refresh();
      });
    };

    bindSelect('setLanguage', (v) => patchSetting({ language: v }));
    bindSelect('setTheme', (v) => patchSetting({ theme: v }));
    bindSelect('setDensity', (v) => patchSetting({ density: v }));
    bindSelect('setFeedback', (v) => patchSetting({ feedbackMode: v }));
    bindSelect('setConfidence', (v) => patchSetting({ confidenceTracking: v }));
    bindSelect('setPolicy', (v) => patchSetting({ answerPolicy: v }));
    bindSelect('setUnresolved', (v) => patchSetting({ scoringPolicyWhenUnresolved: v }));
    bindSelect('setDailyTarget', (v) => patchSetting({ dailyTaskTarget: Number(v) || 3 }));
    bindCheck('setTimer', (v) => patchSetting({ showTimer: v }));
    bindCheck('setAutoSubmit', (v) => patchSetting({ autoSubmitOnExpiry: v }));
    bindCheck('setAllowPause', (v) => patchSetting({ allowPause: v }));
    bindCheck('setWarnUnanswered', (v) => patchSetting({ warnOnSubmitUnanswered: v }));
    bindCheck('setShuffleOptions', (v) => patchSetting({ randomizeOptions: v }));

    bindNumber('setMarksCorrect', (v) => patchSetting({ defaultScoring: { marksPerCorrect: v } }));
    bindNumber('setMarksWrong', (v) => patchSetting({ defaultScoring: { negativeMarksPerIncorrect: v } }));
    bindNumber('setMarksUnanswered', (v) => patchSetting({ defaultScoring: { marksForUnanswered: v } }));
    bindCheck('setNegative', (v) => patchSetting({ defaultScoring: { negativeMarkingEnabled: v } }));

    bindCheck('setPreferUnseen', (v) => patchSetting({ repeatPolicy: { preferUnseen: v } }));
    bindCheck('setAllowRepeatsCustom', (v) => patchSetting({ repeatPolicy: { allowRepeatsInCustom: v } }));
    bindNumber('setCooldown', (v) => patchSetting({ repeatPolicy: { cooldownDays: Math.max(0, v) } }));
    bindNumber('setUnseenRatio', (v) => patchSetting({ repeatPolicy: { unseenRatio: v } }));
    bindNumber('setNearDup', (v) => patchSetting({ repeatPolicy: { nearDuplicateThreshold: v } }));

    Object.keys(state.settings.revision.intervals).forEach((level) => {
      bindNumber(`setInterval${level}`, (v) => patchSetting({ revision: { intervals: { [level]: Math.max(1, v) } } }));
    });
    bindNumber('setHardReset', (v) => patchSetting({ revision: { hardResetTo: Math.max(1, v) } }));
    bindNumber('setMinInterval', (v) => patchSetting({ revision: { minIntervalDays: Math.max(1, v) } }));
    bindNumber('setMaxInterval', (v) => patchSetting({ revision: { maxIntervalDays: Math.max(1, v) } }));
    bindNumber('setUncertainMultiplier', (v) => patchSetting({ revision: { uncertainMultiplier: v } }));
    bindNumber('setGuessMultiplier', (v) => patchSetting({ revision: { guessMultiplier: v } }));
    bindNumber('setSlowSeconds', (v) => patchSetting({ revision: { slowAnswerSeconds: Math.max(5, v) } }));
    bindCheck('setUnansweredIsMiss', (v) => patchSetting({ revision: { unansweredIsMiss: v } }));

    /* -------------------------------------------------------------- backup -- */
    document.getElementById('makeBackup')?.addEventListener('click', async () => {
      const includeTests = Boolean(document.getElementById('backupTests')?.checked);
      const includeQuestions = Boolean(document.getElementById('backupQuestions')?.checked);
      const backup = await data.buildBackup({ includeTests, includeQuestions, note: 'Manual backup from Settings.' });
      downloadJson(backup, `mymppsc-backup-${todayKey()}.json`);
      data.markBackupTaken({ questions: backup.counts.questions, attempts: backup.counts.attempts, includeQuestions, includeTests });
      toast(`Backup written: ${backup.counts.questions} question(s), ${backup.counts.attempts} attempt(s).`, 'ok');
      await ctx.refresh();
    });

    document.getElementById('backupProgress')?.addEventListener('click', async () => {
      const payload = await data.exportProgressJson();
      downloadJson(payload, `mymppsc-progress-${todayKey()}.json`);
      data.markBackupTaken({ note: 'progress-only export' });
      toast('Progress export written (no question bank included).', 'ok');
      await ctx.refresh();
    });

    document.getElementById('backupCheck')?.addEventListener('click', async () => {
      const check = await data.backupRoundTripCheck();
      toast(
        check.ok
          ? `Round-trip self-test passed: the backup validates and its SHA-256 integrity hash matches (${check.counts.questions} questions, ${check.counts.attempts} attempts).`
          : `Round-trip self-test failed: ${[...check.errors, ...(check.integrity.matches === false ? ['integrity hash mismatch'] : [])].join(' ')}`,
        check.ok ? 'ok' : 'bad',
      );
    });

    document.getElementById('restoreFile')?.addEventListener('change', async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const text = await readFileAsText(file);
        const parsed = JSON.parse(text);
        const validation = data.validateBackup(parsed);
        validation.integrity = await data.verifyBackupIntegrity(parsed);
        viewState.restoreValidation = validation;
        viewState.restoreCandidateName = file.name;
        if (!validation.ok) toast('This file is not a valid backup; it will not be restored.', 'bad');
        else toast('Backup analysed. Review the summary below, then choose how to restore.', 'info');
        await ctx.refresh();
      } catch (err) {
        toast(`The backup could not be read: ${err.message}`, 'bad');
      } finally {
        ev.target.value = '';
      }
    });

    document.getElementById('restoreMerge')?.addEventListener('click', () => performRestore(ctx, 'merge'));
    document.getElementById('restoreReplace')?.addEventListener('click', () => performRestore(ctx, 'replace'));
    document.getElementById('restoreCancel')?.addEventListener('click', async () => {
      viewState.restoreValidation = null;
      await ctx.refresh();
    });

    /* --------------------------------------------------------- diagnostics -- */
    document.getElementById('requestPersistence')?.addEventListener('click', async () => {
      const granted = await db.requestPersistence();
      toast(granted ? 'The browser granted persistent storage.' : 'The browser did not grant persistent storage. Keep regular backups.', granted ? 'ok' : 'warn');
      await ctx.refresh();
    });

    document.getElementById('resetSettings')?.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Reset all settings?', message: 'Preferences return to their defaults. Your question bank, attempts and revision schedule are not touched.', confirmLabel: 'Reset settings' });
      if (!ok) return;
      await resetSettings();
      toast('Settings reset to defaults.', 'ok');
      await ctx.refresh();
    });

    document.getElementById('removeBuiltinBank')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Remove the bundled MPPSC bank from this device?',
        message: 'The 2019–2024 questions and papers stored from the repository bank are removed from this browser. Your own imported questions, tests, attempts, bookmarks and revision history are untouched; the bank is loaded again the next time you start the app.',
        confirmLabel: 'Remove from this device',
        danger: true,
      });
      if (!ok) return;
      const removed = await builtinBank.removeBuiltinBank();
      await refreshQuestionIndex({ silent: true });
      toast(`Removed ${removed.removedQuestions} question(s). The bundled bank will be loaded again on the next start.`, 'info');
      await ctx.refresh();
    });

    document.getElementById('wipeData')?.addEventListener('click', async () => {
      const value = await openModal({
        title: 'Delete all local data',
        body: `
          <p class="small">This removes the question bank, tests, attempts, mistakes, revision schedule, syllabus, tasks and sessions from this browser. It cannot be undone.</p>
          <p class="small"><strong>Type DELETE in capitals to confirm.</strong></p>
          <label class="field"><span class="label-text">Confirmation</span><input type="text" id="wipeConfirm" /></label>`,
        actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Delete everything', tone: 'btn-danger', value: 'ok' }],
      });
      if (value !== 'ok') return;
      if ((document.getElementById('wipeConfirm')?.value || '').trim() !== 'DELETE') {
        toast('Nothing was deleted: the confirmation text did not match.', 'warn');
        return;
      }
      await db.clearStores([STORES.QUESTIONS, STORES.PAPERS, STORES.TESTS, STORES.ATTEMPTS, STORES.MISTAKES, STORES.REVISION, STORES.SYLLABUS, STORES.TASKS, STORES.SESSIONS, STORES.IMPORTS]);
      await refreshQuestionIndex({ silent: true });
      toast('All local data deleted.', 'info');
      location.hash = '#/dashboard';
    });
  },
};

function renderRestoreSummary() {
  const v = viewState.restoreValidation;
  if (!v) return '';
  const integrity = v.integrity?.checked ? (v.integrity.matches ? badge('SHA-256 verified', 'ok') : badge('SHA-256 MISMATCH', 'bad')) : badge('no hash recorded', 'warn');
  return `
    <div class="row mt-3">${integrity} ${v.ok ? badge('structure valid', 'ok') : badge('invalid file', 'bad')}</div>
    ${v.errors.length ? `<ul class="small text-bad">${v.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
    ${v.warnings.length ? `<ul class="small muted">${v.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    ${dataTable({
      columns: [{ label: 'Contents' }, { label: 'Records', num: true }],
      rows: Object.entries(v.summary?.counts || {}).map(([k, n]) => [esc(k), String(n)]),
      className: 'compact',
    })}
    ${dataTable({
      columns: [{ label: 'Backup detail' }, { label: 'Value' }],
      rows: [
        ['Created', esc(v.summary?.created_at ? fmtDate(v.summary.created_at) : 'unknown')],
        ['App version', esc(v.summary?.app_version || 'unknown')],
        ['Integrity hash', esc((v.summary?.integrity || '').slice(0, 24)) + (v.summary?.integrity ? '…' : '')],
        ['File', esc(viewState.restoreCandidateName || '—')],
      ],
      className: 'compact',
    })}
    ${
      v.ok
        ? `<div class="row mt-3">
             <button class="btn btn-primary" type="button" id="restoreMerge">Merge into current data</button>
             <button class="btn btn-danger" type="button" id="restoreReplace">Replace everything on this device</button>
             <button class="btn btn-quiet" type="button" id="restoreCancel">Cancel</button>
           </div>
           <p class="tiny muted">Merge keeps your current settings and adds anything the backup has that is newer or missing. Replace clears local data first and rebuilds it from the file.</p>`
        : '<p class="small">This file cannot be restored.</p>'
    }`;
}

async function performRestore(ctx, mode) {
  const v = viewState.restoreValidation;
  if (!v?.ok) return;
  const ok = await confirmDialog({
    title: mode === 'replace' ? 'Replace all local data?' : 'Merge this backup?',
    message:
      mode === 'replace'
        ? 'Everything currently stored in this browser will be cleared and rebuilt from the backup file. This cannot be undone.'
        : 'Records in the backup are added to what is already stored. Existing questions are updated only when the backup copy is newer; your settings stay as they are.',
    confirmLabel: mode === 'replace' ? 'Replace everything' : 'Merge',
    danger: mode === 'replace',
  });
  if (!ok) return;
  try {
    const result = await data.restoreBackup(v, { mode, includeQuestions: true });
    await loadSettings();
    await refreshQuestionIndex({ silent: true });
    viewState.restoreValidation = null;
    toast(`Restore complete: ${result.questions ?? 0} question(s), ${result.attempts ?? 0} attempt(s), ${result.tests ?? 0} test(s).`, 'ok');
    await ctx.refresh();
  } catch (err) {
    toast(`Restore failed: ${err.message}`, 'bad');
  }
}
