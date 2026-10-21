// Test stand-in for the claude.ai artifact runtime (window.claude.use), so tests can exercise cloud saves
// without the platform. Each player is its own browser context (own localStorage, like its own
// device); the store they share lives in the Node test process and is reached through an exposed function:
//
//   const server = createMockServer();
//   await server.attach(context);                          // once per player context
//   await page.addInitScript(mockClaude, { uid, write });  // before the page loads
//
// It mirrors the documented shapes (db docs, collections, orderBy/limit, onSnapshot; user.id/can), not every rule: a viewer without write access gets invalid_argument outside its own
// data/users/<id>/ subtree, like a view-only visitor on the platform.

export function createMockServer() {
  const docs = new Map();   // path -> body
  const segs = p => p.split('/').length;
  function handle(op, a = {}) {
    switch (op) {
      case 'get': return docs.has(a.path) ? docs.get(a.path) : null;
      case 'set': docs.set(a.path, a.data); return true;
      case 'delete': docs.delete(a.path); return true;
      case 'list': return [...docs.entries()].filter(([k]) => k.startsWith(a.path + '/') && segs(k) === segs(a.path) + 1).map(([path, data]) => ({ path, data }));
      default: throw new Error('mock: unknown op ' + op);
    }
  }
  return {
    docs,
    async attach(context) { await context.exposeFunction('__mockServer', (op, a) => JSON.parse(JSON.stringify(handle(op, a) ?? null))); },
  };
}

// Runs inside the page (serialized by addInitScript): builds window.claude on top of window.__mockServer.
export function mockClaude(opts) {
  const uid = opts.uid;
  const canWrite = opts.write !== false;
  const call = (op, a) => window.__mockServer(op, a);
  const deny = () => Promise.reject({ code: 'invalid_argument', message: 'this viewer cannot write here' });
  const allowed = path => canWrite || path.startsWith('data/users/' + uid + '/');
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapDoc = (path, data) => Object.freeze({ id: path.split('/').pop(), exists: data != null, data: () => (data == null ? undefined : JSON.parse(JSON.stringify(data))), metadata: meta });
  const segs = p => p.split('/').length;
  // listeners re-read every 250 ms and fire when their result changed (the platform pushes; polling is close enough)
  const watchers = new Set();
  setInterval(async () => {
    for (const w of [...watchers]) {
      try { const r = await w.read(); const sig = JSON.stringify(r.sig); if (sig !== w.last) { w.last = sig; w.fire(r.value); } } catch (e) { /* page closing */ }
    }
  }, 250);
  const watch = (read, fire) => { const w = { read, fire, last: null }; watchers.add(w); return () => watchers.delete(w); };

  function docRef(path) {
    if (segs(path) % 2) throw new TypeError('document paths need an even number of segments: ' + path);
    const read = async () => { const d = await call('get', { path }); return { sig: d, value: snapDoc(path, d) }; };
    return {
      id: path.split('/').pop(),
      path,
      async get() { return (await read()).value; },
      async set(data) { if (!allowed(path)) return deny(); await call('set', { path, data: JSON.parse(JSON.stringify(data)) }); },
      async update(data) {
        if (!allowed(path)) return deny();
        const cur = await call('get', { path });
        if (!cur) return Promise.reject({ code: 'invalid_argument', message: 'missing document' });
        await call('set', { path, data: { ...cur, ...JSON.parse(JSON.stringify(data)) } });
      },
      async delete() { if (!allowed(path)) return deny(); await call('delete', { path }); },
      onSnapshot(next) { return watch(read, next); },
      collection(sub) { return collRef(path + '/' + sub); },
    };
  }
  function collRef(path, q = {}) {
    const read = async () => {
      let list = await call('list', { path });
      if (q.order) {
        const [f, dir] = q.order;
        list.sort((a, b) => ((a.data[f] ?? -Infinity) - (b.data[f] ?? -Infinity)) * (dir === 'desc' ? -1 : 1));
      }
      if (q.limit) list = list.slice(0, q.limit);
      const d = list.map(x => snapDoc(x.path, x.data));
      return { sig: list, value: Object.freeze({ docs: d, size: d.length, empty: !d.length, docChanges: () => [], metadata: meta }) };
    };
    return {
      path,
      doc(id) { return docRef(path + '/' + (id || Math.random().toString(36).slice(2, 12))); },
      async add(data) { const r = this.doc(); await r.set(data); return r; },
      orderBy(f, dir = 'asc') { return collRef(path, { ...q, order: [f, dir] }); },
      limit(n) { return collRef(path, { ...q, limit: n }); },
      where() { return collRef(path, q); },
      async get() { return (await read()).value; },
      onSnapshot(next) { return watch(read, next); },
    };
  }
  const db = Object.freeze({ doc: docRef, collection: p => collRef(p) });

  const user = Object.freeze({
    id: async () => uid,
    can: async name => (name === 'data.write' ? canWrite : null),
    isOwner: async () => !!opts.owner,
    canEdit: async () => canWrite,
    me: async () => ({ id: uid, name: '', avatarUrl: '', color: '#888', email: null, isOwner: !!opts.owner, canEdit: canWrite }),
    profiles: async ids => Object.fromEntries([].concat(ids).map(id => [id, { id, name: '', avatarUrl: '', color: '#888', email: null, isMe: id === uid, guest: false }])),
  });

  const caps = { db, user };
  window.claude = { use: async name => (opts.off ? null : caps[name] || null) };
}
