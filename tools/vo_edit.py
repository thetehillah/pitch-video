#!/usr/bin/env python3
"""Clean and tighten the voiceover, then write the edit timeline every scene reads.

python3 tools/vo_edit.py raw_vo.m4a terratrail/script.json terratrail/audio/align.json terratrail

Writes <out>/audio/vo.wav (48 kHz mono, cleaned, long pauses shortened, -16 LUFS) and
<out>/timeline.js (window.TIMELINE: per-scene start/duration, caption cues and word times, scene-local).
"""
import json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
from align import tokens  # noqa: E402

SR = 48000
LEAD_IN = 1.6          # silence before the first word: the scene 1 clutter starts building first
MAX_GAP_WORD = 0.45    # longest pause kept inside a sentence
MAX_GAP_LINE = 0.6     # between sentences in one scene
MAX_GAP_SCENE = 0.9    # between scenes, lets the visuals breathe
SCENE_LEAD = 0.5       # a scene's visuals start this long before its first word
VISUAL_BEAT = {3: 1.4, 12: 0.8}  # extra silence before these scenes' first word (clutter exit, closing beat)
CAPTION_MAX_CHARS = 62
FADE = 0.012           # crossfade at each cut, always inside silence
END_LINGER = 1.2       # scene 12: closing line holds before the end card
END_TRANSITION = 0.8
END_HOLD = 3.0


def clean(src, dst):
    """Denoise, high-pass and gently compress; loudness is set later."""
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-ar', str(SR), '-af',
                    'highpass=f=80,afftdn=nf=-42:tn=1,'
                    'acompressor=threshold=-24dB:ratio=2.5:attack=8:release=120:makeup=2', dst], check=True)


def loudnorm(src, dst, target='I=-16:TP=-1.5:LRA=9'):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', f'loudnorm={target}:print_format=json',
                        '-f', 'null', '-'], capture_output=True, text=True, check=True)
    m = json.loads(r.stderr[r.stderr.rindex('{'):])
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af',
                    f"loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
                    f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
                    f":offset={m['target_offset']}:linear=true", '-ar', str(SR), dst], check=True)


def main(raw, script_path, align_path, out_dir):
    script = json.load(open(script_path))
    words = json.load(open(align_path))

    # Tag each aligned word with its scene, line and display word.
    tagged, i, di = [], 0, 0
    for s in script:
        for li, line in enumerate(s['lines']):
            for disp in line.split():
                for _ in tokens(disp):
                    w = dict(words[i]); i += 1
                    w.update(scene=s['scene'], line=li, disp=disp, di=di)
                    tagged.append(w)
                di += 1
    assert i == len(words), f'script has {i} tokens, alignment has {len(words)}'

    # Keep-segments: everything, with long pauses shortened from the middle.
    # Each keep is (src_start, src_end, silence_after); silence pads a pause that is too short.
    keeps = []
    cur = max(0.0, tagged[0]['start'] - 0.15)
    for a, b in zip(tagged, tagged[1:]):
        gap = b['start'] - a['end']
        new_scene = a['scene'] != b['scene']
        limit = (MAX_GAP_SCENE + VISUAL_BEAT.get(b['scene'], 0) if new_scene else
                 MAX_GAP_LINE if a['line'] != b['line'] else MAX_GAP_WORD)
        if gap > limit:
            half = limit / 2
            keeps.append((cur, a['end'] + half, 0.0))
            cur = b['start'] - half
        elif new_scene and b['scene'] in VISUAL_BEAT:
            keeps.append((cur, a['end'] + gap / 2, limit - gap))
            cur = a['end'] + gap / 2
    keeps.append((cur, tagged[-1]['end'] + 0.35, 0.0))

    def remap(t):  # source time -> edited time
        acc = LEAD_IN
        for s, e, pad in keeps:
            if t <= e:
                return acc + max(0.0, t - s)
            acc += e - s + pad
        return acc

    with tempfile.TemporaryDirectory() as tmp:
        cleaned = os.path.join(tmp, 'clean.wav')
        clean(raw, cleaned)
        y, sr = sf.read(cleaned)
        n = int(FADE * sr)
        ramp = np.linspace(0, 1, n)
        parts = [np.zeros(int(LEAD_IN * sr))]
        for s, e, pad in keeps:
            seg = y[int(s * sr):int(e * sr)].copy()
            seg[:n] *= ramp
            seg[-n:] *= ramp[::-1]
            parts += [seg, np.zeros(int(pad * sr))]
        cut = os.path.join(tmp, 'cut.wav')
        sf.write(cut, np.concatenate(parts), sr)
        os.makedirs(os.path.join(out_dir, 'audio'), exist_ok=True)
        loudnorm(cut, os.path.join(out_dir, 'audio', 'vo.wav'))

    for w in tagged:
        w['start'], w['end'] = round(remap(w['start']), 3), round(remap(w['end']), 3)

    # Scene windows.
    scenes = {}
    ids = [s['scene'] for s in script]
    for k, sid in enumerate(ids):
        ws = [w for w in tagged if w['scene'] == sid]
        if k == 0:
            start = 0.0
        else:
            prev_end = max(w['end'] for w in tagged if w['scene'] == ids[k - 1])
            start = max(prev_end + 0.15, ws[0]['start'] - SCENE_LEAD - VISUAL_BEAT.get(sid, 0))
        scenes[sid] = {'start': round(start, 3), 'words': ws}
    for k, sid in enumerate(ids):
        if k + 1 < len(ids):
            end = scenes[ids[k + 1]]['start']
        else:
            end = scenes[sid]['words'][-1]['end'] + END_LINGER + END_TRANSITION + END_HOLD
        scenes[sid]['duration'] = round(end - scenes[sid]['start'], 3)

    # Captions: one cue per script line, long lines split at a comma or word boundary near the middle.
    def chunks(line_words):
        text = ' '.join(w['disp'] for w in dedupe(line_words))
        if len(text) <= CAPTION_MAX_CHARS:
            return [line_words]
        disp = dedupe(line_words)
        best, best_score = 1, 1e9
        for j in range(1, len(disp)):
            left = ' '.join(d['disp'] for d in disp[:j])
            score = abs(len(left) - len(text) / 2) - (25 if left.endswith(',') else 0)
            if score < best_score:
                best, best_score = j, score
        cut_disp = disp[best]
        idx = next(i for i, w in enumerate(line_words) if w is cut_disp)
        return chunks(line_words[:idx]) + chunks(line_words[idx:])

    def dedupe(ws):  # one entry per display word ("5,000" aligns as two tokens)
        return [w for k, w in enumerate(ws) if k == 0 or ws[k - 1]['di'] != w['di']]

    timeline = {'total': 0, 'vo': 'audio/vo.wav', 'scenes': {}}
    for sid in ids:
        sc = scenes[sid]
        s0 = sc['start']
        cues = []
        if sid != 12:  # scene 12 shows its line full-size on screen; a caption would duplicate it
            lines = sorted({w['line'] for w in sc['words']})
            for li in lines:
                for ch in chunks([w for w in sc['words'] if w['line'] == li]):
                    cues.append({'start': ch[0]['start'] - 0.1, 'last': ch[-1]['end'],
                                 'text': ' '.join(w['disp'] for w in dedupe(ch))})
            for a, b in zip(cues, cues[1:]):
                a['end'] = b['start'] if b['start'] - a['last'] < 1.2 else a['last'] + 0.4
            cues[-1]['end'] = min(cues[-1]['last'] + 0.6, s0 + sc['duration'])
        timeline['scenes'][sid] = {
            'start': s0, 'duration': sc['duration'],
            'cues': [{'start': round(c['start'] - s0, 3), 'end': round(c['end'] - s0, 3), 'text': c['text']}
                     for c in cues],
            'words': [{'w': w['word'], 'start': round(w['start'] - s0, 3), 'end': round(w['end'] - s0, 3)}
                      for w in sc['words']],
        }
    last = timeline['scenes'][ids[-1]]
    timeline['total'] = round(last['start'] + last['duration'], 3)
    with open(os.path.join(out_dir, 'timeline.js'), 'w') as f:
        f.write('// Generated by tools/vo_edit.py from the voiceover alignment. Do not edit by hand.\n')
        f.write('window.TIMELINE = ' + json.dumps(timeline, indent=1, ensure_ascii=False) + ';\n')

    print(f"total {timeline['total']:.2f}s")
    for sid in ids:
        s = timeline['scenes'][sid]
        print(f"  scene {sid:>2}: {s['start']:7.2f} +{s['duration']:6.2f}  {len(s['cues'])} cues")


if __name__ == '__main__':
    main(*sys.argv[1:5])
