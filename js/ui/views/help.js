/**
 * help.js — In-app guide.
 *
 * Written for someone using the app for the first time: what it does, what it
 * deliberately does not do, how the numbers are defined, and what to check
 * yourself before trusting a screen.
 */

import { APP_VERSION } from '../../core/constants.js';
import { esc, card, notice, dataTable, badge, sourceChip, evidenceMeter } from '../components.js';

const KEYBOARD = [
  ['1 … 9', 'Select option A … I on the current question'],
  ['N / →', 'Next question'],
  ['P / ←', 'Previous question'],
  ['F', 'Toggle “mark for review” on the current question'],
  ['U', 'Clear the selected response'],
  ['C', 'Cycle confidence marking (when enabled)'],
  ['← / → / Home / End', 'Move across tabs in tabbed views'],
  ['Esc', 'Close a dialog or mobile navigation drawer'],
];

export default {
  title: 'Help & How it works',

  async render() {
    const journeys = [
      ['1. Get a bank in', 'The bundled MPPSC 2019–2024 bank loads itself when the app starts, so there is nothing to import. Other banks: Question Bank & Imports → choose a JSON file, validated and summarised <em>before</em> anything is written, with invalid records rejected with reasons and never dropped silently. The demonstration bank is synthetic and labelled everywhere.'],
      ['2. Take a paper simulation', 'PYQ Test Centre → pick a paper → start. Questions run in the original order with the paper’s duration. The palette, timer, mark-for-review, autosave and resume all work while the tab is open or after a refresh.'],
      ['3. Read the report', 'Every submitted test produces a report: score from the stored rules, outcome counts, per-question review with filters, weak areas, time per question, confidence cross-check and the exact key used for each answer.'],
      ['4. Work the mistakes', 'The Mistake Book collects wrong answers, skips, flagged questions, repeated mistakes and correct-but-guessed answers. Each entry shows the attempt history; resolving keeps the history.'],
      ['5. Let revision schedule itself', 'Each attempt schedules the question from its own outcome, your confidence and how long you took. The Revision Centre shows due/overdue/upcoming questions together with the numeric basis for every date.'],
      ['6. Plan and track', 'The Syllabus &amp; Study Planner holds the structure you import or type — the app ships none. Tasks and study sessions are yours; suggestions must be added by you.'],
      ['7. Back it up', 'Settings &amp; Backup exports a single JSON file with everything and validates any file before restoring it.'],
    ];

    const definitions = [
      ['Questions available', 'Unique questions stored in your bank. Duplicate imports do not increase the useful total; exact duplicates are detected and reported.'],
      ['Unique questions attempted', 'Questions with at least one recorded attempt. Answering the same question five times still counts once here.'],
      ['Total attempts', 'Every recorded answer event, including repeats, skips and unscored attempts.'],
      ['First-attempt accuracy', 'Correct share of scored <em>first</em> attempts. Repeats cannot inflate it.'],
      ['Accuracy (all attempts)', 'Correct share of all scored attempts, repeats included. It responds quickly to repetition, so it is shown alongside the first-attempt figure rather than instead of it.'],
      ['Small samples', 'Fewer than 3 scored answers is displayed as “insufficient evidence”; a weak/strong verdict needs at least 5.'],
      ['Unscored', 'A question with no usable answer key is excluded from the score rather than counted wrong, and appears as “unscored”.'],
      ['Question frequency', 'Counts of how often a topic appears <em>in your imported bank</em>. It is a study-prioritisation aid only — never a prediction of a future paper.'],
    ];

    const notDoing = [
      'No account, login, server, cloud sync or API calls. The app runs entirely in your browser and works offline once loaded.',
      'No AI or model runs inside the app. Explanations and classifications are imported data that the app displays, labels and lets you correct — it never generates them.',
      'No invented questions and no invented content to “complete” an incomplete paper. Missing questions stay missing and are labelled as such.',
      'No exam-prediction claims, no “expected score” projections, and no guarantee that revision makes anything stick.',
      'No bundled MPPSC syllabus, and no claim to official content: the bundled 2019–2024 bank is transcribed previous-year material whose stored keys are unverified printed keys, and the demonstration bank is synthetic and badged as such.',
      'No silent data changes: imports, answer-key edits, classification corrections and queue changes are all recorded and inspectable.',
    ];

    const checklist = [
      'Import a bank and confirm the pre-import summary lists the same number of questions you expected, plus any rejected records with reasons.',
      'Start a paper simulation, answer a few questions, refresh the page mid-test, and confirm the session resumes with answers and time intact.',
      'Open a question with a missing or disputed key and confirm it is labelled, and that the report shows which key was used.',
      'Answer a question incorrectly, submit, and check that the Mistake Book and the Revision Centre both picked it up.',
      'Attempt a question twice with different results and confirm the report distinguishes first-attempt accuracy from overall accuracy.',
      'Turn on confidence marking, mark a correct answer as “guessed”, and confirm revision brings it back sooner than a confident correct answer.',
      'Export a backup, then run the round-trip self-test in Settings → Backup & restore.',
      'Turn the network off and confirm the app still opens and works.',
    ];

    return `
      <h1>Help &amp; How it works</h1>
      <p class="muted">MyMPPSC v${esc(APP_VERSION)} — a local-first MPPSC Prelims practice app. Your data stays in this browser.</p>

      ${notice('This app is a study tool, not an official source. Always check answer keys and syllabus details against official documents before relying on them.', 'warn')}

      ${card({ title: 'The journey through the app', body: `<ol class="small">${journeys.map(([t, b]) => `<li><strong>${t}</strong> — ${b}</li>`).join('')}</ol>` })}

      <div class="split-2">
        <div>
          ${card({ title: 'How the numbers are defined', right: sourceChip('measured', 'local evidence'), body: dataTable({ columns: [{ label: 'Figure' }, { label: 'What it means' }], rows: definitions.map(([a, b]) => [`<strong>${a}</strong>`, b]), className: 'compact' }) })}

          ${card({
            title: 'Answer-key integrity & provenance chips',
            body: `
              <p class="small">Every number and question carries explicit provenance chips so you know what is measured, what is derived, and what is supplied by the source:</p>
              <div class="row mb-2">
                ${sourceChip('measured')} ${sourceChip('derived')} ${sourceChip('unavailable')} ${sourceChip('synthetic')} ${sourceChip('supplied')} ${sourceChip('verified')} ${sourceChip('disputed')}
              </div>
              <div class="row mb-2">
                ${evidenceMeter(1)} ${evidenceMeter(3)} ${evidenceMeter(5)}
              </div>
              <p class="small">Every question carries two keys, and they are never mixed up:</p>
              <ul class="small">
                <li><strong>Supplied key</strong> — what the source said. It is never overwritten.</li>
                <li><strong>Verified answer</strong> — an additional record you can add with evidence.</li>
                <li><strong>Dispute flag</strong> — marks a key as contested; the report states which key judged each answer.</li>
                <li><strong>Policy</strong> — you choose in Settings whether scoring prefers the verified answer, uses the stored key, or only judges verified questions.</li>
              </ul>
              <p class="small">If a paper’s scoring rules are unknown, the app refuses to score until you configure them, and it says so on the paper card and again at submission.</p>`,
          })}
        </div>

        <div>
          ${card({ title: 'Keyboard shortcuts', body: dataTable({ columns: [{ label: 'Key' }, { label: 'Action' }], rows: KEYBOARD.map(([k, a]) => [`<span class="kbd">${esc(k)}</span>`, esc(a)]), className: 'compact' }) })}

          ${card({ title: 'What this app deliberately does not do', body: `<ul class="small">${notDoing.map((n) => `<li>${n}</li>`).join('')}</ul>` })}

          ${card({
            title: 'Known limitations',
            body: `
              <ul class="small">
                <li>Learning is per browser profile. Clearing site data deletes everything unless you exported a backup.</li>
                <li>The revision schedule is a spaced-repetition heuristic over your own answers; it cannot guarantee retention.</li>
                <li>Analytics are only as good as the attempt history: small samples are labelled, not hidden.</li>
                <li>Near-duplicate detection works on wording similarity — rephrased questions about the same fact may be reported as similar. Nothing is deleted automatically.</li>
                <li>Explanations appear exactly as imported. Missing or unreviewed explanations are labelled instead of being filled in.</li>
                <li>Full-paper simulation shows only the questions that are actually stored; a paper with missing questions is labelled incomplete.</li>
                <li>Hindi text is preserved verbatim. Interface text is English.</li>
              </ul>`,
          })}
        </div>
      </div>

      ${card({
        title: 'Check it yourself',
        subtitle: 'A short verification pass you can run in a few minutes',
        body: `<ol class="small">${checklist.map((c) => `<li>${c}</li>`).join('')}</ol>
               <p class="tiny muted">These steps mirror the automated test suite that ships with the app (<code>npm test</code>). The suite covers scoring, imports, revision scheduling, analytics, backup/restore and a full end-to-end journey, but it does not test this user interface — the checklist above is how the UI is verified.</p>`,
      })}

      ${card({
        title: 'Data & privacy',
        body: `
          <p class="small">Everything you import and record is stored in this browser’s IndexedDB. Small preferences are mirrored into localStorage so the app can start fast. There is no account, no server and no telemetry.</p>
          <div class="row">${badge('no network calls after load', 'ok')} ${badge('offline capable', 'ok')} ${badge('exportable at any time', 'ok')}</div>`,
      })}`;
  },
};
