# UI & Design System (`docs/UI.md`)

MyMPPSC is a local-first, zero-dependency, static single-page study application for MPPSC Prelims preparation. The interface is built with vanilla HTML, a token-driven stylesheet (`css/app.css`), and a dependency-free component kit (`js/ui/components.js`).

Every visual decision serves three goals:
1. **Long-session reading comfort** across English and Hindi (Devanagari) question stems, passages, and explanations.
2. **Epistemic honesty (North Star)** — every figure, badge, and question card answers *what should I do now?*, *what do I actually know?*, and *where did it come from?* using a shared provenance vocabulary.
3. **Verifiable accessibility and layout safety** enforced automatically by `npm run check` (`tools/check.mjs`) and `npm test` (`tests/ui.test.js`).

---

## 1. Design direction — "Ink & paper"

The interface is warm paper, one ink-blue signal, and near-black primary actions. Hierarchy comes from type, space and a single hairline border — not from stacked cards, shadows or colour washes. A screen has one heading, one obvious primary action, and everything explanatory is either one line or behind a disclosure.

### 1.1 Surface, Border & Text Palette

| Token | Light (`data-theme="light"`) | Dark (`data-theme="dark"`) | Purpose |
| :--- | :--- | :--- | :--- |
| `--bg` | `#f7f6f2` | `#131413` | Page canvas (warm paper / near-black) |
| `--bg-elevated` | `#ffffff` | `#1a1b19` | Cards, dialogs, table containers |
| `--bg-sunken` | `#efeee8` | `#0e0f0e` | Wells, code blocks, segmented controls |
| `--surface-hover` | `#f3f2ec` | `#222420` | Hover surfaces in rows and menus |
| `--sidebar-bg` | `#f3f2ed` | `#0f100f` | Navigation rail and drawer |
| `--text` | `#1b1d1b` | `#f1f1ec` | Primary body & question text |
| `--text-muted` | `#474b45` | `#c3c6bd` | Secondary labels & metadata |
| `--text-soft` | `#5f645c` | `#9da196` | Captions, hints, axis labels |
| `--border` | `#767b72` | `#757a70` | Control and table boundaries (audited ≥ 3:1) |
| `--border-strong` | `#4f554d` | `#9aa093` | Input borders, checkbox boundaries |
| `--border-subtle` | `#e4e2d9` | `#33352f` | Decorative hairlines between sections and rows |
| `--focus-ring` | `#2c4f8f` | `#a8c0ea` | Keyboard `:focus-visible` ring |
| `--track` | `#e6e4dc` | `var(--border-subtle)` | Empty part of a progress bar or segmented track |

### 1.2 Accent, Ink & Semantic Tones

The accent is a single restrained blue used for interactive state and focus. Primary buttons are **ink**, not accent, so colour stays a signal.

| Role | Foreground (Light / Dark) | Soft surface | Solid/ink pair |
| :--- | :--- | :--- | :--- |
| Accent (links, selected state) | `#33518c` / `#9db6e6` | `#e9edf5` / `#1e2733` | `--on-accent` |
| Primary action (`--ink`) | `#1f221e` / `#edede7` | — | `--on-ink: #ffffff` / `#191b18` |
| OK / verified | `#1f6b45` / `#7fd3a4` | `#e6f1e9` / `#14281c` | `--on-ok` |
| Warn / synthetic | `#7a4a06` / `#ecc37b` | `#f7edd9` / `#2a2214` | `--on-warn` |
| Bad / disputed | `#9c2230` / `#f09a95` | `#f9e8e8` / `#2d1717` | `--on-bad` |
| Info / derived | `#1f5a6e` / `#8ec6d6` | `#e6eff1` / `#11252b` | `--on-info` |

Dark mode is a designed surface set (elevated cards, a darker sunken well, lower-chroma borders), not an inversion. `tools/check.mjs` audits every foreground/background pair and fails on a contrast regression.

### 1.3 Typography & Devanagari Scale

Inter is bundled locally (`fonts/inter-variable.woff2`, OFL licence in `fonts/OFL.txt`), so the interface is identical offline with no network request. Devanagari uses the platform's Noto/Kohinoor/Mangal with a taller leading.

- `--sans`: `"InterVariable", "Inter", system-ui, … "Noto Sans Devanagari"`
- `--deva`: `"Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", "Nirmala UI", system-ui`
- `--mono`: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`

| Step | Value | Usage |
| :--- | :--- | :--- |
| `--type-display` | `2rem` | One big figure (report score) |
| `--type-title` | `1.5rem` | Screen `<h1>` |
| `--type-body` | `0.9375rem` | Paragraphs, controls, table cells |
| `--type-caption` | `0.8125rem` | Labels, footnotes, provenance chips |

Question stems and options use `--text-md` (17px) with `--lh-reading` (1.65) and `--measure` (68ch); `[lang="hi"]` uses `--lh-deva` (1.82) so matras never clip. Card headings are 17px (`--text-lg`) at weight 600 — one step above body, not a banner.

### 1.4 Spacing, Shape, Motion & Shell

- **Spacing:** `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48px`; component padding is density-aware (`--pad-card`, `--pad-tile`, `--pad-cell-*`). `html[data-density="compact"]` shrinks these plus body leading.
- **Radii:** `4 / 6 / 8 / 12 / 16px`; `--radius-pill` only for status dots and a half-mark. Cards use 12px, inputs 8px.
- **Elevation:** `--shadow-xs` and below; cards carry a hairline border and no shadow in normal flow; dialogs and the mobile drawer are the only raised layers.
- **Motion:** `--dur-fast` 90ms, `--dur-base` 140ms, `--ease-out`; transitions are feedback only. The skeleton pulse is the one looping animation and runs only under `prefers-reduced-motion: no-preference`.
- **Shell:** `--header-h: 56px`, `--nav-w: 236px`, `--nav-rail-w: 64px`, `--runner-side-w: 288px`, `--max-w: 1120px`, `--touch-min: 44px`.
- **Z-index:** sticky 10, runner bar 20, header 30, scrim 35, drawer 40, toast 60, modal 70, skip link 100.

### 1.5 Navigation architecture

- **Header (56px):** menu toggle (≤860px), wordmark, command trigger (`#commandBtn`, `⌘K`/`Ctrl K`), Quick practice, theme toggle, Help, and the resume strip when a session is unfinished.
- **Sidebar (desktop):** four groups — **Study** (Today, Papers, Practice, Smart), **Review** (Mistakes, Revision), **Plan** (Syllabus, Insights), **Manage** (Bank, Settings, Help). Phase 3 shortened every label to the word a reader uses; the full name stays as each screen's `<h1>`. Group labels are small caps, not boxes. Destructive/rare destinations sit at the bottom with storage and offline state.
- **Collapsible rail:** `#navCollapse` hides labels and shrinks the sidebar to 64px; the choice persists in `localStorage['mymppsc.navCollapsed']` and the nav buttons keep `aria-label`/`title`.
- **Mobile:** the same list becomes an off-canvas drawer with a scrim (`#navToggle`, `#appNav`, `#navScrim`, inert `#main`, focus restore); ≤560px a five-item tab bar plus **More** keeps the frequent destinations one thumb away.
- **Nested pages:** the test runner and a test report carry a one-line breadcrumb back to Test Centre. Everything else is one level deep.
- **Command palette:** screens (Go), actions (Do), and questions/topics (Find) in one overlay; it never replaces the sidebar.

---

The implementation history for this pass — what changed per screen and the verification figures — is in [`docs/UI_OVERHAUL.md`](UI_OVERHAUL.md).

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

1. **Create or update the view module** in `js/ui/views/<name>.js` exporting `{ title, render(ctx), mount?(ctx, root), cleanup?(ctx), skeleton?(ctx) }`. Give a screen that reads a lot of data a `skeleton(ctx)` built in `js/ui/skeletons.js` (synchronous, no data). Listeners added to `root` or `document` in `mount()` take `{ signal: ctx.signal }`. `render()` receives the parsed hash route in `ctx.params` (`#/topic/Geography` → `['Geography']`), each parameter already decoded by `safeDecodeParam()` so a malformed escape (`#/topic/50%`) is data rather than a thrown `URIError`; a view that can be deep-linked must apply its params once per arrival — `ctx.isRefresh` separates "the reader came here" from "the screen redrew itself" — and not on every re-render.
2. **Start `render()` with `screenHead({ title, purpose, primary, secondary })`** in both the empty and the populated state. It emits the screen's `<header class="screen-head">`, its only `<h1>`, one purpose line and its actions; a view must not write an `<h1>` anywhere else. Use `card({ title, count, info, action })` (`<h2>`) for top-level sections and `<h3>` for sub-sections inside cards. Never use `<h4>` directly inside a card without an intervening `<h3>`. A card's title row holds one heading, an optional `countChip()`, at most one `cardInfo()` ⓘ and at most one action — everything else goes in a `.card-toolbar` at the top of the body.
3. **Never write inline `style="..."` attributes** in JS templates. Use existing layout utilities (`.row`, `.spread`, `.stack`, `.split-2`, `.field-row`, `.mt-2`, `.mb-3`, etc.) or add a semantic class to `css/app.css` using design tokens.
4. **Keep the surface clean; put provenance behind ⓘ.** Do not attach `sourceChip`s to tiles or card headers. Keep only badges that change a decision (missing/disputed answer key, demonstration content). Papers are never badged complete or incomplete. Everything else — where a number came from, why a rule applies, what a policy does and does not claim — goes in one `infoToggle` per screen. Use `evidenceMeter` only where weak evidence changes the advice, and wrap Hindi question/option text with `langAttr(text, lang)`.
5. **Register it in three places**: the `NAV` array and the `router.register(...)` list in `js/app.js` (the ⌘K palette is built from `NAV`, so one entry covers both), and — for any new file under `js/services/` or `js/ui/views/` — `SHELL_FILES` in `sw.js` with a `VERSION` bump, or the offline shell ships without it. `npm run check` fails on any precached file that is missing from the list and on any registered route with no view.
   A screen that absorbs an older one keeps the old address working with `router.alias('custom', 'topic')` plus a `NAV_ALIASES` entry, so the retired route opens the merged screen **and** highlights the navigation item that now owns it. `npm run check` asserts both halves of that pair.
6. **Run `npm run check && npm test`** to verify all static guards and jsdom accessibility tests pass.

---

## 6. The Syllabus section

`js/ui/views/syllabus.js` renders the whole curriculum in one screen. It replaced two: an official-syllabus viewer and a separate study planner, which kept one curriculum in two stores and showed two progress figures that could not see each other.

**Layout.** A `screenHead()` block holds the title, the purpose line and the two actions (*Find a topic* focuses the search, *Practise a topic* opens the practice screen). `.syl-controls` holds the switch (`.syl-switch`: **Prelims · Mains**, an APG-style tab list with arrow-key, Home and End navigation) and the search box (`#sylSearch`); the overview strip (`.syl-overview`) sits directly under it. Until anything is marked, the overview explains how marking works; afterwards it shows a ring (`.syl-ring`), a bar split by status (`.syl-bar`) and a legend with counts. Below it, a rail of papers (`.syl-rail`, each with its own small bar and percentage) sits beside one column: a toolbar (paper title, size, *Expand all* / *Collapse all*), a filter (`.syl-filter`: All · Not started · In progress · Done) and the tree (`.syl-tree` / `.syl-row`). A detail panel (`.syl-detail`) opens directly under the row it describes. It is a real route — `#/syllabus/official/<node-id>` — so Back and Forward move between the tree and the topic without losing expansion state. `#/syllabus/plan/<item-id>` was the address of the removed *My plan* tab; it still resolves, to the syllabus home, without an error notice. The view implements the router's optional `positionScroll()` hook, so opening or closing a topic keeps the row the reader used where it was on screen, with focus on it, instead of jumping to the top. Switching stage while a topic is open drops the topic from the address.

**Status.** One mark (`.syl-mark`) is used everywhere: an empty ring (not started), a half-filled ring (in progress), a tick (completed) and a tick inside a second ring (revised), so the shape carries the meaning as well as the colour. Every topic row has a one-click mark (`.syl-tick`, `data-cycle`) that steps through the four statuses and keeps focus and its place on screen: an in-place re-render measures the control that was used and scrolls by however much it moved, so when the first mark swaps the intro for the shorter summary (or clearing the last brings it back) the row stays under the pointer and a quick second click cannot land on another topic. Headings show a count and a small bar (`.syl-count`, e.g. `2/6`). The detail panel offers the four statuses as a segmented control (`data-set-status` / `data-status`); on a heading it marks every topic under it at once and asks first when that would overwrite topics marked differently.

**The progress rule** (`officialStatusIndex()` in `js/services/syllabus.js`, `buildProgressIndex()` and `cascadeChanges()` in `js/services/syllabus-hub.js`) counts the commission's lines and nothing else:

- a topic has its own status, or failing that the status of its nearest marked heading;
- a heading shows the roll-up of its topics (completed when all are done, revised when all are revised, in progress once any is started);
- only topics are counted — never a heading next to its own topics;
- marking a heading replaces the marks beneath it; marking one topic "not started" under a marked heading first spells the heading's mark out on its other topics, so it cannot come back.

**Wordings.** The commission published almost every line in Hindi, some in both languages and five in English only. One helper decides what a label is — `nodeLabel(node, lang)` in `js/services/syllabus.js`, used by the tree, the detail title, the breadcrumbs, the paper rail, the overview and the search results alike — and it returns the wording *and* where it came from: `official` (the commission's own text in the interface language), `rendering` (this app's hand-written English for a Hindi-only line), `hindi` (a fallback that the renderings make unreachable), `official-only-en` (one of the five) or `none` (a numbered container the notification never titled). Hindi mode is untouched: official Hindi, or official English for those five.

English mode never shows bare Hindi and never shows a machine guess. The renderings live in `data/syllabus/translations/en.json`, keyed by node id and field, each entry holding the official Hindi beside the English so a stale entry is detectable; they are attached to a node as `node.translation` and are never merged into `node.text` or `node.titles`. Only a `rendering` gets the ⓘ *About this English wording* note (`.info-toggle`) saying it is not official text. The **Official wording** block (`.syl-said`) and the detail panel's *Official syllabus* list always carry the commission's Hindi with `lang="hi"` and nothing else — an English-only line shows its official English and the note *Published in English only*. Search matches all three wordings and reports which one it matched.

Four rules keep the merged screen honest:

1. **The syllabus is the primary content.** No question counts, examination marks, scores or predictions sit beside it — the only figures are the reader's own progress — and every derived study unit is marked `derived` wherever it appears.
2. **Only the commission's lines are shown.** Nothing the reader wrote is mixed into the tree, the counts or the search results, so the progress figure describes one thing: the official syllabus. The `syllabus` store and the plan fields on `syllabus_progress` are untouched on disk and still round-trip through a backup — the interface simply stopped reading them.
3. **The official tree is read-only data.** Progress is a display relationship resolved at render time by `js/services/syllabus-hub.js`; nothing is written into the shipped model or into the renderings file, and the two stores (`syllabus`, `syllabus_progress`) stay separate on disk.
4. **One vocabulary, which never over-claims.** `not_started · in_progress · completed · revised`. Rows an older build stored as `revising` — a status that sat *before* `completed` in the old planner's own ordering — are read as `in_progress`, not as the official `revised` that counts as done, because reading them as done would mark lines complete on the reader's behalf. An unknown status is refused, never stored as "not started".

Clearing a status — or resetting all official progress — never deletes a target date, priority or note an older build stored on the same row. Style tokens only: the rules live in `css/app.css` under "Syllabus", with a `≤860px` layout that turns the rail into a horizontal scroller and gives every control a 44px target, and forced-colours rules that redraw the marks and bars in system colours.

## 6a. The Insights section

`js/ui/views/analytics.js` is a shell with two panels: **My performance** (its own body) and **The question bank** (`renderBankPanel` / `mountBankPanel`, exported by `js/ui/views/pyq-analysis.js`). These were two screens that read as one idea in the menu but are not duplicates — one is derived from stored attempts, the other is pure counting over the question index.

The tab boundary is exactly that data-source boundary, and it is the rule that keeps the merge from becoming a pile of cards: **the bank panel never shows performance, and the performance panel never counts the bank as though it were the examination.** `tests/section-merge.test.js` asserts both directions. The shell owns the single `<h1>`; a panel that claimed its own would leave the screen with two, so each panel starts at `<h2>`.

Above the tabs the shell states the three numbers the two tabs are most often confused for — *questions available*, *unique questions attempted*, *total attempts* — once, in a shared tile strip with a caption naming the difference. They are section-level facts rather than either tab's findings, so neither panel repeats them: the performance panel starts at first-attempt accuracy. The strip is omitted entirely when no bank is stored, because three zeroes state nothing.

**Every verdict row carries the action it implies.** In *Where the evidence points* each row — weak, strong or too thin — ends in the same *Practise* link, because keeping a strong topic and gathering evidence on a thin one are the same next move as practising a weak one; *Coverage gaps* keeps its Practise links, and the subject and topic names in both tables are deep links into the builder with that subject or topic already ticked (`topicPracticeHref()` in `js/core/util.js`, the one helper every practice link in the app uses). The verdict itself is unchanged: it still needs sample size behind it, and the table still prints that sample beside the figure.

**The question bank panel** is laid out for a full bank (1,200 questions, 12 papers): four tiles (questions, subjects, topics, answer keys); *Questions per subject* — one `barChart` with a sort switch and the subject × year matrix behind ⓘ *Year by year*; *Questions per topic* — subject chips (question counts), a `barChart` of that subject's topics (the 15 largest across all subjects, with *Show all*), and a short table of the same rows (count, share, how many of the stored papers hold the topic, practice link) with its own year-by-year matrix behind ⓘ; and one ⓘ *About these counts*. No open table has more than six columns, and nothing on the panel is a banner, a provenance chip or a per-paper complete/incomplete label. **Its numbers are the Question Bank screen's**: groups use the same keys as that screen's filters (`subject || 'Unclassified'`, `topic || 'Unclassified'`), so filtering its Questions tab by a subject or topic lists exactly the questions counted; topics are counted as named topics plus, separately, each subject's *Unclassified* group, so the tile, the card line and *Show all* add up. `tests/ui-improvements.test.js` compares the two screens subject by subject.

The open tab is part of the section's state: a navigation opens the tab its route names (`#/pyq-analysis` → the bank panel), and an in-place refresh from inside a panel — a chip, the topic search — keeps the reader on the tab they chose.

Both sections keep the routes they replaced (`#/syllabus-analysis/<node-id>`, `#/pyq-analysis/<Subject>`) registered to the merged view, because the curated PYQ chips and any reader's bookmarks still use them. `js/ui/views/syllabus-analysis.js` and the default export of `js/ui/views/pyq-analysis.js` exist for exactly that, and `tools/check.mjs` still requires a view file per registered route.

## 6b. Question Bank bulk actions

The Questions tab of `js/ui/views/bank.js` has a selection column: a checkbox per row (named *Select question Q12 (id)*) and a select-all box in the header for the rows on screen, which shows a mixed state for a partial page. The selection is a set of ids in the view's state, so it survives paging and filtering; the bar above the table says how many are selected and how many of those are off the current page, and the selection is pruned when questions are deleted. Ticking boxes only updates the page in place (no refresh). The bar keeps a fixed footprint, so the first tick enables its buttons instead of pushing rows under the pointer.

- **Change subject/topic…** opens a dialog that is its own confirmation: how many questions, what they carry now, blank fields keep each question's own value, and *Apply* refuses an empty form inline. It calls `questions.updateClassifications()`, which runs the single-question `updateClassification()` on each question — same existence check, correction entry and preserved imported labels — and skips questions that already carry the labels. The change can be undone from a notice above the list (after a confirmation): `restoreClassifications()` puts back exactly what each question had, including "no label" and the edit marker that decides whether a bank update may refresh its labels, and leaves alone any question changed again since.
- **Delete…** lists the questions in a confirmation and says it cannot be undone (questions of the bundled bank come back by reloading it). It calls `questions.deleteQuestions()`, the one delete path the question editor and the duplicate review now share; it reports ids that were already gone and tells the shell, so the bank pill updates.
- After either action the selection is cleared and focus is parked on the select-all box before the refresh, so the router returns the reader to the list.

## 6c. Test runner: legend, palette, submission

The runner is one screen with three areas that each answer a different question: the **question**
(what am I being asked?), the **palette** (where am I, and what is left?) and the **scoring card**
(what will this be worth?). None of them is a destination; the URL is `#/runner/<testId>` and the
report is a sibling route.

**Answering patches, it does not repaint.** `selectOption()`, `toggleFlag()`, `clearResponse()` and
`setConfidence()` write through `tests.updateResponse()` and then call `afterAnswerChange()`, which
patches `aria-pressed`, the flag label, the cleared/disabled state and the confidence line onto the
controls that already exist (`syncCardControls()`). Only a revealed answer — which brings an
explanation that was not in the DOM — repaints the question card (`paintCard()`), and only a
language switch, focus mode or pause/resume calls `paintAll()`. The node the reader just pressed
stays the node they are holding, so focus, scroll and reading position do not move; `paintPalette()`
patches the cells and every counter that mirrors them (`12/20 answered · 3 flagged`).

**The palette** carries a filter bar — All · Unanswered · Flagged · Answered, each with its own live
count (`data-action="palette-filter"`, `aria-pressed`) — which hides cells in place rather than
rebuilding the grid, and two jumps: `]` for the next unanswered question, `[` for the next flagged
one (`jumpTo()` never changes anything but the current index). A hidden filter cell keeps its
`aria-label`, so a screen reader hears the same state the reader sees. At ≤1040px the palette becomes
a bottom sheet opened from a sticky bar that shows the same progress and the answered/unanswered
split; `body.palette-open` is the only state that scrolls the page.

**Submission is a decision sheet**, not a yes/no dialog: answered / unanswered / flagged / missing
confidence rows, the scoring rules that will be applied, and then *Keep working* · *Submit and see
results* · *Go to first unanswered* (or *Go to first flagged*). The last one navigates to the
question instead of asking the reader to find it. Auto-submit at expiry keeps its own path and says
so in the report. Nothing that was decided here is decided again in the report.

**The shortcut legend** is the **?** button at the end of the runner header (`data-action="kbd-legend"`,
`aria-expanded`, `aria-controls="runnerKbdLegend"`). It is a non-modal popover listing exactly the
keys the screen answers to — 1–9, → / N, ← / P, ] , [ , F, U, C (when confidence is on), D, ?, Ctrl/⌘ K, Esc —
built from the same confidence/language state as the screen, so it cannot advertise a key that does
nothing. It opens without taking focus (nothing scrolls), traps nothing, closes on Escape (returning
focus to the button only if focus was inside it), on its ✕ (there is no Escape key on a phone) and
on a click elsewhere, and survives the runner's repaints. Shortcuts ignore Ctrl/⌘/Alt combinations,
so browser shortcuts (Ctrl+P, Ctrl+F, ⌘C…) are never swallowed. The palette marks state by shape as
well as colour — a bar under an answered number, ⚑ on a flagged one, a ring and `aria-current="step"`
on the current one — and its legend names every state, including the current question.

## 6d. Practice (Topic & Custom Practice)

`js/ui/views/topic.js` is the one configuration surface for “what do I want to practise”. Topic
Practice and the Custom Test builder were the same screen twice — one bank, the same filters, the
same three strategies, the same session form — so the single-topic case is now just the narrowest
selection the screen can make. It is `#/topic`; `#/custom` and anything under it are `router.alias`es
to it, and `NAV_ALIASES` keeps the navigation item highlighted on the old address. The screen's
heading is **Practice**; the navigation item keeps its longer name because it sits beside *Smart
Practice*.

**Two panes, one decision.** The left pane is the picker: a search field (`/` focuses it), subject
rows with a **tri-state** subject checkbox (checked = every topic in it, indeterminate = some of
them) and a caret that opens the topic list, and an *Add all N matching* action on the search result.
The right pane is **your session** (`#sessionPanel`), sticky on a wide screen and a drawer on a
phone: basket chips (each removable), the live pool count, size presets 10 / 20 / 40 / All, the
strategy and the shuffle toggle, the feedback choice, the advanced form and **Start N questions**.

**Selection is a union** — `Map<subject, { all, topics: Set }>` — so a topic can never stay selected
under a subject that is not selected (which produced “0 questions match” behind a full-looking form),
and every count is counted **inside its own subject**. Changing a tick calls `paintPicker()`, which
patches the picker's rows, the basket and the count *in place*: no router refresh, no lost scroll
position, no lost open group. A picker paint that arrives after the reader has navigated away bails
out instead of refreshing whatever replaced it.

**Strategy ≠ order.** The **strategy** decides *which* questions are picked; **shuffle question
order** decides how the picked questions are *arranged*. Off means paper order —
`arrangeForPaper()` in `js/services/select.js`: year, then paper, then the paper's stored question
order, then question number — and the test's `order_source` records which of the two actually
happened (`paper_order` / `shuffled`), so the report can never claim an order the session did not
use.

**There is no confirmation dialog.** The session panel is the confirmation: it states the size, the
recording kind (a single subject with at most one topic is a `topic` session; anything wider is a
`custom` set), the feedback timing, the clock, the marks and the order, and it updates as the reader
changes them. *Start* starts exactly what it says. The shared session form (`configFields()` in
`shared.js`) is mounted with `screen: 'topic'`, so a re-render keeps the size, feedback timing, time
limit and open disclosures the reader set. Confidence, answer-key policy and unresolved-key policy
are the frozen rules in `FIXED_TEST_RULES`, stated in one line (`FIXED_RULES_NOTE`), never offered as
controls.

## 6e. Screen anatomy, card anatomy and the density budget

Every one of the eleven destinations is built to the same three-part contract, and it is machine-checked rather than remembered:

| Part | Built by | Rule |
| :--- | :--- | :--- |
| `.screen-head` | `screenHead()` in `js/ui/components.js` | Exactly one `<h1>`, one `.screen-purpose` line (72ch measure), one primary action and any secondaries. No screen repeats its title inside a card. |
| `.screen-tabs` | `screenTabs()` | Optional, sticky under the header. Screens with tabs (Insights, Question Bank, Settings) put their tab list here. |
| `.card` | `card()` | `.card-head` = one heading (`<h2>`), optional `countChip()`, at most one `cardInfo()` ⓘ, at most one action. Body, then an optional footer. |

**Density budget.** `js/ui/budget.js` is the single definition of the limits; `tools/check.mjs` enforces them on the *rendered* screens (it boots the app in jsdom once and measures all eleven), and `tests/screen-anatomy.test.js` re-asserts them.

| Limit | Value | Why |
| :--- | :--- | :--- |
| Cards per screen | 8 | More than eight sections on one screen is a pile, not a page. Screens with tabs are measured on the visible panel only. |
| Words per card | 250 | Excludes table text: a table's volume is governed by its own paging rule. This is what turned the Mistake Book's 2,332-word card and the bank's 320-word "Filters" card into short surfaces. |
| Disclosures per screen | 3 | A screen may hide methodology, not content. |
| ⓘ toggles per screen | 2 | One for "how this is worked out", at most one more for a screen-specific definition. |
| Interactive controls outside a table | 60 | Row controls in a table, a syllabus tree row or a practice-picker row belong to the row, exactly as a table cell's do; a wall of controls above the rows does not. |
| Rows before "Show all" | 12 | Capped lists state how many are hidden and offer one control to show the rest. |

Measurement definitions live in the same file, including what counts as "visible": tab panels that are `hidden`, collapsed `<details>` and `[hidden]` subtrees are not measured, because a screen is judged on what the reader is looking at. If a limit genuinely cannot be met without removing behaviour, raise it in `js/ui/budget.js` with a comment, list it in the pull request, and update this table.

**Today anatomy.** `js/ui/views/dashboard.js` is a launcher, not a report: `.screen-head` (title
*Today*, one primary action, *Quick session…* and *Build a session* beside it), then the **start
deck** (`.start-deck` → `.start-row`), then a four-figure `.stat-strip` (questions attempted,
first-attempt accuracy, due revision, syllabus done), then two cards — *Needs attention* (ranked
topics with an evidence meter and a Practise button) and *Recent sittings*. Each deck row is one
stored fact and one action: a label, a detail line that names the numbers (unanswered count, saved
when, sample size), the count beside the button, and the verb (`Start`, `Start paper`, `Revise now`,
`Retry`, `Resume`). The rows come from `js/services/nextup.js`; a row with nothing behind it is
disabled and says why rather than disappearing. Resume is a real route link (`#/runner/<id>`), so it
can be opened in a new tab. The deck's options are captured at render time — never rebuilt inside a
click handler — because they describe the data as it was when the reader saw them. There are no
charts, no nested cards and no repeated metrics; a bank-less device gets the welcome card instead.

**Row detail panels.** A table row may carry its own panel (`dataTable({ rows: [{ cells, detail,
detailId, detailHidden }] })`), rendered as a second `<tr class="row-detail-row">` with one
`colspan` cell. It is where a question review or a paper's details open *inside* the list, so the
reader keeps their filters and their scroll position instead of handing the screen to a dialog.

**The review panel** (`js/ui/reviewpanel.js`) is the one place a question is looked at again:
verdict line (outcome, what you answered, the key, time, confidence), the question with both the key
and your own answer marked in words, the bank's explanation, every previous attempt, then whatever
the calling screen adds (why the item is in the Mistake Book; how it was scheduled). `loadReview()`
returns the same facts for a row preview; `reviewBodyMarkup()` renders it for an inline panel;
`openReviewPanel()` opens it as a modal where a screen has no row to expand. The Mistake Book and the
Revision Centre both expand it in the row; the test report opens it as a modal from a question.

**Report anatomy.** `js/ui/views/report.js` is ordered by “what next”: *How this sitting went* (four
figures and the rules that produced them, behind one disclosure), *Do something about it* (rows with
real buttons — retry the incorrect set, practise the weak topics from this sitting, revise what is
due from it, review the flagged set), *Weakest topics in this sitting* (per-topic Practise), *Question
review* (the filterable list, first class rather than a tab) and *The details* (confidence, pacing,
recommendations, repeated mistakes, unresolved keys). Every action states its count before it is
pressed, and every one creates a real test rather than a link to a screen that could.

**Compact density.** `:root[data-density="compact"]` changes `--pad-card`, `--pad-card-head`, `--pad-cell-y/x`, `--gap-grid`, `--lh-base`, `--lh-reading` and `--card-gap`; every screen picks the change up because cards, tables and type are expressed in those tokens rather than in per-component numbers.

## 7. Automated UI Guards (`tools/check.mjs` & `tests/ui.test.js`)

### Static Guards (`tools/check.mjs` / `npm run check` / `npm run audit:ui`)
- **`[hidden]` first-rule guard**: Verifies `[hidden] { display: none !important; }` is present and is the very first selector in `css/app.css`.
- **Toast click-through guard**: Verifies `#toastStack { pointer-events: none }` and `#toastStack > * { pointer-events: auto }`.
- **Token-only colour guard**: Strips `:root` / `data-theme` / `prefers-color-scheme` / `forced-colors` token blocks and verifies **zero** `#hex`, `rgb()`, or `hsl()` colour literals appear anywhere else in `css/app.css`.
- **WCAG 2.1 contrast audit**: Parses both Light and Dark token maps from `css/app.css` (resolving `var(--token)` aliases such as `--track`) and computes relative luminance contrast ratios across **40 text/surface token pairs** (requiring `≥ 4.5:1`) and **14 non-text pairs** — borders and focus ring against every surface, and every data colour against `--track` — (requiring `≥ 3.0:1`) per theme (108 contrast assertions in total).
- **Motion guard**: Every `animation:` declaration must sit inside `@media (prefers-reduced-motion: no-preference)` (except `animation: none`), and no literal transition may exceed `150ms`.
- **Zero inline style guard**: Scans every file in `js/**` and fails if any `style="..."` attribute is present.
- **Density-budget guard**: Imports `js/ui/budget.js`, asserts the five limits are unchanged (raising one requires editing this file and the pull request), then boots the real app in jsdom with a demonstration bank and a little recorded activity and measures all eleven screens: cards, longest card's words, disclosures, ⓘ toggles, controls outside a table, exactly one `<h1>`, and no skipped heading levels. A breach fails `npm run check`.
- **Theme & media query guards**: Verifies `html[data-theme="light"]`, `html[data-theme="dark"]`, `@media (prefers-reduced-motion: reduce)`, `@media (forced-colors: active)`, `@media print`, and the pre-paint theme bootstrap script in `index.html`.

### Runtime / JSDOM Guards (`tests/ui.test.js` / `npm test`)
- `tests/screen-anatomy.test.js`: the anatomy contract on all eleven screens (one `<h1>` inside `.screen-head`, a purpose line, an action, one title row per card, no skipped levels), the density budget on the rendered screens, the token-driven card/spacing rules, compact density, the ≤560px tab bar and labelled card rows, and that the runner keeps its desktop tools.
- `tests/practice-flow.test.js`: the practice sheet from all three entry points (dashboard, header, `#/practise`), a real session with the frozen rules applied rather than offered, form memory across openings, the resume strip on every screen but the runner, and ⌘K's Go (11 destinations), Do (actions resolve) and Find (subjects, topics, syllabus lines, questions) with the keyboard alone.
- Verifies every route renders with **exactly one `<h1>`**, **no skipped heading levels**, and updates `document.title` (`<Screen> · MyMPPSC`).
- Verifies `openModal` moves focus inside the dialog, marks `#main` `inert`, wraps `Tab` and `Shift+Tab` at focus boundaries, closes on `Escape`, and restores focus to the trigger element.
- Verifies the off-canvas navigation drawer is `inert`, `aria-hidden="true"`, and `tabindex="-1"` when closed at mobile widths, opens on `#navToggle`, and closes on `#navScrim` click while restoring focus.
- Verifies WAI-ARIA APG tabs respond to `ArrowRight`, `ArrowLeft`, `Home`, and `End` with roving `tabindex` and `aria-selected`.
- Verifies `#setTheme` and `#themeToggle` update `document.documentElement.dataset.theme` and `<meta name="theme-color">`.
- Verifies the test runner's distraction-free focus mode (`[data-action="focus-mode"]`), keyboard shortcut bar (`.kbd-bar`), `aria-keyshortcuts`, Hindi `lang="hi"` tagging, sequential question palette, and that the dashboard carries no provenance chips.
- `tests/practice-screen.test.js`: the merged practice screen against the bundled 1,200-question bank — nothing ticked means the whole bank with every group collapsed; the tri-state subject checkbox over its own topics; union selection across subjects, with a topic never outliving its subject (B1); counts belonging to their own subject (B2); deep links applied once per arrival and an unknown subject ignored; `#/custom`, `#/custom/…`, `#/pyq-analysis` and `#/syllabus-analysis` highlighting the right navigation item (B8); every practice link in the app built by the one shared helper (B10); paper order with shuffling off and a truthful `order_source` (B3); the session form surviving an in-place re-render (B4); expanding a group without re-rendering; the *Narrow further* filters and their summary count; and the three frozen rules reaching a session started from the screen.
- `tests/ui-improvements.test.js`: skeleton markup (one hidden status line, decorative blocks, nothing focusable) and the router's skeleton/fallback painting; listener lifetime through `ctx.signal`; the shortcut legend (lists exactly the handled keys, Escape/✕/outside click close it, focus never trapped or moved on open, modifier combinations ignored); Question Bank selection, bulk change with undo and bulk delete, with focus kept in the list; Insights keeping its tab on refresh; the bank panel's numbers against the Question Bank screen; and regressions — evidence-meter classes, the Revision Centre's stray `}`, a malformed route parameter being decoded rather than thrown (B5), a refresh keeping the DOM on screen with the newest render winning (B6), and the phone header's one-row rules and icon-only Quick practice button (B11).
- `tests/bulk-questions.test.js`: the bulk services — per-question corrections, skipped no-ops, exact undo (including nulls and the edit marker), undo never overwriting newer edits, and the shared delete path.
