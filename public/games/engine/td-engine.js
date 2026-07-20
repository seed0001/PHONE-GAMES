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

  // ---------- campaign scaling ----------

  /* These games run ~200 waves. A flat exponential (the old 1.13^wave) either
   * trivialises the first fifty waves or makes the last fifty impossible — at
   * wave 200 it asks for 4e10x health. Growth is polynomial instead, with a
   * mild per-act kicker every 25 waves, landing around 157x at wave 200. That
   * is a curve tower upgrades and extra tower slots can actually keep pace
   * with. Tune HP_POW/HP_RATE/ACT_MUL to make the campaign harder or softer. */
  const HP_RATE = 0.085, HP_POW = 1.5, ACT_MUL = 1.11, ACT_LEN = 25;
  function hpScale(wave) {
    return Math.pow(1 + (wave - 1) * HP_RATE, HP_POW) *
           Math.pow(ACT_MUL, Math.floor((wave - 1) / ACT_LEN));
  }
  // Enemies get a little quicker, but speed is capped — unreadable is not hard.
  function speedScale(wave) { return Math.min(1.45, 1 + (wave - 1) * 0.0035); }
  // What enemies hit your towers for has to climb too, or shields stop mattering.
  function atkScale(wave) { return Math.pow(1 + (wave - 1) * 0.055, 1.25); }

  const SHIELD_DELAY = 4;      // seconds out of combat before shields recharge
  const SHIELD_REGEN = 0.22;   // fraction of max shield per second once charging
  const MAX_LEVEL = 5;

  /* Waves are generated from the config's `enemyTiers` rather than authored one
   * by one — nobody is hand-writing 200 entries. Deterministic (no Math.random)
   * so wave 137 is the same fight for everyone, which matters for leaderboards. */
  function defaultWaves(cfg, n) {
    const pools = (cfg.enemyTiers || []).filter(t => n >= t.at);
    if (!pools.length) return [{ t: Object.keys(cfg.enemies)[0], n: 6, gap: 0.8 }];

    // newest unlocked tiers dominate, older ones stay in the mix as filler
    const weighted = [];
    pools.forEach((tier, i) => {
      const w = i >= pools.length - 2 ? 3 : 1;
      for (const type of tier.types) for (let k = 0; k < w; k++) weighted.push(type);
    });

    const total = Math.min(72, Math.round(6 + n * 0.85));
    const kinds = Math.max(1, Math.min(4, 1 + Math.floor(n / 12)));
    /* Walk the weighted list from a wave-derived offset rather than sampling by
     * a fixed stride: a stride that happens to share a factor with the list
     * length lands on the same entry every time, which collapsed whole waves
     * into 60-odd copies of one enemy. */
    const chosen = [];
    const start = (n * 7) % weighted.length;
    for (let i = 0; i < weighted.length && chosen.length < kinds; i++) {
      const type = weighted[(start + i) % weighted.length];
      if (!chosen.includes(type)) chosen.push(type);
    }

    const gap = Math.max(0.26, 0.85 - n * 0.002);
    const groups = chosen.map(t => ({ t, n: Math.max(1, Math.round(total / chosen.length)), gap }));

    // boss every 10 waves, walking up the config's boss list; they stack up late
    const bosses = cfg.bosses || [];
    if (bosses.length && n % 10 === 0) {
      const idx = Math.min(Math.floor(n / 10) - 1, bosses.length - 1);
      groups.push({ t: bosses[idx], n: 1 + Math.floor(n / 70), gap: 3 });
    }
    return groups;
  }

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
      this.eshots = [];        // enemy fire, aimed at towers
      this.towersLost = 0;
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
          const hp = t.hp || 120;
          this.towers.push({
            t, level: 1, col: c, row: r,
            x: (c + 0.5) * this.cell, y: (r + 0.5) * this.cell,
            cd: 0, invested: t.cost,
            dmg: t.dmg, range: t.range, rate: t.rate,
            // structure: enemies shoot back, shields soak it first and recharge
            hp, maxHp: hp,
            baseShield: t.shield || 0,
            shieldMax: t.shield || 0,
            shield: t.shield || 0,
            shieldDelay: 0, shieldHitT: 0, hurtT: 0,
            wrecked: false, auraT: 0,
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

    upgradeCost(tw) { return Math.round(tw.t.cost * 0.85 * Math.pow(1.35, tw.level - 1) * tw.level); }
    repairCost(tw) {
      const missing = 1 - tw.hp / tw.maxHp;
      const base = tw.wrecked ? tw.t.cost * 0.55 : tw.t.cost * 0.4;
      return Math.max(5, Math.round(base * Math.max(missing, tw.wrecked ? 1 : 0.15)));
    }

    showPanel(tw) {
      const panel = document.getElementById('tower-panel');
      const maxed = tw.level >= MAX_LEVEL;
      const upCost = this.upgradeCost(tw);
      const sellVal = Math.floor(tw.invested * 0.7);
      const repCost = this.repairCost(tw);
      const damaged = tw.wrecked || tw.hp < tw.maxHp - 0.5;
      const isSupport = tw.t.type === 'support' || tw.t.type === 'repair';

      const offence = isSupport
        ? (tw.t.type === 'support'
            ? `SHIELD +${Math.round(tw.t.shieldGrant * tw.level)} · RNG ${tw.range.toFixed(1)}`
            : `REPAIR ${(tw.t.repairRate * tw.level).toFixed(1)}/s · RNG ${tw.range.toFixed(1)}`)
        : `DMG ${Math.round(tw.dmg)} · RNG ${tw.range.toFixed(1)} · SPD ${tw.rate.toFixed(1)}/s`;

      panel.innerHTML = `
        <div class="tp-head">${tw.t.emoji} <b>${tw.t.name}</b> <span class="tp-lvl">Lv ${tw.level}</span></div>
        <div class="tp-stats">${offence}</div>
        <div class="tp-stats">🛡️ ${Math.round(tw.shield)}/${Math.round(tw.shieldMax)} · ❤️ ${Math.max(0, Math.round(tw.hp))}/${Math.round(tw.maxHp)}${tw.wrecked ? ' · <b style="color:#ff6b6b">WRECKED</b>' : ''}</div>
        <div class="tp-desc">${tw.t.desc}</div>
        <div class="tp-btns">
          <button id="tp-up" ${maxed || this.gold < upCost ? 'disabled' : ''}>${maxed ? 'MAX' : `⬆ 🪙${upCost}`}</button>
          <button id="tp-rep" ${!damaged || this.gold < repCost ? 'disabled' : ''}>${tw.wrecked ? '🔧 Rebuild' : '🔧 Repair'} 🪙${repCost}</button>
          <button id="tp-sell">💰 🪙${sellVal}</button>
        </div>`;
      panel.hidden = false;
      panel.classList.remove('pop');
      void panel.offsetWidth;
      panel.classList.add('pop');

      document.getElementById('tp-rep').onclick = () => {
        const cost = this.repairCost(tw);
        if (!damaged || this.gold < cost) { SFX.play('deny'); return; }
        this.gold -= cost;
        tw.hp = tw.maxHp;
        tw.wrecked = false;
        tw.shieldDelay = SHIELD_DELAY;
        tw.flashT = 0.5;
        SFX.play('upgrade');
        this.spawnParticles(20, {
          x: tw.x, y: tw.y, color: ['#7cf7c4', '#ffffff'],
          speed0: 40, speed1: 170, ttl0: 0.25, ttl1: 0.6, size0: 1.5, size1: 3.4, grav: -30, glow: true
        });
        this.floater(tw.x, tw.y - this.cell * 0.4, 'REPAIRED', { color: '#7cf7c4', size: this.cell * 0.3, ttl: 0.9 });
        this.updateHUD();
        this.updateBarAfford();
        this.showPanel(tw);
      };

      document.getElementById('tp-up').onclick = () => {
        if (tw.level >= MAX_LEVEL || this.gold < this.upgradeCost(tw)) { SFX.play('deny'); return; }
        this.gold -= this.upgradeCost(tw);
        tw.invested += this.upgradeCost(tw);
        tw.level++;
        tw.dmg *= 1.55;
        tw.range *= 1.06;
        tw.rate *= 1.1;
        // upgrades harden the tower as well as arm it
        const hpRatio = tw.hp / tw.maxHp;
        tw.maxHp = Math.round(tw.maxHp * 1.35);
        tw.hp = tw.maxHp * hpRatio;
        tw.baseShield = Math.round(tw.baseShield * 1.4);
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
        // drop any enemy fire still homing on the tower that just left
        this.eshots = this.eshots.filter(s => s.tw !== tw);
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
      const groups = this.cfg.waves
        ? this.cfg.waves(this.wave)
        : defaultWaves(this.cfg, this.wave);
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
      const hpMul = hpScale(this.wave);
      const [x0, y0] = this.wpPx[0];
      const [x1, y1] = this.wpPx[1];
      const d = dist(x0, y0, x1, y1);
      const dx = (x1 - x0) / d, dy = (y1 - y0) / d;
      const shield = (e.shield || 0) * hpMul;
      this.enemies.push({
        type, e,
        x: x0 - dx * this.cell * 1.2,
        y: y0 - dy * this.cell * 1.2,
        wp: 0,
        hp: e.hp * hpMul,
        maxHp: e.hp * hpMul,
        shield, maxShield: shield, shieldHitT: 0,
        hpGhost: 1,
        traveled: 0,
        slowUntil: 0,
        slowFactor: 1,
        atkCd: rand(0.3, 1.2),        // stagger opening shots so volleys aren't synchronised
        healCd: rand(0.5, 1.5),
        wobble: Math.random() * Math.PI * 2,
        flashT: 0,
        punch: 0
      });
      this.spawnParticles(6, {
        x: x0, y: y0, color: this.theme.spawnGlow || '#ff4d6d',
        speed0: 20, speed1: 70, ttl0: 0.2, ttl1: 0.4, grav: 0, glow: true
      });
    }

    reward(e) { return Math.ceil(e.reward * (1 + (this.wave - 1) * 0.06)); }

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

      // armour is flat reduction, but can never fully negate a hit
      if (en.e.armor) dmg = Math.max(dmg * 0.15, dmg - en.e.armor);

      // shields soak first and stay down for the rest of the run once broken
      if (en.shield > 0) {
        const absorbed = Math.min(en.shield, dmg);
        en.shield -= absorbed;
        dmg -= absorbed;
        en.shieldHitT = 0.2;
        if (en.shield <= 0) {
          SFX.play('hit');
          this.effects.push({
            kind: 'ring', x: en.x, y: en.y, r: this.cell * 0.8,
            ttl: 0.35, max: 0.35, color: en.e.shieldColor || '#7ad1ff'
          });
        }
      }
      if (dmg <= 0) {
        this.floater(en.x, en.y - this.cell * 0.3, 'BLOCKED', {
          color: en.e.shieldColor || '#7ad1ff', size: this.cell * 0.24, ttl: 0.5
        });
        return;
      }

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

    // ---------- towers under fire ----------

    /* Damage lands on shields first. Shields recharge on their own after a lull,
     * so a tower that gets poked survives; one that gets focused does not.
     * Structure damage does NOT come back on its own — you pay to repair it,
     * which is what makes the shield towers worth their slot. */
    hurtTower(tw, dmg) {
      if (tw.wrecked) return;
      tw.shieldDelay = SHIELD_DELAY;

      if (tw.shield > 0) {
        const absorbed = Math.min(tw.shield, dmg);
        tw.shield -= absorbed;
        dmg -= absorbed;
        tw.shieldHitT = 0.25;
      }
      if (dmg <= 0) return;

      tw.hp -= dmg;
      tw.hurtT = 0.2;
      this.spawnParticles(3, {
        x: tw.x, y: tw.y, color: ['#ff9f9f', '#ffffff'],
        speed0: 30, speed1: 120, ttl0: 0.12, ttl1: 0.3, size0: 1, size1: 2.4, grav: 200
      });
      if (tw.hp <= 0) this.wreckTower(tw);
    }

    wreckTower(tw) {
      tw.hp = 0;
      tw.wrecked = true;
      tw.shield = 0;
      SFX.play('lose');
      this.addShake(this.cell * 0.3);
      this.screenFlash('rgba(255,80,40,0.22)', 400);
      this.effects.push({
        kind: 'pop', x: tw.x, y: tw.y, ttl: 0.5, max: 0.5,
        emoji: '💥', size: this.cell * 1.3
      });
      this.spawnParticles(30, {
        x: tw.x, y: tw.y, color: ['#ff6b6b', '#ffd166', '#888899'],
        speed0: 60, speed1: 280, ttl0: 0.3, ttl1: 0.8, size0: 1.5, size1: 4.5,
        grav: 420, shape: 'shard'
      });
      this.floater(tw.x, tw.y - this.cell * 0.4, 'WRECKED', {
        color: '#ff6b6b', size: this.cell * 0.32, ttl: 1.1
      });
      if (this.selected === tw) this.showPanel(tw);
    }

    enemyShoot(en, tw) {
      const a = en.e.atk;
      const dmg = a.dmg * atkScale(this.wave);
      SFX.play('shoot');
      if (a.type === 'melee') {
        this.hurtTower(tw, dmg);
        this.effects.push({
          kind: 'beam', x1: en.x, y1: en.y, x2: tw.x, y2: tw.y,
          ttl: 0.12, max: 0.12, color: a.color || '#ff6b6b'
        });
      } else {
        this.eshots.push({
          x: en.x, y: en.y, tw, dmg,
          speed: (a.speed || 6) * this.cell,
          color: a.color || '#ff6b6b',
          size: a.size || 0.16,
          rot: 0, trail: []
        });
      }
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
        if (en.shieldHitT > 0) en.shieldHitT -= dt;
        if (en.punch > 0) en.punch = Math.max(0, en.punch - dt * 6);
        en.hpGhost += (en.hp / en.maxHp - en.hpGhost) * Math.min(1, dt * 4);

        // shooters fire on the move — stopping to aim stalls whole waves
        if (en.e.atk) {
          en.atkCd -= dt;
          if (en.atkCd <= 0) {
            const rangePx = en.e.atk.range * this.cell;
            let best = null, bd = rangePx;
            for (const tw of this.towers) {
              if (tw.wrecked) continue;
              const d = dist(en.x, en.y, tw.x, tw.y);
              if (d <= bd) { bd = d; best = tw; }
            }
            if (best) {
              this.enemyShoot(en, best);
              en.atkCd = 1 / en.e.atk.rate;
            } else {
              en.atkCd = 0.25;   // nothing in reach, re-check shortly
            }
          }
        }

        // medics keep the wave alive; kill them first
        if (en.e.healRate) {
          en.healCd -= dt;
          if (en.healCd <= 0) {
            en.healCd = 1;
            const rPx = (en.e.healRange || 2) * this.cell;
            let healed = 0;
            for (const o of this.enemies) {
              if (o === en || o.hp <= 0 || o.hp >= o.maxHp) continue;
              if (dist(en.x, en.y, o.x, o.y) > rPx) continue;
              o.hp = Math.min(o.maxHp, o.hp + o.maxHp * en.e.healRate);
              healed++;
            }
            if (healed) {
              this.effects.push({
                kind: 'ring', x: en.x, y: en.y, r: rPx,
                ttl: 0.4, max: 0.4, color: en.e.healColor || '#7cf7c4'
              });
            }
          }
        }

        // self-regenerating types heal unless something is actively hitting them
        if (en.e.regen && en.flashT <= 0) {
          en.hp = Math.min(en.maxHp, en.hp + en.maxHp * en.e.regen * dt);
        }

        const slow = this.now < en.slowUntil ? en.slowFactor : 1;
        let move = en.e.speed * speedScale(this.wave) * this.cell * slow * dt;
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

      // support towers project shield capacity onto everything in range, so a
      // tower's ceiling is recomputed each frame rather than stored
      for (const tw of this.towers) tw.shieldMax = tw.baseShield;
      for (const src of this.towers) {
        if (src.wrecked || src.t.type !== 'support') continue;
        const rPx = src.range * this.cell;
        const grant = src.t.shieldGrant * src.level;
        for (const tw of this.towers) {
          if (tw === src || tw.wrecked) continue;
          if (dist(src.x, src.y, tw.x, tw.y) <= rPx) tw.shieldMax += grant;
        }
      }

      // towers
      for (const tw of this.towers) {
        if (tw.hurtT > 0) tw.hurtT -= dt;
        if (tw.shieldHitT > 0) tw.shieldHitT -= dt;

        // shields recharge after a lull; structure damage never self-heals
        if (tw.shieldDelay > 0) tw.shieldDelay -= dt;
        else if (tw.shield < tw.shieldMax && !tw.wrecked) {
          tw.shield = Math.min(tw.shieldMax, tw.shield + tw.shieldMax * SHIELD_REGEN * dt);
        }
        if (tw.shield > tw.shieldMax) tw.shield = tw.shieldMax;

        if (tw.wrecked) continue;   // rubble does nothing until you pay to rebuild

        tw.cd -= dt;
        if (tw.recoil > 0) tw.recoil = Math.max(0, tw.recoil - dt * 7);
        if (tw.muzzleT > 0) tw.muzzleT -= dt;
        if (tw.flashT > 0) tw.flashT -= dt;

        // repair rigs mend neighbours instead of shooting
        if (tw.t.type === 'repair') {
          tw.auraT += dt;
          const rPx = tw.range * this.cell;
          const rate = tw.t.repairRate * tw.level;
          for (const o of this.towers) {
            if (o === tw || o.wrecked || o.hp >= o.maxHp) continue;
            if (dist(tw.x, tw.y, o.x, o.y) > rPx) continue;
            o.hp = Math.min(o.maxHp, o.hp + rate * dt);
          }
          continue;
        }
        if (tw.t.type === 'support') { tw.auraT += dt; continue; }

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

      // enemy fire — flies to where the tower is, since towers don't move
      for (const s of this.eshots) {
        s.trail.push(s.x, s.y);
        if (s.trail.length > 10) s.trail.splice(0, 2);
        s.rot += dt * 9;
        const d = dist(s.x, s.y, s.tw.x, s.tw.y);
        const step = s.speed * dt;
        if (d <= step || d < 2) {
          this.hurtTower(s.tw, s.dmg);
          this.effects.push({
            kind: 'ring', x: s.tw.x, y: s.tw.y, r: this.cell * 0.45,
            ttl: 0.25, max: 0.25, color: s.color
          });
          s.done = true;
        } else {
          s.x += (s.tw.x - s.x) / d * step;
          s.y += (s.tw.y - s.y) / d * step;
        }
      }
      this.eshots = this.eshots.filter(s => !s.done);

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
      this.drawEnemyShots();
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
        ctx.strokeStyle = rgba(tw.t.projColor, tw.level >= MAX_LEVEL ? 0.85 : 0.4);
        ctx.lineWidth = tw.level >= MAX_LEVEL ? 2 : 1.2;
        ctx.stroke();

        // fully upgraded towers get a halo
        if (tw.level >= MAX_LEVEL) {
          const a = 0.18 + Math.sin(t * 3.5 + tw.col) * 0.1;
          ctx.strokeStyle = rgba(tw.t.projColor, a);
          ctx.lineWidth = 4;
          ctx.stroke();
        }

        // shield bubble — brightness tracks how much charge is left
        if (tw.shield > 0.5 && !tw.wrecked) {
          const frac = clamp(tw.shield / Math.max(1, tw.shieldMax), 0, 1);
          const a = (tw.shieldHitT > 0 ? 0.55 : 0.14 + frac * 0.16) +
                    Math.sin(t * 2.2 + tw.col * 1.3) * 0.03;
          ctx.strokeStyle = rgba(tw.shieldHitT > 0 ? '#ffffff' : '#5bc8ff', a);
          ctx.lineWidth = tw.shieldHitT > 0 ? 3 : 2;
          ctx.beginPath();
          ctx.arc(tw.x, tw.y, cell * 0.52, 0, Math.PI * 2);
          ctx.stroke();
        }

        // support and repair rigs breathe a soft aura at their reach
        if ((tw.t.type === 'support' || tw.t.type === 'repair') && !tw.wrecked) {
          const a = 0.05 + Math.sin(tw.auraT * 1.8) * 0.025;
          ctx.strokeStyle = rgba(tw.t.projColor, a * 4);
          ctx.lineWidth = 1.5;
          ctx.setLineDash([cell * 0.12, cell * 0.14]);
          ctx.beginPath();
          ctx.arc(tw.x, tw.y, tw.range * cell, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
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
        ctx.globalAlpha = tw.wrecked ? 0.35 : 1;
        ctx.fillText(tw.wrecked ? '🧱' : tw.t.emoji,
          tw.x - Math.cos(tw.angle) * rec, tw.y - cell * 0.03 - Math.sin(tw.angle) * rec);
        ctx.globalAlpha = 1;

        // level chevrons
        ctx.fillStyle = '#ffd700';
        for (let i = 0; i < tw.level - 1; i++) {
          ctx.beginPath();
          ctx.arc(x + cell * 0.2 + i * cell * 0.13, y + cell - cell * 0.13, cell * 0.045, 0, Math.PI * 2);
          ctx.fill();
        }

        this.drawTowerBars(tw, x, y, cell, t);
        ctx.restore();
      }
    }

    /* Bars are deliberately quiet: hidden entirely on a healthy tower with full
     * shields, so a busy board doesn't turn into a wall of meters. They appear
     * the moment something is wrong. */
    drawTowerBars(tw, x, y, cell, t) {
      const ctx = this.ctx;
      const hurt = tw.hp < tw.maxHp - 0.5 || tw.wrecked;
      const shieldLow = tw.shieldMax > 0 && tw.shield < tw.shieldMax - 0.5;
      const active = tw.shieldHitT > 0 || tw.hurtT > 0;
      if (!hurt && !shieldLow && !active) return;

      const bw = cell * 0.7, bh = Math.max(2, cell * 0.05);
      const bx = x + (cell - bw) / 2;
      let by = y + cell * 0.06;

      if (tw.shieldMax > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = tw.shieldHitT > 0 ? '#ffffff' : '#5bc8ff';
        ctx.fillRect(bx, by, bw * clamp(tw.shield / tw.shieldMax, 0, 1), bh);
        by += bh + 1;
      }

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, by, bw, bh);
      const frac = clamp(tw.hp / tw.maxHp, 0, 1);
      ctx.fillStyle = tw.hurtT > 0 ? '#ffffff' : (frac > 0.5 ? '#7cf7c4' : frac > 0.25 ? '#ffd166' : '#ff6b6b');
      ctx.fillRect(bx, by, bw * frac, bh);

      // a wrecked tower pulses so you can find it on a crowded board
      if (tw.wrecked) {
        const a = 0.25 + Math.sin(t * 5) * 0.15;
        ctx.strokeStyle = rgba('#ff6b6b', a);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x + cell * 0.09, y + cell * 0.09, cell * 0.82, cell * 0.82, cell * 0.2);
        ctx.stroke();
      }
    }

    drawEnemyShots() {
      const ctx = this.ctx, cell = this.cell;
      for (const s of this.eshots) {
        if (s.trail.length > 3) {
          ctx.strokeStyle = rgba(s.color, 0.35);
          ctx.lineWidth = cell * s.size * 0.7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(s.trail[0], s.trail[1]);
          for (let i = 2; i < s.trail.length; i += 2) ctx.lineTo(s.trail[i], s.trail[i + 1]);
          ctx.stroke();
        }
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, cell * s.size * 1.6);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.45, s.color);
        g.addColorStop(1, rgba(s.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, cell * s.size * 1.6, 0, Math.PI * 2);
        ctx.fill();
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

        // enemy shield bubble — has to read differently from the boss aura
        if (en.shield > 0.5) {
          const frac = clamp(en.shield / Math.max(1, en.maxShield), 0, 1);
          const a = (en.shieldHitT > 0 ? 0.7 : 0.2 + frac * 0.25);
          ctx.strokeStyle = rgba(en.shieldHitT > 0 ? '#ffffff' : (en.e.shieldColor || '#7ad1ff'), a);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(en.x, en.y + wob, size * 0.6, 0, Math.PI * 2);
          ctx.stroke();
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
