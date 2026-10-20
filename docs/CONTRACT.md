# Last Furnace core contract (`window.Game`)

This is the API that `src/core.js` provides. The four modules (`city`, `military`, `shop`, `progress`) use only this API, their own state slice, and other modules' public objects guarded with optional chaining. Anything marked **extra** goes beyond the original spec; it is stable and safe to use.

## Files and build

```
src/template.html     page shell (title, metas, Google Fonts link, CSS/JS markers, app root)
src/core.js, core.css
src/modules/city.js + city.css          owner: city agent
src/modules/military.js + military.css  owner: military agent (heroes, recruit, troops, explore)
src/modules/shop.js + shop.css          owner: shop agent (gems, IAP store, VIP, packs)
src/modules/progress.js + progress.css  owner: progress agent (chapter quests, dailies, login calendar, profile, mail)
build.mjs                               plain Node 22, no dependencies
```

```sh
node build.mjs                                   # index.html (Artifact fragment) + dist/index.html (standalone)
node build.mjs --out DIR                         # DIR/index.html + DIR/dist/index.html
node build.mjs --only city,shop                  # core plus only the listed modules (aliases: mil, prog)
node build.mjs --out <scratchpad>/build-city --only city   # how module agents build privately
```

- CSS order: core, then city, military, shop, progress. JS order: core, then city, military, shop, progress, then the boot snippet.
- **Each JS file is wrapped in its own function scope** (`;(function(){ 'use strict'; try { ... } catch (e) { console.error(...) } })();`). Top-level names are private to the file; expose things through `Game` (for example `Game.city`, `Game.mil`, `Game.shop`, `Game.store`, `Game.prog`). A module that throws while loading is logged and skipped, the rest still runs.
- The build warns about emoji, external URLs, `alert/confirm/prompt`, and direct `localStorage` use in modules.
- `index.html` starts with `<title>Last Furnace</title>` and has no doctype/html/head/body. `dist/index.html` is a full document with the same reset the Artifact host adds.

## Boot sequence

The boot snippet (in `build.mjs`) runs after every module file has loaded:

```js
try { window.claude?.hot?.snapshot?.(() => ({ state: Game.S })) } catch (e) {}
const hot = window.claude?.hot;
if (hot?.ready) hot.ready(d => Game.boot(d)); else Game.boot(hot?.data ?? {});
```

`Game.boot(d)` runs once:

1. State: `d.state` if present, else the save under `localStorage['last-furnace-v2']`, else a new game. For a loaded game each module slice is `deepMerge(initState(), saved[id])` (plain objects merge key by key, arrays and primitives from the save win), then `migrate(slice)` if defined. Slices of modules missing from a partial build are kept untouched.
2. Timers that ended while closed complete, in `endAt` order (`onComplete` handlers fire).
3. `offline(elapsedSec)` on every module, elapsed capped at 12 h (skipped for a new game).
4. New game only: `emit('game:new')` (**extra**).
5. Day check: `emit('day:reset')` if the local date differs from `S.meta.day`. A new game starts with `meta.day = null`, so day:reset also fires on the very first boot. Treat it as "a new calendar day began for this player", the first one included.
6. HUD, tab bar and every screen are mounted (`mount(el)` once each). The city screen is shown.
7. `emit('ready')`. `Game.isReady` becomes true. Handlers registered later with `Game.on('ready', fn)` run on the next microtask.
8. The loop starts (every 250 ms) and the game saves.

Never cache `Game.S` or a slice at load time; `Game.S` is `null` until boot. Read `Game.S.city` inside functions.

## State

```js
Game.S = {
  v: 2,
  meta: { createdAt, lastSeen, day, chiefName, avatar },   // day: 'YYYY-MM-DD' local; avatar: 0..Game.avatarCount-1
  res: { meat, wood, coal, iron, gems },                    // numbers, may be fractional; HUD floors them
  items: { [itemId]: count },                               // integers; zero counts are deleted
  timers: [{ id, kind, label, startAt, endAt, data }],      // wall-clock ms
  city: {}, mil: {}, shop: {}, prog: {},                    // module slices (S[module.id])
}
```

New game starts with `res = { meat: 2500, wood: 2500, coal: 500, iron: 100, gems: 250 }` and `items = { speedup_1m: 5, speedup_5m: 3, speedup_1h: 1, crate_meat: 1, crate_wood: 1 }`. A random chief name like `Chief 4821` and a random avatar.

## Modules

| API | Example |
|---|---|
| `Game.registerModule({ id, initState(), migrate?(slice), tick?(dtSec, nowMs), offline?(elapsedSec), power?() })` | `Game.registerModule({ id: 'mil', initState: () => ({ heroes: {} }), power: () => 1200 })` |
| `Game.power()` → integer sum of module `power()` | `Game.power() // 48210` |
| `Game.modules()` → registered ids (**extra**) | `Game.modules() // ['city','mil','shop','prog']` |

- `id` is the slice key: `'city' | 'mil' | 'shop' | 'prog'`.
- `tick(dtSec, nowMs)` runs about 4 times a second (`dtSec` capped at 5). `Game.debug.skip` calls it in chunks of at most 60 s.
- `offline(elapsedSec)` runs at boot and whenever the page resumes after more than 20 s without ticks (phone sleep, background tab, clock change).
- `migrate(slice)` may mutate the slice or return a replacement object.

## Events

| API | Example |
|---|---|
| `Game.on(evt, fn)` → unsubscribe function | `const off = Game.on('building:upgraded', p => check(p.id))` |
| `Game.off(evt, fn)` (**extra**) | `Game.off('ready', init)` |
| `Game.emit(evt, payload)` | `Game.emit('stage:cleared', { stage: 3 })` |

Handlers run in try/catch; an error is logged and the other handlers still run.

Catalog (who emits):

| Event | Payload | Emitted by |
|---|---|---|
| `building:started` | `{ id, level }` (level being built) | city |
| `building:upgraded` | `{ id, level }` | city |
| `resources:collected` | `{ type, amount }` | city |
| `survivor:arrived` | `{}` | city |
| `troops:started` | `{ type, count }` | military |
| `troops:trained` | `{ type, count }` | military |
| `hero:recruited` | `{ count, heroIds }` | military |
| `hero:leveled` | `{ heroId, level }` | military |
| `hero:starred` | `{ heroId, stars }` | military |
| `battle:fought` | `{ stage, win }` | military |
| `stage:cleared` | `{ stage }` | military |
| `idle:claimed` | `{}` | military |
| `purchase:completed` | `{ productId }` | shop |
| `mission:claimed` | `{ id }` | progress |
| `gems:spent` | `{ amount, reason }` | core (`Game.spend` with gems) |
| `speedup:used` | `{ seconds, timerId, kind, itemId? , gems?, free? }` | core speedup sheet (modules that apply speedups themselves emit it too) |
| `item:used` | `{ id, count }` | core (`Game.useItem`, speedup sheet) |
| `day:reset` | `{ day, prev }` | core |
| `ready` | `{}` | core, once |
| `game:new` (**extra**) | `{}` | core, first boot of a new game, before mount |
| `timer:completed` (**extra**) | `{ timer }` | core, after `onComplete` handlers |
| `granted` (**extra**) | `{ rewards, source }` | core (`Game.grant`) |
| `spent` (**extra**) | `{ cost, reason }` | core (`Game.spend`) |
| `screen:shown` (**extra**) | `{ id }` | core |
| `nav` (**extra**) | `{ target }` | core (`Game.navigate`) |
| `motion:changed` (**extra**) | `{ reduced }` | core, when prefers-reduced-motion changes |
| `hero:obtained` (**extra**) | `{ heroId, source }` | military, whenever a hero joins (recruit, shards, stage reward) |
| `city:blizzard` (**extra**) | `{ start, end }` | city, when a blizzard warning goes out |
| `city:mode` (**extra**) | `{ mode }` (`'off' \| 'on' \| 'over'`) | city, furnace mode changed |
| `vip:points` (**extra**) | `{ amount, source, level }` | shop |
| `vip:levelup` (**extra**) | `{ level, from }` | shop |
| `shop:gift` (**extra**) | `{}` | shop, daily free gift claimed |
| `shop:bought` (**extra**) | `{ id, item, count, gems }` | shop, Gem Shop purchase |
| `login:claimed` (**extra**) | `{ day, round }` | progress |

Payload details: `purchase:completed` also carries `transactionId`, `priceUsd` and `test` (true for the test store). `mission:claimed` ids are `daily:<missionId>`, `chapter<N>:<taskId>` and `chapter<N>:chest`. `hero:recruited` also carries `newHeroIds` and `pay` (`'free' | 'tickets' | 'gems'`).

## Resources

Cost and reward objects: `{ meat, wood, coal, iron, gems, items: { id: n } }`; missing keys count as 0.

| API | Example |
|---|---|
| `Game.has(cost)` → boolean | `Game.has({ wood: 300, items: { ticket_recruit: 1 } })` |
| `Game.spend(cost, reason)` → boolean (all or nothing; emits `gems:spent` when gems > 0) | `if (!Game.spend({ gems: 300 }, 'recruit')) Game.needGems(300)` |
| `Game.grant(rewards, { source, popup, title? })` | `Game.grant({ gems: 50, items: { speedup_5m: 2 } }, { source: 'mission', popup: true })` |
| `Game.missing(cost)` → shortfall object (**extra**) | `Game.missing({ wood: 900 }) // { wood: 240 }` |
| `Game.RES` → `['meat','wood','coal','iron']` (**extra**) | `Game.RES.forEach(r => ...)` |
| `Game.resInfo[type]` → `{ name, icon, building, buildingName, desc }` (**extra**) | `Game.resInfo.coal.building // 'coalmine'` |

## Items

| API | Example |
|---|---|
| `Game.defineItem(id, { name, icon, desc, rarity?, use?(count), group?, sort?, go?, speedupSec?, speedupKinds? })` | `Game.defineItem('shard_mira', { name: 'Mira Shard', icon: 'shard', rarity: 'epic', group: 'hero', go: 'heroes' })` |
| `Game.itemDefs` registry | `Game.itemDefs.xp_book.name` |
| `Game.itemCount(id)` (**extra**) | `Game.itemCount('ticket_recruit')` |
| `Game.useItem(id, count)` → boolean (**extra**; the bag calls this) | `Game.useItem('crate_wood', 3)` |
| `Game.itemDesc(id)` → string (**extra**) | `Game.itemDesc('crate_coal')` |
| `Game.crateAmount(type)` → resources in one crate at the current Furnace level (**extra**) | `Game.crateAmount('wood') // 1000 at F1` |
| `Game.bagSheet(group?)` opens the backpack (`'all'|'speedup'|'resource'|'hero'|'other'`) | `Game.bagSheet('hero')` |

Item def fields:
- `icon`: any icon name. `desc`: string or `() => string`. `rarity`: `'rare' | 'epic' | 'legendary'` (omit for common).
- `use(count)`: makes the item usable from the bag. Core removes `count` from the bag first, then calls `use(count)`; return `false` to refund. Core emits `item:used`.
- `group`: bag tab (`speedup`, `resource`, `hero`, `other`). Default by id: `speedup*`/`speedupSec` → speedup, `crate_*` → resource, `ticket*`/`xp_*`/`shard_*` → hero.
- `go`: navigate target (or function) for a Go button in the bag, for items used elsewhere.
- `speedupSec`: makes it a speedup listed in the speedup sheet. `speedupKinds`: optional array of timer kinds it applies to.

Core items: `speedup_1m`, `speedup_5m`, `speedup_1h` (rare), `speedup_8h` (epic), `ticket_recruit` (rare, go `heroes:recruit`), `xp_book` (rare, 500 hero XP each, go `heroes`; military consumes them), `crate_meat`, `crate_wood`, `crate_coal`, `crate_iron` (usable; grant `Game.crateAmount(type) * count` with a popup). Crate base amounts at Furnace 1: meat 1000, wood 1000, coal 300, iron 80, scaled by `(1 + 0.35(F-1)) * 1.08^(F-1)`.

## Icons

| API | Example |
|---|---|
| `Game.icon(name, sizePx = 16)` → inline SVG string (24x24 viewBox, `aria-hidden`) | `btn.innerHTML = Game.icon('gem', 18) + ' 300'` |
| `Game.addIcon(name, svgInnerMarkup)` | `Game.addIcon('furnace_big', '<circle cx="12" cy="12" r="9" fill="#ff8a3a"/>')` |
| `Game.hasIcon(name)`, `Game.iconNames()` (**extra**) | `Game.hasIcon('vip')` |

Required names (all drawn): `meat wood coal iron gem power speedup ticket xp crate shard hero troop_infantry troop_lancer troop_marksman sword shield clock chest check lock arrow_up plus close gift star vip mail bag calendar flame snow user`.

Extra names: `crate_meat crate_wood crate_coal crate_iron city map shop hammer survivor heart trophy crown thermo warning exclaim chevron_right chevron_left minus info settings refresh play fast`.

Color: game objects have fixed colors. These are single-color glyphs in `currentColor` (style them with CSS `color`): `clock check lock arrow_up plus minus close user exclaim chevron_right chevron_left info settings refresh play fast`.

Suggested tab icons: city `city`, heroes `hero`, explore `map` (or `sword`), events `calendar`, shop `gem` (or `shop`).

Portraits (**extra**): `Game.avatarSvg(index, sizePx = 48)` returns a drawn chief portrait; `Game.avatarCount` is 6. The HUD shows `S.meta.avatar`.

## Time and formatting

| API | Example |
|---|---|
| `Game.now()` → `Date.now() + Game.debug.offsetMs` | `const t = Game.now()` |
| `Game.today()` → local `'YYYY-MM-DD'` for `Game.now()` (**extra**) | `if (S.prog.lastLogin !== Game.today()) ...` |
| `Game.fmt(n)` → `1,234` / `12.3K` / `4.5M` (floors) | `Game.fmt(12345) // '12.3K'` |
| `Game.fmtFull(n)` → `1,234,567` (**extra**) | `Game.fmtFull(Game.power())` |
| `Game.fmtTime(sec)` → `45s`, `12m 05s`, `3h 20m`, `2d 4h` | `Game.fmtTime(Game.timers.remaining(id))` |
| `Game.reducedMotion` boolean, live (**extra**) | `if (!Game.reducedMotion) animateSurvivors()` |

## Timers (persisted, wall clock, keep running while closed)

| API | Example |
|---|---|
| `Game.timers.start({ id, kind, label, durationSec, data })` → timer | `Game.timers.start({ id: 'build:sawmill', kind: 'build', label: 'Sawmill Lv 4', durationSec: 90, data: { building: 'sawmill', level: 4 } })` |
| `Game.timers.onComplete(kind, fn(timer))` (register at module load) | `Game.timers.onComplete('build', t => finishUpgrade(t.data))` |
| `Game.timers.get(id)` → timer or null | `const t = Game.timers.get('build:sawmill')` |
| `Game.timers.list(kind?)` → timers sorted by `endAt` | `Game.timers.list('build').length` |
| `Game.timers.remaining(id)` → whole seconds left (0 if none) | `Game.timers.remaining('train:infantry')` |
| `Game.timers.reduce(id, sec)` → boolean; completes synchronously if it reaches 0 | `Game.timers.reduce(id, 300)` |
| `Game.timers.finishNow(id)` → boolean; completes synchronously | `Game.timers.finishNow(id)` |
| `Game.timers.progress(id)` → 0..1 (**extra**) | `bar.style.width = Game.timers.progress(id) * 100 + '%'` |
| `Game.timers.cancel(id)` → removed timer, no onComplete (**extra**) | `Game.timers.cancel('train:lancer')` |

- `id` is optional (generated if omitted). Starting a timer with an id that is already running replaces it; the old one's onComplete does not fire.
- Durations are used as given. Apply `Game.perk('buildSpeedPct')` / `Game.perk('trainSpeedPct')` yourself before calling `start`.
- `durationSec <= 0` completes on the next microtask, so code after `start()` still runs first.
- Timers complete in `endAt` order during the loop, at boot, and in `debug.skip`. A timer whose kind has no `onComplete` handler stays pending until one is registered, then completes.

## Speed up

| API | Example |
|---|---|
| `Game.speedupSheet(timerId)` → sheet handle | `Game.speedupSheet('build:sawmill')` |
| `Game.gemCostForSeconds(sec)` → `max(1, ceil(1.5 * (sec/60)^0.85))`, 0 for 0 | `Game.gemCostForSeconds(3600) // 49` |

The sheet lists every speedup item (owned count, Use, and "xN" to use just enough), a Gem instant finish, and a green Free button when `remaining <= Game.perk('freeFinishSec')`. Gem shortfall opens "Not enough Gems" with a Get Gems button (`shop:gems`). It emits `speedup:used` and `item:used`, and closes itself when the timer completes. Modules showing their own Free button: `if (Game.timers.remaining(id) <= Game.perk('freeFinishSec')) Game.timers.finishNow(id)`.

## Perks

| API | Example |
|---|---|
| `Game.registerPerk(name, fn → number)` | `Game.registerPerk('builders', () => (S.shop.vip >= 3 ? 1 : 0))` |
| `Game.perk(name)` → base + sum of contributions | `const pct = Game.perk('productionPct')` |

Bases: `builders 1` (capped at 2, floored), `freeFinishSec 60`, `productionPct 0`, `idleCapHours 8`, `trainSpeedPct 0`, `buildSpeedPct 0`. Unknown names have base 0, so modules can invent perks (for example `marchSlots`).

`Game.furnaceLevel()` → `Game.city?.level?.('furnace') ?? 1`.

## Screens, navigation, badges

| API | Example |
|---|---|
| `Game.registerScreen(id, { tab: { label, icon, order } \| null, mount(el), update?(el), fullBleed?, title? })` | `Game.registerScreen('heroes', { tab: { label: 'Heroes', icon: 'hero', order: 2 }, mount, update })` |
| `Game.navigate(target)` | `Game.navigate('city:building:sawmill')` |
| `Game.registerNav(prefix, fn(rest, target))` | `Game.registerNav('city:building', id => Game.city.openBuilding(id))` |
| `Game.badge(tabId, n)` (0 clears; n > 1 shows the count) | `Game.badge('events', claimable)` |
| `Game.back()` → last tab screen (**extra**) | `backBtn.onclick = () => Game.back()` |
| `Game.screen()` → current screen id (**extra**) | `if (Game.screen() === 'city') ...` |
| `Game.badgeCount(tabId)` (**extra**) | `Game.badgeCount('heroes')` |

- Tabs: `city` (1), `heroes` (2), `explore` (3), `events` (4), `shop` (5). `profile` is a screen with `tab: null` (progress).
- `mount(el)` builds the DOM once. `update(el)` runs about 4 times a second while the screen is visible, and right after it is shown. It only updates text, widths and disabled states; never rebuild DOM that holds buttons every tick. Rebuild lists only when their content changes (keep a signature).
- The screen element (`section.screen#screen-<id>`) already scrolls vertically and has the side gutter and 14 px top padding. Pass `fullBleed: true` (or add class `full-bleed`) to remove the padding, as the city canvas does.
- `navigate(target)`: closes open sheets, shows the screen named by the whole target or by the part before the first colon, then calls the handler with the longest matching prefix (`'heroes:recruit'` matches a handler registered for `'heroes:recruit'` with rest `''`, or one for `'heroes'` with rest `'recruit'`). Unknown targets fall back to the tab before the first colon, else city. Calls before `ready` are queued.
- Known targets: `city`, `city:building:<id>`, `heroes`, `heroes:recruit`, `explore`, `events`, `events:daily`, `shop`, `shop:gems`, `shop:vip`, `profile`.
- Module targets (**extra**, added by the modules): `city:survivors` (survivors and workers sheet); `heroes:roster`, `heroes:squad`, `heroes:troops`, `heroes:hero:<heroId>`, `heroes:train:<troopType>`, `explore:fight`, `explore:idle`; `events:chapter`, `events:login`, `mail`; `shop:packs`, `shop:items`, and `shop:starter|builder|monthly|daily|hero|gift|history` (scroll to and highlight that offer).

## City extension points (provided by the city module)

`Game.city = { level(buildingId), addSideButton({ id, icon, label, onClick, badge?() }), setBanner(el), openBuilding(id) }`.

Other modules call these only inside `Game.on('ready', ...)` and always with optional chaining, so they still work in a `--only` build:

```js
Game.on('ready', () => {
  Game.city?.addSideButton?.({ id: 'mail', icon: 'mail', label: 'Mail', onClick: openMail, badge: () => unread() });
});
const camp = Game.city?.level?.('infantry_camp') ?? 0;
```

Extras on `Game.city` (**extra**, all safe to call with optional chaining): `removeSideButton(id)`, `ids` (building ids in display order), `name(id)`, `unlockLevel(id)`, `maxLevel(id)`, `isUpgrading(id)`, `canUpgrade(id)`, `upgrade(id)`, `upgradeCost(id, level?)`, `focus(id)` (pan the camera), `highlight(id | null)` (gold ring on a building), `collect(id)`, `collectAll()`, `production(type)` (per hour), `stock(id)`, `survivors()` → `{ total, cap, healthy, sick, idle }`, `temperature()`, `setMode('off'|'on'|'over')`, `autoAssign()`, `openSurvivors()`, `setBuildingInfo(id, fn(level) → [[label, value]])`, `addBuildingAction(id, { id, label, kind, icon, onClick })`.

Side buttons: ids are unique, so adding the same id twice replaces the button. The column holds about six buttons at 390x844; keep labels to one short word.

Building ids: `furnace shelter sawmill coalmine ironmine hunter infirmary storehouse infantry_camp lancer_camp marksman_camp`. Furnace max level 30.

`Game.store` (the purchase provider) belongs to the shop module. Other modules use it guarded: `Game.store?.buy?.('starter_pack')`.

## Public objects of the modules (**extra**)

Always read these with optional chaining; each one is missing in a `--only` build without its module.

- `Game.store` (shop): `{ provider, setProvider(p), products(), product(id), canPurchase(id) → { ok, reason }, purchase(id) → Promise, buy (alias of purchase), restore(), history(), deliver(...), busy, isTest, DemoProvider }`. Product ids are `lf.gems.t1`..`t6`, `lf.pack.starter`, `lf.card.monthly`, `lf.pack.builder`, `lf.pack.daily`, `lf.pack.hero`; the aliases `starter_pack`, `builder`, `monthly_card`, `daily_deal` and `hero_pack` also work. Every purchase goes through the provider; the only one shipped is the DemoProvider test store ("Test mode. No money is charged."). See docs/IAP.md.
- `Game.shop`: `{ vipLevel(), vipPoints(), addVipPoints(n, source), vipPerks(lv?), open(section?), giftReady(), claimGift(), openGift(), monthlyCard() → { active, claimable, claimsLeft }, claimMonthly(), hasSecondBuilder(), claimables(), gemShop() }`.
- `Game.mil` (military): `heroIds()`, `owns(id)`, `heroDef(id)`, `heroLevel(id)`, `heroStars(id)`, `heroPower(id)`, `heroMaxLevel()`, `squad()`, `squadPower()`, `troopPower()`, `troopCount(type?)`, `troopTier(type)`, `campLevel(type)`, `highestStage()`, `stageLabel(n)`, `enemyPower(n)`, `idleMinutes()`, `freeRecruitReady()`, `pityLeft()`, `recruit(n, pay)`, `grantHero(id, { source })`, `claimIdle()`, `startTraining(type, n)`, `openHero(id)`, `openRecruit()`, `openTraining(type)`, `openBattle()`, `openIdle()`, `portraitSvg(id)`, `enemySvg(type, boss)`, plus the data tables `HEROES`, `CLASSES`, `RARITIES`, `TROOPS`, `ODDS`, `PITY_AT`, `MAX_STAGE`.
- `Game.prog` (progress): `openMail()`, `openLetter(id)`, `sendMail({ id, from, title, body: [paragraphs], rewards?, go?: { label, target } })`, `mailUnread()`, `claimables()`, `chapter()`, `current()` (the City banner model), `daily()`, `loginReady()`, `claimTask(id)`, `claimChapterChest()`, `claimMission(id)`, `claimDailyChest(at)`, `claimLogin()`, `claimMail(id)`.

## UI helpers

| API | Example |
|---|---|
| `Game.sheet({ title, body, actions?, update?(bodyEl, handle), onClose?(handle), className? })` → `{ el, body, close(), refresh(), setTitle(t), closed }` | `Game.sheet({ title: 'Sawmill', body: html, actions: [{ label: 'Upgrade', kind: 'gold', onClick: upgrade }] })` |
| `Game.confirmSheet({ title, message, confirmLabel, kind, onConfirm, cancelLabel?, onCancel? })` | `Game.confirmSheet({ title: 'Recruit x10', message: 'Spend 2,700 Gems?', confirmLabel: 'Recruit', kind: 'gold', onConfirm: go })` |
| `Game.toast(text, kind = 'info' \| 'good' \| 'bad')` (an identical toast already on screen is replaced, not stacked) | `Game.toast('Sawmill upgraded to Lv 4', 'good')` |
| `Game.rewardPopup(rewards, title = 'Rewards')` (queued if one is open) | `Game.rewardPopup({ gems: 100, custom: [{ icon: 'hero', name: 'Mira', rarity: 'epic' }] }, 'Recruited')` |
| `Game.needGems(amount)` "Not enough Gems" sheet (**extra**) | `if (!Game.spend({ gems: c }, 'x')) Game.needGems(c)` |
| `Game.missingSheet(cost, { title?, message?, actions? })` shortfall rows with Use crate / Go / Get Gems (**extra**) | `if (!Game.has(cost)) Game.missingSheet(cost)` |
| `Game.resourceSheet(type)` HUD resource sheet (**extra**) | `Game.resourceSheet('coal')` |
| `Game.closeSheets()`, `Game.openSheets()` (**extra**) | `Game.closeSheets()` |
| `Game.tileHtml({ icon, count, rarity, iconHtml, tag, attrs })` item-style tile (**extra**) | `Game.tileHtml({ icon: 'hero', rarity: 'legendary', count: 'Lv 5' })` |
| `Game.itemTileHtml(id, count?)` (**extra**) | `Game.itemTileHtml('speedup_1h', 3)` |
| `Game.costHtml(cost, { check = true })` cost chips, red when short (**extra**) | `el.innerHTML = Game.costHtml({ wood: 900, coal: 120 })` |
| `Game.rewardsHtml(rewards)` reward tiles with names (**extra**) | `list.innerHTML = Game.rewardsHtml(stage.firstClear)` |
| `Game.el(html)` → first element; `Game.esc(s)`; `Game.setText(node, text)` (only writes on change) (**extra**) | `Game.setText(el.querySelector('.t'), Game.fmtTime(r))` |
| `Game.refreshHud()`, `Game.render()`, `Game.save()` (**extra**) | `Game.save()` |

Sheet details:
- `body` is an HTML string or an element. Sheets stack; Escape, the close button and the scrim close the top one.
- `actions: [{ label, kind, onClick(handle), disabled?, id? }]`. `label` (HTML allowed), `kind` (`gold` default, `green`, `blue`, `ghost`, `red`) and `disabled` may each be a value or a function; functions are re-evaluated on every refresh (about 4 times a second). **After `onClick` the sheet closes unless `onClick` returns `false`.** `id` sets `data-action` on the button.
- `update(bodyEl, handle)` runs on open, on `refresh()` and about 4 times a second while open. Same rule as screens: update text and disabled states only.
- `confirmSheet.message` is HTML. `onCancel` fires when the sheet closes without confirming.
- `rewardPopup` rewards accept `custom: [{ icon, iconHtml?, name, count?, rarity? }]` for heroes, troops or anything that is not a resource or item. `grant(..., { popup: true })` uses it.

## CSS

Module CSS prefixes its classes (`.city-`, `.mil-`, `.shop-`, `.prog-`) and uses core tokens (never literal colors).

Shared classes: `.btn` with `.gold` `.green` `.blue` `.ghost` `.red` `.small` `.wide` (`.btn-cost`, `.btn-sub` inside); `.icon-btn`; `.panel`; `.card`; `.section-title`; `.progress > .bar` (+ `.green` `.gold` `.ember`, optional `.progress-label`); `.badge-dot` (+ `.has-count`); `.chip`; `.res-chip` (+ `.short`, `.res-num` inside); `.cost-list`; `.tile` (+ `.tile-count`); `.rarity-common` `.rarity-rare` `.rarity-epic` `.rarity-legendary` (set `--rarity`, `--rarity-hi`, `--rarity-lo`, `--rarity-bg` and the border color; on `.tile`/`.card` they also set the background; `.rarity-text` colors text); `.seg` (segmented control of buttons with `aria-pressed`); `.muted`, `.num`, `.title-font`, `.good-text`, `.bad-text`, `.sr-only`.

Tokens (all on `:root`, single dark theme, `color-scheme: dark`):
- Ground: `--backdrop --backdrop-glow --bg --bg-2 --bg-hi`
- Panels: `--panel --panel-2 --panel-3 --panel-deep --card --card-2 --hud-top --hud-bot --tab-top --tab-bot`
- Lines and overlays: `--line --line-soft --line-strong --white-a06 --white-a12 --white-a20 --white-a35 --white-a55 --black-a15 --black-a25 --black-a40 --black-a55 --black-a70 --scrim --track --chip-bg`
- Text: `--text --text-2 --muted --dim`
- Ice: `--ice --ice-2 --ice-3 --ice-glow`
- Buttons: `--gold --gold-2 --gold-3 --gold-ink --green --green-2 --green-3 --green-ink --blue --blue-2 --blue-3 --blue-ink --red --red-2 --red-ink`
- Furnace: `--ember --ember-2 --ember-3 --ember-glow`
- State: `--good --bad --warn`
- Rarity: `--common(-hi/-lo) --rare(-hi/-lo) --epic(-hi/-lo) --legendary(-hi/-lo)`
- Resource text accents: `--meat --wood --coal --iron --gem`
- Type: `--font-display` ("Lilita One": titles, big numbers, buttons), `--font-body` ("Barlow" 400/500/600/700)
- Shape: `--r-sm 6px --r 8px --r-lg 10px --app-max 480px`; `--hud-h` (measured HUD height, on `.app`)

Layout: `.app` is a flex column (HUD, `.screens`, tab bar) max 480 px wide, centered on desktop. A `position: sticky` header inside a screen needs `top: -14px` and `margin-top: -14px`, because the screen has 14 px top padding and Chrome measures sticky offsets from the content edge. Overlays (`#ui-layer`) cover the whole column. Global `prefers-reduced-motion` rule disables animations and transitions; canvas code checks `Game.reducedMotion`.

## Storage

`Game.storage.get(key)`, `.set(key, value)` → boolean, `.remove(key)` (**extra**): wrappers that never throw. Use them for per-viewer conveniences. Game state lives in `Game.S` and is saved by core (every 5 s, on hide and on pagehide) under `last-furnace-v2`. Modules do not save on their own, with one exception: right after something the player paid for is delivered (a store purchase or a restore), call `Game.save()` so a crash inside the 5 s window cannot lose it. The shop module does this.

## Debug (tests only, never in UI)

| API | Example |
|---|---|
| `Game.debug.offsetMs` (added to `Game.now()`; changing it directly makes the next loop call `offline(gap)`) | `Game.debug.offsetMs += 3600e3` |
| `Game.debug.skip(sec)` advances the clock in steps of at most 60 s: module `tick`, timers and day reset per step, then a render | `Game.debug.skip(8 * 3600)` |
| `Game.debug.grant(rewards)` | `Game.debug.grant({ gems: 5000 })` |
| `Game.debug.reset()` deletes the save and reloads the page | `Game.debug.reset()` |

## Platform rules (every module)

- No external scripts, images or network. Draw with canvas, CSS or inline SVG. No emoji anywhere.
- `alert`, `confirm`, `prompt`, `window.open`, downloads, print and clipboard reads do not work. Use `Game.confirmSheet` and `Game.sheet`.
- Every interactive element is a `<button>` or a form control with a visible `:focus-visible` state; form controls get stable ids.
- Must work at 360-430 px with no horizontal scroll.
- Respect `prefers-reduced-motion` (`Game.reducedMotion`).
