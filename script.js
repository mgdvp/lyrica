// --- Elements ---
const inputs = {
    music: document.getElementById('musicInput'),
    lrc: document.getElementById('lrcInput'),
    image: document.getElementById('imageInput'),
    font: document.getElementById('fontSelect'),
    effect: document.getElementById('effectSelect'),
    color: document.getElementById('colorInput'),
    fps: document.getElementById('fpsSelect'),
    bitrate: document.getElementById('bitrateSelect'),
    codec: document.getElementById('codecSelect'),
    resolution: document.getElementById('resolutionSelect'),
    fontSize: document.getElementById('fontSizeInput'),
    nextLine: document.getElementById('nextLineToggle'),
    fontStyle: document.getElementById('fontStyleSelect'),
    transitionLength: document.getElementById('transitionSelect'),
    offset: document.getElementById('offsetInput')
};
const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');
const audioPlayer = document.getElementById('audioPlayer');
const timelineTrack = document.getElementById('timelineTrack');
const timelineProgress = document.getElementById('timelineProgress');

const buttons = {
    play: document.getElementById('playBtn'),
    stop: document.getElementById('stopBtn'),
    record: document.getElementById('recordBtn'),
    icons: {
        play: document.getElementById('playIcon'),
        stop: document.getElementById('stopIcon'),
        record: document.getElementById('recordIcon')
    }
};
const statusText = document.getElementById('statusText');

// --- State & Cache (OPTIMIZED) ---
let lyrics = [];
let bgImage = null;
let cachedBgCanvas = document.createElement('canvas'); // Offscreen canvas for background
let cachedBgCtx = cachedBgCanvas.getContext('2d', { alpha: false }); // Optimize for no transparency
let animationFrameId;
let audioContext, audioSource, dest;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

// O(1) Lookup variable
let currentLyricIndex = -1;

const stateCache = {
    bgParams: null,
    fontSize: 64,
    fontString: "",
    activeLyricIndex: -1,
    wrappedLines: [],
    textWidth: 0,
    settings: {
        effect: 'fade',
        color: '#ffffff',
        fontFamily: 'Arial',
        fontStyle: 'normal',
        transitionLength: 0.5,
        offset: 0,
        nextLine: 'on'
    }
};

function updateSettingsCache() {
    stateCache.settings.effect = inputs.effect.value;
    stateCache.settings.color = inputs.color.value;
    stateCache.settings.fontFamily = inputs.font.value;
    stateCache.settings.fontStyle = inputs.fontStyle.value;
    stateCache.settings.transitionLength = parseFloat(inputs.transitionLength.value) || 0.5;
    stateCache.settings.offset = parseFloat(inputs.offset.value) || 0;
    stateCache.settings.nextLine = inputs.nextLine.value;
    
    updateResponsiveFontSize();
    invalidateTextCache();
}

function updateResponsiveFontSize() {
    const baseHeight = 1080;
    const baseFontSize = parseInt(inputs.fontSize.value) || 64; 
    stateCache.fontSize = Math.round((canvas.height / baseHeight) * baseFontSize);
    stateCache.fontString = `${stateCache.settings.fontStyle} ${stateCache.fontSize}px ${stateCache.settings.fontFamily}`;
}

function invalidateTextCache() {
    stateCache.activeLyricIndex = -1;
}

// OPTIMIZATION: Pre-scale and cache the background onto an offscreen canvas
function calculateBgParams() {
    if (!bgImage) return;
    
    // Resize the cached canvas to match the main canvas resolution
    cachedBgCanvas.width = canvas.width;
    cachedBgCanvas.height = canvas.height;

    const imgRatio = bgImage.width / bgImage.height;
    const canvasRatio = canvas.width / canvas.height;
    let rw, rh, ox, oy;
    
    if (imgRatio > canvasRatio) {
        rh = canvas.height; rw = bgImage.width * (canvas.height/bgImage.height);
        ox = (canvas.width - rw)/2; oy = 0;
    } else {
        rw = canvas.width; rh = bgImage.height * (canvas.width/bgImage.width);
        ox = 0; oy = (canvas.height - rh)/2;
    }
    
    // Draw and scale the image onto the offscreen canvas ONCE
    cachedBgCtx.imageSmoothingEnabled = true;
    cachedBgCtx.imageSmoothingQuality = "high";
    cachedBgCtx.drawImage(bgImage, ox, oy, rw, rh);
    
    // Add the dimmer layer directly to the cached background
    cachedBgCtx.fillStyle = "rgba(0,0,0,0.5)";
    cachedBgCtx.fillRect(0, 0, cachedBgCanvas.width, cachedBgCanvas.height);

    stateCache.bgParams = true; // Flag that it's ready
}

// --- Listeners ---
inputs.music.addEventListener('change', handleMusicUpload);
inputs.lrc.addEventListener('change', handleLrcUpload);
inputs.image.addEventListener('change', handleImageUpload);

inputs.offset.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    const displayEl = document.getElementById('offsetValueDisplay');
    if(displayEl) displayEl.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}s`;
    updateSettingsCache();
    // Reset O(1) lookup on scrub
    currentLyricIndex = -1;
    if(!audioPlayer.paused) return;
    drawFrame();
});

inputs.resolution.addEventListener('change', () => {
    if (!isRecording) applyResolution();
});

inputs.fontSize.addEventListener('input', () => {
    updateSettingsCache();
    if(!audioPlayer.paused) return;
    drawFrame();
});

const fullscreenBtn = document.getElementById('fullscreenBtn');
if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.getElementById('canvasWrapper').requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });
}

[inputs.font, inputs.effect, inputs.color, inputs.fontStyle, inputs.transitionLength, inputs.nextLine].forEach(el => {
    if (el) {
        el.addEventListener('input', () => {
            updateSettingsCache();
            inputs.font.style.fontFamily = inputs.font.value;
            if(!audioPlayer.paused) return;
            drawFrame();
        });
    }
});

document.querySelectorAll('.effect-box').forEach(box => {
    box.addEventListener('click', () => {
        document.querySelectorAll('.effect-box').forEach(b => b.classList.remove('active'));
        box.classList.add('active');
        inputs.effect.value = box.dataset.value;
        updateSettingsCache();
        if (!audioPlayer.paused) return;
        drawFrame();
    });
});

document.querySelectorAll('.swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
        inputs.color.value = swatch.dataset.color;
        updateSettingsCache();
        if (!audioPlayer.paused) return;
        drawFrame();
    });
});

buttons.play.addEventListener('click', togglePlay);
buttons.stop.addEventListener('click', stopPlayback);
buttons.record.addEventListener('click', toggleRecording);

audioPlayer.addEventListener('ended', () => {
    if (isRecording) stopRecording();
    stopPlayback();
});

document.querySelectorAll('.panel-header').forEach(header => {
    header.addEventListener('click', () => {
        const panel = header.parentElement;
        panel.classList.toggle('collapsed');
    });
});

let isScrubbing = false;

function seekAudio(e) {
    if (!audioPlayer.src || !audioPlayer.duration || isRecording) return;
    
    const rect = timelineTrack.getBoundingClientRect();
    let clickX = e.clientX - rect.left;
    clickX = Math.max(0, Math.min(clickX, rect.width));
    const percentage = clickX / rect.width;
    
    audioPlayer.currentTime = percentage * audioPlayer.duration;
    
    // Reset O(1) lookup on scrub
    currentLyricIndex = -1;
    
    updateProgressBar();
    if (audioPlayer.paused) drawFrame();
}

timelineTrack.addEventListener('mousedown', (e) => {
    isScrubbing = true;
    seekAudio(e);
});

document.addEventListener('mousemove', (e) => {
    if (isScrubbing) seekAudio(e);
});

document.addEventListener('mouseup', () => {
    isScrubbing = false;
});

// --- Logic ---

function handleMusicUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const fileNameHandled = file.name.replace(/\.[^/.]+$/, "").slice(0, 50);
        const projectTitle = document.getElementById('project-title');
        if(projectTitle) projectTitle.textContent = fileNameHandled;
        
        const span = e.target.parentElement.querySelector('span');
        if(span) span.textContent = file.name;
        
        audioPlayer.src = URL.createObjectURL(file);
        
        audioPlayer.onloadedmetadata = () => {
             const totalTimeEl = document.getElementById('totalTime');
             if(totalTimeEl) totalTimeEl.textContent = formatTime(audioPlayer.duration);
             checkReady();
        };
    }
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const span = e.target.parentElement.querySelector('span');
        if(span) span.textContent = file.name;
        
        const img = new Image();
        img.onload = () => { 
            bgImage = img; 
            calculateBgParams(); 
            drawFrame(); 
            checkReady(); 
        };
        img.src = URL.createObjectURL(file);
    }
}

function handleLrcUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const span = e.target.parentElement.querySelector('span');
        if(span) span.textContent = file.name;
        
        const reader = new FileReader();
        reader.onload = (event) => { parseLRC(event.target.result); checkReady(); };
        reader.readAsText(file);
    }
}

function parseLRC(lrcText) {
    lyrics = [];
    const lines = lrcText.split('\n');
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    lines.forEach(line => {
        const match = timeRegex.exec(line);
        if (match) {
            const mins = parseInt(match[1]);
            const secs = parseInt(match[2]);
            const ms = parseFloat("0." + match[3]);
            lyrics.push({ time: mins * 60 + secs + ms, text: line.replace(timeRegex, '').trim() });
        }
    });
    lyrics.sort((a, b) => a.time - b.time);
    currentLyricIndex = -1; // Reset lookup
    statusText.textContent = `Loaded ${lyrics.length} lines.`;
    invalidateTextCache();
}

function applyResolution() {
    const res = inputs.resolution.value;
    const map = {
        '720p':  [1280, 720],
        '1080p': [1920, 1080],
        '1440p': [2560, 1440],
        '2160p': [3840, 2160]
    };
    const [w, h] = map[res];
    canvas.width = w;
    canvas.height = h;
    
    const resBadge = document.getElementById('resolutionBadge');
    if(resBadge) resBadge.textContent = `${w} x ${h}`;
    
    calculateBgParams();
    updateSettingsCache();
    drawFrame();
}

function setControlsDisabled(state) {
    inputs.fps.disabled = state;
    inputs.bitrate.disabled = state;
    inputs.resolution.disabled = state;
}

function formatTime(totalSecs) {
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function checkReady() {
    if (audioPlayer.src && bgImage && lyrics.length > 0) {
        buttons.play.disabled = false;
        buttons.record.disabled = false;
        statusText.textContent = "Ready.";
        document.querySelectorAll('.panel').forEach(panel => {
            const titleEl = panel.querySelector('.header-title');
            if (titleEl && (titleEl.textContent.includes("Assets") || titleEl.textContent.includes("Format"))) {
                panel.classList.add('collapsed');
            }
        });
        updateSettingsCache();
        drawFrame();
    }
}

function updateProgressBar() {
    if(audioPlayer.duration) {
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        timelineProgress.style.width = `${progress}%`;
        timelineTrack.style.setProperty('--progress-width', `${progress}%`);
    }
}

// --- Rendering Engine ---

ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    let line = '';
    const lines = [];

    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;

        if (testWidth > maxWidth && i > 0) {
            lines.push(line);
            line = words[i] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line);
    return lines;
}

// OPTIMIZATION: Resolve active lyric in O(1) time instead of O(N)
function getActiveLyricIndex(adjustedTime) {
    if (lyrics.length === 0) return -1;
    
    // If scrubbing backward, reset the index to force a resync
    if (currentLyricIndex > 0 && adjustedTime < lyrics[currentLyricIndex].time) {
        currentLyricIndex = -1;
    }
    
    // Find the current index based on the pointer
    if (currentLyricIndex === -1) {
        // Fallback for initial load or scrub
        currentLyricIndex = lyrics.findIndex((line, i) => {
            const nextTime = lyrics[i + 1] ? lyrics[i + 1].time : Infinity;
            return adjustedTime >= line.time && adjustedTime < nextTime;
        });
    } else {
        // O(1) forward check
        while (currentLyricIndex < lyrics.length - 1 && adjustedTime >= lyrics[currentLyricIndex + 1].time) {
            currentLyricIndex++;
        }
    }
    
    return currentLyricIndex;
}


function drawFrame() {
    const fontsize = stateCache.fontSize;
    const smallFontSize = Math.round(fontsize * 0.5);

    // 1. Clear & Background
    if (bgImage && stateCache.bgParams) {
        // OPTIMIZATION: Draw the pre-scaled, pre-dimmed offscreen canvas
        ctx.drawImage(cachedBgCanvas, 0, 0);
    } else {
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Determine Active Lyric
    const currentTime = audioPlayer.currentTime;
    const currentTimeEl = document.getElementById('currentTime');
    if(currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
    
    updateProgressBar();

    const offsetValue = stateCache.settings.offset;
    const adjustedTime = currentTime - offsetValue;

    // Call optimized O(1) lookup
    const activeIndex = getActiveLyricIndex(adjustedTime);

    if (activeIndex !== -1 && lyrics[activeIndex]) {
        const line = lyrics[activeIndex];
        const nextLine = lyrics[activeIndex + 1];
        
        const transitionDuration = stateCache.settings.transitionLength;
        
        const timeActive = adjustedTime - line.time;
        // Handle edge case where timeActive could be negative if offset causes issues early on
        let progress = Math.max(0, timeActive / transitionDuration);
        if (progress > 1) progress = 1;

        if (stateCache.activeLyricIndex !== activeIndex) {
            stateCache.activeLyricIndex = activeIndex;
            ctx.font = stateCache.fontString;
            stateCache.wrappedLines = wrapText(ctx, line.text, canvas.width * 0.8);
            
            stateCache.textWidth = Math.max(
                ...stateCache.wrappedLines.map(l => ctx.measureText(l).width),
                ctx.measureText(line.text).width
            );
        }

        // Draw Main Text with Effect
        drawTextWithEffect(line.text, canvas.width/2, canvas.height/2, progress, true);
        
        // Draw Next Text
        if (nextLine && stateCache.settings.nextLine === "on") {
            ctx.save();
            ctx.font = `${stateCache.settings.fontStyle} ${smallFontSize}px ${stateCache.settings.fontFamily}`;
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.textAlign = "center";
            // Shadow logic shouldn't bleed into next text, so explicitly clear it or state properties
            ctx.shadowColor = "transparent"; 
            ctx.fillText(nextLine.text, canvas.width/2, canvas.height/2 + fontsize * 1.75);
            ctx.restore();
        }
    }

    if (!audioPlayer.paused && !audioPlayer.ended) {
        animationFrameId = requestAnimationFrame(drawFrame);
    }
}

function drawTextWithEffect(text, x, y, progress, isMain) {
    const fontSize = stateCache.fontSize;
    const lineHeight = fontSize * 1.2;
    const effect = stateCache.settings.effect;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = stateCache.fontString;
    ctx.fillStyle = stateCache.settings.color;

    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    // --- Effects (Maintained as-is) ---
    if (effect === 'fade') {
        ctx.globalAlpha = progress;
    } 
    else if (effect === 'slideUp') {
        ctx.globalAlpha = progress;
        y += 50 * (1 - easeOutQuad(progress));
    } 
    else if (effect === 'zoomIn') {
        ctx.globalAlpha = progress;
        const scale = 0.5 + (0.5 * easeOutBack(progress));
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.translate(-x, -y);
    }
    else if (effect === 'typewriter') {
        const charCount = Math.floor(text.length * progress);
        text = text.substring(0, charCount);
    }
    else if (effect === 'blurFade') {
        ctx.globalAlpha = progress;
        const blurAmount = 10 * (1 - easeOutQuad(progress));
        ctx.filter = `blur(${blurAmount}px)`;
    }
    else if (effect === 'spreadOut') {
        ctx.globalAlpha = progress;
        const scaleX = 0.5 + (0.5 * easeOutBack(progress));
        ctx.translate(x, y);
        ctx.scale(scaleX, 1);
        ctx.translate(-x, -y);
    }
    else if (effect === 'glitch') {
        if (progress < 1) {
            ctx.globalAlpha = Math.random() * progress;
            const jitter = 5 * (1 - progress); 
            x += (Math.random() - 0.5) * jitter;
            y += (Math.random() - 0.5) * jitter;
        } else {
            ctx.globalAlpha = 1;
        }
    }
    else if (effect === 'popIn') {
        ctx.globalAlpha = progress;
        const scale = easeOutElastic(progress);
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.translate(-x, -y);
    }
    else if (effect === 'wipeReveal') {
        ctx.save(); 
        ctx.beginPath();
        const textWidth = stateCache.textWidth;
        const textHeight = lineHeight * stateCache.wrappedLines.length + 20; 
        ctx.rect(x - textWidth/2, y - textHeight/2, textWidth * progress, textHeight);
        ctx.clip();
    }
    else if (effect === 'kineticFlyIn') {
        const seed = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const angle = (seed % 360) * (Math.PI / 180); 
        const distance = 300 * (1 - easeOutQuart(progress)); 
        x += Math.cos(angle) * distance;
        y += Math.sin(angle) * distance;
        const rotation = ( (seed % 20) - 10 ) * (1 - progress); 
        ctx.translate(x, y);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.translate(-x, -y);
        ctx.globalAlpha = progress;
        const scale = 0.8 + (0.2 * progress);
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.translate(-x, -y);
    }
    else if (effect === 'slingshot') {
        ctx.globalAlpha = Math.min(1, progress * 2);
        const overshoot = progress < 0.6
            ? -(1 - progress / 0.6) * 80 
            : Math.sin((progress - 0.6) / 0.4 * Math.PI) * 20 * (1 - progress); 
        x += overshoot;
        const squish = progress < 0.6 ? 1.3 - 0.3 * (progress / 0.6) : 1;
        ctx.translate(x, y);
        ctx.scale(squish, 2 - squish);
        ctx.translate(-x, -y);
    }
    else if (effect === 'cassetteFade') {
        ctx.globalAlpha = progress;
        const scaleX = easeOutBack(progress);
        const scaleY = 0.05 + 0.95 * easeOutQuad(progress);
        ctx.translate(x, y);
        ctx.scale(scaleX, scaleY);
        ctx.translate(-x, -y);
    }
    else if (effect === 'shatterIn') {
        if (progress < 1) {
            const layers = 4;
            for (let i = 0; i < layers; i++) {
                const layerProgress = Math.max(0, progress - i * 0.1);
                const seed = text.charCodeAt(0) + i * 37;
                const offsetX = ((seed % 60) - 30) * (1 - easeOutQuart(layerProgress));
                const offsetY = (((seed * 3) % 60) - 30) * (1 - easeOutQuart(layerProgress));
                ctx.save();
                ctx.globalAlpha = (layerProgress / layers) * 0.6;
                ctx.translate(x + offsetX, y + offsetY);
                stateCache.wrappedLines.forEach((line, j) => {
                   ctx.fillText(line.trim(), 0, j * lineHeight);
                });
                ctx.restore();
            }
            ctx.globalAlpha = easeOutQuart(progress);
        } else {
            ctx.globalAlpha = 1;
        }
    }
    else if (effect === 'cinemaReveal') {
        ctx.save();
        ctx.beginPath();
        const textWidth = stateCache.textWidth;
        const halfH = 60 * progress; 
        ctx.rect(x - textWidth / 2 - 10, y - halfH, textWidth + 20, halfH * 2);
        ctx.clip();
        ctx.globalAlpha = progress;
    }
    else if (effect === 'neonFlicker') {
        const flicker = progress < 0.7
            ? Math.round(Math.sin(progress * 80)) * (progress / 0.7) 
            : 1;
        ctx.globalAlpha = Math.max(0, flicker);
        if (progress > 0.5) {
            const glow = 15 * ((progress - 0.5) / 0.5);
            ctx.shadowBlur = glow;
            ctx.shadowColor = 'rgba(0, 200, 255, 0.9)';
        }
    }
    else if (effect === 'gravityDrop') {
        const bounceProgress = easeOutBounce(progress);
        const startY = y - 200;
        const dropY = -200 * (1 - bounceProgress);
        ctx.globalAlpha = Math.min(1, progress * 3);
        ctx.translate(x, y + dropY);
        ctx.translate(-x, -(y + dropY));
    }
    else if (effect === 'interference') {
        ctx.globalAlpha = progress;
        const instability = 1 - easeOutQuart(progress);
        const scanShift = Math.sin(progress * Math.PI * 12) * 15 * instability;
        const vertStretch = 1 + 0.4 * instability;
        ctx.translate(x, y);
        ctx.scale(1, vertStretch);
        ctx.translate(-x + scanShift, -y);
        if (instability > 0.01) {
            ctx.filter = `contrast(${1 + instability}) brightness(${1 + instability * 0.5})`;
        }
    }
    else if (effect === 'stampIn') {
        ctx.globalAlpha = progress < 0.5 ? 0 : (progress - 0.5) * 2;
        const scale = progress < 0.7
            ? 3 - (3 - 1) * easeOutQuart(progress / 0.7) 
            : 1 + 0.05 * Math.sin((progress - 0.7) / 0.3 * Math.PI); 
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.translate(-x, -y);
    }

    let linesToDraw = stateCache.wrappedLines;
    
    if (effect === 'typewriter') {
        linesToDraw = wrapText(ctx, text, canvas.width * 0.8);
    }

    const startY = y - ((linesToDraw.length - 1) * lineHeight) / 2;

    linesToDraw.forEach((line, i) => {
        ctx.fillText(line.trim(), x, startY + i * lineHeight);
    });

    if (effect === 'wipeReveal' || effect === 'cinemaReveal') {
        ctx.restore();
    }
    
    ctx.restore();
}

// Function removed: drawBackgroundCover() is no longer needed since we handle it in calculateBgParams and drawFrame

// --- Easing Functions ---
function easeOutQuad(t) { return t * (2 - t); }
function easeOutQuart(x) { return 1 - Math.pow(1 - x, 4); }
function easeOutBack(t) { 
    const c1 = 1.70158; 
    const c3 = c1 + 1; 
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); 
}
function easeOutElastic(x) {
    const c4 = (2 * Math.PI) / 3;
    return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}
function easeOutBounce(t) {
    if (t < 1/2.75) return 7.5625 * t * t;
    if (t < 2/2.75) return 7.5625 * (t -= 1.5/2.75) * t + 0.75;
    if (t < 2.5/2.75) return 7.5625 * (t -= 2.25/2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625/2.75) * t + 0.984375;
}

function updateTransitionValue(value) {
    const valEl = document.getElementById('transitionValue');
    if(valEl) valEl.textContent = `${value}s`;
}

// --- Playback/Record Handlers ---
function togglePlay() {
    if (audioPlayer.paused) {
        audioPlayer.play();
        drawFrame();
        buttons.icons.play.classList = "fas fa-pause";
        buttons.stop.disabled = false;
    } else {
        audioPlayer.pause();
        cancelAnimationFrame(animationFrameId);
        buttons.icons.play.classList = "fas fa-play";
    }
}

function stopPlayback() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    currentLyricIndex = -1; // Reset lookup on stop
    cancelAnimationFrame(animationFrameId);
    updateProgressBar();
    drawFrame();
    buttons.icons.play.classList = "fas fa-play";
    buttons.stop.disabled = true;
}

function setupAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioSource = audioContext.createMediaElementSource(audioPlayer);
        dest = audioContext.createMediaStreamDestination();
        audioSource.connect(dest);
        audioSource.connect(audioContext.destination);
    } else if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    setControlsDisabled(true);
    setupAudioContext();
    const fps = parseInt(inputs.fps.value) || 60;
    const canvasStream = canvas.captureStream(fps);
    const audioStream = dest.stream;
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);

    recordedChunks = [];
    try {
        const bitrateStr = inputs.bitrate.value;
        const bitsPerSec = parseInt(bitrateStr) * 1000;
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType: `video/webm; codecs=${inputs.codec.value}`, videoBitsPerSecond: bitsPerSec });
    } catch (e) {
        mediaRecorder = new MediaRecorder(combinedStream);
    }

    mediaRecorder.ondataavailable = (e) => { if(e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = exportVideo;

    mediaRecorder.start();
    audioPlayer.currentTime = 0;
    currentLyricIndex = -1; // Reset lookup on record start
    audioPlayer.play();
    drawFrame();

    isRecording = true;
    buttons.record.textContent = "Stop Recording";
    buttons.record.classList.add("recording");
    buttons.play.disabled = true;
    buttons.stop.disabled = true;

    const sidebar = document.getElementById('sidebar');
    if(sidebar) sidebar.classList.add("locked");

    audioPlayer.onplay = () => {
        requestAnimationFrame(updateRecordingProgress);
    };
}

function updateRecordingProgress() {
    if (!isRecording) return;

    const progress = audioPlayer.currentTime / audioPlayer.duration;
    const percent = Math.min(100, Math.floor(progress * 100));

    statusText.textContent = `Recording... ${percent}% Please do not switch tabs for best results.`;

    requestAnimationFrame(updateRecordingProgress);
}

function stopRecording() {
    setControlsDisabled(false);
    if(mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    audioPlayer.pause();
    isRecording = false;
    buttons.record.textContent = "● Export Video";
    buttons.record.classList.remove("recording");
    buttons.play.disabled = false;
    buttons.stop.disabled = false;
}

function exportVideo() {
    const fileNameHandled = inputs.music.files[0] ? inputs.music.files[0].name.replace(/\.[^/.]+$/, "").slice(0, 50) : 'video';
    statusText.textContent = "Processing...";
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download =  fileNameHandled + ' (made with lyrica).webm';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        statusText.textContent = "Download started!";
        const sidebar = document.getElementById('sidebar');
        if(sidebar) sidebar.classList.remove("locked");
    }, 100);
}

// Init Canvas
updateSettingsCache();
ctx.fillStyle = "#111";
ctx.fillRect(0,0,canvas.width, canvas.height);
ctx.fillStyle = "#444";
ctx.font = "36px Arial";
ctx.textAlign = "center";
ctx.fillText("Upload your files to get started", canvas.width/2, canvas.height/2);