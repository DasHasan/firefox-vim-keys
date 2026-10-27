// Vomnibar: Eingabezeile mit Vorschlägen aus offenen Tabs, Lesezeichen und Verlauf (Suche in background.js).
// Enter öffnet den markierten Vorschlag bzw. die Eingabe (URL oder Suche mit der Standardsuchmaschine),
// Shift+Enter in neuem Tab. Pfeiltasten/Tab wählen aus, Esc schließt.
"use strict";

const vomnibar = (() => {
  const o = vkOverlay("vim-keys-vomnibar", "left:50%;top:12vh;transform:translateX(-50%);width:min(760px,92vw);", "open");
  const box = vkEl("div", "font:14px/1.4 system-ui,sans-serif;color:#eee;background:#222f;border-radius:6px;" +
    "box-shadow:0 4px 18px #000a;overflow:hidden");
  const input = vkEl("input", "all:unset;box-sizing:border-box;display:block;width:100%;padding:10px 14px;" +
    "font:16px system-ui,sans-serif;color:#fff;caret-color:#fff;border-bottom:1px solid #444");
  const list = vkEl("div", "max-height:60vh;overflow-y:auto");
  box.append(input, list);
  o.root.append(box);
  input.spellcheck = false;

  let open = false, newTab = false, mode = "omni", items = [], sel = -1, seq = 0, timer;

  function render() {
    list.replaceChildren(...items.map((it, i) => {
      const row = vkEl("div", "padding:5px 14px;cursor:pointer;" + (i === sel ? "background:#3d5a80;" : ""));
      const tag = { tab: "Tab", bookmark: "★", history: "↺", typed: "→" }[it.kind] || "";
      row.append(vkEl("div", "white-space:nowrap;overflow:hidden;text-overflow:ellipsis",
        `${tag}  ${it.title || it.url}`),
        vkEl("div", "font-size:12px;color:#9ab;white-space:nowrap;overflow:hidden;text-overflow:ellipsis", it.url || ""));
      row.addEventListener("mousedown", e => { e.preventDefault(); sel = i; choose(newTab); });
      return row;
    }));
    list.children[sel]?.scrollIntoView({ block: "nearest" });
  }

  async function update() {
    const my = ++seq;
    const res = await browser.runtime.sendMessage({ type: "vomnibar", mode, query: input.value.trim() });
    if (my !== seq || !open) return;
    items = res || [];
    sel = items.length ? 0 : -1;
    render();
  }

  // alte Vorschläge sofort verwerfen, damit ein schnelles Enter die Eingabe öffnet
  input.addEventListener("input", () => { seq++; items = []; sel = -1; clearTimeout(timer); timer = setTimeout(update, 60); });

  function start(m, inNewTab, text = "") {
    mode = m; newTab = inNewTab; open = true;
    input.value = text; input.placeholder = { omni: "URL, Lesezeichen, Verlauf …", bookmarks: "Lesezeichen …", tabs: "Offene Tabs …" }[m];
    items = []; sel = -1; render();
    o.attach(); input.focus(); input.select();
    update();
  }

  function close() { open = false; seq++; o.host.remove(); }

  function choose(inNewTab) {
    const it = items[sel], text = input.value.trim();
    close();
    if (it?.kind === "tab") return browser.runtime.sendMessage({ type: "vomnibarOpen", tabId: it.tabId });
    const target = it ? (it.kind === "typed" ? { text: it.text } : { url: it.url }) : text ? { text } : null;
    if (target) browser.runtime.sendMessage({ type: "vomnibarOpen", ...target, newTab: inNewTab });
  }

  function move(d) {
    if (!items.length) return;
    sel = ((sel + d) % items.length + items.length) % items.length;
    render();
  }

  // true = Taste verschlucken; sonst landet sie im Eingabefeld
  function onKey(key) {
    if (key === "<esc>") { close(); return true; }
    if (key === "<enter>") { choose(newTab); return true; }
    if (key === "<s-enter>") { choose(!newTab); return true; }
    if (key === "<down>" || key === "<tab>" || key === "<c-j>" || key === "<c-n>") { move(1); return true; }
    if (key === "<up>" || key === "<s-tab>" || key === "<c-k>" || key === "<c-p>") { move(-1); return true; }
    return false;
  }

  // Klick außerhalb schließt
  addEventListener("mousedown", e => { if (open && !e.composedPath().includes(o.host)) close(); }, true);

  return { start, onKey, get active() { return open; } };
})();

Object.assign(commands, {
  "Vomnibar.activate": () => vomnibar.start("omni", false),
  "Vomnibar.activateInNewTab": () => vomnibar.start("omni", true),
  "Vomnibar.activateBookmarks": () => vomnibar.start("bookmarks", false),
  "Vomnibar.activateBookmarksInNewTab": () => vomnibar.start("bookmarks", true),
  "Vomnibar.activateTabs": () => vomnibar.start("tabs", false),
  "Vomnibar.activateUrl": () => vomnibar.start("omni", false, location.href),
  "Vomnibar.activateUrlInNewTab": () => vomnibar.start("omni", true, location.href),
});

for (const type of ["keypress", "keyup"])
  addEventListener(type, e => { if (vomnibar.active) e.stopImmediatePropagation(); }, true);
