"use strict";

const $ = sel => document.querySelector(sel);
const tbody = $("#rules tbody");

function addRule(rule = { pattern: "", passKeys: "" }) {
  const row = $("#ruleRow").content.firstElementChild.cloneNode(true);
  row.querySelector(".pattern").value = rule.pattern;
  row.querySelector(".passKeys").value = rule.passKeys;
  row.querySelector(".remove").onclick = () => { row.remove(); check(); };
  tbody.append(row);
}

const readRules = () => [...tbody.rows]
  .map(r => ({ pattern: r.querySelector(".pattern").value.trim(), passKeys: r.querySelector(".passKeys").value.trim() }))
  .filter(r => r.pattern);

function list(ul, items) { ul.replaceChildren(...items.map(t => Object.assign(document.createElement("li"), { textContent: t }))); }

// Prüft beide Eingaben, zeigt Fehler und aktualisiert die Befehlsliste; true = speicherbar
function check() {
  const parsed = VK.parseMappings($("#mappings").value);
  list($("#errors"), parsed.errors);
  const ruleErrors = VK.compileRules(readRules()).filter(r => r.error).map(r => r.error);
  list($("#ruleErrors"), ruleErrors);

  const byCmd = new Map();
  for (const [seq, { cmd }] of parsed.map) byCmd.set(cmd, [...(byCmd.get(cmd) || []), seq.replace(/ /g, "")]);
  $("#commands tbody").replaceChildren(...Object.entries(VK.COMMANDS).map(([cmd, [desc, phase]]) => {
    const tr = document.createElement("tr");
    if (phase > 1) tr.className = "later";
    for (const text of [cmd, (byCmd.get(cmd) || []).join(" "), desc + (phase > 1 ? ` (Phase ${phase})` : "")])
      tr.append(Object.assign(document.createElement("td"), { textContent: text }));
    return tr;
  }));
  return !ruleErrors.length;
}

function status(text, bad) {
  $("#status").textContent = text;
  $("#status").className = bad ? "bad" : "";
}

async function load() {
  const { mappings, exclusions } = await browser.storage.local.get(["mappings", "exclusions"]);
  $("#mappings").value = mappings ?? VK.DEFAULT_MAPPINGS;
  tbody.replaceChildren();
  (exclusions ?? []).forEach(addRule);
  check();
}

$("#addRule").onclick = () => { addRule(); tbody.lastElementChild.querySelector(".pattern").focus(); };
$("#resetMappings").onclick = () => { $("#mappings").value = VK.DEFAULT_MAPPINGS; check(); status("Zurückgesetzt, noch nicht gespeichert"); };
$("#mappings").addEventListener("input", () => { check(); status(""); });
tbody.addEventListener("input", () => { check(); status(""); });

$("#save").onclick = async () => {
  if (!check()) return status("Ungültiges URL-Muster, nicht gespeichert", true);
  await browser.storage.local.set({ mappings: $("#mappings").value, exclusions: readRules() });
  status("Gespeichert" + ($("#errors").children.length ? " (fehlerhafte Zeilen werden ignoriert)" : ""));
};

load();
