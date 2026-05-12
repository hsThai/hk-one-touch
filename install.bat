@echo off
chcp 65001 >nul
title HKApp - Cai Dat Lan Dau

echo ================================================
echo   HKApp - Cai Dat He Thong (Lan Dau)
echo ================================================
echo.

:: Kiểm tra Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo LOI: Chua cai Node.js!
    echo.
    echo Vui long:
    echo 1. Vao https://nodejs.org
    echo 2. Tai ban LTS (Long Term Support)
    echo 3. Cai dat binh thuong (Next -> Next -> Finish)
    echo 4. Chay lai file nay
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)

echo [OK] Node.js:
node -v

:: Tạo thư mục
if not exist "C:\hkapp" mkdir C:\hkapp
cd /d C:\hkapp

echo.
echo Dang tai source code...
set UPDATE_URL=https://base44.app/api/apps/69bf5d0a924e0a8766577274/files/mp/public/69bf5d0a924e0a8766577274/ec440ce7d_hkapp-lan.zip
powershell -Command "Invoke-WebRequest -Uri '%UPDATE_URL%' -OutFile 'C:\hkapp\_install.zip'"

echo Dang giai nen...
powershell -Command "Expand-Archive -Path 'C:\hkapp\_install.zip' -DestinationPath 'C:\hkapp\_tmp' -Force"
robocopy "C:\hkapp\_tmp\hkapp-lan" "C:\hkapp" /e /is /it /xd node_modules dist >nul
rmdir /s /q "C:\hkapp\_tmp" >nul 2>&1
del "C:\hkapp\_install.zip" >nul 2>&1

echo.
echo Dang cai thu vien (mat 3-5 phut lan dau)...
npm install

if errorlevel 1 (
    echo LOI: Cai dat that bai!
    pause
    exit /b 1
)

echo.
echo ================================================
echo   CAI DAT HOAN TAT!
echo.
echo   Chay start.bat de khoi dong server
echo ================================================
echo.

:: Hỏi có muốn chạy luôn không
set /p CHAY=Chay server luon? (Y/N): 
if /i "%CHAY%"=="Y" call start.bat

pause
