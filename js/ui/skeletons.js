/**
 * skeletons.js — loading placeholders for the heavier screens.
 *
 * While a screen's render() reads IndexedDB, the router shows that view's
 * `skeleton(ctx)` instead of a line of "Loading…" text (see router.js). Each
 * layout below mirrors the screen it stands in for — the same title block,
 * tile row, tab bar and card stack, using the real layout classes — so the
 * page keeps its shape when the content arrives instead of collapsing to a
 * one-line box and growing back.
 *
 * Every block comes from the primitives in components.js: token colours,
 * aria-hidden, one visually hidden status sentence, and a pulse that runs only
 * when the OS allows motion. These functions must stay synchronous and cheap —
 * they run before any data is available.
 */

import { skeletonScreen, skeleton as sk } from './components.js';

/** Dashboard: hero, the "Today" panel, four metric cards, then two columns. */
export function dashboardSkeleton({ hasBank = true } = {}) {
  if (!hasBank) {
    // An empty device gets the short welcome card, not a full dashboard.
    return skeletonScreen([sk.heading({ lede: false }), sk.card(`${sk.lines(4)}${sk.buttons(3)}`)]);
  }
  return skeletonScreen([
    '<div class="skeleton-hero"><span class="skeleton-line sk-w40"></span><span class="skeleton-block skeleton-title"></span><span class="skeleton-line sk-w65"></span></div>',
    sk.card(sk.tiles(3, { className: 'today-grid' })),
    sk.tiles(4, { className: 'metrics-grid' }),
    `<div class="split-2">${sk.card(sk.table(5, 3))}${sk.card(sk.lines(3))}</div>`,
  ]);
}

/**
 * Insights: the section heading, its three-number strip and tab bar, then the
 * panel that is about to open — performance tables, or the bank panel's
 * summary, subject chart and topic breakdown.
 */
export function insightsSkeleton({ panel = 'performance' } = {}) {
  const body =
    panel === 'bank'
      ? [sk.lines(2), sk.tiles(4), sk.card(sk.chart(8)), sk.card(`${sk.buttons(5)}${sk.chart(6)}${sk.table(4, 4)}`)]
      : [sk.lines(1), sk.tiles(3), sk.card(sk.table(6, 6)), sk.card(sk.table(6, 6))];
  return skeletonScreen([sk.heading(), sk.tiles(3), sk.tabs(2), ...body]);
}

/** Revision Centre: four counters, the "revise now" card and the queue table. */
export function revisionSkeleton() {
  return skeletonScreen([sk.heading(), sk.tiles(4), sk.card(sk.buttons(2)), sk.card(`${sk.fields(3)}${sk.table(6, 4)}`)]);
}

/** Question Bank: heading, five tabs, then the tab the reader last had open. */
export function bankSkeleton({ tab = 'import' } = {}) {
  const byTab = {
    questions: [sk.card(sk.fields(6)), sk.card(`<span class="skeleton-block skeleton-toolbar"></span>${sk.table(8, 4, { check: true })}`)],
    integrity: [sk.tiles(5), sk.card(sk.table(6, 5))],
    duplicates: [sk.card(sk.table(4, 2)), sk.card(sk.table(4, 4))],
    history: [sk.card(sk.table(5, 6)), sk.card(sk.table(4, 2))],
    import: [sk.card(`${sk.lines(3)}${sk.table(1, 4)}${sk.buttons(2)}`), sk.card(`${sk.lines(2)}${sk.buttons(3)}`)],
  };
  return skeletonScreen([sk.heading(), sk.tabs(5), ...(byTab[tab] || byTab.import)]);
}
