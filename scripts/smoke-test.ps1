# Smoke test: is a deployed copy of the app alive and answering correctly?
# Usage: .\scripts\smoke-test.ps1 https://your-app-address [-ExpectedVersion abc1234]
# If -ExpectedVersion is given, /health must report exactly that build.
# Exits 0 if every check passes, 1 if any fails.
param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [string]$ExpectedVersion = ""
)

$BaseUrl = $BaseUrl.TrimEnd('/')
$script:failed = $false

function Check([string]$Path, [int]$Want, [string]$Needle = "") {
    $body = ""
    try {
        # 60-second timeout leaves room for a scaled-to-zero app to wake up.
        $r = Invoke-WebRequest -Uri "$BaseUrl$Path" -UseBasicParsing -TimeoutSec 60
        $code = [int]$r.StatusCode
        $body = [string]$r.Content
    } catch {
        # A 404 or 500 throws in Windows PowerShell; read the code if there is one.
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    }
    if ($code -ne $Want) {
        Write-Host "FAIL  $Path -> $code (expected $Want)"
        $script:failed = $true
    } elseif ($Needle -and -not $body.Contains($Needle)) {
        Write-Host "FAIL  $Path -> $code but the body does not contain: $Needle"
        $script:failed = $true
    } else {
        $note = if ($Needle) { " (contains: $Needle)" } else { "" }
        Write-Host "PASS  $Path -> $code$note"
    }
}

Check '/health' 200 '"status":"ok"'
Check '/hello' 200 '"message":"Hello from Sami Bistro'
Check '/menu' 200 '"price":'
Check '/no-such-page' 404

if ($ExpectedVersion) {
    Check '/health' 200 "`"version`":`"$ExpectedVersion`""
}

if ($script:failed) { Write-Host "FAIL: at least one check failed"; exit 1 }
Write-Host "PASS: all checks passed"
exit 0
