// Visual-Modus: Auswahl per Tastatur erweitern (Selection.modify), y kopiert, Esc beendet.
// v = zeichenweise, V = zeilenweise. Ohne vorhandene Auswahl beginnt sie am ersten sichtbaren Text.
"use strict";

const visual = (() => {
  let line = false, count = "";

  const MOVES = {
    h: ["backward", "character"], l: ["forward", "character"],
    j: ["forward", "line"], k: ["backward", "line"],
    w: ["forward", "word"], e: ["forward", "word"], b: ["backward", "word"],  // e = w (Selection.modify kennt kein Wortende)
    "0": ["backward", "lineboundary"], "$": ["forward", "lineboundary"],
    G: ["forward", "documentboundary"],
  };

  function firstVisibleText() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.data.trim() && n.parentElement?.checkVisibility() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    for (let n; (n = walker.nextNode());) {
      const r = document.createRange(); r.selectNodeContents(n);
      const rect = r.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < innerHeight) return n;
    }
    return null;
  }

  // Fokuspunkt der Auswahl sichtbar halten
  function reveal() {
    const sel = getSelection();
    if (!sel.focusNode) return;
    const r = document.createRange();
    r.setStart(sel.focusNode, sel.focusOffset);
    let rect = r.getBoundingClientRect();
    if (!rect.height && sel.focusNode.nodeType === 3) rect = sel.focusNode.parentElement.getBoundingClientRect();
    if (rect.top < 0) scrollBy(0, rect.top - innerHeight / 3);
    else if (rect.bottom > innerHeight) scrollBy(0, rect.bottom - innerHeight * 2 / 3);
  }

  // Bei Zeilenmodus Anfang und Ende auf ganze Zeilen ausdehnen (Richtung je nach Lage von Anker und Fokus)
  function snapLines() {
    const sel = getSelection();
    const backwards = sel.anchorNode && (sel.anchorNode.compareDocumentPosition(sel.focusNode) & Node.DOCUMENT_POSITION_PRECEDING
      || sel.anchorNode === sel.focusNode && sel.focusOffset < sel.anchorOffset);
    const { focusNode, focusOffset } = sel;
    sel.collapse(sel.anchorNode, sel.anchorOffset);
    sel.modify("move", backwards ? "forward" : "backward", "lineboundary");
    sel.extend(focusNode, focusOffset);
    sel.modify("extend", backwards ? "backward" : "forward", "lineboundary");
  }

  function start(lineMode) {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed && !sel.anchorNode?.parentElement?.checkVisibility?.()) {
      const n = firstVisibleText();
      if (!n) return hud.flash("Kein Text zum Markieren");
      sel.collapse(n, n.data.length - n.data.trimStart().length);
    }
    if (sel.isCollapsed && !lineMode) sel.modify("extend", "forward", "character");
    line = lineMode; count = "";
    if (line) snapLines();
    modal = visual;
    hud.show(line ? "-- VISUAL ZEILE --" : "-- VISUAL --");
  }

  function stop(keepSelection) {
    modal = null; hud.hide();
    if (!keepSelection) getSelection().removeAllRanges();
  }

  let pendingG = false;

  function onKey(key) {
    const sel = getSelection();
    if (key === "<esc>") { stop(false); return true; }
    if (/^\d$/.test(key) && (count || key !== "0")) { count += key; return true; }
    const n = Math.min(parseInt(count || "1", 10), 999);
    count = "";
    const gg = pendingG && key === "g";
    pendingG = !gg && key === "g";
    if (pendingG) return true;
    if (key === "y") {
      const text = sel.toString();
      stop(false);
      vkCopy(text, "Auswahl");
      return true;
    }
    if (key === "v" || key === "V") {
      if (line === (key === "V")) return stop(false), true;
      line = key === "V";
      if (line) snapLines();
      hud.show(line ? "-- VISUAL ZEILE --" : "-- VISUAL --");
      return true;
    }
    if (key === "o") {
      sel.setBaseAndExtent(sel.focusNode, sel.focusOffset, sel.anchorNode, sel.anchorOffset);
      reveal();
      return true;
    }
    const move = gg ? ["backward", "documentboundary"] : MOVES[key];
    if (!move) return true;   // andere Tasten im Visual-Modus nicht an die Seite
    for (let i = 0; i < n; i++) sel.modify("extend", ...move);
    if (line) snapLines();
    reveal();
    return true;
  }

  return { start, onKey };
})();

Object.assign(commands, {
  enterVisualMode: () => visual.start(false),
  enterVisualLineMode: () => visual.start(true),
});
