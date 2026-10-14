# UI & Design System (`docs/UI.md`)

MyMPPSC is a local-first, zero-dependency, static single-page study application for MPPSC Prelims preparation. The interface is built with vanilla HTML, a token-driven stylesheet (`css/app.css`), and a dependency-free component kit (`js/ui/components.js`).

Every visual decision serves three goals:
1. **Long-session reading comfort** across English and Hindi (Devanagari) question stems, passages, and explanations.
2. **Epistemic honesty (North Star)** — every figure, badge, and question card answers *what should I do now?*, *what do I actually know?*, and *where did it come from?* using a shared provenance vocabulary.
3. **Verifiable accessibility and layout safety** enforced automatically by `npm run check` (`tools/check.mjs`) and `npm test` (`tests/ui.test.js`).

---

## 1. Design Tokens (`css/app.css`)

All colour literals in `css/app.css` live inside the root token blocks (`:root, :root[data-theme="light"]`, `:root[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`, and `@media (forced-colors: active)`). `tools/check.mjs` fails the build if any `#hex`, `rgb()`, or `hsl()` colour appears outside a token block.

### 1.1 Surface, Border & Text Palette

| Token | Light Theme (`data-theme="light"`) | Dark Theme (`data-theme="dark"`) | Purpose |
| :--- | :--- | :--- | :--- |
| `--bg` | `#f4f6fa` | `#0f131c` | Page canvas |
| `--bg-elevated` | `#ffffff` | `#161b26` | Cards, dialogs, table containers |
| `--bg-sunken` | `#eaeef5` | `#0a0d14` | Wells, code blocks, secondary panels |
| `--text` | `#141926` | `#f0f3f9` | Primary body & question text (≥ 15.8:1 contrast) |
| `--text-muted` | `#3d4659` | `#c2cadb` | Secondary labels & metadata (≥ 7.9:1 contrast) |
| `--text-soft` | `#525c70` | `#9aa5bc` | Captions, hints, axis labels (≥ 5.4:1 contrast) |
| `--border` | `#6e778c` | `#6e7891` | Card, table & control borders; the boundary of every form field and the edge of every progress track (≥ 3.7:1 contrast) |
| `--track` | `var(--bg-sunken)` | `var(--border-subtle)` (`#30384a`) | The empty part of a bar, ring or segmented track. In dark, `--bg-sunken` was 1.13:1 against a card, so an empty bar or ring was invisible. Every data colour (`--accent`, `--ok`, `--warn`, `--bad`, `--info`) must be ≥ 3:1 against it (audited); where the 100% extent carries meaning (progress bars) the track also gets a 1px `--border` edge |
| `--border-strong` | `#50596d` | `#8b95ad` | Input borders, checkbox/radio borders, non-text UI boundaries (≥ 5.6:1 contrast) |
| `--focus-ring` | `#1f3d7a` | `#93b4ff` | Keyboard `:focus-visible` ring (≥ 8.2:1 contrast) |

### 1.2 Brand & Semantic Status Tokens

| Role | Foreground Token (Light / Dark) | Soft Surface Token (Light / Dark) | Solid Ink Token (Light / Dark) | Contrast (Foreground on Soft Surface) |
| :--- | :--- | :--- | :--- | :--- |
| **Accent** (`--accent`, `--accent-soft`, `--on-accent`) | `#1f3d7a` / `#93b4ff` | `#e5ecf9` / `#1b2845` | `#ffffff` / `#0b1528` | ≥ 8.3:1 (Light) / ≥ 6.8:1 (Dark) |
| **OK / Verified** (`--ok`, `--ok-soft`, `--on-ok`) | `#116139` / `#6ee7a8` | `#e1f3e9` / `#11291e` | `#ffffff` / `#082014` | ≥ 6.4:1 (Light) / ≥ 9.1:1 (Dark) |
| **Warn / Synthetic** (`--warn`, `--warn-soft`, `--on-warn`) | `#7c4a03` / `#fbbf60` | `#fdefd8` / `#2b2110` | `#ffffff` / `#231602` | ≥ 6.4:1 (Light) / ≥ 8.6:1 (Dark) |
| **Bad / Disputed** (`--bad`, `--bad-soft`, `--on-bad`) | `#9e1c22` / `#ff9499` | `#fce8e9` / `#2f1619` | `#ffffff` / `#280709` | ≥ 6.4:1 (Light) / ≥ 6.8:1 (Dark) |
| **Info / Derived** (`--info`, `--info-soft`, `--on-info`) | `#174ea6` / `#8ac4ff` | `#e4eefc` / `#13243b` | `#ffffff` / `#081a2e` | ≥ 6.8:1 (Light) / ≥ 7.8:1 (Dark) |

### 1.3 Typography & Devanagari Scale

System font stacks are used with zero web-font network requests:
- `--sans`: `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", Arial, sans-serif`
- `--deva`: `"Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", system-ui, sans-serif`
- `--mono`: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`

| Token | Value | Usage |
| :--- | :--- | :--- |
| `--text-xs` | `0.75rem` (12px) | Badges, provenance chips, keyboard hints, table headers |
| `--text-sm` | `0.8125rem` (13px) | Secondary copy, filter labels, table cells |
| `--text-base` | `0.9375rem` (15px) | Default interface body |
| `--text-md` | `1.0625rem` (17px) | English & Hindi question stems |
| `--text-lg` | `1.125rem` (18px) | Card `<h2>` headings |
| `--text-xl` | `1.375rem` (22px) | Screen `<h1>` titles |
| `--text-2xl` | `1.5rem` (24px) | Stat tile values |
| `--text-3xl` | `2.25rem` (36px) | Hero report score |
| `--lh-tight` | `1.25` | Headings & stat values |
| `--lh-base` | `1.55` | English body copy |
| `--lh-reading` | `1.65` | English question stems (`--measure: 70ch`) |
| `--lh-deva` | `1.82` | Hindi (`[lang="hi"]`) stems & options so matras (`ि`, `ी`, `ु`, `ू`, `े`, `ै`) never clip |

### 1.4 Spacing, Radius, Elevation, Z-Index & Motion Scales

- **Spacing (`--space-1` … `--space-10`)**: `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `40px`. Compact density (`html[data-density="compact"]`) scales `--pad-card`, `--pad-tile`, `--pad-cell-y`, and `--gap-grid` down proportionally.
- **Radii**: `--radius-xs` (`4px`), `--radius-sm` (`7px`), `--radius` (`10px`), `--radius-lg` (`14px`), `--radius-pill` (`999px`).
- **Z-Index**: `--z-sticky` (`10`), `--z-runner-bar` (`20`), `--z-header` (`30`), `--z-scrim` (`35`), `--z-drawer` (`40`), `--z-toast` (`60`), `--z-modal` (`70`), `--z-skip` (`100`). Note: `.modal-root` also sets literal `z-index: 70` so JSDOM `getComputedStyle(modalRoot).zIndex` resolves without CSS variable evaluation.
- **Motion**: `--dur-fast` (`90ms`), `--dur-base` (`140ms`), `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`). Transitions are feedback only and never exceed `150ms`. The one looping animation is the skeleton placeholder pulse (opacity only, `1.6s`), declared inside `@media (prefers-reduced-motion: no-preference)` so it never runs for readers who ask for less motion (the global `reduce` block switches everything off as well). `tools/check.mjs` fails on any `animation:` outside such a block and on any literal transition over `150ms`.

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
- **`evidenceMeter(judgedCount, minSample = 3)`**: 3-step pip meter (`.evidence-pips` / `.evidence-pip.on`) with `role="img"` and `aria-label`; a met threshold renders `.evidence-meter.solid`. (It used to emit `.evidence-dot` and `sufficient`, which nothing styled: the pips were invisible.) The visible label is plain words ("no attempts yet", "only 2 attempts so far", "12 attempts"); the sample-size threshold lives in the tooltip. Counts below `minSample` render with `.evidence-meter.insufficient` so small samples are visually distinct from reliable verdicts. Use it sparingly — where a weak-evidence warning changes what the reader should do, not in every table cell.
- **`infoToggle(summary, body, { open, className })` / `infoNote(short, body)`**: A collapsed native-`<details>` "ⓘ" disclosure. Long explanations, provenance and policy caveats live behind it; the screen itself shows one short line. This is where detail that used to sit in banners and per-card chips now belongs. `className: 'info-wide'` lifts the 70ch measure for a disclosure that holds a table (the Insights year-by-year matrices).
- **`provenanceLine({ source, text })`**: Compact footer bar attaching a `sourceChip` to a plain-English explanation of how a metric or rule was computed.
- **`langAttr(text, explicitLang)` & `hasDevanagari(text)`**: Detects Unicode Devanagari (`\u0900–\u097F`) or explicit `'hi'` language code and emits ` lang="hi"` so browsers select Devanagari glyphs and apply `--leading-hi`.
- **`icon(name)`**: Inline monochrome SVG icons (`stroke="currentColor"`) for navigation, theme switching, and actions.
- **`card({ title, subtitle, actions, right, body, footer, tone, id, className })`**: Section container with `<h2>` header, optional right-aligned provenance slot (`right` or `actions`), body, and footer. Does not use `overflow: hidden`, preserving focus rings on child controls.
- **`tile({ label, value, sub, tone })`**: Stat tile — label, number, one short sub-line. It deliberately renders no provenance chip or caption (older `source`/`where` arguments are accepted and ignored); provenance belongs in the screen's `infoToggle`.
- **`dataTable({ columns, rows, footer, empty, className })`**: Responsive table. A column may carry `className` (on its `<th>` and every `<td>`) and `headerHtml` (trusted header markup, e.g. a select-all checkbox); a row is an array of cells or `{ cells, className }`.
- **`skeletonScreen(parts, { label })` & `skeleton.*`**: Loading placeholders — grey blocks in the shape of the screen that is coming (`skeleton.heading/lines/tiles/tabs/card/table/chart/fields/buttons`). The wrapper is the `role="status"` region with one visually hidden line ("Loading local data…", the same words as `loadingState()`); every block is `aria-hidden`, coloured from tokens, outlined in forced-colours mode, and pulses only when motion is allowed. Screen layouts live in `js/ui/skeletons.js`; a view exposes one as `skeleton(ctx)` (see §5).
- **`tabs({ id, items, activeId })` & `mountTabs(root, onChange)`**: WAI-ARIA Authoring Practices Guide (APG) tabs with `role="tablist"`, `role="tab"`, `role="tabpanel"`, roving `tabindex` (`0` on selected, `-1` on others), `aria-selected`, `aria-controls`, `aria-labelledby`, and `ArrowRight` / `ArrowLeft` / `Home` / `End` keyboard navigation.
- **`openModal({ title, body, actions, wide, onMount, dismissible })`**: Accessible modal dialog (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`). Saves the trigger element, sets `inert` on `#appHeader`, `#appBody`, and `#main`, moves initial focus inside the dialog, traps `Tab` / `Shift+Tab` at boundaries, closes on `Escape` or backdrop click, and restores focus to the trigger element on close. The dialog hides at once but keeps its markup until the next task, so a caller can read its fields after `await openModal(...)`.
- **`toast(message, tone, timeout)`**: Notification banner inside `#toastStack` (`pointer-events: none` on stack, `pointer-events: auto` on individual `.toast` items), capped at 4 concurrent toasts, with pause-on-hover/focus and a dismiss button.
- **`barChart(...)`**: Responsive SVG chart (`viewBox` + `role="img"` + `aria-label`) paired with a `<details class="chart-data">` accessible data table, whose headings are `labelHeader` / `valueHeader` / `shareHeader` (default *Subject* / *Questions* / *Share*). Pass `dataTable: false` only when the same rows are rendered as a real table right under the chart. The label column widens to fit the longest label (up to 34 characters are shown; the full label is in the tooltip and the table). There is no time-series chart in the library: the daily-activity and accuracy-trend line charts were removed as uninterpretable at small sample sizes, and per-day numbers were not replaced with another visual.
- **`renderExplanation(question)`**: Renders the explanation the bank stored for a question — the correct-option reasoning, per-option notes, key concepts and revision takeaways — with a plain sentence when the record has none. It attaches no badge and no review status: the app cannot check prose, so it neither claims nor implies that anybody has.

---

## 3. Accessibility & Layout Contract

1. **Heading Hierarchy**: Every route renders **exactly one `<h1>`** as its first heading and never skips heading levels (`h1 -> h2 -> h3`). Card titles use `<h2>`; sub-sections inside cards and `renderExplanation()` use `<h3>`.
2. **Route Announcements & Document Title**: On every route transition, `js/ui/router.js` updates `document.title` to `<Screen Title> · MyMPPSC` and updates the dedicated polite live region `#routeAnnouncer`. `#view` itself does **not** carry `aria-live="polite"`, preventing screen readers from re-reading entire screens on every click.
2b. **In-place refreshes keep the reader's place**: `ctx.refresh()` re-resolving the *same* route (ticking a filter, changing a setting, answering in the runner) is not a navigation. The router restores the scroll offset and returns focus to the equivalent control (matched by `id`, then `data-action` + `data-value` / `data-index`, then `name` + `value`); only a genuinely new destination starts at the top. `ctx.isRefresh` tells a view which case it is in, so it can apply route defaults on a navigation and keep the reader's choices on a refresh (Insights keeps its open tab this way). The test runner does the same for its internal repaints, and only an explicit move to another question scrolls — to that question. A control that disappears or disables as the result of an action (a bulk action's buttons once the selection is empty) parks focus on a stable neighbour first, so the refresh has something to return to.
2c. **Listeners end with their screen**: `#view` outlives every screen. A listener a view attaches to it (event delegation) or to `document` passes `{ signal: ctx.signal }`; the router aborts that signal when the next render paints over the screen. Without it, handlers accumulated — one more per render — and kept firing on later screens (one click on *Export bank* downloaded a copy per earlier render).
2d. **Loading states have the shape of the screen**: while `render()` reads its data the router paints the view's `skeleton(ctx)` (Dashboard, Insights, Revision Centre, Question Bank) or, failing that, `loadingState()`. Both carry the same status line for assistive technology.
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

1. **Create or update the view module** in `js/ui/views/<name>.js` exporting `{ title, render(ctx), mount?(ctx, root), cleanup?(ctx), skeleton?(ctx) }`. Give a screen that reads a lot of data a `skeleton(ctx)` built in `js/ui/skeletons.js` (synchronous, no data). Listeners added to `root` or `document` in `mount()` take `{ signal: ctx.signal }`. `render()` receives the parsed hash route in `ctx.params` (`#/topic/Geography` → `['Geography']`); a view that can be deep-linked must apply its params once per route change, not on every re-render.
2. **Start `render()` with `<h1>${esc(this.title)}</h1>`** in both empty and populated states. Use `card({ title: '...' })` (`<h2>`) for top-level sections and `<h3>` for sub-sections inside cards. Never use `<h4>` directly inside a card without an intervening `<h3>`.
3. **Never write inline `style="..."` attributes** in JS templates. Use existing layout utilities (`.row`, `.spread`, `.stack`, `.split-2`, `.field-row`, `.mt-2`, `.mb-3`, etc.) or add a semantic class to `css/app.css` using design tokens.
4. **Keep the surface clean; put provenance behind ⓘ.** Do not attach `sourceChip`s to tiles or card headers. Keep only badges that change a decision (missing/disputed answer key, demonstration content). Papers are never badged complete or incomplete. Everything else — where a number came from, why a rule applies, what a policy does and does not claim — goes in one `infoToggle` per screen. Use `evidenceMeter` only where weak evidence changes the advice, and wrap Hindi question/option text with `langAttr(text, lang)`.
5. **Register it in three places**: the `NAV` array and the `router.register(...)` list in `js/app.js` (the ⌘K palette is built from `NAV`, so one entry covers both), and — for any new file under `js/services/` or `js/ui/views/` — `SHELL_FILES` in `sw.js` with a `VERSION` bump, or the offline shell ships without it. `npm run check` fails on any precached file that is missing from the list and on any registered route with no view.
6. **Run `npm run check && npm test`** to verify all static guards and jsdom accessibility tests pass.

---

## 6. The Syllabus section

`js/ui/views/syllabus.js` renders the whole curriculum in one screen. It replaced two: an official-syllabus viewer and a separate study planner, which kept one curriculum in two stores and showed two progress figures that could not see each other.

**Layout.** `.syl-head` holds the title, the switch (`.syl-switch`: **Prelims · Mains · My plan**, an APG-style tab list with arrow-key, Home and End navigation), an overview strip (`.syl-overview`) and the search box (`#sylSearch`). Until anything is marked, the overview explains how marking works; afterwards it shows a ring (`.syl-ring`), a bar split by status (`.syl-bar`) and a legend with counts. Below it, a rail of papers (`.syl-rail`, each with its own small bar and percentage) sits beside one column: a toolbar (paper title, size, *Add paper to My plan*, *Expand all* / *Collapse all*), a filter (`.syl-filter`: All · Not started · In progress · Done) and the tree (`.syl-tree` / `.syl-row`). A detail panel (`.syl-detail`) opens directly under the row it describes. It is a real route — `#/syllabus/official/<node-id>` for a line of the notification, `#/syllabus/plan/<item-id>` for one of the reader's own — so Back and Forward move between the tree and the topic without losing expansion state. The view implements the router's optional `positionScroll()` hook, so opening or closing a topic keeps the row the reader used where it was on screen, with focus on it, instead of jumping to the top. Switching stage or tab while a topic is open drops the topic from the address.

**Status.** One mark (`.syl-mark`) is used everywhere: an empty ring (not started), a half-filled ring (in progress), a tick (completed) and a tick inside a second ring (revised), so the shape carries the meaning as well as the colour. Every topic row has a one-click mark (`.syl-tick`, `data-cycle`) that steps through the four statuses and keeps focus and its place on screen: an in-place re-render measures the control that was used and scrolls by however much it moved, so when the first mark swaps the intro for the shorter summary (or clearing the last brings it back) the row stays under the pointer and a quick second click cannot land on another topic. Headings show a count and a small bar (`.syl-count`, e.g. `2/6`). The detail panel offers the four statuses as a segmented control (`data-set-status` / `data-status`); on a heading it marks every topic under it at once and asks first when that would overwrite topics marked differently.

**The progress rule** (`officialStatusIndex()` in `js/services/syllabus.js`, `planStatusIndex()` and `cascadeChanges()` in `js/services/syllabus-hub.js`) is the same in both trees:

- a topic has its own status, or failing that the status of its nearest marked heading;
- a heading shows the roll-up of its topics (completed when all are done, revised when all are revised, in progress once any is started);
- only topics are counted — never a heading next to its own topics — and a heading counts the reader's items pinned anywhere beneath it;
- marking a heading replaces the marks beneath it; marking one topic "not started" under a marked heading first spells the heading's mark out on its other topics, so it cannot come back.

**My plan.** Any paper, section, unit or topic can be added with the row's `+` control (`.syl-plan-btn`), the toolbar or the detail panel. It joins *by reference*: `in_plan: true` on its `syllabus_progress` row, the same row that holds its status, so a topic ticked in the tree is ticked in My plan and nothing the commission wrote is copied into the reader's own store. The My plan tab shows overdue and upcoming target dates, one card per planned node grouped by stage (`.syl-card`, with its live sub-tree), and the reader's own items. Removing a node from the plan keeps its progress.

Four rules keep the merged screen honest:

1. **The syllabus is the primary content.** No question counts, examination marks, scores or predictions sit beside it — the only figures are the reader's own progress — and every derived study unit is marked `derived` wherever it appears.
2. **An item the reader wrote is always visibly theirs.** It carries a *your item* chip, gets the tinted `.syl-node-plan` rail, and never receives the numbering or `langAttr` treatment that marks official wording. It is shown under an official heading only where the curated `data/syllabus/pyq-links.json` mapping — or an explicit pin — puts it (an item added with *Add your own item here* opens the topic it was pinned to, so it shows at once); fuzzy title matching is deliberately not used, so an unrecognised item stays in *My plan* instead of being guessed into the tree.
3. **The official tree is read-only data.** Attaching is a display relationship resolved at render time by `js/services/syllabus-hub.js`; nothing is written into the shipped model, and the two stores (`syllabus`, `syllabus_progress`) stay separate on disk.
4. **One vocabulary, which never over-claims.** `not_started · in_progress · completed · revised` drives both kinds of item. The planner's legacy `revising` sat *before* `completed` in its own ordering, so the hub maps it to `in_progress`, not to the official `revised` that counts as done — reading it as done would mark items complete on the reader's behalf. An unknown status is refused, never stored as "not started".

Clearing a status — or resetting all official progress — never deletes a target date, priority, note or place in My plan that the reader set. Style tokens only: the rules live in `css/app.css` under "Syllabus", with a `≤860px` layout that turns the rail into a horizontal scroller and gives every control a 44px target, and forced-colours rules that redraw the marks and bars in system colours.

## 6a. The Insights section

`js/ui/views/analytics.js` is a shell with two panels: **My performance** (its own body) and **The question bank** (`renderBankPanel` / `mountBankPanel`, exported by `js/ui/views/pyq-analysis.js`). These were two screens that read as one idea in the menu but are not duplicates — one is derived from stored attempts, the other is pure counting over the question index.

The tab boundary is exactly that data-source boundary, and it is the rule that keeps the merge from becoming a pile of cards: **the bank panel never shows performance, and the performance panel never counts the bank as though it were the examination.** `tests/section-merge.test.js` asserts both directions. The shell owns the single `<h1>`; a panel that claimed its own would leave the screen with two, so each panel starts at `<h2>`.

Above the tabs the shell states the three numbers the two tabs are most often confused for — *questions available*, *unique questions attempted*, *total attempts* — once, in a shared tile strip with a caption naming the difference. They are section-level facts rather than either tab's findings, so neither panel repeats them: the performance panel starts at first-attempt accuracy. The strip is omitted entirely when no bank is stored, because three zeroes state nothing.

**The question bank panel** is laid out for a full bank (1,200 questions, 12 papers): four tiles (questions, subjects, topics, answer keys); *Questions per subject* — one `barChart` with a sort switch and the subject × year matrix behind ⓘ *Year by year*; *Questions per topic* — subject chips (question counts), a `barChart` of that subject's topics (the 15 largest across all subjects, with *Show all*), and a short table of the same rows (count, share, how many of the stored papers hold the topic, practice link) with its own year-by-year matrix behind ⓘ; and one ⓘ *About these counts*. No open table has more than six columns, and nothing on the panel is a banner, a provenance chip or a per-paper complete/incomplete label. **Its numbers are the Question Bank screen's**: groups use the same keys as that screen's filters (`subject || 'Unclassified'`, `topic || 'Unclassified'`), so filtering its Questions tab by a subject or topic lists exactly the questions counted; topics are counted as named topics plus, separately, each subject's *Unclassified* group, so the tile, the card line and *Show all* add up. `tests/ui-improvements.test.js` compares the two screens subject by subject.

The open tab is part of the section's state: a navigation opens the tab its route names (`#/pyq-analysis` → the bank panel), and an in-place refresh from inside a panel — a chip, the topic search — keeps the reader on the tab they chose.

Both sections keep the routes they replaced (`#/syllabus-analysis/<node-id>`, `#/pyq-analysis/<Subject>`) registered to the merged view, because the curated PYQ chips and any reader's bookmarks still use them. `js/ui/views/syllabus-analysis.js` and the default export of `js/ui/views/pyq-analysis.js` exist for exactly that, and `tools/check.mjs` still requires a view file per registered route.

## 6b. Question Bank bulk actions

The Questions tab of `js/ui/views/bank.js` has a selection column: a checkbox per row (named *Select question Q12 (id)*) and a select-all box in the header for the rows on screen, which shows a mixed state for a partial page. The selection is a set of ids in the view's state, so it survives paging and filtering; the bar above the table says how many are selected and how many of those are off the current page, and the selection is pruned when questions are deleted. Ticking boxes only updates the page in place (no refresh). The bar keeps a fixed footprint, so the first tick enables its buttons instead of pushing rows under the pointer.

- **Change subject/topic…** opens a dialog that is its own confirmation: how many questions, what they carry now, blank fields keep each question's own value, and *Apply* refuses an empty form inline. It calls `questions.updateClassifications()`, which runs the single-question `updateClassification()` on each question — same existence check, correction entry and preserved imported labels — and skips questions that already carry the labels. The change can be undone from a notice above the list (after a confirmation): `restoreClassifications()` puts back exactly what each question had, including "no label" and the edit marker that decides whether a bank update may refresh its labels, and leaves alone any question changed again since.
- **Delete…** lists the questions in a confirmation and says it cannot be undone (questions of the bundled bank come back by reloading it). It calls `questions.deleteQuestions()`, the one delete path the question editor and the duplicate review now share; it reports ids that were already gone and tells the shell, so the bank pill updates.
- After either action the selection is cleared and focus is parked on the select-all box before the refresh, so the router returns the reader to the list.

## 6c. Test runner shortcut legend

The **?** button at the end of the runner header (`data-action="kbd-legend"`, `aria-expanded`, `aria-controls="runnerKbdLegend"`) toggles a non-modal popover listing exactly the keys the screen answers to — `wireKeyboard()` in `runner.js` (1–9, → / N, ← / P, F, U, and C when confidence marking is on) plus the app-wide ?, Ctrl/⌘ K and Esc. It opens without taking focus (nothing scrolls), traps nothing, closes on Escape (returning focus to the button only if focus was inside it), on its ✕ (there is no Escape key on a phone) and on a click elsewhere, and stays open across the runner's repaints until then. It hangs off the runner bar at every width, so it cannot spill off a narrow screen. Shortcuts ignore Ctrl/⌘/Alt combinations, so browser shortcuts (Ctrl+P, Ctrl+F, ⌘C…) are never swallowed. The palette marks state by shape as well as colour — a bar under an answered number (kept under the flagged colours), ⚑ on a flagged one, a ring and `aria-current="step"` on the current one — and its legend shows the same cues.

## 7. Automated UI Guards (`tools/check.mjs` & `tests/ui.test.js`)

### Static Guards (`tools/check.mjs` / `npm run check` / `npm run audit:ui`)
- **`[hidden]` first-rule guard**: Verifies `[hidden] { display: none !important; }` is present and is the very first selector in `css/app.css`.
- **Toast click-through guard**: Verifies `#toastStack { pointer-events: none }` and `#toastStack > * { pointer-events: auto }`.
- **Token-only colour guard**: Strips `:root` / `data-theme` / `prefers-color-scheme` / `forced-colors` token blocks and verifies **zero** `#hex`, `rgb()`, or `hsl()` colour literals appear anywhere else in `css/app.css`.
- **WCAG 2.1 contrast audit**: Parses both Light and Dark token maps from `css/app.css` (resolving `var(--token)` aliases such as `--track`) and computes relative luminance contrast ratios across **40 text/surface token pairs** (requiring `≥ 4.5:1`) and **14 non-text pairs** — borders and focus ring against every surface, and every data colour against `--track` — (requiring `≥ 3.0:1`) per theme (108 contrast assertions in total).
- **Motion guard**: Every `animation:` declaration must sit inside `@media (prefers-reduced-motion: no-preference)` (except `animation: none`), and no literal transition may exceed `150ms`.
- **Zero inline style guard**: Scans every file in `js/**` and fails if any `style="..."` attribute is present.
- **Theme & media query guards**: Verifies `html[data-theme="light"]`, `html[data-theme="dark"]`, `@media (prefers-reduced-motion: reduce)`, `@media (forced-colors: active)`, `@media print`, and the pre-paint theme bootstrap script in `index.html`.

### Runtime / JSDOM Guards (`tests/ui.test.js` / `npm test`)
- Verifies every route renders with **exactly one `<h1>`**, **no skipped heading levels**, and updates `document.title` (`<Screen> · MyMPPSC`).
- Verifies `openModal` moves focus inside the dialog, marks `#main` `inert`, wraps `Tab` and `Shift+Tab` at focus boundaries, closes on `Escape`, and restores focus to the trigger element.
- Verifies the off-canvas navigation drawer is `inert`, `aria-hidden="true"`, and `tabindex="-1"` when closed at mobile widths, opens on `#navToggle`, and closes on `#navScrim` click while restoring focus.
- Verifies WAI-ARIA APG tabs respond to `ArrowRight`, `ArrowLeft`, `Home`, and `End` with roving `tabindex` and `aria-selected`.
- Verifies `#setTheme` and `#themeToggle` update `document.documentElement.dataset.theme` and `<meta name="theme-color">`.
- Verifies the test runner's distraction-free focus mode (`[data-action="focus-mode"]`), keyboard shortcut bar (`.kbd-bar`), `aria-keyshortcuts`, Hindi `lang="hi"` tagging, sequential question palette, and that the dashboard carries no provenance chips.
- `tests/ui-improvements.test.js`: skeleton markup (one hidden status line, decorative blocks, nothing focusable) and the router's skeleton/fallback painting; listener lifetime through `ctx.signal`; the shortcut legend (lists exactly the handled keys, Escape/✕/outside click close it, focus never trapped or moved on open, modifier combinations ignored); Question Bank selection, bulk change with undo and bulk delete, with focus kept in the list; Insights keeping its tab on refresh; the bank panel's numbers against the Question Bank screen; and regressions (evidence-meter classes, the Revision Centre's stray `}`).
- `tests/bulk-questions.test.js`: the bulk services — per-question corrections, skipped no-ops, exact undo (including nulls and the edit marker), undo never overwriting newer edits, and the shared delete path.
