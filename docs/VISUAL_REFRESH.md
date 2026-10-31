# Study Desk — visual refresh report

Date: 2026-10-31 · Service-worker cache `v1.9.1-visual-refresh`

This is a presentation-layer redesign of the whole MyMPPSC app. The question bank, syllabus content, scoring, attempts, progress, revision records, mistake book, imports/exports, backups, IndexedDB stores, routing and offline/PWA behaviour were preserved. The only behavioural fixes were presentation-adjacent: accessible theme-toggle labels, canonical `body[data-route]` for screen styling, local font loading, and two missing modules added to the service-worker precache so offline reloads keep working.

## What changed

- **Shell / top bar.** Rebuilt as a balanced responsive grid: brand, centred command/search trigger, quick practice, theme and help. The old cropped/asymmetrical bar is gone. A full-width resume strip appears only when a test is unfinished. Desktop minimum height is 76px; compact headers use 64px. JavaScript still measures the actual height into `--header-h`, while CSS uses a separate `--header-base-h` to avoid resume-strip height feedback.
- **Navigation.** Grouped Study / Review / Plan / Manage destinations with route-coloured icons, a collapsible desktop rail, mobile drawer and phone tab bar. Active state is colour + weight + inset outline, not colour alone.
- **Dashboard.** A calm hero with inline study artwork and the real unfinished-test CTA, six real metric tiles, a shortcut deck, a vertical focus list and a local-data note. No invented streaks, study time, forecasts or progress.
- **Runner.** Larger bilingual question/option typography, a visible sticky desktop question index, restored mobile palette drawer, focus mode, confidence row and keyboard hints. Hindi uses bundled Noto Sans Devanagari with zero letter-spacing and taller leading.
- **Screen identities.** Papers, Practice, Smart, Mistakes, Revision, Syllabus, Insights, Bank, Settings, Help and Report share the same component kit but have distinct eyebrows, accents and layout emphasis rather than one repeated template.
- **Themes.** Light and dark are separately tuned surface sets. Light: cool paper `#f3f6f7`, white surfaces, ink `#1d333b`, teal accent `#067565`. Dark: deep blue-green `#111d26`, elevated `#192933`, text `#edf4f5`, mint accent `#75d8c4`. Semantic violet/coral/info/amber tones distinguish routes and states.
- **Typography.** Local variable Inter (body), Manrope (display) and Noto Sans Devanagari (Hindi), all precached for offline use. Licences are beside the fonts.
- **Accessibility / safety.** Contrast-audited tokens, visible focus rings, non-colour state cues, reduced-motion, forced-colors and print overrides. Toasts remain click-through; dialogs/drawers keep focus behaviour.

## Current core tokens

| Token | Light | Dark |
| :--- | :--- | :--- |
| `--bg` | `#f3f6f7` | `#111d26` |
| `--bg-elevated` | `#ffffff` | `#192933` |
| `--bg-sunken` | `#e9eef0` | `#0e1921` |
| `--text` | `#1d333b` | `#edf4f5` |
| `--text-soft` | `#58707b` | tuned dark soft text |
| `--accent` / `--ink` | `#067565` | `#75d8c4` |
| `--border-subtle` / `--track` | light hairline / track | `#314651` |
| Browser chrome | `#ffffff` | `#14232d` |

The authoritative values live in the final `STUDY DESK — visual refresh` layer of `css/app.css`. `manifest.webmanifest` now uses the same teal accent (`#067565`).

## Offline / PWA fix

The browser audit found that `js/services/nextup.js` and `js/ui/reviewpanel.js` were not in the service-worker shell precache, so an offline reload could fail after the dashboard/report tried to import them. Both are now precached, the cache version was bumped to `v1.9.1-visual-refresh`, and the offline reload check passes with the local bank still available.

## Verification

- `npm run check` — **1,075 checks passed** (structure, tokens, contrast, density, relative assets, service-worker precache).
- `npm test` — **316 tests passed, 0 failed**.
- `node tools/visual-audit.mjs` — **193 browser checks passed**, no browser errors. Covers 11 main routes at 320/390/768/1024/1440px, header bounds, horizontal overflow, local font loading, light/dark/system theme, command palette, quick practice, runner answer/flag/persistence/focus/pause/mobile palette/submit, mobile drawer and offline reload.
- `node tools/capture-visual.mjs` — recaptured **36 refreshed views** with a deterministic disposable profile; no browser errors.

The optional browser tools need `playwright-core` and a Chromium binary:

```bash
npm install --no-save playwright-core
# Either install a browser for Playwright, or point at an existing Chromium:
# VISUAL_BROWSER_EXECUTABLE=/path/to/chromium npm run audit:visual
npm run audit:visual
npm run capture:visual
```

## Screenshots

Before/after captures and a short gallery are in [`visual-refresh/README.md`](visual-refresh/README.md). They use a seeded local profile for comparable density; the figures are illustrative fixture data, not a real reader’s progress.
