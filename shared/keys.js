// Gemeinsame Logik für Content-Script und Optionsseite: Befehle, Tastennamen, Mapping-Parser, Ausnahmeregeln.
// Tasten-Syntax wie Vimium C: "j", "gg", "F", "<c-s-f>", "<a-c-f>", "<esc>", "<space>", "<f1>".
"use strict";

const VK = (() => {
  // Befehl -> [Beschreibung, Phase]. Phase > 1 = noch nicht gebaut (zeigt nur einen Hinweis).
  const COMMANDS = {
    scrollDown: ["Nach unten scrollen", 1],
    scrollUp: ["Nach oben scrollen", 1],
    scrollLeft: ["Nach links scrollen", 1],
    scrollRight: ["Nach rechts scrollen", 1],
    scrollPageDown: ["Halbe Seite nach unten", 1],
    scrollPageUp: ["Halbe Seite nach oben", 1],
    scrollFullPageDown: ["Ganze Seite nach unten", 1],
    scrollFullPageUp: ["Ganze Seite nach oben", 1],
    scrollToTop: ["Zum Seitenanfang", 1],
    scrollToBottom: ["Zum Seitenende", 1],
    scrollToLeft: ["Ganz nach links", 1],
    scrollToRight: ["Ganz nach rechts", 1],

    goBack: ["Zurück im Verlauf", 1],
    goForward: ["Vorwärts im Verlauf", 1],
    goUp: ["URL eine Ebene hoch", 1],
    goToRoot: ["Zur Startseite der Domain", 1],
    goNext: ["Nächste Seite (Link „weiter“)", 1],
    goPrevious: ["Vorherige Seite (Link „zurück“)", 1],
    reload: ["Neu laden", 1],
    reloadTab: ["Neu laden", 1],
    reloadGivenTab: ["Neu laden ohne Cache", 1],

    nextTab: ["Nächster Tab", 1],
    previousTab: ["Vorheriger Tab", 1],
    firstTab: ["Erster Tab", 1],
    lastTab: ["Letzter Tab", 1],
    visitPreviousTab: ["Zuletzt benutzter Tab", 1],
    createTab: ["Neuer Tab", 1],
    removeTab: ["Tab schließen", 1],
    restoreTab: ["Geschlossenen Tab wiederherstellen", 1],
    duplicateTab: ["Tab duplizieren", 1],
    reopenTab: ["Tab schließen und neu öffnen", 1],
    togglePinTab: ["Tab anheften/lösen", 1],
    toggleMuteTab: ["Tab stumm/laut", 1],
    moveTabLeft: ["Tab nach links verschieben", 1],
    moveTabRight: ["Tab nach rechts verschieben", 1],
    moveTabToNextWindow: ["Tab ins nächste Fenster", 1],

    copyCurrentUrl: ["URL kopieren", 1],
    openCopiedUrlInCurrentTab: ["Kopierte URL/Suche öffnen", 1],
    openCopiedUrlInNewTab: ["Kopierte URL/Suche in neuem Tab", 1],

    enterInsertMode: ["Einfügemodus (alle Tasten an die Seite)", 1],
    passNextKey: ["Nächste Taste an die Seite durchreichen", 1],
    focusInput: ["Erstes Eingabefeld fokussieren", 1],
    showHelp: ["Hilfe anzeigen", 1],

    "LinkHints.activate": ["Link öffnen (button=\"right\": Rechtsklick/Kontextmenü der Seite)", 1],
    "LinkHints.activateOpenInNewTab": ["Link in neuem Hintergrund-Tab", 1],
    "LinkHints.activateOpenInNewForegroundTab": ["Link in neuem Vordergrund-Tab", 1],
    "LinkHints.activateWithQueue": ["Mehrere Links nacheinander öffnen", 1],
    "LinkHints.activateCopyLinkUrl": ["Link-URL kopieren", 1],
    "LinkHints.activateCopyLinkText": ["Linktext kopieren", 1],
    "LinkHints.activateHover": ["Maus über Element bewegen", 1],
    "LinkHints.activateSelect": ["Element markieren", 1],

    enterFindMode: ["Suchen", 1],
    performFind: ["Nächster Treffer", 1],
    performBackwardsFind: ["Vorheriger Treffer", 1],

    enterVisualMode: ["Visual-Modus", 1],
    enterVisualLineMode: ["Visual-Zeilenmodus", 1],
    "Marks.activateCreate": ["Marke setzen", 1],
    "Marks.activate": ["Zu Marke springen", 1],

    "Vomnibar.activate": ["URL/Lesezeichen/Verlauf öffnen", 1],
    "Vomnibar.activateInNewTab": ["… in neuem Tab", 1],
    "Vomnibar.activateBookmarks": ["Lesezeichen öffnen", 1],
    "Vomnibar.activateBookmarksInNewTab": ["Lesezeichen in neuem Tab", 1],
    "Vomnibar.activateTabs": ["Offenen Tab suchen", 1],
    "Vomnibar.activateUrl": ["Aktuelle URL bearbeiten", 1],
    "Vomnibar.activateUrlInNewTab": ["Aktuelle URL bearbeiten, neuer Tab", 1],
  };

  // Eingebaute Belegung = Vimium-C-Standard (ohne Frame-, Quelltext- und Debug-Befehle)
  const BUILTIN = `
    ? showHelp  <a-c> previousTab  <a-s-c> nextTab  <a-v> nextTab
    j scrollDown  <c-e> scrollDown  k scrollUp  <c-y> scrollUp  h scrollLeft  l scrollRight
    d scrollPageDown  u scrollPageUp  gg scrollToTop  G scrollToBottom  zH scrollToLeft  zL scrollToRight
    H goBack  L goForward  gu goUp  gU goToRoot  [[ goPrevious  ]] goNext
    r reload  R reloadGivenTab  <a-r> reloadTab  <a-s-r> reopenTab
    K nextTab  gt nextTab  J previousTab  gT previousTab  g0 firstTab  g$ lastTab  ^ visitPreviousTab
    t createTab  <a-t> createTab  x removeTab  X restoreTab  yt duplicateTab
    <a-p> togglePinTab  <a-m> toggleMuteTab  << moveTabLeft  >> moveTabRight  W moveTabToNextWindow
    yy copyCurrentUrl  p openCopiedUrlInCurrentTab  P openCopiedUrlInNewTab
    i enterInsertMode  gi focusInput
    f LinkHints.activate  F LinkHints.activateOpenInNewTab  <a-f> LinkHints.activateWithQueue
    yf LinkHints.activateCopyLinkUrl  yv LinkHints.activateSelect
    / enterFindMode  n performFind  N performBackwardsFind
    v enterVisualMode  V enterVisualLineMode  <f8> enterVisualMode  m Marks.activateCreate  \` Marks.activate
    o Vomnibar.activate  O Vomnibar.activateInNewTab  b Vomnibar.activateBookmarks  B Vomnibar.activateBookmarksInNewTab
    T Vomnibar.activateTabs  ge Vomnibar.activateUrl  gE Vomnibar.activateUrlInNewTab`;

  // Eigene Belegung (aus Vimium C übernommen), auf der Optionsseite änderbar
  const DEFAULT_MAPPINGS = `# Eigene Belegung, wird auf die Standardbelegung angewendet.
# map <taste> <befehl> [option=wert …]   unmap <taste>   unmapAll
map F LinkHints.activateOpenInNewForegroundTab
map <c-s-f> LinkHints.activateHover
map <a-c-f> LinkHints.activate button="right"
map \\ passNextKey
unmap <f1>
`;

  const MODS = ["a", "c", "m", "s"];
  const ALIAS = { escape: "esc", cr: "enter", return: "enter", bs: "backspace", del: "delete", lt: "<", gt: ">" };

  // "<c-F>" -> "<c-s-f>", "<s-f>" -> "F", "<Esc>" -> "<esc>", "<x>" -> "x"
  function normKey(modStr, key) {
    const mods = new Set(modStr.toLowerCase().match(/[acms]/g) || []);
    if (key.length > 1) key = ALIAS[key.toLowerCase()] || key.toLowerCase();
    if (key.length === 1) {
      const letter = /[a-z]/i.test(key);
      if (letter && key !== key.toLowerCase()) mods.add("s");
      if (letter) key = key.toLowerCase();
      if (mods.size === 1 && mods.has("s") && letter) return key.toUpperCase();
      if (!mods.size) return key;
    }
    return "<" + MODS.filter(m => mods.has(m)).map(m => m + "-").join("") + key + ">";
  }

  // "g<c-a>x" -> ["g", "<c-a>", "x"]; "<<" -> ["<", "<"]
  function parseKeySeq(s) {
    const keys = [];
    for (let i = 0; i < s.length;) {
      const m = s[i] === "<" && /^<((?:[acms]-)*)([^\s>]+|>)>/i.exec(s.slice(i));
      if (m) { keys.push(normKey(m[1], m[2])); i += m[0].length; }
      else { keys.push(s[i]); i++; }
    }
    return keys;
  }

  // US-Belegung pro physischer Taste: Nicht-ASCII-Zeichen (ö ä ü ß ´ ^ …) werden wie bei Vimium C
  // mit keyLayout=2 ("ignoreIfNotASCII") auf das Zeichen der US-Tastatur abgebildet.
  const US = {
    Backquote: "`~", Minus: "-_", Equal: "=+", BracketLeft: "[{", BracketRight: "]}", Backslash: "\\|",
    IntlBackslash: "\\|", Semicolon: ";:", Quote: "'\"", Comma: ",<", Period: ".>", Slash: "/?",
    Digit0: "0)", Digit1: "1!", Digit2: "2@", Digit3: "3#", Digit4: "4$", Digit5: "5%", Digit6: "6^",
    Digit7: "7&", Digit8: "8*", Digit9: "9(",
  };
  function usChar(code, shift) {
    if (/^Key[A-Z]$/.test(code)) return shift ? code[3] : code[3].toLowerCase();
    return US[code] ? US[code][shift ? 1 : 0] : null;
  }

  const NAMED = {
    Escape: "esc", Enter: "enter", Tab: "tab", Backspace: "backspace", Delete: "delete", Insert: "insert",
    Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown", ArrowUp: "up", ArrowDown: "down",
    ArrowLeft: "left", ArrowRight: "right", " ": "space", ContextMenu: "menu",
  };

  // KeyboardEvent -> Tastenname, null für reine Modifier/unbekannte Tasten
  function keyName(e) {
    let k = e.key;
    if (k === "Dead" || k.length === 1 && k > "~") k = usChar(e.code, e.shiftKey) || k;
    let mods = (e.altKey ? "a-" : "") + (e.ctrlKey ? "c-" : "") + (e.metaKey ? "m-" : "");
    if (k.length === 1 && k !== " ") {
      const letter = /[a-z]/i.test(k);
      // AltGr meldet unter Windows Strg+Alt: \ [ ] { } @ ~ | sind dann normale Zeichen
      if (!letter && (mods === "a-c-" || e.getModifierState("AltGraph"))) mods = "";
      if (!mods) return k;
      return "<" + mods + (letter && e.shiftKey ? "s-" : "") + k.toLowerCase() + ">";
    }
    const name = NAMED[k] || (/^F\d{1,2}$/.test(k) ? k.toLowerCase() : null);
    return name && "<" + mods + (e.shiftKey ? "s-" : "") + name + ">";
  }

  // 'count=3 button="right" x' -> { count: 3, button: "right", x: true }
  function parseOptions(s) {
    const opts = {};
    for (const [, name, val] of s.matchAll(/([\w.$-]+)(?:=("(?:[^"\\]|\\.)*"|\S+))?/g)) {
      opts[name] = val === undefined ? true : val[0] === '"' ? JSON.parse(val)
        : val === "true" ? true : val === "false" ? false : isNaN(val) ? val : Number(val);
    }
    return opts;
  }

  function builtinMap() {
    const map = new Map(), toks = BUILTIN.trim().split(/\s+/);
    for (let i = 0; i < toks.length; i += 2) map.set(parseKeySeq(toks[i]).join(" "), { cmd: toks[i + 1], opts: {} });
    return map;
  }

  // Text mit map/unmap/unmapAll -> { map: Map("g g" -> {cmd, opts}), prefixes: Set("g"), errors: [...] }
  function parseMappings(text) {
    const map = builtinMap(), errors = [];
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line[0] === "#" || line[0] === '"') return;
      const err = msg => errors.push(`Zeile ${i + 1}: ${msg}`);
      const [verb, keyStr, cmd] = line.split(/\s+/, 3);
      if (verb === "unmapAll") return map.clear();
      if (verb !== "map" && verb !== "unmap") return err(`„${verb}“ wird nicht unterstützt, Zeile ignoriert`);
      if (!keyStr) return err("Taste fehlt");
      const seq = parseKeySeq(keyStr).join(" ");
      if (verb === "unmap") return map.delete(seq);
      if (!cmd) return err("Befehl fehlt");
      if (!(cmd in COMMANDS)) return err(`unbekannter Befehl „${cmd}“`);
      const rest = line.replace(/^\S+\s+\S+\s+\S+\s*/, "");
      try { map.set(seq, { cmd, opts: parseOptions(rest) }); }
      catch { err(`Optionen nicht lesbar: ${rest}`); }
    });
    const prefixes = new Set();
    for (const seq of map.keys()) {
      const keys = seq.split(" ");
      for (let n = 1; n < keys.length; n++) prefixes.add(keys.slice(0, n).join(" "));
    }
    return { map, prefixes, errors };
  }

  // passKeys: Zeichen direkt hintereinander ("jk0123456789"), Sondertasten in spitzen Klammern ("<c-j> <esc>"),
  // Leerzeichen sind erlaubt und werden ignoriert.
  function parsePassKeys(s) {
    return new Set(parseKeySeq((s || "").replace(/\s+/g, "")));
  }

  // URL-Muster: "^regex", "example.com" / "*.example.com" (Host, http+https),
  // "https://*.example.com/*" (Präfix mit Platzhaltern), sonst URL-Präfix.
  function compilePattern(p) {
    p = p.trim();
    const esc = s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    if (p[0] === "^") { const re = new RegExp(p); return u => re.test(u); }
    if (p === "localhost" || !p.includes("/") && p.includes(".")) {
      const host = p.startsWith("*.") ? "(?:[^/]+\\.)?" + esc(p.slice(2)) : esc(p);
      const re = new RegExp("^https?://" + host + "(?::\\d+)?(?:/|$)", "i");
      return u => re.test(u);
    }
    if (p.includes("*")) { const re = new RegExp("^" + esc(p).replace(/\*/g, ".*")); return u => re.test(u); }
    return u => u.startsWith(p);
  }

  // [{pattern, passKeys}] -> [{test, passKeys}], fehlerhafte Muster mit Fehlertext
  function compileRules(rules) {
    return rules.filter(r => r.pattern && r.pattern.trim()).map(r => {
      try { return { test: compilePattern(r.pattern), pass: parsePassKeys(r.passKeys) }; }
      catch (e) { return { test: () => false, pass: new Set(), error: `${r.pattern}: ${e.message}` }; }
    });
  }

  // null = keine Regel greift, { disabled: true } = Regel ohne passKeys (ganz aus), sonst { passes(key) }.
  // Mehrere passende Regeln: passKeys werden vereinigt.
  function matchRules(compiled, url) {
    const hits = compiled.filter(r => !r.error && r.test(url));
    if (!hits.length) return null;
    if (hits.some(r => !r.pass.size)) return { disabled: true };
    const all = new Set(hits.flatMap(r => [...r.pass]));
    return { passes: k => all.has(k) };
  }

  // Hint-Buchstaben ohne "f": f/F im Hint-Modus beendet ihn (zweimal f = an und wieder aus)
  const HINT_CHARS = "sadjklewcmpgh";

  // n Hint-Labels gleicher Länge (Vergabe über alle Frames eines Tabs in background.js)
  function hintLabels(n) {
    const k = HINT_CHARS.length, len = Math.max(1, Math.ceil(Math.log(n) / Math.log(k)));
    return Array.from({ length: n }, (_, i) => {
      let s = "";
      for (let j = 0; j < len; j++, i = Math.floor(i / k)) s = HINT_CHARS[i % k] + s;
      return s;
    });
  }

  return { COMMANDS, DEFAULT_MAPPINGS, HINT_CHARS, hintLabels, parseKeySeq, keyName, parseMappings, parsePassKeys, compileRules, matchRules };
})();
