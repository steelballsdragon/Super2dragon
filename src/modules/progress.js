/* Progress module stub (owner: progress agent): chapter quests, daily missions, login calendar, profile, mail. Replaced entirely. */
Game.registerModule({
  id: 'prog',
  initState: () => ({}),
});

Game.registerScreen('events', {
  tab: { label: 'Events', icon: 'calendar', order: 4 },
  mount(el) {
    el.innerHTML = '<h2 class="section-title">Events</h2>';
  },
});

Game.registerScreen('profile', {
  tab: null,
  title: 'Chief',
  mount(el) {
    el.innerHTML = '<h2 class="section-title">Chief</h2><button type="button" class="btn ghost" data-back>Back</button>';
    el.querySelector('[data-back]').addEventListener('click', () => Game.back());
  },
});
