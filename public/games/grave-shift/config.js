TD.start({
  id: 'grave-shift',
  totalWaves: 20,
  startGold: 140,
  lives: 20,

  map: {
    cols: 10,
    rows: 14,
    waypoints: [[0, 12], [3, 12], [3, 3], [6, 3], [6, 10], [9, 10], [9, 1]]
  },

  theme: {
    bgTop: '#1c1826',
    bgBottom: '#12101a',
    path: '#4a4136',
    pathEdge: '#332d24',
    decor: ['🪦', '🕸️', '🌳', '🕯️', '🍂'],
    decorDensity: 0.14,
    spawnEmoji: '⚰️',
    baseEmoji: '⛪',
    deathEmoji: '💨'
  },

  towers: [
    { key: 'beacon', name: 'Holy Beacon', emoji: '✨', cost: 50, dmg: 8, rate: 1.5, range: 2.7, type: 'bullet', projColor: '#ffe8a3', desc: 'Bolts of sanctified light.' },
    { key: 'ward', name: 'Wax Ward', emoji: '🕯️', cost: 65, dmg: 4, rate: 1.0, range: 2.4, type: 'slow', slowFactor: 0.5, slowDur: 2, projColor: '#a5d8ff', desc: 'Ghostly wax mires the dead.' },
    { key: 'bone', name: 'Bone Catapult', emoji: '💀', cost: 95, dmg: 21, rate: 0.55, range: 3.2, type: 'splash', splashRadius: 1.15, projColor: '#ced4da', desc: 'Skull volleys shatter hordes.' },
    { key: 'pyre', name: 'Pyre', emoji: '🔥', cost: 125, dmg: 28, rate: 0.75, range: 3.4, type: 'beam', projColor: '#ff922b', desc: 'A searing lance of cleansing flame.' }
  ],

  enemies: {
    zombie: { emoji: '🧟', hp: 35, speed: 1.2, reward: 8, size: 0.55 },
    bat: { emoji: '🦇', hp: 18, speed: 2.8, reward: 7, size: 0.48 },
    ghost: { emoji: '👻', hp: 60, speed: 1.6, reward: 11, size: 0.55 },
    abomination: { emoji: '👹', hp: 150, speed: 0.7, reward: 18, size: 0.65 },
    lich: { emoji: '☠️', hp: 1500, speed: 0.8, reward: 160, size: 0.9, dmg: 5 }
  },

  waves(n) {
    const g = (t, count, gap) => ({ t, n: Math.max(1, Math.round(count)), gap });
    if (n % 10 === 0) return [g('abomination', 3 + n / 2, 1.0), g('lich', n / 10, 3)];
    const w = [g('zombie', 5 + n * 2, 0.7)];
    if (n >= 3) w.push(g('bat', n, 0.45));
    if (n >= 5) w.push(g('ghost', n / 1.5, 0.9));
    if (n >= 8) w.push(g('abomination', n / 3, 1.7));
    return w;
  }
});
