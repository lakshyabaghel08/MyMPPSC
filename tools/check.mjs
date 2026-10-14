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

for (const file of ['sw.js', 'manifest.webmanifest', 'css/app.css', 'docs/UI.md', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
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

/* ------------------------------------------- theme + contrast + tokens --- */

const headHtml = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
check(
  headHtml.includes("setAttribute('data-theme'") && headHtml.includes('mymppsc.settings'),
  'index.html: <head> must apply data-theme from saved settings before first paint',
);
check(/<meta\s+name="color-scheme"\s+content="light dark"/.test(headHtml), 'index.html: must declare <meta name="color-scheme" content="light dark">');
check(/<meta\s+name="theme-color"[^>]*id="themeColorMeta"/.test(headHtml), 'index.html: must include #themeColorMeta so theme switches update browser chrome');

const lightBlock = cssDeclarations.match(/:root\s*,\s*:root\[data-theme="light"\]\s*\{([^}]*)\}/)?.[1] || '';
const darkBlock = cssDeclarations.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] || '';
check(Boolean(lightBlock), 'css/app.css: missing `:root, :root[data-theme="light"]` token block');
check(Boolean(darkBlock), 'css/app.css: missing `:root[data-theme="dark"]` token block');
check(/@media\s*\(\s*forced-colors:\s*active\s*\)/.test(cssDeclarations), 'css/app.css: missing @media (forced-colors: active) support');
check(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/.test(cssDeclarations), 'css/app.css: missing @media (prefers-reduced-motion: reduce) support');
check(/@media\s+print\b/.test(cssDeclarations), 'css/app.css: missing @media print rules');

function parseHexTokens(block, base = null) {
  const map = new Map(base || []);
  for (const [, name, hex] of block.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) {
    map.set(name, hex.toLowerCase());
  }
  // Semantic aliases (`--track: var(--border-subtle);`) are audited through the
  // token they point at, resolved within the same theme.
  const aliases = [...block.matchAll(/(--[a-z0-9-]+)\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)\s*;/g)];
  for (let pass = 0; pass < 4; pass += 1) {
    for (const [, name, target] of aliases) if (map.has(target)) map.set(name, map.get(target));
  }
  return map;
}

function relativeLuminance(hex) {
  const raw = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const c = parseInt(raw.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const TEXT_CONTRAST_PAIRS = [
  ['--text', '--bg', 4.5],
  ['--text', '--bg-elevated', 4.5],
  ['--text', '--bg-sunken', 4.5],
  ['--text', '--accent-soft', 4.5],
  ['--text-muted', '--bg', 4.5],
  ['--text-muted', '--bg-elevated', 4.5],
  ['--text-muted', '--bg-sunken', 4.5],
  ['--text-soft', '--bg', 4.5],
  ['--text-soft', '--bg-elevated', 4.5],
  ['--text-soft', '--bg-sunken', 4.5],
  ['--accent', '--bg', 4.5],
  ['--accent', '--bg-elevated', 4.5],
  ['--accent', '--bg-sunken', 4.5],
  ['--accent', '--accent-soft', 4.5],
  ['--accent-strong', '--bg', 4.5],
  ['--accent-strong', '--bg-elevated', 4.5],
  ['--accent-strong', '--bg-sunken', 4.5],
  ['--accent-strong', '--accent-soft', 4.5],
  ['--ok', '--bg', 4.5],
  ['--ok', '--bg-elevated', 4.5],
  ['--ok', '--bg-sunken', 4.5],
  ['--ok', '--ok-soft', 4.5],
  ['--warn', '--bg', 4.5],
  ['--warn', '--bg-elevated', 4.5],
  ['--warn', '--bg-sunken', 4.5],
  ['--warn', '--warn-soft', 4.5],
  ['--bad', '--bg', 4.5],
  ['--bad', '--bg-elevated', 4.5],
  ['--bad', '--bg-sunken', 4.5],
  ['--bad', '--bad-soft', 4.5],
  ['--info', '--bg', 4.5],
  ['--info', '--bg-elevated', 4.5],
  ['--info', '--bg-sunken', 4.5],
  ['--info', '--info-soft', 4.5],
  ['--on-accent', '--accent', 4.5],
  ['--on-accent', '--accent-strong', 4.5],
  ['--on-ok', '--ok', 4.5],
  ['--on-warn', '--warn', 4.5],
  ['--on-bad', '--bad', 4.5],
  ['--on-info', '--info', 4.5],
];

const NON_TEXT_CONTRAST_PAIRS = [
  ['--border', '--bg', 3.0],
  ['--border', '--bg-elevated', 3.0],
  ['--border', '--bg-sunken', 3.0],
  ['--border-strong', '--bg', 3.0],
  ['--border-strong', '--bg-elevated', 3.0],
  ['--border-strong', '--bg-sunken', 3.0],
  ['--focus-ring', '--bg', 3.0],
  ['--focus-ring', '--bg-elevated', 3.0],
  ['--focus-ring', '--bg-sunken', 3.0],
  // Every data colour must stand out from the empty track it is drawn on
  // (bars, rings, segmented progress), in both themes.
  ['--accent', '--track', 3.0],
  ['--ok', '--track', 3.0],
  ['--warn', '--track', 3.0],
  ['--bad', '--track', 3.0],
  ['--info', '--track', 3.0],
];

const lightTokens = parseHexTokens(lightBlock);
const darkTokens = parseHexTokens(darkBlock);
check(lightTokens.has('--track') && darkTokens.has('--track'), 'css/app.css: the --track token must resolve to a colour in both themes');

for (const [themeName, tokenMap] of [['light', lightTokens], ['dark', darkTokens]]) {
  for (const [fg, bg, minRatio] of [...TEXT_CONTRAST_PAIRS, ...NON_TEXT_CONTRAST_PAIRS]) {
    const fgHex = tokenMap.get(fg);
    const bgHex = tokenMap.get(bg);
    const ratio = fgHex && bgHex ? contrastRatio(fgHex, bgHex) : 0;
    check(
      Boolean(fgHex && bgHex && ratio >= minRatio),
      `css/app.css (${themeName} theme): contrast ${fg} (${fgHex || 'missing'}) on ${bg} (${bgHex || 'missing'}) is ${ratio.toFixed(2)}:1, required >= ${minRatio}:1`,
    );
  }
}

// Strip token definition blocks (:root..., prefers-color-scheme, prefers-contrast, print :root)
// and ensure no literal colours (#hex, rgb/rgba, hsl/hsla) appear in component rules.
const nonTokenCss = cssDeclarations
  .replace(/:root[^{]*\{[^}]*\}/g, '')
  .replace(/@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{[\s\S]*?\}\s*\}/g, '')
  .replace(/@media\s*\(\s*prefers-contrast:\s*more\s*\)\s*\{[\s\S]*?\}\s*\}/g, '');
const literalColourMatches = [...nonTokenCss.matchAll(/(#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\()/g)].map((m) => m[0]);
check(
  literalColourMatches.length === 0,
  `css/app.css: found ${literalColourMatches.length} literal colour(s) outside token blocks (${literalColourMatches.slice(0, 5).join(', ')})`,
);

/* ------------------------------------------------------------- motion --- */

// Feedback transitions stay short; a looping animation (the skeleton pulse) is
// allowed only where the OS allows motion. So every `animation:` declaration
// must sit inside an `@media (prefers-reduced-motion: no-preference)` block —
// except `animation: none`, which the reduce block uses to switch all off.
{
  const motionSafe = /@media\s*\(\s*prefers-reduced-motion:\s*no-preference\s*\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
  const outside = cssDeclarations.replace(motionSafe, '');
  const stray = [...outside.matchAll(/(?:^|[;{\s])animation(?:-name)?\s*:\s*([^;}]+)/g)].map((m) => m[1].trim()).filter((v) => !/^none\b/.test(v));
  check(stray.length === 0, `css/app.css: animations must be declared inside @media (prefers-reduced-motion: no-preference) — found: ${stray.slice(0, 3).join(' | ')}`);
  const slowTransitions = [...cssDeclarations.matchAll(/transition\s*:\s*([^;}]+)/g)]
    .flatMap((m) => [...m[1].matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map((t) => (t[2] === 's' ? Number(t[1]) * 1000 : Number(t[1]))))
    .filter((ms) => ms > 150);
  check(slowTransitions.length === 0, `css/app.css: transitions are feedback only and must not exceed 150ms (found ${slowTransitions.join(', ')}ms)`);
}

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
  if (entry && entry !== './') {
    // A precache entry with no file makes the install step fail, which silently
    // disables offline mode for the whole app.
    await readFile(path.join(root, entry.replace(/^\.\//, '')), 'utf8').then(
      () => check(true, ''),
      () => check(false, `sw.js precaches ${entry}, but that file does not exist`),
    );
  }
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

/* ------------------------------------------- the repository-backed bank --- */

// The bundled MPPSC bank is fetched by the app at boot and precached by the
// service worker, so both halves have to point at the same file: a path that
// exists but is not precached breaks offline use, and a precache entry with no
// file breaks the install.
const builtinSource = await readFile(path.join(root, 'js', 'services', 'builtin-bank.js'), 'utf8');
const builtinPath = builtinSource.match(/BUILTIN_BANK_PATH = '([^']+)'/)?.[1] || null;
check(Boolean(builtinPath), 'js/services/builtin-bank.js: BUILTIN_BANK_PATH is missing');
if (builtinPath) {
  check(await exists(builtinPath), `the bundled bank ${builtinPath} does not exist`);
  check(shellPaths.includes(`./${builtinPath}`), `sw.js: the bundled bank ${builtinPath} is not precached, so it would need the network`);
  const bundled = JSON.parse(await readFile(path.join(root, builtinPath), 'utf8'));
  check(bundled.is_demonstration !== true, 'the bundled bank is real previous-year material, not the demonstration fixture');
  check(bundled.questions.length === 1200, `the expanded bundled bank must contain 1,200 questions, found ${bundled.questions.length}`);
  check(bundled.papers.length === 12, `the expanded bundled bank must contain 12 papers, found ${bundled.papers.length}`);
  const bundledYears = [...new Set(bundled.papers.map((paper) => Number(paper.year)))].sort((a, b) => a - b);
  check(bundledYears.length === 12 && bundledYears.every((year, index) => year === 2013 + index), 'the bundled papers must cover every year from 2013 through 2024');
  check(new Set(bundled.questions.map((question) => question.id)).size === 1200, 'the expanded bank must have 1,200 unique stable question ids');
  check(bundled.questions.every((question) => question.supplied_answer?.answer?.length && question.supplied_answer.status === 'supplied'), 'every bundled question must carry a supplied key');
  check(bundled.questions.every((question) => !question.verified_answer?.answer?.length), 'the bundled bank must not imply that any key was independently verified');
  check(!('provenance' in bundled), 'the bundled bank must carry no source provenance (docs/PYQ_AUDIT.md keeps the audit detail)');
  // Only the technical fields are scanned: the words may legitimately appear
  // inside a question (an option about a coaching scheme, for instance), but a
  // key status, a classification source or a bank/paper name must never name a
  // provider or claim a key is official.
  const technical = {
    bank_id: bundled.bank_id,
    bank_name: bundled.bank_name,
    generator: bundled.generator,
    classification_meta: bundled.classification_meta,
    papers: bundled.papers,
    questions: bundled.questions.map((q) => ({
      id: q.id,
      paper_id: q.paper_id,
      supplied_answer: q.supplied_answer,
      answer_key_status: q.answer_key_status,
      verified_answer: q.verified_answer ?? null,
      subject: q.subject,
      topic: q.topic,
      subtopic: q.subtopic,
      metadata: q.metadata,
    })),
  };
  check(!/unofficial|coaching|solved-book|printed key/i.test(JSON.stringify(technical)), 'the bundled bank must not name a source or label a key official/unofficial');
  check(!bundled.questions.some((q) => q.source_reference), 'no bundled question may carry a source reference');
  // The bank is study material, not a pipeline worklog: how a label or an explanation was arrived at
  // belongs in the review report under data/pyq/, never in the file the app loads.
  const PIPELINE_FIELDS = ['classification_source', 'classification_confidence', 'explanation_status'];
  check(!('classification_meta' in bundled), 'the bundled bank must not carry pipeline run metadata');
  check(
    !bundled.questions.some((q) => PIPELINE_FIELDS.some((field) => field in q)),
    `no bundled question may carry ${PIPELINE_FIELDS.join(', ')}`,
  );
  check(
    !bundled.questions.some((q) => q.metadata && typeof q.metadata === 'object' && Object.keys(q.metadata).some((key) => /^(classification_|answer_review|near_duplicate|ai_label|reviewed_classification)/.test(key))),
    'no bundled question may carry parser working notes in metadata',
  );
  check(
    !bundled.questions.some((q) => q.explanation && typeof q.explanation === 'object' && ['status', 'generated_by', 'reviewed_by', 'reviewed_at'].some((key) => key in q.explanation)),
    'stored explanations must not carry review or generation metadata',
  );
  check(
    bundled.papers.every((paper) => paper.scoring?.rules_known === true && paper.scoring.scheme_id === 'mppsc-sse-prelims-latest-practice' && paper.scoring.marks_per_correct === 3 && paper.scoring.negative_marks_per_incorrect === 1 && paper.scoring.negative_marking_enabled === true && paper.scoring.marks_for_unanswered === 0),
    'all bundled years must use the latest +3/−1/0 practice scheme, not imply historical proof',
  );
  for (const paper of bundled.papers) {
    check(paper.scoring?.rules_known === true, `${paper.paper_id}: the bundled bank must carry its automatic practice scheme`);
  }
  note(`bundled bank: ${bundled.questions.length} questions, ${bundled.papers.length} papers — ${builtinPath}`);
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
  check(!/\bstyle\s*=\s*["'`]/.test(source), `${file} contains an inline style="..." attribute — move layout/visual rules to css/app.css`);
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
