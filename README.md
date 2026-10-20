# Last Furnace

Last Furnace is a city builder for phones and browsers. The world has frozen over. You keep a great furnace burning, build a town around it, put survivors to work, recruit heroes, train troops and push your squad down the frozen road.

It plays like a mobile strategy game:

- **City**: tap buildings to upgrade them, tap the bubbles over the mines and huts to collect what they made, and keep the Furnace hot so survivors stay healthy. Build timers keep running while the game is closed.
- **Heroes**: recruit heroes (the odds are listed in the game), level them up with XP Books, add stars with shards, pick a squad of three and train troops in the camps.
- **Explore**: fight stage battles with your squad and troops. An idle chest fills while you are away.
- **Events**: chapter quests (also shown as a banner on the City screen), daily missions and a 7-day login calendar.
- **Shop**: Gems, packs, a monthly card, VIP levels and a daily free gift.

The whole game is one HTML file with no downloads at play time. It saves to your browser automatically.

## Play it on your computer

1. Open `dist/index.html` in a browser (double-click it, or drag it into a Chrome, Edge, Firefox or Safari window).
2. That's it. The game saves in that browser. If `dist/` is missing, build it first (see below).

The page is made for a phone screen. On a computer it shows as a phone-sized column in the middle of the window.

## Rebuild after changing the code

You need [Node.js](https://nodejs.org) 22 or newer. Nothing else gets installed.

```sh
node build.mjs
```

This writes two files:

- `dist/index.html`: a complete web page you can open directly, or later wrap into a phone app.
- `index.html` (in the project root): the same game as a page fragment, used when the game is published as a claude.ai Artifact.

Never edit those two files by hand: `node build.mjs` overwrites them. Change the files in `src/` instead.

## Run the smoke test

The smoke test opens the game in a headless Chrome and plays a first session: a new game, the first quest, a Furnace upgrade with a speed-up, collecting resources, assigning a worker, a free recruit, setting the squad, building a camp and training troops, winning stage 1-1, claiming the idle chest, buying the Starter Pack and the Monthly Card in test mode, claiming mail and the login reward, then reloading to check the save. It fails if the page logs any error or tries to reach the network (Google Fonts is the only exception).

```sh
node build.mjs
node tests/smoke.mjs
```

It needs [Playwright](https://playwright.dev) with Chromium installed (`npm install -g playwright` and then `npx playwright install chromium`). It prints `ok` for each step and exits with code 1 when a step fails.

## Project layout

```
src/
  template.html          page shell: title, meta tags, fonts, placeholders for the CSS and JS
  core.js, core.css      the shared game engine (window.Game): state, saving, timers, HUD, tab bar,
                         sheets, toasts, items, the backpack, the speed-up sheet
  modules/
    city.js, city.css            the town: buildings, build queue, production, survivors, heat, the drawn map
    military.js, military.css    heroes, recruiting, the squad, troops, Explore battles, the idle chest
    shop.js, shop.css            Gems, the test store, packs, monthly card, VIP, Gem Shop, daily gift
    progress.js, progress.css    chapter quests, daily missions, login calendar, mail, chief profile
build.mjs                put everything together into index.html and dist/index.html
tests/smoke.mjs          the smoke test
docs/CONTRACT.md         the Game API that the modules share (read this before changing a module)
docs/IAP.md              how purchases work and how to connect real app-store payments
```

Useful build options:

- `node build.mjs --out some/folder` writes the two files into another folder.
- `node build.mjs --only city,shop` builds the core with only the listed modules, handy when working on one part.

## About purchases

This build **cannot charge money**. Every price in the Shop goes through a test store: tapping a price opens a sheet that says "Test mode. No money is charged." and then hands out the items. The game is fully playable without buying anything.

To sell Gems for real you would package the game as a phone app and connect Google Play Billing or Apple In-App Purchase, ideally with a server that checks receipts. [docs/IAP.md](docs/IAP.md) explains the steps.
