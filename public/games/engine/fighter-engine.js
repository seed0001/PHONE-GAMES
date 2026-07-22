/* Pocket Arcade — shared 2D fighting-game engine.
 *
 * A game is an HTML shell plus a config.js that calls FIGHT.start({...}).
 * The config supplies the stage theme, your fighter and a ladder of AI
 * opponents; everything below (physics, poses, combat, hit detection, the
 * round/match loop, the AI brain, the HUD and score submission) is shared.
 *
 * Mode is an arcade ladder: best-of-3 against each opponent, and every win
 * sends you to a tougher one. Your score is what you bank climbing the ladder;
 * one lost match ends the run. Fighters are drawn from canvas primitives with
 * a small IK-lite skeleton — no sprite assets — so a config is just numbers
 * and colours.
 *
 * All gameplay maths is in "design units" on a 300-unit-tall stage, then
 * scaled to whatever the canvas actually is, so a phone and a desktop get an
 * identical fight.
 */
(function () {
  'use strict';

  // ---------- stage constants (design units) ----------

  const DH = 300;              // design height
  const FLOOR = 264;           // y of the ground the fighters stand on
  const GRAVITY = 1850;
  const JUMP_V = -640;         // ~0.69s airtime
  const BODY_HALF = 13;        // half-width of a fighter's body (for hurt/hitboxes)
  const HURT_TOP = 96;         // standing hurtbox reaches this high above the feet
  const CROUCH_TOP = 58;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const sign = v => (v < 0 ? -1 : 1);

  // ---------- default move set (a config may override any field) ----------

  const DEFAULT_MOVES = {
    punch: { name: 'Jab', dmg: 5, startup: 0.05, active: 0.05, recovery: 0.15, reach: 30,
             height: 'mid', kb: 55, stun: 0.26, meter: 6, push: 30, sfx: 'punch' },
    kick:  { name: 'Kick', dmg: 10, startup: 0.11, active: 0.07, recovery: 0.30, reach: 42,
             height: 'mid', kb: 175, stun: 0.36, meter: 9, push: 42, sfx: 'kick' },
    low:   { name: 'Sweep', dmg: 8, startup: 0.10, active: 0.08, recovery: 0.34, reach: 40,
             height: 'low', kb: 120, stun: 0.5, knockdown: true, meter: 8, push: 30, sfx: 'kick' },
    air:   { name: 'Air Kick', dmg: 9, startup: 0.05, active: 0.16, recovery: 0.06, reach: 34,
             height: 'overhead', kb: 130, stun: 0.32, meter: 8, push: 20, sfx: 'kick', air: true },
    special: { name: 'Fireball', dmg: 13, startup: 0.16, active: 0.05, recovery: 0.34,
               cost: 50, height: 'mid', stun: 0.4, kb: 190, meter: 0, push: 46,
               projectile: { speed: 230, r: 11, life: 2.2 }, sfx: 'special' }
  };

  const DEFAULT_STATS = { maxHp: 100, walk: 82, backWalk: 66, jump: JUMP_V, weight: 1 };

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
    const noise = (dur, gain, hp) => {
      const c = on(); if (!c) return;
      const n = c.createBufferSource();
      const buf = c.createBuffer(1, (c.sampleRate * dur) | 0, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = buf;
      const g = c.createGain(); g.gain.value = gain;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 400;
      n.connect(f); f.connect(g); g.connect(c.destination);
      n.start();
    };
    return {
      unlock: on,
      punch: () => tone(300, 0.07, 'square', 0.04, 170),
      kick:  () => { tone(180, 0.09, 'square', 0.05, 90); noise(0.05, 0.05, 700); },
      hit:   () => { tone(150, 0.12, 'sawtooth', 0.09, 60); noise(0.08, 0.08, 500); },
      block: () => { tone(520, 0.06, 'square', 0.05, 380); noise(0.04, 0.04, 2000); },
      whiff: () => noise(0.06, 0.025, 900),
      special: () => tone(420, 0.35, 'sawtooth', 0.07, 120),
      fire:  () => tone(260, 0.4, 'triangle', 0.05, 620),
      jump:  () => tone(340, 0.1, 'square', 0.03, 560),
      land:  () => tone(120, 0.06, 'sine', 0.04),
      ko:    () => { tone(200, 0.6, 'sawtooth', 0.11, 40); noise(0.3, 0.1, 300); },
      bell:  () => { tone(880, 0.5, 'triangle', 0.08, 660); setTimeout(() => tone(660, 0.5, 'triangle', 0.06), 120); },
      win:   () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.06), i * 90)); }
    };
  })();

  // ---------- a single fighter ----------

  class Fighter {
    constructor(cfg, isPlayer) {
      this.cfg = cfg;
      this.isPlayer = isPlayer;
      this.name = cfg.name || (isPlayer ? 'YOU' : 'RIVAL');
      this.colors = Object.assign(
        { skin: '#e8b48a', hair: '#231a16', gi: '#e8e8ef', trim: '#c23b3b', belt: '#2a2a33', glove: '#c23b3b' },
        cfg.colors || {});
      this.stats = Object.assign({}, DEFAULT_STATS, cfg.stats || {});
      // moves: deep-merge each move so a config can tweak one field
      this.moves = {};
      for (const k of Object.keys(DEFAULT_MOVES)) {
        this.moves[k] = Object.assign({}, DEFAULT_MOVES[k], (cfg.moves && cfg.moves[k]) || {});
        if (this.moves[k].projectile && cfg.moves && cfg.moves[k] && cfg.moves[k].projectile) {
          this.moves[k].projectile = Object.assign({}, DEFAULT_MOVES[k].projectile, cfg.moves[k].projectile);
        }
      }
      this.maxHp = this.stats.maxHp;
    }

    resetRound(x, facing) {
      this.x = x;
      this.y = 0;               // feet offset from FLOOR (0 = grounded, <0 = airborne)
      this.vx = 0;
      this.vy = 0;
      this.facing = facing;     // +1 faces right, -1 faces left
      this.hp = this.maxHp;
      this.meter = this.meter || 0;   // super meter carries across rounds within a match
      this.grounded = true;
      this.crouching = false;
      this.guard = false;
      this.attack = null;       // { move, t, hit }
      this.airActed = false;
      this.hitstun = 0;
      this.blockstun = 0;
      this.knockdown = 0;       // >0 while lying on the ground
      this.state = 'idle';
      this.stateT = 0;
      this.walkPhase = 0;
      this.flash = 0;
      this.combo = 0;
      this.comboT = 0;
    }

    get feetY() { return FLOOR + this.y; }

    // top of the hurtbox (screen y) accounting for crouch and air
    hurtTop() { return this.feetY - (this.crouching && this.grounded ? CROUCH_TOP : HURT_TOP); }

    canAct() {
      return this.knockdown <= 0 && this.hitstun <= 0 && this.blockstun <= 0 && !this.attack;
    }
  }

  // ---------- the engine ----------

  class Fight {
    constructor(cfg) {
      this.cfg = cfg;
      this.stage = cfg.stage || {};
      this.roundTime = cfg.roundTime || 60;
      this.roundsToWin = cfg.roundsToWin || 2;

      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d');
      this.wrap = document.getElementById('canvas-wrap');

      this.input = { left: false, right: false, up: false, down: false, block: false };
      this.player = new Fighter(cfg.player || {}, true);
      this.roster = cfg.roster && cfg.roster.length ? cfg.roster : [{}];

      this.projectiles = [];
      this.particles = [];
      this.floaters = [];
      this.bestLocal = 0;
      this.phase = 'menu';       // menu | intro | fight | roundend | matchend | over
      this.paused = false;
      this.hitstop = 0;
      this.shake = 0;
      this.flash = 0;

      this.bindUI();
      this.resize();
      window.addEventListener('resize', () => this.resize());

      this.showStart();
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    }

    // ---------- setup ----------

    resize() {
      const top = this.wrap.getBoundingClientRect().top;
      const availH = Math.max(240, window.innerHeight - top - 132);
      const h = Math.min(availH, 460);
      const w = Math.min(this.wrap.clientWidth || 360, 720);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.S = h / DH;
      this.viewW = w / this.S;
    }

    bindUI() {
      // held directional / guard buttons
      const hold = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        const set = v => e => { if (e) e.preventDefault(); SFX.unlock(); this.input[key] = v; };
        el.addEventListener('pointerdown', set(true));
        el.addEventListener('pointerup', set(false));
        el.addEventListener('pointerleave', set(false));
        el.addEventListener('pointercancel', set(false));
      };
      hold('btn-left', 'left');
      hold('btn-right', 'right');
      hold('btn-down', 'down');
      hold('btn-block', 'block');

      // edge-triggered actions
      const tap = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('pointerdown', e => { e.preventDefault(); SFX.unlock(); fn(); });
      };
      tap('btn-jump', () => { this.input.up = true; });
      tap('btn-punch', () => this.press('punch'));
      tap('btn-kick', () => this.press('kick'));
      tap('btn-special', () => this.press('special'));
      const pb = document.getElementById('btn-pause');
      if (pb) pb.addEventListener('click', () => this.togglePause());

      // keyboard (desktop)
      const kmap = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
                     arrowdown: 'down', s: 'down', shift: 'block' };
      window.addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        if (kmap[k]) { this.input[kmap[k]] = true; e.preventDefault(); return; }
        if (e.repeat) return;
        SFX.unlock();
        if (k === 'arrowup' || k === 'w' || k === ' ') { this.input.up = true; e.preventDefault(); }
        else if (k === 'j') this.press('punch');
        else if (k === 'k') this.press('kick');
        else if (k === 'l' || k === 'u') this.press('special');
        else if (k === 'p') this.togglePause();
        else if (k === 'enter' && (this.phase === 'menu' || this.phase === 'over')) this.beginRun();
      });
      window.addEventListener('keyup', e => {
        const k = e.key.toLowerCase();
        if (kmap[k]) this.input[kmap[k]] = false;
        if (k === 'arrowup' || k === 'w' || k === ' ') this.input.up = false;
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.phase === 'fight') this.setPaused(true);
      });
    }

    press(kind) {
      // queue an attack for the player; consumed on the next fight tick
      if (this.phase !== 'fight' || this.paused) return;
      this.queued = kind;
    }

    // ---------- run / match / round flow ----------

    beginRun() {
      document.getElementById('overlay').hidden = true;
      this.score = 0;
      this.opp = 0;              // index into the ladder cycle
      this.cycle = 0;            // how many times the ladder has looped (raises difficulty)
      this.player.meter = 0;
      this.startMatch();
    }

    startMatch() {
      const ladder = this.roster[this.opp % this.roster.length];
      this.enemy = new Fighter(ladder, false);
      // each loop of the ladder makes everyone tougher and meaner
      this.diff = this.buildDifficulty(this.opp, this.cycle);
      this.enemy.maxHp = Math.round(this.enemy.maxHp * this.diff.hpScale);
      this.roundWins = { p: 0, e: 0 };
      this.roundNo = 0;
      this.setStat('ui-p2name', this.enemy.name.toUpperCase());
      this.setStat('ui-p1name', this.player.name.toUpperCase());
      this.nextRound();
    }

    buildDifficulty(opp, cycle) {
      const t = opp + cycle * this.roster.length;   // absolute ladder depth
      return {
        react: clamp(0.34 - t * 0.02, 0.08, 0.34),   // AI reaction time (s)
        aggression: clamp(0.35 + t * 0.06, 0.35, 0.9),
        block: clamp(0.3 + t * 0.06, 0.3, 0.85),
        antiAir: clamp(0.2 + t * 0.05, 0.2, 0.8),
        projChance: clamp(0.15 + t * 0.03, 0.15, 0.6),
        speed: clamp(0.85 + t * 0.03, 0.85, 1.2),
        hpScale: clamp(1 + t * 0.06, 1, 2.2)
      };
    }

    nextRound() {
      this.roundNo++;
      this.player.resetRound(this.viewW * 0.32, 1);
      this.enemy.resetRound(this.viewW * 0.68, -1);
      this.enemy.ai = { timer: 0, plan: 'approach', react: 0 };
      this.projectiles = [];
      this.particles = [];
      this.floaters = [];
      this.timeLeft = this.roundTime;
      this.phase = 'intro';
      this.introT = 1.6;
      this.roundResult = null;
      this.updateHud();
      this.banner(`ROUND ${this.roundNo}`, this.enemy.name.toUpperCase(), '#ffd45e');
      SFX.bell();
    }

    endRound(winner) {
      this.phase = 'roundend';
      this.roundResult = winner;   // 'p' | 'e' | 'draw'
      this.roundEndT = 2.4;
      if (winner === 'p') { this.roundWins.p++; this.player.combo = 0; }
      else if (winner === 'e') this.roundWins.e++;
      else { this.roundWins.p++; this.roundWins.e++; }
      this.updateHud();

      const koText = winner === 'p' ? 'K.O.' : winner === 'e' ? 'YOU LOSE' : 'DRAW';
      const color = winner === 'p' ? '#7dff9e' : winner === 'e' ? '#ff5e5e' : '#ffd45e';
      this.banner(koText, winner === 'p' ? 'nice.' : winner === 'e' ? 'shake it off' : 'both down', color);
      this.shake = 18; this.flash = 0.5;
      if (winner === 'p') SFX.win(); else SFX.ko();
    }

    resolveRoundEnd() {
      if (this.roundWins.p >= this.roundsToWin || this.roundWins.e >= this.roundsToWin) {
        this.endMatch(this.roundWins.p > this.roundWins.e);
      } else {
        this.nextRound();
      }
    }

    endMatch(playerWon) {
      if (!playerWon) { this.gameOver(); return; }

      // bank the win, reward for how cleanly it went, then heal and climb
      const depth = this.opp + this.cycle * this.roster.length;
      const base = 1000 + depth * 600;
      const hpBonus = Math.round((this.player.hp / this.player.maxHp) * 800);
      const flawless = this.roundWins.e === 0 ? 1000 : 0;
      const gained = base + hpBonus + flawless;
      this.score += gained;

      this.phase = 'matchend';
      this.matchEndT = 3.0;
      this.matchGain = { base, hpBonus, flawless, total: gained };

      // heal for the next bout, and advance the ladder
      this.player.hp = clamp(this.player.hp + this.player.maxHp * 0.45, 0, this.player.maxHp);
      this.player.meter = clamp(this.player.meter + 25, 0, 100);
      this.opp++;
      if (this.opp % this.roster.length === 0) this.cycle++;
      this.updateHud();
      SFX.win();
    }

    async gameOver() {
      this.phase = 'over';
      const stage = this.opp + 1;    // how deep they reached (1-based)
      let lb = null;
      try {
        await fetch('/api/scores', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game: this.cfg.id, score: this.score, wave: stage })
        });
        lb = await fetch('/api/scores/' + this.cfg.id).then(r => r.json());
      } catch { /* offline is fine */ }
      this.bestLocal = Math.max(this.bestLocal, this.score);
      setTimeout(() => this.showGameOver(lb, stage), 400);
    }

    // ---------- main loop ----------

    setPaused(p) {
      if (this.phase !== 'fight') return;
      this.paused = p;
      const b = document.getElementById('btn-pause');
      if (b) b.textContent = p ? '▶' : '⏸';
      if (!p) this.last = performance.now();
    }
    togglePause() { this.setPaused(!this.paused); }

    frame(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      if (!this.paused) this.update(dt);
      this.draw();
      requestAnimationFrame(n => this.frame(n));
    }

    update(dt) {
      // decay screen fx regardless of phase
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);
      this.stepParticles(dt);

      if (this.phase === 'intro') {
        this.introT -= dt;
        // fighters idle during the intro
        this.stepFighter(this.player, this.enemy, this.neutralIntent(), dt, true);
        this.stepFighter(this.enemy, this.player, this.neutralIntent(), dt, true);
        if (this.introT <= 0) { this.phase = 'fight'; this.banner('FIGHT!', '', '#ff5e5e'); }
        return;
      }
      if (this.phase === 'roundend') {
        this.roundEndT -= dt;
        this.stepFighter(this.player, this.enemy, this.neutralIntent(), dt, true);
        this.stepFighter(this.enemy, this.player, this.neutralIntent(), dt, true);
        this.stepProjectiles(dt);
        if (this.roundEndT <= 0) this.resolveRoundEnd();
        return;
      }
      if (this.phase === 'matchend') {
        this.matchEndT -= dt;
        this.stepFighter(this.player, this.enemy, this.neutralIntent(), dt, true);
        if (this.matchEndT <= 0) this.startMatch();
        return;
      }
      if (this.phase !== 'fight') return;

      // hitstop freezes the action but keeps particles/juice alive
      if (this.hitstop > 0) { this.hitstop -= dt; return; }

      this.timeLeft = Math.max(0, this.timeLeft - dt);

      const pIntent = this.playerIntent();
      const eIntent = this.aiIntent(dt);
      this.stepFighter(this.player, this.enemy, pIntent, dt, false);
      this.stepFighter(this.enemy, this.player, eIntent, dt, false);
      this.stepProjectiles(dt);
      this.separate();
      this.updateHud();

      // win conditions
      if (this.enemy.hp <= 0 && this.player.hp <= 0) this.endRound('draw');
      else if (this.enemy.hp <= 0) this.endRound('p');
      else if (this.player.hp <= 0) this.endRound('e');
      else if (this.timeLeft <= 0) {
        const pr = this.player.hp / this.player.maxHp, er = this.enemy.hp / this.enemy.maxHp;
        this.endRound(pr > er ? 'p' : er > pr ? 'e' : 'draw');
      }
    }

    // ---------- intents ----------

    neutralIntent() { return { left: false, right: false, up: false, down: false, block: false, attack: null }; }

    playerIntent() {
      const p = this.player;
      const away = -p.facing;   // holding "back" (away from enemy) also guards
      const holdingBack = (this.input.left && away < 0) || (this.input.right && away > 0);
      const intent = {
        left: this.input.left,
        right: this.input.right,
        up: this.input.up,
        down: this.input.down,
        block: this.input.block || holdingBack,
        attack: this.queued || null
      };
      this.queued = null;
      this.input.up = false;    // jump is edge-triggered
      return intent;
    }

    // ---------- fighter step ----------

    stepFighter(f, opp, intent, dt, frozen) {
      f.stateT += dt;
      f.walkPhase += dt;
      if (f.flash > 0) f.flash = Math.max(0, f.flash - dt * 4);
      if (f.comboT > 0) { f.comboT -= dt; if (f.comboT <= 0) f.combo = 0; }

      // face the opponent when grounded and free to turn
      if (f.grounded && f.canAct() && !frozen) {
        const want = sign(opp.x - f.x);
        if (want !== 0) f.facing = want;
      }

      // timers
      if (f.hitstun > 0) f.hitstun -= dt;
      if (f.blockstun > 0) f.blockstun -= dt;
      if (f.knockdown > 0) {
        f.knockdown -= dt;
        // slide to a stop while down
        f.vx *= 0.86;
        f.x += f.vx * dt;
      }

      // vertical physics
      if (!f.grounded) {
        f.vy += GRAVITY * dt;
        f.y += f.vy * dt;
        f.x += f.vx * dt;
        if (f.y >= 0) {
          f.y = 0; f.vy = 0; f.grounded = true; f.airActed = false;
          f.vx = 0;
          if (f.attack && f.attack.move.air) f.attack = null;
          f.state = 'idle'; f.stateT = 0;
          this.puff(f.x, f.feetY, 5, '#ffffff');
          SFX.land();
        }
      }

      // advance an ongoing attack
      if (f.attack) {
        this.advanceAttack(f, opp, dt);
      }

      if (frozen) { this.clampToStage(f); return; }

      // controllable behaviour
      if (f.canAct() && f.grounded) {
        f.crouching = !!intent.down;
        f.guard = !!intent.block;

        // jump
        if (intent.up) {
          f.grounded = false;
          f.vy = f.stats.jump;
          f.vx = intent.right && !intent.left ? f.stats.walk * 0.8
               : intent.left && !intent.right ? -f.stats.walk * 0.8 : 0;
          f.state = 'jump'; f.stateT = 0;
          SFX.jump();
        } else if (intent.attack) {
          this.startAttack(f, intent.attack, opp);
        } else if (!f.crouching && !f.guard) {
          // walk — forward (toward the enemy) is quicker than backing off
          let vx = 0;
          const dir = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
          if (dir !== 0) {
            const forward = dir === f.facing;
            vx = dir * (forward ? f.stats.walk : f.stats.backWalk);
            f.state = forward ? 'walk' : 'walkback';
          } else {
            f.state = 'idle';
          }
          f.x += vx * dt;
        } else {
          f.state = f.crouching ? 'crouch' : 'block';
        }
      } else if (!f.grounded && intent.attack && !f.airActed && !f.attack) {
        this.startAttack(f, intent.attack, opp);
      }

      this.clampToStage(f);
    }

    clampToStage(f) {
      f.x = clamp(f.x, BODY_HALF + 2, this.viewW - BODY_HALF - 2);
    }

    // keep the two fighters from overlapping on the ground
    separate() {
      const a = this.player, b = this.enemy;
      if (!a.grounded || !b.grounded) return;
      const min = BODY_HALF * 2 - 2;
      const d = b.x - a.x;
      if (Math.abs(d) < min) {
        const push = (min - Math.abs(d)) / 2 * sign(d || 1);
        a.x -= push; b.x += push;
        this.clampToStage(a); this.clampToStage(b);
      }
    }

    // ---------- attacks ----------

    startAttack(f, kind, opp) {
      let key = kind;
      if (kind === 'punch' || kind === 'kick') {
        if (!f.grounded) key = 'air';
        else if (f.crouching && kind === 'kick') key = 'low';
      }
      const move = f.moves[key];
      if (!move) return;
      if (move.cost && f.meter < move.cost) { SFX.whiff(); return; }  // not enough meter

      f.attack = { move, key, t: 0, hit: false, fired: false };
      f.state = 'attack';
      f.stateT = 0;
      if (!f.grounded) f.airActed = true;
      if (move.cost) { f.meter -= move.cost; this.updateHud(); }
    }

    advanceAttack(f, opp, dt) {
      const a = f.attack;
      a.t += dt;
      const m = a.move;
      const activeStart = m.startup;
      const activeEnd = m.startup + m.active;
      const total = m.startup + m.active + m.recovery;

      // projectile fires once, at the start of the active window
      if (m.projectile && !a.fired && a.t >= activeStart) {
        a.fired = true;
        this.spawnProjectile(f, m);
        SFX.special();
      }

      // melee active window: test for a hit
      if (!m.projectile && !a.hit && a.t >= activeStart && a.t <= activeEnd) {
        if (this.tryHit(f, opp, m)) a.hit = true;
      }
      // a whiff hiss right as a melee starts
      if (!m.projectile && !a.fired && a.t >= activeStart) { a.fired = true; if (!a.hit) SFX.whiff(); }

      if (a.t >= total) {
        f.attack = null;
        if (f.grounded) { f.state = 'idle'; f.stateT = 0; }
      }
    }

    // hitbox of an active melee move, in world units
    hitbox(f, m) {
      const front = f.x + f.facing * BODY_HALF;
      const x0 = Math.min(front, front + f.facing * m.reach);
      const x1 = Math.max(front, front + f.facing * m.reach);
      const fy = f.feetY;
      let y0, y1;
      if (m.height === 'low') { y0 = fy - 24; y1 = fy + 4; }
      else if (m.height === 'overhead') { y0 = fy - 104; y1 = fy - 50; }
      else { y0 = fy - 74; y1 = fy - 28; }   // mid
      return { x0, x1, y0, y1 };
    }

    hurtbox(t) {
      return { x0: t.x - BODY_HALF, x1: t.x + BODY_HALF, y0: t.hurtTop(), y1: t.feetY };
    }

    overlap(a, b) {
      return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    }

    tryHit(f, opp, m) {
      if (opp.knockdown > 0) return false;   // can't hit someone already down
      const hb = this.hitbox(f, m), tb = this.hurtbox(opp);
      if (!this.overlap(hb, tb)) return false;
      this.applyHit(f, opp, m);
      return true;
    }

    guardsAgainst(opp, m) {
      // no guarding in the air, mid-attack, or while reeling from a clean hit
      if (!opp.guard || !opp.grounded || opp.attack || opp.hitstun > 0) return false;
      // facing the attacker is implied by guard being "hold back"; check stance vs height
      if (m.height === 'low') return opp.crouching;
      if (m.height === 'overhead') return !opp.crouching;
      return true;   // mid blocks either way
    }

    applyHit(attacker, opp, m) {
      const cx = opp.x, cy = opp.hurtTop() + (opp.feetY - opp.hurtTop()) * 0.5;
      attacker.meter = clamp(attacker.meter + (m.meter || 6), 0, 100);

      if (this.guardsAgainst(opp, m)) {
        const chip = Math.max(1, Math.round(m.dmg * 0.12));
        opp.hp = Math.max(0, opp.hp - chip);
        opp.blockstun = 0.16 + m.stun * 0.3;
        opp.vx = -attacker.facing * (m.push || 30) * 0.8;
        opp.x += -attacker.facing * 3;
        opp.meter = clamp(opp.meter + 4, 0, 100);
        this.hitstop = 0.03;
        this.spark(cx, cy, '#bfe3ff', 6, true);
        this.floater(cx, opp.hurtTop() - 4, 'BLOCK', '#bfe3ff');
        SFX.block();
        attacker.combo = 0;
        this.clampToStage(opp);
        return;
      }

      // clean hit
      opp.hp = Math.max(0, opp.hp - m.dmg);
      opp.hitstun = m.stun;
      opp.blockstun = 0;
      opp.attack = null;
      opp.meter = clamp(opp.meter + 5, 0, 100);
      opp.flash = 1;
      opp.state = 'hurt'; opp.stateT = 0;
      const kb = (m.kb || 80) / (opp.stats.weight || 1);
      opp.vx = attacker.facing * kb;
      if (m.knockdown || (m.launch)) {
        opp.grounded = false;
        opp.vy = m.launch ? -m.launch : -260;
        opp.knockdown = m.knockdown ? 0.9 : 0;
      } else {
        opp.x += attacker.facing * (m.push || 30) * 0.12;
      }

      // combo tracking / juice
      attacker.combo++;
      attacker.comboT = 1.1;
      this.hitstop = Math.min(0.09, 0.045 + m.dmg * 0.002);
      this.shake = Math.max(this.shake, 6 + m.dmg * 0.4);
      this.spark(cx, cy, '#ffd45e', 10, false);
      this.floater(cx, opp.hurtTop() - 6, '-' + m.dmg, '#ff6b6b');
      if (attacker.combo >= 2) this.floater(cx - 4, opp.hurtTop() - 22, attacker.combo + ' HIT', '#ffe08a');
      SFX.hit();
      this.clampToStage(opp);
    }

    // ---------- projectiles ----------

    spawnProjectile(f, m) {
      const p = m.projectile;
      // keep only one of a fighter's projectiles alive at a time
      if (this.projectiles.some(pr => pr.owner === f)) return;
      this.projectiles.push({
        owner: f, x: f.x + f.facing * 20, y: f.feetY - 52,
        vx: f.facing * p.speed, r: p.r || 10, life: p.life || 2,
        dmg: m.dmg, stun: m.stun, kb: m.kb, push: m.push,
        color: f.colors.glove || '#ff8c42', height: m.height || 'mid', dir: f.facing
      });
      SFX.fire();
    }

    stepProjectiles(dt) {
      for (const pr of this.projectiles) {
        pr.x += pr.vx * dt;
        pr.life -= dt;
        pr.spin = (pr.spin || 0) + dt * 12;
        if (pr.x < -20 || pr.x > this.viewW + 20) pr.life = 0;
        // trail
        if (Math.random() < 0.6) this.particles.push({
          x: pr.x, y: pr.y, vx: -pr.vx * 0.05, vy: rand(-20, 20),
          r: rand(2, 4), life: 0.3, max: 0.3, color: pr.color, g: 0
        });
        // hit test against the opposing fighter
        const target = pr.owner === this.player ? this.enemy : this.player;
        if (this.phase === 'fight' && target.knockdown <= 0) {
          const tb = this.hurtbox(target);
          if (pr.x + pr.r > tb.x0 && pr.x - pr.r < tb.x1 && pr.y > tb.y0 && pr.y < tb.y1) {
            this.applyHit(pr.owner, target, { dmg: pr.dmg, stun: pr.stun, kb: pr.kb, push: pr.push,
                                              height: pr.height, meter: 3 });
            pr.life = 0;
            this.spark(pr.x, pr.y, pr.color, 10, false);
          }
        }
      }
      this.projectiles = this.projectiles.filter(p => p.life > 0);
    }

    // ---------- AI ----------

    aiIntent(dt) {
      const e = this.enemy, p = this.player;
      const d = this.diff;
      const ai = e.ai;
      const intent = { left: false, right: false, up: false, down: false, block: false, attack: null };
      if (e.knockdown > 0 || e.hitstun > 0 || e.blockstun > 0 || e.attack) return intent;

      const dist = Math.abs(p.x - e.x);
      const toward = sign(p.x - e.x);
      ai.timer -= dt;
      ai.react -= dt;

      // block on reaction when the player is threatening up close
      const playerAttacking = p.attack && p.attack.t < (p.attack.move.startup + p.attack.move.active + 0.05);
      const incomingProj = this.projectiles.some(pr => pr.owner === p &&
        sign(pr.vx) === toward && Math.abs(pr.x - e.x) < 120);
      if ((playerAttacking && dist < 60 || incomingProj) && Math.random() < d.block && ai.react <= 0) {
        intent.block = true;
        intent.down = playerAttacking && p.crouching && Math.random() < 0.5;  // guess low sometimes
        ai.react = d.react * 0.5;
        return intent;
      }

      // anti-air: if the player is jumping in close, poke up
      if (!p.grounded && dist < 70 && Math.random() < d.antiAir * dt * 6) {
        intent.attack = 'punch';
        return intent;
      }

      // periodically pick a new plan
      if (ai.timer <= 0) {
        ai.timer = rand(0.25, 0.7) / d.speed;
        const r = Math.random();
        if (dist > 150 && e.moves.special.projectile && r < d.projChance && e.meter >= (e.moves.special.cost || 50)) {
          ai.plan = 'fireball';
        } else if (dist > 64) {
          ai.plan = r < d.aggression ? 'approach' : (r < d.aggression + 0.2 ? 'jumpin' : 'approach');
        } else {
          ai.plan = r < d.aggression ? 'attack' : (r < 0.85 ? 'attack' : 'retreat');
        }
      }

      switch (ai.plan) {
        case 'fireball':
          if (ai.react <= 0) { intent.attack = 'special'; ai.react = d.react; ai.plan = 'approach'; }
          break;
        case 'approach':
          if (dist > 52) intent[toward > 0 ? 'right' : 'left'] = true;
          else ai.plan = 'attack';
          break;
        case 'jumpin':
          if (dist > 60) intent[toward > 0 ? 'right' : 'left'] = true;
          intent.up = true; ai.plan = 'approach';
          break;
        case 'retreat':
          intent[toward > 0 ? 'left' : 'right'] = true;
          break;
        case 'attack':
          if (dist < 58 && ai.react <= 0) {
            const r = Math.random();
            intent.attack = r < 0.45 ? 'punch' : r < 0.8 ? 'kick' : 'kick';
            if (r > 0.8) intent.down = true;   // occasional low
            ai.react = d.react;
            ai.timer = rand(0.2, 0.5);
          } else if (dist >= 58) {
            intent[toward > 0 ? 'right' : 'left'] = true;
          }
          break;
      }
      return intent;
    }

    // ---------- particles / juice ----------

    spark(x, y, color, n, block) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, 6.28), sp = rand(40, block ? 140 : 220);
        this.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
          r: rand(1.5, block ? 3 : 4.5), life: rand(0.2, 0.45), max: 0.45,
          color, g: 300
        });
      }
    }
    puff(x, y, n, color) {
      for (let i = 0; i < n; i++) this.particles.push({
        x: x + rand(-8, 8), y, vx: rand(-40, 40), vy: rand(-60, -10),
        r: rand(2, 5), life: rand(0.2, 0.4), max: 0.4, color, g: 120
      });
    }
    floater(x, y, text, color) {
      this.floaters.push({ x, y, text, color, life: 0.8, max: 0.8, vy: -46 });
    }
    stepParticles(dt) {
      for (const p of this.particles) {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt;
      }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const f of this.floaters) { f.life -= dt; f.y += f.vy * dt; f.vy *= 0.92; }
      this.floaters = this.floaters.filter(f => f.life > 0);
    }

    // ---------- HUD ----------

    setStat(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

    updateHud() {
      const p = this.player, e = this.enemy;
      const bar = (id, frac) => { const el = document.getElementById(id); if (el) el.style.width = clamp(frac, 0, 1) * 100 + '%'; };
      bar('ui-p1hp', p.hp / p.maxHp);
      bar('ui-p2hp', e ? e.hp / e.maxHp : 1);
      bar('ui-p1meter', p.meter / 100);
      bar('ui-p2meter', e ? e.meter / 100 : 0);
      this.setStat('ui-timer', Math.ceil(this.timeLeft != null ? this.timeLeft : this.roundTime));
      this.setStat('ui-score', (this.score || 0).toLocaleString());
      // round pips
      const pips = document.getElementById('ui-pips');
      if (pips) {
        const need = this.roundsToWin;
        const dot = (on, side) => `<i class="pip ${side}${on ? ' won' : ''}"></i>`;
        let html = '';
        for (let i = 0; i < need; i++) html += dot(this.roundWins && this.roundWins.p > i, 'p');
        html = `<span class="pipset left">${html}</span>`;
        let r = '';
        for (let i = 0; i < need; i++) r += dot(this.roundWins && this.roundWins.e > i, 'e');
        html += `<span class="pipset right">${r}</span>`;
        pips.innerHTML = html;
      }
    }

    banner(big, small, color) {
      const el = document.getElementById('fight-banner');
      if (!el) return;
      el.innerHTML = `<span class="bb" style="color:${color};text-shadow:0 0 18px ${color}">${big}</span>` +
                     (small ? `<span class="bs">${small}</span>` : '');
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    }

    // ---------- rendering ----------

    draw() {
      const ctx = this.ctx, S = this.S;
      const W = this.viewW, H = DH;
      ctx.save();
      const sx = this.shake > 0 ? rand(-1, 1) * this.shake * 0.4 : 0;
      const sy = this.shake > 0 ? rand(-1, 1) * this.shake * 0.4 : 0;
      ctx.setTransform(S, 0, 0, S, sx * S, sy * S);

      this.drawStage(ctx, W, H);

      // shadows
      for (const f of [this.player, this.enemy]) {
        if (!f) continue;
        const sc = clamp(1 - (-f.y) / 160, 0.4, 1);
        ctx.save();
        ctx.globalAlpha = 0.28 * sc;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(f.x, FLOOR + 2, 20 * sc, 5 * sc, 0, 0, 6.29);
        ctx.fill();
        ctx.restore();
      }

      // draw back-to-front by x so the nearer fighter overlaps
      const order = [this.player, this.enemy].filter(Boolean).sort((a, b) => a.y - b.y);
      for (const f of order) this.drawFighter(ctx, f);

      for (const pr of this.projectiles) this.drawProjectile(ctx, pr);
      this.drawParticles(ctx);

      ctx.restore();

      // full-screen white flash on big moments
      if (this.flash > 0) {
        ctx.save();
        ctx.globalAlpha = this.flash * 0.5;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
      }
    }

    drawStage(ctx, W, H) {
      const th = this.stage;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, th.skyTop || '#241a3a');
      g.addColorStop(1, th.skyBottom || '#3a2a4e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // distant silhouette band
      if (th.horizon) {
        ctx.fillStyle = th.horizon;
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 7; i++) {
          const bw = W / 6, x = i * bw - bw * 0.2, bh = 40 + ((i * 53) % 60);
          ctx.fillRect(x, FLOOR - bh, bw * 0.8, bh);
        }
        ctx.globalAlpha = 1;
      }
      // decorative glyphs (torches, signs, stars…)
      if (th.decor && th.decor.length) {
        ctx.textAlign = 'center';
        ctx.font = (th.decorSize || 20) + 'px system-ui';
        ctx.globalAlpha = th.decorAlpha != null ? th.decorAlpha : 0.85;
        const n = th.decorCount || 6;
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5) * (W / n);
          const y = th.decorY || FLOOR - 96;
          ctx.fillText(th.decor[i % th.decor.length], x, y + Math.sin(i * 1.7) * 6);
        }
        ctx.globalAlpha = 1;
      }

      // floor
      const fg = ctx.createLinearGradient(0, FLOOR, 0, H);
      fg.addColorStop(0, th.floorTop || '#2a2436');
      fg.addColorStop(1, th.floorBottom || '#15111f');
      ctx.fillStyle = fg;
      ctx.fillRect(0, FLOOR, W, H - FLOOR);
      ctx.strokeStyle = th.floorLine || 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, FLOOR + 1); ctx.lineTo(W, FLOOR + 1); ctx.stroke();
      // floor perspective lines
      ctx.strokeStyle = th.floorLine || 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const y = FLOOR + (H - FLOOR) * (i / 6);
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // --- the articulated fighter (IK-lite skeleton from canvas primitives) ---

    drawFighter(ctx, f) {
      const pose = this.poseFor(f);
      const facing = f.facing;
      const feetY = f.feetY;
      const c = f.colors;

      // knockdown: draw the whole body toppled over
      if (f.knockdown > 0 || (f.hp <= 0 && this.phase !== 'fight')) {
        ctx.save();
        ctx.translate(f.x, feetY);
        ctx.rotate(facing * 1.35);
        ctx.translate(0, -6);
        this.drawSkeleton(ctx, this.poseFor(f, true), facing, c, f);
        ctx.restore();
        return;
      }

      ctx.save();
      if (f.flash > 0.01) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 14 * f.flash; }
      this.drawSkeletonAt(ctx, f.x, feetY, pose, facing, c, f);
      ctx.restore();
    }

    drawSkeletonAt(ctx, x, feetY, pose, facing, c, f) {
      ctx.save();
      ctx.translate(x, feetY);
      this.drawSkeleton(ctx, pose, facing, c, f);
      ctx.restore();
    }

    // pose returns joint offsets relative to the feet point (y up = negative)
    poseFor(f, ko) {
      const s = f.state;
      const crouch = (f.crouching && f.grounded) ? 1 : 0;
      const hipH = lerp(46, 30, crouch);
      const torso = lerp(30, 24, crouch);
      let lean = 0, head = 0;
      const F = f.facing;

      // default stance: guard up, feet apart
      let backFoot = { x: -13, y: 0, lift: 0 };
      let frontFoot = { x: 15, y: 0, lift: 0 };
      let backHand = { x: 4, y: -2 };      // relative to shoulder, +x = toward facing
      let frontHand = { x: 12, y: -6 };

      const bob = Math.sin(f.walkPhase * 6) * 1.4;

      if (s === 'walk' || s === 'walkback') {
        const dir = s === 'walk' ? 1 : -1;
        const ph = Math.sin(f.walkPhase * 11);
        frontFoot = { x: 12 + ph * 12 * dir, y: 0, lift: Math.max(0, ph * dir) * 8 };
        backFoot = { x: -12 - ph * 12 * dir, y: 0, lift: Math.max(0, -ph * dir) * 8 };
        frontHand = { x: 11 - ph * 4, y: -6 };
        backHand = { x: 4 + ph * 4, y: -2 };
      } else if (crouch) {
        backFoot = { x: -16, y: 0, lift: 0 };
        frontFoot = { x: 18, y: 0, lift: 0 };
        frontHand = { x: 12, y: -2 };
        backHand = { x: 5, y: 0 };
        lean = 0.12;
      } else if (s === 'block') {
        lean = -0.16;
        frontHand = { x: 13, y: -10 };
        backHand = { x: 9, y: -6 };
      } else if (s === 'jump') {
        backFoot = { x: -8, y: -14, lift: 0 };
        frontFoot = { x: 12, y: -18, lift: 0 };
        frontHand = { x: 12, y: -10 };
        backHand = { x: 2, y: -8 };
      } else if (s === 'hurt') {
        lean = -0.5; head = -6;
        frontHand = { x: -6, y: 4 };
        backHand = { x: -10, y: 6 };
        frontFoot = { x: 16, y: 0, lift: 3 };
      } else {
        // idle bob
        frontHand = { x: 12, y: -6 + bob };
        backHand = { x: 4, y: -2 + bob };
      }

      // overlay the current attack on the relevant limb
      if (f.attack && !ko) {
        const a = f.attack, m = a.move;
        const total = m.startup + m.active + m.recovery;
        const p = clamp(a.t / total, 0, 1);
        // ext peaks during the active window, eases in/out around it
        const aStart = m.startup / total, aEnd = (m.startup + m.active) / total;
        let ext;
        if (p < aStart) ext = p / aStart * 0.7;
        else if (p <= aEnd) ext = 1;
        else ext = 1 - (p - aEnd) / (1 - aEnd);
        ext = clamp(ext, 0, 1);

        if (a.key === 'punch' || m.projectile) {
          lean = 0.14 * ext;
          if (m.projectile) {
            // both hands thrust forward to push the fireball out
            frontHand = { x: lerp(-2, 22, ext), y: -8 };
            backHand = { x: lerp(-2, 18, ext), y: -6 };
          } else {
            frontHand = { x: lerp(-4, 26, ext), y: -6 };
          }
        } else if (a.key === 'kick' || a.key === 'air') {
          lean = -0.2 * ext;
          frontFoot = { x: lerp(14, 30 + 6, ext), y: lerp(0, a.key === 'air' ? -18 : -26, ext), lift: 0 };
          frontHand = { x: 6, y: -8 };
          backHand = { x: -2, y: -2 };
        } else if (a.key === 'low') {
          lean = 0.18 * ext;
          frontFoot = { x: lerp(16, 34, ext), y: lerp(0, -4, ext), lift: 0 };
        }
      }

      return { hipH, torso, lean, head, backFoot, frontFoot, backHand, frontHand, crouch, F };
    }

    drawSkeleton(ctx, pose, facing, c, f) {
      const F = facing;
      const hip = { x: 0, y: -pose.hipH };
      const shoulder = {
        x: hip.x + Math.sin(pose.lean) * pose.torso * F,
        y: hip.y - Math.cos(pose.lean) * pose.torso
      };
      const neck = {
        x: shoulder.x + Math.sin(pose.lean) * 8 * F,
        y: shoulder.y - Math.cos(pose.lean) * 8
      };
      const headC = { x: neck.x + pose.head * F, y: neck.y - 9 };

      const capsule = (a, b, w, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      };
      // a two-bone limb from `from` to `foot/hand` target, knee/elbow bowed by `bend`
      const limb = (from, target, bendX, bendY, w, col) => {
        const mid = { x: (from.x + target.x) / 2 + bendX * F, y: (from.y + target.y) / 2 + bendY };
        capsule(from, mid, w, col);
        capsule(mid, target, w * 0.85, col);
        return mid;
      };

      const dark = shade(c.gi, -0.28);
      const skinDark = shade(c.skin, -0.25);

      // --- back leg & arm (drawn first, slightly darker) ---
      // feet rest at local y=0 (the floor) unless lifted mid-stride or airborne
      const bFoot = { x: hip.x + pose.backFoot.x, y: pose.backFoot.y - pose.backFoot.lift };
      limb(hip, bFoot, -4, 6, 9, shade(c.gi, -0.34));
      const bShoulder = { x: shoulder.x - 3 * F, y: shoulder.y + 1 };
      const bHand = { x: shoulder.x + pose.backHand.x * F, y: shoulder.y + pose.backHand.y };
      limb(bShoulder, bHand, 2, 4, 7, shade(c.skin, -0.3));
      dot(ctx, bHand, 4.2, shade(c.glove, -0.2));

      // --- torso ---
      ctx.strokeStyle = c.gi; ctx.lineWidth = 17; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(shoulder.x, shoulder.y); ctx.stroke();
      // belt
      dot(ctx, { x: hip.x, y: hip.y }, 9, c.belt);
      // trim stripe down the gi
      capsule({ x: hip.x + (F * -4), y: hip.y - 3 }, { x: shoulder.x + (F * -4), y: shoulder.y + 2 }, 3, c.trim);

      // --- front leg ---
      const fFoot = { x: pose.frontFoot.x + hip.x, y: pose.frontFoot.y - pose.frontFoot.lift };
      limb(hip, fFoot, 5, 6, 10, c.gi);
      dot(ctx, fFoot, 4, shade(c.belt, 0.05));

      // --- head ---
      ctx.fillStyle = c.skin;
      ctx.beginPath(); ctx.arc(headC.x, headC.y, 9, 0, 6.29); ctx.fill();
      // hair cap
      ctx.fillStyle = c.hair;
      ctx.beginPath();
      ctx.arc(headC.x, headC.y - 1, 9, Math.PI * 1.05, Math.PI * 2.15);
      ctx.fill();
      ctx.fillStyle = c.hair;
      ctx.fillRect(headC.x - 9, headC.y - 3, 18, 3);
      // face direction hint: a small brow/eye
      ctx.fillStyle = f && f.flash > 0.3 ? '#fff' : '#1a1a22';
      ctx.beginPath(); ctx.arc(headC.x + 4 * F, headC.y - 1, 1.6, 0, 6.29); ctx.fill();
      // headband trim
      capsule({ x: headC.x - 9, y: headC.y - 2 }, { x: headC.x + 9, y: headC.y - 2 }, 2.4, c.trim);

      // --- front arm (drawn last, on top) ---
      const fHand = { x: shoulder.x + pose.frontHand.x * F, y: shoulder.y + pose.frontHand.y };
      limb(shoulder, fHand, 3, 3, 8, c.skin);
      dot(ctx, fHand, 4.6, c.glove);
    }

    drawProjectile(ctx, pr) {
      ctx.save();
      const grd = ctx.createRadialGradient(pr.x, pr.y, 1, pr.x, pr.y, pr.r * 1.8);
      grd.addColorStop(0, '#fff');
      grd.addColorStop(0.4, pr.color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 1.8, 0, 6.29); ctx.fill();
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = pr.spin + i * 1.256;
        const rr = i % 2 ? pr.r : pr.r * 0.5;
        const px = pr.x + Math.cos(a) * rr, py = pr.y + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    drawParticles(ctx) {
      for (const p of this.particles) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      for (const fl of this.floaters) {
        ctx.globalAlpha = clamp(fl.life / fl.max, 0, 1);
        ctx.fillStyle = fl.color;
        ctx.font = '900 15px system-ui, sans-serif';
        ctx.fillText(fl.text, fl.x, fl.y);
      }
      ctx.globalAlpha = 1;
    }

    // ---------- overlays ----------

    showStart() {
      this.phase = 'menu';
      const c = this.cfg;
      const ov = document.getElementById('overlay');
      const first = (this.roster[0] && this.roster[0].name) || 'the rival';
      ov.innerHTML = `
        <div class="ov-card start">
          <div class="ov-emoji">${c.icon || '🥊'}</div>
          <h2>${c.name}</h2>
          <div class="ov-sub">${c.tagline || 'Climb the ladder. Best of 3, then a tougher rival.'}</div>
          <div class="ov-keys">
            <b>◀ ▶</b> move · <b>⤒</b> jump · <b>⤓</b> crouch · <b>🛡</b> hold to block<br>
            <b>👊</b> punch · <b>🦵</b> kick · <b>⚡</b> special (needs meter)<br>
            <span class="dim">Crouch + kick sweeps low · block low hits crouching · jump-ins hit overhead.</span>
          </div>
          <div class="ov-btns">
            <a class="ov-home" href="/">🏠 Home</a>
            <button id="ov-play">Fight ▶</button>
          </div>
        </div>`;
      ov.hidden = false;
      document.getElementById('ov-play').onclick = () => { SFX.unlock(); this.beginRun(); };
    }

    showGameOver(lb, stage) {
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
          <div class="ov-emoji">💀</div>
          <h2>Defeated</h2>
          <div class="ov-sub">You reached opponent ${stage} — ${this.roster[(this.opp) % this.roster.length].name || 'rival'}.</div>
          <div class="ov-score">${(this.score || 0).toLocaleString()}</div>
          <div class="ov-best">Best: ${Number(best || 0).toLocaleString()}</div>
          ${lbHtml}
          <div class="ov-btns">
            <a class="ov-home" href="/">🏠 Home</a>
            <button id="ov-again">Rematch ▶</button>
          </div>
        </div>`;
      ov.hidden = false;
      document.getElementById('ov-again').onclick = () => this.beginRun();
    }
  }

  // colour helpers
  function shade(hex, amt) {
    const c = parse(hex);
    const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
    const r = Math.round((f - c.r) * p) + c.r;
    const g = Math.round((f - c.g) * p) + c.g;
    const b = Math.round((f - c.b) * p) + c.b;
    return `rgb(${r},${g},${b})`;
  }
  function parse(hex) {
    hex = (hex || '#888').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function dot(ctx, p, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.29); ctx.fill();
  }

  window.FIGHT = {
    start(cfg) {
      const boot = () => { window.FIGHT.game = new Fight(cfg); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
      else boot();
    }
  };
})();
