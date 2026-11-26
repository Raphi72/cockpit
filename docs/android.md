# Préparer le PC pour l'appli Android (à faire une fois)

L'appli Android de Cockpit (V2, étape 10) se construit depuis Windows avec Tauri 2. Sur ce PC, Android
Studio, le SDK (Android 35 et 36.1), le Java fourni avec Android Studio et un émulateur (« Medium Phone »)
sont **déjà installés**. Il manque seulement :

## 1. Le NDK et les outils en ligne de commande

1. Ouvre **Android Studio** › écran d'accueil › **More Actions** › **SDK Manager** (ou, dans un projet :
   **Tools › SDK Manager**).
2. Onglet **SDK Tools** : coche **NDK (Side by side)** et **Android SDK Command-line Tools (latest)**.
3. **Apply**, accepte les licences, attends la fin du téléchargement.

## 2. Trois variables d'environnement

Dans un terminal PowerShell (pour ton compte seulement, rien à faire en administrateur) :

```powershell
[Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Android\Android Studio\jbr', 'User')
[Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
[Environment]::SetEnvironmentVariable('NDK_HOME', (Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\ndk" | Sort-Object Name | Select-Object -Last 1).FullName, 'User')
```

La troisième ligne prend le NDK que l'étape 1 vient d'installer : lance-la **après** l'étape 1.

## 3. Les cibles Rust pour Android

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

(`rustup` est dans `%USERPROFILE%\.cargo\bin` ; si PowerShell ne le trouve pas :
`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` avant.)

## 4. Relancer

Ferme puis rouvre Claude et les terminaux : les nouvelles variables ne sont vues qu'au lancement suivant.

## 5. Pour essayer sur ton téléphone (facultatif, l'émulateur suffit d'abord)

1. Sur le téléphone : **Paramètres › À propos du téléphone**, touche 7 fois **Numéro de build** (options
   pour les développeurs), puis **Options pour les développeurs › Débogage USB**.
2. Branche-le en USB et accepte l'empreinte du PC.

Ensuite, Cockpit se lance sur l'émulateur ou le téléphone avec `npm run tauri android dev`.
