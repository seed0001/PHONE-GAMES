/*
 * Pocket Arcade — shared tower defense engine.
 * Each game provides a config object (map, theme, towers, enemies, waves)
 * and calls TD.start(config). See any game's config.js for the schema.
 */
(function () {
  'use strict';

  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", system-ui';

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

  class Game {
    constructor(cfg) {
      this.cfg = cfg;
      this.cols = cfg.map.cols;
      this.rows = cfg.map.rows;
      this.waypoints = cfg.map.waypoints;
      this.totalWaves = cfg.totalWaves || 25;

      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d');
      this.wrap = document.getElementById('canvas-wrap');

      this.pathCells = new Set();
      this.buildPathCells();

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
      this.spawnQueue = [];
      this.spawnTimer = 0;
      this.waveActive = false;
      this.speed = 1;
      this.paused = false;
      this.over = false;
      this.endless = false;
      this.placing = null;   // tower cfg being placed
      this.selected = null;  // placed tower selected
      this.hideOverlay();
      this.hidePanel();
      this.updateHUD();
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

    // ---------- UI ----------

    buildTowerBar() {
      const bar = document.getElementById('tower-bar');
      bar.innerHTML = '';
      for (const t of this.cfg.towers) {
        const btn = document.createElement('button');
        btn.className = 'tower-btn';
        btn.dataset.key = t.key;
        btn.innerHTML = `<span class="t-emoji">${t.emoji}</span><span class="t-name">${t.name}</span><span class="t-cost">🪙${t.cost}</span>`;
        btn.onclick = () => {
          this.hidePanel();
          if (this.placing === t) {
            this.placing = null;
          } else if (this.gold >= t.cost) {
            this.placing = t;
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
        const rect = this.canvas.getBoundingClientRect();
        this.onTap(e.clientX - rect.left, e.clientY - rect.top);
      });

      document.getElementById('btn-wave').onclick = () => this.startWave();
      document.getElementById('btn-speed').onclick = () => {
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
        document.getElementById('btn-speed').textContent = this.speed + '×';
      };
      document.getElementById('btn-pause').onclick = () => {
        this.paused = !this.paused;
        document.getElementById('btn-pause').textContent = this.paused ? '▶' : '⏸';
      };
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
            dmg: t.dmg, range: t.range, rate: t.rate
          });
          if (this.gold < t.cost) this.placing = null;
          this.updateHUD();
          this.updateBarAfford();
        } else {
          this.placing = null;
          this.updateBarAfford();
        }
        return;
      }
      const tw = this.towerAt(c, r);
      if (tw) {
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
      document.getElementById('tp-up').onclick = () => {
        if (tw.level >= 3 || this.gold < this.upgradeCost(tw)) return;
        this.gold -= this.upgradeCost(tw);
        tw.invested += this.upgradeCost(tw);
        tw.level++;
        tw.dmg *= 1.6;
        tw.range *= 1.08;
        tw.rate *= 1.12;
        this.updateHUD();
        this.updateBarAfford();
        this.showPanel(tw);
      };
      document.getElementById('tp-sell').onclick = () => {
        this.gold += sellVal;
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

    updateHUD() {
      document.getElementById('ui-lives').textContent = this.lives;
      document.getElementById('ui-gold').textContent = this.gold;
      document.getElementById('ui-wave').textContent = this.wave + '/' + (this.endless ? '∞' : this.totalWaves);
      document.getElementById('ui-score').textContent = this.score.toLocaleString();
    }

    updateWaveBtn() {
      const btn = document.getElementById('btn-wave');
      btn.disabled = this.waveActive || this.over;
      btn.textContent = this.waveActive ? '🌊 Wave ' + this.wave : '▶ Wave ' + (this.wave + 1);
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
        traveled: 0,
        slowUntil: 0,
        slowFactor: 1,
        wobble: Math.random() * Math.PI * 2
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

    fire(tw, target) {
      const t = tw.t;
      if (t.type === 'beam') {
        this.hurt(target, tw.dmg);
        this.effects.push({ kind: 'beam', x1: tw.x, y1: tw.y - this.cell * 0.2, x2: target.x, y2: target.y, ttl: 0.12, color: t.projColor });
      } else if (t.type === 'chain') {
        let cur = target, dmg = tw.dmg;
        const hit = new Set([cur]);
        const pts = [[tw.x, tw.y - this.cell * 0.2], [cur.x, cur.y]];
        this.hurt(cur, dmg);
        for (let i = 0; i < (t.chainCount || 2); i++) {
          let next = null, bd = this.cell * 2.2;
          for (const en of this.enemies) {
            if (en.hp <= 0 || hit.has(en)) continue;
            const d = dist(cur.x, cur.y, en.x, en.y);
            if (d < bd) { bd = d; next = en; }
          }
          if (!next) break;
          dmg *= 0.65;
          this.hurt(next, dmg);
          hit.add(next);
          pts.push([next.x, next.y]);
          cur = next;
        }
        this.effects.push({ kind: 'chain', pts, ttl: 0.15, color: t.projColor });
      } else {
        this.projectiles.push({
          x: tw.x, y: tw.y - this.cell * 0.2,
          target, lastX: target.x, lastY: target.y,
          speed: (t.type === 'splash' ? 7 : 11) * this.cell,
          dmg: tw.dmg, t
        });
      }
    }

    hurt(en, dmg) {
      if (en.hp <= 0) return;
      en.hp -= dmg;
      if (en.hp <= 0) {
        const g = this.reward(en.e);
        this.gold += g;
        this.score += g;
        this.effects.push({ kind: 'pop', x: en.x, y: en.y, ttl: 0.35, emoji: this.cfg.theme.deathEmoji || '💥', size: en.e.size * this.cell * 1.6 });
        this.updateHUD();
        this.updateBarAfford();
      }
    }

    applyHit(p, x, y) {
      const t = p.t;
      if (t.type === 'splash') {
        const rPx = (t.splashRadius || 1) * this.cell;
        for (const en of this.enemies) {
          if (en.hp > 0 && dist(x, y, en.x, en.y) <= rPx) this.hurt(en, p.dmg);
        }
        this.effects.push({ kind: 'ring', x, y, r: rPx, ttl: 0.25, color: t.projColor });
      } else {
        const en = p.target;
        if (en && en.hp > 0) {
          this.hurt(en, p.dmg);
          if (t.type === 'slow' && en.hp > 0) {
            en.slowUntil = this.now + (t.slowDur || 2);
            en.slowFactor = t.slowFactor || 0.5;
          }
        }
      }
    }

    // ---------- update ----------

    frame(t) {
      let dt = Math.min((t - this.last) / 1000, 0.05);
      this.last = t;
      if (!this.paused && !this.over) {
        for (let i = 0; i < this.speed; i++) this.update(dt);
      }
      this.draw();
      requestAnimationFrame((tt) => this.frame(tt));
    }

    update(dt) {
      this.now = (this.now || 0) + dt;

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
        const slow = this.now < en.slowUntil ? en.slowFactor : 1;
        let move = en.e.speed * this.cell * slow * dt;
        while (move > 0 && en.wp < this.wpPx.length) {
          const [tx, ty] = this.wpPx[en.wp];
          const d = dist(en.x, en.y, tx, ty);
          if (d <= move) {
            en.x = tx; en.y = ty; en.traveled += d; move -= d; en.wp++;
          } else {
            en.x += (tx - en.x) / d * move;
            en.y += (ty - en.y) / d * move;
            en.traveled += move;
            move = 0;
          }
        }
        if (en.wp >= this.wpPx.length) {
          en.hp = 0;
          this.lives -= en.e.dmg || 1;
          this.effects.push({ kind: 'pop', x: en.x, y: en.y, ttl: 0.4, emoji: '💔', size: this.cell });
          this.updateHUD();
          if (this.lives <= 0) { this.gameOver(false); return; }
        }
      }
      this.enemies = this.enemies.filter(en => en.hp > 0);

      // towers
      for (const tw of this.towers) {
        tw.cd -= dt;
        if (tw.cd > 0) continue;
        const target = this.findTarget(tw);
        if (target) {
          this.fire(tw, target);
          tw.cd = 1 / tw.rate;
          tw.aimX = target.x; tw.aimY = target.y;
        }
      }

      // projectiles
      for (const p of this.projectiles) {
        if (p.target && p.target.hp > 0) { p.lastX = p.target.x; p.lastY = p.target.y; }
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
          this.updateWaveBtn();
        }
      }
    }

    // ---------- endgame ----------

    async gameOver(won) {
      this.over = true;
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
          `<div class="ov-row"><span>${i + 1}. ${r.username}</span><span>${r.score.toLocaleString()}</span></div>`
        ).join('') + '</div>';
      }
      ov.innerHTML = `
        <div class="ov-card">
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
      document.getElementById('ov-retry').onclick = () => this.reset();
      const cont = document.getElementById('ov-endless');
      if (cont) cont.onclick = () => {
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
      const ctx = this.ctx, cell = this.cell, th = this.cfg.theme;

      // background
      const grad = ctx.createLinearGradient(0, 0, 0, this.H);
      grad.addColorStop(0, th.bgTop);
      grad.addColorStop(1, th.bgBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.W, this.H);

      // decorations
      if (th.decor && th.decor.length) {
        ctx.globalAlpha = 0.4;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let c = 0; c < this.cols; c++) {
          for (let r = 0; r < this.rows; r++) {
            if (this.pathCells.has(c + ',' + r)) continue;
            const rnd = cellRand(c, r, 7);
            if (rnd < th.decorDensity) {
              const d = th.decor[Math.floor(cellRand(c, r, 13) * th.decor.length)];
              ctx.font = `${cell * 0.55}px ${EMOJI_FONT}`;
              ctx.fillText(d, (c + 0.5) * cell, (r + 0.5) * cell);
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      // path
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.wpPx[0][0], this.wpPx[0][1]);
      for (let i = 1; i < this.wpPx.length; i++) ctx.lineTo(this.wpPx[i][0], this.wpPx[i][1]);
      ctx.strokeStyle = th.pathEdge;
      ctx.lineWidth = cell * 0.86;
      ctx.stroke();
      ctx.strokeStyle = th.path;
      ctx.lineWidth = cell * 0.7;
      ctx.stroke();

      // spawn + base markers
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${cell * 0.8}px ${EMOJI_FONT}`;
      ctx.fillText(th.spawnEmoji, this.wpPx[0][0], this.wpPx[0][1]);
      ctx.font = `${cell * 0.95}px ${EMOJI_FONT}`;
      const last = this.wpPx[this.wpPx.length - 1];
      ctx.fillText(th.baseEmoji, last[0], last[1]);

      // placement grid
      if (this.placing) {
        ctx.fillStyle = th.gridHi || 'rgba(255,255,255,0.08)';
        for (let c = 0; c < this.cols; c++) {
          for (let r = 0; r < this.rows; r++) {
            if (this.buildable(c, r)) {
              ctx.fillRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4);
            }
          }
        }
      }

      // range circle for selected tower / placing preview follows selection
      if (this.selected) {
        ctx.beginPath();
        ctx.arc(this.selected.x, this.selected.y, this.selected.range * cell, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // towers
      for (const tw of this.towers) {
        ctx.fillStyle = tw.t.baseColor || 'rgba(0,0,0,0.35)';
        const pad = cell * 0.09;
        ctx.beginPath();
        ctx.roundRect(tw.col * cell + pad, tw.row * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.2);
        ctx.fill();
        ctx.font = `${cell * 0.62}px ${EMOJI_FONT}`;
        ctx.fillText(tw.t.emoji, tw.x, tw.y - cell * 0.03);
        // level pips
        ctx.fillStyle = '#ffd700';
        for (let i = 0; i < tw.level - 1; i++) {
          ctx.beginPath();
          ctx.arc(tw.col * cell + cell * 0.22 + i * cell * 0.18, (tw.row + 1) * cell - cell * 0.15, cell * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // enemies
      for (const en of this.enemies) {
        if (en.hp <= 0) continue;
        const size = en.e.size * cell;
        const wob = Math.sin(this.now * 8 + en.wobble) * cell * 0.03;
        ctx.font = `${size}px ${EMOJI_FONT}`;
        ctx.fillText(en.e.emoji, en.x, en.y + wob);
        // hp bar
        const w = size * 0.9, frac = Math.max(0, en.hp / en.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(en.x - w / 2, en.y - size * 0.72, w, 4);
        ctx.fillStyle = frac > 0.5 ? '#51cf66' : frac > 0.25 ? '#fcc419' : '#ff6b6b';
        ctx.fillRect(en.x - w / 2, en.y - size * 0.72, w * frac, 4);
      }

      // projectiles
      for (const p of this.projectiles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.t.type === 'splash' ? cell * 0.14 : cell * 0.09, 0, Math.PI * 2);
        ctx.fillStyle = p.t.projColor;
        ctx.fill();
      }

      // effects
      for (const fx of this.effects) {
        if (fx.kind === 'beam') {
          ctx.globalAlpha = Math.min(1, fx.ttl / 0.12);
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(fx.x1, fx.y1);
          ctx.lineTo(fx.x2, fx.y2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (fx.kind === 'chain') {
          ctx.globalAlpha = Math.min(1, fx.ttl / 0.15);
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(fx.pts[0][0], fx.pts[0][1]);
          for (let i = 1; i < fx.pts.length; i++) ctx.lineTo(fx.pts[i][0], fx.pts[i][1]);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (fx.kind === 'ring') {
          const t = 1 - fx.ttl / 0.25;
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, fx.r * (0.4 + t * 0.6), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (fx.kind === 'pop') {
          ctx.globalAlpha = Math.min(1, fx.ttl / 0.35);
          ctx.font = `${fx.size}px ${EMOJI_FONT}`;
          ctx.fillText(fx.emoji, fx.x, fx.y);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  window.TD = { start: (cfg) => new Game(cfg) };
})();
