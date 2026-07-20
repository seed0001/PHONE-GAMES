RUN.start({
  id: 'deep-current',
  name: 'Deep Current',
  tagline: 'Ride the trench. Do not touch anything.',
  crashEmoji: '🩸',

  player: { emoji: '🐬' },
  pickup: { emoji: '🫧', name: 'bubbles', value: 10 },

  // the water makes everything a touch floatier and slower to build up
  speed: { start: 255, max: 590, accel: 6.4 },

  theme: {
    skyTop: '#052a44',
    skyBottom: '#0a5a72',
    sun: '#8fe9ff',
    ground: '#07202f',
    groundEdge: '#2ec4d6',
    groundStripe: 'rgba(140,235,255,0.10)',
    groundStripe2: 'rgba(140,235,255,0.06)',
    accent: '#2ec4d6',
    trail: '#8fe9ff',
    coinColor: '#8fe9ff',
    dust: 'rgba(160,240,255,0.6)',
    decor: ['🐟', '🫧', '🐠'],
    decorCount: 16,
    parallax: [
      { type: 'waves',  color: '#063348', speed: 0.1,  minW: 200, maxW: 340, minH: 90, maxH: 150, gap: -60 },
      { type: 'hills',  color: '#0a4459', speed: 0.24, minW: 130, maxW: 240, minH: 55, maxH: 110, gap: -35, alpha: 0.95 },
      { type: 'spikes', color: '#0e5a6e', speed: 0.45, minW: 24, maxW: 54, minH: 40, maxH: 100, gap: 40, alpha: 0.85 }
    ]
  },

  obstacles: [
    { emoji: '🪸', w: 36, h: 46 },
    { emoji: '🦀', w: 34, h: 38, after: 220 },
    { emoji: '🐡', w: 36, h: 56, after: 700 },
    { emoji: '🪼', w: 38, h: 32, type: 'air', hover: 32, after: 400 },
    { emoji: '🦑', w: 40, h: 30, type: 'air', hover: 30, after: 1100 }
  ],

  zones: [
    { at: 500,  name: 'THE SHELF',   color: '#8fe9ff', theme: { skyTop: '#06405e', skyBottom: '#0d7a91' } },
    { at: 1200, name: 'KELP FOREST', color: '#57d98a', theme: { skyTop: '#053528', skyBottom: '#0a6b4a', sun: '#9bf0b8' } },
    { at: 2200, name: 'THE TRENCH',  color: '#5b7bff', theme: { skyTop: '#020a1c', skyBottom: '#06214a', sun: '#5b7bff' } },
    { at: 3500, name: 'BLACK WATER', color: '#c86bff', theme: { skyTop: '#050010', skyBottom: '#1a0430', sun: '#c86bff' } }
  ]
});
