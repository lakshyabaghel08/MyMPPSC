/* Append complete source-derived English candidates and the 2009–2011 reviews. */
export function append2009to2011(bank, inputs, taxonomy) {
  const existing = new Set(bank.questions.map((q) => q.id));
  const specs = [
    { year: 2009, count: 146, original: 150, exclude: new Set([75, 76, 77, 78]) },
    { year: 2010, count: 120, original: 120, exclude: new Set() },
    { year: 2011, count: 118, original: 120, exclude: new Set([7, 38]) },
  ];
  const reviews = {};
  for (const [year, count] of [[2009, 146], [2010, 120], [2011, 118]]) {
    const review = inputs[year]?.review;
    if (review?.paper_id !== `MPPSC-${year}-P1` || review.status !== 'assessed' || !Array.isArray(review.records) || review.records.length !== count) throw new Error(`${year} review must contain ${count} assessed records`);
    const byId = new Map(review.records.map((r) => [r.question_id, r]));
    if (byId.size !== count) throw new Error(`${year} review contains duplicate IDs`);
    reviews[year] = { review, byId };
  }
  let total = 0;
  for (const spec of specs) {
    const { year, count, original, exclude } = spec;
    const paperId = `MPPSC-${year}-P1`;
    if (bank.papers.some((p) => p.paper_id === paperId)) throw new Error(`${year} paper already exists`);
    const { source, labels } = inputs[year] || {};
    if (!Array.isArray(source?.questions)) throw new Error(`Missing ${year} transcription`);
    const rows = source.questions.filter((q) => !exclude.has(q.question_number));
    if (rows.length !== count || Object.keys(labels?.labels || {}).length !== count) throw new Error(`${year} question or label count differs`);
    let previous = 0;
    const records = rows.map((row) => {
      const n = row.question_number;
      const id = `MPPSC-${year}-${String(n).padStart(3, '0')}`;
      if (!Number.isInteger(n) || n <= previous || n > original || row.id !== id || existing.has(id)) throw new Error(`${year} ID/order collision: ${id}`);
      previous = n; existing.add(id);
      const label = labels.labels[id];
      const topics = taxonomy.subjects.get(label?.subject);
      if (!topics || (label.topic && !topics.has(label.topic)) || (label.subtopic && (!label.topic || !topics.get(label.topic).includes(label.subtopic)))) throw new Error(`Invalid taxonomy: ${id}`);
      const v = row.language_variants?.en;
      if (!v?.question_text || v.options?.length !== 4 || v.options.some((o, i) => o.key !== 'ABCD'[i] || !o.text)) throw new Error(`Invalid transcription: ${id}`);
      const variant = { question_text: v.question_text, instructions: v.instructions ?? null, options: structuredClone(v.options) };
      const question = { id, paper_id: paperId, exam: 'MPPSC State Service Preliminary Examination', year, set_code: null,
        question_number: n, question_type: year === 2009 && n >= 101 && n <= 110 ? 'assertion_reason' : /^Match the following/i.test(v.question_text) ? 'matching' : /^Consider the following statements/i.test(v.question_text) ? 'statement_based' : 'single_correct',
        language_variants: { en: variant }, supplied_answer: { answer: null, status: 'missing', source: null, notes: null },
        answer_key_status: 'missing', explanation: null, subject: label.subject, topic: label.topic ?? null, subtopic: label.subtopic ?? null };
      if (year >= 2009 && year <= 2011) {
        const { review, byId } = reviews[year];
        const r = byId.get(id);
        if (!r || r.question_number !== n || !['supported', 'disputed', 'unresolved'].includes(r.status) || typeof r.reasoning !== 'string' || !r.reasoning.trim() || !Array.isArray(r.sources) || r.sources.some((url) => typeof url !== 'string' || !/^https?:\/\//.test(url))) throw new Error(`Invalid ${year} review: ${id}`);
        if (r.status === 'supported') {
          if (!v.options.some((o) => o.key === r.answer) || r.answer !== r.source_key) throw new Error(`Invalid ${year} source key: ${id}`);
          question.supplied_answer = { answer: [r.answer], status: 'unofficial', source: review.key_source, notes: year === 2011 ? 'Third-party answer list; paper year and identity disputed, not an official MPPSC key.' : 'Third-party answer list; paper identity unconfirmed, not an official MPPSC key.' };
          question.answer_key_status = 'unofficial';
          question.explanation = { correct_reasoning: r.reasoning, sources: [{ citation: review.key_source }, ...r.sources.map((url) => ({ url }))] };
        } else {
          if (r.answer !== null) throw new Error(`Unresolved ${year} answer must be empty: ${id}`);
          question.answer_key_status = r.status === 'disputed' ? 'disputed' : 'missing';
          question.dispute = { is_disputed: r.status === 'disputed', status: 'unresolved', reason: r.reasoning, raised_by: `${year} third-party key review` };
          question.verification_evidence = r.sources.map((url) => ({ url }));
        }
      }
      return question;
    });
    const partial = count !== original;
    bank.papers.push({ paper_id: paperId, exam: 'MPPSC State Service Preliminary Examination', year,
      paper_name: `MPPSC ${year} Prelims General Studies${year === 2011 ? ' (partial transcription; paper identity disputed)' : year === 2010 ? ' (English transcription; paper identity unconfirmed)' : year === 2009 ? ' (partial transcription; paper identity unconfirmed)' : partial ? ' (partial transcription)' : ' (English transcription)'}`,
      paper_code: 'GS-I', set_code: null, language: 'English', original_question_count: original,
      duration_minutes: null, total_marks: null, scoring: { rules_known: false },
      question_order: records.map((q) => q.id), import_validation: null, is_demonstration: false });
    bank.questions.push(...records); total += records.length;
  }
  return total;
}
