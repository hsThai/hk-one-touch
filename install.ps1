# ================================================
#   HKApp - Cai Dat Lan Dau (Windows 10/11)
#   Click phai -> Run with PowerShell
# ================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   HKApp - Cai Dat He Thong" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── Kiểm tra Node.js ─────────────────────────────
try {
    $nodeVer = & node -v 2>&1
    Write-Host "[OK] Node.js: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "LOI: Chua cai Node.js!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Vui long:" -ForegroundColor Yellow
    Write-Host "  1. Vao https://nodejs.org"
    Write-Host "  2. Tai ban LTS"
    Write-Host "  3. Cai dat binh thuong (Next -> Finish)"
    Write-Host "  4. Chay lai file nay"
    Write-Host ""
    Start-Process "https://nodejs.org"
    Read-Host "Nhan Enter de thoat"
    exit 1
}

# ── Tạo thư mục C:\hkapp ─────────────────────────
$HKAPP_DIR = "C:\hkapp"
if (-not (Test-Path $HKAPP_DIR)) {
    New-Item -ItemType Directory -Path $HKAPP_DIR | Out-Null
    Write-Host "[OK] Tao thu muc C:\hkapp" -ForegroundColor Green
}

Set-Location $HKAPP_DIR

# ── Tải zip ──────────────────────────────────────
$ZIP_URL = "https://base44.app/api/apps/69bf5d0a924e0a8766577274/files/mp/public/69bf5d0a924e0a8766577274/0444119e8_hkapp-lan.zip"
$ZIP_PATH = "$HKAPP_DIR\_install.zip"

Write-Host ""
Write-Host "Dang tai source code..." -ForegroundColor Yellow
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $ZIP_URL -OutFile $ZIP_PATH -UseBasicParsing
    Write-Host "[OK] Tai xong!" -ForegroundColor Green
} catch {
    Write-Host "LOI: Khong tai duoc file!" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Read-Host "Nhan Enter de thoat"
    exit 1
}

# ── Giải nén ─────────────────────────────────────
Write-Host "Dang giai nen..." -ForegroundColor Yellow
$TMP_DIR = "$HKAPP_DIR\_tmp"
if (Test-Path $TMP_DIR) { Remove-Item $TMP_DIR -Recurse -Force }

Expand-Archive -Path $ZIP_PATH -DestinationPath $TMP_DIR -Force

# Copy files (bỏ qua node_modules và dist)
$SRC = "$TMP_DIR\hkapp-lan"
Get-ChildItem $SRC | Where-Object { $_.Name -notin @("node_modules","dist",".git") } | ForEach-Object {
    $dest = Join-Path $HKAPP_DIR $_.Name
    if ($_.PSIsContainer) {
        Copy-Item $_.FullName -Destination $dest -Recurse -Force
    } else {
        Copy-Item $_.FullName -Destination $dest -Force
    }
}

# Dọn dẹp
Remove-Item $TMP_DIR -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $ZIP_PATH -Force -ErrorAction SilentlyContinue
Write-Host "[OK] Giai nen xong!" -ForegroundColor Green

# ── Cài npm ──────────────────────────────────────
Write-Host ""
Write-Host "Dang cai thu vien npm (lan dau mat 3-5 phut)..." -ForegroundColor Yellow
Set-Location $HKAPP_DIR

& npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "LOI: npm install that bai!" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat"
    exit 1
}

Write-Host ""
Write-Host "[OK] Cai dat hoan tat!" -ForegroundColor Green

# ── Hỏi chạy luôn không ──────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "   CAI DAT HOAN TAT!" -ForegroundColor Green
Write-Host "   Chay start.ps1 de khoi dong server" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

$chay = Read-Host "Khoi dong server luon? (Y/N)"
if ($chay -match "^[Yy]") {
    & "$HKAPP_DIR\start.ps1"
} else {
    Read-Host "Nhan Enter de thoat"
}
