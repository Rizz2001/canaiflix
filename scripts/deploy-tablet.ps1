# Script de Despliegue y Enlace Rápido para Canaima TR10RS1 vía ADB
param (
    [string]$Action = "link"
)

Write-Host "--- CanaimaFlix ADB Utility ---" -ForegroundColor Cyan

# 1. Verificar conexión ADB
$device = adb devices | Select-String "device$"
if (-not $device) {
    Write-Host "Error: No se detectó ninguna tablet conectada por ADB." -ForegroundColor Red
    exit 1
}

Write-Host "Tablet conectada detectada: $($device.Line)" -ForegroundColor Green

# 2. Configurar túnel reverso de puertos (puerto 8080 del PC -> puerto 8080 en la tablet)
Write-Host "Configurando adb reverse tcp:8080 tcp:8080..." -ForegroundColor Yellow
adb reverse tcp:8080 tcp:8080

if ($Action -eq "open-firefox") {
    Write-Host "Abriendo CanaimaFlix en Firefox ESR 68 en la tablet..." -ForegroundColor Green
    adb shell "am start -a android.intent.action.VIEW -d 'http://localhost:8080' -n org.mozilla.firefox/.App"
} elseif ($Action -eq "push-sdcard") {
    Write-Host "Copiando archivos estáticos a /sdcard/CanaimaFlix/..." -ForegroundColor Yellow
    adb shell "mkdir -p /sdcard/CanaimaFlix"
    adb push web/. /sdcard/CanaimaFlix/
    Write-Host "Archivos copiados con éxito." -ForegroundColor Green
} else {
    Write-Host "Túnel USB establecido. Ya puedes abrir http://localhost:8080 en el navegador de la tablet." -ForegroundColor Green
}
