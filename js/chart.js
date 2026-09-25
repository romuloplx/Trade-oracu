/* =========================================================
   CandleChart — motor de gráfico de candles em canvas puro
   ========================================================= */
class CandleChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.candles   = [];
    this.lastPrice = null;
    this.lastUp    = true;
    this.entry     = null;      // { price, dir }
    this.decimals  = 5;
    this.maxCandles = 72;
    this._pad = { top: 18, right: 84, bottom: 26, left: 10 };

    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas.parentElement);
  }

  setData(candles, decimals, lastPrice, lastUp) {
    this.candles   = candles;
    this.decimals  = decimals;
    this.lastPrice = lastPrice;
    this.lastUp    = lastUp;
    this.draw();
  }

  setEntry(entry) {
    this.entry = entry;
    this.draw();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    this.w = r.width;
    this.h = r.height;
    this.canvas.width  = Math.round(r.width  * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.canvas.style.width  = r.width  + 'px';
    this.canvas.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  _roundRect(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  draw() {
    const c = this.ctx;
    if (!this.w || !this.h) return;
    c.clearRect(0, 0, this.w, this.h);

    const cs = this.candles.slice(-this.maxCandles);
    if (!cs.length) return;

    const pad = this._pad;
    const plotW = this.w - pad.left - pad.right;
    const plotH = this.h - pad.top - pad.bottom;

    /* --- escala de preço --- */
    let min = Infinity, max = -Infinity;
    for (const k of cs) { if (k.l < min) min = k.l; if (k.h > max) max = k.h; }
    if (this.entry) {
      min = Math.min(min, this.entry.price);
      max = Math.max(max, this.entry.price);
    }
    const range = (max - min) || (this.lastPrice || 1) * 0.001 || 1e-4;
    min -= range * 0.14;
    max += range * 0.14;

    const y = p => pad.top + (max - p) / (max - min) * plotH;
    const cw = plotW / cs.length;
    const x = i => pad.left + i * cw + cw / 2;

    /* --- grade + eixo de preço --- */
    c.font = '11px system-ui, sans-serif';
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const p  = min + (max - min) * (i / steps);
      const yy = y(p);
      c.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(pad.left, yy);
      c.lineTo(pad.left + plotW, yy);
      c.stroke();
      c.fillStyle = '#7c8699';
      c.textAlign = 'left';
      c.fillText(p.toFixed(this.decimals), pad.left + plotW + 8, yy + 3);
    }

    /* --- zona de ganho da operação aberta --- */
    if (this.entry) {
      const ey = y(this.entry.price);
      c.fillStyle = this.entry.dir === 'CALL'
        ? 'rgba(34, 197, 94, 0.08)'
        : 'rgba(239, 68, 68, 0.08)';
      if (this.entry.dir === 'CALL') c.fillRect(pad.left, pad.top, plotW, ey - pad.top);
      else                           c.fillRect(pad.left, ey, plotW, pad.top + plotH - ey);
    }

    /* --- candles --- */
    const bw = Math.max(2, Math.min(14, cw * 0.62));
    cs.forEach((k, i) => {
      const up  = k.c >= k.o;
      const col = up ? '#22c55e' : '#ef4444';
      const cx  = x(i);
      c.strokeStyle = col;
      c.fillStyle   = col;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx, y(k.h));
      c.lineTo(cx, y(k.l));
      c.stroke();
      const yo = y(k.o), yc = y(k.c);
      const top = Math.min(yo, yc);
      const hgt = Math.max(1.5, Math.abs(yc - yo));
      c.fillRect(cx - bw / 2, top, bw, hgt);
    });

    /* --- linha do último preço --- */
    if (this.lastPrice != null) {
      const yy  = y(this.lastPrice);
      const col = this.lastUp ? '#22c55e' : '#ef4444';
      c.setLineDash([4, 4]);
      c.strokeStyle = col;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(pad.left, yy);
      c.lineTo(pad.left + plotW, yy);
      c.stroke();
      c.setLineDash([]);
      const label = this.lastPrice.toFixed(this.decimals);
      c.font = 'bold 11px system-ui, sans-serif';
      const tw = c.measureText(label).width;
      c.fillStyle = col;
      this._roundRect(pad.left + plotW + 4, yy - 9, tw + 12, 18, 4);
      c.fill();
      c.fillStyle = '#0b0e14';
      c.textAlign = 'center';
      c.fillText(label, pad.left + plotW + 10 + tw / 2, yy + 3);
    }

    /* --- linha de entrada da operação --- */
    if (this.entry) {
      const ey = y(this.entry.price);
      c.setLineDash([6, 3]);
      c.strokeStyle = '#e2e8f0';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(pad.left, ey);
      c.lineTo(pad.left + plotW, ey);
      c.stroke();
      c.setLineDash([]);
      const label = 'ENTRADA ' + this.entry.price.toFixed(this.decimals);
      c.font = 'bold 10px system-ui, sans-serif';
      const tw = c.measureText(label).width;
      const above = ey - 19 >= pad.top - 2;   // cabe acima da linha?
      const ly = above ? ey - 19 : ey + 3;
      c.fillStyle = 'rgba(226, 232, 240, 0.95)';
      this._roundRect(pad.left + 6, ly, tw + 12, 16, 4);
      c.fill();
      c.fillStyle = '#0b0e14';
      c.textAlign = 'center';
      c.fillText(label, pad.left + 12 + tw / 2, ly + 12);
    }

    /* --- eixo de tempo --- */
    c.font = '10px system-ui, sans-serif';
    c.fillStyle = '#7c8699';
    c.textAlign = 'center';
    const every = Math.max(1, Math.ceil(cs.length / 7));
    cs.forEach((k, i) => {
      if (i % every !== 0) return;
      const d = new Date(k.t);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      c.fillText(hh + ':' + mm, x(i), this.h - 8);
    });
  }
}
