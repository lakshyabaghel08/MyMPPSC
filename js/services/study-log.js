/**
 * study-log.js — focus sessions: writing them, reading them back, and the
 * manual-log path for study that happened away from the timer.
 *
 * Sessions live in the existing `sessions` store, in the shape the planner
 * already uses (`logSession`), so the Study Timer's work is ordinary study
 * time: the same records feed the planner's totals, the backup file and the
 * analytics screen. Two fields are added for the timer:
 *
 *   session_type  'focus' | 'break' — a break is recorded so the recent list is
 *                 honest, but only focus minutes ever count as study time.
 *   task_name     what the reader said they were working on.
 *   completed     whether the block was finished or stopped early.
 *
 * Classification uses the 4:00 AM study day (`applicationDayKey` in
 * core/util.js): a block that runs past midnight belongs to the evening it
 * started. Every read path here goes through `focusMinutesByDay()` so there is
 * one definition of "minutes studied on a day".
 */

import { MIN_LOGGABLE_SECONDS, STORES } from '../core/constants.js';
import * as db from '../core/db.js';
import {
  applicationDayKey,
  addDaysKey,
  computeStreak,
  dateFromKey,
  nowIso,
  startOfWeekKey,
  uid,
} from '../core/util.js';

const HOUR_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/* ------------------------------------------------------------------ write --- */

/**
 * Persist one focus or break block. `seconds` is the measured length; a focus
 * block shorter than 12 seconds is not stored (it is a mis-tap, and logging it
 * would make every accidental start inflate the day's totals).
 *
 * Returns the stored row, or `null` when nothing was long enough to keep.
 */
export async function recordFocusSession({
  seconds,
  taskName = '',
  sessionType = 'focus',
  startedAt = null,
  completed = true,
} = {}) {
  const length = Math.max(0, Math.round(Number(seconds) || 0));
  // A focus block and a break both have to be worth recording; a few seconds is
  // a mis-tap, and logging one would inflate the day for no reason.
  if (length < MIN_LOGGABLE_SECONDS) return null;

  // Round to a tenth of a minute, so a 25-minute block is exactly 25 and a
  // 3-minute 30-second block is 3.5 rather than 3 or 4.
  const minutes = Math.round((length / 60) * 10) / 10;
  const endedAt = nowIso();
  const started = startedAt
    ? new Date(startedAt).toISOString()
    : new Date(Date.now() - length * 1000).toISOString();
  const row = {
    // Prefixed like every other timer record, and sortable by creation time.
    id: uid('focus'),
    minutes,
    seconds: length,
    category: sessionType === 'focus' ? 'study' : 'break',
    session_type: sessionType,
    task_name: String(taskName || '').trim() || (sessionType === 'focus' ? 'Focus study' : 'Break'),
    completed: Boolean(completed),
    subject: null,
    topic: null,
    syllabus_id: null,
    notes: null,
    started_at: started,
    ended_at: endedAt,
    created_at: endedAt,
  };
  await db.put(STORES.SESSIONS, row);
  return row;
}

/**
 * The "I studied but forgot to start the timer" path.
 *
 * A manual log becomes an ordinary completed focus session, so it flows into
 * the day totals, the week chart and the heatmap with no extra wiring. The
 * reader picks a *study day* and an optional clock time; `composeManualStart()`
 * turns that into the instant whose study day is exactly the one they picked.
 *
 * Returns `{ ok: true, session }` or `{ ok: false, error }` — the caller shows
 * the message rather than throwing.
 */
export async function logManualStudy({ date, time = null, durationMinutes, taskName = '' } = {}) {
  const minutes = Number(durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { ok: false, error: 'Enter a duration of at least 1 minute.' };
  }
  if (minutes > 24 * 60) {
    return { ok: false, error: 'A single log cannot be longer than 24 hours.' };
  }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : applicationDayKey();
  if (day > applicationDayKey()) {
    return { ok: false, error: 'Study cannot be logged for a day that has not started yet.' };
  }
  if (time && !HOUR_RE.test(String(time).trim())) {
    return { ok: false, error: 'The start time must look like 09:30.' };
  }

  const seconds = Math.round(minutes * 60);
  const startedAt = composeManualStart(day, time || null);
  const row = {
    id: uid('focus'),
    minutes: Math.round(minutes * 10) / 10,
    seconds,
    category: 'study',
    session_type: 'focus',
    task_name: String(taskName || '').trim() || 'Manual study log',
    completed: true,
    subject: null,
    topic: null,
    syllabus_id: null,
    notes: null,
    manual: true,
    started_at: startedAt,
    ended_at: new Date(new Date(startedAt).getTime() + seconds * 1000).toISOString(),
    created_at: nowIso(),
  };
  await db.put(STORES.SESSIONS, row);
  return { ok: true, session: row };
}

/**
 * The instant to file a manual log at, given the study day the reader chose and
 * an optional `HH:MM`.
 *
 * 00:00–03:59 is *before* the 4 AM boundary, so that clock time on the chosen
 * date belongs to the previous study day. When the reader means "the evening of
 * the day I picked", the record has to move to the next calendar date; this
 * composes the instant and checks its study day rather than assuming.
 */
export function composeManualStart(day, time = null, now = new Date()) {
  const parsed = time ? HOUR_RE.exec(String(time).trim()) : null;
  const sameDay = applicationDayKey(now) === day;
  const hours = parsed ? Number(parsed[1]) : sameDay ? now.getHours() : 9;
  const minutes = parsed ? Number(parsed[2]) : sameDay ? now.getMinutes() : 0;

  const at = (key) => {
    const d = dateFromKey(key);
    d.setHours(hours, minutes, 0, 0);
    return d;
  };
  const candidate = at(day);
  return (applicationDayKey(candidate) === day ? candidate : at(addDaysKey(day, 1))).toISOString();
}

/** Which study day a manual log with these inputs would be filed under. */
export function manualLogDay(day, time = null, now = new Date()) {
  return applicationDayKey(new Date(composeManualStart(day, time, now)));
}

/* ------------------------------------------------------------------- read --- */

/** Every stored session row, newest first. */
export async function listSessions() {
  const rows = await db.getAll(STORES.SESSIONS);
  return rows.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
}

/** Only completed focus blocks — the rows that count as study time. */
export const isFocus = (row) => row && row.session_type !== 'break' && row.completed !== false;

/**
 * Focus minutes per study day, as a `Map<yyyy-MM-dd, minutes>`.
 *
 * This is the single definition of "minutes studied on a day": day totals, the
 * week chart, the streak and the heatmap all read this map, so they can never
 * disagree about which day a past-midnight block belongs to.
 */
export function focusMinutesByDay(rows) {
  const minutes = new Map();
  for (const row of rows) {
    if (!isFocus(row) || !row.started_at) continue;
    const key = applicationDayKey(new Date(row.started_at));
    const value = Number(row.minutes);
    if (!Number.isFinite(value)) continue;
    minutes.set(key, (minutes.get(key) || 0) + value);
  }
  return minutes;
}

/** Sessions that belong to one study day, newest first. */
export function sessionsForDay(rows, day = applicationDayKey()) {
  return rows.filter((row) => row.started_at && applicationDayKey(new Date(row.started_at)) === day);
}

/** Totals for one study day: focus minutes, session count, longest block. */
export function daySummary(rows, day = applicationDayKey()) {
  const mine = sessionsForDay(rows, day).filter(isFocus);
  const minutes = mine.reduce((sum, row) => sum + (Number(row.minutes) || 0), 0);
  const longest = mine.reduce((max, row) => Math.max(max, Number(row.minutes) || 0), 0);
  return {
    minutes: Math.round(minutes * 10) / 10,
    sessions: mine.length,
    longest: Math.round(longest * 10) / 10,
  };
}

/** Sunday-start week of study days ending `day`, with minutes per day. */
export function weekByDay(minutesByDay, day = applicationDayKey()) {
  const start = startOfWeekKey(day);
  return Array.from({ length: 7 }, (_, index) => {
    const key = addDaysKey(start, index);
    return { key, minutes: minutesByDay.get(key) || 0, isToday: key === day, isFuture: key > day };
  });
}

/**
 * The last `weeks` × 7 study days, ending on the Saturday of the current week,
 * for the consistency heatmap. `level` is the intensity bucket the stylesheet
 * colours: 0 none, 1 under an hour, 2 an hour to 2½, 3 2½ to 5, 4 five hours+.
 */
export function heatmapCells(minutesByDay, { weeks = 26, today = applicationDayKey() } = {}) {
  const end = addDaysKey(startOfWeekKey(today), 6);
  const total = weeks * 7;
  return Array.from({ length: total }, (_, index) => {
    const key = addDaysKey(end, -(total - 1 - index));
    const minutes = minutesByDay.get(key) || 0;
    const level = minutes === 0 ? 0 : minutes < 60 ? 1 : minutes < 150 ? 2 : minutes < 300 ? 3 : 4;
    return { key, minutes, level, isFuture: key > today };
  });
}

/** Current and best run of consecutive study days. */
export function streakSummary(minutesByDay, today = applicationDayKey()) {
  const active = new Set([...minutesByDay.entries()].filter(([, minutes]) => minutes > 0).map(([key]) => key));
  const best = [...active].sort().reduce(
    (state, key) => {
      const run = state.previous && addDaysKey(state.previous, 1) === key ? state.run + 1 : 1;
      return { run, best: Math.max(state.best, run), previous: key };
    },
    { run: 0, best: 0, previous: '' },
  ).best;
  return { current: computeStreak(active, today), best };
}

/** Totals over the last `days` study days: minutes, active days, average. */
export function recentTotals(minutesByDay, { days = 30, today = applicationDayKey() } = {}) {
  const keys = Array.from({ length: days }, (_, index) => addDaysKey(today, -(days - 1 - index)));
  const minutes = keys.reduce((sum, key) => sum + (minutesByDay.get(key) || 0), 0);
  const activeDays = keys.filter((key) => (minutesByDay.get(key) || 0) > 0).length;
  return {
    minutes,
    activeDays,
    average: activeDays ? Math.round(minutes / activeDays) : 0,
    best: keys.reduce((max, key) => Math.max(max, minutesByDay.get(key) || 0), 0),
  };
}

/** Everything the Study Timer screen and the dashboard card need, in one read. */
export async function loadStudySummary({ today = applicationDayKey() } = {}) {
  const rows = await listSessions();
  const minutesByDay = focusMinutesByDay(rows);
  return {
    rows,
    minutesByDay,
    today,
    todaySummary: daySummary(rows, today),
    todaySessions: sessionsForDay(rows, today).slice(0, 8),
    week: weekByDay(minutesByDay, today),
    streak: streakSummary(minutesByDay, today),
  };
}

/** Minutes studied in the current week (Sunday → today). */
export function weekMinutes(minutesByDay, today = applicationDayKey()) {
  return weekByDay(minutesByDay, today)
    .filter((day) => !day.isFuture)
    .reduce((sum, day) => sum + day.minutes, 0);
}

