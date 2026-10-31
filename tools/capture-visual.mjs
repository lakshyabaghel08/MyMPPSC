#!/usr/bin/env node
/**
 * Recapture the refreshed screens with a deterministic, locally seeded profile.
 *
 *   npm install --no-save playwright-core
 *   node tools/capture-visual.mjs
 *
 * Set VISUAL_BROWSER_EXECUTABLE to a Chromium binary if Playwright's bundled
 * browser is not installed. The profile is disposable; no reader data is used.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/visual-refresh');
const { chromium } = await import('playwright-core');
const server = spawn(process.execPath, ['tools/serve.mjs', '--port', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
const base = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`server did not start: ${log}`)), 10000);
  server.stdout.on('data', (chunk) => {
    log += chunk;
    const match = log.match(/http:\/\/localhost:(\d+)/);
    if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
  });
  server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}`)); });
});

let browser;
const errors = [];
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.VISUAL_BROWSER_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.VISUAL_BROWSER_ARGS || '').split(',').filter(Boolean)],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${base}/#/dashboard`);
  await page.waitForSelector('.cc-stats');

  const ids = await page.evaluate(async () => {
    const { state } = await import('/js/core/state.js');
    const tests = await import('/js/services/tests.js');
    const questions = await import('/js/services/questions.js');
    const syllabus = await import('/js/services/syllabus.js');
    const revision = await import('/js/services/revision.js');
    const { analyseBankObject, executeImport } = await import('/js/services/importer.js');
    const demo = await (await fetch('/data/demo/demo-bank.json')).json();
    const authenticBank = await (await fetch('/data/pyq/mymppsc-pyq-bank.json')).json();
    const answerById = new Map([...authenticBank.questions, ...demo.questions].map((question) => [question.id, question.supplied_answer?.answer?.[0]]));
    await executeImport(await analyseBankObject(demo), { userConfirmed: true });

    const authentic = [...state.questionIndex.keys()].filter((id) => id.startsWith('MPPSC-')).slice(0, 80);
    const submitted = [];
    for (let sitting = 0; sitting < 4; sitting += 1) {
      const questionIds = authentic.slice(sitting * 20, sitting * 20 + 20);
      const test = tests.buildTest({ kind: 'practice', label: 'MPPSC 2024 · focused practice', questionIds, config: { feedback_mode: 'exam' } });
      await tests.saveTest(test);
      for (let i = 0; i < questionIds.length; i += 1) {
        const question = await questions.getQuestion(questionIds[i]);
        const options = question.language_variants.en.options;
        const correct = answerById.get(questionIds[i]) || options[0].key;
        const selected = i % 5 === 0 ? options.find((option) => option.key !== correct).key : correct;
        await tests.updateResponse(test, questionIds[i], { selected: [selected], time_spent_ms: 30000, confidence: i % 3 ? 'confident' : 'unsure' });
      }
      await tests.submitTest(test, { submittedAt: new Date(Date.now() - (4 - sitting) * 86400000).toISOString() });
      submitted.push(test.id);
    }

    const model = await syllabus.loadSyllabus();
    const prelims = model.leafIds.filter((id) => id.startsWith('prelims/'));
    for (let i = 0; i < 32; i += 1) {
      const status = i < 19 ? 'completed' : i < 25 ? 'revised' : 'in_progress';
      await syllabus.setProgressStatus(prelims[i], status, { model });
    }
    const { todayKey } = await import('/js/core/util.js');
    for (const id of authentic.slice(0, 8)) {
      await revision.ensureRevisionRecord(id, { dueDays: 0, reason: 'Visual refresh capture fixture.' });
      await revision.reschedule(id, todayKey(), 'Visual refresh capture fixture.');
    }

    const paper = state.papers.get('DEMO-P1');
    const demoIds = [...state.questionIndex.keys()].filter((id) => id.startsWith('DEMO-P1-')).slice(0, 10);
    const live = tests.buildTest({ kind: 'paper', label: 'Bilingual practice · Madhya Pradesh', paper, questionIds: demoIds, config: { language: 'hi', feedback_mode: 'exam', durationMinutes: 30 } });
    await tests.saveTest(live);
    for (let i = 0; i < 6; i += 1) {
      const selected = answerById.get(demoIds[i]) || 'B';
      await tests.updateResponse(live, demoIds[i], { selected: [selected], flagged: i === 4, time_spent_ms: 30000 });
    }
    live.current_index = 0;
    await tests.saveTest(live);
    return { liveId: live.id, reportId: submitted[0] };
  });

  await page.reload();
  await page.waitForSelector('.cc-stats');
  const setTheme = (theme) => page.evaluate(async (value) => {
    const { saveSettings } = await import('/js/core/state.js');
    await saveSettings({ theme: value });
  }, theme);
  const go = async (route) => {
    await page.goto(`${base}/#/${route}`);
    await page.waitForSelector('#view h1');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(120);
  };
  const shot = async (name) => {
    await page.screenshot({ path: path.join(out, `after-${name}.png`) });
    console.log(`captured ${name}`);
  };
  const runner = async (lang) => {
    await go(`runner/${ids.liveId}`);
    await page.click(`[data-lang="${lang}"]`);
    await page.waitForSelector(`.question-text[lang="${lang}"], .question-text [lang="${lang}"]`);
    await page.evaluate(() => document.fonts.ready);
  };

  await mkdir(out, { recursive: true });
  const desktop = ['dashboard', 'test-centre', 'topic', 'smart', 'revision', 'mistakes', 'syllabus', 'analytics', 'bank', 'settings', 'help'];
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setTheme(theme);
    for (const route of desktop) { await go(route); await shot(`${route}-${theme}`); }
    await runner('hi'); await shot(`question-hindi-${theme}`);
    await runner('en'); await shot(`question-english-${theme}`);
    await go(`report/${ids.reportId}`); await shot(`report-${theme}`);
  }

  await setTheme('light');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['dashboard', 'topic', 'revision', 'syllabus', 'analytics']) { await go(route); await shot(`${route}-mobile`); }
  await runner('hi'); await shot('question-hindi-mobile');
  await page.setViewportSize({ width: 834, height: 1112 });
  for (const route of ['dashboard', 'topic']) { await go(route); await shot(`${route}-tablet`); }
  await context.close();
  console.log(`browser errors ${JSON.stringify(errors)}`);
  if (errors.length) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await once(server, 'exit').catch(() => {});
}
