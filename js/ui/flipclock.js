/**
 * flipclock.js — the split-flap clock at the centre of the Study Timer.
 *
 * Two digits per unit, each a pair of static halves (`.flip-half.top` and
 * `.flip-half.bottom`) holding the current value, plus two transient
 * `.flip-flap` halves that perform the physical flip when the value changes.
 * The animation itself lives in css/app.css (`flipTop`/`flipBottom`, 300 ms +
 * 300 ms staged rotateX); this module only builds the DOM and decides *when*
 * to animate.
 *
 * It is deliberate about three things:
 *
 *  - **Only changed digits flip.** Ticking 00:59 → 01:00 must flip three
 *    digits, not six, and a paused clock must never flip at all.
 *  - **Structure changes snap.** Going 59:59 → 1:00:00 adds an hours group;
 *    repainting instantly there is the difference between a clock and a glitch.
 *  - **It is a live widget, not a re-rendered string.** The router repaints a
 *    screen on every refresh; a clock that was rebuilt from scratch would lose
 *    the value it compares against and stop animating mid-session. So the
 *    element is built once, `setTime()` is called every tick, and mounting a
 *    fresh tree simply resets the comparison.
 */

const DIGITS = ['h1', 'h0', 'm1', 'm0', 's1', 's0'];
/** Total flip time: 300 ms top flap + 300 ms bottom flap (see css/app.css). */
const FLAP_MS = 600;

/** Split a duration into the two-digit groups the clock shows. */
function clockParts(totalSeconds) {
  const total = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return {
    showHours: hours > 0,
    digits: hours > 0 ? `${pad(hours)}${pad(minutes)}${pad(seconds)}` : `${pad(minutes)}${pad(seconds)}`,
    text: hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`,
  };
}

/**
 * Everything that moves for one flip. Exported so the tests can assert the
 * *behaviour* (which digits flip, when, and in what order) without a browser
 * layout engine.
 */
export class FlipClock {
  /**
   * @param {{ label?: string }} options  `label` describes the clock to a
   *   screen reader; the value itself is announced by the caller, not per tick.
   */
  constructor({ label = 'Timer' } = {}) {
    this.label = label;
    this.root = null;
    this.handles = new Map();
    this.rendered = '';
    this.timeout = null;
  }

  /** Build the element. Called by the view's `mount()`; safe to call once. */
  render() {
    const root = document.createElement('div');
    root.className = 'flip-clock';
    root.setAttribute('role', 'timer');
    root.setAttribute('aria-live', 'off');
    root.setAttribute('aria-label', this.label);
    root.innerHTML = this.markup();
    this.root = root;
    DIGITS.forEach((id) => this.bind(root, id));
    return root;
  }

  markup() {
    // One `.flip-group` per unit, holding that unit's two digits directly. The
    // hours group carries `data-group="hours"` and starts hidden, so the clock
    // is a four-digit face until a block passes an hour and needs six.
    const digits = (ids) => ids.map((id) => `
      <div class="flip-digit" data-digit="${id}" aria-hidden="true">
        <div class="flip-half top"><div class="val">0</div></div>
        <div class="flip-half bottom"><div class="val">0</div></div>
      </div>`).join('');
    return [
      `<div class="flip-group" data-group="hours" hidden>${digits(['h1', 'h0'])}</div>`,
      `<span class="flip-colon" data-colon="hours" aria-hidden="true" hidden>:</span>`,
      `<div class="flip-group" data-group="minutes">${digits(['m1', 'm0'])}</div>`,
      `<span class="flip-colon" aria-hidden="true">:</span>`,
      `<div class="flip-group" data-group="seconds">${digits(['s1', 's0'])}</div>`,
    ].join('');
  }

  bind(root, id) {
    const node = root.querySelector(`[data-digit="${id}"]`);
    if (!node) return;
    this.handles.set(id, {
      root: node,
      top: node.querySelector('.flip-half.top .val'),
      bottom: node.querySelector('.flip-half.bottom .val'),
      value: '',
      timeout: null,
    });
  }

  /**
   * Show `totalSeconds`. `animate` is false while paused and on the first
   * paint, so a resumed session does not flip every digit at once.
   */
  setTime(totalSeconds, animate = false) {
    if (!this.root) return;
    const { digits, showHours } = clockParts(totalSeconds);

    // Hours appear/disappear: repaint the whole clock without animating.
    const hoursGroup = this.root.querySelector('[data-group="hours"]');
    const hoursColon = this.root.querySelector('[data-colon="hours"]');
    if (hoursGroup) hoursGroup.hidden = !showHours;
    if (hoursColon) hoursColon.hidden = !showHours;
    this.root.classList.toggle('with-hours', showHours);

    const structural = this.rendered.length !== digits.length;
    const ids = showHours ? DIGITS : DIGITS.slice(2);
    ids.forEach((id, index) => {
      const next = digits[index] ?? '0';
      const handle = this.handles.get(id);
      if (!handle) return;
      if (structural || !animate || handle.value === '' || handle.value === next) {
        this.snap(handle, next);
      } else {
        this.flip(handle, next);
      }
    });
    this.rendered = digits;
    this.root.setAttribute('aria-label', `${this.label}: ${clockParts(totalSeconds).text}`);
  }

  /** Set a digit with no motion. */
  snap(handle, value) {
    if (handle.timeout) {
      clearTimeout(handle.timeout);
      handle.timeout = null;
    }
    handle.root.querySelectorAll('.flip-flap').forEach((node) => node.remove());
    handle.top.textContent = value;
    handle.bottom.textContent = value;
    handle.value = value;
  }

  /**
   * The physical flip: the outgoing value rides the falling top flap while the
   * incoming value rises on the bottom flap; the static halves underneath
   * already hold the target, so the seam is never empty.
   */
  flip(handle, value) {
    const previous = handle.value;
    handle.value = value;
    if (handle.timeout) {
      clearTimeout(handle.timeout);
      handle.timeout = null;
    }
    handle.root.querySelectorAll('.flip-flap').forEach((node) => node.remove());

    handle.top.textContent = value;
    handle.bottom.textContent = previous;

    const topFlap = document.createElement('div');
    topFlap.className = 'flip-half top flip-flap';
    topFlap.innerHTML = `<div class="val">${previous}</div>`;
    const bottomFlap = document.createElement('div');
    bottomFlap.className = 'flip-half bottom flip-flap';
    bottomFlap.innerHTML = `<div class="val">${value}</div>`;
    handle.root.appendChild(topFlap);
    handle.root.appendChild(bottomFlap);

    handle.timeout = setTimeout(() => {
      handle.bottom.textContent = value;
      topFlap.remove();
      bottomFlap.remove();
      handle.timeout = null;
    }, FLAP_MS);
  }

  /** Drop every pending flap timer (the screen is being torn down). */
  destroy() {
    for (const handle of this.handles.values()) {
      if (handle.timeout) clearTimeout(handle.timeout);
    }
    this.handles.clear();
    this.root = null;
  }
}

/**
 * Plain markup for the static placeholder a screen paints before its `mount()`
 * runs. It is the same four-digit face the live clock starts with, so the stage
 * does not change size when the real clock replaces it.
 */
export function flipClockSkeleton() {
  const digits = () =>
    '<div class="flip-digit"><div class="flip-half top"><div class="val">0</div></div><div class="flip-half bottom"><div class="val">0</div></div></div>'.repeat(2);
  return `<div class="flip-clock is-placeholder" aria-hidden="true">
    <div class="flip-group">${digits()}</div>
    <span class="flip-colon">:</span>
    <div class="flip-group">${digits()}</div>
  </div>`;
}
