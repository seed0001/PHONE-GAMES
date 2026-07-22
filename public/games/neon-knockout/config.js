/* Neon Knockout — a back-alley cyber brawl. Rain-slick neon street, augmented
 * street fighters. Same engine as Dragon Dojo; different skin and roster.
 * Everyone here hits a little harder and moves a little faster. */
FIGHT.start({
  id: 'neon-knockout',
  name: 'Neon Knockout',
  icon: '🥊',
  tagline: 'Brawl up the neon strip. Best of 3, then a nastier challenger.',
  roundTime: 60,
  roundsToWin: 2,

  stage: {
    skyTop: '#08021a',
    skyBottom: '#2a0740',
    horizon: '#12043a',
    floorTop: '#241247',
    floorBottom: '#0a0420',
    floorLine: 'rgba(0,255,247,0.16)',
    decor: ['🌃', '💜', '🏙️', '💙', '🌆'],
    decorCount: 5,
    decorY: 118,
    decorSize: 22,
    decorAlpha: 0.8
  },

  // your fighter — a quick striker with a plasma jab special
  player: {
    name: 'Rook',
    colors: { skin: '#d9a074', hair: '#1a1420', gi: '#1f2547', trim: '#00fff7', belt: '#00fff7', glove: '#00fff7' },
    stats: { maxHp: 100, walk: 90, backWalk: 74 },
    moves: {
      punch: { dmg: 6 },
      special: { name: 'Plasma Bolt', dmg: 13, cost: 50,
                 projectile: { speed: 300, r: 10, life: 2 } }
    }
  },

  roster: [
    {
      name: 'Static',
      colors: { skin: '#c98a5a', hair: '#3a1a4a', gi: '#3a2a5c', trim: '#ff2fb9', belt: '#ff2fb9', glove: '#ff2fb9' },
      stats: { maxHp: 92, walk: 82 }
    },
    {
      name: 'Rebar',
      colors: { skin: '#b9805a', hair: '#141414', gi: '#4a3a1a', trim: '#ffb703', belt: '#2a2010', glove: '#ffb703' },
      stats: { maxHp: 120, walk: 70, backWalk: 58, weight: 1.35 },
      moves: { kick: { dmg: 13, kb: 200 }, punch: { dmg: 7 } }
    },
    {
      name: 'Vex',
      colors: { skin: '#e0b98f', hair: '#00fff7', gi: '#0a2a3a', trim: '#00fff7', belt: '#00fff7', glove: '#7dffff' },
      stats: { maxHp: 96, walk: 98, backWalk: 82 },
      moves: { kick: { dmg: 11, reach: 46 }, air: { dmg: 11 },
               special: { name: 'Shock Wave', dmg: 12, cost: 50,
                          projectile: { speed: 320, r: 11, life: 2 } } }
    },
    {
      name: 'Havok',
      colors: { skin: '#c07a4a', hair: '#2a0a0a', gi: '#5c1420', trim: '#ff4646', belt: '#ff4646', glove: '#ff4646' },
      stats: { maxHp: 110, walk: 88 },
      moves: { punch: { dmg: 7 }, kick: { dmg: 13, kb: 210 } }
    },
    {
      name: 'Zero',
      colors: { skin: '#d0a074', hair: '#e8e8ef', gi: '#14103a', trim: '#b46bff', belt: '#b46bff', glove: '#c9a0ff' },
      stats: { maxHp: 125, walk: 94, backWalk: 80 },
      moves: {
        kick: { dmg: 13, kb: 210 },
        special: { name: 'Void Lance', dmg: 17, cost: 50, kb: 230,
                   projectile: { speed: 340, r: 13, life: 2.4 } }
      }
    }
  ]
});
