// ── Layout state ──

const layoutState = {
  bgImage: null,
  gap: 24,
  canvasPaddingTop: 24,
  canvasPaddingBottom: 24,
  canvasPaddingLeft: 0,
  canvasPaddingRight: 0,
  frame: 'none',
};

// ── Init ──

const leftPanel = new VideoPanel(
  document.getElementById('panel-left'),
  document.getElementById('timeline-left')
);
const rightPanel = new VideoPanel(
  document.getElementById('panel-right'),
  document.getElementById('timeline-right')
);
let playing = false;

const toolbarEl = document.querySelector('.toolbar');
const bottombarEl = document.querySelector('.bottombar');
toolbarEl.classList.add('hidden');
bottombarEl.classList.add('hidden');

function applyCanvasPadding() {
  canvasEl.querySelector('.canvas-vpad-top').style.height = layoutState.canvasPaddingTop + 'px';
  canvasEl.querySelector('.canvas-vpad-bottom').style.height = layoutState.canvasPaddingBottom + 'px';
  canvasEl.querySelector('.canvas-hpad-left').style.width = Math.max(8, layoutState.canvasPaddingLeft) + 'px';
  canvasEl.querySelector('.canvas-hpad-right').style.width = Math.max(8, layoutState.canvasPaddingRight) + 'px';
  resizeCanvas();
}

function updateBarsVisibility() {
  const hasVideo = leftPanel.loaded || rightPanel.loaded;
  toolbarEl.classList.toggle('hidden', !hasVideo);
  bottombarEl.classList.toggle('hidden', !hasVideo);
  if (hasVideo) applyCanvasPadding();
}

leftPanel.onLoad = updateBarsVisibility;
rightPanel.onLoad = updateBarsVisibility;

// ── Canvas sizing (16:9 export surface) ──

const stageEl = document.querySelector('.stage');
const canvasEl = document.getElementById('canvas');

function resizeCanvas() {
  const stagePad = 8; // matches .stage padding
  const availW = stageEl.clientWidth - stagePad * 2;
  const availH = stageEl.clientHeight - stagePad * 2;
  let cw = availW;
  let ch = availW * 9 / 16;
  if (ch > availH) {
    ch = availH;
    cw = availH * 16 / 9;
  }
  canvasEl.style.width = Math.round(cw) + 'px';
  canvasEl.style.height = Math.round(ch) + 'px';
}

window.addEventListener('resize', resizeCanvas);

// Track each sizer's height so the canvas max-height can resolve
const sizerObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const h = entry.contentBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
    entry.target.style.setProperty('--sizer-height', h + 'px');
  }
});
canvasEl.querySelectorAll('.video-sizer').forEach(s => sizerObserver.observe(s));

// Set initial padding element sizes + canvas dimensions
applyCanvasPadding();

// ── Toolbar ──

const btnPlay = document.getElementById('btn-play');
const btnExport = document.getElementById('btn-export');
const speedSel = document.getElementById('speed');

btnPlay.addEventListener('click', togglePlay);
btnExport.addEventListener('click', exportCanvas);
speedSel.addEventListener('change', applySpeed);

function applySpeed() {
  const r = parseFloat(speedSel.value);
  leftPanel.playbackRate = r;
  rightPanel.playbackRate = r;
}

// ── Layout controls ──

const layoutBgInput = document.getElementById('layout-bg-input');
const panelDivider = document.getElementById('panel-divider');
const layoutFrameSelect = document.getElementById('layout-frame-select');
const btnBg = document.getElementById('btn-bg');

// Background button triggers hidden file input
btnBg.addEventListener('click', () => layoutBgInput.click());

// Frame type
layoutFrameSelect.addEventListener('change', () => {
  layoutState.frame = layoutFrameSelect.value;
  applyFrameType();
});

function applyFrameType() {
  canvasEl.querySelectorAll('.video-player-frame').forEach((el) => {
    el.classList.remove('frame-phone', 'frame-app');
    if (layoutState.frame === 'phone') el.classList.add('frame-phone');
    else if (layoutState.frame === 'app') el.classList.add('frame-app');
  });
}

// Background image
layoutBgInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (layoutState.bgImage) URL.revokeObjectURL(layoutState.bgImage);
  layoutState.bgImage = URL.createObjectURL(file);
  applyLayoutBg();
});

function applyLayoutBg() {
  if (layoutState.bgImage) {
    canvasEl.style.backgroundImage = `url(${layoutState.bgImage})`;
    canvasEl.style.backgroundRepeat = 'no-repeat';
    canvasEl.style.backgroundSize = 'cover';
    canvasEl.style.backgroundPosition = 'center';
  } else {
    canvasEl.style.backgroundImage = '';
    canvasEl.style.backgroundSize = '';
    canvasEl.style.backgroundPosition = '';
    canvasEl.style.backgroundRepeat = '';
  }
}

// ── Draggable vertical padding handles ──

const vpadTop = canvasEl.querySelector('.canvas-vpad-top');
const vpadBottom = canvasEl.querySelector('.canvas-vpad-bottom');
let vpadDragging = null; // 'top' or 'bottom'
let vpadStartY = 0;
let vpadStartVal = 0;

vpadTop.addEventListener('mousedown', (e) => {
  e.preventDefault();
  vpadDragging = 'top';
  vpadStartY = e.clientY;
  vpadStartVal = layoutState.canvasPaddingTop;
});

vpadBottom.addEventListener('mousedown', (e) => {
  e.preventDefault();
  vpadDragging = 'bottom';
  vpadStartY = e.clientY;
  vpadStartVal = layoutState.canvasPaddingBottom;
});

document.addEventListener('mousemove', (e) => {
  if (!vpadDragging) return;
  const delta = e.clientY - vpadStartY;
  if (vpadDragging === 'top') {
    let newVal = Math.max(24, Math.min(96, vpadStartVal + delta));
    if (Math.abs(newVal - layoutState.canvasPaddingBottom) <= 6) newVal = layoutState.canvasPaddingBottom;
    layoutState.canvasPaddingTop = newVal;
  } else {
    let newVal = Math.max(24, Math.min(96, vpadStartVal - delta));
    if (Math.abs(newVal - layoutState.canvasPaddingTop) <= 6) newVal = layoutState.canvasPaddingTop;
    layoutState.canvasPaddingBottom = newVal;
  }
  applyCanvasPadding();
});

document.addEventListener('mouseup', () => {
  if (!vpadDragging) return;
  vpadDragging = null;
});

// ── Draggable horizontal padding handles ──

const hpadLeft = canvasEl.querySelector('.canvas-hpad-left');
const hpadRight = canvasEl.querySelector('.canvas-hpad-right');
let hpadDragging = null; // 'left' or 'right'
let hpadStartX = 0;
let hpadStartVal = 0;

hpadLeft.addEventListener('mousedown', (e) => {
  e.preventDefault();
  hpadDragging = 'left';
  hpadStartX = e.clientX;
  hpadStartVal = layoutState.canvasPaddingLeft;
});

hpadRight.addEventListener('mousedown', (e) => {
  e.preventDefault();
  hpadDragging = 'right';
  hpadStartX = e.clientX;
  hpadStartVal = layoutState.canvasPaddingRight;
});

document.addEventListener('mousemove', (e) => {
  if (!hpadDragging) return;
  const delta = e.clientX - hpadStartX;
  if (hpadDragging === 'left') {
    let newVal = Math.max(8, Math.min(96, hpadStartVal + delta));
    if (Math.abs(newVal - layoutState.canvasPaddingRight) <= 6) newVal = layoutState.canvasPaddingRight;
    layoutState.canvasPaddingLeft = newVal;
  } else {
    let newVal = Math.max(8, Math.min(96, hpadStartVal - delta));
    if (Math.abs(newVal - layoutState.canvasPaddingLeft) <= 6) newVal = layoutState.canvasPaddingLeft;
    layoutState.canvasPaddingRight = newVal;
  }
  applyCanvasPadding();
});

document.addEventListener('mouseup', () => {
  if (!hpadDragging) return;
  hpadDragging = null;
});

// ── Draggable divider (gap column) ──

const dividerHandle = panelDivider.querySelector('.divider-handle');
let dividerDragging = false;
let dividerStartX = 0;
let dividerStartGap = 0;

dividerHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  dividerDragging = true;
  dividerStartX = e.clientX;
  dividerStartGap = layoutState.gap;
  panelDivider.classList.add('dragging');
});

document.addEventListener('mousemove', (e) => {
  if (!dividerDragging) return;
  const delta = e.clientX - dividerStartX;
  // Dragging right = wider gap, left = narrower
  // Use absolute movement from center so both directions feel symmetric
  const newGap = Math.max(24, Math.min(200, dividerStartGap + delta));
  layoutState.gap = newGap;
  applyLayoutGap();
});

document.addEventListener('mouseup', () => {
  if (!dividerDragging) return;
  dividerDragging = false;
  panelDivider.classList.remove('dragging');
});

function applyLayoutGap() {
  panelDivider.style.width = Math.max(24, layoutState.gap) + 'px';
}

// ── Playback ──

function togglePlay() { playing ? stopPlay() : startPlay(); }

function startPlay() {
  if (!leftPanel.loaded && !rightPanel.loaded) return;
  playing = true;
  btnPlay.textContent = 'Pause [Space]';
  btnPlay.classList.add('on');
  applySpeed();

  if (leftPanel.loaded) leftPanel.currentTime = leftPanel.inPoint ?? 0;
  if (rightPanel.loaded) rightPanel.currentTime = rightPanel.inPoint ?? 0;

  leftPanel.startRendering(); rightPanel.startRendering();
  leftPanel.play(); rightPanel.play();
}

function stopPlay() {
  playing = false;
  btnPlay.textContent = 'Play [Space]';
  btnPlay.classList.remove('on');
  leftPanel.pause(); rightPanel.pause();
  leftPanel.stopRendering(); rightPanel.stopRendering();
}

// ── Title / Subtitle toggles ──

const btnTitle = document.getElementById('btn-title');
const btnSubtitle = document.getElementById('btn-subtitle');
let titleVisible = false;
let subtitleVisible = false;

btnTitle.addEventListener('click', () => {
  titleVisible = !titleVisible;
  btnTitle.classList.toggle('on', titleVisible);
  canvasEl.querySelectorAll('.label-title-input').forEach(el => el.classList.toggle('hidden', !titleVisible));
  updatePanelLabelsVisibility();
});

btnSubtitle.addEventListener('click', () => {
  subtitleVisible = !subtitleVisible;
  btnSubtitle.classList.toggle('on', subtitleVisible);
  canvasEl.querySelectorAll('.label-subtitle-input').forEach(el => el.classList.toggle('hidden', !subtitleVisible));
  updatePanelLabelsVisibility();
});

function updatePanelLabelsVisibility() {
  canvasEl.querySelectorAll('.panel-label').forEach(el => {
    el.classList.toggle('hidden', !titleVisible && !subtitleVisible);
  });
}

// ── Export ──

async function exportCanvas() {
  const panels = [];
  if (leftPanel.loaded) panels.push(leftPanel);
  if (rightPanel.loaded) panels.push(rightPanel);
  if (panels.length === 0) return;
  if (playing) stopPlay();

  const overlay = document.getElementById('export-overlay');
  const progressFill = overlay.querySelector('.progress-fill');
  const framesCurrent = overlay.querySelector('.export-frames-current');
  const framesTotal = overlay.querySelector('.export-frames-total');
  const actionBtn = overlay.querySelector('.export-action-btn');
  const formatSelect = document.getElementById('export-format');
  const speedSelect = document.getElementById('export-speed');
  const fpsSelect = document.getElementById('export-fps');

  const duration = Math.max(...panels.map(p => (p.outPoint ?? p.duration) - (p.inPoint ?? 0)));

  function getFPS() { return parseInt(fpsSelect.value) || 30; }

  function calcTotalFrames() {
    const speed = parseFloat(speedSelect.value) || 1;
    return Math.ceil((duration / speed) * getFPS());
  }

  overlay.classList.remove('hidden');
  progressFill.style.width = '0%';
  framesCurrent.textContent = '0';
  framesTotal.textContent = calcTotalFrames();
  actionBtn.textContent = 'Export';
  actionBtn.classList.remove('on');
  formatSelect.disabled = false;
  speedSelect.disabled = false;
  fpsSelect.disabled = false;
  actionBtn.focus();

  // Recalculate total when speed or fps changes
  speedSelect.onchange = () => { framesTotal.textContent = calcTotalFrames(); };
  fpsSelect.onchange = () => { framesTotal.textContent = calcTotalFrames(); };

  let cancelled = false;
  const dismiss = () => { cancelled = true; overlay.classList.add('hidden'); speedSelect.onchange = null; fpsSelect.onchange = null; };
  overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };

  // Wait for user to click Export or dismiss
  await new Promise(resolve => {
    actionBtn.onclick = () => {
      actionBtn.textContent = 'Cancel';
      actionBtn.classList.add('on');
      formatSelect.disabled = true;
      speedSelect.disabled = true;
      fpsSelect.disabled = true;
      resolve();
    };
    const prevDismiss = dismiss;
    overlay.onclick = (e) => { if (e.target === overlay) { prevDismiss(); resolve(); } };
  });

  if (cancelled) { overlay.onclick = null; return; }

  actionBtn.onclick = dismiss;
  overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };

  const exportSpeed = parseFloat(speedSelect.value) || 1;
  const exportFormat = formatSelect.value;
  const FPS = getFPS();
  speedSelect.onchange = null;
  fpsSelect.onchange = null;

  const isGif = exportFormat === 'gif';

  // GIF uses reduced resolution for reasonable file size
  const EXPORT_W = isGif ? 960 : 1920;
  const EXPORT_H = isGif ? 540 : 1080;
  const FRAME_DUR = 1 / FPS;
  const totalFrames = calcTotalFrames();

  // Offscreen canvas at export resolution, with ctx.scale() so we can
  // draw using on-screen coordinates directly — the transform handles scaling.
  const oc = document.createElement('canvas');
  oc.width = EXPORT_W;
  oc.height = EXPORT_H;
  const ctx = oc.getContext('2d');

  const canvasRect = canvasEl.getBoundingClientRect();
  const scaleX = EXPORT_W / canvasRect.width;
  const scaleY = EXPORT_H / canvasRect.height;
  ctx.scale(scaleX, scaleY);

  // Load background image if set
  let bgImg = null;
  if (layoutState.bgImage) {
    bgImg = new Image();
    bgImg.src = layoutState.bgImage;
    await new Promise(r => { bgImg.onload = r; });
  }

  // Read positions directly from the on-screen layout (screen pixels)
  const panelRects = panels.map(p => {
    const r = p.canvas.getBoundingClientRect();
    return { x: r.left - canvasRect.left, y: r.top - canvasRect.top, w: r.width, h: r.height };
  });

  const phoneBorder = 4;
  const frameRects = panelRects.map(pr => ({
    x: pr.x - phoneBorder,
    y: pr.y - phoneBorder,
    w: pr.w + phoneBorder * 2,
    h: pr.h + phoneBorder * 2,
  }));

  const labelInfos = panels.map(p => {
    const labelEl = p.panel.querySelector('.panel-label');
    if (labelEl.classList.contains('hidden')) return null;
    const titleInput = p.panel.querySelector('.label-title-input');
    const subtitleInput = p.panel.querySelector('.label-subtitle-input');
    const r = labelEl.getBoundingClientRect();
    return {
      x: r.left - canvasRect.left,
      y: r.top - canvasRect.top,
      title: !titleInput.classList.contains('hidden') ? titleInput.value : null,
      subtitle: !subtitleInput.classList.contains('hidden') ? subtitleInput.value : null,
    };
  });

  // Read computed styles once
  const bgColor = getComputedStyle(canvasEl).backgroundColor;
  const phoneBorderColor = getComputedStyle(document.documentElement).getPropertyValue('--color-phone-border').trim();
  const titleColor = getComputedStyle(document.documentElement).getPropertyValue('--color-label-title').trim();
  const subtitleColor = getComputedStyle(document.documentElement).getPropertyValue('--color-label-subtitle').trim();
  const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;

  // GIF: collect frames directly. Video: use MediaRecorder.
  let recorder, stream, chunks = [], stopped, mimeType;
  if (isGif) {
    framesCurrent.textContent = 'Loading GIF encoder…';
    await loadGifEncoder();
  } else {
    stream = oc.captureStream(0);
    const mimeTypes = {
      webm: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
      mp4: MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm',
    };
    mimeType = mimeTypes[exportFormat] || 'video/webm';
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    stopped = new Promise(r => { recorder.onstop = r; });
    recorder.start();
  }

  // Single render pass for all formats
  const gifFrames = [];
  for (let i = 0; i < totalFrames && !cancelled; i++) {
    const t = i * FRAME_DUR * exportSpeed;
    framesCurrent.textContent = isGif ? `GIF ${i + 1} / ${totalFrames}` : String(i + 1);
    progressFill.style.width = ((i + 1) / totalFrames * 100) + '%';

    // Seek all panels to the correct time
    await Promise.all(panels.map(p => {
      const start = p.inPoint ?? 0;
      const end = p.outPoint ?? p.duration;
      const target = Math.min(start + t, end);
      if (Math.abs(p.video.currentTime - target) < 0.001) return Promise.resolve();
      p.video.currentTime = target;
      return new Promise(r => p.video.addEventListener('seeked', r, { once: true }));
    }));

    drawExportFrame(ctx, panels, panelRects, frameRects, labelInfos, bgImg, bgColor, phoneBorderColor, titleColor, subtitleColor, font, canvasRect.width, canvasRect.height);

    if (isGif) {
      gifFrames.push(ctx.getImageData(0, 0, EXPORT_W, EXPORT_H));
    } else {
      stream.getVideoTracks()[0].requestFrame?.();
    }
    await new Promise(r => setTimeout(r, 0));
  }

  if (recorder) {
    recorder.stop();
    await stopped;
  }

  if (!cancelled) {
    let blob, ext;

    if (isGif) {
      framesCurrent.textContent = 'Encoding GIF…';
      await new Promise(r => setTimeout(r, 0));
      blob = encodeGIF(gifFrames, EXPORT_W, EXPORT_H, Math.round(1000 / FPS));
      ext = 'gif';
    } else {
      ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      blob = new Blob(chunks, { type: mimeType });
    }

    overlay.classList.add('hidden');
    overlay.onclick = null;

    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comparison.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } else {
    overlay.classList.add('hidden');
    overlay.onclick = null;
  }
}

// Extract the frame drawing logic for reuse in GIF encoding
function drawExportFrame(ctx, panels, panelRects, frameRects, labelInfos, bgImg, bgColor, phoneBorderColor, titleColor, subtitleColor, font, w, h) {
  if (bgImg) {
    const ia = bgImg.width / bgImg.height;
    const ca = w / h;
    let sx, sy, sw, sh;
    if (ia > ca) { sh = bgImg.height; sw = sh * ca; sx = (bgImg.width - sw) / 2; sy = 0; }
    else { sw = bgImg.width; sh = sw / ca; sx = 0; sy = (bgImg.height - sh) / 2; }
    ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, w, h);
  } else {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
  }

  for (let j = 0; j < panels.length; j++) {
    const pr = panelRects[j];
    const fr = frameRects[j];
    if (layoutState.frame === 'phone') {
      ctx.fillStyle = phoneBorderColor;
      roundRect(ctx, fr.x, fr.y, fr.w, fr.h, 18);
      ctx.fill();
    }
    const radius = layoutState.frame === 'phone' ? 16 : 12;
    ctx.save();
    roundRect(ctx, pr.x, pr.y, pr.w, pr.h, radius);
    ctx.clip();
    ctx.drawImage(panels[j].video, pr.x, pr.y, pr.w, pr.h);
    ctx.restore();
  }

  for (let j = 0; j < panels.length; j++) {
    const info = labelInfos[j];
    if (!info) continue;
    let y = info.y;
    if (info.title) {
      ctx.font = `600 14px ${font}`;
      ctx.fillStyle = titleColor;
      ctx.textBaseline = 'top';
      ctx.fillText(info.title, info.x, y);
      y += 14 * 1.4;
    }
    if (info.subtitle) {
      ctx.font = `400 12px ${font}`;
      ctx.fillStyle = subtitleColor;
      ctx.textBaseline = 'top';
      ctx.fillText(info.subtitle, info.x, y);
    }
  }
}

// Lazy-load GIF encoder
let _gifEncoderLoaded = false;
function loadGifEncoder() {
  if (_gifEncoderLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'gif-encoder.js';
    s.onload = () => { _gifEncoderLoaded = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Keyboard ──

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (!document.getElementById('export-overlay').classList.contains('hidden')) return;

  switch (e.code) {
    case 'Space': e.preventDefault(); togglePlay(); break;
  }
});
