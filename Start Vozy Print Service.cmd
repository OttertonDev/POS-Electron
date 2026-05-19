@echo off
cd "C:\Users\Otterton\Desktop\Web\POS"
set "PRINT_PRINTER_NAME=Vozy P50"
set "PRINT_SERVICE_PORT=3011"
set "PRINT_ALLOWED_ORIGINS=https://tippawan-admin.web.app,http://127.0.0.1:5500,http://localhost:5500"
echo Starting silent print service for %PRINT_PRINTER_NAME%...
npm run print-service:start
pause
