/**
 * nextup.js — what is worth doing next, derived only from stored data.
 *
 * The dashboard used to describe state and then link to other screens, and each
 * of those screens rebuilt its own version of "practise something": the practice
 * sheet had four pools, Smart Practice had a fifth, the mistake book and the
 * report each assembled their own retry sets. This module is the single place
 * that answers the question "given everything recorded on this device, what can
 * I start right now, and how many questions would it contain?".
 *
 * Every option carries:
 *
 *   id      stable key (used by the DOM and by tests)
 *   kind    which starter builds the session (`resume`, `smart`, `revision`,
 *           `paper`, `topic`, `unseen`, `mistakes`)
 *   label   the action's name, e.g. "Smart session"
 *   detail  one honest line: counts, accuracy, sample size, or why it is empty
 *   count   how many questions the session would hold (0 → the action is off)
 *   pool()  async resolver returning `{ ids, label, notes, config }`
 *
 * Nothing here invents performance data: a topic's accuracy is only described
 * when `studyPriorities()` already judged it, and an option with no stored
 * evidence (never attempted, no due revision, empty mistake book) returns
 * count 0 with a plain explanation instead of being hidden silently.
 */

import { state } from '../core/state.js';
import { STORES } from '../core/constants.js';
import * as db from '../core/db.js';
import { fmtPct, fmtRelative } from '../core/util.js';
import { loadAnalytics, studyPriorities } from './analytics.js';
import { loadSyllabusWorkspace } from './syllabus-hub.js';
import { allAttempts, listMistakes } from './attempts.js';
import { buildAttemptSummary, smartPracticePlan, selectQuestions } from './select.js';
import { allRevisionRecords, bucketise, dueQueue } from './revision.js';
import * as tests from './tests.js';

/** Default size of an automatically assembled sitting. */
export const DEFAULT_SESSION_SIZE = 20;

const bankIds = () => state.questionIndex;

/** Keep only ids that are still in the bank (an import can be undone). */
function inBank(ids) {
  const bank = bankIds();
  return Array.from(new Set(ids.filter((id) => bank.has(id))));
}

function metasFor(ids) {
  return ids.map((id) => state.questionIndex.get(id)).filter(Boolean);
}

/**
 * Everything one dashboard render needs, loaded once.
 *
 * Ordering is by how soon the evidence says the work is worth doing, not by
 * feature area: an unfinished sitting always wins, then scheduled revision,
 * then recorded weakness, then breadth (unseen questions, an unattempted paper).
 */
export async function buildStartOptions({ size = DEFAULT_SESSION_SIZE, includeResume = true } = {}) {
  const metas = Array.from(state.questionIndex.values());
  const options = [];
  if (!metas.length) return { options, bank: { total: 0, papers: 0 } };

  const [unfinished, revisionRecords, attempts, mistakeRows, submitted] = await Promise.all([
    includeResume ? tests.unfinishedTests() : Promise.resolve([]),
    allRevisionRecords(),
    allAttempts(),
    listMistakes({ status: 'open' }),
    tests.listTests({ status: 'submitted', limit: 500 }),
  ]);
  const attemptSummary = buildAttemptSummary(attempts);

  /* ------------------------------------------------------- 1 · resume --- */

  if (unfinished.length) {
    const open = unfinished[0];
    let progress = null;
    try {
      progress = tests.testProgress(open);
    } catch {
      progress = null;
    }
    options.push({
      id: 'resume',
      kind: 'resume',
      label: open.label || 'Your unfinished session',
      detail: progress
        ? `${progress.answered} answered · ${progress.unanswered} left · saved ${fmtRelative(open.updated_at)}`
        : `Saved ${fmtRelative(open.updated_at)}`,
      count: progress ? progress.unanswered : 0,
      countLabel: progress ? `${progress.answered}/${progress.total}` : '',
      answered: progress ? progress.answered : 0,
      total: progress ? progress.total : 0,
      startedAt: open.started_at || open.created_at || open.updated_at,
      tone: 'accent',
      href: `runner/${encodeURIComponent(open.id)}`,
      extra: unfinished.length > 1 ? `${unfinished.length - 1} more in progress` : '',
    });
  }

  /* ----------------------------------------------------- 2 · revision --- */

  const due = dueQueue(revisionRecords);
  const dueIds = inBank(due.ids);
  const buckets = bucketise(revisionRecords);
  options.push({
    id: 'revision',
    kind: 'revision',
    label: 'Revision due',
    detail: dueIds.length
      ? `${buckets.overdue.length} overdue, ${buckets.dueToday.length} due today${due.remaining ? `, ${due.remaining} later this week` : ''}`
      : buckets.upcoming.length
        ? `nothing due now, ${buckets.upcoming.length} scheduled`
        : 'nothing scheduled yet',
    count: dueIds.length,
    countLabel: dueIds.length ? `${dueIds.length} question${dueIds.length === 1 ? '' : 's'}` : '',
    pool: async () => ({
      ids: dueIds,
      label: `Revision — ${dueIds.length} due question(s)`,
      notes: ['Questions whose scheduled revision date has arrived or passed.'],
      config: { feedbackMode: 'learning', durationMinutes: null },
      orderSource: 'due_first',
    }),
  });

  /* -------------------------------------------------------- 3 · smart --- */

  const plan = smartPracticePlan({
    metas,
    attemptSummary,
    revisionRecords,
    count: size,
    includeDemonstration: true,
  });
  const smartIds = inBank(plan.questionIds);
  const smartParts = [
    plan.counts.revisionDue ? `${plan.counts.revisionDue} due` : null,
    plan.counts.repeatedMistakes ? `${plan.counts.repeatedMistakes} repeated mistake(s)` : null,
    plan.counts.unseen ? `${plan.counts.unseen} unseen` : null,
  ].filter(Boolean);
  options.push({
    id: 'smart',
    kind: 'smart',
    label: `Smart session`,
    detail: smartIds.length
      ? `${smartParts.join(', ') || 'a balanced mix of the bank'}`
      : 'not enough questions are available yet',
    count: smartIds.length,
    countLabel: smartIds.length ? `${smartIds.length} questions` : '',
    pool: async () => ({
      ids: smartIds,
      label: `Smart practice — ${smartIds.length} questions`,
      notes: plan.explain,
      config: { feedbackMode: state.settings.feedbackMode, durationMinutes: null },
      orderSource: 'shuffled',
    }),
  });

  /* ------------------------------------------------------- 4 · paper --- */

  const submittedPaperIds = new Set(submitted.map((t) => t.paper_id || t.paper_snapshot?.paper_id).filter(Boolean));
  const papers = Array.from(state.papers.values()).sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  const latestUnattempted = papers.find((p) => !submittedPaperIds.has(p.paper_id) && (p.question_order?.length || 0) > 0);
  const paper = latestUnattempted || papers[0] || null;
  if (paper) {
    const total = (paper.question_order || []).length;
    options.push({
      id: 'paper',
      kind: 'paper',
      label: paper.year ? `MPPSC ${paper.year} paper` : paper.paper_name || 'A stored paper',
      detail: latestUnattempted
        ? `${total} questions, ${paper.duration_minutes ? `${paper.duration_minutes} minutes, ` : ''}not attempted yet`
        : `${total} questions, ${submittedPaperIds.has(paper.paper_id) ? 'attempted before' : 'a full simulation'}`,
      count: total,
      countLabel: `${total} questions`,
      paper,
      pool: async () => ({
        ids: (paper.question_order || []).filter((id) => state.questionIndex.has(id)),
        label: `${paper.paper_name || paper.exam || paper.paper_id}${paper.year ? ` ${paper.year}` : ''}${paper.set_code ? ` (set ${paper.set_code})` : ''}`,
        notes: ['Original paper order retained.'],
        config: { feedbackMode: 'exam' },
        orderSource: 'original',
        paper,
        kind: 'pyq_full',
      }),
    });
  }

  /* -------------------------------------- 5 · weakest recorded topic --- */

  const [curriculum, analyticsBundle] = await Promise.all([loadSyllabusWorkspace(), loadAnalytics({ includeMistakes: false }).catch(() => null)]);
  const analytics = analyticsBundle?.analytics || null;
  let weak = null;
  if (analytics) {
    const priorities = studyPriorities({ analytics, syllabusProgress: curriculum.progress, limit: 40 });
    // The recommendation must be a topic with questions *and* recorded evidence
    // that it is not yet strong; a topic with no attempt is offered by "unseen"
    // instead, where the wording can be honest about the absence of evidence.
    weak = priorities.find((row) => row.available > 0 && row.attempts > 0 && (row.scored < 3 || row.accuracy < 0.7)) || null;
    if (!weak) weak = priorities.find((row) => row.attempts > 0 && row.available >= 3) || null;
  }
  if (weak) {
    const topicMetas = metas.filter((m) => (m.subject || 'Unclassified') === weak.subject && (m.topic || 'Unclassified') === weak.topic);
    const ids = topicMetas.map((m) => m.id);
    const evidence = weak.scored >= 3 ? `${fmtPct(weak.accuracy)} over ${weak.scored} judged` : `${weak.scored} judged answer(s) — thin evidence`;
    options.push({
      id: 'weak',
      kind: 'topic',
      label: weak.topic,
      detail: `${weak.subject} · ${evidence} · ${ids.length} question(s) stored`,
      count: Math.min(ids.length, size),
      countLabel: `${Math.min(ids.length, size)} questions`,
      subject: weak.subject,
      topic: weak.topic,
      reasons: weak.reasons,
      pool: async () => ({
        ids: selectQuestions(topicMetas, {
          count: Math.min(ids.length, size),
          strategy: 'weakest-first',
          attemptSummary,
          repeatPolicy: { preferUnseen: true, cooldownDays: state.settings.repeatPolicy.cooldownDays },
        }).selected.map((m) => m.id),
        label: `Weak topic — ${weak.topic}`,
        notes: ['Chosen because this topic carries the strongest recorded evidence of weakness.', ...(weak.reasons || []).map((r) => `Evidence: ${r}.`)],
        config: { feedbackMode: 'learning', durationMinutes: null },
        orderSource: 'weakest_first',
      }),
    });
  }

  /* ------------------------------------------------------ 6 · unseen --- */

  const unseenIds = metas.filter((m) => !attemptSummary.get(m.id)?.attempts).map((m) => m.id);
  options.push({
    id: 'unseen',
    kind: 'unseen',
    label: 'Questions you have never seen',
    detail: unseenIds.length
      ? `${unseenIds.length} of ${metas.length} never attempted`
      : 'every stored question attempted',
    count: Math.min(unseenIds.length, size),
    countLabel: unseenIds.length ? `${Math.min(unseenIds.length, size)} questions` : '',
    pool: async () => ({
      ids: selectQuestions(metasFor(unseenIds), {
        count: Math.min(unseenIds.length, size),
        strategy: 'random',
        attemptSummary,
        repeatPolicy: { preferUnseen: true, cooldownDays: 0 },
      }).selected.map((m) => m.id),
      label: 'Unseen questions',
      notes: ['Questions with no recorded attempt at the time this session was started.'],
      config: { feedbackMode: 'exam', durationMinutes: null },
      orderSource: 'shuffled',
    }),
  });

  /* ---------------------------------------------------- 7 · mistakes --- */

  const mistakeIds = inBank(mistakeRows.map((row) => row.question_id));
  options.push({
    id: 'mistakes',
    kind: 'mistakes',
    label: 'Open mistakes',
    detail: mistakeIds.length
      ? `${mistakeIds.length} still open`
      : 'nothing open',
    count: Math.min(mistakeIds.length, size),
    countLabel: mistakeIds.length ? `${Math.min(mistakeIds.length, size)} questions` : '',
    pool: async () => ({
      ids: mistakeIds.slice(0, size),
      label: `Open mistakes — ${Math.min(mistakeIds.length, size)} question(s)`,
      notes: ['Questions still open in the Mistake Book (wrong, skipped or flagged).'],
      config: { feedbackMode: 'learning', durationMinutes: null },
      orderSource: 'due_first',
    }),
  });

  return {
    options,
    bank: { total: metas.length, papers: papers.length, unseen: unseenIds.length },
    counts: {
      dueRevision: dueIds.length,
      smart: smartIds.length,
      openMistakes: mistakeIds.length,
      unseen: unseenIds.length,
      unfinished: unfinished.length,
    },
  };
}

/**
 * The revision / mistake cross-signal used by both review screens: how many
 * questions carry *both* records. It is a count over stored ids only.
 */
export async function reviewOverlap() {
  const [records, mistakeRows] = await Promise.all([allRevisionRecords(), listMistakes({ status: 'open' })]);
  const due = dueQueue(records);
  const dueSet = new Set(inBank(due.ids));
  const openMistakeIds = new Set(inBank(mistakeRows.map((row) => row.question_id)));
  let dueAndOpen = 0;
  for (const id of dueSet) if (openMistakeIds.has(id)) dueAndOpen += 1;
  return {
    due: dueSet.size,
    openMistakes: openMistakeIds.size,
    dueAndOpen,
    dueIds: Array.from(dueSet),
    openMistakeIds: Array.from(openMistakeIds),
    /** A session of the questions that are both: the highest-value review. */
    bothIds: Array.from(dueSet).filter((id) => openMistakeIds.has(id)),
  };
}

/** Count rows in the revision store without loading the whole schedule twice. */
export async function revisionCount() {
  try {
    return await db.count(STORES.REVISION);
  } catch {
    return 0;
  }
}
