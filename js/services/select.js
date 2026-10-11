/**
 * select.js — Question selection engine.
 *
 * Powers topic practice, the custom test builder, mistake retries, revision
 * retries and smart practice. All selection is explainable: callers receive the
 * reasoning that is shown to the user.
 */

import { state } from '../core/state.js';
import { makeRng, shuffle, jaccard, shingles, tokenSet, round, sortBy, clamp } from '../core/util.js';

/* ------------------------------------------------------ attempt summary --- */

/** Reduce raw attempt rows into per-question facts used by filters and analytics. */
export function buildAttemptSummary(attempts) {
  const map = new Map();
  for (const a of attempts) {
    let row = map.get(a.question_id);
    if (!row) {
      row = {
        question_id: a.question_id,
        attempts: 0,
        correct: 0,
        incorrect: 0,
        skipped: 0,
        flagged: 0,
        lowConfidenceCorrect: 0,
        firstOutcome: null,
        lastOutcome: null,
        lastAttemptAt: null,
        everIncorrect: false,
        everSkipped: false,
        everFlagged: false,
        everCorrect: false,
        totalTimeMs: 0,
        confidence: null,
        subject: a.subject,
        topic: a.topic,
      };
      map.set(a.question_id, row);
    }
    row.attempts += 1;
    row.totalTimeMs += a.time_spent_ms || 0;
    if (a.outcome === 'correct') {
      row.correct += 1;
      row.everCorrect = true;
    } else if (a.outcome === 'incorrect') {
      row.incorrect += 1;
      row.everIncorrect = true;
    } else if (a.outcome === 'unanswered') {
      row.skipped += 1;
      row.everSkipped = true;
    }
    if (a.flagged) {
      row.flagged += 1;
      row.everFlagged = true;
    }
    if (a.outcome === 'correct' && (a.confidence === 'unsure' || a.confidence === 'guessed')) row.lowConfidenceCorrect += 1;
    if (!row.firstOutcome) row.firstOutcome = a.outcome;
    row.lastOutcome = a.outcome;
    row.lastAttemptAt = a.created_at;
    row.confidence = a.confidence ?? row.confidence;
  }
  return map;
}

export const ATTEMPT_STATE_FILTERS = {
  any: 'Any question',
  unseen: 'Never attempted',
  attempted: 'Previously attempted',
  incorrect: 'Answered incorrectly before',
  skipped: 'Skipped before',
  flagged: 'Flagged before',
  low_confidence_correct: 'Correct but uncertain before',
  ever_correct: 'Answered correctly before',
};

/* ------------------------------------------------------------- filtering -- */

/**
 * Filter question metas.
 * @param {Iterable} metas question index metas
 * @param {object} f filters
 * @param {Map} attemptSummary from buildAttemptSummary
 */
export function filterMetas(metas, f = {}, attemptSummary = new Map()) {
  const out = [];
  const search = (f.search || '').trim().toLowerCase();
  // "all", "" and null/undefined all mean "do not filter on this dimension".
  const set = (value) => (value === undefined || value === null || value === '' || value === 'all' ? null : value);
  const paperId = set(f.paperId);
  const year = set(f.year);
  for (const meta of metas) {
    if (paperId && meta.paper_id !== paperId) continue;
    if (year && String(meta.year) !== String(year)) continue;
    if (f.subject && f.subject !== 'all' && (meta.subject || 'Unclassified') !== f.subject) continue;
    if (f.topic && f.topic !== 'all' && (meta.topic || 'Unclassified') !== f.topic) continue;
    if (f.subtopic && f.subtopic !== 'all' && (meta.subtopic || '') !== f.subtopic) continue;
    if (f.questionType && f.questionType !== 'all' && meta.question_type !== f.questionType) continue;
    if (f.subjectIsUnclassified === true && !meta.unclassified) continue;
    if (f.onlyUncertainClassification && !meta.uncertain) continue;
    if (f.language && f.language !== 'all' && !meta.langs.includes(f.language)) continue;
    if (f.excludeDemonstration && meta.demonstration) continue;
    if (f.onlyDemonstration && !meta.demonstration) continue;
    if (f.onlyWithExplanation && !meta.hasExplanation) continue;
    if (f.onlyReviewedExplanation && !['reviewed', 'approved'].includes(meta.explanationStatus)) continue;
    if (f.onlyMissingAnswers && !(meta.needsAttention && !meta.hasSuppliedAnswer)) continue;
    if (f.onlyDisputed && !meta.disputed) continue;
    if (f.onlyIncompletePapers && !meta.paper_incomplete) continue;

    const summary = attemptSummary.get(meta.id) || null;
    const attempted = Boolean(summary && summary.attempts);
    switch (f.attemptState) {
      case 'unseen':
        if (attempted) continue;
        break;
      case 'attempted':
        if (!attempted) continue;
        break;
      case 'incorrect':
        if (!summary?.everIncorrect) continue;
        break;
      case 'skipped':
        if (!summary?.everSkipped) continue;
        break;
      case 'flagged':
        if (!summary?.everFlagged) continue;
        break;
      case 'low_confidence_correct':
        if (!summary?.lowConfidenceCorrect) continue;
        break;
      case 'ever_correct':
        if (!summary?.everCorrect) continue;
        break;
      default:
        break;
    }
    if (f.minAttempts && (!summary || summary.attempts < f.minAttempts)) continue;
    if (f.idsOnly && !f.idsOnly.has(meta.id)) continue;
    if (search && !(meta.id.toLowerCase().includes(search) || (meta.topic || '').toLowerCase().includes(search) || (meta.subject || '').toLowerCase().includes(search))) continue;
    out.push(meta);
  }
  return out;
}

/**
 * Availability counts for the practice setup screens: total matching, unseen,
 * previously incorrect, and per-subject/per-topic breakdown of the current set.
 */
export function availability(metas, filters, attemptSummary) {
  const matching = filterMetas(metas, filters, attemptSummary);
  const unseen = matching.filter((m) => !attemptSummary.get(m.id)?.attempts);
  const incorrect = matching.filter((m) => attemptSummary.get(m.id)?.everIncorrect);
  const skipped = matching.filter((m) => attemptSummary.get(m.id)?.everSkipped);
  const bySubject = {};
  const byTopic = {};
  for (const m of matching) {
    const s = m.subject || 'Unclassified';
    bySubject[s] = (bySubject[s] || 0) + 1;
    const t = m.topic || 'Unclassified';
    const key = `${s}||${t}`;
    byTopic[key] = (byTopic[key] || 0) + 1;
  }
  return { matching, total: matching.length, unseen: unseen.length, incorrect: incorrect.length, skipped: skipped.length, bySubject, byTopic };
}

/* ------------------------------------------------------------- selection -- */

/**
 * Pick questions from a candidate list.
 * @param {Array} candidates metas
 * @param {object} opts {count, strategy, attemptSummary, repeatPolicy, seed, recentIds}
 */
export function selectQuestions(candidates, opts = {}) {
  const {
    count = 10,
    strategy = 'random',
    attemptSummary = new Map(),
    repeatPolicy = state.settings.repeatPolicy,
    seed = Date.now() % 2147483647,
    excludeIds = new Set(),
  } = opts;
  const rng = makeRng(seed);
  const pool = candidates.filter((c) => !excludeIds.has(c.id));
  const notes = [];

  let ordered = pool.slice();
  if (strategy === 'weakest-first' || strategy === 'smart') {
    ordered.sort((a, b) => weaknessScore(b, attemptSummary, state.settings) - weaknessScore(a, attemptSummary, state.settings));
  } else if (strategy === 'least-attempted') {
    ordered.sort((a, b) => (attemptSummary.get(a.id)?.attempts || 0) - (attemptSummary.get(b.id)?.attempts || 0));
  } else {
    ordered = shuffle(ordered, rng);
  }

  // Repeat management: prefer unseen questions, then space out recently seen ones.
  const cooldownMs = (repeatPolicy?.cooldownDays ?? 3) * 86400000;
  const now = Date.now();
  const fresh = [];
  const cooling = [];
  const repeats = [];
  for (const meta of ordered) {
    const summary = attemptSummary.get(meta.id);
    if (!summary || !summary.attempts) fresh.push(meta);
    else if (summary.lastAttemptAt && now - new Date(summary.lastAttemptAt).getTime() < cooldownMs) cooling.push(meta);
    else repeats.push(meta);
  }

  const chosen = [];
  const push = (list, limit) => {
    for (const meta of list) {
      if (chosen.length >= limit) break;
      if (chosen.some((c) => c.id === meta.id)) continue;
      chosen.push(meta);
    }
  };

  const target = Math.min(count, pool.length);
  if (repeatPolicy?.preferUnseen !== false) {
    const unseenTarget = Math.round(target * clamp(repeatPolicy?.unseenRatio ?? 0.7, 0, 1));
    push(fresh, unseenTarget);
    notes.push(`${chosen.length} unseen question(s) chosen first to widen coverage.`);
    push(repeats, target);
    push(cooling, target);
    if (chosen.length < target) push(fresh, target);
  } else {
    push(ordered, target);
  }

  const remaining = pool.filter((p) => !chosen.some((c) => c.id === p.id));
  notes.push(`${remaining.length} question(s) were not needed for this session.`);

  return { selected: chosen.slice(0, target), notes, seed, buckets: { fresh: fresh.length, cooling: cooling.length, repeats: repeats.length } };
}

/** Higher = weaker evidence of mastery (used for prioritisation, never as a verdict). */
export function weaknessScore(meta, attemptSummary, settings = state.settings) {
  const s = attemptSummary.get(meta.id);
  if (!s || !s.attempts) return 55; // unseen questions rank mid-high for coverage
  const scored = s.correct + s.incorrect;
  const accuracy = scored ? s.correct / scored : 0.5;
  const evidence = clamp(scored / 5, 0, 1); // want ~5 attempts before trusting accuracy
  let score = (1 - accuracy) * 100 * (0.5 + 0.5 * evidence);
  score += s.incorrect * 6;
  score += s.skipped * 4;
  score += s.lowConfidenceCorrect * 5;
  if (s.lastOutcome === 'incorrect') score += 10;
  if (meta.disputed) score += 4;
  if (meta.explanationStatus === 'missing') score -= 0; // no effect: explanations are not a difficulty signal
  return round(score, 2);
}

/* -------------------------------------------------------- smart practice -- */

export const SMART_BUCKETS = [
  { id: 'revision_due', label: 'Due for revision', weight: 0.25, why: 'Questions whose adaptive revision date has arrived or passed.' },
  { id: 'repeated_mistakes', label: 'Repeated mistakes', weight: 0.25, why: 'Questions you have answered incorrectly, weighted towards repeated errors.' },
  { id: 'skipped', label: 'Previously skipped', weight: 0.1, why: 'Questions you left unanswered — they stay separate from wrong answers.' },
  { id: 'weak_topics', label: 'Weak topics', weight: 0.1, why: 'Topics where your first-attempt accuracy is low on a usable sample size.' },
  { id: 'unseen', label: 'Unseen coverage', weight: 0.2, why: 'Questions you have never attempted, so the bank gets broader coverage.' },
  { id: 'under_practised', label: 'Under-practised topics', weight: 0.1, why: 'Topics with few attempts relative to the number of questions available.' },
];

/**
 * Assemble a smart-practice set and explain exactly why it was built.
 */
export function smartPracticePlan({
  metas,
  attemptSummary,
  revisionRecords,
  count = 20,
  seed = Date.now() % 2147483647,
  includeDemonstration = true,
  topicStats = null,
  respectCooldown = true,
  repeatPolicy = state.settings.repeatPolicy,
}) {
  const rng = makeRng(seed);
  const today = new Date().toISOString().slice(0, 10);
  const byId = new Map(Array.from(metas).map((m) => [m.id, m]));
  const allCandidates = Array.from(metas).filter((m) => includeDemonstration || !m.demonstration);
  // Questions answered within the cooldown window are held back from the
  // coverage-oriented pools (unseen / under-practised / fallback), but they are
  // still eligible where a repeat is deliberate: due revisions, repeated
  // mistakes and previously skipped questions.
  const cooldownMs = (repeatPolicy?.cooldownDays ?? 3) * 86400000;
  const coolingIds = new Set(
    Array.from(attemptSummary.entries())
      .filter(([, s]) => s.lastAttemptAt && Date.now() - new Date(s.lastAttemptAt).getTime() < cooldownMs)
      .map(([id]) => id),
  );
  const candidates = respectCooldown ? allCandidates.filter((m) => !coolingIds.has(m.id)) : allCandidates;
  if (!candidates.length) candidates.push(...allCandidates);

  const revisionDueIds = new Set();
  const revisionMap = new Map();
  for (const rec of revisionRecords || []) {
    revisionMap.set(rec.question_id, rec);
    if (rec.next_due && rec.next_due <= today && byId.has(rec.question_id)) revisionDueIds.add(rec.question_id);
  }

  const repeatedMistakeIds = new Set();
  const mistakeIds = new Set();
  for (const [id, s] of attemptSummary.entries()) {
    if (!byId.has(id) || !s.attempts) continue;
    if (s.incorrect > 0) mistakeIds.add(id);
    if (s.incorrect >= 2 || (s.incorrect >= 1 && s.lastOutcome === 'incorrect')) repeatedMistakeIds.add(id);
  }

  const skippedIds = new Set();
  for (const [id, s] of attemptSummary.entries()) if (byId.has(id) && s.skipped > 0) skippedIds.add(id);

  const unseenIds = new Set(candidates.filter((m) => !attemptSummary.get(m.id)?.attempts).map((m) => m.id));

  // Weak topics: at least 3 scored attempts and first-attempt accuracy below 60%.
  const topicAgg = topicStats || computeTopicStats(candidates, attemptSummary);
  const weakTopics = new Set(Object.values(topicAgg).filter((t) => t.scored >= 3 && t.accuracy < 0.6).map((t) => t.key));
  const weakTopicIds = new Set(candidates.filter((m) => weakTopics.has(`${m.subject || 'Unclassified'}||${m.topic || 'Unclassified'}`)).map((m) => m.id));

  const underPractisedIds = new Set(
    candidates
      .filter((m) => {
        const t = topicAgg[`${m.subject || 'Unclassified'}||${m.topic || 'Unclassified'}`];
        if (!t) return false;
        const attemptsInTopic = t.attempts;
        const coverageRatio = t.available ? attemptsInTopic / t.available : 1;
        return coverageRatio < 0.25 && t.available >= 4;
      })
      .map((m) => m.id),
  );

  const buckets = {
    revision_due: shuffle(Array.from(revisionDueIds), rng),
    repeated_mistakes: shuffle(Array.from(repeatedMistakeIds), rng),
    skipped: shuffle(Array.from(skippedIds), rng),
    weak_topics: shuffle(Array.from(weakTopicIds), rng),
    unseen: shuffle(Array.from(unseenIds), rng),
    under_practised: shuffle(Array.from(underPractisedIds), rng),
  };

  const chosen = [];
  const chosenIds = new Set();
  const allocation = {};
  const explain = [];
  const target = Math.min(count, candidates.length);

  const take = (bucketId, limit) => {
    const list = buckets[bucketId] || [];
    let taken = 0;
    for (const id of list) {
      if (taken >= limit || chosen.length >= target) break;
      if (chosenIds.has(id)) continue;
      chosen.push(id);
      chosenIds.add(id);
      taken += 1;
    }
    if (taken) allocation[bucketId] = (allocation[bucketId] || 0) + taken;
    else if (allocation[bucketId] === undefined) allocation[bucketId] = 0;
    return taken;
  };

  for (const bucket of SMART_BUCKETS) {
    const want = Math.max(0, Math.round(target * bucket.weight));
    if (want) take(bucket.id, want);
  }
  // Redistribute any shortfall, preferring unseen coverage and then mistakes.
  const fillOrder = ['unseen', 'repeated_mistakes', 'revision_due', 'weak_topics', 'under_practised', 'skipped'];
  let guard = 0;
  while (chosen.length < target && guard < 40) {
    guard += 1;
    let progressed = false;
    for (const bucketId of fillOrder) {
      if (chosen.length >= target) break;
      const before = chosen.length;
      take(bucketId, target - chosen.length);
      if (chosen.length > before) progressed = true;
    }
    if (!progressed) break;
  }
  // Final fallback: anything not yet chosen (e.g. all questions are recent repeats).
  if (chosen.length < target) {
    for (const meta of shuffle(candidates, rng)) {
      if (chosen.length >= target) break;
      if (chosenIds.has(meta.id)) continue;
      chosen.push(meta.id);
      chosenIds.add(meta.id);
      allocation.fallback = (allocation.fallback || 0) + 1;
    }
  }

  for (const bucket of SMART_BUCKETS) {
    const n = allocation[bucket.id] || 0;
    if (n) explain.push(`${n} question(s) — ${bucket.why}`);
  }
  if (respectCooldown && coolingIds.size) {
    explain.push(`${coolingIds.size} question(s) answered in the last ${repeatPolicy?.cooldownDays ?? 3} day(s) were held back from the coverage pools; deliberate repeats (due revisions and mistakes) are still included.`);
  }
  if (allocation.fallback) explain.push(`${allocation.fallback} question(s) — remaining pool (other suitable questions were already included).`);
  explain.push(
    `Repeat policy: ${repeatPolicy?.preferUnseen !== false ? 'unseen questions are preferred' : 'repeats are allowed freely'}, with a ${repeatPolicy?.cooldownDays ?? 3}-day cooldown before the same question is served again.`,
  );
  explain.push('Historical question frequency is a study-prioritisation aid only; it is not a prediction of what a future paper will contain.');

  return {
    questionIds: chosen,
    allocation,
    explain,
    bucketSizes: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    counts: { revisionDue: revisionDueIds.size, repeatedMistakes: repeatedMistakeIds.size, mistakes: mistakeIds.size, skipped: skippedIds.size, unseen: unseenIds.size, weakTopics: weakTopicIds.size, underPractised: underPractisedIds.size, cooling: coolingIds.size },
    weakTopicKeys: Array.from(weakTopics),
  };
}

export function computeTopicStats(metas, attemptSummary) {
  const out = {};
  const ensure = (meta) => {
    const key = `${meta.subject || 'Unclassified'}||${meta.topic || 'Unclassified'}`;
    if (!out[key]) out[key] = { key, subject: meta.subject || 'Unclassified', topic: meta.topic || 'Unclassified', available: 0, attempts: 0, scored: 0, correct: 0, incorrect: 0, skipped: 0, unseen: 0, accuracy: NaN, firstAttemptAccuracy: NaN };
    return out[key];
  };
  for (const meta of metas) {
    const row = ensure(meta);
    row.available += 1;
    const s = attemptSummary.get(meta.id);
    if (!s || !s.attempts) {
      row.unseen += 1;
      continue;
    }
    row.attempts += s.attempts;
    row.correct += s.correct;
    row.incorrect += s.incorrect;
    row.skipped += s.skipped;
    row.scored += s.correct + s.incorrect;
  }
  for (const row of Object.values(out)) {
    row.accuracy = row.scored ? row.correct / row.scored : NaN;
    row.coverage = row.available ? (row.available - row.unseen) / row.available : 0;
  }
  return out;
}

/* --------------------------------------------------------- duplicates ----- */

/** Exact duplicate groups (same text + options under different ids). */
export function findExactDuplicateGroups(metas) {
  const byFingerprint = new Map();
  for (const meta of metas) {
    const fp = meta.fingerprint || null;
    if (!fp) continue;
    if (!byFingerprint.has(fp)) byFingerprint.set(fp, []);
    byFingerprint.get(fp).push(meta.id);
  }
  return Array.from(byFingerprint.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([fingerprint, ids]) => ({ fingerprint, ids }));
}

/**
 * Near-duplicate groups using 3-word shingles and an inverted index so that a
 * large bank does not require a quadratic comparison.
 */
export function findNearDuplicates(metas, threshold = 0.62, limit = 200) {
  const list = Array.from(metas);
  const shingleMap = new Map();
  const tokenMap = new Map();
  const index = new Map();
  for (const meta of list) {
    const text = meta.text_key || '';
    if (!text) continue;
    const set = shingles(text, 3);
    shingleMap.set(meta.id, set);
    tokenMap.set(meta.id, tokenSet(text));
    let count = 0;
    for (const s of set) {
      if (count >= 40) break;
      if (!index.has(s)) index.set(s, []);
      const bucket = index.get(s);
      if (bucket.length < 40) bucket.push(meta.id);
      count += 1;
    }
  }
  const pairs = [];
  const seen = new Set();
  let budget = 120000;
  for (const bucket of index.values()) {
    if (bucket.length < 2 || bucket.length > 40) continue;
    for (let i = 0; i < bucket.length && budget > 0; i += 1) {
      for (let j = i + 1; j < bucket.length && budget > 0; j += 1) {
        const [a, b] = [bucket[i], bucket[j]].sort();
        const key = `${a}|${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        budget -= 1;
        const sim = Math.max(jaccard(tokenMap.get(a), tokenMap.get(b)), jaccard(shingleMap.get(a), shingleMap.get(b)));
        if (sim >= threshold) pairs.push({ a, b, similarity: round(sim, 3) });
        if (pairs.length >= limit) return pairs.sort((x, y) => y.similarity - x.similarity);
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

/* ------------------------------------------------------ paper utilities --- */

/** Order a paper's questions exactly as the source paper printed them. */
export function paperOrder(paper, metas) {
  const inPaper = Array.from(metas).filter((m) => m.paper_id === paper?.paper_id);
  const byId = new Map(inPaper.map((m) => [m.id, m]));
  const ordered = [];
  for (const id of paper?.question_order || []) if (byId.has(id)) ordered.push(byId.get(id));
  const included = new Set(ordered.map((m) => m.id));
  const rest = inPaper
    .filter((m) => !included.has(m.id))
    .sort(sortBy((m) => Number(m.question_number) || 0, 'asc'));
  return { ordered: [...ordered, ...rest], reconstructed: rest.length > 0 };
}

/** Group questions of a paper into year/set identity for the paper picker. */
export function paperSummary(paper, metas) {
  const inPaper = metas.filter((m) => m.paper_id === paper.paper_id);
  const withAnswers = inPaper.filter((m) => m.hasSuppliedAnswer || m.hasVerifiedAnswer).length;
  const disputed = inPaper.filter((m) => m.disputed).length;
  const bilingual = inPaper.filter((m) => m.langs.includes('en') && m.langs.includes('hi')).length;
  const declared = paper.original_question_count;
  return {
    present: inPaper.length,
    declared,
    complete: declared === null ? null : declared === inPaper.length,
    missingCount: declared === null ? null : Math.max(0, declared - inPaper.length),
    withAnswers,
    missingAnswers: inPaper.length - withAnswers,
    disputed,
    bilingual,
    scoringKnown: Boolean(paper.scoring?.rules_known),
    orderPreserved: Boolean(paper.original_order_preserved),
    placeholder: Boolean(paper.placeholder),
  };
}
