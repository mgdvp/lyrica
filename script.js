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
    resolution: document.getElementById('resolutionSelect'),
    fontSize: document.getElementById('fontSizeInput'),
    nextLine: document.getElementById('nextLineToggle'),
    fontStyle: document.getElementById('fontStyleSelect'),
    transitionLength: document.getElementById('transitionSelect')
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

// --- State ---
let lyrics = [];
let bgImage = null;
let animationFrameId;
let audioContext, audioSource, dest;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

// --- Listeners ---
inputs.music.addEventListener('change', handleMusicUpload);
inputs.lrc.addEventListener('change', handleLrcUpload);
inputs.image.addEventListener('change', handleImageUpload);

inputs.resolution.addEventListener('change', () => {
    if (!isRecording) applyResolution();
});

document.getElementById('fullscreenBtn').addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.getElementById('canvasWrapper').requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

// Redraw when settings change
[inputs.font, inputs.effect, inputs.color, inputs.fontStyle, inputs.transitionLength].forEach(el => {
    el.addEventListener('input', () => {
        if(!audioPlayer.paused) return
        drawFrame();
        inputs.font.style.fontFamily = inputs.font.value;
    });
});

document.querySelectorAll('.effect-box').forEach(box => {
    box.addEventListener('click', () => {
        document.querySelectorAll('.effect-box').forEach(b => b.classList.remove('active'));
        box.classList.add('active');
        inputs.effect.value = box.dataset.value;
        if (!audioPlayer.paused) return;
        drawFrame();
    });
});

document.querySelectorAll('.swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
        inputs.color.value = swatch.dataset.color;
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

// Panel Collapse Logic
document.querySelectorAll('.panel-header').forEach(header => {
    header.addEventListener('click', () => {
        const panel = header.parentElement;
        panel.classList.toggle('collapsed');
    });
});

// Interactive Progress Bar (Seek & Scrub)
let isScrubbing = false;

function seekAudio(e) {
    if (!audioPlayer.src || !audioPlayer.duration || isRecording) return;
    
    const rect = timelineTrack.getBoundingClientRect();
    let clickX = e.clientX - rect.left;
    clickX = Math.max(0, Math.min(clickX, rect.width)); // clamp
    const percentage = clickX / rect.width;
    
    audioPlayer.currentTime = percentage * audioPlayer.duration;
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
        document.getElementById('project-title').textContent = fileNameHandled;
        e.target.parentElement.querySelector('span').textContent = file.name;
        audioPlayer.src = URL.createObjectURL(file);
        
        audioPlayer.onloadedmetadata = () => {
             document.getElementById('totalTime').textContent = formatTime(audioPlayer.duration);
             checkReady();
        };
    }
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        e.target.parentElement.querySelector('span').textContent = file.name;
        const img = new Image();
        img.onload = () => { bgImage = img; drawFrame(); checkReady(); };
        img.src = URL.createObjectURL(file);
    }
}

function handleLrcUpload(e) {
    const file = e.target.files[0];
    if (file) {
        e.target.parentElement.querySelector('span').textContent = file.name;
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
    statusText.textContent = `Loaded ${lyrics.length} lines.`;
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
    document.getElementById('resolutionBadge').textContent = `${w} x ${h}`;
    drawFrame();
}

function setControlsDisabled(state) {
    inputs.fps.disabled = state;
    inputs.bitrate.disabled = state;
    inputs.resolution.disabled = state;
}

function getResponsiveFontSize() {
    const baseHeight = 1080;
    const baseFontSize = parseInt(inputs.fontSize.value) || 64; 
    return Math.round((canvas.height / baseHeight) * baseFontSize);
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
        inputs.font.scrollIntoView({ behavior: 'smooth' });
        // collapse assets panel
        document.querySelectorAll('.panel').forEach(panel => {
            if (panel.querySelector('.header-title').textContent.includes("Assets")) {
                panel.classList.add('collapsed');
            }
        });
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

function drawFrame() {
    const fontsize = getResponsiveFontSize();
    const smallFontSize = Math.round(fontsize * 0.5);

    // 1. Clear & Background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bgImage) drawBackgroundCover();
    
    // Dimmer
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0,0,canvas.width, canvas.height);

    // 2. Determine Active Lyric
    const currentTime = audioPlayer.currentTime;
    document.getElementById('currentTime').textContent = formatTime(currentTime);
    
    // Update visual progress bar
    updateProgressBar();

    const currentIndex = lyrics.findIndex((line, i) => {
        const nextTime = lyrics[i + 1] ? lyrics[i + 1].time : Infinity;
        return currentTime >= line.time && currentTime < nextTime;
    });

    if (currentIndex !== -1) {
        const line = lyrics[currentIndex];
        const nextLine = lyrics[currentIndex + 1];
        
        // Use user-defined transition duration
        const transitionDuration = parseFloat(inputs.transitionLength.value) || 0.5;
        
        // Calculate Animation Progress (0.0 to 1.0)
        const timeActive = currentTime - line.time;
        let progress = timeActive / transitionDuration;
        if (progress > 1) progress = 1; // Clamp

        // Draw Main Text with Effect
        drawTextWithEffect(line.text, canvas.width/2, canvas.height/2, progress, true);
        
        // Draw Next Text (Static, small)
        if (nextLine && inputs.nextLine.value === "on") {
            ctx.save();
            ctx.font = `${inputs.fontStyle.value} ${smallFontSize}px ${inputs.font.value}`;
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.textAlign = "center";
            ctx.fillText(nextLine.text, canvas.width/2, canvas.height/2 + fontsize * 1.75);
            ctx.restore();
        }
    }

    if (!audioPlayer.paused && !audioPlayer.ended) {
        animationFrameId = requestAnimationFrame(drawFrame);
    }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
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


function drawTextWithEffect(text, x, y, progress, isMain) {
    const fontSize = getResponsiveFontSize();
    const fontStyle = inputs.fontStyle.value;
    const lineHeight = fontSize * 1.2;
    const maxWidth = canvas.width * 0.8; 

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${fontStyle} ${fontSize}px ${inputs.font.value}`;
    ctx.fillStyle = inputs.color.value;

    // Shadow
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    const effect = inputs.effect.value;

    // --- Effects ---
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
        const textWidth = ctx.measureText(text).width;
        const textHeight = 100; 
        ctx.rect(x - textWidth/2, y - textHeight/2, textWidth * progress, textHeight);
        ctx.clip();
    }
    else if (effect === 'kineticFlyIn') {
        // 1. Calculate a consistent "random" angle based on the text characters
        const seed = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const angle = (seed % 360) * (Math.PI / 180); // Convert degrees to radians
        
        // 2. Set the starting distance (how far away the words start)
        // As progress goes from 0 to 1, distance goes from 300 to 0
        const distance = 300 * (1 - easeOutQuart(progress)); 
        
        // 3. Apply the offset to the current x and y
        x += Math.cos(angle) * distance;
        y += Math.sin(angle) * distance;
        
        // 4. Add a slight rotation that straightens out as it lands
        const rotation = ( (seed % 20) - 10 ) * (1 - progress); // -10 to 10 degrees
        ctx.translate(x, y);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.translate(-x, -y);

        // 5. Fade in and scale slightly for "punch"
        ctx.globalAlpha = progress;
        const scale = 0.8 + (0.2 * progress);
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.translate(-x, -y);
    }
    else if (effect === 'slingshot') {
        // Text overshoots past its target, snaps back like a rubber band
        ctx.globalAlpha = Math.min(1, progress * 2);
        const overshoot = progress < 0.6
            ? -(1 - progress / 0.6) * 80          // flies in from left
            : Math.sin((progress - 0.6) / 0.4 * Math.PI) * 20 * (1 - progress); // bounces
        x += overshoot;
        const squish = progress < 0.6 ? 1.3 - 0.3 * (progress / 0.6) : 1;
        ctx.translate(x, y);
        ctx.scale(squish, 2 - squish);
        ctx.translate(-x, -y);
    }
    else if (effect === 'cassetteFade') {
        // Text unspools from a narrow vertical line, expanding outward like tape
        ctx.globalAlpha = progress;
        const scaleX = easeOutBack(progress);
        const scaleY = 0.05 + 0.95 * easeOutQuad(progress);
        ctx.translate(x, y);
        ctx.scale(scaleX, scaleY);
        ctx.translate(-x, -y);
    }
    else if (effect === 'shatterIn') {
        // Text assembles from multiple offset ghost copies converging on the target
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
                ctx.fillText(text, 0, 0);
                ctx.restore();
            }
            ctx.globalAlpha = easeOutQuart(progress);
        } else {
            ctx.globalAlpha = 1;
        }
    }
    else if (effect === 'cinemaReveal') {
        // Two horizontal bars (like film letterbox) slide apart to reveal the text
        ctx.save();
        ctx.beginPath();
        const textWidth = ctx.measureText(text).width;
        const halfH = 60 * progress; // bars slide open
        ctx.rect(x - textWidth / 2 - 10, y - halfH, textWidth + 20, halfH * 2);
        ctx.clip();
        ctx.globalAlpha = progress;
    }
    else if (effect === 'neonFlicker') {
        // Mimics a neon sign powering up — flickers before settling into full glow
        const flicker = progress < 0.7
            ? Math.round(Math.sin(progress * 80)) * (progress / 0.7)  // rapid on/off
            : 1;
        ctx.globalAlpha = Math.max(0, flicker);
        if (progress > 0.5) {
            // Build up glow intensity
            const glow = 15 * ((progress - 0.5) / 0.5);
            ctx.shadowBlur = glow;
            ctx.shadowColor = 'rgba(0, 200, 255, 0.9)';
        }
    }
    else if (effect === 'gravityDrop') {
        // Text falls from above with realistic gravity
        const bounceProgress = easeOutBounce(progress);
        const startY = y - 200;
        y = startY + (y - startY) * bounceProgress; // actually, displace from above:
        const dropY = -200 * (1 - bounceProgress);
        ctx.globalAlpha = Math.min(1, progress * 3);
        ctx.translate(x, y + dropY);
        ctx.translate(-x, -(y + dropY));
    }
    else if (effect === 'interference') {
        // Horizontal scan-line distortion that stabilises into clean text (CRT/VHS feel)
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
        // Text slams down from enormous scale to normal like a rubber stamp
        ctx.globalAlpha = progress < 0.5 ? 0 : (progress - 0.5) * 2;
        const scale = progress < 0.7
            ? 3 - (3 - 1) * easeOutQuart(progress / 0.7)   // 3x → 1x fast drop
            : 1 + 0.05 * Math.sin((progress - 0.7) / 0.3 * Math.PI); // micro-bounce
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.translate(-x, -y);
    }

    // --- WORD WRAP ---
    const lines = wrapText(ctx, text, x, y, maxWidth, lineHeight);
    const startY = y - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, i) => {
        ctx.fillText(line.trim(), x, startY + i * lineHeight);
    });

    if (effect === 'wipeReveal') {
        ctx.restore();
    }
    
    ctx.restore();
}

function drawBackgroundCover() {
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
    ctx.drawImage(bgImage, ox, oy, rw, rh);
}

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
    document.getElementById('transitionValue').textContent = `${value}s`;
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
    const canvasStream = canvas.captureStream(parseInt(inputs.fps.value));
    const audioStream = dest.stream;
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);

    recordedChunks = [];
    try {
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9', videoBitsPerSecond: parseInt(inputs.bitrate.value) * 1000 });
    } catch (e) {
        mediaRecorder = new MediaRecorder(combinedStream);
    }

    mediaRecorder.ondataavailable = (e) => { if(e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = exportVideo;

    mediaRecorder.start();
    audioPlayer.currentTime = 0;
    audioPlayer.play();
    drawFrame();

    isRecording = true;
    buttons.record.textContent = "Stop Recording";
    buttons.record.classList.add("recording");
    buttons.play.disabled = true;
    buttons.stop.disabled = true;

    document.getElementById('sidebar').classList.add("locked");

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
    const fileNameHandled = inputs.music.files[0].name.replace(/\.[^/.]+$/, "").slice(0, 50);
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
        document.getElementById('sidebar').classList.remove("locked");
    }, 100);
}

// Init Canvas
ctx.fillStyle = "#111";
ctx.fillRect(0,0,canvas.width, canvas.height);
ctx.fillStyle = "#444";
ctx.font = "36px Arial";
ctx.textAlign = "center";
ctx.fillText("Upload your files to get started", canvas.width/2, canvas.height/2);