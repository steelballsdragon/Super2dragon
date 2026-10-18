/* Shop module stub (owner: shop agent): gems, store, VIP, packs. Replaced entirely. */
Game.registerModule({
  id: 'shop',
  initState: () => ({}),
});

Game.registerScreen('shop', {
  tab: { label: 'Shop', icon: 'gem', order: 5 },
  mount(el) {
    el.innerHTML = '<h2 class="section-title">Shop</h2>';
  },
});
