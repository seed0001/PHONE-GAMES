/*
 * Pocket Arcade — shared tower defense engine.
 * Each game provides a config object (map, theme, towers, enemies, waves)
 * and calls TD.start(config). See any game's config.js for the schema.
 */
(function () {
  'use strict';

  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", system-ui';
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- small helpers ----------

  // deterministic per-cell random for decorations
  function cellRand(c, r, salt) {
    let h = (c * 374761393 + r * 668265263 + salt * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function dist(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function rgba(hex, a) {
    if (!hex) return `rgba(255,255,255,${a})`;
    if (hex[0] !== '#') return hex;
    let h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- audio: everything is synthesized, no asset files ----------

  const SFX = (function () {
    let ctx = null, master = null, noiseBuf = null;
    let muted = localStorage.getItem('td-muted') === '1';
    const lastPlay = {};

    function init() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.6;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }

    function resume() {
      init();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    // one oscillator voice with an optional pitch sweep + filter
    function tone(o) {
      if (!ctx) return;
      const t0 = ctx.currentTime + (o.delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f0, t0);
      if (o.f1 != null) {
        if (o.exp === false) osc.frequency.linearRampToValueAtTime(o.f1, t0 + o.dur);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
      }
      const peak = (o.gain == null ? 0.3 : o.gain);
      const atk = o.attack == null ? 0.006 : o.attack;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      let node = osc;
      if (o.filter) {
        const f = ctx.createBiquadFilter();
        f.type = o.filter;
        f.frequency.setValueAtTime(o.cutoff || 1200, t0);
        if (o.cutoff1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutoff1), t0 + o.dur);
        f.Q.value = o.q || 1;
        node.connect(f); node = f;
      }
      node.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + o.dur + 0.03);
    }

    // filtered noise burst — impacts, explosions, whooshes
    function noise(o) {
      if (!ctx || !noiseBuf) return;
      const t0 = ctx.currentTime + (o.delay || 0);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = o.filter || 'lowpass';
      f.frequency.setValueAtTime(o.cutoff || 1800, t0);
      if (o.cutoff1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutoff1), t0 + o.dur);
      f.Q.value = o.q || 1;
      const gain = ctx.createGain();
      const peak = o.gain == null ? 0.25 : o.gain;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      src.connect(f); f.connect(gain); gain.connect(master);
      src.start(t0);
      src.stop(t0 + o.dur + 0.03);
    }

    // minimum seconds between repeats, so rapid fire doesn't turn to mush
    const GAP = { shoot: 0.05, hit: 0.04, beam: 0.07, chain: 0.07, splash: 0.06, death: 0.045, coin: 0.06 };

    const BANK = {
      shoot() {
        tone({ type: 'square', f0: 760, f1: 240, dur: 0.07, gain: 0.1, filter: 'lowpass', cutoff: 2600 });
        noise({ dur: 0.04, gain: 0.05, filter: 'highpass', cutoff: 1800 });
      },
      beam() {
        tone({ type: 'sawtooth', f0: 320, f1: 1500, dur: 0.16, gain: 0.1, filter: 'bandpass', cutoff: 900, cutoff1: 2400, q: 6 });
        tone({ type: 'sine', f0: 1200, f1: 500, dur: 0.14, gain: 0.05 });
      },
      chain() {
        noise({ dur: 0.13, gain: 0.11, filter: 'highpass', cutoff: 1400, cutoff1: 5200 });
        tone({ type: 'square', f0: 1600, f1: 620, dur: 0.1, gain: 0.06 });
      },
      splash() {
        noise({ dur: 0.34, gain: 0.26, filter: 'lowpass', cutoff: 1700, cutoff1: 130 });
        tone({ type: 'sine', f0: 150, f1: 38, dur: 0.3, gain: 0.3 });
      },
      hit() { noise({ dur: 0.035, gain: 0.06, filter: 'highpass', cutoff: 2400 }); },
      crit() {
        tone({ type: 'square', f0: 1250, f1: 1900, dur: 0.07, gain: 0.09 });
        noise({ dur: 0.07, gain: 0.09, filter: 'highpass', cutoff: 3000 });
      },
      death() {
        tone({ type: 'triangle', f0: 420, f1: 90, dur: 0.16, gain: 0.13 });
        noise({ dur: 0.14, gain: 0.09, filter: 'lowpass', cutoff: 1500, cutoff1: 250 });
      },
      bossDeath() {
        noise({ dur: 0.8, gain: 0.32, filter: 'lowpass', cutoff: 2600, cutoff1: 90 });
        tone({ type: 'sine', f0: 210, f1: 28, dur: 0.75, gain: 0.34 });
        tone({ type: 'sawtooth', f0: 500, f1: 60, dur: 0.5, gain: 0.12, filter: 'lowpass', cutoff: 1600 });
      },
      coin() {
        tone({ type: 'sine', f0: 1050, dur: 0.06, gain: 0.09 });
        tone({ type: 'sine', f0: 1560, dur: 0.1, gain: 0.08, delay: 0.05 });
      },
      place() {
        tone({ type: 'sine', f0: 220, f1: 110, dur: 0.16, gain: 0.26 });
        noise({ dur: 0.08, gain: 0.12, filter: 'lowpass', cutoff: 900 });
      },
      upgrade() {
        [660, 880, 1320].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.13, gain: 0.14, delay: i * 0.07 }));
      },
      sell() {
        tone({ type: 'triangle', f0: 700, f1: 420, dur: 0.1, gain: 0.13 });
        tone({ type: 'triangle', f0: 420, f1: 260, dur: 0.13, gain: 0.11, delay: 0.08 });
      },
      wave() {
        tone({ type: 'sawtooth', f0: 165, dur: 0.55, gain: 0.16, filter: 'lowpass', cutoff: 1100 });
        tone({ type: 'sawtooth', f0: 247, dur: 0.55, gain: 0.13, filter: 'lowpass', cutoff: 1300 });
        tone({ type: 'sine', f0: 82, dur: 0.6, gain: 0.2 });
      },
      cleared() {
        [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.18, gain: 0.13, delay: i * 0.06 }));
      },
      life() {
        tone({ type: 'sawtooth', f0: 190, f1: 62, dur: 0.42, gain: 0.24, filter: 'lowpass', cutoff: 900 });
        noise({ dur: 0.3, gain: 0.14, filter: 'lowpass', cutoff: 700 });
      },
      win() {
        [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.35, gain: 0.16, delay: i * 0.11 }));
      },
      lose() {
        [440, 370, 294, 220].forEach((f, i) => tone({ type: 'sawtooth', f0: f, dur: 0.4, gain: 0.13, filter: 'lowpass', cutoff: 1100, delay: i * 0.16 }));
      },
      ui() { tone({ type: 'square', f0: 900, f1: 700, dur: 0.03, gain: 0.05 }); },
      deny() { tone({ type: 'square', f0: 200, f1: 140, dur: 0.12, gain: 0.09 }); }
    };

    return {
      resume,
      get muted() { return muted; },
      toggle() {
        muted = !muted;
        localStorage.setItem('td-muted', muted ? '1' : '0');
        if (master) master.gain.value = muted ? 0 : 0.55;
        if (!muted) { resume(); BANK.ui(); }
        return muted;
      },
      play(name) {
        if (muted || !BANK[name]) return;
        init();
        if (!ctx) return;
        const gap = GAP[name];
        if (gap) {
          const t = ctx.currentTime;
          if (t - (lastPlay[name] || -1) < gap) return;
          lastPlay[name] = t;
        }
        try { BANK[name](); } catch { /* audio is never worth crashing over */ }
      }
    };
  })();

  // ---------- particles ----------

  const MAX_PARTS = REDUCED ? 90 : 420;

  class Game {
    constructor(cfg) {
      this.cfg = cfg;
      this.cols = cfg.map.cols;
      this.rows = cfg.map.rows;
      this.waypoints = cfg.map.waypoints;
      this.totalWaves = cfg.totalWaves || 25;
      this.theme = cfg.theme;

      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d');
      this.wrap = document.getElementById('canvas-wrap');

      this.pathCells = new Set();
      this.buildPathCells();

      this.buildFxLayer();
      this.reset();
      this.buildTowerBar();
      this.bindUI();
      this.resize();
      window.addEventListener('resize', () => this.resize());

      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }

    reset() {
      this.gold = this.cfg.startGold || 140;
      this.lives = this.cfg.lives || 20;
      this.score = 0;
      this.wave = 0;
      this.enemies = [];
      this.towers = [];
      this.projectiles = [];
      this.effects = [];
      this.particles = [];
      this.floaters = [];
      this.spawnQueue = [];
      this.spawnTimer = 0;
      this.waveActive = false;
      this.speed = 1;
      this.paused = false;
      this.over = false;
      this.endless = false;
      this.placing = null;   // tower cfg being placed
      this.selected = null;  // placed tower selected
      this.shake = 0;
      this.hitstop = 0;
      this.flash = null;
      this.combo = 0;
      this.comboTimer = 0;
      this.now = 0;
      this.hideOverlay();
      this.hidePanel();
      this.setCombo(0);
      this.updateHUD(true);
      this.updateWaveBtn();
      this.updateBarAfford();
    }

    // ---------- geometry ----------

    buildPathCells() {
      const wp = this.waypoints;
      for (let i = 0; i < wp.length - 1; i++) {
        let [c1, r1] = wp[i], [c2, r2] = wp[i + 1];
        const dc = Math.sign(c2 - c1), dr = Math.sign(r2 - r1);
        let c = c1, r = r1;
        this.pathCells.add(c + ',' + r);
        while (c !== c2 || r !== r2) {
          c += dc; r += dr;
          this.pathCells.add(c + ',' + r);
        }
      }
    }

    resize() {
      const topH = document.getElementById('td-top').offsetHeight;
      const botH = document.getElementById('td-bottom').offsetHeight;
      const availW = Math.min(this.wrap.clientWidth, 600);
      const availH = window.innerHeight - topH - botH - 8;
      this.cell = Math.max(24, Math.min(Math.floor(availW / this.cols), Math.floor(availH / this.rows)));
      const W = this.cell * this.cols, H = this.cell * this.rows;
      const dpr = window.devicePixelRatio || 1;
      this.dpr = dpr;
      this.canvas.width = W * dpr;
      this.canvas.height = H * dpr;
      this.canvas.style.width = W + 'px';
      this.canvas.style.height = H + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = W; this.H = H;
      this.wpPx = this.waypoints.map(([c, r]) => [(c + 0.5) * this.cell, (r + 0.5) * this.cell]);
      for (const t of this.towers) {
        t.x = (t.col + 0.5) * this.cell;
        t.y = (t.row + 0.5) * this.cell;
      }
      this.buildTerrain();
      this.buildAmbient();
    }

    cellAt(px, py) {
      return [Math.floor(px / this.cell), Math.floor(py / this.cell)];
    }

    towerAt(c, r) {
      return this.towers.find(t => t.col === c && t.row === r) || null;
    }

    buildable(c, r) {
      return c >= 0 && r >= 0 && c < this.cols && r < this.rows &&
        !this.pathCells.has(c + ',' + r) && !this.towerAt(c, r);
    }

    // ---------- static terrain, painted once per resize ----------

    buildTerrain() {
      const cell = this.cell, th = this.theme;
      const bg = this.bgCanvas || (this.bgCanvas = document.createElement('canvas'));
      bg.width = this.W * this.dpr;
      bg.height = this.H * this.dpr;
      const g = bg.getContext('2d');
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const grad = g.createLinearGradient(0, 0, 0, this.H);
      grad.addColorStop(0, th.bgTop);
      grad.addColorStop(1, th.bgBottom);
      g.fillStyle = grad;
      g.fillRect(0, 0, this.W, this.H);

      // ground mottling — breaks up the flat gradient
      for (let c = 0; c < this.cols; c++) {
        for (let r = 0; r < this.rows; r++) {
          const n = cellRand(c, r, 91);
          g.fillStyle = `rgba(255,255,255,${n * 0.022})`;
          g.fillRect(c * cell, r * cell, cell, cell);
        }
      }

      // buildable plots read as a subtle board grid
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 1;
      for (let c = 0; c < this.cols; c++) {
        for (let r = 0; r < this.rows; r++) {
          if (this.pathCells.has(c + ',' + r)) continue;
          g.beginPath();
          g.roundRect(c * cell + 1.5, r * cell + 1.5, cell - 3, cell - 3, cell * 0.14);
          g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.018)';
          g.fill();
        }
      }

      if (th.scanlines) {
        g.fillStyle = 'rgba(0,0,0,0.16)';
        for (let y = 0; y < this.H; y += 3) g.fillRect(0, y, this.W, 1);
      }

      this.paintPath(g, cell, th);

      // decorations
      if (th.decor && th.decor.length) {
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let c = 0; c < this.cols; c++) {
          for (let r = 0; r < this.rows; r++) {
            if (this.pathCells.has(c + ',' + r)) continue;
            if (cellRand(c, r, 7) >= th.decorDensity) continue;
            const d = th.decor[Math.floor(cellRand(c, r, 13) * th.decor.length)];
            const sc = 0.44 + cellRand(c, r, 29) * 0.24;
            const rot = (cellRand(c, r, 37) - 0.5) * 0.5;
            const ox = (cellRand(c, r, 41) - 0.5) * cell * 0.3;
            const oy = (cellRand(c, r, 43) - 0.5) * cell * 0.3;
            g.save();
            g.translate((c + 0.5) * cell + ox, (r + 0.5) * cell + oy);
            g.rotate(rot);
            g.globalAlpha = 0.28;
            g.fillStyle = '#000';
            g.font = `${cell * sc}px ${EMOJI_FONT}`;
            g.fillText(d, cell * 0.05, cell * 0.07);
            g.globalAlpha = 0.62;
            g.fillText(d, 0, 0);
            g.restore();
          }
        }
        g.globalAlpha = 1;
      }

      // vignette
      const vg = g.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.32,
        this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.42)');
      g.fillStyle = vg;
      g.fillRect(0, 0, this.W, this.H);

      // glow pads under the spawn portal and the base
      const pad = (x, y, color, rad) => {
        const rg = g.createRadialGradient(x, y, 0, x, y, rad);
        rg.addColorStop(0, rgba(color, 0.5));
        rg.addColorStop(1, rgba(color, 0));
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      };
      pad(this.wpPx[0][0], this.wpPx[0][1], th.spawnGlow || '#ff4d6d', cell * 1.1);
      const lastWp = this.wpPx[this.wpPx.length - 1];
      pad(lastWp[0], lastWp[1], th.baseGlow || '#ffd166', cell * 1.3);
    }

    paintPath(g, cell, th) {
      const stroke = (color, width) => {
        g.beginPath();
        g.moveTo(this.wpPx[0][0], this.wpPx[0][1]);
        for (let i = 1; i < this.wpPx.length; i++) g.lineTo(this.wpPx[i][0], this.wpPx[i][1]);
        g.strokeStyle = color;
        g.lineWidth = width;
        g.stroke();
      };
      g.lineJoin = 'round';
      g.lineCap = 'round';
      stroke('rgba(0,0,0,0.35)', cell * 0.95);   // drop shadow skirt
      stroke(th.pathEdge, cell * 0.86);
      stroke(th.path, cell * 0.7);
      stroke(rgba('#ffffff', 0.05), cell * 0.44); // worn centre

      // gravel / rivets along the path, deterministic so it never shimmers
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let i = 0; i < this.wpPx.length - 1; i++) {
        const [x1, y1] = this.wpPx[i], [x2, y2] = this.wpPx[i + 1];
        const d = dist(x1, y1, x2, y2);
        const n = Math.max(1, Math.round(d / (cell * 0.42)));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
          const rr = cellRand(Math.round(px), Math.round(py), 53);
          const off = (rr - 0.5) * cell * 0.6;
          const nx = -(y2 - y1) / d, ny = (x2 - x1) / d;
          g.beginPath();
          g.arc(px + nx * off, py + ny * off, cell * (0.018 + rr * 0.03), 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // ---------- ambient background life ----------

    buildAmbient() {
      const th = this.theme, kind = th.ambient || 'motes';
      const n = REDUCED ? 8 : (th.ambientCount || 26);
      this.ambient = [];
      for (let i = 0; i < n; i++) {
        this.ambient.push({
          x: Math.random() * this.W,
          y: Math.random() * this.H,
          r: rand(0.6, 2.6) * (this.cell / 40),
          sp: rand(0.15, 0.7),
          ph: Math.random() * Math.PI * 2,
          drift: rand(-0.25, 0.25)
        });
      }
      this.ambientKind = kind;
    }

    drawAmbient(t) {
      const ctx = this.ctx, th = this.theme, kind = this.ambientKind;
      const color = th.ambientColor || '#ffffff';
      if (kind === 'stars') {
        for (const p of this.ambient) {
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * p.sp * 2 + p.ph));
          ctx.fillStyle = rgba(color, 0.75 * tw);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (0.7 + tw * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (kind === 'fog') {
        ctx.globalAlpha = 0.055;
        for (const p of this.ambient) {
          const x = (p.x + t * p.sp * 14) % (this.W + 160) - 80;
          const rad = p.r * 26;
          const gg = ctx.createRadialGradient(x, p.y, 0, x, p.y, rad);
          gg.addColorStop(0, color);
          gg.addColorStop(1, rgba(color, 0));
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.arc(x, p.y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (kind === 'rain') {
        // falling code / sparks streaking down the board
        ctx.strokeStyle = rgba(color, 0.32);
        ctx.lineWidth = 1.2;
        for (const p of this.ambient) {
          const y = (p.y + t * (60 + p.sp * 180)) % (this.H + 40) - 20;
          ctx.beginPath();
          ctx.moveTo(p.x, y);
          ctx.lineTo(p.x, y + this.cell * 0.35);
          ctx.stroke();
        }
      } else { // motes — embers / fireflies drifting upward
        for (const p of this.ambient) {
          const y = this.H - ((p.y + t * (12 + p.sp * 26)) % (this.H + 40)) + 20;
          const x = p.x + Math.sin(t * p.sp + p.ph) * this.cell * 0.4;
          const a = 0.3 + 0.5 * Math.abs(Math.sin(t * 1.6 + p.ph));
          ctx.fillStyle = rgba(color, a);
          ctx.beginPath();
          ctx.arc(x, y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ---------- fx layer (DOM overlays created by the engine, no HTML edits) ----------

    buildFxLayer() {
      const layer = document.createElement('div');
      layer.id = 'fx-layer';
      layer.innerHTML = `
        <div id="screen-flash"></div>
        <div id="wave-banner"><div class="wb-main"></div><div class="wb-sub"></div></div>
        <div id="combo-meter"><span class="cm-x">×</span><span class="cm-n">2</span><span class="cm-label">COMBO</span></div>`;
      this.wrap.appendChild(layer);
      this.elFlash = layer.querySelector('#screen-flash');
      this.elBanner = layer.querySelector('#wave-banner');
      this.elCombo = layer.querySelector('#combo-meter');
    }

    banner(main, sub, cls) {
      const el = this.elBanner;
      el.querySelector('.wb-main').textContent = main;
      el.querySelector('.wb-sub').textContent = sub || '';
      el.className = cls || '';
      el.classList.remove('show');
      void el.offsetWidth;   // restart the CSS animation
      el.classList.add('show');
    }

    screenFlash(color, ms) {
      if (REDUCED) return;
      const el = this.elFlash;
      el.style.background = color;
      el.style.transition = 'none';
      el.style.opacity = '1';
      void el.offsetWidth;
      el.style.transition = `opacity ${ms || 400}ms ease-out`;
      el.style.opacity = '0';
    }

    setCombo(n) {
      this.elCombo.classList.toggle('on', n >= 3);
      if (n >= 3) {
        this.elCombo.querySelector('.cm-n').textContent = this.comboMult().toFixed(1);
        this.elCombo.classList.remove('bump');
        void this.elCombo.offsetWidth;
        this.elCombo.classList.add('bump');
      }
    }

    comboMult() { return Math.min(2, 1 + Math.max(0, this.combo - 2) * 0.05); }

    // ---------- particles & floating numbers ----------

    spawnParticles(n, o) {
      if (this.particles.length > MAX_PARTS) return;
      if (REDUCED) n = Math.max(1, Math.round(n * 0.3));
      for (let i = 0; i < n; i++) {
        const a = o.angle == null ? Math.random() * Math.PI * 2 : o.angle + rand(-(o.spread || 0.6), (o.spread || 0.6));
        const sp = rand(o.speed0 || 40, o.speed1 || 160);
        this.particles.push({
          x: o.x + rand(-2, 2), y: o.y + rand(-2, 2),
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0, ttl: rand(o.ttl0 || 0.25, o.ttl1 || 0.6),
          size: rand(o.size0 || 1.5, o.size1 || 4),
          color: Array.isArray(o.color) ? pick(o.color) : o.color,
          grav: o.grav == null ? 220 : o.grav,
          drag: o.drag == null ? 1.6 : o.drag,
          shape: o.shape || 'dot',
          rot: Math.random() * Math.PI * 2,
          spin: rand(-8, 8),
          glow: !!o.glow
        });
      }
    }

    floater(x, y, text, o) {
      o = o || {};
      if (this.floaters.length > 40) this.floaters.shift();
      this.floaters.push({
        x, y, text,
        vx: o.vx == null ? rand(-14, 14) : o.vx,
        vy: o.vy == null ? -58 : o.vy,
        life: 0, ttl: o.ttl || 0.85,
        color: o.color || '#fff',
        size: o.size || this.cell * 0.34,
        weight: o.weight || 800,
        pop: o.pop || 1
      });
    }

    addShake(mag) {
      if (REDUCED) return;
      this.shake = Math.min(this.cell * 0.55, Math.max(this.shake, mag));
    }

    // ---------- UI ----------

    buildTowerBar() {
      const bar = document.getElementById('tower-bar');
      bar.innerHTML = '';
      for (const t of this.cfg.towers) {
        const btn = document.createElement('button');
        btn.className = 'tower-btn';
        btn.dataset.key = t.key;
        btn.style.setProperty('--t-color', t.projColor);
        btn.innerHTML = `<span class="t-emoji">${t.emoji}</span><span class="t-name">${t.name}</span><span class="t-cost">🪙${t.cost}</span>`;
        btn.onclick = () => {
          SFX.resume();
          this.hidePanel();
          if (this.placing === t) {
            this.placing = null;
            SFX.play('ui');
          } else if (this.gold >= t.cost) {
            this.placing = t;
            SFX.play('ui');
          } else {
            SFX.play('deny');
            btn.classList.remove('shake');
            void btn.offsetWidth;
            btn.classList.add('shake');
          }
          this.updateBarAfford();
        };
        bar.appendChild(btn);
      }
    }

    updateBarAfford() {
      document.querySelectorAll('.tower-btn').forEach(btn => {
        const t = this.cfg.towers.find(x => x.key === btn.dataset.key);
        btn.classList.toggle('selected', this.placing === t);
        btn.classList.toggle('poor', this.gold < t.cost);
      });
    }

    bindUI() {
      this.canvas.addEventListener('pointerdown', (e) => {
        SFX.resume();
        const rect = this.canvas.getBoundingClientRect();
        this.onTap(e.clientX - rect.left, e.clientY - rect.top);
      });

      document.getElementById('btn-wave').onclick = () => { SFX.resume(); this.startWave(); };
      document.getElementById('btn-speed').onclick = () => {
        SFX.play('ui');
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
        document.getElementById('btn-speed').textContent = this.speed + '×';
      };
      document.getElementById('btn-pause').onclick = () => {
        SFX.play('ui');
        this.paused = !this.paused;
        document.getElementById('btn-pause').textContent = this.paused ? '▶' : '⏸';
      };

      // sound toggle lives next to the other controls
      const mute = document.createElement('button');
      mute.id = 'btn-mute';
      mute.textContent = SFX.muted ? '🔇' : '🔊';
      mute.onclick = () => { mute.textContent = SFX.toggle() ? '🔇' : '🔊'; };
      document.getElementById('controls').appendChild(mute);
    }

    onTap(px, py) {
      const [c, r] = this.cellAt(px, py);
      if (this.placing) {
        if (this.buildable(c, r) && this.gold >= this.placing.cost) {
          this.gold -= this.placing.cost;
          const t = this.placing;
          this.towers.push({
            t, level: 1, col: c, row: r,
            x: (c + 0.5) * this.cell, y: (r + 0.5) * this.cell,
            cd: 0, invested: t.cost,
            dmg: t.dmg, range: t.range, rate: t.rate,
            angle: -Math.PI / 2, recoil: 0, born: this.now, flashT: 0
          });
          SFX.play('place');
          this.addShake(this.cell * 0.1);
          this.spawnParticles(14, {
            x: (c + 0.5) * this.cell, y: (r + 0.9) * this.cell,
            color: ['#ffffff', t.projColor], speed0: 40, speed1: 150,
            ttl0: 0.2, ttl1: 0.45, size0: 1.5, size1: 3.5, grav: 320
          });
          this.floater((c + 0.5) * this.cell, (r + 0.2) * this.cell, `-${t.cost}`, { color: '#ff9f9f', size: this.cell * 0.3 });
          if (this.gold < t.cost) this.placing = null;
          this.updateHUD();
          this.updateBarAfford();
        } else {
          SFX.play('deny');
          this.placing = null;
          this.updateBarAfford();
        }
        return;
      }
      const tw = this.towerAt(c, r);
      if (tw) {
        SFX.play('ui');
        this.selected = tw;
        this.showPanel(tw);
      } else {
        this.selected = null;
        this.hidePanel();
      }
    }

    upgradeCost(tw) { return Math.round(tw.t.cost * 0.85 * tw.level); }

    showPanel(tw) {
      const panel = document.getElementById('tower-panel');
      const maxed = tw.level >= 3;
      const upCost = this.upgradeCost(tw);
      const sellVal = Math.floor(tw.invested * 0.7);
      panel.innerHTML = `
        <div class="tp-head">${tw.t.emoji} <b>${tw.t.name}</b> <span class="tp-lvl">Lv ${tw.level}</span></div>
        <div class="tp-stats">DMG ${Math.round(tw.dmg)} · RNG ${tw.range.toFixed(1)} · SPD ${tw.rate.toFixed(1)}/s</div>
        <div class="tp-desc">${tw.t.desc}</div>
        <div class="tp-btns">
          <button id="tp-up" ${maxed || this.gold < upCost ? 'disabled' : ''}>${maxed ? 'MAX' : `⬆ Upgrade 🪙${upCost}`}</button>
          <button id="tp-sell">💰 Sell 🪙${sellVal}</button>
        </div>`;
      panel.hidden = false;
      panel.classList.remove('pop');
      void panel.offsetWidth;
      panel.classList.add('pop');
      document.getElementById('tp-up').onclick = () => {
        if (tw.level >= 3 || this.gold < this.upgradeCost(tw)) { SFX.play('deny'); return; }
        this.gold -= this.upgradeCost(tw);
        tw.invested += this.upgradeCost(tw);
        tw.level++;
        tw.dmg *= 1.6;
        tw.range *= 1.08;
        tw.rate *= 1.12;
        tw.flashT = 0.5;
        SFX.play('upgrade');
        this.addShake(this.cell * 0.14);
        this.spawnParticles(26, {
          x: tw.x, y: tw.y, color: ['#ffd700', '#fff6c0', tw.t.projColor],
          speed0: 50, speed1: 210, ttl0: 0.3, ttl1: 0.7, size0: 1.5, size1: 4, grav: -40, glow: true
        });
        this.effects.push({ kind: 'ring', x: tw.x, y: tw.y, r: this.cell * 1.5, ttl: 0.45, max: 0.45, color: '#ffd700' });
        this.floater(tw.x, tw.y - this.cell * 0.4, `LV ${tw.level}`, { color: '#ffd700', size: this.cell * 0.4, ttl: 1 });
        this.updateHUD();
        this.updateBarAfford();
        this.showPanel(tw);
      };
      document.getElementById('tp-sell').onclick = () => {
        SFX.play('sell');
        this.gold += sellVal;
        this.spawnParticles(16, {
          x: tw.x, y: tw.y, color: ['#ffd700', '#bfa640'], speed0: 40, speed1: 150, grav: 340
        });
        this.floater(tw.x, tw.y - this.cell * 0.3, `+${sellVal}`, { color: '#ffd700', size: this.cell * 0.34 });
        this.towers = this.towers.filter(x => x !== tw);
        this.selected = null;
        this.hidePanel();
        this.updateHUD();
        this.updateBarAfford();
      };
    }

    hidePanel() {
      const p = document.getElementById('tower-panel');
      p.hidden = true;
      this.selected = null;
    }

    updateHUD(silent) {
      const set = (id, val, cls) => {
        const el = document.getElementById(id);
        const prev = el.dataset.prev;
        const str = String(val);
        el.textContent = str;
        if (!silent && prev !== undefined && prev !== str) {
          const box = el.closest('.stat') || el;
          box.classList.remove('pop-up', 'pop-down');
          void box.offsetWidth;
          box.classList.add(cls);
        }
        el.dataset.prev = str;
      };
      set('ui-lives', this.lives, 'pop-down');
      set('ui-gold', this.gold, 'pop-up');
      set('ui-wave', this.wave + '/' + (this.endless ? '∞' : this.totalWaves), 'pop-up');
      set('ui-score', this.score.toLocaleString(), 'pop-up');
    }

    updateWaveBtn() {
      const btn = document.getElementById('btn-wave');
      btn.disabled = this.waveActive || this.over;
      btn.textContent = this.waveActive ? '🌊 Wave ' + this.wave : '▶ Wave ' + (this.wave + 1);
      btn.classList.toggle('ready', !this.waveActive && !this.over);
    }

    // ---------- waves ----------

    startWave() {
      if (this.waveActive || this.over) return;
      this.wave++;
      const groups = this.cfg.waves(this.wave);
      this.spawnQueue = [];
      for (const g of groups) {
        for (let i = 0; i < g.n; i++) this.spawnQueue.push({ type: g.t, gap: g.gap });
      }
      this.spawnTimer = 0.4;
      this.waveActive = true;
      const boss = groups.some(g => (this.cfg.enemies[g.t] || {}).boss);
      SFX.play('wave');
      this.banner(boss ? 'BOSS WAVE' : 'WAVE ' + this.wave, boss ? 'brace yourself' : '', boss ? 'boss' : '');
      if (boss) { this.screenFlash('rgba(255,60,60,0.28)', 700); this.addShake(this.cell * 0.3); }
      this.updateHUD();
      this.updateWaveBtn();
    }

    spawnEnemy(type) {
      const e = this.cfg.enemies[type];
      const hpMul = Math.pow(1.13, this.wave - 1);
      const [x0, y0] = this.wpPx[0];
      const [x1, y1] = this.wpPx[1];
      const d = dist(x0, y0, x1, y1);
      const dx = (x1 - x0) / d, dy = (y1 - y0) / d;
      this.enemies.push({
        type, e,
        x: x0 - dx * this.cell * 1.2,
        y: y0 - dy * this.cell * 1.2,
        wp: 0,
        hp: e.hp * hpMul,
        maxHp: e.hp * hpMul,
        hpGhost: 1,
        traveled: 0,
        slowUntil: 0,
        slowFactor: 1,
        wobble: Math.random() * Math.PI * 2,
        flashT: 0,
        punch: 0
      });
      this.spawnParticles(6, {
        x: x0, y: y0, color: this.theme.spawnGlow || '#ff4d6d',
        speed0: 20, speed1: 70, ttl0: 0.2, ttl1: 0.4, grav: 0, glow: true
      });
    }

    reward(e) { return Math.ceil(e.reward * (1 + (this.wave - 1) * 0.03)); }

    // ---------- combat ----------

    findTarget(tw) {
      const rangePx = tw.range * this.cell;
      let best = null;
      for (const en of this.enemies) {
        if (en.hp <= 0) continue;
        if (dist(tw.x, tw.y, en.x, en.y) <= rangePx && (!best || en.traveled > best.traveled)) best = en;
      }
      return best;
    }

    muzzle(tw, color) {
      const bx = tw.x + Math.cos(tw.angle) * this.cell * 0.32;
      const by = tw.y - this.cell * 0.2 + Math.sin(tw.angle) * this.cell * 0.32;
      tw.recoil = 1;
      tw.muzzleT = 0.09;
      this.spawnParticles(4, {
        x: bx, y: by, color: ['#ffffff', color], angle: tw.angle, spread: 0.5,
        speed0: 60, speed1: 190, ttl0: 0.1, ttl1: 0.22, size0: 1, size1: 2.6, grav: 0, glow: true
      });
      return [bx, by];
    }

    fire(tw, target) {
      const t = tw.t;
      const crit = Math.random() < 0.1;
      const dmg = tw.dmg * (crit ? 1.6 : 1);
      tw.angle = Math.atan2(target.y - (tw.y - this.cell * 0.2), target.x - tw.x);
      const [bx, by] = this.muzzle(tw, t.projColor);

      if (t.type === 'beam') {
        SFX.play('beam');
        this.hurt(target, dmg, crit);
        this.effects.push({ kind: 'beam', x1: bx, y1: by, x2: target.x, y2: target.y, ttl: 0.16, max: 0.16, color: t.projColor });
        this.spawnParticles(7, {
          x: target.x, y: target.y, color: [t.projColor, '#ffffff'],
          speed0: 40, speed1: 150, ttl0: 0.15, ttl1: 0.35, grav: 60, glow: true
        });
      } else if (t.type === 'chain') {
        SFX.play('chain');
        let cur = target, d = dmg;
        const hit = new Set([cur]);
        const pts = [[bx, by], [cur.x, cur.y]];
        this.hurt(cur, d, crit);
        for (let i = 0; i < (t.chainCount || 2); i++) {
          let next = null, bd = this.cell * 2.2;
          for (const en of this.enemies) {
            if (en.hp <= 0 || hit.has(en)) continue;
            const dd = dist(cur.x, cur.y, en.x, en.y);
            if (dd < bd) { bd = dd; next = en; }
          }
          if (!next) break;
          d *= 0.65;
          this.hurt(next, d, crit);
          hit.add(next);
          pts.push([next.x, next.y]);
          cur = next;
        }
        this.effects.push({ kind: 'chain', pts, ttl: 0.2, max: 0.2, color: t.projColor, seed: Math.random() * 1000 });
      } else {
        SFX.play('shoot');
        this.projectiles.push({
          x: bx, y: by,
          target, lastX: target.x, lastY: target.y,
          speed: (t.type === 'splash' ? 7 : 11) * this.cell,
          dmg, crit, t, rot: 0, trail: []
        });
      }
    }

    hurt(en, dmg, crit) {
      if (en.hp <= 0) return;
      en.hp -= dmg;
      en.flashT = 0.12;
      en.punch = 1;
      SFX.play(crit ? 'crit' : 'hit');
      this.floater(en.x + rand(-6, 6), en.y - this.cell * 0.3, crit ? Math.round(dmg) + '!' : String(Math.round(dmg)), {
        color: crit ? '#ffd43b' : '#ffffff',
        size: this.cell * (crit ? 0.42 : 0.3),
        ttl: crit ? 1 : 0.7,
        pop: crit ? 1.5 : 1
      });
      this.spawnParticles(crit ? 8 : 3, {
        x: en.x, y: en.y, color: crit ? ['#ffd43b', '#fff'] : (en.e.color || '#ffffff'),
        speed0: 30, speed1: crit ? 200 : 110, ttl0: 0.12, ttl1: 0.32, size0: 1, size1: crit ? 3.4 : 2.2, grav: 180
      });
      if (crit) this.addShake(this.cell * 0.07);
      if (en.hp <= 0) this.kill(en);
    }

    kill(en) {
      const boss = !!en.e.boss;
      const g = this.reward(en.e);

      this.comboTimer = 2.5;
      this.combo++;
      const mult = this.comboMult();
      const pts = Math.round(g * mult);
      this.gold += g;
      this.score += pts;
      this.setCombo(this.combo);

      SFX.play(boss ? 'bossDeath' : 'death');
      SFX.play('coin');

      this.effects.push({
        kind: 'pop', x: en.x, y: en.y, ttl: 0.45, max: 0.45,
        emoji: this.theme.deathEmoji || '💥', size: en.e.size * this.cell * (boss ? 3 : 1.7)
      });
      this.effects.push({
        kind: 'ring', x: en.x, y: en.y, r: this.cell * (boss ? 3.2 : 0.9),
        ttl: boss ? 0.6 : 0.3, max: boss ? 0.6 : 0.3, color: en.e.color || '#ffffff'
      });
      this.spawnParticles(boss ? 60 : 16, {
        x: en.x, y: en.y, color: [en.e.color || '#ffffff', '#ffffff', this.theme.ambientColor || '#ffd166'],
        speed0: 60, speed1: boss ? 460 : 220, ttl0: 0.3, ttl1: boss ? 1.1 : 0.65,
        size0: 1.5, size1: boss ? 6 : 3.6, grav: 260, shape: 'shard'
      });
      // coins spiralling out of the kill
      this.spawnParticles(Math.min(8, 2 + Math.floor(g / 6)), {
        x: en.x, y: en.y, color: ['#ffd700', '#ffe98a'],
        speed0: 70, speed1: 190, ttl0: 0.5, ttl1: 0.8, size0: 2.4, size1: 4.2, grav: 380, shape: 'coin', glow: true
      });

      this.floater(en.x, en.y - this.cell * 0.5, `+${g}`, { color: '#ffd700', size: this.cell * 0.34, vy: -70 });
      if (mult > 1) {
        this.floater(en.x, en.y - this.cell * 0.85, `×${mult.toFixed(1)}`, { color: '#7cf7c4', size: this.cell * 0.26, vy: -50, ttl: 0.7 });
      }

      if (boss) {
        this.addShake(this.cell * 0.5);
        this.hitstop = 0.09;
        this.screenFlash('rgba(255,255,255,0.5)', 500);
        this.banner('BOSS DOWN', `+${pts} pts`, 'good');
      } else {
        this.addShake(this.cell * 0.05);
      }

      this.updateHUD();
      this.updateBarAfford();
    }

    applyHit(p, x, y) {
      const t = p.t;
      if (t.type === 'splash') {
        SFX.play('splash');
        const rPx = (t.splashRadius || 1) * this.cell;
        for (const en of this.enemies) {
          if (en.hp > 0 && dist(x, y, en.x, en.y) <= rPx) this.hurt(en, p.dmg, p.crit);
        }
        this.effects.push({ kind: 'ring', x, y, r: rPx, ttl: 0.32, max: 0.32, color: t.projColor });
        this.effects.push({ kind: 'ring', x, y, r: rPx * 0.6, ttl: 0.22, max: 0.22, color: '#ffffff' });
        this.spawnParticles(26, {
          x, y, color: [t.projColor, '#ffffff', '#ffb347'],
          speed0: 70, speed1: 300, ttl0: 0.25, ttl1: 0.6, size0: 1.5, size1: 4.5, grav: 300, shape: 'shard'
        });
        this.spawnParticles(10, {
          x, y, color: ['#7a7a7a', '#4a4a4a'], speed0: 20, speed1: 80,
          ttl0: 0.5, ttl1: 1, size0: 5, size1: 12, grav: -30, shape: 'smoke'
        });
        this.addShake(this.cell * 0.2);
      } else {
        const en = p.target;
        if (en && en.hp > 0) {
          this.hurt(en, p.dmg, p.crit);
          if (t.type === 'slow' && en.hp > 0) {
            en.slowUntil = this.now + (t.slowDur || 2);
            en.slowFactor = t.slowFactor || 0.5;
            this.spawnParticles(8, {
              x: en.x, y: en.y, color: [t.projColor, '#ffffff'],
              speed0: 20, speed1: 90, ttl0: 0.3, ttl1: 0.6, size0: 1.5, size1: 3, grav: 40, glow: true
            });
          }
        }
        this.spawnParticles(5, {
          x, y, color: [t.projColor, '#ffffff'], speed0: 40, speed1: 160,
          ttl0: 0.12, ttl1: 0.3, size0: 1, size1: 2.6, grav: 200
        });
      }
    }

    // ---------- update ----------

    frame(t) {
      let dt = Math.min((t - this.last) / 1000, 0.05);
      this.last = t;
      this.rt = t / 1000;

      if (this.hitstop > 0) {
        this.hitstop -= dt;
      } else if (!this.paused && !this.over) {
        for (let i = 0; i < this.speed; i++) this.update(dt);
      }
      // visual-only decay keeps running so the screen never feels frozen
      this.shake *= Math.pow(0.001, dt);
      if (this.shake < 0.15) this.shake = 0;

      this.draw();
      requestAnimationFrame((tt) => this.frame(tt));
    }

    update(dt) {
      this.now = (this.now || 0) + dt;

      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0 && this.combo) { this.combo = 0; this.setCombo(0); }
      }

      // spawning
      if (this.spawnQueue.length) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          const s = this.spawnQueue.shift();
          this.spawnEnemy(s.type);
          this.spawnTimer = s.gap;
        }
      }

      // enemies
      for (const en of this.enemies) {
        if (en.hp <= 0) continue;
        if (en.flashT > 0) en.flashT -= dt;
        if (en.punch > 0) en.punch = Math.max(0, en.punch - dt * 6);
        en.hpGhost += (en.hp / en.maxHp - en.hpGhost) * Math.min(1, dt * 4);
        const slow = this.now < en.slowUntil ? en.slowFactor : 1;
        let move = en.e.speed * this.cell * slow * dt;
        while (move > 0 && en.wp < this.wpPx.length) {
          const [tx, ty] = this.wpPx[en.wp];
          const d = dist(en.x, en.y, tx, ty);
          if (d <= move) {
            en.x = tx; en.y = ty; en.traveled += d; move -= d; en.wp++;
          } else {
            en.dirX = (tx - en.x) / d; en.dirY = (ty - en.y) / d;
            en.x += en.dirX * move;
            en.y += en.dirY * move;
            en.traveled += move;
            move = 0;
          }
        }
        if (en.wp >= this.wpPx.length) {
          en.hp = 0;
          this.lives -= en.e.dmg || 1;
          this.combo = 0; this.setCombo(0);
          SFX.play('life');
          this.addShake(this.cell * 0.35);
          this.screenFlash('rgba(255,40,40,0.34)', 450);
          this.effects.push({ kind: 'pop', x: en.x, y: en.y, ttl: 0.5, max: 0.5, emoji: '💔', size: this.cell * 1.2 });
          this.floater(en.x, en.y - this.cell * 0.4, `-${en.e.dmg || 1} ❤️`, { color: '#ff6b6b', size: this.cell * 0.36, ttl: 1 });
          this.updateHUD();
          if (this.lives <= 0) { this.gameOver(false); return; }
        }
      }
      this.enemies = this.enemies.filter(en => en.hp > 0);

      // towers
      for (const tw of this.towers) {
        tw.cd -= dt;
        if (tw.recoil > 0) tw.recoil = Math.max(0, tw.recoil - dt * 7);
        if (tw.muzzleT > 0) tw.muzzleT -= dt;
        if (tw.flashT > 0) tw.flashT -= dt;
        const target = this.findTarget(tw);
        if (target) {
          const want = Math.atan2(target.y - (tw.y - this.cell * 0.2), target.x - tw.x);
          let diff = want - tw.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          tw.angle += diff * Math.min(1, dt * 12);
        }
        if (tw.cd > 0) continue;
        if (target) {
          this.fire(tw, target);
          tw.cd = 1 / tw.rate;
        }
      }

      // projectiles
      for (const p of this.projectiles) {
        if (p.target && p.target.hp > 0) { p.lastX = p.target.x; p.lastY = p.target.y; }
        p.trail.push(p.x, p.y);
        if (p.trail.length > 12) p.trail.splice(0, 2);
        p.rot += dt * 12;
        const d = dist(p.x, p.y, p.lastX, p.lastY);
        const step = p.speed * dt;
        if (d <= step || d < 2) {
          this.applyHit(p, p.lastX, p.lastY);
          p.done = true;
        } else {
          p.x += (p.lastX - p.x) / d * step;
          p.y += (p.lastY - p.y) / d * step;
        }
      }
      this.projectiles = this.projectiles.filter(p => !p.done);

      // particles
      for (const pt of this.particles) {
        pt.life += dt;
        pt.vy += pt.grav * dt;
        const drag = Math.pow(1 / (1 + pt.drag), dt * 6);
        pt.vx *= drag; pt.vy *= drag;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.rot += pt.spin * dt;
      }
      this.particles = this.particles.filter(pt => pt.life < pt.ttl);

      // floating numbers
      for (const f of this.floaters) {
        f.life += dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy += 40 * dt;
      }
      this.floaters = this.floaters.filter(f => f.life < f.ttl);

      // effects
      for (const fx of this.effects) fx.ttl -= dt;
      this.effects = this.effects.filter(fx => fx.ttl > 0);

      // wave end
      if (this.waveActive && !this.spawnQueue.length && !this.enemies.length) {
        this.waveActive = false;
        const bonus = 25 + this.wave * 6;
        this.gold += bonus;
        this.score += 50 + this.wave * 10;
        this.updateHUD();
        this.updateBarAfford();
        if (this.wave >= this.totalWaves && !this.endless) {
          this.gameOver(true);
        } else {
          SFX.play('cleared');
          this.banner('WAVE CLEARED', `+${bonus} 🪙`, 'good');
          this.screenFlash('rgba(120,255,190,0.16)', 500);
          const lastWp = this.wpPx[this.wpPx.length - 1];
          this.spawnParticles(24, {
            x: lastWp[0], y: lastWp[1], color: ['#ffd700', '#7cf7c4', '#ffffff'],
            speed0: 60, speed1: 260, ttl0: 0.5, ttl1: 1, size0: 2, size1: 4, grav: 300, shape: 'coin'
          });
          this.updateWaveBtn();
        }
      }
    }

    // ---------- endgame ----------

    async gameOver(won) {
      this.over = true;
      this.combo = 0; this.setCombo(0);
      SFX.play(won ? 'win' : 'lose');
      this.screenFlash(won ? 'rgba(255,215,0,0.3)' : 'rgba(180,0,0,0.4)', 800);
      this.addShake(this.cell * 0.4);
      this.updateWaveBtn();
      let lb = null;
      try {
        await fetch('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game: this.cfg.id, score: this.score, wave: this.wave })
        });
        lb = await fetch('/api/scores/' + this.cfg.id).then(r => r.json());
      } catch { /* offline is fine */ }
      this.showOverlay(won, lb);
    }

    showOverlay(won, lb) {
      const ov = document.getElementById('overlay');
      let lbHtml = '';
      if (lb && lb.top && lb.top.length) {
        lbHtml = '<div class="ov-lb"><h3>Leaderboard</h3>' + lb.top.slice(0, 5).map((r, i) =>
          `<div class="ov-row"><span>${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} ${r.username}</span><span>${r.score.toLocaleString()}</span></div>`
        ).join('') + '</div>';
      }
      ov.innerHTML = `
        <div class="ov-card ${won ? 'won' : 'lost'}">
          <div class="ov-emoji">${won ? '🏆' : '💀'}</div>
          <h2>${won ? 'Victory!' : 'Defeated'}</h2>
          <p class="ov-sub">${won ? `You held all ${this.totalWaves} waves.` : `You fell on wave ${this.wave}.`}</p>
          <div class="ov-score">⭐ ${this.score.toLocaleString()}</div>
          ${lb && lb.me ? `<p class="ov-best">Your best: ${lb.me.score.toLocaleString()} (wave ${lb.me.wave})</p>` : ''}
          ${lbHtml}
          <div class="ov-btns">
            ${won ? '<button id="ov-endless">♾ Keep Going</button>' : ''}
            <button id="ov-retry">🔄 Retry</button>
            <a href="/" class="ov-home">🏠 Hub</a>
          </div>
        </div>`;
      ov.hidden = false;
      document.getElementById('ov-retry').onclick = () => { SFX.play('ui'); this.reset(); };
      const cont = document.getElementById('ov-endless');
      if (cont) cont.onclick = () => {
        SFX.play('ui');
        this.endless = true;
        this.over = false;
        this.hideOverlay();
        this.updateHUD();
        this.updateWaveBtn();
      };
    }

    hideOverlay() {
      const ov = document.getElementById('overlay');
      ov.hidden = true;
      ov.innerHTML = '';
    }

    // ---------- draw ----------

    draw() {
      const ctx = this.ctx, cell = this.cell, th = this.theme;
      const t = this.rt || 0;

      ctx.save();
      if (this.shake > 0) {
        ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
      }

      ctx.clearRect(-cell, -cell, this.W + cell * 2, this.H + cell * 2);
      if (this.bgCanvas) ctx.drawImage(this.bgCanvas, 0, 0, this.W, this.H);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      this.drawAmbient(t);
      this.drawPathFlow(t);
      this.drawMarkers(t);

      if (this.placing) this.drawPlacementGrid(t);
      if (this.selected) this.drawRangeRing(this.selected, t);

      this.drawTowers(t);
      this.drawEnemies(t);
      this.drawProjectiles();
      this.drawEffects();
      this.drawParticles();
      this.drawFloaters();
      this.drawBossBar();

      ctx.restore();
    }

    // animated dashes crawling along the path, showing which way they come
    drawPathFlow(t) {
      const ctx = this.ctx, cell = this.cell;
      ctx.save();
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      ctx.setLineDash([cell * 0.16, cell * 0.34]);
      ctx.lineDashOffset = -t * cell * 1.1;
      ctx.strokeStyle = rgba(this.theme.flowColor || '#ffffff', 0.16);
      ctx.lineWidth = cell * 0.12;
      ctx.beginPath();
      ctx.moveTo(this.wpPx[0][0], this.wpPx[0][1]);
      for (let i = 1; i < this.wpPx.length; i++) ctx.lineTo(this.wpPx[i][0], this.wpPx[i][1]);
      ctx.stroke();
      ctx.restore();
    }

    drawMarkers(t) {
      const ctx = this.ctx, cell = this.cell, th = this.theme;
      const lastWp = this.wpPx[this.wpPx.length - 1];

      // spawn portal — a slowly rotating ring plus the emoji
      ctx.save();
      ctx.translate(this.wpPx[0][0], this.wpPx[0][1]);
      ctx.rotate(t * 0.9);
      ctx.strokeStyle = rgba(th.spawnGlow || '#ff4d6d', 0.5);
      ctx.lineWidth = 2;
      ctx.setLineDash([cell * 0.14, cell * 0.12]);
      ctx.beginPath();
      ctx.arc(0, 0, cell * 0.48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.font = `${cell * 0.8}px ${EMOJI_FONT}`;
      ctx.fillText(th.spawnEmoji, this.wpPx[0][0], this.wpPx[0][1]);

      // base — pulses harder as lives run low
      const hurtFrac = 1 - this.lives / (this.cfg.lives || 20);
      const pulse = 1 + Math.sin(t * (3 + hurtFrac * 7)) * (0.04 + hurtFrac * 0.09);
      const glow = ctx.createRadialGradient(lastWp[0], lastWp[1], 0, lastWp[0], lastWp[1], cell * 1.05 * pulse);
      glow.addColorStop(0, rgba(hurtFrac > 0.6 ? '#ff4d4d' : (th.baseGlow || '#ffd166'), 0.3));
      glow.addColorStop(1, rgba(hurtFrac > 0.6 ? '#ff4d4d' : (th.baseGlow || '#ffd166'), 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lastWp[0], lastWp[1], cell * 1.05 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(lastWp[0], lastWp[1]);
      ctx.scale(pulse, pulse);
      ctx.font = `${cell * 0.95}px ${EMOJI_FONT}`;
      ctx.fillText(th.baseEmoji, 0, 0);
      ctx.restore();
    }

    drawPlacementGrid(t) {
      const ctx = this.ctx, cell = this.cell;
      const a = 0.06 + Math.sin(t * 5) * 0.035;
      for (let c = 0; c < this.cols; c++) {
        for (let r = 0; r < this.rows; r++) {
          if (!this.buildable(c, r)) continue;
          ctx.fillStyle = rgba(this.placing.projColor, a);
          ctx.beginPath();
          ctx.roundRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4, cell * 0.16);
          ctx.fill();
          ctx.strokeStyle = rgba(this.placing.projColor, 0.3);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    drawRangeRing(tw, t) {
      const ctx = this.ctx, cell = this.cell;
      ctx.save();
      ctx.beginPath();
      ctx.arc(tw.x, tw.y, tw.range * cell, 0, Math.PI * 2);
      ctx.fillStyle = rgba(tw.t.projColor, 0.07);
      ctx.fill();
      ctx.translate(tw.x, tw.y);
      ctx.rotate(t * 0.5);
      ctx.setLineDash([cell * 0.2, cell * 0.16]);
      ctx.strokeStyle = rgba(tw.t.projColor, 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, tw.range * cell, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawTowers(t) {
      const ctx = this.ctx, cell = this.cell;
      for (const tw of this.towers) {
        const pad = cell * 0.09;
        const x = tw.col * cell, y = tw.row * cell, s = cell - pad * 2;
        const breathe = 1 + Math.sin(t * 2 + tw.col + tw.row) * 0.012;

        ctx.save();
        ctx.translate(tw.x, tw.y);
        ctx.scale(breathe, breathe);
        ctx.translate(-tw.x, -tw.y);

        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.roundRect(x + pad, y + pad + cell * 0.05, s, s, cell * 0.2);
        ctx.fill();

        // plinth with a lit top edge
        const base = tw.t.baseColor || 'rgba(20,20,34,0.85)';
        const gr = ctx.createLinearGradient(x, y, x, y + cell);
        gr.addColorStop(0, rgba('#ffffff', 0.16));
        gr.addColorStop(0.18, base);
        gr.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.roundRect(x + pad, y + pad, s, s, cell * 0.2);
        ctx.fill();
        ctx.strokeStyle = rgba(tw.t.projColor, tw.level >= 3 ? 0.85 : 0.4);
        ctx.lineWidth = tw.level >= 3 ? 2 : 1.2;
        ctx.stroke();

        // fully upgraded towers get a halo
        if (tw.level >= 3) {
          const a = 0.18 + Math.sin(t * 3.5 + tw.col) * 0.1;
          ctx.strokeStyle = rgba(tw.t.projColor, a);
          ctx.lineWidth = 4;
          ctx.stroke();
        }

        // just-upgraded flare
        if (tw.flashT > 0) {
          ctx.fillStyle = rgba('#ffd700', tw.flashT * 0.5);
          ctx.beginPath();
          ctx.roundRect(x + pad, y + pad, s, s, cell * 0.2);
          ctx.fill();
        }

        // barrel: points at the target, kicks back on fire
        const rec = tw.recoil * cell * 0.11;
        const bx = tw.x + Math.cos(tw.angle) * (cell * 0.3 - rec);
        const by = tw.y - cell * 0.2 + Math.sin(tw.angle) * (cell * 0.3 - rec);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = cell * 0.11;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tw.x, tw.y - cell * 0.2);
        ctx.lineTo(bx, by);
        ctx.stroke();

        if (tw.muzzleT > 0) {
          const a = clamp(tw.muzzleT / 0.09, 0, 1);
          const mg = ctx.createRadialGradient(bx, by, 0, bx, by, cell * 0.34 * a);
          mg.addColorStop(0, rgba('#ffffff', a));
          mg.addColorStop(0.4, rgba(tw.t.projColor, a * 0.8));
          mg.addColorStop(1, rgba(tw.t.projColor, 0));
          ctx.fillStyle = mg;
          ctx.beginPath();
          ctx.arc(bx, by, cell * 0.34 * a, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.font = `${cell * 0.62}px ${EMOJI_FONT}`;
        ctx.fillText(tw.t.emoji, tw.x - Math.cos(tw.angle) * rec, tw.y - cell * 0.03 - Math.sin(tw.angle) * rec);

        // level chevrons
        ctx.fillStyle = '#ffd700';
        for (let i = 0; i < tw.level - 1; i++) {
          ctx.beginPath();
          ctx.arc(x + cell * 0.24 + i * cell * 0.17, y + cell - cell * 0.15, cell * 0.055, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawEnemies(t) {
      const ctx = this.ctx, cell = this.cell;
      for (const en of this.enemies) {
        if (en.hp <= 0) continue;
        const size = en.e.size * cell;
        const slowed = this.now < en.slowUntil;
        const bounce = Math.abs(Math.sin(t * 7 + en.wobble));
        const wob = -bounce * cell * 0.06;
        const punch = 1 + en.punch * 0.35;
        // squash on the way down, stretch at the top of the hop
        const sx = punch * (1 + (1 - bounce) * 0.07);
        const sy = punch * (1 - (1 - bounce) * 0.07);

        // ground shadow shrinks as it hops
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath();
        ctx.ellipse(en.x, en.y + size * 0.42, size * 0.3 * (1 - bounce * 0.25), size * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();

        if (en.e.boss) {
          const a = 0.2 + Math.sin(t * 4) * 0.12;
          const bg = ctx.createRadialGradient(en.x, en.y, 0, en.x, en.y, size * 0.95);
          bg.addColorStop(0, rgba(en.e.color || '#ff4d6d', a));
          bg.addColorStop(1, rgba(en.e.color || '#ff4d6d', 0));
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(en.x, en.y, size * 0.95, 0, Math.PI * 2);
          ctx.fill();
        }

        // white-hot flash on hit
        if (en.flashT > 0) {
          const a = clamp(en.flashT / 0.12, 0, 1);
          const fg = ctx.createRadialGradient(en.x, en.y + wob, 0, en.x, en.y + wob, size * 0.7);
          fg.addColorStop(0, `rgba(255,255,255,${a * 0.85})`);
          fg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(en.x, en.y + wob, size * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.save();
        ctx.translate(en.x, en.y + wob);
        ctx.scale(sx, sy);
        ctx.font = `${size}px ${EMOJI_FONT}`;
        ctx.fillText(en.e.emoji, 0, 0);
        ctx.restore();

        // frozen: icy tint ring + orbiting flakes
        if (slowed) {
          ctx.strokeStyle = rgba('#8fdcff', 0.55 + Math.sin(t * 9) * 0.2);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(en.x, en.y + wob, size * 0.52, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = `${size * 0.3}px ${EMOJI_FONT}`;
          for (let i = 0; i < 2; i++) {
            const a = t * 2.4 + i * Math.PI;
            ctx.fillText('❄️', en.x + Math.cos(a) * size * 0.55, en.y + wob + Math.sin(a) * size * 0.3);
          }
        }

        // hp bar with a lagging "damage taken" ghost
        const w = Math.max(size * 0.95, cell * 0.4);
        const frac = clamp(en.hp / en.maxHp, 0, 1);
        const by = en.y - size * 0.72;
        const h = Math.max(3.5, cell * 0.075);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(en.x - w / 2 - 1, by - 1, w + 2, h + 2, h);
        ctx.fill();
        if (en.hpGhost > frac) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.roundRect(en.x - w / 2, by, w * en.hpGhost, h, h / 2);
          ctx.fill();
        }
        ctx.fillStyle = frac > 0.5 ? '#51cf66' : frac > 0.25 ? '#fcc419' : '#ff6b6b';
        ctx.beginPath();
        ctx.roundRect(en.x - w / 2, by, w * frac, h, h / 2);
        ctx.fill();
      }
    }

    drawProjectiles() {
      const ctx = this.ctx, cell = this.cell;
      for (const p of this.projectiles) {
        const r = p.t.type === 'splash' ? cell * 0.15 : cell * 0.095;

        // comet trail
        if (p.trail.length >= 4) {
          ctx.strokeStyle = rgba(p.t.projColor, 0.35);
          ctx.lineWidth = r * 1.3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.trail[0], p.trail[1]);
          for (let i = 2; i < p.trail.length; i += 2) ctx.lineTo(p.trail[i], p.trail[i + 1]);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.6);
        g.addColorStop(0, rgba(p.t.projColor, 0.55));
        g.addColorStop(1, rgba(p.t.projColor, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.6, 0, Math.PI * 2);
        ctx.fill();

        if (p.t.type === 'splash') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.t.projColor;
          ctx.beginPath();
          ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.45);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = p.t.projColor;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(p.x - r * 0.25, p.y - r * 0.25, r * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    drawEffects() {
      const ctx = this.ctx;
      for (const fx of this.effects) {
        const k = clamp(fx.ttl / (fx.max || 0.3), 0, 1);
        if (fx.kind === 'beam') {
          const flicker = 0.75 + Math.random() * 0.25;
          ctx.globalAlpha = k * flicker;
          ctx.lineCap = 'round';
          ctx.strokeStyle = rgba(fx.color, 0.28);
          ctx.lineWidth = 11;
          ctx.beginPath();
          ctx.moveTo(fx.x1, fx.y1); ctx.lineTo(fx.x2, fx.y2); ctx.stroke();
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(fx.x1, fx.y1); ctx.lineTo(fx.x2, fx.y2); ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(fx.x1, fx.y1); ctx.lineTo(fx.x2, fx.y2); ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (fx.kind === 'chain') {
          ctx.globalAlpha = k * (0.7 + Math.random() * 0.3);
          for (const pass of [[rgba(fx.color, 0.3), 9], [fx.color, 3], ['#ffffff', 1.2]]) {
            ctx.strokeStyle = pass[0];
            ctx.lineWidth = pass[1];
            ctx.beginPath();
            ctx.moveTo(fx.pts[0][0], fx.pts[0][1]);
            // jitter the mid-points so the arc reads as lightning
            for (let i = 1; i < fx.pts.length; i++) {
              const [ax, ay] = fx.pts[i - 1], [bx, by] = fx.pts[i];
              const segs = 4;
              for (let s = 1; s <= segs; s++) {
                const u = s / segs;
                const jx = s === segs ? 0 : (Math.sin(fx.seed + i * 7 + s * 13 + this.rt * 40) * 6);
                const jy = s === segs ? 0 : (Math.cos(fx.seed + i * 5 + s * 11 + this.rt * 40) * 6);
                ctx.lineTo(ax + (bx - ax) * u + jx, ay + (by - ay) * u + jy);
              }
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else if (fx.kind === 'ring') {
          const p = 1 - k;
          ctx.globalAlpha = k;
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = 3 * k + 1;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, fx.r * (0.25 + p * 0.85), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (fx.kind === 'pop') {
          const p = 1 - k;
          ctx.globalAlpha = k;
          ctx.save();
          ctx.translate(fx.x, fx.y);
          ctx.scale(0.6 + p * 0.8, 0.6 + p * 0.8);
          ctx.font = `${fx.size}px ${EMOJI_FONT}`;
          ctx.fillText(fx.emoji, 0, 0);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }
    }

    drawParticles() {
      const ctx = this.ctx;
      for (const p of this.particles) {
        const k = 1 - p.life / p.ttl;
        ctx.globalAlpha = clamp(k, 0, 1);
        if (p.glow) ctx.globalCompositeOperation = 'lighter';
        if (p.shape === 'shard') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        } else if (p.shape === 'coin') {
          ctx.save();
          ctx.translate(p.x, p.y);
          // flip the coin by squashing horizontally
          ctx.scale(Math.abs(Math.cos(p.rot * 2)) * 0.85 + 0.15, 1);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (p.shape === 'smoke') {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (2 - k));
          g.addColorStop(0, rgba(p.color, 0.35 * k));
          g.addColorStop(1, rgba(p.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (2 - k), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }

    drawFloaters() {
      const ctx = this.ctx;
      for (const f of this.floaters) {
        const k = f.life / f.ttl;
        // quick overshoot then settle
        const scale = k < 0.18 ? 0.5 + (k / 0.18) * (0.5 + f.pop * 0.25) : (1 + f.pop * 0.25) - (k - 0.18) * 0.25;
        ctx.save();
        ctx.globalAlpha = clamp(1 - Math.pow(k, 3), 0, 1);
        ctx.translate(f.x, f.y);
        ctx.scale(scale, scale);
        ctx.font = `${f.weight} ${f.size}px system-ui, sans-serif`;
        ctx.lineWidth = Math.max(2, f.size * 0.16);
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineJoin = 'round';
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // a fat health bar across the top for whatever boss is on screen
    drawBossBar() {
      const boss = this.enemies.find(e => e.e.boss && e.hp > 0);
      if (!boss) return;
      const ctx = this.ctx, cell = this.cell;
      const w = this.W * 0.8, x = (this.W - w) / 2, y = cell * 0.35, h = cell * 0.28;
      const frac = clamp(boss.hp / boss.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(x - 2, y - 2, w + 4, h + 4, h);
      ctx.fill();
      if (boss.hpGhost > frac) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.roundRect(x, y, w * boss.hpGhost, h, h / 2);
        ctx.fill();
      }
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#ff4d4d');
      g.addColorStop(1, '#ff9f1c');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, w * frac, h, h / 2);
      ctx.fill();
      ctx.font = `700 ${cell * 0.22}px system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      const label = `${boss.e.emoji} ${boss.e.name || 'BOSS'}`;
      ctx.strokeText(label, this.W / 2, y + h / 2);
      ctx.fillText(label, this.W / 2, y + h / 2);
    }
  }

  window.TD = { start: (cfg) => new Game(cfg) };
})();
