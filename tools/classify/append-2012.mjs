/* Append the source transcription and the independent reassessment. The
 * supplied paper has no key; the reassessment is a separate required input. */
export function append2012(bank, source, labels, taxonomy, reassessment) {
  if (reassessment?.paper_id !== 'MPPSC-2012-P1' || reassessment.status !== 'assessed' || !Array.isArray(reassessment.records) || reassessment.records.length !== 100) throw new Error('2012 reassessment must contain 100 assessed records');
  if (!Array.isArray(source?.questions) || source.questions.length !== 100) throw new Error('2012 source must contain exactly 100 questions');
  const existing = new Set(bank.questions.map((q) => q.id));
  if (bank.papers.some((p) => p.paper_id === 'MPPSC-2012-P1')) throw new Error('2012 paper already exists');
  const subjects = taxonomy.subjects;
  const records = source.questions.map((row, index) => {
    const number = index + 1;
    const id = `MPPSC-2012-${String(number).padStart(3, '0')}`;
    if (row.id !== id || row.question_number !== number || existing.has(id)) throw new Error(`2012 question ID/order collision: ${id}`);
    const label = labels?.labels?.[id];
    const topics = subjects.get(label?.subject);
    if (!topics || (label.topic && !topics.has(label.topic)) || (label.subtopic && (!label.topic || !topics.get(label.topic).includes(label.subtopic)))) throw new Error(`Invalid 2012 taxonomy: ${id}`);
    const language_variants = {};
    for (const lang of ['en', 'hi']) {
      const variant = row.language_variants?.[lang];
      if (!variant?.question_text || variant.options?.length !== 4 || variant.options.some((o, i) => o.key !== 'ABCD'[i] || !o.text)) throw new Error(`Invalid 2012 transcription: ${id} ${lang}`);
      language_variants[lang] = { question_text: variant.question_text, instructions: null, options: structuredClone(variant.options) };
    }
    const review = reassessment.records[index];
    if (review?.question_id !== id || review.question_number !== number || !['verified', 'disputed', 'unresolved'].includes(review.status) || typeof review.reasoning !== 'string' || !review.reasoning.trim() || typeof review.ambiguity_or_limitation !== 'string' || !review.ambiguity_or_limitation.trim() || !Array.isArray(review.sources) || review.sources.some((url) => typeof url !== 'string' || !/^https?:\/\//.test(url))) throw new Error(`Invalid 2012 reassessment: ${id}`);
    const question = { id, paper_id: 'MPPSC-2012-P1', exam: 'MPPSC State Service Preliminary Examination', year: 2012, set_code: 'A', question_number: number, question_type: number === 12 ? 'statement_based' : 'single_correct', language_variants, supplied_answer: { answer: null, status: 'missing', source: null, notes: null }, answer_key_status: review.status === 'disputed' ? 'disputed' : 'missing', explanation: null, subject: label.subject, topic: label.topic ?? null, subtopic: label.subtopic ?? null };
    if (review.status === 'verified') {
      if (!review.sources.length || !language_variants.en.options.some((option) => option.key === review.proposed_answer)) throw new Error(`Invalid verified 2012 answer: ${id}`);
      question.verified_answer = { answer: [review.proposed_answer], status: 'verified', verified_by: 'Independent source-based reassessment; not an official MPPSC key', verified_at: null, evidence: review.sources.map((url) => ({ url, note: review.ambiguity_or_limitation })) };
      question.explanation = { correct_reasoning: review.reasoning, sources: review.sources.map((url) => ({ url })) };
    } else {
      question.dispute = { is_disputed: review.status === 'disputed', status: 'unresolved', reason: `${review.reasoning} ${review.ambiguity_or_limitation}`, raised_by: '2012 independent reassessment' };
      question.verification_evidence = review.sources.map((url) => ({ url, note: review.ambiguity_or_limitation }));
    }
    return question;
  });
  if (Object.keys(labels.labels).length !== 100) throw new Error('2012 taxonomy must cover exactly 100 questions');
  const paper = { paper_id: 'MPPSC-2012-P1', exam: 'MPPSC State Service Preliminary Examination', year: 2012, paper_name: 'MPPSC 2012 Prelims Paper I (General Studies)', paper_code: 'GS-I', set_code: 'A', language: 'bilingual', original_question_count: 100, duration_minutes: null, total_marks: null, scoring: { rules_known: false }, question_order: records.map((q) => q.id), import_validation: null, is_demonstration: false };
  bank.papers.push(paper);
  bank.questions.push(...records);
  return records.length;
}
