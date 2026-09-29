#!/usr/bin/env python3
"""Measure the beat grid of a track: python3 tools/beats.py track.wav [beats.json]"""
import json, sys
import librosa

src = sys.argv[1]
dst = sys.argv[2] if len(sys.argv) > 2 else "beats.json"
y, sr = librosa.load(src, sr=None, mono=True)
tempo, frames = librosa.beat.beat_track(y=y, sr=sr)
onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
out = {
    "source": src,
    "tempo": float(tempo if not hasattr(tempo, "__len__") else tempo[0]),
    "beats": [round(float(t), 4) for t in librosa.frames_to_time(frames, sr=sr)],
    "onsets": [round(float(t), 4) for t in onsets],
    "duration": round(len(y) / sr, 4),
}
json.dump(out, open(dst, "w"), indent=2)
print(f"{dst}: {out['tempo']:.1f} BPM, {len(out['beats'])} beats, {len(out['onsets'])} onsets")
