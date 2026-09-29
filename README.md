# pitch-video — motion design studio

Scenes are HTML pages rendered frame-by-frame in headless Chromium (Playwright) and encoded with ffmpeg.

```sh
npm install                      # playwright@1.56.1 (matches preinstalled Chromium 1194)
sudo apt-get install -y ffmpeg
node render.js scenes/circle-to-pill.html --fps 60   # -> out/circle-to-pill.mp4
```

A scene sets `window.scene = { duration, renderFrame(t) }`. The renderer seeks each frame explicitly,
so output is deterministic regardless of machine speed. `lib/spring.js` is a closed-form damped spring.
