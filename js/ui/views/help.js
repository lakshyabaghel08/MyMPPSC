/**
 * help.js — In-app guide.
 *
 * Written for someone using the app for the first time. It used to be 1,542
 * words of continuous prose arranged in eight cards, which nobody reads on a
 * phone. It is now a **task index**: pick the thing you are trying to do, and
 * one short answer opens under it. The manual checklist is still an interactive
 * list (tick items off as you go), the keyboard table is unchanged, and the
 * long limitation text lives in `docs/LIMITATIONS.md` rather than being copied
 * here.
 *
 * The FAQ rows are buttons with panels rather than `<details>` elements on
 * purpose: the density budget allows three disclosures per screen, and a
 * twelve-question FAQ is a list of questions, not hidden methodology. One row
 * is open at a time, so the screen stays short.
 */

import { APP_VERSION } from '../../core/constants.js';
import { esc, card, notice, dataTable, badge, sourceChip, evidenceMeter, screenHead } from '../components.js';

const KEYBOARD = [
  ['1 … 9', 'Select option A … I on the current question'],
  ['N / →', 'Next question'],
  ['P / ←', 'Previous question'],
  ['F', 'Toggle “mark for review” on the current question'],
  ['U', 'Clear the selected response'],
  ['C', 'Cycle confidence marking (always available, always optional)'],
  ['⌘K / Ctrl K', 'Search, start and find — screens, actions, subjects, topics, syllabus lines and questions'],
  ['← / → / Home / End', 'Move across tabs in tabbed views'],
  ['Esc', 'Close a dialog or mobile navigation drawer'],
];

/** The task index: what the reader is trying to do, and the short answer. */
const FAQ = [
  {
    id: 'start',
    task: 'Start practising',
    answer:
      'Press <kbd>Ctrl K</kbd>, use <strong>Quick practice</strong> in the header, or press <strong>Practise now</strong> on the dashboard. The sheet asks what, how many and when to reveal answers.',
  },
  {
    id: 'paper',
    task: 'Take a full paper simulation',
    answer:
      'PYQ Test Centre lists every stored paper in one table: <strong>Start</strong> uses the paper\'s own duration and scoring, and an unfinished attempt can be resumed from any screen.',
  },
  {
    id: 'build',
    task: 'Build my own set of questions',
    answer:
      'Topic &amp; Custom Practice covers both: tick any subjects and topics, or tick nothing for the whole bank. Narrow by year, paper, type or search under <em>Narrow further</em>.',
  },
  {
    id: 'report',
    task: 'Read what a test says',
    answer:
      'Every submitted test produces a report: score from the stored rules, outcome counts, per-question review, weak areas, timing, the confidence cross-check and the key used.',
  },
  {
    id: 'mistakes',
    task: 'Work through my mistakes',
    answer:
      'The Mistake Book collects wrong answers, skips, flags, repeated mistakes and correct-but-guessed answers; <strong>Retry</strong> starts a learning-mode session on one question.',
  },
  {
    id: 'revision',
    task: 'Understand when revision is due',
    answer:
      'Each attempt schedules its question from the outcome, your confidence and the time taken. The Revision Centre shows the numeric basis for every date; it cannot promise retention.',
  },
  {
    id: 'syllabus',
    task: 'Mark the syllabus',
    answer:
      'Mark any topic, or a whole section at once. Where the commission published a line in Hindi only, the English interface shows this app\'s own rendering and says so; <em>Official wording</em> is always the commission\'s text.',
  },
  {
    id: 'bank',
    task: 'Import, correct or export the bank',
    answer:
      'The Question Bank validates every file before writing, lists rejected records with reasons, keeps a correction history, and lets bulk changes be undone.',
  },
  {
    id: 'backup',
    task: 'Back up or restore',
    answer:
      'Settings &amp; Backup writes one JSON file holding every store and validates any file before restoring it. <strong>Export a backup</strong> in that screen\'s header does it in one click.',
  },
  {
    id: 'offline',
    task: 'Use it offline',
    answer:
      'Everything runs in this browser: no account, no server, no network call after load. Install it from the browser menu to keep the shell offline; clearing site data deletes everything.',
  },
];

const CHECKLIST = [
  ['bank-summary', 'Import a bank and confirm the pre-import summary lists the number of questions you expected, plus any rejected records with reasons.'],
  ['tab-counts', 'Open Insights → The question bank and check that the per-subject counts add up to the Question Bank screen’s total for the same bank. The other tabs are about your attempts and never borrow the bank’s numbers.'],
  ['resume', 'Start a paper simulation, answer a few questions, refresh the page mid-test, and confirm the session resumes with answers and time intact.'],
  ['key', 'Open a question with a missing or disputed key and confirm it is labelled, and that the report shows which key was used.'],
  ['mistake', 'Answer a question incorrectly, submit, and check that the Mistake Book and the Revision Centre both picked it up.'],
  ['repeat', 'Attempt a question twice with different results and confirm the report distinguishes first-attempt accuracy from overall accuracy.'],
  ['confidence', 'Mark a correct answer as “guessed” — confidence marking is always optional — and confirm revision brings it back sooner than a confident correct answer.'],
  ['backup', 'Export a backup, then run the round-trip self-test in Settings → Backup &amp; restore.'],
  ['offline', 'Turn the network off and confirm the app still opens and works.'],
];

/** Tick state for the manual checklist, kept for this page only. */
const checklistDone = new Set();

export default {
  title: 'Help & How it works',

  async render() {
    const faqRow = (item) => `<div class="faq-item">
        <h3 class="faq-question"><button class="faq-toggle" type="button" id="faq-${esc(item.id)}-button" aria-expanded="false" aria-controls="faq-${esc(item.id)}-panel">
          <span>${esc(item.task)}</span><span class="faq-caret" aria-hidden="true"></span>
        </button></h3>
        <div class="faq-panel" id="faq-${esc(item.id)}-panel" role="region" aria-labelledby="faq-${esc(item.id)}-button" hidden>
          <p class="small">${item.answer}</p>
        </div>
      </div>`;

    const everyday = FAQ.slice(0, 5).map(faqRow).join('');
    const dataFaq = FAQ.slice(5).map(faqRow).join('');

    const checklist = CHECKLIST.map(
      ([id, text]) => `<li class="check-row">
        <label class="check"><input type="checkbox" data-action="checklist" data-value="${esc(id)}" ${checklistDone.has(id) ? 'checked' : ''} />
        <span>${text}</span></label>
      </li>`,
    ).join('');

    return `
      ${screenHead({
        title: 'Help &amp; How it works',
        purpose: `MyMPPSC v${esc(APP_VERSION)} — a local-first MPPSC Prelims practice app. Your data stays in this browser.`,
        primary: '<a class="btn btn-primary" href="#/dashboard">Go to the dashboard</a>',
        secondary: '<button class="btn btn-sm" type="button" data-action="open-command">Search everything</button>',
      })}

      ${notice('This app is a study tool, not an official source. Always check answer keys and syllabus details against official documents before relying on them.', 'warn')}

      ${card({
        title: 'Start, practise and review',
        count: '5 tasks',
        body: `<div class="faq-list">${everyday}</div>`,
      })}

      ${card({
        title: 'Your data, this device',
        count: '5 tasks',
        body: `<div class="faq-list">${dataFaq}</div>`,
      })}

      <div class="split-2">
        ${card({
          title: 'Keyboard shortcuts',
          body: dataTable({
            columns: [{ label: 'Key' }, { label: 'Action' }],
            rows: KEYBOARD.map(([key, action]) => [`<span class="kbd">${esc(key)}</span>`, esc(action)]),
            className: 'compact cards-mobile',
          }),
        })}

        ${card({
          title: 'Check it yourself',
          count: `${checklistDone.size} of ${CHECKLIST.length}`,
          body: `<p class="small">A short hand-check of the interface, in a few minutes. <a href="docs/TESTING.md">docs/TESTING.md</a> lists the automated half.</p>
            <ul class="checklist">${checklist}</ul>`,
          footer: 'These steps are the manual half of the test plan; docs/TESTING.md lists the automated half.',
        })}
      </div>

      ${card({
        title: 'Where the detail lives',
        body: `
          <ul class="small">
            <li><a href="docs/LIMITATIONS.md">Everything this app does not do</a> — no AI generation, no verified commission key, no prediction, no guarantee that revision makes anything stick.</li>
            <li><a href="docs/MARKING.md">Marking and scoring</a> — the rules, and what “unscored” means.</li>
            <li><a href="docs/UI.md">The interface contract</a> — screen anatomy, card anatomy and the density budget.</li>
            <li><a href="docs/TESTING.md">The test plan</a> — what the automated suites cover and what they do not.</li>
          </ul>
          <div class="row">${badge('no network calls after load', 'ok')} ${badge('offline capable', 'ok')} ${badge('exportable at any time', 'ok')}</div>`,
      })}

      ${card({
        title: 'How the numbers are defined',
        body: `
          ${dataTable({
            columns: [{ label: 'Figure' }, { label: 'What it means' }],
            rows: [
              ['Questions available', 'Unique questions stored in your bank. Duplicate imports do not increase the useful total.'],
              ['Unique questions attempted', 'Questions with at least one recorded attempt. Answering the same question five times still counts once here.'],
              ['Total attempts', 'Every recorded answer event, including repeats, skips and unscored attempts.'],
              ['First-attempt accuracy', 'Correct share of scored <em>first</em> attempts. Repeats cannot inflate it.'],
              ['Accuracy (all attempts)', 'Correct share of all scored attempts, repeats included.'],
              ['Small samples', 'Fewer than 3 scored answers is displayed as “insufficient evidence”; a weak/strong verdict needs at least 5.'],
              ['Unscored', 'A question with no usable answer key is excluded from the score rather than counted wrong.'],
              ['Question frequency', 'How often a topic appears <em>in your imported bank</em>. A study aid only — never a prediction.'],
            ].map(([term, text]) => [`<strong>${term}</strong>`, text]),
            className: 'compact cards-mobile',
          })}
          <details class="disclosure mt-3"><summary>Where a number came from</summary>
            <p class="small">Where a number came from is stated rather than implied:</p>
            <div class="row mb-2">${sourceChip('measured')} ${sourceChip('derived')} ${sourceChip('unavailable')} ${sourceChip('synthetic')} ${sourceChip('supplied')} ${sourceChip('verified')} ${sourceChip('disputed')}</div>
            <div class="row mb-2">${evidenceMeter(1)} ${evidenceMeter(3)} ${evidenceMeter(5)}</div>
            <p class="small mb-0">Every question carries two keys and they are never mixed up: the <strong>supplied key</strong> (what the source said, never overwritten) and a <strong>verified answer</strong> you can add with evidence. Three rules are the same in every test — confidence marking is always optional, a verified answer is preferred over a supplied key, and a missing or disputed key is judged with the supplied answer and flagged in the report.</p>
          </details>`,
      })}
`;
  },

  async mount(ctx, root) {
    document.getElementById('view')?.addEventListener('click', (ev) => {
      const toggle = ev.target.closest('.faq-toggle');
      if (!toggle) return;
      const panel = document.getElementById(toggle.getAttribute('aria-controls'));
      if (!panel) return;
      const open = toggle.getAttribute('aria-expanded') === 'true';
      // One answer at a time: the FAQ is an index, not a document.
      root.querySelectorAll('.faq-toggle[aria-expanded="true"]').forEach((other) => {
        if (other === toggle) return;
        other.setAttribute('aria-expanded', 'false');
        const otherPanel = document.getElementById(other.getAttribute('aria-controls'));
        if (otherPanel) otherPanel.hidden = true;
      });
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      panel.hidden = open;
    }, { signal: ctx.signal });

    root.addEventListener('change', (ev) => {
      const box = ev.target.closest('input[data-action="checklist"]');
      if (!box) return;
      if (box.checked) checklistDone.add(box.dataset.value);
      else checklistDone.delete(box.dataset.value);
      const counter = root.querySelector('#cardChecklist .count-chip');
      if (counter) counter.textContent = `${checklistDone.size} of ${CHECKLIST.length}`;
    }, { signal: ctx.signal });

    root.addEventListener('click', async (ev) => {
      const button = ev.target.closest('[data-action="open-command"]');
      if (!button) return;
      const { openCommandMenu } = await import('../../app.js');
      openCommandMenu?.();
    }, { signal: ctx.signal });
  },
};
