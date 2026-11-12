/**
 * hours.js — Study hours & consistency.
 *
 * The Study Timer answers "what am I doing now"; this screen answers "how is it
 * going". It is deliberately a review screen, not a second timer: nothing here
 * starts or stops a block.
 *
 *   1. The standing figures — streak, this week, average per active day,
 *      active days out of thirty, and how often the daily target was met.
 *   2. The consistency heatmap — twenty-six weeks, one square per study day,
 *      shaded by how much was studied.
 *   3. The weekly rhythm — the same seven bars the timer screen shows, with the
 *      week-on-week comparison in words.
 *
 * Every figure comes from `services/study-log.js`, the same reader the timer
 * writes through, so this screen can never disagree with the timer about what
 * a day contains. Days are study days (4 AM boundary), not calendar days.
 */

import { addDaysKey, applicationDayKey, weekdayLabel } from '../../core/util.js';
import { esc, card, screenHead, sheet, tile, emptyState, progressBar, icon } from '../components.js';
import * as studyLog from '../../services/study-log.js';
import * as timer from '../../services/study-timer.js';

/** Minutes → "3h 45m", the same wording the timer screen uses. */
function duration(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/**
 * The heatmap: seven rows (Sun → Sat) by twenty-six columns, filled column by
 * column so each column is one week. Intensity is a class, never an inline
 * width, so the stylesheet owns the palette.
 */
function heatmap(minutesByDay, today) {
  const cells = studyLog.heatmapCells(minutesByDay, { weeks: 26, today });
  const first = cells[0]?.key;
  const last = cells[cells.length - 1]?.key;
  const squares = cells
    .map(
      (cell) =>
        `<i class="hm-cell hm-l${cell.level}${cell.isFuture ? ' is-future' : ''}" title="${esc(
          `${weekdayLabel(cell.key)} ${cell.key}: ${cell.minutes ? duration(cell.minutes) : 'nothing logged'}`,
        )}"></i>`,
    )
    .join('');
  return `<div class="hm-wrap">
      <div class="hm-grid" role="img" aria-label="${esc(`Study minutes per day, ${first} to ${last}`)}">${squares}</div>
      <div class="hm-legend">
        <span class="muted">${esc(`${first} → ${last}`)}</span>
        <span class="hm-scale" aria-hidden="true">Less
          <i class="hm-cell hm-l0"></i><i class="hm-cell hm-l1"></i><i class="hm-cell hm-l2"></i><i class="hm-cell hm-l3"></i><i class="hm-cell hm-l4"></i>
        More</span>
      </div>
    </div>`;
}

/** One bar of the weekly rhythm; height steps are classes of 5%. */
function bar(day, maxMinutes) {
  const hours = Math.round((day.minutes / 60) * 10) / 10;
  const step = maxMinutes > 0 ? Math.max(day.minutes > 0 ? 5 : 0, Math.round((day.minutes / maxMinutes) * 20) * 5) : 0;
  return `<div class="week-day${day.isToday ? ' is-today' : ''}${day.minutes === 0 ? ' is-empty' : ''}" title="${esc(
    `${weekdayLabel(day.key)}: ${day.minutes ? duration(day.minutes) : 'nothing logged'}`,
  )}">
    <span class="week-value">${hours ? `${hours}h` : '—'}</span>
    <span class="week-track"><i class="week-fill h-${step}" aria-hidden="true"></i></span>
    <span class="week-label">${esc(weekdayLabel(day.key))}</span>
  </div>`;
}

export default {
  title: 'Study hours',
  eyebrow: 'What the timer has actually added up to',

  async render() {
    const today = applicationDayKey();
    const rows = await studyLog.listSessions();
    const minutesByDay = studyLog.focusMinutesByDay(rows);
    const streak = studyLog.streakSummary(minutesByDay, today);
    const recent = studyLog.recentTotals(minutesByDay, { days: 30, today });
    const week = studyLog.weekByDay(minutesByDay, today);
    const target = Math.max(0, Number(timer.getSettings().dailyTargetMinutes) || 0);

    const thisWeek = week.filter((day) => !day.isFuture).reduce((sum, day) => sum + day.minutes, 0);
    const weekStart = week[0]?.key || today;
    const lastWeekDays = Array.from({ length: 7 }, (_, index) => addDaysKey(weekStart, index - 7));
    const lastWeek = lastWeekDays.reduce((sum, key) => sum + (minutesByDay.get(key) || 0), 0);
    const change = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
    const weekMax = Math.max(1, ...week.map((day) => day.minutes));

    const last30 = Array.from({ length: 30 }, (_, index) => minutesByDay.get(addDaysKey(today, -(29 - index))) || 0);
    const targetHit = last30.filter((minutes) => target > 0 && minutes >= target).length;

    if (!minutesByDay.size) {
      return `
        ${screenHead({
          title: 'Study hours',
          eyebrow: 'What the timer has actually added up to',
          purpose: 'Finished focus blocks, counted under study days that start at 4 AM. Nothing has been logged yet.',
          primary: '<a class="btn btn-primary" href="#/timer">Open the Study Timer</a>',
          secondary: '<a class="btn btn-sm" href="#/settings">Backup &amp; storage <span aria-hidden="true">→</span></a>',
        })}
        ${sheet({
          body: emptyState({
            title: 'Nothing has been logged yet',
            message: 'Study hours come from the timer: a finished focus block, or a session you enter by hand.',
            willShow: 'A consistency heatmap, your streak and the week-on-week trend appear here after the first block.',
            action: '<a class="btn btn-primary" href="#/timer">Open the Study Timer</a>',
          }),
        })}`;
    }

    return `
      ${screenHead({
        title: 'Study hours',
        eyebrow: 'What the timer has actually added up to',
        purpose: `Finished focus blocks, counted under study days that start at 4 AM. ${recent.activeDays} of the last 30 days have study on them.`,
        primary: `<a class="btn btn-primary" href="#/timer">${icon('timer', { size: 15 })} Open the Study Timer</a>`,
        secondary: `<a class="btn btn-sm" href="#/settings">Backup &amp; storage <span aria-hidden="true">→</span></a>`,
      })}

      <div class="grid tiles">
        ${tile({ label: 'Current streak', value: `${streak.current}d`, sub: streak.current ? 'consecutive study days' : 'log today to start one', tone: streak.current ? 'ok' : '' })}
        ${tile({ label: 'Best streak', value: `${streak.best}d`, sub: 'longest run recorded' })}
        ${tile({ label: 'This week', value: duration(thisWeek), sub: change === null ? 'no week to compare yet' : `${change >= 0 ? '+' : ''}${change}% vs last week` })}
        ${tile({ label: 'Average day', value: duration(recent.average), sub: 'per active day, last 30' })}
        ${tile({ label: 'Active days', value: `${recent.activeDays}/30`, sub: 'days with a logged block' })}
        ${tile({ label: 'Target met', value: `${targetHit}`, sub: target ? `days at ${duration(target)} or more` : 'no target set' })}
      </div>

      <div class="grid cols-2">
        ${card({
          title: 'Consistency',
          count: '26 weeks',
          body: `${heatmap(minutesByDay, today)}
            <p class="meta-line"><span>One square per study day</span><span>Shaded by minutes logged</span></p>`,
        })}
        ${card({
          title: 'Weekly rhythm',
          count: duration(thisWeek),
          body: `
            <div class="week-chart">${week.map((day) => bar(day, weekMax)).join('')}</div>
            <hr class="divider" />
            <div class="focus-today-stats">
              <span><b>${esc(duration(thisWeek))}</b> this week</span>
              <span><b>${esc(duration(lastWeek))}</b> last week</span>
              <span><b>${esc(duration(recent.best))}</b> best day</span>
            </div>
            ${
              target
                ? `<div class="mt-2">${progressBar(thisWeek / (target * 7))}<p class="meta-line"><span>${Math.round(
                    Math.min(100, (thisWeek / (target * 7)) * 100),
                  )}% of a full ${duration(target)}-a-day week</span></p></div>`
                : ''
            }`,
        })}
      </div>
    `;
  },
};
