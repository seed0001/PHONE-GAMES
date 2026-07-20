TD.start({
  id: 'neon-breach',
  totalWaves: 200,
  startGold: 220,
  lives: 25,

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
    deathEmoji: '💥',
    ambient: 'rain',           // datastream falling down the grid
    ambientColor: '#00e5ff',
    ambientCount: 30,
    scanlines: true,
    spawnGlow: '#ff2d95',
    baseGlow: '#00e5ff',
    flowColor: '#00e5ff'
  },

  towers: [
    { key: 'sentry', name: 'Sentry', emoji: '🔫', cost: 50, dmg: 8, rate: 1.6, range: 2.7, type: 'bullet', projColor: '#00e5ff', hp: 120, shield: 0, desc: 'Baseline autocannon. Cheap, dependable.' },
    { key: 'shredder', name: 'Shredder', emoji: '⚙️', cost: 85, dmg: 10, rate: 2.6, range: 2.5, type: 'bullet', projColor: '#7cf7c4', hp: 130, shield: 0, desc: 'High cycle rate. Melts light chassis.' },
    { key: 'cryo', name: 'Cryo Node', emoji: '🧊', cost: 70, dmg: 5, rate: 1.1, range: 2.5, type: 'slow', slowFactor: 0.48, slowDur: 2, projColor: '#8ecdff', hp: 100, shield: 25, desc: 'Supercools servos, halving movement speed.' },
    { key: 'mortar', name: 'Rail Mortar', emoji: '💥', cost: 100, dmg: 22, rate: 0.55, range: 3.2, type: 'splash', splashRadius: 1.2, projColor: '#ff9f1c', hp: 110, shield: 0, desc: 'Arcing charge. Good against packed clusters.' },
    { key: 'tesla', name: 'Tesla Coil', emoji: '⚡', cost: 130, dmg: 17, rate: 0.95, range: 3.0, type: 'chain', chainCount: 3, projColor: '#ffe066', hp: 105, shield: 30, desc: 'Arcs between up to 4 machines.' },
    { key: 'railgun', name: 'Railgun', emoji: '🎯', cost: 170, dmg: 55, rate: 0.4, range: 5.4, type: 'bullet', projColor: '#e0e7ff', hp: 105, shield: 0, desc: 'Cross-map penetrator. Punishingly slow reload.' },
    { key: 'plasma', name: 'Plasma Bloom', emoji: '🔥', cost: 215, dmg: 48, rate: 0.5, range: 3.4, type: 'splash', splashRadius: 1.55, projColor: '#ff2d95', hp: 125, shield: 0, desc: 'Superheated detonation with a wide kill radius.' },
    { key: 'lance', name: 'Ion Lance', emoji: '🌠', cost: 285, dmg: 36, rate: 1.6, range: 3.1, type: 'beam', projColor: '#b388ff', hp: 150, shield: 65, desc: 'Sustained ion beam. Cannot be dodged.' },
    { key: 'firewall', name: 'Firewall', emoji: '🛡️', cost: 150, range: 2.6, type: 'support', shieldGrant: 55, projColor: '#5bc8ff', hp: 220, shield: 90, desc: 'Hardens every emplacement in range. Does not attack.' },
    { key: 'nanite', name: 'Nanite Bay', emoji: '🔧', cost: 175, range: 2.4, type: 'repair', repairRate: 9, projColor: '#7cf7c4', hp: 200, shield: 40, desc: 'Rebuilds damaged emplacements nearby. Does not attack.' }
  ],

  enemies: {
    crawler:   { emoji: '🕷️', hp: 30, speed: 1.6, reward: 8, size: 0.5, color: '#7cf7c4' },
    drone:     { emoji: '🛸', hp: 22, speed: 2.5, reward: 7, size: 0.48, color: '#8ecdff' },
    hardhull:  { emoji: '🤖', hp: 95, speed: 1.0, reward: 14, size: 0.55, color: '#c0c8d8', armor: 3 },
    gunbot:    { emoji: '🔫', hp: 46, speed: 1.3, reward: 13, size: 0.5, color: '#ff9f1c',
                 atk: { dmg: 5, rate: 0.55, range: 2.4, color: '#ffcf6b' } },
    hauler:    { emoji: '🚜', hp: 240, speed: 0.78, reward: 28, size: 0.68, color: '#94a3b8', armor: 5 },
    patcher:   { emoji: '🔩', hp: 78, speed: 1.15, reward: 22, size: 0.52, color: '#7cf7c4',
                 healRate: 0.07, healRange: 2.2, healColor: '#a7f3d0' },
    breacher:  { emoji: '🦾', hp: 420, speed: 0.74, reward: 40, size: 0.7, color: '#f97316', armor: 8,
                 atk: { dmg: 14, rate: 0.3, range: 1.6, type: 'melee', color: '#fb923c' } },
    swarmlet:  { emoji: '🦟', hp: 34, speed: 3.1, reward: 9, size: 0.42, color: '#a3e635' },
    warden:    { emoji: '🛰️', hp: 190, speed: 1.0, reward: 38, size: 0.58, color: '#b388ff',
                 shield: 120, shieldColor: '#d8b4fe',
                 atk: { dmg: 11, rate: 0.5, range: 3.0, color: '#c084fc' } },
    juggernaut:{ emoji: '🛞', hp: 760, speed: 0.6, reward: 60, size: 0.76, color: '#64748b', armor: 16 },
    reassembler:{ emoji: '♻️', hp: 330, speed: 1.15, reward: 44, size: 0.6, color: '#4ade80', regen: 0.05 },
    overseer:  { emoji: '👁️', hp: 400, speed: 0.95, reward: 66, size: 0.62, color: '#e0e7ff',
                 shield: 200, shieldColor: '#dbeafe', healRate: 0.1, healRange: 2.6, healColor: '#a7f3d0' },
    sabre:     { emoji: '🗡️', hp: 980, speed: 1.08, reward: 88, size: 0.66, color: '#475569', armor: 24,
                 atk: { dmg: 20, rate: 0.45, range: 2.0, color: '#f87171' } },
    phantom:   { emoji: '👾', hp: 620, speed: 1.75, reward: 80, size: 0.6, color: '#c4b5fd',
                 shield: 320, shieldColor: '#ede9fe', regen: 0.04 },
    titanhull: { emoji: '🚀', hp: 2100, speed: 0.62, reward: 150, size: 0.8, color: '#f59e0b', armor: 34,
                 regen: 0.03, atk: { dmg: 30, rate: 0.35, range: 1.8, type: 'melee', color: '#fbbf24' } },

    // ---- bosses ----
    foreman:   { emoji: '🦿', hp: 2600, speed: 0.72, reward: 220, size: 0.9, dmg: 4, color: '#f97316', armor: 14, boss: true, name: 'THE FOREMAN',
                 atk: { dmg: 22, rate: 0.4, range: 2.4, color: '#fb923c' } },
    hydra:     { emoji: '🐍', hp: 5200, speed: 0.88, reward: 320, size: 0.92, dmg: 5, color: '#22d3ee', boss: true, name: 'HYDRA PROCESS',
                 atk: { dmg: 30, rate: 0.5, range: 3.2, color: '#67e8f9' } },
    architect: { emoji: '🧠', hp: 8800, speed: 0.8, reward: 430, size: 0.92, dmg: 6, color: '#a78bfa', boss: true, name: 'THE ARCHITECT',
                 shield: 3000, shieldColor: '#ddd6fe', healRate: 0.06, healRange: 3, atk: { dmg: 26, rate: 0.6, range: 3.4, color: '#c4b5fd' } },
    bulwarkAI: { emoji: '🏗️', hp: 15000, speed: 0.62, reward: 560, size: 1.0, dmg: 8, color: '#78716c', armor: 45, boss: true, name: 'SIEGE FRAME',
                 atk: { dmg: 46, rate: 0.35, range: 2.2, type: 'melee', color: '#a8a29e' } },
    daemon:    { emoji: '😈', hp: 24000, speed: 0.9, reward: 720, size: 0.96, dmg: 9, color: '#ef4444', boss: true, name: 'ROOT DAEMON',
                 shield: 8000, shieldColor: '#fecaca', regen: 0.02, atk: { dmg: 55, rate: 0.65, range: 3.6, color: '#f87171' } },
    monolith:  { emoji: '🗄️', hp: 42000, speed: 0.55, reward: 900, size: 1.05, dmg: 12, color: '#0ea5e9', armor: 70, boss: true, name: 'THE MONOLITH',
                 regen: 0.02, atk: { dmg: 70, rate: 0.4, range: 2.6, type: 'melee', color: '#38bdf8' } },
    singularity:{ emoji: '🕳️', hp: 70000, speed: 0.95, reward: 1200, size: 1.0, dmg: 15, color: '#6366f1', boss: true, name: 'SINGULARITY',
                 shield: 25000, shieldColor: '#c7d2fe', armor: 55, atk: { dmg: 90, rate: 0.7, range: 4.0, color: '#818cf8' } },
    zeroDay:   { emoji: '☠️', hp: 120000, speed: 0.75, reward: 1800, size: 1.1, dmg: 20, color: '#ff2d95', boss: true, name: 'ZERO DAY',
                 shield: 50000, shieldColor: '#fbcfe8', armor: 90, regen: 0.015, atk: { dmg: 130, rate: 0.8, range: 4.4, color: '#f472b6' } }
  },

  enemyTiers: [
    { at: 1,   types: ['crawler'] },
    { at: 3,   types: ['drone'] },
    { at: 6,   types: ['hardhull'] },
    { at: 11,  types: ['gunbot'] },
    { at: 16,  types: ['hauler'] },
    { at: 23,  types: ['patcher'] },
    { at: 31,  types: ['breacher'] },
    { at: 40,  types: ['swarmlet'] },
    { at: 52,  types: ['warden'] },
    { at: 66,  types: ['juggernaut'] },
    { at: 82,  types: ['reassembler'] },
    { at: 100, types: ['overseer'] },
    { at: 120, types: ['sabre'] },
    { at: 145, types: ['phantom'] },
    { at: 170, types: ['titanhull'] }
  ],

  bosses: ['foreman', 'hydra', 'architect', 'bulwarkAI', 'daemon', 'monolith', 'singularity', 'zeroDay']
});
