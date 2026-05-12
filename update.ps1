# ================================================
#   HKApp - Cap Nhat Code Moi Nhat
#   Click phai -> Run with PowerShell
# ================================================

$HKAPP_DIR = "C:\hkapp"
$ZIP_URL = "https://base44.app/api/apps/69bf5d0a924e0a8766577274/files/mp/public/69bf5d0a924e0a8766577274/0444119e8_hkapp-lan.zip"
$ZIP_PATH = "$HKAPP_DIR\_update.zip"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   HKApp - Cap Nhat Phien Ban Moi" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── Tải zip mới ──────────────────────────────────
Write-Host "Dang tai ban moi nhat..." -ForegroundColor Yellow
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $ZIP_URL -OutFile $ZIP_PATH -UseBasicParsing
    Write-Host "[OK] Tai xong!" -ForegroundColor Green
} catch {
    Write-Host "LOI: Khong tai duoc!" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Read-Host "Nhan Enter de thoat"
    exit 1
}

# ── Backup src cũ ────────────────────────────────
Write-Host "Backup code cu..." -ForegroundColor Yellow
$BACKUP = "$HKAPP_DIR\src_backup"
if (Test-Path $BACKUP) { Remove-Item $BACKUP -Recurse -Force }
if (Test-Path "$HKAPP_DIR\src") {
    Copy-Item "$HKAPP_DIR\src" -Destination $BACKUP -Recurse
}

# ── Giải nén src mới ─────────────────────────────
Write-Host "Dang cap nhat code..." -ForegroundColor Yellow
$TMP_DIR = "$HKAPP_DIR\_tmp"
if (Test-Path $TMP_DIR) { Remove-Item $TMP_DIR -Recurse -Force }
Expand-Archive -Path $ZIP_PATH -DestinationPath $TMP_DIR -Force

# Chỉ copy thư mục src (giữ nguyên node_modules, package.json)
if (Test-Path "$TMP_DIR\hkapp-lan\src") {
    if (Test-Path "$HKAPP_DIR\src") { Remove-Item "$HKAPP_DIR\src" -Recurse -Force }
    Copy-Item "$TMP_DIR\hkapp-lan\src" -Destination "$HKAPP_DIR\src" -Recurse -Force
    Write-Host "[OK] Cap nhat src hoan tat!" -ForegroundColor Green
} else {
    Write-Host "LOI: Khong tim thay src trong zip!" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat"
    exit 1
}

# Dọn dẹp
Remove-Item $TMP_DIR -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $ZIP_PATH -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "   CAP NHAT HOAN TAT!" -ForegroundColor Green
Write-Host "   - Neu server dang chay: tat di, chay start.ps1 lai" -ForegroundColor White
Write-Host "   - Backup cu: C:\hkapp\src_backup" -ForegroundColor Gray
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Read-Host "Nhan Enter de thoat"
