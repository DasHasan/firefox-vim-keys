# Startet Firefox mit einem separaten Wegwerf-Profil (berührt die echten Profile nicht)
# und lädt Vim Keys als temporäres Add-on (über Marionette).
#   .\tools\start-test-firefox.ps1          -Reset löscht das Testprofil vorher.
param([switch]$Reset)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Marionette.ps1"

$extDir     = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$profileDir = Join-Path $env:TEMP "ff-vim-keys-test-profile"
$firefox    = "$env:LOCALAPPDATA\Mozilla Firefox\firefox.exe"
$serve      = Join-Path $PSScriptRoot "serve.ps1"

$id   = (Get-Content -Raw (Join-Path $extDir "manifest.json") | ConvertFrom-Json).browser_specific_settings.gecko.id
$uuid = Get-ExtUuid $id

# Laufende Test-Instanz beenden (nur die mit diesem Profil, nicht den normalen Firefox)
$running = Get-CimInstance Win32_Process -Filter "Name='firefox.exe'" |
    Where-Object { $_.CommandLine -like "*$profileDir*" }
if ($running) {
    $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}

# Testseiten-Server (test/pages -> http://localhost:8765/) einmalig im Hintergrund starten
$server = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like "*$serve*" }
if (-not $server) {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @("-NoProfile", "-File", "`"$serve`"")
}

if ($Reset -and (Test-Path $profileDir)) { Remove-Item -Recurse -Force $profileDir }
New-Item -ItemType Directory -Force $profileDir | Out-Null

# Marionette-Port, feste Extension-UUID, Erststart-Dialoge unterdrücken
$uuidMap = (ConvertTo-Json -InputObject @{ $id = $uuid } -Compress).Replace('"', '\"')
@"
user_pref("marionette.port", $script:FFDefaultPort);
user_pref("extensions.webextensions.uuids", "$uuidMap");
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
"@ | Set-Content -Encoding ASCII (Join-Path $profileDir "user.js")

Start-Process $firefox -ArgumentList @("-profile", "`"$profileDir`"", "-no-remote", "-marionette",
    "about:debugging#/runtime/this-firefox")   # about:-Seiten kann Marionette nicht ansteuern

Connect-FF
try {
    $null = Install-FFAddon $extDir
    Write-Host "Geladen: $id  ->  moz-extension://$uuid/"
}
finally { Disconnect-FF }
