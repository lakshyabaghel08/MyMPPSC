/**
 * pyq-analysis.js — what the previous-year questions on this device actually cover.
 *
 * Pure counting over the in-memory question index (or any array of question metas): no persistence,
 * no scoring, no scheduling, no prediction. It answers the two questions a PYQ set is really read
 * for — how many questions came from each subject, and how many from each topic.
 *
 * Granularity deliberately stops at the topic level. Subtopics in an imported bank come from a
 * labelling pass rather than from the printed paper, so counting questions per subtopic would
 * present an artefact of that pass as though it were a property of the examination.
 */

import { state } from '../core/state.js';
import { SUBJECT_ORDER } from '../core/constants.js';

/** The label an unclassified question is grouped under, matching `select.js`. */
export const UNCLASSIFIED_SUBJECT = 'Unclassified';

/** Key used to bind a topic to its subject in a flat map. Mirrors `select.js`. */
export function topicKey(subject, topic) {
  return `${subject || UNCLASSIFIED_SUBJECT}||${topic || UNCLASSIFIED_SUBJECT}`;
}

const subjectRank = (subject) => {
  const index = SUBJECT_ORDER.indexOf(subject);
  return index === -1 ? SUBJECT_ORDER.length : index;
};

/**
 * Count a question bank by subject and by topic.
 *
 * @param {Array<object>} metas  question index entries (default: everything in memory)
 * @param {Array<object>} papers paper summaries (default: everything in memory)
 * @returns {{
 *   total: number, unclassified: number, withKey: number, withoutKey: number, explanation: number,
 *   demonstration: number, papers: number,
 *   years: Array<number>, yearSpan: string,
 *   subjects: Array<{subject: string, questions: number, share: number, topics: number, withKey: number, withoutKey: number, explanation: number, demonstration: number, papers: number, years: Array<number>, byYear: Object<string, number>}>,
 *   topics: Array<{subject: string, topic: string, questions: number, share: number, shareOfSubject: number, withKey: number, withoutKey: number, explanation: number, papers: number, years: Array<number>, byYear: Object<string, number>}>,
 *   byYear: Array<{year: number|string, questions: number, subjects: number, topics: number}>,
 *   subjectCount: number, topicCount: number,
 * }}
 *
 * `papers` on a subject or topic row is how many distinct stored papers hold at
 * least one of its questions (a topic present in 12 of 12 papers is a staple).
 * A question counts as demonstration content when the index marks it
 * `demonstration` — the field `state.questionIndex` actually carries
 * (`isDemonstration` is accepted from older callers).
 */
export function summariseBank(metas = Array.from(state.questionIndex.values()), papers = Array.from(state.papers.values())) {
  const list = Array.isArray(metas) ? metas : [];
  const years = Array.from(new Set(list.map((m) => m.year).filter((y) => y !== null && y !== undefined && y !== '')))
    .sort((a, b) => Number(a) - Number(b));

  const blank = () => ({ questions: 0, withKey: 0, withoutKey: 0, explanation: 0, demonstration: 0, byYear: {}, topics: new Map(), paperIds: new Set() });
  const isDemo = (meta) => Boolean(meta.demonstration ?? meta.isDemonstration);
  const bySubject = new Map();
  const byTopic = new Map();
  const byYear = new Map();
  const yearOf = (meta) => String(meta.year ?? '—');

  for (const meta of list) {
    const subject = meta.subject || UNCLASSIFIED_SUBJECT;
    const topic = meta.topic || UNCLASSIFIED_SUBJECT;

    const s = bySubject.get(subject) || bySubject.set(subject, blank()).get(subject);
    const t = byTopic.get(topicKey(subject, topic)) || byTopic.set(topicKey(subject, topic), { ...blank(), subject, topic, unclassified: !meta.topic }).get(topicKey(subject, topic));
    const y = byYear.get(yearOf(meta)) || byYear.set(yearOf(meta), { year: meta.year ?? null, questions: 0, subjects: new Set(), topics: new Set() }).get(yearOf(meta));

    for (const row of [s, t]) {
      row.questions += 1;
      if (meta.hasSuppliedAnswer || meta.hasVerifiedAnswer) row.withKey += 1;
      else row.withoutKey += 1;
      if (meta.hasExplanation) row.explanation += 1;
      if (isDemo(meta)) row.demonstration += 1;
      if (meta.paper_id) row.paperIds.add(meta.paper_id);
      row.byYear[yearOf(meta)] = (row.byYear[yearOf(meta)] || 0) + 1;
    }
    y.questions += 1;
    s.topics.set(topicKey(subject, topic), t);
    y.subjects.add(subject);
    y.topics.add(topicKey(subject, topic));
  }

  const total = list.length;
  const share = (value, base) => (base > 0 ? value / base : 0);

  const subjects = Array.from(bySubject.entries())
    .map(([subject, row]) => ({
      subject,
      questions: row.questions,
      share: share(row.questions, total),
      topics: row.topics.size,
      withKey: row.withKey,
      withoutKey: row.withoutKey,
      explanation: row.explanation,
      demonstration: row.demonstration,
      papers: row.paperIds.size,
      years: Object.keys(row.byYear).sort(),
      byYear: row.byYear,
      topicRows: Array.from(row.topics.values()).map((t) => ({
        subject: t.subject,
        topic: t.topic,
        questions: t.questions,
        share: share(t.questions, total),
        shareOfSubject: share(t.questions, row.questions),
        withKey: t.withKey,
        withoutKey: t.withoutKey,
        explanation: t.explanation,
        papers: t.paperIds.size,
        unclassified: t.unclassified,
        years: Object.keys(t.byYear).sort(),
        byYear: t.byYear,
      })),
    }))
    .sort((a, b) => subjectRank(a.subject) - subjectRank(b.subject) || b.questions - a.questions || String(a.subject).localeCompare(String(b.subject)));

  const topics = subjects
    .flatMap((s) => s.topicRows)
    .sort((a, b) => b.questions - a.questions || String(a.topic).localeCompare(String(b.topic)));

  return {
    total,
    unclassified: list.filter((m) => !m.subject).length,
    withKey: list.filter((m) => m.hasSuppliedAnswer || m.hasVerifiedAnswer).length,
    withoutKey: list.filter((m) => !(m.hasSuppliedAnswer || m.hasVerifiedAnswer)).length,
    explanation: list.filter((m) => m.hasExplanation).length,
    demonstration: list.filter(isDemo).length,
    papers: papers.length,
    years,
    yearSpan: years.length ? (years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`) : '—',
    subjects,
    topics,
    byYear: Array.from(byYear.values())
      .map((row) => ({ year: row.year, questions: row.questions, subjects: row.subjects.size, topics: row.topics.size }))
      .sort((a, b) => (Number(a.year) || 0) - (Number(b.year) || 0)),
    subjectCount: subjects.filter((s) => s.subject !== UNCLASSIFIED_SUBJECT).length,
    topicCount: topics.filter((t) => !t.unclassified).length,
  };
}

/**
 * A question's standing in the bank: how often this topic came up and in which papers.
 * Used by the report and revision cards so "this topic is common here" is phrased honestly.
 *
 * @param {object} meta
 * @param {ReturnType<typeof summariseBank>} summary
 */
export function topicStanding(meta, summary) {
  const topic = summary.topics.find((t) => t.subject === (meta.subject || UNCLASSIFIED_SUBJECT) && t.topic === (meta.topic || UNCLASSIFIED_SUBJECT));
  if (!topic || !summary.total) return null;
  return {
    ...topic,
    isFrequent: topic.questions >= 5,
    rank: summary.topics.indexOf(topic) + 1,
  };
}
