/* The one place games and categories are defined.
 *
 * Loaded by the browser as <script src="/js/catalog.js"> (sets window.CATEGORIES)
 * and by the server as require('./public/js/catalog.js') — so the hub, the
 * stats page and the score API can never drift out of sync.
 *
 * `showWave` controls whether a best score reads "1,234 (wave 5)" or just the
 * number. A category with an empty `games` array renders its `soon` note.
 */
(function (root, factory) {
  const CATEGORIES = factory();
  if (typeof module === 'object' && module.exports) module.exports = CATEGORIES;
  else root.CATEGORIES = CATEGORIES;
})(typeof self !== 'undefined' ? self : this, function () {
  return [
    {
      id: 'tower-defense', name: 'Tower Defense', badge: 'Tower Defense', showWave: true,
      games: [
        {
          id: 'castle-siege', name: 'Castle Siege', emoji: '🏰',
          desc: 'Classic medieval defense. Archers, catapults and wizards vs the goblin horde.',
          art: 'linear-gradient(135deg,#2d5a27,#1a3a17)'
        },
        {
          id: 'neon-breach', name: 'Neon Breach', emoji: '🤖',
          desc: 'A rogue AI is flooding the grid. Deploy turrets and firewalls to stop the swarm.',
          art: 'linear-gradient(135deg,#0b1030,#2a0a4a)'
        },
        {
          id: 'void-bastion', name: 'Void Bastion', emoji: '🛸',
          desc: 'Deep-space station defense. Lasers and singularities vs the alien armada.',
          art: 'linear-gradient(135deg,#050514,#1a1040)'
        },
        {
          id: 'grave-shift', name: 'Grave Shift', emoji: '🧟',
          desc: 'The dead are restless. Hold the graveyard with holy fire and bone-crushing wards.',
          art: 'linear-gradient(135deg,#1a1a24,#2d1f38)'
        }
      ]
    },
    {
      id: 'endless-runner', name: 'Endless Runner', badge: 'Runner',
      games: [
        {
          id: 'neon-sprint', name: 'Neon Sprint', emoji: '⚡',
          desc: 'Outrun the grid through a synthwave city. Jump the barriers, slide the drones.',
          art: 'linear-gradient(135deg,#3d0a52,#07031f)'
        },
        {
          id: 'temple-dash', name: 'Temple Dash', emoji: '🗿',
          desc: 'You took the idol and the temple wants it back. Vines, rubble and very old bats.',
          art: 'linear-gradient(135deg,#4e7a34,#123018)'
        },
        {
          id: 'deep-current', name: 'Deep Current', emoji: '🌊',
          desc: 'Ride the trench at speed. Coral below, jellyfish above, no brakes.',
          art: 'linear-gradient(135deg,#0a5a72,#04121f)'
        },
        {
          id: 'rooftop-run', name: 'Rooftop Run', emoji: '🌃',
          desc: 'Twelve stories up with the alarm blaring. The fastest run of the four.',
          art: 'linear-gradient(135deg,#3a2352,#080a1e)'
        }
      ]
    },
    {
      id: 'fighting', name: 'Fighting', badge: 'Fighter', showWave: true,
      games: [
        {
          id: 'dragon-dojo', name: 'Dragon Dojo', emoji: '🥋',
          desc: 'Side-view martial-arts brawler. Climb a ladder of dojo masters, best of 3.',
          art: 'linear-gradient(135deg,#6e3a1c,#241009)'
        },
        {
          id: 'neon-knockout', name: 'Neon Knockout', emoji: '🥊',
          desc: 'Back-alley cyber fight. Punch, kick and plasma-bolt your way up the neon strip.',
          art: 'linear-gradient(135deg,#2a0740,#06060f)'
        }
      ]
    },
    {
      id: 'coming-soon', name: 'More Coming Soon', games: [],
      soon: "New games drop here as they're added. Check back soon! 🚧"
    }
  ];
});
