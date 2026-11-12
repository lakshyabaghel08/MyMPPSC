/**
 * focus-atmosphere.js — the Study Timer's two visual atmospheres.
 *
 * Woodland follows the app's light theme; Night follows dark. The palette and
 * motion are ported from the supplied Witherwood reference: slow drifting
 * leaves, a quiet starfield and occasional glowing meteors. There is no
 * independent atmosphere or clock-face selector.
 *
 * Particles are seeded once per mount, animated by CSS, aria-hidden and
 * click-through. Their individual numbers are written through the CSSOM after
 * parsing (never as inline style attributes in the source).
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

export function makeLeaves(count = 18, seed = 7717) {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => {
    const depth = Math.floor(rand() * 3); // 0 far → 2 near
    const scale = depth === 0 ? 0.7 : depth === 2 ? 1.15 : 1;
    return {
      left: rand() * 100,
      size: (4 + rand() * 3) * scale,
      duration: (20 + rand() * 25) * (depth === 0 ? 1.2 : depth === 2 ? 0.85 : 1),
      delay: -rand() * 4,
      opacity: (0.25 + rand() * 0.35) * (depth === 0 ? 0.65 : 1),
      drift: (rand() - 0.5) * 160,
      rotation: 360 + rand() * 720,
      sway: 8 + rand() * 14,
      tone: Math.floor(rand() * 3),
      depth,
    };
  });
}

export function makeStarfield(count = 46, seed = 5150) {
  const rand = seeded(seed);
  return Array.from({ length: count }, () => ({
    left: rand() * 100,
    top: rand() * 100,
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
      ? { width: 30 + rand() * 40, duration: 0.5 + rand() * 0.4, glow: 1 + rand() * 2, opacity: 0.12 + rand() * 0.14, tone: 'white' }
      : roll < 0.95
        ? { width: 80 + rand() * 60, duration: 0.9 + rand() * 0.6, glow: 4 + rand() * 4, opacity: 0.3 + rand() * 0.22, tone: 'blue' }
        : { width: 170 + rand() * 140, duration: 1.6 + rand() * 1.3, glow: 14 + rand() * 10, opacity: 0.62 + rand() * 0.18, tone: 'warm' };
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
  if (environment !== 'night') environment = 'woodland';
  const layer = document.createElement('div');
  layer.className = 'focus-atmosphere-layer';
  layer.dataset.environment = environment;
  layer.setAttribute('aria-hidden', 'true');

  const glow = document.createElement('div');
  glow.className = 'focus-glow';
  glow.innerHTML = '<div class="focus-glow-inner"></div>';
  layer.appendChild(glow);

  if (environment === 'woodland') {
    const veil = document.createElement('div');
    veil.className = 'leaf-veil';
    for (const leaf of makeLeaves()) {
      veil.appendChild(
        span(`particle-leaf tone-${'abc'[leaf.tone]} depth-${leaf.depth}`, [
          ['--left', `${leaf.left}%`],
          ['--drift', `${leaf.drift}px`],
          ['--sway', `${leaf.sway}px`],
          ['--dur', `${leaf.duration}s`],
          ['--op', String(leaf.opacity)],
          ['--rot', `${leaf.rotation}deg`],
          ['width', `${leaf.size}px`],
          ['height', `${leaf.size}px`],
          ['--delay', `${leaf.delay * 7}s`],
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
    const node = span(`shooting-star star-${star.tone}`, [
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
