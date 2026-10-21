# Last Furnace

Last Furnace is a city builder for phones and browsers. The world has frozen over. You keep a great furnace burning, build a town around it, put survivors to work, recruit heroes, train troops and push your squad down the frozen road.

It plays like a mobile strategy game:

- **City**: tap buildings to upgrade them, tap the bubbles over the mines and huts to collect what they made, and keep the Furnace hot so survivors stay healthy. Build timers keep running while the game is closed.
- **Heroes**: recruit heroes (the odds are listed in the game), level them up with XP Books, add stars with shards, pick a squad of three and train troops in the camps.
- **Explore**: fight stage battles with your squad and troops. An idle chest fills while you are away.
- **Events**: chapter quests (also shown as a banner on the City screen), daily missions and a 7-day login calendar.
- **Shop**: Gems, packs, a monthly card, VIP levels and a daily free gift.
- **World**: chiefs online now, world chat and a power leaderboard (when played inside the Claude app, see below).

Turn your phone sideways for a landscape layout with every control in a panel on the left and the town filling the rest of the screen.

## Where players get the game

| Link | What it is | Saves | Online play |
|---|---|---|---|
| **https://steelballsdragon.github.io/Super2dragon/** | The public game. Anyone can open it in a phone or computer browser and install it to the home screen (it then also plays offline). | On the player's device | Not yet (needs an online database, see below) |
| **The claude.ai link** (the game's Artifact page) | The same game inside the Claude app. | The player's Claude account (cloud) plus the device | Yes, for the owner and invited friends |

**Turning on the public link (one time):** on GitHub open the repository's **Settings > Pages**, and under *Build and deployment* set **Source** to **GitHub Actions**. After that, every change merged into `main` is tested and then published to the link above automatically. The game is only published when every test passes.

**Installing it like an app:** open the public link on the phone. On Android the start screen shows an **Install the game** button. On iPhone and iPad tap **Share**, then **Add to Home Screen**. You can also save `dist/index.html` and open it from any folder.

## Saving

The game saves every 5 seconds and whenever it is closed, keeps a backup copy, and never throws away a save it cannot read (it keeps a rescue copy). Inside the Claude app it also saves to the player's Claude account every 30 seconds, so a crash, a reload or a new device does not lose the city. If two devices play the same city, the older one stops saving to the cloud and asks the player to reopen the game, so newer progress is never overwritten.

The start screen shows the newest save (cloud or device) with **Continue**, offers **New game** (with a confirmation, and the old city kept as a rescue copy), and has the **Play online** switch.

## Online play

Online play uses the claude.ai Artifact platform's storage, so there is no server to run, pay for or keep alive. On a personal Claude plan:

- **You (the owner)** can do everything: cloud saves, chat, leaderboard.
- **Friends you invite by email as Editors** can do the same, **as long as the game is not also shared by a public link** (a public link turns invited outside editors into viewers).
- **Anyone else with the link** can play, watch the chat and see the leaderboard, but cannot send messages or appear on the leaderboard, and their city saves on their own device.

Online play for everyone on the public GitHub link needs an online database account in your name. Firebase (by Google) has a free plan that does not shut down when nobody plays. When you have created a Firebase project, the online module can be connected to it.

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

Every push runs all three test suites on GitHub (see the Actions tab), and nothing is published unless they pass. To run them yourself:

```sh
npm install                      # installs Playwright
npx playwright install chromium  # the test browser
node build.mjs
node tests/all.mjs
```

- `tests/smoke.mjs` plays a first session through the screens: the start screen, quests, upgrades and speed-ups, collecting, a free recruit, the squad, training, a battle, the idle chest, test-mode purchases, mail and login rewards, then a reload. It fails on any error or network request.
- `tests/online.mjs` plays three players at once (owner, invited friend, view-only visitor) against a stand-in for the claude.ai platform: chat, rate limits, the leaderboard, cloud saves, a newer save from another device, going offline, and the game with no platform at all.
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
    online.js, online.css        the World tab: chiefs online, world chat, leaderboard
public/icons/            app icons for the installable version
build.mjs                puts everything together into index.html and dist/
tests/                   smoke, online and soak tests, a stand-in for the claude.ai platform, all.mjs
.github/workflows/       tests every push and publishes main to GitHub Pages
docs/CONTRACT.md         the Game API that the modules share (read this before changing a module)
docs/IAP.md              how purchases work and how to connect real app-store payments
```

Useful build options:

- `node build.mjs --out some/folder` writes the files into another folder.
- `node build.mjs --only city,shop` builds the core with only the listed modules, handy when working on one part.

## About purchases

This build **cannot charge money**. Every price in the Shop goes through a test store: tapping a price opens a sheet that says "Test mode. No money is charged." and then hands out the items. The game is fully playable without buying anything.

To sell Gems for real you would package the game as a phone app and connect Google Play Billing or Apple In-App Purchase, ideally with a server that checks receipts. [docs/IAP.md](docs/IAP.md) explains the steps.
