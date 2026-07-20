TD.start({
  id: 'void-bastion',
  totalWaves: 200,
  startGold: 220,
  lives: 25,

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
    deathEmoji: '💥',
    ambient: 'stars',          // twinkling starfield behind the board
    ambientColor: '#dfe9ff',
    ambientCount: 40,
    spawnGlow: '#b388ff',
    baseGlow: '#4dd0e1',
    flowColor: '#b388ff'
  },

  towers: [
    { key: 'pulse', name: 'Pulse Turret', emoji: '⚡', cost: 50, dmg: 7, rate: 2.0, range: 2.6, type: 'bullet', projColor: '#4dd0e1', hp: 120, shield: 0, desc: 'Fast-cycling energy bolts.' },
    { key: 'scatter', name: 'Scatter Array', emoji: '✳️', cost: 85, dmg: 10, rate: 2.7, range: 2.4, type: 'bullet', projColor: '#a7f3d0', hp: 130, shield: 0, desc: 'Rapid particle spray. Ideal against swarms.' },
    { key: 'stasis', name: 'Stasis Field', emoji: '🌀', cost: 70, dmg: 5, rate: 1.1, range: 2.6, type: 'slow', slowFactor: 0.45, slowDur: 2.2, projColor: '#8ecdff', hp: 100, shield: 25, desc: 'Warps local time, halving enemy speed.' },
    { key: 'missile', name: 'Missile Pod', emoji: '🚀', cost: 100, dmg: 23, rate: 0.55, range: 3.3, type: 'splash', splashRadius: 1.2, projColor: '#ff9f1c', hp: 110, shield: 0, desc: 'Guided warheads with a solid blast radius.' },
    { key: 'arc', name: 'Arc Emitter', emoji: '🔱', cost: 130, dmg: 17, rate: 0.95, range: 3.0, type: 'chain', chainCount: 3, projColor: '#ffe066', hp: 105, shield: 30, desc: 'Discharge leaps between up to 4 hulls.' },
    { key: 'lance', name: 'Spinal Lance', emoji: '🎯', cost: 170, dmg: 56, rate: 0.4, range: 5.5, type: 'bullet', projColor: '#e0e7ff', hp: 105, shield: 0, desc: 'Station-spanning railshot. Very slow cycle.' },
    { key: 'nova', name: 'Nova Charge', emoji: '💫', cost: 215, dmg: 49, rate: 0.5, range: 3.4, type: 'splash', splashRadius: 1.55, projColor: '#ff5fa2', hp: 125, shield: 0, desc: 'Miniature stellar detonation. Enormous splash.' },
    { key: 'singular', name: 'Singularity', emoji: '🕳️', cost: 285, dmg: 37, rate: 1.6, range: 3.1, type: 'beam', projColor: '#b388ff', hp: 150, shield: 65, desc: 'Collapsing gravity well. Unavoidable, continuous.' },
    { key: 'aegis', name: 'Aegis Node', emoji: '🛡️', cost: 150, range: 2.6, type: 'support', shieldGrant: 55, projColor: '#5bc8ff', hp: 220, shield: 90, desc: 'Extends deflector shields to nearby guns. Does not attack.' },
    { key: 'drydock', name: 'Drydock', emoji: '🔧', cost: 175, range: 2.4, type: 'repair', repairRate: 9, projColor: '#7cf7c4', hp: 200, shield: 40, desc: 'Runs hull repair on damaged guns. Does not attack.' }
  ],

  enemies: {
    scout:     { emoji: '🛸', hp: 30, speed: 1.6, reward: 8, size: 0.5, color: '#a7f3d0' },
    dart:      { emoji: '🔺', hp: 22, speed: 2.6, reward: 7, size: 0.46, color: '#8ecdff' },
    cruiser:   { emoji: '🛰️', hp: 95, speed: 1.0, reward: 14, size: 0.56, color: '#c0c8d8', armor: 3 },
    gunship:   { emoji: '🔫', hp: 46, speed: 1.3, reward: 13, size: 0.5, color: '#ff9f1c',
                 atk: { dmg: 5, rate: 0.55, range: 2.5, color: '#ffcf6b' } },
    freighter: { emoji: '🚛', hp: 240, speed: 0.78, reward: 28, size: 0.68, color: '#94a3b8', armor: 5 },
    tender:    { emoji: '🧬', hp: 78, speed: 1.15, reward: 22, size: 0.52, color: '#7cf7c4',
                 healRate: 0.07, healRange: 2.2, healColor: '#a7f3d0' },
    ram:       { emoji: '🦾', hp: 420, speed: 0.74, reward: 40, size: 0.7, color: '#f97316', armor: 8,
                 atk: { dmg: 14, rate: 0.3, range: 1.6, type: 'melee', color: '#fb923c' } },
    mite:      { emoji: '🦠', hp: 34, speed: 3.1, reward: 9, size: 0.42, color: '#a3e635' },
    bulwark:   { emoji: '🔷', hp: 190, speed: 1.0, reward: 38, size: 0.58, color: '#b388ff',
                 shield: 120, shieldColor: '#d8b4fe',
                 atk: { dmg: 11, rate: 0.5, range: 3.0, color: '#c084fc' } },
    dreadhull: { emoji: '⬛', hp: 760, speed: 0.6, reward: 60, size: 0.76, color: '#64748b', armor: 16 },
    regrower:  { emoji: '🌿', hp: 330, speed: 1.15, reward: 44, size: 0.6, color: '#4ade80', regen: 0.05 },
    matriarch: { emoji: '👁️', hp: 400, speed: 0.95, reward: 66, size: 0.62, color: '#e0e7ff',
                 shield: 200, shieldColor: '#dbeafe', healRate: 0.1, healRange: 2.6, healColor: '#a7f3d0' },
    reaver:    { emoji: '🗡️', hp: 980, speed: 1.08, reward: 88, size: 0.66, color: '#475569', armor: 24,
                 atk: { dmg: 20, rate: 0.45, range: 2.0, color: '#f87171' } },
    voidling:  { emoji: '👾', hp: 620, speed: 1.75, reward: 80, size: 0.6, color: '#c4b5fd',
                 shield: 320, shieldColor: '#ede9fe', regen: 0.04 },
    leviathan: { emoji: '🐋', hp: 2100, speed: 0.62, reward: 150, size: 0.82, color: '#0ea5e9', armor: 34,
                 regen: 0.03, atk: { dmg: 30, rate: 0.35, range: 1.8, type: 'melee', color: '#38bdf8' } },

    // ---- bosses ----
    harbinger: { emoji: '☄️', hp: 2600, speed: 0.72, reward: 220, size: 0.9, dmg: 4, color: '#f97316', armor: 14, boss: true, name: 'HARBINGER',
                 atk: { dmg: 22, rate: 0.4, range: 2.4, color: '#fb923c' } },
    devourer:  { emoji: '🐙', hp: 5200, speed: 0.88, reward: 320, size: 0.92, dmg: 5, color: '#22d3ee', boss: true, name: 'THE DEVOURER',
                 atk: { dmg: 30, rate: 0.5, range: 3.2, color: '#67e8f9' } },
    oracle:    { emoji: '🔮', hp: 8800, speed: 0.8, reward: 430, size: 0.92, dmg: 6, color: '#a78bfa', boss: true, name: 'VOID ORACLE',
                 shield: 3000, shieldColor: '#ddd6fe', healRate: 0.06, healRange: 3, atk: { dmg: 26, rate: 0.6, range: 3.4, color: '#c4b5fd' } },
    worldship: { emoji: '🛸', hp: 15000, speed: 0.62, reward: 560, size: 1.0, dmg: 8, color: '#78716c', armor: 45, boss: true, name: 'WORLDSHIP',
                 atk: { dmg: 46, rate: 0.35, range: 2.2, type: 'melee', color: '#a8a29e' } },
    swarmking: { emoji: '🦂', hp: 20000, speed: 0.9, reward: 720, size: 0.96, dmg: 9, color: '#ef4444', boss: true, name: 'SWARM KING',
                 shield: 6000, shieldColor: '#fecaca', regen: 0.02, atk: { dmg: 55, rate: 0.65, range: 3.6, color: '#f87171' } },
    colossus:  { emoji: '🗿', hp: 32000, speed: 0.55, reward: 900, size: 1.05, dmg: 12, color: '#64748b', armor: 70, boss: true, name: 'VOID COLOSSUS',
                 regen: 0.02, atk: { dmg: 70, rate: 0.4, range: 2.6, type: 'melee', color: '#94a3b8' } },
    eventHorizon:{ emoji: '🕳️', hp: 48000, speed: 0.95, reward: 1200, size: 1.0, dmg: 15, color: '#6366f1', boss: true, name: 'EVENT HORIZON',
                 shield: 16000, shieldColor: '#c7d2fe', armor: 55, atk: { dmg: 90, rate: 0.7, range: 4.0, color: '#818cf8' } },
    heatDeath: { emoji: '🌟', hp: 75000, speed: 0.75, reward: 1800, size: 1.1, dmg: 20, color: '#fbbf24', boss: true, name: 'HEAT DEATH',
                 shield: 30000, shieldColor: '#fde68a', armor: 90, regen: 0.015, atk: { dmg: 130, rate: 0.8, range: 4.4, color: '#f59e0b' } },

    /* ---- roamers ----
     * Boarders. They do not run the approach lane — they cut straight to your
     * nearest live gun, wreck it, and move on. Lighter than a lane boss because
     * they pick the engagement. */
    breachpod: { emoji: '🛰️', hp: 9000, speed: 1.1, roam: true, roamSpeed: 1.3, reward: 500, size: 0.86,
                 dmg: 4, color: '#f43f5e', armor: 20, boss: true, name: 'BOARDING POD',
                 atk: { dmg: 46, rate: 0.7, range: 1.5, type: 'melee', color: '#fb7185' } },
    voidwalker:{ emoji: '🌌', hp: 34000, speed: 1.0, roam: true, roamSpeed: 1.1, reward: 1400, size: 0.98,
                 dmg: 8, color: '#b388ff', armor: 40, boss: true, name: 'VOIDWALKER',
                 shield: 10000, shieldColor: '#ddd6fe', regen: 0.02,
                 atk: { dmg: 85, rate: 0.6, range: 2.6, color: '#c4b5fd' } }
  },

  enemyTiers: [
    { at: 1,   types: ['scout'] },
    { at: 3,   types: ['dart'] },
    { at: 6,   types: ['cruiser'] },
    { at: 11,  types: ['gunship'] },
    { at: 16,  types: ['freighter'] },
    { at: 23,  types: ['tender'] },
    { at: 31,  types: ['ram'] },
    { at: 40,  types: ['mite'] },
    { at: 52,  types: ['bulwark'] },
    { at: 66,  types: ['dreadhull'] },
    { at: 82,  types: ['regrower'] },
    { at: 100, types: ['matriarch'] },
    { at: 120, types: ['reaver'] },
    { at: 145, types: ['voidling'] },
    { at: 170, types: ['leviathan'] }
  ],

  bosses: ['harbinger', 'devourer', 'oracle', 'worldship', 'swarmking', 'colossus', 'eventHorizon', 'heatDeath'],

  roamers: [
    { type: 'breachpod', from: 35, every: 24 },
    { type: 'voidwalker', from: 92, every: 31 }
  ],

  /* Station weather. Ion storms roll through the bastion cooking exposed guns;
   * a hull breach vents whole sections and leaves them unusable while pressure
   * comes back. */
  hazards: [
    { kind: 'storm', from: 28, every: 17, name: 'ION STORM', sub: 'raise deflectors',
      dps: 7, boltDamage: 26, radius: 2.6, duration: 22, speed: 0.55, color: '#4dd0e1', emoji: '🌀' },
    { kind: 'quake', from: 44, every: 26, name: 'HULL BREACH', sub: 'sections venting',
      cells: 6, damage: 0.5, blockWaves: 3, duration: 1.6 },
    { kind: 'meteor', from: 74, every: 23, name: 'ASTEROID SHOWER', sub: 'brace for impact',
      count: 9, damage: 60, radius: 1.2, color: '#ff9f1c' }
  ]
});
