# ================================================
#   HKApp - Khoi Dong Server
#   Click phai -> Run with PowerShell
# ================================================

Set-Location "C:\hkapp"

# Tìm IP LAN
$LAN_IP = (Get-NetIPAddress -AddressFamily IPv4 | 
    Where-Object { $_.IPAddress -notmatch "^127\." -and $_.IPAddress -notmatch "^169\." } | 
    Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   HKApp - Quan Ly Sua Chua" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Local   : http://localhost:3000" -ForegroundColor Green
Write-Host "   LAN     : http://${LAN_IP}:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Dien thoai vao cung WiFi:" -ForegroundColor White
Write-Host "   http://${LAN_IP}:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Nhan Ctrl+C de dung server" -ForegroundColor Gray
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

& npm run dev
