# Vim Keys

Minimale Vim-Tastatursteuerung für Firefox, Ersatz für Vimium C (eigener Code, keine fremden Updates).
Manifest V3, keine Abhängigkeiten, kein Build-Schritt.

- `shared/keys.js` – Befehle, Tastennamen, Mapping-Parser, Ausnahmeregeln (auch von der Optionsseite genutzt)
- `content/` – Tastenlogik, HUD/Hilfe, Link-Hints (über alle Frames), Suche, Visual-Modus, Marken, Vomnibar
- `background.js` – Tabs, Zwischenablage, Hint-Koordination, Vomnibar-Vorschläge
- `options/` – Mappings (Vimium-Syntax `map`/`unmap`/`unmapAll`) und Ausnahmeregeln, gespeichert in `storage.local`

## Tests
- Logik: `node test/unit-vim-keys.js`
- Browser: `.\tools\start-test-firefox.ps1; .\test\test-vim-keys.ps1` – Testfirefox mit Wegwerf-Profil
  (`%TEMP%\ff-vim-keys-test-profile`), Testseiten aus `test/pages/` über `http://localhost:8765/` (und `:8766`
  als zweite Origin), Steuerung über den Marionette-Client `tools/Marionette.ps1`. Nach neuen Content-Script-Dateien `-Reset`.

## Veröffentlichen
Unlisted über AMO: `version` im Manifest erhöhen, `python tools/pack.py` → `dist/vim-keys-<version>.zip` auf AMO
hochladen („Selbständig“, Quelltext-Frage „Nein“), signierte xpi nach Freigabe-Mail als `dist/vim-keys-<version>.xpi`
ablegen und als GitHub-Release anhängen. `dist/` ist nicht im Repo.
