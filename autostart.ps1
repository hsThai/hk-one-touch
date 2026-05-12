# ================================================
#   Cai dat tu dong khoi dong HKApp + PocketBase
#   Su dung Windows Task Scheduler
# ================================================

# Tu dong tu nang quyen Admin neu chua co
If (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Can quyen Admin - dang tu nang quyen..." -ForegroundColor Yellow
    Start-Process PowerShell -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    Exit
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   Cai Dat Tu Dong Khoi Dong (Task Scheduler)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── TASK 1: PocketBase ──────────────────────────
$pbExe     = "C:\pocketbase\pocketbase.exe"
$pbArgs    = "serve --http=0.0.0.0:8090"
$pbWorkDir = "C:\pocketbase"
$pbTaskName = "PocketBase_AutoStart"

Unregister-ScheduledTask -TaskName $pbTaskName -Confirm:$false -ErrorAction SilentlyContinue

$pbAction    = New-ScheduledTaskAction -Execute $pbExe -Argument $pbArgs -WorkingDirectory $pbWorkDir
$pbTrigger   = New-ScheduledTaskTrigger -AtLogOn
$pbSettings  = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew
$pbPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Register-ScheduledTask `
    -TaskName $pbTaskName `
    -Action $pbAction `
    -Trigger $pbTrigger `
    -Settings $pbSettings `
    -Principal $pbPrincipal `
    -Description "Tu dong chay PocketBase khi dang nhap Windows" | Out-Null

Write-Host "[OK] Task PocketBase da tao" -ForegroundColor Green

# ── TASK 2: HKApp (Vite) ────────────────────────
$hkTaskName = "HKApp_AutoStart"

Unregister-ScheduledTask -TaskName $hkTaskName -Confirm:$false -ErrorAction SilentlyContinue

$hkAction   = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c ping 127.0.0.1 -n 6 >nul && cd /d C:\hkapp && npm run dev > C:\hkapp\hkapp.log 2>&1" `
    -WorkingDirectory "C:\hkapp"
$hkTrigger  = New-ScheduledTaskTrigger -AtLogOn
$hkSettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 2) `
    -MultipleInstances IgnoreNew
$hkPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Register-ScheduledTask `
    -TaskName $hkTaskName `
    -Action $hkAction `
    -Trigger $hkTrigger `
    -Settings $hkSettings `
    -Principal $hkPrincipal `
    -Description "Tu dong chay HKApp khi dang nhap Windows" | Out-Null

Write-Host "[OK] Task HKApp da tao" -ForegroundColor Green

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "   HOAN TAT!" -ForegroundColor Green
Write-Host ""
Write-Host "   Moi lan dang nhap Windows:" -ForegroundColor White
Write-Host "   - PocketBase tu chay tai :8090" -ForegroundColor Yellow
Write-Host "   - HKApp tu chay tai :3000" -ForegroundColor Yellow
Write-Host "   - Tu dong restart neu bi crash!" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

$run = Read-Host "Khoi dong ngay bay gio? (Y/N)"
if ($run -match "^[Yy]") {
    Write-Host "Dang khoi dong PocketBase..." -ForegroundColor Yellow
    Start-ScheduledTask -TaskName $pbTaskName
    Start-Sleep -Seconds 5

    Write-Host "Dang khoi dong HKApp..." -ForegroundColor Yellow
    Start-ScheduledTask -TaskName $hkTaskName
    Start-Sleep -Seconds 5

    Write-Host "[OK] Xong! Mo trinh duyet..." -ForegroundColor Green
    Start-Process "http://localhost:3000"
}

Read-Host "Nhan Enter de thoat"
