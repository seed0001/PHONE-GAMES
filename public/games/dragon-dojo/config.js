/* Dragon Dojo — a martial-arts ladder. You are a wandering student climbing
 * a tournament of dojo masters. Warm lantern-lit hall, fighters in gis.
 *
 * The engine (fighter-engine.js) supplies default moves/stats; a fighter here
 * only lists what makes them distinct — colours, a stat or two, the odd move
 * tweak. The roster is fought in order, then loops back tougher. */
FIGHT.start({
  id: 'dragon-dojo',
  name: 'Dragon Dojo',
  icon: '🥋',
  tagline: 'Climb the dojo ladder. Best of 3, then a harder master.',
  roundTime: 60,
  roundsToWin: 2,

  stage: {
    skyTop: '#3a1e12',
    skyBottom: '#6e3a1c',
    horizon: '#24140c',
    floorTop: '#7a4a28',
    floorBottom: '#3a2213',
    floorLine: 'rgba(255,210,140,0.14)',
    decor: ['🏮', '🐉', '🏮', '🎎', '🏮'],
    decorCount: 5,
    decorY: 120,
    decorSize: 24,
    decorAlpha: 0.9
  },

  // your fighter — a balanced student with a chi-blast special
  player: {
    name: 'Student',
    colors: { skin: '#e8b489', hair: '#241a16', gi: '#f2f2f5', trim: '#cf3b3b', belt: '#1f1f27', glove: '#cf3b3b' },
    stats: { maxHp: 100, walk: 84, backWalk: 68 },
    moves: {
      special: { name: 'Chi Blast', dmg: 13, cost: 50,
                 projectile: { speed: 240, r: 11, life: 2.2 } }
    }
  },

  // the ladder, easy → hard
  roster: [
    {
      name: 'White Belt',
      colors: { skin: '#d8a06f', hair: '#20160f', gi: '#eef0f2', trim: '#9aa0aa', belt: '#eee', glove: '#d0d3da' },
      stats: { maxHp: 90, walk: 72, backWalk: 60 }
    },
    {
      name: 'Iron Fist',
      colors: { skin: '#c98a5a', hair: '#161616', gi: '#c9402f', trim: '#ffd45e', belt: '#2a2a33', glove: '#7a1c14' },
      stats: { maxHp: 105, walk: 80 },
      moves: { punch: { dmg: 7 }, kick: { dmg: 12, kb: 195 } }
    },
    {
      name: 'Crane Style',
      colors: { skin: '#e0b98f', hair: '#2a2016', gi: '#e8e2c0', trim: '#3f8f5a', belt: '#3f8f5a', glove: '#dcd3a8' },
      stats: { maxHp: 96, walk: 92, backWalk: 78 },
      moves: { kick: { dmg: 11, reach: 48, kb: 200 }, air: { dmg: 11, reach: 40 } }
    },
    {
      name: 'Stone Monk',
      colors: { skin: '#b98a63', hair: '#0d0d0d', gi: '#c98a3a', trim: '#7a4a1a', belt: '#4a2f14', glove: '#8a5a26' },
      stats: { maxHp: 130, walk: 66, backWalk: 54, weight: 1.4 },
      moves: { punch: { dmg: 7 }, kick: { dmg: 13, kb: 150 } }
    },
    {
      name: 'Dragon Master',
      colors: { skin: '#d99a66', hair: '#1a1414', gi: '#2a2f4a', trim: '#e8a33d', belt: '#e8a33d', glove: '#c23b3b' },
      stats: { maxHp: 120, walk: 90, backWalk: 76 },
      moves: {
        kick: { dmg: 12, kb: 200 },
        special: { name: 'Dragon Fire', dmg: 16, cost: 50, kb: 220,
                   projectile: { speed: 280, r: 13, life: 2.4 } }
      }
    }
  ]
});
