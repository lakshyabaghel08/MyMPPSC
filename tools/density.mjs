/**
 * tools/density.mjs — measure the real screens against the density budget.
 *
 * `tools/check.mjs` is static, so it cannot see how many cards a screen ends up
 * rendering or how many words a card actually holds. This module boots the app
 * in jsdom the same way the UI suite does, seeds a small amount of recorded
 * activity, renders every screen and measures it with `js/ui/budget.js` — one
 * definition of the limits, used by the static check and by the test suite.
 *
 * It is deliberately outside the app bundle: nothing here ships to a browser.
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SCREENS = ['dashboard', 'test-centre', 'topic', 'smart', 'mistakes', 'revision', 'syllabus', 'analytics', 'bank', 'settings', 'help'];

/** Boot index.html in jsdom with fake-indexeddb, exactly like the UI suite. */
export async function bootJsdom() {
  const { JSDOM } = await import('jsdom');
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');

  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:8080/', pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  const setGlobal = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  setGlobal('window', window);
  setGlobal('document', window.document);
  setGlobal('location', window.location);
  setGlobal('history', window.history);
  setGlobal('localStorage', window.localStorage);
  setGlobal('sessionStorage', window.sessionStorage);
  setGlobal('navigator', window.navigator);
  setGlobal('CSS', window.CSS);
  setGlobal('HTMLElement', window.HTMLElement);
  setGlobal('Node', window.Node);
  setGlobal('Event', window.Event);
  setGlobal('CustomEvent', window.CustomEvent);
  setGlobal('indexedDB', new IDBFactory());
  setGlobal('IDBKeyRange', IDBKeyRange);
  // Serves the repository from disk, so the bundled bank and relative URLs work.
  setGlobal('fetch', async (input) => {
    const raw = typeof input === 'string' ? input : input?.url || String(input);
    const relative = raw.replace(/^https?:\/\/[^/]+\//, '').split(/[?#]/)[0];
    try {
      const body = await readFile(path.join(root, relative));
      const type = relative.endsWith('.json') ? 'application/json' : 'text/plain';
      return new Response(body, { status: 200, headers: { 'content-type': type } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
  return dom;
}

/**
 * Render every screen once and measure it. Returns
 * `{ rows: [{ screen, ...measureScreen, breaches }], budget }`.
 *
 * The data is a demonstration bank plus one submitted and one unfinished test,
 * so screens are measured with something in them rather than as empty states.
 */
export async function measureAllScreens() {
  // The app logs its own imports and scheduling to the console; that is useful
  // in a browser and noise in a check that renders eleven screens.
  const { log, info } = console;
  console.log = () => {};
  console.info = () => {};
  try {
    return await measureAllScreensInner();
  } finally {
    console.log = log;
    console.info = info;
  }
}

async function measureAllScreensInner() {
  const dom = await bootJsdom();
  const app = await import(path.join(root, 'js/app.js'));
  const stateModule = await import(path.join(root, 'js/core/state.js'));
  const { state } = stateModule;
  const { measureScreen, auditScreen, DENSITY_BUDGET } = await import(path.join(root, 'js/ui/budget.js'));
  const importer = await import(path.join(root, 'js/services/importer.js'));
  const testsSvc = await import(path.join(root, 'js/services/tests.js'));
  const revisionSvc = await import(path.join(root, 'js/services/revision.js'));
  const questionsSvc = await import(path.join(root, 'js/services/questions.js'));

  await stateModule.loadSettings();
  await stateModule.refreshQuestionIndex({ silent: true });

  const text = await readFile(path.join(root, 'data/demo/demo-bank.json'), 'utf8');
  const analysis = await importer.analyseBankFile(text, { filename: 'demo-bank.json' });
  await importer.executeImport(analysis, { conflictPolicy: 'skip' });
  await stateModule.refreshQuestionIndex({ silent: true });

  const metas = Array.from(state.questionIndex.values());
  const paper = state.papers.get(metas[0]?.paper_id);
  const picked = metas.slice(0, 20).map((m) => m.id);
  if (paper && picked.length) {
    const scoring = { source: 'custom', marksPerCorrect: 3, negativeMarksPerIncorrect: 1 };
    const test = await testsSvc.createTest({
      kind: 'pyq_full',
      label: 'Density measurement',
      paper,
      questionIds: picked,
      questionMetas: picked.map((id) => state.questionIndex.get(id)).filter(Boolean),
      orderSource: 'original',
      config: { feedbackMode: 'exam', confidence: 'off', scoring },
    });
    const map = await questionsSvc.getQuestions(picked);
    picked.forEach((id, index) => {
      const q = map.get(id);
      if (!q) return;
      const answer = q.verified?.answer?.length ? q.verified.answer : q.supplied?.answer || [];
      const options = Object.values(q.language_variants || {})[0]?.options?.map((o) => o.key) || ['a', 'b', 'c', 'd'];
      const wrong = options.filter((key) => !answer.includes(key)).slice(0, 1);
      test.responses[id] = {
        selected: index === 7 ? [] : index % 3 === 0 ? answer : wrong,
        flagged: index === 3,
        confidence: index % 4 === 0 ? 'guessed' : index % 4 === 1 ? 'unsure' : 'confident',
        time_spent_ms: 25000 + index * 1500,
        revealed: false,
        answered_at: new Date().toISOString(),
        visits: 1,
      };
    });
    await testsSvc.submitTest(test, { auto: false });
    const live = await testsSvc.createTest({
      kind: 'pyq_full',
      label: 'Unfinished density measurement',
      paper,
      questionIds: picked.slice(0, 10),
      questionMetas: picked.slice(0, 10).map((id) => state.questionIndex.get(id)),
      orderSource: 'original',
      config: { feedbackMode: 'exam', confidence: 'off', scoring },
    });
    live.responses[picked[0]] = { selected: [], flagged: false, confidence: null, time_spent_ms: 0, revealed: false, answered_at: null, visits: 1 };
    await testsSvc.saveTest(live);
    await revisionSvc.ensureRevisionRecord(picked[0], { reason: 'density measurement', dueDays: 0 }).catch(() => {});
  }

  app.boot();
  for (let i = 0; i < 400 && !app.router; i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
  if (!app.router) throw new Error('the app never finished booting');

  const rows = [];
  for (const screen of SCREENS) {
    dom.window.location.hash = `#/${screen}`;
    await app.router.resolve();
    const measured = measureScreen(dom.window.document.getElementById('view'));
    rows.push({ screen, ...measured, breaches: auditScreen(screen, measured) });
  }
  return { rows, budget: DENSITY_BUDGET };
}

/** Heading levels in one screen, with what each heading says (for outline checks). */
export function headingOutline(documentRoot) {
  return Array.from(documentRoot.querySelectorAll('#view h1, #view h2, #view h3, #view h4')).map((heading) => ({
    level: Number(heading.tagName.slice(1)),
    text: (heading.textContent || '').trim().slice(0, 60),
  }));
}
