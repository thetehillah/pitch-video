#!/usr/bin/env node
// Usage: node render.js scenes/<name>.html [--fps 60] [--out out/<name>.mp4]
// Seeks the scene frame-by-frame (no real-time playback), screenshots each frame, pipes PNGs into ffmpeg.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const scenePath = path.resolve(args[0] || 'scenes/circle-to-pill.html');
const name = path.basename(scenePath, '.html');
const fps = Number(opt('--fps', 60));
const out = path.resolve(opt('--out', `out/${name}.mp4`));
const W = Number(opt('--width', 1920)), H = Number(opt('--height', 1080));

(async () => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto('file://' + scenePath);
  const duration = await page.evaluate(() => window.scene.duration);
  const frames = Math.round(duration * fps);

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps),
    '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });

  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.scene.renderFrame(t), i / fps);
    const png = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg exit ' + c)))));
  await browser.close();
  console.log(`${out}  ${frames} frames @ ${fps}fps (${duration}s)`);
})().catch((e) => { console.error(e); process.exit(1); });
