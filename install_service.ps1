# ================================================
#   Cai PocketBase + HKApp thanh Windows Service
#   Dung NSSM (Non-Sucking Service Manager)
#   Chay ngam, khong can cua so, khoi dong cung Windows
# ================================================

# Tu dong nang quyen Admin
If (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process PowerShell -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    Exit
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   Cai Dat Windows Service" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── Tải NSSM (tool cai service cho bat ky exe nao) ──
$nssmDir  = "C:\nssm"
$nssmExe  = "$nssmDir\nssm.exe"

if (-not (Test-Path $nssmExe)) {
    Write-Host "Dang tai NSSM..." -ForegroundColor Yellow
    $nssmZip = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip -UseBasicParsing

    Write-Host "Dang giai nen NSSM..." -ForegroundColor Yellow
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($nssmZip)
    $exeEntry = $zip.Entries | Where-Object { $_.FullName -like "*win64*nssm.exe" } | Select-Object -First 1
    if (-not $exeEntry) {
        $exeEntry = $zip.Entries | Where-Object { $_.Name -eq "nssm.exe" } | Select-Object -First 1
    }
    New-Item -ItemType Directory -Path $nssmDir -Force | Out-Null
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($exeEntry, $nssmExe, $true)
    $zip.Dispose()
    Remove-Item $nssmZip -Force
    Write-Host "[OK] NSSM da cai tai $nssmExe" -ForegroundColor Green
} else {
    Write-Host "[OK] NSSM san co" -ForegroundColor Green
}

# ── Cai PocketBase Service ──────────────────────
Write-Host ""
Write-Host "Dang cai PocketBase Service..." -ForegroundColor Yellow

# Xoa service cu neu co
& $nssmExe stop PocketBase 2>$null
& $nssmExe remove PocketBase confirm 2>$null
Start-Sleep -Seconds 1

& $nssmExe install PocketBase "C:\pocketbase\pocketbase.exe"
& $nssmExe set PocketBase AppParameters "serve --http=0.0.0.0:8090"
& $nssmExe set PocketBase AppDirectory "C:\pocketbase"
& $nssmExe set PocketBase Start SERVICE_AUTO_START
& $nssmExe set PocketBase AppStdout "C:\pocketbase\pb.log"
& $nssmExe set PocketBase AppStderr "C:\pocketbase\pb_err.log"
& $nssmExe set PocketBase AppRestartDelay 3000
& $nssmExe set PocketBase ObjectName LocalSystem

Write-Host "[OK] PocketBase Service da cai" -ForegroundColor Green

# ── Cai HKApp Service ───────────────────────────
Write-Host "Dang cai HKApp Service..." -ForegroundColor Yellow

# Tim duong dan npm
$npmPath = (Get-Command npm -ErrorAction SilentlyContinue)?.Source
if (-not $npmPath) {
    # Thu tim thu cong
    $candidates = @(
        "$env:ProgramFiles\nodejs\npm.cmd",
        "$env:APPDATA\npm\npm.cmd"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $npmPath = $c; break }
    }
}

if ($npmPath) {
    & $nssmExe stop HKApp 2>$null
    & $nssmExe remove HKApp confirm 2>$null
    Start-Sleep -Seconds 1

    & $nssmExe install HKApp $npmPath
    & $nssmExe set HKApp AppParameters "run dev"
    & $nssmExe set HKApp AppDirectory "C:\hkapp"
    & $nssmExe set HKApp Start SERVICE_AUTO_START
    & $nssmExe set HKApp AppStdout "C:\hkapp\hkapp.log"
    & $nssmExe set HKApp AppStderr "C:\hkapp\hkapp_err.log"
    & $nssmExe set HKApp AppRestartDelay 5000
    & $nssmExe set HKApp ObjectName LocalSystem
    & $nssmExe set HKApp DependOnService PocketBase

    Write-Host "[OK] HKApp Service da cai (phu thuoc PocketBase)" -ForegroundColor Green
} else {
    Write-Host "[WARN] Khong tim thay npm - bo qua HKApp service" -ForegroundColor Red
    Write-Host "       Hay cai Node.js roi chay lai script nay" -ForegroundColor Yellow
}

# ── Khởi động cả hai ────────────────────────────
Write-Host ""
Write-Host "Dang khoi dong services..." -ForegroundColor Yellow
& $nssmExe start PocketBase
Start-Sleep -Seconds 3
& $nssmExe start HKApp 2>$null

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "   HOAN TAT!" -ForegroundColor Green
Write-Host ""
Write-Host "   PocketBase + HKApp gio chay nhu Service:" -ForegroundColor White
Write-Host "   - Tu dong bat khi Windows khoi dong" -ForegroundColor Yellow
Write-Host "   - Khong can cua so CMD nao het" -ForegroundColor Yellow
Write-Host "   - Tu dong restart neu crash" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Kiem tra: services.msc -> tim PocketBase / HKApp" -ForegroundColor Gray
Write-Host "   Log PocketBase : C:\pocketbase\pb.log" -ForegroundColor Gray
Write-Host "   Log HKApp      : C:\hkapp\hkapp.log" -ForegroundColor Gray
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"
Read-Host "Nhan Enter de thoat"
