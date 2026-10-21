# Last Furnace: Age of Conquest

Age of Conquest is a grand strategy game for phones and browsers. You are one of 600 governors on the Ashen Crown server; the other 599 are simulated, each with its own personality, memory, economy and army, playing by the same rules as you. Ten guilds sign pacts, betray them, form coalitions and wage war over fortresses and the Ember Throne. Build your city, scout through the fog of war, train troops, lead commanders, join or found a guild, call rallies, and win the Age by holding the Throne or building the Grand Exchange. A demonstration campaign, *The Coalition War*, starts on Day 3 with one guild dominating the server.

It looks and plays like the Last Furnace city game it replaces, a mobile strategy game:

- **City**: your town is drawn as an isometric map. Every building stands on its plot with a level plate under it. Tap a building for its sheet (level, effects of the next level, requirements, cost) and **Upgrade**. Builds with 10 game minutes or less left finish **Free**. Full crates float over the farms, mills, quarries, mines and the market every 4 game hours; tap them to collect. Green arrows mark what you can upgrade right now.
- **Chapter goals**: a banner at the bottom shows the current goal, its progress and **Go**, which takes you to the right building or place on the map. **Claim** opens the reward pop-up.
- **World**: a painted map with castles in guild colors, fortresses, camps, fields and armies on the march. Tap a place to attack, scout, gather, reinforce or call a rally.
- **Army, Guild, Mail, History, Ranks**: troops and commanders, guild politics and rallies, battle reports that play out with soldiers, the server's chronicle and the rankings.

The simulated governors get the same conveniences: they collect their crates and finish nearly done builds free too.

Turn your phone sideways for a landscape layout with the tabs on the left.

Architecture, save format, feature checklist, test results, measured performance, limitations and roadmap: [docs/CONQUEST.md](docs/CONQUEST.md).

## Where players get the game

| Link | What it is | Saves |
|---|---|---|
| **https://steelballsdragon.github.io/Super2dragon/** | The public game. Anyone can open it in a phone or computer browser and install it to the home screen (it then also plays offline). | On the player's device |
| **The claude.ai link** (the game's Artifact page) | The same game inside the Claude app. | On the player's device |

Every push to `main` or `claude/last-furnace-game` is tested on GitHub, and only when every test passes is `dist/` published to the `gh-pages` branch, which GitHub Pages serves at the link above.

**Installing it like an app:** open the public link on the phone. On Android the start screen shows an **Install the game** button. On iPhone and iPad tap **Share**, then **Add to Home Screen**. You can also save `dist/index.html` and open it from any folder.

## Saving

The world saves to the device (IndexedDB, compressed) every 20 seconds and whenever the game is closed or hidden, keeps a backup copy every 5 minutes, and never deletes a save it cannot read: a damaged save falls back to the backup, and if every copy is damaged the game says so and offers a new world. While the game is closed the world keeps going at a tenth of normal speed, up to a limit you choose, and a summary greets you when you come back.

## Developer mode

Developer mode is hidden. To turn it on, **tap the logo on the start screen 7 times quickly** (within about a second and a half between taps). The start screen then says *Developer mode is on*, the 16x and 64x speeds appear, and the City gets a **Dev** button (also in the menu). Seven more taps turn it off again. The setting is kept on that device.

The Developer panel has:

- **Unlimited resources**: keeps Food, Wood, Stone, Iron and Gold at 50 million, even right after spending.
- **Instant builds and training**: building, research, training and healing finish the moment they start.
- **Max every building** (Town Hall and every building to level 25), **+100,000 of each troop**, **Every commander at max level**, **Finish all timers**, **Reveal the whole map**, **Seven-day shield** and **50 million of each resource** once.
- **Skip time** by 1 hour, 6 hours or 1 day (the whole server runs through the skipped time).
- **Developer mode off**, which also turns the two switches off.

The simulation refuses every developer command when developer mode is off. Developer mode changes the world it is used in: start a new world first if you want to keep your real one untouched.

## Play it on your computer

1. Open `dist/index.html` in a browser (double-click it, or drag it into a Chrome, Edge, Firefox or Safari window).
2. That's it. If `dist/` is missing, build it first (see below).

## Rebuild after changing the code

You need [Node.js](https://nodejs.org) 22 or newer.

```sh
node build.mjs
```

This writes:

- `dist/index.html` (plus `manifest.webmanifest`, `sw.js` and `icons/`): the complete web app, published to GitHub Pages.
- `index.html` (in the project root): the same game as a page fragment, used when the game is published as a claude.ai Artifact.

Never edit those files by hand: `node build.mjs` overwrites them. Change the files in `src/` instead.

## Tests

Every push runs all five test suites on GitHub (see the Actions tab), and nothing is published unless they pass. To run them yourself:

```sh
npm install                      # installs Playwright
npx playwright install chromium  # the test browser
node build.mjs
node tests/all.mjs
```

- `tests/conquest-engine.mjs` checks the rules and the simulation in Node: the 600-governor and 10-guild invariants, the economy, crates, Free finish, prerequisites, pathfinding, combat counters and replays, fog of war, guild politics, saves, offline time, victory, the developer switches, and that invalid commands are refused.
- `tests/conquest-demo.mjs` runs the Coalition War campaign: a coalition forms against the dominant guild, the war changes the map, and the player's intervention changes the outcome.
- `tests/conquest-ui.mjs` plays the opening of a world through the interface: the start screen, the Tap marker, the building sheet, Free finish, a crate, the chapter banner and its reward, training, an attack from the map and its battle scene, guilds, history and a reload, with the simulation in its worker and on the page, in portrait and landscape.
- `tests/conquest-dev.mjs` checks the hidden 7-tap switch (six taps do nothing, it survives a reload) and every control on the Developer panel.
- `tests/conquest-robust.mjs` damages saves on purpose (the backup loads; with every copy damaged nothing is deleted), blocks storage (the game still plays), and runs two game days at 64x checking that the page stays small and keeps drawing.

## Project layout

```
src/
  template.html          page shell: title, meta tags, fonts, placeholders for the CSS and JS
  conquest/
    data.js, world.js, rules.js, sim.js, ai.js, api.js, bundle.mjs
                         the simulation engine (it runs in a Web Worker, or on the page where workers are blocked)
    ui-core.js           the shell: start screen, saves, top bar, tabs, sheets, toasts, reward pop-ups, the chapter banner
    ui-art.js            every picture, drawn in code: buildings, walls, trees, castles, camps, soldiers
    ui-home.js           the drawn city with its plates, timers, crates, builder and building sheets
    ui-map.js, ui-city.js, ui-army.js, ui-guild.js, ui-battle.js, ui-intel.js, ui-chron.js, ui-misc.js
                         the world map, city panels, army, guilds, battle scenes, reports, history, menu
    ui-dev.js            the hidden developer panel
    ui-guide.js          the welcome and the Tap marker
    ui.css               the look: Last Furnace's navy panels, buttons, plates and banners
public/icons/            app icons for the installable version
public/conquest-logo.webp  the Last Furnace: Age of Conquest artwork (inlined by the build)
build.mjs                puts everything together into index.html and dist/
tests/                   every test suite, all.mjs, the engine benchmark
.github/workflows/       tests every push and publishes the tested build to GitHub Pages
docs/CONQUEST.md         architecture, save format, features, tests, performance, roadmap
```

`node build.mjs --out some/folder` writes the files into another folder.
