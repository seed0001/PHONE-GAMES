RUN.start({
  id: 'temple-dash',
  name: 'Temple Dash',
  tagline: 'You took the idol. The temple wants it back.',
  crashEmoji: '💀',

  player: { emoji: '🐒' },
  pickup: { emoji: '🍌', name: 'bananas', value: 10 },

  speed: { start: 265, max: 615, accel: 7 },

  theme: {
    skyTop: '#123018',
    skyBottom: '#4e7a34',
    sun: '#ffe9a8',
    ground: '#5a4326',
    groundEdge: '#8a6a44',
    groundStripe: 'rgba(255,235,180,0.10)',
    groundStripe2: 'rgba(0,0,0,0.14)',
    accent: '#d8a13a',
    coinColor: '#ffd166',
    dust: 'rgba(226,205,160,0.6)',
    decor: ['🦋', '🍃', '🐦'],
    decorCount: 12,
    parallax: [
      { type: 'hills', color: '#183a1e', speed: 0.1,  minW: 150, maxW: 280, minH: 70,  maxH: 130, gap: -40 },
      { type: 'hills', color: '#22522a', speed: 0.22, minW: 110, maxW: 210, minH: 50,  maxH: 100, gap: -30, alpha: 0.95 },
      { type: 'blocks', color: '#2d5f33', speed: 0.42, minW: 26, maxW: 46, minH: 40, maxH: 95, gap: 34, alpha: 0.85 }
    ]
  },

  obstacles: [
    { emoji: '🪨', w: 36, h: 44 },
    { emoji: '🪵', w: 44, h: 34, after: 200 },
    { emoji: '🗿', w: 38, h: 62, after: 700 },
    { emoji: '🕸️', w: 42, h: 30, type: 'air', hover: 32, after: 400 },
    { emoji: '🦇', w: 36, h: 28, type: 'air', hover: 30, after: 1000 }
  ],

  zones: [
    { at: 500,  name: 'JUNGLE PATH', color: '#9be564', theme: { skyTop: '#0f2c16', skyBottom: '#3f6b2c' } },
    { at: 1200, name: 'THE RUINS',   color: '#d8a13a', theme: { skyTop: '#2e2415', skyBottom: '#7d6335', sun: '#ffd166' } },
    { at: 2200, name: 'CATACOMBS',   color: '#b088ff', theme: { skyTop: '#100c1c', skyBottom: '#2e2444', sun: '#8f7ad1' } },
    { at: 3500, name: 'THE IDOL',    color: '#ff6b3d', theme: { skyTop: '#2b0d06', skyBottom: '#8a3413', sun: '#ff6b3d' } }
  ]
});
