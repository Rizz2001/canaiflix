# Script de Compilación Automática de CanaimaFlix APK para Android 4.4 KitKat x86
param (
    [switch]$Install = $true
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Compilador Nativo CanaimaFlix APK   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$buildDir = "build"
$appDir = "app/src/main"
$toolsDir = "build-tools"

# 1. Preparar directorios y copiar archivos web
Write-Host "[1/6] Sincronizando recursos web..." -ForegroundColor Yellow
Remove-Item -Recurse -Force "$buildDir/classes" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$buildDir/res_compiled", "$buildDir/classes", "$buildDir/gen", "$appDir/assets" | Out-Null
Copy-Item -Recurse -Force "web/*" "$appDir/assets/"

# 2. Compilar recursos con aapt2
Write-Host "[2/6] Compilando recursos con aapt2..." -ForegroundColor Yellow
& "$toolsDir/aapt2.exe" compile --dir "$appDir/res" -o "$buildDir/res_compiled.zip"
if ($LASTEXITCODE -ne 0) { Write-Host "Error al compilar recursos" -ForegroundColor Red; exit 1 }

# 3. Enlazar APK base con aapt2
Write-Host "[3/6] Enlazando APK base y generando R.java..." -ForegroundColor Yellow
& "$toolsDir/aapt2.exe" link -o "$buildDir/canaimaflix.base.apk" -I "$toolsDir/android.jar" --manifest "$appDir/AndroidManifest.xml" --java "$buildDir/gen" "$buildDir/res_compiled.zip" --min-sdk-version 19 --target-sdk-version 19 --auto-add-overlay
if ($LASTEXITCODE -ne 0) { Write-Host "Error al enlazar APK base" -ForegroundColor Red; exit 1 }

# 4. Compilar código Java con javac
Write-Host "[4/6] Compilando código Java..." -ForegroundColor Yellow
$javac = (Get-ChildItem "C:\Program Files\Microsoft\jdk-*" -Filter "javac.exe" -Recurse).FullName
$libJars = (Get-ChildItem "$toolsDir/libs/*.jar" | Select-Object -ExpandProperty FullName) -join ";"
$cp = "$toolsDir/android.jar;$buildDir/gen;$libJars"
$javaFiles = Get-ChildItem -Recurse "$appDir/java/*.java", "$buildDir/gen/*.java" | Select-Object -ExpandProperty FullName
& $javac -source 8 -target 8 -cp $cp -d "$buildDir/classes" $javaFiles
if ($LASTEXITCODE -ne 0) { Write-Host "Error al compilar código Java" -ForegroundColor Red; exit 1 }

# 5. Convertir a classes.dex con D8
Write-Host "[5/6] Generando bytecode Dalvik (classes.dex)..." -ForegroundColor Yellow
$java = (Get-ChildItem "C:\Program Files\Microsoft\jdk-*" -Filter "java.exe" -Recurse).FullName
$classes = Get-ChildItem "$buildDir/classes" -Recurse -Filter "*.class" | Select-Object -ExpandProperty FullName
$libJarsList = Get-ChildItem "$toolsDir/libs/*.jar" | Select-Object -ExpandProperty FullName
& $java -cp "$toolsDir/d8.jar" com.android.tools.r8.D8 --min-api 19 --lib "$toolsDir/android.jar" --output "$buildDir/" $classes $libJarsList
if ($LASTEXITCODE -ne 0) { Write-Host "Error al generar classes.dex" -ForegroundColor Red; exit 1 }

# 6. Empaquetar Assets y Bytecode con rutas Unix '/' y Firmar APK
Write-Host "[6/6] Inyectando assets y firmando APK..." -ForegroundColor Yellow
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$baseApk = (Resolve-Path "$buildDir/canaimaflix.base.apk").Path
$zip = [System.IO.Compression.ZipFile]::Open($baseApk, [System.IO.Compression.ZipArchiveMode]::Update)

# Agregar classes.dex
$dex = (Resolve-Path "$buildDir/classes.dex").Path
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $dex, "classes.dex")

# Agregar archivos web a assets/ con '/' explícito
$webRoot = (Resolve-Path "web").Path
$files = Get-ChildItem -Path $webRoot -Recurse -File
foreach ($f in $files) {
    $rel = $f.FullName.Substring($webRoot.Length + 1).Replace("\", "/")
    $entryName = "assets/" + $rel
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entryName)
}
$zip.Dispose()

$jarsigner = (Get-ChildItem "C:\Program Files\Microsoft\jdk-*" -Filter "jarsigner.exe" -Recurse).FullName
& $jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$buildDir/debug.keystore" -storepass android -keypass android "$buildDir/canaimaflix.base.apk" androiddebugkey
Copy-Item "$buildDir/canaimaflix.base.apk" "$buildDir/canaimaflix.apk" -Force

Write-Host "APK generada con éxito: $buildDir/canaimaflix.apk" -ForegroundColor Green

# 7. Instalar en la tableta vía ADB
if ($Install) {
    Write-Host "Instalando APK en la tableta Canaima vía ADB..." -ForegroundColor Cyan
    adb install -r "$buildDir/canaimaflix.apk"
    Write-Host "Lanzando aplicación en la tableta..." -ForegroundColor Green
    adb shell "am start -n com.canaimaflix.app/.MainActivity"
}
