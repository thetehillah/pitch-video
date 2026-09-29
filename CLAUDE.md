# Motion studio rules

## Render contract
- Every film is a pure function of time: a scene sets `window.DURATION` (seconds) and
  `window.seek(t)` paints frame t from scratch.
- No CSS transitions, no setTimeout, no requestAnimationFrame in render mode,
  no state carried between frames. Seeded noise only (`lib/rng.js` mulberry32), never Math.random.
  `render.mjs` enforces this: those APIs throw and CSS transitions/animations are disabled.
- Render with `node render.mjs scenes/<name>.html`; it encodes H.264 yuv420p, CRF 16, 60fps.
- Springs come from `lib/spring.js` (closed-form, depends only on t).

## Look
- Banned defaults: centered title on gradient, everything fading in,
  corner labels and frame borders, glow on UI chrome, generic particle bursts.
- One display face, one UI face. One accent color unless the brief says otherwise.
- Every 2 to 4 seconds something new must happen on screen.

## Sound
- Score and SFX are synthesized in code unless a track is supplied.
- Place hits on the measured beat grid: `python3 tools/beats.py track.wav` -> `beats.json`.
- Loudness -14 LUFS: `node render.mjs ... --audio track.wav` does two-pass EBU R128 loudnorm (-1 dBTP ceiling).

## Loop before you show me anything
1. Render one frame per beat as a contact sheet (`node render.mjs scenes/<name>.html --contact`,
   uses beats.json if present, else every 0.5s) and LOOK at it.
2. Score it 1-10 on: hook in first 2s, readability at phone size,
   motion quality, variety, brand accuracy, sound sync.
3. Fix the 3 worst problems. Repeat until every score is 8+.
4. Only then do the full render.
