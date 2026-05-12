@echo off
chcp 65001 >nul
title HKApp LAN - Server

:: Kill process dang chiem port 3000
echo Dang giai phong port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Tự tìm IP LAN của máy
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set LAN_IP=%%a
    goto :found
)
:found
set LAN_IP=%LAN_IP: =%

echo ================================================
echo   HKApp - Quan Ly Sua Chua
echo ================================================
echo.
echo   Local  : http://localhost:3000
echo   LAN    : http://%LAN_IP%:3000
echo.
echo   Dien thoai ket noi cung WiFi vao:
echo   http://%LAN_IP%:3000
echo.
echo   Nhan Ctrl+C de dung server
echo ================================================
echo.

cd /d C:\hkapp-lan
npm run dev -- --port 3000
