RUN.start({
  id: 'neon-sprint',
  name: 'Neon Sprint',
  tagline: 'Outrun the grid before it catches up.',
  crashEmoji: '🌀',

  player: { emoji: '🏃' },
  pickup: { emoji: '💠', name: 'shards', value: 10 },

  speed: { start: 285, max: 660, accel: 8 },

  theme: {
    skyTop: '#07031f',
    skyBottom: '#3d0a52',
    sun: '#ff2fb9',
    ground: '#120a2e',
    groundEdge: '#ff2fb9',
    groundStripe: 'rgba(0,255,247,0.18)',
    groundStripe2: 'rgba(255,47,185,0.12)',
    accent: '#00fff7',
    trail: '#00fff7',
    coinColor: '#00fff7',
    dust: 'rgba(0,255,247,0.55)',
    decor: ['✦', '▲', '◆'],
    decorCount: 14,
    parallax: [
      { type: 'spikes', color: '#1a0b3d', speed: 0.12, minW: 70, maxW: 150, minH: 90, maxH: 190, gap: 10 },
      { type: 'blocks', color: '#2a0f5c', speed: 0.28, minW: 40, maxW: 90, minH: 60, maxH: 150, gap: 18, alpha: 0.9 },
      { type: 'spikes', color: '#43167f', speed: 0.5, minW: 30, maxW: 70, minH: 30, maxH: 80, gap: 40, alpha: 0.8 }
    ]
  },

  obstacles: [
    { emoji: '🚧', w: 32, h: 46 },
    { emoji: '🛑', w: 34, h: 54, after: 250 },
    { emoji: '🔻', w: 30, h: 40, after: 600 },
    { emoji: '🛸', w: 40, h: 30, type: 'air', hover: 32, after: 450 },
    { emoji: '📡', w: 36, h: 28, type: 'air', hover: 30, after: 1100 }
  ],

  zones: [
    { at: 500,  name: 'DOWNTOWN',  color: '#00fff7', theme: { skyTop: '#04122b', skyBottom: '#0a4a6b', sun: '#00fff7' } },
    { at: 1200, name: 'THE STACKS', color: '#ffe066', theme: { skyTop: '#2b1004', skyBottom: '#8a3b0a', sun: '#ffb703' } },
    { at: 2200, name: 'CORE BREACH', color: '#ff2fb9', theme: { skyTop: '#1f0224', skyBottom: '#6b0a5e', sun: '#ff2fb9' } },
    { at: 3500, name: 'OVERCLOCK',  color: '#ff4646', theme: { skyTop: '#26040a', skyBottom: '#7d0f16', sun: '#ff4646' } }
  ]
});
