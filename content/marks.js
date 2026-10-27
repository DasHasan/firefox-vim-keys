// Marken: m<buchstabe> merkt die Scrollposition, `<buchstabe> springt dorthin.
// Kleinbuchstaben gelten pro Seite (URL ohne #), Großbuchstaben global: Sprung öffnet/aktiviert den Tab der Seite.
// `` springt zur Position vor dem letzten Sprung (Marke, gg, G, Suche).
"use strict";

const marks = (() => {
  let lastJump = null;
  const pageUrl = () => location.href.split("#")[0];

  function saveJump() { lastJump = [scrollX, scrollY]; }

  function await_(title, fn) {
    hud.show(title);
    modal = { onKey(key) { modal = null; hud.hide(); if (key !== "<esc>") fn(key); return true; } };
  }

  async function set(key) {
    if (!/^[a-zA-Z]$/.test(key)) return hud.flash("Marken: nur Buchstaben");
    const pos = [Math.round(scrollX), Math.round(scrollY)];
    if (key === key.toUpperCase()) {
      const { globalMarks = {} } = await browser.storage.local.get("globalMarks");
      globalMarks[key] = { url: location.href, pos };
      await browser.storage.local.set({ globalMarks });
    } else {
      const { localMarks = {} } = await browser.storage.local.get("localMarks");
      (localMarks[pageUrl()] ??= {})[key] = pos;
      await browser.storage.local.set({ localMarks });
    }
    hud.flash(`Marke ${key} gesetzt`);
  }

  async function jump(key) {
    if (key === "`" || key === "'") {
      if (!lastJump) return hud.flash("Noch kein Sprung");
      const to = lastJump; saveJump(); scrollTo(...to);
      return;
    }
    if (!/^[a-zA-Z]$/.test(key)) return hud.flash("Marken: nur Buchstaben");
    if (key === key.toUpperCase()) {
      const { globalMarks = {} } = await browser.storage.local.get("globalMarks");
      const m = globalMarks[key];
      if (!m) return hud.flash(`Marke ${key} nicht gesetzt`);
      if (m.url.split("#")[0] === pageUrl()) { saveJump(); scrollTo(...m.pos); return; }
      browser.runtime.sendMessage({ type: "gotoMark", url: m.url, pos: m.pos });
      return;
    }
    const { localMarks = {} } = await browser.storage.local.get("localMarks");
    const pos = localMarks[pageUrl()]?.[key];
    if (!pos) return hud.flash(`Marke ${key} nicht gesetzt`);
    saveJump(); scrollTo(...pos);
  }

  return { saveJump, set: () => await_("Marke setzen: Buchstabe …", set), jump: () => await_("Zu Marke springen: Buchstabe …", jump) };
})();

// Sprungposition auch vor gg, G und Suche merken
for (const cmd of ["scrollToTop", "scrollToBottom", "enterFindMode", "performFind", "performBackwardsFind"]) {
  const orig = commands[cmd];
  commands[cmd] = (...args) => { marks.saveJump(); return orig(...args); };
}

Object.assign(commands, {
  "Marks.activateCreate": () => marks.set(),
  "Marks.activate": () => marks.jump(),
});

// Globale Marke in einem anderen Tab: background.js schickt die Position nach dem Laden
browser.runtime.onMessage.addListener(msg => {
  if (msg.type === "scrollTo" && window === top) { marks.saveJump(); scrollTo(...msg.pos); }
});
