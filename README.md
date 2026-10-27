# Vim Keys

Minimale Vim-Tastatursteuerung für Firefox, Ersatz für Vimium C (eigener Code, keine fremden Updates).
Manifest V3, keine Abhängigkeiten, kein Build-Schritt.

- `shared/keys.js` – Befehle, Tastennamen, Mapping-Parser, Ausnahmeregeln (auch von der Optionsseite genutzt)
- `content/` – Tastenlogik, HUD/Hilfe, Link-Hints (über alle Frames), Suche, Visual-Modus, Marken, Vomnibar
- `background.js` – Tabs, Zwischenablage, Hint-Koordination, Vomnibar-Vorschläge
- `options/` – Mappings (Vimium-Syntax `map`/`unmap`/`unmapAll`) und Ausnahmeregeln, gespeichert in `storage.local`

## Tests
- Logik: `node test/unit-vim-keys.js`
- Browser: braucht die gemeinsame Testumgebung aus dem Repo `firefox-extensions` (dieses Repo liegt dort als
  `ext-vim-keys/`): `.\start-test-firefox.ps1 -Extension ext-vim-keys; .\ext-vim-keys\test\test-vim-keys.ps1`

## Veröffentlichen
Unlisted über AMO: `version` im Manifest erhöhen, im Werkzeug-Repo `python pack.py ext-vim-keys`, Zip auf AMO hochladen.
