# Proposal — merging the duplicated sections

> **Superseded in part (2026-10-15).** This proposal is the record of the merge
> that created the Syllabus and Insights sections. The *My plan* branch it
> describes — the third tab, the `+` toggles, *Add paper to My plan*, the reader's
> own items in the tree — was later removed from the interface, so the Syllabus
> section now shows the commission's lines only and every figure counts official
> topics. The stores and their plan fields were kept, and backups still
> round-trip them. See `docs/IMPLEMENTATION_REPORT.md` §7 and `docs/UI.md` §6 for
> the current behaviour.

Status: **implemented, 2026-10-13** — Option B, both pairs, on `arena/db290179-mymppsc`.
What was actually built is recorded in
[`docs/IMPLEMENTATION_REPORT.md` §6](IMPLEMENTATION_REPORT.md). This document is
kept as the design record and still reads in the future tense. Two things below
were decided differently during the build:

* **`revising` maps to `in_progress`, not to `revised`** (lines 87 and 153). In
  the planner's own ordering `revising` sat *before* `completed`, so reading it
  as the done-state `revised` would have marked items complete that the reader
  never marked complete.
* **The search box still searches official lines only.** Your own items are
  found by browsing *My plan*; extending search over both trees is open work.

The navigation currently offers 14 destinations, and the *Improve* group holds six of
them — including two syllabus screens and two analysis screens:

```
Improve   Mistake Book · Revision Centre · Syllabus & Planner · Syllabus Analysis
          · Analytics · PYQ Analysis
```

The two pairs look alike in the menu but are **not the same kind of duplication**, so
they should not be merged the same way.

| Pair | Relationship | Right move |
| --- | --- | --- |
| Syllabus & Planner ↔ Syllabus Analysis | **Same object, stored twice.** Two trees of the same curriculum, two progress stores, two nearly identical status vocabularies. | A real merge — one screen, one progress number. |
| Analytics ↔ PYQ Analysis | **Different objects on the same shelf.** One counts what the papers asked; the other measures what *you* did. Neither is redundant. | Merge the *section*, keep the two answers as tabs. |

---

## 1. Why the syllabus pair is a genuine defect, not just menu clutter

| | Syllabus & Planner (`#/syllabus`) | Syllabus Analysis (`#/syllabus-analysis`) |
| --- | --- | --- |
| Content | Whatever you type or import — nothing hard-coded | The commission's revised 2026 syllabus, shipped as data |
| Store | `syllabus` (via `js/services/planner.js`) | `syllabus_progress` (via `js/services/syllabus.js`) |
| Statuses | `not_started · in_progress · revising · completed` | `not_started · in_progress · completed · revised` |
| Extras | priority, target date, notes, tasks, bank stats per topic | bilingual text, Prelims/Mains, study breakdown, PYQ links |
| Feeds the dashboard? | **Yes** | **No** |
| Feeds study priorities / analytics? | **Yes** | **No** |

Three concrete consequences today:

1. **Progress splits in half.** Mark *जलवायु* completed on the official tree and the
   dashboard still reports 0% — `syllabus_progress` is read by exactly one screen plus
   the backup (`js/services/data.js`). Verified: no other module touches that store.
2. **Two words for one idea.** `revising` and `revised` are the same study state spelled
   differently in two files.
3. **The good fields are on the wrong tree.** You can set a target date and a priority on
   an item you typed yourself, but not on a real syllabus topic from the notification —
   which is the one you actually have to schedule.

The merge is therefore worth doing for its own sake, independent of the menu.

---

## 2. Recommended end state

```
Improve   Mistake Book · Revision Centre · Syllabus · Insights
```

14 nav entries → 12; the *Improve* group goes from six to four.

### 2a. Syllabus — one section, `#/syllabus`

Keep the **Syllabus Analysis UI as the shell** (it is the better of the two: rail,
tree, detail panel, search, bilingual rendering) and fold the planner into it as
capability rather than as a second screen.

```
┌ Syllabus ───────────────────────────────────────────────┐
│  [ Prelims ] [ Mains ] [ My plan ]        🔍 search      │
├──────────┬──────────────────────────────────────────────┤
│ Paper I  │  Unit 3 · जलवायु                              │
│ Paper II │  ── Official wording (hi / en)                │
│ My plan  │  ── Study breakdown           [derived]       │
│          │  ── Previous-year practice →  [links out]     │
│          │  ── Your plan                                 │
│          │       status · priority · target date · notes │
└──────────┴──────────────────────────────────────────────┘
```

* **Prelims / Mains** render the official tree exactly as they do now.
* **My plan** is the third branch: the planner tree for everything the notification
  does not contain (your own modules, optional subjects, current-affairs blocks),
  keeping *Suggest from question bank*, *Import JSON* and *Export*.
* **The detail panel is where the merge happens.** Every node — official or your own —
  gets the same block: status, priority, target date, notes, plus the bank linkage line
  the planner already computes (`available · attempted · accuracy`).
* **One status vocabulary:** `not_started · in_progress · completed · revised`.
  `revising → revised` is mapped on read, so nothing stored has to change.

**Storage: no migration, no `DB_VERSION` bump.** Both stores stay as they are — the
planner's `syllabus` store remains the user's own tree, `syllabus_progress` remains the
official one. A new `js/services/syllabus-hub.js` reads both and exposes one model and
one roll-up, so the dashboard, `studyPriorities()` and the syllabus screen finally agree
on a single completion figure. `syllabus_progress` rows gain optional `priority`,
`target_date` and `notes` — additive, and `data.js` already backs up whole rows, so old
backups restore untouched.

Keeping the stores separate also keeps the promise the README and `docs/LIMITATIONS.md`
make: *the planner is yours and nothing is hard-coded into it*. Merging the rows would
quietly put commission content into the user's tree.

**Deep links stay alive.** `#/syllabus-analysis` and `#/syllabus-analysis/<nodeId>`
become aliases of `#/syllabus` and `#/syllabus/official/<nodeId>` — the PYQ link chips,
the existing tests and any bookmark keep working.

### 2b. Insights — one section, `#/analytics`

```
┌ Insights ───────────────────────────────────────────────┐
│  1 171 stored · 12 papers · 318 attempted · 61% first-go │
│  [ My performance ]  [ The question bank ]               │
└─────────────────────────────────────────────────────────┘
```

* **My performance** — today's Analytics: accuracy, coverage, weak/strong topics,
  never attempted, under-practised, confidence, time per question, mistakes, revision,
  study priorities, test history.
* **The question bank** — today's PYQ Analysis: questions per subject, the subject × year
  matrix, questions per topic, papers in the bank.
* **A shared tile strip** states the *available ≠ attempted ≠ attempts* distinction once,
  at the top, instead of twice in two different wordings.

The tab boundary is exactly the data-source boundary that already exists in the code:
`services/pyq-analysis.js` is pure counting over the question index, `services/analytics.js`
is derived from stored attempts. **Neither service needs to change** — this is a shell
plus two panels. `#/pyq-analysis` and `#/pyq-analysis/<Subject>` alias into the bank tab.

Rule worth writing into `docs/UI.md`: the bank tab never shows performance, the
performance tab never counts the bank. That is what keeps the merge honest rather than a
pile of 20 cards.

---

## 3. Options, if you want more or less than that

| | Scope | Effort | Verdict |
| --- | --- | --- | --- |
| **A. Minimal** | Keep all four routes; only regroup and relabel the nav (`Syllabus ▸ Official / My plan`, `Insights ▸ Performance / Bank`). | ~1–2 h | Tidies the menu, leaves the split progress bug in place. |
| **B. Recommended** | §2 above: two sections, shared status vocabulary, unified roll-up, aliased routes, both stores kept. | ~1 focused session | Best value-to-risk. Fixes the real defect. |
| **C. Maximal** | Migrate planner rows onto official node ids, one store, `DB_VERSION 3` + migration. | 2–3× B | Not recommended: breaks the "your tree is yours" guarantee, matching by title is lossy, old-backup restore gets messy. |

---

## 4. Work breakdown for option B

| File | Change |
| --- | --- |
| `js/app.js` | `NAV` 14 → 12; register `syllabus` / `analytics`; alias `syllabus-analysis`, `pyq-analysis` |
| `js/ui/views/syllabus.js` | becomes the section shell (rail + tabs + detail) |
| `js/ui/views/syllabus-analysis.js` | demoted to the official-tree panel, imported not routed |
| `js/ui/views/analytics.js` | becomes the Insights shell with two panels |
| `js/ui/views/pyq-analysis.js` | demoted to the bank panel |
| `js/services/syllabus-hub.js` | **new** — unified model + one completion roll-up |
| `js/services/planner.js` | status map (`revising → revised`), roll-up delegates to the hub |
| `js/ui/views/dashboard.js` | one syllabus card, combined completion |
| `css/app.css` | one tab pattern, tokens only (`npm run check` enforces contrast/tokens) |
| `sw.js` | precache list **and the `VERSION` bump** — repo rule for any precached file |
| `tests/` | alias-route tests; retarget `syllabus-analysis.test.js`, `pyq-analysis.test.js`, nav labels in `ui.test.js` |
| `docs/UI.md`, `README.md`, `docs/LIMITATIONS.md` | section table, UI §6, the honesty rules above |

Guardrails that must stay green: `npm test` and `npm run check` (the latter already
asserts that every nav route is registered and that `dashboard`, `syllabus`, `analytics`
et al. exist, so the merged names must keep those two route ids).
