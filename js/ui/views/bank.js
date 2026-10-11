/**
 * bank.js (view) — Question Bank & Imports.
 *
 * Import workflow (two-phase: analyse, then confirm), bank export, question
 * browser with user corrections, integrity checks, duplicate reports and import
 * history with undo. Nothing is ever imported or deleted silently.
 */

import { ANSWER_KEY_STATUSES, EXPLANATION_STATUSES, STORES } from '../../core/constants.js';
import { state, refreshQuestionIndex } from '../../core/state.js';
import * as db from '../../core/db.js';
import { esc, badge, card, tile, notice, dataTable, toast, openModal, confirmDialog, tabs, mountTabs, renderExplanation, questionTypeLabel, answerKeyBadge, demoBadge, sourceChip, langAttr } from '../components.js';
import { fmtPct, fmtDate, fmtRelative, readFileAsText, downloadJson, todayKey } from '../../core/util.js';
import * as importer from '../../services/importer.js';
import * as data from '../../services/data.js';
import * as questions from '../../services/questions.js';
import { findExactDuplicateGroups, findNearDuplicates } from '../../services/select.js';
import { displayVariant, effectiveAnswer, answerIntegrity } from '../../core/schema.js';

const PAGE_SIZE = 25;

const viewState = {
  tab: 'import',
  page: 0,
  analysis: null,
  importOptions: { conflictPolicy: 'skip', mode: 'merge' },
  lastResult: null,
  filters: { search: '', subject: 'all', topic: 'all', year: 'all', paperId: 'all', answerStatus: 'all', explanationStatus: 'all', demonstration: 'all', attention: false },
};

/* ------------------------------------------------------------- import UI -- */

function importSummary(analysis) {
  const { report, comparison } = analysis;
  const stats = report.stats;
  const papers = report.papers.map((p) => [
    `${esc(p.paper_name || p.paper_id)} ${badge(p.paper_id, '')}${p.placeholder ? badge('placeholder', 'warn') : ''}`,
    `${esc(String(p.year ?? '—'))}${p.set_code ? ` · set ${esc(p.set_code)}` : ''}`,
    p.original_question_count === null || p.original_question_count === undefined ? '<span class="soft">unknown</span>' : String(p.original_question_count),
    String((report.questions || []).filter((q) => q.paper_id === p.paper_id).length),
    p.scoring?.rules_known ? `+${esc(String(p.scoring.marks_per_correct))}${p.scoring.negative_marking_enabled ? ` / −${esc(String(p.scoring.negative_marks_per_incorrect))}` : ''}` : badge('rules unknown', 'warn'),
    esc(p.answer_key?.status || 'unknown'),
  ]);

  const errorRows = [...report.fatal, ...report.errors].slice(0, 40).map((e) => [esc(e.questionId || e.paperId || '—'), esc(e.code || ''), esc(e.message)]);
  const warningRows = report.warnings.slice(0, 40).map((w) => [esc(w.questionId || w.paperId || '—'), esc(w.code || ''), esc(w.message)]);

  return `
    ${notice(
      `This file was parsed and validated <strong>before</strong> anything is written. Nothing has been imported yet.`,
      'info',
      { title: 'Pre-import summary' },
    )}

    <div class="grid tiles">
      ${tile({ label: 'Bank', value: esc(report.meta.bankName || report.meta.bankId || 'unnamed'), sub: `schema ${esc(report.meta.schemaVersion)} · ${esc(report.meta.bankId || 'no bank id')}` })}
      ${tile({ label: 'Questions in file', value: String(stats.questions), sub: `${stats.bilingual} bilingual · ${stats.englishOnly} English-only · ${stats.hindiOnly} Hindi-only` })}
      ${tile({ label: 'Papers in file', value: String(stats.papers), sub: `${stats.incompletePapers} incomplete · ${stats.unknownScoringPapers} without scoring rules` })}
      ${tile({ label: 'Will be added', value: String(comparison.newQuestions), sub: `${comparison.alreadyPresent} id(s) already stored · ${comparison.newPapers} new paper(s)` })}
      ${tile({ label: 'Records rejected', value: String(stats.rejectedRecords), sub: 'invalid records are listed below, never silently dropped' })}
      ${tile({ label: 'Warnings', value: String(report.warnings.length), sub: `${report.errors.length} error(s) · ${report.fatal.length} blocking problem(s)` })}
    </div>

    ${
      report.meta.demoFlag
        ? notice('This file is flagged <strong>is_demonstration: true</strong>. Its questions will be labelled “demonstration” everywhere they appear and are never presented as authentic previous-year questions.', 'warn', { title: 'Demonstration bank' })
        : ''
    }

    ${dataTable({ columns: [{ label: 'Paper' }, { label: 'Year' }, { label: 'Declared Qs', num: true }, { label: 'Present in file', num: true }, { label: 'Scoring' }, { label: 'Answer key' }], rows: papers, empty: 'The file declares no papers.', className: 'compact' })}

    ${
      comparison.changedQuestionIds?.length
        ? card({
            title: `Conflicts with stored questions (${comparison.changedQuestionIds.length})`,
            body: `
              <p class="small">These ids already exist locally with different content. Choose what happens to them; identical records are skipped automatically.</p>
              <ul class="small mono">${comparison.changedQuestionIds.slice(0, 30).map((id) => `<li>${esc(id)}</li>`).join('')}${comparison.changedQuestionIds.length > 30 ? `<li>… and ${comparison.changedQuestionIds.length - 30} more</li>` : ''}</ul>
              <label class="field"><span class="label-text">For conflicting records</span>
                <select id="importConflict">
                  <option value="skip" ${viewState.importOptions.conflictPolicy === 'skip' ? 'selected' : ''}>Keep the stored version and skip the incoming one (default, safest)</option>
                  <option value="update" ${viewState.importOptions.conflictPolicy === 'update' ? 'selected' : ''}>Update from the file, preserving my corrections and verified answers</option>
                  <option value="keep_both" ${viewState.importOptions.conflictPolicy === 'keep_both' ? 'selected' : ''}>Keep both — import as a separate copy flagged as a duplicate</option>
                </select>
              </label>`,
          })
        : ''
    }

    ${errorRows.length ? card({ title: `Rejected or problematic records (${errorRows.length})`, body: dataTable({ columns: [{ label: 'Record' }, { label: 'Code' }, { label: 'Problem' }], rows: errorRows, className: 'compact' }) }) : ''}
    ${warningRows.length ? card({ title: `Warnings (${warningRows.length})`, body: dataTable({ columns: [{ label: 'Record' }, { label: 'Code' }, { label: 'Warning' }], rows: warningRows, className: 'compact' }), footer: 'Warnings do not block the import. Read them before confirming.' }) : ''}
    ${
      report.nearDuplicates?.length
        ? card({
            title: `Possible duplicates inside this file (${report.nearDuplicates.length})`,
            body: dataTable({
              columns: [{ label: 'Question A' }, { label: 'Question B' }, { label: 'Similarity', num: true }],
              rows: report.nearDuplicates.slice(0, 20).map((d) => [`<span class="mono tiny">${esc(d.a)}</span>`, `<span class="mono tiny">${esc(d.b)}</span>`, fmtPct(d.similarity)]),
              className: 'compact',
            }),
            footer: 'Detected by text similarity, not by an exact match — both records are imported. Review them in the Duplicates tab and decide yourself.',
          })
        : ''
    }

    <div class="sticky-actions">
      <button class="btn btn-primary" type="button" id="confirmImport">Confirm import (${comparison.newQuestions} new question(s))</button>
      <button class="btn btn-quiet" type="button" id="cancelImport">Cancel — import nothing</button>
      <span class="tiny muted">The file's own content is preserved; provenance, hashes and validation results are stored with the import record.</span>
    </div>`;
}

function importResultCard(result) {
  if (!result) return '';
  const { importRecord, stats, rejected, skipped } = result;
  return card({
    title: 'Import complete',
    tone: 'ok',
    body: `
      <div class="grid tiles">
        ${tile({ label: 'Questions added', value: String(stats.questionsAdded) })}
        ${tile({ label: 'Questions updated', value: String(stats.questionsUpdated) })}
        ${tile({ label: 'Duplicates imported separately', value: String(stats.questionsKeptBoth) })}
        ${tile({ label: 'Skipped', value: String(stats.questionsSkipped), sub: 'already stored, or kept existing on conflict' })}
        ${tile({ label: 'Papers added', value: String(stats.papersAdded), sub: `${stats.papersUpdated} updated` })}
        ${tile({ label: 'Records rejected', value: String(rejected.length), sub: 'listed for inspection' })}
      </div>
      ${
        skipped.length
          ? `<details class="disclosure" open><summary>Skipped records (${skipped.length})</summary><ul class="small mono">${skipped.slice(0, 30).map((s) => `<li>${esc(s.id)} — ${esc(s.reason)}</li>`).join('')}</ul></details>`
          : ''
      }
      ${
        rejected.length
          ? `<details class="disclosure"><summary>Rejected records (${rejected.length})</summary><ul class="small">${rejected.slice(0, 30).map((r) => `<li><span class="mono">${esc(r.id || `index ${r.index}`)}</span> — ${esc(r.reason)}</li>`).join('')}</ul>
             <button class="btn btn-sm" type="button" id="downloadRejected">Download rejected records</button></details>`
          : ''
      }
      <div class="row mt-3">
        <button class="btn" type="button" id="undoImport" data-import-id="${esc(importRecord.id)}">Undo this import</button>
        <a class="btn btn-quiet" href="#/topic">Start practising</a>
      </div>
      <p class="tiny muted">Import record ${esc(importRecord.id)} · stored with the file hash, validation status and the counts above.</p>`,
  });
}

/* ---------------------------------------------------------- question UI -- */

function filterQuestions(metas) {
  const f = viewState.filters;
  const search = f.search.trim().toLowerCase();
  return metas
    .filter((m) => (f.subject === 'all' ? true : (m.subject || 'Unclassified') === f.subject))
    .filter((m) => (f.topic === 'all' ? true : (m.topic || 'Unclassified') === f.topic))
    .filter((m) => (f.year === 'all' ? true : String(m.year) === String(f.year)))
    .filter((m) => (f.paperId === 'all' ? true : m.paper_id === f.paperId))
    .filter((m) => (f.answerStatus === 'all' ? true : (m.answerStatus || 'unknown') === f.answerStatus))
    .filter((m) => (f.explanationStatus === 'all' ? true : (m.explanationStatus || 'missing') === f.explanationStatus))
    .filter((m) => (f.demonstration === 'all' ? true : f.demonstration === 'only' ? m.demonstration : !m.demonstration))
    .filter((m) => (f.attention ? m.needsAttention || m.unclassified || !m.hasSuppliedAnswer : true))
    .filter((m) => (search ? m.id.toLowerCase().includes(search) || (m.subject || '').toLowerCase().includes(search) || (m.topic || '').toLowerCase().includes(search) || String(m.question_number ?? '').includes(search) : true))
    .sort((a, b) => (a.paper_id === b.paper_id ? (a.question_number ?? 0) - (b.question_number ?? 0) : a.paper_id < b.paper_id ? -1 : 1));
}

async function openQuestionEditor(questionId, ctx) {
  const map = await questions.getQuestions([questionId]);
  const question = map.get(questionId);
  if (!question) {
    toast('That question is no longer stored.', 'warn');
    return;
  }
  const meta = state.questionIndex.get(questionId);
  const effective = effectiveAnswer(question, state.settings.answerPolicy);
  const integrity = answerIntegrity(question);
  const variant = displayVariant(question, state.settings.language).variant || Object.values(question.language_variants)[0];
  const history = questions.correctionHistory(question);

  const optionRows = (variant?.options || []).map((o) => [
    `<strong>${esc(o.key)}</strong>`,
    esc(o.text),
    (question.supplied?.answer || []).includes(o.key) ? badge('supplied key', 'info') : '',
    (question.verified?.answer || []).includes(o.key) ? badge('verified', 'ok') : '',
  ]);

  await openModal({
    title: `Question ${questionId}`,
    wide: true,
    onMount: (modal, close) => {
      modal.querySelector('#editClassificationBtn')?.addEventListener('click', async () => {
        const value = await openModal({
          title: 'Edit classification',
          body: `
            <p class="small">Your edit is stored as a correction. The imported labels stay available and can be restored at any time.</p>
            <label class="field"><span class="label-text">Subject</span><input type="text" id="clsSubject" value="${esc(question.classification?.subject || '')}" /></label>
            <label class="field"><span class="label-text">Topic</span><input type="text" id="clsTopic" value="${esc(question.classification?.topic || '')}" /></label>
            <label class="field"><span class="label-text">Subtopic</span><input type="text" id="clsSubtopic" value="${esc(question.classification?.subtopic || '')}" /></label>
            <label class="field"><span class="label-text">Note (optional)</span><input type="text" id="clsNote" /></label>`,
          actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Save correction', tone: 'btn-primary', value: 'ok' }],
        });
        if (value !== 'ok') return;
        await questions.updateClassification(questionId, {
          subject: document.getElementById('clsSubject')?.value.trim() || null,
          topic: document.getElementById('clsTopic')?.value.trim() || null,
          subtopic: document.getElementById('clsSubtopic')?.value.trim() || null,
          note: document.getElementById('clsNote')?.value || 'Classification edited by you.',
        });
        toast('Classification updated. The imported labels were kept.', 'ok');
        close(null);
        await ctx.refresh();
      });

      modal.querySelector('#revertClassificationBtn')?.addEventListener('click', async () => {
        try {
          await questions.revertClassification(questionId);
          toast('Original imported classification restored.', 'ok');
          close(null);
          await ctx.refresh();
        } catch (err) {
          toast(err.message, 'warn');
        }
      });

      modal.querySelector('#verifyAnswerBtn')?.addEventListener('click', async () => {
        const keys = (variant?.options || []).map((o) => o.key);
        const value = await openModal({
          title: 'Record a verified answer',
          body: `
            <p class="small">The supplied key is never overwritten. A verified answer is an additional, separately-attributed record used by the answer policy you choose in Settings.</p>
            <div class="stack">${keys
              .map(
                (k) => `<label class="check"><input type="checkbox" name="verifyKey" value="${esc(k)}" ${(question.verified?.answer || []).includes(k) ? 'checked' : ''} /><span><strong>${esc(k)}</strong> — ${esc((variant.options.find((o) => o.key === k) || {}).text || '')}</span></label>`,
              )
              .join('')}</div>
            <label class="field"><span class="label-text">Evidence / source</span><textarea id="verifyEvidence" rows="2" placeholder="e.g. checked against the official key PDF, page 4"></textarea></label>`,
          actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Save verified answer', tone: 'btn-primary', value: 'ok' }],
        });
        if (value !== 'ok') return;
        const answer = Array.from(document.querySelectorAll('input[name="verifyKey"]:checked')).map((el) => el.value);
        const evidence = document.getElementById('verifyEvidence')?.value.trim();
        if (!answer.length) {
          toast('Select at least one option key.', 'warn');
          return;
        }
        await questions.setVerifiedAnswer(questionId, { answer, evidence: evidence ? [{ note: evidence, by: 'you', at: new Date().toISOString() }] : [] });
        toast('Verified answer recorded; the supplied key was left untouched.', 'ok');
        close(null);
        await ctx.refresh();
      });

      modal.querySelector('#disputeBtn')?.addEventListener('click', async () => {
        if (question.dispute?.is_disputed) {
          await questions.setDispute(questionId, { isDisputed: false, reason: 'Dispute cleared by you.' });
          toast('Dispute cleared.', 'info');
        } else {
          const value = await openModal({
            title: 'Flag the answer key as disputed',
            body: `<label class="field"><span class="label-text">Reason (stored with the flag)</span><textarea id="disputeReason" rows="2" placeholder="e.g. two sources disagree on option C"></textarea></label>`,
            actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Flag as disputed', tone: 'btn-primary', value: 'ok' }],
          });
          if (value !== 'ok') return;
          await questions.setDispute(questionId, { isDisputed: true, status: 'open', reason: document.getElementById('disputeReason')?.value.trim() || 'Flagged by you.' });
          toast('Key flagged as disputed. Reports will show which key was used.', 'ok');
        }
        close(null);
        await ctx.refresh();
      });

      modal.querySelector('#noteBtn')?.addEventListener('click', async () => {
        const value = await openModal({
          title: 'Add a note',
          body: `<label class="field"><span class="label-text">Note</span><textarea id="noteText" rows="3"></textarea></label>`,
          actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Save note', tone: 'btn-primary', value: 'ok' }],
        });
        if (value !== 'ok') return;
        const text = document.getElementById('noteText')?.value.trim();
        if (!text) return;
        await questions.addNote(questionId, text);
        toast('Note saved.', 'ok');
        close(null);
        await ctx.refresh();
      });

      modal.querySelector('#deleteQuestionBtn')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Delete this question from the bank?',
          message: `Question <strong>${esc(questionId)}</strong> will be removed from the local database. Attempts already recorded against it stay in your history but will no longer resolve to a question. Prefer exporting a backup first.`,
          confirmLabel: 'Delete question',
          danger: true,
        });
        if (!ok) return;
        await db.remove(STORES.QUESTIONS, questionId);
        await refreshQuestionIndex({ silent: true });
        toast('Question removed.', 'info');
        close(null);
        await ctx.refresh();
      });
    },
    body: `
      <div class="row mb-2">
        ${demoBadge(meta?.demonstration)} ${answerKeyBadge(question.supplied?.status)}
        ${question.dispute?.is_disputed ? badge('disputed key', 'bad') : ''}
        ${question.verified?.answer ? badge('verified answer recorded', 'ok') : ''}
        ${badge(questionTypeLabel(question.question_type), '')}
        ${meta?.unclassified ? badge('unclassified', 'warn') : ''}
        ${meta?.needsAttention ? badge('needs attention', 'warn') : ''}
      </div>

      <h3>Question text</h3>
      <p class="question-text"${langAttr(variant?.language)}>${esc(variant?.question_text || '—')}</p>
      <p class="tiny muted">Language shown: ${esc(variant?.language || '—')}. ${Object.keys(question.language_variants).length > 1 ? `Available: ${esc(Object.keys(question.language_variants).join(', '))}. Bilingual variants share this one id, so analytics count the question once.` : 'Only one language is stored for this question.'}</p>
      ${variant?.context ? `<p class="small muted"${langAttr(variant?.language)}>${esc(variant.context)}</p>` : ''}
      ${variant?.passage ? `<blockquote class="passage"${langAttr(variant?.language)}>${esc(variant.passage)}</blockquote>` : ''}

      <h3>Options</h3>
      ${dataTable({ columns: [{ label: 'Key' }, { label: 'Text' }, { label: 'Supplied' }, { label: 'Verified' }], rows: optionRows, className: 'compact' })}

      <h3>Answer keys</h3>
      ${dataTable({
        columns: [{ label: 'Record' }, { label: 'Answer' }, { label: 'Status' }, { label: 'Source' }],
        rows: [
          ['Supplied by the source', esc((question.supplied?.answer || []).join(', ') || 'none'), esc(question.supplied?.status || 'unknown'), esc(question.supplied?.source || '—')],
          ['Independently verified', esc((question.verified?.answer || []).join(', ') || 'none'), esc(question.verified?.status || '—'), esc(question.verified?.verified_by ? `${question.verified.verified_by}${question.verified.source ? ` (${question.verified.source})` : ''}` : '—')],
          ['Used for scoring now', esc((effective.answer || []).join(', ') || 'none'), esc(effective.reason || ''), esc(`policy: ${state.settings.answerPolicy}`)],
        ],
        className: 'compact',
      })}
      <p class="small">${integrity.label ? esc(integrity.label) : 'The supplied key is present and no conflict has been recorded between the supplied and verified answers.'}</p>

      <h3>Classification</h3>
      ${dataTable({
        columns: [{ label: 'Field' }, { label: 'Imported' }, { label: 'In use now' }],
        rows: [
          ['Subject', esc(question.classification?.original?.subject ?? '—'), esc(question.classification?.subject ?? '—')],
          ['Topic', esc(question.classification?.original?.topic ?? '—'), esc(question.classification?.topic ?? '—')],
          ['Subtopic', esc(question.classification?.original?.subtopic ?? '—'), esc(question.classification?.subtopic ?? '—')],
          ['Source', esc(question.classification?.original?.source ?? '—'), esc(question.classification?.source ?? '—')],
          ['Confidence', esc(String(question.classification?.original?.confidence ?? '—')), esc(String(question.classification?.confidence ?? '—'))],
        ],
        className: 'compact',
      })}

      <h3>Explanation (shown exactly as supplied)</h3>
      ${renderExplanation(question)}

      <h3>Provenance</h3>
      ${dataTable({
        columns: [{ label: 'Field' }, { label: 'Value' }],
        rows: [
          ['Paper', esc(question.paper_id)],
          ['Question number in paper', esc(String(question.question_number ?? '—'))],
          ['Original order preserved', question.metadata?.original_order_preserved ? 'yes' : 'not recorded'],
          ['Source file', esc(question.metadata?.source_file || '—')],
          ['Imported at', esc(fmtRelative(question.imported_at))],
          ['Import history', String((question.import_history || []).length)],
          ['User corrections', String((question.user_corrections || []).length)],
        ],
        className: 'compact',
      })}

      <h3>Correction history</h3>
      ${dataTable({
        columns: [{ label: 'When' }, { label: 'Kind' }, { label: 'Note' }, { label: 'Before' }],
        rows: history.map((h) => [esc(fmtDate(h.at)), esc(h.kind), esc(h.note || '—'), h.before ? `<span class="mono tiny">${esc(JSON.stringify(h.before))}</span>` : '—']),
        empty: 'No corrections made. The imported record is untouched.',
        className: 'compact',
      })}

      <div class="row mt-3">
        <button class="btn btn-sm" type="button" id="editClassificationBtn">Edit classification</button>
        <button class="btn btn-sm" type="button" id="revertClassificationBtn" ${question.classification?.original ? '' : 'disabled'}>Restore imported classification</button>
        <button class="btn btn-sm" type="button" id="verifyAnswerBtn">Record verified answer</button>
        <button class="btn btn-sm" type="button" id="disputeBtn">${question.dispute?.is_disputed ? 'Clear dispute flag' : 'Flag key as disputed'}</button>
        <button class="btn btn-sm" type="button" id="noteBtn">Add note</button>
        <button class="btn btn-sm btn-danger" type="button" id="deleteQuestionBtn">Delete question</button>
      </div>`,
    actions: [{ label: 'Close', tone: 'btn-primary', value: 'close' }],
  });
}

/* --------------------------------------------------------------- render -- */

export default {
  title: 'Question Bank & Imports',

  async render(ctx) {
    const metas = Array.from(state.questionIndex.values());
    const papers = Array.from(state.papers.values());
    const summary = questions.bankSummary();
    const importHistoryRows = await importer.importHistory({ limit: 25 });
    const stored = await db.storeCounts();

    const importTab = `
      ${importResultCard(viewState.lastResult)}
      ${card({
        title: 'Import a question bank',
        right: sourceChip('supplied', 'validated before write'),
        body: `
          <p class="small">A bank is a UTF-8 JSON file following the documented schema. It is validated before anything is written: schema version, required fields, option keys, answer keys, language variants and paper metadata. Invalid records are rejected <em>and listed</em>; nothing is dropped silently.</p>
          <div class="row mt-3 mb-3">
            <input type="file" id="bankFile" accept="application/json,.json" />
          </div>
          <details class="disclosure"><summary>Or paste JSON directly</summary>
            <textarea id="bankPaste" rows="6" placeholder='{"schema_version":"1.0.0", ...}' class="w-full"></textarea>
            <div class="row mt-2"><button class="btn btn-sm" type="button" id="analysePaste">Analyse pasted JSON</button></div>
          </details>
          <details class="disclosure"><summary>Demonstration data</summary>
            <p class="small">A small synthetic bank is bundled so you can explore every screen without a real question set. Its questions are flagged <code>is_demonstration: true</code> and are never presented as authentic previous-year questions.</p>
            <div class="row"><button class="btn btn-sm" type="button" id="loadDemo">Load demonstration bank</button><button class="btn btn-sm" type="button" id="loadExample">Load the schema example (also synthetic)</button></div>
          </details>`,
      })}
      ${viewState.analysis ? importSummary(viewState.analysis) : ''}`;

    /* --------------------------------------------------------- questions -- */
    const filtered = filterQuestions(metas);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    viewState.page = Math.min(viewState.page, pageCount - 1);
    const pageRows = filtered.slice(viewState.page * PAGE_SIZE, viewState.page * PAGE_SIZE + PAGE_SIZE);
    const subjects = Array.from(new Set(metas.map((m) => m.subject || 'Unclassified'))).sort();
    const topics = Array.from(new Set(metas.filter((m) => viewState.filters.subject === 'all' || (m.subject || 'Unclassified') === viewState.filters.subject).map((m) => m.topic || 'Unclassified'))).sort();
    const years = Array.from(new Set(metas.map((m) => m.year).filter((y) => y !== null && y !== undefined))).sort((a, b) => Number(b) - Number(a));

    const questionsTab = `
      ${card({
        title: 'Filters',
        body: `
          <div class="filters">
            <label class="field"><span class="label-text">Search</span><input type="search" id="qSearch" value="${esc(viewState.filters.search)}" placeholder="id, subject, topic or number" /></label>
            <label class="field"><span class="label-text">Subject</span><select id="qSubject"><option value="all">All</option>${subjects.map((s) => `<option value="${esc(s)}" ${viewState.filters.subject === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
            <label class="field"><span class="label-text">Topic</span><select id="qTopic"><option value="all">All</option>${topics.map((t) => `<option value="${esc(t)}" ${viewState.filters.topic === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
            <label class="field"><span class="label-text">Year</span><select id="qYear"><option value="all">All</option>${years.map((y) => `<option value="${esc(String(y))}" ${String(viewState.filters.year) === String(y) ? 'selected' : ''}>${esc(String(y))}</option>`).join('')}</select></label>
            <label class="field"><span class="label-text">Paper</span><select id="qPaper"><option value="all">All</option>${papers.map((p) => `<option value="${esc(p.paper_id)}" ${viewState.filters.paperId === p.paper_id ? 'selected' : ''}>${esc(p.paper_name || p.paper_id)}</option>`).join('')}</select></label>
            <label class="field"><span class="label-text">Answer key</span><select id="qAnswer"><option value="all">Any</option>${Object.entries(ANSWER_KEY_STATUSES).map(([k, l]) => `<option value="${esc(k)}" ${viewState.filters.answerStatus === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label class="field"><span class="label-text">Explanation</span><select id="qExplanation"><option value="all">Any</option>${Object.entries(EXPLANATION_STATUSES).map(([k, l]) => `<option value="${esc(k)}" ${viewState.filters.explanationStatus === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label class="field"><span class="label-text">Demonstration</span><select id="qDemo">
              <option value="all">Include</option><option value="exclude" ${viewState.filters.demonstration === 'exclude' ? 'selected' : ''}>Exclude synthetic demo questions</option><option value="only" ${viewState.filters.demonstration === 'only' ? 'selected' : ''}>Only synthetic demo questions</option>
            </select></label>
            <label class="check self-end"><input type="checkbox" id="qAttention" ${viewState.filters.attention ? 'checked' : ''} /><span>Only questions needing attention</span></label>
          </div>`,
      })}

      ${card({
        title: `Questions (${filtered.length} of ${metas.length})`,
        subtitle: `Page ${viewState.page + 1} of ${pageCount}`,
        actions: `
          <button class="btn btn-sm" type="button" id="qPrev" ${viewState.page === 0 ? 'disabled' : ''}>Previous</button>
          <button class="btn btn-sm" type="button" id="qNext" ${viewState.page >= pageCount - 1 ? 'disabled' : ''}>Next</button>
          <button class="btn btn-sm btn-quiet" type="button" id="exportBank">Export bank</button>`,
        body: dataTable({
          columns: [{ label: 'Question' }, { label: 'Paper / year' }, { label: 'Classification' }, { label: 'Keys' }, { label: 'Explanation' }, { label: '' }],
          rows: pageRows.map((m) => [
            `<div><strong>Q${esc(String(m.question_number ?? '—'))}</strong> <span class="mono tiny">${esc(m.id)}</span> ${demoBadge(m.demonstration)}</div>
             <div class="tiny muted">${esc(questionTypeLabel(m.question_type))}${m.langs.length > 1 ? ' · bilingual' : ` · ${esc(m.langs.join(', '))}`}</div>`,
            `${esc(m.paper_id)}<div class="tiny muted">${esc(String(m.year ?? 'year unknown'))}</div>`,
            `${esc(m.subject || 'Unclassified')}<div class="tiny muted">${esc(m.topic || '—')}</div>`,
            `${answerKeyBadge(m.answerStatus)}${m.disputed ? ` ${badge('disputed', 'bad')}` : ''}${m.hasVerifiedAnswer ? ` ${badge('verified', 'ok')}` : ''}`,
            `${badge(m.explanationStatus || 'missing', m.explanationStatus === 'reviewed' ? 'ok' : m.explanationStatus === 'unreviewed' ? 'warn' : '')}`,
            `<button class="btn btn-sm" type="button" data-open-question="${esc(m.id)}">Open</button>`,
          ]),
          empty: 'No questions match these filters.',
          className: 'compact',
        }),
      })}`;

    /* -------------------------------------------------------- integrity -- */
    const missingKeys = metas.filter((m) => !m.hasSuppliedAnswer && !m.hasVerifiedAnswer);
    const disputed = metas.filter((m) => m.disputed);
    const unreviewed = metas.filter((m) => m.explanationStatus === 'unreviewed' || m.explanationStatus === 'missing');
    const incompletePapers = papers.filter((p) => p.original_question_count !== null && p.original_question_count !== undefined && p.original_question_count !== metas.filter((m) => m.paper_id === p.paper_id).length);
    const unknownRulesPapers = papers.filter((p) => !p.scoring?.rules_known);
    const placeholderPapers = papers.filter((p) => p.placeholder);

    const integrityTab = `
      <div class="grid tiles">
        ${tile({ label: 'Answer keys present', value: `${metas.length - missingKeys.length}/${metas.length}`, sub: `${missingKeys.length} without any usable key`, tone: missingKeys.length ? 'warn' : 'ok' })}
        ${tile({ label: 'Disputed keys', value: String(disputed.length), sub: 'flagged for review', tone: disputed.length ? 'bad' : 'ok' })}
        ${tile({ label: 'Explanations reviewed', value: String(summary.byExplanation.reviewed || 0), sub: `${unreviewed.length} missing or unreviewed`, tone: unreviewed.length ? 'warn' : 'ok' })}
        ${tile({ label: 'Unclassified questions', value: String(summary.unclassified), sub: 'no subject/topic — excluded from topic analytics', tone: summary.unclassified ? 'warn' : 'ok' })}
        ${tile({ label: 'Papers with unknown rules', value: String(unknownRulesPapers.length), sub: 'cannot be scored until configured', tone: unknownRulesPapers.length ? 'warn' : 'ok' })}
        ${tile({ label: 'Incomplete papers', value: String(incompletePapers.length), sub: 'fewer stored questions than the paper declares', tone: incompletePapers.length ? 'warn' : 'ok' })}
      </div>

      ${card({
        title: 'Papers',
        body: dataTable({
          columns: [{ label: 'Paper' }, { label: 'Stored / declared', num: true }, { label: 'Scoring rules' }, { label: 'Answer key' }, { label: 'Origin' }, { label: '' }],
          rows: papers.map((p) => {
            const present = metas.filter((m) => m.paper_id === p.paper_id).length;
            return [
              `${esc(p.paper_name || p.paper_id)}<div class="tiny muted">${esc(p.paper_id)}${p.set_code ? ` · set ${esc(p.set_code)}` : ''}</div>`,
              `${present} / ${esc(String(p.original_question_count ?? '—'))}`,
              p.scoring?.rules_known
                ? `+${esc(String(p.scoring.marks_per_correct))}${p.scoring.negative_marking_enabled ? ` / −${esc(String(p.scoring.negative_marks_per_incorrect))}` : ' (no negative marking)'}${p.user_scoring_override ? ` ${badge('you set this', 'info')}` : ''}`
                : badge('unknown — must be configured', 'warn'),
              esc(p.answer_key?.status || 'unknown'),
              p.placeholder ? badge('placeholder (metadata absent)', 'warn') : badge(p.is_demonstration ? 'demonstration' : 'imported bank', p.is_demonstration ? 'warn' : ''),
              `<button class="btn btn-sm" type="button" data-edit-paper="${esc(p.paper_id)}">Edit rules</button>`,
            ];
          }),
          empty: 'No papers stored.',
          className: 'compact',
        }),
        footer: 'Editing a paper\'s scoring rules records your override and never rewrites the original imported metadata.',
      })}

      ${
        missingKeys.length
          ? card({
              title: `Questions with no answer key (${missingKeys.length})`,
              body: `<p class="small">These cannot be judged. They are excluded from scoring rather than counted wrong, and their attempts are labelled “unscored”.</p>
                     ${dataTable({ columns: [{ label: 'Question' }, { label: 'Paper' }, { label: '' }], rows: missingKeys.slice(0, 25).map((m) => [`<span class="mono tiny">${esc(m.id)}</span>`, esc(m.paper_id), `<button class="btn btn-sm" type="button" data-open-question="${esc(m.id)}">Open</button>`]), className: 'compact' })}`,
            })
          : ''
      }
      ${
        disputed.length
          ? card({
              title: `Disputed keys (${disputed.length})`,
              body: dataTable({
                columns: [{ label: 'Question' }, { label: 'Supplied' }, { label: 'Verified' }, { label: '' }],
                rows: disputed.slice(0, 25).map((m) => [`<span class="mono tiny">${esc(m.id)}</span>`, esc(m.answerStatus), m.hasVerifiedAnswer ? 'recorded' : '—', `<button class="btn btn-sm" type="button" data-open-question="${esc(m.id)}">Open</button>`]),
                className: 'compact',
              }),
              footer: 'The supplied key is preserved and the post-test report records which key each answer was judged against.',
            })
          : ''
      }
      ${
        unreviewed.length
          ? card({
              title: `Explanations missing or unreviewed (${unreviewed.length})`,
              body: dataTable({
                columns: [{ label: 'Question' }, { label: 'Status' }, { label: 'Subject' }, { label: '' }],
                rows: unreviewed.slice(0, 25).map((m) => [`<span class="mono tiny">${esc(m.id)}</span>`, badge(m.explanationStatus || 'missing', m.explanationStatus === 'unreviewed' ? 'warn' : ''), esc(m.subject || '—'), `<button class="btn btn-sm" type="button" data-open-question="${esc(m.id)}">Open</button>`]),
                className: 'compact',
              }),
              footer: 'This app never writes an explanation. It displays exactly what the imported record contains and labels anything missing or not yet reviewed.',
            })
          : ''
      }
      ${placeholderPapers.length ? card({ title: 'Placeholder papers', body: `<p class="small">These were created because questions referenced a paper that the bank did not describe. Exam, year, duration and marks are unknown, so full-paper simulations for them are labelled as incomplete.</p><ul class="small mono">${placeholderPapers.map((p) => `<li>${esc(p.paper_id)}</li>`).join('')}</ul>` }) : ''}`;

    /* -------------------------------------------------------- duplicates -- */
    const exactGroups = findExactDuplicateGroups(metas);
    const nearDupes = findNearDuplicates(metas, state.settings.repeatPolicy.nearDuplicateThreshold, 60);

    const duplicatesTab = `
      ${card({
        title: `Exact duplicates (${exactGroups.length} group(s))`,
        body: exactGroups.length
          ? `${dataTable({
              columns: [{ label: 'Identical text and options' }, { label: '' }],
              rows: exactGroups.map((g) => [
                g.ids.map((id) => `<div><span class="mono tiny">${esc(id)}</span> <span class="tiny muted">${esc(state.questionIndex.get(id)?.paper_id || '')}</span></div>`).join(''),
                `<button class="btn btn-sm" type="button" data-merge-review="${esc(g.ids.join(','))}">Review</button>`,
              ]),
              className: 'compact',
            })}`
          : '<p class="muted small">No two stored questions share identical text and options.</p>',
        footer: 'Exact duplicates are detected by a fingerprint over the normalised question text and option texts. Bilingual variants of the same question share one id and are never counted as duplicates.',
      })}

      ${card({
        title: `Near duplicates (${nearDupes.length} pair(s) above ${Math.round(state.settings.repeatPolicy.nearDuplicateThreshold * 100)}% similarity)`,
        body: nearDupes.length
          ? dataTable({
              columns: [{ label: 'Question A' }, { label: 'Question B' }, { label: 'Similarity', num: true }, { label: '' }],
              rows: nearDupes.map((d) => [
                `<span class="mono tiny">${esc(d.a)}</span><div class="tiny muted">${esc(state.questionIndex.get(d.a)?.subject || '')}</div>`,
                `<span class="mono tiny">${esc(d.b)}</span><div class="tiny muted">${esc(state.questionIndex.get(d.b)?.subject || '')}</div>`,
                fmtPct(d.similarity),
                `<button class="btn btn-sm" type="button" data-open-question="${esc(d.a)}">Open A</button> <button class="btn btn-sm" type="button" data-open-question="${esc(d.b)}">Open B</button>`,
              ]),
              className: 'compact',
            })
          : '<p class="muted small">No near-duplicate pairs were found above the threshold.</p>',
        footer: 'Similarity is a blend of token overlap and shared word sequences. It is a prompt for you to look, not a verdict — rephrased questions about the same fact are often legitimately separate.',
      })}`;

    /* ----------------------------------------------------------- history -- */
    const historyTab = `
      ${card({
        title: 'Import history',
        body: dataTable({
          columns: [{ label: 'When' }, { label: 'Bank' }, { label: 'File' }, { label: 'Counts' }, { label: 'Validation' }, { label: '' }],
          rows: importHistoryRows.map((h) => [
            esc(fmtDate(h.imported_at)),
            `${esc(h.bank_name || h.bank_id)}<div class="tiny muted">${esc(h.schema_version || '')}${h.is_demonstration ? ' · demonstration' : ''}</div>`,
            `${esc(h.filename || '—')}<div class="tiny muted mono">${esc((h.file_sha256 || '').slice(0, 16))}${h.file_sha256 ? '…' : ''}</div>`,
            `+${esc(String(h.counts?.questionsAdded ?? 0))} new · ${esc(String(h.counts?.questionsUpdated ?? 0))} updated · ${esc(String(h.counts?.questionsSkipped ?? 0))} skipped`,
            badge(h.validation_status || 'unknown', h.validation_status === 'valid' ? 'ok' : h.validation_status === 'invalid' ? 'bad' : 'warn'),
            `<div class="row tight"><button class="btn btn-sm" type="button" data-import-issues="${esc(h.id)}">Issues</button><button class="btn btn-sm btn-quiet" type="button" data-import-undo="${esc(h.id)}">Undo</button></div>`,
          ]),
          empty: 'Nothing imported yet.',
          className: 'compact',
        }),
      })}

      ${card({
        title: 'Local storage',
        body: `
          ${dataTable({
            columns: [{ label: 'Store' }, { label: 'Records', num: true }],
            rows: Object.entries(stored).filter(([, v]) => typeof v === 'number').map(([k, v]) => [esc(k), String(v)]),
            className: 'compact',
          })}
          <p class="tiny muted">Everything above lives in IndexedDB in this browser. Clearing site data deletes it, so export a backup from <a href="#/settings">Settings &amp; Backup</a> regularly.</p>`,
      })}`;

    return `
      <h1>Question Bank &amp; Imports</h1>
      <p class="muted">The question bank is data, not code: this app never needs rebuilding to accept a new paper.</p>
      ${tabs({
        id: 'bankTabs',
        activeId: viewState.tab,
        items: [
          { id: 'import', label: 'Import', body: importTab },
          { id: 'questions', label: `Questions (${metas.length})`, body: questionsTab },
          { id: 'integrity', label: 'Integrity', body: integrityTab },
          { id: 'duplicates', label: 'Duplicates', body: duplicatesTab },
          { id: 'history', label: 'History & storage', body: historyTab },
        ],
      })}`;
  },

  async mount(ctx, root) {
    mountTabs(root);
    root.querySelectorAll('.tabs .tab').forEach((tab) => tab.addEventListener('click', () => {
      viewState.tab = tab.dataset.tab;
    }));

    /* ------------------------------------------------------------ import -- */
    const analyse = async (text, filename) => {
      try {
        const analysis = await importer.analyseBankFile(text, { filename, nearDuplicateThreshold: state.settings.repeatPolicy.nearDuplicateThreshold });
        viewState.analysis = analysis;
        viewState.lastResult = null;
        viewState.tab = 'import';
        if (analysis.stage === 'error' || analysis.stage === 'blocked') {
          toast(analysis.fatalMessage || 'This file could not be imported.', 'bad');
        } else {
          toast(`Analysed ${analysis.report.questions.length} question(s). Review the summary before importing.`, 'info');
        }
        await ctx.refresh();
      } catch (err) {
        toast(`Analysis failed: ${err.message}`, 'bad');
      }
    };

    document.getElementById('bankFile')?.addEventListener('change', async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const text = await readFileAsText(file);
      await analyse(text, file.name);
      ev.target.value = '';
    });

    document.getElementById('analysePaste')?.addEventListener('click', async () => {
      const text = document.getElementById('bankPaste')?.value || '';
      if (!text.trim()) {
        toast('Paste some JSON first.', 'warn');
        return;
      }
      await analyse(text, 'pasted.json');
    });

    const loadBundled = async (path, label) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Could not read ${path} (HTTP ${res.status})`);
      const text = await res.text();
      await analyse(text, label);
    };
    document.getElementById('loadDemo')?.addEventListener('click', async () => {
      try {
        await loadBundled('data/demo/demo-bank.json', 'demo-bank.json');
      } catch (err) {
        toast(err.message, 'bad');
      }
    });
    document.getElementById('loadExample')?.addEventListener('click', async () => {
      try {
        await loadBundled('data/examples/example-bank.json', 'example-bank.json');
      } catch (err) {
        toast(err.message, 'bad');
      }
    });

    document.getElementById('importConflict')?.addEventListener('change', (ev) => {
      viewState.importOptions.conflictPolicy = ev.target.value;
    });

    document.getElementById('cancelImport')?.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Cancel this import?', message: 'Nothing from the analysed file will be written. You can analyse it again later.', confirmLabel: 'Discard' });
      if (!ok) return;
      viewState.analysis = null;
      toast('Import cancelled; no data was written.', 'info');
      await ctx.refresh();
    });

    document.getElementById('confirmImport')?.addEventListener('click', async () => {
      const analysis = viewState.analysis;
      if (!analysis) return;
      const ok = await confirmDialog({
        title: 'Confirm import',
        message: `<strong>${analysis.report.questions.length}</strong> validated question(s) and <strong>${analysis.report.papers.length}</strong> paper(s) will be written to your local database, and <strong>${analysis.report.rejected.length}</strong> invalid record(s) will be rejected and recorded. Conflict policy: <strong>${esc(viewState.importOptions.conflictPolicy)}</strong>.`,
        confirmLabel: 'Import now',
      });
      if (!ok) return;
      try {
        const result = await importer.executeImport(analysis, { ...viewState.importOptions, mode: 'merge', userConfirmed: true });
        viewState.lastResult = result;
        viewState.analysis = null;
        toast(`Imported: +${result.stats.questionsAdded} question(s), ${result.stats.questionsUpdated} updated, ${result.stats.questionsSkipped} skipped.`, 'ok');
        await ctx.refresh();
      } catch (err) {
        toast(`Import failed: ${err.message}`, 'bad');
      }
    });

    document.getElementById('downloadRejected')?.addEventListener('click', () => {
      if (!viewState.lastResult) return;
      downloadJson({ format: 'mymppsc-rejected-records', exported_at: new Date().toISOString(), records: viewState.lastResult.rejected }, `mymppsc-rejected-${todayKey()}.json`);
    });

    document.getElementById('undoImport')?.addEventListener('click', async (ev) => {
      const importId = ev.target.dataset.importId;
      const ok = await confirmDialog({
        title: 'Undo this import?',
        message: `Questions and papers created by this import are removed. Questions it updated are left as they are, and your recorded attempts stay in history. The import record itself is kept, marked as undone.`,
        confirmLabel: 'Undo import',
        danger: true,
      });
      if (!ok) return;
      const result = await importer.undoImport(importId, { removeAttempts: false });
      toast(`Undone: ${result.removedQuestions} question(s) and ${result.removedPapers} paper(s) removed.`, 'info');
      await ctx.refresh();
    });


    /* --------------------------------------------------------- questions -- */
    const rerenderWithFilters = async () => {
      const f = viewState.filters;
      f.search = document.getElementById('qSearch')?.value ?? f.search;
      f.subject = document.getElementById('qSubject')?.value ?? f.subject;
      f.topic = document.getElementById('qTopic')?.value ?? f.topic;
      f.year = document.getElementById('qYear')?.value ?? f.year;
      f.paperId = document.getElementById('qPaper')?.value ?? f.paperId;
      f.answerStatus = document.getElementById('qAnswer')?.value ?? f.answerStatus;
      f.explanationStatus = document.getElementById('qExplanation')?.value ?? f.explanationStatus;
      f.demonstration = document.getElementById('qDemo')?.value ?? f.demonstration;
      f.attention = Boolean(document.getElementById('qAttention')?.checked);
      viewState.page = 0;
      await ctx.refresh();
    };
    ['qSubject', 'qTopic', 'qYear', 'qPaper', 'qAnswer', 'qExplanation', 'qDemo', 'qAttention'].forEach((id) => document.getElementById(id)?.addEventListener('change', rerenderWithFilters));
    let searchTimer = null;
    document.getElementById('qSearch')?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(rerenderWithFilters, 350);
    });
    document.getElementById('qPrev')?.addEventListener('click', async () => {
      viewState.page = Math.max(0, viewState.page - 1);
      await ctx.refresh();
    });
    document.getElementById('qNext')?.addEventListener('click', async () => {
      viewState.page += 1;
      await ctx.refresh();
    });

    /* ------------------------------------------------------------- misc -- */
    root.addEventListener('click', async (ev) => {
      const exportBtn = ev.target.closest('#exportBank');
      if (exportBtn) {
        const payload = await data.exportBankJson({ includeProgressNotes: true });
        downloadJson(payload, `mymppsc-bank-${todayKey()}.json`);
        toast('Bank exported in the standard import format.', 'ok');
        return;
      }
      const openBtn = ev.target.closest('[data-open-question]');
      if (openBtn) {
        await openQuestionEditor(openBtn.dataset.openQuestion, ctx);
        return;
      }
      const paperBtn = ev.target.closest('[data-edit-paper]');
      if (paperBtn) {
        const papers = await db.getAll(STORES.PAPERS);
        const paper = papers.find((p) => p.paper_id === paperBtn.dataset.editPaper);
        if (!paper) return;
        const value = await openModal({
          title: `Scoring rules — ${paper.paper_name || paper.paper_id}`,
          body: `
            <p class="small">The imported metadata said: ${paper.scoring?.rules_known ? 'rules known' : '<strong>rules unknown</strong>'}. Setting them here records your own override; the imported values stay in the record.</p>
            <div class="field-row">
              <label class="field"><span class="label-text">Marks per correct</span><input type="number" step="0.25" id="paperMarks" value="${esc(String(paper.scoring?.marks_per_correct ?? 2))}" /></label>
              <label class="field"><span class="label-text">Negative marks per wrong</span><input type="number" step="0.01" id="paperNegative" value="${esc(String(paper.scoring?.negative_marks_per_incorrect ?? 0))}" /></label>
              <label class="field"><span class="label-text">Marks for unanswered</span><input type="number" step="0.25" id="paperUnanswered" value="${esc(String(paper.scoring?.marks_for_unanswered ?? 0))}" /></label>
            </div>
            <label class="check"><input type="checkbox" id="paperNegativeOn" ${paper.scoring?.negative_marking_enabled ? 'checked' : ''} /><span>Negative marking applies</span></label>
            <label class="field"><span class="label-text">Source of this information (stored with the override)</span><input type="text" id="paperSource" placeholder="e.g. official notification, page 2" /></label>`,
          actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Save rules', tone: 'btn-primary', value: 'ok' }],
        });
        if (value !== 'ok') return;
        const rules = {
          marks_per_correct: Number(document.getElementById('paperMarks')?.value) || 0,
          negative_marks_per_incorrect: Number(document.getElementById('paperNegative')?.value) || 0,
          marks_for_unanswered: Number(document.getElementById('paperUnanswered')?.value) || 0,
          negative_marking_enabled: Boolean(document.getElementById('paperNegativeOn')?.checked),
          rules_known: true,
          source: document.getElementById('paperSource')?.value.trim() || 'configured by you',
        };
        await db.put(STORES.PAPERS, {
          ...paper,
          scoring: rules,
          user_scoring_override: true,
          scoring_overridden_at: new Date().toISOString(),
          original_scoring: paper.original_scoring || paper.scoring,
        });
        await refreshQuestionIndex({ silent: true });
        toast('Scoring rules saved for this paper.', 'ok');
        await ctx.refresh();
        return;
      }

      const issuesBtn = ev.target.closest('[data-import-issues]');
      if (issuesBtn) {
        const rows = await db.getAll(STORES.IMPORTS);
        const record = rows.find((r) => r.id === issuesBtn.dataset.importIssues);
        if (!record) return;
        await openModal({
          title: `Import issues — ${record.bank_name || record.bank_id}`,
          wide: true,
          body: `
            ${dataTable({
              columns: [{ label: 'Severity' }, { label: 'Record' }, { label: 'Message' }],
              rows: (record.issues || []).map((i) => [badge(i.severity || 'warning', i.severity === 'fatal' || i.severity === 'error' ? 'bad' : 'warn'), esc(i.questionId || i.paperId || '—'), esc(i.message)]),
              empty: 'No issues were recorded for this import.',
              className: 'compact',
            })}
            <h3 class="mt-3">Skipped records</h3>
            ${dataTable({ columns: [{ label: 'Record' }, { label: 'Reason' }], rows: (record.skipped || []).map((s) => [`<span class="mono tiny">${esc(s.id)}</span>`, esc(s.reason)]), empty: 'None skipped.', className: 'compact' })}
            <h3>Info</h3>
            <ul class="small">${(record.info || []).map((i) => `<li>${esc(i.message || JSON.stringify(i))}</li>`).join('') || '<li class="muted">No extra information.</li>'}</ul>`,
          actions: [{ label: 'Close', tone: 'btn-primary', value: 'close' }],
        });
        return;
      }

      const undoBtn = ev.target.closest('[data-import-undo]');
      if (undoBtn) {
        const ok = await confirmDialog({
          title: 'Undo this import?',
          message: 'Questions and papers created by this import are removed. Attempts stay in your history. The import record is kept, marked as undone.',
          confirmLabel: 'Undo import',
          danger: true,
        });
        if (!ok) return;
        const result = await importer.undoImport(undoBtn.dataset.importUndo, { removeAttempts: false });
        toast(`Undone: ${result.removedQuestions} question(s) removed.`, 'info');
        await ctx.refresh();
        return;
      }

      const mergeBtn = ev.target.closest('[data-merge-review]');
      if (mergeBtn) {
        const ids = mergeBtn.dataset.mergeReview.split(',');
        await openModal({
          title: 'Identical questions',
          wide: true,
          body: `
            <p class="small">These records have identical text and options but different ids. Keeping both is safe: analytics count a question once per id, so duplicates inflate the “available” count. Deleting one keeps its attempts in history but those attempts no longer resolve to a question.</p>
            <div class="row">${ids.map((id) => `<button class="btn btn-sm" type="button" data-open-question="${esc(id)}">Open ${esc(id)}</button>`).join('')}</div>
            <div class="row mt-3">${ids.map((id) => `<button class="btn btn-sm btn-danger" type="button" data-delete-duplicate="${esc(id)}">Delete ${esc(id)}</button>`).join('')}</div>`,
          actions: [{ label: 'Close', tone: 'btn-primary', value: 'close' }],
        });
        return;
      }

      const delBtn = ev.target.closest('[data-delete-duplicate]');
      if (delBtn) {
        const id = delBtn.dataset.deleteDuplicate;
        const ok = await confirmDialog({ title: `Delete ${id}?`, message: 'The question record is removed from the bank. Attempts recorded against it stay in your history. This cannot be undone — export a backup first if you are unsure.', confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        await db.remove(STORES.QUESTIONS, id);
        await refreshQuestionIndex({ silent: true });
        toast(`${id} removed.`, 'info');
        await ctx.refresh();
      }
    });
  },
};

/** Used by the dashboard's first-run prompt and the Import tab. */
export async function loadDemoBank() {
  const res = await fetch('data/demo/demo-bank.json');
  if (!res.ok) throw new Error(`Could not read the demonstration bank (HTTP ${res.status}).`);
  const text = await res.text();
  const analysis = await importer.analyseBankFile(text, { filename: 'demo-bank.json' });
  if (analysis.stage !== 'ready') throw new Error(analysis.fatalMessage || 'The demonstration bank failed validation.');
  const result = await importer.executeImport(analysis, { mode: 'merge', conflictPolicy: 'skip', userConfirmed: true });
  return result;
}
