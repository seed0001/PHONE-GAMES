TD.start({
  id: 'void-bastion',
  totalWaves: 20,
  startGold: 140,
  lives: 20,

  map: {
    cols: 10,
    rows: 14,
    waypoints: [[9, 1], [2, 1], [2, 5], [7, 5], [7, 9], [0, 9], [0, 12], [9, 12]]
  },

  theme: {
    bgTop: '#05051f',
    bgBottom: '#0d0526',
    path: '#33335c',
    pathEdge: '#20203d',
    decor: ['✨', '⭐', '🌑', '☄️', '🪐'],
    decorDensity: 0.11,
    spawnEmoji: '🌌',
    baseEmoji: '🛰️',
    deathEmoji: '💥'
  },

  towers: [
    { key: 'pulse', name: 'Pulse Turret', emoji: '⚡', cost: 50, dmg: 7, rate: 2.0, range: 2.6, type: 'bullet', projColor: '#4dd0e1', desc: 'Fast-cycling energy bolts.' },
    { key: 'cryo', name: 'Cryo Array', emoji: '❄️', cost: 70, dmg: 5, rate: 0.9, range: 2.6, type: 'slow', slowFactor: 0.5, slowDur: 2.2, projColor: '#90caf9', desc: 'Freezes hulls, slowing invaders.' },
    { key: 'meteor', name: 'Meteor Driver', emoji: '☄️', cost: 100, dmg: 24, rate: 0.5, range: 3.4, type: 'splash', splashRadius: 1.3, projColor: '#ff7043', desc: 'Hurls rock at clusters of ships.' },
    { key: 'singularity', name: 'Singularity', emoji: '🌀', cost: 125, dmg: 13, rate: 0.9, range: 3.0, type: 'chain', chainCount: 4, projColor: '#b388ff', desc: 'Gravity arcs rip through up to 5 ships.' }
  ],

  enemies: {
    scout: { emoji: '👽', hp: 30, speed: 1.5, reward: 8, size: 0.52 },
    raider: { emoji: '🚀', hp: 22, speed: 2.6, reward: 8, size: 0.5 },
    stalker: { emoji: '🦑', hp: 60, speed: 1.7, reward: 12, size: 0.55 },
    hulk: { emoji: '🪨', hp: 130, speed: 0.7, reward: 16, size: 0.62 },
    mothership: { emoji: '🛸', hp: 1600, speed: 0.75, reward: 170, size: 0.95, dmg: 5 }
  },

  waves(n) {
    const g = (t, count, gap) => ({ t, n: Math.max(1, Math.round(count)), gap });
    if (n % 10 === 0) return [g('hulk', 3 + n / 2, 1.0), g('mothership', n / 10, 3)];
    const w = [g('scout', 5 + n * 2, 0.75)];
    if (n >= 3) w.push(g('raider', n, 0.45));
    if (n >= 5) w.push(g('stalker', n / 1.5, 0.9));
    if (n >= 8) w.push(g('hulk', n / 3, 1.6));
    return w;
  }
});
