# Statischer Mini-Webserver für test/pages, nur auf localhost. Wird von start-test-firefox.ps1 im Hintergrund gestartet.
# (Content-Scripts laufen im Testprofil nicht auf file://-Seiten, deshalb http://localhost.)
param([int]$Port = 8765)
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\test\pages"))
$types = @{ ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript"; ".css" = "text/css"; ".png" = "image/png"; ".jpg" = "image/jpeg"; ".svg" = "image/svg+xml" }
$http = New-Object Net.HttpListener
$http.Prefixes.Add("http://localhost:$Port/")
$http.Prefixes.Add("http://localhost:$($Port + 1)/")   # zweite Origin für Frame-Tests
$http.Start()
while ($http.IsListening) {
    $ctx = $http.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
    $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($rel -and $file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file)
        $ctx.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" }
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
    $ctx.Response.Close()
}
