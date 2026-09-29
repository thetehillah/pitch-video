#!/usr/bin/env node
// node render.mjs scenes/<name>.html [--fps 60] [--out out/<name>.mp4] [--audio track.wav]
// node render.mjs scenes/<name>.html --contact [--beats beats.json]   -> out/<name>.contact.png
//
// A scene defines window.DURATION and window.seek(t). Each frame is seeked explicitly and screenshotted,
// so output is a pure function of time. In render mode, Math.random, timers, rAF and CSS
// transitions/animations are disabled so non-deterministic code fails loudly instead of flickering.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(name);
const scenePath = path.resolve(args[0] || 'scenes/circle-to-pill.html');
const name = path.basename(scenePath, '.html');
const fps = Number(opt('--fps', 60));
const W = Number(opt('--width', 1920)), H = Number(opt('--height', 1080));
const audio = opt('--audio');
const out = path.resolve(opt('--out', `out/${name}.${flag('--contact') ? 'contact.png' : 'mp4'}`));

const RENDER_MODE = `
  window.__RENDER__ = true;
  const banned = (n) => () => { throw new Error(n + ' is not allowed in render mode'); };
  Math.random = banned('Math.random (use mulberry32)');
  window.setTimeout = banned('setTimeout');
  window.setInterval = banned('setInterval');
  window.requestAnimationFrame = banned('requestAnimationFrame');
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
    document.head.appendChild(s);
  });
`;

const run = (cmd, argv, opts = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, argv, { stdio: ['pipe', 'inherit', 'inherit'], ...opts });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exit ${c}`))));
  if (opts.feed) opts.feed(p.stdin);
});

// Two-pass EBU R128 normalisation to -14 LUFS / -1 dBTP: measure, then apply with the measured values.
async function loudnormFilter(file) {
  const target = 'I=-14:TP=-1:LRA=11';
  const log = await new Promise((res, rej) => {
    let err = '';
    const p = spawn('ffmpeg', ['-hide_banner', '-i', file, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? res(err) : rej(new Error('loudness measure failed\n' + err))));
  });
  const m = JSON.parse(log.slice(log.lastIndexOf('{')));
  return `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(RENDER_MODE);
  await page.goto('file://' + scenePath + '?render=1');
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => window.DURATION);
  if (typeof duration !== 'number' || !(await page.evaluate(() => typeof window.seek === 'function')))
    throw new Error('scene must define window.DURATION (number) and window.seek(t)');

  const shoot = async (t) => {
    await page.evaluate((t) => window.seek(t), t);
    if (errors.length) throw new Error(errors.join('\n'));
    return page.screenshot({ type: 'png' });
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });

  if (flag('--contact')) {
    // One frame per beat (beats.json: {"beats":[seconds...]}) or every 0.5s, tiled 4 wide at 480px.
    const beatsFile = opt('--beats', fs.existsSync('beats.json') ? 'beats.json' : null);
    let times = beatsFile ? JSON.parse(fs.readFileSync(beatsFile, 'utf8')).beats.filter((b) => b < duration) : [];
    if (!times.length) for (let t = 0; t < duration; t += 0.5) times.push(t);
    times.push(duration - 1 / fps);
    const tmp = fs.mkdtempSync(path.join(path.dirname(out), '.contact-'));
    for (const [i, t] of times.entries())
      fs.writeFileSync(path.join(tmp, `${String(i).padStart(4, '0')}.png`), await shoot(t));
    const cols = 4, rows = Math.ceil(times.length / cols);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(tmp, '%04d.png'),
      '-vf', `scale=480:-1,tile=${cols}x${rows}:padding=8:color=gray`, '-frames:v', '1', out]);
    fs.rmSync(tmp, { recursive: true });
    console.log(`${out}  ${times.length} frames at t=${times.map((t) => t.toFixed(2)).join(', ')}`);
  } else {
    const frames = Math.round(duration * fps);
    const argv = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
    if (audio) argv.push('-i', audio, '-af', await loudnormFilter(audio), '-c:a', 'aac', '-b:a', '256k', '-shortest');
    argv.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart', out);
    await run('ffmpeg', argv, {
      feed: async (stdin) => {
        for (let i = 0; i < frames; i++) {
          if (!stdin.write(await shoot(i / fps))) await new Promise((r) => stdin.once('drain', r));
        }
        stdin.end();
      },
    });
    console.log(`${out}  ${frames} frames @ ${fps}fps (${duration}s)${audio ? ' + audio @ -14 LUFS' : ''}`);
  }
} finally {
  await browser.close();
}
