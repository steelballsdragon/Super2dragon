# Last Furnace: Age of Conquest

Age of Conquest is a grand strategy game that lives next to the Last Furnace city builder in the same page.

- You are one of 600 governors on a server; the other 599 are simulated.
- Each simulated governor has its own personality, memory, economy and army. It makes its own decisions under the same rules and with the same resources as you.
- Ten guilds sign pacts, betray them, form coalitions, fight over fortresses and race for the Ember Throne.

This document covers what is built, how it works, how to run and test it, what it measured, and what comes next.

**Where it stands:** one fully simulated 600-governor server (Ashen Crown) in the Eternal Conquest mode, plus a demonstration campaign (The Coalition War). This is Phase 1 and Phase 2 of the plan, with parts of Phase 3. The other nine servers and nine modes are not built. The game says so on its title screen and has no buttons for them.

## Play it

1. Open the game: https://steelballsdragon.github.io/Super2dragon/ (or the claude.ai link), or open `dist/index.html` from this repository.
2. On the start screen, tap **Age of Conquest**.
3. Choose **New world**, then pick how to begin:
   - **Eternal Conquest**: Day 1, with everyone else.
   - **Demonstration: The Coalition War**: Day 3. One guild already dominates.
4. Pick a civilization and a name, and found your city. A six-page guide explains the rest, and the goals banner leads the first steps.

Time runs at **1 game minute per real second** at 1x (a game day is 24 real minutes). You can pause, or play at 2x or 4x; developer mode adds 16x and 64x. While the game is closed, the world keeps going at a tenth of that speed, up to a limit you choose (12 game hours by default). A summary of what happened greets you when you return.

### Developer mode

Developer mode is the same switch as in the city game: tap the Last Furnace logo on the start screen 7 times. In Age of Conquest it adds:
- 16x and 64x speeds
- in the menu: 50 million of each resource, +100,000 troops, finish timers, max buildings, every commander at max level, reveal the map, a 7-day shield, and time skips

## Architecture, and why

The specification suggested TypeScript, React, PostgreSQL, a server API and WebSockets, and allowed simpler choices where they are more reliable. This is a single-player game in an AI world, so the authoritative "server" does not need to be a machine on the internet. It is the simulation, running in a Web Worker on the player's device:

```
 interface (page)                      simulation (Web Worker, or the page as a fallback)
 ----------------                      --------------------------------------------------
 map canvas, screens, sheets  --cmd--> playerCommand(): validates, applies, answers
                              <-frame- frameView(): only what the player has discovered (5 per second)
                              --query> inspect / guild / report / replay / chronicle / rankings ...
 IndexedDB (gzip) <---- save -------- serialize(): checksummed, versioned JSON (every 20 s and on hide)
```

Why this design:

- **No server to pay for, scale or keep alive.** The game works offline, installs to the home screen and runs inside the claude.ai artifact. Earlier you asked for no shutdowns; nothing here can shut down.
- **The rules are authoritative.** The interface can only send commands. Every command is validated by the same functions the AI uses (`buildCheck`, `startMarch`, `actTrade` and the rest), so the player and the AI play by identical rules. Invalid commands, duplicate rewards and malformed input are refused; the tests try 30 such commands. Saves carry a checksum and must pass integrity checks to load.
- **Deterministic.** All randomness comes from a seeded generator whose state is part of the world. Terrain is regenerated from the seed. Each battle gets its own seed, and a report's replay re-runs the battle from its stored input. Two runs from the same seed produce identical worlds, and a world saved and reloaded mid-run continues exactly as if it had never been saved. Both are tested.
- **Plain JavaScript, no dependencies.** This matches the existing project. `node build.mjs` writes the playable files, and the same engine source loads in Node for the tests.
- **No language-model calls.** Routine AI uses local utility scoring, a small state machine and scheduled guild planning. Decisions are explained with reasons generated from the actual decision inputs. Language-model narration could be added later (the artifact platform offers it), but nothing depends on it.

### Simulation design

- **The clock.** The world advances in game minutes. Each minute it processes queues (buildings, research, training, healing, the Grand Exchange), moves armies, launches rallies, lets governors and guilds whose turn has come decide, and runs world events and the Throne check. Every 30 minutes power and rankings are recomputed. Every hour territory is recomputed and camps respawn. Each day it saves history snapshots and collects guild contributions. Offline catch-up runs in 5-minute steps.
- **The economy** is settled lazily and exactly. A governor's stock is brought up to date only when the simulation touches it (a decision, a battle, a scout). Production is integrated over the elapsed time with storage caps and food upkeep, and starvation causes desertion. World events that change production settle the governors they affect at their start and end, so results never depend on when someone looked.
- **Three simulation tiers.** Every governor keeps its full state, and the tier only changes how often it decides:
  - **Active**: within 28 tiles of you, in your guild, or in your guild's wars.
  - **Strategic**: at war elsewhere.
  - **Background**: quiet regions; decides 1.7 times less often.

  Decision frequency also depends on each governor's activity trait: from every 8 game minutes (very active players) to every 75 (casual builders). Events wake governors early: an army entering their watch range, a scout spotted, a guild rally called, a war declared. The Server page in Rankings shows the live tier counts.
- **Fairness.**
  - The AI pays for everything from its own stock, the same as you.
  - It knows only the cities inside its explored radius, the governors in its memory, and scout reports (its own or its guild mates') younger than 2 to 12 game hours, depending on how bold it is. Without such a report it scouts first, and the tests check that no AI attack happened without one.
  - Weaker judges misread reports and attack when they should not.
  - Honorable governors do not prey on much weaker cities without a war or a grudge.
  - Raids must be worth the march.
  - Newcomers get a 2-day shield and three camps of their own.
- **Pathfinding.** A* runs over the 128 by 128 tile grid with 8-way movement, terrain costs, no corner cutting, typed arrays and a path cache. Returning armies retrace their outbound path. Cities sit in an occupancy grid and 8 by 8 spatial buckets for neighbor queries.
- **Combat.** Battles resolve in rounds and are deterministic. They model:
  - attack, defense and health per unit, the counter triangle (30% each way), and siege engines that break walls
  - terrain: plains, forest, hills, fords and passes
  - walls with towers and durability, and morale with routs, pursuit and chasing
  - commander skills on a rage meter, passives, ultimates from level 30, talents, synergies between paired commanders, civilization variants and research
  - wounded troops sent to the hospital

  Every report lists the casualties, the reasons in plain words (numbers, counters, terrain, walls, skills, morale) and a round-by-round replay. The interface asks the engine to re-run the battle and shows whether the result matched.

## Files

```
src/conquest/
  data.js        tables: units, terrain, buildings, research, 12 civilizations, 12 commanders, archetypes, the server
  world.js       random numbers, terrain generation, A*, occupancy and spatial buckets, vision
  rules.js       bonuses, production, storage, upkeep, power, army strength, the battle resolver, scout accuracy
  sim.js         world creation, the clock, queues, marches, battles, rallies, landmarks, territory, events,
                 the chronicle, the Age, the Coalition War scenario
  ai.js          governor decisions, guild planning, diplomacy, coalitions, succession, collapse and refounding
  api.js         validated actions, player commands, fog-of-war views, saves and checks, the server loop
  bundle.mjs     joins the engine files into one script (for the page, its Web Worker and the Node tests)
  ui-core.js     interface shell: host (worker or page), saves, title and new-world screens, sheets, toasts
  ui-map.js      the world map (canvas): terrain, territory, fog, cities, armies; tile actions
  ui-city.js     city: buildings, research, market, the Grand Exchange, goals
  ui-army.js     troops, training, hospital, armies in the field, commanders, the march sheet
  ui-guild.js    guilds, applying, rallies, members, contributions, diplomacy
  ui-intel.js    reports and battle replays
  ui-chron.js    chronicle, maps of past territory, power over time, casualties, rankings, server population
  ui-misc.js     inspector, menu and settings, developer tools, guide, the offline summary
  ui.css         the look: charcoal stone, molten gold, lava, crimson and royal blue (from the artwork)
public/conquest-logo.webp   the Last Furnace: Age of Conquest artwork (inlined by the build)
tests/conquest-engine.mjs   engine tests (Node)
tests/conquest-demo.mjs     the Coalition War campaign test (Node)
tests/conquest-ui.mjs       interface test (Chromium)
tests/conquest-bench.mjs    benchmark, writes docs/conquest-bench.json
```

## Run, build, test

```sh
node build.mjs                        # writes index.html (claude.ai) and dist/ (web app)
open dist/index.html                  # or double-click it
npm install && npx playwright install chromium
node tests/all.mjs                    # every suite (Last Furnace and Age of Conquest)
node tests/conquest-engine.mjs        # just the engine
node --expose-gc tests/conquest-bench.mjs   # measure this machine
```

Every push runs all suites on GitHub. The game is published only when they all pass.

## Save format (the "database schema")

The world is one JSON document. IndexedDB stores it gzipped under `last-furnace-conquest` (keys `main` and `backup`); browser storage is the fallback. A trimmed real example is in [conquest-sample.json](conquest-sample.json).

**Wrapper:** `{ format: "age-of-conquest", v: 1, check: <FNV-1a hash of body>, body: "<world as JSON text>" }`.

To load, the save must:
- have a matching checksum
- not come from a newer version
- pass `validateWorld()`, which checks:
  - exactly 600 governors and 10 guilds, no guild over 60, and governors and guilds agreeing on membership
  - leaders are members
  - stock is finite and never negative, troop counts are whole and never negative
  - troops away from home match the armies in the field
  - building and research levels are within their caps
  - no two cities share a tile and no city is on impassable land
  - exactly one human governor

**World:**

| Field | Meaning |
|---|---|
| `v`, `seed`, `rs` | schema version; map seed; random-number state |
| `t`, `age`, `lastDay` | game minutes since the server opened; the current Age |
| `govs[600]` | governors (below); index = id; the player is id 599 |
| `guilds[10]` | guilds (below) |
| `marks` | the Capital, 8 fortresses, 6 ruins: `{ id, kind, name, x, y, owner, since, level, garrison, base, wallDur, wallMax, lastHit, cleared }` |
| `camps`, `nodes` | bandit camps `{ id, x, y, lv, troops, reserved?, until? }`; resource fields `{ id, x, y, res, lv, amount, max, by }` |
| `marches` | armies in the field `{ id, kind, owner, troops, c1, c2, path, k, frac, speed, to, target, state, eta, load, wounded, rally, parts }` (paths stored as a start tile plus one letter per step) |
| `rallies` | `{ id, leader, guild, target, to, launchAt, state, lead }` |
| `events` | active world events `{ kind, name, res, mult, region, start, end }` |
| `chron`, `chronN` | chronicle entries `{ n, t, k, txt, g, p, x, y, imp, vis }` (public, or secret pacts) |
| `battles` | the last 200 battle summaries |
| `reports` | the player's last 60 reports, battle reports with their replay input |
| `hist` | daily territory maps (32 by 32 cells) and guild power, last 40 days |
| `market`, `throne`, `ages` | resource prices; who holds the Capital and since when; finished Ages and their winners |
| `settings`, `quests`, `exploredRle` | offline cap and notifications; claimed goals; the player's explored map |

**Governor:**
- identity: `name, civ, arch` (archetype), `t` (ten traits from 0 to 1: aggression, risk, economy focus, loyalty, patience, skill, diplomacy, honor, activity, ambition), `bg` (background), `x, y`
- guild: `guild, role, joined`
- city: `b` (building levels), `res`, `at` (last settled), `troops, away, wounded`, `tech`, `cmds` (commanders `{ lv, xp, sk[4], tal }`), `steward, defender`, `q` (queues)
- defense: `shield, shieldCd, wallDur`
- record: `stats` (wins, defenses, camps, scouts, rallies, trading, healing, troops trained, kills, sacks and more)
- what it knows and feels: `intel` (scout reports), `rel` (feelings about up to 18 governors), `mem` (up to 12 memories), `log` (its last 6 decisions with reasons and who may see them)
- planning: `st` (grow, raid, war, defend or rebuild), `next` (next decision), `explore` (known radius), `alert`, `lastAttack`

**Guild:**
- identity: `name, tag, color, emblem, founded, home, civ`
- people: `leader, officers, members`, `rule` (succession: strongest, election or heir), `heir`
- plans: `policy` (`{ stance, target, objective, why }`)
- shared assets: `treasury`, `tech` (granary, banners, bulwark)
- diplomacy: `rel[10]`, `treaties` (`{ k: war | nap | alliance | truce, since, until, secret }`), `cred` (credibility), `warScore`
- record: `stats`, `proposals, applicants`, `collapsed, refoundAt`

## Feature checklist

Legend: **Done** = implemented and tested; **Partial** = a working subset; **Planned** = not built yet (and nothing in the game pretends otherwise).

| Area | Status | What exists |
|---|---|---|
| One 600-governor server, exactly 10 guilds (60 max) | Done | 599 simulated plus you; invariants checked on every load and in tests, including after 5 simulated days |
| Ten servers, 6,000 governors, cross-server play | Planned | the engine is server-agnostic (identity in `SERVER`); not built or measured |
| Game modes | Partial | Eternal Conquest, and the Coalition War demonstration campaign. The other nine modes are planned |
| World map | Done | 128 by 128 tiles: lakes, rivers with fords, mountain ranges with passes, forests, hills, tundra; the Capital, 8 fortresses, 6 ruins, about 80 bandit camps, 260 resource fields; pan and pinch zoom; territory overlay |
| City building and economy | Done | 15 buildings to level 25 with costs, times and prerequisites; production, storage caps, food upkeep, desertion when food runs out, protected stock |
| Resources | Partial | food, wood, stone, iron, gold. Influence, rare materials and taxation are planned |
| Research | Done | 16 technologies in three branches (economy, military doctrine, intelligence), capped by the Academy, with prerequisites |
| Troops | Done | infantry, cavalry, archers, siege; training batches, upkeep, wounded, healing, a hospital limit, morale. Experience is held by commanders, not troops |
| Commanders | Partial | 12 fully implemented: rarity, story, civilization, specialty, active skill, two passives, ultimate (level 30), 3-branch talents, skill levels, pairings and synergies, rivals, recruitment goals for player and AI alike, City Steward and Defender roles. Equipment and the other 28 commanders are planned |
| Civilizations | Partial | 12, each with bonuses, real costs, a troop variant, a starting commander, preferred terrain, colors and city style, and lore. Culture, stability, reforms and cultural exchange are planned |
| Combat | Done | rounds, counters, terrain, walls, towers, durability, morale, routs, pursuit, ambushes in forests, commander skills; deterministic, replayable, explained |
| Sieges, rallies, garrisons, reinforcement | Done | rallies on fortresses, the Capital and cities; joiners; garrisons hold landmarks; unguarded landmarks are lost; sacked cities move behind a shield |
| Splitting and merging armies, march queues | Partial | several armies at once (more with a higher Town Hall), recall, rallies merge armies; free splitting of an army in the field is planned |
| Supply lines, fatigue, weather in combat | Planned | weather affects production through world events |
| Scouting and fog of war | Done | explored and visible tiles; reports are estimates whose error depends on accuracy and age; counterintelligence can plant false reports, which skilled scouts flag; the AI respects fog too |
| Espionage beyond scouting | Partial | false reports, and scouting a guild leader reveals that guild's secret pacts. Spies, sabotage and plan theft are planned |
| Exploration | Partial | ruins guarded by wardens, with treasures and commander experience; scouts explore unknown land. Relics and expeditions are planned |
| AI governors | Done | 13 archetypes; personal traits; utility choices for building, research, training, healing and trade; a war and defense state machine; scouting before attacks; misjudgment; grudges and memories; decision log with reasons; adapts after defeats (defend, rebuild, revenge) |
| Guilds and politics | Done | leaders, officers, members, applications, recruiting, invitations, contributions, guild technology, objectives and rallies coordinated by leaders; three succession rules, elections, coups, splinters, defections, expulsion, collapse and refounding (always 10 guild identities) |
| Diplomacy | Done | war, peace with a truce, non-aggression pacts (some secret), alliances with calls to arms, betrayal and credibility, coalitions against a guild over 28% of power; the player decides all of it when leading a guild |
| Trade | Partial | a market with server-wide prices and fees. Caravans, routes, loans, sanctions and tribute are planned |
| World events | Partial | harsh winter, drought, forest fires, trade booms, bandit uprisings, rich veins (regional, with civilization and commander immunities). Plague, civil wars and others are planned |
| Chronicle and history | Done | over 30 kinds of entries, filters, maps of territory by day, guild power over time, casualty records, each governor's and guild's history |
| Victory and defeat | Done | win the Age by holding the Ember Throne for 3 days or completing the Grand Exchange (an economic victory the AI also pursues). Lose when a rival does; a new Age begins. A sacked city recovers |
| Achievements, goals, rankings | Done | 13 guided goals, 10 achievements, rankings of governors, warriors and guilds, and the server's real population |
| Inspector | Done | public facts for anyone; personality, goals, reasons, memories and troops only with a scout report under 6 hours old, or for guild mates |
| Offline progress | Done | simulated on load at a tenth of play speed, capped (0, 6 or 12 hours, 1 or 3 days), then summarized |
| Saves, backups, migrations, validation | Done | IndexedDB with gzip, a backup every 5 minutes, checksum, schema version with a migration hook, integrity checks |
| Notifications, accessibility | Done | three notification levels, large text, reduced motion, keyboard map controls, labels on every control, portrait and landscape layouts |
| Spectator, sandbox, editor, ironman, seasons, tournaments | Planned | |

## Test results

Run on 2026-10-21 in this repository (`node tests/all.mjs`):

| Suite | Result |
|---|---|
| conquest-engine | 42 of 42 passed |
| conquest-demo | 5 of 5 passed |
| conquest-ui | 15 of 15 passed |
| smoke, cloud, dev, soak (Last Furnace) | 20, 8, 13 and 7 of 7 steps passed |

The engine suite covers:
- production, storage and upkeep, building and research prerequisites, training and healing, the market
- pathfinding, travel time and scouting
- replay determinism, counters, numbers, terrain and walls, commander skills, explanations
- fog of war in the views, the inspector's secrecy, report accuracy, and the AI scouting before attacking
- guild limits, succession, war, peace and betrayal, collapse and refounding
- memory surviving saves, no negative stock for anyone
- sacking and recovery, the Throne and Grand Exchange victories, rallies capturing fortresses
- invalid and malicious commands, guild-mate and ally protection, double reward claims, developer gating
- save tampering, determinism, save and load continuity, offline catch-up, and a speed check (one game day in under 20 seconds)

The demonstration campaign test:
- An AI guild starts with 33% of the server's power.
- A four-guild coalition forms against it.
- In 36 hours, 7 landmarks change hands and over 3,000 tiles of territory move.
- In a copy of the same world where you join the coalition and call a rally, guild mates join you and you take a fortress. Without you, the hegemon still holds it.

## Measured performance

Measured with `tests/conquest-bench.mjs` on the build machine. Raw numbers are in [conquest-bench.json](conquest-bench.json); phones will be slower.

| Measure | Result |
|---|---|
| Create a world (600 governors, map, history) | about 40 ms in Node once warm (about 150 ms the first time), 166 ms to the first frame in Chromium |
| Simulation cost per game minute, full server | 2.1 ms on day 1, 3.3 ms on day 3, 4.8 ms on day 7 (about 1,100 armies in the field) |
| Throughput | 200 to 470 game minutes per second in Node; the browser worker sustains the 64x developer speed (63 game minutes per second). At 1x the simulation uses well under 1% of one core |
| Offline catch-up | one game day in 5.3 s (12 game hours by default, about 2.7 s) |
| Memory | about 10 MB of JavaScript heap for the world after 8 game days (browser: 10 MB) |
| Save size after 8 days | 3.5 MB of JSON, 479 KB gzipped (what is stored) |
| Save and load | 43 ms and 48 ms (load includes regenerating the map and the integrity checks) |
| Command round trip, page to worker and back | 0.1 to 0.2 ms |
| Path search | 0.5 ms for an 87-tile path across the map |

6,000 governors (ten servers) has not been measured, so this document makes no claim about it. At the measured cost, ten servers would need roughly ten times the CPU at 1x, which looks feasible on a desktop, but that is an estimate, not a result.

## Known limitations

- One server, one mode, and a demonstration campaign. Cross-server features, the other modes, the sandbox, the spectator view and the scenario editor are not built.
- Rally battles use the rally leader's bonuses (civilization, research, commanders) for the whole army; joiners contribute troops, not bonuses.
- Battles are fought by army totals over rounds, not by units on a battlefield. The "tactical view" is the round-by-round replay.
- No supply lines, fatigue or combat weather; no equipment; no caravans, loans, tribute or sanctions; no spies or sabotage beyond false reports and discovering secret pacts.
- Culture, stability, public order and civilization reforms are not modeled.
- Offline time runs at a tenth of play speed and is capped. Long caps take several seconds to catch up on slower phones.
- Saves grow by roughly 60 KB (gzipped) per game day. Very long worlds will need history pruning beyond what is already done (chronicle 1,600 entries, 200 battles, 60 reports, 40 days of maps).
- The AI is tuned for a lively world, not for a fixed difficulty level. There is no difficulty setting yet.
- Determinism is guaranteed for the same engine build. Different browsers use the same IEEE floating point, so results match in practice, but this is not tested across browser engines.

## Roadmap (next, in order)

1. **Phase 3 completion.** Supply lines and march fatigue; spies and counterintelligence operations; caravans and trade routes with escorts and bandits; culture and stability with civilization reforms; commander equipment; more commanders (toward 40).
2. **Phase 4.** Last Stand (weak start, fair but dangerous neighbors) and Champion's Arena (commander duels and challenge battles on separate balance), each with its own victory and failure conditions and tests. Then difficulty settings.
3. **Phase 5.** The other nine servers. Each is a `SERVER` identity (map tendencies, personalities, starting politics) on the same engine, running in the background at coarse detail when you are elsewhere. Then measure ten servers, add global rankings, migration rules, cross-server wars and the Emperor of the World campaign.
4. **Phases 6 and 7.** The remaining modes, the sandbox, spectator tools, the scenario editor, sound, richer art, and mobile performance work.
