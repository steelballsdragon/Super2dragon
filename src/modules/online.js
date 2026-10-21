/* Last Furnace online play: chiefs online now (room presence), a power leaderboard (players/<id>) and world chat
   (chat collection), on the claude.ai artifact platform's storage. Who can join in is decided by the artifact's
   sharing: the owner and anyone invited as an Editor write; other signed-in visitors watch. Outside the Claude
   app (a saved file, another host) the World tab explains that online play is off and the game stays offline.
   Game.net is the public surface (the start screen reads Game.net.check()). Everything other players send is
   untrusted text: it is checked, clipped and rendered with textContent only. */

const NAME_MAX = 24;
const MSG_MAX = 160;
const CHAT_SHOW = 60;          // messages shown and subscribed
const CHAT_KEEP = 200;         // older messages are pruned now and then
const SEND_GAP_MS = 4000;      // one chat message per 4 s
const PLAYER_EVERY_MS = 60000; // leaderboard entry refresh, only when something changed
const PRESENCE_EVERY_MS = 20000;

const N = {
  state: 'idle',   // idle | connecting | on | watch | off
  note: '',
  db: null, room: null, user: null, uid: null,
  canWrite: false,
  peers: [], players: [], chat: [],
  unsub: [],
  lastPlayerJson: '', lastPlayerAt: 0, playerBusy: false,
  lastPresence: '', lastPresenceAt: 0,
  lastSend: 0, sending: false,
  readAt: 0,
  sub: 'chat',
  view: null,
};
const READ_KEY = 'last-furnace-chat-read';
N.readAt = Number(Game.storage.get(READ_KEY)) || 0;

Game.addIcon('globe', '<circle cx="12" cy="12" r="9" fill="#2f7fc4" stroke="#0f3a66" stroke-width="1.2"/><path d="M6 8.5c2 .5 2.5 2.5 4.5 2.5s1.5 2.5 3.5 3-1 3.5.5 5M14 4c-.5 1.5.5 2.5 2 2.8s2.5 1.6 3.4 3.4" fill="none" stroke="#9fe0a8" stroke-width="2" stroke-linecap="round"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="#bfe3ff" stroke-width=".8" opacity=".7"/>');
Game.addIcon('chat', '<path d="M4 5h16v11H9l-4 3.5V16H4Z" fill="#8fd8ff" stroke="#1d5a8a" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 9.5h8M8 12.5h5" stroke="#1d5a8a" stroke-width="1.6" stroke-linecap="round"/>');
Game.addIcon('trophy', '<path d="M7 4h10v4a5 5 0 0 1-10 0Z" fill="#ffd862" stroke="#9c5c0e" stroke-width="1.2"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3M17 6h2.5a2.5 2.5 0 0 1-2.6 3" fill="none" stroke="#9c5c0e" stroke-width="1.2"/><path d="M10.5 13h3l.5 4h-4Z" fill="#f3a72e"/><rect x="8" y="17" width="8" height="3" rx="1" fill="#9c5c0e"/>');

// ---------------------------------------------------------------- helpers
const esc = s => Game.esc(s);
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const int = (v, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
const me = () => ({
  name: clip(Game.S?.meta?.chiefName || 'Chief', NAME_MAX) || 'Chief',
  av: int(Game.S?.meta?.avatar ?? 0, 0, 5),
  power: Math.floor(Game.power?.() || 0),
  furnace: Game.furnaceLevel?.() || 1,
  stage: int(Game.mil?.highestStage?.() ?? 0, 0, 100000),
});
function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}
const useCap = name => {
  const use = window.claude?.use;
  if (typeof use !== 'function') return Promise.resolve(null);
  try { return Promise.resolve(use.call(window.claude, name)).catch(() => null); } catch (e) { return Promise.resolve(null); }
};

// ---------------------------------------------------------------- availability (also used by the start screen)
let checkP = null;
function check() {
  if (checkP) return checkP;
  checkP = (async () => {
    if (typeof window.claude?.use !== 'function') return { ok: false, write: false, note: 'Online play works when the game is opened in the Claude app.' };
    const [db, user] = await Promise.all([useCap('db'), useCap('user')]);
    const uid = user ? await user.id() : null;
    if (!db || !uid) return { ok: false, write: false, note: 'Sign in to Claude to play online.' };
    const can = await user.can('data.write');
    if (can === false) return { ok: true, write: false, note: 'You can watch the leaderboard and chat. Ask the owner to invite you as an Editor to join in.' };
    return { ok: true, write: true, note: 'Leaderboard, world chat and chiefs online' };
  })().catch(() => ({ ok: false, write: false, note: 'Online play is not available right now.' }));
  return checkP;
}

// ---------------------------------------------------------------- connect / disconnect
async function connect() {
  if (N.state === 'connecting' || N.state === 'on' || N.state === 'watch') return;
  if (!Game.onlineWanted()) { N.state = 'off'; N.note = 'Online play is switched off.'; return; }
  N.state = 'connecting';
  N.note = 'Connecting';
  const info = await check();
  if (!info.ok) { N.state = 'off'; N.note = info.note; return; }
  const [db, user, room] = await Promise.all([useCap('db'), useCap('user'), useCap('room')]);
  if (!Game.onlineWanted()) { N.state = 'off'; N.note = 'Online play is switched off.'; return; }
  N.db = db; N.user = user; N.room = room;
  N.uid = await user.id();
  N.canWrite = info.write;
  N.state = info.write ? 'on' : 'watch';
  N.note = info.note;
  try {
    N.unsub.push(db.collection('players').orderBy('power', 'desc').limit(50).onSnapshot(
      snap => { N.players = snap.docs.map(d => cleanPlayer(d.id, d.data())).filter(Boolean); },
      () => { N.players = []; },
    ));
    N.unsub.push(db.collection('chat').orderBy('ts', 'desc').limit(CHAT_SHOW).onSnapshot(
      snap => { N.chat = snap.docs.map(d => cleanMsg(d.id, d.data())).filter(Boolean).reverse(); chatChanged(); },
      () => { N.chat = []; },
    ));
  } catch (e) { console.warn('[online] subscribe failed', e); }
  if (room) {
    try {
      N.unsub.push(room.onPeers(ch => { N.peers = ch.peers.filter(p => p.kind === 'viewer'); }, () => { N.peers = []; }));
    } catch (e) { N.room = null; }
  }
  pushPresence(true);
  pushPlayer(true);
}
function disconnect(note) {
  for (const u of N.unsub.splice(0)) { try { u(); } catch (e) { /* already closed */ } }
  try { N.room?.presence?.({ name: null, power: null, furnace: null, av: null }).catch(() => {}); } catch (e) { /* gone */ }
  Object.assign(N, { state: 'off', note: note || 'Online play is switched off.', peers: [], players: [], chat: [], db: null, room: null });
  Game.badge('world', 0);
}

// ---------------------------------------------------------------- what other players sent (untrusted)
function cleanPlayer(id, d) {
  if (!d || typeof d !== 'object') return null;
  return {
    id,
    name: clip(d.name, NAME_MAX) || 'Chief',
    av: int(d.av, 0, 5),
    power: int(d.power, 0, 1e12),
    furnace: int(d.furnace, 1, 30),
    stage: int(d.stage, 0, 100000),
    at: int(d.at, 0, 4e12),
  };
}
function cleanMsg(id, d) {
  if (!d || typeof d !== 'object') return null;
  const text = clip(d.text, MSG_MAX);
  if (!text) return null;
  return { id, by: typeof d.by === 'string' ? d.by : '', name: clip(d.name, NAME_MAX) || 'Chief', av: int(d.av, 0, 5), furnace: int(d.furnace, 1, 30), text, ts: int(d.ts, 0, 4e12) };
}

// ---------------------------------------------------------------- what this player sends
async function pushPlayer(force) {
  if (N.state !== 'on' || !N.db || !N.uid || N.playerBusy) return;
  const m = me();
  const body = { name: m.name, av: m.av, power: m.power, furnace: m.furnace, stage: m.stage };
  const json = JSON.stringify(body);
  if (json === N.lastPlayerJson) return;
  if (!force && Date.now() - N.lastPlayerAt < PLAYER_EVERY_MS) return;
  N.playerBusy = true;
  try {
    await N.db.doc('players/' + N.uid).set({ ...body, at: Date.now() });
    N.lastPlayerJson = json;
    N.lastPlayerAt = Date.now();
  } catch (e) {
    if (e?.code === 'invalid_argument') { N.canWrite = false; N.state = 'watch'; N.note = 'You can watch the leaderboard and chat. Ask the owner to invite you as an Editor to join in.'; }
    N.lastPlayerAt = Date.now();
  } finally { N.playerBusy = false; }
}
function pushPresence(force) {
  if (!N.room || (N.state !== 'on' && N.state !== 'watch')) return;
  const m = me();
  const p = { name: m.name, av: m.av, power: m.power, furnace: m.furnace };
  const json = JSON.stringify(p);
  if (!force && (json === N.lastPresence || Date.now() - N.lastPresenceAt < PRESENCE_EVERY_MS)) return;
  N.lastPresence = json;
  N.lastPresenceAt = Date.now();
  try { N.room.presence(p).catch(() => {}); } catch (e) { /* room gone */ }
}
async function sendChat(text) {
  text = clip(text, MSG_MAX);
  if (!text || N.state !== 'on' || !N.db || N.sending) return false;
  const wait = N.lastSend + SEND_GAP_MS - Date.now();
  if (wait > 0) { Game.toast(`Wait ${Math.ceil(wait / 1000)}s before sending again`, 'info'); return false; }
  N.sending = true;
  const m = me();
  try {
    await N.db.collection('chat').add({ by: N.uid, name: m.name, av: m.av, furnace: m.furnace, text, ts: Date.now() });
    N.lastSend = Date.now();
    if (Math.random() < 0.15) pruneChat();
    return true;
  } catch (e) {
    if (e?.code === 'invalid_argument') { N.canWrite = false; N.state = 'watch'; N.note = 'You can watch the chat. Ask the owner to invite you as an Editor to send messages.'; }
    else if (e?.code === 'quota_exceeded') Game.toast('The chat is full right now. Try again later.', 'bad');
    else Game.toast('Message not sent. Check your connection.', 'bad');
    return false;
  } finally { N.sending = false; }
}
// the store holds at most 25,000 documents, so old chat is trimmed to the newest CHAT_KEEP
async function pruneChat() {
  try {
    const snap = await N.db.collection('chat').orderBy('ts', 'desc').limit(CHAT_KEEP + 40).get();
    for (const d of snap.docs.slice(CHAT_KEEP)) await N.db.doc('chat/' + d.id).delete();
  } catch (e) { /* trimming can wait */ }
}

// ---------------------------------------------------------------- unread badge
function unread() {
  return N.chat.filter(m => m.ts > N.readAt && m.by !== N.uid).length;
}
function chatChanged() {
  if (Game.screen?.() === 'world' && N.sub === 'chat') markRead();
  Game.badge('world', Math.min(99, unread()));
  if (N.view) renderChat(N.view, true);
}
function markRead() {
  const last = N.chat.length ? N.chat[N.chat.length - 1].ts : 0;
  if (last > N.readAt) {
    N.readAt = last;
    Game.storage.set(READ_KEY, String(last));
  }
  Game.badge('world', 0);
}

// ---------------------------------------------------------------- World screen
function mount(el) {
  N.view = el;
  el.innerHTML = `<div class="net">
    <section class="net-head panel">
      <div class="net-head-row">
        <span class="net-pill" data-f="pill"></span>
        <span class="net-online" data-f="online"></span>
      </div>
      <p class="net-note" data-f="note"></p>
      <div class="net-actions">
        <button type="button" class="btn small blue" id="net-toggle"></button>
      </div>
    </section>
    <section class="net-here" data-f="herewrap" hidden>
      <h3 class="section-title">Chiefs here now</h3>
      <div class="net-chips" data-f="here"></div>
    </section>
    <div class="net-tabs seg" role="group" aria-label="World">
      <button type="button" id="net-sub-chat" data-sub="chat">${Game.icon('chat', 18)}<span>World chat</span></button>
      <button type="button" id="net-sub-rank" data-sub="rank">${Game.icon('trophy', 18)}<span>Leaderboard</span></button>
    </div>
    <section class="net-chat" data-pane="chat">
      <ol class="net-msgs" data-f="msgs" aria-live="polite"></ol>
      <form class="net-send" id="net-send-form" autocomplete="off">
        <label class="sr-only" for="net-input">Message</label>
        <input id="net-input" type="text" maxlength="${MSG_MAX}" placeholder="Say something to every chief" enterkeyhint="send">
        <button type="submit" class="btn gold" id="net-send">Send</button>
      </form>
    </section>
    <section class="net-rank" data-pane="rank" hidden>
      <ol class="net-board" data-f="board"></ol>
    </section>
  </div>`;
  el.querySelector('#net-toggle').addEventListener('click', () => {
    const on = !Game.onlineWanted();
    Game.storage.set('last-furnace-online', on ? '1' : '0');
    Game.emit('online:pref', { on });
  });
  el.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => { N.sub = b.dataset.sub; update(el); if (N.sub === 'chat') markRead(); }));
  el.querySelector('#net-send-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input = el.querySelector('#net-input');
    if (await sendChat(input.value)) input.value = '';
  });
  update(el);
}
function update(el) {
  const q = s => el.querySelector(s);
  const live = N.state === 'on' || N.state === 'watch';
  const pill = q('[data-f="pill"]');
  const label = N.state === 'on' ? 'Online' : N.state === 'watch' ? 'Watching' : N.state === 'connecting' ? 'Connecting' : 'Offline';
  Game.setText(pill, label);
  pill.className = 'net-pill is-' + (N.state === 'on' ? 'on' : N.state === 'watch' ? 'watch' : N.state === 'connecting' ? 'wait' : 'off');
  Game.setText(q('[data-f="online"]'), live ? `${Math.max(1, N.peers.length)} ${N.peers.length === 1 ? 'chief' : 'chiefs'} here now` : '');
  Game.setText(q('[data-f="note"]'), N.note || 'Leaderboard, world chat and chiefs online.');
  Game.setText(q('#net-toggle'), Game.onlineWanted() ? 'Go offline' : 'Go online');
  // chiefs here now
  q('[data-f="herewrap"]').hidden = !live || !N.peers.length;
  const hereSig = N.peers.map(p => p.peer + JSON.stringify(p.presence)).join('|');
  if (hereSig !== q('[data-f="here"]').dataset.sig) {
    q('[data-f="here"]').dataset.sig = hereSig;
    const box = q('[data-f="here"]');
    box.textContent = '';
    for (const p of N.peers.slice(0, 30)) {
      const pr = p.presence || {};
      const chip = document.createElement('div');
      chip.className = 'net-chip' + (p.isMe ? ' is-me' : '');
      chip.innerHTML = `<span class="net-av">${Game.avatarSvg(int(pr.av, 0, 5), 28)}</span><span class="net-chip-t"><b></b><small></small></span>`;
      chip.querySelector('b').textContent = (clip(pr.name, NAME_MAX) || 'Chief') + (p.isMe && p.sameTab ? ' (you)' : '');
      chip.querySelector('small').textContent = `Furnace Lv ${int(pr.furnace, 1, 30)}`;
      box.appendChild(chip);
    }
  }
  // sub tabs
  for (const b of el.querySelectorAll('[data-sub]')) b.setAttribute('aria-pressed', String(b.dataset.sub === N.sub));
  q('[data-pane="chat"]').hidden = N.sub !== 'chat';
  q('[data-pane="rank"]').hidden = N.sub !== 'rank';
  // send box
  const canSend = N.state === 'on';
  q('#net-input').disabled = !canSend;
  q('#net-send').disabled = !canSend || N.sending;
  q('#net-input').placeholder = canSend ? 'Say something to every chief' : live ? 'Only invited chiefs can send messages' : 'Go online to chat';
  renderChat(el, false);
  renderBoard(el);
}
function renderChat(el, scroll) {
  const box = el.querySelector('[data-f="msgs"]');
  if (!box) return;
  const sig = N.chat.length ? N.chat[N.chat.length - 1].id + ':' + N.chat.length : (N.state + 'empty');
  if (box.dataset.sig === sig) return;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.dataset.sig = sig;
  box.textContent = '';
  if (!N.chat.length) {
    const li = document.createElement('li');
    li.className = 'net-empty';
    li.textContent = N.state === 'on' || N.state === 'watch' ? 'No messages yet. Say hello to the other chiefs.' : 'Chat appears here when you are online.';
    box.appendChild(li);
    return;
  }
  for (const m of N.chat) {
    const li = document.createElement('li');
    li.className = 'net-msg' + (m.by && m.by === N.uid ? ' is-me' : '');
    li.innerHTML = `<span class="net-av">${Game.avatarSvg(m.av, 30)}</span><div class="net-msg-body"><div class="net-msg-head"><b></b><small class="net-lv"></small><small class="net-when"></small></div><p></p></div>`;
    li.querySelector('b').textContent = m.name;
    li.querySelector('.net-lv').textContent = `Lv ${m.furnace}`;
    li.querySelector('.net-when').textContent = timeAgo(m.ts);
    li.querySelector('p').textContent = m.text;
    box.appendChild(li);
  }
  if (scroll || atBottom) box.scrollTop = box.scrollHeight;
}
function renderBoard(el) {
  const box = el.querySelector('[data-f="board"]');
  if (!box) return;
  const sig = N.players.map(p => p.id + p.power + p.name + p.furnace).join('|') + N.state;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.textContent = '';
  if (!N.players.length) {
    const li = document.createElement('li');
    li.className = 'net-empty';
    li.textContent = N.state === 'on' || N.state === 'watch' ? 'No chiefs ranked yet.' : 'The leaderboard appears here when you are online.';
    box.appendChild(li);
    return;
  }
  N.players.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'net-row' + (p.id === N.uid ? ' is-me' : '') + (i < 3 ? ' is-top' + (i + 1) : '');
    li.innerHTML = `<span class="net-rank-n">${i + 1}</span><span class="net-av">${Game.avatarSvg(p.av, 32)}</span><span class="net-row-t"><b></b><small></small></span><span class="net-pow">${Game.icon('power', 15)}<span></span></span>`;
    li.querySelector('b').textContent = p.name + (p.id === N.uid ? ' (you)' : '');
    li.querySelector('small').textContent = `Furnace Lv ${p.furnace}`;
    li.querySelector('.net-pow span').textContent = Game.fmt(p.power);
    box.appendChild(li);
  });
}

// ---------------------------------------------------------------- module
Game.registerModule({
  id: 'net',
  tick() {
    if (N.state === 'on') pushPlayer(false);
    pushPresence(false);
  },
});
Game.registerScreen('world', {
  tab: { label: 'World', icon: 'globe', order: 6 },
  mount,
  update,
});
Game.registerNav('world', rest => { if (rest === 'chat' || rest === 'rank') N.sub = rest; });
Game.on('ready', () => { connect(); });
Game.on('screen:shown', ({ id } = {}) => { if (id === 'world' && N.sub === 'chat') markRead(); });
Game.on('online:pref', ({ on } = {}) => { if (on) { checkP = null; N.state = 'idle'; connect(); } else disconnect(); });

Game.net = {
  check,
  status: () => ({ state: N.state, note: N.note, peers: N.peers.length }),
  send: sendChat,
};
