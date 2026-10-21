# Last Furnace

Last Furnace is a city builder for phones and browsers. The world has frozen over. You keep a great furnace burning, build a town around it, put survivors to work, recruit heroes, train troops and push your squad down the frozen road.

It plays like a mobile strategy game:

- **City**: tap buildings to upgrade them, tap the bubbles over the mines and huts to collect what they made, and keep the Furnace hot so survivors stay healthy. Build timers keep running while the game is closed.
- **Heroes**: recruit heroes (the odds are listed in the game), level them up with XP Books, add stars with shards, pick a squad of three and train troops in the camps.
- **Explore**: fight stage battles with your squad and troops. An idle chest fills while you are away.
- **Events**: chapter quests (also shown as a banner on the City screen), daily missions and a 7-day login calendar.
- **Shop**: Gems, packs, a monthly card, VIP levels and a daily free gift.

Turn your phone sideways for a landscape layout with every control in a panel on the left and the town filling the rest of the screen.

## Age of Conquest

The start screen also offers **Last Furnace: Age of Conquest**, a grand strategy game in the same page. You are one of 600 governors on the Ashen Crown server; the other 599 are simulated, each with its own personality, memory, economy and army, playing by the same rules as you. Ten guilds sign pacts, betray them, form coalitions and wage war over fortresses and the Ember Throne. Build your city, scout through the fog of war, train troops, lead commanders, join or found a guild, call rallies, and win the Age by holding the Throne or building the Grand Exchange. A demonstration campaign, *The Coalition War*, starts on Day 3 with one guild dominating the server.

It is played with pictures rather than lists: your city is a drawn isometric town where you tap buildings to upgrade and use them, the world map shows castles in guild colors, camps, fields, forests and marching armies, battle reports play out with soldiers, and a pointing hand shows new players what to tap.

This version builds one fully simulated server and the Eternal Conquest mode (plus the demonstration campaign); the other servers and modes are planned. Architecture, save format, feature checklist, test results, measured performance, limitations and roadmap: [docs/CONQUEST.md](docs/CONQUEST.md).

## Where players get the game

| Link | What it is | Saves |
|---|---|---|
| **https://steelballsdragon.github.io/Super2dragon/** | The public game. Anyone can open it in a phone or computer browser and install it to the home screen (it then also plays offline). | On the player's device |
| **The claude.ai link** (the game's Artifact page) | The same game inside the Claude app. | The player's Claude account (cloud) plus the device |

Every push to `main` or `claude/last-furnace-game` is tested on GitHub, and only when every test passes is `dist/` published to the `gh-pages` branch, which GitHub Pages serves at the link above.

**Installing it like an app:** open the public link on the phone. On Android the start screen shows an **Install the game** button. On iPhone and iPad tap **Share**, then **Add to Home Screen**. You can also save `dist/index.html` and open it from any folder.

## Saving

The game saves every 5 seconds and whenever it is closed, keeps a backup copy, and never throws away a save it cannot read (it keeps a rescue copy). Inside the Claude app it also saves to the player's Claude account every 30 seconds, so a crash, a reload or a new device does not lose the city. If two devices play the same city, the older one stops saving to the cloud and asks the player to reopen the game, so newer progress is never overwritten.

The start screen shows the newest save (cloud or device) with **Continue**, and offers **New game** (with a confirmation, and the old city kept as a rescue copy).

## Developer mode

Developer mode is hidden. To turn it on, **tap the Last Furnace logo on the start screen 7 times quickly** (within about a second and a half between taps). The start screen then says *Developer mode is on*, and the City gets a **Dev** button. Seven more taps turn it off again. The setting is kept on that device.

The Dev panel has:

- **Unlimited gems and resources**: keeps Gems, Meat, Wood, Coal and Iron at 999,999,999, even right after spending.
- **Instant builds and training**: every build and training timer finishes the moment it starts.
- **Every item x999**: speedups, crates, recruit tickets, XP books and hero shards.
- **Every hero, max level, 5 stars**: the level cap follows the Furnace level, so use *Max every building* first for level 120.
- **Max every building** (Furnace 30), **Max VIP** (VIP 12), **Clear every stage** (with the first-clear rewards and heroes), **Fill and heal survivors**, **Finish all timers** and **Start a blizzard**.
- **Skip time** by 1 hour, 8 hours or 1 day (the city, the mines and every timer run through the skipped time).
- **Developer mode off** and **Start screen** (from where **New game** starts over).

Developer mode changes the save it is used on. Start a new game first if you want to keep your real city untouched.

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

Every push runs all seven test suites on GitHub (see the Actions tab), and nothing is published unless they pass. To run them yourself:

```sh
npm install                      # installs Playwright
npx playwright install chromium  # the test browser
node build.mjs
node tests/all.mjs
```

- `tests/smoke.mjs` plays a first session through the screens: the start screen, quests, upgrades and speed-ups, collecting, a free recruit, the squad, training, a battle, the idle chest, test-mode purchases, mail and login rewards, then a reload. It fails on any error or network request.
- `tests/cloud.mjs` plays three accounts on separate devices (owner, invited friend, view-only visitor) against a stand-in for the claude.ai platform: cloud saves, restoring a city on a device that lost it, a newer save from another device winning, an older copy never overwriting a newer one, and the game with no platform at all.
- `tests/dev.mjs` checks the hidden 7-tap switch (six taps or slow taps do nothing, the setting survives a reload) and every control on the Dev panel, including a blizzard on demand without the page freezing.
- `tests/conquest-engine.mjs` checks the Age of Conquest rules and simulation in Node: the 600-governor and 10-guild invariants, the economy, prerequisites, pathfinding, combat counters and replays, fog of war, guild politics, saves, offline time, victory, and that invalid commands are refused.
- `tests/conquest-demo.mjs` runs the Coalition War campaign: a coalition forms against the dominant guild, the war changes the map, and the player's intervention changes the outcome.
- `tests/conquest-ui.mjs` plays the opening of a world through the interface: it follows the guide hand, taps buildings in the drawn city to upgrade and train, attacks a camp from the map and watches the battle scene, with the simulation in its worker and on the page, in portrait and landscape.
- `tests/soak.mjs` plays from Furnace 1 to 30 on a phone-density screen in portrait and in landscape, visiting every screen and fighting a battle at every level, and fails on any freeze, error, memory growth or oversized save. It reloads at Furnace 17 and 30, then damages saves on purpose (a corrupt save, every copy corrupt, blocked storage) to check that nothing is lost.

## Project layout

```
src/
  template.html          page shell: title, meta tags, fonts, placeholders for the CSS and JS
  core.js, core.css      the shared game engine (window.Game): state, saving and cloud saves, start screen,
                         timers, HUD, tab bar, sheets, toasts, items, the backpack, the speed-up sheet
  modules/
    city.js, city.css            the town: buildings, build queue, production, survivors, heat, the drawn map
    military.js, military.css    heroes, recruiting, the squad, troops, Explore battles, the idle chest
    shop.js, shop.css            Gems, the test store, packs, monthly card, VIP, Gem Shop, daily gift
    progress.js, progress.css    chapter quests, daily missions, login calendar, mail, chief profile
    dev.js, dev.css              the hidden developer panel
  conquest/                Age of Conquest: the simulation engine (data, world, rules, sim, ai, api) and its
                           interface (ui-*.js, ui.css); see docs/CONQUEST.md
public/icons/            app icons for the installable version
public/logo.webp, public/conquest-logo.webp   the Last Furnace and Age of Conquest artwork (inlined by the build)
build.mjs                puts everything together into index.html and dist/
tests/                   every test suite, a stand-in for the claude.ai platform, all.mjs, the Age of Conquest benchmark
.github/workflows/       tests every push and publishes the tested build to GitHub Pages
docs/CONTRACT.md         the Game API that the modules share (read this before changing a module)
docs/IAP.md              how purchases work and how to connect real app-store payments
docs/CONQUEST.md         Age of Conquest: architecture, save format, features, tests, performance, roadmap
```

Useful build options:

- `node build.mjs --out some/folder` writes the files into another folder.
- `node build.mjs --only city,shop` builds the core with only the listed modules, handy when working on one part.

## About purchases

This build **cannot charge money**. Every price in the Shop goes through a test store: tapping a price opens a sheet that says "Test mode. No money is charged." and then hands out the items. The game is fully playable without buying anything.

To sell Gems for real you would package the game as a phone app and connect Google Play Billing or Apple In-App Purchase, ideally with a server that checks receipts. [docs/IAP.md](docs/IAP.md) explains the steps.
