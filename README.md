# 🕹️ Pocket Arcade

A browser-based phone game hub. Sign in, pick a game, defend the base.

## Games

| Game | Theme |
|------|-------|
| 🏰 Castle Siege | Medieval — archers and wizards vs the goblin horde |
| 🤖 Neon Breach | Rogue AI — turrets and EMPs vs the machine swarm |
| 🛸 Void Bastion | Deep space — lasers and singularities vs the alien armada |
| 🧟 Grave Shift | Undead — holy fire vs the restless dead |

All four run on a shared tower defense engine
([public/games/engine/td-engine.js](public/games/engine/td-engine.js)) —
each game is just an HTML shell plus a `config.js` defining its map, theme,
towers, enemies, and waves.

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

1. Create `public/games/<game-id>/index.html` (copy an existing game's shell).
2. Add a `config.js` — or write a whole custom game; anything static works.
3. Add the game id to `GAME_IDS` in [server.js](server.js) (enables score saving).
4. Add a card entry to the `GAMES` list in [public/index.html](public/index.html).
