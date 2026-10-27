// Statuszeile unten rechts und Hilfe-Overlay, jeweils in einem geschlossenen Shadow-DOM.
// Styles nur über element.style (CSSOM), weil <style>-Elemente an der CSP der Seite scheitern können.
"use strict";

function vkOverlay(tag, hostCss, mode = "closed") {
  const host = document.createElement(tag);
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;" + hostCss;
  const root = host.attachShadow({ mode });
  return { host, root, attach() { if (!host.isConnected) document.documentElement.append(host); } };
}

function vkEl(tag, css, text) {
  const el = document.createElement(tag);
  if (css) el.style.cssText = css;
  if (text !== undefined) el.textContent = text;
  return el;
}

const hud = (() => {
  const o = vkOverlay("vim-keys-hud", "right:12px;bottom:12px;");
  const box = vkEl("div", "font:13px/1.4 system-ui,sans-serif;color:#eee;background:#222d;padding:4px 10px;" +
    "border-radius:4px;box-shadow:0 1px 4px #0006;white-space:pre;max-width:60vw;overflow:hidden;text-overflow:ellipsis");
  o.root.append(box);
  let timer;
  return {
    show(text) { clearTimeout(timer); box.textContent = text; o.attach(); },
    flash(text, ms = 1800) { this.show(text); timer = setTimeout(() => this.hide(), ms); },
    hide() { clearTimeout(timer); o.host.remove(); },
  };
})();

const help = (() => {
  const o = vkOverlay("vim-keys-help", "inset:0;");
  const groups = [
    ["Scrollen", /^scroll/],
    ["Verlauf & URL", /^(go|reload$|reloadGivenTab$)/],
    ["Tabs", /^(?!LinkHints|Vomnibar).*Tab/],
    ["Links", /^LinkHints/],
    ["Vomnibar", /^Vomnibar/],
    ["Suchen", /Find/],
    ["Visual & Marken", /Visual|^Marks/],
    ["Sonstiges", /./],
  ];
  return {
    get open() { return o.host.isConnected; },
    close() { o.host.remove(); },
    show(map) {
      const byCmd = new Map();
      for (const [seq, { cmd }] of map) byCmd.set(cmd, [...(byCmd.get(cmd) || []), seq.replace(/ /g, "")]);
      const panel = vkEl("div", "font:13px/1.5 system-ui,sans-serif;color:#222;background:#fff;border-radius:8px;" +
        "padding:16px 20px;max-height:85vh;width:min(960px,90vw);box-sizing:border-box;overflow:auto;box-shadow:0 4px 24px #0008;" +
        "display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:4px 32px;align-items:start");
      const done = new Set();
      for (const [title, re] of groups) {
        const rows = Object.entries(VK.COMMANDS).filter(([c]) => !done.has(c) && re.test(c) && byCmd.has(c));
        if (!rows.length) continue;
        const sec = vkEl("div", "margin-bottom:12px");
        sec.append(vkEl("div", "font-weight:600;margin-bottom:4px;color:#555", title));
        for (const [cmd, [desc, phase]] of rows) {
          done.add(cmd);
          const row = vkEl("div", "display:flex;gap:12px" + (phase > 1 ? ";opacity:.45" : ""));
          row.append(vkEl("span", "flex:0 0 150px;font-family:ui-monospace,Consolas,monospace;color:#036", byCmd.get(cmd).join(" ")),
            vkEl("span", "", desc + (phase > 1 ? ` (Phase ${phase})` : "")));
          sec.append(row);
        }
        panel.append(sec);
      }
      const backdrop = vkEl("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0005");
      backdrop.onclick = e => { if (e.target === backdrop) this.close(); };
      backdrop.append(panel);
      o.root.replaceChildren(backdrop);
      o.attach();
    },
  };
})();
