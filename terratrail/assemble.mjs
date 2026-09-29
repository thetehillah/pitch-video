#!/usr/bin/env node
// Render Terratrail scenes on the voice timeline and cut them together with the voiceover.
//   node terratrail/assemble.mjs                 -> out/terratrail/terratrail-pitch.mp4 (all scenes)
//   node terratrail/assemble.mjs 1 2 3           -> preview of just those consecutive scenes
// Frame counts come from global scene boundaries (not per-scene rounding), so picture never drifts from audio.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const FPS = 30;
const here = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.resolve('out/terratrail');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(here, 'timeline.js'), 'utf8'), ctx);
const TL = ctx.window.TIMELINE;
const files = Object.fromEntries(fs.readdirSync(path.join(here, 'scenes'))
  .filter((f) => f.endsWith('.html')).map((f) => [Number(f.slice(0, 2)), f]));

const all = Object.keys(TL.scenes).map(Number).sort((a, b) => a - b);
const pick = process.argv.slice(2).map(Number);
const ids = pick.length ? pick : all;
const missing = ids.filter((id) => !files[id]);
if (missing.length) throw new Error(`no scene file yet for: ${missing.join(', ')}`);

fs.mkdirSync(outDir, { recursive: true });
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const clips = [];
for (const id of ids) {
  const s = TL.scenes[id];
  const frames = Math.round((s.start + s.duration) * FPS) - Math.round(s.start * FPS);
  const clip = path.join(outDir, `scene-${String(id).padStart(2, '0')}.mp4`);
  run('node', ['render.mjs', path.join(here, 'scenes', files[id]), '--fps', String(FPS),
    '--frames', String(frames), '--out', clip]);
  clips.push(clip);
}

const list = path.join(outDir, 'concat.txt');
fs.writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n'));
const t0 = Math.round(TL.scenes[ids[0]].start * FPS) / FPS;
const last = TL.scenes[ids[ids.length - 1]];
const t1 = Math.round((last.start + last.duration) * FPS) / FPS;
const name = pick.length ? `preview-${ids.join('-')}.mp4` : 'terratrail-pitch.mp4';
const out = path.join(outDir, name);
const music = path.join(here, 'audio', 'music.wav');
const inputs = ['-f', 'concat', '-safe', '0', '-i', list, '-ss', String(t0), '-t', String(t1 - t0),
  '-i', path.join(here, TL.vo)];
let filter = '[1:a]apad[vo]';
let mixOut = '[vo]';
if (fs.existsSync(music)) {
  inputs.push('-ss', String(t0), '-t', String(t1 - t0), '-i', music);
  filter += ';[2:a]volume=1[mu];[vo][mu]amix=inputs=2:normalize=0:duration=first[mix]';
  mixOut = '[mix]';
}
filter += `;${mixOut}loudnorm=I=-14:TP=-1:LRA=11,aresample=48000[a]`;
run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', String(t1 - t0), '-movflags', '+faststart', out]);
console.log(`${out}  ${(t1 - t0).toFixed(2)}s, scenes ${ids.join(', ')}`);
