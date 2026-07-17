TD.start({
  id: 'neon-breach',
  totalWaves: 20,
  startGold: 140,
  lives: 20,

  map: {
    cols: 10,
    rows: 14,
    waypoints: [[4, 0], [4, 3], [8, 3], [8, 7], [1, 7], [1, 11], [6, 11], [6, 13]]
  },

  theme: {
    bgTop: '#0a0e2e',
    bgBottom: '#140725',
    path: '#155a80',
    pathEdge: '#0b3550',
    decor: ['🔌', '💾', '🖥️', '📡', '🔋'],
    decorDensity: 0.09,
    spawnEmoji: '🌐',
    baseEmoji: '🗄️',
    deathEmoji: '💥'
  },

  towers: [
    { key: 'turret', name: 'Turret Bot', emoji: '🤖', cost: 50, dmg: 9, rate: 1.6, range: 2.7, type: 'bullet', projColor: '#00e5ff', desc: 'Rapid-fire plasma rounds.' },
    { key: 'stasis', name: 'Stasis Coil', emoji: '🧲', cost: 70, dmg: 4, rate: 1.0, range: 2.4, type: 'slow', slowFactor: 0.45, slowDur: 2, projColor: '#c084fc', desc: 'Magnetic field slows machines to a crawl.' },
    { key: 'emp', name: 'EMP Mortar', emoji: '💥', cost: 95, dmg: 22, rate: 0.55, range: 3.3, type: 'splash', splashRadius: 1.2, projColor: '#ff9f1c', desc: 'Shockwave blast fries clustered bots.' },
    { key: 'orbital', name: 'Orbital Laser', emoji: '🛰️', cost: 130, dmg: 30, rate: 0.7, range: 3.6, type: 'beam', projColor: '#ff2d95', desc: 'Long-range beam from low orbit.' }
  ],

  enemies: {
    crawler: { emoji: '🐛', hp: 28, speed: 1.6, reward: 8, size: 0.5 },
    drone: { emoji: '🚁', hp: 20, speed: 2.5, reward: 7, size: 0.5 },
    glitch: { emoji: '👾', hp: 55, speed: 1.8, reward: 11, size: 0.55 },
    mech: { emoji: '🦾', hp: 105, speed: 0.95, reward: 15, size: 0.58 },
    core: { emoji: '🧠', hp: 1500, speed: 0.8, reward: 160, size: 0.9, dmg: 5 }
  },

  waves(n) {
    const g = (t, count, gap) => ({ t, n: Math.max(1, Math.round(count)), gap });
    if (n % 10 === 0) return [g('mech', 4 + n / 2, 0.9), g('core', n / 10, 3)];
    const w = [g('crawler', 5 + n * 2, 0.75)];
    if (n >= 3) w.push(g('drone', n, 0.5));
    if (n >= 5) w.push(g('glitch', n / 1.5, 0.9));
    if (n >= 8) w.push(g('mech', n / 3, 1.5));
    return w;
  }
});
