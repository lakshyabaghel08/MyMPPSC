#!/usr/bin/env node
/**
 * tools/classify/ai-provider.mjs — label an AI queue file with a provider.
 *
 *   node tools/classify/ai-provider.mjs --queue data/pyq/ai-queue.jsonl --out data/pyq/ai-labels.jsonl
 *
 * Configuration comes from the environment only, never from the repository:
 *
 *   MYMPPSC_AI_PROVIDER  provider name recorded on every label (e.g. openai)
 *   MYMPPSC_AI_API_KEY   bearer token, used in this process only, never written out
 *   MYMPPSC_AI_BASE_URL  OpenAI-compatible endpoint (default https://api.openai.com/v1)
 *   MYMPPSC_AI_MODEL     model id (default gpt-4o-mini)
 *
 * This tool is optional and offline-safe: with no provider configured it exits
 * with a clear message and leaves the queue untouched, so the rest of the
 * pipeline stays usable. It is resumable — run it again on the same queue and
 * pass --skip <labels.jsonl> to skip ids that already have a label.
 */

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerConfig, labelOne, parseLabels, pendingQueueItems } from './ai-queue.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Load the taxonomy sidecar that sits next to the queue, so every request can
 * carry the closed vocabulary. Falls back to the per-item list when the sidecar
 * is absent (for example a queue produced with `inlineTaxonomy`).
 */
export async function loadAllowedCombinations(queueFile, queue) {
  const ref = queue[0]?.taxonomy_ref;
  const candidates = ref ? [path.join(path.dirname(resolve(queueFile)), ref), resolve(ref)] : [resolve(`${queueFile.replace(/\.jsonl?$/i, '')}.taxonomy.json`)];
  for (const file of candidates) {
    try {
      const sidecar = JSON.parse(await readFile(file, 'utf8'));
      if (Array.isArray(sidecar.combinations) && sidecar.combinations.length) return { file, combinations: sidecar.combinations };
    } catch {
      /* try the next candidate, then fall back */
    }
  }
  return { file: null, combinations: queue[0]?.allowed_combinations || null };
}

function args(argv) {
  const out = { flags: new Set(), values: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out.values[key] = next;
      i += 1;
    } else out.flags.add(key);
  }
  return out;
}

const resolve = (file) => (path.isAbsolute(file) ? file : path.join(root, file));
/** A repo-relative path when the file is inside the repo, otherwise the path as given. */
const displayPath = (file) => {
  const rel = path.relative(root, file);
  return rel && !rel.startsWith('..') ? rel : file;
};

async function main() {
  const parsed = args(process.argv.slice(2));
  const queueFile = parsed.values.queue;
  const outFile = parsed.values.out;

  if (!queueFile || !outFile || parsed.flags.has('help')) {
    console.log(`tools/classify/ai-provider.mjs — label an AI queue file.

Usage:
  node tools/classify/ai-provider.mjs --queue <ai-queue.jsonl> --out <ai-labels.jsonl> [--skip <existing-labels.jsonl>] [--limit N] [--dry-run]

Environment:
  MYMPPSC_AI_PROVIDER, MYMPPSC_AI_API_KEY, MYMPPSC_AI_BASE_URL, MYMPPSC_AI_MODEL
`);
    process.exit(parsed.flags.has('help') ? 0 : 1);
  }

  const config = providerConfig();
  const queueText = await readFile(resolve(queueFile), 'utf8');
  const { labels: queue, notes } = parseLabels(queueText);
  if (notes.length) console.log(`Queue notes: ${notes.join('; ')}`);
  if (!queue.length) {
    console.log('The queue is empty — every question was classified locally.');
    process.exit(0);
  }

  let todo = queue;
  if (parsed.values.skip) {
    const existing = parseLabels(await readFile(resolve(parsed.values.skip), 'utf8'));
    todo = pendingQueueItems(queue, existing.labels);
    console.log(`Resuming: ${queue.length - todo.length} question(s) already labelled in ${parsed.values.skip}; ${todo.length} left.`);
  }
  const limited = parsed.values.limit ? todo.slice(0, Number(parsed.values.limit)) : todo;
  const { file: taxonomyFile, combinations } = await loadAllowedCombinations(queueFile, limited.length ? limited : queue);
  console.log(
    combinations
      ? `Vocabulary: ${combinations.length} valid subject > topic > subtopic combination(s) from ${taxonomyFile ? displayPath(taxonomyFile) : 'the queue itself'}.`
      : 'Warning: no taxonomy sidecar found, so requests carry the subject list only. Merge-time validation still rejects invented labels.',
  );

  if (parsed.flags.has('dry-run')) {
    console.log(`${limited.length} question(s) would be sent to the provider.`);
    process.exit(0);
  }

  if (!config.ok) {
    console.error(`No AI provider is configured: ${config.reason}`);
    console.error(`The queue at ${queueFile} keeps ${todo.length} question(s) for the next run. Every question the rule engine could place locally is already classified in the bank.`);
    process.exit(4);
  }

  console.log(`Provider: ${config.provider} (${config.model}) — ${todo.length} question(s) to label.`);
  let ok = 0;
  const failures = [];
  for (const item of limited) {
    const result = await labelOne(config, item, { allowedCombinations: combinations });
    if (result.ok) {
      await appendFile(resolve(outFile), `${JSON.stringify(result.label)}\n`, 'utf8');
      ok += 1;
      console.log(`  ${item.id}: ${result.label.subject || 'no subject'} / ${result.label.topic || '—'} (confidence ${result.label.confidence ?? '—'})`);
      if (result.warning) console.log(`      warning: ${result.warning}`);
    } else {
      failures.push({ id: item.id, reason: result.reason });
      console.log(`  ${item.id}: failed — ${result.reason}`);
    }
  }
  console.log(`\nLabelled ${ok} of ${limited.length}; ${failures.length} failed and stay in the queue.`);
  if (failures.length) {
    await writeFile(resolve(`${outFile}.failures.json`), `${JSON.stringify(failures, null, 2)}\n`, 'utf8');
    process.exit(5);
  }
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`ai-provider failed: ${err.message}`);
    process.exit(1);
  });
}
