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
  ['C', 'Cycle confidence marking (always available, always optional)'],
  ['← / → / Home / End', 'Move across tabs in tabbed views'],
  ['Esc', 'Close a dialog or mobile navigation drawer'],
];

export default {
  title: 'Help & How it works',

  async render() {
    const journeys = [
      ['1. Get a bank in', 'The bundled MPPSC 2013–2024 bank loads itself when the app starts, so there is nothing to import. Other banks: Question Bank & Imports → choose a JSON file, validated and summarised <em>before</em> anything is written, with invalid records rejected with reasons and never dropped silently. The demonstration bank is synthetic and labelled everywhere.'],
      ['2. Take a paper simulation', 'PYQ Test Centre → pick a paper → start. Questions run in the original order with the paper’s duration. The palette, timer, mark-for-review, autosave and resume all work while the tab is open or after a refresh.'],
      ['3. Practise a topic, or build your own set', 'Topic &amp; Custom Practice is one screen for both: tick any subjects and topics and the pool is everything you tick — tick nothing and it is the whole bank. Every count belongs to its own subject and the line under it says how many questions match. Attempt history, years, papers, question types, subtopic and search sit behind <em>Narrow further</em>. One subject with at most one topic is recorded as a topic session; anything wider is recorded as a custom set, never as an authentic paper. A strategy decides which questions are picked, and <em>shuffle question order</em> decides how they are arranged — off means paper order: year, then paper, then question number.'],
      ['4. Read the report', 'Every submitted test produces a report: score from the stored rules, outcome counts, per-question review with filters, weak areas, time per question, confidence cross-check and the exact key used for each answer.'],
      ['5. Work the mistakes', 'The Mistake Book collects wrong answers, skips, flagged questions, repeated mistakes and correct-but-guessed answers. Each entry shows the attempt history; resolving keeps the history.'],
      ['6. Let revision schedule itself', 'Each attempt schedules the question from its own outcome, your confidence and how long you took. The Revision Centre shows due/overdue/upcoming questions together with the numeric basis for every date.'],
      ['7. Track the syllabus', 'Syllabus holds the commission\u2019s revised 2026 syllabus as the spine, in its own wording and hierarchy. Mark any topic with one click — not started, in progress, completed, revised — or a whole section at once, and the headings, papers and overview add up what you marked. The app ships no plan of its own, marks nothing for you, and shows no figure that is not your own marking. Where the commission published a line in Hindi only, the English interface shows a rendering written for this app and says that it is not official text; the <em>Official wording</em> block is always the commission\u2019s own.'],
      ['8. Back it up', 'Settings &amp; Backup exports a single JSON file with everything and validates any file before restoring it.'],
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
      'No AI or model runs inside the app. Explanations, answers and classifications are imported data that the app displays and lets you correct — it never generates them and never rates them.',
      'A small number of model practice questions, written for this app with their own keys and explanations, round out papers whose extraction came up short of the printed count; they are flagged as model questions in the bank data itself.',
      'No exam-prediction claims, no “expected score” projections, and no guarantee that revision makes anything stick.',
      'No bundled MPPSC syllabus, and no claim to official content: the bundled 2013–2024 bank is transcribed previous-year material. Its stored answers are source-printed keys except for eight 2019–2024 omissions resolved by a documented human review; none is verified against a commission key. The latest reported marking pattern is applied to every bundled year for practice, not claimed as the historical rule for each paper. The demonstration bank is synthetic and badged as such.',
      'No silent data changes: imports, answer-key edits, classification corrections and queue changes are all recorded and inspectable.',
    ];

    const checklist = [
      'Import a bank and confirm the pre-import summary lists the same number of questions you expected, plus any rejected records with reasons.',
      'Open Insights \u2192 The question bank and check that the per-subject counts add up to the number of questions the Question Bank screen reports for the same bank. The other tab, My performance, is about your attempts \u2014 the two never borrow each other\u2019s numbers.',
      'Start a paper simulation, answer a few questions, refresh the page mid-test, and confirm the session resumes with answers and time intact.',
      'Open a question with a missing or disputed key and confirm it is labelled, and that the report shows which key was used.',
      'Answer a question incorrectly, submit, and check that the Mistake Book and the Revision Centre both picked it up.',
      'Attempt a question twice with different results and confirm the report distinguishes first-attempt accuracy from overall accuracy.',
      'Mark a correct answer as “guessed” — confidence marking is always available and always optional — and confirm revision brings it back sooner than a confident correct answer.',
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
                <li><strong>Three fixed rules</strong> — confidence marking is always optional per question; a verified answer is preferred over a supplied key; and a missing or disputed key is judged with the supplied answer and flagged in the report. They are the same in every test, so results stay comparable, and they are stated on the session form rather than offered as settings. Tests taken before they were fixed keep the rules they were taken with.</li>
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
                <li>Insights is only as good as the attempt history: small samples are labelled, not hidden, and the question bank tab counts what is stored rather than what you have done with it.</li>
                <li>Near-duplicate detection works on wording similarity — rephrased questions about the same fact may be reported as similar. Nothing is deleted automatically.</li>
                <li>Explanations appear exactly as imported: the app says so when a question has none, and attaches no review status to prose it cannot verify.</li>
                <li>Full-paper simulation runs the questions stored for that paper, in the paper’s stored order.</li>
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
