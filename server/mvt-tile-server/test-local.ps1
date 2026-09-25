# PowerShell local testing script for Meewav MVT Server
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "RUNNING MEEWAV MVT SERVER DIAGNOSTICS" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

# 1. Health check
Write-Host "`n[1/3] Testing /health endpoint..." -ForegroundColor Yellow
$health = Invoke-WebRequest -Uri "http://localhost:5000/health" -Method Get -UseBasicParsing
Write-Host "Status Code: $($health.StatusCode)" -ForegroundColor Green
$health.Content | ConvertFrom-Json | Format-List

# 2. Parallel JSON API
Write-Host "`n[2/3] Testing /api/musicians_api JSON endpoint..." -ForegroundColor Yellow
$api = Invoke-WebRequest -Uri "http://localhost:5000/api/musicians_api" -Method Get -UseBasicParsing
Write-Host "Status Code: $($api.StatusCode)" -ForegroundColor Green
$api.Content | ConvertFrom-Json | Format-Table

# 3. MVT Tile download
Write-Host "`n[3/3] Requesting MVT tile /musicians_clustered/16/33193/22545..." -ForegroundColor Yellow
$mvtFile = "test.mvt"
if (Test-Path $mvtFile) { Remove-Item $mvtFile }

Invoke-WebRequest -Uri "http://localhost:5000/musicians_clustered/16/33193/22545" -OutFile $mvtFile -UseBasicParsing

if (Test-Path $mvtFile) {
    $size = (Get-Item $mvtFile).Length
    if ($size -gt 0) {
        Write-Host "Success! '$mvtFile' downloaded successfully." -ForegroundColor Green
        Write-Host "File size: $size bytes" -ForegroundColor Green
    } else {
        Write-Warning "Warning: '$mvtFile' was downloaded but is empty (0 bytes)."
    }
} else {
    Write-Error "Error: Failed to download '$mvtFile'."
}

Write-Host "`n====================================================================" -ForegroundColor Cyan
Write-Host "DIAGNOSTICS COMPLETED" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
