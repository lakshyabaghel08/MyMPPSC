#!/usr/bin/env node
/**
 * Browser-level guard for the Study Desk refresh.
 *
 *   npm install --no-save playwright-core
 *   npx playwright-core install chromium   # or set VISUAL_BROWSER_EXECUTABLE
 *   node tools/visual-audit.mjs
 *
 * The script starts its own temporary static server, drives the real app in a
 * disposable browser profile, and writes docs/visual-refresh/browser-audit.json.
 * It never touches a reader's stored data: every context is fresh and discarded.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('Install the optional browser harness first: npm install --no-save playwright-core');
  process.exit(2);
}

const server = spawn(process.execPath, ['tools/serve.mjs', '--port', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
const base = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`server did not start: ${serverLog}`)), 10000);
  server.stdout.on('data', (chunk) => {
    serverLog += chunk;
    const match = serverLog.match(/http:\/\/localhost:(\d+)/);
    if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
  });
  server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${serverLog}`)); });
});

const results = [];
const errors = [];
let browser;
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  if (!ok) console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}
async function step(name, fn) {
  try { await fn(); } catch (error) { check(name, false, error.message); }
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.VISUAL_BROWSER_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.VISUAL_BROWSER_ARGS || '').split(',').filter(Boolean)],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('requestfailed', (request) => errors.push(`${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const go = async (route) => {
    await page.goto(`${base}/#/${route}`);
    await page.waitForSelector('#view h1', { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
  };

  await go('dashboard');
  await page.waitForSelector('.cc-stats');
  check('dashboard renders real metrics', await page.locator('.cc-stat').count() === 6);
  check('all three local fonts load', await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('500 16px InterVariable'),
      document.fonts.load('700 24px ManropeVariable'),
      document.fonts.load('500 20px NotoDevanagariVariable', 'नर्मदा'),
    ]);
    return [...document.fonts].every((font) => font.status === 'loaded');
  }));

  // Import the bundled demonstration bank through the real importer so the
  // Hindi runner and bilingual switch are exercised without inventing data.
  await page.evaluate(async () => {
    const { analyseBankObject, executeImport } = await import('/js/services/importer.js');
    const demo = await (await fetch('/data/demo/demo-bank.json')).json();
    await executeImport(await analyseBankObject(demo), { userConfirmed: true });
  });

  const routes = ['dashboard', 'test-centre', 'topic', 'smart', 'revision', 'mistakes', 'syllabus', 'analytics', 'bank', 'settings', 'help'];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    for (const route of routes) {
      await step(`${route} fits ${width}px`, async () => {
        await go(route);
        const layout = await page.evaluate(() => {
          const header = document.querySelector('.app-header').getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            headerLeft: header.left,
            headerRight: window.innerWidth - header.right,
            headings: document.querySelectorAll('#view h1').length,
          };
        });
        check(`${route} has no horizontal overflow at ${width}px`, layout.overflow <= 1, `${layout.overflow}px`);
        check(`${route} header stays inside viewport at ${width}px`, layout.headerLeft >= -1 && layout.headerRight >= -1);
        check(`${route} has one screen heading at ${width}px`, layout.headings === 1);
      });
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await step('theme toggle and system preference', async () => {
    await go('dashboard');
    await page.click('#themeToggle');
    check('toggle applies dark theme', await page.getAttribute('html', 'data-theme') === 'dark');
    check('dark browser chrome matches surface', await page.getAttribute('#themeColorMeta', 'content') === '#14232d');
    await page.click('#themeToggle');
    check('toggle returns to light theme', await page.getAttribute('html', 'data-theme') === 'light');
    await go('settings');
    await page.selectOption('#setTheme', 'system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
    check('system preference resolves to dark', await page.getAttribute('html', 'data-theme') === 'dark');
    await page.selectOption('#setTheme', 'light');
    await page.emulateMedia({ colorScheme: 'light' });
  });

  await step('command palette and quick practice', async () => {
    await go('dashboard');
    await page.click('#commandBtn');
    await page.fill('#commandSearch', 'syllabus');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#/syllabus');
    check('command palette navigates', await page.getAttribute('body', 'data-route') === 'syllabus');
    await page.click('#quickStartBtn');
    await page.waitForSelector('.modal[role="dialog"]');
    check('quick practice opens a dialog', await page.locator('.modal[role="dialog"]').count() === 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.modal[role="dialog"]'));
    check('escape closes quick practice', await page.locator('.modal[role="dialog"]').count() === 0);
  });

  await step('runner answer, flag, palette, focus and persistence', async () => {
    await go('topic');
    await page.click('[data-action="start-practice"]');
    await page.waitForSelector('#questionCard');
    const before = await page.locator('.option-row').count();
    check('runner offers four options', before === 4);
    await page.click('.option-row >> nth=0');
    await page.waitForSelector('.option-row[aria-pressed="true"]');
    check('option selection is reflected', await page.locator('.option-row[aria-pressed="true"]').count() === 1);
    await page.click('[data-action="flag"]');
    await page.waitForSelector('.palette button.flagged');
    check('flag is reflected in palette', await page.locator('.palette button.flagged').count() >= 1);
    await page.reload();
    await page.waitForSelector('#questionCard');
    check('answer survives reload', await page.locator('.option-row[aria-pressed="true"]').count() === 1);
    check('flag survives reload', await page.locator('.palette button.flagged').count() >= 1);
    const indexVisible = await page.locator('.runner-index').isVisible();
    check('desktop question index is visible', indexVisible);
    await page.click('[data-action="focus-mode"]');
    check('focus mode hides chrome', await page.evaluate(() => document.body.classList.contains('runner-focus')));
    check('focus mode hides desktop index', !(await page.locator('.runner-index').isVisible()));
    await page.click('[data-action="focus-mode"]');
    await page.waitForFunction(() => !document.body.classList.contains('runner-focus'));
    check('focus toggle leaves focus mode', await page.evaluate(() => !document.body.classList.contains('runner-focus')));
    await page.click('[data-action="pause"]');
    await page.waitForFunction(() => document.querySelector('[data-action="pause"]')?.textContent.trim() === 'Resume');
    check('pause stops the clock', (await page.locator('[data-action="pause"]').textContent()).trim() === 'Resume');
    await page.click('[data-action="pause"]');
    await page.waitForFunction(() => document.querySelector('[data-action="pause"]')?.textContent.trim() === 'Pause');
    check('resume restarts the clock', (await page.locator('[data-action="pause"]').textContent()).trim() === 'Pause');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('.runner-index-btn');
    check('mobile palette opens', await page.locator('body.palette-open .runner-index').count() === 1);
    await page.click('.runner-index [data-action="palette-toggle"]');
    check('mobile palette closes', await page.locator('body.palette-open .runner-index').count() === 0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.click('[data-action="submit"]');
    await page.waitForSelector('.modal[role="dialog"]');
    await page.click('.modal[role="dialog"] [data-value="submit"]');
    await page.waitForFunction(() => location.hash.startsWith('#/report/'), { timeout: 15000 });
    await page.waitForSelector('#view h1');
    check('submit produces a report', (await page.locator('#view h1').textContent()).length > 0);
  });

  await step('mobile navigation drawer', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go('dashboard');
    await page.click('#navToggle');
    check('drawer opens', await page.evaluate(() => document.body.classList.contains('nav-open')));
    await page.click('.nav-link[data-route="revision"]');
    await page.waitForFunction(() => location.hash === '#/revision');
    check('drawer closes after navigation', await page.evaluate(() => !document.body.classList.contains('nav-open')));
  });

  await step('offline reload keeps the shell and local bank', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await go('dashboard');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForSelector('.cc-stats');
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.cc-stats', { timeout: 15000 });
    check('offline dashboard renders', (await page.locator('#view h1').textContent()).trim() === 'Today');
    check('offline bank remains available', await page.evaluate(async () => {
      const { state } = await import('/js/core/state.js');
      return state.questionIndex.size > 0;
    }));
    await context.setOffline(false);
  });

  check('no browser errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await once(server, 'exit').catch(() => {});
}

const passed = results.filter((result) => result.ok).length;
const report = { generatedAt: new Date().toISOString(), passed, failed: results.length - passed, total: results.length, errors, results };
await mkdir(path.join(root, 'docs/visual-refresh'), { recursive: true });
await writeFile(path.join(root, 'docs/visual-refresh/browser-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${passed}/${results.length} browser checks passed`);
if (report.failed) process.exitCode = 1;
