TD.start({
  id: 'castle-siege',
  totalWaves: 200,
  startGold: 220,
  lives: 25,

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

  /* `hp` is how much punishment a tower's structure takes before it wrecks;
   * `shield` is a self-recharging buffer on top. Front-line towers are built
   * tough, artillery is glass. */
  towers: [
    { key: 'archer', name: 'Archer', emoji: '🏹', cost: 50, dmg: 8, rate: 1.5, range: 2.8, type: 'bullet', projColor: '#e0b04f', hp: 120, shield: 0, desc: 'Steady single-target arrows. Cheap and reliable.' },
    { key: 'crossbow', name: 'Crossbow', emoji: '🎯', cost: 85, dmg: 11, rate: 2.4, range: 2.6, type: 'bullet', projColor: '#d98c3f', hp: 130, shield: 0, desc: 'Rapid bolts. Shreds swarms, struggles against armour.' },
    { key: 'frost', name: 'Frost Mage', emoji: '❄️', cost: 70, dmg: 5, rate: 1.0, range: 2.5, type: 'slow', slowFactor: 0.5, slowDur: 2, projColor: '#7ad1ff', hp: 100, shield: 20, desc: 'Chills enemies, slowing them to half speed.' },
    { key: 'catapult', name: 'Catapult', emoji: '🪨', cost: 95, dmg: 21, rate: 0.55, range: 3.2, type: 'splash', splashRadius: 1.15, projColor: '#b08968', hp: 110, shield: 0, desc: 'Lobbed boulders crush tight groups.' },
    { key: 'storm', name: 'Storm Wizard', emoji: '⚡', cost: 125, dmg: 16, rate: 0.9, range: 3.0, type: 'chain', chainCount: 3, projColor: '#ffe066', hp: 100, shield: 30, desc: 'Lightning arcs between up to 4 foes.' },
    { key: 'ballista', name: 'Ballista', emoji: '🗡️', cost: 165, dmg: 52, rate: 0.42, range: 5.2, type: 'bullet', projColor: '#c9d1e6', hp: 105, shield: 0, desc: 'Enormous range and punch. Slow to reload.' },
    { key: 'cannon', name: 'Bombard', emoji: '💣', cost: 210, dmg: 46, rate: 0.5, range: 3.4, type: 'splash', splashRadius: 1.5, projColor: '#ff8c42', hp: 125, shield: 0, desc: 'Heavy siege blast. Wide splash, wide cost.' },
    { key: 'paladin', name: 'Holy Lance', emoji: '✨', cost: 280, dmg: 34, rate: 1.6, range: 3.1, type: 'beam', projColor: '#fff3b0', hp: 150, shield: 60, desc: 'Continuous searing light. Never misses.' },
    { key: 'bulwark', name: 'Bulwark', emoji: '🛡️', cost: 150, range: 2.6, type: 'support', shieldGrant: 55, projColor: '#5bc8ff', hp: 220, shield: 90, desc: 'Projects shields onto every tower in range. Does not attack.' },
    { key: 'forge', name: 'Field Forge', emoji: '🔨', cost: 175, range: 2.4, type: 'repair', repairRate: 9, projColor: '#7cf7c4', hp: 200, shield: 40, desc: 'Mends damaged towers nearby. Does not attack.' }
  ],

  /* `atk` makes an enemy shoot back at your towers. `shield` is a soak layer,
   * `armor` is flat reduction, `healRate` mends nearby enemies, `regen` is
   * self-healing that stops while the enemy is being hit. */
  enemies: {
    goblin:    { emoji: '👺', hp: 30, speed: 1.5, reward: 8, size: 0.52, color: '#7bc47f' },
    wolf:      { emoji: '🐺', hp: 22, speed: 2.4, reward: 7, size: 0.5, color: '#9aa5b1' },
    knight:    { emoji: '🛡️', hp: 95, speed: 1.0, reward: 14, size: 0.55, color: '#c0c8d8', armor: 3 },
    slinger:   { emoji: '🏹', hp: 46, speed: 1.3, reward: 13, size: 0.5, color: '#d9a441',
                 atk: { dmg: 5, rate: 0.55, range: 2.4, color: '#ffcf6b' } },
    troll:     { emoji: '🧌', hp: 240, speed: 0.75, reward: 28, size: 0.68, color: '#8f7a5c', armor: 5 },
    shaman:    { emoji: '🧙', hp: 78, speed: 1.1, reward: 22, size: 0.54, color: '#9b7ede',
                 healRate: 0.07, healRange: 2.2, healColor: '#c6a6ff' },
    ogre:      { emoji: '👹', hp: 420, speed: 0.72, reward: 40, size: 0.72, color: '#c0603f', armor: 8,
                 atk: { dmg: 14, rate: 0.3, range: 1.6, type: 'melee', color: '#ff7a4d' } },
    bat:       { emoji: '🦇', hp: 34, speed: 3.0, reward: 9, size: 0.44, color: '#6b5b8f' },
    warlock:   { emoji: '🔮', hp: 190, speed: 1.0, reward: 38, size: 0.58, color: '#a855f7',
                 shield: 120, shieldColor: '#d8b4fe',
                 atk: { dmg: 11, rate: 0.5, range: 3.0, color: '#c084fc' } },
    golem:     { emoji: '🗿', hp: 760, speed: 0.6, reward: 60, size: 0.76, color: '#7d8590', armor: 16 },
    revenant:  { emoji: '⚰️', hp: 330, speed: 1.15, reward: 44, size: 0.6, color: '#8ea67d', regen: 0.05 },
    necro:     { emoji: '💀', hp: 400, speed: 0.95, reward: 66, size: 0.62, color: '#b8c4d0',
                 shield: 200, shieldColor: '#dbeafe', healRate: 0.1, healRange: 2.6, healColor: '#a7f3d0' },
    darkKnight:{ emoji: '⚔️', hp: 980, speed: 1.05, reward: 88, size: 0.66, color: '#4b5563', armor: 24,
                 atk: { dmg: 20, rate: 0.45, range: 2.0, color: '#f87171' } },
    wraith:    { emoji: '👻', hp: 620, speed: 1.7, reward: 80, size: 0.6, color: '#cbd5e1',
                 shield: 320, shieldColor: '#e0f2fe', regen: 0.04 },
    abomination:{ emoji: '🧟', hp: 2100, speed: 0.62, reward: 150, size: 0.8, color: '#84cc16', armor: 34,
                 regen: 0.03, atk: { dmg: 30, rate: 0.35, range: 1.8, type: 'melee', color: '#a3e635' } },

    // ---- bosses ----
    ogreKing:  { emoji: '👑', hp: 2600, speed: 0.7, reward: 220, size: 0.9, dmg: 4, color: '#f97316', armor: 14, boss: true, name: 'OGRE KING',
                 atk: { dmg: 22, rate: 0.4, range: 2.4, color: '#fb923c' } },
    dragon:    { emoji: '🐉', hp: 5200, speed: 0.85, reward: 320, size: 0.94, dmg: 5, color: '#ff6b3d', boss: true, name: 'ANCIENT DRAGON',
                 atk: { dmg: 30, rate: 0.5, range: 3.2, color: '#ff8a5c' } },
    lich:      { emoji: '🧛', hp: 8800, speed: 0.8, reward: 430, size: 0.92, dmg: 6, color: '#a78bfa', boss: true, name: 'THE LICH',
                 shield: 3000, shieldColor: '#ddd6fe', healRate: 0.06, healRange: 3, atk: { dmg: 26, rate: 0.6, range: 3.4, color: '#c4b5fd' } },
    behemoth:  { emoji: '🦣', hp: 15000, speed: 0.62, reward: 560, size: 1.0, dmg: 8, color: '#92400e', armor: 45, boss: true, name: 'BEHEMOTH',
                 atk: { dmg: 46, rate: 0.35, range: 2.2, type: 'melee', color: '#d97706' } },
    demon:     { emoji: '😈', hp: 20000, speed: 0.9, reward: 720, size: 0.96, dmg: 9, color: '#dc2626', boss: true, name: 'PIT DEMON',
                 shield: 6000, shieldColor: '#fecaca', regen: 0.02, atk: { dmg: 55, rate: 0.65, range: 3.6, color: '#ef4444' } },
    titan:     { emoji: '🗿', hp: 32000, speed: 0.55, reward: 900, size: 1.05, dmg: 12, color: '#64748b', armor: 70, boss: true, name: 'STONE TITAN',
                 regen: 0.02, atk: { dmg: 70, rate: 0.4, range: 2.6, type: 'melee', color: '#94a3b8' } },
    archfiend: { emoji: '👿', hp: 48000, speed: 0.95, reward: 1200, size: 1.0, dmg: 15, color: '#7f1d1d', boss: true, name: 'ARCHFIEND',
                 shield: 16000, shieldColor: '#fca5a5', armor: 55, atk: { dmg: 90, rate: 0.7, range: 4.0, color: '#dc2626' } },
    worldEnd:  { emoji: '☄️', hp: 75000, speed: 0.75, reward: 1800, size: 1.1, dmg: 20, color: '#fbbf24', boss: true, name: 'THE ENDING',
                 shield: 30000, shieldColor: '#fde68a', armor: 90, regen: 0.015, atk: { dmg: 130, rate: 0.8, range: 4.4, color: '#f59e0b' } },

    /* ---- roamers ----
     * These ignore the path completely: they walk straight at your nearest
     * intact tower, smash it, pick the next one, and only turn on the base once
     * there is nothing left standing. Lower health than a lane boss, because
     * they arrive wherever they like rather than where your guns are pointed. */
    warbeast:  { emoji: '🦏', hp: 9000, speed: 1.1, roam: true, roamSpeed: 1.25, reward: 500, size: 0.88,
                 dmg: 4, color: '#b45309', armor: 20, boss: true, name: 'SIEGE BEAST',
                 atk: { dmg: 46, rate: 0.7, range: 1.5, type: 'melee', color: '#f59e0b' } },
    wyrm:      { emoji: '🐲', hp: 34000, speed: 1.0, roam: true, roamSpeed: 1.05, reward: 1400, size: 1.0,
                 dmg: 8, color: '#16a34a', armor: 40, boss: true, name: 'THE GREAT WYRM',
                 shield: 10000, shieldColor: '#bbf7d0', regen: 0.02,
                 atk: { dmg: 85, rate: 0.6, range: 2.6, color: '#4ade80' } }
  },

  /* What can show up, and from when. The engine leans on the two newest
   * unlocked tiers, so the fight keeps shifting instead of just getting fatter. */
  enemyTiers: [
    { at: 1,   types: ['goblin'] },
    { at: 3,   types: ['wolf'] },
    { at: 6,   types: ['knight'] },
    { at: 11,  types: ['slinger'] },
    { at: 16,  types: ['troll'] },
    { at: 23,  types: ['shaman'] },
    { at: 31,  types: ['ogre'] },
    { at: 40,  types: ['bat'] },
    { at: 52,  types: ['warlock'] },
    { at: 66,  types: ['golem'] },
    { at: 82,  types: ['revenant'] },
    { at: 100, types: ['necro'] },
    { at: 120, types: ['darkKnight'] },
    { at: 145, types: ['wraith'] },
    { at: 170, types: ['abomination'] }
  ],

  bosses: ['ogreKing', 'dragon', 'lich', 'behemoth', 'demon', 'titan', 'archfiend', 'worldEnd'],

  // Pathless hunters. Scheduled off the boss cadence so they never double up.
  roamers: [
    { type: 'warbeast', from: 35, every: 24 },
    { type: 'wyrm', from: 92, every: 31 }
  ],

  /* Weather happens to the board — you cannot shoot it, only build for it.
   * Storms drift across chewing on whatever they cover; quakes tear open cells
   * and leave ground you cannot build on for a few waves. */
  hazards: [
    { kind: 'storm', from: 28, every: 17, name: 'THUNDERSTORM', sub: 'shields up',
      dps: 7, boltDamage: 26, radius: 2.6, duration: 22, speed: 0.55, color: '#7dd3fc', emoji: '⛈️' },
    { kind: 'quake', from: 44, every: 26, name: 'EARTHQUAKE', sub: 'the ground splits open',
      cells: 6, damage: 0.5, blockWaves: 3, duration: 1.6 },
    { kind: 'meteor', from: 74, every: 23, name: 'FIRE FROM THE SKY', sub: 'get clear',
      count: 9, damage: 60, radius: 1.2, color: '#ff8c42' }
  ]
});
