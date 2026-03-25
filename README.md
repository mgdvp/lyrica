# 🎵 Lyrica Studio

Lyrica Studio is a powerful, modern, fully browser-based application designed to help you create stunning lyric videos effortlessly. With real-time canvas rendering, customizable text animations, and direct video exporting, producing your next music video has never been this simple.

## ✨ Features

- **📂 Asset Management**: Easily upload your audio tracks (`.mp3`, `.wav`), timed lyric files (`.lrc`, `.txt`), and custom background images directly into the browser.
- **🎛️ Format Controls**: Choose your desired export quality. Supports multiple resolutions including 720p, 1080p, 1440p, and 4K (UHD). Adjust framerates (24, 30, 60 FPS) and flexible bitrates for optimal quality.
- **🎨 Visual Styling**:
  - Extensive built-in typography options curated for different vibes (Modern, Hip-Hop, Cinematic, Emotional).
  - Modern color picker with quick swatches and a custom color tool.
  - Granular control over font styles, sizing, and shadowing.
  - Option to preview the "upcoming" lyric line.
- **🎬 Advanced Transitions**: Over 15+ complex motion typography effects carefully built-in (e.g., Slingshot, Neon Flicker, Gravity Drop, Shatter In, Kinetic Fly In). Adjustable transition durations.
- **⏱️ Interactive Timeline**: A highly responsive, visual playback timeline with drag-and-scrub support for precise previewing.
- **💾 Direct Export**: Uses native browser APIs to map Canvas rendering and Web Audio directly to video, outputting a highly detailed `.webm` file straight to your local machine—no server required!

## 🚀 How to Use

1. **Open the App**: Simply open `index.html` in a modern web browser.
2. **Upload Assets**: Navigate to the `1. Assets` panel on the left sidebar. Add your song, your generated `.lrc` file, and an aesthetically pleasing background image.
3. **Customize Render**: Tweak the `Format` and `Visual Style` panels to get your text animations and resolution looking perfect. Use the scrubber at the bottom to preview how effects trigger to the beat.
4. **Hit Record**: Click the **Export Video** button at the top right. The app will play through your song in real-time, render the visuals on the fly, and download the finished video when complete.

## 🛠️ Technology Stack

- **HTML5 & CSS3**: Modern layouts using Flexbox and Grid, with vanilla CSS custom properties (variables) for consistent theming. 
- **Vanilla JavaScript (ES6)**: Clean, module-free scripting for performance.
- **HTML5 Canvas API**: Used as the primary rendering engine for dynamic text tracking and frame-by-frame visual effects plotting.
- **Web Audio API**: Handles audio routing, extraction, and sync.
- **MediaStream Recording API**: Captures the visual Canvas stream and the combined audio stream to encode video locally inside the browser.

## 📝 License

Designed and coded with a focus on ease-of-use and the ultimate developer vibe. 

---
*Created playfully for the next generation of visual audio content!*
