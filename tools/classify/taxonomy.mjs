/**
 * tools/classify/taxonomy.mjs — the canonical subject/topic/subtopic vocabulary.
 *
 * The pipeline is only allowed to assign classifications that exist in
 * data/taxonomy/mppsc-taxonomy.json, and every subject in that file must be one
 * of the app's own SUBJECT_ORDER values. Both are enforced here at load time, so
 * a typo in a rule cannot introduce a subject the app's filters have never seen.
 *
 * This module is build-time only: nothing in js/ imports it.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECT_ORDER } from '../../js/core/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TAXONOMY_PATH = path.join(root, 'data', 'taxonomy', 'mppsc-taxonomy.json');

/** Reserved bucket that is never assigned: an unplaceable question stays null. */
export const UNCLASSIFIED = 'Unclassified';

export function parseTaxonomy(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.subjects)) {
    throw new Error('The taxonomy file must be a JSON object with a "subjects" array.');
  }
  const subjects = new Map();
  for (const entry of raw.subjects) {
    if (!entry || typeof entry.subject !== 'string') throw new Error('Every taxonomy entry needs a subject name.');
    if (!SUBJECT_ORDER.includes(entry.subject)) {
      throw new Error(`Taxonomy subject "${entry.subject}" is not in js/core/constants.js SUBJECT_ORDER.`);
    }
    if (subjects.has(entry.subject)) throw new Error(`Taxonomy subject "${entry.subject}" is declared twice.`);
    const topics = new Map();
    for (const t of entry.topics || []) {
      if (!t || typeof t.topic !== 'string') throw new Error(`Taxonomy subject "${entry.subject}" has a topic entry without a name.`);
      if (topics.has(t.topic)) throw new Error(`Taxonomy topic "${entry.subject} / ${t.topic}" is declared twice.`);
      const subtopics = (t.subtopics || []).map((s) => String(s).trim()).filter(Boolean);
      if (new Set(subtopics).size !== subtopics.length) {
        throw new Error(`Taxonomy topic "${entry.subject} / ${t.topic}" has duplicate subtopics.`);
      }
      topics.set(t.topic, subtopics);
    }
    subjects.set(entry.subject, topics);
  }
  return {
    version: raw.taxonomy_version || null,
    subjects,
    reservedSubjects: raw.reserved_subjects || [UNCLASSIFIED],
  };
}

let cached = null;

/** Load and cache the taxonomy (async because it reads a file). */
export async function loadTaxonomy(file = TAXONOMY_PATH) {
  if (cached && file === TAXONOMY_PATH) return cached;
  const parsed = parseTaxonomy(JSON.parse(await readFile(file, 'utf8')));
  if (file === TAXONOMY_PATH) cached = parsed;
  return parsed;
}

export function subjectNames(taxonomy) {
  return Array.from(taxonomy.subjects.keys()).sort((a, b) => SUBJECT_ORDER.indexOf(a) - SUBJECT_ORDER.indexOf(b));
}

export function topicNames(taxonomy, subject) {
  return Array.from(taxonomy.subjects.get(subject)?.keys() || []);
}

export function subtopicNames(taxonomy, subject, topic) {
  return taxonomy.subjects.get(subject)?.get(topic) || [];
}

/**
 * Check a proposed triple against the taxonomy.
 * Returns the triple as it should be written, plus which levels are unknown.
 * An unknown level is dropped (set to null) rather than passed through, because
 * the app would happily display a topic no other question shares.
 */
export function reconcile(taxonomy, subject, topic = null, subtopic = null) {
  if (!subject) return { subject: null, topic: null, subtopic: null, problems: [] };
  const problems = [];
  const topics = taxonomy.subjects.get(subject);
  if (!topics) {
    return { subject: null, topic: null, subtopic: null, problems: [`subject "${subject}" is not in the taxonomy`] };
  }
  let resolvedTopic = null;
  if (topic) {
    if (topics.has(topic)) resolvedTopic = topic;
    else problems.push(`topic "${subject} / ${topic}" is not in the taxonomy`);
  }
  let resolvedSubtopic = null;
  if (subtopic) {
    const allowed = resolvedTopic ? topics.get(resolvedTopic) : null;
    if (allowed && allowed.includes(subtopic)) resolvedSubtopic = subtopic;
    else if (allowed) problems.push(`subtopic "${subject} / ${topic} / ${subtopic}" is not in the taxonomy`);
    else problems.push(`subtopic "${subtopic}" dropped because its topic is not in the taxonomy`);
  }
  return { subject, topic: resolvedTopic, subtopic: resolvedSubtopic, problems };
}
