/**
 * study-timer.js — the Study Timer engine.
 *
 * A framework-free store: one module-level state, a subscribe/notify loop, and
 * pure functions for everything that can be reasoned about without a clock.
 * The engine is deliberately *not* owned by a screen. A Pomodoro keeps running
 * while the reader marks a syllabus line or sits a mock, which means:
 *
 *   - the interval, the state and the audio live here, not in the view;
 *   - the state is mirrored to localStorage on every change, so a reload (or a
 *     crash, or a phone locking) resumes the block it was in;
 *   - the engine notifies subscribers on its own schedule — the screen only
 *     repaints the clock, the title and (on a phase change) itself.
 *
 * Time is anchored, never accumulated: `anchorElapsed` is the elapsed seconds
 * when the block was last started and `anchorAt` the wall clock at that moment,
 * so `elapsedFor()` stays correct through throttled background tabs and
 * sleeps. A Pomodoro completes when elapsed reaches its phase length; the
 * completion is idempotent (one lock + one logged-id set) so a duplicate tick
 * cannot log the same block twice.
 *
 * Study days are the 4:00 AM kind (see core/util.js): a block that runs past
 * midnight is filed under the evening it started.
 */

import {
  DEFAULT_TIMER_SETTINGS,
  FOCUS_ENVIRONMENTS,
  LS_KEYS,
  MIN_LOGGABLE_SECONDS,
  MINDFULNESS_INTERVALS,
} from '../core/constants.js';
import { applicationDayKey, uid } from '../core/util.js';
import * as studyLog from '../services/study-log.js';
import * as audio from '../ui/focus-audio.js';

/** How often a running timer recomputes and notifies (ms). */
const TICK_MS = 250;

const clean = (value, fallback, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
};

/** Fill a partial/older settings object with defaults and clamp every field. */
export function normaliseSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  // Retired environment/clockTheme fields are deliberately not copied: the
  // app theme is now the only visual authority. A retired soundscape becomes
  // the default Woodland bed; Night remains an independent audio choice.
  const soundscape = FOCUS_ENVIRONMENTS.includes(source.soundscape) ? source.soundscape : DEFAULT_TIMER_SETTINGS.soundscape;
  return {
    dailyTargetMinutes: clean(source.dailyTargetMinutes, DEFAULT_TIMER_SETTINGS.dailyTargetMinutes, 0, 24 * 60),
    focusMinutes: clean(source.focusMinutes, DEFAULT_TIMER_SETTINGS.focusMinutes, 1, 240),
    breakMinutes: clean(source.breakMinutes, DEFAULT_TIMER_SETTINGS.breakMinutes, 1, 60),
    longBreakMinutes: clean(source.longBreakMinutes, DEFAULT_TIMER_SETTINGS.longBreakMinutes, 1, 120),
    sessionsBeforeLongBreak: clean(source.sessionsBeforeLongBreak, DEFAULT_TIMER_SETTINGS.sessionsBeforeLongBreak, 2, 8),
    breaksEnabled: source.breaksEnabled === undefined ? DEFAULT_TIMER_SETTINGS.breaksEnabled : Boolean(source.breaksEnabled),
    soundscape,
    soundEnabled: Boolean(source.soundEnabled),
    volume: clean(source.volume, DEFAULT_TIMER_SETTINGS.volume, 0, 100),
    mindfulnessEnabled: Boolean(source.mindfulnessEnabled),
    mindfulnessInterval: MINDFULNESS_INTERVALS.includes(Number(source.mindfulnessInterval))
      ? Number(source.mindfulnessInterval)
      : DEFAULT_TIMER_SETTINGS.mindfulnessInterval,
  };
}

export const defaultTimer = () => ({
  mode: 'pomodoro',
  phase: 'focus',
  running: false,
  elapsed: 0,
  anchorElapsed: 0,
  anchorAt: Date.now(),
  taskName: '',
  focusStartedAt: null,
  sessionId: uid('block'),
  completedFocusCycles: 0,
});

/** Drop any field a stored timer might carry that we no longer understand. */
function normaliseTimer(input = {}) {
  const base = defaultTimer();
  const source = input && typeof input === 'object' ? input : {};
  const mode = source.mode === 'stopwatch' ? 'stopwatch' : 'pomodoro';
  const phase = ['focus', 'short', 'long'].includes(source.phase) ? source.phase : 'focus';
  return {
    ...base,
    ...source,
    mode,
    phase,
    elapsed: Number.isFinite(Number(source.elapsed)) ? Math.max(0, Number(source.elapsed)) : 0,
    anchorElapsed: Number.isFinite(Number(source.anchorElapsed)) ? Math.max(0, Number(source.anchorElapsed)) : 0,
    anchorAt: Number.isFinite(Number(source.anchorAt)) ? Number(source.anchorAt) : Date.now(),
    taskName: typeof source.taskName === 'string' ? source.taskName : '',
    completedFocusCycles: Number.isFinite(Number(source.completedFocusCycles)) ? Math.max(0, Number(source.completedFocusCycles)) : 0,
    running: Boolean(source.running),
    sessionId: typeof source.sessionId === 'string' && source.sessionId ? source.sessionId : base.sessionId,
  };
}

/** Elapsed seconds of a block, anchored to wall clock while it is running. */
export function elapsedFor(timer, now = Date.now()) {
  if (!timer.running) return Math.max(0, timer.elapsed);
  return Math.max(0, timer.anchorElapsed + Math.max(0, now - timer.anchorAt) / 1000);
}

/** Length of the current phase in seconds. */
export function phaseSecondsOf(timer, settings) {
  if (timer.mode === 'stopwatch') return 0;
  if (timer.phase === 'focus') return settings.focusMinutes * 60;
  if (timer.phase === 'long') return settings.longBreakMinutes * 60;
  return settings.breakMinutes * 60;
}

/**
 * What the clock shows: remaining time in a Pomodoro (counting down), elapsed
 * time in a stopwatch (counting up).
 */
export function displaySecondsOf(timer, settings) {
  const elapsed = elapsedFor(timer);
  if (timer.mode === 'stopwatch') return elapsed;
  return Math.max(0, phaseSecondsOf(timer, settings) - elapsed);
}

export function progressOf(timer, settings) {
  if (timer.mode !== 'pomodoro') return 0;
  const total = phaseSecondsOf(timer, settings);
  if (!total) return 0;
  return Math.min(1, elapsedFor(timer) / total);
}

/* ------------------------------------------------------------------ state --- */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be full or blocked; the timer still works for this session */
  }
}

const state = {
  timer: normaliseTimer(readJson(LS_KEYS.TIMER, null)),
  settings: normaliseSettings(readJson(LS_KEYS.TIMER_SETTINGS, null)),
  /** Set once a block has been logged, so a duplicate tick cannot log it again. */
  loggedIds: new Set(Array.isArray(readJson(LS_KEYS.TIMER_LOGGED, [])) ? readJson(LS_KEYS.TIMER_LOGGED, []) : []),
  /** Bumped on every notify; lets a view skip work when nothing moved. */
  revision: 0,
};

const listeners = new Set();
let interval = null;
let completionLock = false;
let lastBellMinute = 0;
/** True when the engine is the one that started the block (vs. restored state). */
let startedThisSession = false;

function persistLogged() {
  writeJson(LS_KEYS.TIMER_LOGGED, [...state.loggedIds].slice(-80));
}

function notify(reason = 'tick') {
  state.revision += 1;
  for (const listener of Array.from(listeners)) {
    try {
      listener(reason, getSnapshot());
    } catch (err) {
      console.error('Study timer listener failed', err);
    }
  }
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A read-only view of the engine for one notification. Computing the derived
 * values once here keeps every subscriber consistent within a tick.
 */
export function getSnapshot() {
  const { timer, settings } = state;
  const elapsed = elapsedFor(timer);
  const phaseSeconds = phaseSecondsOf(timer, settings);
  return {
    timer,
    settings,
    elapsed,
    phaseSeconds,
    displaySeconds: timer.mode === 'pomodoro' ? Math.max(0, phaseSeconds - elapsed) : elapsed,
    progress: progressOf(timer, settings),
    revision: state.revision,
  };
}

export const getSettings = () => ({ ...state.settings });
export const getTimer = () => ({ ...state.timer });
export const isRunning = () => state.timer.running;

/* -------------------------------------------------------------- internals --- */

function saveTimer(next) {
  state.timer = next;
  // While a block is running the elapsed value is derived from the anchor, so
  // only the anchor is written — writing a moving `elapsed` every tick would
  // touch localStorage four times a second.
  writeJson(LS_KEYS.TIMER, next);
}

function saveSettings(next) {
  state.settings = next;
  writeJson(LS_KEYS.TIMER_SETTINGS, next);
}

function startInterval() {
  if (interval) return;
  interval = setInterval(tick, TICK_MS);
  // Never hold a Node test process open because a timer was left running.
  interval?.unref?.();
}

function stopInterval() {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
}

function syncAudio() {
  if (!state.settings.soundEnabled) {
    audio.stopAmbient();
    return;
  }
  audio.startAmbient(state.settings.soundscape, state.settings.volume);
}

/**
 * The one tick. Recomputes the clock, fires the mindfulness bell when its
 * interval is crossed, and completes a Pomodoro whose phase has run out.
 */
function tick() {
  const timer = state.timer;
  if (!timer.running) {
    stopInterval();
    return;
  }
  const { settings } = state;
  const elapsed = elapsedFor(timer);

  if (timer.mode === 'pomodoro' && timer.phase === 'focus' && settings.mindfulnessEnabled) {
    const minute = Math.floor(elapsed / 60);
    if (minute > 0 && minute % settings.mindfulnessInterval === 0 && minute !== lastBellMinute) {
      lastBellMinute = minute;
      audio.playBell('mindfulness', settings.volume);
    }
  }

  if (timer.mode === 'pomodoro' && elapsed >= phaseSecondsOf(timer, settings)) {
    completePhase(true);
    return;
  }
  notify('tick');
}

/**
 * Log the focus part of a block, at most once per block id. Returns whether it
 * was logged now (false when it already had been).
 */
async function logFocusOnce(timer, seconds, { completed }) {
  if (seconds < MIN_LOGGABLE_SECONDS) return false;
  if (state.loggedIds.has(timer.sessionId)) return false;
  state.loggedIds.add(timer.sessionId);
  persistLogged();
  try {
    await studyLog.recordFocusSession({
      seconds,
      taskName: timer.taskName,
      sessionType: 'focus',
      startedAt: timer.focusStartedAt,
      completed,
    });
  } catch (err) {
    // The block is real even if the write failed; let the reader retry rather
    // than swallowing their session because storage hiccuped.
    state.loggedIds.delete(timer.sessionId);
    persistLogged();
    console.error('Could not save the focus session', err);
    return false;
  }
  return true;
}

/**
 * Finish the current phase and move to the next one.
 *
 * In a Pomodoro, a completed focus phase logs the block and follows the break
 * rule (short break, a long break every `sessionsBeforeLongBreak` cycles, or
 * straight back to focus when breaks are off). A break phase returns to focus.
 * `automatic` distinguishes "the clock ran out" from "the reader finished
 * early" only in what gets logged: a block that ran its full length is always
 * logged at its full length, even if the tick that noticed it arrived late.
 */
async function completePhase(automatic) {
  if (completionLock) return null;
  completionLock = true;
  const timer = state.timer;
  const { settings } = state;
  const measured = elapsedFor(timer);
  const phaseLength = phaseSecondsOf(timer, settings);
  const seconds = automatic && timer.mode === 'pomodoro' ? phaseLength : measured;

  let logged = false;
  let nextPhase = 'focus';
  let completedFocusCycles = timer.completedFocusCycles;

  if (timer.phase === 'focus') {
    logged = await logFocusOnce(timer, seconds, { completed: true });
    if (logged) completedFocusCycles += 1;
    const longBreak =
      completedFocusCycles > 0 && completedFocusCycles % settings.sessionsBeforeLongBreak === 0;
    if (settings.breaksEnabled) nextPhase = longBreak ? 'long' : 'short';
    else nextPhase = 'focus';
    audio.playBell('time-up', settings.volume);
  } else {
    audio.playBell('time-up', settings.volume);
    nextPhase = 'focus';
  }

  saveTimer({
    ...timer,
    running: false,
    phase: nextPhase,
    elapsed: 0,
    anchorElapsed: 0,
    anchorAt: Date.now(),
    focusStartedAt: null,
    sessionId: uid('block'),
    completedFocusCycles,
  });
  lastBellMinute = 0;
  startedThisSession = false;
  stopInterval();
  completionLock = false;
  notify('phase');
  return { logged, seconds, nextPhase };
}

/* ------------------------------------------------------------ public API --- */

export function setSettings(patch = {}) {
  const previous = state.settings;
  const next = normaliseSettings({ ...previous, ...patch });
  const soundWasOn = previous.soundEnabled;
  saveSettings(next);
  if (next.soundEnabled) {
    audio.unlock();
    syncAudio();
  } else if (soundWasOn) {
    audio.stopAmbient();
  } else if (next.volume !== previous.volume) {
    audio.setAmbientVolume(next.volume);
  }
  // Most preferences need a repaint of the screen around the clock (a new
  // block length changes the presets and the progress bar). Sound preferences
  // do not: changing them while a block runs must not rebuild the screen or
  // close fullscreen, so the view repaints their label in place.
  const keys = Object.keys(patch || {});
  const cosmetic = keys.length > 0 && keys.every((key) => ['soundscape', 'soundEnabled', 'volume'].includes(key));
  notify(cosmetic ? 'cosmetic' : 'settings');
  return getSettings();
}

export function setTaskName(taskName) {
  saveTimer({ ...state.timer, taskName: String(taskName ?? '').slice(0, 160) });
  notify('task');
}

/** Switch mode. Both modes reset the block, as in the reference workspace. */
export function setMode(mode) {
  const next = mode === 'stopwatch' ? 'stopwatch' : 'pomodoro';
  stopInterval();
  saveTimer({ ...defaultTimer(), mode: next, taskName: state.timer.taskName, completedFocusCycles: state.timer.completedFocusCycles });
  lastBellMinute = 0;
  notify('mode');
}

export function start() {
  const timer = state.timer;
  if (timer.running) return;
  audio.unlock();
  syncAudio();
  const elapsed = elapsedFor(timer);
  lastBellMinute = Math.floor(elapsed / 60);
  startedThisSession = true;
  saveTimer({
    ...timer,
    running: true,
    anchorAt: Date.now(),
    anchorElapsed: elapsed,
    // The real start of the block: a stopwatch started, paused twice and
    // resumed must still report when the work began.
    focusStartedAt:
      timer.phase === 'focus' && !timer.focusStartedAt
        ? new Date(Date.now() - elapsed * 1000).toISOString()
        : timer.focusStartedAt,
  });
  startInterval();
  notify('start');
}

export function pause() {
  const timer = state.timer;
  if (!timer.running) return;
  const elapsed = elapsedFor(timer);
  saveTimer({ ...timer, running: false, elapsed, anchorElapsed: elapsed });
  stopInterval();
  notify('pause');
}

/** Discard the current block without logging it. */
export function reset() {
  stopInterval();
  completionLock = false;
  saveTimer({
    ...state.timer,
    running: false,
    elapsed: 0,
    anchorElapsed: 0,
    anchorAt: Date.now(),
    focusStartedAt: null,
    sessionId: uid('block'),
  });
  lastBellMinute = 0;
  notify('reset');
}

/** Finish early and log what was actually worked. */
export async function finish() {
  if (completionLock) return null;
  return completePhase(false);
}

/** Leave a break and go straight back to focus. */
export function skipBreak() {
  saveTimer({
    ...state.timer,
    running: false,
    phase: 'focus',
    elapsed: 0,
    anchorElapsed: 0,
    anchorAt: Date.now(),
    focusStartedAt: null,
    sessionId: uid('block'),
  });
  stopInterval();
  notify('skip');
}

/**
 * Re-read the saved timer and put the engine back the way the reader left it.
 * Called at boot: a block that was running when the tab closed keeps running
 * (the elapsed time is derived from the anchor, so the minutes spent closed
 * count, exactly as a real stopwatch would), and any phase that ran out while
 * the app was not open is closed out once, with its session logged.
 */
export async function restore() {
  state.timer = normaliseTimer(readJson(LS_KEYS.TIMER, state.timer));
  state.settings = normaliseSettings(readJson(LS_KEYS.TIMER_SETTINGS, state.settings));
  const timer = state.timer;
  if (!timer.running) {
    notify('restore');
    return getSnapshot();
  }
  const elapsed = elapsedFor(timer);
  if (timer.mode === 'pomodoro' && elapsed >= phaseSecondsOf(timer, state.settings)) {
    // The phase ended while the app was closed.
    startedThisSession = true;
    await completePhase(true);
  } else {
    startedThisSession = true;
    startInterval();
    notify('restore');
  }
  return getSnapshot();
}

/** Mode/phase words used by the clock caption, the mini player and the title. */
export function phaseLabel(timer, { upper = false } = {}) {
  const label =
    timer.mode === 'stopwatch' ? 'Stopwatch' : timer.phase === 'focus' ? 'Focus' : timer.phase === 'long' ? 'Long break' : 'Break';
  return upper ? label.toUpperCase() : label;
}

/** The engine's own idea of "now" as a study day, for callers that need both. */
export const studyDay = () => applicationDayKey();

/** True once the engine has a block it could log something from. */
export const hasWorkToLog = () => elapsedFor(state.timer) >= MIN_LOGGABLE_SECONDS;

/** Release the interval and the audio — used by tests and on page teardown. */
export function teardown() {
  stopInterval();
  audio.stopAmbient();
  listeners.clear();
}

export const __internals = { state, elapsedFor, normaliseSettings, normaliseTimer, tick, completePhase };
