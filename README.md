# pitch-video — motion design studio

Scenes are HTML pages rendered frame-by-frame in headless Chromium (Playwright) and encoded with ffmpeg.
See `CLAUDE.md` for the render contract and studio rules.

```sh
npm install                              # playwright@1.56.1 (matches preinstalled Chromium 1194)
sudo apt-get install -y ffmpeg           # brew install ffmpeg on macOS
pip install numpy librosa soundfile

node render.mjs scenes/circle-to-pill.html                    # -> out/circle-to-pill.mp4
node render.mjs scenes/circle-to-pill.html --contact          # -> out/circle-to-pill.contact.png
node render.mjs scenes/x.html --audio track.wav               # mux audio, normalised to -14 LUFS
python3 tools/beats.py track.wav                              # -> beats.json (tempo, beats, onsets)
```
