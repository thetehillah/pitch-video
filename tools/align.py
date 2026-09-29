#!/usr/bin/env python3
"""Force-align a voiceover against the script with pocketsphinx (bundled en-us model, runs offline).

python3 tools/align.py vo.wav terratrail/script.json out.json
Output: [{"word", "start", "end"}] in seconds, in script order. Audio must be 16 kHz mono.
"""
import json, re, sys
import soundfile as sf
import numpy as np
from pocketsphinx import Decoder

# Pronunciations for words outside CMUdict (names, brands). Keys are lowercase spoken tokens.
EXTRA = {
    "terratrail": "T EH R AH T R EY L",
    "landrite": "L AE N D R AY T",
    "goe": "JH IY OW IY",
    "lumina": "L UW M IH N AH",
    "rehoboth": "R IH HH OW B AA TH",
    "redan": "R EH D AE N",
    "demilade": "D EH M IY L AA D EY",
    "whatsapp": "W AA T S AE P",
    "ai": "EY AY",
    "wahala": "W AA HH AA L AA",
}
NUMBERS = {"5,000": "five thousand", "30": "thirty"}


def tokens(text):
    for k, v in NUMBERS.items():
        text = text.replace(k, v)
    return [w for w in re.sub(r"[^a-z' ]", " ", text.lower()).split() if w]


def main(wav, script_path, out_path):
    script = json.load(open(script_path))
    words = [w for s in script for line in s["lines"] for w in tokens(line)]
    dec = Decoder(samprate=16000, bestpath=False)
    for w, ph in EXTRA.items():
        if dec.lookup_word(w) is None:
            dec.add_word(w, ph, True)
    missing = sorted({w for w in words if dec.lookup_word(w) is None})
    if missing:
        sys.exit(f"no pronunciation for: {missing}")
    y, sr = sf.read(wav, dtype="int16")
    assert sr == 16000 and y.ndim == 1, "need 16 kHz mono"
    dec.set_align_text(" ".join(words))
    dec.start_utt()
    dec.process_raw(y.tobytes(), full_utt=True)
    dec.end_utt()
    segs = [(s.word, s.start_frame / 100, (s.end_frame + 1) / 100) for s in dec.seg()]
    aligned = [{"word": w.split("(")[0], "start": round(a, 2), "end": round(b, 2)}
               for w, a, b in segs if w not in ("<s>", "</s>", "<sil>", "[NOISE]")]
    json.dump(aligned, open(out_path, "w"), indent=1)
    print(f"{len(aligned)}/{len(words)} words aligned, {aligned[0]['start']}s .. {aligned[-1]['end']}s")


if __name__ == "__main__":
    main(*sys.argv[1:4])
