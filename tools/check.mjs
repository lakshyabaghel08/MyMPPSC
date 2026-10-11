#!/usr/bin/env node
/**
 * tools/check.mjs — static integrity checks for the project.
 *
 * These are cheap, deterministic checks that catch the mistakes a test suite
 * cannot see: a broken relative import, a view that does not implement the
 * router contract, a navigation entry with no view, business logic hard-coded
 * into the UI, or data files that no longer parse.
 *
 *   npm run check
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) problems.push(message);
  return condition;
}

function note(message) {
  notes.push(message);
}

async function exists(relative) {
  try {
    await stat(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

async function walk(relativeDir, filter = () => true, out = []) {
  const dir = path.join(root, relativeDir);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      await walk(rel, filter, out);
    } else if (filter(rel)) {
      out.push(rel);
    }
  }
  return out;
}

/* --------------------------------------------------------------- imports -- */

const jsFiles = await walk('js', (f) => f.endsWith('.js'));
check(jsFiles.length > 20, `expected the app to have many modules, found ${jsFiles.length}`);

for (const file of jsFiles) {
  const source = await readFile(path.join(root, file), 'utf8');
  const specifiers = [...source.matchAll(/(?:^|\s)(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const dynamic = [...source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  for (const spec of [...specifiers, ...dynamic]) {
    if (!spec.startsWith('.')) continue; // bare specifiers are not used in the app
    const target = path.resolve(path.dirname(path.join(root, file)), spec);
    check(await exists(path.relative(root, target)), `${file}: cannot resolve import "${spec}"`);
  }
  check(!/\bfrom\s+['"]http/.test(source), `${file}: imports from a URL (the app must not depend on a CDN)`);
}

/* ----------------------------------------------------------- view contract */

const NON_VIEW_MODULES = new Set([path.join('js', 'ui', 'views', 'shared.js')]);
const viewFiles = (await walk(path.join('js', 'ui', 'views'), (f) => f.endsWith('.js'))).filter((f) => !NON_VIEW_MODULES.has(f));
const routeNames = new Set();
for (const file of viewFiles) {
  const source = await readFile(path.join(root, file), 'utf8');
  check(/export default\s/.test(source), `${file}: a view must export a default object`);
  check(/\btitle:/.test(source), `${file}: a view must declare a title`);
  check(/\brender\s*\(/.test(source), `${file}: a view must declare render()`);
  const name = path.basename(file, '.js');
  routeNames.add(name === 'testcentre' ? 'test-centre' : name);
}

/* ----------------------------------------------------- app.js ↔ views ---- */

const appSource = await readFile(path.join(root, 'js', 'app.js'), 'utf8');
const registered = [...appSource.matchAll(/router\.register\(\s*'([^']+)'/g)].map((m) => m[1]);
for (const route of registered) {
  const file = route === 'test-centre' ? 'testcentre' : route;
  check(await exists(path.join('js', 'ui', 'views', `${file}.js`)), `js/app.js registers route "${route}" but js/ui/views/${file}.js does not exist`);
}

const navRoutes = [...appSource.matchAll(/\{\s*route:\s*'([^']+)'/g)].map((m) => m[1]);
check(navRoutes.length >= 10, `navigation should offer at least the ten required destinations, found ${navRoutes.length}`);
for (const route of navRoutes) {
  check(registered.includes(route), `navigation links to "${route}", which is not registered on the router`);
}

const requiredNav = ['dashboard', 'test-centre', 'topic', 'smart', 'mistakes', 'revision', 'syllabus', 'analytics', 'bank', 'settings'];
for (const route of requiredNav) {
  check(navRoutes.includes(route), `navigation is missing the required destination "${route}"`);
}
check(navRoutes.includes('custom'), 'navigation is missing the custom test builder');

/* ------------------------------------------------- app.js ↔ index.html -- */

const html = await readFile(path.join(root, 'index.html'), 'utf8');
const idsInHtml = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const idsUsed = [...appSource.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
for (const id of idsUsed) {
  check(idsInHtml.has(id), `js/app.js expects #${id} in index.html`);
}
check(html.includes('js/app.js'), 'index.html must load js/app.js as a module');
check(html.includes('manifest.webmanifest'), 'index.html must link the web app manifest');
check(html.includes('css/app.css'), 'index.html must link css/app.css');

/* ------------------------------------------------------------ project files */

for (const file of ['sw.js', 'manifest.webmanifest', 'css/app.css', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
  check(await exists(file), `${file} is missing`);
}

const manifest = JSON.parse(await readFile(path.join(root, 'manifest.webmanifest'), 'utf8'));
check(manifest.name && manifest.short_name, 'manifest: name and short_name are required');
check((manifest.icons || []).length >= 4, 'manifest: icons for 192/512 and a maskable variant are expected');
check(manifest.start_url, 'manifest: start_url is required');
check(manifest.display === 'standalone', 'manifest: display should be "standalone"');

const sw = await readFile(path.join(root, 'sw.js'), 'utf8');
for (const asset of ['index.html', 'css/app.css', 'js/app.js', 'js/ui/views/dashboard.js']) {
  check(sw.includes(`./${asset}`), `sw.js does not precache ${asset}`);
}

const cacheVersion = sw.match(/const VERSION = '([^']+)'/)?.[1];
check(Boolean(cacheVersion), 'sw.js: the cache VERSION constant is missing (clients keep the stale shell without a bump)');
if (cacheVersion) note(`service worker cache version: ${cacheVersion}`);

/* ------------------------------------- the shell must not block itself --- */

const css = await readFile(path.join(root, 'css/app.css'), 'utf8');
const cssRules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const ruleBySelector = (selector) => {
  for (const [, selectorList, body] of cssRules) {
    if (selectorList.split(',').some((s) => s.trim() === selector)) return body;
  }
  return null;
};

// An author rule that sets `display` beats the browser's built-in
// `[hidden] { display: none }`, because the built-in rule is a UA declaration.
// Without the reset, `<div class="modal-root" id="modalRoot" hidden>` is laid
// out from the first frame as a full-viewport, z-index 70 overlay that
// swallows every click. Keep the reset first and `!important`.
const cssDeclarations = css.replace(/\/\*[\s\S]*?\*\//g, '');
check(
  /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(cssDeclarations),
  'css/app.css: the `[hidden] { display: none !important; }` reset is missing — an author display rule would beat the browser default and cover the app',
);
const firstRule = cssDeclarations.trim().match(/([^{}]+)\{/)?.[1]?.trim();
check(firstRule === '[hidden]', `css/app.css: the [hidden] reset must be the first rule, found "${firstRule?.slice(0, 40)}"`);

const toastLayer = ruleBySelector('#toastStack') || ruleBySelector('.toast-stack');
check(
  Boolean(toastLayer && /(^|;|\s)pointer-events:\s*none/.test(toastLayer)),
  'css/app.css: the always-present toast layer (#toastStack) must be click-through: set pointer-events: none',
);
const toastChildren = ruleBySelector('#toastStack > *') || ruleBySelector('.toast-stack > *');
check(
  Boolean(toastChildren && /(^|;|\s)pointer-events:\s*auto/.test(toastChildren)),
  'css/app.css: toasts themselves must remain clickable: add `#toastStack > *, .toast-stack > * { pointer-events: auto; }`',
);

const modalTag = html.match(/<[^>]*id="modalRoot"[^>]*>/)?.[0] || '';
check(Boolean(modalTag), 'index.html: the dialog overlay #modalRoot is missing');
check(/\shidden(\s|>|=)/.test(modalTag), 'index.html: the dialog overlay must ship with the hidden attribute so the first frame is not covered');

/* ---------------------------------------------- GitHub Pages + relative -- */

check(await exists('.nojekyll'), '.nojekyll is missing: GitHub Pages runs Jekyll without it');

for (const file of ['index.html', 'sw.js', 'manifest.webmanifest', 'css/app.css']) {
  const source = await readFile(path.join(root, file), 'utf8');
  check(!/=\s*["']\/[^"']*["']/.test(source), `${file}: absolute path in an attribute (must be relative: the site is served from a project subpath)`);
  check(!/url\(\s*['"]?\/[^)]*\)/.test(source), `${file}: absolute url() in CSS (must be relative)`);
  check(!/url\(\s*['"]?(?:https?:)?\/\//.test(source), `${file}: absolute URL in url() (the app must work offline)`);
}

check(/navigator\.serviceWorker\.register\(\s*'sw\.js'/.test(appSource), "js/app.js: the service worker must be registered with the relative path 'sw.js'");

const shellBlock = sw.match(/const SHELL_FILES = \[([\s\S]*?)\];/)?.[1] || '';
const shellPaths = [...shellBlock.matchAll(/'([^']*)'/g)].map((m) => m[1]);
check(shellPaths.length > 30, `sw.js: expected the precache list to cover the app shell, found ${shellPaths.length} entries`);
for (const entry of shellPaths) {
  check(entry.startsWith('./') || entry === '', `sw.js: precache entry "${entry}" must be relative ("./…") so it resolves under a project-site subpath`);
}

/* ---------------------------------------------------------- data assets -- */

for (const file of ['data/demo/demo-bank.json', 'data/examples/example-bank.json', 'data/examples/invalid-records-fixture.json', 'data/schema/question-bank.schema.json']) {
  const raw = await readFile(path.join(root, file), 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    problems.push(`${file} is not valid JSON: ${err.message}`);
    continue;
  }
  checks += 1;
  if (file.includes('invalid-records') || file.includes('schema')) continue;
  check(parsed.schema_version, `${file}: a bank needs schema_version`);
  check(Array.isArray(parsed.papers) && parsed.papers.length > 0, `${file}: a bank needs papers`);
  check(Array.isArray(parsed.questions) && parsed.questions.length > 0, `${file}: a bank needs questions`);
}

const demoBank = JSON.parse(await readFile(path.join(root, 'data', 'demo', 'demo-bank.json'), 'utf8'));
check(demoBank.is_demonstration === true, 'the demonstration bank must declare is_demonstration: true');
const demoNotes = (demoBank.provenance?.notes || '').toLowerCase();
check(demoNotes.includes('synthetic'), 'the demonstration bank provenance must say the content is synthetic');
check(demoNotes.includes('not genuine') || demoNotes.includes('never be presented as'), 'the demonstration bank provenance must state that it is not genuine previous-year content');
check(demoBank.provenance?.verified === false, 'the demonstration bank must not claim verification');
for (const paper of demoBank.papers) {
  check(paper.paper_id, 'every demo paper needs a paper_id');
}
note(`demonstration bank: ${demoBank.questions.length} questions, ${demoBank.papers.length} papers`);

/* -------------------------------------------- separation of data and code */

const bankLikeStrings = ['Which river is popularly known', 'Laxmikanth', 'Annual rainfall of'];
for (const file of jsFiles) {
  const source = await readFile(path.join(root, file), 'utf8');
  for (const phrase of bankLikeStrings) {
    check(!source.includes(phrase), `${file} appears to contain question content; the bank must stay separate from the code`);
  }
  check(!/localhost:\d+/.test(source), `${file} hard-codes a localhost URL`);
  check(!/\bfetch\(\s*['"]https?:/.test(source), `${file} fetches an external URL`);
}

/* --------------------------------------------------------------- report -- */

if (problems.length) {
  console.error(`\n${problems.length} problem(s) found after ${checks} checks:\n`);
  for (const problem of problems) console.error(` - ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`All ${checks} checks passed.`);
  for (const n of notes) console.log(` · ${n}`);
  console.log('\nNext: npm test (services and end-to-end logic), then npm run serve and follow the checklist in Help & How it works.');
}
