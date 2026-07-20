RUN.start({
  id: 'rooftop-run',
  name: 'Rooftop Run',
  tagline: 'Twelve stories up and the alarm just went off.',
  crashEmoji: '🚨',

  player: { emoji: '🥷' },
  pickup: { emoji: '💰', name: 'loot', value: 10 },

  // fastest of the four — city rooftops are a sprint
  speed: { start: 300, max: 690, accel: 8.6 },

  theme: {
    skyTop: '#080a1e',
    skyBottom: '#3a2352',
    sun: '#ffd166',
    ground: '#14162a',
    groundEdge: '#ff9f1c',
    groundStripe: 'rgba(255,159,28,0.14)',
    groundStripe2: 'rgba(255,255,255,0.05)',
    accent: '#ff9f1c',
    coinColor: '#ffd166',
    dust: 'rgba(200,205,235,0.5)',
    decor: ['✦', '🌙', '🕊️'],
    decorCount: 10,
    parallax: [
      { type: 'blocks', color: '#0e1024', speed: 0.09, minW: 70, maxW: 140, minH: 110, maxH: 230, gap: 6 },
      { type: 'blocks', color: '#181c38', speed: 0.2,  minW: 55, maxW: 110, minH: 80,  maxH: 175, gap: 12, alpha: 0.95 },
      { type: 'blocks', color: '#242a4e', speed: 0.4,  minW: 40, maxW: 85,  minH: 50,  maxH: 120, gap: 22, alpha: 0.85 }
    ]
  },

  obstacles: [
    { emoji: '📦', w: 36, h: 42 },
    { emoji: '🧊', w: 34, h: 50, after: 240 },
    { emoji: '🚪', w: 34, h: 62, after: 750 },
    { emoji: '🚁', w: 42, h: 30, type: 'air', hover: 32, after: 420 },
    { emoji: '🪁', w: 36, h: 28, type: 'air', hover: 30, after: 1150 }
  ],

  zones: [
    { at: 500,  name: 'THE STRIP',   color: '#ff9f1c', theme: { skyTop: '#0d0820', skyBottom: '#54265c' } },
    { at: 1200, name: 'HIGH RISES',  color: '#5bc0ff', theme: { skyTop: '#050e26', skyBottom: '#1b4a7a', sun: '#a8dcff' } },
    { at: 2200, name: 'STORM FRONT', color: '#b0b8d8', theme: { skyTop: '#0a0c14', skyBottom: '#2a3050', sun: '#8892b8' } },
    { at: 3500, name: 'SUNRISE',     color: '#ffd166', theme: { skyTop: '#2b1230', skyBottom: '#c2601f', sun: '#ffe9a8' } }
  ]
});
