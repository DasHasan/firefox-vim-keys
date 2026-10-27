// Tastensteuerung in der Seite: Modi, Tastenpuffer mit Zähler, Ausnahmeregeln, Befehle im Seitenkontext.
// Tab- und Zwischenablage-Befehle gehen an background.js.
"use strict";

const SCROLL_STEP = 100;
let config = VK.parseMappings(VK.DEFAULT_MAPPINGS);
let rules = [], exclUrl = null, excl = null;
let mode = "normal";          // normal | insert
let buffer = [], count = "";
let passNext = 0;
let modal = null;             // Visual-Modus, Warten auf Markenbuchstaben: { onKey(key) -> true = verschlucken }
let userActed = false;        // für grabBackFocus: Seite darf erst nach Nutzeraktion fokussieren
const swallowed = new Set();  // e.code verschluckter keydowns, deren keyup ebenfalls nicht zur Seite soll

async function loadConfig() {
  const { mappings, exclusions } = await browser.storage.local.get(["mappings", "exclusions"]);
  config = VK.parseMappings(mappings ?? VK.DEFAULT_MAPPINGS);
  rules = VK.compileRules(exclusions ?? []);
  exclUrl = null;
}
browser.storage.onChanged.addListener((_, area) => { if (area === "local") loadConfig(); });
loadConfig().then(grabBackFocus);

function exclusion() {
  if (exclUrl !== location.href) { exclUrl = location.href; excl = VK.matchRules(rules, exclUrl); }
  return excl;
}

function deepActive() {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  return a;
}

const NON_TEXT = /^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/;
function isEditable(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable || el.localName === "select") return true;
  return (el.localName === "textarea" || el.localName === "input" && !NON_TEXT.test(el.type)) && !el.readOnly;
}

function grabBackFocus() {
  const el = deepActive();
  if (!userActed && isEditable(el) && !exclusion()?.disabled) el.blur();
}
addEventListener("focusin", e => { if (e.isTrusted && !userActed) grabBackFocus(); }, true);
addEventListener("mousedown", e => { if (e.isTrusted) userActed = true; }, true);

function swallow(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  swallowed.add(e.code);
}

function reset() { buffer = []; count = ""; }

function setMode(m) {
  mode = m;
  if (m === "insert") hud.show("-- EINFÜGEN --  (Esc beendet)");
  else hud.hide();
}

addEventListener("keyup", e => {
  if (swallowed.delete(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

addEventListener("keydown", e => {
  if (!e.isTrusted || e.isComposing) return;
  userActed = true;
  const key = VK.keyName(e);
  if (!key) return;

  if (find.active) { e.stopImmediatePropagation(); if (find.onKey(key)) swallow(e); return; }
  if (vomnibar.active) { e.stopImmediatePropagation(); if (vomnibar.onKey(key)) swallow(e); return; }
  if (modal) { if (modal.onKey(key)) swallow(e); return; }
  if (hints.active) { if (hints.onKey(key)) swallow(e); return; }
  if (help.open) { help.close(); if (key === "<esc>" || key === "?") return swallow(e); }
  if (passNext > 0) { if (--passNext === 0) hud.hide(); return; }
  const ex = exclusion();
  if (ex && ex.disabled) return;

  if (mode === "insert") {
    if (key === "<esc>") { setMode("normal"); swallow(e); }
    return;
  }
  if (isEditable(deepActive())) {
    if (key === "<esc>") { deepActive().blur(); swallow(e); }
    return;
  }

  if (!buffer.length && ex && ex.passes(key)) { count = ""; return; }
  if (key === "<esc>") {
    if (buffer.length || count) { reset(); hud.hide(); swallow(e); }
    return;
  }
  if (!buffer.length && /^\d$/.test(key) && (count || key !== "0") && !config.map.has(key) && !config.prefixes.has(key)) {
    count += key;
    hud.show(count);
    return swallow(e);
  }

  buffer.push(key);
  if (!config.map.has(buffer.join(" ")) && !config.prefixes.has(buffer.join(" "))) {
    buffer = [key];   // angefangene Folge passt nicht: mit dieser Taste neu beginnen
    if (!config.map.has(key) && !config.prefixes.has(key)) { reset(); hud.hide(); return; }
  }
  swallow(e);
  const hit = config.map.get(buffer.join(" "));
  if (!hit) return hud.show((count || "") + buffer.join(""));
  const n = count ? Math.min(parseInt(count, 10), 999) : 1;
  reset();
  hud.hide();
  run(hit.cmd, n, hit.opts, e);
}, true);

function run(cmd, n, opts, e) {
  if (HINT_ACTIONS[cmd]) return hints.start(cmd, opts);
  const local = commands[cmd];
  if (local) return local(n, opts, e);
  const phase = VK.COMMANDS[cmd][1];
  if (phase > 1) return hud.flash(`${VK.COMMANDS[cmd][0]}: kommt in Phase ${phase}`);
  browser.runtime.sendMessage({ type: "command", cmd, count: n, opts })
    .then(msg => msg && hud.flash(msg), err => hud.flash("Fehler: " + err.message));
}

// --- Scrollen ---------------------------------------------------------------------------------

let lastClicked = null, cachedScroller = null;
addEventListener("click", e => { if (e.isTrusted) lastClicked = e.composedPath()[0]; }, true);

function canScroll(el, axis, dir) {
  const root = el === document.scrollingElement;
  const [pos, size, view] = axis === "y" ? ["scrollTop", "scrollHeight", "clientHeight"] : ["scrollLeft", "scrollWidth", "clientWidth"];
  if (el[size] - el[view] < 2) return false;
  if (!root && !/(auto|scroll|overlay)/.test(getComputedStyle(el)[axis === "y" ? "overflowY" : "overflowX"])) return false;
  return dir > 0 ? el[pos] + el[view] < el[size] - 1 : el[pos] > 0;
}

function scrollTarget(axis, dir) {
  for (let el = lastClicked?.isConnected ? lastClicked : deepActive(); el && el !== document.body && el !== document.documentElement; el = el.parentElement || el.getRootNode().host)
    if (el.nodeType === 1 && canScroll(el, axis, dir)) return el;
  const se = document.scrollingElement || document.documentElement;
  if (canScroll(se, axis, dir)) return se;
  // z. B. Web-Apps, deren Inhalt in einem eigenen Container scrollt: größten sichtbaren nehmen
  if (!(cachedScroller?.isConnected && canScroll(cachedScroller, axis, dir))) {
    cachedScroller = null;
    let best = 0;
    for (const el of document.body ? document.body.querySelectorAll("*") : []) {
      if (el.clientHeight < 50 || el.clientWidth < 50) continue;
      const area = el.clientWidth * el.clientHeight;
      if (area > best && canScroll(el, axis, dir)) { best = area; cachedScroller = el; }
    }
  }
  return cachedScroller || se;
}

// amount: Pixel, Funktion(Sichtgröße) -> Pixel, oder ±Infinity (bis zum Rand)
function scroll(axis, amount, e) {
  const px = typeof amount === "function" ? amount : () => amount;
  const el = scrollTarget(axis, Math.sign(px(1)));
  const root = el === document.scrollingElement, y = axis === "y";
  const v = px(y ? (root ? innerHeight : el.clientHeight) : (root ? innerWidth : el.clientWidth));
  const behavior = e.repeat ? "instant" : "smooth", prop = y ? "top" : "left";
  if (isFinite(v)) el.scrollBy({ [prop]: v, behavior });
  else el.scrollTo({ [prop]: v > 0 ? (y ? el.scrollHeight : el.scrollWidth) : 0, behavior });
}

// --- Navigation ---------------------------------------------------------------------------------

const NEXT_WORDS = ["next", "weiter", "nächste", "nächster", "nächstes", "more", "newer", "›", "→", "»", "≫", ">>", ">"];
const PREV_WORDS = ["prev", "previous", "zurück", "vorherige", "vorheriger", "vorheriges", "back", "older", "‹", "←", "«", "≪", "<<", "<"];

function visible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function followRel(rel, words) {
  const link = document.querySelector(`link[rel~=${rel}][href], a[rel~=${rel}][href]`);
  if (link) { location.href = link.href; return; }
  const cands = [...document.querySelectorAll("a[href], button, [role=link], [role=button], input[type=button], input[type=submit]")]
    .filter(visible)
    .map(el => ({ el, text: (el.innerText || el.value || el.getAttribute("aria-label") || el.title || "").trim().toLowerCase() }))
    .filter(c => c.text && c.text.length < 40);
  for (const w of words) {
    const re = /^\W+$/.test(w) ? new RegExp("(^|\\s)" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$)")
      : new RegExp("(^|[^\\p{L}])" + w + "($|[^\\p{L}])", "u");
    const hits = cands.filter(c => re.test(c.text)).sort((a, b) => a.text.length - b.text.length);
    if (hits.length) { hits[0].el.click(); return; }
  }
  hud.flash(rel === "next" ? "Kein „weiter“-Link gefunden" : "Kein „zurück“-Link gefunden");
}

function goUp(n) {
  const u = new URL(location.href);
  if (u.hash || u.search) { u.hash = ""; u.search = ""; n--; }
  if (n > 0) {
    const parts = u.pathname.split("/").filter(Boolean);
    u.pathname = "/" + parts.slice(0, Math.max(0, parts.length - n)).join("/") + (parts.length > n ? "/" : "");
  }
  if (u.href !== location.href) location.href = u.href;
}

function focusInput(n) {
  const inputs = [...document.querySelectorAll("input, textarea, [contenteditable=''], [contenteditable=true]")]
    .filter(el => isEditable(el) && visible(el));
  if (!inputs.length) return hud.flash("Kein Eingabefeld gefunden");
  inputs[Math.min(n, inputs.length) - 1].focus();
}

// --- Befehle im Seitenkontext ---------------------------------------------------------------------

const commands = {
  scrollDown: (n, o, e) => scroll("y", n * SCROLL_STEP, e),
  scrollUp: (n, o, e) => scroll("y", -n * SCROLL_STEP, e),
  scrollRight: (n, o, e) => scroll("x", n * SCROLL_STEP, e),
  scrollLeft: (n, o, e) => scroll("x", -n * SCROLL_STEP, e),
  scrollPageDown: (n, o, e) => scroll("y", v => n * v / 2, e),
  scrollPageUp: (n, o, e) => scroll("y", v => -n * v / 2, e),
  scrollFullPageDown: (n, o, e) => scroll("y", v => n * v, e),
  scrollFullPageUp: (n, o, e) => scroll("y", v => -n * v, e),
  scrollToBottom: (n, o, e) => scroll("y", Infinity, e),
  scrollToTop: (n, o, e) => scroll("y", -Infinity, e),
  scrollToRight: (n, o, e) => scroll("x", Infinity, e),
  scrollToLeft: (n, o, e) => scroll("x", -Infinity, e),

  goBack: n => history.go(-n),
  goForward: n => history.go(n),
  goUp: n => goUp(n),
  goToRoot: () => { location.href = location.origin + "/"; },
  goNext: () => followRel("next", NEXT_WORDS),
  goPrevious: () => followRel("prev", PREV_WORDS),

  enterInsertMode: () => setMode("insert"),
  passNextKey: n => { passNext = n; hud.show("Nächste Taste geht an die Seite"); },
  focusInput: n => focusInput(n),
  showHelp: () => help.show(config.map),
};
