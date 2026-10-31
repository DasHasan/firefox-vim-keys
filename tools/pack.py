"""Für den AMO-Upload packen:  python tools/pack.py  ->  dist/vim-keys-<version>.zip
Nur die Erweiterungsdateien, ohne test/, tools/, dist/, Git-Dateien, README und CLAUDE.md (Pfade mit Schrägstrich, sonst lehnt AMO ab)."""
import json, os, zipfile

src = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
manifest = json.load(open(os.path.join(src, "manifest.json"), encoding="utf-8"))
out = os.path.join(src, "dist", f"vim-keys-{manifest['version']}.zip")
os.makedirs(os.path.dirname(out), exist_ok=True)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        rel_root = os.path.relpath(root, src)
        if rel_root == ".":
            dirs[:] = [d for d in dirs if d not in ("test", "tools", "dist", ".git", ".github")]
            files = [f for f in files if not f.startswith((".git", "README", "CLAUDE"))]
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, src).replace(os.sep, "/"))
print(out)
for n in zipfile.ZipFile(out).namelist(): print("  " + n)
