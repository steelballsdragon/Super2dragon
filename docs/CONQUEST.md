# Last Furnace: Age of Conquest

Age of Conquest is a grand strategy game in one page. It replaced the Last Furnace city builder (which has been removed) and took over its look and its interactions: navy panels, chunky gold and blue buttons, level plates under buildings, a chapter banner with Go, reward pop-ups, Free finish for nearly done builds, and crates to tap and collect.

- You are one of 600 governors on a server; the other 599 are simulated.
- Each simulated governor has its own personality, memory, economy and army. It makes its own decisions under the same rules and with the same resources as you.
- Ten guilds sign pacts, betray them, form coalitions, fight over passes and holy sites and race for the Ember Throne.
- The world is a kingdom of 384 by 384 tiles laid out like a Rise of Kingdoms kingdom: three zones, ten regions walled by mountains, and 15 passes that a guild must capture to march through.

This document covers what is built, how it works, how to run and test it, what it measured, and what comes next.

**Where it stands:** one fully simulated 600-governor server (Ashen Crown) in the Eternal Conquest mode, plus a demonstration campaign (The Coalition War). This is Phase 1 and Phase 2 of the plan, with parts of Phase 3. The other nine servers and nine modes are not built. The game says so on its title screen and has no buttons for them.

## Play it

1. Open the game: https://steelballsdragon.github.io/Super2dragon/ (or the claude.ai link), or open `dist/index.html` from this repository.
2. The start screen opens straight into Age of Conquest. Tap **Start game** (or **Continue** when there is a world).
3. Pick how to begin:
   - **Eternal Conquest**: Day 1, with everyone else.
   - **Demonstration: The Coalition War**: Day 3. One guild already dominates.
4. Pick a civilization and a name, and found your city. After a one-line welcome, a gold Tap marker points at what to tap for each of the first goals, and the chapter banner at the bottom has **Go**.

### What you see

**Painted art.** The pictures come from art sheets supplied for the game (in `art/sheets/`). A cutting tool (`tools/art/`) finds each object on a sheet, removes the sheet's background (a plain colour, or for the busy sheets a model of the glowing background around each object), softens the outline, and writes 128 transparent WebP sprites (`art/sprites/`, 1.6 MB), each with the foot point it stands on. The build inlines them, so the game is still one file. The pictures that were drawn in code stay as the fallback for anything without a painting and for the moment before the paintings have decoded:
- **City:** the Town Hall in eight stages (from a watchtower to a golden palace), the Farm and the Barracks in four stages each, the Watchtower in three, and one painting each for the Lumber Mill, Quarry, Iron Mine, Market, Warehouse, Stables, Archery Range, Siege Workshop, Academy and Hospital. The City Wall is still drawn in code. A painted LEVEL UP! accent pops over a building that finishes a level.
- **World map:** cities as castles of four sizes with a ring and a banner in their guild's colour, the Capital, passes (gatehouses with gold level pips), sanctums, altars and shrines, three kinds of ruins, bandit camps in three sizes, and the five resource fields (food and iron in two styles).
- **Soldiers:** infantry, cavalry, archers and siege engines walk across the map and fight in the battle scenes with walking, attacking and falling frames.
- **Commanders:** Kael, Amara, Temur, Veyra and Orun have painted portraits. The other seven still use drawn ones.
- **Interface:** painted icons for Food, Wood, Stone, Iron and Gold everywhere they appear, VICTORY and DEFEAT banners in battles, a treasure chest on reward pop-ups.

What is still drawn in code: the terrain, trees, walls, villagers, smoke, the empty plots and the seven other commanders, in each civilization's colors and roof style:
- **Your city** is the home screen: an isometric town where every building stands on its own plot at its real level, from an empty plot with a sign to a towered keep. Walls go from a wooden palisade to stone with towers and a gatehouse. The building under construction wears scaffolding with a swinging hammer and a timer; soldiers drill in the yard in proportion to the troops you have at home; villagers walk the roads; smoke rises from chimneys; green arrows mark what you can upgrade right now; a shield is a dome of light over the town; the light follows the game clock. Every building has a plate with its level (a lock and the Town Hall level it needs when it cannot be built yet). Tap a building for its sheet: a picture, *Lv n > Lv n+1*, the effects of the next level, requirements with checks, the cost, and its own buttons (Train, Research, Trade, Heal, Shield and so on). A builder chip shows Idle, the time left, or Free; side buttons with red dots open Mail, Goals, the Guild, the commanders and, in developer mode, the Developer panel.
- **Free finish and crates** are rules of the simulation, the same for everyone: a build, research, training or healing with 10 game minutes or less left can be finished at once, and each producing building fills a crate every 4 game hours with an hour of its output. The AI governors collect their crates and finish nearly done queues free too.
- **The world map** is the whole kingdom (see below), painted terrain with shores, forests of small trees, mountain peaks with snow, hills, tundra, fords and the paved roads of the passes. Zoomed in, cities are castles that grow with their Town Hall in their guild's color, passes are gatehouses with gold pips for their level, holy sites are sanctums, altars and shrines, the Capital is a gilded keep, and bandit camps, resource fields and ruins have their own pictures. Unexplored land lies under clouds; explored land out of sight is dimmed. Zoomed out, the mountain ranges stand above the clouds and each region is named with its zone, so the shape of the kingdom is always readable. A readout shows the region, zone and coordinates of the middle of the screen; the globe button shows the whole kingdom; the search button lists every pass and holy site with who holds it. Armies march as small banners of soldiers of their main troop type along dashed routes, and battles you can see flash where they happen.
- **Battles** in reports play out: the two armies march in, archers loose arrows, siege engines hurl stones at the walls, soldiers fall exactly as the recorded rounds say, commanders' skills flash up with their portraits, and a Victory or Defeat ribbon shows the loot. The written report, its reasons and the replay check are behind Details.

### The kingdom map

The map follows the structure of a Rise of Kingdoms kingdom, researched from the [Rise Of Kingdoms Map Guide](https://riseofkingdomsguides.com/rise-of-kingdoms-map-guide/), [What Are Zones In Rise Of Kingdoms?](https://riseofkingdomsguides.com/rise-of-kingdoms-zones-guide/) and the [Holy Sites wiki](https://riseofkingdoms.fandom.com/wiki/Holy_Sites):

- **Size.** 384 by 384 tiles (nine times the area of the first 128-tile map). With 600 cities, 600 bandit camps and 1,200 resource fields, cities stand about twice as far apart as before.
- **Three zones, ten regions.** Zone 1 is the outer ring, split into six regions (Frostreach in the north, then Greywatch, Saltmere, Redmarch, Duskwood and Cinderhold clockwise). Every governor and every guild starts there: two guilds in each of the four large corner regions, one in each of the two smaller ones. Zone 2 is a ring of three regions (Emberfall, Ironvale, Ashmoor). Zone 3, the Throne Lands, is the heartland with the Ember Throne in its middle.
- **Mountain ranges and passes.** A range walls every region. The only ways through are 15 passes: six level 1 passes between neighbouring Zone 1 regions, six level 2 passes from each Zone 1 region into the Zone 2 region behind it, and three level 3 passes from Zone 2 into the heartland. A pass is a landmark with a neutral garrison. A guild takes it with a rally from either side; from then on its members, and its allies, march through, and nobody else does. Independents never pass. An army going home may always use any pass.
- **Opening days.** Level 1 passes can be attacked from Day 2, level 2 from Day 3, level 3 from Day 3 at noon, and the Capital from Day 4.
- **Holy sites.** 27 of them: two sanctums and an altar in every Zone 1 region, two shrines in every Zone 2 region, and three gilded shrines in the heartland. Each gives a blessing to every member of the guild that holds it, wherever they are: production, gathering, building, research or healing speed for sanctums; troop attack, defense or health for altars; stronger versions, march speed and gold for shrines. As in the game it copies, the same blessing from two sites counts once. Sanctums open on Day 1, altars on Day 2, Zone 2 shrines on Day 3 and the heartland's on Day 4.
- **Richer toward the centre.** Bandit camps are levels 1 to 4 in Zone 1, 4 to 7 in Zone 2 and 7 to 10 in the heartland; resource fields are levels 1 to 2, 3 to 4 and 5. 18 ruins stand in Zones 1 and 2.
- **Moving the city.** Anywhere in Zone 1; into Zone 2 or the heartland only once your guild holds a pass that leads there.
- **The AI plays the same map.** Governors only aim at camps, fields, cities and landmarks their armies can reach. Guilds take the sanctums and altars of their own region first, then value a pass by the holy sites (and, for the strongest, the Throne) beyond it. In a test world the first holy sites fall on Day 3, passes into Zone 2 on Day 5, and the leading guild holds a level 3 pass and makes the Throne its objective by the end of Day 5.

Time runs at **1 game minute per real second** at 1x (a game day is 24 real minutes). You can pause, or play at 2x or 4x; developer mode adds 16x and 64x. While the game is closed, the world keeps going at a tenth of that speed, up to a limit you choose (12 game hours by default). A summary of what happened greets you when you return.

### Developer mode

Tap the logo on the start screen 7 times quickly to turn it on (7 more turn it off; it is kept on the device). It adds the 16x and 64x speeds and a **Dev** button in the city (also in the menu) that opens the Developer panel: unlimited resources and instant builds and training (two switches saved with the world), max every building, +100,000 of each troop, every commander at max level, finish all timers, reveal the map, a 7-day shield, 50 million of each resource, and time skips. The simulation refuses every developer command when developer mode is off.

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
- **The economy** is settled lazily and exactly. A governor's stock is brought up to date only when the simulation touches it (a decision, a battle, a scout). Production is integrated over the elapsed time with food upkeep, and starvation causes desertion. There is no storage limit: stock grows for as long as production runs. The Warehouse and Logistics research only keep part of it safe from plunder. World events that change production settle the governors they affect at their start and end, so results never depend on when someone looked.
- **Three simulation tiers.** Every governor keeps its full state, and the tier only changes how often it decides:
  - **Active**: within 40 tiles of you, in your guild, or in your guild's wars.
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
- **Pathfinding.** Every tile belongs to a region (or to a range, or to a pass road). A march inside one region is a single A* search (8-way movement, terrain costs, no corner cutting, typed arrays). A march between regions first picks its passes with a small shortest-route search over (pass, side) pairs, using only the passes the guild holds or its allies hold, then runs A* stretch by stretch inside each region, which keeps searches short on the big map. A test on the region graph answers "can this army get there at all?" before any search, and paths are cached per start, goal and set of open passes. Returning armies retrace their outbound path. Cities sit in an occupancy grid and 12 by 12 spatial buckets for neighbor queries.
- **Terrain.** Generated from the world's seed (the same seed always gives the same kingdom): evenly spread noise for elevation, moisture and ridges, so lakes, hills, forests and tundra keep steady shares; rivers run downhill with fords; the ranges follow the zone and region borders, bent by low-frequency noise so they wind; the land on both sides of every pass is cleared; and inside each region every pocket of land is either joined to the rest by a trail or a ford, or filled in. The tests check that every pass joins exactly its two regions and nothing else does.
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
                 identity, the kingdom's regions, pass levels, holy sites and their blessings
  world.js       random numbers, the kingdom layout (zones, regions, ranges, passes), terrain generation,
                 pass-aware pathfinding, occupancy and spatial buckets, vision
  rules.js       bonuses, production, protected stock, upkeep, power, army strength, the battle resolver, scout accuracy
  sim.js         world creation, the clock, queues, marches, battles, rallies, landmarks, territory, events,
                 the chronicle, the Age, the Coalition War scenario
  ai.js          governor decisions, guild planning, diplomacy, coalitions, succession, collapse and refounding
  api.js         validated actions, player commands, fog-of-war views, saves and checks, the server loop
  bundle.mjs     joins the engine files into one script (for the page, its Web Worker and the Node tests)
  ui-core.js     interface shell: host (worker or page), saves, developer mode switch, start and new-world screens,
                 top bar, tabs, sheets, toasts, reward pop-ups, the chapter banner and its Go
  ui-art.js      every picture: isometric buildings per civilization, walls, trees, castles, camps, fields, soldiers
  ui-home.js     the drawn city (home screen): buildings, walls, troops, villagers; plates, timers, crates, upgrade
                 arrows, the builder and side buttons over it; the building sheet
  ui-map.js      the world map (canvas): the kingdom painted in chunks, the zoomed-out view with its ranges and
                 region names, territory, clouds, castles, passes, holy sites, camps, armies, battles; the Find
                 list; tile actions
  ui-city.js     city panels: every building, research, market, the Grand Exchange, goals, the shield
  ui-army.js     troops, training (and the training sheet), hospital, armies in the field, commanders, marches
  ui-guild.js    guilds, applying, rallies, members, contributions, diplomacy
  ui-battle.js   the battle scene played from a report's recorded rounds
  ui-intel.js    reports, battle details and replay checks
  ui-chron.js    chronicle, maps of past territory, power over time, casualties, rankings, server population
  ui-misc.js     inspector, menu and settings, the six-page How to play, the offline summary
  ui-dev.js      the Developer panel
  ui-guide.js    the welcome and the Tap marker for the first goals
  ui.css         the look of Last Furnace: navy panels, chunky type, gold, blue and green buttons, plates, banners
public/conquest-logo.webp   the Last Furnace: Age of Conquest artwork (inlined by the build)
tests/conquest-engine.mjs   engine tests (Node)
tests/conquest-demo.mjs     the Coalition War campaign test (Node)
tests/conquest-ui.mjs       interface test (Chromium)
tests/conquest-dev.mjs      developer mode test (Chromium)
tests/conquest-robust.mjs   damaged saves, blocked storage and a long run (Chromium)
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

**Wrapper:** `{ format: "age-of-conquest", v: 2, check: <FNV-1a hash of body>, body: "<world as JSON text>" }`. Schema 2 is the kingdom map. A schema 1 save (the old 128-tile map) is refused with an explanation, and the save itself is left untouched until you start a new world.

To load, the save must:
- have a matching checksum
- not come from a newer version
- pass `validateWorld()`, which checks:
  - exactly 600 governors and 10 guilds, no guild over 60, and governors and guilds agreeing on membership
  - leaders are members
  - stock is finite and never negative, troop counts are whole and never negative
  - troops away from home match the armies in the field
  - building and research levels are within their caps
  - no two cities share a tile and no city is on impassable land, a mountain range or a pass road
  - exactly one human governor

**World:**

| Field | Meaning |
|---|---|
| `v`, `seed`, `rs` | schema version; map seed; random-number state |
| `t`, `age`, `lastDay` | game minutes since the server opened; the current Age |
| `govs[600]` | governors (below); index = id; the player is id 599 |
| `guilds[10]` | guilds (below) |
| `marks` | the Capital, 15 passes, 27 holy sites, 18 ruins: `{ id, kind (capital, pass, site, ruin), name, x, y, region, opens, owner, since, level (garrison level), garrison, base, wallDur, wallMax, lastHit, cleared }`; passes add `gate, tier, links` (the two regions), holy sites add `site` (sanctum, altar, shrine, temple) and `blessing` |
| `camps`, `nodes` | bandit camps `{ id, x, y, lv, troops, reserved?, until? }`; resource fields `{ id, x, y, res, lv, amount, max, by }` |
| `marches` | armies in the field `{ id, kind, owner, troops, c1, c2, path, k, frac, speed, to, target, state, eta, load, wounded, rally, parts }` (paths stored as a start tile plus one letter per step) |
| `rallies` | `{ id, leader, guild, target, to, launchAt, state, lead }` |
| `events` | active world events `{ kind, name, res, mult, region, start, end }` |
| `chron`, `chronN` | chronicle entries `{ n, t, k, txt, g, p, x, y, imp, vis }` (public, or secret pacts) |
| `battles` | the last 200 battle summaries |
| `reports` | the player's last 60 reports, battle reports with their replay input |
| `hist` | daily territory maps (32 by 32 cells of 12 by 12 tiles) and guild power, last 40 days |
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
| World map | Done | a 384 by 384 kingdom in the Rise of Kingdoms layout: 3 zones, 10 regions walled by mountain ranges, 15 passes in 3 levels, 27 holy sites with blessings, the Capital, 18 ruins, 600 bandit camps and 1,200 resource fields that grow stronger toward the centre; lakes, rivers with fords, forests, hills, tundra; chunked painting, a whole-kingdom view with region names, clouds over unexplored land, a Find list, pan and pinch zoom; territory overlay with drawn borders |
| City building and economy | Done | 15 buildings to level 25 with costs, times and prerequisites; production with no storage limit, food upkeep, desertion when food runs out, stock protected from plunder |
| Resources | Partial | food, wood, stone, iron, gold. Influence, rare materials and taxation are planned |
| Research | Done | 16 technologies in three branches (economy, military doctrine, intelligence), capped by the Academy, with prerequisites |
| Troops | Done | infantry, cavalry, archers, siege; training in any number the stock pays for (the time grows with the number), upkeep, wounded, healing, a hospital limit, morale. Experience is held by commanders, not troops |
| Commanders | Partial | 12 fully implemented: rarity, story, civilization, specialty, active skill, two passives, ultimate (level 30), 3-branch talents, skill levels, pairings and synergies, rivals, recruitment goals for player and AI alike, City Steward and Defender roles. Equipment and the other 28 commanders are planned |
| Civilizations | Partial | 12, each with bonuses, real costs, a troop variant, a starting commander, preferred terrain, colors and city style, and lore. Culture, stability, reforms and cultural exchange are planned |
| Combat | Done | rounds, counters, terrain, walls, towers, durability, morale, routs, pursuit, ambushes in forests, commander skills; deterministic, replayable, explained |
| Sieges, rallies, garrisons, reinforcement | Done | rallies on passes, holy sites, the Capital and cities; joiners; garrisons hold landmarks; unguarded landmarks are lost; landmarks open on set days; sacked cities move behind a shield |
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
| Achievements, goals, rankings | Done | 13 guided goals in 4 chapters with progress and Go, 10 achievements, rankings of governors, warriors and guilds, and the server's real population |
| Inspector | Done | public facts for anyone; personality, goals, reasons, memories and troops only with a scout report under 6 hours old, or for guild mates |
| Offline progress | Done | simulated on load at a tenth of play speed, capped (0, 6 or 12 hours, 1 or 3 days), then summarized |
| Saves, backups, migrations, validation | Done | IndexedDB with gzip, a backup every 5 minutes, checksum, schema version with a migration hook, integrity checks |
| Notifications, accessibility | Done | three notification levels, large text, reduced motion, keyboard map controls, labels on every control, portrait and landscape layouts |
| Pictures instead of text | Done | the drawn city as the home screen, the painted world map with castles and marching armies, battle scenes, icon-based sheets, a Tap marker instead of a written guide |
| Last Furnace look and interactions | Done | its design system, level plates, builder chip, side buttons with red dots, chapter banner with Go and Claim, reward pop-ups, building sheets with effects and requirements, Free finish and crates (simulation rules shared with the AI) |
| Developer mode | Done | 7 taps on the start screen logo; unlimited resources and instant switches saved with the world; max buildings, troops, commanders, timers, map, shield, resources, time skips; refused by the simulation outside developer mode |
| Spectator, sandbox, editor, ironman, seasons, tournaments | Planned | |

## Test results

Run on 2026-10-21 in this repository (`node tests/all.mjs`):

| Suite | Result |
|---|---|
| conquest-engine | 51 of 51 passed |
| conquest-demo | 5 of 5 passed |
| conquest-ui | 17 of 17 passed |
| conquest-dev | 10 of 10 passed |
| conquest-robust | 6 of 6 passed (two game days at 64x: at most 751 DOM nodes, a 26 MB page heap with the paintings loaded, the town still drawing in under 4 ms a frame) |

All five suites together take about 4 minutes.

The engine suite covers:
- production with no storage limit, protected stock and upkeep, building and research prerequisites, training and healing, the market
- pathfinding, travel time and scouting
- the kingdom: 10 regions in 3 zones, 15 passes of the right levels joining the right regions, nothing crossing a range without a pass, each pass reachable from both sides; only the holding guild and its allies march through; holy-site blessings (and the same blessing twice counting once); opening days; camps stronger toward the centre
- replay determinism, counters, numbers, terrain and walls, commander skills, explanations
- fog of war in the views, the inspector's secrecy, report accuracy, and the AI scouting before attacking
- guild limits, succession, war, peace and betrayal, collapse and refounding
- memory surviving saves, no negative stock for anyone
- sacking and recovery, the Throne and Grand Exchange victories, rallies capturing holy sites
- invalid and malicious commands, guild-mate and ally protection, double reward claims, developer gating
- save tampering, refusing old-map saves with a reason, determinism, save and load continuity, offline catch-up, and a speed check (one game day in under 20 seconds)
- Free finish (refused too early, works in the last 10 minutes), crates (an hour of output once, refilled after 4 hours, even into a very large stock), the AI using both, goal progress and chapters, and the developer switches (only in developer mode, saved with the world)

The demonstration campaign test:
- An AI guild starts with 34% of the server's power, the level 1 passes out of its region and 5 holy sites (its own region's and a sanctum in each neighbouring region).
- A four-guild coalition forms against it.
- In 36 hours, 16 landmarks change hands and over 7,000 tiles of territory move.
- In a copy of the same world where you join a coalition guild of your region and call a rally, guild mates join you and you take a holy site back. Without you, the hegemon still holds it.

## Measured performance

Measured with `tests/conquest-bench.mjs` on the build machine. Raw numbers are in [conquest-bench.json](conquest-bench.json); phones will be slower.

| Measure | Result |
|---|---|
| Size of the game | 2.9 MB in one file (the 128 paintings are 1.6 MB of WebP, inlined as text); the drawn-only version was 0.8 MB |
| Generate the kingdom's terrain | 157 ms in Node (the interface does it once per world, on the loading screen) |
| Create a world (600 governors, map, history) | 144 ms in Node including the terrain, 372 ms to the first frame in Chromium |
| Simulation cost per game minute, full server | 1.8 ms on day 1, 2.1 ms on day 3, 2.8 ms on day 7 (about 870 armies in the field) |
| Throughput | 350 to 540 game minutes per second in Node; the browser worker sustains the 64x developer speed (63 game minutes per second). At 1x the simulation uses well under 1% of one core |
| Offline catch-up | one game day in 3.5 s (12 game hours by default, about 1.8 s) |
| Memory | about 33 MB of JavaScript heap in Node after 8 game days, most of it the big map's typed arrays and the path cache (browser page: 11 MB, the worker holds the world) |
| Save size after 8 days | 3.2 MB of JSON, 433 KB gzipped (what is stored) |
| Save and load | 41 ms and 128 ms (load includes regenerating the kingdom's terrain and the integrity checks) |
| Command round trip, page to worker and back | 0.3 ms |
| Path search | 1.2 ms on average for a 242-tile march between two random cities with every pass open (most cross several regions) |
| Drawing the city | 1.5 ms per frame (median; 2.2 ms at the 95th percentile zoomed out) with Town Hall 25 and every building, on a 390 by 844 screen at 3x density in headless Chromium; the town redraws at about 30 frames a second while it is on screen |
| Drawing the world map | terrain is painted in chunks of 32 by 32 tiles (16 pixels per tile) as they come into view, at most 4 a frame and 48 kept; a 4-pixels-per-tile painting of the whole kingdom stands in when zoomed out. In headless Chromium on a phone-sized screen a frame takes under 1 ms of script at every zoom, up to about 4 ms fully zoomed in |

6,000 governors (ten servers) has not been measured, so this document makes no claim about it. At the measured cost, ten servers would need roughly ten times the CPU at 1x, which looks feasible on a desktop, but that is an estimate, not a result.

## Known limitations

- One server, one mode, and a demonstration campaign. Cross-server features, the other modes, the sandbox, the spectator view and the scenario editor are not built.
- The kingdom copies the shape of a Rise of Kingdoms kingdom (zones, regions, passes, holy sites), not all of its systems: there are no alliance flags or player-built fortresses (territory comes from cities and landmarks), no teleport items, and no Lost Kingdom. An army already marching keeps going through a pass that changes hands on the way; new marches respect the new owner.
- Rally battles use the rally leader's bonuses (civilization, research, commanders) for the whole army; joiners contribute troops, not bonuses.
- Battles are fought by army totals over rounds, not by units on a battlefield. The battle scene animates those rounds with representative soldiers (up to 34 a side), so a figure is a share of the army, not one unit.
- The paintings were cut from flat art sheets, so they have no separate animation layers (soldiers have 3 to 6 frames per action; buildings do not move). The terrain, trees, walls and seven commanders are still drawn in code. The city's buildings are paintings of different sizes placed on square plots, so large Town Hall stages overlap the plots behind them. There is no sound.
- There is no shop, no gems and no speed-up items: Free finish (10 game minutes) is the only way to hurry, and it is the same for the AI. The Last Furnace city game's heroes, stages, shop and events went with it.
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
