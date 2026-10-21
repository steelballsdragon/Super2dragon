/* Age of Conquest developer panel. Hidden by default: tap the logo on the start screen 7 times to turn developer
   mode on (U.devMode()). The city then shows a Dev button with unlimited resources, instant builds and training,
   max buildings, troops, every commander, the whole map, a long shield, finished timers and time skips. Every
   switch and action is a developer command that the simulation refuses outside developer mode. */

const U = window.AOCUI;
const { esc, fmt } = U;

// [command, label, note, toast] for the one-tap actions
const ACTIONS = [
  ['dev:hall', 'Max every building', 'Town Hall and every building to level 25', 'Every building raised.'],
  ['dev:troops', '+100,000 of each troop', 'Infantry, cavalry, archers and siege, at home', 'Troops added.'],
  ['dev:commanders', 'Every commander at max level', 'All twelve at level 40, ultimates unlocked', 'Commanders maxed.'],
  ['dev:finish', 'Finish all timers', 'Building, research, training, healing and the Exchange', 'Timers finished.'],
  ['dev:reveal', 'Reveal the whole map', 'Every tile explored', 'The map is revealed.'],
  ['dev:shield', 'Seven-day shield', 'Nobody can attack your city', 'Shield up for 7 days.'],
  ['dev:res', '50 million of each resource', 'Once, without keeping it full', 'Resources filled.'],
];
const SKIPS = [[60, '+1 hour'], [6 * 60, '+6 hours'], [24 * 60, '+1 day']];

function panelHtml(sw) {
  const toggle = (id, label, note, val) => `<button type="button" class="aoc-switch" data-sw="${id}" role="switch" aria-checked="${val ? 'true' : 'false'}">
      <span class="aoc-switch-t"><b>${label}</b><span>${note}</span></span><span class="aoc-knob" aria-hidden="true"></span></button>`;
  return `<div class="aoc-dev">
    <p class="aoc-p aoc-muted">Developer mode is on for this device. Turn it off here or with 7 taps on the start screen logo.</p>
    <h3 class="aoc-h4">Always on</h3>
    ${toggle('unlimited', 'Unlimited resources', `Every resource kept at ${fmt(50e6)}`, sw.unlimited)}
    ${toggle('instant', 'Instant builds and training', 'Building, research, training and healing finish as they start', sw.instant)}
    <h3 class="aoc-h4">One tap</h3>
    <div class="aoc-dev-grid">${ACTIONS.map(([c, label, note]) => `<button type="button" class="aoc-dev-act" data-dev="${c}"><b>${esc(label)}</b><span>${esc(note)}</span></button>`).join('')}</div>
    <h3 class="aoc-h4">Skip time</h3>
    <div class="aoc-chips">${SKIPS.map(([m, label]) => `<button type="button" class="aoc-btn ghost small" data-skip="${m}">${label}</button>`).join('')}</div>
    <p class="aoc-small aoc-muted">The 16x and 64x speeds sit with the other speeds at the top.</p>
  </div>`;
}
U.devPanel = () => {
  if (!U.dev) return null;
  const sw = U.F?.devSw || { unlimited: false, instant: false };
  const h = U.sheet({
    title: 'Developer', body: panelHtml(sw),
    actions: [{ label: 'Developer mode off', kind: 'red', id: 'aoc-dev-off', onClick: async () => {
      await U.host.cmd({ type: 'dev:unlimited', on: false });
      await U.host.cmd({ type: 'dev:instant', on: false });
      U.setDevMode(false);
      U.toast('Developer mode off', 'info');
      U.backToStart();
    } }],
  });
  h.body.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.sw) {
      const on = b.getAttribute('aria-checked') !== 'true';
      b.disabled = true;
      const r = await U.run({ type: 'dev:' + b.dataset.sw, on });
      b.disabled = false;
      if (r) { b.setAttribute('aria-checked', on ? 'true' : 'false'); U.toast(`${b.querySelector('b').textContent} ${on ? 'on' : 'off'}.`, 'good'); }
    }
    if (b.dataset.dev) {
      b.disabled = true;
      const a = ACTIONS.find(x => x[0] === b.dataset.dev);
      await U.run({ type: b.dataset.dev, level: 25 }, a[3]);
      b.disabled = false;
    }
    if (b.dataset.skip) {
      b.disabled = true;
      await U.run({ type: 'dev:skip', minutes: Number(b.dataset.skip) }, `Skipped ${b.textContent.replace('+', '')}.`);
      b.disabled = false;
    }
  });
  return h;
};
