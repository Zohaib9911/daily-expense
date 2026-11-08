# Builds the signed Android app (Khaas-Portal.apk) from twa-manifest.json.
#   cd android-app ; .\build-apk.ps1
# For a new version: raise "appVersionCode" (and "appVersion") in twa-manifest.json first, then run this.
# Needs: Java 21, the Android SDK in C:\Users\user\android-sdk, and the signing key in C:\Users\user\khaas-android-keys
# (keystore-info.txt next to it holds the password). The key is NOT in git: keep that folder backed up.
# Windows PowerShell treats any text a tool writes to stderr (like Java warnings) as an error, so check exit codes instead.
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
$env:ANDROID_HOME = "C:\Users\user\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$bt = Join-Path $env:ANDROID_HOME "build-tools\36.1.0"
$keys = "C:\Users\user\khaas-android-keys"
$pass = ((Get-Content "$keys\keystore-info.txt" | Select-String "Store password").ToString() -split ": ")[-1].Trim()

if (-not (Test-Path node_modules)) { npm install }

Write-Host "1/4 Generating the Android project from twa-manifest.json..."
& .\node_modules\.bin\bubblewrap.cmd update --manifest=.\twa-manifest.json --skipVersionUpgrade
if ($LASTEXITCODE) { throw "bubblewrap update failed" }

Write-Host "2/4 Building (a few minutes)..."
& .\gradlew.bat assembleRelease --no-daemon
if ($LASTEXITCODE) { throw "gradle build failed" }

$out = "app\build\outputs\apk\release"
Write-Host "3/4 Aligning..."
& "$bt\zipalign.exe" -p -f 4 "$out\app-release-unsigned.apk" "$out\aligned.apk"
if ($LASTEXITCODE) { throw "zipalign failed" }

Write-Host "4/4 Signing..."
& "$bt\apksigner.bat" sign --ks "$keys\android.keystore" --ks-key-alias khaas --ks-pass "pass:$pass" --key-pass "pass:$pass" --out Khaas-Portal.apk "$out\aligned.apk"
if ($LASTEXITCODE) { throw "apksigner failed" }
& "$bt\apksigner.bat" verify --print-certs Khaas-Portal.apk | Select-String "SHA-256"
Write-Host "Done: $PSScriptRoot\Khaas-Portal.apk"
