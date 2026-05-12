# ================================================
#   Dung tat ca services
# ================================================

Write-Host "Dang dung HKApp va PocketBase..." -ForegroundColor Yellow

# Dừng PocketBase
Get-Process -Name "pocketbase" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "[OK] Dung PocketBase" -ForegroundColor Green

# Dừng Node/Vite (npm run dev)
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "[OK] Dung HKApp (Node)" -ForegroundColor Green

Write-Host ""
Write-Host "Tat het! De khoi dong lai chay start.ps1" -ForegroundColor Cyan
Start-Sleep -Seconds 2
