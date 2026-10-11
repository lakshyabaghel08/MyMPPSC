/**
 * tools/classify/intake-adapter.mjs — bring a source PYQ extraction into the
 * intake shape that tools/build-bank.mjs understands.
 *
 * Hard rules, asserted by tests/classification.test.js:
 *  - The adapter never invents a question, an option, an answer, an explanation
 *    or a classification. It renames and reshapes; when it cannot map something
 *    it leaves the field empty and records why.
 *  - A printed answer stays a printed answer. Anything the source already
 *    labelled as independently verified is passed through untouched.
 *  - Nothing is dropped silently: unmapped source keys, unmappable answers and
 *    reshaped records are all reported back to the caller.
 *
 * This module is build-time only: nothing in js/ imports it.
 */

const DEVANAGARI_RE = /[\u0900-\u097f]/;

/** Source field names this adapter recognises, grouped by meaning. */
export const FIELD_ALIASES = Object.freeze({
  id: ['id', 'question_id', 'qid', 'uid'],
  paper_id: ['paper_id', 'paper', 'paper_code', 'paperId'],
  question_number: ['question_number', 'number', 'qno', 'q_no', 'no', 'index'],
  question_type: ['question_type', 'type', 'qtype'],
  text: ['question_text', 'question', 'text', 'stem', 'prompt'],
  options: ['options', 'choices', 'option'],
  answer: ['answer', 'correct_answer', 'answer_key', 'printed_answer', 'key', 'correct_option', 'ans'],
  answer_status: ['answer_status', 'answer_key_status', 'key_status'],
  answer_source: ['answer_source', 'key_source'],
  verified_answer: ['verified_answer', 'independently_verified_answer', 'checked_answer'],
  explanation: ['explanation', 'solution', 'explain', 'explanation_text', 'reasoning'],
  subject: ['subject', 'Subject'],
  topic: ['topic', 'Topic'],
  subtopic: ['subtopic', 'sub_topic', 'Subtopic'],
  confidence: ['classification_confidence', 'confidence', 'subject_confidence'],
  classification_source: ['classification_source', 'classified_by'],
  year: ['year', 'exam_year', 'paper_year'],
  language: ['language', 'lang'],
});

/**
 * Normalise the source parser's own review file (for example the bundle's
 * `MPPSC_PYQ_Review.json`) so the review report can carry the extraction's own
 * caveats next to ours.
 *
 * This never touches a question. It only surfaces what the parser said: how
 * many blocks it saw, which records it refused to export and why, and where the
 * numbering has gaps. Those are the things a reader must know before believing
 * that the bank is the whole book.
 *
 * @param {object} raw parsed review file
 * @param {{file?: string}} opts
 * @returns {object|null} null when the file is not a recognisable review report
 */
export function normaliseSourceReview(raw, opts = {}) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.records)) return null;
  const stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  const pick = (r) => ({
    id: r.id ?? null,
    year: r.year ?? null,
    question_number: r.question_number ?? null,
    start_page: r.start_page ?? null,
    flags: Array.isArray(r.flags) ? r.flags : [],
    option_count: Number.isFinite(r.option_count) ? r.option_count : null,
    printed_answer: r.printed_answer ?? null,
    preview: typeof r.question_preview === 'string' ? r.question_preview.slice(0, 220) : null,
  });
  return {
    file: opts.file || null,
    parser_version: raw.parser_version ?? null,
    input_file: raw.input_file ?? null,
    input_sha256: raw.input_sha256 ?? null,
    stats: {
      question_blocks_detected: stats.question_blocks_detected ?? raw.records.length,
      records_exported_to_intake: stats.records_exported_to_intake ?? null,
      records_excluded_pending_review: stats.records_excluded_pending_review ?? null,
      records_flagged_for_review: stats.records_flagged_for_review ?? null,
      missing_stem: stats.missing_stem ?? null,
      missing_options: stats.missing_options ?? null,
      missing_or_unparsed_answer: stats.missing_or_unparsed_answer ?? null,
      missing_explanation: stats.missing_explanation ?? null,
      deleted_question_records: stats.deleted_question_records ?? 0,
    },
    excluded: raw.records.filter((r) => r && r.excluded_from_intake).map(pick),
    flagged: raw.records.filter((r) => r && Array.isArray(r.flags) && r.flags.length && !r.excluded_from_intake).map(pick),
    numbering_gaps: raw.numbering_gaps_by_year && typeof raw.numbering_gaps_by_year === 'object' ? raw.numbering_gaps_by_year : {},
    notes: Array.isArray(raw.important) ? raw.important.map(String) : [],
  };
}

/** Keys consumed by the adapter, used to report anything left over. */
export const KNOWN_SOURCE_KEYS = new Set([
  ...Object.values(FIELD_ALIASES).flat(),
  'en',
  'hi',
  'language_variants',
  'source_reference',
  'provenance',
  'dispute',
  'verification_evidence',
  'metadata',
  'is_demonstration',
  'set_code',
  'exam',
  'page',
  'source_file',
  'section',
  'passage',
  'context',
  'instructions',
  // A bank file can be fed back through the pipeline (re-run, re-classify)
  // without losing its answer integrity, so the schema's own field names are
  // recognised too.
  'supplied_answer',
  'answer_notes',
  'explanation_status',
  'validation_notes',
]);

const firstPresent = (obj, names) => {
  for (const name of names) {
    if (obj && obj[name] !== undefined && obj[name] !== null && obj[name] !== '') return { name, value: obj[name] };
  }
  return null;
};

function asTrimmed(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/**
 * Options arrive in at least four shapes in extraction pipelines:
 *   ["text", "text"]            → keys are assigned A, B, C…
 *   [{key, text}] / [{option, text}]
 *   {"A": "text"}
 *   {"A": {"text": "…"}}
 * Returns {options, notes}. Keys that already exist are never renumbered.
 */
export function normaliseOptions(raw) {
  const notes = [];
  if (!raw) return { options: [], notes: ['no options field on the record'] };
  let list = [];
  if (Array.isArray(raw)) {
    list = raw.map((entry, i) => {
      if (typeof entry === 'string' || typeof entry === 'number') return { key: String.fromCharCode(65 + i), text: String(entry) };
      if (entry && typeof entry === 'object') {
        const text = asTrimmed(entry.text ?? entry.option ?? entry.value ?? entry.label);
        const key = asTrimmed(entry.key ?? entry.option_key ?? entry.id);
        return { key: key || String.fromCharCode(65 + i), text: text === null ? '' : text };
      }
      return { key: String.fromCharCode(65 + i), text: '' };
    });
  } else if (typeof raw === 'object') {
    list = Object.entries(raw).map(([key, value]) => ({
      key: String(key).trim(),
      text: asTrimmed(typeof value === 'object' && value ? value.text ?? value.value : value) ?? '',
    }));
  } else if (typeof raw === 'string') {
    notes.push('options were a single string; split on newlines');
    list = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        const m = line.match(/^\s*\(?([A-Za-z0-9]{1,3})\)?\s*[.)\-–:]\s*(.*)$/);
        if (m) return { key: m[1], text: m[2].trim() };
        return { key: String.fromCharCode(65 + i), text: line };
      });
  }
  const seen = new Set();
  const options = [];
  list.forEach((opt, i) => {
    let key = opt.key || String.fromCharCode(65 + i);
    if (seen.has(key)) {
      key = `${key}${i}`;
      notes.push(`duplicate option key rewritten to "${key}" (source text unchanged)`);
    }
    seen.add(key);
    options.push({ key, text: opt.text });
  });
  return { options, notes };
}

/**
 * Map a printed answer onto option keys.
 * A key like "B" / "(B)" / "b" is accepted. A full option *text* is matched
 * against the option list. Anything else is refused: the answer stays missing
 * and the reason is reported, because guessing a key would corrupt the bank.
 */
export function mapAnswer(rawAnswer, options) {
  if (rawAnswer === null || rawAnswer === undefined || rawAnswer === '') return { answer: null, notes: [] };
  const notes = [];
  const values = Array.isArray(rawAnswer) ? rawAnswer : String(rawAnswer).split(/[,;&/+]|\band\b/);
  const byKey = new Map(options.map((o) => [String(o.key).toUpperCase(), o.key]));
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const byText = new Map(options.map((o) => [norm(o.text), o.key]));
  const mapped = [];
  for (const raw of values) {
    const value = String(raw).trim();
    if (!value) continue;
    const bare = value.replace(/^\(?|\)?$/g, '').trim();
    if (byKey.has(bare.toUpperCase())) {
      mapped.push(byKey.get(bare.toUpperCase()));
      continue;
    }
    const matched = byText.get(norm(bare));
    if (matched) {
      notes.push(`answer "${value}" was given as option text and mapped to key ${matched}`);
      mapped.push(matched);
      continue;
    }
    const partial = options.find((o) => norm(o.text).includes(norm(bare)) || norm(bare).includes(norm(o.text)) && norm(o.text).length > 3);
    if (partial && norm(bare).length > 3) {
      notes.push(`answer "${value}" matched option ${partial.key} by text comparison; flagged for review`);
      mapped.push(partial.key);
      continue;
    }
    notes.push(`answer value "${value}" does not match any option key or option text; the answer was left empty`);
  }
  const unique = Array.from(new Set(mapped));
  return { answer: unique.length ? unique : null, notes };
}

/**
 * Conservative question-type detection. Only fires on unambiguous textual
 * signals, and every inference is recorded so a reviewer can see it happened.
 */
export function inferQuestionType(text, options, answer) {
  const folded = String(text || '').toLowerCase();
  if (Array.isArray(answer) && answer.length > 1) return { type: 'multiple_correct', basis: 'more than one printed option key' };
  if (/assertion\s*\(?a\)?|\breason\s*\(?r\)?/.test(folded) && options.length >= 3 && options.length <= 5) {
    return { type: 'assertion_reason', basis: 'assertion/reason stem' };
  }
  if (/match the (following|the two|list)|सुमेलित|मिलाइए|सही सुमेलन/.test(folded) || options.every((o) => /^\(?[1-4]\)?\s*[-–]\s*/.test(String(o.text || '')))) {
    return { type: 'matching', basis: 'matching-list stem or pairing options' };
  }
  if (/consider the following statements|which of the (following )?statements|नीचे दिए गए कथन|उपरोक्त कथन/.test(folded)) {
    return { type: 'statement_based', basis: 'statement-list stem' };
  }
  return { type: 'single_correct', basis: 'default for a single printed key' };
}

function detectLanguage(text, declared) {
  if (declared === 'en' || declared === 'hi') return declared;
  return DEVANAGARI_RE.test(String(text || '')) ? 'hi' : 'en';
}

/**
 * Adapt one source question record.
 * @returns {{question: object|null, notes: string[], unmappedKeys: string[]}}
 */
export function adaptQuestion(raw, index, context = {}) {
  const notes = [];
  const unmappedKeys = Object.keys(raw || {}).filter((k) => !KNOWN_SOURCE_KEYS.has(k));
  if (!raw || typeof raw !== 'object') return { question: null, notes: ['record is not an object'], unmappedKeys };

  const pick = (group) => firstPresent(raw, FIELD_ALIASES[group]);

  /* ------------------------------------------------------- identity ----- */
  const idFound = pick('id');
  const paperFound = pick('paper_id');
  const numberFound = pick('question_number');
  const yearFound = pick('year');

  const questionNumber = numberFound ? Number(numberFound.value) || null : null;
  if (!numberFound && Number.isFinite(index)) notes.push('no question number in the source; position in the file was used');

  let id = idFound ? String(idFound.value).trim() : null;
  if (!id) {
    const paperId = paperFound ? String(paperFound.value).trim() : context.paperId || 'UNKNOWN-PAPER';
    id = `${paperId}-${String(questionNumber ?? index + 1).padStart(3, '0')}`;
    notes.push(`the source record had no id; "${id}" was derived from its paper and question number`);
  }

  /* --------------------------------------------------------- content ---- */
  const language_variants = {};
  if (raw.language_variants && typeof raw.language_variants === 'object') {
    for (const [lang, variant] of Object.entries(raw.language_variants)) {
      if (variant && variant.question_text) language_variants[lang] = variant;
    }
  } else {
    const declaredLang = pick('language')?.value;
    const inline = {};
    for (const lang of ['en', 'hi']) {
      if (raw[lang] && typeof raw[lang] === 'object') inline[lang] = raw[lang];
    }
    if (Object.keys(inline).length) {
      for (const [lang, variant] of Object.entries(inline)) {
        const textFound = firstPresent(variant, FIELD_ALIASES.text);
        const { options, notes: optNotes } = normaliseOptions(variant.options ?? variant.choices);
        notes.push(...optNotes.map((n) => `[${lang}] ${n}`));
        if (!textFound) {
          notes.push(`[${lang}] variant present but has no question text`);
          continue;
        }
        language_variants[lang] = {
          question_text: textFound.value,
          instructions: asTrimmed(variant.instructions) ?? null,
          options,
          ...(asTrimmed(variant.passage ?? variant.context) ? { passage: variant.passage ?? variant.context } : {}),
        };
      }
    } else {
      const textFound = pick('text');
      if (textFound) {
        const lang = detectLanguage(textFound.value, declaredLang);
        const { options, notes: optNotes } = normaliseOptions(raw.options ?? raw.choices);
        notes.push(...optNotes);
        language_variants[lang] = {
          question_text: textFound.value,
          instructions: asTrimmed(raw.instructions) ?? null,
          options,
          ...(asTrimmed(raw.passage ?? raw.context) ? { passage: raw.passage ?? raw.context } : {}),
        };
      } else {
        notes.push('no question text found on the record');
      }
    }
  }

  const primary = language_variants.en || language_variants.hi || null;
  if (!primary) {
    return { question: { id, skipped: true, notes }, notes, unmappedKeys };
  }

  /* ---------------------------------------------------------- answer ---- */
  const answerFound = pick('answer');
  const suppliedRecord = raw.supplied_answer && typeof raw.supplied_answer === 'object' ? raw.supplied_answer : null;
  const rawAnswer = answerFound ? answerFound.value : suppliedRecord?.answer ?? null;
  const { answer, notes: answerNotes } = mapAnswer(rawAnswer, primary.options);
  notes.push(...answerNotes);
  const statusFound = pick('answer_status') || (suppliedRecord?.status ? { name: 'supplied_answer.status', value: suppliedRecord.status } : null);
  let answerStatus = statusFound ? asTrimmed(statusFound.value) : null;
  if (!answerStatus) answerStatus = answer && answer.length ? 'unknown' : 'missing';
  if (answer && answer.length && answerStatus !== 'missing' && !statusFound) {
    notes.push('the source printed an answer with no key status; recorded as "unknown" rather than "final"');
  }
  if (!answer) {
    answerStatus = 'missing';
    notes.push('no usable printed answer; the question stays without a key');
  }

  const sourceFound = pick('answer_source') || (suppliedRecord?.source ? { name: 'supplied_answer.source', value: suppliedRecord.source } : null);
  const verifiedFound = pick('verified_answer');

  /* ------------------------------------------------------- classification */
  const subjectFound = pick('subject');
  const topicFound = pick('topic');
  const subtopicFound = pick('subtopic');
  const confidenceFound = pick('confidence');
  const classificationSourceFound = pick('classification_source');

  /* ---------------------------------------------------- question type ---- */
  const typeFound = pick('question_type');
  let questionType;
  let typeBasis;
  if (typeFound) {
    questionType = String(typeFound.value);
    typeBasis = 'source record';
  } else {
    const inferred = inferQuestionType(primary.question_text, primary.options, answer);
    questionType = inferred.type;
    typeBasis = `inferred from the question shape (${inferred.basis})`;
  }

  const metadata = { ...(raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}) };
  metadata.question_type_basis = typeBasis;
  if (raw.source_file) metadata.source_file = raw.source_file;
  if (raw.section) metadata.section = raw.section;

  const sourceReference =
    raw.source_reference && typeof raw.source_reference === 'object'
      ? raw.source_reference
      : raw.page || raw.source_file
        ? { file: asTrimmed(raw.source_file), page: raw.page ?? null, question_location: null, note: null }
        : null;

  const question = {
    id,
    paper_id: paperFound ? String(paperFound.value).trim() : context.paperId || null,
    exam: asTrimmed(raw.exam) ?? context.exam ?? null,
    year: yearFound ? Number(yearFound.value) || asTrimmed(yearFound.value) : context.year ?? null,
    set_code: asTrimmed(raw.set_code) ?? context.setCode ?? null,
    question_number: questionNumber,
    question_type: questionType,
    language_variants,
    // Classification shorthand read by tools/build-bank.mjs. Left null unless
    // the source actually carried a classification; the classifier fills gaps.
    ...(subjectFound || topicFound || subtopicFound
      ? {
          subject: asTrimmed(subjectFound?.value),
          topic: asTrimmed(topicFound?.value),
          subtopic: asTrimmed(subtopicFound?.value),
          ...(confidenceFound ? { classification_confidence: Number(confidenceFound.value) || null } : {}),
          ...(classificationSourceFound ? { classification_source: asTrimmed(classificationSourceFound.value) } : {}),
        }
      : {}),
    supplied_answer: {
      answer,
      status: answerStatus,
      source: sourceFound ? asTrimmed(sourceFound.value) : null,
      notes: null,
    },
    answer_key_status: answerStatus,
    ...(verifiedFound ? { verified_answer: verifiedFound.value } : {}),
    ...(raw.dispute ? { dispute: raw.dispute } : {}),
    ...(raw.verification_evidence ? { verification_evidence: raw.verification_evidence } : {}),
    explanation: raw.explanation ?? null,
    ...(sourceReference ? { source_reference: sourceReference } : {}),
    ...(raw.provenance ? { provenance: raw.provenance } : {}),
    ...(raw.is_demonstration ? { is_demonstration: true } : {}),
    metadata,
  };

  return { question, notes: notes.map((n) => `${id}: ${n}`), unmappedKeys };
}

function derivePapers(questions, notes) {
  const byPaper = new Map();
  for (const q of questions) {
    const pid = q.paper_id || 'UNKNOWN-PAPER';
    q.paper_id = pid;
    if (!byPaper.has(pid)) {
      byPaper.set(pid, {
        paper_id: pid,
        exam: q.exam || null,
        year: q.year ?? null,
        paper_name: null,
        set_code: q.set_code || null,
        original_question_count: null,
      });
    }
  }
  if (byPaper.size) notes.push(`${byPaper.size} paper(s) were derived from the question records because the source described none; question counts are left null rather than guessed.`);
  return Array.from(byPaper.values());
}

/**
 * Adapt a whole source file into an intake object.
 * @param {object} raw the parsed source JSON
 * @param {{bankId?: string, bankName?: string, isDemonstration?: boolean}} opts
 */
export function adaptIntake(raw, opts = {}) {
  const notes = [];
  const unmappedKeys = new Set();
  const recordIssues = [];

  if (!raw || typeof raw !== 'object') throw new Error('The source file is not a JSON object.');
  const rawQuestions = Array.isArray(raw.questions)
    ? raw.questions
    : Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw)
        ? raw
        : null;
  if (!rawQuestions) throw new Error('The source file has no "questions" (or "items") array, so there is nothing to classify.');

  const sourcePapers = Array.isArray(raw.papers) ? raw.papers : [];
  const paperById = new Map(sourcePapers.map((p) => [p.paper_id ?? p.id, p]));
  const context = {
    exam: raw.exam ?? raw.exam_default ?? null,
    year: null,
    setCode: raw.set_code ?? null,
    paperId: null,
  };

  const questions = [];
  rawQuestions.forEach((record, index) => {
    const paperContext = { ...context, paperId: null };
    const paperGuess = firstPresent(record, FIELD_ALIASES.paper_id);
    if (paperGuess) {
      const known = paperById.get(String(paperGuess.value));
      if (known) {
        paperContext.exam = known.exam ?? paperContext.exam;
        paperContext.year = known.year ?? paperContext.year;
        paperContext.setCode = known.set_code ?? paperContext.setCode;
      }
    }
    const { question, notes: qNotes, unmappedKeys: keys } = adaptQuestion(record, index, paperContext);
    keys.forEach((k) => unmappedKeys.add(k));
    if (question?.skipped) {
      recordIssues.push({ index, id: question.id || null, problem: qNotes.join(' ') });
      return;
    }
    if (!question) {
      recordIssues.push({ index, id: null, problem: qNotes.join(' ') });
      return;
    }
    if (qNotes.length) recordIssues.push({ index, id: question.id, problem: qNotes.join(' ') });
    questions.push(question);
  });

  const seen = new Set();
  const duplicateIds = [];
  const uniqueQuestions = [];
  for (const q of questions) {
    if (seen.has(q.id)) {
      duplicateIds.push(q.id);
      notes.push(`duplicate id "${q.id}" appears more than once in the source; both records were kept, the second was renumbered`);
      let suffix = 2;
      while (seen.has(`${q.id}~dup${suffix}`)) suffix += 1;
      q.id = `${q.id}~dup${suffix}`;
      q.metadata = { ...(q.metadata || {}), duplicate_source_id: q.id.replace(/~dup\d+$/, '') };
    }
    seen.add(q.id);
    uniqueQuestions.push(q);
  }

  const papers = sourcePapers.length ? sourcePapers : derivePapers(uniqueQuestions, notes);

  const intake = {
    intake_version: '1.0.0',
    bank_id: opts.bankId || raw.bank_id || 'mppsc-pyq',
    bank_name: opts.bankName || raw.bank_name || 'MPPSC PYQ bank',
    ...(raw.exam || raw.exam_default ? { exam_default: raw.exam || raw.exam_default } : {}),
    is_demonstration: Boolean(opts.isDemonstration ?? raw.is_demonstration ?? false),
    default_language: raw.default_language || 'en',
    provenance: raw.provenance || {
      kind: 'unofficial_recall',
      verified: false,
      notes: 'Adapted from an external extraction. Verify every answer key against the official MPPSC documents before relying on it.',
      sources: raw.sources || [],
    },
    papers,
    questions: uniqueQuestions,
  };

  return { intake, notes, unmappedKeys: Array.from(unmappedKeys).sort(), recordIssues, duplicateIds };
}
