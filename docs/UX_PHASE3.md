# Phase 3 — The study desk

**Status:** **implemented** (steps 1–9 of §6), with §7 decided and §8 recording the result. §1–§5 are the reasoning the
implementation was held to; read them as the brief, not as a proposal.
**Branch:** `arena/9e120550-mymppsc` · **Compared against:** the Phase-2 build (316 tests, 1078 checks, cache `v1.6.0-1`)
**Companion artboards:** `docs/mockups/phase3.html` (open it in the preview: `/docs/mockups/phase3.html`)

---

## 0. What this is, and the decision being asked for

Phase 2 fixed *workflow*: fewer actions, fewer duplicate screens, no confirmation repeating a summary. It did not
fix *voice*. Measured on the real screens, the app still reads as an administration console: a heading, a paragraph
explaining the heading, four figures, six cards, badges on every row, and a footnote. The information is correct;
the composition is wrong.

Phase 3 changes the composition, not the features. Every screen gets a job, a shape and a reason to be looked at,
and the default move is **subtraction**.

The decision requested here is on **four things, in this order**: the audit (§2), the design direction (§3), the four
layouts (§4), and the implementation plan (§6). Nothing is coded until those are approved.

---

## 1. Method, and what the numbers mean

I rendered every screen in jsdom with the bundled 1,200-question bank plus one submitted and one unfinished sitting,
then measured what a reader actually gets: words on the screen, `card()` instances, badge nodes, "tiny/muted" text
nodes, `·`-joined metadata separators, interactive controls, tables and metric tiles. Reproduce with
`node tools/density.mjs` for the budget view; the raw table below came from the same boot with a wider set of
counters (script: `tools/audit-clutter.mjs`, added in the implementation phase).

| Screen | Words | Cards | Tiny nodes | Tiny words | Badges | `·` joins | Controls | Tables | Tiles | Purpose line (words) |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Today (dashboard) | 310 | 2 | 0 | 0 | 0 | 18 | 25 | 0 | 4 | 14 |
| Test Centre | 1,056 | 1 | 75 | 409 | 2 | 78 | 54 | 1 | 0 | 18 |
| Practice | 898 | 1 | 4 | 46 | 0 | 6 | 152 | 0 | 0 | 18 |
| Smart Practice | 538 | 2 | 7 | 79 | 0 | 9 | 17 | 2 | 0 | 21 |
| Runner | 290 | 2 | 6 | 37 | 0 | 9 | 38 | 0 | 0 | — |
| Report | 2,764 | 5 | 67 | 429 | 90 | 47 | 96 | 26 | 4 | — |
| Mistake Book | 550 | 1 | 58 | 165 | 17 | 22 | 75 | 2 | 0 | 16 |
| Revision Centre | 591 | 2 | 4 | 132 | 0 | 10 | 5 | 1 | 4 | 20 |
| Syllabus | 968 | 0 | 10 | 20 | 0 | 1 | 174 | 0 | 0 | 25 |
| Insights | 2,938 | 10 | 478 | 916 | 90 | 24 | 149 | 13 | 10 | 30 |
| Question Bank | 1,623 | 12 | 206 | 650 | 22 | 32 | 146 | 9 | 5 | 25 |
| Settings | 1,022 | 9 | 9 | 195 | 0 | 0 | 45 | 3 | 4 | 19 |
| Help | 978 | 6 | 0 | 0 | 3 | 0 | 26 | 2 | 0 | 17 |
| **Total** | **14,526** | **53** | **924** | **3,078** | **224** | **256** | **1,002** | **59** | **31** | **20 avg** |

Four readings of that table:

1. **A fifth of all the text is small print.** 3,078 words sit in `tiny`/`muted`/`soft` nodes across 13 screens —
   the layer that explains, disclaims and footnotes. It is the layer a reader learns to skip, and it is where most of
   the "information-heavy" feeling comes from.
2. **224 badges and 256 `·` joins.** A middot join is a sentence pretending to be a label: `History · Ancient India ·
   paper Q14 · last answered wrong, 6 days ago`. When every row has one, none of them is read.
3. **59 tables and 31 metric tiles.** Tables are right for data (a bank of 1,234 questions). They are wrong for
   people-work: a queue of 12 questions to revise, a list of 15 mistakes, three actions after a test. Insights alone
   has 13 tables and 10 tiles for one reader's data.
4. **Purpose lines average 20 words** (range 14–30) and sit under every `<h1>`, in the same position, in the same
   voice — the strongest single signal of a generated dashboard.

---

## 2. Screen-by-screen audit

Classes: **E** essential at a glance · **C** contextual (shown when it is relevant) · **S** secondary (one expansion
or a detail view away) · **U** unnecessary (delete). "Keep" means keep as it is; "move" means keep the information,
change where it lives.

### 2.1 Today (`#/dashboard`) — 310 words, 4 tiles, 18 joins

| Element | Class | Decision |
| :--- | :--- | :--- |
| Greeting + stored bank count + unfinished count in one purpose line | C | **Move.** Date becomes the eyebrow; storage facts go to the margin, once. |
| `Start now` card with five rows, each with a count and a button | E | **Keep, restructure.** The deck is right; the card shell and the fifth row ("Questions you have never seen") are not. |
| Four-figure stat strip (attempted, accuracy, due, syllabus) | S | **Remove from the fold.** Two of the four belong to other screens; the rest become one footer line. |
| `Needs attention` card + ⓘ ranking methodology + footer cross-signal | E (rows) / S (method) | **Keep rows, move method to the revision of the card's margin note; cross-signal stays as a sentence inside the Revision row.** |
| `Recent sittings` card with 4 rows | C | **Consolidate** into one footer line ("2 sittings this week · last: 21/60"). |
| Integrity sentences (missing keys, unclassified) | S | **Move** to the affected screen (Bank); Today keeps one line only if it blocks a start. |

**Ledger:** remove the stat strip, the `Recent sittings` card, the ⓘ on attention, the start-deck card shell; consolidate
the deck to three rows plus the unfinished sitting; hide bank/storage facts in the margin.

### 2.2 Test Centre (`#/test-centre`) — 1,056 words, 75 tiny nodes, 78 joins

| Element | Class | Decision |
| :--- | :--- | :--- |
| Purpose paragraph (18 words) | U | Delete. The screen is a shelf of papers; the heading is enough. |
| Card title + count + ⓘ about scoring/provenance | S | **Move** the scoring policy into each row's one-line footnote and keep a single line at the foot. |
| Resume strip (rows with "Resume"/"Discard") | E | **Consolidate** into the shelf as its first, distinct row. |
| Filter selects (Year, only-with-progress) + filter chip | C | **Replace** with a single row of year chips (2013…2024) + "in progress" toggle. |
| Paper table: Paper / Questions / Your best / Action, each with 1–3 sub-lines and a Details toggle | E | **Keep the comparison, drop the chrome.** New shelf row: year (serif folio), name, `100 Q · 2 h`, best score if any, one Start; Details stays as the row's expansion. |
| Per-row "latest pattern · practice only" line | C | **Move** to the shared footnote once; it is identical on every row. |
| Footer line about unknown scoring | S | **Move** to the details panel of the papers that need it. |

**Ledger:** remove the purpose paragraph, per-row provenance sub-line, the filter-select panel; consolidate resume into
the shelf; hide row details behind the existing expansion.

### 2.3 Practice (`#/topic`) — 898 words, 152 controls, 4 tiny nodes

The only screen whose control count is *not* a problem: the picker rows are the content. Its problem is competition
between the picker and the session panel, not clutter count.

| Element | Class | Decision |
| :--- | :--- | :--- |
| Purpose line (18 words) | U | Delete; the panel says what will start. |
| "How selection works" ⓘ (strategy vs shuffle paragraph) | S | **Keep behind one disclosure**, shorter. |
| Search, subjects, tri-state boxes, topic rows with counts | E | Keep. Counts belong to the row. |
| Basket chips + live count + presets + strategy + shuffle + feedback | E | **Keep**, retitled as a *session slip* (serif heading, ruled lines). |
| Advanced settings disclosure with 12 fields | C | Keep as is (already collapsed). |
| Frozen-rules sentence under the form | S | **Move** into Advanced; one line, not a paragraph. |

**Ledger:** remove the purpose line, the extra count repeats (count appears in the row, the chips, the heading and the
button — keep two), and the "Clear these filters" duplicate.

### 2.4 Smart Practice (`#/smart`) — 558 words, 2 cards, 2 tables

| Element | Class | Decision |
| :--- | :--- | :--- |
| Purpose line (21 words) | S | Shorten to one clause; the plan table explains itself. |
| "How this session will be built" card with explanation list + plan table | E/C | **Keep the plan table** (it is the transparency), **drop the parallel prose list** that repeats it. |
| Session settings card (size, feedback, exclude demonstration, cooldown) | E | **Consolidate** into three inline controls above the Start button. |
| Selection notes under the table | S | Keep one line ("built from N due, N wrong, N unseen"). |

### 2.5 Runner (`#/runner/:id`) — 290 words, but the *reading* screen

| Element | Class | Decision |
| :--- | :--- | :--- |
| Breadcrumb trail (Today ▸ Test Centre ▸ Runner) | U | Delete. The header states where you are. |
| Question meta row: sequential pill, paper origin, subject · topic, key badge, demo badge, language switch | C/E | **Consolidate to one margin line** above the stem (`Q42 · MPPSC 2024 · paper Q18`); language switch stays as a two-letter toggle in the top bar. |
| Question stem + options | E | Keep; increase measure and leading; options become ruled rows. |
| Sidebar palette grid + palette tools + jumps + print + scoring card | E (index) / S (scoring) | **Move the index into an overlay** ("Index" button + `I`), keep counts; **scoring rules move to the submit sheet** (where they are actually decided). |
| Timer + progress | E | One quiet figure top-right; a 2px progress rule under the top bar. |
| Shortcut legend, confidence strip, nav buttons | C | Keep, restyled: text buttons, not a control bar; confidence collapses to three small marks under the options. |

### 2.6 Report (`#/report/:id`) — 2,764 words, 90 badges, 26 tables

| Element | Class | Decision |
| :--- | :--- | :--- |
| Four tiles (score, accuracy, attempted, negative marks) + outcome-counts table | E (score) / U (the rest) | **Consolidate** to one score, one sentence and one segmented rule; the counts table is the same three numbers again. |
| Rules block + infoToggle + warnings | S | **Move** to the margin (one line) and a single notice only when warnings exist. |
| "Do something about it" rows | E | **Keep** — restyle as three ruled lines, not rows in a card. |
| "Weakest topics" table with 5 columns + Practise | E | **Keep**, as bar rows with one number and Practise. |
| Question review (per question: meta row of 6 badges, options table, answer-used paragraph, explanation, three buttons) | E/C | **Keep the capability, collapse the item**: one line per question (number, stem, your answer vs key), expanding into the full review panel. |
| Details tabs (confidence matrix, pacing table, recommendations, repeated mistakes, unresolved) | S | **Keep**, behind one "Details" disclosure instead of 5 tabs. |
| 90 badges | U | **Delete**; keep only key-status and demonstration marks where they change the reading. |

### 2.7 Mistake Book (`#/mistakes`) — 550 words, 17 badges, 2 tables

| Element | Class | Decision |
| :--- | :--- | :--- |
| Purpose line (16 words) | U | Delete; the count is the heading (`15 open`). |
| Filters inside `<details>` with 5 selects | C | **Replace** with one chip row (type) + one "More filters" disclosure. |
| Table: Question / Why it is here / Confidence / 4 actions per row, 3 badges per row | E | **Replace with a correction list**: question preview, reason in the left margin, one primary (Retry) + one expansion; Resolve/Reopen/Remove move into the expanded panel. |
| "Topics with the most open items" details table with Retry-topic | C | **Keep** inside the same disclosure as filters; it is a useful grouping, not a second card. |
| Footer explaining spread | U | Delete. |

### 2.8 Revision Centre (`#/revision`) — 591 words, 4 tiles, queue table

| Element | Class | Decision |
| :--- | :--- | :--- |
| Purpose line (20 words) + `Start revision (20 of 12 due)` | E | Keep one action; headline becomes `12 due today` (a statement, not a paragraph). |
| Queue card: filters (3 selects), table with 4 columns and 3–4 buttons per row | E | **Replace with an index-card stack**: stamp in the gutter (overdue/today), question excerpt, source line, Practise + inline Knew it / Still unclear; details expansion keeps the schedule. |
| "Show more" paging | C | Keep, as a text link. |
| `Schedule health` card: 4 tiles, effectiveness bar, upcoming-load details table | S | **Remove the tiles**; keep the 7-day load strip in the margin and move lapses/interval averages into the schedule disclosure. |
| Rules ⓘ (two copies, one per card) | S | Keep **one** link at the foot. |

### 2.9 Syllabus (`#/syllabus`) — 968 words, 174 controls

| Element | Class | Decision |
| :--- | :--- | :--- |
| Purpose (25 words) + progress summary | E | Keep the progress line, shorten the purpose to one clause. |
| Tree with status cycling per row | E | Keep. Reduce row metadata to the status mark and (where present) the bank mapping. |
| Legend/explanation of statuses | S | **Move** into one disclosure. |
| Paper headings + counts | E | Keep. |

### 2.10 Insights (`#/analytics`) — 2,938 words, 10 cards, 90 badges, 13 tables

| Element | Class | Decision |
| :--- | :--- | :--- |
| Shell purpose (30 words) + two-tab explanation | U | Delete; the tab labels say it. |
| Shared 3-figure strip above the tabs | S | **Remove**; each panel states its own figures where they are used. |
| `Subjects` table (7 columns incl. two accuracies, a verdict badge per row) | C | **Replace** with a coverage strip: subject name, one thin bar (coverage), one accuracy figure, Practise. |
| `Topics` table (7 columns) | S | **Move** behind "All topics" (a disclosure with search); the screen shows only the topics that matter to a decision. |
| `Where the evidence points` (weak/strong/thin, 5 columns + Practise) | E | **Keep, cut to** topic · verdict · sample · Practise. |
| `Coverage gaps` table | U (duplicates) | **Merge** into the coverage strip; "never attempted" is a bar at zero. |
| `How you answer` confidence matrix table + badges + note | C | **Keep as a 2×2 grid** (confident/unsure × right/wrong) with one note. |
| `Signals for the next session`, `Study priorities` | S | Consolidate into one list of three findings, each with an action. |
| Bank panel: 4 tiles, 22 chips, 3 bar charts, 4 tables, 2 ⓘ | S | **Move** to the Bank tab, collapsed: one chart (subject × year) and the topic list. The rest stays available, not open. |

### 2.11 Question Bank (`#/bank`) — 1,623 words, 12 cards, 9 tables

Data tooling legitimately needs density, but not twelve cards. Target: **three regions** — the shelf (bundled bank +
import), the questions (filters + table), and integrity (one line + a disclosure). Each of the four integrity cards
(no key, disputed, no explanation, duplicates ×2) collapses into one status line with counts and a single disclosure
listing them.

### 2.12 Settings (`#/settings`) — 1,022 words, 9 cards

Target: **ruled sections**, not cards: Language & theme · Practice defaults · Scoring · Revision intervals · Backup ·
Storage · Application · Danger. Card shell, footer notes and per-card `tiny` footnotes go. The activity log stays a
disclosure.

### 2.13 Help (`#/help`) — 978 words, 6 cards

Help is the one screen where prose is the product. Keep the words, drop the card chrome (ruled sections and one
contents line), and let it host everything the other screens stopped explaining.

### 2.14 Cross-screen removals (the biggest wins, once)

| Removed everywhere | Where it goes instead |
| :--- | :--- |
| Purpose line under every `<h1>` | One clause (≤10 words) where it is needed, otherwise nothing; the rest is in Help |
| `card()` as the default container | `sheet` sections separated by hairlines; `panel` only for dialogs/overlays/scroll boxes |
| Badges for state | Words in the row's margin line; three badge kinds survive (answer key, demonstration, overdue) |
| Four-figure tile strips | One figure + one sentence, or a single segmented rule; averages/storage go to the margin |
| `·`-joined metadata sentences | Margin notes (right, 172px) or one lowercase line under the item |
| Duplicate counts (heading + chip + button + footer) | A count appears **once**, next to the action it describes |
| Rules/provenance paragraphs on the screen | One link to the details/explanation that already exists |
| "Filter" panels with 5 selects | One chip row + one disclosure |

---

## 3. The design direction — *the study desk*

**The metaphor.** The app is a desk you return to, not a system you administer. Four objects live on it:

* **The page** — paper you read and write on (runner, report, question review).
* **The index card** — a small object you pick up and put down (question index, revision queue, basket).
* **The margin** — where facts are written small, beside the thing they describe.
* **The stamp** — the one date that matters (overdue, due today, today's date).

Nothing else gets to be an object. A "metric card" is not an object on a desk.

### 3.1 Ten composition rules (each enforceable, not aspirational)

1. **One screen, one job, one primary action.** If a screen has two primary buttons, one of them is a link.
2. **A section is a rule, not a box.** Default container is a hairline-separated sheet. Borders are reserved for
   interruptions (dialog, overlay, a table that scrolls). Consequence: at most **two** bordered panels per screen.
3. **Type carries hierarchy, not containers.** Serif display for the screen's voice (date, headline, score, question
   stem); Inter for operations; small caps for section labels. No headings inside boxes.
4. **A screen may show at most three standalone figures above the fold**, and every figure must be attached to a
   decision. A number nobody acts on is margin text or removed.
5. **Counts appear once.** Heading, chip, row and button must not all say 12.
6. **Metadata lives in the margin** (right at ≥1100px, a dotted line under the item below that) — never as badges.
7. **Three badge kinds only:** answer-key status, demonstration bank, overdue. Everything else is a word.
8. **A sentence under a heading is limited to ten words.** Explanations move to Help, to a disclosure, or to the
   margin.
9. **Lists for people-work, tables for data-work.** Queue, mistakes, review, actions = lists. Bank, papers, history =
   tables, and only when the comparison is real.
10. **An empty state is a page:** one mark, one sentence, one action.

### 3.2 Type

| Role | Face | Size / detail |
| :--- | :--- | :--- |
| Display (screen voice) | `--serif` — system stack: Iowan Old Style → Palatino → Georgia → Times | 34/1.08 for `<h1>`, 22–26 for a lead, 66 for a score |
| Question stem | `--serif` | 20–21px / 1.5, measure 58ch |
| Body & UI | `--sans` (bundled Inter) | 14–15 / 1.55 |
| Section label | Inter, uppercase | 10.5px, tracking .13em, `--faint` |
| Margin note | Inter | 12px, `--faint`, 1.5; the *only* place tiny type is allowed |
| Numbers | Inter tabular, or serif for a headline figure | never two number styles in one row |

Hindi: the serif is **never** applied to Devanagari. `lang="hi"` content keeps `--deva` (Noto Sans Devanagari, etc.)
at the same optical size as the Inter body; question stems in Hindi render in `--deva`, not in the serif, because a
serif Devanagari may not exist on the device and mixed fallback is worse than a consistent sans.

**No new font files.** The serif is a system stack with a documented fallback chain, so offline behaviour and the
"no network, no CDN" guard are untouched. If the device has no serif at all, Georgia/Times ship with every desktop OS
and Android's fallback is Noto Serif.

### 3.3 Colour and material

Keep the existing token set (it is audited for contrast) and make three disciplined changes:

* **`--paper` gets warmer** (`#f4f1e8`), `--sheet` lighter (`#fbf9f4`) for the objects that sit on it, `--paper-deep`
  for the desk behind the page.
* **The accent becomes "margin red"** (a deep vermilion) and is used for exactly one idea: *now* — overdue, due today,
  the current question, a wrong answer. Blue remains a link colour only. Nothing is tinted for decoration.
* **Hairlines replace shadows.** One `--rule` and one `--rule-strong`; no card shadows except the single dialog.

All of it lands as tokens, so `tools/check.mjs` (token-only colours, 108 contrast pairs) keeps its teeth. New pairs are
added to the audit when the tokens land.

### 3.4 The three primitives

| Primitive | Where | Shape |
| :--- | :--- | :--- |
| `sheet` | The page: sections of any screen | no border, separated by `--rule`, generous rhythm (28px), optional right margin |
| `panel` | Dialog, index overlay, scrolling table | 1px `--rule`, 3px radius, `--sheet`, no shadow except the dialog |
| `margin` | Metadata, provenance, sample size, "why this" | 172px column at ≥1100px, dotted caption under the item below |

Plus two small ones: the **rule** (1px section divider) and the **stamp** (a date or a state in the gutter of a
queue row).

### 3.5 Visualisations (five, each earning its place)

| Visual | Screen | Data (already stored) | What it answers |
| :--- | :--- | :--- | :--- |
| Segmented result rule | Report | counts.correct / incorrect / unanswered | "How did the sitting go?" in one bar |
| Topic accuracy bars | Report, Insights | per-topic correct/judged | "Where is it weak?" with the sample beside it |
| Subject coverage strip | Insights | available vs attemptedUnique per subject | "What have I never touched?" |
| Confidence 2×2 grid | Report, Insights | confidence.matrix | "Am I wrong because I don't know or because I'm guessing?" |
| Seven-day load strip | Revision | `bucketise()` upcoming | "When does this pile up?" |

Five visuals, all derived from stored data, none of them a chart for its own sake. Everything else that used to be a
chart or a tile is either a figure in a sentence or gone.

### 3.6 Motion, states, mobile

* **Motion:** only two transitions — a 120ms rule-draw on load of a queue, and the existing 150ms hover/focus. Nothing
  animates on a data change; the runner's rule grows without transition.
* **Empty:** mark + one sentence + one action (§3.7 sample in the kit artboard).
* **Loading:** the existing skeletons, restyled as page-shaped greys (no card outlines).
* **Error:** one notice in the margin position, not a card.
* **Mobile:** the margin folds under the item as a dotted caption; the runner's index becomes a full-height sheet; the
  revision stack becomes cards with the stamp above the question; the desk list keeps its 44px targets.

---

## 4. Proposed layouts

Wireframes are structural, not pixel-accurate; the artboards (`docs/mockups/phase3.html`) show them typeset.

### 4.1 Today — *the desk*

```
┌ sidebar ─────────┬──────────────────────────────────────────────────────────────┐
│ MyMPPSC.         │ SATURDAY · 31 OCTOBER                        Stored here      │
│ STUDY            │ Good morning.                                1,234 questions  │
│  Today ◂         │ One thing is half-finished.                 15 papers        │
│  Papers          │                                              last backup 3d  │
│  Practice        │ ─────────────────────────────────────────────────────────── │
│  Smart session   │ UNFINISHED                                                   │
│ REVIEW           │ MPPSC 2024 paper                              [ Continue ]   │
│  Mistakes  15    │ 38 of 100 answered · 1 h 14 m left · started yesterday        │
│  Revision  12    │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│ PLAN             │ ─────────────────────────────────────────────────────────── │
│  Syllabus 1/309  │ ON THE DESK                                                  │
│  Insights        │ ◆ Revision due — 12 questions, 4 also in the book   18 min →  │
│ MANAGE           │ ◆ Open mistakes — 15 items across 6 topics        review →   │
│  Bank            │ ◆ A smart session — 20 questions, unseen first    24 min →   │
│  Settings        │ ─────────────────────────────────────────────────────────── │
│  Help            │ WHERE THE EVIDENCE POINTS              Why these              │
│                  │ Modern India      ●●○   History · 71     [Practise 20]        │
│                  │ Economy of MP     ●○○   Economy · 33     [Practise 20]        │
│                  │ Constitution      ○○○   Polity · 55      [Practise 20]        │
│                  │                                                              │
│                  │ 2 sittings this week · first-attempt accuracy 58% · 1/309    │
└──────────────────┴──────────────────────────────────────────────────────────────┘
```

**Decisions:** the unfinished sitting is the hero *only when one exists*; otherwise the hero is the single best next
session with the same shape. The deck is three rows, each a whole action (row = link). Evidence is three dots, not a
number and a meter widget. The footer line is the only place storage facts appear, once.

### 4.2 Runner — *the examination page*

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Q42 of 100    MPPSC 2024 · paper Q18                 1:14:06 left  [Index][Finish] │
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│                                                          ┌ index card ──────┐ │
│ Q42                                                       │ 1 2 3 4 5        │ │
│ Which of the following statements about the formation      │ 6 7 8 9 10       │ │
│ of Madhya Pradesh is not correct?                          │ ...              │ │
│ निम्नलिखित में से कौन-सा कथन …                              │ 28 answered      │ │
│                                                            │ 2 flagged        │ │
│   Ⓐ  It was formed on 1 November 1956.                     └──────────────────┘ │
│   Ⓑ  Its first capital was Nagpur.                                            │
│   Ⓒ  Bhopal became the capital in 1956.                                       │
│   Ⓓ  It was formed by merging three states.                                   │
│                                                                               │
│ ← Previous     Next →     ⚑ Flag     Clear                   shortcuts: ?     │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Decisions:** the index is an overlay (button, `I`, or the progress rule), not a permanent column; the scoring card is
gone from the reading view (its rules appear in the submit sheet); the meta row becomes one quiet line; options are
ruled rows with circular keys; the progress rule is the palette in miniature (answered = ink, flagged = stamp).

### 4.3 Report — *the marked paper*

```
┌ MARKED PAPER ──────────────────────────────────────── submitted 28 Oct, 9:42 pm ┐
│ MPPSC 2024                                             +3 / −1 / 0            │
│                                                        latest pattern, policy │
│ ─────────────────────────────────────────────────────────────────────────────  │
│  21 / 60      7 correct · 5 wrong · 8 blank · 35% over 12 judged               │
│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  │
│  ■ correct 7      ■ wrong 5      □ blank 8                                     │
│ ─────────────────────────────────────────────────────────────────────────────  │
│ WHAT TO DO NOW                                                                 │
│ Practise the two topics this paper exposed           Modern India · Const. bodies  [Practise] │
│ Retry the five questions you got wrong               learning mode, paper order    [Retry 5]  │
│ Revise what is due from this sitting                 3 scheduled for today         [Revise 3] │
│ ─────────────────────────────────────────────────────────────────────────────  │
│ WHERE IT WENT WRONG                                                            │
│ Modern India            ▬▬▬▬░░░░░░░  2/6                [Practise]             │
│ Constitutional bodies   ▬▬▬▬▬▬░░░░░  2/4                [Practise]             │
│ ─────────────────────────────────────────────────────────────────────────────  │
│ QUESTION BY QUESTION                                                           │
│ Q7   … formation of Madhya Pradesh…    you C · key A                 [Open]    │
│ Q11  … Governor's ordinance power…     you B · key D                 [Open]    │
│ Confidence · Pacing · Repeated mistakes · Unresolved (1) · Print               │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Decisions:** score is a headline figure, not a tile; the three counts become one segmented rule; actions are ruled
lines with counts; weak topics are bars with one fraction; the review is one line per question expanding into the
existing review panel; all secondary analysis is one link row.

### 4.4 Revision Centre — *today's queue*

```
┌ SATURDAY · 31 OCTOBER ───────────────────────────── Next 7 days ──────────────┐
│ 12 due today                                       ▁▅▂▄▁▆▃                    │
│ Three are overdue. Working from the top is fine.   Sat Sun Mon Tue Wed Thu Fri │
│ ───────────────────────────────────────────────────────────────────────────── │
│ 2 days   Which article of the Constitution provides for a Finance Commission? │
│ overdue  Polity · Constitution of India · Q14 · wrong 6 days ago              │
│                                             [Practise]   [Knew it|Still unclear]│
│ ───────────────────────────────────────────────────────────────────────────── │
│ today    The Tropic of Cancer passes through how many districts of MP?        │
│          Geography · Physical · Q31 · right, marked unsure                    │
│                                             [Practise]   [Knew it|Still unclear]│
│ ───────────────────────────────────────────────────────────────────────────── │
│ in 2d    Which scheme was launched before NITI Aayog?                         │
│          MP Special · Schemes · Q8 · confident, right                          │
│                                             [Practise]                        │
│ ───────────────────────────────────────────────────────────────────────────── │
│ Show: due · upcoming · all            12 in queue · 20 per sitting            │
│ How the dates are decided →                                                    │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Decisions:** the queue is the screen (no table, no four tiles); the date lives in the left gutter as a stamp; the
two-state mark is inline; the seven-day strip answers "when does this pile up?" without a second card; the rules are one
link at the foot.

---

## 5. How this differs from the current visual language

| | Now | Proposed |
| :--- | :--- | :--- |
| Container | A `card()` for every idea; 53 cards measured | A page divided by rules; panels only for dialogs/overlays; ≤2 bordered panels per screen |
| Voice | Inter everywhere; headings are bold UI labels | Serif for the screen's voice and the question; small caps for section labels |
| Hierarchy | Title → paragraph explaining title → tiles → cards | Date/eyebrow → headline → the one thing → sections |
| Numbers | 4 tiles at the top of most screens; 31 tiles total | ≤3 standalone figures above the fold, each attached to an action; averages/storage in the margin |
| Metadata | 224 badges, 256 middot joins | A margin column; three badge kinds total |
| Copy | 20-word purpose lines, tiny footnotes everywhere (3,078 tiny words) | One clause ≤10 words; explanations live in Help, a disclosure, or the margin |
| Data display | 59 tables, including people-work | Lists for people-work; tables only for the bank, papers and history |
| Screens' identity | Same skeleton eleven times | Each screen has an object: desk, shelf, slip, page, marked paper, corrections log, queue, atlas, syllabus |
| Empty states | Card + title + message + "will show" + action | One mark, one sentence, one action |
| Accent | Blue used for links and states | Margin red for *now*; blue for links only |

**What this phase will not do:** change route names or the information architecture (Phase 2 settled it); remove a
single capability; change scoring, revision maths, stored data or IndexedDB; add a dependency or a downloaded font;
drop Hindi, keyboard shortcuts, offline behaviour or contrast standards. Every removed element is either relocated or
listed in §2 with a reason.

---

## 6. Implementation plan (after approval)

**Order matters: containers first, then screens by value.** Each step ends with `npm test` and `npm run check` green.

| Step | Work | Files |
| :--- | :--- | :--- |
| 1 | Add `sheet`, `panel`, `margin`, `stamp`, `rule`, `segmented` primitives; serif + margin-red tokens; section-label type | `css/app.css`, `js/ui/components.js` |
| 2 | Budget v2: cards ≤4, words per card ≤180, ⓘ ≤1, purpose ≤10 words, `·` joins ≤15/screen, badges ≤8/screen, bordered panels ≤2 — enforced in `js/ui/budget.js` + `tools/check.mjs` + `tests/screen-anatomy.test.js` | budget, check, tests |
| 3 | Runner (highest value per minute of study): page layout, index overlay, submit sheet rules | `js/ui/views/runner.js`, css |
| 4 | Today: hero, desk list, margin, footer line | `dashboard.js`, `nextup.js` (labels only) |
| 5 | Revision: queue cards, stamp, inline mark, 7-day strip | `revision.js` |
| 6 | Report: score line, segmented rule, action lines, topic bars, collapsed review | `report.js` |
| 7 | Test Centre: shelf rows + year chips | `testcentre.js` |
| 8 | Mistake Book: correction list + expanded panel actions | `mistakes.js` |
| 9 | Insights: coverage strip, verdict list, 2×2 grid; bank density collapsed behind disclosure | `analytics.js`, `pyq-analysis.js` |
| 10 | Practice: session slip restyle (structure already right); Smart: drop the duplicated prose list | `topic.js`, `smart.js` |
| 11 | Syllabus, Bank, Settings: ruled sections; integrity line + disclosure | `syllabus.js`, `bank.js`, `settings.js` |
| 12 | Help takes the explanations the screens dropped; `docs/UI.md` anatomy rewrite; cache bump | `help.js`, docs, `sw.js` |

**Test strategy — workflows, not screenshots.** `tests/ux-journeys.test.js` grows a "desk" journey (no stat strip,
one primary action, counts appear once) and a "reading" journey (measure ≥56ch, option hit area ≥44px, focus never
moves on answer, index overlay keyboard-reachable). Contrast and token guards stay; density thresholds tighten; a new
`tools/audit-clutter.mjs` reproduces §1's table so the numbers can be re-checked after every step.

**Risk register**

| Risk | Mitigation |
| :--- | :--- |
| Serif stack absent on a device | Georgia/Times are universal; the measure and hierarchy do not depend on the face |
| Warmer paper lowers contrast | Every new token pair is added to the 108-pair contrast audit before it ships |
| Fewer counters feel like lost information | Each removed figure is listed in §2 with where it went; nothing is deleted that is stored |
| Tests asserting current copy | Updated deliberately, one step at a time, with the reason in the diff |
| Runner index overlay hides the grid | `I` and the progress rule both open it; the grid keeps its counts, filters and shortcuts |
| Density budget v2 fights a legitimate screen (Bank) | Tables are excluded from card/word limits already; the bank's own budget is its disclosure count |

---

## 7. Open questions for approval

1. **Serif voice** — approve a system serif stack (no downloaded font, Georgia fallback), or keep Inter for headings
   and get distinctiveness from composition alone?
2. **Navigation labels** — shorten to *Papers*, *Mistakes*, *Revision* (the mockups do), or keep the current long labels?
   Shortening changes three navigation strings and the test that lists them.
3. **Margin metadata** — approve the 172px right margin at ≥1100px (folding to a dotted caption on tablets/phones)?
4. **Accent** — approve margin red as the only "now" colour, with blue demoted to links?
5. **Report review** — one line per question that expands (mockup), or keep every question open by default? The first
   is calmer; the second is closer to a marked paper you scan top to bottom.

Once these are answered I will implement §6 in order, starting with the primitives and the runner, and re-run
`npm test` / `npm run check` at every step.


---

## 8. What was built, and what it measures

### 8.1 Decisions taken (the §7 questions, self-approved)

| Question | Decision |
|---|---|
| Serif voice? | Yes — `--serif` for the screen `<h1>`, section-opening headings, the question stem and scores. Devanagari always uses `--deva`. |
| Navigation labels | Shortened to the words a reader uses: **Today · Papers · Practice · Smart · Mistakes · Revision · Syllabus · Insights · Bank · Settings · Help**. Full names remain each screen's `<h1>`. |
| The margin | A third column of facts, 190px, folding to a dotted caption below a hairline under 1180px. |
| The "now" colour | Margin red (`--now`) marks overdue, wrong and "act on this". Blue is links only. |
| Report review | One line per question; the line opens in place. Bodies are built on first open. |

### 8.2 The primitives (`js/ui/components.js`, `css/app.css` §14b–14f)

`sheet()` — a section of the page, separated by a hairline, with an optional label, count, action, footer and info toggle.
`panel-box` is reserved for interruptions (dialogs, scrollable tables), which is why bordered panels dropped to ≤2 per screen.
`marginNote()` — the metadata column. `metaLine()` — facts on one line, separated by space instead of middots.
`stamp()` — the one date that matters, in a queue's gutter. `segmented()` — correct/wrong/blank as one bar with a text legend.
`barRows()` — accuracy as bars without a badge per cell. `evidenceDots()` — three marks for sample size.
`deskRow()`, `queue-entry`, `review-line` — the three list units (work to start, work to revise, work to review).

### 8.3 Screen by screen

| Screen | What changed |
|---|---|
| **Today** | Unfinished sitting is a hero with a progress rule and one Resume link; the deck is a ruled list of at most five rows; weakest topics are a bar table; standing figures moved to the margin as facts. The stat strip and the recent-sittings list are gone (sittings live on Insights). |
| **Papers** | Table kept; every row's scheme/policy detail moved behind its own *Details*, per-row "practice policy" line retained, and the section is a `sheet`, not a card. |
| **Runner** | The stem is serif at a 58-character measure; options are ruled rows; the palette became a drawer (Index) that no longer takes a permanent column; scoring rules and mode are stated in the submit sheet that already asks the question. |
| **Report** | Score as one figure with a segmented rule and a legend; three ruled action lines; topic bars; **one line per question** that expands, with the body built on demand (2,844 → 1,052 words in the DOM); confidence/pacing/repeated/unresolved stay in *The details*. |
| **Revision** | A stamped queue: date in the gutter, the stem in the body, `Knew it / Still unclear / With a note…` inline (one click, no trigger, no dialog), `Why this date` opening in the row, and a seven-day load strip. Schedule health moved to the margin. |
| **Mistakes** | Why-an-item-is-here became words with tone instead of three badges per row; the confidence column joined the review panel; actions are one button plus quiet words. |
| **Insights** | The three confusable counts are one line of facts; verdicts are words; "Where the evidence points" and "Coverage gaps" merged into one **Where to look next** bar list; per-row badges removed. |
| **Bank** | Every section is a `sheet`; the two wall-of-text paragraphs (bundled bank, import validation) became one-line statements with the detail behind ⓘ; the two import disclosures merged into one. |
| **Settings, Help** | Sections instead of cards; the same controls, copy and ids. |

### 8.4 Measured before → after (same 13 routes, same jsdom harness, same demo bank + bundled 1,200 questions)

| Measure | Phase 2 | Phase 3 | Change |
|---|---|---|---|
| Words in the page | 14,526 | **12,291** | −15.4% |
| Cards (`.card`) | 53 | **5** | −91% |
| Badges | 224 | **27** | −88% |
| Tiny-text nodes (≤11px) | 924 | **704** | −24% |
| Tiny-text words | 3,078 | **2,525** | −18% |
| `·`-joined metadata lines | 256 | (see per-screen) | reduced on every rewritten screen |
| Report page words | 2,764 | **1,052** | −62% (lazy review bodies) |

Remaining weight is concentrated where it is data, not chrome: Insights 2,768 words (its three panels, including the
bank panel and the frequency/priority tables) and the Bank screen 1,638 (question list and import detail).

### 8.5 Verification

- `npm test` — 316/316, including the journeys (Today launcher, builder, runner, report→practice, review-in-place).
- `npm run check` — all checks pass, including the density budget and the contrast/token audit on the new palette.
- Tests updated where the composition changed on purpose: the ten navigation labels (`tests/ui.test.js`), the Revision
  in-row outcome (`tests/ux-journeys.test.js`), the queue section (`tests/ui-improvements.test.js`), the bank panel's four
  figures (`.pyq-summary-grid [data-figure]`), and the Insights word-and-figure contract.
- Service-worker cache bumped to `v1.7.0-1`.

### 8.6 What is deliberately not done yet

- The runner's keyboard legend, the syllabus tree and the practice builder still use their Phase-2 structures: they are
  controls, not containers, and restyling them would be the cosmetic change this phase exists to avoid. Their words and
  controls were left alone on purpose rather than changed for the look of it.
- `docs/mockups/phase3.html` stays as the artboard of the kit; the app CSS now implements it.
