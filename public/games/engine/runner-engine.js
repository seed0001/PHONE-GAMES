/* Pocket Arcade — shared endless runner engine.
 *
 * A game is an HTML shell plus a config.js that calls RUN.start({...}).
 * The config supplies theme, player, obstacle set, pickups and zones;
 * everything below (physics, spawning, fairness pacing, scoring, HUD,
 * score submission) is shared.
 *
 * All gameplay maths is in "design units" on a 400-unit-tall stage, then
 * scaled to whatever the canvas actually is, so a phone and a desktop get
 * an identical game.
 */
(function () {
  'use strict';

  // ---------- stage constants (design units) ----------

  const DH = 400;              // design height
  const GROUND_Y = 312;        // top of the ground band
  const PLAYER_X = 74;         // player's fixed screen x
  const PLAYER_W = 34;
  const PLAYER_H = 46;
  const SLIDE_H = 24;

  const GRAVITY = 2400;
  const JUMP_V = -742;         // ~0.62s airtime, ~114u peak — clears a 60u obstacle
  const DBL_JUMP_V = -620;
  const SLIDE_TIME = 0.6;
  const COYOTE = 0.09;         // grace period to jump after leaving the ground
  const BUFFER = 0.13;         // grace period for a jump pressed just before landing

  const AIRTIME = (2 * -JUMP_V) / GRAVITY;
  const HIT_SHRINK = 0.16;     // forgiving hitboxes

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  // ---------- tiny sound helper ----------

  const SFX = (() => {
    let ctx = null;
    const on = () => {
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    };
    const tone = (freq, dur, type, gain, slideTo) => {
      const c = on(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur);
    };
    return {
      unlock: on,
      jump:  () => tone(340, 0.13, 'square', 0.05, 620),
      dbl:   () => tone(520, 0.13, 'square', 0.05, 880),
      land:  () => tone(120, 0.07, 'sine', 0.05),
      slide: () => tone(240, 0.18, 'sawtooth', 0.03, 110),
      coin:  n => tone(760 + Math.min(n, 12) * 45, 0.09, 'triangle', 0.05),
      zone:  () => tone(430, 0.4, 'triangle', 0.06, 880),
      crash: () => tone(190, 0.5, 'sawtooth', 0.10, 45)
    };
  })();

  // ---------- engine ----------

  class Runner {
    constructor(cfg) {
      this.cfg = cfg;
      this.theme = cfg.theme || {};
      this.zones = cfg.zones || [];
      this.speedCfg = Object.assign({ start: 270, max: 640, accel: 7.5 }, cfg.speed || {});

      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d');
      this.wrap = document.getElementById('canvas-wrap');

      this.bestLocal = 0;
      this.paused = false;
      this.started = false;
      this.over = true;

      this.bindUI();
      this.resize();
      window.addEventListener('resize', () => this.resize());

      this.reset();
      this.showStart();
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    }

    // ---------- setup ----------

    resize() {
      const availH = Math.max(260, window.innerHeight - this.wrap.getBoundingClientRect().top - 92);
      const h = Math.min(availH, 560);
      const w = Math.min(this.wrap.clientWidth || 360, 640);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.S = h / DH;               // design units -> css px
      this.viewW = w / this.S;       // visible width in design units
      this.viewH = DH;
    }

    bindUI() {
      const jump = e => { if (e) e.preventDefault(); SFX.unlock(); this.onJump(); };
      const slide = e => { if (e) e.preventDefault(); SFX.unlock(); this.onSlide(); };

      // tap the play area to jump; swipe down to slide
      let sy = 0, st = 0, swiped = false;
      this.wrap.addEventListener('pointerdown', e => {
        sy = e.clientY; st = performance.now(); swiped = false;
        SFX.unlock();
      });
      this.wrap.addEventListener('pointermove', e => {
        if (swiped || !st) return;
        if (e.clientY - sy > 34) { swiped = true; this.onSlide(); }
      });
      this.wrap.addEventListener('pointerup', e => {
        e.preventDefault();
        if (!swiped && performance.now() - st < 400) this.onJump();
        st = 0;
      });

      document.getElementById('btn-jump').addEventListener('click', jump);
      document.getElementById('btn-slide').addEventListener('click', slide);
      document.getElementById('btn-pause').addEventListener('click', () => this.togglePause());

      window.addEventListener('keydown', e => {
        if (e.repeat) return;
        const k = e.key.toLowerCase();
        if (k === ' ' || k === 'arrowup' || k === 'w') jump(e);
        else if (k === 'arrowdown' || k === 's') slide(e);
        else if (k === 'p') this.togglePause();
        else if (k === 'r' && this.over) this.restart();
      });
      window.addEventListener('keyup', e => {
        const k = e.key.toLowerCase();
        if (k === ' ' || k === 'arrowup' || k === 'w') this.jumpHeld = false;
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.started && !this.over) this.setPaused(true);
      });
    }

    // ---------- lifecycle ----------

    reset() {
      this.dist = 0;
      this.coins = 0;
      this.score = 0;
      this.speed = this.speedCfg.start;
      this.zone = 0;
      this.combo = 0;
      this.obstacles = [];
      this.pickups = [];
      this.particles = [];
      this.floaters = [];
      this.decor = [];
      this.shake = 0;
      this.flash = 0;

      this.py = GROUND_Y - PLAYER_H;
      this.vy = 0;
      this.grounded = true;
      this.jumps = 0;
      this.sliding = 0;
      this.coyote = 0;
      this.buffered = 0;
      this.runCycle = 0;

      this.nextObstacleX = 620;
      this.nextPickupX = 400;
      this.worldX = 0;

      this.seedParallax();
      this.setStat('ui-dist', '0');
      this.setStat('ui-coins', '0');
      this.setStat('ui-score', '0');
      this.setCombo(0);
    }

    restart() {
      document.getElementById('overlay').hidden = true;
      this.reset();
      this.started = true;
      this.over = false;
      this.paused = false;
      this.last = performance.now();
    }

    showStart() {
      const c = this.cfg;
      const ov = document.getElementById('overlay');
      ov.innerHTML = `
        <div class="ov-card start">
          <div class="ov-emoji">${c.player.emoji}</div>
          <h2>${c.name}</h2>
          <div class="ov-sub">${c.tagline || 'How far can you get?'}</div>
          <div class="ov-keys">
            <b>Tap</b> the screen or press <b>Space</b> to jump — tap again to double-jump.<br>
            <b>Swipe down</b> or press <b>↓</b> to slide under things.
          </div>
          <div class="ov-btns">
            <a class="ov-home" href="/">🏠 Home</a>
            <button id="ov-play">Run ▶</button>
          </div>
        </div>`;
      ov.hidden = false;
      document.getElementById('ov-play').onclick = () => { SFX.unlock(); this.restart(); };
    }

    setPaused(p) {
      this.paused = p;
      document.getElementById('btn-pause').textContent = p ? '▶' : '⏸';
      if (!p) this.last = performance.now();
    }
    togglePause() {
      if (!this.started || this.over) return;
      this.setPaused(!this.paused);
    }

    // ---------- input actions ----------

    onJump() {
      if (this.over) { if (this.started) return; return; }
      if (this.paused) { this.setPaused(false); return; }
      if (this.grounded || this.coyote > 0) {
        this.vy = JUMP_V;
        this.grounded = false;
        this.coyote = 0;
        this.jumps = 1;
        this.sliding = 0;
        SFX.jump();
        this.puff(6);
      } else if (this.jumps === 1) {
        this.vy = DBL_JUMP_V;
        this.jumps = 2;
        SFX.dbl();
        this.puff(10, true);
      } else {
        this.buffered = BUFFER;   // pressed too early — fire it on landing
      }
    }

    onSlide() {
      if (this.over || this.paused) return;
      if (this.grounded) {
        this.sliding = SLIDE_TIME;
        SFX.slide();
        this.puff(5);
      } else {
        this.vy = Math.max(this.vy, 620);   // fast-fall into a slide
      }
    }

    // ---------- world generation ----------

    seedParallax() {
      const layers = this.theme.parallax || [];
      this.layerShapes = layers.map(layer => {
        const shapes = [];
        let x = 0;
        while (x < 1400) {
          const w = rand(layer.minW || 60, layer.maxW || 130);
          shapes.push({ x, w, h: rand(layer.minH || 40, layer.maxH || 120), seed: Math.random() });
          x += w + rand(layer.gap || 0, (layer.gap || 0) + 40);
        }
        shapes.spanX = x;
        return shapes;
      });
      this.decor = [];
      const d = this.theme.decor || [];
      if (d.length) {
        for (let i = 0; i < (this.theme.decorCount || 10); i++) {
          this.decor.push({
            x: rand(0, 900), y: rand(30, GROUND_Y - 90),
            e: pick(d), size: rand(13, 26), sp: rand(0.12, 0.4), bob: Math.random() * 6.28
          });
        }
      }
    }

    /* Spacing is the whole fairness story: an obstacle must never appear so
     * soon after the last one that a player running at the current speed
     * physically cannot land and jump again. */
    minGap() {
      return this.speed * (AIRTIME + 0.34) + 60;
    }

    spawnObstacles() {
      while (this.nextObstacleX < this.worldX + this.viewW + 260) {
        const x = this.nextObstacleX;
        const kinds = (this.cfg.obstacles || []).filter(o => this.dist >= (o.after || 0));
        const ground = kinds.filter(o => o.type !== 'air');
        const air = kinds.filter(o => o.type === 'air');
        const useAir = air.length && Math.random() < 0.28;
        const o = useAir ? pick(air) : pick(ground.length ? ground : kinds);
        if (!o) { this.nextObstacleX += 400; continue; }

        this.addObstacle(o, x);

        // clusters: a second obstacle close enough to clear in the same jump
        let extra = 0;
        if (!useAir && this.dist > 400 && Math.random() < 0.3) {
          extra = rand(52, 88);
          this.addObstacle(o, x + extra);
          if (this.dist > 1200 && Math.random() < 0.25) {
            extra += rand(52, 84);
            this.addObstacle(o, x + extra);
          }
        }

        this.nextObstacleX = x + extra + this.minGap() * rand(1, 1.7);
      }
    }

    addObstacle(o, x) {
      const w = o.w || 34, h = o.h || 52;
      /* An air obstacle has to sit low enough that a standing player (46u)
       * clips it but a sliding one (24u) does not — so its underside wants to
       * be ~32u off the ground, not at true head height. */
      const y = o.type === 'air'
        ? GROUND_Y - (o.hover || 32) - h
        : GROUND_Y - h;
      this.obstacles.push({ x, y, w, h, emoji: o.emoji, color: o.color, type: o.type || 'ground', hit: false });
    }

    spawnPickups() {
      const p = this.cfg.pickup;
      if (!p) return;
      while (this.nextPickupX < this.worldX + this.viewW + 260) {
        const x = this.nextPickupX;
        const n = 3 + ((Math.random() * 4) | 0);
        const arc = Math.random() < 0.55;
        const baseY = arc ? GROUND_Y - 118 : GROUND_Y - rand(34, 70);
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          const y = arc ? baseY + Math.sin(t * Math.PI) * -46 : baseY;
          const cx = x + i * 40;
          // never park a coin inside an obstacle
          if (this.obstacles.some(o => cx > o.x - 26 && cx < o.x + o.w + 26 && y + 18 > o.y && y < o.y + o.h)) continue;
          this.pickups.push({ x: cx, y, r: 11, got: false, t: Math.random() * 6.28 });
        }
        this.nextPickupX = x + rand(340, 700);
      }
    }

    // ---------- update ----------

    update(dt) {
      this.speed = Math.min(this.speedCfg.max, this.speed + this.speedCfg.accel * dt);
      const dx = this.speed * dt;
      this.worldX += dx;
      this.dist += dx / 10;         // 10 design units == 1 "metre"

      // zone transitions
      const nextZone = this.zones[this.zone];
      if (nextZone && this.dist >= nextZone.at) {
        this.zone++;
        this.announceZone(nextZone);
        SFX.zone();
      }

      // ---- player physics ----
      if (this.sliding > 0) this.sliding -= dt;

      if (!this.grounded) {
        this.vy += GRAVITY * dt;
        this.py += this.vy * dt;
        const floor = GROUND_Y - this.height();
        if (this.py >= floor) {
          this.py = floor;
          this.vy = 0;
          this.grounded = true;
          this.jumps = 0;
          SFX.land();
          this.puff(5);
          if (this.buffered > 0) { this.buffered = 0; this.onJump(); }
        }
      } else {
        this.py = GROUND_Y - this.height();
        this.coyote = COYOTE;
        this.runCycle += dt * (this.speed / 90);
      }
      if (this.coyote > 0 && !this.grounded) this.coyote -= dt;
      if (this.buffered > 0) this.buffered -= dt;

      // ---- world ----
      this.spawnObstacles();
      this.spawnPickups();
      this.obstacles = this.obstacles.filter(o => o.x + o.w > this.worldX - 60);
      this.pickups = this.pickups.filter(p => !p.got && p.x + 20 > this.worldX - 60);

      // ---- collisions ----
      // The player sits at a fixed screen x while the world scrolls, so
      // obstacles and pickups are stored in world space. Convert each to the
      // player's screen space (subtract worldX) before testing overlap —
      // exactly as the renderer does — otherwise nothing ever collides.
      const box = this.playerBox();
      for (const o of this.obstacles) {
        const ox = o.x - this.worldX;
        const sx = o.w * HIT_SHRINK, sy = o.h * HIT_SHRINK;
        if (box.x < ox + o.w - sx && box.x + box.w > ox + sx &&
            box.y < o.y + o.h - sy && box.y + box.h > o.y + sy) {
          return this.crash(o);
        }
      }
      for (const p of this.pickups) {
        p.t += dt * 5;
        const px = p.x - this.worldX;
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
        if (Math.abs(cx - px) < p.r + box.w / 2 && Math.abs(cy - p.y) < p.r + box.h / 2) {
          p.got = true;
          this.coins++;
          this.combo++;
          this.setCombo(this.combo);
          SFX.coin(this.combo);
          this.sparkle(p.x, p.y);
          this.float(p.x, p.y, '+' + this.coinValue(), this.theme.coinColor || '#ffd166');
          this.setStat('ui-coins', this.coins.toLocaleString());
        }
      }

      // ---- score ----
      this.score = Math.floor(this.dist) + this.coins * this.coinValue();
      this.setStat('ui-dist', Math.floor(this.dist).toLocaleString());
      this.setStat('ui-score', this.score.toLocaleString());

      // ---- fx ----
      for (const pt of this.particles) {
        pt.life -= dt;
        pt.x += pt.vx * dt; pt.y += pt.vy * dt;
        pt.vy += (pt.g || 900) * dt;
      }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const f of this.floaters) { f.life -= dt; f.y -= 40 * dt; }
      this.floaters = this.floaters.filter(f => f.life > 0);
      for (const d of this.decor) { d.bob += dt; }
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.4);
    }

    coinValue() { return (this.cfg.pickup && this.cfg.pickup.value) || 10; }
    height() { return this.sliding > 0 ? SLIDE_H : PLAYER_H; }
    playerBox() {
      const h = this.height();
      return { x: PLAYER_X, y: this.py, w: PLAYER_W, h };
    }

    // ---------- feedback ----------

    puff(n, gold) {
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: PLAYER_X + PLAYER_W / 2 + rand(-8, 8), y: GROUND_Y - 2,
          vx: rand(-120, -20), vy: rand(-90, -10), g: 500,
          life: rand(0.25, 0.5), max: 0.5, r: rand(2, 5),
          color: gold ? (this.theme.coinColor || '#ffd166') : (this.theme.dust || 'rgba(255,255,255,0.5)')
        });
      }
    }
    // sparkle/burst originate from world-space things (pickups, obstacles),
    // so they scroll with the level; puff comes off the player and does not.
    sparkle(x, y) {
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * 6.28;
        this.particles.push({
          x, y, world: true, vx: Math.cos(a) * rand(40, 160), vy: Math.sin(a) * rand(40, 160), g: 260,
          life: rand(0.2, 0.45), max: 0.45, r: rand(1.5, 3.5),
          color: this.theme.coinColor || '#ffd166'
        });
      }
    }
    burst(x, y) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28;
        this.particles.push({
          x, y, world: true, vx: Math.cos(a) * rand(60, 320), vy: Math.sin(a) * rand(60, 320) - 60, g: 800,
          life: rand(0.3, 0.8), max: 0.8, r: rand(2, 6),
          color: pick(['#ff6b6b', '#ffd166', '#ffffff'])
        });
      }
    }
    float(x, y, text, color) {
      this.floaters.push({ x, y, text, color, life: 0.8, max: 0.8 });
    }
    announceZone(z) {
      const b = document.getElementById('zone-banner');
      b.textContent = z.name;
      b.style.color = z.color || this.theme.accent || '#7c5cff';
      b.classList.remove('show');
      void b.offsetWidth;
      b.classList.add('show');
    }
    setStat(id, val) {
      const el = document.getElementById(id);
      if (!el || el.textContent === val) return;
      el.textContent = val;
      const chip = el.parentElement;
      chip.classList.remove('pop-up');
      void chip.offsetWidth;
      chip.classList.add('pop-up');
    }
    setCombo(n) {
      const m = document.getElementById('combo-meter');
      if (n < 3) { m.classList.remove('on'); return; }
      m.classList.add('on');
      m.querySelector('.cm-n').textContent = n;
      m.classList.remove('bump');
      void m.offsetWidth;
      m.classList.add('bump');
    }

    // ---------- endgame ----------

    async crash(o) {
      this.over = true;
      this.shake = 16;
      this.flash = 1;
      SFX.crash();
      this.burst(o.x + o.w / 2, o.y + o.h / 2);
      this.setCombo(0);

      let lb = null;
      try {
        await fetch('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game: this.cfg.id, score: this.score, wave: this.zone + 1 })
        });
        lb = await fetch('/api/scores/' + this.cfg.id).then(r => r.json());
      } catch { /* offline is fine */ }

      this.bestLocal = Math.max(this.bestLocal, this.score);
      setTimeout(() => this.showGameOver(lb), 700);
    }

    showGameOver(lb) {
      const ov = document.getElementById('overlay');
      let lbHtml = '';
      if (lb && lb.top && lb.top.length) {
        lbHtml = '<div class="ov-lb"><h3>Leaderboard</h3>' + lb.top.slice(0, 5).map((r, i) =>
          `<div class="ov-row"><span>${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} ${r.username}</span><span>${r.score.toLocaleString()}</span></div>`
        ).join('') + '</div>';
      }
      const best = lb && lb.me ? lb.me.score : this.bestLocal;
      ov.innerHTML = `
        <div class="ov-card lost">
          <div class="ov-emoji">${this.cfg.crashEmoji || '💥'}</div>
          <h2>Wiped Out</h2>
          <div class="ov-sub">${Math.floor(this.dist).toLocaleString()} m · ${this.coins} ${this.cfg.pickup ? this.cfg.pickup.name || 'coins' : 'coins'}</div>
          <div class="ov-score">${this.score.toLocaleString()}</div>
          <div class="ov-best">Best: ${Number(best || 0).toLocaleString()}</div>
          ${lbHtml}
          <div class="ov-btns">
            <a class="ov-home" href="/">🏠 Home</a>
            <button id="ov-again">Run again ▶</button>
          </div>
        </div>`;
      ov.hidden = false;
      document.getElementById('ov-again').onclick = () => this.restart();
    }

    // ---------- render ----------

    frame(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      if (this.started && !this.over && !this.paused) this.update(dt);
      else if (this.paused || this.over) {
        // keep particles alive so the crash still animates
        for (const pt of this.particles) { pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += (pt.g || 900) * dt; }
        this.particles = this.particles.filter(p => p.life > 0);
        if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);
        if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.4);
      }
      this.draw();
      requestAnimationFrame(n => this.frame(n));
    }

    zoneTheme() {
      // zones override theme fields as you progress
      const z = this.zones[this.zone - 1];
      return z ? Object.assign({}, this.theme, z.theme || {}) : this.theme;
    }

    draw() {
      const ctx = this.ctx, S = this.S, th = this.zoneTheme();
      const W = this.viewW, H = this.viewH;

      ctx.save();
      ctx.scale(S, S);
      if (this.shake > 0) {
        ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
      }

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, th.skyTop || '#101030');
      sky.addColorStop(1, th.skyBottom || '#242450');
      ctx.fillStyle = sky;
      ctx.fillRect(-20, -20, W + 40, GROUND_Y + 20);

      if (th.sun) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = th.sun;
        ctx.beginPath();
        ctx.arc(W * 0.72, 78, 40, 0, 6.29);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      this.drawParallax(ctx, th, W);
      this.drawDecor(ctx, W);
      this.drawGround(ctx, th, W, H);
      this.drawPickups(ctx, th);
      this.drawObstacles(ctx);
      this.drawPlayer(ctx, th);
      this.drawParticles(ctx);

      // vignette
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255,80,80,${this.flash * 0.45})`;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();

      if (this.paused) {
        ctx.save();
        ctx.scale(S, S);
        ctx.fillStyle = 'rgba(5,5,15,0.6)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = '700 26px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('paused', W / 2, H / 2);
        ctx.restore();
      }
    }

    drawParallax(ctx, th, W) {
      const layers = th.parallax || this.theme.parallax || [];
      layers.forEach((layer, i) => {
        const shapes = this.layerShapes[i];
        if (!shapes) return;
        const off = (this.worldX * (layer.speed || 0.2)) % shapes.spanX;
        ctx.fillStyle = layer.color;
        ctx.globalAlpha = layer.alpha == null ? 1 : layer.alpha;
        const baseY = GROUND_Y - (layer.lift || 0);
        for (let rep = 0; rep < 2; rep++) {
          for (const s of shapes) {
            const x = s.x - off + rep * shapes.spanX;
            if (x > W + 60 || x + s.w < -60) continue;
            this.drawShape(ctx, layer.type || 'blocks', x, baseY, s.w, s.h, s.seed);
          }
        }
        ctx.globalAlpha = 1;
      });
    }

    drawShape(ctx, type, x, baseY, w, h, seed) {
      if (type === 'hills') {
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.quadraticCurveTo(x + w / 2, baseY - h * 1.7, x + w, baseY);
        ctx.closePath();
        ctx.fill();
      } else if (type === 'spikes') {
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.lineTo(x + w / 2, baseY - h);
        ctx.lineTo(x + w, baseY);
        ctx.closePath();
        ctx.fill();
      } else if (type === 'waves') {
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          ctx.lineTo(x + t * w, baseY - Math.sin(t * Math.PI * 2 + seed * 6) * h * 0.35 - h * 0.4);
        }
        ctx.lineTo(x + w, baseY);
        ctx.closePath();
        ctx.fill();
      } else {
        // blocks — city silhouettes with lit windows
        ctx.fillRect(x, baseY - h, w, h);
        if (seed > 0.35) {
          const prev = ctx.fillStyle;
          ctx.fillStyle = 'rgba(255,235,150,0.16)';
          for (let wy = baseY - h + 10; wy < baseY - 8; wy += 16) {
            for (let wx = x + 6; wx < x + w - 8; wx += 14) {
              if (((wx * 7 + wy * 13 + seed * 1000) | 0) % 3) continue;
              ctx.fillRect(wx, wy, 5, 7);
            }
          }
          ctx.fillStyle = prev;
        }
      }
    }

    drawDecor(ctx, W) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const d of this.decor) {
        let x = d.x - (this.worldX * d.sp) % 900;
        if (x < -40) x += 900;
        if (x > W + 40) continue;
        ctx.globalAlpha = 0.55;
        ctx.font = d.size + 'px system-ui, sans-serif';
        ctx.fillText(d.e, x, d.y + Math.sin(d.bob) * 5);
      }
      ctx.globalAlpha = 1;
    }

    drawGround(ctx, th, W, H) {
      ctx.fillStyle = th.ground || '#2b2b46';
      ctx.fillRect(-20, GROUND_Y, W + 40, H - GROUND_Y + 20);
      ctx.fillStyle = th.groundEdge || '#4a4a76';
      ctx.fillRect(-20, GROUND_Y, W + 40, 4);

      // motion stripes so speed reads even on empty stretches
      ctx.fillStyle = th.groundStripe || 'rgba(255,255,255,0.06)';
      const period = 90;
      const off = this.worldX % period;
      for (let x = -off; x < W + period; x += period) {
        ctx.fillRect(x, GROUND_Y + 18, 42, 3);
      }
      ctx.fillStyle = th.groundStripe2 || 'rgba(255,255,255,0.035)';
      const off2 = (this.worldX * 0.6) % 140;
      for (let x = -off2; x < W + 140; x += 140) {
        ctx.fillRect(x, GROUND_Y + 46, 66, 3);
      }
    }

    drawObstacles(ctx) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const o of this.obstacles) {
        const x = o.x - this.worldX;
        if (x > this.viewW + 60 || x + o.w < -60) continue;
        if (o.color) {
          ctx.fillStyle = o.color;
          ctx.shadowColor = o.color;
          ctx.shadowBlur = 12;
          ctx.fillRect(x, o.y, o.w, o.h);
          ctx.shadowBlur = 0;
        }
        if (o.emoji) {
          ctx.font = Math.min(o.w, o.h) * 1.15 + 'px system-ui, sans-serif';
          ctx.fillText(o.emoji, x + o.w / 2, o.y + o.h / 2);
        }
      }
    }

    drawPickups(ctx, th) {
      const p = this.cfg.pickup;
      if (!p) return;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const c of this.pickups) {
        const x = c.x - this.worldX;
        if (x > this.viewW + 40 || x < -40) continue;
        const bob = Math.sin(c.t) * 3;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.shadowColor = th.coinColor || '#ffd166';
        ctx.shadowBlur = 14;
        ctx.font = '20px system-ui, sans-serif';
        ctx.fillText(p.emoji, x, c.y + bob);
        ctx.restore();
      }
    }

    drawPlayer(ctx, th) {
      const h = this.height();
      const x = PLAYER_X, y = this.py;
      const cx = x + PLAYER_W / 2, cy = y + h / 2;

      // shadow shrinks with height off the ground
      const air = clamp((GROUND_Y - h - y) / 110, 0, 1);
      ctx.globalAlpha = 0.35 * (1 - air * 0.7);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx, GROUND_Y + 3, PLAYER_W * 0.5 * (1 - air * 0.35), 5, 0, 0, 6.29);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (th.trail) {
        for (let i = 1; i <= 4; i++) {
          ctx.globalAlpha = 0.1 * (5 - i);
          ctx.fillStyle = th.trail;
          ctx.fillRect(x - i * 11, y + h * 0.2, 8, h * 0.6);
        }
        ctx.globalAlpha = 1;
      }

      ctx.save();
      ctx.translate(cx, cy);
      if (this.sliding > 0) ctx.rotate(-0.5);
      else if (!this.grounded) ctx.rotate(clamp(this.vy / 1600, -0.35, 0.45));
      else ctx.rotate(Math.sin(this.runCycle) * 0.09);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = (this.sliding > 0 ? PLAYER_H * 0.82 : PLAYER_H) + 'px system-ui, sans-serif';
      ctx.shadowColor = th.accent || '#7c5cff';
      ctx.shadowBlur = 10;
      ctx.fillText(this.cfg.player.emoji, 0, 0);
      ctx.restore();
    }

    drawParticles(ctx) {
      for (const p of this.particles) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x - (p.world ? this.worldX : 0), p.y, p.r, 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      for (const f of this.floaters) {
        ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
        ctx.fillStyle = f.color;
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.fillText(f.text, f.x - this.worldX, f.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  window.RUN = {
    start(cfg) {
      const boot = () => { window.RUN.game = new Runner(cfg); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
      else boot();
    }
  };
})();
