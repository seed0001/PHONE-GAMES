TD.start({
  id: 'grave-shift',
  totalWaves: 200,
  startGold: 220,
  lives: 25,

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
    deathEmoji: '💨',
    ambient: 'fog',            // graveyard mist rolling across the plots
    ambientColor: '#b9a8d6',
    ambientCount: 16,
    spawnGlow: '#7b5cff',
    baseGlow: '#ffe8a3',
    flowColor: '#cbbfae'
  },

  towers: [
    { key: 'lantern', name: 'Lantern', emoji: '🕯️', cost: 50, dmg: 8, rate: 1.5, range: 2.8, type: 'bullet', projColor: '#ffe8a3', hp: 120, shield: 0, desc: 'Blessed flame, thrown one bolt at a time.' },
    { key: 'censer', name: 'Censer', emoji: '⛓️', cost: 85, dmg: 10, rate: 2.5, range: 2.5, type: 'bullet', projColor: '#f5d0a9', hp: 130, shield: 0, desc: 'Swings fast and often. Good against the shambling many.' },
    { key: 'saltline', name: 'Salt Line', emoji: '🧂', cost: 70, dmg: 5, rate: 1.1, range: 2.5, type: 'slow', slowFactor: 0.48, slowDur: 2, projColor: '#dbeafe', hp: 100, shield: 25, desc: 'Consecrated ground. The dead drag through it.' },
    { key: 'bell', name: 'Toll Bell', emoji: '🔔', cost: 100, dmg: 22, rate: 0.55, range: 3.2, type: 'splash', splashRadius: 1.2, projColor: '#e5c07b', hp: 110, shield: 0, desc: 'A single toll shatters everything nearby.' },
    { key: 'chain', name: 'Chain Prayer', emoji: '📿', cost: 130, dmg: 17, rate: 0.95, range: 3.0, type: 'chain', chainCount: 3, projColor: '#c4b5fd', hp: 105, shield: 30, desc: 'The words leap from corpse to corpse.' },
    { key: 'stake', name: 'Stake Thrower', emoji: '🗡️', cost: 170, dmg: 54, rate: 0.42, range: 5.2, type: 'bullet', projColor: '#d6d3d1', hp: 105, shield: 0, desc: 'One heavy stake, thrown a very long way.' },
    { key: 'pyre', name: 'Pyre', emoji: '🔥', cost: 215, dmg: 47, rate: 0.5, range: 3.4, type: 'splash', splashRadius: 1.5, projColor: '#ff7043', hp: 125, shield: 0, desc: 'Holy fire that takes the whole plot with it.' },
    { key: 'radiance', name: 'Radiance', emoji: '☀️', cost: 285, dmg: 35, rate: 1.6, range: 3.1, type: 'beam', projColor: '#fff3b0', hp: 150, shield: 65, desc: 'Unbroken daylight. The dead hate it.' },
    { key: 'ward', name: 'Warding Stone', emoji: '🛡️', cost: 150, range: 2.6, type: 'support', shieldGrant: 55, projColor: '#5bc8ff', hp: 220, shield: 90, desc: 'Wards every shrine in range against harm. Does not attack.' },
    { key: 'mason', name: 'Stonemason', emoji: '🔨', cost: 175, range: 2.4, type: 'repair', repairRate: 9, projColor: '#7cf7c4', hp: 200, shield: 40, desc: 'Rebuilds broken shrines nearby. Does not attack.' }
  ],

  enemies: {
    shambler:  { emoji: '🧟', hp: 30, speed: 1.4, reward: 8, size: 0.52, color: '#8ea67d' },
    hound:     { emoji: '🐕', hp: 22, speed: 2.5, reward: 7, size: 0.48, color: '#9aa5b1' },
    armored:   { emoji: '🪖', hp: 95, speed: 1.0, reward: 14, size: 0.55, color: '#c0c8d8', armor: 3 },
    bonecaster:{ emoji: '🦴', hp: 46, speed: 1.3, reward: 13, size: 0.5, color: '#e7e5e4',
                 atk: { dmg: 5, rate: 0.55, range: 2.4, color: '#f5f5f4' } },
    brute:     { emoji: '🧌', hp: 240, speed: 0.76, reward: 28, size: 0.68, color: '#7f8b6d', armor: 5 },
    acolyte:   { emoji: '🕯️', hp: 78, speed: 1.15, reward: 22, size: 0.52, color: '#c4b5fd',
                 healRate: 0.07, healRange: 2.2, healColor: '#ddd6fe' },
    gravedigger:{ emoji: '⛏️', hp: 420, speed: 0.74, reward: 40, size: 0.7, color: '#a16207', armor: 8,
                 atk: { dmg: 14, rate: 0.3, range: 1.6, type: 'melee', color: '#ca8a04' } },
    swarmrat:  { emoji: '🐀', hp: 34, speed: 3.0, reward: 9, size: 0.42, color: '#78716c' },
    cultist:   { emoji: '🔮', hp: 190, speed: 1.0, reward: 38, size: 0.58, color: '#a855f7',
                 shield: 120, shieldColor: '#d8b4fe',
                 atk: { dmg: 11, rate: 0.5, range: 3.0, color: '#c084fc' } },
    mausoleum: { emoji: '🗿', hp: 760, speed: 0.6, reward: 60, size: 0.76, color: '#78716c', armor: 16 },
    ghoul:     { emoji: '🧛', hp: 330, speed: 1.2, reward: 44, size: 0.6, color: '#ef4444', regen: 0.05 },
    necromancer:{ emoji: '💀', hp: 400, speed: 0.95, reward: 66, size: 0.62, color: '#e7e5e4',
                 shield: 200, shieldColor: '#f5f5f4', healRate: 0.1, healRange: 2.6, healColor: '#a7f3d0' },
    deathknight:{ emoji: '⚔️', hp: 980, speed: 1.05, reward: 88, size: 0.66, color: '#44403c', armor: 24,
                 atk: { dmg: 20, rate: 0.45, range: 2.0, color: '#f87171' } },
    spectre:   { emoji: '👻', hp: 620, speed: 1.75, reward: 80, size: 0.6, color: '#e2e8f0',
                 shield: 320, shieldColor: '#f1f5f9', regen: 0.04 },
    charnel:   { emoji: '🦑', hp: 2100, speed: 0.62, reward: 150, size: 0.8, color: '#65a30d', armor: 34,
                 regen: 0.03, atk: { dmg: 30, rate: 0.35, range: 1.8, type: 'melee', color: '#84cc16' } },

    // ---- bosses ----
    gravelord: { emoji: '👑', hp: 2600, speed: 0.7, reward: 220, size: 0.9, dmg: 4, color: '#a16207', armor: 14, boss: true, name: 'THE GRAVELORD',
                 atk: { dmg: 22, rate: 0.4, range: 2.4, color: '#ca8a04' } },
    wight:     { emoji: '🧟', hp: 5200, speed: 0.85, reward: 320, size: 0.92, dmg: 5, color: '#84cc16', boss: true, name: 'ELDER WIGHT',
                 atk: { dmg: 30, rate: 0.5, range: 3.2, color: '#a3e635' } },
    lich:      { emoji: '🧙', hp: 8800, speed: 0.8, reward: 430, size: 0.92, dmg: 6, color: '#a78bfa', boss: true, name: 'THE PALE LICH',
                 shield: 3000, shieldColor: '#ddd6fe', healRate: 0.06, healRange: 3, atk: { dmg: 26, rate: 0.6, range: 3.4, color: '#c4b5fd' } },
    ossuary:   { emoji: '🏛️', hp: 15000, speed: 0.62, reward: 560, size: 1.0, dmg: 8, color: '#a8a29e', armor: 45, boss: true, name: 'WALKING OSSUARY',
                 atk: { dmg: 46, rate: 0.35, range: 2.2, type: 'melee', color: '#d6d3d1' } },
    revenant:  { emoji: '😈', hp: 24000, speed: 0.9, reward: 720, size: 0.96, dmg: 9, color: '#dc2626', boss: true, name: 'CRIMSON REVENANT',
                 shield: 8000, shieldColor: '#fecaca', regen: 0.02, atk: { dmg: 55, rate: 0.65, range: 3.6, color: '#ef4444' } },
    colossus:  { emoji: '🗿', hp: 42000, speed: 0.55, reward: 900, size: 1.05, dmg: 12, color: '#64748b', armor: 70, boss: true, name: 'TOMB COLOSSUS',
                 regen: 0.02, atk: { dmg: 70, rate: 0.4, range: 2.6, type: 'melee', color: '#94a3b8' } },
    reaper:    { emoji: '☠️', hp: 70000, speed: 0.95, reward: 1200, size: 1.0, dmg: 15, color: '#334155', boss: true, name: 'THE REAPER',
                 shield: 25000, shieldColor: '#cbd5e1', armor: 55, atk: { dmg: 90, rate: 0.7, range: 4.0, color: '#64748b' } },
    finalNight:{ emoji: '🌑', hp: 120000, speed: 0.75, reward: 1800, size: 1.1, dmg: 20, color: '#7b5cff', boss: true, name: 'THE LAST NIGHT',
                 shield: 50000, shieldColor: '#ddd6fe', armor: 90, regen: 0.015, atk: { dmg: 130, rate: 0.8, range: 4.4, color: '#a78bfa' } }
  },

  enemyTiers: [
    { at: 1,   types: ['shambler'] },
    { at: 3,   types: ['hound'] },
    { at: 6,   types: ['armored'] },
    { at: 11,  types: ['bonecaster'] },
    { at: 16,  types: ['brute'] },
    { at: 23,  types: ['acolyte'] },
    { at: 31,  types: ['gravedigger'] },
    { at: 40,  types: ['swarmrat'] },
    { at: 52,  types: ['cultist'] },
    { at: 66,  types: ['mausoleum'] },
    { at: 82,  types: ['ghoul'] },
    { at: 100, types: ['necromancer'] },
    { at: 120, types: ['deathknight'] },
    { at: 145, types: ['spectre'] },
    { at: 170, types: ['charnel'] }
  ],

  bosses: ['gravelord', 'wight', 'lich', 'ossuary', 'revenant', 'colossus', 'reaper', 'finalNight']
});
