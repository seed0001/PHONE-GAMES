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

Each is a 200-wave campaign with 10 towers and 23 enemy types including 8
bosses. A config defines the map, theme, towers, enemies and enemy tiers.

**Towers fight back and can be destroyed.** Every tower has structure (`hp`)
and an optional recharging `shield`. Enemies with an `atk` block shoot at your
towers as they advance; shields soak damage first and recharge after a lull,
but structure damage does not heal on its own — you pay to repair, or the
tower wrecks and goes silent until you rebuild it. Two tower types exist to
answer this: a **support** tower that projects shield capacity onto everything
in range, and a **repair** tower that mends structure over time. Neither
attacks, so both cost you a firing slot.

Enemies vary by more than health: `armor` (flat reduction), `shield` (a soak
layer that stays down once broken), `regen` (self-heal that pauses while being
hit), `healRate` (medics that mend the wave around them), and `atk`.

**Waves are generated, not authored** — nobody hand-writes 200 entries.
`enemyTiers` says what unlocks when; the engine leans on the two most recently
unlocked tiers so the fight keeps changing, and drops a boss every 10 waves.
Generation is deterministic, so wave 137 is the same fight for every player,
which is what makes the leaderboards mean anything.

Difficulty is a polynomial with a per-act kicker (`hpScale` in the engine),
reaching ~157x health at wave 200. The old curve was `1.13^wave`, which is
fine for 20 waves and asks for 4x10^10 health at 200.

#### Roamers

Listed under `roamers`, these bosses have `roam: true` and **ignore the path
entirely**. A roamer walks straight at your nearest intact tower, wrecks it,
picks the next one, and only turns on the base once nothing is left standing —
so it can never stall a wave by having no objective. Towers always target a
roamer over the marching column, since leaving one alive costs you buildings.

They carry less health than a lane boss of the same era on purpose: they pick
where the fight happens, so your guns are rarely all pointing the right way.

#### Hazards

Listed under `hazards`, these are weather, not enemies — you cannot shoot them,
only build for them. Scheduled on the wave counter (`from` / `every`) and held
on the game clock, so pausing pauses them.

| Kind | What it does |
|------|--------------|
| `storm` | Drifts across the board damaging every tower it covers, throwing a heavy bolt at one of them every second or so. Shields are the answer. |
| `quake` | Rips open cells at random, wrecking what stands on them and leaving ground you **cannot build on** for `blockWaves` waves. Path cells are spared — collapsing the route would strand enemies. |
| `meteor` | Telegraphs impact rings, then lands. Hits towers and enemies both, so it can save you as easily as ruin you. |

A quake permanently changes the shape of a run: lose a flank at wave 96 and you
are rebuilding somewhere else, not where you planned.

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

### 🥊 Fighting — [`engine/fighter-engine.js`](public/games/engine/fighter-engine.js)

| Game | Theme |
|------|-------|
| 🥋 Dragon Dojo | Martial-arts tournament — a wandering student vs a ladder of dojo masters |
| 🥊 Neon Knockout | Back-alley cyber brawl — augmented street fighters up the neon strip |

Side-view one-on-one fighting against the computer. It plays as an **arcade
ladder**: best-of-3 against each opponent, and every match won sends you to a
tougher one who hits harder, blocks smarter and reacts quicker. One lost match
ends the run; your score is what you banked climbing. Best scores read
`14,800 (wave 5)`, where the "wave" is how deep into the ladder you reached.

Controls are a d-pad plus four buttons: **◀▶** walk (forward is quicker than
backing off), **⤒** jump, **⤓** crouch, hold **🛡** to guard, **👊** punch,
**🦵** kick, **⚡** special. Holding *back* also guards, the classic way.

**The move set has rock-paper-scissors depth.** Crouch + kick becomes a low
**sweep** that must be blocked crouching; a jump-in attack hits **overhead**
and must be blocked standing; everything else is **mid** and blocks either way.
So blocking is a read, not a button you hold forever. Landing hits builds a
**super meter**; at 50 you can throw a **special** — usually a projectile that
travels the screen and is itself blockable.

Fighters are drawn from canvas primitives with a small IK-lite skeleton — no
sprite assets — so a `config.js` is just numbers and colours: a stage theme,
your fighter, and the roster of opponents. The engine supplies the default
moves, physics, hit detection, the round/match loop and the AI; a fighter lists
only what makes it distinct (colours, a stat or two, the odd move tweak).
Difficulty (AI reaction time, aggression, block skill, projectile use and enemy
health) scales with how far up the ladder you are, and keeps climbing when the
roster loops.

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

## Stats

`/stats` shows, for the signed-in user:

- an **overall leaderboard** across every game,
- a **per-game leaderboard** (top 10) with your rank and best,
- your own summary — points, games played, and medal counts.

Cross-game ranking can't just sum raw scores, because a tower defense score and
a runner's metre count aren't the same unit — summing them would silently make
one category worth more than the other. Instead each game awards **placement
points**: 100 for 1st, scaling down by where you placed among that game's
players, with a floor of 10 for having played at all. Overall rank is the sum,
so it rewards both placing well and playing broadly.

The formula is `placementPoints()` in [server.js](server.js) if you want to
weight it differently.

## Adding a new game

1. Create `public/games/<game-id>/index.html` (copy an existing game's shell
   from the same category).
2. Add a `config.js` — or write a whole custom game; anything static works.
3. Add an entry to that category's `games` list in
   [public/js/catalog.js](public/js/catalog.js).

That last file is the single source of truth: the hub, the stats page and the
server's score API all read from it, so there's no second list to keep in sync.

## Adding a new category

1. Write an engine in `public/games/engine/` (or skip it if the games are
   one-offs).
2. Add an entry to [public/js/catalog.js](public/js/catalog.js):
   `{ id, name, badge, games: [...] }`. Set `showWave: true` if best scores
   should read "1,234 (wave 5)" rather than just the number. A category with
   an empty `games` array renders its `soon` note instead of a grid.
