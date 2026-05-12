@echo off
chcp 65001 >nul
title HKApp - Cap Nhat

echo ================================================
echo   HKApp - Cap Nhat Phien Ban Moi
echo ================================================
echo.

cd /d C:\hkapp

:: URL chứa bản mới nhất (bé sẽ cập nhật link này mỗi khi fix)
set UPDATE_URL=https://base44.app/api/apps/69bf5d0a924e0a8766577274/files/mp/public/69bf5d0a924e0a8766577274/ec440ce7d_hkapp-lan.zip

echo Dang tai ban moi nhat...
powershell -Command "Invoke-WebRequest -Uri '%UPDATE_URL%' -OutFile 'C:\hkapp\_update.zip'"

if not exist "C:\hkapp\_update.zip" (
    echo LOI: Khong tai duoc file! Kiem tra internet.
    pause
    exit /b 1
)

echo Dang giai nen...
:: Backup src cu
if exist "C:\hkapp\src_backup" rmdir /s /q "C:\hkapp\src_backup"
if exist "C:\hkapp\src" xcopy /e /i /q "C:\hkapp\src" "C:\hkapp\src_backup" >nul

:: Giải nén src mới (chỉ thư mục src, giữ nguyên node_modules)
powershell -Command "Expand-Archive -Path 'C:\hkapp\_update.zip' -DestinationPath 'C:\hkapp\_tmp' -Force"

:: Copy src mới vào
if exist "C:\hkapp\_tmp\hkapp-lan\src" (
    robocopy "C:\hkapp\_tmp\hkapp-lan\src" "C:\hkapp\src" /e /is /it >nul
    echo Cap nhat src hoan tat!
) else (
    echo LOI: Khong tim thay thu muc src trong file zip!
    pause
    exit /b 1
)

:: Copy package.json nếu có thay đổi
if exist "C:\hkapp\_tmp\hkapp-lan\package.json" (
    copy /y "C:\hkapp\_tmp\hkapp-lan\package.json" "C:\hkapp\package.json" >nul
)

:: Dọn dẹp
rmdir /s /q "C:\hkapp\_tmp" >nul 2>&1
del "C:\hkapp\_update.zip" >nul 2>&1

echo.
echo ================================================
echo   CAP NHAT HOAN TAT!
echo   - Code moi da duoc ap dung
echo   - Neu server dang chay: Ctrl+C roi start.bat lai
echo   - Backup cu luu tai: C:\hkapp\src_backup
echo ================================================
echo.
pause
