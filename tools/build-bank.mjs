#!/usr/bin/env node
/**
 * tools/build-bank.mjs — the "separate pipeline" helper.
 *
 * MyMPPSC never generates questions, answers, classifications or explanations.
 * Those are produced outside the app, by whatever process you trust, and arrive
 * as a bank file. This tool is the small bridge for that workflow: it turns a
 * plain intake file into a bank file that the app accepts, and it validates the
 * result with the *same validator the app uses* — so what you hand to the app is
 * already known-good.
 *
 *   node tools/build-bank.mjs --in demo/intake-sample.json --out /tmp/bank.json
 *   node tools/build-bank.mjs --in intake.json --out bank.json --strict
 *   node tools/build-bank.mjs --validate data/demo/demo-bank.json
 *
 * Nothing here is imported by the browser app: this file is a build-time tool.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBank } from '../js/core/validate.js';
import { APP_VERSION } from '../js/core/constants.js';

const TOOL_VERSION = '1.0.0';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const INTAKE_VERSION = '1.0.0';

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
    } else {
      out.flags.add(key);
    }
  }
  return out;
}

/* ------------------------------------------------------------- intake ----- */

/**
 * Normalise one intake record into the shape the validator expects.
 * Everything here is mechanical renaming and defaulting — no content is created.
 */
function normaliseIntakeQuestion(raw, paper, index, warnings) {
  const q = { ...raw };
  const id = q.id || q.question_id;
  if (!id) {
    warnings.push(`Question at index ${index} has no id and was skipped.`);
    return null;
  }
  q.id = String(id);

  // Language shorthand: "en": {...}, "hi": {...} → language_variants
  if (!q.language_variants) {
    const variants = {};
    for (const lang of ['en', 'hi']) {
      if (q[lang] && typeof q[lang] === 'object') variants[lang] = q[lang];
      delete q[lang];
    }
    if (Object.keys(variants).length) q.language_variants = variants;
  }

  if (!q.paper_id) q.paper_id = paper?.paper_id || null;
  if (paper) {
    q.exam = q.exam ?? paper.exam ?? null;
    q.year = q.year ?? paper.year ?? null;
    q.set_code = q.set_code ?? paper.set_code ?? null;
  }
  if (q.question_type === undefined) q.question_type = 'single_correct';

  // Answer shorthand: "answer": ["B"] → supplied_answer
  if (!q.supplied_answer && (q.answer !== undefined || q.answer_status !== undefined || q.answer_source !== undefined)) {
    const answer = q.answer === undefined ? null : Array.isArray(q.answer) ? q.answer : [q.answer];
    q.supplied_answer = {
      answer: answer ? answer.map((a) => String(a).trim()).filter(Boolean) : null,
      status: q.answer_status || (answer && answer.length ? 'unknown' : 'missing'),
      source: q.answer_source || null,
      notes: q.answer_notes || null,
    };
  }
  delete q.answer;
  delete q.answer_status;
  delete q.answer_source;
  delete q.answer_notes;
  if (q.answer_key_status === undefined && q.supplied_answer) q.answer_key_status = q.supplied_answer.status;

  // Classification shorthand
  if (q.classification === undefined && (q.subject !== undefined || q.topic !== undefined)) {
    q.classification = {
      subject: q.subject ?? null,
      topic: q.topic ?? null,
      subtopic: q.subtopic ?? null,
      confidence: q.classification_confidence ?? null,
      source: q.classification_source ?? 'external_pipeline',
    };
  }

  // Explanation shorthand: a plain string becomes reviewed prose only if the
  // intake explicitly says so; otherwise it is recorded as an unreviewed note.
  if (typeof q.explanation === 'string') {
    q.explanation = { correct_reasoning: q.explanation, status: q.explanation_status || 'unreviewed', language: 'en' };
  }
  if (q.explanation && !q.explanation.status) {
    q.explanation.status = 'unreviewed';
    warnings.push(`${q.id}: explanation had no status, recorded as "unreviewed".`);
  }

  if (!q.language_variants || !Object.keys(q.language_variants).length) {
    warnings.push(`${q.id}: no language variant (question text + options) — the record will be rejected by validation.`);
  }
  return q;
}

function paperOrderFor(paper, questions) {
  if (paper.question_order && paper.question_order.length) return paper.question_order.slice();
  return questions
    .filter((q) => q.paper_id === paper.paper_id)
    .sort((a, b) => (a.question_number ?? 0) - (b.question_number ?? 0))
    .map((q) => q.id);
}

/**
 * Turn an intake object into a bank object.
 * @returns {{bank: object, warnings: string[]}}
 */
export function buildBankFromIntake(intake) {
  const warnings = [];
  if (!intake || typeof intake !== 'object') throw new Error('The intake file must be a JSON object.');
  if (intake.intake_version && intake.intake_version !== INTAKE_VERSION) {
    warnings.push(`Intake version ${intake.intake_version} differs from the tool's ${INTAKE_VERSION}; fields are read on a best-effort basis.`);
  }
  const rawPapers = Array.isArray(intake.papers) ? intake.papers : [];
  const rawQuestions = Array.isArray(intake.questions) ? intake.questions : [];
  if (!rawPapers.length) warnings.push('The intake file declares no papers; every question will be placed on a placeholder paper at import time.');
  if (!rawQuestions.length) throw new Error('The intake file declares no questions, so there is nothing to build.');

  // Papers are resolved first so questions can inherit exam/year/set from them.
  const paperById = new Map(
    rawPapers.map((p) => [
      p.paper_id,
      {
        ...p,
        exam: p.exam ?? intake.exam_default ?? null,
        language: p.language,
        is_demonstration: p.is_demonstration,
      },
    ]),
  );

  const questions = rawQuestions
    .map((raw, index) => normaliseIntakeQuestion(raw, paperById.get(raw.paper_id), index, warnings))
    .filter(Boolean);

  const papers = Array.from(paperById.values()).map((p) => {
    const ordered = paperOrderFor(p, questions);
    const supplied = p.original_question_count ?? null;
    if (supplied !== null && ordered.length !== supplied) {
      warnings.push(`Paper ${p.paper_id} declares ${supplied} questions but ${ordered.length} are present in this file; the app will label the paper incomplete.`);
    }
    return {
      paper_id: p.paper_id,
      exam: p.exam,
      year: p.year ?? null,
      paper_name: p.paper_name ?? p.paper_id,
      paper_code: p.paper_code ?? null,
      set_code: p.set_code ?? null,
      language: p.language,
      original_question_count: supplied,
      duration_minutes: p.duration_minutes ?? null,
      total_marks: p.total_marks ?? null,
      scoring: p.scoring ?? {
        rules_known: false,
        marks_per_correct: null,
        negative_marks_per_incorrect: null,
        negative_marking_enabled: null,
        marks_for_unanswered: null,
        rules_source: null,
        notes: 'No scoring rules were supplied for this paper; the app refuses to score it until you configure them.',
      },
      question_order: ordered,
      answer_key: p.answer_key ?? { source: null, status: 'unknown', published_at: null, notes: null },
      source_files: p.source_files ?? [],
      import_validation: p.import_validation ?? null,
      is_demonstration: p.is_demonstration,
      metadata: { ...(p.metadata || {}), built_by: `tools/build-bank.mjs ${TOOL_VERSION}` },
    };
  });

  // Questions on a paper that was not described become placeholders at import
  // time; say so now so the pipeline author can fix the intake file.
  for (const q of questions) {
    if (!paperById.has(q.paper_id)) {
      warnings.push(`${q.id} references paper "${q.paper_id ?? 'none'}", which this intake file does not describe; the app will create a placeholder paper for it.`);
    }
  }

  const bank = {
    schema_version: '1.0.0',
    bank_id: intake.bank_id || `built-${Date.now().toString(36)}`,
    bank_name: intake.bank_name || intake.bank_id || 'Untitled bank',
    generated_at: new Date().toISOString(),
    generator: {
      name: 'tools/build-bank.mjs',
      version: TOOL_VERSION,
      notes: `Built from an intake file (intake_version ${intake.intake_version || 'unspecified'}). Content is reproduced from the intake file without modification.`,
    },
    is_demonstration: Boolean(intake.is_demonstration),
    provenance:
      intake.provenance || {
        kind: 'unspecified',
        verified: false,
        notes: 'The intake file did not describe provenance. Describe where these questions came from and whether the key has been checked before relying on them.',
        sources: [],
      },
    default_language: intake.default_language || 'en',
    app_compatibility: { built_with: APP_VERSION, schema_version: '1.0.0' },
    papers,
    questions,
  };
  return { bank, warnings };
}

/* ------------------------------------------------------------ commands ---- */

async function readJson(file) {
  const text = await readFile(path.isAbsolute(file) ? file : path.join(root, file), 'utf8');
  return { text, value: JSON.parse(text) };
}

function summariseReport(report) {
  const lines = [];
  lines.push(`  papers            : ${report.stats?.papers ?? report.papers.length}`);
  lines.push(`  questions         : ${report.stats?.questions ?? report.questions.length}`);
  lines.push(`  rejected records  : ${report.rejected.length}`);
  lines.push(`  fatal / errors    : ${report.fatal.length} / ${report.errors.length}`);
  lines.push(`  warnings          : ${report.warnings.length}`);
  const optional = [
    ['bilingual', report.stats?.bilingual],
    ['english only', report.stats?.englishOnly],
    ['hindi only', report.stats?.hindiOnly],
    ['unclassified', report.stats?.unclassified],
    ['without answer key', report.stats?.missingAnswers],
    ['disputed keys', report.stats?.disputedAnswers],
    ['with explanation', report.stats?.withExplanation],
    ['papers without scoring rules', report.stats?.unknownScoringPapers],
    ['incomplete papers', report.stats?.incompletePapers],
    ['demonstration records', report.stats?.demonstration],
    ['near-duplicate pairs', report.nearDuplicates?.length],
  ];
  for (const [label, value] of optional) {
    if (value) lines.push(`  ${label.padEnd(18)}: ${value}`);
  }
  return lines.join('\n');
}

function printIssues(report, limit = 12) {
  const rows = [...report.fatal, ...report.errors];
  if (rows.length) {
    console.log('\nBlocking problems:');
    for (const issue of rows.slice(0, limit)) console.log(`  - ${issue.questionId || issue.paperId || '—'}: ${issue.message}`);
    if (rows.length > limit) console.log(`  … and ${rows.length - limit} more.`);
  }
  if (report.rejected.length) {
    console.log('\nRejected records:');
    for (const r of report.rejected.slice(0, limit)) console.log(`  - ${r.id || `index ${r.index}`}: ${r.reason}`);
    if (report.rejected.length > limit) console.log(`  … and ${report.rejected.length - limit} more.`);
  }
  if (report.warnings.length) {
    console.log('\nWarnings:');
    for (const w of report.warnings.slice(0, limit)) console.log(`  - ${w.questionId || w.paperId || '—'}: ${w.message}`);
    if (report.warnings.length > limit) console.log(`  … and ${report.warnings.length - limit} more.`);
  }
}

async function main() {
  const parsed = args(process.argv.slice(2));

  if (parsed.flags.has('help') || (!parsed.values.in && !parsed.values.validate)) {
    console.log(`tools/build-bank.mjs — turn an intake file into an importable question bank.

Usage:
  node tools/build-bank.mjs --in <intake.json> --out <bank.json> [--strict] [--force]
  node tools/build-bank.mjs --validate <bank.json>

Options:
  --in <file>        intake file (see demo/README.md for the format)
  --out <file>       where to write the bank (default: <intake>.bank.json)
  --strict           exit non-zero when there is any warning, rejection or duplicate
  --force            overwrite the output file if it already exists
  --validate <file>  validate an existing bank file and print the summary
  --quiet            only print the essentials
`);
    process.exit(parsed.flags.has('help') ? 0 : 1);
  }

  if (parsed.values.validate) {
    const { value } = await readJson(parsed.values.validate);
    const report = validateBank(value, {});
    console.log(`Validated ${parsed.values.validate}`);
    console.log(summariseReport(report));
    printIssues(report);
    if (!report.ok) {
      console.log('\nResult: this file would be blocked by the app — fix the problems above.');
      process.exit(2);
    }
    console.log('\nResult: valid — the app will import it.');
    process.exit(0);
  }

  const { value: intake } = await readJson(parsed.values.in);
  const { bank, warnings } = buildBankFromIntake(intake);
  const report = validateBank(bank, {});

  const outFile = parsed.values.out || parsed.values.in.replace(/\.json$/i, '') + '.bank.json';
  const outPath = path.isAbsolute(outFile) ? outFile : path.join(root, outFile);

  console.log(`Intake : ${parsed.values.in}`);
  console.log(`Bank   : ${outPath}`);
  console.log(summariseReport(report));
  if (warnings.length) {
    console.log('\nIntake notes:');
    for (const w of warnings.slice(0, 20)) console.log(`  - ${w}`);
    if (warnings.length > 20) console.log(`  … and ${warnings.length - 20} more.`);
  }
  printIssues(report);

  const blocking = report.fatal.length > 0 || report.errors.length > 0 || report.rejected.length > 0;
  if (blocking) {
    console.log('\nNothing was written: the built bank would be rejected or partially rejected by the app.');
    console.log('Fix the problems above and run the tool again.');
    process.exit(2);
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(bank, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${bank.questions.length} question(s) across ${bank.papers.length} paper(s).`);
  console.log('Import it in the app: Question Bank & Imports → choose the file. The app will analyse it again before writing anything.');

  const warningCount = report.warnings.length + warnings.length + (report.nearDuplicates?.length || 0);
  if (parsed.flags.has('strict') && warningCount) {
    console.log(`\n--strict: ${warningCount} warning(s)/duplicate(s) present.`);
    process.exit(3);
  }
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`build-bank failed: ${err.message}`);
    process.exit(1);
  });
}
