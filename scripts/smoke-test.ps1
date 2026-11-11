# Smoke test: is a deployed copy of the app alive and answering?
# Usage: .\scripts\smoke-test.ps1 https://your-app-address
# Exits 0 if every check passes, 1 if any fails.
param([Parameter(Mandatory = $true)][string]$BaseUrl)

$BaseUrl = $BaseUrl.TrimEnd('/')
$failed = $false

foreach ($path in '/health', '/hello') {
    try {
        # 60-second timeout leaves room for a scaled-to-zero app to wake up.
        $r = Invoke-WebRequest -Uri "$BaseUrl$path" -UseBasicParsing -TimeoutSec 60
        $code = [int]$r.StatusCode
    } catch {
        # A 404 or 500 throws in Windows PowerShell; read the code if there is one.
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    }
    if ($code -eq 200) {
        Write-Host "PASS  $path -> $code"
    } else {
        Write-Host "FAIL  $path -> $code (expected 200)"
        $failed = $true
    }
}

if ($failed) { Write-Host "FAIL: at least one check failed"; exit 1 }
Write-Host "PASS: all checks passed"
exit 0
