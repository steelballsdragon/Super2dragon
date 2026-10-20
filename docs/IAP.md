# In-app purchases in Last Furnace

This guide is for someone new to app stores. It explains what the shop does today, which products exist, and what you need to do to sell them for real money on Android, iOS and the web.

**Short version:** the game ships with a **test store**. Every price button works, but no money is ever charged. To take real payments you replace one small object, the *provider*, with one that talks to Google Play, the App Store or Stripe. The rest of the game stays the same.

---

## 1. What the test store does today

- Every purchase goes through `Game.store` (in `src/modules/shop.js`).
- The only provider in this build is the **DemoProvider**. Tapping a price opens a sheet inside the game that shows the product, the price, what you get, and the line **"Test mode. No money is charged."**, with **Buy** and **Cancel** buttons.
- **Buy** shows a short spinner (about 0.6 seconds), then approves the purchase with a fake transaction id such as `TEST-7KQ2M9XH4D3P`. The game grants the items, adds VIP points and records the purchase in the history.
- There are **no card or payment fields anywhere**. The game never sees payment details, and it shouldn't once real payments are added either: the store's own payment screen collects them.
- The Shop screen shows a **TEST STORE** ribbon while the DemoProvider is active.
- Purchases are saved in the game save (`Game.S.shop`). **Restore purchases** in the Shop reapplies one-time products from that history. A real provider would ask the store instead.

The page published as a claude.ai Artifact must stay in test mode. It runs in a locked-down frame that can't open payment pages or talk to a payment server.

---

## 2. Products

Create these IDs in Google Play Console and App Store Connect **exactly as written**. The game looks products up by ID.

| Product ID | Price (USD) | Store type | What the player gets |
|---|---|---|---|
| `lf.gems.t1` | $0.99 | Consumable | 100 Gems (200 on the first purchase) |
| `lf.gems.t2` | $4.99 | Consumable | 550 Gems (1,100 on the first purchase) |
| `lf.gems.t3` | $9.99 | Consumable | 1,200 Gems (2,400 on the first purchase) |
| `lf.gems.t4` | $19.99 | Consumable | 2,500 Gems (5,000 on the first purchase) |
| `lf.gems.t5` | $49.99 | Consumable | 6,500 Gems (13,000 on the first purchase) |
| `lf.gems.t6` | $99.99 | Consumable | 14,000 Gems (28,000 on the first purchase) |
| `lf.pack.starter` | $0.99 | Non-consumable (one time) | 300 Gems, 3 Recruit Tickets, 5x 5m Speedup, 2x 1h Speedup, 5 Hero XP Books, 3 Meat Crates, 3 Wood Crates, 2 Coal Crates, 2 Iron Crates |
| `lf.pack.builder` | $4.99 | Non-consumable (permanent) | A second builder for good, plus 3x 1h Speedup. Not sold once the player reaches VIP 6, which already includes it. |
| `lf.card.monthly` | $4.99 | Consumable | 300 Gems right away, then 100 Gems that can be claimed once a day for 30 days. A missed day is lost. Buying again while active adds 30 more days. |
| `lf.pack.daily` | $0.99 | Consumable, limit 1 per day | 150 Gems, 2x 1h Speedup, 5x 5m Speedup, 1 Wood Crate, 1 Coal Crate |
| `lf.pack.hero` | $9.99 | Consumable, limit 3 per player | 1,000 Gems, 10 Recruit Tickets, 15 Hero XP Books |

Notes:
- **First-purchase bonus.** Each gem tier pays double the first time it is bought. The game tracks this itself, so on the stores they are plain consumables.
- **VIP points.** Every purchase adds 100 VIP points per $1 of list price ($4.99 gives 499). VIP levels 0-12 never expire. They raise resource production, the free-finish window (up to 5 minutes), the idle chest cap and training speed, and VIP 6 adds the second builder. Players also earn 20-50 free VIP points a day with a streak.
- **Limits** (one time, 3 per player, 1 per day) are enforced by the game. Mark the starter pack and the second builder as non-consumable on the stores, so the store also remembers them and **Restore purchases** works after a reinstall.
- **Monthly card.** The game models it as a 30-day consumable. On iOS you may instead use the *non-renewing subscription* type. Don't use an auto-renewing subscription unless you also change the game logic and the store listing text.
- **Prices.** $0.99, $4.99, $9.99, $19.99, $49.99 and $99.99 all exist as standard price points on both stores. Each store converts them to local currency. A real provider passes the store's localized price string to the game (`priceString`), so a player in Germany sees "4,99 €".

### Free things that never cost money

- Daily free gift: 20 Gems, 2x 5m Speedup and one resource crate, once a day.
- Daily VIP points, VIP level gifts, and the monthly card's daily claim (after buying it).
- Gem Shop: items bought with Gems (speedups, Recruit Tickets, XP Books, crates), with daily limits. Every Gem spend asks for confirmation first.

The game is fully playable without paying.

---

## 3. How the code is organized

```
Game.store = {
  provider,                 // the active provider object
  setProvider(provider),    // swap in a real one
  products(),               // catalog with prices, contents and whether each can be bought now
  product(id),
  canPurchase(id),          // { ok, reason }   reason: 'owned' | 'included' | 'sold-out' | 'daily-limit'
  purchase(productId),      // Promise<{ ok, transactionId?, error? }>   ('buy' is an alias)
  restore(),                // Promise<{ ok, restored }>
  history(),                // [{ tx, id, title, usd, at, test }]
  deliver(productId, transactionId, meta?),   // grants a paid product once per transaction id
}
```

`purchase(productId)` does this:
1. Checks that the product exists and can be bought (one-time products already owned, sold out, daily limit reached).
2. Calls `provider.purchase(product)`. This is the only step that differs between stores.
3. On success it calls `deliver(productId, transactionId)`. That grants the items with the reward popup, records the purchase and its VIP points, emits `purchase:completed` and saves the game.
4. Calls `provider.finish(result)` so the store can mark the purchase as handled.

**`deliver` is idempotent.** Calling it twice with the same transaction id grants the items only once. This matters because real stores re-report unfinished purchases, for example when the app crashed mid-purchase or the player paid in a shop with cash and the purchase was approved later. A real provider can call `deliver` from its own listener at any time without risk.

### The provider interface

A provider is a plain object:

```js
{
  id: 'play',                       // short name
  name: 'Google Play',
  isTest: false,                    // true shows the TEST STORE ribbon
  init({ products, deliver }),      // optional; called by setProvider. products: [{ id, type, title, priceUsd }]
  priceString(productId),           // optional; localized price such as "4,99 €", or null to show the USD price
  purchase(product),                // required; Promise<{ ok: true, transactionId } | { ok: false, error }>
                                    //   error 'cancelled' means the player backed out (no message is shown)
  restore(),                        // optional; Promise<[{ productId, transactionId }]> for owned non-consumables
  finish(result),                   // optional; acknowledge or consume after the items were granted
}
```

---

## 4. Making purchases real on Android (Google Play)

1. **Developer account.** Sign up for a Google Play Console developer account. It costs **$25, once**. Set up a payments profile so Google can pay you.
2. **Wrap the web build as an app with [Capacitor](https://capacitorjs.com).** Capacitor puts `dist/index.html` inside a native Android (and iOS) app.
   ```sh
   npm init -y
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap init "Last Furnace" com.yourname.lastfurnace --web-dir dist
   node build.mjs              # writes dist/index.html
   npx cap add android
   npx cap sync
   npx cap open android        # opens Android Studio; build a signed release bundle (.aab)
   ```
   The game loads its fonts from Google Fonts. For an app that also works offline, download the two fonts into `dist/` and point the stylesheet link at the local files.
3. **Add a billing plugin.** Google Play Billing is a native library, so you need a plugin that exposes it to JavaScript. Two common choices:
   - **[RevenueCat](https://www.revenuecat.com)** (`@revenuecat/purchases-capacitor`). It is a hosted service that verifies receipts for you, handles refunds, and works the same on iOS. It is free up to a revenue threshold, then takes a small percentage.
   - **[cordova-plugin-purchase](https://github.com/j3k0/cordova-plugin-purchase)** (works with Capacitor). It is open source, and you pair it with your own server, or its companion service, for receipt checks.
4. **Create the products** in Play Console under *Monetize > Products > In-app products*, using the IDs and prices from section 2. Upload a build to the *Internal testing* track first: Google only shows products to an app it has seen.
5. **Write a real provider** (sketch in section 8) and turn it on in the app build: `Game.store.setProvider(PlayProvider)`.
6. **Verify every purchase on a server before granting it.** The app sends the purchase token to your server. The server asks Google's *Play Developer API* (`purchases.products.get`) whether the token is real, paid, for this app and not used before. Only then does the game call `deliver`. Without this, cheaters can fake purchases.
7. **Finish every purchase.** Consumables must be *consumed* (so they can be bought again) and one-time products *acknowledged* within 3 days, or Google refunds them automatically. The plugins do this when you call `finish`.
8. **Fees.** Google keeps **15%** of your first $1M in earnings each year and **30%** above that. Google is the seller of record and handles sales tax and VAT.

---

## 5. Making purchases real on iOS (App Store)

1. **Apple Developer Program.** It costs **$99 per year**. Accept the *Paid Apps* agreement and fill in banking and tax details in App Store Connect, otherwise purchases do not work even in testing.
2. **You need a Mac with Xcode.** With Capacitor: `npm install @capacitor/ios`, `npx cap add ios`, `npx cap sync`, `npx cap open ios`.
3. **Create the products** in App Store Connect under *Monetization > In-App Purchases*, with the same IDs. Gem packs, the daily deal, the hero pack and the monthly card are *Consumable*. The starter pack and the second builder are *Non-Consumable*. Each product needs a display name, a description and a review screenshot.
4. **Use the same plugin** as on Android. RevenueCat and cordova-plugin-purchase both support StoreKit. The provider code stays almost identical; only the platform name changes.
5. **Verify on a server.** Use Apple's *App Store Server API* to look up the transaction id. It returns a signed record: check the signature, the bundle id and the product id. Then grant.
6. **Restore purchases.** Apple requires a visible **Restore purchases** button for non-consumables. The Shop already has one. It calls `Game.store.restore()`, which asks the provider which non-consumables the player owns.
7. **Fees.** **30%** standard, or **15%** if you join the *App Store Small Business Program* (under $1M a year). Apple is the seller of record and handles taxes.

---

## 6. Making purchases real on the web (Stripe Checkout)

This is for a version of the game hosted on your own website, not the Artifact page and not inside the mobile apps.

1. Create a **[Stripe](https://stripe.com)** account. There is no monthly fee; a US card payment costs about 2.9% + $0.30. Unlike the app stores, Stripe is not the seller of record: you are responsible for sales tax and VAT (Stripe Tax can calculate it).
2. Create a *Product* and *Price* in the Stripe dashboard for each product ID, and save the product ID (`lf.gems.t1`, ...) in the price's metadata.
3. You need **a small server** (for example a serverless function). The web provider's `purchase()` asks your server to create a *Checkout Session* and sends the player to Stripe's hosted payment page. The game never handles card data.
4. Stripe sends your server a `checkout.session.completed` **webhook** when payment succeeds. Your server records the purchase for that player's account.
5. When the player comes back, the game asks your server for new purchases and calls `deliver(productId, sessionId)` for each. Because `deliver` is idempotent, asking twice is harmless.
6. Web purchases need **player accounts on your server**. The local save in the browser is not proof that someone paid.

---

## 7. Rules you must follow

### Digital goods in mobile apps must use the platform's billing

Gems, packs, VIP and anything else used inside the game are *digital goods*. Inside an Android app from Google Play you must sell them through **Google Play Billing**. Inside an iOS app you must use **Apple In-App Purchase** (App Store Review Guideline 3.1.1). You may **not** put a Stripe checkout or a "pay on our website" button inside the mobile apps. Apps get rejected or removed for this. Some regions now allow alternative billing or links to the web under specific conditions; read the current Google and Apple policies before relying on that. The web build (section 6) is a separate product and may use Stripe.

### Loot box odds must be published

Hero recruiting is a random draw (a "gacha" or "loot box"). It can be paid for with Gems, and Gems can be bought with money, so:
- **Apple** (Guideline 3.1.1) and **Google Play** both require showing the odds of each outcome **before** the player pays. The Heroes screen shows the recruit odds and the pity rule. Keep them accurate whenever the drop rates change.
- **Some countries add their own rules.** China and South Korea require odds disclosure by law. Japan bans "complete gacha" (paying to complete a set of random items). Belgium treats paid loot boxes as gambling, so many games disable paid recruits there.
- Age ratings (IARC, ESRB, PEGI) ask whether the game has in-game purchases with random items. Answer yes; the store will show "In-Game Purchases (Includes Random Items)".
- Don't target children with purchases, and don't use misleading timers or fake discounts. The "value" tags in the Shop compare the contents at Gem Shop prices with the price of the $0.99 gem pack. Keep them honest if prices change.

### Refunds

- **Google Play:** players can request a refund in Google Play, and you can refund from Play Console. Use the *Voided Purchases API* to learn about refunds and chargebacks, then take the gems back or block the account.
- **Apple:** Apple decides refund requests (reportaproblem.apple.com). Subscribe to *App Store Server Notifications*; a `REFUND` notification tells your server which transaction was refunded.
- **Stripe:** refund from the dashboard; the `charge.refunded` webhook tells your server.
- In every case, revoke what was granted (subtract gems, remove the second builder) and record that the transaction was refunded, so a re-reported transaction is not granted again.

---

## 8. Sketch: a real provider

This sketch uses **cordova-plugin-purchase** (version 13) on Google Play, with your own verification server. Treat it as a starting point: check the plugin's documentation for the exact names in your version, and test it with license testers.

```js
// Load this only in the native app build (for example a small extra script after the modules),
// never in the Artifact page.
const PlayProvider = (() => {
  const { store, ProductType, Platform, ErrorCode } = window.CdvPurchase;
  const waiting = new Map(); // productId -> resolve() of the purchase() call that is waiting
  const prices = {};
  let deliverFn = null;

  async function verifyOnServer(tx) {
    // Your server calls Google's Play Developer API with the purchase token and checks
    // that it is paid, belongs to this app, and was never used before.
    const res = await fetch('https://api.yourgame.example/iap/google/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productIds: tx.products.map(p => p.id), token: tx.purchaseId, orderId: tx.transactionId }),
    });
    return res.ok && (await res.json()).valid === true;
  }

  return {
    id: 'play',
    name: 'Google Play',
    isTest: false,

    async init({ products, deliver }) {
      deliverFn = deliver;
      store.register(products.map(p => ({
        id: p.id,
        platform: Platform.GOOGLE_PLAY,
        type: p.type === 'non_consumable' ? ProductType.NON_CONSUMABLE : ProductType.CONSUMABLE,
      })));
      store.when()
        .productUpdated(prod => {
          const price = prod.getOffer()?.pricingPhases?.[0]?.price; // localized, e.g. "4,99 €"
          if (price) prices[prod.id] = price;
        })
        .approved(async tx => {
          // Also fires at startup for purchases that were paid but never finished (crash, slow payment).
          if (!(await verifyOnServer(tx))) return;              // never grant an unverified purchase
          for (const p of tx.products) {
            deliverFn(p.id, tx.transactionId);                  // idempotent: safe to call more than once
            waiting.get(p.id)?.({ ok: true, transactionId: tx.transactionId });
            waiting.delete(p.id);
          }
          tx.finish();                                          // consume or acknowledge
        });
      await store.initialize([Platform.GOOGLE_PLAY]);
    },

    priceString: id => prices[id] || null,

    purchase(product) {
      return new Promise(async resolve => {
        const offer = store.get(product.id, Platform.GOOGLE_PLAY)?.getOffer();
        if (!offer) return resolve({ ok: false, error: 'unavailable' });
        waiting.set(product.id, resolve);
        const err = await offer.order();                        // opens Google's own payment sheet
        if (err) {
          waiting.delete(product.id);
          resolve({ ok: false, error: err.code === ErrorCode.PAYMENT_CANCELLED ? 'cancelled' : 'failed' });
        }
        // on success, the approved() handler above resolves the promise
      });
    },

    async restore() {
      await store.restorePurchases();
      return ['lf.pack.starter', 'lf.pack.builder']
        .filter(id => store.owned(id))
        .map(id => ({ productId: id, transactionId: 'RESTORED-' + id }));
    },

    finish() { return Promise.resolve(); }, // already finished in approved()
  };
})();

if (window.Capacitor?.isNativePlatform?.()) Game.store.setProvider(PlayProvider);
```

For iOS, register the same products with `Platform.APPLE_APPSTORE` and verify with the App Store Server API on your server. With RevenueCat the shape is the same: `purchase()` calls `Purchases.purchaseStoreProduct(...)`, and RevenueCat verifies the receipt for you.

**About saves.** The game keeps its save in the browser or app storage, and a determined player can edit it. That is acceptable for a test build. Before taking real money, keep a server-side record of purchases per player, so you can restore them on a new device and handle refunds.

---

## 9. Testing without spending money

- **In this build:** use the test store. Everything is free and every purchase is marked *Test* in the purchase history.
- **Google Play:** add your Google accounts as **license testers** (Play Console > *Settings > License testing*) and install the app from the *Internal testing* track. Testers see test payment methods such as "Test card, always approves" and "Test card, always declines", and are never charged.
- **Apple:** create **Sandbox testers** in App Store Connect (*Users and Access > Sandbox*) and sign in with them on a test device; sandbox purchases are free. In Xcode you can also use a *StoreKit configuration file* to test without App Store Connect, and TestFlight builds use the sandbox too.
- **Stripe:** use *test mode* API keys and the test card `4242 4242 4242 4242` with any future expiry date and any CVC.
- **What to test** before every release: each product once; cancelling; closing the app during a purchase (the purchase must arrive on the next launch); restore on a fresh install; a refund; a slow-approving payment; no network.
