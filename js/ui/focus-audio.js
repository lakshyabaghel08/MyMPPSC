/**
 * focus-audio.js — the Study Timer's ambient soundscapes and bells, synthesised
 * with the Web Audio API.
 *
 * The reference implementation shipped three looped MP3s (38 MB in total) plus
 * two bell files. That is a third of this app's whole download for a feature
 * most readers use with the sound off, and it has to be precached for offline
 * use to keep working. Noise and bells do not need to be recorded: an
 * AudioBufferSourceNode of shaped noise plus a couple of decaying sine partials
 * produces a woodland, a rainstorm and a night fire that loop forever, cost
 * nothing to download, and never need the network.
 *
 * Design rules:
 *  - Nothing is created until the reader asks for sound (`unlock()` runs inside
 *    the click that enables it, which is what browsers require), and everything
 *    is torn down when they turn it off.
 *  - Every public call is a no-op when Web Audio is unavailable (jsdom, older
 *    browsers), so the rest of the app cannot fail because sound did not start.
 *  - Volume is applied from the reader's percentage, capped well below unity so
 *    a first "enable sound" press cannot be startling.
 */

const MIN_GAIN = 0;
const MAX_GAIN = 0.55;

let context = null;
/** The live soundscape: { gain, stop } for the nodes currently running. */
let ambient = null;
let currentScape = null;
let currentVolume = 45;

function AudioContextClass() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

export const isAudioSupported = () => Boolean(AudioContextClass());

/** Create (or revive) the one AudioContext this app uses. */
function ensureContext() {
  const Ctor = AudioContextClass();
  if (!Ctor) return null;
  if (!context) {
    try {
      context = new Ctor();
    } catch {
      return null;
    }
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

/**
 * Two seconds of noise, looped. `tint` shapes the spectrum:
 *   'rain'     bright, hissy — high-passed noise with a slow swell
 *   'woodland' mid-brown noise, wind through leaves
 *   'night'    low noise, the bed under a fire/crickets
 */
function noiseBuffer(ctx, seconds = 2.5) {
  const frames = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Brown-ish integration gives a fuller, less "hiss" texture than pure white.
  let last = 0;
  for (let i = 0; i < frames; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  return buffer;
}

const SOUNDSCAPES = {
  rain: { label: 'Rainfall', filter: 'highpass', frequency: 900, q: 0.6, gain: 0.9, swell: { depth: 0.22, rate: 0.06 } },
  woodland: { label: 'Woodland wind', filter: 'lowpass', frequency: 780, q: 1.2, gain: 0.85, swell: { depth: 0.3, rate: 0.045 } },
  night: { label: 'Night fire', filter: 'lowpass', frequency: 420, q: 2.2, gain: 0.8, swell: { depth: 0.35, rate: 0.09 } },
};

export const soundscapeLabel = (key) => SOUNDSCAPES[key]?.label || key;

/** Start (or replace) the ambient bed. Safe to call repeatedly. */
export function startAmbient(scape = 'woodland', volume = currentVolume) {
  const ctx = ensureContext();
  if (!ctx) return false;
  const preset = SOUNDSCAPES[scape] || SOUNDSCAPES.woodland;
  currentVolume = volume;
  if (ambient && currentScape === scape) {
    setAmbientVolume(volume);
    return true;
  }
  stopAmbient();

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = preset.filter;
  filter.frequency.value = preset.frequency;
  filter.Q.value = preset.q;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(ctx.destination);

  // A slow swell keeps the loop from reading as a static hiss.
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = preset.swell.rate;
  lfoGain.gain.value = preset.swell.depth;
  lfo.connect(lfoGain).connect(gain.gain);
  lfo.start();

  const target = Math.max(MIN_GAIN, Math.min(MAX_GAIN, (volume / 100) * MAX_GAIN)) * preset.gain;
  // Fade in over 1.2 s: an abrupt wall of noise is a shock, not an atmosphere.
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(target, ctx.currentTime + 1.2);

  source.start();
  ambient = {
    gain,
    stop() {
      try {
        source.stop();
        lfo.stop();
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        /* already stopped */
      }
    },
  };
  currentScape = scape;
  return true;
}

export function setAmbientVolume(volume = currentVolume) {
  currentVolume = volume;
  if (!ambient || !context) return;
  const preset = SOUNDSCAPES[currentScape] || SOUNDSCAPES.woodland;
  const target = Math.max(MIN_GAIN, Math.min(MAX_GAIN, (volume / 100) * MAX_GAIN)) * preset.gain;
  ambient.gain.gain.cancelScheduledValues(context.currentTime);
  ambient.gain.gain.setTargetAtTime(target, context.currentTime, 0.25);
}

export function stopAmbient() {
  if (!ambient) return;
  try {
    ambient.stop();
  } finally {
    ambient = null;
    currentScape = null;
  }
}


/* ------------------------------------------------------------------ bells --- */

/**
 * A struck bell: a fundamental plus inharmonic partials, each decaying faster
 * than the last. `kind` picks the pitch and length:
 *   'time-up'     a clear, bright strike — the block is over
 *   'mindfulness' a softer, longer, lower chime — come back to the breath
 */
export function playBell(kind = 'time-up', volume = currentVolume) {
  const ctx = ensureContext();
  if (!ctx) return false;
  const level = Math.max(0, Math.min(1, volume / 100));
  if (level <= 0) return false;

  const soft = kind === 'mindfulness';
  const base = soft ? 396 : 660;
  const duration = soft ? 4.2 : 2.2;
  const peak = level * (soft ? 0.22 : 0.3);
  const partials = soft ? [1, 2.01, 2.98, 4.2] : [1, 2.76, 5.4, 8.93];
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  partials.forEach((ratio, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = base * ratio;
    const partialPeak = peak / (index + 1.6);
    const decay = duration * (1 - index * 0.16);
    gain.gain.setValueAtTime(0, now);
    // A 6 ms attack avoids the click a hard start produces.
    gain.gain.linearRampToValueAtTime(partialPeak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + decay + 0.05);
  });

  // Release the graph once the tail has finished.
  setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* nothing to release */
    }
  }, (duration + 0.4) * 1000);
  return true;
}

/**
 * Browsers refuse to start audio outside a user gesture. Call this from the
 * click that enables sound (or starts the timer) so the context is unlocked
 * before anything tries to play.
 */
export function unlock() {
  const ctx = ensureContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return true;
}

/** Release everything — used when the workspace is left or the tab is hidden. */
export function suspend() {
  stopAmbient();
  if (context && context.state === 'running') context.suspend().catch(() => {});
}
