// Handwriting pad: a canvas with school-style guide lines that records pen strokes.

export class Pad {
  constructor(host, { fingerMode = 'auto', onChange = () => {} } = {}) {
    this.host = host;
    this.fingerMode = fingerMode; // 'auto' = fingers until a Pencil is seen, 'always' = fingers always
    this.onChange = onChange;
    this.strokes = [];
    this.penSeen = false;
    this.active = null;
    this.dimmed = false;
    this.t0 = 0;

    this.bg = document.createElement('canvas');
    this.ink = document.createElement('canvas');
    this.bg.className = 'pad-bg';
    this.ink.className = 'pad-ink';
    host.append(this.bg, this.ink);

    // Stop iOS scrolling, magnifier and text selection while writing.
    for (const t of ['touchstart', 'touchmove', 'touchend']) {
      host.addEventListener(t, (e) => e.preventDefault(), { passive: false });
    }
    host.addEventListener('contextmenu', (e) => e.preventDefault());

    this.ink.addEventListener('pointerdown', (e) => this.down(e));
    this.ink.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.ink.addEventListener(t, (e) => this.up(e));
    }

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  get width() { return this.host.clientWidth; }
  get height() { return this.host.clientHeight; }
  get isEmpty() { return this.strokes.length === 0; }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.width, h = this.height;
    if (!w || !h) return;
    for (const c of [this.bg, this.ink]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.drawGuides();
    this.redraw();
  }

  drawGuides() {
    const ctx = this.bg.getContext('2d');
    const w = this.width, h = this.height;
    ctx.clearRect(0, 0, w, h);
    const y = (f) => Math.round(h * f) + 0.5;
    const line = (yy, color, width, dash = []) => {
      ctx.beginPath();
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.moveTo(16, yy);
      ctx.lineTo(w - 16, yy);
      ctx.stroke();
    };
    // Ascender, x-height (dashed), baseline (bold), descender.
    line(y(0.18), 'rgba(120, 90, 40, 0.25)', 1.5);
    line(y(0.42), 'rgba(120, 90, 40, 0.35)', 1.5, [10, 8]);
    line(y(0.66), 'rgba(90, 60, 20, 0.7)', 2.5);
    line(y(0.86), 'rgba(120, 90, 40, 0.25)', 1.5);
    ctx.setLineDash([]);
  }

  acceptPointer(e) {
    if (e.pointerType === 'pen') { this.penSeen = true; return true; }
    if (e.pointerType === 'touch') return this.fingerMode === 'always' || !this.penSeen;
    return true; // mouse
  }

  point(e) {
    const r = this.ink.getBoundingClientRect();
    const p = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp, p };
  }

  down(e) {
    if (this.active !== null || !this.acceptPointer(e)) return;
    e.preventDefault();
    if (this.dimmed) this.clear();
    this.active = e.pointerId;
    try { this.ink.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    if (!this.strokes.length) this.t0 = e.timeStamp;
    const s = { pts: [this.point(e)] };
    this.strokes.push(s);
    this.dot(s.pts[0]);
  }

  move(e) {
    if (e.pointerId !== this.active) return;
    e.preventDefault();
    const s = this.strokes[this.strokes.length - 1];
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const p = this.point(ev);
      const prev = s.pts[s.pts.length - 1];
      if (Math.hypot(p.x - prev.x, p.y - prev.y) < 0.8) continue;
      s.pts.push(p);
      this.segment(prev, p);
    }
  }

  up(e) {
    if (e.pointerId !== this.active) return;
    this.active = null;
    this.onChange(this.strokes.length);
  }

  widthFor(p) { return 2.5 + p.p * 5; }

  style(ctx) {
    ctx.strokeStyle = ctx.fillStyle = '#2b1d0e';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  dot(p) {
    const ctx = this.ink.getContext('2d');
    this.style(ctx);
    ctx.beginPath();
    ctx.arc(p.x, p.y, this.widthFor(p) / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  segment(a, b) {
    const ctx = this.ink.getContext('2d');
    this.style(ctx);
    ctx.lineWidth = (this.widthFor(a) + this.widthFor(b)) / 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  redraw() {
    const ctx = this.ink.getContext('2d');
    ctx.clearRect(0, 0, this.width, this.height);
    for (const s of this.strokes) {
      this.dot(s.pts[0]);
      for (let i = 1; i < s.pts.length; i++) this.segment(s.pts[i - 1], s.pts[i]);
    }
  }

  undo() {
    this.strokes.pop();
    this.redraw();
    this.onChange(this.strokes.length);
  }

  clear() {
    this.strokes = [];
    this.dimmed = false;
    this.ink.style.opacity = '';
    this.redraw();
    this.onChange(0);
  }

  // Fade the current writing; the next stroke starts a fresh attempt.
  dim() {
    this.dimmed = true;
    this.ink.style.opacity = '0.3';
  }

  setFingerMode(mode) { this.fingerMode = mode; }

  // Strokes in the recogniser's format: [[xs], [ys], [times]] per stroke.
  toInk() {
    return this.strokes.map((s) => [
      s.pts.map((p) => Math.round(p.x)),
      s.pts.map((p) => Math.round(p.y)),
      s.pts.map((p) => Math.round(p.t - this.t0)),
    ]);
  }

  // Just the writing, black on white, cropped and scaled: a clean picture for the reader.
  toPNGBase64({ maxWidth = 900, maxHeight = 360, margin = 24 } = {}) {
    const pts = this.strokes.flatMap((s) => s.pts);
    if (!pts.length) return '';
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs) - margin, y0 = Math.min(...ys) - margin;
    const w = Math.max(...xs) + margin - x0, h = Math.max(...ys) + margin - y0;
    const scale = Math.min(maxWidth / w, maxHeight / h, 2);
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
    ctx.strokeStyle = ctx.fillStyle = '#000';
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    for (const s of this.strokes) {
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (const p of s.pts.slice(1)) ctx.lineTo(p.x, p.y);
      if (s.pts.length === 1) ctx.lineTo(s.pts[0].x + 0.1, s.pts[0].y);
      ctx.stroke();
    }
    return c.toDataURL('image/png').split(',')[1];
  }
}
