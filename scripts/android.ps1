# Construit l'appli Android (version optimisée, téléphones arm64) et l'installe sur le téléphone branché.
# Voir docs/android.md. Les variables ne valent que pour cette commande : rien n'est changé dans Windows.
#
#   powershell -ExecutionPolicy Bypass -File scripts\android.ps1            construire et installer
#   powershell -ExecutionPolicy Bypass -File scripts\android.ps1 -NoInstall construire seulement

param([switch]$NoInstall)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = $sdk
$env:NDK_HOME = (Get-ChildItem "$sdk\ndk" | Sort-Object Name | Select-Object -Last 1).FullName
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:JAVA_HOME\bin;$env:Path"
$android = "$root\src-tauri\gen\android"

# 1. Interface et Rust, par la CLI de Tauri. Sa dernière étape pose la bibliothèque par un lien symbolique,
#    que Windows refuse hors « mode développeur » : si c'est le seul échec, on la fait à la main (étape 2).
Push-Location $root
$log = & cmd /c "npx tauri android build --apk --target aarch64 2>&1"
$code = $LASTEXITCODE
Pop-Location
$log | Select-Object -Last 5 | ForEach-Object { Write-Host $_ }
if ($code -ne 0 -and -not ($log -match 'symbolic link')) { throw "La construction a échoué (voir ci-dessus)." }

# 2. La bibliothèque et la configuration à leur place, puis l'APK par Gradle (sans relancer Rust).
New-Item -ItemType Directory -Force "$android\app\src\main\jniLibs\arm64-v8a", "$android\app\src\main\assets" | Out-Null
Copy-Item "$root\src-tauri\target\aarch64-linux-android\release\libcockpit_lib.so" "$android\app\src\main\jniLibs\arm64-v8a\libcockpit_lib.so" -Force
$conf = Get-Content "$root\src-tauri\tauri.conf.json" -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $conf.plugins) { $conf | Add-Member -NotePropertyName plugins -NotePropertyValue ([pscustomobject]@{}) }
[IO.File]::WriteAllText("$android\app\src\main\assets\tauri.conf.json", ($conf | ConvertTo-Json -Depth 20 -Compress), (New-Object Text.UTF8Encoding($false)))
Push-Location $android
& .\gradlew.bat assembleArm64Release -x rustBuildArm64Release --console=plain -q
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { throw "Gradle a échoué." }
$apk = "$android\app\build\outputs\apk\arm64\release\app-arm64-release.apk"
Write-Host "APK : $apk"

# 3. Sur le téléphone branché (débogage USB) : remplace l'appli en gardant ses données.
if (-not $NoInstall) {
  & "$sdk\platform-tools\adb.exe" install -r $apk
  if ($LASTEXITCODE -ne 0) { throw "Installation impossible : le téléphone est-il branché, débogage USB autorisé ?" }
}
