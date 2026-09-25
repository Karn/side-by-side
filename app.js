// ── Layout state ──

const layoutState = {
  bgImage: null,
  gap: 24,
  canvasPaddingTop: 24,
  canvasPaddingBottom: 24,
  canvasPaddingLeft: 0,
  canvasPaddingRight: 0,
  frame: 'none',
  titleVisible: false,
  subtitleVisible: false,
  labelSize: 's',
  labelPosition: 'top',
};

const labelBaseSizes = { title: 14, subtitle: 12 };
const IPHONE_17_PRO_FRAME_SRC = 'assets/iphone-17-pro-frame.svg';
const IPHONE_17_PRO_SCREEN_WIDTH = 402;
const IPHONE_17_PRO_SCREEN_HEIGHT = 874;
const IPHONE_17_PRO_SCREEN_CLIP_PATH = new Path2D('M100.8 0C65.5166 0 47.8748 -0.0004 34.3984 6.8662C22.5442 12.9062 12.9062 22.5442 6.8662 34.3984C-0.0004 47.8749 0 65.5166 0 100.8V773.2C0 808.483 -0.0004 826.125 6.8662 839.602C12.9062 851.456 22.5442 861.094 34.3984 867.134C47.8749 874 65.5166 874 100.8 874H301.2C336.483 874 354.125 874 367.602 867.134C379.456 861.094 389.094 851.456 395.134 839.602C402 826.125 402 808.483 402 773.2V100.8C402 65.5166 402 47.8748 395.134 34.3984C389.094 22.5442 379.456 12.9062 367.602 6.8662C354.125 -0.0004 336.483 0 301.2 0H100.8Z');
const labelScales = {
  s: 1,
  m: 1.25,
  l: 1.5,
  xl: 2,
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

function applyCanvasPadding() {
  canvasEl.querySelector('.canvas-vpad-top').style.height = layoutState.canvasPaddingTop + 'px';
  canvasEl.querySelector('.canvas-vpad-bottom').style.height = layoutState.canvasPaddingBottom + 'px';
  canvasEl.querySelector('.canvas-hpad-left').style.width = Math.max(8, layoutState.canvasPaddingLeft) + 'px';
  canvasEl.querySelector('.canvas-hpad-right').style.width = Math.max(8, layoutState.canvasPaddingRight) + 'px';
  resizeCanvas();
}

leftPanel.onLoad = () => { applyCanvasPadding(); recordCanvasChange(); };
rightPanel.onLoad = () => { applyCanvasPadding(); recordCanvasChange(); };
leftPanel.onScrubStart = beginCanvasAction;
rightPanel.onScrubStart = beginCanvasAction;
leftPanel.onScrubEnd = recordCanvasChange;
rightPanel.onScrubEnd = recordCanvasChange;

// ── Canvas sizing (16:9 export surface) ──

const stageEl = document.querySelector('.stage');
const canvasEl = document.getElementById('canvas');

function resizeCanvas() {
  const stageStyle = getComputedStyle(stageEl);
  const availW = stageEl.clientWidth - parseFloat(stageStyle.paddingLeft) - parseFloat(stageStyle.paddingRight);
  const availH = stageEl.clientHeight - parseFloat(stageStyle.paddingTop) - parseFloat(stageStyle.paddingBottom);
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

// ── Workspace grid ──

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const dotGrid = document.createElement('div');
dotGrid.className = 'workspace-dots';
dotGrid.setAttribute('aria-hidden', 'true');
document.body.prepend(dotGrid);
let dotCanvas;
let dotContext;
let dotColor;
const dotRippleRadius = 120;
let dotWaves = [];
let dotAnimation = 0;
let dotWidth = 0;
let dotHeight = 0;

function drawWorkspaceDots(now) {
  dotAnimation = 0;
  dotWaves = dotWaves.filter(wave => now - wave.start < wave.duration);
  dotGrid.classList.toggle('animating', dotWaves.length > 0);
  if (!dotWaves.length) return;
  dotContext.clearRect(0, 0, dotWidth, dotHeight);
  dotContext.fillStyle = dotColor;
  dotContext.beginPath();
  for (let y = 12; y < dotHeight; y += 24) {
    for (let x = 12; x < dotWidth; x += 24) {
      let offsetX = 0;
      let offsetY = 0;
      for (const wave of dotWaves) {
        const dx = x - wave.x;
        const dy = y - wave.y;
        const distance = Math.hypot(dx, dy);
        const age = now - wave.start;
        const phase = (distance - age * 0.24) / 18;
        if (distance === 0 || distance >= dotRippleRadius || Math.abs(phase) > 3) continue;
        const displacement = Math.sin(phase * Math.PI) * Math.exp(-phase * phase)
          * 8 * (1 - distance / dotRippleRadius) * (1 - age / wave.duration);
        offsetX += dx / distance * displacement;
        offsetY += dy / distance * displacement;
      }
      dotContext.rect(x + offsetX - 2.5, y + offsetY - 0.5, 5, 1);
      dotContext.rect(x + offsetX - 0.5, y + offsetY - 2.5, 1, 5);
    }
  }
  dotContext.fill();
  if (dotWaves.length) dotAnimation = requestAnimationFrame(drawWorkspaceDots);
}

function resizeWorkspaceDots() {
  if (!dotCanvas) return;
  dotWidth = window.innerWidth;
  dotHeight = window.innerHeight;
  const scale = window.devicePixelRatio || 1;
  dotCanvas.width = Math.round(dotWidth * scale);
  dotCanvas.height = Math.round(dotHeight * scale);
  dotContext.setTransform(scale, 0, 0, scale, 0, 0);
  cancelAnimationFrame(dotAnimation);
  drawWorkspaceDots(performance.now());
}

window.addEventListener('resize', resizeWorkspaceDots);
reducedMotion.addEventListener('change', () => {
  dotWaves = [];
  cancelAnimationFrame(dotAnimation);
  drawWorkspaceDots(performance.now());
});

document.querySelectorAll('.topbar, .bottombar').forEach(rail => {
  rail.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || reducedMotion.matches) return;

    if (!dotCanvas) {
      dotCanvas = document.createElement('canvas');
      dotGrid.append(dotCanvas);
      dotContext = dotCanvas.getContext('2d');
      dotColor = getComputedStyle(dotGrid).getPropertyValue('--color-workspace-dot').trim();
      resizeWorkspaceDots();
    }

    const bounds = button.getBoundingClientRect();
    const x = event.detail ? event.clientX : bounds.left + bounds.width / 2;
    const y = event.detail ? event.clientY : bounds.top + bounds.height / 2;
    dotWaves = dotWaves.slice(-5);
    dotWaves.push({ x, y, start: performance.now(), duration: 650 });
    if (!dotAnimation) dotAnimation = requestAnimationFrame(drawWorkspaceDots);
  }, { capture: true });
});

// ── Dropdowns ──

const dropdownControls = [...document.querySelectorAll('select')].map(createDropdown);

function createDropdown(select) {
  const wrapper = document.createElement('div');
  wrapper.className = 'dropdown';
  wrapper.dataset.dropdownFor = select.id;
  if (select.dataset.dropdownPlacement) {
    wrapper.dataset.dropdownPlacement = select.dataset.dropdownPlacement;
  }

  select.before(wrapper);
  wrapper.append(select);
  select.hidden = true;
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;

  const trigger = document.createElement('button');
  trigger.id = `${select.id}-trigger`;
  trigger.className = 'dropdown-trigger';
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${select.id}-menu`);
  const accessibleName = select.getAttribute('aria-label') || select.title;
  if (accessibleName) trigger.setAttribute('aria-label', accessibleName);
  if (select.title) trigger.title = select.title;

  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'dropdown-trigger-label';
  trigger.append(triggerLabel);

  const menu = document.createElement('div');
  menu.id = `${select.id}-menu`;
  menu.className = 'dropdown-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  if (accessibleName) menu.setAttribute('aria-label', accessibleName);

  const options = [...select.options].map(nativeOption => {
    const option = document.createElement('button');
    option.className = 'dropdown-option';
    option.type = 'button';
    option.setAttribute('role', 'option');
    option.dataset.value = nativeOption.value;
    option.textContent = nativeOption.textContent;
    option.disabled = nativeOption.disabled;
    menu.append(option);
    return option;
  });

  wrapper.append(trigger, menu);

  const close = () => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };

  const open = (focusSelectedOption = true) => {
    dropdownControls.forEach(control => {
      if (control.wrapper !== wrapper) control.close();
    });
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    if (focusSelectedOption) {
      const selectedIndex = Math.max(0, select.selectedIndex);
      options[selectedIndex]?.focus();
    }
  };

  const update = () => {
    const selectedIndex = Math.max(0, select.selectedIndex);
    triggerLabel.textContent = select.options[selectedIndex]?.textContent ?? '';
    trigger.disabled = select.disabled;
    options.forEach((option, index) => {
      option.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
      option.disabled = select.options[index].disabled;
    });
    if (select.disabled) close();
  };

  trigger.addEventListener('click', event => {
    if (menu.hidden) {
      open(event.detail === 0);
    } else {
      close();
      if (event.detail > 0) trigger.blur();
    }
  });
  trigger.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    open();
  });
  options.forEach((option, index) => {
    option.addEventListener('click', event => {
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      close();
      if (event.detail === 0) {
        trigger.focus();
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  });
  menu.addEventListener('keydown', event => {
    const enabledOptions = options.filter(option => !option.disabled);
    const currentIndex = enabledOptions.indexOf(document.activeElement);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % enabledOptions.length;
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + enabledOptions.length) % enabledOptions.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = enabledOptions.length - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      close();
      trigger.focus();
      return;
    } else {
      return;
    }

    event.preventDefault();
    enabledOptions[nextIndex]?.focus();
  });
  wrapper.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      if (!wrapper.contains(document.activeElement)) close();
    });
  });
  select.addEventListener('change', update);
  new MutationObserver(update).observe(select, {
    attributes: true,
    attributeFilter: ['disabled'],
  });

  update();
  return { wrapper, trigger, close };
}

document.addEventListener('pointerdown', event => {
  dropdownControls.forEach(control => {
    if (control.wrapper.contains(event.target)) return;
    control.close();
    requestAnimationFrame(() => {
      if (document.activeElement === control.trigger) control.trigger.blur();
    });
  });
});

// ── Bottom rail ──

const btnPlay = document.getElementById('btn-play');
const btnPlayLabel = btnPlay.querySelector('.button-label');
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
let layoutBgFile = null;

// Background button toggles the current image: clear it when set, or open the picker.
btnBg.addEventListener('click', () => {
  if (layoutState.bgImage) {
    clearLayoutBg();
  } else {
    layoutBgInput.click();
  }
});

// Frame type
layoutFrameSelect.addEventListener('change', () => {
  layoutState.frame = layoutFrameSelect.value;
  applyFrameType();
});

function applyFrameType() {
  canvasEl.querySelectorAll('.video-player-frame').forEach((el) => {
    el.classList.remove('frame-generic-android', 'frame-iphone-17-pro', 'frame-app');
    if (layoutState.frame === 'generic-android') el.classList.add('frame-generic-android');
    else if (layoutState.frame === 'iphone-17-pro') el.classList.add('frame-iphone-17-pro');
    else if (layoutState.frame === 'app') el.classList.add('frame-app');
  });
}

// Background image
layoutBgInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setLayoutBg(file);
});

function setLayoutBg(file) {
  if (layoutState.bgImage) URL.revokeObjectURL(layoutState.bgImage);
  layoutBgFile = file;
  layoutState.bgImage = file ? URL.createObjectURL(file) : null;
  layoutBgInput.value = '';
  applyLayoutBg();
}

function clearLayoutBg() {
  setLayoutBg(null);
}

function applyLayoutBg() {
  const hasBackground = Boolean(layoutState.bgImage);
  btnBg.classList.toggle('on', hasBackground);
  btnBg.setAttribute('aria-pressed', hasBackground);
  btnBg.title = hasBackground ? 'Clear background image' : 'Set background image';
  btnBg.textContent = hasBackground ? 'Remove image' : 'Choose image';

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
  beginCanvasAction();
  vpadDragging = 'top';
  vpadStartY = e.clientY;
  vpadStartVal = layoutState.canvasPaddingTop;
});

vpadBottom.addEventListener('mousedown', (e) => {
  e.preventDefault();
  beginCanvasAction();
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
  recordCanvasChange();
});

// ── Draggable horizontal padding handles ──

const hpadLeft = canvasEl.querySelector('.canvas-hpad-left');
const hpadRight = canvasEl.querySelector('.canvas-hpad-right');
let hpadDragging = null; // 'left' or 'right'
let hpadStartX = 0;
let hpadStartVal = 0;

hpadLeft.addEventListener('mousedown', (e) => {
  e.preventDefault();
  beginCanvasAction();
  hpadDragging = 'left';
  hpadStartX = e.clientX;
  hpadStartVal = layoutState.canvasPaddingLeft;
});

hpadRight.addEventListener('mousedown', (e) => {
  e.preventDefault();
  beginCanvasAction();
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
  recordCanvasChange();
});

// ── Draggable divider (gap column) ──

const dividerHandle = panelDivider.querySelector('.divider-handle');
let dividerDragging = false;
let dividerStartX = 0;
let dividerStartGap = 0;

dividerHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  beginCanvasAction();
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
  recordCanvasChange();
});

function applyLayoutGap() {
  panelDivider.style.width = Math.max(24, layoutState.gap) + 'px';
}

// ── Playback ──

function togglePlay() {
  playing ? stopPlay() : startPlay();
  recordCanvasChange();
}

function startPlay() {
  if (!leftPanel.loaded && !rightPanel.loaded) return;
  playing = true;
  btnPlayLabel.textContent = 'Pause';
  btnPlay.classList.add('on');
  applySpeed();

  if (leftPanel.loaded) leftPanel.currentTime = leftPanel.inPoint ?? 0;
  if (rightPanel.loaded) rightPanel.currentTime = rightPanel.inPoint ?? 0;

  leftPanel.startRendering(); rightPanel.startRendering();
  leftPanel.play(); rightPanel.play();
}

function stopPlay() {
  playing = false;
  btnPlayLabel.textContent = 'Play';
  btnPlay.classList.remove('on');
  leftPanel.pause(); rightPanel.pause();
  leftPanel.stopRendering(); rightPanel.stopRendering();
}

// ── Title / Subtitle controls ──

const btnTitle = document.getElementById('btn-title');
const btnSubtitle = document.getElementById('btn-subtitle');
const labelSizeSelect = document.getElementById('label-size-select');
const labelPositionSelect = document.getElementById('label-position-select');

btnTitle.addEventListener('click', () => {
  layoutState.titleVisible = !layoutState.titleVisible;
  btnTitle.classList.toggle('on', layoutState.titleVisible);
  btnTitle.setAttribute('aria-pressed', layoutState.titleVisible);
  applyLabelSettings();
});

btnSubtitle.addEventListener('click', () => {
  layoutState.subtitleVisible = !layoutState.subtitleVisible;
  btnSubtitle.classList.toggle('on', layoutState.subtitleVisible);
  btnSubtitle.setAttribute('aria-pressed', layoutState.subtitleVisible);
  applyLabelSettings();
});

labelSizeSelect.addEventListener('change', () => {
  layoutState.labelSize = labelSizeSelect.value;
  applyLabelSettings();
});

labelPositionSelect.addEventListener('change', () => {
  layoutState.labelPosition = labelPositionSelect.value;
  applyLabelSettings();
});

function applyLabelSettings() {
  const scale = labelScales[layoutState.labelSize];
  canvasEl.style.setProperty('--label-title-size', labelBaseSizes.title * scale + 'px');
  canvasEl.style.setProperty('--label-subtitle-size', labelBaseSizes.subtitle * scale + 'px');
  canvasEl.dataset.labelPosition = layoutState.labelPosition;

  canvasEl.querySelectorAll('.label-title-input').forEach(el => el.classList.toggle('hidden', !layoutState.titleVisible));
  canvasEl.querySelectorAll('.label-subtitle-input').forEach(el => el.classList.toggle('hidden', !layoutState.subtitleVisible));
  canvasEl.querySelectorAll('.panel-label').forEach(el => {
    el.classList.toggle('hidden', !layoutState.titleVisible && !layoutState.subtitleVisible);
  });
}

applyLabelSettings();

// ── Canvas history ──

const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const platform = navigator.userAgentData?.platform || navigator.platform;
const metaSymbol = /Win/i.test(platform) ? '⊞' : /Mac/i.test(platform) ? '⌘' : 'Meta+';
btnUndo.title = `Undo (${metaSymbol}Z)`;
btnRedo.title = `Redo (${metaSymbol}Shift+Z)`;
btnExport.title = `Export trimmed clip (${metaSymbol}E)`;
btnExport.querySelector('kbd').textContent = `${metaSymbol}E`;
const appDialogOverlay = document.getElementById('app-dialog-overlay');
const appDialogTitle = document.getElementById('app-dialog-title');
const appDialogMessage = document.getElementById('app-dialog-message');
const appDialogCancel = document.getElementById('app-dialog-cancel');
const appDialogConfirm = document.getElementById('app-dialog-confirm');
let dialogQueue = Promise.resolve();

function showAppDialog({ title, message, confirmText = 'OK', cancelText = null }) {
  const shown = dialogQueue.then(() => new Promise(resolve => {
    const previousFocus = document.activeElement;
    appDialogTitle.textContent = title;
    appDialogMessage.textContent = message;
    appDialogConfirm.textContent = confirmText;
    appDialogCancel.hidden = !cancelText;
    if (cancelText) appDialogCancel.textContent = cancelText;
    appDialogOverlay.classList.remove('hidden');

    let closed = false;
    const finish = accepted => {
      if (closed) return;
      closed = true;
      appDialogOverlay.classList.add('hidden');
      appDialogOverlay.onclick = null;
      appDialogOverlay.onkeydown = null;
      appDialogConfirm.onclick = null;
      appDialogCancel.onclick = null;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      resolve(accepted);
    };
    appDialogConfirm.onclick = () => finish(true);
    appDialogCancel.onclick = () => finish(false);
    appDialogOverlay.onclick = event => {
      if (event.target === appDialogOverlay) finish(!cancelText);
    };
    appDialogOverlay.onkeydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(!cancelText);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const buttons = cancelText ? [appDialogCancel, appDialogConfirm] : [appDialogConfirm];
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
      }
    };
    (cancelText ? appDialogCancel : appDialogConfirm).focus();
  }));
  dialogQueue = shown.then(() => undefined);
  return shown;
}

leftPanel.onError = error => void showAppDialog({ title: 'Unable to load video', message: error.message });
rightPanel.onError = error => void showAppDialog({ title: 'Unable to load video', message: error.message });

function capturePanel(panel) {
  return {
    file: panel.loaded ? panel.file : null,
    inPoint: panel.inPoint,
    outPoint: panel.outPoint,
    currentTime: panel.loaded ? (panel._preHoverTime ?? panel.currentTime) : 0,
    title: panel.panel.querySelector('.label-title-input').value,
    subtitle: panel.panel.querySelector('.label-subtitle-input').value,
  };
}

function captureCanvas() {
  const { bgImage, ...layout } = layoutState;
  return {
    version: 1,
    layout,
    backgroundFile: layoutBgFile,
    left: capturePanel(leftPanel),
    right: capturePanel(rightPanel),
    speed: speedSel.value,
    exportFormat: document.getElementById('export-format').value,
    exportFps: document.getElementById('export-fps').value,
  };
}

function waitForVideoEvent(video, name) {
  return new Promise((resolve, reject) => {
    if (video.error) {
      reject(new Error('Could not restore the saved video.'));
      return;
    }
    const finish = error => {
      clearTimeout(timeout);
      video.removeEventListener(name, onReady);
      video.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(new Error('Could not restore the saved video.'));
    const timeout = setTimeout(() => finish(new Error('Timed out restoring the saved video.')), 30000);
    video.addEventListener(name, onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

async function restorePanel(panel, state) {
  panel._onLaneLeave();
  if (panel.file !== state.file || (state.file && !panel.loaded)) {
    panel.unload();
    if (state.file) await panel.loadFile(state.file);
  }
  panel.panel.querySelector('.label-title-input').value = state.title;
  panel.panel.querySelector('.label-subtitle-input').value = state.subtitle;
  if (!state.file) return;

  panel.inPoint = state.inPoint;
  panel.outPoint = state.outPoint;
  panel._updateRangeVisual();
  const target = Math.max(0, Math.min(state.currentTime, panel.duration));
  if (Math.abs(panel.currentTime - target) > 0.001) {
    const seeked = waitForVideoEvent(panel.video, 'seeked');
    panel.currentTime = target;
    await seeked;
  }
  if (panel.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForVideoEvent(panel.video, 'loadeddata');
  }
  panel._drawFrame();
}

async function restoreCanvas(state) {
  if (state?.version !== 1) throw new Error('This saved canvas uses an unsupported format.');
  stopPlay();
  Object.assign(layoutState, state.layout);
  setLayoutBg(state.backgroundFile);
  layoutFrameSelect.value = layoutState.frame;
  labelSizeSelect.value = layoutState.labelSize;
  labelPositionSelect.value = layoutState.labelPosition;
  speedSel.value = state.speed;
  document.getElementById('export-format').value = state.exportFormat;
  document.getElementById('export-fps').value = state.exportFps;
  [layoutFrameSelect, labelSizeSelect, labelPositionSelect, speedSel,
    document.getElementById('export-format'), document.getElementById('export-fps')]
    .forEach(select => select.dispatchEvent(new Event('change')));
  btnTitle.classList.toggle('on', layoutState.titleVisible);
  btnTitle.setAttribute('aria-pressed', layoutState.titleVisible);
  btnSubtitle.classList.toggle('on', layoutState.subtitleVisible);
  btnSubtitle.setAttribute('aria-pressed', layoutState.subtitleVisible);
  applyLabelSettings();
  applyLayoutGap();
  applyCanvasPadding();
  await Promise.all([
    restorePanel(leftPanel, state.left),
    restorePanel(rightPanel, state.right),
  ]);
  applySpeed();
}

let canvasErrorKey = null;
function canvasError(error) {
  console.error(error);
  const message = error?.name === 'QuotaExceededError'
    ? 'Browser storage is full. Free space, then make another change to retry autosave.'
    : error?.message || 'Could not update this canvas.';
  if (canvasErrorKey === message) return;
  canvasErrorKey = message;
  void showAppDialog({ title: 'Canvas', message });
}

const fileKeys = new WeakMap();
let nextFileKey = 0;

function fileKey(file) {
  if (!file) return null;
  if (!fileKeys.has(file)) fileKeys.set(file, ++nextFileKey);
  return fileKeys.get(file);
}

function snapshotKey(state) {
  return JSON.stringify({
    ...state,
    backgroundFile: fileKey(state.backgroundFile),
    left: { ...state.left, file: fileKey(state.left.file) },
    right: { ...state.right, file: fileKey(state.right.file) },
  });
}

const emptyCanvas = captureCanvas();
let history = [emptyCanvas];
let historyKeys = [snapshotKey(emptyCanvas)];
let historyIndex = 0;
let historyReady = false;
let historyBusy = false;
let textChangeTimer = null;
let pendingState = null;
let persisting = false;

function updateHistoryButtons() {
  const pendingText = textChangeTimer !== null;
  btnUndo.disabled = !historyReady || historyBusy || (historyIndex === 0 && !pendingText);
  btnRedo.disabled = !historyReady || historyBusy || pendingText || historyIndex === history.length - 1;
}

function beginCanvasAction() {
  if (!historyReady || historyBusy) return;
  flushTextChange();
  const state = captureCanvas();
  history[historyIndex] = state;
  historyKeys[historyIndex] = snapshotKey(state);
}

function queuePersist(state = captureCanvas()) {
  if (!historyReady) return;
  pendingState = state;
  if (persisting) return;
  persisting = true;
  void (async () => {
    while (pendingState) {
      const next = pendingState;
      pendingState = null;
      try {
        await CanvasStorage.saveCurrent(next);
        canvasErrorKey = null;
      } catch (error) {
        canvasError(error);
        pendingState = null;
      }
    }
    persisting = false;
  })();
}

function recordCanvasChange() {
  if (!historyReady || historyBusy) return;
  const state = captureCanvas();
  const key = snapshotKey(state);
  if (key === historyKeys[historyIndex]) return;

  history.length = historyIndex + 1;
  historyKeys.length = historyIndex + 1;
  history.push(state);
  historyKeys.push(key);
  if (history.length > 100) {
    history.shift();
    historyKeys.shift();
  }
  historyIndex = history.length - 1;
  updateHistoryButtons();
  queuePersist(state);
}

function flushTextChange() {
  if (textChangeTimer === null) return;
  clearTimeout(textChangeTimer);
  textChangeTimer = null;
  recordCanvasChange();
  updateHistoryButtons();
}

async function moveHistory(direction) {
  if (!historyReady || historyBusy) return;
  flushTextChange();
  const nextIndex = historyIndex + direction;
  if (nextIndex < 0 || nextIndex >= history.length) return;
  historyBusy = true;
  document.body.inert = true;
  updateHistoryButtons();
  try {
    await restoreCanvas(history[nextIndex]);
    historyIndex = nextIndex;
    history[historyIndex] = captureCanvas();
    historyKeys[historyIndex] = snapshotKey(history[historyIndex]);
    queuePersist(history[historyIndex]);
  } catch (error) {
    canvasError(error);
  } finally {
    historyBusy = false;
    document.body.inert = false;
    updateHistoryButtons();
  }
}

btnUndo.addEventListener('click', () => void moveHistory(-1));
btnRedo.addEventListener('click', () => void moveHistory(1));

document.getElementById('btn-new').addEventListener('click', async () => {
  if (!historyReady || historyBusy) return;
  if (snapshotKey(captureCanvas()) !== snapshotKey(emptyCanvas)) {
    const accepted = await showAppDialog({
      title: 'New canvas',
      message: 'Create a new canvas? You can undo this change.',
      confirmText: 'Create',
      cancelText: 'Cancel',
    });
    if (!accepted) return;
  }
  historyBusy = true;
  document.body.inert = true;
  updateHistoryButtons();
  try {
    await restoreCanvas(emptyCanvas);
  } catch (error) {
    canvasError(error);
  } finally {
    historyBusy = false;
    document.body.inert = false;
    updateHistoryButtons();
  }
  recordCanvasChange();
});

document.addEventListener('focusin', event => {
  if (event.target.matches('.label-title-input, .label-subtitle-input')) beginCanvasAction();
});
document.addEventListener('focusout', event => {
  if (event.target.matches('.label-title-input, .label-subtitle-input')) flushTextChange();
});
document.addEventListener('input', event => {
  if (event.target.matches('.label-title-input, .label-subtitle-input')) {
    queuePersist();
    if (textChangeTimer !== null) clearTimeout(textChangeTimer);
    textChangeTimer = setTimeout(() => {
      textChangeTimer = null;
      recordCanvasChange();
      updateHistoryButtons();
    }, 700);
    updateHistoryButtons();
  }
});
document.addEventListener('change', event => {
  if (event.target.matches(
    '#layout-frame-select, #layout-bg-input, #label-size-select, #label-position-select, ' +
    '#speed, #export-format, #export-fps'
  )) recordCanvasChange();
});
document.addEventListener('click', event => {
  if (event.target.closest('#btn-bg, #btn-title, #btn-subtitle')) {
    recordCanvasChange();
  }
});
document.addEventListener('mousemove', () => {
  if (historyReady && !historyBusy &&
      (vpadDragging || hpadDragging || dividerDragging ||
       leftPanel._dragging || rightPanel._dragging)) queuePersist();
});

let lastPlaybackSave = 0;
function persistPlayback() {
  if (!historyReady || historyBusy || !playing || Date.now() - lastPlaybackSave < 2000) return;
  lastPlaybackSave = Date.now();
  queuePersist();
}
leftPanel.video.addEventListener('timeupdate', persistPlayback);
rightPanel.video.addEventListener('timeupdate', persistPlayback);

document.body.inert = true;
async function initializeHistory() {
  let canPersist = true;
  try {
    const saved = await CanvasStorage.loadCurrent();
    if (saved) {
      historyBusy = true;
      await restoreCanvas(saved);
    }
  } catch (error) {
    canPersist = false;
    canvasError(error);
  } finally {
    historyBusy = false;
    const state = captureCanvas();
    history = [state];
    historyKeys = [snapshotKey(state)];
    historyIndex = 0;
    historyReady = true;
    document.body.inert = false;
    updateHistoryButtons();
    if (canPersist) queuePersist(state);
  }
}
void initializeHistory();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.error));
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
  const fpsSelect = document.getElementById('export-fps');

  const duration = Math.max(...panels.map(p => (p.outPoint ?? p.duration) - (p.inPoint ?? 0)));

  function calcTotalFrames() {
    const speed = parseFloat(speedSel.value) || 1;
    const fps = parseInt(fpsSelect.value) || 30;
    return Math.ceil((duration / speed) * fps);
  }

  overlay.classList.remove('hidden');
  progressFill.style.width = '0%';
  framesCurrent.textContent = '0';
  framesTotal.textContent = calcTotalFrames();
  actionBtn.textContent = 'Export';
  actionBtn.classList.remove('on');
  formatSelect.disabled = false;
  fpsSelect.disabled = false;
  actionBtn.focus();

  // Recalculate total when fps changes
  fpsSelect.onchange = () => { framesTotal.textContent = calcTotalFrames(); };

  let cancelled = false;
  const closeOverlay = () => {
    overlay.classList.add('hidden');
    overlay.onclick = null;
    actionBtn.onclick = null;
    fpsSelect.onchange = null;
  };
  const dismiss = () => {
    cancelled = true;
    closeOverlay();
  };
  overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };

  // Wait for user to click Export or dismiss
  await new Promise(resolve => {
    actionBtn.onclick = () => {
      actionBtn.textContent = 'Cancel';
      actionBtn.classList.add('on');
      formatSelect.disabled = true;
      fpsSelect.disabled = true;
      resolve();
    };
    overlay.onclick = (e) => { if (e.target === overlay) { dismiss(); resolve(); } };
  });

  if (cancelled) return;

  actionBtn.onclick = dismiss;
  overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };

  const exportSpeed = parseFloat(speedSel.value) || 1;
  const exportFormat = formatSelect.value;
  const FPS = parseInt(fpsSelect.value) || 30;
  fpsSelect.onchange = null;

  framesCurrent.textContent = 'Loading exporter…';
  let exportPlugin;
  try {
    exportPlugin = await ExportPlugins.resolve(exportFormat, { fps: FPS });
  } catch (error) {
    closeOverlay();
    throw error;
  }
  const { width: EXPORT_W, height: EXPORT_H } = exportPlugin.outputSize;
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

  let iphone17ProFrameImg = null;
  if (layoutState.frame === 'iphone-17-pro') {
    iphone17ProFrameImg = new Image();
    iphone17ProFrameImg.src = IPHONE_17_PRO_FRAME_SRC;
    await iphone17ProFrameImg.decode();
  }

  // Read positions directly from the on-screen layout (screen pixels)
  const panelRects = panels.map(p => {
    const r = p.canvas.getBoundingClientRect();
    return { x: r.left - canvasRect.left, y: r.top - canvasRect.top, w: r.width, h: r.height };
  });

  const frameRects = panels.map(p => {
    const r = p.frame.getBoundingClientRect();
    return { x: r.left - canvasRect.left, y: r.top - canvasRect.top, w: r.width, h: r.height };
  });

  const labelInfos = panels.map(p => {
    const labelEl = p.panel.querySelector('.panel-label');
    if (labelEl.classList.contains('hidden')) return null;
    const titleInput = p.panel.querySelector('.label-title-input');
    const subtitleInput = p.panel.querySelector('.label-subtitle-input');
    const titleStyle = getComputedStyle(titleInput);
    const subtitleStyle = getComputedStyle(subtitleInput);
    const r = labelEl.getBoundingClientRect();
    return {
      x: r.left - canvasRect.left,
      y: r.top - canvasRect.top,
      title: !titleInput.classList.contains('hidden') ? titleInput.value : null,
      subtitle: !subtitleInput.classList.contains('hidden') ? subtitleInput.value : null,
      titleFontSize: parseFloat(titleStyle.fontSize),
      titleFontWeight: titleStyle.fontWeight,
      titleLineHeight: parseFloat(titleStyle.lineHeight),
      subtitleFontSize: parseFloat(subtitleStyle.fontSize),
      subtitleFontWeight: subtitleStyle.fontWeight,
    };
  });

  // Read computed styles once
  const bgColor = getComputedStyle(canvasEl).backgroundColor;
  const genericAndroidBorderColor = getComputedStyle(document.documentElement).getPropertyValue('--color-generic-android-border').trim();
  const titleColor = getComputedStyle(document.documentElement).getPropertyValue('--color-label-title').trim();
  const subtitleColor = getComputedStyle(document.documentElement).getPropertyValue('--color-label-subtitle').trim();
  const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;

  let exporter;
  try {
    exporter = await exportPlugin.createSession({
      canvas: oc,
      context: ctx,
      width: EXPORT_W,
      height: EXPORT_H,
      fps: FPS,
      setStatus: status => { framesCurrent.textContent = status; },
    });
  } catch (error) {
    closeOverlay();
    throw error;
  }

  let blob = null;
  panels.forEach(panel => { panel.renderSuspended = true; });
  try {
    for (let i = 0; i < totalFrames && !cancelled; i++) {
      const t = i * FRAME_DUR * exportSpeed;
      framesCurrent.textContent = exportPlugin.frameLabel?.(i + 1, totalFrames) ?? String(i + 1);
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

      drawExportFrame(ctx, panels, panelRects, frameRects, labelInfos, bgImg, iphone17ProFrameImg, bgColor, genericAndroidBorderColor, titleColor, subtitleColor, font, canvasRect.width, canvasRect.height);
      await exporter.addFrame(i);
      await new Promise(r => setTimeout(r, 0));
    }

    if (cancelled) {
      await exporter.cancel();
    } else {
      const result = await exporter.finish();
      if (!cancelled) blob = result;
    }
  } catch (error) {
    await exporter.cancel().catch(() => {});
    throw error;
  } finally {
    panels.forEach(panel => {
      panel.renderSuspended = false;
      panel._drawFrame();
    });
    closeOverlay();
  }

  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison.${exportPlugin.extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function drawExportFrame(ctx, panels, panelRects, frameRects, labelInfos, bgImg, iphone17ProFrameImg, bgColor, genericAndroidBorderColor, titleColor, subtitleColor, font, w, h) {
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
    if (layoutState.frame === 'generic-android') {
      ctx.fillStyle = genericAndroidBorderColor;
      roundRect(ctx, fr.x, fr.y, fr.w, fr.h, 18);
      ctx.fill();
    }
    if (layoutState.frame === 'iphone-17-pro') {
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.scale(pr.w / IPHONE_17_PRO_SCREEN_WIDTH, pr.h / IPHONE_17_PRO_SCREEN_HEIGHT);
      ctx.clip(IPHONE_17_PRO_SCREEN_CLIP_PATH);
      drawImageCover(ctx, panels[j].video, 0, 0, IPHONE_17_PRO_SCREEN_WIDTH, IPHONE_17_PRO_SCREEN_HEIGHT);
      ctx.restore();
    } else {
      const radius = layoutState.frame === 'generic-android' ? 16 : 12;
      ctx.save();
      roundRect(ctx, pr.x, pr.y, pr.w, pr.h, radius);
      ctx.clip();
      ctx.drawImage(panels[j].video, pr.x, pr.y, pr.w, pr.h);
      ctx.restore();
    }

    if (iphone17ProFrameImg) {
      ctx.drawImage(iphone17ProFrameImg, fr.x, fr.y, fr.w, fr.h);
    }
  }

  for (let j = 0; j < panels.length; j++) {
    const info = labelInfos[j];
    if (!info) continue;
    let y = info.y;
    if (info.title) {
      ctx.font = `${info.titleFontWeight} ${info.titleFontSize}px ${font}`;
      ctx.fillStyle = titleColor;
      ctx.textBaseline = 'top';
      ctx.fillText(info.title, info.x, y);
      y += info.titleLineHeight;
    }
    if (info.subtitle) {
      ctx.font = `${info.subtitleFontWeight} ${info.subtitleFontSize}px ${font}`;
      ctx.fillStyle = subtitleColor;
      ctx.textBaseline = 'top';
      ctx.fillText(info.subtitle, info.x, y);
    }
  }
}

function drawImageCover(ctx, image, x, y, w, h) {
  const sourceW = image.videoWidth || image.width;
  const sourceH = image.videoHeight || image.height;
  const sourceRatio = sourceW / sourceH;
  const targetRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = sourceW;
  let sh = sourceH;

  if (sourceRatio > targetRatio) {
    sw = sourceH * targetRatio;
    sx = (sourceW - sw) / 2;
  } else {
    sh = sourceW / targetRatio;
    sy = (sourceH - sh) / 2;
  }

  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
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
  if (e.metaKey && !e.ctrlKey && !e.altKey &&
      (e.code === 'KeyZ' || (!e.shiftKey && (e.code === 'KeyS' || e.code === 'KeyE')))) {
    e.preventDefault();
    if (e.repeat || !appDialogOverlay.classList.contains('hidden') ||
        !document.getElementById('export-overlay').classList.contains('hidden') ||
        !historyReady || historyBusy) return;
    if (e.code === 'KeyZ') void moveHistory(e.shiftKey ? 1 : -1);
    else if (e.code === 'KeyS') queuePersist();
    else void exportCanvas();
    return;
  }
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (document.querySelector('.dropdown-menu:not([hidden])')) return;
  if (!appDialogOverlay.classList.contains('hidden')) return;
  if (!document.getElementById('export-overlay').classList.contains('hidden')) return;
  if (e.repeat) return;

  switch (e.code) {
    case 'Space':
      if (target?.closest('button, [role="option"]')) return;
      e.preventDefault();
      togglePlay();
      break;
  }
});
