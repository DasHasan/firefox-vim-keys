// Suche: "/" öffnet eine Suchzeile (Eingabe = regulärer Ausdruck, Smartcase), n/N springen zwischen Treffern.
// Treffer werden als Seitenauswahl markiert; liegt er in einem Link, bekommt der Link nach Enter den Fokus.
"use strict";

const find = (() => {
  const o = vkOverlay("vim-keys-find", "left:12px;bottom:12px;");
  const bar = vkEl("div", "display:flex;align-items:center;gap:6px;font:13px/1.4 system-ui,sans-serif;color:#eee;" +
    "background:#222e;padding:4px 10px;border-radius:4px;box-shadow:0 1px 4px #0006");
  const input = vkEl("input", "all:unset;width:260px;font:13px ui-monospace,Consolas,monospace;color:#fff;caret-color:#fff");
  const info = vkEl("span", "color:#aaa;min-width:48px");
  bar.append(vkEl("span", "color:#ffc542;font-weight:bold", "/"), input, info);
  o.root.append(bar);
  input.spellcheck = false;

  let query = "", matches = [], index = -1, open = false, savedScroll = null;

  function regex(q) {
    const flags = "gu" + (/\p{Lu}/u.test(q) ? "" : "i");
    try { return new RegExp(q, flags); } catch { return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags); }
  }

  const INLINE = /^(a|abbr|b|bdi|bdo|cite|code|data|dfn|em|font|i|kbd|label|mark|q|s|samp|small|span|strong|sub|sup|time|u|var)$/;
  function blockOf(el) {
    while (el.parentElement && INLINE.test(el.localName)) el = el.parentElement;
    return el;
  }

  // Alle sichtbaren Textknoten zu einem String verbinden und Treffer als Ranges zurückgeben
  function search(q) {
    if (!q || !document.body) return [];
    const nodes = [], starts = [];
    let text = "";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || /^(script|style|noscript|textarea|template)$/.test(p.localName) || p.closest("vim-keys-hud,vim-keys-find")) return NodeFilter.FILTER_REJECT;
        return p.checkVisibility() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let lastBlock = null;
    for (let n; (n = walker.nextNode());) {
      const block = blockOf(n.parentElement);
      if (lastBlock && block !== lastBlock) text += "\n";   // keine Treffer über Absatzgrenzen
      lastBlock = block;
      starts.push(text.length); nodes.push(n); text += n.data;
    }
    const at = off => {   // Textoffset -> [Knoten, Offset im Knoten]
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
      return [nodes[lo], off - starts[lo]];
    };
    const out = [];
    for (const m of text.matchAll(regex(q))) {
      if (!m[0].length) continue;
      const r = document.createRange();
      r.setStart(...at(m.index));
      r.setEnd(...at(m.index + m[0].length - 1)); r.setEnd(r.endContainer, r.endOffset + 1);
      out.push(r);
      if (out.length >= 5000) break;
    }
    return out;
  }

  function show(i) {
    index = i;
    const r = matches[i], sel = getSelection();
    sel.removeAllRanges(); sel.addRange(r);
    const rect = r.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth)
      (r.startContainer.parentElement).scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    info.textContent = `${i + 1}/${matches.length}`;
  }

  // erster Treffer ab dem sichtbaren Bereich
  function firstVisible() {
    const i = matches.findIndex(r => r.getBoundingClientRect().bottom > 0);
    return i < 0 ? 0 : i;
  }

  function update() {
    matches = search(input.value);
    if (matches.length) show(firstVisible());
    else { getSelection().removeAllRanges(); index = -1; info.textContent = input.value ? "0" : ""; }
  }

  input.addEventListener("input", update);

  function start() {
    open = true; savedScroll = [scrollX, scrollY];
    input.value = ""; info.textContent = "";
    o.attach(); input.focus();
  }

  function close(confirmed) {
    open = false; o.host.remove();
    if (!confirmed) {
      getSelection().removeAllRanges();
      if (savedScroll) scrollTo(...savedScroll);
      return;
    }
    query = input.value;
    const link = matches[index] && matches[index].startContainer.parentElement.closest("a[href]");
    if (link) link.focus({ preventScroll: true });
    if (matches.length) { show(index); hud.flash(`${index + 1}/${matches.length}  „${query}“`); }
    else if (query) hud.flash(`Nicht gefunden: „${query}“`);
  }

  // Taste während die Suchzeile offen ist: true = verschlucken (preventDefault), sonst nur nicht zur Seite weiterreichen
  function onKey(key) {
    if (key === "<esc>") { close(false); return true; }
    if (key === "<enter>") { close(true); return true; }
    return false;
  }

  function next(dir, n) {
    if (!query) return hud.flash("Noch keine Suche");
    matches = search(query);
    if (!matches.length) return hud.flash(`Nicht gefunden: „${query}“`);
    // Ausgangspunkt: aktuelle Auswahl, falls sie noch ein Treffer ist
    const sel = getSelection().rangeCount ? getSelection().getRangeAt(0) : null;
    let cur = sel ? matches.findIndex(r => r.compareBoundaryPoints(Range.START_TO_START, sel) === 0) : -1;
    if (cur < 0) cur = dir > 0 ? firstVisible() - 1 : firstVisible();
    let i = cur + dir * n, wrapped = i >= matches.length || i < 0;
    i = ((i % matches.length) + matches.length) % matches.length;
    show(i);
    const link = matches[i].startContainer.parentElement.closest("a[href]");
    if (link) link.focus({ preventScroll: true });
    hud.flash(`${i + 1}/${matches.length}  „${query}“` + (wrapped ? (dir > 0 ? "  (von vorn)" : "  (von hinten)") : ""));
  }

  return { start, onKey, next, get active() { return open; } };
})();

Object.assign(commands, {
  enterFindMode: () => find.start(),
  performFind: n => find.next(1, n),
  performBackwardsFind: n => find.next(-1, n),
});

// Tastenereignisse aus der Suchzeile nicht an die Seite durchlassen (Text wird trotzdem eingegeben)
for (const type of ["keypress", "keyup"])
  addEventListener(type, e => { if (find.active) e.stopImmediatePropagation(); }, true);
