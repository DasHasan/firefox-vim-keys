# Selbsttest fuer Vim Keys. Voraussetzung: .\tools\start-test-firefox.ps1
# Die Parser-/Regel-Logik testet zusaetzlich: node test/unit-vim-keys.js
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\..\tools\Marionette.ps1"
$base = "http://localhost:8765"
$esc = [string][char]0xE00C
$fail = @()
function Check($ok, $msg) { if (-not $ok) { $script:fail += $msg; Write-Host "  x $msg" } else { Write-Host "  ok $msg" } }
function Js($code) { Invoke-FFScript $code }
function ScrollY { [int](Js 'return Math.round(scrollY)') }
function Settle { # wartet, bis sanftes Scrollen fertig ist, gibt scrollY zurueck
    $last = ""; for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 100; $pos = Js 'return Math.round(scrollX) + "," + Math.round(scrollY)'
        if ($pos -eq $last) { break }; $last = $pos
    }
    [int]($last -split ",")[1]
}
function Handles { @((Invoke-FF "WebDriver:GetWindowHandles")) }
function SwitchTo($h) { $null = Invoke-FF "WebDriver:SwitchToWindow" @{ handle = $h; focus = $true } }
function Url { (Invoke-FF "WebDriver:GetCurrentURL").value }
function WaitFor($code, $ms = 3000) {
    for ($t = 0; $t -lt $ms; $t += 100) { if (Js $code) { return $true }; Start-Sleep -Milliseconds 100 }; $false
}

Connect-FF
try {
    $main = (Invoke-FF "WebDriver:GetWindowHandle").value
    Open-FFUrl "$base/long.html"
    Start-Sleep -Milliseconds 300

    Write-Host "Scrollen"
    Send-FFKeys "j"; Check ((Settle) -eq 100) "j scrollt 100px"
    Send-FFKeys "3j"; Check ((Settle) -eq 400) "3j scrollt 300px"
    Send-FFKeys "k"; Check ((Settle) -eq 300) "k scrollt zurueck"
    Send-FFKeys "G"; $bottom = Settle; Check ($bottom -gt 3000) "G zum Ende ($bottom)"
    Send-FFKeys "gg"; Check ((Settle) -eq 0) "gg zum Anfang"
    $half = [int](Js 'return Math.round(innerHeight / 2)')
    Send-FFKeys "d"; Check ([math]::Abs((Settle) - $half) -le 1) "d halbe Seite"
    Send-FFKeys "gg"; $null = Settle
    Send-FFKeys "l"; $null = Settle; Check ((Js 'return Math.round(scrollX)') -eq 100) "l scrollt nach rechts"
    Send-FFKeys "zH"; $null = Settle
    # Klick ueber Marionette (isTrusted), damit der innere Container das Scrollziel wird
    $el = Invoke-FF "WebDriver:FindElement" @{ using = "css selector"; value = "#inner" }
    $null = Invoke-FF "WebDriver:ElementClick" @{ id = $el.value.'element-6066-11e4-a52e-4f735466cecf' }
    $in0 = Js 'return document.getElementById("inner").scrollTop'; $y0 = ScrollY
    Send-FFKeys "j"; Start-Sleep -Milliseconds 600
    Check ((Js 'return document.getElementById("inner").scrollTop') - $in0 -eq 100 -and (ScrollY) -eq $y0) "j scrollt den angeklickten Container"
    Open-FFUrl "$base/long.html"; Start-Sleep -Milliseconds 300

    Write-Host "Eingabefelder und Modi"
    $el = Invoke-FF "WebDriver:FindElement" @{ using = "css selector"; value = "#i" }
    $null = Invoke-FF "WebDriver:ElementClick" @{ id = $el.value.'element-6066-11e4-a52e-4f735466cecf' }
    Send-FFKeys "jk"
    Check ((Js 'return document.getElementById("i").value') -eq "jk" -and (ScrollY) -eq 0) "Tippen im Eingabefeld"
    Send-FFKeys $esc
    Check ((Js 'return document.activeElement.id') -ne "i") "Esc verlaesst das Eingabefeld"
    Send-FFKeys "i"; Send-FFKeys "j"; Start-Sleep -Milliseconds 300
    Check ((ScrollY) -eq 0 -and (Js 'return t.at(-1)') -eq "j") "Einfuegemodus reicht j durch"
    Send-FFKeys $esc; Send-FFKeys "j"
    Check ((Settle) -eq 100) "nach Esc scrollt j wieder"
    Send-FFKeys "\j"; Start-Sleep -Milliseconds 300
    Check ((ScrollY) -eq 100 -and (Js 'return t.at(-1)') -eq "j") "\ reicht naechste Taste durch"
    Send-FFKeys "q"; Check ((Js 'return t.at(-1)') -eq "q") "unbelegte Taste q geht an die Seite"

    Write-Host "Navigation"
    Open-FFUrl "$base/long.html"; Start-Sleep -Milliseconds 300
    Send-FFKeys "]]"; Check (WaitFor 'return location.hash === "#seite3"') "]] folgt Weiter-Link"
    Send-FFKeys "[["; Check (WaitFor 'return location.hash === "#seite1"') "[[ folgt Zurueck-Link"
    Send-FFKeys "H"; Check (WaitFor 'return location.hash === "#seite3"') "H geht zurueck"
    Send-FFKeys "L"; Check (WaitFor 'return location.hash === "#seite1"') "L geht vor"
    Open-FFUrl "$base/sub/deep.html?x=1"; Start-Sleep -Milliseconds 300
    Send-FFKeys "gu"; Check (WaitFor 'return location.href === "http://localhost:8765/sub/deep.html"') "gu entfernt Query"
    Send-FFKeys "gu"; Start-Sleep -Milliseconds 500; Check ((Url) -eq "$base/sub/") "gu geht eine Ebene hoch"
    Open-FFUrl "$base/sub/deep.html"; Start-Sleep -Milliseconds 300
    Send-FFKeys "gU"; Start-Sleep -Milliseconds 500; Check ((Url) -eq "$base/") "gU zur Startseite"

    Write-Host "grabBackFocus und gi"
    Open-FFUrl "$base/autofocus.html"; Start-Sleep -Milliseconds 500
    Check ((Js 'return document.activeElement.id') -ne "q") "Autofocus wird zurueckgeholt"
    Send-FFKeys "gi"; Check ((Js 'return document.activeElement.id') -eq "q") "gi fokussiert Eingabefeld"

    Write-Host "Tabs"
    Open-FFUrl "$base/long.html"; Start-Sleep -Milliseconds 300
    $n0 = (Handles).Count
    Send-FFKeys "yt"; Start-Sleep -Milliseconds 800
    $dup = Handles | Where-Object { $_ -ne $main } | Select-Object -Last 1
    Check ((Handles).Count -eq $n0 + 1) "yt dupliziert Tab"
    Check ((Js 'return document.visibilityState') -eq "hidden") "Duplikat ist aktiv"
    Send-FFKeys "^"; Start-Sleep -Milliseconds 500
    Check ((Js 'return document.visibilityState') -eq "visible") "^ wechselt zum vorherigen Tab"
    Send-FFKeys "K"; Start-Sleep -Milliseconds 500
    Check ((Js 'return document.visibilityState') -eq "hidden") "K wechselt zum naechsten Tab"
    Send-FFKeys "g0"; Start-Sleep -Milliseconds 500
    Check ((Js 'return document.visibilityState') -eq "visible") "g0 wechselt zum ersten Tab"
    Send-FFKeys "J"; Start-Sleep -Milliseconds 500
    Check ((Js 'return document.visibilityState') -eq "hidden") "J vom ersten Tab springt zum letzten"
    Send-FFKeys "g0"; Start-Sleep -Milliseconds 500
    SwitchTo $dup; Start-Sleep -Milliseconds 300
    Send-FFKeys "x"; Start-Sleep -Milliseconds 800
    Check ((Handles).Count -eq $n0) "x schliesst Tab"
    SwitchTo $main
    Send-FFKeys "X"; Start-Sleep -Milliseconds 1000
    Check ((Handles).Count -eq $n0 + 1) "X stellt Tab wieder her"
    $restored = Handles | Where-Object { $_ -ne $main } | Select-Object -Last 1
    SwitchTo $restored; $null = Invoke-FF "WebDriver:CloseWindow"; SwitchTo $main

    Write-Host "Zwischenablage"
    Send-FFKeys "yy"; Start-Sleep -Milliseconds 300
    Send-FFKeys "P"; Start-Sleep -Milliseconds 1000
    $new = Handles | Where-Object { $_ -ne $main } | Select-Object -Last 1
    if ($new) { SwitchTo $new; Start-Sleep -Milliseconds 300; $u = Url; $null = Invoke-FF "WebDriver:CloseWindow"; SwitchTo $main }
    Check ($u -eq "$base/long.html") "yy + P oeffnet kopierte URL in neuem Tab ($u)"

    Write-Host "Link-Hints"
    $ctrl = [string][char]0xE009; $alt = [string][char]0xE00A
    function Labels { Js 'const h = document.querySelector("vim-keys-hints"); return h && h.isConnected ? [...h.shadowRoot.children].filter(m => m.style.display !== "none").map(m => m.dataset.label).join(",") : ""' }
    function Log { Js 'return log.join("|")' }
    Open-FFUrl "$base/hints.html"; Start-Sleep -Milliseconds 300
    Send-FFKeys "f"; Start-Sleep -Milliseconds 200
    $l = Labels; Check ($l -eq "s,a,d,j,k,l,e") "f markiert 7 sichtbare Elemente, verdeckter Link fehlt ($l)"
    Send-FFKeys $esc; Check ((Labels) -eq "") "Esc beendet Hints"
    Send-FFKeys "ff"; Check ((Labels) -eq "") "f f beendet Hints"
    Send-FFKeys "F"; Send-FFKeys "F"; Check ((Labels) -eq "") "F F beendet Hints"
    Send-FFKeys "fd"; Start-Sleep -Milliseconds 200; Check ((Log) -eq "click:b") "f d klickt Knopf"
    Send-FFKeys "fl"; Start-Sleep -Milliseconds 200; Check ((Log) -like "*click:ptr") "f l klickt Element mit Zeiger-Cursor"
    Send-FFKeys "fe"; Start-Sleep -Milliseconds 200; Check ((Js 'return document.activeElement.id') -eq "inp") "f e fokussiert Eingabefeld"
    Send-FFKeys $esc
    Send-FFChord @($ctrl, [string][char]0xE008, "F"); Send-FFKeys "k"; Start-Sleep -Milliseconds 200
    Check ((Log) -like "*hover*") "<c-s-f> k loest Hover aus ($(Log))"
    Send-FFChord @($ctrl, $alt, "f"); Send-FFKeys "j"; Start-Sleep -Milliseconds 200
    Check ((Log) -like "*ctx:2*") "<a-c-f> j oeffnet Kontextmenue der Seite ($(Log))"
    Send-FFKeys "fs"; Check (WaitFor 'return location.hash === "#ziel"') "f s folgt Link"
    $n0 = (Handles).Count
    Send-FFKeys "Fa"; Start-Sleep -Milliseconds 800
    Check ((Handles).Count -eq $n0 + 1 -and (Js 'return document.visibilityState') -eq "hidden") "F a oeffnet Link im Vordergrund-Tab"
    Send-FFKeys "g0"; Start-Sleep -Milliseconds 300
    Send-FFChord @($alt, "f"); Send-FFKeys "a"; Start-Sleep -Milliseconds 600
    Check ((Handles).Count -eq $n0 + 2 -and (Labels) -ne "" -and (Js 'return document.visibilityState') -eq "visible") "<a-f> a oeffnet Hintergrund-Tab und bleibt im Hint-Modus"
    Send-FFKeys $esc
    foreach ($h in Handles) { if ($h -ne $main) { SwitchTo $h; $null = Invoke-FF "WebDriver:CloseWindow" } }; SwitchTo $main
    Send-FFKeys "yfa"; Start-Sleep -Milliseconds 300; Send-FFKeys "P"; Start-Sleep -Milliseconds 1000
    $new = Handles | Where-Object { $_ -ne $main } | Select-Object -Last 1; $u = $null
    if ($new) { SwitchTo $new; Start-Sleep -Milliseconds 300; $u = Url; $null = Invoke-FF "WebDriver:CloseWindow"; SwitchTo $main }
    Check ($u -eq "$base/long.html") "yf a kopiert Link-URL ($u)"
    Open-FFUrl "$base/hints.html"; Start-Sleep -Milliseconds 300
    Send-FFKeys "f"; Start-Sleep -Milliseconds 200
    $shotHints = Save-FFScreenshot (Join-Path $env:TEMP "ff-test-vim-keys-hints.png")
    Send-FFKeys $esc

    Write-Host "Hints rotieren"
    function TopHint { Js 'const m = [...document.querySelector("vim-keys-hints").shadowRoot.children]; return m.reduce((a, b) => +b.style.zIndex > +a.style.zIndex ? b : a).dataset.label' }
    Open-FFUrl "$base/overlap.html"; Start-Sleep -Milliseconds 300
    Send-FFKeys "f"; Start-Sleep -Milliseconds 300
    $t0 = TopHint; Send-FFKeys " "; Start-Sleep -Milliseconds 200; $t1 = TopHint
    Check ($t0 -and $t1 -and $t0 -ne $t1) "Leertaste rotiert ueberlappende Hints ($t0 -> $t1)"
    Send-FFKeys $esc; Start-Sleep -Milliseconds 200

    Write-Host "Hints ueber Frames"
    Open-FFUrl "$base/frames.html"; Start-Sleep -Milliseconds 800
    Send-FFKeys "f"; Start-Sleep -Milliseconds 400
    $l = Labels; Check ($l -eq "s") "f: Link oben bekommt s, Checkbox im fremden Frame das zweite Label ($l)"
    Send-FFKeys "a"; Start-Sleep -Milliseconds 400
    Check ((Log) -eq "cb:true") "f a klickt Checkbox im Cross-Origin-Frame ($(Log))"
    Check ((Labels) -eq "") "danach Hints in allen Frames weg"
    Send-FFKeys "f"; Start-Sleep -Milliseconds 300; Send-FFKeys $esc; Start-Sleep -Milliseconds 200; Send-FFKeys "a"; Start-Sleep -Milliseconds 300
    Check ((Log) -eq "cb:true" -and (Labels) -eq "") "Esc beendet Hints auch im Frame"

    Write-Host "Suche"
    $enter = [string][char]0xE007
    function Sel { Js 'const s = getSelection(); return s.rangeCount ? s.anchorNode.parentElement.closest("p").id + ":" + s.toString() : ""' }
    function FindOpen { Js 'const h = document.querySelector("vim-keys-find"); return !!(h && h.isConnected)' }
    Open-FFUrl "$base/find.html"; Start-Sleep -Milliseconds 300
    Send-FFKeys "/apfel"; Start-Sleep -Milliseconds 200
    Check ((FindOpen) -and (Sel) -eq "p1:Apfel") "/apfel markiert ersten Treffer live ($(Sel))"
    Check ((Js 'return t.join("")') -eq "") "Eingabe in der Suchzeile erreicht die Seite nicht"
    Send-FFKeys $enter; Start-Sleep -Milliseconds 200
    Check (-not (FindOpen)) "Enter schliesst Suchzeile"
    Send-FFKeys "n"; Check ((Sel) -eq "p2:apfel") "n: naechster Treffer, Gross/Klein egal ($(Sel))"
    Send-FFKeys "nn"; Start-Sleep -Milliseconds 200
    Check ((Sel) -eq "p4:Apfel" -and (ScrollY) -gt 1000) "nn springt nach unten und scrollt"
    Send-FFKeys "n"; Check ((Sel) -eq "p1:Apfel") "n am Ende faengt von vorn an"
    Send-FFKeys "N"; Check ((Sel) -eq "p4:Apfel") "N geht rueckwaerts"
    Send-FFKeys "gg"; $null = Settle
    Send-FFKeys "/Apfel$enter"; Send-FFKeys "n"; Check ((Sel) -eq "p3:Apfel") "Grossbuchstabe = exakte Schreibweise"
    Send-FFKeys "gg"; $null = Settle
    Send-FFKeys "/u.ten$enter"; Check ((Sel) -eq "p4:unten") "Eingabe ist Regex ($(Sel))"
    Send-FFKeys "gg"; $null = Settle
    Send-FFKeys "/einsein$enter"; Check ((Sel) -eq "") "kein Treffer ueber Absatzgrenzen"
    Send-FFKeys "/kl"; Send-FFKeys $esc; Start-Sleep -Milliseconds 200
    Check (-not (FindOpen) -and (Sel) -eq "") "Esc bricht Suche ab"
    Send-FFKeys "/linkziel$enter"; Start-Sleep -Milliseconds 200
    Check ((Js 'return document.activeElement.id') -eq "lk") "Treffer im Link fokussiert den Link"
    Send-FFKeys $enter; Check (WaitFor 'return location.hash === "#x"') "Enter folgt dann dem Link"

    Write-Host "Visual-Modus"
    function SelText { Js 'return getSelection().toString()' }
    Open-FFUrl "$base/visual.html"; Start-Sleep -Milliseconds 300
    Send-FFKeys "v"; Check ((SelText) -eq "H") "v ohne Auswahl beginnt am ersten Text ($(SelText))"
    Send-FFKeys "4l"; Check ((SelText) -eq "Hallo") "4l erweitert um 4 Zeichen ($(SelText))"
    Send-FFKeys "w"; Check ((SelText) -like "Hallo Welt*" -or (SelText) -like "Hallo *") "w erweitert wortweise ($(SelText))"
    Check ((Js 'return t.join("")') -eq "") "Tasten im Visual-Modus erreichen die Seite nicht"
    Send-FFKeys "V"; $st = SelText; Check ($st.Trim() -eq "Hallo Welt eins") "V markiert ganze Zeile ($st)"
    Send-FFKeys "j"; $st = SelText; Check ($st -like "*Zweite Zeile hier*") "j im Zeilenmodus nimmt naechste Zeile dazu"
    Send-FFKeys $esc; Check ((SelText) -eq "") "Esc beendet Visual-Modus"
    Send-FFKeys "j"; Check ((Settle) -eq 100) "danach wieder Normalmodus"
    Send-FFKeys "gg"; $null = Settle
    Send-FFKeys "/localhost$enter"; Send-FFKeys "v$"; $st = SelText
    Check ($st -eq "localhost:8765/long.html") "v nach Suche erweitert die Fundstelle, $ bis Zeilenende ($st)"
    Send-FFKeys "y"; Start-Sleep -Milliseconds 300; Send-FFKeys "P"; Start-Sleep -Milliseconds 1000
    $new = Handles | Where-Object { $_ -ne $main } | Select-Object -Last 1; $u = $null
    if ($new) { SwitchTo $new; Start-Sleep -Milliseconds 300; $u = Url; $null = Invoke-FF "WebDriver:CloseWindow"; SwitchTo $main }
    Check ($u -eq "$base/long.html") "y kopiert Auswahl ($u)"

    Write-Host "Marken"
    Open-FFUrl "$base/long.html"; Start-Sleep -Milliseconds 300
    Send-FFKeys "5j"; $null = Settle; Send-FFKeys 'ma'; Start-Sleep -Milliseconds 200
    Send-FFKeys "gg"; $null = Settle
    Send-FFKeys '`a'; Start-Sleep -Milliseconds 300; Check ((ScrollY) -eq 500) "ma / ``a springt zur Marke"
    Send-FFKeys '``'; Start-Sleep -Milliseconds 300; Check ((ScrollY) -eq 0) "```` springt zurueck"
    Open-FFUrl "$base/long.html"; Start-Sleep -Milliseconds 300
    Send-FFKeys '`a'; Start-Sleep -Milliseconds 300; Check ((ScrollY) -eq 500) "lokale Marke bleibt nach Neuladen"
    Send-FFKeys '`b'; Start-Sleep -Milliseconds 300; Check ((ScrollY) -eq 500) "unbekannte Marke bewegt nichts"
    Send-FFKeys "gg"; $null = Settle; Send-FFKeys "3j"; $null = Settle; Send-FFKeys 'mB'; Start-Sleep -Milliseconds 200
    Open-FFUrl "$base/visual.html"; Start-Sleep -Milliseconds 300
    $n0 = (Handles).Count
    Send-FFKeys '`B'; Start-Sleep -Milliseconds 1500
    $new = Handles | Where-Object { $_ -ne $main } | Select-Object -Last 1; $y = $null; $u = $null
    if ($new) { SwitchTo $new; Start-Sleep -Milliseconds 300; $u = Url; $y = ScrollY; $null = Invoke-FF "WebDriver:CloseWindow"; SwitchTo $main }
    Check ($u -eq "$base/long.html" -and $y -eq 300) "globale Marke ``B oeffnet Seite in neuem Tab an Position ($u, $y)"

    Write-Host "Vomnibar"
    $vb = 'const r = document.querySelector("vim-keys-vomnibar")?.shadowRoot;'
    Open-FFUrl "$base/long.html"; Start-Sleep -Milliseconds 300
    Send-FFKeys "o"; Start-Sleep -Milliseconds 300
    Check (Js "$vb return !!r && r.activeElement?.localName === 'input'") "o oeffnet Vomnibar mit Fokus"
    Send-FFKeys "deep"; Start-Sleep -Milliseconds 600
    $rows = Js "$vb return [...r.querySelectorAll('input + div > div')].map(d => d.textContent).join(' | ')"
    Check ($rows -like "*sub/deep.html*") "Verlauf liefert deep.html ($rows)"
    Check ((ScrollY) -eq 0) "Tippen in der Vomnibar scrollt nicht"
    Send-FFKeys ([string][char]0xE015); Send-FFKeys $enter   # Pfeil runter: erster Vorschlag nach "Suchen: deep"
    Check (WaitFor 'return location.pathname === "/sub/deep.html"') "Enter oeffnet gewaehlten Vorschlag"
    Send-FFKeys "ge"; Start-Sleep -Milliseconds 300
    Check ((Js "$vb return r.querySelector('input').value") -eq (Url)) "ge zeigt aktuelle URL"
    Send-FFKeys $esc; Start-Sleep -Milliseconds 200
    Check (-not (Js 'return !!document.querySelector("vim-keys-vomnibar")?.isConnected')) "Esc schliesst Vomnibar"
    $n0 = (Handles).Count
    Send-FFKeys "O"; Start-Sleep -Milliseconds 300; Send-FFKeys "localhost:8765/visual.html$enter"; Start-Sleep -Milliseconds 1200
    $new = Handles | Where-Object { $_ -ne $main } | Select-Object -Last 1; $u = $null
    if ($new) { SwitchTo $new; Start-Sleep -Milliseconds 300; $u = Url }
    Check ((Handles).Count -eq $n0 + 1 -and $u -eq "$base/visual.html") "O oeffnet getippte URL in neuem Tab ($u)"
    if ($new) {
      Send-FFKeys "T"; Start-Sleep -Milliseconds 300; Send-FFKeys "deep"; Start-Sleep -Milliseconds 600; Send-FFKeys $enter
      Start-Sleep -Milliseconds 500
      Check ((Js 'return document.visibilityState') -eq "hidden") "T wechselt zum gesuchten Tab"
      $null = Invoke-FF "WebDriver:CloseWindow"; SwitchTo $main
    }

    Write-Host "Hilfe"
    Send-FFKeys "?"; Start-Sleep -Milliseconds 300
    Check (Js 'return !!document.querySelector("vim-keys-help")') "? zeigt Hilfe"
    $shot = Save-FFScreenshot (Join-Path $env:TEMP "ff-test-vim-keys-help.png")
    Send-FFKeys $esc; Start-Sleep -Milliseconds 200
    Check (-not (Js 'return !!document.querySelector("vim-keys-help")')) "Esc schliesst Hilfe"
}
finally { Disconnect-FF }

if ($fail) { $fail | ForEach-Object { Write-Host "FEHLER: $_" }; exit 1 }
Write-Host "OK  (Screenshot Hilfe: $shot)"
