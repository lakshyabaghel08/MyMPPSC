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

/**
 * Today: the start deck (head row + one row per startable thing), the
 * four-figure strip, then the attention and recent cards side by side. The
 * blocks use the real classes, so the deck does not collapse to a card on the
 * way in.
 */
export function dashboardSkeleton({ hasBank = true } = {}) {
  if (!hasBank) {
    // An empty device gets the short welcome card, not a full dashboard.
    return skeletonScreen([sk.heading({ lede: false }), sk.card(`${sk.lines(4)}${sk.buttons(3)}`)]);
  }
  const deckRows = Array.from({ length: 4 }, () => '<li class="start-row"><span class="skeleton-block skeleton-line"></span><span class="skeleton-block skeleton-line sk-w40"></span></li>').join('');
  return skeletonScreen([
    sk.heading(),
    `<section class="start-deck"><div class="start-deck-head"><span class="skeleton-block skeleton-line sk-w40"></span></div><ul class="start-rows">${deckRows}</ul></section>`,
    sk.tiles(4),
    `<div class="split-2">${sk.card(sk.table(4, 3))}${sk.card(sk.lines(3))}</div>`,
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
