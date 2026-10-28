// Link-Hints über alle Frames eines Tabs: background.js fragt jeden sichtbaren Frame nach seinen anklickbaren
// Elementen, vergibt die Labels gemeinsam und verteilt die getippten Buchstaben. Jeder Frame zeichnet seine
// Marker selbst (keine Koordinaten über Frame-Grenzen), der Frame mit dem gewählten Element führt die Aktion aus.
// Shadow-DOM bewusst "open", damit test-vim-keys.ps1 die Marker lesen kann (enthält nur die Buchstaben).
"use strict";

const hints = (() => {
  const o = vkOverlay("vim-keys-hints", "inset:0;pointer-events:none;", "open");
  let found = [], items = [], typing = false;   // typing: dieser Frame hat den Fokus und leitet Tasten weiter

  const ROLES = /^(button|link|checkbox|radio|tab|menuitem|menuitemcheckbox|menuitemradio|option|switch|treeitem|combobox|textbox|searchbox)$/;

  function isClickable(el) {
    switch (el.localName) {
      case "a": return el.hasAttribute("href") || el.hasAttribute("onclick");
      case "button": case "select": case "textarea": return !el.disabled;
      case "input": return el.type !== "hidden" && !el.disabled;
      case "summary": case "video": case "audio": return true;
    }
    if (el.isContentEditable) return !el.parentElement?.isContentEditable;
    if (el.hasAttribute("onclick") || ROLES.test(el.getAttribute("role") || "")) return true;
    const ti = el.getAttribute("tabindex");
    if (ti !== null && +ti >= 0) return true;
    // Web-Apps mit JS-Klickhandlern: Zeiger-Cursor, aber nur das äußerste Element
    return getComputedStyle(el).cursor === "pointer" && el.parentElement && getComputedStyle(el.parentElement).cursor !== "pointer";
  }

  function hitRect(el) {
    for (const r of el.getClientRects()) {
      if (r.width < 3 || r.height < 3 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue;
      const x = Math.min(Math.max(r.left + Math.min(r.width / 2, 8), 0), innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      let hit = (el.getRootNode().elementFromPoint || document.elementFromPoint).call(el.getRootNode(), x, y);
      if (hit && (hit === el || el.contains(hit) || hit.contains(el) && hit.localName === "label")) return r;
      if (hit && el.contains(hit.getRootNode().host)) return r;
    }
    return null;
  }

  // sichtbare anklickbare Elemente nach out, sichtbare Unterframes (frameId) nach frames
  function collect(root, out, frames) {
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) collect(el.shadowRoot, out, frames);
      if (el.localName === "iframe" || el.localName === "frame") {
        if (hitRect(el)) { const id = browser.runtime.getFrameId(el); if (id >= 0) frames.push(id); }
        continue;
      }
      if (el.localName.startsWith("vim-keys-") || !isClickable(el)) continue;
      const r = hitRect(el);
      if (r) out.push({ el, r });
    }
    return out;
  }

  function render(typed) {
    for (const it of items) {
      it.marker.style.display = it.label.startsWith(typed) ? "" : "none";
      it.marker.firstChild.textContent = it.label.slice(0, typed.length);
      it.marker.lastChild.textContent = it.label.slice(typed.length);
    }
  }

  function show(labels) {
    items = found.slice(0, labels.length).map(({ el, r }, i) => {
      const m = vkEl("div", `position:fixed;left:${Math.max(0, r.left)}px;top:${Math.max(0, r.top)}px;` +
        "font:bold 11px/1.2 ui-monospace,Consolas,monospace;color:#302505;background:linear-gradient(#fff785,#ffc542);" +
        "border:1px solid #c38a22;border-radius:3px;padding:0 3px;box-shadow:0 1px 3px #0005;text-transform:uppercase;white-space:nowrap");
      m.append(vkEl("span", "color:#d4ac3a"), vkEl("span"));
      m.dataset.label = labels[i];
      m.style.zIndex = i;
      return { el, label: labels[i], marker: m };
    });
    found = [];
    o.root.replaceChildren(...items.map(it => it.marker));
    render("");
    o.attach();
  }

  // Leertaste: in jeder Gruppe sich überlappender Marker kommt der unterste nach vorn
  function rotate() {
    const vis = items.filter(it => it.marker.style.display !== "none");
    const rs = vis.map(it => it.marker.getBoundingClientRect());
    const parent = vis.map((_, i) => i);
    const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    for (let i = 0; i < vis.length; i++)
      for (let j = i + 1; j < vis.length; j++)
        if (rs[i].left < rs[j].right && rs[j].left < rs[i].right && rs[i].top < rs[j].bottom && rs[j].top < rs[i].bottom)
          parent[find(i)] = find(j);
    const groups = new Map();
    vis.forEach((it, i) => { const g = find(i); groups.set(g, [...(groups.get(g) || []), it]); });
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      g.sort((a, b) => a.marker.style.zIndex - b.marker.style.zIndex);
      const zs = g.map(it => it.marker.style.zIndex);
      g.forEach((it, i) => { it.marker.style.zIndex = zs[(i - 1 + g.length) % g.length]; });
    }
  }

  function clear() { items = []; found = []; o.host.remove(); }

  // im fokussierten Frame: Hint-Modus beginnen, Sammeln und Labelvergabe macht background.js
  function start(cmd, opts) {
    typing = true;
    hud.show(HINT_ACTIONS[cmd](opts).title);
    browser.runtime.sendMessage({ type: "hintsStart", cmd, opts }).then(msg => {
      if (msg) { typing = false; hud.flash(msg); }
    });
  }

  // true = Taste verarbeitet (im Hint-Modus werden alle Tasten verschluckt)
  function onKey(key) {
    let k = null;
    if (key === "<esc>" || key === "f" || key === "F") k = "<stop>";
    else if (key === "<backspace>") k = "<back>";
    else if (key === "<space>") k = "<rotate>";
    else if (key.length === 1 && VK.HINT_CHARS.includes(key.toLowerCase())) k = key.toLowerCase();
    if (k) browser.runtime.sendMessage({ type: "hintsKey", key: k });
    return true;
  }

  browser.runtime.onMessage.addListener(msg => {
    switch (msg.type) {
      case "hintsCollect": {
        const frames = [];
        found = collect(document, [], frames);
        return Promise.resolve({ count: found.length, frames });
      }
      case "hintsShow": show(msg.labels); return;
      case "hintsFilter": render(msg.typed); return;
      case "hintsRotate": rotate(); return;
      case "hintsHit": {
        const it = items.find(i => i.label === msg.label);
        clear();
        if (it) HINT_ACTIONS[msg.cmd](msg.opts).run(it.el);
        return Promise.resolve(true);
      }
      case "hintsStop":
        clear();
        if (typing && !msg.restart) { typing = false; hud.hide(); }
        return;
    }
  });

  return { start, onKey, get active() { return typing; } };
})();

// --- Aktionen auf dem gewählten Element ------------------------------------------------------------

function vkMouse(el, type, button = 0) {
  const r = el.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, composed: true, view: window, button, buttons: button === 2 ? 2 : type.endsWith("down") ? 1 : 0,
    clientX: r.left + Math.min(r.width / 2, 8), clientY: r.top + r.height / 2 };
  const C = type.startsWith("pointer") ? PointerEvent : MouseEvent;
  return el.dispatchEvent(new C(type, type.startsWith("pointer") ? { ...init, pointerType: "mouse", isPrimary: true } : init));
}

function linkUrl(el) {
  const a = el.closest("a[href]");
  return a && !/^javascript:/i.test(a.getAttribute("href")) ? a.href : null;
}

function vkClick(el) {
  if (isEditable(el) || el.localName === "select") { el.focus(); if (el.localName === "select") try { el.showPicker(); } catch {} return; }
  vkMouse(el, "pointerdown"); vkMouse(el, "mousedown");
  if (el.focus && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  vkMouse(el, "pointerup"); vkMouse(el, "mouseup");
  el.click();
}

function vkOpenInTab(el, active) {
  const url = linkUrl(el);
  if (!url) return vkClick(el);
  browser.runtime.sendMessage({ type: "openTab", url, active });
}

function vkHover(el) {
  for (const t of ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointermove", "mousemove"]) vkMouse(el, t);
}

function vkContextMenu(el) {
  vkMouse(el, "pointerdown", 2); vkMouse(el, "mousedown", 2);
  vkMouse(el, "pointerup", 2); vkMouse(el, "mouseup", 2);
  vkMouse(el, "contextmenu", 2);
}

function vkCopy(text, what) {
  if (!text) return hud.flash("Nichts zu kopieren");
  browser.runtime.sendMessage({ type: "copy", text }).then(() => hud.flash(`Kopiert (${what}): ${text}`));
}

const HINT_ACTIONS = {
  "LinkHints.activate": o => o.button === "right"
    ? { title: "Rechtsklick auf …", run: vkContextMenu }
    : { title: "Öffnen …", run: vkClick },
  "LinkHints.activateOpenInNewTab": () => ({ title: "Neuer Hintergrund-Tab …", run: el => vkOpenInTab(el, false) }),
  "LinkHints.activateOpenInNewForegroundTab": () => ({ title: "Neuer Tab …", run: el => vkOpenInTab(el, true) }),
  "LinkHints.activateWithQueue": () => ({ title: "Mehrere öffnen (Esc beendet) …", run: el => vkOpenInTab(el, false), repeat: true }),
  "LinkHints.activateCopyLinkUrl": () => ({ title: "Link-URL kopieren …", run: el => vkCopy(linkUrl(el), "URL") }),
  "LinkHints.activateCopyLinkText": () => ({ title: "Linktext kopieren …", run: el => vkCopy((el.innerText || el.value || "").trim(), "Text") }),
  "LinkHints.activateHover": () => ({ title: "Hover …", run: vkHover }),
  "LinkHints.activateSelect": () => ({
    title: "Markieren …",
    run: el => { if (isEditable(el) && el.select) { el.focus(); el.select(); return; }
      const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); },
  }),
};
