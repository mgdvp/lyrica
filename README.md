# 🎵 Lyrica Studio

Fast, zero-server lyric video rendering directly in your browser. Drop your files, set the style, and export up to 4K 60FPS on the fly.

## ✨ Features

* **No Servers, No Waiting:** Renders and exports directly to a high-quality `.webm` locally.
* **Drag & Drop Assets:** Instantly load `.mp3`, `.wav`, `.lrc` files, and custom background images.
* **Granular Visuals:** 15+ complex kinetic typography effects (e.g., Slingshot, Shatter In, Kinetic Fly In), custom font styling, and upcoming lyric previews.
* **Pro-Grade Export:** Scale from 720p up to 4K (UHD) with adjustable framerates (24, 30, 60 FPS) and bitrates.
* **Interactive Timeline:** Drag-and-scrub visual timeline for precise effect syncing.

## 🚀 Quick Start

1.  **Open:** Run `index.html` in any modern browser.
2.  **Load:** Upload your audio track, timed `.lrc` file, and a background image in the Assets panel.
3.  **Style:** Dial in the vibe using the Format and Visual Style controls. Preview transitions on the timeline.
4.  **Render:** Hit **Export Video**. The app renders visuals to the beat in real-time and downloads the final cut.

## 🛠️ Performance Engine

Built strictly with vanilla web APIs for a lightweight footprint and aggressive performance.

* **Offscreen Canvas Caching:** Backgrounds are pre-scaled and dimmed on an offscreen buffer. This prevents the browser from recalculating image ratios 60 times per second, which is critical for 4K stability.
* **O(1) Lyric Sync:** Rather than searching through the entire lyric array every frame, the engine uses a state-aware pointer that increments only when the timestamp is reached.
* **Asset Pre-processing:** Text measurement and line wrapping are cached and only invalidated when the active lyric changes, saving massive CPU cycles.
* **Native Encoding:** Uses the **MediaStream Recording API** to capture the raw visual canvas stream and audio context for hardware-accelerated encoding.

## 📝 License

Built for performance. Coded for the culture.

---
*Created playfully for the next generation of visual audio content!*