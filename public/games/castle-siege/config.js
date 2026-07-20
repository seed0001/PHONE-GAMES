TD.start({
  id: 'castle-siege',
  totalWaves: 20,
  startGold: 140,
  lives: 20,

  map: {
    cols: 10,
    rows: 14,
    waypoints: [[0, 2], [7, 2], [7, 6], [2, 6], [2, 10], [7, 10], [7, 13]]
  },

  theme: {
    bgTop: '#274d20',
    bgBottom: '#163013',
    path: '#8a6a44',
    pathEdge: '#63492c',
    decor: ['🌲', '🌳', '🌾', '🪨', '🍄'],
    decorDensity: 0.13,
    spawnEmoji: '⛺',
    baseEmoji: '🏰',
    deathEmoji: '💥',
    ambient: 'motes',          // fireflies drifting over the woods
    ambientColor: '#ffe08a',
    ambientCount: 24,
    spawnGlow: '#ff6b3d',
    baseGlow: '#ffd166',
    flowColor: '#f3d9a4'
  },

  towers: [
    { key: 'archer', name: 'Archer', emoji: '🏹', cost: 50, dmg: 8, rate: 1.5, range: 2.8, type: 'bullet', projColor: '#e0b04f', desc: 'Steady single-target arrows.' },
    { key: 'frost', name: 'Frost Mage', emoji: '❄️', cost: 70, dmg: 5, rate: 1.0, range: 2.5, type: 'slow', slowFactor: 0.5, slowDur: 2, projColor: '#7ad1ff', desc: 'Chills enemies, slowing them to half speed.' },
    { key: 'catapult', name: 'Catapult', emoji: '🪨', cost: 95, dmg: 21, rate: 0.55, range: 3.2, type: 'splash', splashRadius: 1.15, projColor: '#b08968', desc: 'Lobbed boulders crush groups.' },
    { key: 'storm', name: 'Storm Wizard', emoji: '⚡', cost: 125, dmg: 16, rate: 0.9, range: 3.0, type: 'chain', chainCount: 3, projColor: '#ffe066', desc: 'Lightning arcs between up to 4 foes.' }
  ],

  enemies: {
    goblin: { emoji: '👺', hp: 30, speed: 1.5, reward: 8, size: 0.52, color: '#7bc47f' },
    wolf: { emoji: '🐺', hp: 22, speed: 2.4, reward: 7, size: 0.5, color: '#9aa5b1' },
    knight: { emoji: '🛡️', hp: 95, speed: 1.0, reward: 14, size: 0.55, color: '#c0c8d8' },
    troll: { emoji: '🧌', hp: 240, speed: 0.75, reward: 28, size: 0.68, color: '#8f7a5c' },
    dragon: { emoji: '🐉', hp: 1400, speed: 0.85, reward: 150, size: 0.9, dmg: 5, color: '#ff6b3d', boss: true, name: 'ANCIENT DRAGON' }
  },

  waves(n) {
    const g = (t, count, gap) => ({ t, n: Math.max(1, Math.round(count)), gap });
    if (n % 10 === 0) return [g('knight', 4 + n / 2, 0.9), g('dragon', n / 10, 3)];
    const w = [g('goblin', 5 + n * 2, 0.75)];
    if (n >= 3) w.push(g('wolf', n, 0.5));
    if (n >= 5) w.push(g('knight', n / 2, 1.1));
    if (n >= 8) w.push(g('troll', n / 4, 1.8));
    return w;
  }
});
