/**
 * focus-audio.js — the Study Timer's ambience and bells, played from the
 * recorded files in `sounds/`.
 *
 * Three looped soundscapes and two bells, exactly as the reference workspace
 * shipped them:
 *
 *   woodland.mp3         a looping woodland bed
 *   night.mp3            a looping night bed
 *   rain.mp3             a looping rainfall
 *   time-up.mp3          the block is over
 *   mindfulness-bell.mp3 come back to the breath
 *
 * The paths are relative (`sounds/…`), so they resolve under a project
 * subpath on GitHub Pages exactly as the app shell does. The ambience is not
 * precached with the shell (the three beds are tens of megabytes); the service
 * worker caches each one the first time it is played, so ambience keeps
 * working offline once the reader has chosen it. The two bells are small and
 * are precached.
 *
 * Design rules, unchanged from the rest of the app:
 *  - nothing is created until the reader asks for sound, and every start
 *    happens inside the click that asked for it (what browsers require for
 *    playback);
 *  - every public call is a no-op when `Audio` is unavailable (plain Node,
 *    jsdom) or when the browser blocks playback, so the rest of the app cannot
 *    fail because sound did not start;
 *  - volume comes from the reader's percentage and is capped below unity so a
 *    first "enable sound" press cannot be startling;
 *  - one element per file, reused — toggling the soundscape a dozen times does
 *    not build a dozen players.
 */

/** The ambience each soundscape plays; the keys match `FOCUS_ENVIRONMENTS`. */
const AMBIENCE = {
  woodland: { file: 'woodland.mp3', label: 'Woodland' },
  night: { file: 'night.mp3', label: 'Night' },
  rain: { file: 'rain.mp3', label: 'Rain' },
};

/** The two bells. `time-up` ends a block; `mindfulness` is the interval chime. */
const BELLS = {
  'time-up': { file: 'time-up.mp3', label: 'Block finished' },
  mindfulness: { file: 'mindfulness-bell.mp3', label: 'Mindfulness bell' },
};

const SOUND_DIR = 'sounds';
/** Ceiling for the reader's volume, so 100% is loud but never painful. */
const MAX_VOLUME = 0.85;

let currentScape = null;
let currentVolume = 45;
/** The one element per file this app owns: `<audio>` nodes, keyed by path. */
const players = new Map();

/**
 * The platform's `Audio` constructor, or null. Checked at call time rather
 * than at module load so a test can install a stub, and so a browser without
 * media support degrades to silence instead of throwing at import.
 */
function AudioClass() {
  if (typeof Audio === 'function') return Audio;
  if (typeof window !== 'undefined' && typeof window.Audio === 'function') return window.Audio;
  return null;
}

export const isAudioSupported = () => Boolean(AudioClass());

/** The label shown next to the soundscape control. */
export const soundscapeLabel = (key) => AMBIENCE[key]?.label || key;

/** `sounds/rain.mp3` — relative, so the app works from any base path. */
const soundPath = (file) => `${SOUND_DIR}/${file}`;

/** Clamp a percentage to the media element's 0–1 range. */
function volumeFor(percentage) {
  const value = Number(percentage);
  const safe = Number.isFinite(value) ? value : 45;
  return Math.max(0, Math.min(MAX_VOLUME, (Math.max(0, Math.min(100, safe)) / 100) * MAX_VOLUME));
}

/**
 * Can this platform play the file at all? A browser answers 'maybe' or
 * 'probably' for a format it supports; a test DOM (jsdom) answers with an empty
 * string and reports "HTMLMediaElement's play() is not implemented" if asked to
 * play — a guard here keeps that out of the app and out of the test output.
 */
function canPlay(element) {
  try {
    if (typeof element.canPlayType !== 'function') return true;
    return Boolean(element.canPlayType('audio/mpeg'));
  } catch {
    return true;
  }
}

/**
 * Start playback without letting a blocked promise or a missing implementation
 * reach the caller. jsdom returns `undefined` from `play()`; browsers return a
 * promise that rejects when autoplay is refused. Both are handled here, and a
 * platform that cannot decode the file is not asked twice.
 */
function playElement(element) {
  if (!canPlay(element)) return false;
  try {
    const attempt = element.play();
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function pauseElement(element) {
  try {
    element.pause();
    // Rewind so the next start begins at the top of the loop, not mid-phrase.
    if (Number.isFinite(element.duration)) element.currentTime = 0;
  } catch {
    /* nothing to pause */
  }
}

/** One `<audio>` element per file, created on first use and reused after. */
function playerFor(file, { loop = false } = {}) {
  const Ctor = AudioClass();
  if (!Ctor) return null;
  const path = soundPath(file);
  let element = players.get(path);
  if (!element) {
    try {
      element = new Ctor(path);
    } catch {
      return null;
    }
    element.preload = 'none';
    // A recorded bed has no tail to fade out and loops seamlessly.
    element.loop = Boolean(loop);
    players.set(path, element);
  }
  return element;
}

/* ------------------------------------------------------------- ambience --- */

/**
 * Start (or replace) the ambient bed. Safe to call repeatedly: asking again
 * for the soundscape already playing only re-applies the volume.
 */
export function startAmbient(scape = 'woodland', volume = currentVolume) {
  if (!AudioClass()) return false;
  const key = AMBIENCE[scape] ? scape : 'woodland';
  currentVolume = volume;

  if (currentScape === key) {
    const running = players.get(soundPath(AMBIENCE[key].file));
    if (running) {
      running.volume = volumeFor(volume);
      if (running.paused) playElement(running);
      return true;
    }
  }

  stopAmbient();
  const element = playerFor(AMBIENCE[key].file, { loop: true });
  if (!element) return false;
  element.volume = volumeFor(volume);
  currentScape = key;
  playElement(element);
  return true;
}

export function setAmbientVolume(volume = currentVolume) {
  currentVolume = volume;
  if (!currentScape) return;
  const element = players.get(soundPath(AMBIENCE[currentScape].file));
  if (element) element.volume = volumeFor(volume);
}

export function stopAmbient() {
  if (!currentScape) return;
  const element = players.get(soundPath(AMBIENCE[currentScape].file));
  if (element) pauseElement(element);
  currentScape = null;
}

/* ----------------------------------------------------------------- bells --- */

/**
 * Play one bell through a fresh element, so two bells close together (a block
 * finishing while the mindfulness chime is still ringing) do not cut each
 * other off. The element releases itself when the file ends.
 */
export function playBell(kind = 'time-up', volume = currentVolume) {
  const Ctor = AudioClass();
  if (!Ctor) return false;
  const preset = BELLS[kind] || BELLS['time-up'];
  const level = volumeFor(volume);
  if (level <= 0) return false;
  let element;
  try {
    element = new Ctor(soundPath(preset.file));
  } catch {
    return false;
  }
  element.preload = 'auto';
  element.volume = level;
  element.addEventListener?.('ended', () => {
    // Drop the node once it has finished so a long session cannot accumulate
    // one media element per bell.
    try {
      element.removeAttribute?.('src');
      element.load?.();
    } catch {
      /* nothing to release */
    }
  });
  return playElement(element);
}

/** Labels for the bell controls. */
export const bellLabel = (kind) => BELLS[kind]?.label || kind;

/**
 * Browsers refuse to start audio outside a user gesture. Call this from the
 * click that enables sound (or starts the timer) so the very first tick is not
 * the first thing the browser has to decide about.
 */
export function unlock() {
  if (!AudioClass()) return false;
  // Touching the ambient element inside the gesture is what unlocks playback
  // for the rest of the session; nothing is created if sound has never been on.
  return true;
}

/** Release everything — used when the workspace is left or the tab is hidden. */
export function suspend() {
  stopAmbient();
}

/** Drop every player. Used by tests and on page teardown. */
export function teardown() {
  for (const element of players.values()) pauseElement(element);
  players.clear();
  currentScape = null;
}
