# Publie une version de Cockpit sur GitHub : le PC et le téléphone s'y mettent à jour tout seuls.
# Voir docs/MEMO-DEV.md (« Mises à jour »). La version est celle de package.json (déjà montée partout).
#
#   powershell -ExecutionPolicy Bypass -File scripts\release.ps1 -Notes chemin\notes.md
#
# 1. Installateur du PC, signé avec la clé de ~/.tauri (jamais dans le dépôt) : l'app installée vérifie
#    cette signature avant d'installer.
# 2. APK du téléphone (scripts/android.ps1, sans l'installer).
# 3. Fiche latest.json : version, notes, installateur et sa signature, APK.
# 4. git push, puis la release GitHub avec les trois fichiers (la plus récente est celle que lisent les applis).

param([Parameter(Mandatory = $true)][string]$Notes)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content "$root\package.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version
$tag = "v$version"
$repo = 'https://github.com/Raphi72/cockpit'
$key = "$env:USERPROFILE\.tauri\cockpit-updater.key"
if (-not (Test-Path $key)) { throw "Clé de signature introuvable : $key" }
if (-not (Test-Path $Notes)) { throw "Notes introuvables : $Notes" }
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

# 1. Le PC, avec les fichiers de mise à jour signés.
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $key -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
Push-Location $root
cmd /c "npx tauri build --config src-tauri\tauri.updater.conf.json 2>&1" | Select-Object -Last 4 | ForEach-Object { Write-Host $_ }
$code = $LASTEXITCODE
Pop-Location
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
if ($code -ne 0) { throw "La construction du PC a échoué." }
$bundle = "$root\src-tauri\target\release\bundle"
$exe = "$bundle\nsis\Cockpit_${version}_x64-setup.exe"
$sig = "$exe.sig"
if (-not (Test-Path $sig)) { throw "Signature absente : $sig" }

# 2. Le téléphone.
& "$root\scripts\android.ps1" -NoInstall
$apk = "$bundle\Cockpit_${version}_android.apk"
Copy-Item "$root\src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release.apk" $apk -Force

# 3. La fiche que lisent les applis.
$manifest = [ordered]@{
  version   = $version
  notes     = (Get-Content $Notes -Raw -Encoding UTF8).Trim()
  pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  platforms = [ordered]@{
    'windows-x86_64'  = [ordered]@{ signature = (Get-Content $sig -Raw).Trim(); url = "$repo/releases/download/$tag/Cockpit_${version}_x64-setup.exe" }
    'android-aarch64' = [ordered]@{ signature = ''; url = "$repo/releases/download/$tag/Cockpit_${version}_android.apk" }
  }
}
$latest = "$bundle\latest.json"
[IO.File]::WriteAllText($latest, ($manifest | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))

# 4. GitHub.
Push-Location $root
git push origin main
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "git push a échoué." }
gh release create $tag $exe $sig $apk $latest --title "Cockpit $version" --notes-file $Notes
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { throw "La release GitHub a échoué." }
Write-Host "Publié : $repo/releases/tag/$tag"
