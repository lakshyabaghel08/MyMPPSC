# UI & Design System (`docs/UI.md`)

MyMPPSC is a local-first, zero-dependency, static single-page study application for MPPSC Prelims preparation. The interface is built with vanilla HTML, a token-driven stylesheet (`css/app.css`), and a dependency-free component kit (`js/ui/components.js`).

Every visual decision serves three goals:
1. **Long-session reading comfort** across English and Hindi (Devanagari) question stems, passages, and explanations.
2. **Epistemic honesty (North Star)** — every figure, badge, and question card answers *what should I do now?*, *what do I actually know?*, and *where did it come from?* using a shared provenance vocabulary.
3. **Verifiable accessibility and layout safety** enforced automatically by `npm run check` (`tools/check.mjs`) and `npm test` (`tests/ui.test.js`).

---

## 1. Design Tokens (`css/app.css`)

All colour literals in `css/app.css` live inside the root token blocks (`:root, :root[data-theme="light"]`, `:root[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`, and `@media (forced-colors: active)`). `tools/check.mjs` fails the build if any `#hex`, `rgb()`, or `hsl()` colour appears outside a token block.

### 1.1 Surface & Ink Palette

| Token | Light Theme (`data-theme="light"`) | Dark Theme (`data-theme="dark"`) | Purpose |
| :--- | :--- | :--- | :--- |
| `--bg` | `#f4f6fa` | `#0f131c` | Page canvas & `<meta name="theme-color">` |
| `--bg-elevated` | `#ffffff` | `#171d29` | Cards, dialogs, table containers |
| `--bg-subtle` | `#eaf0f8` | `#1d2433` | Secondary panels, hover backgrounds, table headers |
| `--bg-sunken` | `#dfe7f2` | `#0b0e15` | Wells, code blocks, progress tracks |
| `--ink` | `#131926` | `#eef2f9` | Primary body & question text (≥ 14.9:1 contrast) |
| `--ink-muted` | `#3e4c63` | `#b5c1d6` | Secondary labels & metadata (≥ 7.5:1 contrast) |
| `--ink-soft` | `#53627a` | `#94a3bd` | Captions, hints, axis labels (≥ 5.3:1 contrast) |
| `--border` | `#c8d3e3` | `#2b3548` | Card & table hairlines |
| `--border-strong` | `#7486a2` | `#667794` | Input borders, checkbox/radio borders, non-text UI boundaries (≥ 3.2:1 contrast) |

### 1.2 Brand & Semantic Status Tokens

| Role | Surface Token (Light / Dark) | Ink Token (Light / Dark) | Border Token (Light / Dark) | Contrast (Text on Surface) |
| :--- | :--- | :--- | :--- | :--- |
| **Accent** | `#e6effc` / `#182947` | `#1746a2` / `#8cb4ff` | `#8eb2f0` / `#3862ad` | ≥ 6.8:1 (Light) / ≥ 6.4:1 (Dark) |
| **OK / Verified** | `#e3f5ec` / `#122b22` | `#0f5c3a` / `#6ee7b7` | `#6bc49c` / `#256f50` | ≥ 6.9:1 (Light) / ≥ 8.5:1 (Dark) |
| **Warn / Synthetic** | `#fef1db` / `#2f2210` | `#7c4200` / `#fcd34d` | `#e5a952` / `#7c5316` | ≥ 6.8:1 (Light) / ≥ 9.5:1 (Dark) |
| **Bad / Disputed** | `#fde8e8` / `#32161b` | `#9e1c1c` / `#fca5a5` | `#e68a8a` / `#822d37` | ≥ 6.8:1 (Light) / ≥ 7.2:1 (Dark) |
| **Info / Derived** | `#e5f2fc` / `#14283d` | `#0f4c81` / `#7dd3fc` | `#7cb8eb` / `#295b8a` | ≥ 7.2:1 (Light) / ≥ 8.3:1 (Dark) |

### 1.3 Typography & Devanagari Scale

System font stacks are used with zero web-font network requests:
- `--font-sans`: ` system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Mangal', sans-serif`
- `--font-serif`: `'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Noto Serif Devanagari', serif`
- `--font-mono`: `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace`

| Token | Value | Usage |
| :--- | :--- | :--- |
| `--text-xs` | `0.75rem` (12px) | Badges, provenance chips, keyboard hints, table headers |
| `--text-sm` | `0.84375rem` (13.5px) | Secondary copy, filter labels, table cells |
| `--text-md` | `0.9375rem` (15px) | Default interface body |
| `--text-lg` | `1.0625rem` (17px) | English question stems & card titles |
| `--text-xl` | `1.25rem` (20px) | Section headings & stat tile values |
| `--text-2xl` | `1.5rem` (24px) | Screen `<h1>` titles |
| `--leading-body` | `1.55` | English body copy |
| `--leading-question` | `1.68` | English question stems (60–72ch measure) |
| `--leading-hi` | `1.82` | Hindi (`[lang="hi"]`) stems & options so matras (`ि`, `ी`, `ु`, `ू`, `े`, `ै`) never clip |

### 1.4 Spacing, Radius, Elevation, Z-Index & Motion Scales

- **Spacing (`--space-1` … `--space-8`)**: `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `44px`. Compact density (`html[data-density="compact"]`) scales `--space-3`..`--space-6` down proportionally.
- **Radii**: `--radius-xs` (`4px`), `--radius-sm` (`6px`), `--radius` (`10px`), `--radius-lg` (`14px`), `--radius-pill` (`999px`).
- **Z-Index**: `--z-sticky` (`10`), `--z-header` (`30`), `--z-scrim` (`45`), `--z-drawer` (`50`), `--z-modal` (`70`), `--z-toast` (`80`), `--z-skip` (`100`). Note: `.modal-root` also sets literal `z-index: 70` so JSDOM `getComputedStyle(modalRoot).zIndex` resolves without CSS variable evaluation.
- **Motion**: `--dur-fast` (`90ms`), `--dur-med` (`140ms`), `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`). Zero transitions or animations exceed `150ms`.

---

## 2. Provenance & Component Inventory (`js/ui/components.js`)

Zero inline `style=` attributes are permitted in `js/**`. All helpers in `js/ui/components.js` use token-backed CSS classes:

- **`sourceChip(kind, customLabel)`**: Renders `<span class="prov-chip <kind>" data-source="<kind>">` for the 7 provenance states:
  - `measured` — directly counted from local attempt history
  - `derived` — calculated deterministically from attempts + rules (e.g. spaced-repetition intervals, weak-topic ranking)
  - `unavailable` — absent in the source data; never guessed or invented
  - `synthetic` — synthetic demonstration data (`is_demonstration: true`)
  - `supplied` — answer key or metadata supplied by the imported JSON bank
  - `verified` — independently verified answer key recorded with evidence
  - `disputed` — contested answer key
- **`evidenceMeter(judgedCount, minSample = 3)`**: 3-step visual dot meter (`n=0..3+`) with `role="img"` and `aria-label`. Counts below `minSample` render with `.evidence-meter.insufficient` (`n=1 (<3)`) so small samples are visually distinct from reliable verdicts.
- **`provenanceLine({ source, text })`**: Compact footer bar attaching a `sourceChip` to a plain-English explanation of how a metric or rule was computed.
- **`langAttr(text, explicitLang)` & `hasDevanagari(text)`**: Detects Unicode Devanagari (`\u0900–\u097F`) or explicit `'hi'` language code and emits ` lang="hi"` so browsers select Devanagari glyphs and apply `--leading-hi`.
- **`icon(name)`**: Inline monochrome SVG icons (`stroke="currentColor"`) for navigation, theme switching, and actions.
- **`card({ title, subtitle, actions, right, body, footer, tone, id, className })`**: Section container with `<h2>` header, optional right-aligned provenance slot (`right` or `actions`), body, and footer. Does not use `overflow: hidden`, preserving focus rings on child controls.
- **`tile({ label, value, sub, tone, source, where })`**: Stat tile with optional `sourceChip` and `.tile-prov` provenance caption.
- **`tabs({ id, items, activeId })` & `mountTabs(root, onChange)`**: WAI-ARIA Authoring Practices Guide (APG) tabs with `role="tablist"`, `role="tab"`, `role="tabpanel"`, roving `tabindex` (`0` on selected, `-1` on others), `aria-selected`, `aria-controls`, `aria-labelledby`, and `ArrowRight` / `ArrowLeft` / `Home` / `End` keyboard navigation.
- **`openModal({ title, body, actions, wide, onMount, dismissible })`**: Accessible modal dialog (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`). Saves the trigger element, sets `inert` on `#appHeader`, `#appBody`, and `#main`, moves initial focus inside the dialog, traps `Tab` / `Shift+Tab` at boundaries, closes on `Escape` or backdrop click, and restores focus to the trigger element on close.
- **`toast(message, tone, timeout)`**: Notification banner inside `#toastStack` (`pointer-events: none` on stack, `pointer-events: auto` on individual `.toast` items), capped at 4 concurrent toasts, with pause-on-hover/focus and a dismiss button.
- **`barChart(...)` & `lineChart(...)`**: Responsive SVG charts (`viewBox` + `role="img"` + `aria-label`) paired with a `<details class="chart-table-fallback">` accessible data table.

---

## 3. Accessibility & Layout Contract

1. **Heading Hierarchy**: Every route renders **exactly one `<h1>`** as its first heading and never skips heading levels (`h1 -> h2 -> h3`). Card titles use `<h2>`; sub-sections inside cards and `renderExplanation()` use `<h3>`.
2. **Route Announcements & Document Title**: On every route transition, `js/ui/router.js` updates `document.title` to `<Screen Title> · MyMPPSC` and updates the dedicated polite live region `#routeAnnouncer`. `#view` itself does **not** carry `aria-live="polite"`, preventing screen readers from re-reading entire screens on every click.
3. **Off-Canvas Navigation Drawer**: Below `860px` (or when opened as a drawer), `#appNav` is synchronised via `syncDrawerState()` in `js/app.js`. When closed off-canvas, `#appNav` receives `inert`, `aria-hidden="true"`, and `tabindex="-1"` on all interactive children so keyboard `Tab` cannot enter the hidden drawer. When open, `#navScrim` is shown (`hidden = false`), focus moves into the navigation list, and `Escape` or clicking `#navScrim` closes the drawer and restores focus to `#navToggle`.
4. **Touch Targets**: At `≤860px`, interactive controls (`.btn`, `.tab`, `.palette-cell`, `.option`, `.nav-link`, inputs, selects) enforce a minimum `44×44px` hit target.
5. **Pre-Paint Theme Initialisation**: `index.html` runs a small synchronous inline script before paint that reads `localStorage['mymppsc.settings']`, resolves `'light'` / `'dark'` / `'system'` (via `matchMedia('(prefers-color-scheme: dark)')`), sets `document.documentElement.dataset.theme` and `dataset.density`, and updates `<meta name="theme-color" id="themeColorMeta">` so there is zero flash of wrong theme.
6. **Print Stylesheet**: `@media print` forces black-on-white tokens regardless of active dark theme, hides shell chrome (`#appHeader`, `#appNav`, `#toastStack`, `#modalRoot`, buttons, filter forms), expands `.runner-layout` to a single column, and sets `break-inside: avoid` on `.card`, `.question-card`, and `.review-item`.

---

## 4. Enumerated & Justified `!important` Declarations

The baseline `css/app.css` contained 6 `!important` declarations. The redesigned `css/app.css` reduces this to **4 declarations**, each required for a hard safety or accessibility invariant:

| # | Line / Selector | Declaration | Justification |
| :--- | :--- | :--- | :--- |
| 1 | `[hidden]` (Rule 1 of `css/app.css`) | `display: none !important;` | **Critical click-through guard**: Browser UA `[hidden] { display: none }` has user-agent origin and loses to any author `display` rule (such as `.modal-root { display: grid }` or `#toastStack { display: grid }`). Keeping `[hidden] { display: none !important; }` as the very first rule guarantees no hidden overlay can ever be laid out. |
| 2 | `@media (prefers-reduced-motion: reduce)` | `animation: none !important;` | **Vestibular accessibility**: Guarantees user OS reduced-motion preference disables animations across all components regardless of selector specificity. |
| 3 | `@media (prefers-reduced-motion: reduce)` | `transition: none !important;` | **Vestibular accessibility**: Guarantees user OS reduced-motion preference disables transitions across all components regardless of selector specificity. |
| 4 | `@media print` (`.app-header, .app-nav, ...`) | `display: none !important;` | **Clean print output**: Hides interactive shell chrome, modals, toasts, and buttons when printing reports or question papers, overriding ID and compound `display: flex`/`grid` rules. |

---

## 5. How to Add or Modify a Screen

1. **Create or update the view module** in `js/ui/views/<name>.js` exporting `{ title, render(ctx), mount?(ctx, root), cleanup?(ctx) }`.
2. **Start `render()` with `<h1>${esc(this.title)}</h1>`** in both empty and populated states. Use `card({ title: '...' })` (`<h2>`) for top-level sections and `<h3>` for sub-sections inside cards. Never use `<h4>` directly inside a card without an intervening `<h3>`.
3. **Never write inline `style="..."` attributes** in JS templates. Use existing layout utilities (`.row`, `.spread`, `.stack`, `.split-2`, `.field-row`, `.mt-2`, `.mb-3`, etc.) or add a semantic class to `css/app.css` using design tokens.
4. **Attach provenance chips** (`sourceChip`, `evidenceMeter`, `provenanceLine`, `demoBadge`) to every stat tile, chart card, and answer-key display, and wrap Hindi question/option text with `langAttr(text, lang)`.
5. **Run `npm run check && npm test`** to verify all static guards and jsdom accessibility tests pass.

---

## 6. Automated UI Guards (`tools/check.mjs` & `tests/ui.test.js`)

### Static Guards (`tools/check.mjs` / `npm run check` / `npm run audit:ui`)
- **`[hidden]` first-rule guard**: Verifies `[hidden] { display: none !important; }` is present and is the very first selector in `css/app.css`.
- **Toast click-through guard**: Verifies `#toastStack { pointer-events: none }` and `#toastStack > * { pointer-events: auto }`.
- **Token-only colour guard**: Strips `:root` / `data-theme` / `prefers-color-scheme` / `forced-colors` token blocks and verifies **zero** `#hex`, `rgb()`, or `hsl()` colour literals appear anywhere else in `css/app.css`.
- **WCAG 2.1 contrast audit**: Parses both Light and Dark token maps from `css/app.css` and computes relative luminance contrast ratios across **40 text/surface token pairs** (requiring `≥ 4.5:1`) and **9 non-text border/focus pairs** (requiring `≥ 3.0:1`) per theme (98 contrast assertions in total).
- **Zero inline style guard**: Scans every file in `js/**` and fails if any `style="..."` attribute is present.
- **Theme & media query guards**: Verifies `html[data-theme="light"]`, `html[data-theme="dark"]`, `@media (prefers-reduced-motion: reduce)`, `@media (forced-colors: active)`, `@media print`, and the pre-paint theme bootstrap script in `index.html`.

### Runtime / JSDOM Guards (`tests/ui.test.js` / `npm test`)
- Verifies every route renders with **exactly one `<h1>`**, **no skipped heading levels**, and updates `document.title` (`<Screen> · MyMPPSC`).
- Verifies `openModal` moves focus inside the dialog, marks `#main` `inert`, wraps `Tab` and `Shift+Tab` at focus boundaries, closes on `Escape`, and restores focus to the trigger element.
- Verifies the off-canvas navigation drawer is `inert`, `aria-hidden="true"`, and `tabindex="-1"` when closed at mobile widths, opens on `#navToggle`, and closes on `#navScrim` click while restoring focus.
- Verifies WAI-ARIA APG tabs respond to `ArrowRight`, `ArrowLeft`, `Home`, and `End` with roving `tabindex` and `aria-selected`.
- Verifies `#setTheme` and `#themeToggle` update `document.documentElement.dataset.theme` and `<meta name="theme-color">`.
- Verifies the test runner's distraction-free focus mode (`[data-action="focus-mode"]`), keyboard shortcut bar (`.kbd-bar`), `aria-keyshortcuts`, Hindi `lang="hi"` tagging, and provenance chips.
