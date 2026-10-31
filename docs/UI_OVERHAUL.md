# UI/UX overhaul — implementation report

Date: 2026-10-31 · App version 1.1.0 · Service-worker cache `v1.5.0-1`

This was a full interface pass over MyMPPSC: a new design system, a rebuilt shell, and a screen-by-screen reduction of visual noise. The question bank, papers, tests, scoring, attempts, bookmarks, mistakes, revision schedule, syllabus marks, imports, backups, IndexedDB stores, routing and offline behaviour were **not modified**. Only the presentation layer changed.

---

## 1. Design direction

**"Ink & paper."** Warm paper surfaces, one restrained ink-blue signal, and near-black primary actions. Hierarchy comes from type, space and a single hairline — not from stacked cards, gradients, glass, coloured tiles or icon rows.

- One `<h1>` per screen, one obvious primary action, one purpose line.
- Prose that explains the interface is either one short line or behind a disclosure.
- A card is a section, not a container inside a container. No card nests a card.
- Charts are only used where a chart beats a sentence; the dashboard has none.
- Light and dark are separately designed surface sets, not inversions.
- Motion is feedback only (≤ 140ms); the one looping animation is the skeleton pulse under `prefers-reduced-motion: no-preference`.

## 2. Design system (built before pages)

- **Fonts:** Inter Variable bundled locally (`fonts/inter-variable.woff2`, OFL) with platform and Noto Sans Devanagari fallbacks. No network request; identical offline.
- **Type scale:** four steps — display 2rem, title 1.5rem, body 0.9375rem, caption 0.8125rem — with dedicated Devanagari leading tokens. Question stems stay at 17px / 1.65; Hindi at 1.82 so matras never clip.
- **Palette:** warm paper `#f7f6f2` (light) / `#131413` (dark); elevated white / `#1a1b19`; one accent `#33518c` / `#9db6e6`; semantic ok/warn/bad/info tones. Primary buttons use `--ink` (`#1f221e` / `#edede7`) so colour stays a signal. Every pair is contrast-audited by `tools/check.mjs`.
- **Shape:** 4/6/8/12/16px radii; cards at 12px, inputs at 8px; pill only for status marks. Elevation is barely-there; cards are flat with a hairline border.
- **Sharing:** `.stat-strip` / `.stat` (flat figures), `.list-rows` / `.list-row-item` (compact rows), `.tabs` (quiet segmented strip), `.seg` (pressed state via inset outline), `.disclosure` (hairline disclosure), `.crumbs`, `.paper-cell`, `.card-section-title`, `.stats-inline`.
- **Removed:** dead legacy layers (dashboard hero, today panel, metric grid, old syllabus tree, score hero, HTML bar chart) and stale duplicate declarations.

## 3. Shell and navigation

- Header: menu toggle (≤860px), wordmark, command trigger (`⌘K`/`Ctrl K`), Quick practice, theme, Help, and the resume strip when a test is unfinished.
- Sidebar groups: **Study** (Dashboard, PYQ Test Centre, Topic & Custom Practice, Smart Practice), **Review** (Mistake Book, Revision Centre), **Plan** (Syllabus, Insights), **Manage** (Question Bank & Imports, Settings & Backup, Help).
- Desktop rail: `#navCollapse` shrinks to 64px, labels keep `aria-label`/`title`, and the choice persists in `localStorage['mymppsc.navCollapsed']`.
- Mobile: the same list is an off-canvas drawer with scrim, inert `#main`, focus restore; ≤560px a five-item tab bar plus **More**.
- Nested pages (runner, report) carry a breadcrumb; everything else is one level deep.
- Command palette remains the fast path for Go / Do / Find and does not replace navigation.
- Local storage/offline state moved into a quiet **Local data** disclosure at the foot of the nav.

## 4. Screens

| Screen | What changed |
| :--- | :--- |
| **Dashboard** | Complete rewrite. Head + primary *Practise now* → one `.next-up` block (resume an unfinished test, or start; due-revision aside) → four-figure stat strip (attempted of total, first-attempt accuracy, revision due, syllabus done) → two-column *Recommended next* (evidence meters) and *Recent sessions* → one integrity line. No charts, no metric-card wall, no duplicate counts. |
| **PYQ Test Centre** | Paper table reduced from seven columns to four (paper · questions · your best · action); duration, scoring, metadata and flags live in the row's Details panel. Sessions in progress stay pinned above. |
| **Topic & Custom Practice** | Kept as the tri-state subject/topic picker; hierarchy clarified with a live match count in the head and one session card. No capability removed. |
| **Smart Practice** | Three metric cards collapsed into one plan table + one line of counts; inclusion rules and weak-topic evidence moved into disclosures; start button states the session size. |
| **Mistake Book** | Three cards → one item list. Filters are a closed disclosure with an active-filter count; topic roll-up is a disclosure inside the list; counts moved into the purpose line. |
| **Revision Centre** | Four tiles, an effectiveness card and two statistics cards replaced by one queue and one **Schedule health** card (flat stats + progress + upcoming load in a disclosure). Queue paging and per-item actions unchanged. |
| **Insights** | Section strip and panel strip now flat `.stat-strip` figures. Nine performance cards reduced to six: Subjects, Topics, Evidence, Coverage gaps, How you answer (confidence + pace, slowest answers disclosed), Signals (mistakes + revision side by side). Unique attempted / total attempts / first-attempt accuracy remain explicitly separated and named. |
| **Syllabus** | Removed the gradient intro and ornamental shadows; the stage switch, rail, status marks and detail panel now use the same ink-and-paper surfaces. Behaviour and data untouched. |
| **Question Bank** | Existing five-tab structure kept; surfaces, tabs, tables, forms, notices and modals inherit the new system. No logic changes. |
| **Settings & Backup** | Scoring and repeat behaviour merged into one **Practice defaults** card; backup, restore, storage, diagnostics and destructive actions unchanged. |
| **Help** | Numbers glossary and provenance vocabulary merged into one card with a disclosure; six cards instead of seven, same content. |
| **Runner** | Bar trimmed to timer, save state, focus, pause, submit and shortcuts; Print moved into the palette card. Breadcrumb added; options, palette, flags, confidence and submission flow unchanged. |
| **Report** | Breadcrumb added; Overview now leads with outcome counts and weakest topics, then timing, then the scoring-rules explanation. Review, confidence and next-step panels unchanged. |
| **Skeletons** | Dashboard skeleton mirrors the new layout (next-up card, stat strip, two columns); tab-resistant skeleton dense charts remain for Insights. |

## 5. Responsive, accessibility and micro-UX

- Breakpoints: 1040 (split grids), 860 (drawer/off-canvas and labelled table rows), 640 (command trigger), 560 (phone header, tab bar, runner options 56px, sticky runner nav).
- Wide `.cards-mobile` tables now become labelled record cards on **tablets as well as phones** (≤860px), so a seven-column analytics table never fights the sidebar.
- Touch targets: 44px minimum; headers 34/36px are desktop-only affordances.
- Keyboard: visible focus rings, skip link, roving tabindex on bank tabs, ⌘K palette, runner shortcuts, Esc closes modal/drawer, focus returns to the opener.
- Feedback: toasts, inline validation, skeleton loading, save-state indicator, pressed states via `aria-pressed`, and `aria-current` navigation.
- Mobile and desktop share one markup path; no horizontal overflow rules were removed and tables retain their scroll wrapper.

## 6. Files and architecture

- `css/app.css` — design-system section 13 plus shell, responsive and screen rules; dead rules deleted. 7,176 lines.
- `fonts/inter-variable.woff2`, `fonts/OFL.txt` — bundled font and licence.
- `index.html` — header, nav footer, theme-color, command/quick-start controls.
- `js/app.js` — nav groups, rail collapse/persistence, drawer, badges, palette, backup command.
- `js/ui/views/*` — dashboard, test centre, smart, mistakes, revision, analytics, settings, help, report, runner, skeletons.
- `js/core/state.js`, `js/core/constants.js` — theme-color values, app version.
- `sw.js` — cache bumped to `v1.5.0-1`; font added to the precache list.
- `docs/UI.md` — design direction, tokens, typography, navigation and dashboard anatomy updated.
- Tests updated only where the contract intentionally changed (theme-color metas, dashboard skeleton layout).

## 7. Verification

| Command | Result |
| :--- | :--- |
| `npm run check` (`node tools/check.mjs`) | **All 1,044 checks passed**; cache `v1.5.0-1`; density worst case **6 cards / 225 words / 26 controls outside tables** (limits 8 / 250 / 60) |
| `npm test` (`node --test tests/*.test.js`) | **310 tests, 310 pass, 0 fail** |
| Contrast | audited for both themes by `tools/check.mjs` (text pairs ≥ 4.5:1, non-text ≥ 3:1) |
| Static UI guards | first-rule `[hidden]`, zero inline styles, token-only colour, motion limit, toast pointer-events, heading order, one `<h1>` per screen |
| Routes | all 11 destinations plus 3 legacy aliases render, pass anatomy and density, and resolve to a single heading |

Workflow checks covered by the suite include full test lifecycle (create → answer → pause/resume → submit), palette/flag/bookmark, review filters, scoring from stored rules, mistake escalation/resolution, revision scheduling and rescheduling, import validation and undo, backup round-trip/restore, theme switching, offline shell, and persistence across reloads.

## 8. Limitations

- **No browser screenshot pass.** A Chromium download is unavailable in this environment (Playwright CDN blocked, no system browser). Responsive verification is therefore structural (jsdom, stylesheet rules, width audits), not pixel-level. The 860/560 layouts should still be eyeballed once in a real browser; the live preview runs from `npm run serve`.
- **Analytics charting** was already minimal; the subject chart remains in the bank panel because it answers a counting question, and the dashboard now has none. No new chart types were added.
- **Question Bank and Syllabus internals** were restyled through system tokens rather than restructured: their workflows are dense by nature and already tabbed/railed. Further reduction would require changing behaviour, which was out of scope.
- **Bundle/version:** `APP_VERSION` was bumped to 1.1.0; exported backup formats and database schema are unchanged, so existing data and files remain valid.
