// Befehle, die Tabs oder die Zwischenablage brauchen. Aufruf vom Content-Script per
// { type: "command", cmd, count, opts }; ein zurückgegebener Text wird dort als Meldung angezeigt.
"use strict";

// Zuletzt aktiver Tab pro Fenster (für visitPreviousTab), in storage.session wegen Event-Page
browser.tabs.onActivated.addListener(async ({ previousTabId, windowId }) => {
  if (previousTabId === undefined) return;
  const { prevTab = {} } = await browser.storage.session.get("prevTab");
  prevTab[windowId] = previousTabId;
  await browser.storage.session.set({ prevTab });
});

const visibleTabs = tab => browser.tabs.query({ windowId: tab.windowId, hidden: false });
const activate = id => browser.tabs.update(id, { active: true });

async function relativeTab(tab, delta) {
  const tabs = await visibleTabs(tab), i = tabs.findIndex(t => t.id === tab.id);
  await activate(tabs[((i + delta) % tabs.length + tabs.length) % tabs.length].id);
}

const looksLikeUrl = s => !/\s/.test(s) && (/^[a-z][\w+.-]*:/i.test(s) && !/^[\w-]+:\d/.test(s) || /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(s) || /^localhost(:\d+)?([/?#]|$)/.test(s));

async function openCopied(tab, newTab) {
  const text = (await navigator.clipboard.readText()).trim();
  if (!text) return "Zwischenablage ist leer";
  let target = tab;
  if (looksLikeUrl(text)) {
    const url = /^[a-z][\w+.-]*:/i.test(text) ? text : "https://" + text;
    if (newTab) await browser.tabs.create({ url, windowId: tab.windowId, index: tab.index + 1 });
    else await browser.tabs.update(tab.id, { url });
    return;
  }
  if (newTab) target = await browser.tabs.create({ windowId: tab.windowId, index: tab.index + 1 });
  await browser.search.search({ query: text, tabId: target.id });
}

// Globale Marke: vorhandenen Tab mit der URL aktivieren, sonst neuen öffnen; nach dem Laden Position setzen
async function gotoMark(url, pos) {
  const base = url.split("#")[0];
  const tabs = await browser.tabs.query({});
  let tab = tabs.find(t => t.url && t.url.split("#")[0] === base);
  if (tab) {
    await browser.tabs.update(tab.id, { active: true });
    await browser.windows.update(tab.windowId, { focused: true });
  } else {
    tab = await browser.tabs.create({ url });
    await new Promise(resolve => {
      const done = (id, info) => { if (id === tab.id && info.status === "complete") { browser.tabs.onUpdated.removeListener(done); resolve(); } };
      browser.tabs.onUpdated.addListener(done);
    });
  }
  await browser.tabs.sendMessage(tab.id, { type: "scrollTo", pos }, { frameId: 0 });
}

// Vomnibar-Vorschläge: alle Suchwörter müssen in Titel oder URL vorkommen; Treffer im Titel zählen mehr
const isWebUrl = u => /^(https?|ftp|file):/.test(u || "");

function score(terms, title, url) {
  const t = (title || "").toLowerCase(), u = (url || "").toLowerCase();
  let s = 0;
  for (const w of terms) {
    if (t.includes(w)) s += 2; else if (u.includes(w)) s += 1; else return -1;
  }
  return s;
}

async function vomnibarSuggest(mode, query, tab) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [], seen = new Set();
  const add = (kind, list, bonus) => {
    for (const x of list) {
      if (!x.url || seen.has(x.url) || kind !== "tab" && !isWebUrl(x.url)) continue;
      const s = score(terms, x.title, x.url);
      if (s < 0) continue;
      seen.add(x.url);
      out.push({ kind, title: x.title, url: x.url, tabId: kind === "tab" ? x.id : undefined, s: s + bonus });
    }
  };
  if (mode === "tabs") {
    add("tab", (await browser.tabs.query({})).filter(t => t.id !== tab.id), 0);
    return terms.length ? out.sort((a, b) => b.s - a.s) : out;
  }
  if (mode === "bookmarks") {
    add("bookmark", terms.length ? await browser.bookmarks.search(query) : await browser.bookmarks.getRecent(20), 0);
    return out.sort((a, b) => b.s - a.s).slice(0, 20);
  }
  if (terms.length) {
    add("tab", (await browser.tabs.query({})).filter(t => t.id !== tab.id), 1);
    add("bookmark", await browser.bookmarks.search(terms[0]), 1);
  }
  add("history", await browser.history.search({ text: terms.length ? terms[0] : "", startTime: 0, maxResults: 200 }), 0);
  const ranked = (terms.length ? out.sort((a, b) => b.s - a.s) : out).slice(0, 15);
  if (query) ranked.unshift({ kind: "typed", text: query, title: (looksLikeUrl(query) ? "Öffnen: " : "Suchen: ") + query });
  return ranked;
}

async function vomnibarOpen(msg, tab) {
  if (msg.tabId) {
    const t = await browser.tabs.update(msg.tabId, { active: true });
    await browser.windows.update(t.windowId, { focused: true });
    return;
  }
  const text = msg.url || msg.text;
  if (msg.url || looksLikeUrl(text)) {
    const url = /^[a-z][\w+.-]*:/i.test(text) ? text : "https://" + text;
    if (msg.newTab) await browser.tabs.create({ url, windowId: tab.windowId, index: tab.index + 1 });
    else await browser.tabs.update(tab.id, { url });
    return;
  }
  const target = msg.newTab ? await browser.tabs.create({ windowId: tab.windowId, index: tab.index + 1 }) : tab;
  await browser.search.search({ query: text, tabId: target.id });
}

// Link-Hints über alle Frames: Tab-ID -> { origin, cmd, opts, owner: Map(label -> frameId), frames, typed, ready }
const hintState = new Map();
const toFrame = (tabId, frameId, msg) => browser.tabs.sendMessage(tabId, msg, { frameId }).catch(() => undefined);

function hintsBroadcast(tabId, st, msg) {
  for (const id of new Set([...st.frames, st.origin])) toFrame(tabId, id, msg);
}

async function hintsCollect(tabId, st) {
  const found = [], queue = [0], seen = new Set();
  while (queue.length && seen.size < 100) {   // nur sichtbare Frames, ausgehend vom obersten
    const frameId = queue.shift();
    if (seen.has(frameId)) continue;
    seen.add(frameId);
    const r = await toFrame(tabId, frameId, { type: "hintsCollect" });
    if (!r) continue;
    if (r.count) found.push({ frameId, count: r.count });
    queue.push(...r.frames);
  }
  const labels = VK.hintLabels(found.reduce((n, f) => n + f.count, 0));
  let i = 0;
  st.owner = new Map(); st.frames = found.map(f => f.frameId); st.typed = "";
  for (const f of found) {
    const mine = labels.slice(i, i += f.count);
    for (const l of mine) st.owner.set(l, f.frameId);
    toFrame(tabId, f.frameId, { type: "hintsShow", labels: mine });
  }
  return labels.length;
}

async function hintsStart(tab, frameId, cmd, opts) {
  const st = { origin: frameId, cmd, opts, owner: new Map(), frames: [], typed: "" };
  hintState.set(tab.id, st);
  st.ready = hintsCollect(tab.id, st);
  if (await st.ready) return;
  if (hintState.get(tab.id) === st) hintState.delete(tab.id);
  hintsBroadcast(tab.id, st, { type: "hintsStop" });
  return "Keine anklickbaren Elemente";
}

// Tasten nacheinander abarbeiten, sonst überholt die zweite Taste den Klick der ersten
let hintChain = Promise.resolve();
const hintsKey = (tabId, key) => (hintChain = hintChain.then(() => hintsKeyNow(tabId, key), () => {}));

async function hintsKeyNow(tabId, key) {
  const st = hintState.get(tabId);
  if (!st) return;
  await st.ready;
  if (key === "<stop>") { hintState.delete(tabId); return hintsBroadcast(tabId, st, { type: "hintsStop" }); }
  const next = key === "<back>" ? st.typed.slice(0, -1) : st.typed + key;
  const left = [...st.owner.keys()].filter(l => l.startsWith(next));
  if (!left.length) return;
  st.typed = next;
  if (left.length > 1 || left[0] !== next) return hintsBroadcast(tabId, st, { type: "hintsFilter", typed: next });
  const repeat = st.cmd === "LinkHints.activateWithQueue";
  await toFrame(tabId, st.owner.get(next), { type: "hintsHit", label: next, cmd: st.cmd, opts: st.opts });
  hintsBroadcast(tabId, st, { type: "hintsStop", restart: repeat });
  if (!repeat) { hintState.delete(tabId); return; }
  st.ready = hintsCollect(tabId, st);
  if (!(await st.ready)) { hintState.delete(tabId); hintsBroadcast(tabId, st, { type: "hintsStop" }); }
}

const commands = {
  nextTab: (tab, n) => relativeTab(tab, n),
  previousTab: (tab, n) => relativeTab(tab, -n),
  firstTab: async (tab, n) => { const tabs = await visibleTabs(tab); await activate(tabs[Math.min(n, tabs.length) - 1].id); },
  lastTab: async (tab, n) => { const tabs = await visibleTabs(tab); await activate(tabs[Math.max(0, tabs.length - n)].id); },
  async visitPreviousTab(tab) {
    const { prevTab = {} } = await browser.storage.session.get("prevTab");
    const id = prevTab[tab.windowId];
    try { await activate(id); } catch { return "Kein vorheriger Tab"; }
  },

  async createTab(tab, n) {
    for (let i = 0; i < n; i++) await browser.tabs.create({ windowId: tab.windowId, index: tab.index + 1 + i });
  },
  async removeTab(tab, n) {
    const tabs = await visibleTabs(tab), i = tabs.findIndex(t => t.id === tab.id);
    await browser.tabs.remove(tabs.slice(i, i + n).map(t => t.id));
  },
  async restoreTab(tab, n) {
    for (let i = 0; i < n; i++) {
      const [last] = await browser.sessions.getRecentlyClosed({ maxResults: 1 });
      if (!last) return i ? undefined : "Kein geschlossener Tab";
      await browser.sessions.restore((last.tab || last.window).sessionId);
    }
  },
  duplicateTab: async (tab, n) => { for (let i = 0; i < n; i++) await browser.tabs.duplicate(tab.id); },
  async reopenTab(tab) {
    await browser.tabs.create({ url: tab.url, windowId: tab.windowId, index: tab.index + 1, pinned: tab.pinned });
    await browser.tabs.remove(tab.id);
  },
  togglePinTab: tab => browser.tabs.update(tab.id, { pinned: !tab.pinned }).then(() => {}),
  async toggleMuteTab(tab) {
    const muted = !tab.mutedInfo.muted;
    await browser.tabs.update(tab.id, { muted });
    return muted ? "Tab stumm" : "Ton an";
  },
  moveTabLeft: (tab, n) => browser.tabs.move(tab.id, { index: Math.max(0, tab.index - n) }).then(() => {}),
  moveTabRight: (tab, n) => browser.tabs.move(tab.id, { index: tab.index + n }).then(() => {}),
  async moveTabToNextWindow(tab) {
    const wins = (await browser.windows.getAll({ windowTypes: ["normal"] })).filter(w => w.incognito === tab.incognito);
    const next = wins[(wins.findIndex(w => w.id === tab.windowId) + 1) % wins.length];
    if (!next || next.id === tab.windowId) { await browser.windows.create({ tabId: tab.id }); return; }
    await browser.tabs.move(tab.id, { windowId: next.id, index: -1 });
    await activate(tab.id);
    await browser.windows.update(next.id, { focused: true });
  },

  reload: tab => browser.tabs.reload(tab.id),
  reloadTab: tab => browser.tabs.reload(tab.id),
  reloadGivenTab: tab => browser.tabs.reload(tab.id, { bypassCache: true }),

  async copyCurrentUrl(tab) {
    await navigator.clipboard.writeText(tab.url);
    return "Kopiert: " + tab.url;
  },
  openCopiedUrlInCurrentTab: tab => openCopied(tab, false),
  openCopiedUrlInNewTab: tab => openCopied(tab, true),
};

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "copy") return navigator.clipboard.writeText(msg.text);
  if (msg.type === "hintsStart") return hintsStart(sender.tab, sender.frameId, msg.cmd, msg.opts);
  if (msg.type === "hintsKey") { hintsKey(sender.tab.id, msg.key); return; }
  if (msg.type === "vomnibar")return vomnibarSuggest(msg.mode, msg.query, sender.tab);
  if (msg.type === "vomnibarOpen") return vomnibarOpen(msg, sender.tab);
  if (msg.type === "gotoMark")return gotoMark(msg.url, msg.pos);
  if (msg.type === "openTab") {
    const t = sender.tab;
    return browser.tabs.create({ url: msg.url, active: msg.active, windowId: t.windowId, index: t.index + 1, openerTabId: t.id }).then(() => {});
  }
  if (msg.type !== "command" || !sender.tab || !commands[msg.cmd]) return;
  return Promise.resolve(commands[msg.cmd](sender.tab, msg.count || 1, msg.opts || {}))
    .then(r => typeof r === "string" ? r : undefined, e => "Fehler: " + e.message);
});
