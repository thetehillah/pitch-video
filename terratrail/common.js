// Shared helpers for Terratrail scenes. Everything is a pure function of t (seconds).

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
// Progress of t through [start, start + dur], 0..1.
const prog = (t, start, dur) => clamp((t - start) / dur);

// Restrained easing only: no overshoot, no bounce.
const ease = {
  out: (p) => 1 - Math.pow(1 - p, 3),
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  in: (p) => p * p * p,
  expoOut: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
};

function el(tag, attrs = {}, parent) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') Object.assign(e.style, v);
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

// Captions: [{start, end, text}] in scene-local seconds. Timings are placeholders until the voiceover
// is recorded; they get re-cut to the real audio.
function setCaption(t, cues) {
  const cap = document.getElementById('caption');
  const cue = cues.find((c) => t >= c.start && t < c.end);
  const text = cue ? cue.text : '';
  if (cap.textContent !== text) cap.textContent = text;
}

// Naira formatting: ₦1,250,000
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-US');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
