/**
 * focus-atmosphere.js — the Study Timer's visual layer.
 *
 * Each atmosphere is a tint (in css/focus-timer.css, derived from the app's own
 * design tokens so both themes follow) plus one signature motion:
 *
 *   woodland  drifting leaves in three token tones, on three depth layers —
 *             far ones smaller, dimmer and slower, with a sway mid-fall
 *   rain      two parallax drop layers (thin far drops, heavier near ones) and
 *             a slow mist drift along the ground
 *   night     a quiet twinkling starfield with the occasional shooting star —
 *             a lone streak or a short meteor shower
 *
 * Everything is generated once per mount from a seeded PRNG, so a re-render does
 * not reshuffle the sky. The particles are animated by CSS keyframes rather than
 * by a timer: the browser composites them, and they stop dead when the reader
 * prefers reduced motion (the stylesheet switches the animations off).
 *
 * Each particle needs its own numbers (where it starts, how long it takes), and
 * those cannot go in the markup: this app keeps every visual rule in the
 * stylesheet and forbids inline `style` attributes (tools/check.mjs). So the
 * numbers are handed to the CSSOM after the element is parsed —
 * `el.style.setProperty(...)` produces a real style rule, not an attribute in
 * the source — which keeps the source free of presentational markup while still
 * letting fifty raindrops fall at fifty different speeds.
 *
 * Nothing here touches layout: the layer is absolutely positioned inside the
 * workspace, `aria-hidden`, and click-through.
 */

/** Mulberry32 — small, fast, and reproducible so the sky is stable. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeLeaves(count = 22, seed = 7717) {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => {
    const depth = Math.floor(rand() * 3); // 0 far → 2 near
    const scale = depth === 0 ? 0.7 : depth === 2 ? 1.15 : 1;
    return {
      left: rand() * 100,
      size: (4 + rand() * 3) * scale,
      duration: (1.9 + rand() * 1.9) * (depth === 0 ? 1.3 : depth === 2 ? 0.85 : 1),
      delay: -rand() * 4,
      opacity: (0.2 + rand() * 0.24) * (depth === 0 ? 0.65 : 1),
      drift: (rand() - 0.5) * 120,
      rotation: 360 + rand() * 720,
      sway: 8 + rand() * 14,
      tone: Math.floor(rand() * 3),
      depth,
    };
  });
}

export function makeRaindrops(seed = 20260521) {
  const rand = seeded(seed);
  const drop = (far) => ({
    left: rand() * 100,
    height: far ? 16 + rand() * 14 : 30 + rand() * 30,
    duration: far ? 2.8 + rand() * 1.8 : 1.9 + rand() * 1.2,
    delay: -rand() * 4,
    opacity: far ? 0.12 + rand() * 0.1 : 0.2 + rand() * 0.22,
    far,
  });
  return [...Array.from({ length: 55 }, () => drop(true)), ...Array.from({ length: 35 }, () => drop(false))];
}

export function makeStarfield(count = 46, seed = 5150) {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => ({
    left: rand() * 100,
    top: rand() * 68,
    size: 1 + rand() * 1.4,
    opacity: 0.12 + rand() * 0.38,
    twinkle: 3 + rand() * 4,
    delay: -rand() * 6,
  }));
}

/**
 * One shooting star. Three profiles — a faint lone streak, a brighter one, and
 * a rare long meteor — chosen at random, because a sky with only one kind of
 * streak reads as a screensaver.
 */
export function makeStar(rand = Math.random) {
  const roll = rand();
  const profile =
    roll < 0.65
      ? { width: 30 + rand() * 40, duration: 0.5 + rand() * 0.4, glow: 1 + rand() * 2, opacity: 0.12 + rand() * 0.14, color: '255, 255, 255' }
      : roll < 0.95
        ? { width: 80 + rand() * 60, duration: 0.9 + rand() * 0.6, glow: 4 + rand() * 4, opacity: 0.3 + rand() * 0.22, color: '220, 230, 255' }
        : { width: 170 + rand() * 140, duration: 1.6 + rand() * 1.3, glow: 14 + rand() * 10, opacity: 0.62 + rand() * 0.18, color: '255, 230, 200' };
  const angle = 10 + rand() * 35;
  const distance = 760 + rand() * 380;
  return {
    left: rand() * 90 - 10,
    top: rand() * 55 - 10,
    angle,
    travelX: distance * Math.cos((angle * Math.PI) / 180),
    travelY: distance * Math.sin((angle * Math.PI) / 180),
    delayMs: 0,
    ...profile,
  };
}

/**
 * Apply a particle's numbers to its element. Values may be plain CSS numbers
 * (`left`, `opacity`) or custom properties (`--dur`), which is how the
 * keyframes read them.
 */
function applyVars(node, vars) {
  for (const [name, value] of vars) {
    node.style.setProperty(name, String(value));
  }
}

function span(className, vars) {
  const node = document.createElement('span');
  node.className = className;
  applyVars(node, vars);
  return node;
}

/**
 * Build the atmosphere element for `environment`. Meteors are not spawned here
 * — the view shows them when it wants to (see `spawnMeteors()`), so a paused
 * screen has none.
 */
export function renderAtmosphere(environment = 'woodland') {
  const layer = document.createElement('div');
  layer.className = 'focus-atmosphere-layer';
  layer.dataset.environment = environment;
  layer.setAttribute('aria-hidden', 'true');

  const glow = document.createElement('div');
  glow.className = 'focus-glow';
  glow.innerHTML = '<div class="focus-glow-inner"></div>';
  layer.appendChild(glow);

  if (environment === 'rain') {
    const veil = document.createElement('div');
    veil.className = 'rain-veil';
    for (const drop of makeRaindrops()) {
      veil.appendChild(
        span(`rain-drop${drop.far ? ' layer-far' : ''}`, [
          ['left', `${drop.left}%`],
          ['height', `${drop.height}px`],
          ['--dur', `${drop.duration}s`],
          ['--delay', `${drop.delay}s`],
          ['opacity', drop.opacity],
        ]),
      );
    }
    const mist = document.createElement('div');
    mist.className = 'rain-mist';
    mist.innerHTML = '<span class="mist-band"></span><span class="mist-band b"></span>';
    veil.appendChild(mist);
    layer.appendChild(veil);
  }

  if (environment === 'woodland') {
    const veil = document.createElement('div');
    veil.className = 'leaf-veil';
    for (const leaf of makeLeaves()) {
      veil.appendChild(
        span(`particle-leaf tone-${'abc'[leaf.tone]} depth-${leaf.depth}`, [
          ['--sx', `${leaf.left}vw`],
          ['--ex', `${leaf.drift}vw`],
          ['--sway', `${leaf.sway}px`],
          ['--dur', `${leaf.duration * 11}s`],
          ['--op', String(leaf.opacity)],
          ['--rot', `${leaf.rotation}deg`],
          ['width', `${leaf.size}px`],
          ['height', `${leaf.size}px`],
          ['--delay', `${-leaf.duration * 9}s`],
        ]),
      );
    }
    layer.appendChild(veil);
  }

  if (environment === 'night') {
    const sky = document.createElement('div');
    sky.className = 'night-sky';
    for (const dot of makeStarfield()) {
      sky.appendChild(
        span('star-dot', [
          ['left', `${dot.left}%`],
          ['top', `${dot.top}%`],
          ['width', `${dot.size}px`],
          ['height', `${dot.size}px`],
          ['--tw-op', String(dot.opacity)],
          ['--tw-dur', `${dot.twinkle}s`],
          ['--tw-delay', `${dot.delay}s`],
        ]),
      );
    }
    layer.appendChild(sky);
  }

  return layer;
}

/**
 * Show `count` meteors in a night sky, staggered slightly so a shower reads as
 * a shower. Returns a teardown that removes them.
 */
export function spawnMeteors(sky, count = 1, rand = Math.random) {
  if (!sky) return () => {};
  const nodes = [];
  let longest = 0;
  for (let index = 0; index < count; index += 1) {
    const star = makeStar(rand);
    if (index > 0) {
      star.left = Math.min(92, star.left + index * (4 + rand() * 6));
      star.top = Math.min(48, star.top + index * (1 + rand() * 3));
      star.delayMs = index * (90 + rand() * 220);
    }
    longest = Math.max(longest, star.delayMs + star.duration * 1000);
    const node = span('shooting-star', [
      ['left', `${star.left}%`],
      ['top', `${star.top}%`],
      ['animation-delay', `${star.delayMs}ms`],
      ['--star-width', `${star.width}px`],
      ['--star-duration', `${star.duration}s`],
      ['--star-glow', `${star.glow}px`],
      ['--star-opacity', String(star.opacity)],
      ['--star-angle', `${star.angle}deg`],
      ['--star-travel-x', `${star.travelX}px`],
      ['--star-travel-y', `${star.travelY}px`],
    ]);
    sky.appendChild(node);
    nodes.push(node);
  }
  const timer = setTimeout(() => nodes.forEach((node) => node.remove()), longest + 400);
  return () => {
    clearTimeout(timer);
    nodes.forEach((node) => node.remove());
  };
}
