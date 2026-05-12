# HKApp LAN - Quản Lý Sửa Chữa

## Cài đặt & Chạy

### Yêu cầu
- Windows 10/11
- Node.js 18+ (https://nodejs.org - bản LTS)
- PocketBase đang chạy trên cùng máy

### Bước 1: Cài Node.js
Vào https://nodejs.org → tải bản LTS → cài bình thường (Next → Next → Finish)

### Bước 2: Giải nén và cài đặt
1. Giải nén file hkapp-lan.zip vào C:\hkapp\
2. Mở PowerShell hoặc CMD trong thư mục C:\hkapp\
3. Chạy: npm install
4. Chờ ~3-5 phút

### Bước 3: Build
```
npm run build
```

### Bước 4: Chạy server
```
npm run preview
```
→ App chạy tại http://localhost:3000

### Truy cập từ điện thoại (LAN)
Nhân viên dùng điện thoại vào: http://192.168.1.XXX:3000
(Thay XXX bằng IP thực của máy server)

## Tự động khởi động cùng Windows
Tạo file `start_hkapp.bat`:
```
cd C:\hkapp
npm run preview
```
Bỏ shortcut vào: Shell:startup (Win+R → gõ shell:startup)
