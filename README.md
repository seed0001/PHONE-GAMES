# 🕹️ Pocket Arcade

A browser-based phone game hub. Sign in, pick a game, defend the base.

## Games

Games are grouped into **categories** on the hub. Each category runs on one
shared engine, so a new game in an existing category is just an HTML shell
plus a `config.js`.

### 🏹 Tower Defense — [`engine/td-engine.js`](public/games/engine/td-engine.js)

| Game | Theme |
|------|-------|
| 🏰 Castle Siege | Medieval — archers and wizards vs the goblin horde |
| 🤖 Neon Breach | Rogue AI — turrets and EMPs vs the machine swarm |
| 🛸 Void Bastion | Deep space — lasers and singularities vs the alien armada |
| 🧟 Grave Shift | Undead — holy fire vs the restless dead |

A config defines the map, theme, towers, enemies and waves.

### 🏃 Endless Runner — [`engine/runner-engine.js`](public/games/engine/runner-engine.js)

| Game | Theme |
|------|-------|
| ⚡ Neon Sprint | Synthwave city — outrun the grid |
| 🗿 Temple Dash | Jungle ruins — you took the idol, it wants you back |
| 🌊 Deep Current | Ocean trench — coral below, jellyfish above |
| 🌃 Rooftop Run | City night — the fastest of the four |

Tap to jump (twice to double-jump), swipe down to slide. A config defines the
theme, parallax layers, player, obstacle set, pickup and zone progression.
Score is distance in metres plus pickups.

Obstacle spacing is generated from the current run speed and the engine's jump
airtime, so the game never spawns a gap that is physically unclearable.

## Run locally

```bash
npm install
npm start
# http://localhost:3000
```

## Stack

- Node + Express, better-sqlite3 for accounts/sessions/high scores
- Vanilla JS canvas games, no build step
- Accounts: username + password (bcrypt), cookie sessions

## Deploy on Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** and pick this repo.
   `railway.json` handles the rest (Nixpacks build, `node server.js` start).
3. **Persistence (recommended):** add a Volume to the service, mount it at
   `/data`, and set the environment variable `DATA_DIR=/data`. Without this,
   accounts and scores reset on each redeploy.

## Adding a new game

1. Create `public/games/<game-id>/index.html` (copy an existing game's shell
   from the same category).
2. Add a `config.js` — or write a whole custom game; anything static works.
3. Add the game id to its category in `CATEGORY_GAMES` in [server.js](server.js)
   (enables score saving).
4. Add a card entry to that category's `games` list in `CATEGORIES` in
   [public/index.html](public/index.html).

## Adding a new category

1. Write an engine in `public/games/engine/` (or skip it if the games are
   one-offs).
2. Add an entry to `CATEGORIES` in [public/index.html](public/index.html):
   `{ id, name, badge, games: [...] }`. Set `showWave: true` if best scores
   should read "1,234 (wave 5)" rather than just the number. A category with
   an empty `games` array renders its `soon` note instead of a grid.
3. Add the matching key to `CATEGORY_GAMES` in [server.js](server.js).
