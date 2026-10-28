# Minimaler Marionette-Client (Firefox' eingebautes WebDriver-Protokoll), ohne npm/geckodriver.
# Einbinden mit:  . "$PSScriptRoot\Marionette.ps1"
# Pakete im Format "<bytes>:<json>", Befehle als [0, id, "Name", {params}], Antworten [1, id, error, result].

$script:FFDefaultPort = 2829

# Feste moz-extension-UUID pro Add-on-ID (wird im Testprofil per Pref gesetzt),
# damit Tests Extension-Seiten direkt öffnen können: moz-extension://<uuid>/popup.html
function Get-ExtUuid([string]$Id) {
    $md5 = [Security.Cryptography.MD5]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($Id))
    ([guid]::new($md5)).ToString("D")
}

function Send-FFPacket($obj) {
    $body = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $obj -Compress -Depth 20))
    $head = [Text.Encoding]::ASCII.GetBytes("$($body.Length):")
    $script:FFStream.Write($head, 0, $head.Length)
    $script:FFStream.Write($body, 0, $body.Length)
    $script:FFStream.Flush()
}

function Read-FFPacket {
    $s = $script:FFStream; $len = ""
    while (($b = $s.ReadByte()) -ne 58) {   # 58 = ':'
        if ($b -lt 0) { throw "Marionette-Verbindung geschlossen" }
        $len += [char]$b
    }
    $n = [int]$len; $buf = New-Object byte[] $n; $off = 0
    while ($off -lt $n) {
        $r = $s.Read($buf, $off, $n - $off)
        if ($r -le 0) { throw "Marionette-Verbindung geschlossen" }
        $off += $r
    }
    ConvertFrom-Json ([Text.Encoding]::UTF8.GetString($buf))
}

function Invoke-FF([string]$Command, $Params = @{}) {
    $id = ++$script:FFMsgId
    Send-FFPacket @(0, $id, $Command, $Params)
    while ($true) {
        $p = Read-FFPacket
        if ($p -is [array] -and $p[0] -eq 1 -and $p[1] -eq $id) {
            if ($p[2]) { throw "$Command fehlgeschlagen: $($p[2].error): $($p[2].message)" }
            return $p[3]
        }
    }
}

function Connect-FF([int]$Port = $script:FFDefaultPort, [int]$TimeoutSec = 30) {
    $script:FFClient = $null
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while (-not $script:FFClient) {
        try { $script:FFClient = New-Object Net.Sockets.TcpClient("127.0.0.1", $Port) }
        catch {
            if ((Get-Date) -gt $deadline) { throw "Marionette-Port $Port nicht erreichbar (Testfirefox gestartet?)" }
            Start-Sleep -Milliseconds 500
        }
    }
    $script:FFStream = $script:FFClient.GetStream()
    $script:FFMsgId = 0
    $null = Read-FFPacket                                   # Begrüßung {"marionetteProtocol":3,...}
    $null = Invoke-FF "WebDriver:NewSession" @{ capabilities = @{} }
}

function Disconnect-FF {
    try { $null = Invoke-FF "WebDriver:DeleteSession" } catch {}
    if ($script:FFClient) { $script:FFClient.Close(); $script:FFClient = $null }
}

# Temporäres Add-on aus einem entpackten Ordner installieren, gibt die Add-on-ID zurück
function Install-FFAddon([string]$Path) {
    (Invoke-FF "Addon:Install" @{ path = $Path; temporary = $true }).value
}

function Open-FFUrl([string]$Url) { $null = Invoke-FF "WebDriver:Navigate" @{ url = $Url } }

# JS im aktuellen Tab ausführen (Seitenkontext); Rückgabe per "return ..."
function Invoke-FFScript([string]$Script, [array]$Arguments = @()) {
    (Invoke-FF "WebDriver:ExecuteScript" @{ script = $Script; args = $Arguments }).value
}

# Echte (isTrusted) Tastendrücke an das fokussierte Element. Sondertasten als WebDriver-Codes,
# z. B. Enter "`u{E007}" -> in PS 5.1: [char]0xE007, Escape [char]0xE00C, Shift [char]0xE008, Ctrl [char]0xE009, Alt [char]0xE00A
function Send-FFKeys([string]$Text) {
    $acts = foreach ($c in $Text.ToCharArray()) {
        @{ type = "keyDown"; value = [string]$c }; @{ type = "keyUp"; value = [string]$c }
    }
    $null = Invoke-FF "WebDriver:PerformActions" @{ actions = @(@{ type = "key"; id = "kb"; actions = @($acts) }) }
    try { $null = Invoke-FF "WebDriver:ReleaseActions" } catch {}   # Tab kann durch die Taste geschlossen sein
}

# Tastenkombination, z. B. Send-FFChord @([char]0xE009, "f")  -> Strg+F (Modifier zuerst)
function Send-FFChord([string[]]$Keys) {
    $acts = @(); foreach ($k in $Keys) { $acts += @{ type = "keyDown"; value = $k } }
    [array]::Reverse($Keys); foreach ($k in $Keys) { $acts += @{ type = "keyUp"; value = $k } }
    $null = Invoke-FF "WebDriver:PerformActions" @{ actions = @(@{ type = "key"; id = "kb"; actions = $acts }) }
    try { $null = Invoke-FF "WebDriver:ReleaseActions" } catch {}   # Tab kann durch die Taste geschlossen sein
}

# Screenshot des aktuellen Tab-Inhalts als PNG (zum Ansehen mit dem Read-Tool)
function Save-FFScreenshot([string]$Path) {
    $b64 = (Invoke-FF "WebDriver:TakeScreenshot" @{}).value
    [IO.File]::WriteAllBytes($Path, [Convert]::FromBase64String($b64))
    $Path
}
