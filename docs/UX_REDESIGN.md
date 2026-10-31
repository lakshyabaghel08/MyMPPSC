# Phase 2 — workflow and information-architecture redesign

Date: 2026-10-31 · App version 1.2.0 · Service-worker cache `v1.6.0-1`

The previous pass rebuilt the visual system: type, colour, spacing, the shell and a flat page anatomy.
This pass changes **what the screens do and how many things a learner has to do to get the outcome
they came for**. Nothing here is a restyle. Where a screen survived unchanged, it is because its
workflow survived the audit — that is stated explicitly in §7.

The question bank, papers, classifications, scoring policy (+3/−1/0), attempts, mistakes, revision
schedule, syllabus progress, imports, backups, IndexedDB stores, service worker and routes are all
preserved. No new stores, no schema migration is required (see §10).

---

## 1. Method

For every module I asked the same seven questions, and answered them from the code and from the
seeded demo data used by the test suite (not from screenshots):

1. Why does this screen exist?
2. What is the primary goal of the person opening it?
3. How many deliberate actions does that goal take today?
4. Which decisions are asked that have one obviously right answer?
5. Which actions are implemented more than once, on different screens?
6. What does the person actually need *at that moment*, and what is merely available?
7. Can two steps become one, or can the app decide instead of asking?

Counts below are "deliberate actions" (a click, a keystroke that commits a value, a navigation) on
the shortest path to the goal, and "decisions" are genuine choices the interface forces.

---

## 2. Audit of existing workflows

### 2.1 Dashboard (`#/dashboard`)

*Why it exists:* to be the start screen. *Goal:* "what do I do now?"
*Current model:* next-up block (resume or start), revision aside, four-figure stat strip,
recommended-next list, recent sessions.

| Path | Actions | Decisions | Notes |
| :--- | ---: | ---: | :--- |
| Resume an unfinished test | 1 | 0 | Good — keep. |
| Start due revision | 1 | 0 | Good — keep (aside button). |
| Start a previous-year paper | 3–5 | 2–4 | Only via Test Centre → row → modal. |
| Start topic practice | 4–6 | 2–4 | Only via the practice builder. |
| Practise a recommended weak topic | 3 | 1 | Row link → builder → Start. The recommendation itself is not actionable. |
| Start smart practice | 2 | 0 | Via the builder screen only. |

*Structural problem:* the dashboard reports state but launches almost nothing. Four of the six
things it recommends are 3+ actions away, and the one "Practise now" button opens a **modal that
re-implements the Smart Practice plan and the Topic filters in a third place**.

### 2.2 PYQ Test Centre (`#/test-centre`)

*Why it exists:* to run a stored paper as a simulation. *Goal:* start that paper.
A row's *Start* opens a modal with question count, feedback timing, timing limit, scoring source,
repeat policy and a "keep exact original order" checkbox — then requires a second confirmation
click. **A "paper simulation" has exactly one sensible configuration**: the whole paper, in the
paper's order, exam-style feedback, the paper's scoring rules. The modal asks four questions whose
answers are in the label. 1 click became 1 click + 4 decisions + 1 text field.

### 2.3 Topic & Custom Practice (`#/topic`)

*Why it exists:* to choose what to practise. *Goal:* be in the runner with the chosen questions.
*Current model:* tri-state subject/topic picker, a "Narrow further" disclosure with 9 filters, a
selection sentence, a session form (count, feedback, advanced), a start button, and — for anything
wider than one topic — a confirmation dialog that restates the summary.

Problems: every tick triggers a full router re-render (the screen is rebuilt and re-measured while
the person is still ticking); the selected set has no persistent representation ("what have I
chosen?" has to be re-read from checkbox states and a sentence); the pool count is a number in the
page header rather than next to the button that starts it; the confirmation dialog is a *second*
place that says what the screen already said.

### 2.4 Smart Practice (`#/smart`)

*Why it exists:* to assemble a session from recorded performance. The plan itself (buckets,
allocation, explanation) is genuinely good and honest. Problems: it is a destination of its own;
and the practice sheet's "Smart mix" pool builds the plan for **the whole bank** and then slices the
first N ids — so the bucket proportions of the session actually started are not the proportions the
plan table describes. Two surfaces, two different plans from one service.

### 2.5 Runner (`#/runner/:id`)

*Why it exists:* to sit the test. Goal: answer questions and submit.
Everything needed exists (timer, palette, flags, confidence, focus mode, keyboard shortcuts, Hindi
typography). The problems are interaction-level:

* **Every answer, flag, clear and confidence mark rebuilds the entire screen** (`root.innerHTML = markup()`).
  Scroll and focus are restored, but the reader pays a full repaint per click on a phone, and the
  palette is re-rendered to change one pixel of one button.
* The palette counts `answered/total` only. There is no count of flagged or unanswered, no filter,
  and no way to jump to the first unanswered question — the two things a person does when the timer
  is running down.
* Submission is a prose confirmation. It says "7 unanswered, 3 flagged" and then offers *Submit* or
  *Cancel*; it does not offer to take you to the unanswered question.
* The palette lives in the desktop sidebar and becomes a long grid below the question on a phone.

### 2.6 Report (`#/report/:id`)

*Why it exists:* to explain the result. Goal: understand what to fix and fix it.
*Current model:* four tiles, four tabs (Overview, Confidence, What to do next, Question review), a
sticky action bar.

Problems: the post-test loop is broken at the only point that matters. "What to do next" is a list
of **sentences** ("Practise the same topic again from Topic Practice") with no button; a weak topic
has no action anywhere on the screen; practising a weak topic from the report takes 5 actions.
The Overview tab repeats the outcome counts as a table *and* as tiles, and the time-per-question
table duplicates what the review already shows per question.

### 2.7 Mistake Book (`#/mistakes`)

*Why it exists:* to work through what went wrong. Problems: the only way to see a question's text,
attempt history and explanation is a modal that replaces the list (so the reader loses their place
and their filter); there is no signal that a question in the book is *also* scheduled for revision;
"Retry all shown" and "Retry this topic" are two separate, differently-shaped practice flows.

### 2.8 Revision Centre (`#/revision`)

*Why it exists:* to show what is due. Problems: "Mark revised" opens a modal with a select and a
note field for the most common action in the screen (a two-state answer); the details modal is a
second, differently-built question view; nothing tells the reader that a due question is also an
open mistake. Same data as the Mistake Book, different screen, different detail view.

### 2.9 Insights (`#/analytics`)

*Why it exists:* to explain performance. "Where the evidence points" (weak/strong/too thin) has **no
action**; "Coverage gaps" has a *Practise* button. The same verdict row should behave the same way.

### 2.10 Command palette (⌘K)

Its "Do" group is static: "start 20 random questions", "resume", "mark a syllabus line", "export a
backup". It does not offer the four data-derived actions that are actually most useful (revision
due, weakest topic, latest paper, open mistakes).

---

## 3. Structural problems (the list this pass fixes)

| # | Problem | Evidence |
| :-- | :--- | :--- |
| P1 | The start screen launches nothing; recommendations are not actionable | Six recommended paths at 2–6 actions each |
| P2 | A paper simulation asks four configuration questions it can answer itself | Start modal in `testcentre.js` |
| P3 | Practice selection re-renders per tick, has no persistent basket, then asks for confirmation of what it just showed | `topic.js` `ctx.refresh()` on every change |
| P4 | "Practise this topic" exists in four places with four different configurations | Dashboard link, sheet pool, mistakes retry, report retry |
| P5 | Smart practice is a destination, and the practice sheet builds a *different* plan from the same service | `practicesheet.js` `count: max(bank)` then `slice` |
| P6 | The runner repaints the whole screen for every answer-level action | `repaint()` calling `markup()` |
| P7 | The palette cannot answer "what is left?" or take you there | counts show answered/total only |
| P8 | Submission tells you the problem and offers no route to it | `confirmDialog` prose in `runner.js` |
| P9 | Results end in prose, not actions; weak topics are dead ends | `buildRecommendations()` returns strings |
| P10 | The report duplicates counts (tiles + table) and time (table + review) | `report.js` Overview tab |
| P11 | Mistakes and revision are the same question seen twice, with two detail modals and no cross-signal | `mistakes.js`, `revision.js` |
| P12 | A weak-topic verdict has an action in one Insights table and none in the other | `analytics.js` coverage vs verdict table |
| P13 | The palette's "Do" actions are static and ignore stored data | `app.js` `doItems` |
| P14 | The most common revision action (mark revised) is a two-field modal | `revision.js` `action === 'mark'` |

---

## 4. Proposed information architecture

The app has exactly two jobs — **practise** and **review** — plus reference material and
configuration. The new IA orders the navigation by those jobs and moves every "start" to the place
the decision is made.

```
Today            ← one screen, one job: start the right thing in one click
Practice         ← the only configuration surface for "what do I want to practise"
Papers           ← one click = a faithful paper simulation; row detail in place
Review
  Mistake Book   ← what went wrong; inline question detail; practises its own selection
  Revision       ← when to see it again; inline mark/revise; cross-linked to mistakes
Plan
  Syllabus
  Insights       ← every verdict row now carries the practice action it implies
Manage
  Question Bank & Imports · Settings & Backup · Help
```

Decisions taken, with reasons:

* **Smart Practice stays a screen, and becomes a one-click action on Today.** It is not merged into
  the dashboard: the plan table and its explanation are worth reading once, and the screen is where
  you inspect and adjust it. What changes is that *starting* it no longer requires going there.
* **Topic & Custom Practice is not renamed to a new route.** `#/topic` (and its `#/custom` alias)
  keep working; the screen is rebuilt around a two-pane builder.
* **Mistake Book and Revision Centre stay separate screens.** They answer different questions
  ("what did I get wrong?" and "what should I see again today?") over overlapping rows.
  Forcing them into tabs would either duplicate the filters twice or hide the schedule. What they
  *do* share is one question-review experience and a live cross-signal, which is the part that was
  actually duplicated.
* **Runner and Report are modes, not destinations.** No new navigation entries.
* **No screen is removed.** Every route, alias and deep link in the previous build still resolves.

---

## 5. Journeys, before and after

### Journey A — Start studying

**Before**

* Paper: dashboard → *Paper tests* → Test Centre → scan → *Start* → modal (count, feedback, timing,
  scoring, order) → *Start simulation*. **6 actions, 4 decisions, 1 text input.**
* Topic: dashboard → *Choose topics* → builder → expand → tick → set count → *Start*.
  **6 actions, 3 decisions.**
* Weak topic from a recommendation: 3 actions, and the link lands on a builder you must then start.

**After** — Today is a launcher. Each row states a real count from stored data and starts on click:

| Row | Source of truth | Action |
| :--- | :--- | :--- |
| Continue ⟶ | `tests.unfinishedTests()` | 1 click → runner (unchanged) |
| Smart session (n) ⟶ | `smartPracticePlan()` with the chosen size | 1 click → runner |
| Revision due (n) ⟶ | `revision.dueQueue()` | 1 click → runner |
| Latest paper ⟶ | newest stored paper | 1 click → runner (full paper, paper order, exam feedback) |
| Weakest topic (n) ⟶ | `studyPriorities()` + topic pool | 1 click → runner (learning feedback) |
| Unseen questions (n) ⟶ | question index minus attempts | 1 click → runner |

**Paper from Test Centre** is now the row's *Start* = start immediately. A secondary *Customise*
control on the row keeps the old modal for anyone who wants a shorter or shuffled run.
Paper start: **1 action, 0 decisions** (was 6 actions / 4 decisions), with the modal kept behind an
explicit opt-in.

### Journey B — Build a custom session

**Before** — 9–10 actions, 6 decisions, ending in a confirmation dialog that repeated the summary.

**After** — one screen, two panes, no page rebuild while selecting:

* Left: search field (auto-focus, `/`), subject rows with a tri-state checkbox, per-topic rows with
  `available · new · seen`, "Add all N matching" on the search result, "Clear".
* Right (sticky): *your basket* — subject/topic chips with individual ×, a live count of what is in
  the pool, size presets 10/20/40/All, feedback toggle (one control, two values), weak-first toggle,
  and **Start N questions** (disabled with a reason when the pool is empty). Advanced options stay
  behind one disclosure.
* Selection lives in a JS set and is applied **without a router re-render**; only the summary,
  counts and row states are patched.
* No confirmation dialog: the summary panel *is* the confirmation, and it is visible the whole time.

Result: **3 actions** (open, click subject, click Start) and **1 decision** on the default path,
with the full flexibility still available for the deliberate builder.

### Journey C — Take a test

* Answering patches the affected option, the palette cell and the counters in place — no full
  repaint, so focus, scroll position and reading position never move. Navigation (`←/→`, palette,
  next-unanswered) still repaints the question area only.
* The palette gains a **filter + counter bar**: All · Unanswered · Flagged · Answered, with counts;
  the grid is filtered in place. `]` jumps to the next unanswered question, `[` to the next flagged.
* On phones the palette becomes a **bottom sheet** opened from a sticky bar that also shows progress
  (`12/20 answered · 3 flagged`), instead of a long grid under the question.
* Submission becomes a **structured sheet**: answered / unanswered / flagged / unsaved-warning rows,
  a *Go to first unanswered* button, and only then *Submit and see results*. Auto-submit at expiry
  keeps its own path.
* Distraction-free mode (`D` or the header control) hides the palette, nav and secondary chrome,
  widens the reading column and leaves one exit.

### Journey D — Learn from the results

**Before**: score tiles → tabs → prose recommendations → (5 actions) topic practice.

**After**: one debrief screen ordered by "what next":

1. **Outcome strip** — score, accuracy, attempted, negative marks (kept; 4 numbers).
2. **What to do next** — three real actions with counts, above the fold:
   *Practise the N weak topics* (one session built from this test's weak topics), *Retry N incorrect*,
   *Revise N due from this test*. All three create a real test.
3. **Where it went wrong** — per-topic rows with `correct/judged`, accuracy and a **Practise** button;
   each row is a real topic session.
4. **Question review** — unchanged filtering, plus *practise the filtered N* and per-question
   *add to revision* (both already existed as data, now as actions).
5. Details (confidence, timing, scoring provenance) move into a single *Details* tab, so counts and
   time no longer appear twice.

Result: from report to practising the weak area is **1 action** (was 5).

### Journey E — Revise and improve

The four modules now form a loop with one shared question view:

* **Today** → *Revision due* starts a due session; *Wrong recently* starts the open mistakes.
* **Mistake Book** rows expand **in place** into the same question panel the revision screen uses
  (question text, options, key, explanation, attempt history, revision schedule, actions). Rows show
  a *due for revision* badge when both records exist; the header shows how many open mistakes are
  also due, with *Practise both*.
* **Revision Centre** rows expand into the same panel; the two-state *Mark revised* becomes two
  inline buttons (*I know it* / *Still unclear*), with the note field moving into the panel where it
  belongs. The header shows how many due questions are open mistakes.
* **Insights** verdict rows and coverage rows both carry *Practise*; subject rows open the builder
  with the subject pre-selected.
* **Results** feeds all of the above (§5 D).

---

## 6. Interaction patterns introduced

| Pattern | Where | Why there |
| :--- | :--- | :--- |
| One-click start rows with live counts | Today, Test Centre, practice panel | The data already knows what is worth doing; the count is the justification |
| Two-pane builder with a persistent session summary | Practice | Selection needs a stable "what I have chosen" representation |
| Search-first hierarchical picker (tri-state tree, `/` to search, one-click whole subject) | Practice | 1,200 questions across 12 papers need a filter, not a wall |
| In-place row expansion instead of modal | Mistake Book, Revision, Test Centre | Keeps the list, the filter and the reader's place |
| Structured submission sheet | Runner | Converts "you have 7 unanswered" into a route to them |
| Palette filters + next-unanswered/next-flagged jumps | Runner | The two questions asked under time pressure |
| Sticky summary/action bar | Runner (phone), Practice, Report | The decision and its button stay together |
| Contextual command-palette actions | ⌘K | Make the fast path data-aware |
| Cross-module signal lines | Review screens | The same row is visible in two modules; say so where it matters |

Deliberately **not** added: study timers, streaks, productivity scores, gamification, decorative
charts, new settings, new stores, and any confirmation dialog removed where an action is destructive
or irreversible.

---

## 7. What changes, and what deliberately does not

| Module | Change | Reason |
| :--- | :--- | :--- |
| Dashboard | Rebuilt as a launcher ("Today"): actionable start rows, inline topic practice, revision and mistake cross-links | P1, P4 |
| Test Centre | Row *Start* starts; *Customise* keeps the old configuration | P2 |
| Practice | Rebuilt as a two-pane builder with a live basket, presets and no confirm dialog | P3 |
| Smart | Unchanged as a screen; now also a one-click start from Today; the practice sheet bug fixed so the started session matches its plan | P5 |
| Runner | In-place patching, palette filters and jumps, phone palette sheet, structured submission | P6–P8 |
| Report | Reordered into outcome → actions → weak topics (with buttons) → review → details | P9, P10 |
| Mistake Book | Inline question panel, revision cross-signal, one "practise this selection" action | P11 |
| Revision | Inline question panel, two-button mark, mistakes cross-signal | P11, P14 |
| Insights | Practice action on every verdict row; subject rows open the builder pre-filtered | P12 |
| Command palette | Contextual "Do" items from stored data | P13 |
| Question Bank, Syllabus, Settings, Help | **Unchanged in workflow.** Bank tabs/import/validation, syllabus marking, backup/restore and help are already task-shaped; this pass only inherits the shared primitives (inline panels, action rows) | Out of scope: their workflows are dense *because* their jobs are |

---

## 8. Measurable improvement

| Journey | Actions before | Actions after | Decisions before | Decisions after | Inputs before | Inputs after |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Resume a test | 1 | 1 | 0 | 0 | 0 | 0 |
| Start a paper simulation (Today) | 6 | **1** | 4 | **0** | 1 | 0 |
| Start a paper simulation (Test Centre) | 5 | **1** | 4 | **0** | 1 | 0 |
| Start a topic session | 6 | **3** | 3 | **1** | 1 | 0 |
| Build a 3-topic custom set across 2 subjects | 10 | **5** | 6 | **2** | 2 | 0 |
| Start smart practice | 2 | **1** (from Today) | 0 | 0 | 0 | 0 |
| Start due revision | 1 | 1 | 0 | 0 | 0 | 0 |
| Practise a weak topic from results | 5 | **1** | 2 | **0** | 0 | 0 |
| Mark a revision item revised | 4 | **1** | 2 | **1** | 1 | 0 |
| Inspect a mistake's question | 2 (modal, loses place) | **1** (in place) | 0 | 0 | 0 | 0 |
| Submit a test with 7 unanswered | 2 | 2 (+1 to fix them) | 0 | 0 | 0 | 0 |
| Navigation transitions to reach practice | 1–3 | **0–1** | — | — | — | — |

A confirmation was removed in exactly one place — the custom-set dialog — because the summary panel
now shows the same facts continuously and is visible while starting. Every destructive or
irreversible action (delete, remove, import replacement, restore, resolve-and-remove) keeps its
confirmation.

---

## 9. Implementation map

| File | Work |
| :--- | :--- |
| `js/services/nextup.js` | **new** — real-data start options: resume, smart, revision, latest paper, weakest topic, unseen, mistakes; each with counts and a pool resolver |
| `js/ui/views/shared.js` | shared session starters: `startTopicSession`, `startFromIds`, `startPaperSimulation`, `startSmartSession` |
| `js/ui/views/dashboard.js` | rebuilt as Today |
| `js/ui/views/topic.js` | rebuilt as the two-pane builder (route `topic`, alias `custom` unchanged) |
| `js/ui/views/testcentre.js` | one-click start + *Customise* |
| `js/ui/views/runner.js` | state patching, palette filters/jumps, phone sheet, submission sheet |
| `js/ui/views/report.js` | debrief restructure with real actions |
| `js/ui/views/mistakes.js`, `revision.js` | inline question panel, cross-signals, inline mark |
| `js/ui/reviewpanel.js` | **new** — one question-review panel shared by mistakes and revision |
| `js/ui/views/analytics.js` | practice actions on verdict rows; subject → builder |
| `js/ui/practicesheet.js` | smart-pool plan fix (session matches its explanation) |
| `js/app.js` | contextual palette "Do" items; Today-aware tab bar label |
| `css/app.css` | start rows, builder panes, basket chips, palette sheet, submit sheet, review panel |
| `sw.js` | cache version bump |
| `docs/UI.md` | anatomy of the new primitives |
| `tests/ux-journeys.test.js` | **new** — drives journeys A–E through the real DOM |
| existing tests | updated only where the contract intentionally changed |

---

## 10. Compatibility

* **No schema change.** No store is added, removed or re-indexed; `DB_VERSION` is unchanged. Every
  new number is derived at read time from the stores that already exist (tests, attempts, revision,
  mistakes, syllabus progress, question index).
* **No export-format change.** Backups and restores are byte-compatible; the new service reads the
  same fields the previous build wrote.
* **Routing.** Every route registered before still renders: `dashboard`, `test-centre`, `topic`,
  `custom` (alias), `smart`, `mistakes`, `revision`, `syllabus`, `analytics`, `pyq-analysis`,
  `syllabus-analysis`, `bank`, `settings`, `help`, `runner/:id`, `report/:id`. Deep links such as
  `#/topic/<subject>||<topic>` still pre-select the topic.
* **Offline / PWA.** No new network dependency; the bundled bank and its precache entry are
  untouched; the shell cache version is bumped so old clients pick up the new bundle.
* **Old tests.** Stored tests keep their own rules and continue to submit and report identically;
  nothing in the scoring service was touched.

## 11. Verification

`npm test` (service, DOM and end-to-end suites, plus the new journey suite) and `npm run check`
(static integrity, contrast, and the density budget measured on every rendered screen) must both be
green. The new journey tests drive: resume → submit; one-click paper; builder selection → start;
runner patch/jump/submit sheet; report → weak-topic practice; mistake panel → revision; revision
inline mark. Desktop, tablet and phone behaviour is verified structurally (jsdom + stylesheet rules,
as before — no browser is available in this environment); every new layout has a `≤1040`/`≤860`/
`≤560` rule, and the phone palette sheet is exercised in the DOM suite.
