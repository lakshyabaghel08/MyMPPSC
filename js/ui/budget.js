/**
 * budget.js — the density budget, in one place.
 *
 * Information density is the thing this interface is judged on, so the limits
 * are data rather than habit: `tools/check.mjs` trips on source that would
 * break them (a ninth `card()` in one screen's markup, a fourth disclosure), and
 * `tests/screen-anatomy.test.js` measures every rendered screen against the same
 * numbers in jsdom. One definition, two checks.
 *
 * Definitions used here, so a measurement is never ambiguous:
 *
 *  - **A card** is one `.card`. Cards are the unit of screen anatomy, not
 *    tiles, notices or tables.
 *  - **A card's words** are the words a reader sees in it, *excluding* the text
 *    inside `.table-wrap`: a table's volume is governed by its own paging rule
 *    (`TABLE_ROWS_*` below), not by the prose budget. Counting a 25-row table as
 *    prose is how a "250-word card" would either be impossible or meaningless.
 *  - **A disclosure** is one `<details>`, including the ⓘ (`info-toggle`) ones.
 *  - **Interactive elements outside a table** are `button, input, select,
 *    textarea, a[href]` that are not inside `table.data`, a tree row list
 *    (`.syl-tree`) or a selection list (`.pick-list`). A row's controls belong
 *    to the row, exactly as a table cell's do; a wall of controls above the rows
 *    does not.
 *
 * If a limit genuinely cannot be met without changing behaviour, it is raised
 * here with a comment saying why, and the raise is listed in the pull request.
 */

export const DENSITY_BUDGET = {
  /** More than this many cards on one screen is a pile, not a page. */
  cardsPerScreen: 8,
  /** Words of prose per card (table text excluded — see the note above). */
  wordsPerCard: 250,
  /** `<details>` elements per screen, the ⓘ toggles included. */
  disclosuresPerScreen: 3,
  /** ⓘ (`info-toggle`) disclosures per screen: methodology, not a decoration. */
  infoPerScreen: 2,
  /** Controls outside a table before a screen becomes a control panel. */
  interactiveOutsideTables: 60,
  /** Rows a capped list shows before "Show all". */
  tableRowsPerCard: 12,
};

/** Words in a string, whitespace-collapsed. */
export function countWords(text) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value ? value.split(' ').length : 0;
}

/**
 * Is this element on the screen the reader is looking at? Tab panels and
 * collapsed groups keep their markup in the document, so a raw count would
 * measure every tab at once and report a screen nobody ever sees. Anything
 * inside a `[hidden]` ancestor (or a closed `<details>`) is not counted.
 */
function isVisible(element) {
  let node = element;
  while (node && node.nodeType === 1) {
    if (node.hasAttribute('hidden')) return false;
    // A closed <details> hides everything but its summary.
    if (node.tagName === 'DETAILS' && !node.hasAttribute('open') && node !== element) return false;
    node = node.parentElement;
  }
  return true;
}

function textWithoutTables(element) {
  if (!element) return '';
  const clone = element.cloneNode(true);
  clone.querySelectorAll('.table-wrap, table, .sr-only').forEach((node) => node.remove());
  clone.querySelectorAll('[hidden]').forEach((node) => node.remove());
  clone.querySelectorAll('details:not([open])').forEach((node) => node.remove());
  return clone.textContent || '';
}

/**
 * Measure one rendered screen. `root` is the element that holds the screen
 * (`#view`); the functions are deliberately defensive so a view that renders
 * partly still measures.
 *
 * Returns `{ words, cards, longestCard, longestCardTitle, disclosures, info,
 * interactiveOutsideTables, tableRows, h1, headingLevels }`.
 */
export function measureScreen(root) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return {
      words: 0,
      cards: 0,
      longestCard: 0,
      longestCardTitle: '',
      disclosures: 0,
      info: 0,
      interactiveOutsideTables: 0,
      tableRows: 0,
      h1: 0,
      headingLevels: [],
    };
  }
  const cards = Array.from(root.querySelectorAll('.card')).filter(isVisible);
  let longestCard = 0;
  let longestCardTitle = '';
  for (const card of cards) {
    const words = countWords(textWithoutTables(card));
    if (words > longestCard) {
      longestCard = words;
      longestCardTitle = (card.querySelector('.card-head h2, .card-head h3, .card-head h4')?.textContent || '').trim();
    }
  }
  const interactive = Array.from(root.querySelectorAll('button, input, select, textarea, a[href]')).filter(isVisible);
  const outside = interactive.filter((element) => !element.closest('table.data, .syl-tree, .pick-list'));
  return {
    words: countWords(Array.from(root.querySelectorAll('.card')).filter(isVisible).map(textWithoutTables).join(' ')),
    cards: cards.length,
    longestCard,
    longestCardTitle,
    disclosures: Array.from(root.querySelectorAll('details')).filter(isVisible).length,
    info: Array.from(root.querySelectorAll('details.info-toggle')).filter(isVisible).length,
    interactiveOutsideTables: outside.length,
    tableRows: Array.from(root.querySelectorAll('table.data tbody tr')).filter(isVisible).length,
    h1: root.querySelectorAll('h1').length,
    headingLevels: Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(isVisible).map((heading) => Number(heading.tagName.slice(1))),
  };
}

/**
 * The budget check itself, shared by the test suite (and usable in a console).
 * Returns an array of human-readable breaches; empty means within budget.
 */
export function auditScreen(name, measured, budget = DENSITY_BUDGET) {
  const breaches = [];
  if (measured.cards > budget.cardsPerScreen) {
    breaches.push(`${name}: ${measured.cards} cards (limit ${budget.cardsPerScreen})`);
  }
  if (measured.longestCard > budget.wordsPerCard) {
    breaches.push(`${name}: card “${measured.longestCardTitle}” has ${measured.longestCard} words (limit ${budget.wordsPerCard})`);
  }
  if (measured.disclosures > budget.disclosuresPerScreen) {
    breaches.push(`${name}: ${measured.disclosures} disclosures (limit ${budget.disclosuresPerScreen})`);
  }
  if (measured.info > budget.infoPerScreen) {
    breaches.push(`${name}: ${measured.info} ⓘ toggles (limit ${budget.infoPerScreen})`);
  }
  if (measured.interactiveOutsideTables > budget.interactiveOutsideTables) {
    breaches.push(`${name}: ${measured.interactiveOutsideTables} controls outside tables (limit ${budget.interactiveOutsideTables})`);
  }
  return breaches;
}
