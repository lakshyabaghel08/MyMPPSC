/**
 * analytics.js (view) — Analytics.
 *
 * Everything on this screen is computed from stored attempts for this device.
 * The three numbers that are often conflated are shown separately and named
 * clearly: questions available, unique questions attempted, and total attempts.
 */

import { state } from '../../core/state.js';
import {
  esc,
  badge,
  card,
  tile,
  notice,
  dataTable,
  emptyState,
  lineChart,
  progressBar,
  toast,
  sourceChip,
  evidenceMeter,
} from '../components.js';
import { fmtPct, fmtDate, fmtDuration, downloadJson, todayKey } from '../../core/util.js';
import { loadAnalytics, studyPriorities, MIN_SAMPLE_HINT, MIN_SAMPLE_STRONG } from '../../services/analytics.js';

const viewState = { subject: 'all', priorityLimit: 12 };

function verdictBadge(row) {
  const tone = row.verdict === 'strong' ? 'ok' : row.verdict === 'weak' ? 'bad' : row.verdict === 'developing' ? 'warn' : 'info';
  return badge(row.verdict, tone);
}

function accuracyText(value, sample) {
  if (!Number.isFinite(value)) return '<span class="soft">—</span>';
  const text = fmtPct(value);
  if (sample < MIN_SAMPLE_HINT) return `${text} <span class="tiny soft">(sample ${sample})</span> ${evidenceMeter(sample, MIN_SAMPLE_STRONG, { showLabel: false })}`;
  return `${text} <span class="tiny soft">(n=${sample})</span> ${evidenceMeter(sample, MIN_SAMPLE_STRONG, { showLabel: false })}`;
}

export default {
  title: 'Analytics',

  async render() {
    const { metas, analytics } = await loadAnalytics();

    if (!metas.length) {
      return `
        <h1>Analytics</h1>
        ${card({
          title: 'Analytics needs data',
          body: emptyState({
            title: 'No questions stored yet',
            message: 'Import a question bank and record some attempts; this screen reports only measured data.',
            action: '<a class="btn btn-primary" href="#/bank">Question Bank &amp; Imports</a>',
          }),
        })}`;
    }

    const priorities = studyPriorities({ analytics, limit: viewState.priorityLimit });
    const counts = analytics.counts;
    const daily = analytics.daily.slice(-21);
    const accuracyPoints = analytics.daily.filter((d) => d.accuracy !== null).slice(-21).map((d) => ({ label: d.date.slice(5), value: d.accuracy }));

    const subjectRows = analytics.bySubject.map((row) => [
      `<strong>${esc(row.subject)}</strong>`,
      String(row.available),
      String(row.attemptedUnique),
      fmtPct(row.coverage),
      accuracyText(row.accuracy, row.scored),
      accuracyText(row.firstAttemptAccuracy, row.firstAttemptScored),
      verdictBadge(row),
    ]);

    const subjectFilter = viewState.subject;
    const topicRows = analytics.byTopic
      .filter((row) => subjectFilter === 'all' || row.subject === subjectFilter)
      .sort((a, b) => (b.available - a.available) || (a.topic < b.topic ? -1 : 1))
      .map((row) => [
        `<strong>${esc(row.topic)}</strong><div class="tiny muted">${esc(row.subject)}</div>`,
        String(row.available),
        `${String(row.attemptedUnique)} <div class="tiny muted">${fmtPct(row.coverage)} covered</div>`,
        accuracyText(row.accuracy, row.scored),
        accuracyText(row.firstAttemptAccuracy, row.firstAttemptScored),
        row.avgTimeSec === null ? '<span class="soft">—</span>' : `${esc(String(row.avgTimeSec))}s`,
        verdictBadge(row),
      ]);

    const subjects = analytics.bySubject.map((r) => r.subject).sort();

    const confidenceRows = Object.entries(analytics.confidence.matrix)
      .filter(([, m]) => m.total > 0)
      .map(([key, m]) => [
        esc({ confident: 'Confident', unsure: 'Unsure', guessed: 'Guessed', none: 'Not marked' }[key] || key),
        String(m.correct),
        String(m.incorrect),
        String(m.unanswered),
        `${String(m.total)}`,
        m.correct + m.incorrect ? fmtPct(m.correct / (m.correct + m.incorrect)) : '<span class="soft">—</span>',
      ]);

    const slowestRows = analytics.time.slowest.map((row) => [
      `<span class="mono tiny">${esc(row.question_id)}</span>`,
      esc(row.subject || '—'),
      esc(row.topic || '—'),
      `${esc(String(row.seconds))}s`,
      esc(row.outcome),
    ]);

    const freqTopicRows = analytics.frequency.byTopic.slice(0, 20).map((row) => [
      `<strong>${esc(row.topic)}</strong><div class="tiny muted">${esc(row.subject)}</div>`,
      String(row.count),
      fmtPct(row.share),
      Object.entries(row.byYear).filter(([y]) => y !== 'unknown').map(([y, c]) => `${y}:${c}`).join(', ') || '<span class="soft">year unknown</span>',
    ]);

    const testRows = analytics.tests
      .slice()
      .reverse()
      .slice(0, 25)
      .map((t) => [
        `<a href="#/report/${esc(t.test_id)}">${esc(t.kind || 'test')}</a><div class="tiny muted">${esc(fmtDate(t.at))}</div>`,
        String(t.attempts),
        `${t.correct}/${t.correct + t.incorrect + t.unanswered}`,
        t.accuracy === null ? '<span class="soft">—</span>' : fmtPct(t.accuracy),
        `${esc(String(Math.round(t.marks * 100) / 100))}`,
        fmtDuration(Math.round(t.timeMs / 1000)),
      ]);

    const neverAttempted = analytics.neverAttemptedTopics.slice(0, 12);
    const insufficient = analytics.insufficient.slice(0, 12);
    const underPractised = analytics.underPractised.slice(0, 12);

    return `
      <h1>Analytics</h1>
      <p class="muted">All figures come from attempts stored on this device. Nothing is estimated, extrapolated or projected.</p>

      <div class="grid tiles mb-3">
        ${tile({ label: 'Questions available', value: String(counts.availableQuestions), sub: 'unique questions stored in the bank', source: 'supplied', where: 'Stored in local IndexedDB bank' })}
        ${tile({ label: 'Unique questions attempted', value: String(counts.attemptedUnique), sub: `${fmtPct(counts.coverage)} of the bank — repeats do not increase this`, source: 'measured', where: 'Unique question IDs with ≥1 attempt' })}
        ${tile({ label: 'Total attempts', value: String(counts.totalAttempts), sub: `${counts.repeatAttempts} attempt(s) beyond the first on a question`, source: 'measured', where: 'Every recorded attempt in local store' })}
        ${tile({ label: 'First-attempt accuracy', value: analytics.accuracy.firstAttemptSample ? fmtPct(analytics.accuracy.firstAttempt) : '—', sub: analytics.accuracy.firstAttemptSample ? `on ${analytics.accuracy.firstAttemptSample} first attempts` : 'no first attempts yet', source: analytics.accuracy.firstAttemptSample ? 'measured' : 'unavailable', where: 'First scored attempt per unique question' })}
        ${tile({ label: 'Accuracy (all attempts)', value: counts.correct + counts.incorrect ? fmtPct(analytics.accuracy.all) : '—', sub: `${counts.correct} correct · ${counts.incorrect} incorrect`, source: counts.correct + counts.incorrect ? 'measured' : 'unavailable', where: 'All judged attempts including repeats' })}
        ${tile({ label: 'Answer rate', value: counts.totalAttempts ? fmtPct(analytics.accuracy.answerRate) : '—', sub: `${counts.unanswered} left unanswered · ${counts.unscored} unscored`, source: counts.totalAttempts ? 'measured' : 'unavailable', where: 'Answered share of total attempts' })}
      </div>

      ${notice(
        'Question counts here describe your own imported bank, not the examination. A topic with 3 stored questions cannot support a strong conclusion, so figures below show their sample size, and rows with fewer than ' +
          `${MIN_SAMPLE_HINT} scored answers are labelled “insufficient evidence”. A “weak topic” verdict needs at least ${MIN_SAMPLE_STRONG}.`,
        'info',
      )}

      <div class="split-2">
        <div>
          ${card({
            title: 'Activity per day',
            subtitle: 'Last 21 days with recorded attempts',
            right: sourceChip('measured'),
            body: daily.length ? lineChart({ points: daily.map((d) => ({ label: d.date.slice(5), value: d.attempts })), height: 150, yFormat: (v) => String(Math.round(v)), yMax: Math.max(1, ...daily.map((d) => d.attempts)) }) : '<p class="muted small">No attempts recorded yet.</p>',
          })}
        </div>
        <div>
          ${card({
            title: 'Accuracy trend',
            subtitle: 'All scored attempts per day',
            right: sourceChip('measured'),
            body: accuracyPoints.length >= 2 ? lineChart({ points: accuracyPoints, height: 150 }) : '<p class="muted small">At least two days with scored attempts are needed to draw a trend.</p>',
            footer: 'This line includes repeat attempts. Repeating questions you already know lifts it without improving first-time recall — check first-attempt accuracy above.',
          })}
        </div>
      </div>

      ${card({
        title: 'Subjects',
        right: sourceChip('measured', 'bank + attempts'),
        body: dataTable({
          columns: [{ label: 'Subject' }, { label: 'Available', num: true }, { label: 'Attempted', num: true }, { label: 'Coverage', num: true }, { label: 'Accuracy (all)', num: true }, { label: 'First-attempt accuracy', num: true }, { label: 'Verdict' }],
          rows: subjectRows,
          empty: 'No subjects yet.',
          className: 'compact',
        }),
      })}

      ${card({
        title: 'Topics',
        subtitle: `${topicRows.length} topic(s)`,
        actions: `<label class="field field-inline m-0"><span class="label-text">Subject</span>
          <select id="anaSubject"><option value="all">All subjects</option>${subjects.map((s) => `<option value="${esc(s)}" ${viewState.subject === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>`,
        body: dataTable({
          columns: [{ label: 'Topic' }, { label: 'Available', num: true }, { label: 'Attempted', num: true }, { label: 'Accuracy (all)', num: true }, { label: 'First-attempt', num: true }, { label: 'Avg time', num: true }, { label: 'Verdict' }],
          rows: topicRows,
          empty: 'No topics match this filter.',
          className: 'compact',
        }),
      })}

      <div class="split-2">
        <div>
          ${card({
            title: 'Weak topics',
            subtitle: `At least ${MIN_SAMPLE_STRONG} scored answers`,
            right: sourceChip('derived', `min ${MIN_SAMPLE_STRONG}`),
            body: analytics.weakTopics.length
              ? dataTable({
                  columns: [{ label: 'Topic' }, { label: 'Accuracy', num: true }, { label: 'n', num: true }, { label: 'Coverage', num: true }],
                  rows: analytics.weakTopics.map((r) => [esc(`${r.topic} · ${r.subject}`), fmtPct(r.accuracy), `${String(r.scored)} ${evidenceMeter(r.scored, MIN_SAMPLE_STRONG, { showLabel: false })}`, fmtPct(r.coverage)]),
                  className: 'compact',
                })
              : '<p class="muted small">No topic currently meets the evidence threshold for a weak verdict.</p>',
          })}

          ${card({
            title: 'Strong topics',
            subtitle: 'Your best-performing topics with enough evidence',
            right: sourceChip('derived', `min ${MIN_SAMPLE_STRONG}`),
            body: analytics.strongTopics.length
              ? dataTable({
                  columns: [{ label: 'Topic' }, { label: 'Accuracy', num: true }, { label: 'n', num: true }],
                  rows: analytics.strongTopics.slice(0, 10).map((r) => [esc(`${r.topic} · ${r.subject}`), fmtPct(r.accuracy), `${String(r.scored)} ${evidenceMeter(r.scored, MIN_SAMPLE_STRONG, { showLabel: false })}`]),
                  className: 'compact',
                })
              : '<p class="muted small">No topic yet meets the evidence threshold for a strong verdict.</p>',
          })}

          ${card({
            title: 'Too thin to judge',
            right: sourceChip('unavailable', 'small sample'),
            body: insufficient.length
              ? `<ul class="small">${insufficient.map((r) => `<li><strong>${esc(r.topic)}</strong> — ${esc(r.reason)} ${evidenceMeter(r.scored || 1, MIN_SAMPLE_STRONG)}</li>`).join('')}</ul>`
              : '<p class="muted small">Every attempted topic has enough scored answers to say something useful.</p>',
          })}
        </div>

        <div>
          ${card({
            title: 'Never attempted',
            right: sourceChip('measured', '0 attempts'),
            body: neverAttempted.length
              ? dataTable({
                  columns: [{ label: 'Topic' }, { label: 'Available', num: true }],
                  rows: neverAttempted.map((r) => [esc(`${r.topic} · ${r.subject}`), String(r.available)]),
                  className: 'compact',
                })
              : '<p class="muted small">Every topic with stored questions has been attempted at least once.</p>',
          })}

          ${card({
            title: 'Under-practised (coverage below 30%)',
            right: sourceChip('derived', '<30% covered'),
            body: underPractised.length
              ? dataTable({
                  columns: [{ label: 'Topic' }, { label: 'Covered', num: true }, { label: 'Available', num: true }],
                  rows: underPractised.map((r) => [esc(`${r.topic} · ${r.subject}`), fmtPct(r.coverage), String(r.available)]),
                  className: 'compact',
                })
              : '<p class="muted small">No topic in the bank is currently under-practised.</p>',
          })}

          ${card({
            title: 'Confidence analysis',
            subtitle: analytics.confidence.enabled ? 'Confidence you marked, shown separately from correctness' : 'Confidence marking is currently off',
            right: sourceChip('measured'),
            body: analytics.confidence.enabled
              ? `${dataTable({
                  columns: [{ label: 'Marked as' }, { label: 'Correct', num: true }, { label: 'Incorrect', num: true }, { label: 'Unanswered', num: true }, { label: 'Total', num: true }, { label: 'Accuracy', num: true }],
                  rows: confidenceRows,
                  empty: 'No confidence data yet.',
                  className: 'compact',
                })}
                 <div class="row mt-2">
                   ${badge(`${analytics.confidence.overconfidence} confident but wrong`, analytics.confidence.overconfidence ? 'bad' : '')}
                   ${badge(`${analytics.confidence.underconfidence} correct but unsure/guessed`, 'warn')}
                 </div>
                 <p class="tiny muted">${esc(analytics.confidence.note)}</p>`
              : `<p class="small muted">Turn confidence marking on in <a href="#/settings">Settings</a> to see whether your confident answers are actually right. Correct-but-guessed answers are scheduled for earlier revision.</p>`,
          })}

          ${card({
            title: 'Time per question',
            right: sourceChip('measured'),
            body: `
              ${dataTable({
                columns: [{ label: 'Measure' }, { label: 'Value' }],
                rows: [
                  ['Average per question', analytics.time.avgSecPerQuestion === null ? '—' : `${analytics.time.avgSecPerQuestion}s`],
                  ['Median per question', analytics.time.medianSecPerQuestion === null ? '—' : `${analytics.time.medianSecPerQuestion}s`],
                  ['Average per correct answer', analytics.time.avgSecPerCorrect === null ? '—' : `${analytics.time.avgSecPerCorrect}s`],
                ],
                className: 'compact',
              })}
              <h3 class="mt-3">Slowest answers</h3>
              ${dataTable({ columns: [{ label: 'Question' }, { label: 'Subject' }, { label: 'Topic' }, { label: 'Time', num: true }, { label: 'Outcome' }], rows: slowestRows, empty: 'No timings recorded.', className: 'compact' })}`,
          })}
        </div>
      </div>

      ${card({
        title: 'Mistakes',
        subtitle: 'Open entries in the mistake book',
        right: sourceChip('measured', 'mistake book'),
        body: `
          <div class="grid tiles">
            ${tile({ label: 'Open entries', value: String(analytics.mistakes.open), sub: `${analytics.mistakes.repeated} repeated`, source: 'measured' })}
            ${tile({ label: 'Incorrect', value: String(counts.incorrect), sub: 'wrong answers recorded', source: 'measured' })}
            ${tile({ label: 'Skipped', value: String(counts.unanswered), sub: 'left unanswered', source: 'measured' })}
            ${tile({ label: 'Flagged for review', value: String(counts.flagged), sub: 'marked during tests', source: 'measured' })}
          </div>
          ${analytics.mistakes.top.length
            ? `<h3 class="mt-3">Most repeated</h3>
               ${dataTable({
                 columns: [{ label: 'Question' }, { label: 'Type' }, { label: 'Times', num: true }, { label: 'Last seen' }],
                 rows: analytics.mistakes.top.slice(0, 10).map((m) => [
                   `<span class="mono tiny">${esc(m.question_id)}</span><div class="tiny muted">${esc(m.subject || '—')} · ${esc(m.topic || '—')}</div>`,
                   esc(m.type),
                   String(m.occurrences),
                   esc(fmtDate(m.last_seen_at)),
                 ]),
                 className: 'compact',
               })}`
            : '<p class="muted small">No open mistake entries.</p>'}
          <div class="row mt-2"><a class="btn btn-sm" href="#/mistakes">Open the Mistake Book</a></div>`,
      })}

      ${card({
        title: 'Revision',
        right: sourceChip('derived', 'spaced repetition'),
        body: `
          <div class="grid tiles">
            ${tile({ label: 'Tracked', value: String(analytics.revision.tracked), sub: 'questions with a schedule', source: 'measured' })}
            ${tile({ label: 'Due today', value: String(analytics.revision.dueToday), tone: analytics.revision.dueToday ? 'warn' : '', source: 'derived' })}
            ${tile({ label: 'Overdue', value: String(analytics.revision.overdue), tone: analytics.revision.overdue ? 'bad' : 'ok', source: 'derived' })}
            ${tile({ label: 'Upcoming', value: String(analytics.revision.upcoming), source: 'derived' })}
          </div>
          ${
            analytics.revision.effectiveness.withHistory
              ? `<h3 class="mt-3">Change between first and latest scored attempt</h3>
                 ${progressBar(analytics.revision.effectiveness.improved / analytics.revision.effectiveness.withHistory, 'ok')}
                 <p class="small mt-2">${analytics.revision.effectiveness.improved} improved · ${analytics.revision.effectiveness.worsened} declined · ${analytics.revision.effectiveness.unchanged} unchanged, across ${analytics.revision.effectiveness.withHistory} question(s).</p>`
              : '<p class="muted small">Not enough repeated attempts yet to compare first and latest answers.</p>'
          }
          <div class="row mt-2"><a class="btn btn-sm" href="#/revision">Revision Centre</a></div>`,
      })}

      ${card({
        title: 'Topic frequency in your bank',
        subtitle: `${analytics.frequency.total} stored question(s)`,
        right: sourceChip('supplied', 'imported bank'),
        body: `
          ${dataTable({ columns: [{ label: 'Topic' }, { label: 'Questions', num: true }, { label: 'Share of bank', num: true }, { label: 'By year' }], rows: freqTopicRows, empty: 'No classified topics yet.', className: 'compact' })}
          <p class="tiny muted">${esc(analytics.frequency.disclaimer)}</p>`,
        footer: `Topics tagged “unclassified” are excluded from this table. ${analytics.frequency.byTopic.filter((r) => r.unclassified).length} topic group(s) are currently unclassified.`,
      })}

      ${card({
        title: 'Study priorities',
        subtitle: 'Derived ranking with its reasons and caveats',
        right: sourceChip('derived'),
        body: dataTable({
          columns: [{ label: 'Topic' }, { label: 'Score', num: true }, { label: 'Available', num: true }, { label: 'Accuracy', num: true }, { label: 'Why' }],
          rows: priorities.map((p) => [
            `<strong>${esc(p.topic)}</strong><div class="tiny muted">${esc(p.subject)}</div>`,
            String(p.priorityScore),
            String(p.available),
            p.scored ? `${fmtPct(p.accuracy)} ${evidenceMeter(p.scored, MIN_SAMPLE_STRONG, { showLabel: false })}` : '<span class="soft">no data</span>',
            `<span class="tiny">${p.reasons.slice(0, 3).map((r) => esc(r)).join('<br />')}</span>`,
          ]),
          empty: 'No priorities yet.',
          className: 'compact',
        }),
        footer: 'This ranking is a study aid based on your own recorded evidence and the questions you happen to have imported. It is not a prediction of examination content or your result.',
      })}

      ${card({
        title: 'Test history',
        right: sourceChip('measured'),
        body: dataTable({
          columns: [{ label: 'Test' }, { label: 'Questions', num: true }, { label: 'Correct / total', num: true }, { label: 'Accuracy', num: true }, { label: 'Marks', num: true }, { label: 'Time' }],
          rows: testRows,
          empty: 'No submitted tests yet.',
          className: 'compact',
        }),
        footer: '<button class="btn btn-sm" type="button" id="anaExport">Download this report as JSON</button>',
      })}`;
  },

  async mount(ctx) {
    document.getElementById('anaSubject')?.addEventListener('change', async (ev) => {
      viewState.subject = ev.target.value;
      await ctx.refresh();
    });

    document.getElementById('anaExport')?.addEventListener('click', async () => {
      const { analytics, metas, attempts } = await loadAnalytics();
      downloadJson(
        {
          format: 'mymppsc-analytics',
          format_version: '1.0.0',
          generated_at: new Date().toISOString(),
          note: 'Computed on this device from stored attempts. Question frequency describes the imported bank only and is not a prediction of any examination.',
          definitions: {
            availableQuestions: 'Unique questions stored locally.',
            attemptedUnique: 'Unique questions with at least one recorded attempt.',
            totalAttempts: 'Every recorded attempt, repeats included.',
            firstAttemptAccuracy: 'Correct share of scored first attempts only.',
          },
          analytics,
          bank_snapshot: { questions: metas.length, attempts: attempts.length },
        },
        `mymppsc-analytics-${todayKey()}.json`,
      );
      toast('Analytics report downloaded.', 'ok');
    });
  },
};
