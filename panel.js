const FRAME_DURATION = 1 / 30;

function fmtTime(s) {
  if (!isFinite(s)) return '0:00.000';
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`;
}

class VideoPanel {
  constructor(containerEl, timelineEl) {
    this.panel = containerEl;
    this.frame = containerEl.querySelector('.video-player-frame');
    this.titlebarTitle = this.frame.querySelector('.app-titlebar-title');
    this.canvas = this.frame.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.lane = timelineEl.querySelector('.timeline-lane');
    this.laneRange = this.lane.querySelector('.lane-range');
    this.handleIn = this.lane.querySelector('.range-in');
    this.handleOut = this.lane.querySelector('.range-out');
    this.tooltipIn = this.handleIn.querySelector('.range-tooltip');
    this.tooltipOut = this.handleOut.querySelector('.range-tooltip');
    this.playhead = this.lane.querySelector('.lane-playhead');
    this.timelineBar = timelineEl;
    this.panelContent = containerEl.querySelector('.panel-content');
    this.dropZone = containerEl.querySelector('.drop-zone');
    this.fileInput = this.dropZone.querySelector('input[type="file"]');
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.loaded = false;
    this.file = null;
    this.inPoint = null;
    this.outPoint = null;
    this._rafId = null;
    this._dragging = null;   // 'in' | 'out' | 'range' | null
    this._dragStartRatio = 0;
    this._dragStartIn = 0;
    this._dragStartOut = 0;
    this._hoverTime = null;
    this._preHoverTime = null;

    // File input
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) this.loadFile(e.target.files[0]);
    });

    // Drag-and-drop
    const dz = this.dropZone;
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('video/')) this.loadFile(f);
    });

    // Lane mouse interaction
    this.lane.addEventListener('mousedown', (e) => this._onLaneDown(e));
    document.addEventListener('mousemove', (e) => this._onLaneMove(e));
    document.addEventListener('mouseup', () => this._onLaneUp());
    this.lane.addEventListener('mousemove', (e) => this._onLaneHover(e));
    this.lane.addEventListener('mouseleave', () => this._onLaneLeave());

    // Redraw on seek
    this.video.addEventListener('seeked', () => this._drawFrame());
  }

  loadFile(file) {
    this.file = file;
    this.titlebarTitle.textContent = file.name;
    this.inPoint = null;
    this.outPoint = null;
    this._updateTrimBadge();
    if (this.video.src) URL.revokeObjectURL(this.video.src);
    this.video.src = URL.createObjectURL(file);
    this.video.load();
    return new Promise((resolve) => {
      this.video.addEventListener('loadedmetadata', () => {
        this.loaded = true;
        this.frame.classList.add('loaded');
        this.dropZone.classList.add('hidden');
        this.panelContent.classList.add('loaded');
        this.timelineBar.classList.remove('empty');
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.video.currentTime = 0;
        this._drawFrame();
        this._updateUI();
        this._updateRangeVisual();

        if (this.onLoad) this.onLoad();
        resolve();
      }, { once: true });
    });
  }

  clearTrim() {
    this.inPoint = null;
    this.outPoint = null;
    this._updateTrimBadge();
    this._updateRangeVisual();
  }

  setRangeMode() {}

  _updateTrimBadge() {}

  // ── Range visual ──

  _updateRangeVisual() {
    const d = this.duration;
    if (d <= 0) return;
    const lo = ((this.inPoint ?? 0) / d) * 100;
    const hi = ((this.outPoint ?? d) / d) * 100;
    this.laneRange.style.left = lo + '%';
    this.laneRange.style.width = (hi - lo) + '%';
    this.handleIn.style.left = lo + '%';
    this.handleOut.style.left = hi + '%';
  }

  // ── Frame rendering ──

  _drawFrame() {
    if (!this.loaded) return;
    // Enforce playback range
    if (!this.video.paused) {
      const end = this.outPoint ?? this.video.duration;
      if (this.video.currentTime >= end) {
        this.video.currentTime = this.inPoint ?? 0;
      }
    }
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    this._updateUI();
  }

  _updateUI() {
    if (!this.loaded) return;
    const d = this.video.duration;
    this.playhead.style.left = (d > 0 ? (this.video.currentTime / d) * 100 : 0) + '%';
  }

  startRendering() {
    const loop = () => { this._drawFrame(); this._rafId = requestAnimationFrame(loop); };
    this._rafId = requestAnimationFrame(loop);
  }

  stopRendering() {
    if (this._rafId != null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this.loaded) this._drawFrame();
  }

  play() { if (this.loaded) this.video.play(); }
  pause() { if (this.loaded) { this.video.pause(); this._drawFrame(); } }

  get paused() { return this.video.paused; }
  get currentTime() { return this.video.currentTime; }
  set currentTime(v) { this.video.currentTime = Math.max(0, Math.min(v, this.video.duration || 0)); }
  get duration() { return this.video.duration || 0; }
  set playbackRate(r) { this.video.playbackRate = r; }

  // ── Lane mouse handlers ──

  _xToRatio(e) {
    const rect = this.lane.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  _onLaneDown(e) {
    if (!this.loaded) return;
    e.preventDefault();
    const ratio = this._xToRatio(e);
    const d = this.duration;

    const inR = (this.inPoint ?? 0) / d;
    const outR = (this.outPoint ?? d) / d;
    const thresh = 14 / this.lane.getBoundingClientRect().width;

    if (Math.abs(ratio - inR) <= thresh && Math.abs(ratio - inR) <= Math.abs(ratio - outR)) {
      this._dragging = 'in';
      this._showHandleTooltip('in');
    } else if (Math.abs(ratio - outR) <= thresh) {
      this._dragging = 'out';
      this._showHandleTooltip('out');
    } else if (ratio > inR + thresh && ratio < outR - thresh) {
      this._dragging = 'range';
      this._dragStartRatio = ratio;
      this._dragStartIn = this.inPoint ?? 0;
      this._dragStartOut = this.outPoint ?? d;
    } else {
      // Click outside handles: snap nearest edge
      if (Math.abs(ratio - inR) < Math.abs(ratio - outR)) {
        this.inPoint = ratio * d;
        this._dragging = 'in';
        this._showHandleTooltip('in');
      } else {
        this.outPoint = ratio * d;
        this._dragging = 'out';
        this._showHandleTooltip('out');
      }
      this._updateTrimBadge();
      this._updateRangeVisual();
    }
    this.timelineBar.classList.add('dragging');
  }

  _onLaneMove(e) {
    if (!this._dragging || !this.loaded) return;
    const ratio = this._xToRatio(e);
    const d = this.duration;

    if (this._dragging === 'in') {
      this.inPoint = Math.max(0, Math.min(ratio * d, (this.outPoint ?? d) - FRAME_DURATION));
      this.video.currentTime = this.inPoint;
      this.tooltipIn.textContent = fmtTime(this.inPoint);
      this._updateTrimBadge();
      this._updateRangeVisual();

    } else if (this._dragging === 'out') {
      this.outPoint = Math.min(d, Math.max(ratio * d, (this.inPoint ?? 0) + FRAME_DURATION));
      this.video.currentTime = this.outPoint;
      this.tooltipOut.textContent = fmtTime(this.outPoint);
      this._updateTrimBadge();
      this._updateRangeVisual();

    } else if (this._dragging === 'range') {
      const delta = (ratio - this._dragStartRatio) * d;
      const rangeDur = this._dragStartOut - this._dragStartIn;
      let newIn = this._dragStartIn + delta;
      let newOut = this._dragStartOut + delta;
      if (newIn < 0) { newIn = 0; newOut = rangeDur; }
      if (newOut > d) { newOut = d; newIn = d - rangeDur; }
      this.inPoint = newIn;
      this.outPoint = newOut;
      this._updateTrimBadge();
      this._updateRangeVisual();
    }
  }

  _onLaneUp() {
    this.handleIn.classList.remove('dragging');
    this.handleOut.classList.remove('dragging');
    this.timelineBar.classList.remove('dragging');
    this._dragging = null;
  }

  _onLaneHover(e) {
    if (!this.loaded || !this.video.paused || this._dragging) return;
    const ratio = this._xToRatio(e);
    const d = this.duration;
    if (this._preHoverTime === null) this._preHoverTime = this.video.currentTime;
    this._hoverTime = ratio * d;
    this.video.currentTime = this._hoverTime;
    this.playhead.style.left = (ratio * 100) + '%';
  }

  _onLaneLeave() {
    if (this._preHoverTime === null) return;
    this.video.currentTime = this._preHoverTime;
    this.playhead.style.left = (this.duration > 0 ? (this._preHoverTime / this.duration) * 100 : 0) + '%';
    this._preHoverTime = null;
    this._hoverTime = null;
  }

  _showHandleTooltip(which) {
    const handle = which === 'in' ? this.handleIn : this.handleOut;
    const tooltip = which === 'in' ? this.tooltipIn : this.tooltipOut;
    const time = which === 'in' ? (this.inPoint ?? 0) : (this.outPoint ?? this.duration);
    handle.classList.add('dragging');
    tooltip.textContent = fmtTime(time);
  }
}
